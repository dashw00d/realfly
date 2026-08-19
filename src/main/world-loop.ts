/**
 * 60 Hz world tick: cursor, loom, worker step, send signals+terrain to overlay.
 * Tray actions (pause, escapeTest, scare, add/remove fly, next display) land here.
 */

import { ipcMain } from 'electron'
import type { BrainSignals } from '../shared/brain-signals'
import type { BrainHudSnapshot, ExtraMood, FlyPose, WorldFrame } from '../shared/ipc'
import type { Ledge, Point } from '../shared/types'
import type { BrainWindow } from './brain-window'
import { clampf, CursorLoom, WindowLoom, windowLoomStrength, type LoomFly } from './cursor-loom'
import type { DesktopEnvironment } from './desktop-env'
import { listDisplays, type DisplayInfo } from './displays'
import { WindowSense } from './ecology'
import { readEnvironmentTempo, sampleAmbient, watchSpeedLimit } from './environment'
import { attachTapInput } from './input'
import type { OverlayManager } from './overlay-manager'
import { createSimClient, type SimClient } from './sim-client'

const TICK_MS = 1000 / 60
const WINDOW_POLL_MS = 700
/** Extra flies lag fly #1 by ~300 ms (within 200–400 ms). */
const EXTRAS_MOOD_DELAY_MS = 300
/** nervous = clamp(rateLoom / 80, 0, 1) — invert for the HUD Hz readout. */
const LOOM_RATE_SCALE = 80

export type WorldStatus = {
  gfSpike: boolean
  loom: number
}

export type WorldLoop = {
  setPaused(next?: boolean): boolean
  isPaused(): boolean
  status(): WorldStatus
  escapeTest(): void
  scare(): void
  addFly(): void
  removeFly(): void
  moveToNextDisplay(): void
  moveToDisplay(displayId: number): void
  stimulate(indices: number[], strength?: number, durationMs?: number): void
  dispose(): void
}

function clampPose(pose: FlyPose, bounds: { width: number; height: number }): FlyPose {
  return {
    ...pose,
    x: clampf(pose.x, -bounds.width / 2 + 40, bounds.width / 2 - 40),
    y: clampf(pose.y, -bounds.height / 2 + 40, bounds.height / 2 - 40),
  }
}

/** HUD from fly #1 signals. gfSpike is consumeGF already latched into escape. */
function hudFromSignals(
  signals: BrainSignals | null,
  loomL: number,
  loomR: number,
): BrainHudSnapshot {
  const gfSpike = signals?.escape ?? false
  return {
    gfSpike,
    gfSilent: !gfSpike,
    rateLoom: (signals?.nervous ?? 0) * LOOM_RATE_SCALE,
    loomL,
    loomR,
    walkDrive: signals?.walkDrive ?? 0,
    groomDrive: signals?.groomDrive ?? 0,
    backward: signals?.backward ?? false,
    turnBias: signals?.turnBias ?? 0,
    nervous: signals?.nervous ?? 0,
    arousal: signals?.arousal ?? 0,
    wingDrive: signals?.wingDrive ?? 0,
    tempo: signals?.tempo ?? 1,
    sleep: signals?.sleep ?? false,
  }
}

export function createWorldLoop(opts: {
  desktop: DesktopEnvironment
  overlays: OverlayManager
  brain: BrainWindow
}): WorldLoop {
  const { desktop, overlays, brain } = opts
  const sim: SimClient = createSimClient()
  const cursorLoom = new CursorLoom()
  const windowLoom = new WindowLoom()
  const windowSense = new WindowSense()

  let paused = false
  let disposed = false
  let flyCount = 1
  let scareSeq = 0
  let typingLevel = 0
  let ledges: Ledge[] = []
  let lastPoses: FlyPose[] = []
  let lastSignals: BrainSignals | null = null
  let lastLoomL = 0
  let lastLoomR = 0
  const extrasMoodBuf: Array<ExtraMood & { at: number }> = []
  let lastExtrasMood: ExtraMood | undefined
  let loggedWindowLedges = false
  let msAccumulator = 0
  let lastTick = Date.now()
  let inFlight = false
  let simReady = false

  const unwatchSpeed = watchSpeedLimit()

  const displayRect = (): DisplayInfo => {
    return (
      overlays.activeDisplay() ??
      listDisplays()[0] ?? {
        id: 0,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        label: '',
        primary: true,
      }
    )
  }

  const fly1 = (): LoomFly => {
    const p = lastPoses[0]
    return p ? { x: p.x, y: p.y, heading: p.heading } : { x: 0, y: 0, heading: 0 }
  }

  const extrasMoodFromLeader = (signals: BrainSignals | null, heading: number): ExtraMood => {
    const now = Date.now()
    extrasMoodBuf.push({
      walkDrive: signals?.walkDrive ?? 0,
      nervous: signals?.nervous ?? 0,
      escape: signals?.escape ?? false,
      groomDrive: signals?.groomDrive ?? 0,
      heading,
      at: now,
    })
    while (extrasMoodBuf.length > 1 && now - extrasMoodBuf[0]!.at > EXTRAS_MOOD_DELAY_MS) {
      extrasMoodBuf.shift()
    }
    const delayed = extrasMoodBuf[0]!
    const amp = () => (Math.random() * 2 - 1) * 0.08
    lastExtrasMood = {
      walkDrive: clampf(delayed.walkDrive + amp(), 0, 1.5),
      nervous: clampf(delayed.nervous + amp(), 0, 1),
      escape: delayed.escape,
      groomDrive: clampf(delayed.groomDrive + amp(), 0, 2),
      heading: delayed.heading + (Math.random() * 2 - 1) * 0.28,
    }
    return lastExtrasMood
  }

  const retarget = (): void => {
    const d = displayRect()
    const bounds = { width: d.width, height: d.height }
    ledges = []
    windowSense.reset()
    lastPoses = lastPoses.map((p) => clampPose(p, bounds))
  }

  const sendWorld = (frame: WorldFrame): void => {
    const id = overlays.activeDisplayId()
    overlays.broadcast('activeDisplay', id)
    const win = overlays.windowFor(id)
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return
    win.webContents.send('world', frame)
  }

  const tick = async (): Promise<void> => {
    if (disposed || inFlight) return
    inFlight = true
    try {
      const now = Date.now()
      const dt = Math.min(0.05, Math.max(0, (now - lastTick) / 1000))
      lastTick = now
      const d = displayRect()
      const bounds = { width: d.width, height: d.height }
      const cursor = desktop.getCursor()
      const mouse: Point = {
        x: cursor.x - (d.x + d.width / 2),
        y: d.y + d.height / 2 - cursor.y,
      }

      if (paused) {
        brain.sendHud(hudFromSignals(lastSignals, lastLoomL, lastLoomR))
        sendWorld({
          dt: 0,
          displayId: d.id,
          bounds,
          mouse,
          ledges,
          signals: lastSignals,
          paused: true,
          flyCount,
          scareSeq,
          poses: lastPoses,
          typing: typingLevel,
          extrasMood: lastExtrasMood,
        })
        return
      }

      const idle = desktop.getIdleSeconds()
      const tempo = readEnvironmentTempo(desktop.getThermalFactor())
      const amb = sampleAmbient({ idleSeconds: idle, typing: typingLevel, tempo })
      typingLevel = amb.typing

      const pose = lastPoses[0] ?? { x: 0, y: 0, heading: 0, walkingIntensity: 0, gaitPhase: 0, state: 'idle' }
      const sensory = cursorLoom.compute(pose, mouse, dt)
      cursorLoom.decayOverride(dt)
      windowLoom.decay(dt)
      const loomL = Math.max(sensory.l, windowLoom.l)
      const loomR = Math.max(sensory.r, windowLoom.r)
      const airPuff = Math.max(sensory.puff, typingLevel * 0.3)
      lastLoomL = loomL
      lastLoomR = loomR

      let signals = lastSignals
      if (simReady) {
        msAccumulator += dt * 1000
        const steps = Math.min(50, Math.floor(msAccumulator))
        msAccumulator -= steps
        if (steps > 0) {
          const result = await sim.step({
            ms: steps,
            loomL,
            loomR,
            gaitDrive: pose.walkingIntensity,
            gaitPhase: pose.gaitPhase,
            airPuff,
            activityScale: amb.activityScale,
            sensoryGate: amb.sensoryGate,
          })
          if (result) {
            signals = result.signals
            signals.tempo = amb.tempo
            signals.sleep = amb.sleepy
            lastSignals = signals
            if (result.spikes.length > 0 && brain.isVisible()) {
              brain.sendSpikes(result.spikes)
            }
          }
        }
      }

      brain.sendHud(hudFromSignals(signals ?? lastSignals, loomL, loomR))
      sendWorld({
        dt,
        displayId: d.id,
        bounds,
        mouse,
        ledges,
        signals: signals ?? null,
        paused: false,
        flyCount,
        scareSeq,
        poses: lastPoses,
        typing: typingLevel,
        extrasMood: extrasMoodFromLeader(signals ?? lastSignals, pose.heading),
      })
    } finally {
      inFlight = false
    }
  }

  const pollWindows = (): void => {
    if (disposed || paused) return
    const d = displayRect()
    const snap = windowSense.poll(desktop.getWindows(), d)
    ledges = snap.ledges
    if (!loggedWindowLedges && ledges.length > 0) {
      loggedWindowLedges = true
      console.info(`window ledges: ${ledges.length}`)
    }
    const fly = fly1()
    for (const nw of snap.newWindows) {
      const strength = windowLoomStrength(fly, nw.center)
      if (strength > 0.08) windowLoom.inject(fly, nw.center, strength)
    }
  }

  const unsubRecreated = overlays.onRecreated(() => {
    retarget()
  })

  const unsubTap = attachTapInput({
    desktop,
    display: () => displayRect(),
    fly: fly1,
    onTap: (stim) => {
      void sim.stimulate({ group: 'sens', strength: stim.strength, durationMs: stim.durationMs })
    },
  })

  ipcMain.on('flyPoses', (_event, poses: FlyPose[]) => {
    if (Array.isArray(poses)) lastPoses = poses
  })

  ipcMain.removeHandler('stimulate')
  ipcMain.handle('stimulate', (_event, payload: { indices?: number[]; strength?: number; durationMs?: number }) => {
    const indices = payload?.indices
    if (!indices?.length) return
    void sim.stimulate({
      indices,
      strength: payload.strength ?? 0.25,
      durationMs: payload.durationMs ?? 400,
    })
  })

  const tickTimer = setInterval(() => {
    void tick()
  }, TICK_MS)
  const windowTimer = setInterval(pollWindows, WINDOW_POLL_MS)

  void sim.init().then((ok) => {
    simReady = ok
    if (!ok) console.warn('DesktopFly: LIFSim offline — flies run on autonomous behavior')
  })

  return {
    setPaused(next) {
      paused = typeof next === 'boolean' ? next : !paused
      overlays.broadcast('pause', paused)
      return paused
    },
    isPaused: () => paused,
    status: () => ({
      gfSpike: lastSignals?.escape ?? false,
      loom: Math.max(lastLoomL, lastLoomR),
    }),
    escapeTest() {
      cursorLoom.escapeTest(0.6)
    },
    scare() {
      cursorLoom.escapeTest(0.6)
      scareSeq += 1
    },
    addFly() {
      flyCount += 1
    },
    removeFly() {
      if (flyCount > 1) flyCount -= 1
    },
    moveToNextDisplay() {
      overlays.moveToNextDisplay()
      retarget()
    },
    moveToDisplay(displayId) {
      overlays.moveToDisplay(displayId)
      retarget()
    },
    stimulate(indices, strength = 0.25, durationMs = 400) {
      void sim.stimulate({ indices, strength, durationMs })
    },
    dispose() {
      disposed = true
      clearInterval(tickTimer)
      clearInterval(windowTimer)
      unwatchSpeed()
      unsubRecreated()
      unsubTap()
      ipcMain.removeHandler('stimulate')
      ipcMain.removeAllListeners('flyPoses')
      sim.dispose()
    },
  }
}
