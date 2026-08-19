/**
 * Circadian activity + idle→sleep + typing vibration + environmentTempo.
 * Control points live in src/shared/circadian.ts (Environment.swift port).
 *
 * Typing uses idle-time (when, never which keys). Global key identity is never
 * inspected — we only know seconds since last input.
 */

import { createRequire } from 'node:module'

export { CIRCADIAN_POINTS, circadianActivity } from '../shared/circadian'
import { circadianActivity } from '../shared/circadian'

type ThermalState = 'unknown' | 'nominal' | 'fair' | 'serious' | 'critical'

type SpeedLimitListener = (details: { limit?: number }) => void

type PowerMonitorLike = {
  getCurrentThermalState?: () => ThermalState
  on?: (event: string, listener: SpeedLimitListener) => void
  off?: (event: string, listener: SpeedLimitListener) => void
}

const require = createRequire(import.meta.url)

/** Cached Windows/macOS CPU speed-limit percent. 100 = unlimited. */
let speedLimitPercent = 100

function loadPowerMonitor(): PowerMonitorLike | null {
  if (typeof process === 'undefined' || !process.versions?.electron) return null
  try {
    const electron = require('electron') as { powerMonitor?: PowerMonitorLike }
    return electron.powerMonitor ?? null
  } catch {
    return null
  }
}

/** sleepy = (idle > 600 && (hour >= 22 || hour < 6)) || idle > 1800 */
export function isSleepy(idleSeconds: number, hour: number): boolean {
  return (idleSeconds > 600 && (hour >= 22 || hour < 6)) || idleSeconds > 1800
}

/** Swift: typingLevel += ((keyIdle < 0.6 ? 1 : 0) - typingLevel) * 0.15 */
export function typingFromIdle(idleSeconds: number, prev: number): number {
  const target = idleSeconds < 0.6 ? 1.0 : 0.0
  return prev + (target - prev) * 0.15
}

/**
 * Circadian compression + sleep neuromodulation.
 * activityScale = (1 - (1 - activity) * 0.35) * (sleepy ? 0.75 : 1)
 * sensoryGate = sleepy ? 0.55 : 1
 */
export function simNeuromodulation(
  activity: number,
  sleepy: boolean,
): { activityScale: number; sensoryGate: number } {
  return {
    activityScale: (1 - (1 - activity) * 0.35) * (sleepy ? 0.75 : 1),
    sensoryGate: sleepy ? 0.55 : 1,
  }
}

export function tempoFromThermalState(state: string | null | undefined): number {
  switch (state) {
    case 'nominal':
      return 1.0
    case 'fair':
      return 1.15
    case 'serious':
      return 1.35
    case 'critical':
      return 1.5
    default:
      return 1.0
  }
}

/**
 * Windows speed-limit / power: 100% unlimited → 1.0; throttle maps onto the
 * same 1.0 / 1.15 / 1.35 / 1.5 range as macOS thermalState.
 */
export function tempoFromSpeedLimit(percent: number): number {
  if (!Number.isFinite(percent) || percent >= 100) return 1.0
  if (percent >= 70) return 1.15
  if (percent >= 40) return 1.35
  return 1.5
}

export type EnvironmentTempoInput = {
  thermalState?: string | null
  speedLimitPercent?: number | null
  nativeFactor?: number | null
  platform?: string
}

/**
 * Generalized thermalTempo.
 *   macOS   ProcessInfo.thermalState / Electron getCurrentThermalState
 *   Windows CPU speed-limit / power (1.0 when unlimited)
 *   Linux   1.0
 */
export function environmentTempo(opts?: EnvironmentTempoInput): number {
  const platform = opts?.platform ?? (typeof process !== 'undefined' ? process.platform : 'linux')
  // PORT_CONTRACT: Linux environmentTempo is always 1.0 (no thermal/speed-limit).
  if (platform === 'linux') return 1.0
  if (platform === 'darwin') {
    const thermal = opts?.thermalState
    if (thermal && thermal !== 'unknown') return tempoFromThermalState(thermal)
  }
  if (platform === 'win32') {
    const limit = opts?.speedLimitPercent
    if (typeof limit === 'number' && Number.isFinite(limit) && limit < 100) {
      return tempoFromSpeedLimit(limit)
    }
  }
  const native = opts?.nativeFactor
  if (typeof native === 'number' && Number.isFinite(native) && native > 0) return native
  return 1.0
}

/** Fractional hour for circadian interpolation. */
export function hourOf(date: Date = new Date()): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

export type AmbientSample = {
  hour: number
  activity: number
  sleepy: boolean
  typing: number
  tempo: number
  activityScale: number
  sensoryGate: number
}

export function sampleAmbient(input: {
  idleSeconds: number
  typing: number
  tempo?: number
  now?: Date
}): AmbientSample {
  const hour = hourOf(input.now ?? new Date())
  const activity = circadianActivity(hour)
  const sleepy = isSleepy(input.idleSeconds, hour)
  const typing = typingFromIdle(input.idleSeconds, input.typing)
  const tempo = input.tempo ?? 1.0
  const { activityScale, sensoryGate } = simNeuromodulation(activity, sleepy)
  return { hour, activity, sleepy, typing, tempo, activityScale, sensoryGate }
}

/**
 * Subscribe to Electron `speed-limit-change` (Windows/macOS). No-op outside Electron.
 * Call once from the world loop.
 */
export function watchSpeedLimit(): () => void {
  const pm = loadPowerMonitor()
  if (!pm?.on) return () => {}
  const handler = (details: { limit?: number }): void => {
    if (typeof details?.limit === 'number' && Number.isFinite(details.limit)) {
      speedLimitPercent = details.limit
    }
  }
  pm.on('speed-limit-change', handler)
  return () => {
    pm.off?.('speed-limit-change', handler)
  }
}

/**
 * Live environmentTempo: powerMonitor thermal (macOS), cached speed-limit
 * (Windows), else nativeFactor, else 1.0.
 */
export function readEnvironmentTempo(nativeFactor = 1.0): number {
  const pm = loadPowerMonitor()
  let thermal: string | null = null
  try {
    thermal = pm?.getCurrentThermalState?.() ?? null
  } catch {
    thermal = null
  }
  return environmentTempo({
    thermalState: thermal,
    speedLimitPercent,
    nativeFactor,
    platform: process.platform,
  })
}
