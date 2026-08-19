import { describe, expect, it } from 'vitest'
import { CIRCADIAN_POINTS, circadianActivity } from '../shared/circadian'

/** Port of circadianActivity control points from Environment.swift. */
describe('circadian curve: siesta + night dips, dawn/dusk peaks', () => {
  it('control points match Environment.swift', () => {
    expect(CIRCADIAN_POINTS).toEqual([
      [0, 0.25],
      [5, 0.25],
      [8, 1.0],
      [10, 1.0],
      [13, 0.55],
      [15, 0.55],
      [17, 1.0],
      [20, 1.0],
      [23, 0.3],
      [24, 0.25],
    ])
  })

  it('siesta + night dips, dawn/dusk peaks', () => {
    expect(circadianActivity(3)).toBeLessThan(0.4)
    expect(circadianActivity(9)).toBeGreaterThan(0.9)
    expect(circadianActivity(14)).toBeLessThan(0.7)
    expect(circadianActivity(14)).toBeGreaterThan(0.3)
    expect(circadianActivity(18)).toBeGreaterThan(0.9)
  })
})
