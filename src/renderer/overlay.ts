/**
 * Overlay renderer: receive world state, update Fly(s), render Three.
 * Only fly #1 has the brain; extra flies get signals=null and extrasMood.
 */

import { Fly, angleDiff, clampf } from '../creature/fly'
import { defaultBrainSignals, type BrainSignals } from '../shared/brain-signals'
import type { World } from '../shared/creature'
import type { ExtraMood, FlyPose, WorldFrame } from '../shared/ipc'
import type { Point } from '../shared/types'
import { createFlyScene } from './fly-scene'
import { FlyView } from './fly-view'

type OverlayAPI = {
  onWorld(cb: (frame: WorldFrame) => void): () => void
  onDisplay(cb: (display: { id: number; width: number; height: number }) => void): () => void
  onActiveDisplay(cb: (displayId: number) => void): () => void
  onPause(cb: (paused: boolean) => void): () => void
  onMoveToNextDisplay(cb: (displayId: number) => void): () => void
  sendFlyPoses(poses: FlyPose[]): void
}

declare global {
  interface Window {
    desktopfly?: OverlayAPI
  }
}

function canvasEl(): HTMLCanvasElement {
  const existing = document.querySelector('canvas')
  if (existing instanceof HTMLCanvasElement) return existing
  const c = document.createElement('canvas')
  document.body.appendChild(c)
  return c
}

const canvas = canvasEl()
const flyScene = createFlyScene(canvas)
const api = window.desktopfly

type LiveFly = { fly: Fly; view: FlyView }

const flies: LiveFly[] = []
const world: World = {
  bounds: { width: window.innerWidth, height: window.innerHeight },
  mouse: null,
  ledges: [],
  typing: 0,
}

let myDisplayId = -1
let activeDisplayId = -1
let paused = false
let lastScareSeq = 0
const demoSignals = defaultBrainSignals()
demoSignals.walkDrive = 0.6
let lastSignals: BrainSignals | null = api ? null : demoSignals
let frameExtrasMood: ExtraMood | undefined
const EXTRAS_MOOD_LAG = 10
const extrasMoodBuf: ExtraMood[] = []

function moodJitter(v: number, amp: number, lo: number, hi: number): number {
  return clampf(v + (Math.random() * 2 - 1) * amp, lo, hi)
}

/** Delayed noisy copy of fly #1. Used when the world frame omits extrasMood. */
function delayNoisyMood(sample: ExtraMood): ExtraMood {
  extrasMoodBuf.push(sample)
  if (extrasMoodBuf.length > EXTRAS_MOOD_LAG) extrasMoodBuf.shift()
  const delayed = extrasMoodBuf[0]!
  return {
    walkDrive: moodJitter(delayed.walkDrive, 0.08, 0, 1.5),
    nervous: moodJitter(delayed.nervous, 0.08, 0, 1),
    escape: delayed.escape,
    groomDrive: moodJitter(delayed.groomDrive, 0.08, 0, 2),
    heading: delayed.heading + (Math.random() * 2 - 1) * 0.28,
  }
}

function copyLeaderMood(signals: BrainSignals | null, leader: Fly): ExtraMood {
  return {
    walkDrive: signals?.walkDrive ?? (leader.state === 'walking' ? leader.walkingIntensity : 0),
    nervous: signals?.nervous ?? 0,
    escape: signals?.escape ?? false,
    groomDrive: signals?.groomDrive ?? (leader.state === 'grooming' ? 0.7 : 0),
    heading: leader.heading,
  }
}

function extrasMoodNow(leader: Fly): ExtraMood {
  if (frameExtrasMood) return frameExtrasMood
  return delayNoisyMood(copyLeaderMood(lastSignals, leader))
}

function preferLeaderLedge(fly: Fly, leader: Fly): void {
  const want = leader.ledge
  if (!want || fly.state === 'flying') return
  const still = world.ledges.find((L) => L.id === want.id)
  if (!still) return
  if (fly.ledge?.id !== still.id) {
    fly.ledge = still
    fly.heading = (Math.cos(fly.heading) >= 0 ? 0 : Math.PI) + (Math.random() * 2 - 1) * 0.35
  } else {
    fly.ledge = still
  }
}

/** Extras stay on the signals=null brain path; extrasMood is a cheap flocking hint. */
function applyExtrasMood(fly: Fly, mood: ExtraMood, leader: Fly): void {
  if (mood.escape && fly.scareCooldown === 0 && fly.state !== 'flying') {
    fly.startFlight(world.bounds, world.mouse, true)
    return
  }
  if (mood.nervous > 0.4 && fly.dartCooldown === 0 && fly.state !== 'flying') {
    fly.ledge = null
    fly.state = 'walking'
    fly.heading = mood.heading + (Math.random() * 2 - 1) * 0.55
    fly.speed = 110 + Math.random() * 45
    fly.dartTimer = 0.4 + Math.random() * 0.5
    fly.dartCooldown = 1.2
    fly.stateTimer = fly.dartTimer
  }
  preferLeaderLedge(fly, leader)
  if (fly.state === 'flying' || fly.dartTimer > 0) return
  if (mood.groomDrive > 0.5 && mood.nervous < 0.3 && fly.state !== 'grooming') {
    fly.state = 'grooming'
    fly.speed = 0
    fly.stateTimer = 1.0 + Math.random() * 1.5
  } else if (mood.walkDrive > 0.22 && fly.state !== 'walking') {
    fly.state = 'walking'
    fly.speed = 14 + mood.walkDrive * 55
    fly.heading = mood.heading + (Math.random() * 2 - 1) * 0.45
    fly.stateTimer = 1.2 + Math.random() * 2
  } else if (fly.state === 'walking' && mood.walkDrive < 0.08) {
    fly.state = 'idle'
    fly.speed = 0
    fly.stateTimer = 0.6 + Math.random() * 1.2
  } else if (fly.state === 'walking') {
    const target = 14 + mood.walkDrive * 55
    fly.speed += (target - fly.speed) * 0.2
    if (!fly.ledge) fly.heading += angleDiff(fly.heading, mood.heading) * 0.06
    fly.stateTimer = Math.max(fly.stateTimer, 0.45)
  }
}

function randomPos(): Point {
  const hw = world.bounds.width / 2 - 100
  const hh = world.bounds.height / 2 - 100
  return {
    x: (Math.random() * 2 - 1) * Math.max(40, hw),
    y: (Math.random() * 2 - 1) * Math.max(40, hh),
  }
}

function addFly(at?: Point, id?: string): LiveFly {
  const fly = new Fly(at ?? randomPos(), id ?? `fly-${flies.length + 1}`)
  const view = new FlyView(fly)
  flyScene.add(view.group)
  const live = { fly, view }
  flies.push(live)
  return live
}

function removeLastFly(): void {
  if (flies.length <= 1) return
  const last = flies.pop()
  if (!last) return
  last.view.group.removeFromParent()
}

function applyPose(fly: Fly, pose: FlyPose): void {
  fly.position = { x: pose.x, y: pose.y }
  fly.heading = pose.heading
}

function retarget(width: number, height: number): void {
  world.bounds = { width, height }
  world.ledges = []
  flyScene.resize(width, height)
  for (const { fly } of flies) {
    fly.ledge = null
    fly.position = {
      x: clampf(fly.position.x, -width / 2 + 40, width / 2 - 40),
      y: clampf(fly.position.y, -height / 2 + 40, height / 2 - 40),
    }
  }
}

function ensureFlies(count: number, poses: FlyPose[]): void {
  while (flies.length < count) {
    const i = flies.length
    const pose = poses[i]
    const live = addFly(pose ? { x: pose.x, y: pose.y } : undefined)
    if (pose) applyPose(live.fly, pose)
  }
  while (flies.length > count) removeLastFly()
}

function reportPoses(): void {
  if (!api) return
  api.sendFlyPoses(
    flies.map(({ fly }) => ({
      x: fly.position.x,
      y: fly.position.y,
      heading: fly.heading,
      walkingIntensity: fly.walkingIntensity,
      gaitPhase: fly.gaitPhase,
      state: fly.state,
    })),
  )
}

function isActive(): boolean {
  return myDisplayId < 0 || activeDisplayId < 0 || myDisplayId === activeDisplayId
}

function applyWorld(frame: WorldFrame): void {
  activeDisplayId = frame.displayId
  paused = frame.paused
  world.mouse = frame.mouse
  world.ledges = frame.ledges
  if (typeof frame.typing === 'number') world.typing = frame.typing
  if (frame.bounds.width > 0 && frame.bounds.height > 0) {
    if (frame.bounds.width !== world.bounds.width || frame.bounds.height !== world.bounds.height) {
      retarget(frame.bounds.width, frame.bounds.height)
    } else {
      world.bounds = frame.bounds
    }
  }
  if (!isActive()) {
    for (const { view } of flies) view.group.visible = false
    return
  }
  const waking = flies.length === 0 || flies.every((f) => !f.view.group.visible)
  ensureFlies(Math.max(1, frame.flyCount), frame.poses)
  if (waking) {
    for (let i = 0; i < flies.length; i++) {
      const pose = frame.poses[i]
      if (pose) applyPose(flies[i]!.fly, pose)
    }
  }
  for (const { view } of flies) view.group.visible = true
  if (frame.signals) lastSignals = frame.signals
  frameExtrasMood = frame.extrasMood
  if (frame.scareSeq !== lastScareSeq) {
    lastScareSeq = frame.scareSeq
    for (let i = 1; i < flies.length; i++) {
      const fly = flies[i]!.fly
      if (fly.state !== 'flying') fly.startFlight(world.bounds)
    }
  }
}

function resize(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  world.bounds = { width: w, height: h }
  flyScene.resize(w, h)
}

window.addEventListener('resize', resize)
resize()

if (api) {
  api.onDisplay((d) => {
    myDisplayId = d.id
    if (d.width > 0 && d.height > 0) retarget(d.width, d.height)
  })
  api.onActiveDisplay((id) => {
    activeDisplayId = id
  })
  api.onPause((p) => {
    paused = p
  })
  api.onMoveToNextDisplay((id) => {
    activeDisplayId = id
    for (const { fly, view } of flies) {
      fly.ledge = null
      view.group.visible = isActive()
    }
  })
  api.onWorld(applyWorld)
} else {
  addFly({ x: 0, y: 0 })
  flies[0]!.fly.state = 'walking'
  window.addEventListener('mousemove', (e) => {
    world.mouse = {
      x: e.clientX - world.bounds.width / 2,
      y: world.bounds.height / 2 - e.clientY,
    }
  })
}

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (!paused && isActive() && flies.length > 0) {
    const leader = flies[0]!.fly
    leader.terrain = world.ledges
    leader.update(dt, world, lastSignals)
    flies[0]!.view.sync()
    const extrasMood = flies.length > 1 ? extrasMoodNow(leader) : null
    for (let i = 1; i < flies.length; i++) {
      const fly = flies[i]!.fly
      fly.terrain = world.ledges
      if (extrasMood) applyExtrasMood(fly, extrasMood, leader)
      fly.update(dt, world, null)
      flies[i]!.view.sync()
    }
    reportPoses()
    flyScene.render()
  } else if (isActive()) {
    for (const live of flies) live.view.sync()
    flyScene.render()
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
