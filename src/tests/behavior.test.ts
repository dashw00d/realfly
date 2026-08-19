/**
 * Port of vendor/desktop-fly/main.swift `runBehaviorTest()`.
 * 7 stim scenarios (SignalBuilder + real LIFSim) + 10 bodyChecks.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { FLY_SCALE, Fly, type FlyState } from '../creature/fly'
import { defaultBrainSignals, type BrainSignals } from '../shared/brain-signals'
import type { World } from '../shared/creature'
import { circadianActivity } from '../shared/circadian'
import { createRng, TEST_SEED } from '../shared/rng'
import type { Ledge } from '../shared/types'
import { LIFSim } from '../sim/lif-sim'
import { loadCircuit, type CircuitFile } from '../sim/load-circuit'
import { SignalBuilder } from '../sim/signal-builder'

const BOUNDS = { width: 1512, height: 982 }
const dt = 1 / 60

function world(ledges: Ledge[] = []): World {
  return { bounds: BOUNDS, mouse: null, ledges }
}

function walkSignals(overrides: Partial<BrainSignals> = {}): BrainSignals {
  return { ...defaultBrainSignals(), walkDrive: 0.6, ...overrides }
}

/** Read state without TS narrowing from prior assignments in the same function. */
function stateOf(fly: Fly): FlyState {
  return fly.state
}

describe('Fly --behaviortest', () => {
  let circuit: CircuitFile

  beforeAll(() => {
    circuit = loadCircuit()
  })

  function scenario(
    name: string,
    stim: (sim: LIFSim) => void,
    hold: number,
    check: (fly: Fly) => boolean,
    describeFly: (fly: Fly) => string,
    setup?: (fly: Fly) => void,
  ): void {
    it(name, () => {
      const sim = new LIFSim(circuit, { rng: createRng(TEST_SEED) })
      const builder = new SignalBuilder()
      const fly = new Fly({ x: 0, y: 0 })
      fly.state = 'idle'
      fly.speed = 0
      setup?.(fly)
      sim.step(400)
      sim.consumeGF()
      stim(sim)
      let passed = false
      let frames = Math.trunc(hold / dt)
      const w = world(fly.terrain)
      while (frames > 0) {
        frames -= 1
        sim.step(Math.round(dt * 1000))
        const s = builder.make(sim, dt)
        fly.update(dt, w, s)
        if (check(fly)) {
          passed = true
          break
        }
      }
      const detail = describeFly(fly)
      console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}: ${detail}`)
      expect(passed, `${name}: ${detail}`).toBe(true)
    })
  }

  scenario(
    'GF stim -> escape flight',
    (sim) => sim.stimulate(sim.gf, 0.5, 40),
    0.5,
    (fly) => fly.state === 'flying',
    (fly) => `state=${fly.state}`,
  )

  scenario(
    'DNg11 stim -> grooming',
    (sim) => sim.stimulate(sim.groom, 0.25, 600),
    1.5,
    (fly) => fly.state === 'grooming',
    (fly) => `state=${fly.state}`,
  )

  scenario(
    'DNp09 stim -> walks, speed rises (capped)',
    (sim) => sim.stimulate(sim.fwd, 0.25, 1200),
    1.5,
    (fly) => fly.state === 'walking' && fly.speed > 40 && fly.speed < 100,
    (fly) => `state=${fly.state} speed=${Math.trunc(fly.speed)}`,
  )

  scenario(
    'MDN stim (from idle) -> backward walk',
    (sim) => sim.stimulate(sim.mdn, 0.3, 600),
    1.2,
    (fly) => fly.backwardTimer > 0,
    (fly) => `backwardTimer=${fly.backwardTimer.toFixed(2)}`,
  )

  scenario(
    'DNa-left stim -> left (CCW) turn while walking',
    (sim) => sim.stimulate(sim.dnaL, 0.3, 900),
    1.4,
    (fly) => fly.heading - 0 > 0.25,
    (fly) => `heading change ${fly.heading - 0 >= 0 ? '+' : ''}${fly.heading.toFixed(2)} rad`,
    (fly) => {
      fly.state = 'walking'
      fly.speed = 30
      fly.heading = 0
    },
  )

  scenario(
    'moderate loom -> fear response (dart or escape)',
    (sim) => {
      sim.loomL = 0.45
      sim.loomR = 0.45
    },
    1.0,
    (fly) => (fly.state === 'walking' && fly.speed > 100) || fly.state === 'flying',
    (fly) => `state=${fly.state} speed=${Math.trunc(fly.speed)}`,
  )

  scenario(
    'tap near fly -> startle escape via sensory pathway',
    (sim) => sim.stimulate(sim.sens, 0.45, 150),
    0.8,
    (fly) => fly.state === 'flying',
    (fly) => `state=${fly.state}`,
  )

  it('ledge attach + follow window edge', () => {
    // Seeded like stim scenarios: attach is 0.9*dt/frame and heading wander can
    // walk out of the 20 pt band. Assertions match upstream; RNG is pinned for CI.
    const fly = new Fly({ x: 0, y: -55 }, 'fly-1', createRng(TEST_SEED))
    fly.state = 'walking'
    fly.speed = 30
    fly.heading = 0
    fly.terrain = [{ y: -40, x0: -300, x1: 300, id: 1 }]
    const s = walkSignals()
    const w = world(fly.terrain)
    let ok = false
    let detail = ''
    for (let i = 0; i < 240; i++) {
      fly.update(dt, w, s)
      if (fly.ledge != null && Math.abs(fly.pos.y + 40) < 8) {
        ok = true
        detail = `attached, y=${Math.trunc(fly.pos.y)}`
        break
      }
    }
    if (!ok) detail = `state=${fly.state} y=${Math.trunc(fly.pos.y)} ledge=${fly.ledge != null}`
    console.log(`${ok ? 'PASS' : 'FAIL'}  ledge attach + follow window edge: ${detail}`)
    expect(ok, detail).toBe(true)
  })

  it('window closes underfoot -> takeoff', () => {
    const fly = new Fly({ x: 0, y: -40 })
    fly.state = 'walking'
    fly.speed = 25
    fly.heading = 0
    fly.terrain = [{ y: -40, x0: -300, x1: 300, id: 1 }]
    fly.ledge = fly.terrain[0]!
    fly.terrain = []
    const s = walkSignals()
    const w = world([])
    let ok = false
    for (let i = 0; i < 60; i++) {
      fly.update(dt, w, s)
      if (stateOf(fly) === 'flying') {
        ok = true
        break
      }
    }
    const detail = ok ? 'took off' : `state=${stateOf(fly)}`
    console.log(`${ok ? 'PASS' : 'FAIL'}  window closes underfoot -> takeoff: ${detail}`)
    expect(ok, detail).toBe(true)
  })

  it('sleep signal -> sleeping; wake -> grooming', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'idle'
    const s = defaultBrainSignals()
    s.sleep = true
    const w = world()
    for (let i = 0; i < 60; i++) fly.update(dt, w, s)
    if (stateOf(fly) !== 'sleeping') {
      console.log(`FAIL  sleep signal -> sleeping; wake -> grooming: no sleep: ${stateOf(fly)}`)
      expect(stateOf(fly), `no sleep: ${stateOf(fly)}`).toBe('sleeping')
      return
    }
    s.sleep = false
    fly.update(dt, w, s)
    const ok = stateOf(fly) === 'grooming'
    const detail = `woke to ${stateOf(fly)}`
    console.log(`${ok ? 'PASS' : 'FAIL'}  sleep signal -> sleeping; wake -> grooming: ${detail}`)
    expect(ok, detail).toBe(true)
  })

  it('thermal tempo scales walking speed', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'walking'
    fly.speed = 20
    fly.heading = 0
    const w = world()
    const cool = walkSignals({ tempo: 1.0 })
    for (let i = 0; i < 120; i++) fly.update(dt, w, cool)
    const coolSpeed = fly.speed
    const hot = walkSignals({ tempo: 1.5 })
    for (let i = 0; i < 120; i++) fly.update(dt, w, hot)
    const hotSpeed = fly.speed
    const ok = stateOf(fly) === 'walking' && hotSpeed > coolSpeed + 10
    const detail = `cool ${Math.trunc(coolSpeed)} -> hot ${Math.trunc(hotSpeed)} pt/s`
    console.log(`${ok ? 'PASS' : 'FAIL'}  thermal tempo scales walking speed: ${detail}`)
    expect(ok, detail).toBe(true)
  })

  it('flight: altitude drives scale; escape flies higher than casual', () => {
    function flight(escape: boolean, effort: number | null): { alt: number; scale: number } {
      const fly = new Fly({ x: 0, y: 0 })
      fly.state = 'idle'
      fly.startFlight(BOUNDS, null, escape, effort)
      let maxAlt = 0
      let maxScale = 0
      let frames = 0
      const w = world()
      const s = defaultBrainSignals()
      while (stateOf(fly) === 'flying' && frames < 400) {
        frames += 1
        fly.update(dt, w, s)
        maxAlt = Math.max(maxAlt, fly.alt)
        maxScale = Math.max(maxScale, fly.node.scale.x)
      }
      return { alt: maxAlt, scale: maxScale }
    }
    const esc = flight(true, null)
    const casual = flight(false, 0.45)
    const ok =
      esc.alt > casual.alt + 0.15 &&
      esc.scale > FLY_SCALE * 1.5 &&
      Math.abs(esc.scale - FLY_SCALE * (1 + 0.8 * esc.alt)) < 0.15
    const detail =
      `escape alt ${esc.alt.toFixed(2)} scale ${esc.scale.toFixed(2)}` +
      ` | casual alt ${casual.alt.toFixed(2)} scale ${casual.scale.toFixed(2)}`
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  flight: altitude drives scale; escape flies higher than casual: ${detail}`,
    )
    expect(ok, detail).toBe(true)
  })

  it('flight: wings actually beat', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'idle'
    fly.startFlight(BOUNDS, null, false, 0.8)
    let lo = Number.POSITIVE_INFINITY
    let hi = Number.NEGATIVE_INFINITY
    const w = world()
    const s = defaultBrainSignals()
    for (let i = 0; i < 30 && stateOf(fly) === 'flying'; i++) {
      fly.update(dt, w, s)
      const z = fly.model.foldedWings.childNodes[0]!.eulerAngles.z
      lo = Math.min(lo, z)
      hi = Math.max(hi, z)
    }
    const ok = hi - lo > 0.25
    const detail = `wing sweep ${(hi - lo).toFixed(2)} rad over 0.5 s`
    console.log(`${ok ? 'PASS' : 'FAIL'}  flight: wings actually beat: ${detail}`)
    expect(ok, detail).toBe(true)
  })

  it('escape-DN activity mid-flight raises wing-beat effort', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'idle'
    fly.startFlight(BOUNDS, null, false, 0.5)
    const w = world()
    const calm = defaultBrainSignals()
    for (let i = 0; i < 12; i++) fly.update(dt, w, calm)
    const calmEffort = fly.effortCurrent
    const hot = defaultBrainSignals()
    hot.wingDrive = 1.0
    hot.arousal = 0.6
    for (let i = 0; i < 12 && stateOf(fly) === 'flying'; i++) fly.update(dt, w, hot)
    const hotEffort = fly.effortCurrent
    const ok = stateOf(fly) === 'flying' && hotEffort > calmEffort + 0.2
    const detail = `effort ${calmEffort.toFixed(2)} -> ${hotEffort.toFixed(2)}`
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  escape-DN activity mid-flight raises wing-beat effort: ${detail}`,
    )
    expect(ok, detail).toBe(true)
  })

  it('threat while grounded raises the wings (no takeoff)', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'walking'
    fly.speed = 20
    fly.dartCooldown = 99
    const threat = defaultBrainSignals()
    threat.wingDrive = 0.9
    threat.walkDrive = 0.4
    const w = world()
    for (let i = 0; i < 40; i++) fly.update(dt, w, threat)
    const x = fly.model.foldedWings.childNodes[0]!.eulerAngles.x
    const ok = stateOf(fly) !== 'flying' && fly.wingRaise > 0.6 && x < -0.2
    const detail = `raise ${fly.wingRaise.toFixed(2)}, wing tilt ${x.toFixed(2)} rad`
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  threat while grounded raises the wings (no takeoff): ${detail}`,
    )
    expect(ok, detail).toBe(true)
  })

  it('landing is smooth: no scale/height snap at touchdown', () => {
    const fly = new Fly({ x: 0, y: 0 })
    fly.state = 'idle'
    fly.startFlight(BOUNDS, null, true)
    let prevScale = fly.node.scale.x
    let prevZ = fly.node.position.z
    let maxDS = 0
    let maxDZ = 0
    let post = 20
    let frames = 0
    let landed = false
    const w = world()
    const s = defaultBrainSignals()
    while (post > 0 && frames < 600) {
      frames += 1
      fly.update(dt, w, s)
      maxDS = Math.max(maxDS, Math.abs(fly.node.scale.x - prevScale))
      maxDZ = Math.max(maxDZ, Math.abs(fly.node.position.z - prevZ))
      prevScale = fly.node.scale.x
      prevZ = fly.node.position.z
      if (stateOf(fly) !== 'flying') {
        landed = true
        post -= 1
      }
    }
    const ok = landed && maxDS < 0.2 && maxDZ < 25
    const detail = `landed=${landed ? 'yes' : 'NO'}, max per-frame Δscale ${maxDS.toFixed(2)}, Δz ${maxDZ.toFixed(1)}`
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  landing is smooth: no scale/height snap at touchdown: ${detail}`,
    )
    expect(ok, detail).toBe(true)
  })

  it('circadian curve: siesta + night dips, dawn/dusk peaks', () => {
    const night = circadianActivity(3)
    const dawn = circadianActivity(9)
    const siesta = circadianActivity(14)
    const dusk = circadianActivity(18)
    const ok = night < 0.4 && dawn > 0.9 && siesta < 0.7 && siesta > 0.3 && dusk > 0.9
    const detail = `3h ${night.toFixed(2)}, 9h ${dawn.toFixed(2)}, 14h ${siesta.toFixed(2)}, 18h ${dusk.toFixed(2)}`
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  circadian curve: siesta + night dips, dawn/dusk peaks: ${detail}`,
    )
    expect(ok, detail).toBe(true)
  })
})
