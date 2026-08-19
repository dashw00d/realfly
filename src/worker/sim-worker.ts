/**
 * 1 kHz sim worker: owns LIFSim + SignalBuilder.
 * Messages: init, step, stimulate, consume. Posts BrainSignals + spike samples.
 */

import { isMainThread, parentPort } from 'node:worker_threads'
import type { BrainSignals } from '../shared/brain-signals'
import type {
  SimStepInput,
  SimStimulateInput,
  SimWorkerRequest,
  SimWorkerResponse,
} from '../shared/ipc'
import { LIFSim } from '../sim/lif-sim'
import { loadCircuit } from '../sim/load-circuit'
import { SignalBuilder } from '../sim/signal-builder'
import { SpikeBus, type SpikeEvent } from '../sim/spike-bus'

export type SimSessionOptions = {
  rng?: () => number
}

/**
 * In-process host used by the worker thread (and tests).
 * Do not construct LIFSim from Electron main — step() is 1 kHz.
 */
export class SimSession {
  private sim: LIFSim | null = null
  private readonly builder = new SignalBuilder()
  private readonly bus = new SpikeBus()
  private readonly rng: (() => number) | undefined

  constructor(opts?: SimSessionOptions) {
    this.rng = opts?.rng
  }

  get ready(): boolean {
    return this.sim != null
  }

  init(): { n: number; groups: Record<string, number> } {
    const circuit = loadCircuit()
    this.sim = new LIFSim(circuit, { spikeBus: this.bus, rng: this.rng })
    const sim = this.sim
    return {
      n: sim.n,
      groups: {
        gf: sim.gf.length,
        sens: sim.sens.length,
        loomLeft: sim.loomLeft.length,
        loomRight: sim.loomRight.length,
        dnaL: sim.dnaL.length,
        dnaR: sim.dnaR.length,
        mdn: sim.mdn.length,
        fwd: sim.fwd.length,
        groom: sim.groom.length,
        escw: sim.escw.length,
        ascend: sim.ascend.length,
      },
    }
  }

  step(input: SimStepInput): { signals: BrainSignals; spikes: SpikeEvent[]; simMs: number } {
    const sim = this.requireSim()
    sim.loomL = input.loomL
    sim.loomR = input.loomR
    sim.gaitDrive = input.gaitDrive
    sim.gaitPhase = input.gaitPhase
    sim.airPuff = input.airPuff
    sim.activityScale = input.activityScale
    sim.sensoryGate = input.sensoryGate
    sim.step(input.ms)
    const dt = input.ms / 1000
    const signals = this.builder.make(sim, dt)
    const spikes = this.bus.popAll()
    return { signals, spikes, simMs: sim.simMs }
  }

  stimulate(input: SimStimulateInput): void {
    const sim = this.requireSim()
    const indices = resolveIndices(sim, input)
    sim.stimulate(indices, input.strength, input.durationMs)
  }

  consume(): boolean {
    return this.requireSim().consumeGF()
  }

  private requireSim(): LIFSim {
    if (!this.sim) throw new Error('sim-worker: call init before step/stimulate/consume')
    return this.sim
  }
}

function resolveIndices(sim: LIFSim, input: SimStimulateInput): number[] {
  if (input.indices && input.indices.length > 0) return input.indices
  switch (input.group) {
    case 'gf':
      return sim.gf
    case 'sens':
      return sim.sens
    case 'groom':
      return sim.groom
    case 'fwd':
      return sim.fwd
    case 'mdn':
      return sim.mdn
    case 'dnaL':
      return sim.dnaL
    case 'dnaR':
      return sim.dnaR
    case 'escw':
      return sim.escw
    case 'loomLeft':
      return sim.loomLeft
    case 'loomRight':
      return sim.loomRight
    default:
      return []
  }
}

function reply(port: NonNullable<typeof parentPort>, msg: SimWorkerResponse): void {
  port.postMessage(msg)
}

function bind(port: NonNullable<typeof parentPort>): void {
  const session = new SimSession()
  port.on('message', (raw: SimWorkerRequest) => {
    const id = raw?.id ?? 0
    try {
      switch (raw.type) {
        case 'init': {
          const info = session.init()
          reply(port, { id, type: 'ready', n: info.n, groups: info.groups })
          break
        }
        case 'step': {
          const out = session.step(raw)
          reply(port, {
            id,
            type: 'step',
            signals: out.signals,
            spikes: out.spikes,
            simMs: out.simMs,
          })
          break
        }
        case 'stimulate': {
          session.stimulate(raw)
          reply(port, { id, type: 'ok' })
          break
        }
        case 'consume': {
          reply(port, { id, type: 'consume', gf: session.consume() })
          break
        }
        default: {
          reply(port, { id, type: 'error', message: `unknown message ${(raw as { type?: string }).type}` })
        }
      }
    } catch (err) {
      reply(port, { id, type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  })
}

if (!isMainThread && parentPort) {
  bind(parentPort)
}
