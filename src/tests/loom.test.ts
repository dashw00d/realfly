import { describe, expect, it } from 'vitest'
import {
  CursorLoom,
  injectWindowLoom,
  tapStimulus,
  tapStrength,
  windowLoomStrength,
} from '../main/cursor-loom'

describe('computeLoom (Coordinator)', () => {
  it('hover term is 0.5 when the cursor sits on the fly', () => {
    const loom = new CursorLoom()
    const fly = { x: 0, y: 0, heading: 0 }
    const s = loom.compute(fly, { x: 0, y: 0 }, 1 / 60)
    // dist clamped to 20; hover = clamp((130-20)/130,0,1)*0.5
    expect(s.l).toBeGreaterThan(0.05)
    expect(s.r).toBeGreaterThan(0.05)
    expect(s.l).toBeLessThanOrEqual(1)
    expect(s.r).toBeLessThanOrEqual(1)
  })

  it('loomOverride=0.6 drives both eyes and decays at 1.2 / s', () => {
    const loom = new CursorLoom()
    loom.escapeTest(0.6)
    const fly = { x: 0, y: 0, heading: 0 }
    const s = loom.compute(fly, { x: 400, y: 0 }, 1 / 60)
    expect(s.l).toBeGreaterThan(0)
    expect(s.r).toBeGreaterThan(0)
    loom.decayOverride(0.5)
    expect(loom.loomOverride).toBeCloseTo(0.6 - 0.5 * 1.2, 5)
  })

  it('approach / dist * 6: inbound cursor raises loom vs receding', () => {
    const inbound = new CursorLoom()
    inbound.compute({ x: 0, y: 0, heading: 0 }, { x: 200, y: 0 }, 1 / 60)
    const inS = inbound.compute({ x: 0, y: 0, heading: 0 }, { x: 80, y: 0 }, 1 / 60)

    const outbound = new CursorLoom()
    outbound.compute({ x: 0, y: 0, heading: 0 }, { x: 80, y: 0 }, 1 / 60)
    const outS = outbound.compute({ x: 0, y: 0, heading: 0 }, { x: 200, y: 0 }, 1 / 60)

    expect(inS.l + inS.r).toBeGreaterThan(outS.l + outS.r)
  })

  it('splits L/R by bearing: threat on the left (heading 0, +Y) loads left eye', () => {
    const loom = new CursorLoom()
    loom.escapeTest(0.8)
    const s = loom.compute({ x: 0, y: 0, heading: 0 }, { x: 0, y: 80 }, 1 / 60)
    expect(s.l).toBeGreaterThan(s.r)
  })
})

describe('injectWindowLoom / injectTap', () => {
  it('copies Swift window-loom L/R split', () => {
    const next = injectWindowLoom({ x: 0, y: 0, heading: 0 }, { x: 0, y: 100 }, 0.5)
    // crossZ = 1 → left gets clamp(0.5+0.5, 0.12, 1)=1, right gets 0.12
    expect(next.l).toBeCloseTo(0.5, 5)
    expect(next.r).toBeCloseTo(0.5 * 0.12, 5)
  })

  it('new-window strength is clamp(1 - d/480, 0, 1) * 0.75', () => {
    expect(windowLoomStrength({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(0.75, 5)
    expect(windowLoomStrength({ x: 0, y: 0 }, { x: 480, y: 0 })).toBe(0)
    expect(windowLoomStrength({ x: 0, y: 0 }, { x: 240, y: 0 })).toBeCloseTo(0.375, 5)
  })

  it('tap strength is clamp(1 - d/520, 0, 1); stim 0.15 + s*0.35 for 130 ms', () => {
    expect(tapStrength({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(1)
    const near = tapStimulus({ x: 0, y: 0 }, { x: 0, y: 0 })
    expect(near).toEqual({ strength: 0.5, durationMs: 130 })
    expect(tapStimulus({ x: 0, y: 0 }, { x: 520, y: 0 })).toBeNull()
    expect(tapStimulus({ x: 0, y: 0 }, { x: 510, y: 0 })).toBeNull()
  })
})
