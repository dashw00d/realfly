/** Ordinary (opaque) brain window. Not click-through. */
import { BrowserWindow, screen } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SpikeEvent } from '../sim/spike-bus'

export type BrainWindow = {
  show(): void
  hide(): void
  toggle(): void
  isVisible(): boolean
  sendSpikes(spikes: SpikeEvent[]): void
  dispose(): void
}

const BRAIN_WIDTH = 340
const BRAIN_HEIGHT = 280

const here = dirname(fileURLToPath(import.meta.url))

function brainHtmlPath(): string {
  return join(here, '../renderer/brain.html')
}

function brainPreloadPath(): string | undefined {
  const candidates = [
    join(here, '../preload/brain-preload.cjs'),
    join(here, '../preload/overlay-preload.cjs'),
  ]
  return candidates.find((p) => existsSync(p))
}

function placeOnDisplay(display: Electron.Display): { x: number; y: number } {
  const vis = display.workArea
  return {
    x: vis.x + vis.width - BRAIN_WIDTH - 18,
    y: vis.y + vis.height - BRAIN_HEIGHT - 18,
  }
}

export function createBrainWindow(): BrainWindow {
  const origin = placeOnDisplay(screen.getPrimaryDisplay())
  const preload = brainPreloadPath()
  const win = new BrowserWindow({
    x: origin.x,
    y: origin.y,
    width: BRAIN_WIDTH,
    height: BRAIN_HEIGHT,
    title: 'Fly Brain — FlyWire v783 (click = stimulate)',
    transparent: false,
    frame: true,
    resizable: true,
    movable: true,
    focusable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      ...(preload ? { preload } : {}),
    },
  })

  const html = brainHtmlPath()
  if (existsSync(html)) {
    void win.loadFile(html)
  }

  let allowClose = false
  win.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    win.hide()
  })

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })

  return {
    show: () => {
      if (!win.isDestroyed()) win.show()
    },
    hide: () => {
      if (!win.isDestroyed()) win.hide()
    },
    toggle: () => {
      if (win.isDestroyed()) return
      if (win.isVisible()) win.hide()
      else win.show()
    },
    isVisible: () => !win.isDestroyed() && win.isVisible(),
    sendSpikes: (spikes) => {
      if (win.isDestroyed() || spikes.length === 0) return
      win.webContents.send('spikes', spikes)
    },
    dispose: () => {
      allowClose = true
      if (!win.isDestroyed()) win.destroy()
    },
  }
}
