# Circuit expansion report

Hunger, thirst, sleep, and clock are in `data/circuit.json` and the 1 kHz
LIF. Desktop numbers land on those cells; `BrainSignals` fields come from
population rates. There is no `state = foraging` timer and no
`if idle > 600` sleep overwrite.

License: regenerated `data/*.json` stay FlyWire **CC BY-NC 4.0**. Code
MIT. Raw Codex CSVs in `/tmp/flywire` were not committed.

---

## Types grepped (v783 source of truth)

`gzip -dc /tmp/flywire/consolidated_cell_types.csv.gz` column 2
(`primary_type`). Header `root_id,primary_type,additional_type(s)`.
138,327 typed rows. Strict match only — invented strings are 0.

| Looked-for string | primary_type n | Verdict |
|---|---:|---|
| `SEZ_NSC_Hugin` | 4 | keep → `hunger` |
| `m_NSC_DH44` | 6 | keep → `hunger` |
| `m_NSC_DILP` | 18 | keep → `hunger` |
| `m_NSC_DMS` | 6 | keep → `hunger` |
| `AstA1` | 2 | keep → `thirst` |
| `BiT` | 2 | keep → `thirst` (`class=TPN` `sub_class=water_PN`) |
| `SEZ_NSC_CAPA` | 2 | keep → `thirst` |
| `FB6A` | 4 | keep → `sleepn` (2 extra cells have additional `FB6A`; not pulled) |
| `FB2B` | 4 | keep → `sleepn` |
| `s-LNv` | 8 | keep → `clock` |
| `l-LNv` | 8 | keep → `clock` |
| `Hugin` / `Dilp` / `IPCs` / `insulin` | 0 | not a primary_type |
| `leucokinin` / `Lk` / `IR56` / `IR7` / `thirst` / `water` | 0 | no thirst command under those strings |
| `ExFl` / `dFB` / `R5` / `PDF` | 0 | literature aliases, not v783 names |
| `Basin` / `nocicep` / `ppk` / `A00c` / `mdIV` / `pain` | 0 | pain empty |
| `P1` / `pC1` / `mAL` / `vPR6` | 0 | unsuffixed courtship names absent |
| `pC1a`…`pC1e` | 2 each | courtship — **skipped** (no second brain) |
| `ORN_*` | 2279 / 53 glomeruli | olfaction — **skipped** (no desktop odor) |
| `class=ALPN` | 685 / 182 types | skipped |
| `class=Kenyon_Cell` | 5177 | mushroom body — skipped |

Existing escape/walk cores still match: `LC4` 104, `LPLC2` 210, `DNp01` 2,
`DNa01` 2, `DNa02` 2, `DNp09` 2, `DNg11` 6, `MDN` 4, `DNp02/04/11` 2 each.

Full inventory: `docs/CIRCUIT_TYPES_FOUND.md`. Courtship skip:
`docs/CIRCUIT_SKIP_COURTSHIP.md`. Olfaction skip:
`docs/CIRCUIT_SKIP_OLFACTION.md`.

---

## Types kept

`etl.py` `CORE_TYPES` (no invented names):

```
LC4, LPLC2, DNp01, DNa01, DNa02, DNp09, DNg11, MDN, DNp02, DNp04, DNp11
SEZ_NSC_Hugin, m_NSC_DH44, m_NSC_DILP, m_NSC_DMS   → hunger
AstA1, BiT, SEZ_NSC_CAPA                          → thirst
FB6A, FB2B                                        → sleepn
s-LNv, l-LNv                                      → clock
```

Partner `take(..., 10)` and the in-degree report loop include
`hunger`, `thirst`, `sleepn`, `clock`. Partner cap stays **330**.

Rejected (grepped, not kept): `m_NSC_unknown`, lateral NSCs (`l_NSC_*`),
`LB2d` / `LB3` GRN dumps, `FB5H`/`FB6H`/`FB7B` wake DANs, `ER5`, extra
`FB6*`/`FB2B_b`, `5th-LNv`, `DN1a`, PAM/PPL1 dumps, all `ORN_*` / ALPN /
Kenyon / MBON, unsuffixed courtship names, any pain substitute.

---

## Synapse indegrees (in-circuit)

`in-circuit drive` = sum of `|syn|` on edges whose postsynaptic cell has
that role. Gate is **hundreds**, preferably thousands.

| role | n | in-syn | out-syn | notes |
|---|---:|---:|---:|---|
| `hunger` | 34 | **3534** | **0** | peptide NSCs; desktop `hungerIn` is the drive |
| `thirst` | 6 | **1480** | **628** | AstA1 carries most outs |
| `sleepn` | 8 | **809** | **3542** | GLUT; **0** edges onto GF |
| `clock` | 16 | **998** | **60** | PDF peptide; cannot set network gain |
| `gf` | 2 | 4432 | 456 | unchanged recipe |
| `dna01` | 2 | 4870 | 8 | |
| `dna02` | 2 | 7482 | 133 | |
| `dnp09` | 2 | 1880 | 630 | |
| `dng11` | 6 | 908 | 126 | |
| `mdn` | 4 | 3520 | 278 | |
| `escw` | 6 | 7724 | 3244 | |

Per-type in-circuit (same graph):

| `primary_type` | in | out |
|---|---:|---:|
| `SEZ_NSC_Hugin` | 270 | 0 |
| `m_NSC_DH44` | 1067 | 0 |
| `m_NSC_DILP` | 1987 | 0 |
| `m_NSC_DMS` | 210 | 0 |
| `AstA1` | 930 | 616 |
| `BiT` | 88 | 12 |
| `SEZ_NSC_CAPA` | 462 | 0 |
| `FB6A` | 322 | 3530 |
| `FB2B` | 487 | 12 |
| `s-LNv` | 237 | 60 |
| `l-LNv` | 761 | 0 |

Hitchhike check on the 732 live members vs Codex: **no** `Basin` / `ppk`
/ `ORN_*` / `pC1*` / Kenyon. Four `other` partners are `mALC3`/`mALC5`
(centrifugal; substring `mAL` only — not courtship `mAL*`).

---

## Neuron / edge counts

| graph | neurons | cores | partners | edges |
|---|---:|---:|---:|---:|
| HEAD (`origin/main`, escape/walk only) | **668** | 338 | 330 | **18968** |
| hunger + thirst only (intermediate) | 708 | 378 | 330 | — |
| **this pass** (`data/circuit.json`) | **732** | **402** | **330** | **17808** |

Delta vs HEAD: **+64 cores** (hunger 34 + thirst 6 + sleepn 8 + clock 16).
Partner cap unchanged. Edge count dropped because reserved partner slots
for the new roles displaced some generic high-degree neighbors — not a
second brain.

Live partner super_classes: `central` 174, `optic` 38,
`visual_centrifugal` 28, `descending` 31, `ascending` 29, `sensory` 18,
`visual_projection` 12.

`data/brain_points.json` was not rebuilt for this (23,210 somas already
cover the new cores).

---

## Wiring (not a wall clock)

Desktop → group inject (like loom onto LC4):

| input | source | inject |
|---|---|---|
| `hungerIn` | `stepDepletion` ~6 h to 1; tempo > 1.1 ×1.05 rate | `* 0.12 * sensoryGate` onto `hunger` |
| `thirstIn` | same integrator ~4 h; tempo > 1.2 ×1.1 rate | `* 0.12 * sensoryGate` onto `thirst` |
| `sleepIn` | `min(1, max(night ? idle/600 : 0, idle/1800))` | `* 0.12` onto `sleepn` (**no** sensoryGate) |
| `clockIn` | `circadianActivity(hour)` | `* 0.12` onto `clock` (no sensoryGate) |

`BrainSignals` from rates, always clamped:

```
hungerDrive = clamp(rateHunger / 10, 0, 1)
thirstDrive = clamp(rateThirst / 10, 0, 1)
sleepDrive  = clamp(rateSleep  / 10, 0, 1)
clockDrive  = clamp(rateClock  / 10, 0, 1)
sleep       = sleepDrive > 0.22
```

Body: `exploreDrive = max(walkDrive, hungerDrive, thirstDrive)` when
`nervous < 0.3`. No `foraging` FlyState. Thirst > 0.22 biases heading
toward the screen edge. Hunger/thirst > 0.5 skip groom enter. Satiety
does not zero `walkDrive` or scale LIF baselines.

Baselines: command DNs + hunger/thirst **0.036** (deterministic, never
random per-side). `sleepn`/`clock` **0.004** (0.036-class would sleep at
rest). LIF constants unchanged (`decay 0.9512`, `weightScale 0.0008`,
`gapJunctionBoost 6`, `inhDelay 4`). Activity still compresses toward 1
(`1 - (1-a)*0.35`); circuit sleep applies ×0.75 and `sensoryGate 0.55`.

Only fly **#1** runs `LIFSim`. Extras stay `signals = null` + `extrasMood`
(delayed noisy copy of walk/nervous/escape/groom/heading — not a second
circuit).

---

## Tests

`--simtest` five-term predicate **not** widened:

`gfSpont == 0 && gfLoom > 0 && walkOn > 0 && gfStim && siestaPct > 3`

Added (not in that gate):

- GF still fires on loom through `sensoryGate = 0.55`
- hunger/thirst stim → clamped drives; satiety does not zero walk-drive
- `sleepIn`/`clockIn` raise clamped drives; `sleep` comes from sleepn rate

`--behaviortest` keeps the original 7 stim + 10 body checks. Added:

- hunger stim → walk (explore, not takeoff; Hugin n=4 so arousal does not take off)
- thirst stim → walk
- sleepn stim → sleeping
- `exploreDrive` loom-wins; satiety walk; groom suppress; thirst heading;
  escape/sleep/MDN first-wins over hunger

Environment: depletion is a **rate** (60 hot ticks must not explode);
`sleepIn` ramps; `clockIn` is the hour curve.

`pnpm test`: **66 passed / 11 files**. Simtest print:
`circuit: 732 neurons | hunger: 34 | thirst: 6 | sleepn: 8 | clock: 16`;
GF silent 4 s, loom first spike **4 ms**, walk-drive 18%, siesta 6% (>3),
GF stim yes. Hunger/thirst/sleepn stim scenarios PASS. LIF constants were
not retuned.

---

## Skips

| Motive | Why |
|---|---|
| Courtship body acts | pC1a–e exist; no second 1 kHz LIF; extras are not a courtship object. No scripted wing-wiggle. |
| Olfaction / non-loom vision | 2,279 ORNs + 685 ALPNs + 5,177 Kenyon. No desktop odor. LC4+LPLC2 stay the visual system. |
| Mushroom body / PAM / PPL1 | size budget; learning dump. |
| Pain / nociception | no v783 `Basin`/`ppk`/`A00c` types, including hitchhiking partners. Window-close stays ledge-loss takeoff. |

---

## Leftovers

- **`activityScale` is still the compressed hour curve.** Clock chemical
  outs are ~60 synapses; `clockDrive` is HUD evidence the LNvs see hour,
  not a gain slider.
- **No feeding crumbs.** Hunger is a slow explore-bias the network has
  to express. `feedingEvent` is unused.
- **No drink / proboscis cosmetics.** No feeding MN survived the type gate.
- **Circadian *shape*** is still hand-authored (`circadianActivity`
  control points). Sleep *state* is not.
- Pain, courtship, olfaction stay omitted until a named type **and** a
  desktop number exist.

README honesty matches this split: hunger / thirst / sleep are **wired**;
circadian gain is still modeled; courtship / olfaction / nociception are
out.

New constants only (LIF numbers frozen): `docs/PORT_CONTRACT.md`
hunger/thirst/sleep/clock fields, 0.036 / 0.004 baselines, inject `* 0.12`,
clamp `/10`, `sleep = sleepDrive > 0.22`.
