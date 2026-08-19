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

/** 60 Hz snapshot main → overlay. Only fly #1 gets `signals`; extras are autonomous. */
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
