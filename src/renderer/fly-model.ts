/**
 * Procedural fruit-fly body. Port of vendor/desktop-fly/FlyModel.swift
 * `buildFlyModel` / `buildLeg` / `wingShape`.
 *
 * SceneKit → Three.js: SCNSphere → SphereGeometry, SCNCapsule → CapsuleGeometry,
 * SCNCone → CylinderGeometry (top+bottom radii), SCNNode → Group,
 * SCNMaterial → MeshPhongMaterial (Blinn-like).
 *
 * Local frame is the Swift fly frame: +Y forward, +Z up, ground at z=0.
 * World conversion to Three Y-up happens in fly-view.ts.
 */

import * as THREE from 'three'
import { FLY_SCALE } from '../creature/fly'

const SHININESS_SCALE = 100

export type Vec3Like = { x: number; y: number; z: number }

export type LegSpec = {
  side: number
  attach: [number, number, number]
  yawOff: number
  phase: number
  isFront: boolean
  femur: number
  tibia: number
  tarsus: number
}

/** Same six legs as FlyModel.swift `buildFlyModel` (z attach = 4.5). */
export const LEG_SPECS: readonly LegSpec[] = [
  { side: 1, attach: [3.1, 5.3, 4.5], yawOff: 0.95, phase: 0.0, isFront: true, femur: 4.2, tibia: 4.8, tarsus: 3.2 },
  { side: -1, attach: [-3.1, 5.3, 4.5], yawOff: 0.95, phase: 0.5, isFront: true, femur: 4.2, tibia: 4.8, tarsus: 3.2 },
  { side: 1, attach: [3.7, 2.0, 4.5], yawOff: -0.1, phase: 0.5, isFront: false, femur: 4.8, tibia: 5.6, tarsus: 3.8 },
  { side: -1, attach: [-3.7, 2.0, 4.5], yawOff: -0.1, phase: 0.0, isFront: false, femur: 4.8, tibia: 5.6, tarsus: 3.8 },
  { side: 1, attach: [3.3, -1.2, 4.5], yawOff: -0.95, phase: 0.0, isFront: false, femur: 5.8, tibia: 7.0, tarsus: 4.6 },
  { side: -1, attach: [-3.3, -1.2, 4.5], yawOff: -0.95, phase: 0.5, isFront: false, femur: 5.8, tibia: 7.0, tarsus: 4.6 },
]

/** SceneKit eulerAngles are applied Z, then Y, then X. */
export function setScnEuler(obj: THREE.Object3D, x: number, y: number, z: number): void {
  obj.rotation.order = 'ZYX'
  obj.rotation.set(x, y, z)
}

function srgb(r: number, g: number, b: number): THREE.Color {
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
}

function mat(
  color: THREE.Color,
  specular = 0.25,
  shininess = 0.25,
  extra?: THREE.MeshPhongMaterialParameters,
): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color,
    specular: new THREE.Color(specular, specular, specular),
    shininess: shininess * SHININESS_SCALE,
    ...extra,
  })
}

/** SCNCapsule height includes hemispherical caps; CapsuleGeometry `height` is the cylinder. */
function capsuleGeo(radius: number, scnHeight: number): THREE.CapsuleGeometry {
  return new THREE.CapsuleGeometry(radius, Math.max(0.001, scnHeight - 2 * radius), 4, 10)
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material)
  m.castShadow = shadows
  m.receiveShadow = shadows
  return m
}

/** Cocoa abdomenTexture(): 64×128 tan sphere map with dark transverse bands. */
function abdomenTexture(): THREE.DataTexture {
  const w = 64
  const h = 128
  const data = new Uint8Array(w * h * 4)
  const put = (x0: number, y0: number, rw: number, rh: number, rgb: [number, number, number]): void => {
    const r = Math.round(rgb[0] * 255)
    const g = Math.round(rgb[1] * 255)
    const b = Math.round(rgb[2] * 255)
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        const i = (y * w + x) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = 255
      }
    }
  }
  put(0, 0, 64, 128, [0.72, 0.55, 0.32])
  put(0, 0, 64, 26, [0.22, 0.15, 0.09])
  put(0, 38, 64, 10, [0.22, 0.15, 0.09])
  put(0, 60, 64, 10, [0.22, 0.15, 0.09])
  put(0, 82, 64, 9, [0.22, 0.15, 0.09])
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** NSBezierPath oval (−2.6, −15.5, 5.2 × 16.5) extruded 0.12. */
function wingShape(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.ellipse(0, -7.25, 2.6, 8.25, 0, Math.PI * 2, false, 0)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 16 })
  geo.translate(0, 0, -0.06)
  return geo
}

export class FlyLeg3D {
  readonly root: THREE.Group
  readonly baseYaw: number
  readonly swingSign: number
  readonly phase: number
  readonly isFront: boolean

  constructor(spec: LegSpec, geos: { femur: THREE.BufferGeometry; tibia: THREE.BufferGeometry; tarsus: THREE.BufferGeometry }, materials: { femur: THREE.Material; tibia: THREE.Material; tarsus: THREE.Material }) {
    this.swingSign = spec.side
    this.baseYaw = spec.side > 0 ? spec.yawOff : Math.PI - spec.yawOff
    this.phase = spec.phase
    this.isFront = spec.isFront

    const root = new THREE.Group()
    root.position.set(spec.attach[0], spec.attach[1], spec.attach[2])

    const femurNode = mesh(geos.femur, materials.femur)
    setScnEuler(femurNode, 0, 0, -Math.PI / 2)
    femurNode.position.set(spec.femur / 2, 0, 0)
    root.add(femurNode)

    const knee = new THREE.Group()
    knee.position.set(spec.femur, 0, 0)
    setScnEuler(knee, 0, 0.75, -0.3 * spec.side)
    root.add(knee)

    const tibiaNode = mesh(geos.tibia, materials.tibia)
    setScnEuler(tibiaNode, 0, 0, -Math.PI / 2)
    tibiaNode.position.set(spec.tibia / 2, 0, 0)
    knee.add(tibiaNode)

    const ankle = new THREE.Group()
    ankle.position.set(spec.tibia, 0, 0)
    setScnEuler(ankle, 0, 0.35, -0.15 * spec.side)
    knee.add(ankle)

    const tarsusNode = mesh(geos.tarsus, materials.tarsus)
    setScnEuler(tarsusNode, 0, 0, -Math.PI / 2)
    tarsusNode.position.set(spec.tarsus / 2, 0, 0)
    ankle.add(tarsusNode)

    this.root = root
    this.apply(0, 0)
  }

  apply(angle: number, lift: number): void {
    setScnEuler(this.root, 0, -lift, this.baseYaw + this.swingSign * angle)
  }
}

/**
 * Three.js fly mesh. Pose is owned by the headless `Fly`; call the setters
 * (or FlyView.sync) each frame.
 */
export class FlyModel3D {
  readonly group: THREE.Group
  readonly legs: FlyLeg3D[]
  readonly foldedWings: THREE.Group
  readonly wingNodes: THREE.Group[]
  readonly blurWingL: THREE.Mesh
  readonly blurWingR: THREE.Mesh
  readonly abdomen: THREE.Mesh
  private readonly blurMatL: THREE.MeshBasicMaterial
  private readonly blurMatR: THREE.MeshBasicMaterial

  constructor() {
    const root = new THREE.Group()
    root.name = 'fly'
    root.scale.setScalar(FLY_SCALE)

    const bodyBrown = srgb(0.5, 0.38, 0.22)
    const thoraxGeo = new THREE.SphereGeometry(4.6, 24, 18)
    const thorax = mesh(thoraxGeo, mat(bodyBrown, 0.35, 0.4))
    thorax.position.set(0, 2.5, 6.2)
    thorax.scale.set(0.95, 1.15, 0.85)
    root.add(thorax)

    const abdMat = new THREE.MeshPhongMaterial({
      map: abdomenTexture(),
      specular: new THREE.Color(0.3, 0.3, 0.3),
      shininess: 0.35 * SHININESS_SCALE,
    })
    const abdomen = mesh(new THREE.SphereGeometry(5.0, 24, 18), abdMat)
    abdomen.position.set(0, -6.5, 5.6)
    abdomen.scale.set(0.9, 1.5, 0.75)
    root.add(abdomen)
    this.abdomen = abdomen

    const head = mesh(new THREE.SphereGeometry(3.0, 20, 16), mat(srgb(0.575, 0.473, 0.337)))
    head.position.set(0, 9.0, 6.0)
    head.scale.set(1.0, 0.85, 0.9)
    root.add(head)

    const eyeGeo = new THREE.SphereGeometry(2.0, 16, 12)
    const eyeMat = mat(srgb(0.62, 0.1, 0.07), 0.9, 0.9)
    for (const side of [-1, 1]) {
      const eye = mesh(eyeGeo, eyeMat)
      eye.position.set(side * 2.1, 9.7, 6.4)
      eye.scale.set(0.8, 1.0, 1.15)
      root.add(eye)
    }

    const antGeo = capsuleGeo(0.16, 2.2)
    const antMat = mat(srgb(0.3, 0.22, 0.13))
    for (const side of [-1, 1]) {
      const ant = mesh(antGeo, antMat)
      ant.position.set(side * 0.9, 11.6, 6.3)
      setScnEuler(ant, -1.15, 0, side * 0.35)
      root.add(ant)
    }

    const prob = mesh(
      new THREE.CylinderGeometry(0.6, 0.22, 2.4, 12),
      mat(srgb(0.35, 0.26, 0.16)),
    )
    prob.position.set(0, 10.4, 4.6)
    setScnEuler(prob, -0.5, 0, 0)
    root.add(prob)

    const legColor = srgb(0.33, 0.24, 0.14)
    const femurMat = mat(legColor)
    const tibiaMat = mat(legColor)
    const tarsusMat = mat(srgb(0.2475, 0.18, 0.105))
    const geoCache = new Map<string, THREE.CapsuleGeometry>()
    const cap = (r: number, h: number): THREE.CapsuleGeometry => {
      const k = `${r}:${h}`
      let g = geoCache.get(k)
      if (!g) {
        g = capsuleGeo(r, h)
        geoCache.set(k, g)
      }
      return g
    }

    this.legs = LEG_SPECS.map((spec) => {
      const leg = new FlyLeg3D(
        spec,
        { femur: cap(0.48, spec.femur), tibia: cap(0.38, spec.tibia), tarsus: cap(0.24, spec.tarsus) },
        { femur: femurMat, tibia: tibiaMat, tarsus: tarsusMat },
      )
      root.add(leg.root)
      return leg
    })

    const wingGeo = wingShape()
    const wingMat = new THREE.MeshPhongMaterial({
      color: srgb(0.92, 0.92, 0.92),
      opacity: 0.28,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      specular: new THREE.Color(0.9, 0.9, 0.9),
      shininess: 0.9 * SHININESS_SCALE,
    })
    this.foldedWings = new THREE.Group()
    this.wingNodes = []
    for (const side of [-1, 1]) {
      const wing = new THREE.Group()
      const blade = mesh(wingGeo, wingMat, false)
      wing.add(blade)
      wing.position.set(side * 1.6, 0.5, side > 0 ? 7.7 : 7.55)
      setScnEuler(wing, 0, 0, side * 0.13)
      this.foldedWings.add(wing)
      this.wingNodes.push(wing)
    }
    root.add(this.foldedWings)

    const blurGeo = new THREE.SphereGeometry(1.0, 12, 8)
    this.blurMatL = new THREE.MeshBasicMaterial({
      color: srgb(0.85, 0.85, 0.85),
      opacity: 0.3,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.blurMatR = this.blurMatL.clone()
    this.blurWingL = this.makeBlurWing(blurGeo, this.blurMatL, -1)
    this.blurWingR = this.makeBlurWing(blurGeo, this.blurMatR, 1)
    root.add(this.blurWingL)
    root.add(this.blurWingR)

    this.group = root
  }

  private makeBlurWing(geo: THREE.SphereGeometry, material: THREE.MeshBasicMaterial, side: number): THREE.Mesh {
    const n = new THREE.Mesh(geo, material)
    n.castShadow = false
    n.receiveShadow = false
    n.position.set(side * 6.0, 1.5, 8.2)
    n.scale.set(5.5, 2.4, 0.3)
    setScnEuler(n, 0, 0, side * -0.45)
    n.visible = false
    return n
  }

  setScale(x: number, y: number, z: number): void {
    this.group.scale.set(x, y, z)
  }

  setLegPose(index: number, angle: number, lift: number): void {
    this.legs[index]?.apply(angle, lift)
  }

  setWingEuler(index: number, euler: Vec3Like): void {
    const wing = this.wingNodes[index]
    if (wing) setScnEuler(wing, euler.x, euler.y, euler.z)
  }

  setFoldedWingsVisible(visible: boolean): void {
    this.foldedWings.visible = visible
  }

  setAbdomenScale(x: number, y: number, z: number): void {
    this.abdomen.scale.set(x, y, z)
  }

  setBlurWing(
    side: 'L' | 'R',
    pose: { hidden: boolean; opacity: number; euler: Vec3Like },
  ): void {
    const node = side === 'L' ? this.blurWingL : this.blurWingR
    const mat = side === 'L' ? this.blurMatL : this.blurMatR
    node.visible = !pose.hidden
    mat.opacity = pose.opacity
    setScnEuler(node, pose.euler.x, pose.euler.y, pose.euler.z)
  }
}

export function buildFlyModel(): FlyModel3D {
  return new FlyModel3D()
}
