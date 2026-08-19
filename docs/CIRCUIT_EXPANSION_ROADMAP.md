# Circuit expansion roadmap

The live fly is **not** a whole-brain simulation. Hunger, thirst, clock,
courtship, and most of FlyWire are absent from the 1 kHz circuit. This note
is how to add them *the same way loom already works*: real types + real
synapses + a desktop number into a sensory population + a clamped
`BrainSignals` field + body hysteresis. It is **not** a license to script
“the fly gets hungry after 5 minutes.”

License: regenerated `data/*.json` stay FlyWire **CC BY-NC 4.0**. Code stays
MIT. Do not commit the raw Codex CSVs.

---

## What is in the box today

| Layer | Count | Simulated? | Role |
|---|---|---|---|
| FlyWire v783 | 139,255 neurons | no | source connectome |
| `data/brain_points.json` | 23,210 somas | **no** | rotating cloud only |
| `data/circuit.json` | 732 neurons, ~18k signed edges | **yes**, 1 kHz LIF | escape / walk / groom / hunger / thirst / sleep |

`etl.py` `CORE_TYPES` (the only cells with a `role` other than `other`):

| FlyWire `primary_type` | role | body |
|---|---|---|
| LC4, LPLC2 | `lc4`, `lplc2` | loom → nervous; GF input |
| DNp01 | `gf` | escape takeoff |
| DNa01, DNa02 | `dna01`, `dna02` | steer |
| DNp09 | `dnp09` | walk |
| DNg11 | `dng11` | groom |
| MDN | `mdn` | backward |
| DNp02 / DNp04 / DNp11 | `escw` | wings |
| SEZ_NSC_Hugin, m_NSC_DH44, m_NSC_DILP, m_NSC_DMS | `hunger` | forage/walk |
| AstA1, BiT, SEZ_NSC_CAPA | `thirst` | seek-water/walk |
| FB6A, FB2B | `sleepn` | sleep from rate |
| s-LNv, l-LNv | `clock` | hour inject; HUD clockDrive |

Partners (~330) are the strongest synaptic neighbors of those cores, plus
reserved ascending (gait) and sensory (wind/tap) slots. They are **not** a
feeding circuit that happened to come along.

Desktop → sim today: cursor loom, air puff / tap, gait proprioception,
hunger/thirst depletion, idle+hour onto sleepn/clock. `BrainSignals.sleep`
is the sleepn rate. `activityScale` is still the compressed hour curve
(clock chemical outs are ~60 syn).

---

## Non-negotiable recipe (every new population)

Copied from upstream `CLAUDE.md`, mapped onto this repo. Skip a step and you
get the DNg11 bug (6 in-circuit synapses → noise, not network).

1. **Type exists in v783** (do not invent names):
   ```sh
   mkdir -p /tmp/flywire && cd /tmp/flywire
   B=https://storage.googleapis.com/flywire-data/codex/data/fafb/783
   curl -O "$B/classification.csv.gz" -O "$B/coordinates.csv.gz" \
        -O "$B/connections.csv.gz" -O "$B/consolidated_cell_types.csv.gz"
   gzcat consolidated_cell_types.csv.gz | cut -d, -f2 | sort | uniq -c | less
   gzcat consolidated_cell_types.csv.gz | grep -c ',EXACT_PRIMARY_TYPE,'
   ```
2. **`etl.py`**: `"TYPE": "roleslug"` in `CORE_TYPES`; add the slug to the
   reserved-partner `take(..., 10)` loop **and** the in-degree report loop.
3. **Rerun ETL**, read stdout. `in-circuit drive onto roleslug` must be
   **hundreds of synapses**, preferably thousands. If it is tiny, pick
   different types or pull that population’s own strongest partners before
   the generic `MAX_PARTNERS` fill.
4. **`src/sim/lif-sim.ts`**: group array, role switch, **deterministic**
   baseline for command DNs (`0.036` class — never random per-side), rate
   EMA in the spike counter. Optional: a new input field (like `loomL` /
   `airPuff`) if the desktop has a number to inject.
5. **`src/sim/signal-builder.ts`**: new `BrainSignals` field, **always
   clamp**. An unclamped `walkDrive` once sent the fly to 1,100 pt/s.
6. **`src/creature/fly.ts` `brainBehavior`**: hysteresis + `stateAge >= 0.4`
   for state changes; cooldowns for one-shots; action must work from every
   grounded state (MDN was dead from idle).
7. **Brain HUD**: `ROLE_BODY` in `src/renderer/brain-scene.ts`, color, click
   label, `--behaviortest` stim scenario.
8. **Do not retune** existing LIF constants (`docs/PORT_CONTRACT.md`). After
   ETL, `--simtest` must still hold: GF silent 4 s at rest, GF fires on
   abrupt loom, walk-drive alive at siesta 0.84.

Operating-point gotcha: neurons rest at `baseline × 20.4` vs threshold 1.0.
Never scale baselines linearly by hunger/mood. Compress toward 1
(`1 - (1-a)*0.35`) or populations go silent (siesta coma).

Circuit size: 668 cells at 1 kHz is the budget. A new core of tens of cells
plus ~10 partners is fine. Do **not** dump SEZ + mushroom body + all ORNs
in one pass.

Only fly #1 runs LIF. Extras stay `signals = null` + `extrasMood`.

---

## Candidate systems (verify names against v783)

Type strings below are **hypotheses**. Codex primary_type spelling changes
between dumps. The grep in step 1 is the source of truth. Prefer small,
named command populations (like DNp09) over “all dopaminergic neurons.”

### 1. Hunger / foraging — first internal-state circuit

**Why:** the most-asked gap. Foraging is a walk-drive competitor (explore vs
escape vs groom), not a new animation.

**Likely FlyWire buckets to search** (adult, not larva IN1):

| Look for in `primary_type` / class | Notes |
|---|---|
| `hugin`, `Hugin` | peptide; feeding / gut |
| `DH44` | diuretic hormone; metabolic |
| `PI`, `IPCs`, `Dilp`, `insulin` | pars intercerebralis |
| SEZ / `GNG` motor / feeding DNs | pumping, proboscis |
| taste projection / `GRN` if typed | only if a desktop “taste” exists |
| PAM / PPL1 DANs | learning; easy to over-pull |

**Desktop number (transduction, like loom):** a slow **deprivation** 0..1,
not a cartoon fridge.

| Source | Mapping |
|---|---|
| Time since last “feeding event” | leaky integrator, hours not seconds |
| Long idle without clicks | raises hunger (foraging), *conflicts* with sleep |
| Hot machine (`environmentTempo` > 1) | slight hunger/thirst bump (ectotherm) |
| Optional later: a desktop crumb | only if hunger drive is already high |

**Body (only if the network actually spikes):**

- high hunger + low loom → raise `walkDrive` bias / lower groom
- hunger + food speck in overlay coords → turn bias toward it
- satiety → idle / groom (proboscis pose is optional cosmetics)

**Do not:** set `state = foraging` from a wall clock while the circuit is
silent.

**Tests:** stim the new group → walk or turn within N ms; GF rest/loom tests
unchanged; satiety must not zero walk-drive (same class of bug as siesta coma).

### 2. Thirst — pair with hunger, smaller population

**Search:** `leucokinin` / `Lk`, `AstA`, `IR` water taste, named “thirsty”
types in Codex if any.

**Desktop number:** dehydration 0..1 from (a) time, (b) high `environmentTempo`
(hot CPU → thirsty fly is the one mapping that is actually cute).

**Body:** walk toward a designated “water” (screen edge, or a blue-ish
window if ledges exist). Low thirst: ignore it. Do not drink-animate unless
a motor type survives the synapse-count gate.

Ship thirst in the **same ETL pass** as hunger if both types exist; they
share a depletion integrator. Keep two `BrainSignals` fields
(`hungerDrive`, `thirstDrive`) so the HUD can tell them apart.

### 3. Replace scripted sleep with sleep neurons

Sleep is already faked (`idle > 600s` at night, `sensoryGate = 0.55`). That
is the cleanest **swap** of a lie for wiring.

**Search:** dorsal fan-shaped body (`ExFl`, `dFB`), `R5`, helmsman, PDF /
`LNv` clock.

**Desktop number:** keep idle + hour as **input** onto those cells (like
loom onto LC4), then let `BrainSignals.sleep` come from their rate, not
from the if-statement. Clock cells could replace `circadianActivity()` the
same way.

**Gate:** GF must still fire on loom through a lowered `sensoryGate`. If
sleep neurons silence GF, the animal is wrong.

### 4. Clock / circadian (instead of the hand curve)

`circadianActivity(hour)` is a drawn bump (dawn/dusk peaks, siesta 0.55).
PDF LNvs and DN clock types, if present and connected, can modulate
`activityScale` the same compressed way. Do this **with** sleep, not as a
third mood slider.

### 5. Pain / nociception (cheap if types exist)

Basin / nociceptive VNC types sometimes appear as ascending partners
already. If a named nociceptive class has real indegree, map **harsh
desktop events** (window slammed shut underfoot, which already takeoffs via
ledge loss) onto that group instead of only the locomotion if.

This is a refinement of ecology, not a new minigame.

**Checked (v783 + live 708-cell `circuit.json`):** no `Basin` /
`nocicep` / `ppk` / `A00c` / `mdIV` / `pain` primary_type or
additional_type, including hitchhiking `other`/`ascending` partners.
Do not ETL a substitute dump. Window-close-underfoot stays the
ledge-loss takeoff; harsh loom stays LC4/LPLC2.

### 6. Courtship — last, maybe never

P1 / pC1 / mAL / vPR6. The connectome is real; a desktop “courtship object”
is not. Skip until there is a second fly with a brain (we explicitly do not
want a second 1 kHz LIF). A scripted wing-wiggle is worse than omitting it.

### 7. Olfaction / non-loom vision — only with a stimulus

ORNs/PNs and the rest of optic glomeruli explode circuit size. Do not add
them “because FlyWire has them.” Add a glomerulus when there is a desktop
odor/visual (e.g. a specific window class as a “flower”). Until then, LC4
+ LPLC2 are the visual system.

---

## Suggested order

| # | Work | Why this order |
|---|---|---|
| 0 | Dump Codex locally, inventory types (step 1) | Every later row depends on real names |
| 1 | Hunger core + partners, ETL report, simtest still green | Highest-value internal state |
| 2 | Thirst in the same ETL if types exist | Shared depletion integrator |
| 3 | `BrainSignals` + `brainBehavior` + HUD + behaviortest | Visible, falsifiable |
| 4 | Sleep/clock swap for the scripted path | Removes a known lie |
| 5 | Nociception onto existing ecology | Tiny if types hitchhike |
| 6 | Courtship / olfaction | Only with a second stimulus |

Do not start 4–6 until 1–3 pass `--simtest` and `--behaviortest` on the
**combined** circuit. ETL is one `circuit.json`; you cannot A/B two graphs
in production without a flag, and a flag that ships two brains is out of
scope.

---

## Files to touch (this repo)

| File | Change |
|---|---|
| `etl.py` | `CORE_TYPES`, partner `take` loops, indegree print |
| `data/circuit.json` | regenerated (CC BY-NC) |
| `src/sim/lif-sim.ts` | groups, baselines, rates, optional inputs (`hungerIn`, …) |
| `src/shared/brain-signals.ts` | new fields + `BRAIN_SIGNAL_KEYS` |
| `src/sim/signal-builder.ts` | clamp mapping |
| `src/creature/fly.ts` | `brainBehavior` hysteresis |
| `src/main/world-loop.ts` | desktop → new sim inputs (depletion, idle, tempo) |
| `src/renderer/brain-scene.ts` | `ROLE_BODY`, colors |
| `src/renderer/brain.ts` | HUD rows |
| `src/tests/sim.test.ts` | rest/loom still pass; new stim probe |
| `src/tests/behavior.test.ts` | stim population → body |
| `docs/PORT_CONTRACT.md` | freeze the new constants once they work |

`data/brain_points.json` does **not** need a new cloud for this. The 23k
points already include most somas; only `circuit.json` membership changes.

---

## Desktop depletion (shared for hunger + thirst)

Keep this as dumb as loom: one number per need, 0..1, updated in
`world-loop`, injected in `LIFSim.step` onto the new group the same way
`airPuff` hits sensory cells.

Sketch (do not copy blindly — constants come after ETL):

```ts
// hungerIn / thirstIn: 0..1, never scale LIF baselines by these
hunger += dt / (6 * 3600)          // ~6 h to saturate
if (feedingEvent) hunger *= 0.2
hunger *= environmentTempo > 1.1 ? 1.05 : 1   // hot → slightly faster drain
thirst += dt / (4 * 3600)
thirst *= environmentTempo > 1.2 ? 1.1 : 1
```

`feedingEvent` is optional. Without crumbs, hunger is just a slow
explore-bias the **network** has to express. That is the point.

---

## What “done” looks like

- Codex types grepped, synapse indegree printed, not hoped.
- GF still silent at rest and still fires on abrupt loom.
- Clicking the new region in the brain window produces the body act.
- HUD shows `hungerDrive` / `thirstDrive` (or sleep-rate) from the
  **circuit**, while the desktop only supplies the 0..1 input.
- README honesty section updated: which motives are now wired, which are
  still modeled.

Until then, the fly is an escape/walk animal with a fake circadian. That is
already more honest than a hunger meter on an LC4.
