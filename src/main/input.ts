/**
 * Global clicks → tap on the fly's substrate.
 * Hide the hook behind desktop.onMouseDown — never import libuiohook here.
 *
 * Overlay BrowserWindows are click-through (`setIgnoreMouseEvents`), so the
 * OS-level hook behind desktop-env is the only way to see desktop-wide clicks.
 */

import type { DesktopEnvironment, DesktopMouseEvent } from './desktop-env'
import type { ScreenRect } from './coords'
import { screenToOverlay } from './coords'
import { tapStimulus, type LoomFly } from './cursor-loom'

export type TapHandler = (input: { strength: number; durationMs: number }) => void

function eventScreenPoint(event: DesktopMouseEvent): { x: number; y: number } {
  if (typeof event.x === 'number' && typeof event.y === 'number') {
    return { x: event.x, y: event.y }
  }
  return { x: event.screenX, y: event.screenY }
}

export function globalClicksAvailable(desktop: DesktopEnvironment): boolean {
  if (typeof desktop.globalClicksAvailable === 'function') {
    return desktop.globalClicksAvailable()
  }
  return false
}

/**
 * Subscribe to desktop.onMouseDown and injectTap using distance to fly #1.
 * Returns an unsubscribe function.
 */
export function attachTapInput(opts: {
  desktop: DesktopEnvironment
  display: () => ScreenRect
  fly: () => LoomFly | null
  onTap: TapHandler
}): () => void {
  if (!globalClicksAvailable(opts.desktop)) {
    console.info(
      'DesktopFly: global clicks unavailable (uiohook-napi not loaded for this Electron ABI). ' +
        'Tap-to-startle is disabled. Try `pnpm rebuild:hooks`. Overlay windows are click-through.',
    )
    return () => {}
  }

  console.info('DesktopFly: tap-to-startle armed (click near the fly)')
  return opts.desktop.onMouseDown((event) => {
    const fly = opts.fly()
    if (!fly) return
    const at = screenToOverlay(eventScreenPoint(event), opts.display())
    const stim = tapStimulus(fly, at)
    if (stim) opts.onTap(stim)
  })
}
