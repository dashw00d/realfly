/** Shared geometric / desktop types. Matches docs/PORT_CONTRACT.md. */

export interface Point {
  x: number
  y: number
}

export interface DesktopWindow {
  id: number | string
  x: number
  y: number
  width: number
  height: number
}

/** Walkable window top edge, scene coords (origin at display center). */
export interface Ledge {
  y: number
  x0: number
  x1: number
  id: number
}

export type CreatureId = string
