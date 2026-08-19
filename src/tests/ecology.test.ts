import { describe, expect, it } from 'vitest'
import { WindowSense, isOverlaySized, windowTopLedge } from '../main/ecology'
import type { DesktopWindow } from '../shared/types'

const display = { x: 0, y: 0, width: 1920, height: 1080 }

describe('window top edges → ledges', () => {
  it('converts a normal window top into overlay coords (y up, origin center)', () => {
    const win: DesktopWindow = { id: 42, x: 100, y: 200, width: 400, height: 300 }
    const ledge = windowTopLedge(win, display)
    expect(ledge).not.toBeNull()
    expect(ledge!.id).toBe(42)
    expect(ledge!.y).toBe(540 - 200)
    expect(ledge!.x0).toBe(100 - 960)
    expect(ledge!.x1).toBe(500 - 960)
  })

  it('rejects short / skinny / overlay-sized windows', () => {
    expect(windowTopLedge({ id: 1, x: 10, y: 10, width: 80, height: 400 }, display)).toBeNull()
    expect(windowTopLedge({ id: 2, x: 10, y: 10, width: 400, height: 40 }, display)).toBeNull()
    expect(
      isOverlaySized({ id: 3, x: 0, y: 0, width: 1920, height: 1080 }, display),
    ).toBe(true)
    expect(windowTopLedge({ id: 3, x: 0, y: 0, width: 1920, height: 1080 }, display)).toBeNull()
  })

  it('caps at 12 ledges and flags new windows after the first poll', () => {
    const sense = new WindowSense()
    const first: DesktopWindow[] = [
      { id: 'a', x: 100, y: 200, width: 400, height: 300 },
    ]
    const snap0 = sense.poll(first, display)
    expect(snap0.newWindows).toHaveLength(0)
    expect(snap0.ledges).toHaveLength(1)

    const many: DesktopWindow[] = []
    for (let i = 0; i < 20; i++) {
      many.push({ id: i + 10, x: 80 + i * 10, y: 180, width: 300, height: 200 })
    }
    const snap1 = sense.poll(many, display)
    expect(snap1.ledges.length).toBeLessThanOrEqual(12)
    expect(snap1.newWindows.length).toBeGreaterThan(0)
  })
})
