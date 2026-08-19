let meta = #{
    name: "port-desktop-fly",
    description: "One-shot port of DesktopFly (Swift/SceneKit) into a cross-platform Electron + Three.js + napi-rs creature engine",
    when_to_use: "Port DenisSergeevitch/desktop-fly into this repo as a Windows-first Electron app",
    phases: [
        #{ title: "Harvest", detail: "clone upstream Swift sources and FlyWire data" },
        #{ title: "Scaffold", detail: "Electron/TS/vitest/napi-rs skeleton" },
        #{ title: "Brain", detail: "LIFSim + SignalBuilder + sim tests" },
        #{ title: "Behavior", detail: "headless Fly + behavior tests" },
        #{ title: "Surfaces", detail: "Three.js, Electron overlay, native desktop-env in parallel" },
        #{ title: "Wire", detail: "worker, ecology, clicks, environmentTempo" },
        #{ title: "Verify", detail: "sim, behavior, and typecheck in parallel" },
        #{ title: "Docs", detail: "README, support matrix, port report" },
    ],
};

let status_schema = #{
    "type": "object",
    "required": ["ok", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "files": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["passed", "summary"],
    "properties": #{
        "passed": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "failures": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

fn trimmed(s) {
    if type_of(s) == "string" { s.trim(); s } else { "" }
}

fn is_map(x) { type_of(x) == "map" }
fn is_arr(x) { type_of(x) == "array" }

fn did_pass(r) {
    r != () && r.success && is_map(r.output) && r.output.passed == true
}

fn did_ok(r) {
    r != () && r.success && is_map(r.output) && r.output.ok == true
}

fn fail_list(r) {
    if r != () && r.success && is_map(r.output) && is_arr(r.output.failures) {
        return json_encode(r.output.failures);
    }
    "[]"
}

fn rules() {
    let t = "";
    t += "WORKSPACE: /home/ryan/sites/realfly\n";
    t += "UPSTREAM CLONE: vendor/desktop-fly (read this; do not edit it)\n";
    t += "PORT CONTRACT: docs/PORT_CONTRACT.md (read before writing code)\n";
    t += "PLAN: plan.md (architecture source of truth)\n\n";
    t += "This is a PORT, not a rewrite from vibes. Read the matching Swift file with read_file before translating.\n";
    t += "Preserve LIF constants, hysteresis thresholds, SignalBuilder mapping, and test assertions.\n";
    t += "Architecture: a small cross-platform desktop-creature engine; DesktopFly is creature #1.\n";
    t += "Stack: pnpm, TypeScript, Electron, Three.js, vitest, esbuild. Native addon via NAPI-RS under native/desktop-env.\n";
    t += "This Linux host has Node 22 + pnpm 11. rustc/cargo are NOT installed — native crate is source-only; Electron fallback must work.\n";
    t += "Do not add React/Vue/Solid. Do not use isolation. Do not commit secrets.\n";
    t += "License split: code MIT; data/ is FlyWire CC BY-NC 4.0. Keep DATA_LICENSE.md.\n";
    t += "Windows is the primary overlay target. Linux ships via X11/XWayland. Native Wayland is degraded.\n";
    t += "Generalize macOS thermalTempo to environmentTempo (macOS thermal state, Windows speed-limit/power, Linux 1.0).\n";
    t += "Hide native input behind desktop.onMouseDown — never leak libuiohook into app code.\n";
    t += "Idempotent: inspect existing files before recreating. Prefer editing over duplicating.\n";
    t
}

fn layout() {
    let t = "";
    t += "Required tree:\n";
    t += "  package.json, tsconfig.json, vitest.config.ts, scripts/build.mjs, .gitignore, README.md, LICENSE\n";
    t += "  data/                 (copied from upstream; circuit.json + brain_points.json + DATA_LICENSE.md)\n";
    t += "  src/shared/           types, BrainSignals, Ledge, rng, Creature interface\n";
    t += "  src/sim/              load-circuit.ts, lif-sim.ts, spike-bus.ts, signal-builder.ts\n";
    t += "  src/creature/         fly.ts (headless behavior; no Three)\n";
    t += "  src/renderer/         fly-model.ts, fly-scene.ts, brain-scene.ts, overlay.ts, overlay.html, brain.html\n";
    t += "  src/main/             index.ts, tray.ts, displays.ts, overlay-manager.ts, environment.ts, desktop-env.ts\n";
    t += "  src/worker/           sim-worker.ts\n";
    t += "  src/tests/            sim.test.ts, behavior.test.ts, circadian.test.ts\n";
    t += "  native/desktop-env/   napi-rs crate (windows/macos/linux modules + JS fallback path)\n";
    t += "  vendor/desktop-fly/   untouched upstream clone\n";
    t
}

fn retry_once(fix_prompt, fix_label, verify_prompt, verify_label, st_schema, v_schema) {
    log("Retrying once: " + fix_label);
    let fx = agent(fix_prompt, #{
        label: fix_label,
        capability_mode: "all",
        output_schema: st_schema,
    });
    let v2 = agent(verify_prompt, #{
        label: verify_label,
        capability_mode: "all",
        output_schema: v_schema,
    });
    v2
}

// ---------------------------------------------------------------------------
phase("Harvest");
log("Cloning upstream DesktopFly and writing the port contract");

let harvest_prompt = "";
harvest_prompt += rules();
harvest_prompt += "TASK: Harvest the original macOS app so later agents can port it faithfully.\n";
harvest_prompt += "1. git clone --depth 1 https://github.com/DenisSergeevitch/desktop-fly.git vendor/desktop-fly\n";
harvest_prompt += "   If vendor/desktop-fly already exists and contains Sim.swift, skip the clone.\n";
harvest_prompt += "2. Copy vendor/desktop-fly/data/ to data/ (entire directory, including DATA_LICENSE.md).\n";
harvest_prompt += "3. Copy vendor/desktop-fly/LICENSE to LICENSE if missing.\n";
harvest_prompt += "4. Copy vendor/desktop-fly/etl.py to etl.py.\n";
harvest_prompt += "5. Write docs/PORT_CONTRACT.md with:\n";
harvest_prompt += "   - file map (Swift -> TypeScript)\n";
harvest_prompt += "   - LIF constants (decay 0.9512, threshold 1.0, refractory 2ms, weightScale 0.0008,\n";
harvest_prompt += "     pNoise 0.0022, noiseKick 0.42, loomGain 0.30, inhDelay 4ms, gapJunctionBoost 6)\n";
harvest_prompt += "   - SignalBuilder mapping (exact numbers from vendor/desktop-fly/main.swift)\n";
harvest_prompt += "   - --simtest PASS predicate: gfSpont==0 && gfLoom>0 && walkOn>0 && gfStim && siestaPct>3\n";
harvest_prompt += "   - the 7 stim scenarios + 9 bodyChecks from runBehaviorTest\n";
harvest_prompt += "   - DesktopEnvironment TS interface from plan.md\n";
harvest_prompt += "   - Electron overlay contract (one transparent BrowserWindow per display, ignoreMouseEvents)\n";
harvest_prompt += "   - support matrix (Windows 5, macOS 5, Linux X11 4, XWayland 4, native Wayland 2)\n";
harvest_prompt += "6. Write docs/UPSTREAM_INVENTORY.md listing each Swift file, its size, and the TS destination.\n";
harvest_prompt += "Read Sim.swift, FlyModel.swift, Environment.swift, BrainView.swift, CLAUDE.md, and the runSimtest/runBehaviorTest/SignalBuilder sections of main.swift.\n";
harvest_prompt += "Do not implement the port yet.\n";
harvest_prompt += "Return ok=true only if vendor/desktop-fly/Sim.swift and data/circuit.json both exist.\n";

let harvest = agent(harvest_prompt, #{
    label: "harvest:upstream",
    capability_mode: "all",
    output_schema: status_schema,
});

if !did_ok(harvest) {
    log("Harvest did not confirm sources; continuing and letting scaffold re-check");
}

// ---------------------------------------------------------------------------
phase("Scaffold");
log("Creating the Electron + TypeScript skeleton");

let scaffold_prompt = "";
scaffold_prompt += rules();
scaffold_prompt += layout();
scaffold_prompt += "TASK: Scaffold the repo so later agents only fill in logic.\n";
scaffold_prompt += "Create package.json with name realfly, private, type module, packageManager pnpm.\n";
scaffold_prompt += "Dependencies: electron, three. Dev: typescript, vitest, esbuild, @types/node, @types/three.\n";
scaffold_prompt += "Scripts: test (vitest run), build (node scripts/build.mjs), start (pnpm build && electron .), typecheck (tsc --noEmit).\n";
scaffold_prompt += "main: dist/main/index.js. engines.node >= 22.\n";
scaffold_prompt += "tsconfig: strict, ES2022, bundler resolution, include src.\n";
scaffold_prompt += "vitest.config.ts: environment node, include src/tests/**/*.test.ts, testTimeout 120000 (sim is 1kHz).\n";
scaffold_prompt += "scripts/build.mjs: esbuild bundle src/main/index.ts (platform node, external electron),\n";
scaffold_prompt += "  src/worker/sim-worker.ts, src/renderer/overlay.ts, src/renderer/brain.ts (if present),\n";
scaffold_prompt += "  copy overlay.html/brain.html into dist/renderer, copy data/ to dist/data.\n";
scaffold_prompt += ".gitignore: node_modules, dist, out, .vite, native/**/target, *.node, .DS_Store.\n";
scaffold_prompt += "Create stub files (real modules, not empty) that later agents will replace:\n";
scaffold_prompt += "  src/shared/types.ts — Point, DesktopWindow, Ledge, CreatureId\n";
scaffold_prompt += "  src/shared/brain-signals.ts — BrainSignals fields matching Swift (escape, nervous, turnBias, backward, walkDrive, groomDrive, wingDrive, arousal, tempo, sleep)\n";
scaffold_prompt += "  src/shared/rng.ts — seedable mulberry32; default seed 1 in tests\n";
scaffold_prompt += "  src/shared/creature.ts — Creature interface: id, update(dt, world, signals), position, heading, state\n";
scaffold_prompt += "  src/sim/lif-sim.ts — export class LIFSim { constructor(circuit, opts?); step(ms); consumeGF(); stimulate() } throwing 'not implemented' until Brain phase\n";
scaffold_prompt += "  src/creature/fly.ts — export class Fly throwing until Behavior phase\n";
scaffold_prompt += "  src/main/desktop-env.ts — DesktopEnvironment interface + fallback implementation using electron screen if available, else zeros\n";
scaffold_prompt += "  native/desktop-env/README.md — napi-rs plan, Windows EnumWindows path, XCap as reference\n";
scaffold_prompt += "Write src/tests/scaffold.test.ts that asserts BrainSignals keys exist so pnpm test is green on an empty brain.\n";
scaffold_prompt += "Run pnpm install in the workspace root.\n";
scaffold_prompt += "Do NOT port Sim.swift or FlyModel.swift in this phase.\n";
scaffold_prompt += "Return ok=true only after pnpm install succeeds and package.json exists.\n";

let scaffold = agent(scaffold_prompt, #{
    label: "scaffold:repo",
    capability_mode: "all",
    output_schema: status_schema,
});

if !did_ok(scaffold) {
    log("Scaffold reported failure; later phases will try to recover");
}

// ---------------------------------------------------------------------------
phase("Brain");
log("Porting LIFSim and writing --simtest as vitest");

let brain_prompt = "";
brain_prompt += rules();
brain_prompt += layout();
brain_prompt += "TASK: Phase 1 of plan.md — port the brain. No Electron. No Three. No desktop.\n";
brain_prompt += "Read in full: vendor/desktop-fly/Sim.swift, the runSimtest() and SignalBuilder sections of vendor/desktop-fly/main.swift, data/circuit.json (structure only).\n";
brain_prompt += "Implement:\n";
brain_prompt += "  src/sim/load-circuit.ts — find data/circuit.json (cwd/data, dist/data, import.meta dirname candidates)\n";
brain_prompt += "  src/sim/spike-bus.ts — ring of 256 spike events\n";
brain_prompt += "  src/sim/lif-sim.ts — faithful LIFSim: CSR weights, 4ms inhibitory delay ring, gap-junction boost 6 on LC/sensory->GF,\n";
brain_prompt += "    baselines (other random 0.010-0.070, lc 0.004, command DNs 0.036, dnp09 0.038, gf 0.002),\n";
brain_prompt += "    decay 0.9512, threshold 1, refractory 2, weightScale 0.0008, pNoise 0.0022, noiseKick 0.42, loomGain 0.30, rateAlpha 1/120,\n";
brain_prompt += "    loomL/R, gaitDrive/gaitPhase, airPuff, activityScale, sensoryGate, stimulate(), consumeGF(), step(ms),\n";
brain_prompt += "    group arrays gf, loomLeft/Right, dnaL/R, mdn, fwd, groom, escw, ascend, sens.\n";
brain_prompt += "    Inject RNG via constructor opts.rng so tests are seedable; production can use Math.random.\n";
brain_prompt += "  src/sim/signal-builder.ts — EXACT mapping from main.swift SignalBuilder.make:\n";
brain_prompt += "    dnaBaseline tau 8s; nervous=clamp(rateLoom/80,0,1); turnBias=clamp((diff-baseline)*0.04,-1,1);\n";
brain_prompt += "    backward = rateMDN>8; walkDrive=clamp(rateFwd/10,0,1.3); groomDrive=rateGroom/8;\n";
brain_prompt += "    wingDrive=clamp(rateEscW/10,0,1.3); arousal=clamp(ratePop/20,0,1); escape=consumeGF().\n";
brain_prompt += "Write src/tests/sim.test.ts reproducing runSimtest:\n";
brain_prompt += "  - print/log circuit counts\n";
brain_prompt += "  - 4s rest: GF spikes == 0\n";
brain_prompt += "  - abrupt loom L=1 R=0.5 for 400ms: GF spikes > 0 (first spike ideally <= ~10ms, assert < 50ms to avoid flake)\n";
brain_prompt += "  - 20s with gaitDrive: walk-drive on samples > 0\n";
brain_prompt += "  - siesta activityScale = 1-(1-0.55)*0.35 = 0.84 for 15s: walk-drive on > 3%\n";
brain_prompt += "  - stimulate(gf) -> consumeGF true\n";
brain_prompt += "Use a FIXED rng seed. testTimeout 120000. Do not mock the circuit — load real data/circuit.json.\n";
brain_prompt += "Run pnpm test src/tests/sim.test.ts and iterate until it PASSES.\n";
brain_prompt += "Siesta gotcha: never scale baselines linearly; compression toward 1 is already in activityScale usage — match Swift.\n";
brain_prompt += "Return ok=true only if pnpm test src/tests/sim.test.ts exits 0.\n";

let brain_fix = "";
brain_fix += rules();
brain_fix += "The sim tests failed. Read src/tests/sim.test.ts output, vendor/desktop-fly/Sim.swift, and src/sim/lif-sim.ts.\n";
brain_fix += "Fix LIFSim / SignalBuilder / tests until `pnpm test src/tests/sim.test.ts` exits 0.\n";
brain_fix += "Do not weaken assertions to make them pass. Match Swift dynamics.\n";
brain_fix += "Common bugs: wrong CSR fill, missing gap-junction boost, inhibitory delay not 4ms, random baselines on command DNs, activityScale applied twice, GF latch not consumed.\n";
brain_fix += "Return ok=true only if the sim tests pass.\n";

let brain_verify_prompt = "";
brain_verify_prompt += rules();
brain_verify_prompt += "Adversarially verify the brain port. Do not trust the implementer.\n";
brain_verify_prompt += "1. Run `pnpm test src/tests/sim.test.ts` yourself and capture output.\n";
brain_verify_prompt += "2. Read src/sim/lif-sim.ts and vendor/desktop-fly/Sim.swift. Confirm constants and the GF-silent / loom-fire / siesta / stim predicates exist as real assertions.\n";
brain_verify_prompt += "3. passed=true ONLY if the test command exited 0 AND you saw assertions for GF rest silence, loom fire, walk-drive, stim, and siesta>3%.\n";
brain_verify_prompt += "If tests were skipped or mocked, passed=false. List failures as short strings.\n";

let brain = agent(brain_prompt, #{
    label: "implement:brain",
    capability_mode: "all",
    output_schema: status_schema,
});

let brain_verify = agent(brain_verify_prompt, #{
    label: "verify:brain",
    capability_mode: "all",
    output_schema: verdict_schema,
});

if !did_pass(brain_verify) {
    brain_verify = retry_once(brain_fix, "fix:brain", brain_verify_prompt, "verify:brain-2", status_schema, verdict_schema);
}

if did_pass(brain_verify) {
    log("Brain tests passed");
} else {
    log("Brain tests still failing after one retry; continuing so behavior/surfaces can still land");
}

// ---------------------------------------------------------------------------
phase("Behavior");
log("Porting headless Fly behavior and --behaviortest");

let behavior_prompt = "";
behavior_prompt += rules();
behavior_prompt += layout();
behavior_prompt += "TASK: Phase 2 of plan.md — translate the NON-RENDERING part of FlyModel.swift into src/creature/fly.ts.\n";
behavior_prompt += "Read vendor/desktop-fly/FlyModel.swift (the Fly class and helpers), vendor/desktop-fly/Environment.swift (Ledge, circadianActivity), and runBehaviorTest in vendor/desktop-fly/main.swift.\n";
behavior_prompt += "Fly is a headless state machine. It may keep pose fields (leg angles, wing euler, abdomen scale, node scale/z) as plain numbers so tests can assert them WITHOUT Three.js.\n";
behavior_prompt += "Required fields: position, heading, speed, state (walking|idle|grooming|flying|sleeping), altitude/alt, gaitPhase, ledge, sleep via signals.sleep, wingEffort/effortCurrent, wingRaise, backwardTimer, dartTimer, scareCooldown, terrain.\n";
behavior_prompt += "Port brainBehavior, updateWalk, startFlight, land (NO scale/z snap), updateFlight (flare until alt<0.035), updateLegs, updateWings, circadianActivity.\n";
behavior_prompt += "Hysteresis and dwell: stateAge>=0.4 for most transitions; MDN works from any grounded state; live flight effort = max(baseEffort, live formula) and must never weaken takeoff.\n";
behavior_prompt += "Landing must go through flare — never snap scale/z in land().\n";
behavior_prompt += "Export Ledge { id, x0, x1, y } from src/shared/types.ts.\n";
behavior_prompt += "Port circadianActivity(hour) to src/shared/circadian.ts exactly.\n";
behavior_prompt += "Write src/tests/behavior.test.ts reproducing EVERY scenario and bodyCheck from runBehaviorTest:\n";
behavior_prompt += "  GF stim -> flying; DNg11 -> grooming; DNp09 -> walking speed 40-100; MDN -> backwardTimer>0;\n";
behavior_prompt += "  DNa-left -> heading increase >0.25; moderate loom -> dart or escape; sensory tap -> flying;\n";
behavior_prompt += "  ledge attach; window close -> takeoff; sleep then wake to grooming; tempo 1.5 faster than 1.0 by >10;\n";
behavior_prompt += "  escape flies higher than casual; wings beat (pose sweep>0.25); mid-flight wingDrive raises effort;\n";
behavior_prompt += "  grounded threat raises wings without takeoff; landing max Δscale<0.2 Δz<25;\n";
behavior_prompt += "  circadian: hour3<0.4, hour9>0.9, hour14 in (0.3,0.7), hour18>0.9.\n";
behavior_prompt += "Use SignalBuilder + real LIFSim for the stim scenarios (same as Swift). Use hand-built BrainSignals for bodyChecks.\n";
behavior_prompt += "Run `pnpm test src/tests/behavior.test.ts src/tests/sim.test.ts` and iterate until BOTH pass.\n";
behavior_prompt += "Return ok=true only if that command exits 0.\n";

let behavior_fix = "";
behavior_fix += rules();
behavior_fix += "Behavior tests failed. Read the vitest output, vendor/desktop-fly/FlyModel.swift, src/creature/fly.ts, and src/tests/behavior.test.ts.\n";
behavior_fix += "Fix until `pnpm test src/tests/behavior.test.ts src/tests/sim.test.ts` exits 0.\n";
behavior_fix += "Do not drop or weaken the original assertions. Extra flies without a brain use the legacy distance-based path (signals=null).\n";
behavior_fix += "Return ok=true only if both suites pass.\n";

let behavior_verify_prompt = "";
behavior_verify_prompt += rules();
behavior_verify_prompt += "Adversarially verify the behavior port.\n";
behavior_verify_prompt += "Run `pnpm test src/tests/behavior.test.ts src/tests/sim.test.ts` yourself.\n";
behavior_verify_prompt += "Read src/tests/behavior.test.ts and confirm the original stim + bodyCheck names are present (not a stub suite).\n";
behavior_verify_prompt += "passed=true only if the command exited 0 AND the suite still contains GF escape, DNg11 grooming, DNp09 walk, MDN backward, DNa turn, loom fear, sensory tap, ledge, window-close takeoff, sleep/wake, tempo, flight altitude, wing beat, landing flare, circadian.\n";

let behavior = agent(behavior_prompt, #{
    label: "implement:behavior",
    capability_mode: "all",
    output_schema: status_schema,
});

let behavior_verify = agent(behavior_verify_prompt, #{
    label: "verify:behavior",
    capability_mode: "all",
    output_schema: verdict_schema,
});

if !did_pass(behavior_verify) {
    behavior_verify = retry_once(behavior_fix, "fix:behavior", behavior_verify_prompt, "verify:behavior-2", status_schema, verdict_schema);
}

if did_pass(behavior_verify) {
    log("Behavior tests passed");
} else {
    log("Behavior tests still failing after one retry; surfaces will still be built");
}

// ---------------------------------------------------------------------------
phase("Surfaces");
log("Fan-out: Three.js fly, Electron overlay, native desktop-env");

let renderer_prompt = "";
renderer_prompt += rules();
renderer_prompt += layout();
renderer_prompt += "TASK: Phase 3 of plan.md — Three.js procedural fly + brain window. DO NOT TOUCH src/main, native/, package.json, or lockfiles.\n";
renderer_prompt += "DO NOT run pnpm install. You may typecheck files you own.\n";
renderer_prompt += "Read vendor/desktop-fly/FlyModel.swift buildFlyModel/buildLeg/wingShape and vendor/desktop-fly/BrainView.swift.\n";
renderer_prompt += "Map: SCNSphere->SphereGeometry, SCNCapsule->CapsuleGeometry, SCNCone->ConeGeometry, SCNNode->Group, SCNMaterial->MeshPhongMaterial or MeshStandardMaterial, SCNLight->DirectionalLight.\n";
renderer_prompt += "Implement:\n";
renderer_prompt += "  src/renderer/fly-model.ts — procedural body matching the Swift dimensions/colors/leg specs. Expose pose setters for legs/wings/abdomen/scale used by Fly.\n";
renderer_prompt += "  src/renderer/fly-view.ts — binds a headless Fly to a Three.Group each frame (position, heading, pitch, alt scale, gait, wings).\n";
renderer_prompt += "  src/renderer/fly-scene.ts — transparent canvas scene, orthographic or perspective matching overlay (desktop coords), directional light, optional shadow.\n";
renderer_prompt += "  src/renderer/brain-scene.ts — point cloud from data/brain_points.json, spike flashes from SpikeBus, click nearest ~60 circuit neurons (callback only; IPC later).\n";
renderer_prompt += "  src/renderer/overlay.html + overlay.ts — black/transparent background, resize to window, render loop placeholder that imports fly-scene.\n";
renderer_prompt += "  src/renderer/brain.html + brain.ts — brain window page.\n";
renderer_prompt += "Local frame stays +Y forward, +Z up as in Swift; convert to Three (Y-up) in the view adapter and document the conversion in a short comment.\n";
renderer_prompt += "If Fly pose fields are missing, add the minimum numeric pose on Fly rather than inventing a second source of truth — but prefer reading existing fields.\n";
renderer_prompt += "Return ok=true if the renderer files exist and import paths resolve.\n";

let electron_prompt = "";
electron_prompt += rules();
electron_prompt += layout();
electron_prompt += "TASK: Phase 4 of plan.md — Electron overlay shell. DO NOT TOUCH src/sim, src/creature, src/renderer, native/, package.json, or lockfiles.\n";
electron_prompt += "DO NOT run pnpm install.\n";
electron_prompt += "Implement:\n";
electron_prompt += "  src/main/displays.ts — wrap electron.screen: list displays, subscribe display-added/removed/metrics-changed, cursor position.\n";
electron_prompt += "  src/main/overlay-manager.ts — ONE transparent BrowserWindow per physical display:\n";
electron_prompt += "    x/y/width/height = display.bounds; transparent, frame false, resizable false, movable false,\n";
electron_prompt += "    focusable false, skipTaskbar true, alwaysOnTop true; webPreferences.backgroundThrottling false.\n";
electron_prompt += "    win.setIgnoreMouseEvents(true, { forward: true }). Load dist/renderer/overlay.html.\n";
electron_prompt += "    Recreate on display topology changes.\n";
electron_prompt += "  src/main/tray.ts — menu bar/tray: Pause/Resume, Show/Hide Brain, Escape Test (loom), Move to Next Display,\n";
electron_prompt += "    Add/Remove Fly, Scare Flies, Quit. 🪰 label/tooltip.\n";
electron_prompt += "  src/main/brain-window.ts — ordinary (opaque) BrowserWindow for the brain; not click-through.\n";
electron_prompt += "  src/main/index.ts — app ready: overlay manager + tray + IPC stubs (pause, loomOverride, addFly).\n";
electron_prompt += "  src/preload/overlay-preload.ts — contextBridge exposing a narrow API if needed; otherwise keep renderer simple.\n";
electron_prompt += "Linux: if alwaysOnTop type is available, use 'screen-saver' or equivalent. Document XWayland requirement in a code comment.\n";
electron_prompt += "Return ok=true if main-process files exist and BrowserWindow options match the contract.\n";

let native_prompt = "";
native_prompt += rules();
native_prompt += layout();
native_prompt += "TASK: Native desktop-env (plan.md tiny Rust layer) PLUS a JS fallback because rustc is missing on this host.\n";
native_prompt += "DO NOT TOUCH src/sim, src/creature, src/renderer, src/main/index.ts, src/main/tray.ts, package.json, or lockfiles.\n";
native_prompt += "You MAY write native/desktop-env/** and src/main/desktop-env.ts (the adapter).\n";
native_prompt += "TypeScript API (single boring interface):\n";
native_prompt += "  getWindows(): DesktopWindow[]  // {id, x, y, width, height}\n";
native_prompt += "  getCursor(): Point\n";
native_prompt += "  getIdleSeconds(): number\n";
native_prompt += "  onMouseDown(cb): unsubscribe\n";
native_prompt += "  getThermalFactor(): number  // environmentTempo source, default 1.0\n";
native_prompt += "Rust crate native/desktop-env (napi-rs):\n";
native_prompt += "  src/lib.rs + windows.rs + macos.rs + linux.rs with cfg.\n";
native_prompt += "  Windows: EnumWindows, IsWindowVisible, DwmGetWindowAttribute / GetWindowRect (extended frame).\n";
native_prompt += "  macOS: CGWindowListCopyWindowInfo stub comments + best-effort.\n";
native_prompt += "  Linux: X11 path first; Wayland returns empty windows and a documented degraded flag. XCap is REFERENCE not a hard dep unless it is tiny and compiles conceptually.\n";
native_prompt += "  Do not run cargo/napi build if rustc is missing — just write the sources.\n";
native_prompt += "JS fallback in src/main/desktop-env.ts:\n";
native_prompt += "  Try require the native .node; on failure use Electron screen.getCursorScreenPoint, powerMonitor.getSystemIdleTime, empty window list, thermalFactor 1.0,\n";
native_prompt += "  and onMouseDown no-op (or BrowserWindow hook only for the overlay, which is useless — keep it a stub with a comment that Phase global-clicks will attach a hook).\n";
native_prompt += "Return ok=true if the interface, fallback, and rust sources exist.\n";

let surface_jobs = [];
surface_jobs.push(#{
    prompt: renderer_prompt,
    label: "implement:renderer",
    capability_mode: "all",
    output_schema: status_schema,
});
surface_jobs.push(#{
    prompt: electron_prompt,
    label: "implement:electron",
    capability_mode: "all",
    output_schema: status_schema,
});
surface_jobs.push(#{
    prompt: native_prompt,
    label: "implement:native",
    capability_mode: "all",
    output_schema: status_schema,
});
let surfaces = parallel(surface_jobs);

let surface_ok = 0;
for s in surfaces {
    if did_ok(s) { surface_ok += 1; }
}
log(surface_ok.to_string() + "/3 surface agents reported ok");

// ---------------------------------------------------------------------------
phase("Wire");
log("Coordinator, worker, ecology, clicks, environmentTempo");

let wire_prompt = "";
wire_prompt += rules();
wire_prompt += layout();
wire_prompt += "TASK: Phases 5-6 of plan.md plus the simulation worker. Wire the pieces that already exist. Do not rewrite LIFSim or Fly from scratch.\n";
wire_prompt += "Read vendor/desktop-fly/main.swift Coordinator, Environment.swift, and the current src/ tree.\n";
wire_prompt += "Implement:\n";
wire_prompt += "  src/worker/sim-worker.ts — owns LIFSim. Messages: init (load circuit), step {ms, loomL, loomR, gaitDrive, gaitPhase, airPuff, activityScale, sensoryGate}, stimulate, consume. Posts BrainSignals + spike samples.\n";
wire_prompt += "  src/main/environment.ts — circadianActivity, idle->sleep, typing vibration via idle-time (never which keys), environmentTempo from powerMonitor (macOS thermal if available, Windows speed-limit if available, else 1.0).\n";
wire_prompt += "  src/main/ecology.ts — poll getWindows() ~0.7s, convert top edges to Ledges in overlay coords, detect new windows near the fly and inject window loom (copy injectWindowLoom math from Swift).\n";
wire_prompt += "  src/main/input.ts — desktop.onMouseDown from desktop-env; injectTap using distance to fly (copy injectTap). Prefer native hook; if fallback, document that global clicks are unavailable.\n";
wire_prompt += "  src/main/cursor-loom.ts — computeLoom from Coordinator (approach / dist * 6, hover term, split L/R by bearing).\n";
wire_prompt += "  src/main/world-loop.ts — 60 Hz tick: cursor, loom, worker step, send signals+terrain to overlay via IPC, handle pause.\n";
wire_prompt += "  src/renderer/overlay.ts — receive world state, update Fly(s), render Three scene. Only fly #1 has the brain; extra flies signals=null.\n";
wire_prompt += "  src/renderer/brain.ts — receive spikes, optional click -> IPC stimulate.\n";
wire_prompt += "  Tray actions must actually call into world-loop (pause, escapeTest loomOverride=0.6, scare, add/remove fly, next display).\n";
wire_prompt += "Update scripts/build.mjs if new entry points appeared. Keep pnpm test green — run `pnpm test` at the end and fix regressions you caused.\n";
wire_prompt += "Do not fight native Wayland. Linux overlay is best-effort.\n";
wire_prompt += "Return ok=true only if `pnpm test` exits 0.\n";

let wire = agent(wire_prompt, #{
    label: "implement:wire",
    capability_mode: "all",
    output_schema: status_schema,
});

if !did_ok(wire) {
    log("Wire phase reported failure; verify will surface the gaps");
}

// ---------------------------------------------------------------------------
phase("Verify");
log("Parallel sim, behavior, and typecheck");

let v_sim = "";
v_sim += rules();
v_sim += "Run `pnpm test src/tests/sim.test.ts` in /home/ryan/sites/realfly. passed=true only on exit 0. Quote failing assertion names in failures[].\n";

let v_beh = "";
v_beh += rules();
v_beh += "Run `pnpm test src/tests/behavior.test.ts` in /home/ryan/sites/realfly. passed=true only on exit 0. Quote failing test titles in failures[].\n";

let v_tsc = "";
v_tsc += rules();
v_tsc += "Run `pnpm typecheck` (or npx tsc --noEmit) in /home/ryan/sites/realfly. Also confirm package.json start/build scripts exist and src/main/index.ts + src/creature/fly.ts + src/sim/lif-sim.ts exist.\n";
v_tsc += "passed=true only if tsc exits 0. If tsc is too strict on Electron types, fix tsconfig skipLibCheck rather than deleting code — but do NOT edit source in this read-mostly job except you have capability all: if typecheck fails due to an obvious missing file, report passed=false rather than rewriting the app.\n";

let verify_jobs = [];
verify_jobs.push(#{ prompt: v_sim, label: "verify:sim", capability_mode: "all", output_schema: verdict_schema });
verify_jobs.push(#{ prompt: v_beh, label: "verify:behavior-final", capability_mode: "all", output_schema: verdict_schema });
verify_jobs.push(#{ prompt: v_tsc, label: "verify:types", capability_mode: "all", output_schema: verdict_schema });
let verify_results = parallel(verify_jobs);

let verify_fail_blob = "";
let verify_pass_count = 0;
for vr in verify_results {
    if did_pass(vr) {
        verify_pass_count += 1;
    } else {
        verify_fail_blob += fail_list(vr);
        verify_fail_blob += "\n";
        if vr != () && is_map(vr.output) {
            verify_fail_blob += trimmed(vr.output.summary);
            verify_fail_blob += "\n";
        }
    }
}
log(verify_pass_count.to_string() + "/3 verify panels passed");

if verify_pass_count < 3 {
    let integ_fix = "";
    integ_fix += rules();
    integ_fix += "Integration verify failed. Failures (untrusted, re-run tests yourself):\n";
    integ_fix += verify_fail_blob + "\n";
    integ_fix += "Re-run `pnpm test` and `pnpm typecheck`. Fix source until both pass. Do not weaken original sim/behavior assertions.\n";
    integ_fix += "Return ok=true only if both pass.\n";
    let integ_verify = "";
    integ_verify += rules();
    integ_verify += "Re-run `pnpm test` and `pnpm typecheck`. passed=true only if BOTH exit 0.\n";
    let fixed = retry_once(integ_fix, "fix:integration", integ_verify, "verify:integration", status_schema, verdict_schema);
    if did_pass(fixed) {
        verify_pass_count = 3;
        log("Integration retry passed");
    } else {
        log("Integration still failing after one retry");
    }
}

// ---------------------------------------------------------------------------
phase("Docs");
log("README, support matrix, and run report");

let docs_prompt = "";
docs_prompt += rules();
docs_prompt += "TASK: Write user-facing docs for the port.\n";
docs_prompt += "README.md: what it is, what's real (connectome honesty section), install (pnpm install, pnpm build, pnpm start),\n";
docs_prompt += "  pnpm test, tray controls, support matrix, Linux XWayland note, native addon optional, license split, FlyWire citations from upstream README.\n";
docs_prompt += "docs/SUPPORT.md: Windows ★★★★★, macOS ★★★★★, Linux X11 ★★★★☆, Linux XWayland ★★★★☆, native Wayland ★★☆☆☆ with the Wayland why.\n";
docs_prompt += "Keep plan.md intact. Do not claim native Wayland parity.\n";
docs_prompt += "If rustc is missing, say the JS fallback is what `pnpm start` uses until `native/desktop-env` is built.\n";
docs_prompt += "Return ok=true if README.md exists and mentions pnpm test plus the support matrix.\n";

let docs = agent(docs_prompt, #{
    label: "docs:readme",
    capability_mode: "all",
    output_schema: status_schema,
});

let report_prompt = "";
report_prompt += rules();
report_prompt += "Write docs/PORT_REPORT.md summarizing what landed in this one-shot.\n";
report_prompt += "Inspect the tree (ls, read package.json, skim tests). Include:\n";
report_prompt += "- which plan.md phases are done vs partial\n";
report_prompt += "- whether pnpm test currently passes (run it)\n";
report_prompt += "- whether native addon compiled or fallback is in use\n";
report_prompt += "- how to run: pnpm test, pnpm start\n";
report_prompt += "- leftover work (Wayland, napi build, packaging, --snapshot)\n";
report_prompt += "Be honest. Return ok=true if the report file was written.\n";

let report_agent = agent(report_prompt, #{
    label: "docs:report",
    capability_mode: "all",
    output_schema: status_schema,
});

let summary = "";
summary += "port-desktop-fly finished. ";
if did_pass(brain_verify) { summary += "Brain: pass. "; } else { summary += "Brain: FAIL. "; }
if did_pass(behavior_verify) { summary += "Behavior: pass. "; } else { summary += "Behavior: FAIL. "; }
summary += "Surfaces ok " + surface_ok.to_string() + "/3. ";
summary += "Final verify panels " + verify_pass_count.to_string() + "/3. ";
if did_ok(docs) { summary += "Docs written. "; }
if did_ok(report_agent) { summary += "See docs/PORT_REPORT.md"; }

let report_path = write_scratch_file("report.md", summary);
complete(#{
    summary: summary,
    path: report_path,
    brain: did_pass(brain_verify),
    behavior: did_pass(behavior_verify),
    surfaces: surface_ok,
    verify: verify_pass_count,
});
