/** Menu-bar / system-tray. Port of AppDelegate.setupStatusItem. */
import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listDisplays, subscribeDisplayChanges } from './displays'

export type TrayActions = {
  isPaused: () => boolean
  onTogglePause: () => boolean
  onToggleBrain: () => void
  onEscapeTest: () => void
  onMoveToNextDisplay: () => void
  onAddFly: () => void
  onRemoveFly: () => void
  onScareFlies: () => void
  onQuit: () => void
}

export type TrayHandle = {
  tray: Tray
  dispose: () => void
}

const here = dirname(fileURLToPath(import.meta.url))

/** 16×16 dark disk — Windows/Linux require a real icon; macOS uses the title glyph. */
const TRAY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANElEQVR4nGNgGLRAQ0PjPzImWyNJBhHSTNAQigwgVjNOQ4aBAQMfC8QaglczPoOI1kh3AADK7KQRreKyOwAAAABJRU5ErkJggg=='

function trayIcon(): NativeImage {
  const fly = join(here, '../../vendor/desktop-fly/assets/fly.png')
  if (existsSync(fly)) {
    const img = nativeImage.createFromPath(fly)
    if (!img.isEmpty()) return img.resize({ width: 18, height: 18 })
  }
  return nativeImage.createFromBuffer(Buffer.from(TRAY_PNG, 'base64'))
}

function buildMenu(actions: TrayActions): Menu {
  return Menu.buildFromTemplate([
    { label: 'Desktop Fly', enabled: false },
    { type: 'separator' },
    {
      label: actions.isPaused() ? 'Resume' : 'Pause',
      click: (item) => {
        item.label = actions.onTogglePause() ? 'Resume' : 'Pause'
      },
    },
    { label: 'Show/Hide Brain', click: () => actions.onToggleBrain() },
    { label: 'Escape Test (loom)', click: () => actions.onEscapeTest() },
    {
      label: 'Move to Next Display',
      visible: listDisplays().length > 1,
      click: () => actions.onMoveToNextDisplay(),
    },
    { label: 'Add Fly', click: () => actions.onAddFly() },
    { label: 'Remove Fly', click: () => actions.onRemoveFly() },
    { label: 'Scare Flies', click: () => actions.onScareFlies() },
    { type: 'separator' },
    { label: 'Quit', role: process.platform === 'darwin' ? 'quit' : undefined, click: () => actions.onQuit() },
  ])
}

export function createTray(actions: TrayActions): TrayHandle {
  const tray = new Tray(trayIcon())
  tray.setToolTip('🪰')
  if (process.platform === 'darwin') tray.setTitle('🪰')

  const applyMenu = (): void => {
    tray.setContextMenu(buildMenu(actions))
  }
  applyMenu()

  const unsubscribe = subscribeDisplayChanges(applyMenu)

  if (process.platform !== 'darwin') {
    tray.on('click', () => tray.popUpContextMenu())
  }

  return {
    tray,
    dispose: () => {
      unsubscribe()
      tray.destroy()
    },
  }
}
