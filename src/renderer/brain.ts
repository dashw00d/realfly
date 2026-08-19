/**
 * Brain-window page: 23k soma cloud, circuit overlay, click-to-pick (~60).
 * Stimulation IPC is Phase 4+; this window only invokes a local callback.
 */

import type { SpikeEvent } from '../sim/spike-bus'
import { SpikeBus } from '../sim/spike-bus'
import { createBrainScene, type BrainPointsFile, type CircuitNeuronViz } from './brain-scene'

type BrainAPI = {
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
  const existing = document.querySelector('canvas')
  if (existing instanceof HTMLCanvasElement) return existing
  const c = document.createElement('canvas')
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
  const brain = createBrainScene({
    canvas,
    points,
    neurons,
    spikeBus,
    onStimulate: (indices, name) => {
      showLabel(`${name}  (${indices.length})`)
      void brainApi?.stimulate(indices, name)
    },
  })

  brainApi?.onSpikes((spikes) => {
    spikeBus.push(spikes)
  })

  function resize(): void {
    brain.resize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', resize)
  resize()

  canvas.addEventListener('click', (e) => {
    brain.handleClick(e.clientX, e.clientY)
  })
  canvas.addEventListener('mouseenter', () => brain.setPaused(true))
  canvas.addEventListener('mouseleave', () => brain.setPaused(false))

  let last = performance.now()
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
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
