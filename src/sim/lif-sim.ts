/**
 * CSR leaky-integrate-and-fire network. Port of vendor/desktop-fly/Sim.swift
 * `LIFSim`. Constants live in docs/PORT_CONTRACT.md — do not retune.
 */

import type { CircuitFile } from './load-circuit'
import type { SpikeBus, SpikeEvent } from './spike-bus'

export type { CircuitFile }

export type LIFSimOptions = {
  spikeBus?: SpikeBus
  /** Returns U[0,1). Tests inject a seeded rng; production may use Math.random. */
  rng?: () => number
}

type Stim = { idx: number[]; strength: number; durationMs: number; untilMs: number }

const DECAY = 0.9512
const THRESHOLD = 1.0
const REFRACTORY_MS = 2
const WEIGHT_SCALE = 0.0008
const P_NOISE = 0.0022
const NOISE_KICK = 0.42
const LOOM_GAIN = 0.30
const RATE_ALPHA = 1 / 120
const INH_DELAY_MS = 4
const INH_QUEUE_DEPTH = 5
const GAP_JUNCTION_BOOST = 6
const V_FLOOR = -2

export class LIFSim {
  readonly n: number
  readonly roles: string[]
  readonly types: string[]
  readonly positions: [number, number, number][]

  private readonly v: Float64Array
  private readonly refr: Float64Array
  private readonly baseline: Float64Array

  private readonly rowStart: Int32Array
  private readonly colIdx: Int32Array
  private readonly w: Float64Array

  loomLeft: number[] = []
  loomRight: number[] = []
  gf: number[] = []
  dnaL: number[] = []
  dnaR: number[] = []
  mdn: number[] = []
  fwd: number[] = []
  groom: number[] = []
  escw: number[] = []
  ascend: number[] = []
  sens: number[] = []
  private readonly ascendPhase: Float64Array

  loomL = 0
  loomR = 0
  gaitDrive = 0
  gaitPhase = 0
  airPuff = 0
  activityScale = 1
  sensoryGate = 1

  rateLoom = 0
  rateDNaL = 0
  rateDNaR = 0
  rateMDN = 0
  rateFwd = 0
  rateGroom = 0
  rateEscW = 0
  ratePop = 0
  private gfLatch = false
  simMs = 0
  totalSpikes = 0

  private readonly inhQueue: Float64Array[]
  private qHead = 0

  private burstUntil = 0
  private burstNext = 12_000

  readonly spikeBus: SpikeBus | undefined
  private readonly rng: () => number

  private pendingStims: Stim[] = []
  private activeStims: Stim[] = []

  constructor(circuit: CircuitFile, opts?: LIFSimOptions) {
    this.spikeBus = opts?.spikeBus
    this.rng = opts?.rng ?? Math.random

    this.n = circuit.neurons.length
    this.roles = circuit.neurons.map((nr) => nr.role)
    this.types = circuit.neurons.map((nr) => nr.type)
    this.positions = circuit.neurons.map((nr) => {
      const p = nr.pos
      return p.length === 3 ? [p[0]!, p[1]!, p[2]!] : [0, 0, 0]
    })

    this.v = new Float64Array(this.n)
    this.refr = new Float64Array(this.n)
    this.inhQueue = Array.from({ length: INH_QUEUE_DEPTH }, () => new Float64Array(this.n))

    for (let i = 0; i < this.n; i++) {
      const nr = circuit.neurons[i]!
      switch (nr.role) {
        case 'lc4':
        case 'lplc2':
          if (nr.side === 'left') this.loomLeft.push(i)
          else this.loomRight.push(i)
          break
        case 'gf':
          this.gf.push(i)
          break
        case 'dna01':
        case 'dna02':
          if (nr.side === 'left') this.dnaL.push(i)
          else this.dnaR.push(i)
          break
        case 'mdn':
          this.mdn.push(i)
          break
        case 'dnp09':
          this.fwd.push(i)
          break
        case 'dng11':
          this.groom.push(i)
          break
        case 'escw':
          this.escw.push(i)
          break
        case 'other':
          if (nr.type === 'ascending') this.ascend.push(i)
          else if (nr.type === 'sensory') this.sens.push(i)
          break
        default:
          break
      }
    }

    this.ascendPhase = new Float64Array(this.ascend.length)
    for (let k = 0; k < this.ascend.length; k++) {
      this.ascendPhase[k] = this.rng() * (2 * Math.PI)
    }

    const base = new Float64Array(this.n)
    for (let i = 0; i < this.n; i++) {
      switch (circuit.neurons[i]!.role) {
        case 'other':
          base[i] = 0.01 + this.rng() * (0.07 - 0.01)
          break
        case 'lc4':
        case 'lplc2':
          base[i] = 0.004
          break
        case 'dna01':
        case 'dna02':
        case 'mdn':
        case 'dng11':
        case 'escw':
          base[i] = 0.036
          break
        case 'dnp09':
          base[i] = 0.038
          break
        default:
          base[i] = 0.002
          break
      }
    }
    this.baseline = base

    const counts = new Int32Array(this.n)
    for (const e of circuit.edges) counts[e[0]!]++
    this.rowStart = new Int32Array(this.n + 1)
    for (let i = 0; i < this.n; i++) this.rowStart[i + 1] = this.rowStart[i]! + counts[i]!
    this.colIdx = new Int32Array(circuit.edges.length)
    this.w = new Float64Array(circuit.edges.length)
    const fill = Int32Array.from(this.rowStart)
    for (const e of circuit.edges) {
      const pre = e[0]!
      const post = e[1]!
      let weight = e[2]! * WEIGHT_SCALE
      const electrical =
        this.roles[pre] === 'lc4' ||
        this.roles[pre] === 'lplc2' ||
        (this.roles[pre] === 'other' && this.types[pre] === 'sensory')
      if (electrical && this.roles[post] === 'gf') weight *= GAP_JUNCTION_BOOST
      const slot = fill[pre]!
      this.colIdx[slot] = post
      this.w[slot] = weight
      fill[pre] = slot + 1
    }
  }

  stimulate(indices: number[], strength: number, durationMs: number): void {
    if (indices.length === 0) return
    this.pendingStims.push({ idx: indices, strength, durationMs, untilMs: 0 })
    if (this.pendingStims.length > 8) this.pendingStims.shift()
  }

  consumeGF(): boolean {
    const s = this.gfLatch
    this.gfLatch = false
    return s
  }

  private randIntInclusive(lo: number, hi: number): number {
    return lo + Math.floor(this.rng() * (hi - lo + 1))
  }

  step(ms: number): void {
    if (ms <= 0) return

    for (const p of this.pendingStims) {
      p.untilMs = this.simMs + p.durationMs
      this.activeStims.push(p)
    }
    this.pendingStims = []
    this.activeStims = this.activeStims.filter((s) => this.simMs < s.untilMs)

    const spikedNow: SpikeEvent[] = []
    const n = this.n
    const v = this.v
    const refr = this.refr
    const baseline = this.baseline
    const roles = this.roles
    const rng = this.rng
    const nLoom = Math.max(1, this.loomLeft.length + this.loomRight.length)
    const nDnaL = Math.max(1, this.dnaL.length)
    const nDnaR = Math.max(1, this.dnaR.length)
    const nMdn = Math.max(1, this.mdn.length)
    const nFwd = Math.max(1, this.fwd.length)
    const nGroom = Math.max(1, this.groom.length)
    const nEscw = Math.max(1, this.escw.length)
    const dnaLSet = this.dnaL

    for (let t = 0; t < ms; t++) {
      this.simMs += 1
      if (this.simMs >= this.burstNext) {
        this.burstUntil = this.simMs + 400
        this.burstNext = this.simMs + this.randIntInclusive(15_000, 40_000)
      }
      const p = (this.simMs < this.burstUntil ? P_NOISE * 6 : P_NOISE) * this.activityScale

      for (let i = 0; i < n; i++) {
        if (refr[i]! > 0) {
          refr[i]!--
          v[i]! *= DECAY
          continue
        }
        let vi = v[i]! * DECAY + baseline[i]! * this.activityScale
        if (rng() < p) vi += NOISE_KICK
        v[i] = vi
      }

      if (this.loomL > 0.001) {
        const add = this.loomL * LOOM_GAIN * this.sensoryGate
        for (const i of this.loomLeft) v[i]! += add
      }
      if (this.loomR > 0.001) {
        const add = this.loomR * LOOM_GAIN * this.sensoryGate
        for (const i of this.loomRight) v[i]! += add
      }
      if (this.gaitDrive > 0.001) {
        const ph = this.gaitPhase * 2 * Math.PI
        const gd = this.gaitDrive * 0.09
        for (let k = 0; k < this.ascend.length; k++) {
          const i = this.ascend[k]!
          v[i]! += gd * (0.5 + 0.5 * Math.sin(ph + this.ascendPhase[k]!))
        }
      }
      if (this.airPuff > 0.001) {
        const add = this.airPuff * 0.12 * this.sensoryGate
        for (const i of this.sens) v[i]! += add
      }
      for (const s of this.activeStims) {
        if (this.simMs < s.untilMs) {
          for (const i of s.idx) v[i]! += s.strength
        }
      }

      const q = this.inhQueue[this.qHead]!
      for (let j = 0; j < n; j++) {
        if (q[j] !== 0) {
          v[j] = Math.max(V_FLOOR, v[j]! + q[j]!)
          q[j] = 0
        }
      }

      const spiked: number[] = []
      for (let i = 0; i < n; i++) {
        if (refr[i]! <= 0 && v[i]! >= THRESHOLD) {
          v[i] = 0
          refr[i] = REFRACTORY_MS
          spiked.push(i)
        }
      }
      this.totalSpikes += spiked.length

      const inhSlot = (this.qHead + INH_DELAY_MS) % INH_QUEUE_DEPTH
      const inh = this.inhQueue[inhSlot]!
      const rowStart = this.rowStart
      const colIdx = this.colIdx
      const w = this.w
      for (const i of spiked) {
        const a = rowStart[i]!
        const b = rowStart[i + 1]!
        for (let k = a; k < b; k++) {
          const j = colIdx[k]!
          const wk = w[k]!
          if (wk >= 0) v[j] = Math.max(V_FLOOR, v[j]! + wk)
          else inh[j]! += wk
        }
      }
      this.qHead = (this.qHead + 1) % INH_QUEUE_DEPTH

      let cLoom = 0
      let cDL = 0
      let cDR = 0
      let cM = 0
      let cF = 0
      let cG = 0
      let cW = 0
      for (const i of spiked) {
        switch (roles[i]) {
          case 'lc4':
          case 'lplc2':
            cLoom++
            break
          case 'dna01':
          case 'dna02':
            if (dnaLSet.includes(i)) cDL++
            else cDR++
            break
          case 'mdn':
            cM++
            break
          case 'dnp09':
            cF++
            break
          case 'dng11':
            cG++
            break
          case 'escw':
            cW++
            break
          case 'gf':
            this.gfLatch = true
            break
          default:
            break
        }
      }
      this.rateLoom += (cLoom * 1000 / nLoom - this.rateLoom) * RATE_ALPHA
      this.rateDNaL += (cDL * 1000 / nDnaL - this.rateDNaL) * RATE_ALPHA
      this.rateDNaR += (cDR * 1000 / nDnaR - this.rateDNaR) * RATE_ALPHA
      this.rateMDN += (cM * 1000 / nMdn - this.rateMDN) * RATE_ALPHA
      this.rateFwd += (cF * 1000 / nFwd - this.rateFwd) * RATE_ALPHA
      this.rateGroom += (cG * 1000 / nGroom - this.rateGroom) * RATE_ALPHA
      this.rateEscW += (cW * 1000 / nEscw - this.rateEscW) * RATE_ALPHA
      this.ratePop += (spiked.length * 1000 / Math.max(1, n) - this.ratePop) * RATE_ALPHA

      if (this.spikeBus !== undefined) {
        const stride = Math.max(1, Math.floor(spiked.length / 12))
        for (let i = 0; i < spiked.length; i += stride) {
          const idx = spiked[i]!
          spikedNow.push({ neuron: idx, isGF: roles[idx] === 'gf' })
        }
      }
    }
    this.spikeBus?.push(spikedNow)
  }
}
