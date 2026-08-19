# Enhance report (0.1.2)

Enhancement of the existing Electron port — not a rewrite. LIF constants,
`--simtest`, and `--behaviortest` were not retuned or weakened. Desktop-food,
extra creature models, and YAML personalities were skipped.

This host: Node 22.23.2, pnpm 11.3.0, rustc 1.97.1. Windows is the primary
runtime. WSL Linux Electron cannot see Win32 windows.

---

## What landed

### Native window ledges (Windows portable)

`native/desktop-env/desktop-env.win32-x64-msvc.node` exists on disk (Win32
x64 PE, ~210 KB). `scripts/build.mjs` copies `*.node` into
`dist/native/desktop-env/`. electron-builder packs them via `files` +
`extraResources` (`native/desktop-env` → `resources/native/desktop-env`).
`*.node` stays gitignored; the portable exe still embeds the file from disk
at pack time.

`createDesktopEnvironment()` searches unpacked / extraResources / cwd
paths, including `desktop-env.win32-x64-msvc.node`. On load it uses
`NativeDesktopEnvironment` (`EnumWindows` + DWM extended-frame bounds).
On miss it stays on `FallbackDesktopEnvironment` (`getWindows() === []`).

`WindowSense` still converts top edges to at most 12 ledges (width ≥ 160,
height ≥ 60, x1−x0 > 100, inset 15 pt, overlay-sized windows rejected).
First successful poll logs `window ledges: N`. New windows (including
toast-sized, not a ledge) inject `WindowLoom` into fly #1.

### Habitat through existing sensors

Typing uses idle-time only (`typingFromIdle`, never which keys).
`World.typing` → `Fly.typing` → `abdomenBreathe` (faster, smaller pulse
when typing > 0.1). The same intensity also feeds `airPuff` at
`typing * 0.3` — existing sensory API, no new circuit.

New small windows go through `WindowSense.newWindows` + `windowLoomStrength`
+ `WindowLoom.inject` (same loom path as cursor / toast). No toast COM,
no second species.

### Extra flies (no second 1 kHz circuit)

Only fly #1 is stepped through `LIFSim` (`sim.step` once per world tick).
`WorldFrame.signals` is still fly #1 only. Extras get `signals = null`
plus `extrasMood`: a ~300 ms delayed, ±8% noisy copy of the leader’s
walk / nervous / escape / groom / heading. Overlay `applyExtrasMood`
nudges extras (escape, dart, groom, walk, prefer leader ledge). Not a
second connectome.

### Brain instrument HUD

Brain window is 420×360. Overlay HUD: GF silent/SPIKE, LC4/LPLC2 Hz
(`nervous * 80`), walk, groom, MDN backward, loom L/R, last stim role →
body (`gf=escape`, `dng11=groom`, `dnp09=walk`, `mdn=backward`,
`dna=steer`, `lc/lplc2=loom/nervous`). 1.6 s sparkline of loom + GF
ticks. Click-to-stim label includes `role → body`. Pointer over the
canvas pauses rotation (click still works).

### Tray / CLI / login

- Tooltip every 500 ms: `Desktop Fly | GF silent|SPIKE | loom 0.00`
- **Open at login** (`app.setLoginItemSettings`)
- `--snapshot [path]` / `--brainshot [path]` write PNGs then exit

### Tests (this run)

**`pnpm typecheck`** and **`pnpm test`** are green. 11 files, 53 tests.

```
Test Files  11 passed (11)
     Tests  53 passed (53)
```

`src/tests/sim.test.ts` and `src/tests/behavior.test.ts` were not
weakened. New `src/tests/habitat.test.ts` covers typing → abdomen twitch
and toast-sized window loom.

---

## Does `desktop-env.node` exist?

| | |
|---|---|
| On disk | **Yes.** `native/desktop-env/desktop-env.win32-x64-msvc.node` (PE32+ Win32 x64, 2026-08-19). |
| In git | **No.** `*.node` is gitignored. Rebuild on Win32 if the file is missing. |
| In 0.1.2 portable | Packed from disk via `extraResources` + `files`. |
| ABI | Win32 x64 MSVC. WSL Linux Electron cannot `require` this file. |

There is no Linux `desktop-env.node` in this tree. Linux/WSL stays on the
JS fallback (empty window list).

---

## How to enable ledges

Ledges are on when **all** of these are true:

1. Run the **Win32** portable (`DesktopFly.exe`), not WSL/Linux Electron.
2. `desktop-env.win32-x64-msvc.node` is next to the app
   (`resources/native/desktop-env/` in the portable, or
   `native/desktop-env/` in a source checkout).
3. Other apps have visible windows that pass the filter (Chrome / VS Code
   / Explorer tops). Full-screen overlay-sized surfaces are rejected.

There is no YAML flag. If the addon fails to load, fallback
`getWindows()` is `[]` and the fly never sees terrain. Rebuild on
Windows (VS 2022 Community + rustc):

```sh
# from native/desktop-env, or via napi-cli once wired
cargo build --release
# copy the resulting desktop-env.win32-x64-msvc.node into native/desktop-env/
```

WSL/WSLg Linux Electron will **not** enumerate Win32 windows even if
rustc is present here — the compiled `.node` is a Windows DLL.

---

## Leftover

- Native crate `on_mouse_down_supported` is still `false`. Tap-to-startle
  stays on `uiohook-napi` in the JS desktop-env.
- No Linux/macOS `.node` in this ship; those platforms use fallback
  windows (`[]`) unless rebuilt locally.
- Native Wayland is still degraded (empty window list).
- `--snapshot` / `--brainshot` exist; they are not wired into CI.
- Desktop-food, extra creature models, YAML personalities: skipped on
  purpose.
- `*.node` is not in git; a clean clone must rebuild the addon on Win32
  before packing, or copy the existing `desktop-env.win32-x64-msvc.node`
  onto disk.

---

## Ship

- Version: **0.1.2**
- Artifact: `release/DesktopFly 0.1.2.exe` → Desktop `DesktopFly.exe`
- GitHub: `v0.1.2` (published, not draft), same style as `v0.1.1`
