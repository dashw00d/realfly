import { describe, expect, it } from 'vitest'
import { createRng, TEST_SEED } from '../shared/rng'
import { SimSession } from '../worker/sim-worker'

const quiet = {
  loomL: 0,
  loomR: 0,
  gaitDrive: 0,
  gaitPhase: 0,
  airPuff: 0,
  activityScale: 1,
  sensoryGate: 1,
}

describe('SimSession worker protocol', () => {
  it('init / step / stimulate / consume match the Coordinator GF probe', () => {
    const host = new SimSession({ rng: createRng(TEST_SEED) })
    const info = host.init()
    expect(info.n).toBeGreaterThan(0)
    expect(info.groups.gf).toBeGreaterThan(0)

    host.step({ ms: 400, ...quiet })
    host.consume()
    host.stimulate({ group: 'gf', strength: 0.5, durationMs: 40 })
    const out = host.step({ ms: 60, ...quiet })
    expect(out.signals.escape).toBe(true)
    expect(host.consume()).toBe(false)
  })
})
