import * as esbuild from 'esbuild'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

const nodeBundle = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
}

await esbuild.build({
  ...nodeBundle,
  entryPoints: [join(root, 'src/main/index.ts')],
  outfile: join(dist, 'main/index.js'),
  external: ['electron', 'uiohook-napi'],
})

const preloadEntries = [
  [join(root, 'src/preload/overlay-preload.ts'), join(dist, 'preload/overlay-preload.cjs')],
  [join(root, 'src/preload/brain-preload.ts'), join(dist, 'preload/brain-preload.cjs')],
]
for (const [entry, outfile] of preloadEntries) {
  if (!existsSync(entry)) continue
  await esbuild.build({
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: true,
    entryPoints: [entry],
    outfile,
    external: ['electron'],
  })
}

await esbuild.build({
  ...nodeBundle,
  entryPoints: [join(root, 'src/worker/sim-worker.ts')],
  outfile: join(dist, 'worker/sim-worker.js'),
})

const rendererEntries = [join(root, 'src/renderer/overlay.ts')]
const brainEntry = join(root, 'src/renderer/brain.ts')
if (existsSync(brainEntry)) rendererEntries.push(brainEntry)

await esbuild.build({
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  entryPoints: rendererEntries,
  outdir: join(dist, 'renderer'),
})

mkdirSync(join(dist, 'renderer'), { recursive: true })
cpSync(join(root, 'src/renderer/overlay.html'), join(dist, 'renderer/overlay.html'))
cpSync(join(root, 'src/renderer/brain.html'), join(dist, 'renderer/brain.html'))
cpSync(join(root, 'data'), join(dist, 'data'), { recursive: true })
