/**
 * Main-process client for src/worker/sim-worker.ts (worker_threads).
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { BrainSignals } from '../shared/brain-signals'
import type {
  SimStepInput,
  SimStimulateInput,
  SimWorkerRequest,
  SimWorkerResponse,
} from '../shared/ipc'
import type { SpikeEvent } from '../sim/spike-bus'

export type SimStepResult = {
  signals: BrainSignals
  spikes: SpikeEvent[]
  simMs: number
}

export type SimClient = {
  ready: boolean
  init(): Promise<boolean>
  step(input: SimStepInput): Promise<SimStepResult | null>
  stimulate(input: SimStimulateInput): Promise<void>
  consume(): Promise<boolean>
  dispose(): void
}

const here = dirname(fileURLToPath(import.meta.url))

function workerPath(): string {
  return join(here, '../worker/sim-worker.js')
}

export function createSimClient(): SimClient {
  const path = workerPath()
  if (!existsSync(path)) {
    console.warn(`DesktopFly: sim worker missing at ${path} — brain offline`)
    return deadClient()
  }

  let seq = 1
  const pending = new Map<number, (msg: SimWorkerResponse) => void>()
  let ready = false
  let worker: Worker
  try {
    worker = new Worker(path)
  } catch (err) {
    console.warn('DesktopFly: failed to spawn sim worker', err)
    return deadClient()
  }

  worker.on('message', (msg: SimWorkerResponse) => {
    const fn = pending.get(msg.id)
    if (fn) {
      pending.delete(msg.id)
      fn(msg)
    }
  })
  worker.on('error', (err) => {
    console.warn('DesktopFly: sim worker error', err)
    for (const fn of pending.values()) {
      fn({ id: 0, type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    pending.clear()
    ready = false
  })

  const send = (body: Omit<SimWorkerRequest, 'id'>): Promise<SimWorkerResponse> => {
    const id = seq++
    return new Promise((resolve) => {
      pending.set(id, resolve)
      worker.postMessage({ id, ...body } as SimWorkerRequest)
    })
  }

  return {
    get ready() {
      return ready
    },
    async init() {
      const msg = await send({ type: 'init' })
      if (msg.type === 'ready') {
        ready = true
        return true
      }
      console.warn('DesktopFly: sim init failed', msg.type === 'error' ? msg.message : msg.type)
      ready = false
      return false
    },
    async step(input) {
      if (!ready) return null
      const msg = await send({ type: 'step', ...input })
      if (msg.type !== 'step') {
        if (msg.type === 'error') console.warn('DesktopFly: sim step', msg.message)
        return null
      }
      return { signals: msg.signals, spikes: msg.spikes, simMs: msg.simMs }
    },
    async stimulate(input) {
      if (!ready) return
      const msg = await send({ type: 'stimulate', ...input })
      if (msg.type === 'error') console.warn('DesktopFly: stimulate', msg.message)
    },
    async consume() {
      if (!ready) return false
      const msg = await send({ type: 'consume' })
      return msg.type === 'consume' ? msg.gf : false
    },
    dispose() {
      ready = false
      pending.clear()
      void worker.terminate()
    },
  }
}

function deadClient(): SimClient {
  return {
    ready: false,
    async init() {
      return false
    },
    async step() {
      return null
    },
    async stimulate() {},
    async consume() {
      return false
    },
    dispose() {},
  }
}
