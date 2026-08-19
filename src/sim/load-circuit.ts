/**
 * Load data/circuit.json (+ brain_points.json). Port of Sim.swift loaders.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type CircuitNeuronFile = {
  id: string
  type: string
  role: string
  side: string
  pos: number[]
}

export type CircuitFile = {
  neurons: CircuitNeuronFile[]
  edges: number[][]
}

export type BrainPointsFile = {
  classes: string[]
  points: number[][]
}

function moduleDir(): string {
  if (typeof import.meta.dirname === 'string') return import.meta.dirname
  return dirname(fileURLToPath(import.meta.url))
}

function hasCircuit(dir: string): boolean {
  return existsSync(join(dir, 'circuit.json'))
}

function collectCandidates(from?: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (dir: string) => {
    const resolved = resolve(dir)
    if (seen.has(resolved)) return
    seen.add(resolved)
    out.push(resolved)
  }

  // PORT_CONTRACT / Phase 1: cwd/data, dist/data, then import.meta dirname walks.
  push(join(process.cwd(), 'data'))
  push(join(process.cwd(), 'dist', 'data'))

  const seeds: string[] = []
  if (from) seeds.push(resolve(from), dirname(resolve(from)))
  seeds.push(process.cwd(), moduleDir())

  for (const seed of seeds) {
    let dir = resolve(seed)
    for (let i = 0; i < 8; i++) {
      push(join(dir, 'data'))
      push(join(dir, 'dist', 'data'))
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return out
}

export function findDataDir(from?: string): string {
  for (const dir of collectCandidates(from)) {
    if (hasCircuit(dir)) return dir
  }
  throw new Error('no data/ — run etl.py first (circuit.json not found)')
}

export function loadCircuit(dataDir?: string): CircuitFile {
  const dir = dataDir ?? findDataDir()
  const text = readFileSync(join(dir, 'circuit.json'), 'utf8')
  return JSON.parse(text) as CircuitFile
}

export function loadBrainPoints(dataDir?: string): BrainPointsFile {
  const dir = dataDir ?? findDataDir()
  const text = readFileSync(join(dir, 'brain_points.json'), 'utf8')
  return JSON.parse(text) as BrainPointsFile
}
