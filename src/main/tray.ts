/** Menu-bar / system-tray. Port of AppDelegate.setupStatusItem. */
import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatDisplayLabel, listDisplays, subscribeDisplayChanges } from './displays'

export type TrayActions = {
  isPaused: () => boolean
  onTogglePause: () => boolean
  onToggleBrain: () => void
  onEscapeTest: () => void
  activeDisplayId: () => number
  onSelectDisplay: (displayId: number) => void
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

function iconCandidates(name: string): string[] {
  return [
    join(here, '../assets', name),
    join(here, '../../assets', name),
    join(process.resourcesPath ?? here, 'assets', name),
  ]
}

function firstExisting(names: string[]): string | undefined {
  for (const name of names) {
    for (const p of iconCandidates(name)) {
      if (existsSync(p)) return p
    }
  }
  return undefined
}

/** Windows needs a real PNG; a 16×16 black disk vanishes on a dark taskbar. */
function trayIcon(): NativeImage {
  const path = firstExisting(['tray-icon-32.png', 'tray-icon-16.png', 'tray-icon.png'])
  if (!path) return nativeImage.createEmpty()
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) return nativeImage.createEmpty()
  return img
}

function buildMenu(actions: TrayActions): Menu {
  const displays = listDisplays()
  const active = actions.activeDisplayId()
  return Menu.buildFromTemplate([
    { label: 'Desktop Fly', enabled: false },
    { type: 'separator' },
    {
      label: actions.isPaused() ? 'Resume' : 'Pause',
      click: () => actions.onTogglePause(),
    },
    { label: 'Show/Hide Brain', click: () => actions.onToggleBrain() },
    { label: 'Escape Test (loom)', click: () => actions.onEscapeTest() },
    {
      label: 'Display',
      visible: displays.length > 1,
      submenu: displays.map((d, i) => ({
        label: formatDisplayLabel(d, i),
        type: 'radio',
        checked: d.id === active,
        click: () => actions.onSelectDisplay(d.id),
      })),
    },
    { label: 'Add Fly', click: () => actions.onAddFly() },
    { label: 'Remove Fly', click: () => actions.onRemoveFly() },
    { label: 'Scare Flies', click: () => actions.onScareFlies() },
    { type: 'separator' },
    {
      label: 'Quit',
      role: process.platform === 'darwin' ? 'quit' : undefined,
      click: () => actions.onQuit(),
    },
  ])
}

export function createTray(actions: TrayActions): TrayHandle {
  const tray = new Tray(trayIcon())
  tray.setToolTip('Desktop Fly')
  if (process.platform === 'darwin') tray.setTitle('🪰')

  const applyMenu = (): void => {
    tray.setContextMenu(buildMenu(actions))
  }

  const wrapped: TrayActions = {
    ...actions,
    onSelectDisplay: (id) => {
      actions.onSelectDisplay(id)
      applyMenu()
    },
    onTogglePause: () => {
      const paused = actions.onTogglePause()
      applyMenu()
      return paused
    },
  }

  const applyWrapped = (): void => {
    tray.setContextMenu(buildMenu(wrapped))
  }
  applyWrapped()

  const unsubscribe = subscribeDisplayChanges(applyWrapped)

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
