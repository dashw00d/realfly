/**
 * Load path for later NAPI-RS output (`desktop-env.*.node`).
 * App code should use `src/main/desktop-env.ts` (`createDesktopEnvironment`).
 * This file is the native package's JS fallback when the addon is missing.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const dir = dirname(fileURLToPath(import.meta.url))

function candidateFiles() {
  const { platform, arch } = process
  return [
    'desktop-env.node',
    'index.node',
    `desktop-env.${platform}-${arch}.node`,
    `desktop-env.${platform}-${arch}-gnu.node`,
    `desktop-env.${platform}-${arch}-msvc.node`,
    `desktop-env.${platform}-${arch}-musl.node`,
  ]
}

function loadNative() {
  for (const name of candidateFiles()) {
    const p = join(dir, name)
    if (!existsSync(p)) continue
    try {
      return require(p)
    } catch {
      // wrong ABI
    }
  }
  return null
}

const native = loadNative()

export function nativeAvailable() {
  return native != null
}

export function getWindows() {
  return native?.getWindows?.() ?? []
}

export function getCursor() {
  return native?.getCursor?.() ?? { x: 0, y: 0 }
}

export function getIdleSeconds() {
  return native?.getIdleSeconds?.() ?? 0
}

export function getThermalFactor() {
  const t = native?.getThermalFactor?.()
  return typeof t === 'number' && t > 0 ? t : 1.0
}

export function isDegraded() {
  return native?.isDegraded?.() ?? false
}

export function backend() {
  return native?.backend?.() ?? 'fallback'
}

export function onMouseDown(_cb) {
  // Live tap-to-startle is src/main/global-mouse.ts (uiohook-napi).
  return () => {}
}
