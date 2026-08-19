# DesktopFly Port Contract

This is a **port**, not a rewrite. Numbers, predicates, and mapping below are
copied from `vendor/desktop-fly/` (DenisSergeevitch/desktop-fly, macOS Swift).
Later agents must preserve them. Architecture source of truth: `plan.md`.

License split (do not merge): code MIT; `data/` is FlyWire CC BY-NC 4.0.
Keep `DATA_LICENSE.md`.

---

## File map (Swift → TypeScript)

Upstream compiles as one module via `vendor/desktop-fly/build.sh`
(`main.swift FlyModel.swift Sim.swift BrainView.swift Environment.swift`).

| Swift source | What it contains | TypeScript destination |
|---|---|---|
| `Sim.swift` | `BrainSignals`, `BrainPointsFile`/`CircuitFile` loaders, `SpikeBus`, `LIFSim` (CSR LIF, stim API) | `src/sim/LIFSim.ts`, `src/sim/BrainSignals.ts`, `src/sim/SpikeBus.ts`, `src/sim/loadBrainData.ts` |
| `main.swift` `SignalBuilder` | rates → body commands (shared by live loop and `--behaviortest`) | `src/sim/SignalBuilder.ts` |
| `main.swift` `Coordinator` | 1 kHz sim step, loom/air-puff transduction, circadian/sleep neuromodulation, fly #1 vs extra flies | `src/sim/Coordinator.ts` (sim worker) + Electron overlay manager |
| `main.swift` `AppDelegate` / overlay scene | transparent click-through overlay, tray, timers, display hop | `src/main/` (Electron: tray, display manager, overlay manager, environment adapter) |
| `main.swift` `runSimtest` / `runBehaviorTest` / snapshot CLI | `--simtest`, `--behaviortest`, `--snapshot`, `--brainshot` | `src/sim/__tests__/simtest.test.ts`, `src/behavior/__tests__/behaviortest.test.ts`; snapshots later |
| `FlyModel.swift` `Fly` behavior | states, gait, flight, ledges, sleep, hysteresis | `src/behavior/Fly.ts` (no graphics in Phase 2) |
| `FlyModel.swift` procedural body | `SCNSphere`/`SCNCapsule`/`SCNNode` fly mesh, legs, wings | `src/render/FlyModel.ts` (Three.js: `SphereGeometry` / `CapsuleGeometry` / `Object3D`) |
| `FlyModel.swift` helpers | `clampf`, `angleDiff`, `smoothstep`, `FLY_SCALE`, `EDGE_MARGIN` | `src/behavior/math.ts` + shared constants |
| `BrainView.swift` | 23k soma point cloud, circuit overlay, click-to-stimulate, spike flashes | `src/render/BrainScene.ts` |
| `Environment.swift` | `WindowSense` ledges/looms, `circadianActivity`, `userIdleSeconds`, `thermalTempo` | `native/desktop-env` (NAPI-RS) + `src/env/circadian.ts`; `thermalTempo` generalizes to `environmentTempo` |
| `etl.py` | FlyWire Codex dumps → `data/brain_points.json` + `data/circuit.json` | keep at repo root `etl.py` (copied; do not rewrite unless regenerating data) |

SceneKit → Three.js primitive map (Phase 3):

| SceneKit | Three.js |
|---|---|
| `SCNSphere` | `SphereGeometry` |
| `SCNCapsule` | `CapsuleGeometry` |
| `SCNNode` | `Object3D` / `Group` |
| `SCNMaterial` | `MeshStandardMaterial` |
| `SCNLight` | `DirectionalLight` |

Port sequence (from `plan.md`): Phase 1 brain (`LIFSim` + `--simtest`) → Phase 2 behavior (`Fly.ts` + `--behaviortest`) → Phase 3 Three.js fly → Phase 4 Electron overlay → Phase 5 Windows ecology (ledges/looms) → Phase 6 global clicks behind `desktop.onMouseDown`.

---

## LIF constants (`Sim.swift` `LIFSim`)

1 ms step. Do not retune.

| name | value | notes |
|---|---|---|
| `decay` | `0.9512` | `exp(-1/20)`: 20 ms membrane tau, 1 ms step |
| `threshold` | `1.0` | spike when `v[i] >= threshold` |
| `refractoryMs` | `2` | 2 ms refractory |
| `weightScale` | `0.0008` | per-synapse scale: `e[2] * weightScale` |
| `pNoise` | `0.0022` | per-ms noise probability (× `activityScale`; ×6 during arousal burst) |
| `noiseKick` | `0.42` | voltage kick when noise fires |
| `loomGain` | `0.30` | `v[i] += loom * loomGain * sensoryGate` on LC4/LPLC2 |
| `inhDelayMs` | `4` | GABA/Glut delay; electrical (gap-junction) is instantaneous |
| `gapJunctionBoost` | `6` | LC4/LPLC2 or `other`+sensory → GF chemical weights ×6 |
| `rateAlpha` | `1.0 / 120.0` | EMA on group rates (Hz per neuron) |
| `inhQueue` depth | `5` | ring buffer; slot `(qHead + inhDelayMs) % 5` |
| voltage floor | `-2` | `v[j] = max(-2, v[j] + w)` |

Related (must also preserve; not free knobs):

| name | value |
|---|---|
| arousal burst duration | 400 ms |
| next burst | `simMs + random(15_000...40_000)` |
| gait → ascending | `gaitDrive * 0.09 * (0.5 + 0.5 * sin(phase))` |
| air puff → sensory | `airPuff * 0.12 * sensoryGate` |
| activity compression | `activityScale = 1 - (1 - activity) * 0.35` (siesta 0.55 → **0.84**) |
| sleep `activityScale` extra | `× 0.75` when sleepy |
| sleep `sensoryGate` | `0.55` when sleepy, else `1` |

Baselines (command DNs are deterministic; never random per-side):

| role | baseline |
|---|---|
| `other` | `random(0.010...0.070)` |
| `lc4`, `lplc2` | `0.004` |
| `dna01`, `dna02`, `mdn`, `dng11`, `escw` | `0.036` |
| `dnp09` | `0.038` |
| `gf` (default) | `0.002` |

Inhibitory synapses (`w < 0`) go into the delay queue; excitatory (`w >= 0`) are instant.

---

## SignalBuilder mapping (`vendor/desktop-fly/main.swift`)

`SignalBuilder.make` is shared by the live loop and `--behaviortest`. Copy these
exact numbers. `groomDrive` is **not** clamped in upstream (walk/wing/arousal are).

```ts
// dnaBaseline adapts out persistent L/R wiring (tau ~8 s)
dnaBaseline += (diff - dnaBaseline) * min(1, dt / 8)
// diff = rateDNaL - rateDNaR

escape    = consumeGF()                          // latch, then clear
nervous   = clamp(rateLoom / 80, 0, 1)
turnBias  = clamp((diff - dnaBaseline) * 0.04, -1.0, 1.0)
backward  = rateMDN > 8
walkDrive = clamp(rateFwd / 10, 0, 1.3)
groomDrive = rateGroom / 8                       // unclamped
wingDrive = clamp(rateEscW / 10, 0, 1.3)
arousal   = clamp(ratePop / 20, 0, 1)
```

Live loop then overlays environment (not inside `SignalBuilder`):

- `s.tempo = environmentTempo` (was `thermalTempo`)
- `s.sleep = sleepy`

`--behaviortest` stim scenarios use `SignalBuilder` only (tempo defaults to 1,
sleep defaults to false).

### Fly hysteresis (`FlyModel.swift` `brainBehavior`)

| trigger | condition | action |
|---|---|---|
| escape | `s.escape && scareCooldown == 0` | `startFlight(..., escape: true)` even from sleep |
| sleep enter | `s.sleep` | `state = sleeping`, speed/dart/backward = 0 |
| sleep wake | `!s.sleep` while sleeping | `state = grooming` |
| nervous dart | `s.nervous > 0.40 && dartCooldown == 0` | walking, speed `rnd(110...155)`, dart 0.4–0.9 s, cooldown 1.2 s |
| groom enter | `groomDrive > 0.5 && nervous < 0.3 && stateAge > 0.4` | grooming (not during dart) |
| groom exit | `groomDrive < 0.3 && stateAge > 0.6` | idle |
| walk enter | idle && `walkDrive > 0.22 && stateAge > 0.4` | walking |
| walk exit | walking && no dart && `walkDrive < 0.08 && stateAge > 0.5` | idle, speed 0 |
| MDN reverse | `s.backward && backwardTimer == 0 && dartTimer == 0` | `backwardTimer = 0.5` from any grounded state |
| walk speed | walking, no dart/back | `target = (14 + walkDrive * 55) * tempo` |
| spontaneous takeoff | walking | `flightChance = arousal > 0.5 ? 0.6 : 0.005` per second |

`--simtest` walk-on uses the same walk threshold: `rateFwd / 10 > 0.22`.
Groom-on: `rateGroom / 8 > 0.5`.

---

## `--simtest` PASS predicate

From `runSimtest()`:

```
pass = gfSpont == 0 && gfLoom > 0 && walkOn > 0 && gfStim && siestaPct > 3
```

Phases (must keep this sequence and these inputs):

1. **Spontaneous 4 s** — 40 × `step(100)`. Count GF latches → `gfSpont`. Must be **0**.
2. **Abrupt loom 0.4 s** — `loomL = 1.0`, `loomR = 0.5`, 400 × `step(1)`. `gfLoom` = GF spike count. Must be **> 0**. First spike latency is printed (real animal ~4 ms); not part of the boolean predicate.
3. **Behavior 20 s** — `gaitDrive = 0.5`, 8 Hz gait (`(ms % 125) / 125`), sample every 10 ms. `walkOn` += 1 when `rateFwd / 10 > 0.22`. Must be **> 0**.
4. **Siesta 15 s** — `activityScale = 1 - (1 - 0.55) * 0.35` (= **0.84**). `siestaPct = 100 * siestaWalkOn / siestaSamples`. Must be **> 3**.
5. Air puff 1 s (`airPuff = 1.0`) — printed, not in predicate.
6. Left-eye loom 1 s (`loomL = 0.30`, `loomR = 0`) — printed, not in predicate.
7. Click probes — `stimulate(gf, 0.5, 40 ms)` then `step(60)` → `gfStim = consumeGF()`. Must be **true**. DNg11 stim is printed only.

PASS print string:

`PASS: GF silent at rest, fires on loom; locomotor drive fluctuates; stim works; siesta alive`

FAIL: `FAIL: tune weights/noise`, exit 1.

Vitest must assert the same five-term predicate. Do not add extra required terms
to the gate (print-only probes may still be logged).

---

## `--behaviortest`: 7 stim scenarios + bodyChecks

Bounds `1512×982`, `dt = 1/60`. Each stim scenario: new `LIFSim` + `SignalBuilder` + `Fly` at origin, idle, speed 0; `step(400)` settle; drain GF; stim; then `step(round(dt*1000))` + `builder.make` + `fly.update` until `hold` or check passes.

### 7 stim scenarios

| # | name | stim | hold | check |
|---|---|---|---|---|
| 1 | `GF stim -> escape flight` | `stimulate(gf, 0.5, 40 ms)` | 0.5 s | `state == flying` |
| 2 | `DNg11 stim -> grooming` | `stimulate(groom, 0.25, 600 ms)` | 1.5 s | `state == grooming` |
| 3 | `DNp09 stim -> walks, speed rises (capped)` | `stimulate(fwd, 0.25, 1200 ms)` | 1.5 s | `state == walking && speed > 40 && speed < 100` |
| 4 | `MDN stim (from idle) -> backward walk` | `stimulate(mdn, 0.3, 600 ms)` | 1.2 s | `backwardTimer > 0` |
| 5 | `DNa-left stim -> left (CCW) turn while walking` | `stimulate(dnaL, 0.3, 900 ms)`; setup walking, speed 30, heading 0 | 1.4 s | `heading - heading0 > 0.25` |
| 6 | `moderate loom -> fear response (dart or escape)` | `loomL = loomR = 0.45` | 1.0 s | `(walking && speed > 100) \|\| flying` |
| 7 | `tap near fly -> startle escape via sensory pathway` | `stimulate(sens, 0.45, 150 ms)` | 0.8 s | `state == flying` |

### Body checks

Upstream has **10** `bodyCheck` calls (README: 17 end-to-end = 7 stim + 10 body).
Port all of them. Shared `walkSignals`: `walkDrive = 0.6`.

| # | name | assertion |
|---|---|---|
| 1 | `ledge attach + follow window edge` | Fly at `(0, -55)`, walking speed 30 heading 0, terrain `Ledge(y: -40, x0: -300, x1: 300, id: 1)`. Within 240 frames: `ledge != nil && abs(pos.y + 40) < 8` |
| 2 | `window closes underfoot -> takeoff` | On ledge then `terrain = []`. Within 60 frames: `state == flying` |
| 3 | `sleep signal -> sleeping; wake -> grooming` | 60 frames `sleep=true` → sleeping; one frame `sleep=false` → grooming |
| 4 | `thermal tempo scales walking speed` | 120 frames `tempo=1.0` then 120 frames `tempo=1.5`; still walking and `hotSpeed > coolSpeed + 10` |
| 5 | `flight: altitude drives scale; escape flies higher than casual` | `esc.alt > casual.alt + 0.15 && esc.scale > FLY_SCALE * 1.5 && abs(esc.scale - FLY_SCALE * (1 + 0.8 * esc.alt)) < 0.15`. Casual effort `0.45`. `FLY_SCALE = 1.15` |
| 6 | `flight: wings actually beat` | 30 flying frames; wing euler Z sweep `hi - lo > 0.25` |
| 7 | `escape-DN activity mid-flight raises wing-beat effort` | 12 calm frames then 12 with `wingDrive=1.0`, `arousal=0.6`; still flying and `hotEffort > calmEffort + 0.2` |
| 8 | `threat while grounded raises the wings (no takeoff)` | walking, `dartCooldown=99`, `wingDrive=0.9`, `walkDrive=0.4`, 40 frames: `state != flying && wingRaise > 0.6 && wing euler X < -0.2` |
| 9 | `landing is smooth: no scale/height snap at touchdown` | escape flight until landed + 20 extra frames, max 600: `landed && maxDS < 0.2 && maxDZ < 25` |
| 10 | `circadian curve: siesta + night dips, dawn/dusk peaks` | `circadianActivity(3) < 0.4 && (9) > 0.9 && (14) < 0.7 && (14) > 0.3 && (18) > 0.9` |

Circadian control points (`Environment.swift`):

```
(0, 0.25), (5, 0.25), (8, 1.0), (10, 1.0), (13, 0.55),
(15, 0.55), (17, 1.0), (20, 1.0), (23, 0.3), (24, 0.25)
```

Linear interpolate between adjacent hours.

Exit 0 iff `failures == 0`.

---

## `DesktopEnvironment` TypeScript interface

From `plan.md`. Everything north of this line is identical across platforms.
Hide native input behind `desktop.onMouseDown` — never leak `libuiohook` into
app code.

```ts
interface Point {
  x: number
  y: number
}

interface DesktopWindow {
  id: number | string
  x: number
  y: number
  width: number
  height: number
}

interface DesktopEnvironment {
  getWindows(): DesktopWindow[]
  getCursor(): Point
  getIdleSeconds(): number

  onMouseDown(cb: (event: MouseEvent) => void): void

  getThermalFactor(): number
}
```

`getThermalFactor()` is **`environmentTempo`** (generalized from macOS
`thermalTempo`):

| platform | source | mapping |
|---|---|---|
| macOS | `ProcessInfo.thermalState` | `.nominal → 1.0`, `.fair → 1.15`, `.serious → 1.35`, `.critical → 1.5` |
| Windows | CPU speed-limit / power state (Electron `powerMonitor`) | same numeric range intent; 1.0 when unlimited |
| Linux | none | **1.0** fallback |

Sleep (from `AppDelegate` mouse timer, preserve):

- `sleepy = (idle > 600 && (hour >= 22 \|\| hour < 6)) \|\| idle > 1800`

Window-sense filters to port when implementing ledges (Phase 5): layer 0,
not our PID, alpha > 0.05, width ≥ 160, height ≥ 60, top edge on this display,
`x1 - x0 > 100`, at most 12 ledges, inset 15 pt from display edges.

---

## Electron overlay contract

One **transparent `BrowserWindow` per physical display**, not one virtual-desktop
monster. Electron `screen` owns topology, scaling, and cursor.

```ts
new BrowserWindow({
  x: display.bounds.x,
  y: display.bounds.y,
  width: display.bounds.width,
  height: display.bounds.height,

  transparent: true,
  frame: false,
  resizable: false,
  movable: false,
  focusable: false,
  skipTaskbar: true,
  alwaysOnTop: true,

  webPreferences: {
    backgroundThrottling: false
  }
})

win.setIgnoreMouseEvents(true, { forward: true })
```

Upstream macOS overlay (`AppDelegate`): borderless, opaque false, clear
background, no shadow, floating level, `ignoresMouseEvents = true`,
`.canJoinAllSpaces | .stationary | .fullScreenAuxiliary`. Port must remain
click-through.

On display change: retarget bounds, clear stale terrain, clamp flies inside
the new display (upstream `Coordinator.retarget`).

Windows is the primary overlay target. Linux ships via X11/XWayland. Native
Wayland is degraded.

---

## Support matrix

| Target | Rating | Notes |
|---|---|---|
| Windows | **5** / ★★★★★ | Primary overlay target. Win32 `EnumWindows` + DWM bounds → ledges. |
| macOS | **5** / ★★★★★ | Existing behavior known; recreate native sensing behind `DesktopEnvironment`. |
| Linux X11 | **4** / ★★★★☆ | Official Linux path. |
| Linux XWayland | **4** / ★★★★☆ | Ship Linux through XWayland when the session is Wayland. |
| Linux native Wayland | **2** / ★★☆☆☆ | Degraded: compositors block global window inspection and free positioning. |

---

## Out of scope for this harvest

Do not implement the port in this step. Ground truth is `vendor/desktop-fly/`
plus `data/circuit.json`. After any sim/etl change, `--simtest` must PASS.
After any behavior change, `--behaviortest` must PASS (all 7 stim + 10 body).
