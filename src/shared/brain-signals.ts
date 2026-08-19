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
  /** environmentTempo (was thermalTempo). Default 1. */
  tempo: number
  /** Circadian + idle → sleep-like state. */
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
    tempo: 1,
    sleep: false,
  }
}
