import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DesktopWindow, Point } from '../shared/types'
import {
  globalMouseHookAvailable,
  subscribeGlobalMouseDown,
} from './global-mouse'

/**
 * Everything north of this line is identical across platforms.
 * Hide native input behind onMouseDown — never leak libuiohook into app code.
 *
 * getThermalFactor() is environmentTempo (generalized from macOS thermalTempo):
 *   macOS  ProcessInfo.thermalState → 1.0 / 1.15 / 1.35 / 1.5
 *   Windows CPU speed-limit / power state (same numeric range; 1.0 unlimited)
 *   Linux  1.0
 */
export type Unsubscribe = () => void

/** Screen-space mouse-down. Overlay windows are click-through; this comes from the OS hook. */
export type DesktopMouseEvent = {
  x: number
  y: number
  screenX: number
  screenY: number
  button?: number
}

export interface DesktopEnvironment {
  getWindows(): DesktopWindow[]
  getCursor(): Point
  getIdleSeconds(): number
  onMouseDown(cb: (event: DesktopMouseEvent) => void): Unsubscribe
  getThermalFactor(): number
  /** True when a desktop-wide mouse hook is armed (uiohook, or native crate later). */
  globalClicksAvailable(): boolean
}

const require = createRequire(import.meta.url)

type ElectronScreen = {
  getCursorScreenPoint: () => Point
}

type ElectronPowerMonitor = {
  getSystemIdleTime: () => number
}

function loadElectron(): {
  screen?: ElectronScreen
  powerMonitor?: ElectronPowerMonitor
} | null {
  if (typeof process === 'undefined' || !process.versions?.electron) return null
  try {
    return require('electron') as {
      screen?: ElectronScreen
      powerMonitor?: ElectronPowerMonitor
    }
  } catch {
    return null
  }
}

type NativeAddon = {
  getWindows?: () => DesktopWindow[]
  getCursor?: () => Point
  getIdleSeconds?: () => number
  getThermalFactor?: () => number
  isDegraded?: () => boolean
  backend?: () => string
  onMouseDownSupported?: () => boolean
  onMouseDown?: (cb: (event: DesktopMouseEvent) => void) => Unsubscribe
}

function nativeSearchDirs(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  return [join(here, '../../native/desktop-env'), join(process.cwd(), 'native/desktop-env')]
}

function nativeFilenames(): string[] {
  const { platform, arch } = process
  const triples = [
    `${platform}-${arch}`,
    `${platform}-${arch}-gnu`,
    `${platform}-${arch}-msvc`,
    `${platform}-${arch}-musl`,
  ]
  return ['desktop-env.node', 'index.node', ...triples.map((t) => `desktop-env.${t}.node`)]
}

/** Try require the NAPI-RS `.node`. Missing rustc on this host → null. */
function loadNativeAddon(): NativeAddon | null {
  const seen = new Set<string>()
  for (const dir of nativeSearchDirs()) {
    for (const name of nativeFilenames()) {
      const path = join(dir, name)
      if (seen.has(path) || !existsSync(path)) continue
      seen.add(path)
      try {
        return require(path) as NativeAddon
      } catch {
        // Wrong ABI or unloadable: keep looking, then fall back.
      }
    }
  }
  return null
}

/**
 * JS fallback used when native/desktop-env.node is not built (no rustc on this
 * host). Cursor/idle come from Electron when available; otherwise zeros.
 * Window enumeration is native-only and returns [].
 */
export class FallbackDesktopEnvironment implements DesktopEnvironment {
  readonly degraded = false
  readonly backend = 'fallback'

  getWindows(): DesktopWindow[] {
    return []
  }

  getCursor(): Point {
    try {
      const screen = loadElectron()?.screen
      if (!screen) return { x: 0, y: 0 }
      const p = screen.getCursorScreenPoint()
      return { x: p.x, y: p.y }
    } catch {
      return { x: 0, y: 0 }
    }
  }

  getIdleSeconds(): number {
    try {
      const pm = loadElectron()?.powerMonitor
      if (!pm) return 0
      return pm.getSystemIdleTime()
    } catch {
      return 0
    }
  }

  /**
   * Overlay windows are click-through (`setIgnoreMouseEvents`), so Electron
   * never sees desktop clicks. libuiohook (loaded only here) is the OS hook.
   */
  onMouseDown(cb: (event: DesktopMouseEvent) => void): Unsubscribe {
    if (!globalMouseHookAvailable()) return () => {}
    return subscribeGlobalMouseDown(cb)
  }

  globalClicksAvailable(): boolean {
    return globalMouseHookAvailable()
  }

  /** Linux fallback 1.0; macOS/Windows mappings land in native/desktop-env. */
  getThermalFactor(): number {
    return 1.0
  }
}

export class NativeDesktopEnvironment implements DesktopEnvironment {
  /** True when native Wayland blocks foreign-window inspection. */
  readonly degraded: boolean
  readonly backend: string

  constructor(private readonly native: NativeAddon) {
    try {
      this.degraded = native.isDegraded?.() ?? false
    } catch {
      this.degraded = false
    }
    try {
      this.backend = native.backend?.() ?? 'native'
    } catch {
      this.backend = 'native'
    }
  }

  getWindows(): DesktopWindow[] {
    try {
      return this.native.getWindows?.() ?? []
    } catch {
      return []
    }
  }

  getCursor(): Point {
    try {
      const p = this.native.getCursor?.()
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y }
    } catch {
      // fall through
    }
    return { x: 0, y: 0 }
  }

  getIdleSeconds(): number {
    try {
      const s = this.native.getIdleSeconds?.()
      if (typeof s === 'number' && Number.isFinite(s) && s >= 0) return s
    } catch {
      // fall through
    }
    return 0
  }

  onMouseDown(cb: (event: DesktopMouseEvent) => void): Unsubscribe {
    if (this.nativeHookAvailable()) {
      try {
        const unsub = this.native.onMouseDown?.(cb)
        if (typeof unsub === 'function') return unsub
      } catch {
        // fall through to uiohook
      }
    }
    if (!globalMouseHookAvailable()) return () => {}
    return subscribeGlobalMouseDown(cb)
  }

  globalClicksAvailable(): boolean {
    return this.nativeHookAvailable() || globalMouseHookAvailable()
  }

  private nativeHookAvailable(): boolean {
    try {
      return this.native.onMouseDownSupported?.() === true && typeof this.native.onMouseDown === 'function'
    } catch {
      return false
    }
  }

  getThermalFactor(): number {
    try {
      const t = this.native.getThermalFactor?.()
      if (typeof t === 'number' && Number.isFinite(t) && t > 0) return t
    } catch {
      // fall through
    }
    return 1.0
  }
}

export function createFallbackDesktopEnvironment(): DesktopEnvironment {
  return new FallbackDesktopEnvironment()
}

export function createDesktopEnvironment(): DesktopEnvironment {
  const native = loadNativeAddon()
  if (native) return new NativeDesktopEnvironment(native)
  return createFallbackDesktopEnvironment()
}
