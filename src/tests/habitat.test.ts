/**
 * Habitat cues through existing sensors: typing → abdomen twitch,
 * new small windows → window loom (no toast COM, no second species).
 */
import { describe, expect, it } from 'vitest'
import { abdomenBreathe, Fly } from '../creature/fly'
import { WindowSense, windowTopLedge } from '../main/ecology'
import { WindowLoom, windowLoomStrength } from '../main/cursor-loom'
import { defaultBrainSignals } from '../shared/brain-signals'
import type { World } from '../shared/creature'
import type { DesktopWindow } from '../shared/types'

const dt = 1 / 60
const display = { x: 0, y: 0, width: 1920, height: 1080 }

function world(typing?: number): World {
  return { bounds: { width: 1512, height: 982 }, mouse: null, ledges: [], typing }
}

describe('typing → abdomen twitch', () => {
  it('typing uses idle-time intensity, never which keys', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.time = Math.PI / (2 * 18)
    fly.state = 'idle'
    fly.update(0, world(0.8), defaultBrainSignals())
    expect(fly.typing).toBe(0.8)
  })

  it('typing ≤ 0.1 leaves rest breathing unchanged', () => {
    const t = 0.4
    expect(abdomenBreathe(t, false, 0)).toBe(abdomenBreathe(t, false, 0.1))
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'idle'
    fly.time = t
    fly.update(0, world(0.1), defaultBrainSignals())
    expect(fly.model.abdomen.scale.z).toBeCloseTo(0.75 * abdomenBreathe(t, false, 0), 8)
  })

  it('typing > 0.1 adds a faster, smaller abdomen pulse', () => {
    const tPeak = Math.PI / (2 * 18)
    const rest = abdomenBreathe(tPeak, false, 0)
    const twitch = abdomenBreathe(tPeak, false, 1)
    expect(twitch).toBeGreaterThan(rest)
    expect(twitch - rest).toBeCloseTo(0.012, 8)
    expect(twitch - rest).toBeLessThan(0.03)

    const rest0 = abdomenBreathe(0, false, 0)
    const restDt = abdomenBreathe(0.05, false, 0)
    const twitch0 = abdomenBreathe(0, false, 1)
    const twitchDt = abdomenBreathe(0.05, false, 1)
    expect(Math.abs(twitchDt - twitch0)).toBeGreaterThan(Math.abs(restDt - rest0))

    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'idle'
    fly.time = tPeak
    fly.update(0, world(1), defaultBrainSignals())
    expect(fly.model.abdomen.scale.z).toBeCloseTo(0.75 * twitch, 8)
  })
})

describe('new small windows → window loom', () => {
  it('injects loom when getWindows() gains a small window (toast-sized, not a ledge)', () => {
    const sense = new WindowSense()
    const existing: DesktopWindow[] = [{ id: 1, x: 100, y: 200, width: 400, height: 300 }]
    expect(sense.poll(existing, display).newWindows).toHaveLength(0)

    const toast: DesktopWindow = { id: 99, x: 860, y: 470, width: 120, height: 80 }
    expect(windowTopLedge(toast, display)).toBeNull()

    const snap = sense.poll([...existing, toast], display)
    expect(snap.newWindows).toHaveLength(1)

    const fly = { x: 0, y: 0, heading: 0 }
    const loom = new WindowLoom()
    for (const nw of snap.newWindows) {
      const strength = windowLoomStrength(fly, nw.center)
      if (strength > 0.08) loom.inject(fly, nw.center, strength)
    }
    expect(loom.l + loom.r).toBeGreaterThan(0)
  })
})

describe('Fly.update copies World.typing', () => {
  it('does not wipe typing when World.typing is omitted', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'idle'
    fly.update(dt, world(0.7), defaultBrainSignals())
    fly.update(dt, world(), defaultBrainSignals())
    expect(fly.typing).toBe(0.7)
  })
})
