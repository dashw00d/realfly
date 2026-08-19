/**
 * Cursor kinematics → looming drive for each eye of fly #1 + air puff.
 * Port of vendor/desktop-fly/main.swift Coordinator.computeLoom / injectWindowLoom / injectTap.
 */

import type { Point } from '../shared/types'

export function clampf(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export type LoomFly = {
  x: number
  y: number
  heading: number
}

export type SensoryDrive = {
  l: number
  r: number
  puff: number
}

/**
 * Tap on the substrate → sensory-pathway strength (before 0.15 + s*0.35 stim).
 * Swift: strength = clamp(1 - d / 520, 0, 1); fire if > 0.05.
 */
export function tapStrength(fly: Point, at: Point): number {
  const d = Math.hypot(at.x - fly.x, at.y - fly.y)
  return clampf(1 - d / 520, 0, 1)
}

export function tapStimulus(fly: Point, at: Point): { strength: number; durationMs: number } | null {
  const s = tapStrength(fly, at)
  if (s <= 0.05) return null
  return { strength: 0.15 + s * 0.35, durationMs: 130 }
}

/**
 * A window appeared near the fly: split loom L/R by bearing (crossZ).
 * Copies Coordinator.injectWindowLoom.
 */
export function injectWindowLoom(
  fly: LoomFly,
  at: Point,
  strength: number,
  current: { l: number; r: number } = { l: 0, r: 0 },
): { l: number; r: number } {
  const relX = at.x - fly.x
  const relY = at.y - fly.y
  const dist = Math.max(1, Math.hypot(relX, relY))
  const fx = Math.cos(fly.heading)
  const fy = Math.sin(fly.heading)
  const crossZ = (fx * relY - fy * relX) / dist
  return {
    l: Math.max(current.l, strength * clampf(0.5 + 0.5 * crossZ, 0.12, 1)),
    r: Math.max(current.r, strength * clampf(0.5 - 0.5 * crossZ, 0.12, 1)),
  }
}

/** New-window loom gain: clamp(1 - d/480, 0, 1) * 0.75, fire if > 0.08. */
export function windowLoomStrength(fly: Point, center: Point): number {
  const d = Math.hypot(center.x - fly.x, center.y - fly.y)
  return clampf(1 - d / 480, 0, 1) * 0.75
}

export class WindowLoom {
  l = 0
  r = 0

  inject(fly: LoomFly, at: Point, strength: number): void {
    const next = injectWindowLoom(fly, at, strength, this)
    this.l = next.l
    this.r = next.r
  }

  /** Swift: decayF = exp(-4 * dt). */
  decay(dt: number): void {
    const decayF = Math.exp(-4 * dt)
    this.l *= decayF
    this.r *= decayF
  }
}

/**
 * Cursor loom + hover term, split L/R by bearing relative to heading.
 * loomOverride is added then decays at 1.2 / s (Coordinator).
 */
export class CursorLoom {
  prevMouse: Point | null = null
  mouseVel: Point = { x: 0, y: 0 }
  loomOverride = 0

  escapeTest(value = 0.6): void {
    this.loomOverride = value
  }

  /** Swift: loomOverride = max(0, loomOverride - dt * 1.2) */
  decayOverride(dt: number): void {
    this.loomOverride = Math.max(0, this.loomOverride - dt * 1.2)
  }

  compute(fly: LoomFly, mouse: Point | null, dt: number): SensoryDrive {
    if (!mouse) return { l: 0, r: 0, puff: 0 }
    if (this.prevMouse && dt > 0) {
      const vx = (mouse.x - this.prevMouse.x) / dt
      const vy = (mouse.y - this.prevMouse.y) / dt
      this.mouseVel.x += (vx - this.mouseVel.x) * 0.4
      this.mouseVel.y += (vy - this.mouseVel.y) * 0.4
    }
    this.prevMouse = { x: mouse.x, y: mouse.y }
    const relX = mouse.x - fly.x
    const relY = mouse.y - fly.y
    const dist = Math.max(20, Math.hypot(relX, relY))
    // radial approach speed (positive = cursor closing in)
    const approach = -(relX * this.mouseVel.x + relY * this.mouseVel.y) / dist
    // loom ~ rate of angular expansion, attenuated with distance
    let loom = clampf((approach / dist) * 6, 0, 1) * clampf(1 - dist / 800, 0, 1)
    loom += clampf((130 - dist) / 130, 0, 1) * 0.5
    loom = clampf(loom + this.loomOverride, 0, 1)
    const fx = Math.cos(fly.heading)
    const fy = Math.sin(fly.heading)
    const rdX = relX / dist
    const rdY = relY / dist
    const crossZ = fx * rdY - fy * rdX // >0: threat on the left
    const lw = clampf(0.5 + 0.5 * crossZ, 0.12, 1)
    const rw = clampf(0.5 - 0.5 * crossZ, 0.12, 1)
    const puff =
      clampf(Math.hypot(this.mouseVel.x, this.mouseVel.y) / 1500, 0, 1) * clampf(1 - dist / 500, 0, 1)
    return { l: loom * lw, r: loom * rw, puff }
  }
}
