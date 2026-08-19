#!/usr/bin/env node
/**
 * Copy this tree to C:\Users\ryan\sites\realfly for a native Win32 Electron.
 * WSL/WSLg cannot see Windows mouse clicks or other apps' windows.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = process.env.REALFLY_WIN_DIR || '/mnt/c/Users/ryan/sites/realfly'

if (!existsSync('/mnt/c/Users')) {
  console.error('DesktopFly: /mnt/c/Users not mounted; this helper is for WSL.')
  process.exit(1)
}

mkdirSync(dest, { recursive: true })

const excludes = [
  '--exclude', 'node_modules',
  '--exclude', 'release',
  '--exclude', 'out',
  '--exclude', '.vite',
  '--exclude', 'native/**/target',
  '--exclude', '.git',
]

const result = spawnSync(
  'rsync',
  ['-a', '--delete', ...excludes, `${src}/`, `${dest}/`],
  { stdio: 'inherit' },
)

if (result.status !== 0) {
  console.error('DesktopFly: rsync to Windows filesystem failed')
  process.exit(result.status ?? 1)
}

console.log(`DesktopFly: synced → ${dest}`)
console.log('Next: npm start from that folder (Windows Node), or pnpm start:win')
