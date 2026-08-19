import { contextBridge, ipcRenderer } from 'electron'
import type { BrainHudSnapshot, DisplaySnapshot, FlyPose, WorldFrame } from '../shared/ipc'

export type OverlayAPI = {
  onHud(cb: (hud: BrainHudSnapshot) => void): () => void
  onWorld(cb: (frame: WorldFrame) => void): () => void
  onDisplay(cb: (display: DisplaySnapshot) => void): () => void
  onActiveDisplay(cb: (displayId: number) => void): () => void
  onPause(cb: (paused: boolean) => void): () => void
  onMoveToNextDisplay(cb: (displayId: number) => void): () => void
  sendFlyPoses(poses: FlyPose[]): void
  pause(next?: boolean): Promise<boolean>
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

const api: OverlayAPI = {
  onHud: (cb) => listen<BrainHudSnapshot>('hud', cb),
  onWorld: (cb) => listen<WorldFrame>('world', cb),
  onDisplay: (cb) => listen<DisplaySnapshot>('display', cb),
  onActiveDisplay: (cb) => listen<number>('activeDisplay', cb),
  onPause: (cb) => listen<boolean>('pause', cb),
  onMoveToNextDisplay: (cb) => listen<number>('moveToNextDisplay', cb),
  sendFlyPoses: (poses) => {
    ipcRenderer.send('flyPoses', poses)
  },
  pause: (next) => ipcRenderer.invoke('pause', next) as Promise<boolean>,
}

contextBridge.exposeInMainWorld('desktopfly', api)
