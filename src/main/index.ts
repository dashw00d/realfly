import { existsSync, readFileSync } from 'node:fs'
import { app, ipcMain } from 'electron'
import { createBrainWindow } from './brain-window'
import { createDesktopEnvironment } from './desktop-env'
import { createOverlayManager } from './overlay-manager'
import { createTray } from './tray'
import { createWorldLoop } from './world-loop'

function runningUnderWsl(): boolean {
  if (process.platform !== 'linux') return false
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'))
  } catch {
    return false
  }
}

// Linux overlays need X11/XWayland for positioning and always-on-top.
// Native Wayland is degraded; run the app via XWayland on Wayland sessions.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals')
}

if (runningUnderWsl() || existsSync('/mnt/wslg')) {
  console.warn(
    'DesktopFly: this is a Linux Electron under WSL/WSLg.\n' +
      '  Tap-to-startle and window ledges will NOT see the Windows desktop.\n' +
      '  libuiohook is hooked into the Linux GUI stack, not Win32.\n' +
      '  Run the Windows build instead: scripts/start-windows.ps1\n' +
      '  (syncs to C:\\Users\\ryan\\sites\\realfly and launches win32 Electron).',
  )
}

if (process.platform === 'win32') {
  app.setAppUserModelId('dev.realfly.desktopfly')
}

app.whenReady().then(() => {
  const desktop = createDesktopEnvironment()
  void desktop.getThermalFactor()

  if (process.platform === 'darwin') app.dock?.hide()

  const overlays = createOverlayManager()
  const brain = createBrainWindow()
  const world = createWorldLoop({ desktop, overlays, brain })

  ipcMain.handle('pause', (...args: unknown[]) => {
    const next = args[1]
    return world.setPaused(typeof next === 'boolean' ? next : undefined)
  })

  const tray = createTray({
    isPaused: () => world.isPaused(),
    onTogglePause: () => world.setPaused(),
    onToggleBrain: () => brain.toggle(),
    onEscapeTest: () => world.escapeTest(),
    activeDisplayId: () => overlays.activeDisplayId(),
    onSelectDisplay: (id) => world.moveToDisplay(id),
    onAddFly: () => world.addFly(),
    onRemoveFly: () => world.removeFly(),
    onScareFlies: () => world.scare(),
    onQuit: () => app.quit(),
  })

  app.on('before-quit', () => {
    world.dispose()
    tray.dispose()
    brain.dispose()
    overlays.dispose()
  })
})

app.on('window-all-closed', () => {
  // Overlay windows persist; quit from the tray.
})
