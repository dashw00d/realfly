#!/usr/bin/env node
/**
 * Rebuild uiohook-napi against Electron's Node ABI.
 * Window-enumeration still lives in native/desktop-env (Rust); this is only
 * the global mouse hook used by desktop.onMouseDown.
 *
 * Linux hosts without libxtst-dev: download headers + linker stubs into
 * node_modules/.cache/x11-sysroot (no sudo).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))

function electronVersion() {
  try {
    return require('electron/package.json').version
  } catch {
    return null
  }
}

function linuxSysrootEnv() {
  if (process.platform !== 'linux') return {}
  if (existsSync('/usr/include/X11/extensions/record.h')) return {}

  const cache = join(root, 'node_modules/.cache/x11-sysroot')
  const prefix = join(cache, 'prefix')
  const include = join(prefix, 'usr/include')
  const libDir = join(prefix, 'usr/lib/x86_64-linux-gnu')
  mkdirSync(cache, { recursive: true })

  if (!existsSync(join(include, 'X11/extensions/record.h'))) {
    const debs = [
      'libxtst-dev',
      'libxrandr-dev',
      'libxinerama-dev',
      'libxi-dev',
      'libxrender-dev',
      'libxext-dev',
      'libxfixes-dev',
      'libxkbcommon-dev',
      'libxkbfile-dev',
      'x11proto-dev',
    ]
    const dl = spawnSync('apt-get', ['download', ...debs], { cwd: cache, stdio: 'inherit' })
    if (dl.status !== 0) {
      console.warn('DesktopFly: could not download X11 -dev packages; tap-to-startle rebuild may fail')
      return {}
    }
    for (const name of readdirSync(cache)) {
      if (!name.endsWith('.deb')) continue
      spawnSync('dpkg-deb', ['-x', join(cache, name), prefix], { stdio: 'inherit' })
    }
  }

  mkdirSync(libDir, { recursive: true })
  // Linker prefers libXtst.a from the -dev package (not -fPIC). Drop static
  // archives so -lXtst resolves to the system .so.
  for (const name of readdirSync(libDir)) {
    if (name.endsWith('.a')) {
      try {
        unlinkSync(join(libDir, name))
      } catch {
        // ignore
      }
    }
  }
  const pairs = [
    ['libXtst.so', 'libXtst.so.6'],
    ['libXrandr.so', 'libXrandr.so.2'],
    ['libX11.so', 'libX11.so.6'],
    ['libXext.so', 'libXext.so.6'],
    ['libXi.so', 'libXi.so.6'],
    ['libXinerama.so', 'libXinerama.so.1'],
    ['libXrender.so', 'libXrender.so.1'],
    ['libXfixes.so', 'libXfixes.so.3'],
  ]
  const sysLib = '/usr/lib/x86_64-linux-gnu'
  for (const [linkName, soname] of pairs) {
    const link = join(libDir, linkName)
    const target = join(sysLib, soname)
    if (!existsSync(target)) continue
    try {
      symlinkSync(target, link)
    } catch {
      // already linked
    }
  }

  return {
    CPATH: include,
    C_INCLUDE_PATH: include,
    CPLUS_INCLUDE_PATH: include,
    LIBRARY_PATH: libDir,
    LDFLAGS: `-L${libDir}`,
  }
}

const version = electronVersion()
if (!version) {
  console.warn('DesktopFly: electron not installed; skip uiohook rebuild')
  process.exit(0)
}

const bin = join(root, 'node_modules/.bin/electron-rebuild')
if (!existsSync(bin)) {
  console.warn('DesktopFly: @electron/rebuild not installed; skip uiohook rebuild')
  process.exit(0)
}

const result = spawnSync(bin, ['--force', '--only', 'uiohook-napi'], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, ...linuxSysrootEnv() },
})

if (result.status !== 0) {
  console.warn(
    'DesktopFly: uiohook-napi rebuild for Electron failed. Tap-to-startle will be off until `pnpm rebuild:hooks` succeeds.',
  )
  process.exit(0)
}
