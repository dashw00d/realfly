<h1 align="center">realfly</h1>

<p align="center">
A small cross-platform <strong>desktop-creature engine</strong>. Creature #1 is
a port of <a href="https://github.com/DenisSergeevitch/desktop-fly">DesktopFly</a>:
a fruit fly on a transparent overlay, driven by a live 1&nbsp;kHz leaky-integrate-and-fire
simulation of a real <a href="https://codex.flywire.ai">FlyWire</a> connectome
circuit.
</p>

<p align="center">
  <video src="docs/fly.mp4" poster="docs/fly.jpg" width="720" autoplay muted loop playsinline controls>
    <source src="docs/fly.mp4" type="video/mp4">
    <source src="docs/fly.webm" type="video/webm">
  </video>
</p>

<p align="center"><sub>
The fly living on a Windows desktop — click-through overlay, connectome-driven
escape. Source clip: <a href="docs/fly.webm">docs/fly.webm</a>
</sub></p>

<p align="center"><sub>
The brain window (Show/Hide Brain in the tray) plots 23,210 real neuron soma
positions from FlyWire v783. Spikes flash at those locations; the two yellow
markers are the Giant Fibers. Click a region to stimulate it.
</sub></p>

This is a **port**, not a rewrite. LIF constants, hysteresis thresholds, and
`SignalBuilder` mappings are copied from the upstream macOS Swift app and
locked in [`docs/PORT_CONTRACT.md`](docs/PORT_CONTRACT.md). Architecture:
[`plan.md`](plan.md). Upstream clone: `vendor/desktop-fly/` (do not edit).

Windows is the primary overlay target. Linux ships via X11/XWayland. Native
Wayland is degraded — see [Support](#support) and [`docs/SUPPORT.md`](docs/SUPPORT.md).
Do not expect native Wayland parity.

---

## What's real

- **23,210 neuron soma positions** (of 139,255 in FlyWire v783) render the
  rotating brain window, colored by super-class (FlyWire's coarse cell-type
  grouping).
- **A 668-neuron circuit with ~19,000 real synaptic connections** (synapse
  counts, signed by neurotransmitter prediction) runs as a 1 kHz
  leaky-integrate-and-fire (LIF) simulation:
  - **LC4 (104) + LPLC2 (210)** looming-detector visual neurons
  - **DNp01 / Giant Fiber (GF) (2)** — the escape command neuron
  - **DNa01 + DNa02 (4)** steering neurons · **DNp09 (2)** forward walking
  - **DNg11 (6)** grooming · **MDN (4)** backward walking ("moonwalker")
  - **DNp02/DNp04/DNp11 (6)** escape-maneuver (wing) neurons
  - their 330 strongest partners, including ascending (proprioceptive) and
    sensory (wind) neurons
- **Escape is not scripted.** Your cursor's approach becomes looming input to
  the real LC4/LPLC2 cells; the fly takes off only when the Giant Fiber
  actually spikes through its real synapses — ~1,200 synapses of feedforward
  inhibition push back, which is why slow approaches are tolerated and fast
  lunges trigger escape in ~4 ms, just like the real animal.

The body itself is procedural (FlyWire is a brain connectome — no body
geometry exists), with a tripod gait, visible wing-beat, altitude-scaled
flight, grooming, and sleep postures.

### Honesty: what's modeled vs. measured

The connectome gives **wiring, not physiology**. The LIF dynamics,
neurotransmitter signs (ACh+, GABA−, Glu−), the gap-junction boost on LC→GF
and wind→GF (documented electrical coupling), synaptic delays, and the
sensory transduction (cursor → looming value) are standard modeling choices
layered on the real graph. Everything downstream of the sensory neurons —
who connects to whom, and how strongly — is FlyWire data.

The body is invented: tripod gait, wing kinematics, ledge following, and
sleep posture are not in the connectome. Circadian activity is a
hand-authored curve (dawn/dusk peaks, midday siesta). `environmentTempo`
generalizes upstream macOS `thermalTempo` (hot Mac → faster fly) to
platform power/thermal signals; Linux stays at 1.0.

---

## Install

Requirements: **Node.js ≥ 22** and **pnpm 11**. Rust/`cargo` is **not**
required to run.

```sh
pnpm install
pnpm build
pnpm start
```

`pnpm start` is `node scripts/build.mjs && electron .`. A 🪰 item appears in
the system tray; quit from there. The fly wanders a transparent,
click-through overlay — it never intercepts your mouse or keyboard.

### WSL / WSLg

Do **not** expect tap-to-startle (or window ledges) from Linux Electron
inside WSL. WSLg paints the overlay onto the Windows desktop, but
`uiohook` is attached to the Linux GUI stack, so clicks in Chrome / VS
Code never arrive. Run a **Win32** Electron instead:

```sh
pnpm start:win
```

That rsyncs to `C:\Users\ryan\sites\realfly` and launches Windows Node +
Windows Electron (VS 2022 Community is enough to rebuild the hook). Or
open that folder in PowerShell and `npm start`.

Packaged exe (from Windows or WSL with Electron's win32 download):

```sh
pnpm dist:win
```

Output is `release/win-unpacked/DesktopFly.exe` and a portable exe.

### Native addon (optional)

Window ledges and native idle live in `native/desktop-env` (NAPI-RS). This
host does not have `rustc`, so **`pnpm start` uses the JavaScript fallback**
for window enumeration until `native/desktop-env` is built on a machine
with Rust.

Tap-to-startle does **not** need that crate. Overlay windows are
click-through, so clicks are captured with `uiohook-napi` behind
`desktop.onMouseDown` (`pnpm rebuild:hooks` after install). Hide that
library — never import it from overlay or world-loop code.

Without `desktop-env.node`:

- window enumeration is empty → no walkable ledges, no window-loom
- `environmentTempo` is 1.0 (Linux is 1.0 even with the addon)
- tap-to-startle still works when the Electron-rebuilt hook loads (X11 /
  XWayland / Windows / macOS; not native Wayland)

---

## Tests

Upstream `--simtest` / `--behaviortest` are Vitest suites (`src/tests/`).
The sim is 1 kHz; the timeout is 120 s.

```sh
pnpm test
```

`--simtest` must PASS: GF silent at rest, fires on loom; locomotor drive
fluctuates; stim works; siesta alive. `--behaviortest` is 17 end-to-end
checks (7 neuron stim scenarios + 10 body checks). Do not retune LIF
constants to make a test green — see the port contract.

Also available: `pnpm typecheck`.

---

## Tray controls

| item | effect |
|---|---|
| Pause / Resume | freeze the world |
| Show/Hide Brain | toggle the live brain window |
| Escape Test (loom) | inject a looming stimulus, watch the GF fire |
| Move to Next Display | hop the fly across monitors (shown when >1 display) |
| Add / Remove Fly | extra flies (only fly #1 carries the brain) |
| Scare Flies | startle everyone |
| Quit | quit the app |

**The brain window is interactive**: hovering pauses the rotation; clicking a
region "optogenetically" stimulates the ~60 nearest circuit neurons. The
fly's reaction is whatever the real network does downstream — click the
Giant Fiber and it escapes; click DNg11 and it grooms; click one side's
DNa01/02 and it turns.

---

## How real neurons drive the body

| body behavior | driven by |
|---|---|
| escape takeoff | DNp01 giant fiber spike |
| walk vs. rest, walking speed | DNp09 rate |
| steering | DNa01+DNa02 left−right rate difference |
| grooming | DNg11 rate |
| backward scoot | MDN burst |
| nervous darting | LC4/LPLC2 population rate |
| wing-beat effort, threat wing-raise | DNp02/04/11 rate |
| spontaneous takeoff | whole-population arousal |

The loop also closes body→brain: the gait rhythm feeds the circuit's real
ascending (proprioceptive) neurons in phase with the legs, and fast cursor
motion stimulates its sensory (wind) partners.

---

## Desktop ecology

- **Window terrain** (needs native addon): window top edges are ledges — the
  fly lands on them, walks along them, rides a window you drag, and startles
  when one closes under its feet.
- **Window looms** (needs native addon): a window appearing near the fly
  feeds the looming pathway; the circuit decides whether to flee your
  dialogs.
- **Clicks are substrate taps**; clicking next to the fly startles it
  through the wind→GF pathway (`uiohook-napi` behind `desktop.onMouseDown`).
  **Typing is vibration** (idle-time API — knows *when* keys were pressed,
  never which).
- **Circadian rhythm**: dawn/dusk activity peaks, midday siesta, night
  quiescence. **Sleep**: idle at night → it sleeps, breathing slowly, with
  raised arousal threshold; it grooms after waking.
- **environmentTempo** (was macOS `thermalTempo`): flies are ectotherms.
  macOS thermal state and Windows CPU speed-limit / power scale walking
  speed; Linux is 1.0.

---

## Support

| Target | Rating | Notes |
|---|---|---|
| Windows | ★★★★★ | Primary overlay target. Win32 `EnumWindows` + DWM bounds → ledges. |
| macOS | ★★★★★ | Existing behavior known; native sensing behind `DesktopEnvironment`. |
| Linux X11 | ★★★★☆ | Official Linux path. |
| Linux XWayland | ★★★★☆ | Ship Linux through XWayland when the session is Wayland. |
| Linux native Wayland | ★★☆☆☆ | Degraded. Compositors block global window inspection and free overlay positioning. **No parity.** |

On a Wayland session, run via XWayland (`DISPLAY` set). Native Wayland
cannot freely place always-on-top overlays or enumerate foreign windows —
that is the whole gimmick. Details: [`docs/SUPPORT.md`](docs/SUPPORT.md).

---

## Regenerating the data

`data/` ships with compact derived files. To rebuild them from the raw
FlyWire Codex dumps (~60 MB download):

```sh
mkdir -p /tmp/flywire && cd /tmp/flywire
B=https://storage.googleapis.com/flywire-data/codex/data/fafb/783
curl -O "$B/classification.csv.gz" -O "$B/coordinates.csv.gz" \
     -O "$B/connections.csv.gz" -O "$B/consolidated_cell_types.csv.gz"
cd - && python3 etl.py /tmp/flywire
```

---

## Layout

```
src/shared/          types, BrainSignals, Creature, rng, circadian
src/sim/             LIFSim, SpikeBus, SignalBuilder, circuit loader
src/creature/        Fly (headless behavior; no Three)
src/renderer/        Three.js fly + brain + overlay
src/main/            Electron: tray, displays, overlay, world-loop, ecology
src/worker/          1 kHz sim worker (LIFSim + SignalBuilder)
native/desktop-env   NAPI-RS window/cursor/idle (optional; JS fallback works)
data/                circuit.json + brain_points.json (CC BY-NC 4.0)
vendor/desktop-fly   untouched upstream
```

---

## License & citation

Code is MIT. The files in `data/` are derived from FlyWire (FAFB v783) and
are **CC BY-NC 4.0** — see [data/DATA_LICENSE.md](data/DATA_LICENSE.md).
Do not merge those licenses.

If you use this, cite:

- Dorkenwald, S. et al. *Neuronal wiring diagram of an adult brain.* Nature 634, 124–138 (2024). https://doi.org/10.1038/s41586-024-07558-y
- Schlegel, P. et al. *Whole-brain annotation and multi-connectome cell typing of Drosophila.* Nature 634, 139–152 (2024). https://doi.org/10.1038/s41586-024-07686-5
