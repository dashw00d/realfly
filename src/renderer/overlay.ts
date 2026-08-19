/**
 * Overlay renderer: receive world state, update Fly(s), render Three.
 * Only fly #1 has the brain; extra flies get signals=null.
 */

import { Fly, clampf } from '../creature/fly'
import { defaultBrainSignals, type BrainSignals } from '../shared/brain-signals'
import type { World } from '../shared/creature'
import type { FlyPose, WorldFrame } from '../shared/ipc'
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
}

let myDisplayId = -1
let activeDisplayId = -1
let paused = false
let lastScareSeq = 0
const demoSignals = defaultBrainSignals()
demoSignals.walkDrive = 0.6
let lastSignals: BrainSignals | null = api ? null : demoSignals

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
    for (const { fly } of flies) fly.ledge = null
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
    for (let i = 0; i < flies.length; i++) {
      const fly = flies[i]!.fly
      fly.terrain = world.ledges
      fly.update(dt, world, i === 0 ? lastSignals : null)
      flies[i]!.view.sync()
    }
    reportPoses()
  } else {
    for (const live of flies) live.view.sync()
  }
  flyScene.render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
