/** Electron `screen` topology. One overlay per physical display. */
import { screen } from 'electron'
import type { Point } from '../shared/types'

export type DisplayBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type DisplayInfo = {
  id: number
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
  bounds: DisplayBounds
}

function toInfo(display: Electron.Display): DisplayInfo {
  const { x, y, width, height } = display.bounds
  return {
    id: display.id,
    x,
    y,
    width,
    height,
    scaleFactor: display.scaleFactor,
    bounds: { x, y, width, height },
  }
}

export function listDisplays(): DisplayInfo[] {
  return screen.getAllDisplays().map(toInfo)
}

export function getCursorPosition(): Point {
  const p = screen.getCursorScreenPoint()
  return { x: p.x, y: p.y }
}

/** Subscribe to display-added / display-removed / display-metrics-changed. */
export function subscribeDisplayChanges(listener: () => void): () => void {
  screen.on('display-added', listener)
  screen.on('display-removed', listener)
  screen.on('display-metrics-changed', listener)
  return () => {
    screen.removeListener('display-added', listener)
    screen.removeListener('display-removed', listener)
    screen.removeListener('display-metrics-changed', listener)
  }
}
