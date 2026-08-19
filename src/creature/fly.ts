/**
 * Headless fly behavior (no Three). Port of FlyModel.swift `Fly`.
 * Pose fields are plain numbers so tests can assert them without a renderer.
 * Hysteresis thresholds: docs/PORT_CONTRACT.md.
 */

import type { BrainSignals } from '../shared/brain-signals'
import type { Creature, World } from '../shared/creature'
import type { CreatureId, Ledge, Point } from '../shared/types'

export type FlyState = 'walking' | 'idle' | 'grooming' | 'flying' | 'sleeping'

export const FLY_SCALE = 1.15
export const EDGE_MARGIN = 50
export const SCARE_RADIUS = 110
export const NERVOUS_RADIUS = 240

export type Vec3 = { x: number; y: number; z: number }
export type Size = { width: number; height: number }

function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z }
}

export function clampf(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Walk competitor. Hunger/thirst only raise explore when loom is quiet;
 * nervous ≥ 0.3 leaves DNp09 walkDrive alone (loom wins).
 */
export function exploreDriveOf(s: BrainSignals): number {
  if (s.nervous >= 0.3) return s.walkDrive
  return Math.max(s.walkDrive, s.hungerDrive, s.thirstDrive)
}

export function angleDiff(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

export function smoothstep(t: number): number {
  const x = clampf(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Abdomen Z multiplier. Sleep: slow/deep. Typing > 0.1: faster, smaller twitch. */
export function abdomenBreathe(time: number, sleeping: boolean, typing: number): number {
  const rest = sleeping ? 1 + 0.05 * Math.sin(time * 1.1) : 1 + 0.03 * Math.sin(time * 3.0)
  if (typing <= 0.1) return rest
  return rest + 0.012 * typing * Math.sin(time * 18)
}

class Leg {
  angle = 0
  lift = 0
  constructor(
    readonly baseYaw: number,
    readonly swingSign: number,
    readonly phase: number,
    readonly isFront: boolean,
  ) {}
}

class WingPose {
  eulerAngles: Vec3
  constructor(euler: Vec3) {
    this.eulerAngles = euler
  }
}

class BlurWing {
  isHidden = true
  opacity = 1
  eulerAngles: Vec3
  constructor(side: number) {
    this.eulerAngles = vec3(0, 0, side * -0.45)
  }
}

/** Headless stand-in for FlyModel.swift `FlyModel` (no SceneKit/Three). */
export class FlyModel {
  readonly legs: Leg[]
  readonly foldedWings: { isHidden: boolean; childNodes: WingPose[] }
  readonly blurWingL: BlurWing
  readonly blurWingR: BlurWing
  readonly abdomen: { scale: Vec3 }

  constructor() {
    const specs: Array<{
      side: number
      yawOff: number
      phase: number
      isFront: boolean
    }> = [
      { side: 1, yawOff: 0.95, phase: 0.0, isFront: true },
      { side: -1, yawOff: 0.95, phase: 0.5, isFront: true },
      { side: 1, yawOff: -0.1, phase: 0.5, isFront: false },
      { side: -1, yawOff: -0.1, phase: 0.0, isFront: false },
      { side: 1, yawOff: -0.95, phase: 0.0, isFront: false },
      { side: -1, yawOff: -0.95, phase: 0.5, isFront: false },
    ]
    this.legs = specs.map((s) => {
      const baseYaw = s.side > 0 ? s.yawOff : Math.PI - s.yawOff
      return new Leg(baseYaw, s.side, s.phase, s.isFront)
    })
    this.foldedWings = {
      isHidden: false,
      childNodes: [
        new WingPose(vec3(0, 0, -1 * 0.13)),
        new WingPose(vec3(0, 0, 1 * 0.13)),
      ],
    }
    this.blurWingL = new BlurWing(-1)
    this.blurWingR = new BlurWing(1)
    this.abdomen = { scale: vec3(0.9, 1.5, 0.75) }
  }
}

export class Fly implements Creature {
  readonly id: CreatureId
  readonly model: FlyModel
  readonly node: { position: Vec3; scale: Vec3; eulerAngles: Vec3 }

  position: Point
  heading: number
  speed = 30
  state: FlyState = 'walking'
  stateTimer: number
  gaitPhase: number
  time: number
  scareCooldown = 0
  dartCooldown = 0
  backwardTimer = 0
  dartTimer = 0
  stateAge = 0
  terrain: Ledge[] = []
  ledge: Ledge | null = null
  /** 0..1 substrate vibration from typing (idle-time only). */
  typing = 0

  flightFrom: Point = { x: 0, y: 0 }
  flightTo: Point = { x: 0, y: 0 }
  flightT = 0
  flightDur = 1
  flightEffort = 0.6
  effortCurrent = 0.6
  alt = 0
  pitch = 0
  flapPhase = 0
  wingRaise = 0

  private brainLive = false
  private liveArousal = 0
  private liveWing = 0
  private readonly rng: () => number

  constructor(at: Point = { x: 0, y: 0 }, id: CreatureId = 'fly-1', rng: () => number = Math.random) {
    this.id = id
    this.rng = rng
    this.model = new FlyModel()
    this.position = { x: at.x, y: at.y }
    this.heading = this.rnd(0, 2 * Math.PI)
    this.stateTimer = this.rnd(1.5, 4)
    this.gaitPhase = this.rnd(0, 1)
    this.time = this.rnd(0, 100)
    this.node = {
      position: vec3(at.x, at.y, 0),
      scale: vec3(FLY_SCALE, FLY_SCALE, FLY_SCALE),
      eulerAngles: vec3(0, 0, 0),
    }
    this.syncNode()
  }

  /** Swift `pos` — same object as `position`. */
  get pos(): Point {
    return this.position
  }
  set pos(p: Point) {
    this.position = { x: p.x, y: p.y }
  }

  get altitude(): number {
    return this.alt
  }
  set altitude(v: number) {
    this.alt = v
  }

  /** Live wing-beat effort (alias of effortCurrent). */
  get wingEffort(): number {
    return this.effortCurrent
  }

  get scale(): number {
    return this.node.scale.x
  }

  /** Swift `gaitPhasePublic`. */
  get gaitPhasePublic(): number {
    return this.gaitPhase
  }

  /**
   * Swift `walkingIntensity`: body → brain proprioception for fly #1.
   * `state == walking ? clamp(abs(backward ? 22 : speed) / 60, 0, 1) : 0`
   */
  get walkingIntensity(): number {
    if (this.state !== 'walking') return 0
    const v = this.backwardTimer > 0 ? 22 : this.speed
    return clampf(Math.abs(v) / 60, 0, 1)
  }

  private rnd(lo: number, hi: number): number {
    return lo + this.rng() * (hi - lo)
  }

  private syncNode(): void {
    this.node.position.x = this.position.x
    this.node.position.y = this.position.y
    this.node.eulerAngles = vec3(this.pitch, 0, this.heading - Math.PI / 2)
  }

  startFlight(
    bounds: Size,
    awayFrom: Point | null = null,
    escape = false,
    effort: number | null = null,
  ): void {
    this.state = 'flying'
    this.ledge = null
    this.flightEffort = clampf(effort ?? (escape ? 1.0 : this.rnd(0.4, 0.75)), 0.25, 1)
    this.effortCurrent = this.flightEffort
    this.flapPhase = 0
    this.wingRaise = 0
    this.flightFrom = { x: this.position.x, y: this.position.y }
    const hw = bounds.width / 2 - EDGE_MARGIN
    const hh = bounds.height / 2 - EDGE_MARGIN
    let target: Point = { x: 0, y: 0 }
    let chosen = false
    if (!escape && awayFrom == null && this.terrain.length > 0 && this.rnd(0, 1) < 0.45) {
      const L = this.terrain[Math.floor(this.rng() * this.terrain.length)]!
      if (L.x1 - L.x0 > 90) {
        target = { x: this.rnd(L.x0 + 25, L.x1 - 25), y: L.y }
        chosen = Math.hypot(target.x - this.position.x, target.y - this.position.y) > 180
      }
    }
    if (!chosen) {
      for (let i = 0; i < 16; i++) {
        target = { x: this.rnd(-hw, hw), y: this.rnd(-hh, hh) }
        const far =
          Math.hypot(target.x - this.position.x, target.y - this.position.y) > (escape ? 350 : 260)
        if (!far) continue
        if (awayFrom) {
          const toT = { x: target.x - this.position.x, y: target.y - this.position.y }
          const toA = { x: awayFrom.x - this.position.x, y: awayFrom.y - this.position.y }
          if (toT.x * toA.x + toT.y * toA.y > 0) continue
        }
        break
      }
    }
    this.flightTo = target
    const dist = Math.hypot(target.x - this.position.x, target.y - this.position.y)
    this.flightDur = escape ? clampf(dist / 650, 0.45, 1.2) : clampf(dist / 420, 0.7, 2.0)
    this.flightT = 0
    this.scareCooldown = escape ? 2.0 : 2.5
    this.model.blurWingL.isHidden = false
    this.model.blurWingR.isHidden = false
  }

  private land(): void {
    this.state = 'idle'
    this.stateTimer = this.rnd(0.3, 0.8)
    this.speed = 0
    this.alt = 0
    this.pitch = 0
    this.node.scale = vec3(FLY_SCALE, FLY_SCALE, FLY_SCALE)
    this.node.position.z = 0
    const wings = this.model.foldedWings.childNodes
    for (let i = 0; i < wings.length; i++) {
      const side = i === 0 ? -1 : 1
      wings[i]!.eulerAngles = vec3(0, 0, side * 0.13)
    }
    this.model.blurWingL.isHidden = true
    this.model.blurWingR.isHidden = true
  }

  private pickNextState(): void {
    switch (this.state) {
      case 'walking': {
        const r = this.rnd(0, 1)
        if (r < 0.3) {
          this.state = 'idle'
          this.stateTimer = this.rnd(0.8, 3)
          this.speed = 0
        } else if (r < 0.55) {
          this.stateTimer = this.rnd(0.3, 0.8)
          this.speed = this.rnd(95, 150)
          this.heading += this.rnd(-1.2, 1.2)
        } else {
          this.stateTimer = this.rnd(1.5, 5)
          this.speed = this.rnd(18, 45)
        }
        break
      }
      case 'idle': {
        const r = this.rnd(0, 1)
        if (r < 0.35) {
          this.state = 'grooming'
          this.stateTimer = this.rnd(1.0, 2.5)
        } else {
          this.state = 'walking'
          this.stateTimer = this.rnd(1.5, 5)
          this.speed = this.rnd(18, 45)
          this.heading += this.rnd(-1.5, 1.5)
        }
        break
      }
      case 'grooming':
        this.state = 'idle'
        this.stateTimer = this.rnd(0.3, 1.0)
        break
      case 'flying':
      case 'sleeping':
        break
    }
  }

  update(dt: number, world: World, signals: BrainSignals | null): void {
    // Coordinator / overlay assign terrain each frame; World is the source of truth.
    this.terrain = world.ledges
    if (world.typing != null) this.typing = world.typing
    this.updateInner(dt, world.bounds, world.mouse, signals)
  }

  private updateInner(
    dt: number,
    bounds: Size,
    mouse: Point | null,
    signals: BrainSignals | null,
  ): void {
    this.time += dt
    this.scareCooldown = Math.max(0, this.scareCooldown - dt)
    this.dartCooldown = Math.max(0, this.dartCooldown - dt)
    this.backwardTimer = Math.max(0, this.backwardTimer - dt)

    this.stateAge += dt
    this.dartTimer = Math.max(0, this.dartTimer - dt)

    this.brainLive = signals != null
    this.liveArousal = signals?.arousal ?? 0
    this.liveWing = signals?.wingDrive ?? 0

    // Copy so method calls (startFlight) can change state without TS narrowing.
    const airborne = this.state === 'flying'
    if (airborne) {
      this.updateFlight(dt)
    } else if (signals) {
      this.brainBehavior(signals, dt, bounds, mouse)
      if (this.state === 'walking') this.updateWalk(dt, bounds)
    } else {
      if (this.scareCooldown === 0 && mouse) {
        const mouseDist = Math.hypot(mouse.x - this.position.x, mouse.y - this.position.y)
        if (mouseDist < SCARE_RADIUS) {
          this.startFlight(bounds, mouse)
        } else if (mouseDist < NERVOUS_RADIUS && this.state !== 'walking') {
          this.setState('walking')
          this.heading = Math.atan2(this.position.y - mouse.y, this.position.x - mouse.x) + this.rnd(-0.4, 0.4)
          this.speed = this.rnd(110, 150)
          this.stateTimer = this.rnd(0.4, 0.9)
          this.scareCooldown = 1.0
        }
      }
      if (this.state !== 'flying') {
        this.stateTimer -= dt
        if (this.stateTimer <= 0) {
          if (this.state === 'walking' && this.rnd(0, 1) < 0.1) this.startFlight(bounds)
          else this.pickNextState()
        }
        if (this.state === 'walking') this.updateWalk(dt, bounds)
      }
    }

    this.updateLegs(dt)
    this.updateWings(dt)
    const breathe = abdomenBreathe(this.time, this.state === 'sleeping', this.typing)
    this.model.abdomen.scale = vec3(0.9, 1.5, 0.75 * breathe)
    this.syncNode()
  }

  private setState(s: FlyState): void {
    if (s === this.state) return
    this.state = s
    this.stateAge = 0
  }

  private brainBehavior(s: BrainSignals, dt: number, bounds: Size, mouse: Point | null): void {
    if (s.escape && this.scareCooldown === 0) {
      this.startFlight(bounds, mouse, true)
      return
    }
    if (s.sleep) {
      if (this.state !== 'sleeping') {
        this.setState('sleeping')
        this.speed = 0
        this.dartTimer = 0
        this.backwardTimer = 0
      }
      return
    } else if (this.state === 'sleeping') {
      this.setState('grooming')
      return
    }
    if (s.nervous > 0.4 && this.dartCooldown === 0) {
      this.ledge = null
      this.setState('walking')
      if (mouse) {
        this.heading = Math.atan2(this.position.y - mouse.y, this.position.x - mouse.x) + this.rnd(-0.4, 0.4)
      } else {
        this.heading += this.rnd(-1.5, 1.5)
      }
      this.speed = this.rnd(110, 155)
      this.dartTimer = this.rnd(0.4, 0.9)
      this.dartCooldown = 1.2
    }
    const needWins = s.hungerDrive > 0.5 || s.thirstDrive > 0.5
    const exploreDrive = exploreDriveOf(s)
    if (this.state !== 'walking' || this.dartTimer === 0) {
      if (
        !needWins &&
        this.state !== 'grooming' &&
        s.groomDrive > 0.5 &&
        s.nervous < 0.3 &&
        this.stateAge > 0.4
      ) {
        this.setState('grooming')
      } else if (this.state === 'grooming' && s.groomDrive < 0.3 && this.stateAge > 0.6) {
        this.setState('idle')
      }
    }
    if (this.state === 'idle' && exploreDrive > 0.22 && this.stateAge >= 0.4) {
      this.setState('walking')
      this.heading += this.rnd(-0.8, 0.8)
    } else if (
      this.state === 'walking' &&
      this.dartTimer === 0 &&
      exploreDrive < 0.08 &&
      this.stateAge > 0.5
    ) {
      this.setState('idle')
      this.speed = 0
    }
    if (s.backward && this.backwardTimer === 0 && this.dartTimer === 0) {
      if (this.state !== 'walking') {
        this.setState('walking')
        this.speed = 0
      }
      this.backwardTimer = 0.5
    }
    if (this.state === 'walking') {
      if (this.dartTimer === 0 && this.backwardTimer === 0) {
        const target = (14 + exploreDrive * 55) * s.tempo
        this.speed += (target - this.speed) * Math.min(1, 3 * dt)
      }
      if (this.ledge == null) {
        this.heading += s.turnBias * dt
        // High thirst: screen-edge water. Low thirst (< 0.08) never reaches this.
        if (this.dartTimer === 0 && s.thirstDrive > 0.22 && s.nervous < 0.3) {
          const towardEdge = this.position.x >= 0 ? 0 : Math.PI
          this.heading += angleDiff(this.heading, towardEdge) * Math.min(1, 1.8 * dt)
        }
      }
    }
    const flightChance = s.arousal > 0.5 ? 0.6 : 0.005
    if (this.state === 'walking' && this.rnd(0, 1) < flightChance * dt) {
      this.startFlight(bounds, null, false, 0.35 + s.arousal * 0.6)
    }
  }

  private get effectiveSpeed(): number {
    return this.backwardTimer > 0 ? -22 : this.speed
  }

  private updateWalk(dt: number, bounds: Size): void {
    if (this.ledge) {
      const L = this.ledge
      const cur = this.terrain.find((t) => t.id === L.id)
      if (cur && Math.abs(cur.y - L.y) < 40) {
        this.ledge = cur
      } else {
        this.ledge = null
        this.startFlight(bounds)
        return
      }
    }
    if (this.ledge) {
      const L = this.ledge
      this.heading += this.rnd(-1, 1) * 0.2 * dt
      const along = Math.cos(this.heading) >= 0 ? 0 : Math.PI
      this.heading += angleDiff(this.heading, along) * Math.min(1, 6 * dt)
      this.position.x += Math.cos(this.heading) * this.effectiveSpeed * dt
      this.position.y += (L.y - this.position.y) * Math.min(1, 10 * dt)
      if (this.position.x <= L.x0 + 6 && Math.cos(this.heading) < 0) this.heading = 0
      if (this.position.x >= L.x1 - 6 && Math.cos(this.heading) > 0) this.heading = Math.PI
      this.position.x = clampf(this.position.x, L.x0, L.x1)
      if (this.rnd(0, 1) < 0.05 * dt) this.ledge = null
    } else {
      this.heading += this.rnd(-1, 1) * 1.6 * dt
      const hw = bounds.width / 2 - EDGE_MARGIN
      const hh = bounds.height / 2 - EDGE_MARGIN
      if (Math.abs(this.position.x) > hw || Math.abs(this.position.y) > hh) {
        const toCenter = Math.atan2(-this.position.y, -this.position.x)
        this.heading += angleDiff(this.heading, toCenter) * Math.min(1, 4 * dt)
      }
      const v = this.effectiveSpeed
      this.position.x += Math.cos(this.heading) * v * dt
      this.position.y += Math.sin(this.heading) * v * dt
      this.position.x = clampf(this.position.x, -bounds.width / 2 + 20, bounds.width / 2 - 20)
      this.position.y = clampf(this.position.y, -bounds.height / 2 + 20, bounds.height / 2 - 20)
      for (const L of this.terrain) {
        if (
          this.position.x > L.x0 - 8 &&
          this.position.x < L.x1 + 8 &&
          Math.abs(this.position.y - L.y) < 20
        ) {
          if (this.rnd(0, 1) < 0.9 * dt) {
            this.ledge = L
            this.heading = Math.cos(this.heading) >= 0 ? 0 : Math.PI
            break
          }
        }
      }
    }
    this.node.position.z = 0.35 * Math.abs(Math.sin(this.gaitPhase * Math.PI * 2))
  }

  private applyAltitude(): void {
    const s = FLY_SCALE * (1 + 0.8 * this.alt)
    this.node.scale = vec3(s, s, s)
    this.node.position.z = 90 * this.alt
  }

  private updateFlight(dt: number): void {
    this.flightT = Math.min(1, this.flightT + dt / this.flightDur)
    if (this.flightT >= 1) {
      this.position.x = this.flightTo.x + Math.sin(this.time * 26) * 1.2
      this.position.y = this.flightTo.y + Math.cos(this.time * 22) * 1.0
      this.pitch = clampf(this.alt * 0.4, 0, 0.35)
      this.alt += (0 - this.alt) * Math.min(1, 9 * dt)
      this.applyAltitude()
      if (this.alt < 0.035) {
        this.pos = this.flightTo
        this.land()
      }
      return
    }
    const e = smoothstep(this.flightT)
    const dx = this.flightTo.x - this.flightFrom.x
    const dy = this.flightTo.y - this.flightFrom.y
    const len = Math.max(1, Math.hypot(dx, dy))
    const px = -dy / len
    const py = dx / len
    const wob = Math.sin(this.time * 32) * 4 * Math.sin(this.flightT * Math.PI)
    this.position.x = this.flightFrom.x + dx * e + px * wob
    this.position.y = this.flightFrom.y + dy * e + py * wob
    this.heading = Math.atan2(dy, dx) + Math.sin(this.time * 18) * 0.12
    this.effortCurrent = this.brainLive
      ? clampf(
          Math.max(this.flightEffort, this.flightEffort * 0.55 + this.liveArousal * 0.25 + this.liveWing * 0.6),
          0.25,
          1.3,
        )
      : this.flightEffort
    const riseEnv = Math.min(this.flightT / 0.25, 1)
    const fallEnv = Math.min((1 - this.flightT) / 0.3, 1)
    const target = this.effortCurrent * Math.min(riseEnv, fallEnv) * (0.85 + 0.15 * Math.sin(this.time * 7))
    this.pitch = clampf((target - this.alt) * 2.5, -0.45, 0.45)
    this.alt += (target - this.alt) * Math.min(1, 6 * dt)
    this.applyAltitude()
  }

  private updateLegs(dt: number): void {
    const v = Math.abs(this.effectiveSpeed)
    const walking = this.state === 'walking' && v > 1
    if (walking) {
      const amp = clampf(0.2 + v * 0.0022, 0.2, 0.5)
      const stride = Math.max(5, 2 * amp * 13)
      const freq = clampf(v / stride, 3, 11)
      this.gaitPhase = (this.gaitPhase + freq * dt) % 1
      const stanceFrac = 0.6
      for (const leg of this.model.legs) {
        const p = (this.gaitPhase + leg.phase) % 1
        if (p < stanceFrac) {
          leg.angle = amp * (1 - 2 * (p / stanceFrac))
          leg.lift = 0
        } else {
          const s = (p - stanceFrac) / (1 - stanceFrac)
          leg.angle = -amp + 2 * amp * smoothstep(s)
          leg.lift = Math.sin(s * Math.PI) * 0.55
        }
        if (this.backwardTimer > 0) leg.angle = -leg.angle
      }
    } else if (this.state === 'grooming') {
      for (const leg of this.model.legs) {
        if (leg.isFront) {
          leg.angle = 0.45 + 0.25 * Math.sin(this.time * 20 + leg.swingSign * 1.3)
          leg.lift = 0.55 + 0.15 * Math.sin(this.time * 22)
        } else {
          leg.angle += (0 - leg.angle) * Math.min(1, 8 * dt)
          leg.lift += (0 - leg.lift) * Math.min(1, 8 * dt)
        }
      }
    } else if (this.state === 'flying') {
      for (const leg of this.model.legs) {
        leg.angle += (-0.35 - leg.angle) * Math.min(1, 6 * dt)
        leg.lift += (0.5 - leg.lift) * Math.min(1, 6 * dt)
      }
    } else {
      for (const leg of this.model.legs) {
        leg.angle += (0 - leg.angle) * Math.min(1, 10 * dt)
        leg.lift += (0 - leg.lift) * Math.min(1, 10 * dt)
      }
    }
  }

  private updateWings(dt: number): void {
    if (this.state !== 'flying') {
      if (!this.model.foldedWings.isHidden) {
        const raiseTarget =
          this.state !== 'sleeping' && (this.liveWing > 0.7 || (this.brainLive && this.dartTimer > 0))
            ? 1
            : 0
        this.wingRaise += (raiseTarget - this.wingRaise) * Math.min(1, 8 * dt)
        if (this.wingRaise > 0.01) {
          const wings = this.model.foldedWings.childNodes
          for (let i = 0; i < wings.length; i++) {
            const side = i === 0 ? -1 : 1
            wings[i]!.eulerAngles = vec3(-0.5 * this.wingRaise, 0, side * (0.13 + 0.3 * this.wingRaise))
          }
        }
      }
      return
    }
    this.flapPhase = (this.flapPhase + dt * (14 + 10 * this.effortCurrent)) % 1
    const stroke = Math.sin(this.flapPhase * 2 * Math.PI)
    const wings = this.model.foldedWings.childNodes
    for (let i = 0; i < wings.length; i++) {
      const side = i === 0 ? -1 : 1
      wings[i]!.eulerAngles = vec3(stroke * 0.35, 0, side * (0.45 + 0.35 * (0.5 + 0.5 * stroke)))
    }
    const flick = 0.1 + 0.14 * Math.abs(stroke)
    this.model.blurWingL.opacity = flick
    this.model.blurWingR.opacity = flick
    this.model.blurWingL.eulerAngles = vec3(0, 0, 0.45 + stroke * 0.2)
    this.model.blurWingR.eulerAngles = vec3(0, 0, -0.45 - stroke * 0.2)
  }
}
