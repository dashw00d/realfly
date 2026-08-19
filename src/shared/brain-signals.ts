/**
 * What the brain tells the body each frame.
 * Field names and defaults match vendor/desktop-fly/Sim.swift `BrainSignals`.
 */
export interface BrainSignals {
  /** Giant fiber spiked → takeoff NOW. */
  escape: boolean
  /** Looming-detector population rate, 0..1. */
  nervous: number
  /** rad/s steering from DNa01/DNa02 left-right rate difference. */
  turnBias: number
  /** MDN burst → backward walking. */
  backward: boolean
  /** DNp09 forward-walking command rate, ~0..1.5. */
  walkDrive: number
  /** DNg11 grooming command rate, ~0..1.5. Unclamped in SignalBuilder. */
  groomDrive: number
  /** DNp02/04/11 escape-maneuver DN rate, ~0..1.3. */
  wingDrive: number
  /** Whole-population activity, ~0..1. */
  arousal: number
  /** Hunger NSC population rate, clamped 0..1. Circuit, not a wall-clock state. */
  hungerDrive: number
  /** Thirst command population rate, clamped 0..1. Circuit, not a wall-clock state. */
  thirstDrive: number
  /** dFB sleepn population rate, clamped 0..1. Circuit, not idle>600. */
  sleepDrive: number
  /** PDF LNv clock population rate, clamped 0..1. Not a body slider. */
  clockDrive: number
  /** environmentTempo (was thermalTempo). Default 1. */
  tempo: number
  /** Sleep from sleepn rate (sleepDrive > 0.22). */
  sleep: boolean
}

/** Canonical key list for scaffold tests and later SignalBuilder mapping. */
export const BRAIN_SIGNAL_KEYS = [
  'escape',
  'nervous',
  'turnBias',
  'backward',
  'walkDrive',
  'groomDrive',
  'wingDrive',
  'arousal',
  'hungerDrive',
  'thirstDrive',
  'sleepDrive',
  'clockDrive',
  'tempo',
  'sleep',
] as const satisfies readonly (keyof BrainSignals)[]

export function defaultBrainSignals(): BrainSignals {
  return {
    escape: false,
    nervous: 0,
    turnBias: 0,
    backward: false,
    walkDrive: 0,
    groomDrive: 0,
    wingDrive: 0,
    arousal: 0,
    hungerDrive: 0,
    thirstDrive: 0,
    sleepDrive: 0,
    clockDrive: 0,
    tempo: 1,
    sleep: false,
  }
}
