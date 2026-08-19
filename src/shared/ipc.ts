/**
 * IPC / worker protocol for the live overlay loop.
 * Renderer never imports electron; preload + main share these shapes.
 */

import type { BrainSignals } from './brain-signals'
import type { Ledge, Point } from './types'
import type { SpikeEvent } from '../sim/spike-bus'

export type FlyPose = {
  x: number
  y: number
  heading: number
  walkingIntensity: number
  gaitPhase: number
  state: string
}

export type DisplaySnapshot = {
  id: number
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
}

/** Delayed noisy copy of fly #1 for extras. Not a second LIF circuit. */
export type ExtraMood = {
  walkDrive: number
  nervous: number
  escape: boolean
  groomDrive: number
  heading: number
}

/** Compact HUD payload for the brain window (and overlay consumers of `onHud`). */
export type BrainHudSnapshot = {
  gfSpike: boolean
  gfSilent: boolean
  rateLoom: number
  loomL: number
  loomR: number
  walkDrive: number
  groomDrive: number
  backward: boolean
  turnBias: number
  nervous: number
  arousal: number
  wingDrive: number
  tempo: number
  sleep: boolean
  lastStim?: { role: string; body: string }
}

/** 60 Hz snapshot main → overlay. Only fly #1 gets `signals`; extras use `extrasMood`. */
export type WorldFrame = {
  dt: number
  displayId: number
  bounds: { width: number; height: number }
  mouse: Point | null
  ledges: Ledge[]
  signals: BrainSignals | null
  paused: boolean
  flyCount: number
  scareSeq: number
  poses: FlyPose[]
  /** 0..1 typing intensity; overlay can twitch the abdomen. */
  typing?: number
  extrasMood?: ExtraMood
}

export type SimStepInput = {
  ms: number
  loomL: number
  loomR: number
  gaitDrive: number
  gaitPhase: number
  airPuff: number
  activityScale: number
  sensoryGate: number
}

export type SimStimulateInput = {
  indices?: number[]
  group?: string
  strength: number
  durationMs: number
}

export type SimWorkerRequest =
  | { id: number; type: 'init' }
  | ({ id: number; type: 'step' } & SimStepInput)
  | ({ id: number; type: 'stimulate' } & SimStimulateInput)
  | { id: number; type: 'consume' }

export type SimWorkerResponse =
  | { id: number; type: 'ready'; n: number; groups: Record<string, number> }
  | { id: number; type: 'step'; signals: BrainSignals; spikes: SpikeEvent[]; simMs: number }
  | { id: number; type: 'consume'; gf: boolean }
  | { id: number; type: 'ok' }
  | { id: number; type: 'error'; message: string }

export type { SpikeEvent }
