import { describe, expect, it } from 'vitest'
import { createRng, TEST_SEED } from '../shared/rng'
import { LIFSim } from '../sim/lif-sim'
import { loadCircuit } from '../sim/load-circuit'

/** Port of vendor/desktop-fly/main.swift `runSimtest()`. Do not weaken the PASS predicate. */
describe('LIFSim --simtest predicate', () => {
  it(
    'PASS: GF silent at rest, fires on loom; locomotor drive fluctuates; stim works; siesta alive',
    () => {
      const circuit = loadCircuit()
      const sim = new LIFSim(circuit, { rng: createRng(TEST_SEED) })
      console.log(
        `circuit: ${sim.n} neurons | loom L/R: ${sim.loomLeft.length}/${sim.loomRight.length}` +
          ` | GF: ${sim.gf.length} | DNa L/R: ${sim.dnaL.length}/${sim.dnaR.length} | MDN: ${sim.mdn.length}` +
          ` | DNp09: ${sim.fwd.length} | DNg11: ${sim.groom.length} | escW: ${sim.escw.length}` +
          ` | ascend: ${sim.ascend.length} | sens: ${sim.sens.length}`,
      )

      let gfSpont = 0
      for (let i = 0; i < 40; i++) {
        sim.step(100)
        if (sim.consumeGF()) gfSpont++
      }
      const popHz = sim.totalSpikes / 4.0 / sim.n
      console.log(
        `spontaneous 4s: pop ${popHz.toFixed(2)} Hz/neuron, LC ${sim.rateLoom.toFixed(1)} Hz, ` +
          `DNa02 L/R ${sim.rateDNaL.toFixed(1)}/${sim.rateDNaR.toFixed(1)} Hz, ` +
          `MDN ${sim.rateMDN.toFixed(1)} Hz, GF spikes: ${gfSpont}`,
      )

      let gfLatencyMs = -1
      let gfLoom = 0
      for (let ms = 0; ms < 400; ms++) {
        sim.loomL = 1.0
        sim.loomR = 0.5
        sim.step(1)
        if (sim.consumeGF()) {
          gfLoom++
          if (gfLatencyMs < 0) gfLatencyMs = ms
        }
      }
      sim.loomL = 0
      sim.loomR = 0
      console.log(
        `abrupt loom 0.4s: LC rate ${sim.rateLoom.toFixed(1)} Hz, GF spikes ${gfLoom}, first at ${gfLatencyMs} ms`,
      )

      let walkOn = 0
      let groomOn = 0
      let samples = 0
      let fwdMin = Number.POSITIVE_INFINITY
      let fwdMax = 0
      for (let ms = 0; ms < 20_000; ms++) {
        sim.gaitDrive = 0.5
        sim.gaitPhase = (ms % 125) / 125
        sim.step(1)
        if (ms % 10 === 0) {
          samples++
          if (sim.rateFwd / 10 > 0.22) walkOn++
          if (sim.rateGroom / 8 > 0.5) groomOn++
          fwdMin = Math.min(fwdMin, sim.rateFwd)
          fwdMax = Math.max(fwdMax, sim.rateFwd)
        }
      }
      console.log(
        `behavior 20s: walk-drive on ${((100 * walkOn) / samples).toFixed(0)}%, ` +
          `groom-drive on ${((100 * groomOn) / samples).toFixed(0)}%, ` +
          `DNp09 ${fwdMin.toFixed(1)}-${fwdMax.toFixed(1)} Hz, pop ${sim.ratePop.toFixed(1)} Hz`,
      )

      // Never scale baselines linearly — compression toward 1 is already in activityScale.
      // 1-(1-0.55)*0.35 = 0.8425; Swift prints this as "scale 0.84".
      sim.activityScale = 1 - (1 - 0.55) * 0.35
      let siestaWalkOn = 0
      let siestaSamples = 0
      for (let ms = 0; ms < 15_000; ms++) {
        sim.step(1)
        if (ms % 10 === 0) {
          siestaSamples++
          if (sim.rateFwd / 10 > 0.22) siestaWalkOn++
        }
      }
      sim.activityScale = 1
      const siestaPct = (100 * siestaWalkOn) / siestaSamples
      console.log(`siesta 15s (scale 0.84): walk-drive on ${siestaPct.toFixed(0)}%`)

      let gfPuff = 0
      for (let i = 0; i < 1000; i++) {
        sim.airPuff = 1.0
        sim.step(1)
        if (sim.consumeGF()) gfPuff++
      }
      sim.airPuff = 0
      console.log(`air puff 1s: GF spikes ${gfPuff}`)

      for (let i = 0; i < 500; i++) {
        sim.step(1)
        sim.consumeGF()
      }
      const diff0 = sim.rateDNaL - sim.rateDNaR
      for (let i = 0; i < 1000; i++) {
        sim.loomL = 0.3
        sim.loomR = 0
        sim.step(1)
        sim.consumeGF()
      }
      const diff1 = sim.rateDNaL - sim.rateDNaR
      sim.loomL = 0
      console.log(
        `left-eye loom: DNa L-R rate diff ${diff0 >= 0 ? '+' : ''}${diff0.toFixed(1)} -> ` +
          `${diff1 >= 0 ? '+' : ''}${diff1.toFixed(1)} Hz, LC ${sim.rateLoom.toFixed(1)} Hz`,
      )

      sim.stimulate(sim.gf, 0.5, 40)
      sim.step(60)
      const gfStim = sim.consumeGF()
      sim.stimulate(sim.groom, 0.25, 400)
      sim.step(400)
      const groomStim = sim.rateGroom
      sim.consumeGF()
      console.log(
        `click probes: GF cluster -> spike ${gfStim ? 'yes' : 'NO'}, ` +
          `DNg11 cluster -> groom rate ${groomStim.toFixed(0)} Hz`,
      )

      const pass = gfSpont === 0 && gfLoom > 0 && walkOn > 0 && gfStim && siestaPct > 3
      console.log(
        pass
          ? 'PASS: GF silent at rest, fires on loom; locomotor drive fluctuates; stim works; siesta alive'
          : 'FAIL: tune weights/noise',
      )

      expect(gfSpont).toBe(0)
      expect(gfLoom).toBeGreaterThan(0)
      expect(gfLatencyMs).toBeGreaterThanOrEqual(0)
      expect(gfLatencyMs).toBeLessThan(50)
      expect(walkOn).toBeGreaterThan(0)
      expect(siestaPct).toBeGreaterThan(3)
      expect(gfStim).toBe(true)
    },
    120_000,
  )
})
