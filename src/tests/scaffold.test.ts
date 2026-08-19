import { describe, expect, it } from 'vitest'
import { BRAIN_SIGNAL_KEYS, defaultBrainSignals } from '../shared/brain-signals'

describe('scaffold', () => {
  it('BrainSignals keys match Swift Sim.swift', () => {
    const signals = defaultBrainSignals()
    expect(Object.keys(signals).sort()).toEqual([...BRAIN_SIGNAL_KEYS].sort())
    expect(signals.escape).toBe(false)
    expect(signals.nervous).toBe(0)
    expect(signals.turnBias).toBe(0)
    expect(signals.backward).toBe(false)
    expect(signals.walkDrive).toBe(0)
    expect(signals.groomDrive).toBe(0)
    expect(signals.wingDrive).toBe(0)
    expect(signals.hungerDrive).toBe(0)
    expect(signals.thirstDrive).toBe(0)
    expect(signals.sleepDrive).toBe(0)
    expect(signals.clockDrive).toBe(0)
    expect(signals.arousal).toBe(0)
    expect(signals.tempo).toBe(1)
    expect(signals.sleep).toBe(false)
  })
})
