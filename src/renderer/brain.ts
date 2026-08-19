/**
 * Brain-window page: soma cloud, click-to-stim, HTML HUD + GF/loom sparkline.
 */

import type { BrainHudSnapshot } from '../shared/ipc'
import type { SpikeEvent } from '../sim/spike-bus'
import { SpikeBus } from '../sim/spike-bus'
import {
  createBrainScene,
  majorRole,
  roleBody,
  type BrainPointsFile,
  type CircuitNeuronViz,
} from './brain-scene'

type BrainAPI = {
  onHud(cb: (hud: BrainHudSnapshot) => void): () => void
  onSpikes(cb: (spikes: SpikeEvent[]) => void): () => void
  stimulate(indices: number[], name?: string): Promise<void>
}

declare global {
  interface Window {
    desktopflyBrain?: BrainAPI
  }
}

type CircuitFile = {
  neurons: Array<{ pos: number[]; role: string; type: string }>
}

const SPARK_WINDOW_S = 1.6
const SPARK_CAP = 192
const GF_FLASH_MS = 280

async function loadJson<T>(file: string): Promise<T> {
  const urls = [
    new URL(`../data/${file}`, import.meta.url).href,
    new URL(`../../data/${file}`, import.meta.url).href,
  ]
  let last = ''
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (res.ok) return (await res.json()) as T
      last = `${url} (${res.status})`
    } catch (err) {
      last = `${url} (${err instanceof Error ? err.message : String(err)})`
    }
  }
  throw new Error(`failed to load ${file}: ${last}`)
}

function canvasEl(): HTMLCanvasElement {
  const existing = document.getElementById('brain')
  if (existing instanceof HTMLCanvasElement) return existing
  const any = document.querySelector('canvas')
  if (any instanceof HTMLCanvasElement) return any
  const c = document.createElement('canvas')
  c.id = 'brain'
  document.body.appendChild(c)
  return c
}

function stimLabel(): HTMLElement {
  let el = document.getElementById('stim-label')
  if (!el) {
    el = document.createElement('div')
    el.id = 'stim-label'
    document.body.appendChild(el)
  }
  return el
}

function hudNode(id: string): HTMLElement | null {
  return document.getElementById(id)
}

function sparkCanvas(): HTMLCanvasElement | null {
  const n = document.getElementById('spark')
  return n instanceof HTMLCanvasElement ? n : null
}

function emptyHud(): BrainHudSnapshot {
  return {
    gfSpike: false,
    gfSilent: true,
    rateLoom: 0,
    loomL: 0,
    loomR: 0,
    walkDrive: 0,
    groomDrive: 0,
    hungerDrive: 0,
    thirstDrive: 0,
    sleepDrive: 0,
    clockDrive: 0,
    backward: false,
    turnBias: 0,
    nervous: 0,
    arousal: 0,
    wingDrive: 0,
    tempo: 1,
    sleep: false,
  }
}

function setText(id: string, text: string, className: string): void {
  const n = hudNode(id)
  if (!n) return
  n.textContent = text
  n.className = className
}

try {
  const [points, circuit] = await Promise.all([
    loadJson<BrainPointsFile>('brain_points.json'),
    loadJson<CircuitFile>('circuit.json'),
  ])
  const neurons: CircuitNeuronViz[] = circuit.neurons.map((n) => ({
    pos: [n.pos[0] ?? 0, n.pos[1] ?? 0, n.pos[2] ?? 0],
    role: n.role,
    type: n.type,
  }))

  const canvas = canvasEl()
  const spikeBus = new SpikeBus()
  const brainApi = window.desktopflyBrain
  const label = stimLabel()
  let hideTimer = 0
  function showLabel(text: string): void {
    label.textContent = text
    label.hidden = false
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => {
      label.hidden = true
    }, 2200)
  }

  let hud = emptyHud()
  let gfUntil = 0
  let gfPending = false
  const spark: Array<{ t: number; loom: number; gf: boolean }> = []

  function setHudStim(role: string, body: string): void {
    const text = body ? `${role} → ${body}` : role || '—'
    setText('hud-stim', text, body ? 'hud-v' : 'hud-v dim')
  }

  function applyHud(next: BrainHudSnapshot): void {
    hud = next
    if (next.gfSpike) gfUntil = performance.now() + GF_FLASH_MS
    if (next.lastStim) setHudStim(next.lastStim.role, next.lastStim.body)
  }

  function paintHud(now: number): void {
    const gfHot = now < gfUntil || hud.gfSpike
    if (gfHot) setText('hud-gf', 'SPIKE', 'hud-v hot gf')
    else setText('hud-gf', 'silent', 'hud-v dim')
    setText('hud-lc', `${hud.rateLoom.toFixed(1)} Hz`, 'hud-v lc')
    setText('hud-walk', hud.walkDrive.toFixed(2), 'hud-v walk')
    setText('hud-groom', hud.groomDrive.toFixed(2), 'hud-v groom')
    setText('hud-hunger', hud.hungerDrive.toFixed(2), 'hud-v hunger')
    setText('hud-thirst', hud.thirstDrive.toFixed(2), 'hud-v thirst')
    setText('hud-sleep', hud.sleepDrive.toFixed(2), hud.sleep ? 'hud-v sleep' : 'hud-v dim')
    setText('hud-clock', hud.clockDrive.toFixed(2), 'hud-v clock')
    if (hud.backward) setText('hud-mdn', 'backward', 'hud-v mdn')
    else setText('hud-mdn', '—', 'hud-v dim')
    setText('hud-loom', `L ${hud.loomL.toFixed(2)}  R ${hud.loomR.toFixed(2)}`, 'hud-v loom')
  }

  function pushSpark(t: number, loom: number, gf: boolean): void {
    spark.push({ t, loom, gf })
    const cutoff = t - SPARK_WINDOW_S
    while (spark.length > SPARK_CAP || (spark.length > 0 && spark[0]!.t < cutoff)) spark.shift()
  }

  function drawSpark(nowS: number): void {
    const el = sparkCanvas()
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const w = el.width
    const h = el.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(200,220,255,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h - 0.5)
    ctx.lineTo(w, h - 0.5)
    ctx.stroke()

    const t0 = nowS - SPARK_WINDOW_S
    const xOf = (t: number): number => ((t - t0) / SPARK_WINDOW_S) * w
    const yOf = (loom: number): number => h - 1 - Math.min(1, Math.max(0, loom)) * (h - 3)

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(77, 217, 255, 0.9)'
    ctx.lineWidth = 1
    let started = false
    for (const p of spark) {
      if (p.t < t0) continue
      const x = xOf(p.t)
      const y = yOf(p.loom)
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    if (started) ctx.stroke()

    ctx.strokeStyle = 'rgba(255, 230, 106, 0.95)'
    ctx.lineWidth = 1.25
    for (const p of spark) {
      if (!p.gf || p.t < t0) continue
      const x = xOf(p.t)
      ctx.beginPath()
      ctx.moveTo(x, 1)
      ctx.lineTo(x, h - 1)
      ctx.stroke()
    }
  }

  const brain = createBrainScene({
    canvas,
    points,
    neurons,
    spikeBus,
    onStimulate: (indices, name) => {
      const role = majorRole(neurons, indices)
      const body = roleBody(role)
      showLabel(body ? `${name}\n${role} → ${body}` : name)
      setHudStim(role, body)
      void brainApi?.stimulate(indices, name)
    },
  })

  brainApi?.onHud((next) => {
    applyHud(next)
  })
  brainApi?.onSpikes((spikes) => {
    spikeBus.push(spikes)
    for (const e of spikes) {
      if (!e.isGF) continue
      gfPending = true
      gfUntil = performance.now() + GF_FLASH_MS
    }
  })

  function resize(): void {
    brain.resize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', resize)
  resize()

  canvas.addEventListener('click', (e) => {
    brain.handleClick(e.clientX, e.clientY)
  })

  let pointerOver = false
  function pauseRot(over: boolean): void {
    pointerOver = over
    brain.setPaused(over)
  }
  canvas.addEventListener('pointerenter', () => pauseRot(true))
  canvas.addEventListener('pointerleave', () => pauseRot(false))
  canvas.addEventListener('pointermove', () => {
    if (!pointerOver) pauseRot(true)
  })

  paintHud(performance.now())

  let last = performance.now()
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const gfTick = gfPending
    gfPending = false
    pushSpark(now / 1000, Math.max(hud.loomL, hud.loomR), gfTick)
    paintHud(now)
    drawSpark(now / 1000)
    brain.update(dt)
    brain.render()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
} catch (err) {
  const pre = document.createElement('pre')
  pre.style.color = '#f88'
  pre.style.padding = '16px'
  pre.textContent = err instanceof Error ? err.message : String(err)
  document.body.appendChild(pre)
}
