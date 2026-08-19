/**
 * Window terrain: poll getWindows() ~0.7s, convert top edges to Ledges in
 * overlay coords, detect new windows near the fly and inject window loom.
 * Port of vendor/desktop-fly/Environment.swift WindowSense.
 */

import type { DesktopWindow, Ledge, Point } from '../shared/types'
import { screenToOverlay, type ScreenRect } from './coords'

export type NewWindow = {
  center: Point
  size: number
}

export type WindowSnapshot = {
  ledges: Ledge[]
  newWindows: NewWindow[]
}

const MIN_WIDTH = 160
const MIN_HEIGHT = 60
const MIN_EDGE = 100
const MAX_LEDGES = 12
const INSET = 15
const TOP_MARGIN = 8

export function numericWindowId(id: number | string): number {
  if (typeof id === 'number' && Number.isFinite(id)) return id | 0
  const n = Number(id)
  if (Number.isFinite(n) && Math.abs(n) <= 0x7fffffff) return n | 0
  let h = 2166136261
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

function intersects(win: DesktopWindow, display: ScreenRect): boolean {
  return (
    win.x + win.width > display.x &&
    win.x < display.x + display.width &&
    win.y + win.height > display.y &&
    win.y < display.y + display.height
  )
}

/** Full-display surfaces are our click-through overlays — never walkable. */
export function isOverlaySized(win: DesktopWindow, display: ScreenRect): boolean {
  return (
    Math.abs(win.width - display.width) < 4 &&
    Math.abs(win.height - display.height) < 4 &&
    Math.abs(win.x - display.x) < 4 &&
    Math.abs(win.y - display.y) < 4
  )
}

export function windowTopLedge(win: DesktopWindow, display: ScreenRect): Ledge | null {
  if (win.width < MIN_WIDTH || win.height < MIN_HEIGHT) return null
  if (!intersects(win, display)) return null
  if (isOverlaySized(win, display)) return null
  const W = display.width
  const H = display.height
  const midX = display.x + W / 2
  const midY = display.y + H / 2
  const topY = midY - win.y
  const x0 = Math.max(win.x - midX, -W / 2 + INSET)
  const x1 = Math.min(win.x + win.width - midX, W / 2 - INSET)
  if (topY >= H / 2 - TOP_MARGIN || topY <= -H / 2 + TOP_MARGIN) return null
  if (x1 - x0 <= MIN_EDGE) return null
  return { y: topY, x0, x1, id: numericWindowId(win.id) }
}

export function windowCenterOverlay(win: DesktopWindow, display: ScreenRect): Point {
  return screenToOverlay(
    { x: win.x + win.width / 2, y: win.y + win.height / 2 },
    display,
  )
}

/**
 * Port of WindowSense.poll. Filters: width ≥ 160, height ≥ 60, top on this
 * display, x1−x0 > 100, inset 15 pt, at most 12 ledges.
 */
export class WindowSense {
  private known = new Set<string>()
  private first = true

  reset(): void {
    this.known.clear()
    this.first = true
  }

  poll(windows: DesktopWindow[], display: ScreenRect): WindowSnapshot {
    const ledges: Ledge[] = []
    const newWindows: NewWindow[] = []
    const ids = new Set<string>()

    for (const win of windows) {
      const key = String(win.id)
      ids.add(key)
      const ledge = windowTopLedge(win, display)
      if (ledge && ledges.length < MAX_LEDGES) ledges.push(ledge)
      if (!this.first && !this.known.has(key) && intersects(win, display) && !isOverlaySized(win, display)) {
        newWindows.push({
          center: windowCenterOverlay(win, display),
          size: Math.max(win.width, win.height),
        })
      }
    }

    this.known = ids
    this.first = false
    return { ledges, newWindows }
  }
}

export { screenToOverlay }
