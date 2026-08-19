/**
 * One transparent BrowserWindow per physical display. Click-through.
 * Window options live in docs/PORT_CONTRACT.md.
 *
 * Linux: overlay placement and always-on-top require X11/XWayland.
 * Native Wayland compositors block free positioning; ship via XWayland.
 */
import { BrowserWindow, screen } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listDisplays, subscribeDisplayChanges, type DisplayInfo } from './displays'

export type OverlayManager = {
  windows(): BrowserWindow[]
  windowFor(displayId: number): BrowserWindow | undefined
  recreate(): void
  dispose(): void
  send(displayId: number, channel: string, ...args: unknown[]): void
  broadcast(channel: string, ...args: unknown[]): void
  activeDisplayId(): number
  activeDisplay(): DisplayInfo | undefined
  moveToDisplay(displayId: number): number
  moveToNextDisplay(): number
  onRecreated(cb: () => void): () => void
}

const here = dirname(fileURLToPath(import.meta.url))

function overlayHtmlPath(): string {
  return join(here, '../renderer/overlay.html')
}

function overlayPreloadPath(): string | undefined {
  const candidates = [
    join(here, '../preload/overlay-preload.cjs'),
    join(here, '../preload/overlay-preload.js'),
  ]
  return candidates.find((p) => existsSync(p))
}

function applyAlwaysOnTop(win: BrowserWindow): void {
  // Linux: if an alwaysOnTop level is available, pin above other surfaces.
  // Requires X11/XWayland — native Wayland cannot freely place overlays.
  if (process.platform === 'linux') {
    win.setAlwaysOnTop(true, 'screen-saver')
    return
  }
  win.setAlwaysOnTop(true)
}

function createOverlayWindow(
  display: Electron.Display,
  isActive: () => boolean,
): BrowserWindow {
  const preload = overlayPreloadPath()
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,

    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,

    hasShadow: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#00000000',

    webPreferences: {
      backgroundThrottling: false,
      ...(preload
        ? { preload, contextIsolation: true, nodeIntegration: false }
        : {}),
    },
  })

  win.setIgnoreMouseEvents(true, { forward: true })
  applyAlwaysOnTop(win)

  const html = overlayHtmlPath()
  if (existsSync(html)) {
    void win.loadFile(html)
  } else {
    void win.loadURL('data:text/html,<html><body></body></html>')
  }

  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return
    win.webContents.send('display', {
      id: display.id,
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      scaleFactor: display.scaleFactor,
      bounds: display.bounds,
    })
    if (isActive()) win.showInactive()
    else win.hide()
  })

  return win
}

export function createOverlayManager(): OverlayManager {
  const windows = new Map<number, BrowserWindow>()
  let primaryId = screen.getPrimaryDisplay().id
  let disposed = false
  const recreated = new Set<() => void>()

  const destroyAll = (): void => {
    for (const win of windows.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    windows.clear()
  }

  /** Inactive overlays must be hidden — a transparent Windows window keeps its last WebGL frame. */
  const applyActiveVisibility = (): void => {
    for (const [id, win] of windows) {
      if (win.isDestroyed()) continue
      if (id === primaryId) {
        if (!win.isVisible()) win.showInactive()
      } else if (win.isVisible()) {
        win.hide()
      }
    }
  }

  const recreate = (): void => {
    if (disposed) return
    destroyAll()
    const displays = screen.getAllDisplays()
    if (!displays.some((d) => d.id === primaryId) && displays[0]) {
      primaryId = displays[0].id
    }
    for (const display of displays) {
      windows.set(display.id, createOverlayWindow(display, () => display.id === primaryId))
    }
    applyActiveVisibility()
    for (const cb of recreated) cb()
  }

  const moveToDisplay = (displayId: number): number => {
    const ids = screen.getAllDisplays().map((d) => d.id)
    if (ids.includes(displayId)) primaryId = displayId
    applyActiveVisibility()
    for (const win of windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send('activeDisplay', primaryId)
        win.webContents.send('moveToNextDisplay', primaryId)
      }
    }
    return primaryId
  }

  const unsubscribe = subscribeDisplayChanges(() => {
    recreate()
  })

  recreate()

  const send = (displayId: number, channel: string, ...args: unknown[]): void => {
    const win = windows.get(displayId)
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
  }

  return {
    windows: () => [...windows.values()].filter((w) => !w.isDestroyed()),
    windowFor: (displayId) => {
      const win = windows.get(displayId)
      return win && !win.isDestroyed() ? win : undefined
    },
    recreate,
    dispose: () => {
      disposed = true
      unsubscribe()
      recreated.clear()
      destroyAll()
    },
    send,
    broadcast: (channel, ...args) => {
      for (const win of windows.values()) {
        if (!win.isDestroyed()) win.webContents.send(channel, ...args)
      }
    },
    activeDisplayId: () => primaryId,
    activeDisplay: () => listDisplays().find((d) => d.id === primaryId),
    moveToDisplay,
    moveToNextDisplay: () => {
      const ids = screen.getAllDisplays().map((d) => d.id)
      if (ids.length >= 2) {
        const idx = Math.max(0, ids.indexOf(primaryId))
        return moveToDisplay(ids[(idx + 1) % ids.length]!)
      }
      return primaryId
    },
    onRecreated: (cb) => {
      recreated.add(cb)
      return () => {
        recreated.delete(cb)
      }
    },
  }
}
