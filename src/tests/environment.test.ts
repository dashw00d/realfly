import { describe, expect, it } from 'vitest'
import { circadianActivity } from '../shared/circadian'
import {
  environmentTempo,
  isSleepy,
  simNeuromodulation,
  tempoFromSpeedLimit,
  tempoFromThermalState,
  typingFromIdle,
} from '../main/environment'

describe('environmentTempo', () => {
  it('maps macOS thermal states onto 1.0 / 1.15 / 1.35 / 1.5', () => {
    expect(tempoFromThermalState('nominal')).toBe(1.0)
    expect(tempoFromThermalState('fair')).toBe(1.15)
    expect(tempoFromThermalState('serious')).toBe(1.35)
    expect(tempoFromThermalState('critical')).toBe(1.5)
    expect(tempoFromThermalState('unknown')).toBe(1.0)
  })

  it('maps Windows speed-limit: 100% unlimited → 1.0', () => {
    expect(tempoFromSpeedLimit(100)).toBe(1.0)
    expect(tempoFromSpeedLimit(85)).toBe(1.15)
    expect(tempoFromSpeedLimit(50)).toBe(1.35)
    expect(tempoFromSpeedLimit(20)).toBe(1.5)
  })

  it('Linux is 1.0 even when other signals are present', () => {
    expect(
      environmentTempo({
        platform: 'linux',
        thermalState: 'critical',
        speedLimitPercent: 20,
        nativeFactor: 1.0,
      }),
    ).toBe(1.0)
  })

  it('macOS prefers thermal state; Windows prefers speed-limit', () => {
    expect(environmentTempo({ platform: 'darwin', thermalState: 'fair' })).toBe(1.15)
    expect(environmentTempo({ platform: 'win32', speedLimitPercent: 50 })).toBe(1.35)
    expect(environmentTempo({ platform: 'win32', speedLimitPercent: 100 })).toBe(1.0)
  })
})

describe('idle → sleep + typing', () => {
  it('sleepy = (idle > 600 && night) || idle > 1800', () => {
    expect(isSleepy(0, 23)).toBe(false)
    expect(isSleepy(601, 23)).toBe(true)
    expect(isSleepy(601, 3)).toBe(true)
    expect(isSleepy(601, 12)).toBe(false)
    expect(isSleepy(1801, 12)).toBe(true)
  })

  it('typing uses idle-time, never which keys', () => {
    const on = typingFromIdle(0.1, 0)
    expect(on).toBeCloseTo(0.15, 5)
    const off = typingFromIdle(2, 1)
    expect(off).toBeCloseTo(0.85, 5)
  })
})

describe('sim neuromodulation', () => {
  it('siesta 0.55 compresses to 0.8425 (printed 0.84)', () => {
    const { activityScale, sensoryGate } = simNeuromodulation(0.55, false)
    expect(activityScale).toBeCloseTo(0.8425, 5)
    expect(sensoryGate).toBe(1)
  })

  it('sleep multiplies activityScale by 0.75 and gates sensory at 0.55', () => {
    const { activityScale, sensoryGate } = simNeuromodulation(1, true)
    expect(activityScale).toBeCloseTo(0.75, 5)
    expect(sensoryGate).toBe(0.55)
  })

  it('circadian control points still match Environment.swift', () => {
    expect(circadianActivity(3)).toBeLessThan(0.4)
    expect(circadianActivity(9)).toBeGreaterThan(0.9)
    expect(circadianActivity(14)).toBeLessThan(0.7)
    expect(circadianActivity(14)).toBeGreaterThan(0.3)
    expect(circadianActivity(18)).toBeGreaterThan(0.9)
  })
})
