/**
 * FlyWire soma point cloud + circuit overlay + spike flashes.
 * Port of vendor/desktop-fly/BrainView.swift `buildBrainScene` / click pick.
 * Click reports nearest ~60 circuit neurons via callback; IPC stimulation is later.
 */

import * as THREE from 'three'
import type { SpikeBus } from '../sim/spike-bus'

export type BrainPointsFile = {
  classes: string[]
  points: number[][]
}

export type CircuitNeuronViz = {
  pos: [number, number, number]
  role: string
  type: string
}

/** super_class palette (index order from etl.py), BrainView.swift CLASS_COLORS. */
const CLASS_COLORS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.16, 0.22, 0.34, 1],
  [0.45, 0.33, 0.16, 1],
  [0.14, 0.36, 0.34, 1],
  [0.1, 0.48, 0.62, 1],
  [0.38, 0.22, 0.55, 1],
  [0.62, 0.28, 0.1, 1],
  [0.2, 0.45, 0.18, 1],
  [0.55, 0.14, 0.14, 1],
  [0.5, 0.25, 0.4, 1],
]

function roleColor(role: string): [number, number, number, number] {
  switch (role) {
    case 'lc4':
    case 'lplc2':
      return [0.15, 0.85, 1.0, 1]
    case 'dna01':
    case 'dna02':
      return [1.0, 0.55, 0.1, 1]
    case 'mdn':
      return [1.0, 0.2, 0.8, 1]
    case 'dnp09':
      return [0.25, 1.0, 0.35, 1]
    case 'dng11':
      return [0.75, 0.55, 1.0, 1]
    case 'escw':
      return [1.0, 0.35, 0.25, 1]
    case 'gf':
      return [1.0, 0.95, 0.4, 1]
    default:
      return [0.45, 0.45, 0.5, 1]
  }
}

function pointCloud(positions: ArrayLike<number>, colors: ArrayLike<number>, size: number): THREE.Points {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Points(geo, mat)
}

function constantGlow(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** PORT_CONTRACT click-to-body map: gf=escape, dng11=groom, dnp09=walk, mdn=backward, dna=steer, lc/lplc2=loom/nervous. */
export const ROLE_BODY: Readonly<Record<string, string>> = {
  gf: 'escape',
  dng11: 'groom',
  dnp09: 'walk',
  mdn: 'backward',
  dna01: 'steer',
  dna02: 'steer',
  lc: 'loom/nervous',
  lc4: 'loom/nervous',
  lplc2: 'loom/nervous',
  escw: 'wing',
}

export function roleBody(role: string): string {
  return ROLE_BODY[role] ?? ''
}

export function majorRole(neurons: CircuitNeuronViz[], picked: number[]): string {
  if (picked.length === 0) return ''
  const counts = new Map<string, number>()
  for (const i of picked) {
    const role = neurons[i]?.role ?? 'other'
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }
  let major = 'other'
  let majorN = -1
  for (const [role, n] of counts) {
    if (n > majorN) {
      major = role
      majorN = n
    }
  }
  return major
}

export function regionName(neurons: CircuitNeuronViz[], picked: number[]): string {
  if (picked.length === 0) return ''
  const major = majorRole(neurons, picked)
  const sideSuffix = (role: string): string => {
    let l = 0
    let r = 0
    for (const i of picked) {
      const nr = neurons[i]
      if (!nr || nr.role !== role) continue
      if (nr.pos[0] < 0) l++
      else r++
    }
    if (l === r) return ''
    return l > r ? ' · left' : ' · right'
  }
  switch (major) {
    case 'lc4':
    case 'lplc2':
      return `⚡ Looming detectors (LC4/LPLC2)${sideSuffix(major)}`
    case 'gf':
      return '⚡ Giant Fiber (DNp01) — escape!'
    case 'dna01':
    case 'dna02':
      return `⚡ Steering neurons (DNa01/02)${sideSuffix(major)}`
    case 'dnp09':
      return '⚡ Walking command (DNp09)'
    case 'dng11':
      return '⚡ Grooming command (DNg11)'
    case 'escw':
      return '⚡ Escape-wing DNs (DNp02/04/11)'
    case 'mdn':
      return '⚡ Moonwalker neurons (MDN)'
    default: {
      const firstOther = picked.find((i) => neurons[i]?.role === 'other') ?? picked[0]!
      let t = neurons[firstOther]?.type ?? 'central'
      if (!t || t === '?') t = 'central'
      return `⚡ ${t} neurons`
    }
  }
}

type FlashSlot = {
  mesh: THREE.Mesh
  t: number
  dur: number
}

export type BrainScene = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  group: THREE.Group
  flash(neuron: number, isGF: boolean): void
  drain(bus: SpikeBus): void
  handleClick(clientX: number, clientY: number): number[]
  setPaused(paused: boolean): void
  resize(width: number, height: number): void
  update(dt: number): void
  render(): void
  dispose(): void
}

export function createBrainScene(opts: {
  canvas: HTMLCanvasElement
  points: BrainPointsFile
  neurons: CircuitNeuronViz[]
  spikeBus?: SpikeBus
  onStimulate?: (indices: number[], label: string) => void
}): BrainScene {
  const { canvas, points, neurons, spikeBus, onStimulate } = opts
  const width = canvas.clientWidth || window.innerWidth
  const height = canvas.clientHeight || window.innerHeight

  const scene = new THREE.Scene()
  scene.background = new THREE.Color().setRGB(0.03, 0.035, 0.06, THREE.SRGBColorSpace)

  const camera = new THREE.PerspectiveCamera(46, width / Math.max(1, height), 1, 120)
  camera.position.set(0, 0.6, 29)
  camera.lookAt(0, 0, 0)
  scene.add(camera)

  const group = new THREE.Group()
  group.rotation.order = 'ZYX'
  group.rotation.set(-0.15, 0, 0)
  scene.add(group)

  const pts: number[] = []
  const cols: number[] = []
  for (const p of points.points) {
    if (p.length < 4) continue
    pts.push(p[0]!, p[1]!, p[2]!)
    const ci = p[3]! | 0
    const c = ci >= 0 && ci < CLASS_COLORS.length ? CLASS_COLORS[ci]! : ([0.3, 0.3, 0.3, 1] as const)
    cols.push(c[0], c[1], c[2])
  }
  group.add(pointCloud(pts, cols, 1.4))

  const cpts: number[] = []
  const ccols: number[] = []
  for (const nr of neurons) {
    cpts.push(nr.pos[0], nr.pos[1], nr.pos[2])
    const c = roleColor(nr.role)
    ccols.push(c[0], c[1], c[2])
  }
  group.add(pointCloud(cpts, ccols, 2.4))

  const gfGeo = new THREE.SphereGeometry(0.28, 16, 12)
  const gfMat = constantGlow(new THREE.Color(1.0, 0.85, 0.25), 0.35)
  for (const nr of neurons) {
    if (nr.role !== 'gf') continue
    const node = new THREE.Mesh(gfGeo, gfMat)
    node.position.set(nr.pos[0], nr.pos[1], nr.pos[2])
    group.add(node)
  }

  const flashGeo = new THREE.SphereGeometry(0.16, 12, 8)
  const flashMat = constantGlow(new THREE.Color(0.75, 0.95, 1.0), 0.8)
  const pool: FlashSlot[] = []
  for (let i = 0; i < 48; i++) {
    const node = new THREE.Mesh(flashGeo, flashMat.clone())
    node.visible = false
    group.add(node)
    pool.push({ mesh: node, t: 0, dur: 0.28 })
  }
  let nextFlash = 0

  const ringGeo = new THREE.SphereGeometry(2.2, 20, 16)
  const ringMat = constantGlow(new THREE.Color(1.0, 0.9, 0.5), 0.18)
  ringMat.side = THREE.DoubleSide
  const stimRing = new THREE.Mesh(ringGeo, ringMat)
  stimRing.visible = false
  group.add(stimRing)
  let ringT = -1

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let paused = false

  function flash(neuron: number, isGF: boolean): void {
    const nr = neurons[neuron]
    if (!nr || pool.length === 0) return
    const slot = pool[nextFlash]!
    nextFlash = (nextFlash + 1) % pool.length
    slot.mesh.position.set(nr.pos[0], nr.pos[1], nr.pos[2])
    slot.mesh.visible = true
    slot.mesh.scale.setScalar(isGF ? 3.2 : 1)
    const m = slot.mesh.material as THREE.MeshBasicMaterial
    m.opacity = isGF ? 1.0 : 0.8
    slot.dur = isGF ? 0.6 : 0.28
    slot.t = 0
  }

  function flashRing(at: [number, number, number]): void {
    stimRing.position.set(at[0], at[1], at[2])
    stimRing.visible = true
    stimRing.scale.setScalar(0.5)
    ringMat.opacity = 1
    ringT = 0
  }

  function pick(clientX: number, clientY: number): number[] {
    const rect = canvas.getBoundingClientRect()
    const w = rect.width || 1
    const h = rect.height || 1
    ndc.set(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    group.updateWorldMatrix(true, false)
    const origin = group.worldToLocal(raycaster.ray.origin.clone())
    const far = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 80)
    const dir = group.worldToLocal(far).sub(origin)
    const len = dir.length()
    if (len < 1e-8 || neurons.length === 0) return []
    dir.multiplyScalar(1 / len)

    let best = 0
    let bestPerp = Infinity
    for (let i = 0; i < neurons.length; i++) {
      const p = neurons[i]!.pos
      const apx = p[0] - origin.x
      const apy = p[1] - origin.y
      const apz = p[2] - origin.z
      const dot = apx * dir.x + apy * dir.y + apz * dir.z
      const perp = Math.hypot(apx - dot * dir.x, apy - dot * dir.y, apz - dot * dir.z)
      if (perp < bestPerp) {
        bestPerp = perp
        best = i
      }
    }
    const anchor = neurons[best]!.pos
    const byDist = (a: number, b: number): number => dist3(neurons[a]!.pos, anchor) - dist3(neurons[b]!.pos, anchor)
    let picked = neurons.map((_, i) => i).filter((i) => dist3(neurons[i]!.pos, anchor) < 2.2)
    if (picked.length < 4) {
      picked = neurons.map((_, i) => i).sort(byDist).slice(0, 6)
    } else {
      picked.sort(byDist)
      if (picked.length > 60) picked = picked.slice(0, 60)
    }
    return picked
  }

  return {
    scene,
    camera,
    renderer,
    canvas,
    group,
    flash,
    drain(bus: SpikeBus): void {
      for (const e of bus.popAll()) flash(e.neuron, e.isGF)
    },
    handleClick(clientX: number, clientY: number): number[] {
      const picked = pick(clientX, clientY)
      if (picked.length === 0) return picked
      const anchor = neurons[picked[0]!]!.pos
      for (const i of picked.slice(0, 16)) flash(i, false)
      flashRing(anchor)
      onStimulate?.(picked, regionName(neurons, picked))
      return picked
    },
    setPaused(p: boolean): void {
      paused = p
    },
    resize(w: number, h: number): void {
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    },
    update(dt: number): void {
      if (spikeBus) {
        for (const e of spikeBus.popAll()) flash(e.neuron, e.isGF)
      }
      if (!paused) group.rotation.y += dt * (0.35 / 6)
      for (const slot of pool) {
        if (!slot.mesh.visible) continue
        slot.t += dt
        const u = slot.t / slot.dur
        const m = slot.mesh.material as THREE.MeshBasicMaterial
        m.opacity = Math.max(0, 1 - u) * (slot.dur > 0.4 ? 1 : 0.8)
        if (u >= 1) slot.mesh.visible = false
      }
      if (ringT >= 0) {
        ringT += dt
        const u = Math.min(1, ringT / 0.55)
        stimRing.scale.setScalar(0.5 + 0.9 * u)
        ringMat.opacity = 1 - u
        if (u >= 1) {
          stimRing.visible = false
          ringT = -1
        }
      }
    },
    render(): void {
      renderer.render(scene, camera)
    },
    dispose(): void {
      renderer.dispose()
    },
  }
}


