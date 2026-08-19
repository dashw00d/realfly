let meta = #{
    name: "enhance-desktop-fly",
    description: "Implement ledges, brain HUD, extra-fly mood, habitat cues, tray meters, snapshot, and Windows login item",
    when_to_use: "Enhance realfly after the base Electron port: Windows window ledges, brain instrument HUD, swarm, polish",
    phases: [
        #{ title: "Contract", detail: "extend IPC and types" },
        #{ title: "Surfaces", detail: "brain HUD, swarm, habitat, native Windows addon in parallel" },
        #{ title: "Wire", detail: "main-process IPC and ecology" },
        #{ title: "Polish", detail: "tray meters, snapshot, open-at-login" },
        #{ title: "Verify", detail: "tests and typecheck" },
        #{ title: "Ship", detail: "Windows portable + report" },
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
    t += "Public repo: git@github.com:dashw00d/realfly.git (do not force-push).\n";
    t += "This is an enhancement of the existing Electron port, not a rewrite.\n";
    t += "Do not retune LIF constants or weaken src/tests/sim.test.ts or behavior.test.ts.\n";
    t += "Only fly #1 runs LIFSim. Extra flies must not get a second 1 kHz circuit.\n";
    t += "Feed existing sensory APIs (loom, airPuff, tap, gait) rather than scripted cutscenes.\n";
    t += "Skip desktop-food. Skip extra creature models. Skip YAML personalities.\n";
    t += "Windows is the primary runtime. Native addon compiles on Win32 (VS 2022 Community exists).\n";
    t += "WSL Linux Electron cannot see Win32 windows; native .node is for the Windows build.\n";
    t += "pnpm typecheck and pnpm test must stay green. Idempotent edits.\n";
    t += "Read files before writing. Match existing TypeScript style.\n";
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
phase("Contract");
log("Extending IPC types for HUD, mood, typing, snapshot");

let contract_prompt = "";
contract_prompt += rules();
contract_prompt += "TASK: Extend shared types only. Do not implement UI yet.\n";
contract_prompt += "Read src/shared/ipc.ts, src/shared/brain-signals.ts, src/preload/brain-preload.ts, src/preload/overlay-preload.ts.\n";
contract_prompt += "Add BrainHudSnapshot: { gfSpike: boolean, gfSilent: boolean, rateLoom, loomL, loomR, walkDrive, groomDrive, backward, turnBias, nervous, arousal, wingDrive, tempo, sleep, lastStim?: { role: string, body: string } }.\n";
contract_prompt += "Extend WorldFrame with optional typing: number (0..1) so the overlay can twitch the abdomen.\n";
contract_prompt += "Add ExtraMood: { walkDrive, nervous, escape, groomDrive, heading } — a delayed noisy copy of fly #1 for extras, NOT a second brain.\n";
contract_prompt += "Put ExtraMood on WorldFrame as extrasMood?: ExtraMood.\n";
contract_prompt += "Update overlay-preload and brain-preload TypeScript APIs: onHud(cb), onSpikes stays. Do not break existing channels.\n";
contract_prompt += "Return ok=true if tsc still typechecks or only expected unused-new-field errors you then fix.\n";

let contract = agent(contract_prompt, #{
    label: "contract:ipc",
    capability_mode: "all",
    output_schema: status_schema,
});
if !did_ok(contract) {
    log("Contract reported failure; surfaces will try to recover");
}

// ---------------------------------------------------------------------------
phase("Surfaces");
log("Fan-out: brain HUD, swarm extras, habitat, Windows native addon");

let brain_prompt = "";
brain_prompt += rules();
brain_prompt += "TASK: Brain as instrument. DO NOT TOUCH native/, src/creature, package.json, lockfiles. DO NOT pnpm install.\n";
brain_prompt += "Read src/renderer/brain.ts, brain-scene.ts, brain.html, src/main/brain-window.ts, vendor/desktop-fly/BrainView.swift if present.\n";
brain_prompt += "1. HUD overlay on the brain window (HTML/CSS, not a second WebGL scene): GF silent vs just spiked, LC4/LPLC2 rate, walkDrive, groomDrive, MDN/backward, loom L/R.\n";
brain_prompt += "2. Sparkline / strip chart of Giant Fiber spike events vs loom (last ~1–2 s). Keep it tiny (brain window is 340x280 — grow the window to ~420x360 if needed).\n";
brain_prompt += "3. Click-to-stim already exists. When clicking a region, show role + body mapping from PORT_CONTRACT (gf=escape, dng11=groom, dnp09=walk, mdn=backward, dna=steer, lc/lplc2=loom/nervous).\n";
brain_prompt += "4. Hover pauses rotation (upstream BrainView). Leave rotation paused while pointer is over the canvas.\n";
brain_prompt += "5. Preload: onHud for BrainHudSnapshot. World-loop will send it later — stub the listener now.\n";
brain_prompt += "Do not add React. Return ok=true if brain.html shows HUD elements and brain.ts compiles conceptually.\n";

let swarm_prompt = "";
swarm_prompt += rules();
swarm_prompt += "TASK: Extra flies follow fly #1 mood without a second LIF. Files: src/renderer/overlay.ts, src/creature/fly.ts only if needed.\n";
swarm_prompt += "DO NOT TOUCH native/, package.json, src/sim.\n";
swarm_prompt += "WorldFrame.extrasMood is a delayed noisy copy of fly #1 (walkDrive, nervous, escape, groomDrive, heading).\n";
swarm_prompt += "Extra flies (index>0) still get signals=null for the full brain path, BUT consume extrasMood:\n";
swarm_prompt += "- escape true -> startFlight away\n";
swarm_prompt += "- high nervous -> dart/walk burst\n";
swarm_prompt += "- prefer the same ledge as fly #1 when terrain has it (copy ledge id if still present)\n";
swarm_prompt += "- add small heading noise so they are not a clone stamp\n";
swarm_prompt += "CPU: no extra LIFSim. Return ok=true if extras use extrasMood.\n";

let habitat_prompt = "";
habitat_prompt += rules();
habitat_prompt += "TASK: Habitat cues through existing sensors. DO NOT invent food or a second species.\n";
habitat_prompt += "1. Typing already becomes airPuff/vibration in world-loop (typingLevel). Pass WorldFrame.typing to overlay. In Fly.update / abdomen pose, add a typing twitch (faster smaller abdomen pulse) when typing>0.1. Do not log key contents.\n";
habitat_prompt += "2. Window-loom is already WindowSense.newWindows. Confirm overlay/world-loop still injects window loom when getWindows() is non-empty. Add a unit test if a gap exists.\n";
habitat_prompt += "3. Do not implement Windows toast COM. New small windows ARE the notification loom once native enum works.\n";
habitat_prompt += "Touch: src/creature/fly.ts abdomen, src/renderer/overlay.ts, src/main/world-loop.ts only as needed, tests if you add typing twitch assertions.\n";
habitat_prompt += "Return ok=true after pnpm test still makes sense for files you changed.\n";

let native_prompt = "";
native_prompt += rules();
native_prompt += "TASK: Compile native/desktop-env for Windows so EnumWindows ledges work in the Win32 app.\n";
native_prompt += "Host: WSL. Windows Node is at C:\\Program Files\\nodejs\\node.exe. VS 2022 Community is installed. Windows copy of the repo: C:\\Users\\ryan\\sites\\realfly\n";
native_prompt += "1. Sync native/ + src/main/desktop-env.ts to the Windows tree (rsync or cp). Do not delete Windows node_modules.\n";
native_prompt += "2. Install Rust on Windows if missing: rustup-init -y (powershell). Target x86_64-pc-windows-msvc.\n";
native_prompt += "3. Build the napi-rs addon: from native/desktop-env, `npx --yes @napi-rs/cli build --release` or `napi build --platform --release`. Produce desktop-env.win32-x64-msvc.node (or desktop-env.node).\n";
native_prompt += "4. Copy the .node into BOTH C:\\Users\\ryan\\sites\\realfly\\native\\desktop-env\\ AND /home/ryan/sites/realfly/native/desktop-env/ (gitignores *.node — that is OK, packaging will pick it up via extraResources).\n";
native_prompt += "5. Update src/main/desktop-env.ts loadNativeAddon paths if the filename differs. Keep JS fallback when the addon is missing.\n";
native_prompt += "6. Update scripts/build.mjs / electron-builder files to asarUnpack/extraResources the win32 .node next to the app so packaged DesktopFly.exe can require it.\n";
native_prompt += "If rustup/MSVC fails, set ok=false and summarize blockers — do not fake a .node.\n";
native_prompt += "Return ok=true only if a real PE/COFF .node exists on the Windows tree.\n";

let surface_jobs = [];
surface_jobs.push(#{ prompt: brain_prompt, label: "implement:brain-hud", capability_mode: "all", output_schema: status_schema });
surface_jobs.push(#{ prompt: swarm_prompt, label: "implement:swarm", capability_mode: "all", output_schema: status_schema });
surface_jobs.push(#{ prompt: habitat_prompt, label: "implement:habitat", capability_mode: "all", output_schema: status_schema });
surface_jobs.push(#{ prompt: native_prompt, label: "implement:native-win", capability_mode: "all", output_schema: status_schema });
let surfaces = parallel(surface_jobs);
let surface_ok = 0;
for s in surfaces {
    if did_ok(s) { surface_ok += 1; }
}
log(surface_ok.to_string() + "/4 surface agents reported ok");

// ---------------------------------------------------------------------------
phase("Wire");
log("Main-process HUD IPC, extrasMood delay line, native window poll");

let wire_prompt = "";
wire_prompt += rules();
wire_prompt += "TASK: Wire main process. Read src/main/world-loop.ts, brain-window.ts, desktop-env.ts, ecology.ts, overlay-manager.ts.\n";
wire_prompt += "1. Each tick, send BrainHudSnapshot to the brain window (new sendHud method) from current signals + loomL/R + consume-already-reflected escape as gfSpike.\n";
wire_prompt += "2. extrasMood: keep a 200–400 ms delay line of fly #1 heading/walkDrive/nervous/escape/groomDrive, add small noise, put on WorldFrame.extrasMood.\n";
wire_prompt += "3. WorldFrame.typing from existing typingLevel.\n";
wire_prompt += "4. If native getWindows() returns windows, WindowSense.poll already builds ledges — make sure world-loop still assigns them. Log once: 'window ledges: N' when N>0.\n";
wire_prompt += "5. Keep uiohook tap-to-startle. Do not import uiohook outside global-mouse.ts / desktop-env.ts.\n";
wire_prompt += "Run `pnpm test` and fix regressions you caused. Return ok=true only if tests exit 0.\n";

let wire = agent(wire_prompt, #{
    label: "implement:wire",
    capability_mode: "all",
    output_schema: status_schema,
});

// ---------------------------------------------------------------------------
phase("Polish");
log("Tray meters, snapshot CLI, open-at-login");

let polish_prompt = "";
polish_prompt += rules();
polish_prompt += "TASK: Polish. Read src/main/tray.ts, index.ts, overlay-manager.ts.\n";
polish_prompt += "1. Tray tooltip (Windows cannot setTitle): update ~2 Hz with 'Desktop Fly | GF silent|SPIKE | loom 0.00'. Do not generate a new .ico every frame.\n";
polish_prompt += "2. Tray item 'Open at login' checkbox using app.getLoginItemSettings / setLoginItemSettings({ openAtLogin }).\n";
polish_prompt += "3. CLI --snapshot [path]: capture overlay (or a hidden window) to PNG. Default DesktopFly.png in cwd. Parse process.argv in src/main/index.ts AFTER app ready. Do not break normal start.\n";
polish_prompt += "4. Optional --brainshot [path] if cheap (brain window capturePage). Skip if brain is hidden and it is hard.\n";
polish_prompt += "Do not change LIF. Return ok=true if typecheck is clean.\n";

let polish = agent(polish_prompt, #{
    label: "implement:polish",
    capability_mode: "all",
    output_schema: status_schema,
});

// ---------------------------------------------------------------------------
phase("Verify");
log("Tests, typecheck, native-addon presence");

let v_tests = "";
v_tests += rules();
v_tests += "Run `pnpm test` in /home/ryan/sites/realfly. passed=true only on exit 0. List failing titles in failures[].\n";

let v_tsc = "";
v_tsc += rules();
v_tsc += "Run `pnpm typecheck` or ./node_modules/.bin/tsc --noEmit. passed=true only on exit 0.\n";

let v_native = "";
v_native += rules();
v_native += "Check for a Windows addon: native/desktop-env/*.node or C:/Users/ryan/sites/realfly/native/desktop-env/*.node. file(1) or dumpbin if present. passed=true if a .node exists and is not empty. If missing, passed=false with evidence — do not create a fake file.\n";

let verify_jobs = [];
verify_jobs.push(#{ prompt: v_tests, label: "verify:tests", capability_mode: "all", output_schema: verdict_schema });
verify_jobs.push(#{ prompt: v_tsc, label: "verify:types", capability_mode: "all", output_schema: verdict_schema });
verify_jobs.push(#{ prompt: v_native, label: "verify:native", capability_mode: "all", output_schema: verdict_schema });
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
    integ_fix += "Verify failed. Failures (untrusted, re-run yourself):\n";
    integ_fix += verify_fail_blob + "\n";
    integ_fix += "Fix source until `pnpm test` and tsc pass. Native .node: only build it, never fake it.\n";
    integ_fix += "Do not weaken sim/behavior assertions.\n";
    let integ_verify = "";
    integ_verify += rules();
    integ_verify += "Re-run pnpm test and tsc. passed=true only if BOTH exit 0.\n";
    let fixed = retry_once(integ_fix, "fix:integration", integ_verify, "verify:integration", status_schema, verdict_schema);
    if did_pass(fixed) {
        log("Integration retry passed (tests/tsc)");
    } else {
        log("Integration still failing after one retry");
    }
}

// ---------------------------------------------------------------------------
phase("Ship");
log("Windows portable rebuild and report");

let ship_prompt = "";
ship_prompt += rules();
ship_prompt += "TASK: Package Windows portable if tests are green enough to ship.\n";
ship_prompt += "1. Bump package.json version patch (0.1.1 -> 0.1.2) if you ship features.\n";
ship_prompt += "2. node scripts/build.mjs && CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --win portable --x64\n";
ship_prompt += "3. Copy release/DesktopFly *.exe to /mnt/c/Users/ryan/Desktop/DesktopFly.exe\n";
ship_prompt += "4. If gh is available, `gh release create v<version>` with the exe. Do not --draft if the previous style was published.\n";
ship_prompt += "5. git add -A (not node_modules, not release/, not *.node if gitignored — extraResources must still pack the .node from disk at build time). Commit and git push origin main.\n";
ship_prompt += "6. Write docs/ENHANCE_REPORT.md: what landed, whether desktop-env.node exists, how to enable ledges, leftover.\n";
ship_prompt += "Return ok=true if the exe exists on the Desktop or release/.\n";

let ship = agent(ship_prompt, #{
    label: "ship:windows",
    capability_mode: "all",
    output_schema: status_schema,
});

let summary = "";
summary += "enhance-desktop-fly finished. Surfaces " + surface_ok.to_string() + "/4. ";
summary += "Verify " + verify_pass_count.to_string() + "/3. ";
if did_ok(ship) { summary += "Ship ok. See docs/ENHANCE_REPORT.md"; } else { summary += "Ship incomplete."; }

let report_path = write_scratch_file("report.md", summary);
complete(#{
    summary: summary,
    path: report_path,
    surfaces: surface_ok,
    verify: verify_pass_count,
    ship: did_ok(ship),
});
