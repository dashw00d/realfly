import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { app, ipcMain } from 'electron'
import { createBrainWindow, type BrainWindow } from './brain-window'
import { createDesktopEnvironment } from './desktop-env'
import { createOverlayManager, type OverlayManager } from './overlay-manager'
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

function cliFlagPath(flag: string, fallback: string): string | undefined {
  const args = process.argv
  const i = args.indexOf(flag)
  if (i < 0) return undefined
  const next = args[i + 1]
  const raw = next && !next.startsWith('-') ? next : fallback
  return resolve(process.cwd(), raw)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms))
}

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return true
    await sleep(40)
  }
  return pred()
}

function writePng(label: string, path: string, png: Buffer | null): boolean {
  if (!png || png.length === 0) {
    console.error(`${label}: capture failed`)
    return false
  }
  try {
    writeFileSync(path, png)
    console.log(`${label} written to ${path}`)
    return true
  } catch (err) {
    console.error(`${label}: ${err instanceof Error ? err.message : err}`)
    return false
  }
}

async function runCliCaptures(opts: {
  overlays: OverlayManager
  brain: BrainWindow
  snapshotPath?: string
  brainshotPath?: string
}): Promise<boolean> {
  const { overlays, brain, snapshotPath, brainshotPath } = opts
  let ok = true
  if (snapshotPath) {
    await waitFor(() => {
      const win = overlays.windowFor(overlays.activeDisplayId())
      return !!win && !win.webContents.isLoading()
    }, 12_000)
    await sleep(800)
    ok = writePng('snapshot', snapshotPath, await overlays.captureActive()) && ok
  }
  if (brainshotPath) {
    await waitFor(() => brain.isVisible(), 12_000)
    await sleep(600)
    ok = writePng('brainshot', brainshotPath, await brain.capturePage()) && ok
  }
  return ok
}

app.whenReady().then(async () => {
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
    status: () => world.status(),
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

  const snapshotPath = cliFlagPath('--snapshot', 'DesktopFly.png')
  const brainshotPath = cliFlagPath('--brainshot', 'Brain.png')
  if (snapshotPath || brainshotPath) {
    const ok = await runCliCaptures({ overlays, brain, snapshotPath, brainshotPath })
    app.exit(ok ? 0 : 1)
  }
})

app.on('window-all-closed', () => {
  // Overlay windows persist; quit from the tray.
})
