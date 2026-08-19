import type { BrainSignals } from './brain-signals'
import type { CreatureId, Ledge, Point } from './types'

/** Per-frame world snapshot handed to every creature. */
export interface World {
  bounds: { width: number; height: number }
  mouse: Point | null
  ledges: Ledge[]
  /** 0..1 typing intensity from idle-time (never which keys). */
  typing?: number
}

/**
 * Cross-creature contract. DesktopFly is creature #1; later creatures implement
 * the same update/pose surface without touching native desktop code.
 */
export interface Creature {
  readonly id: CreatureId
  position: Point
  heading: number
  state: string
  update(dt: number, world: World, signals: BrainSignals): void
}
