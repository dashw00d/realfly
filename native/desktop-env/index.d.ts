/** Types for the NAPI-RS addon / JS stub at native/desktop-env. */

export type DesktopWindow = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type Point = {
  x: number
  y: number
}

export function nativeAvailable(): boolean
export function getWindows(): DesktopWindow[]
export function getCursor(): Point
export function getIdleSeconds(): number
export function getThermalFactor(): number
export function isDegraded(): boolean
export function backend(): string
export function onMouseDown(cb: (event: MouseEvent) => void): () => void
