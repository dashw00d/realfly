/**
 * Drosophila circadian activity: morning and evening peaks, midday siesta,
 * night quiescence. Port of vendor/desktop-fly/Environment.swift
 * `circadianActivity(hour:)`.
 */

export const CIRCADIAN_POINTS: ReadonlyArray<readonly [number, number]> = [
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
]

/** Multiplier for the sim's baseline drive. Linear interpolate between hours. */
export function circadianActivity(hour: number): number {
  const pts = CIRCADIAN_POINTS
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (hour >= a[0] && hour <= b[0]) {
      const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0])
      return a[1] + (b[1] - a[1]) * t
    }
  }
  return 0.25
}
