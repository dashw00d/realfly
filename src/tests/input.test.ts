import { describe, expect, it } from 'vitest'
import { attachTapInput, globalClicksAvailable } from '../main/input'
import type { DesktopEnvironment, DesktopMouseEvent, Unsubscribe } from '../main/desktop-env'
import type { DesktopWindow, Point } from '../shared/types'

class FakeDesktop implements DesktopEnvironment {
  private readonly listeners = new Set<(event: DesktopMouseEvent) => void>()
  clicks = true

  getWindows(): DesktopWindow[] {
    return []
  }
  getCursor(): Point {
    return { x: 0, y: 0 }
  }
  getIdleSeconds(): number {
    return 0
  }
  getThermalFactor(): number {
    return 1
  }
  globalClicksAvailable(): boolean {
    return this.clicks
  }
  onMouseDown(cb: (event: DesktopMouseEvent) => void): Unsubscribe {
    if (!this.clicks) return () => {}
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
  fire(event: DesktopMouseEvent): void {
    for (const cb of this.listeners) cb(event)
  }
}

const display = { x: 0, y: 0, width: 1000, height: 800 }

describe('attachTapInput', () => {
  it('reports unavailable when the hook is missing', () => {
    const desktop = new FakeDesktop()
    desktop.clicks = false
    expect(globalClicksAvailable(desktop)).toBe(false)
    const taps: number[] = []
    const unsub = attachTapInput({
      desktop,
      display: () => display,
      fly: () => ({ x: 0, y: 0, heading: 0 }),
      onTap: () => taps.push(1),
    })
    desktop.fire({ x: 500, y: 400, screenX: 500, screenY: 400 })
    expect(taps).toEqual([])
    unsub()
  })

  it('injects a sensory tap when the click is near the fly', () => {
    const desktop = new FakeDesktop()
    const taps: { strength: number; durationMs: number }[] = []
    const unsub = attachTapInput({
      desktop,
      display: () => display,
      fly: () => ({ x: 0, y: 0, heading: 0 }),
      onTap: (stim) => taps.push(stim),
    })
    // screen (500, 400) → overlay (0, 0) at display center
    desktop.fire({ x: 500, y: 400, screenX: 500, screenY: 400, button: 1 })
    expect(taps).toEqual([{ strength: 0.5, durationMs: 130 }])
    unsub()
  })

  it('ignores clicks farther than 520 overlay units', () => {
    const desktop = new FakeDesktop()
    const taps: number[] = []
    const unsub = attachTapInput({
      desktop,
      display: () => display,
      fly: () => ({ x: 0, y: 0, heading: 0 }),
      onTap: () => taps.push(1),
    })
    desktop.fire({ x: 500 + 520, y: 400, screenX: 500 + 520, screenY: 400 })
    expect(taps).toEqual([])
    unsub()
  })

  it('right-clicks startle too (Swift monitors left and right)', () => {
    const desktop = new FakeDesktop()
    const taps: number[] = []
    const unsub = attachTapInput({
      desktop,
      display: () => display,
      fly: () => ({ x: 0, y: 0, heading: 0 }),
      onTap: () => taps.push(1),
    })
    desktop.fire({ x: 500, y: 400, screenX: 500, screenY: 400, button: 2 })
    expect(taps).toEqual([1])
    unsub()
  })
})
