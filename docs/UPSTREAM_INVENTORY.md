# Upstream inventory

Source: `vendor/desktop-fly` — shallow clone of
https://github.com/DenisSergeevitch/desktop-fly.git (`--depth 1`).

Sizes are bytes on disk after clone. Line counts from `wc -l`.

The five `.swift` files compile as **one module** (`build.sh`:
`swiftc … main.swift FlyModel.swift Sim.swift BrainView.swift Environment.swift`).

## Swift files → TypeScript destinations

| Swift file | Bytes | Lines | TypeScript destination |
|---|---:|---:|---|
| `vendor/desktop-fly/main.swift` | 38,493 | 894 | Split: `src/sim/SignalBuilder.ts` (rates→commands); `src/sim/Coordinator.ts` (render-loop hub, loom/tap, 1 kHz step); `src/sim/__tests__/simtest.test.ts` + `src/behavior/__tests__/behaviortest.test.ts` (CLI tests); `src/main/` Electron overlay, tray, display hop (`AppDelegate`); `src/render/FlyScene.ts` (orthographic overlay scene, lights, shadow plane) |
| `vendor/desktop-fly/FlyModel.swift` | 27,953 | 682 | Split: `src/behavior/Fly.ts` (non-rendering behavior — Phase 2); `src/render/FlyModel.ts` (procedural body, legs, wings — Phase 3); `src/behavior/math.ts` (`clampf`, `angleDiff`, `smoothstep`, `FLY_SCALE=1.15`, `EDGE_MARGIN=50`) |
| `vendor/desktop-fly/BrainView.swift` | 15,052 | 355 | `src/render/BrainScene.ts` (point cloud, circuit overlay, GF markers, spike flash pool, click-to-stimulate, region labels) |
| `vendor/desktop-fly/Sim.swift` | 14,813 | 342 | `src/sim/LIFSim.ts`, `src/sim/BrainSignals.ts`, `src/sim/SpikeBus.ts`, `src/sim/loadBrainData.ts` (`findDataDir` → `data/circuit.json` + `data/brain_points.json`) |
| `vendor/desktop-fly/Environment.swift` | 4,376 | 99 | `native/desktop-env` (NAPI-RS: windows, cursor, idle, mouse-down); `src/env/circadian.ts` (`circadianActivity`); `getThermalFactor()` / `environmentTempo` (macOS thermal state, Windows speed-limit/power, Linux 1.0) |

## Non-Swift (copied or left in vendor)

| Path | Bytes | Role in this repo |
|---|---:|---|
| `vendor/desktop-fly/etl.py` | 8,277 | Copied to repo-root `etl.py` |
| `vendor/desktop-fly/LICENSE` | 1,277 | Copied to repo-root `LICENSE` (MIT; notes data is CC BY-NC 4.0) |
| `vendor/desktop-fly/CLAUDE.md` | 6,763 | Agent notes; do not treat as TS dest. Invariants live in `docs/PORT_CONTRACT.md` |
| `vendor/desktop-fly/README.md` | 6,657 | Upstream product readme |
| `vendor/desktop-fly/build.sh` | 231 | macOS `swiftc` only; not ported |
| `vendor/desktop-fly/data/circuit.json` | 408,374 | Copied to `data/circuit.json` (FlyWire CC BY-NC 4.0) |
| `vendor/desktop-fly/data/brain_points.json` | 636,590 | Copied to `data/brain_points.json` |
| `vendor/desktop-fly/data/DATA_LICENSE.md` | 966 | Copied to `data/DATA_LICENSE.md` — keep |
| `vendor/desktop-fly/assets/fly.png` | — | Preview art; not required for sim port |
| `vendor/desktop-fly/assets/brain.png` | — | Preview art; not required for sim port |

## Harvest checklist

- [x] `vendor/desktop-fly/Sim.swift` exists
- [x] `data/circuit.json` exists (copied from upstream `data/`)
- [x] `data/brain_points.json` exists
- [x] `data/DATA_LICENSE.md` exists
- [x] `LICENSE` (MIT) exists
- [x] `etl.py` exists
- [x] `docs/PORT_CONTRACT.md` written
- [x] Port **not** implemented in this step
