import { contextBridge, ipcRenderer } from 'electron'
import type { BrainHudSnapshot } from '../shared/ipc'
import type { SpikeEvent } from '../sim/spike-bus'

export type BrainAPI = {
  onHud(cb: (hud: BrainHudSnapshot) => void): () => void
  onSpikes(cb: (spikes: SpikeEvent[]) => void): () => void
  stimulate(indices: number[], name?: string): Promise<void>
}

function listen<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (...args: unknown[]): void => {
    cb(args[1] as T)
  }
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: BrainAPI = {
  onHud: (cb) => listen<BrainHudSnapshot>('hud', cb),
  onSpikes: (cb) => listen<SpikeEvent[]>('spikes', cb),
  stimulate: (indices, name) =>
    ipcRenderer.invoke('stimulate', { indices, name, strength: 0.25, durationMs: 400 }) as Promise<void>,
}

contextBridge.exposeInMainWorld('desktopflyBrain', api)
