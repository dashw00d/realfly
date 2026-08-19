import { defaultBrainSignals, type BrainSignals } from '../shared/brain-signals'
import type { LIFSim } from './lif-sim'

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * rates → body commands. Shared by the live loop and --behaviortest.
 * Mapping copied from vendor/desktop-fly/main.swift SignalBuilder.make.
 */
export class SignalBuilder {
  private dnaBaseline = 0

  make(sim: LIFSim, dt: number): BrainSignals {
    const diff = sim.rateDNaL - sim.rateDNaR
    // Slow adaptation (tau ~8 s): persistent L/R wiring asymmetry is adapted out.
    this.dnaBaseline += (diff - this.dnaBaseline) * Math.min(1, dt / 8)
    const s = defaultBrainSignals()
    s.escape = sim.consumeGF()
    s.nervous = clamp(sim.rateLoom / 80, 0, 1)
    s.turnBias = clamp((diff - this.dnaBaseline) * 0.04, -1.0, 1.0)
    s.backward = sim.rateMDN > 8
    s.walkDrive = clamp(sim.rateFwd / 10, 0, 1.3)
    s.groomDrive = sim.rateGroom / 8
    s.wingDrive = clamp(sim.rateEscW / 10, 0, 1.3)
    s.arousal = clamp(sim.ratePop / 20, 0, 1)
    return s
  }
}
