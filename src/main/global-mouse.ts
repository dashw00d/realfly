/**
 * Isolated libuiohook loader. App code must not import this — only desktop-env.ts.
 *
 * Overlay BrowserWindows are click-through, so Electron cannot see desktop
 * clicks. libuiohook is the OS-level hook; desktop.onMouseDown is the API.
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'

export type GlobalMouseDownEvent = {
  x: number
  y: number
  button: number
  screenX: number
  screenY: number
}

type MouseDownListener = (event: GlobalMouseDownEvent) => void

type UiohookMouseEvent = {
  x: number
  y: number
  button?: number
}

type Uiohook = {
  on(event: 'mousedown', listener: (e: UiohookMouseEvent) => void): unknown
  off?(event: 'mousedown', listener: (e: UiohookMouseEvent) => void): unknown
  start(): void
  stop(): void
}

const listeners = new Set<MouseDownListener>()
let loadAttempted = false
let hook: Uiohook | null = null
let started = false
let startFailed = false
let boundDispatch: ((e: UiohookMouseEvent) => void) | null = null

function disabledByEnv(): boolean {
  return process.env.REALFLY_DISABLE_GLOBAL_CLICKS === '1'
}

function loadHook(): Uiohook | null {
  if (disabledByEnv()) return null
  if (loadAttempted) return hook
  loadAttempted = true
  try {
    const require = createRequire(join(process.cwd(), 'package.json'))
    const mod = require('uiohook-napi') as { uIOhook?: Uiohook }
    if (!mod?.uIOhook || typeof mod.uIOhook.start !== 'function') {
      hook = null
      return null
    }
    hook = mod.uIOhook
    return hook
  } catch (err) {
    console.warn(
      'DesktopFly: uiohook-napi failed to load (tap-to-startle off).',
      err instanceof Error ? err.message : err,
    )
    hook = null
    return null
  }
}

function toEvent(raw: UiohookMouseEvent): GlobalMouseDownEvent {
  const x = Number(raw.x)
  const y = Number(raw.y)
  const button = typeof raw.button === 'number' ? raw.button : 1
  return { x, y, button, screenX: x, screenY: y }
}

function dispatch(raw: UiohookMouseEvent): void {
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return
  const event = toEvent(raw)
  for (const cb of listeners) cb(event)
}

function ensureStarted(next: Uiohook): boolean {
  if (started) return true
  if (startFailed) return false
  try {
    boundDispatch = dispatch
    next.on('mousedown', boundDispatch)
    next.start()
    started = true
    return true
  } catch (err) {
    startFailed = true
    started = false
    console.warn(
      'DesktopFly: global mouse hook failed to start (need X11/XWayland or a rebuilt Electron binary).',
      err instanceof Error ? err.message : err,
    )
    return false
  }
}

function maybeStop(next: Uiohook): void {
  if (!started || listeners.size > 0) return
  try {
    if (boundDispatch && typeof next.off === 'function') {
      next.off('mousedown', boundDispatch)
    }
    next.stop()
  } catch {
    // Hook teardown is best-effort.
  }
  started = false
  boundDispatch = null
}

/** True if libuiohook loaded and can be started. Does not start the hook. */
export function globalMouseHookAvailable(): boolean {
  if (disabledByEnv() || startFailed) return false
  return loadHook() != null
}

/**
 * Subscribe to OS-level mouse-down (left or right). Starts the hook on first
 * subscriber; stops when the last unsubscribes.
 */
export function subscribeGlobalMouseDown(cb: MouseDownListener): () => void {
  const next = loadHook()
  listeners.add(cb)
  if (!next || !ensureStarted(next)) {
    listeners.delete(cb)
    return () => {}
  }
  return () => {
    listeners.delete(cb)
    maybeStop(next)
  }
}

/** Tests: fire a click as if the OS hook saw it. */
export function emitTestMouseDown(event: { x: number; y: number; button?: number }): void {
  dispatch({ x: event.x, y: event.y, button: event.button ?? 1 })
}
