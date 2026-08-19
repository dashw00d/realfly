import type { Point } from '../shared/types'

/** Display bounds in screen coords (origin top-left, y down). */
export type ScreenRect = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Screen (y down) → overlay scene (origin at display center, y up).
 * Matches Swift `loc - screenFrame.mid`.
 */
export function screenToOverlay(p: Point, display: ScreenRect): Point {
  return {
    x: p.x - (display.x + display.width / 2),
    y: display.y + display.height / 2 - p.y,
  }
}

export function overlayToScreen(p: Point, display: ScreenRect): Point {
  return {
    x: p.x + display.x + display.width / 2,
    y: display.y + display.height / 2 - p.y,
  }
}
