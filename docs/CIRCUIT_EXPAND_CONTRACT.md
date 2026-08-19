# Circuit expand contract

Freeze for the hunger / thirst / sleep / clock pass. Counted from
`data/circuit.json` after ETL (`etl.py` `CORE_TYPES` as of this file). Do
not invent `primary_type` strings; do not retune LIF constants in
`docs/PORT_CONTRACT.md`; do not script `state = foraging` from a wall clock.

License: regenerated `data/*.json` stay FlyWire **CC BY-NC 4.0**. Code MIT.
Do not commit raw Codex CSVs (`/tmp/flywire`).

Upstream body/LIF numbers for the original escape/walk/groom set stay in
`docs/PORT_CONTRACT.md`. This file only adds the new roles and the
depletion inputs. `--simtest` / `--behaviortest` predicates are not
weakened.

---

## Circuit after ETL (actual)

| | |
|---|---|
| source | FlyWire Codex FAFB v783 (`syn>=5`, signed by `nt_type`) |
| neurons | **732** (402 core + 330 partners) |
| edges | **17808** |
| previous size | 708 (378 core + 330 partners) hunger/thirst; 668 original |
| delta | **+24 cores** (`sleepn` 8 + `clock` 16) on top of hunger/thirst; partner cap still 330 |

`in-circuit drive` = sum of `|syn|` on edges whose postsynaptic cell has
that role. New-role gate is **hundreds**, preferably thousands.

---

## Roles present (slug → count)

| slug | n | FlyWire `primary_type` (n) | sides | in-syn | out-syn |
|---|---:|---|---|---:|---:|
| `other` | 330 | partners (`central` 175, `optic` 41, `descending` 33, `ascending` 29, `visual_centrifugal` 21, `sensory` 18, `visual_projection` 13) | 149 L / 178 R / 3 C | 129390 | 141396 |
| `lplc2` | 210 | `LPLC2` (210) | 108 L / 102 R | 15758 | 37850 |
| `lc4` | 104 | `LC4` (104) | 54 L / 50 R | 16203 | 13594 |
| `hunger` | **34** | `m_NSC_DILP` (18), `m_NSC_DH44` (6), `m_NSC_DMS` (6), `SEZ_NSC_Hugin` (4) | 15 L / 19 R | **3534** | **0** |
| `clock` | **16** | `s-LNv` (8), `l-LNv` (8) | 8 L / 8 R | **998** | **60** |
| `sleepn` | **8** | `FB6A` (4), `FB2B` (4) | 4 L / 4 R | **809** | **3542** |
| `dng11` | 6 | `DNg11` (6) | 3 L / 3 R | 908 | 126 |
| `escw` | 6 | `DNp02` (2), `DNp04` (2), `DNp11` (2) | 3 L / 3 R | 7724 | — |
| `thirst` | **6** | `AstA1` (2), `BiT` (2), `SEZ_NSC_CAPA` (2) | 3 L / 3 R | **1480** | **628** |
| `mdn` | 4 | `MDN` (4) | 2 L / 2 R | 3520 | — |
| `dna01` | 2 | `DNa01` (2) | 1 L / 1 R | 4870 | — |
| `dna02` | 2 | `DNa02` (2) | 1 L / 1 R | 7482 | — |
| `dnp09` | 2 | `DNp09` (2) | 1 L / 1 R | 1880 | — |
| `gf` | 2 | `DNp01` (2) | 1 L / 1 R | 4432 | — |

**New roles after this ETL:** `hunger`, `thirst`, `sleepn`, `clock`. All
four pass the synapse gate (hundreds of in-circuit synapses). Hunger cores
are peptide NSCs: **zero chemical outs**. Clock PDF LNvs have **~60
chemical outs** (peptide release is not a Codex edge). Sleepn are GLUT
and inhibit partners (`other`), **not GF** (zero sleepn→gf edges).

Roles **not** in `circuit.json`: pain, courtship, ORN/PN dumps, mushroom
body. `activityScale` stays the compressed hour curve; clockDrive is HUD.

`etl.py` `CORE_TYPES` that produced these slugs (verified in
`/tmp/flywire/consolidated_cell_types.csv.gz`; do not invent names):

```
"LC4": "lc4", "LPLC2": "lplc2", "DNp01": "gf",
"DNa02": "dna02", "DNa01": "dna01", "DNp09": "dnp09",
"DNg11": "dng11", "MDN": "mdn",
"DNp02": "escw", "DNp04": "escw", "DNp11": "escw",
"SEZ_NSC_Hugin": "hunger", "m_NSC_DH44": "hunger",
"m_NSC_DILP": "hunger", "m_NSC_DMS": "hunger",
"AstA1": "thirst", "BiT": "thirst", "SEZ_NSC_CAPA": "thirst",
"FB6A": "sleepn", "FB2B": "sleepn",
"s-LNv": "clock", "l-LNv": "clock",
```

Partner `take(..., 10)` and in-degree report include `hunger`, `thirst`,
`sleepn`, and `clock`.

---

## BrainSignals + LIF + clamp + body

SignalBuilder **always clamps** new fields. `groomDrive` stays unclamped
(upstream). Do not scale LIF **baselines** by hunger/mood; compress
activity toward 1 (`activityScale = 1 - (1-a)*0.35`) as today.

Command-DN baselines stay deterministic **0.036-class** (never random
per-side). `hunger` / `thirst` use **0.036**; `sleepn` / `clock` use **0.004**
(quiet until idle+hour). Existing roles keep
`PORT_CONTRACT.md` baselines (`dnp09` 0.038, loom 0.004, `gf` 0.002,
`other` random 0.010…0.070).

LIF constants frozen: `decay 0.9512`, `weightScale 0.0008`,
`gapJunctionBoost 6`, `inhDelay 4`. Injection gain for the new inputs
copies air puff (`* 0.12 * sensoryGate`, fire if input `> 0.001`).

| slug | n | BrainSignals field | LIF group / rate | LIF input | clamp | body hysteresis |
|---|---:|---|---|---|---|---|
| `lc4` | 104 | `nervous` | `loomLeft`/`loomRight`, `rateLoom` | `loomL` / `loomR` (`* loomGain 0.30 * sensoryGate`) | `clamp(rateLoom/80, 0, 1)` | dart: `nervous > 0.40 && dartCooldown == 0` (1.2 s cooldown) |
| `lplc2` | 210 | `nervous` (same) | same | same | same | same |
| `gf` | 2 | `escape` | `gf`, latch | none (stim / loom network) | boolean latch via `consumeGF()` | `escape && scareCooldown == 0` → takeoff from any state |
| `dna01` | 2 | `turnBias` | `dnaL`/`dnaR`, `rateDNaL`/`rateDNaR` | none | `clamp((diff-dnaBaseline)*0.04, -1, 1)` | walking: `heading += turnBias * dt` |
| `dna02` | 2 | `turnBias` (same) | same | none | same | same |
| `dnp09` | 2 | `walkDrive` | `fwd`, `rateFwd` | none (gait → `ascend` is the proprioceptive input) | `clamp(rateFwd/10, 0, 1.3)` | enter idle→walk `walkDrive > 0.22 && stateAge > 0.4`; exit `walkDrive < 0.08 && stateAge > 0.5` |
| `dng11` | 6 | `groomDrive` | `groom`, `rateGroom` | none | **unclamped** `rateGroom/8` (upstream) | enter `> 0.5 && nervous < 0.3 && stateAge > 0.4`; exit `< 0.3 && stateAge > 0.6` |
| `mdn` | 4 | `backward` | `mdn`, `rateMDN` | none | boolean `rateMDN > 8` | `backward && backwardTimer == 0 && dartTimer == 0` → 0.5 s reverse from any grounded state |
| `escw` | 6 | `wingDrive` | `escw`, `rateEscW` | none | `clamp(rateEscW/10, 0, 1.3)` | no extra hysteresis (flight cosmetics / takeoff already owned by GF) |
| `other` (`ascending`) | 29 | (gait, not a signal) | `ascend` | `gaitDrive` (`* 0.09 * (0.5+0.5*sin)`) | n/a | n/a |
| `other` (`sensory`) | 18 | (startle via network) | `sens` | `airPuff` (`* 0.12 * sensoryGate`) | n/a | tap path already in `--behaviortest` |
| `other` (rest) | 283 | `arousal` (whole pop) | n/a | none | `clamp(ratePop/20, 0, 1)` | walking takeoff chance `arousal > 0.5 ? 0.6 : 0.005` /s |
| **`hunger`** | **34** | **`hungerDrive`** | `hunger[]`, `rateHunger` | **`hungerIn`** (0..1, like `airPuff`) | **`clamp(rateHunger/10, 0, 1)`** | walk **competitor**, no new state — see below |
| **`thirst`** | **6** | **`thirstDrive`** | `thirst[]`, `rateThirst` | **`thirstIn`** (0..1, like `airPuff`) | **`clamp(rateThirst/10, 0, 1)`** | walk **competitor** toward water — see below |
| **`sleepn`** | **8** | **`sleepDrive`** + **`sleep`** | `sleepn[]`, `rateSleep` | **`sleepIn`** (idle+hour 0..1, `* 0.12`, **no** sensoryGate) | **`clamp(rateSleep/10, 0, 1)`**; `sleep = sleepDrive > 0.22` | sleeping first-wins; wake → grooming |
| **`clock`** | **16** | **`clockDrive`** (HUD, not a body slider) | `clock[]`, `rateClock` | **`clockIn`** (`circadianActivity(hour)`, `* 0.12`, no sensoryGate) | **`clamp(rateClock/10, 0, 1)`** | no body act; activityScale stays compressed hour curve |

Live loop overlays `tempo = environmentTempo` only. `sleep` comes from
SignalBuilder (sleepn rate). `activityScale` / `sensoryGate` use **circuit**
sleep, not `isSleepy`. Only fly **#1** runs `LIFSim`. Extra flies stay
`signals = null` + `extrasMood` (do not copy drives into extras as a second
brain).

If a later ETL dropped `hunger`/`thirst` cells, `hungerIn`/`thirstIn`
would remain as **0-wired** fields (no group to inject). That is not the
case now: both groups are non-empty.

---

## `hungerIn` / `thirstIn` (like `airPuff`)

Public `LIFSim` fields, default **0**. `SimStepInput` carries them the
same way as `airPuff`. Injected each 1 ms tick onto the matching group
only — never by scaling baselines.

```ts
// airPuff (existing)
if (this.airPuff > 0.001) {
  const add = this.airPuff * 0.12 * this.sensoryGate
  for (const i of this.sens) v[i] += add
}
// hunger / thirst (this pass)
if (this.hungerIn > 0.001) {
  const add = this.hungerIn * 0.12 * this.sensoryGate
  for (const i of this.hunger) v[i] += add
}
if (this.thirstIn > 0.001) {
  const add = this.thirstIn * 0.12 * this.sensoryGate
  for (const i of this.thirst) v[i] += add
}
```

Rate EMA: same `rateAlpha = 1/120` as every other group.

```ts
rateHunger += (cHunger * 1000 / max(1, hunger.length) - rateHunger) * RATE_ALPHA
rateThirst += (cThirst * 1000 / max(1, thirst.length) - rateThirst) * RATE_ALPHA
```

SignalBuilder:

```ts
hungerDrive = clamp(rateHunger / 10, 0, 1)
thirstDrive = clamp(rateThirst / 10, 0, 1)
sleepDrive = clamp(rateSleep / 10, 0, 1)
clockDrive = clamp(rateClock / 10, 0, 1)
sleep = sleepDrive > 0.22
```

Defaults: drives `0`, `sleep` false. HUD (`BrainHudSnapshot`) and
`ROLE_BODY`:

```
hunger: 'forage/walk'
thirst: 'seek-water/walk'
sleepn: 'sleep'
clock: 'circadian'
```

Click-stim groups: `hunger` → `sim.hunger`, `thirst` → `sim.thirst`,
`sleepn` → `sim.sleepn`, `clock` → `sim.clock`
(same `stimulate(group, strength, durationMs)` path as `fwd` / `groom`).

---

## Desktop depletion (the 0..1 number, not a body script)

`world-loop` owns two leaky integrators, clamped 0..1, injected as
`hungerIn` / `thirstIn`. Time since last feeding is **input onto the
cells**, not `if (minutes > N) state = foraging`.

```ts
hunger += dt / (6 * 3600)            // ~6 h to saturate
if (feedingEvent) hunger *= 0.2      // optional; crumbs later
if (environmentTempo > 1.1) hunger = min(1, hunger * 1.05)
thirst += dt / (4 * 3600)            // ~4 h to saturate
if (environmentTempo > 1.2) thirst = min(1, thirst * 1.1)
hungerIn = hunger
thirstIn = thirst
```

`feedingEvent` is optional. Without crumbs, hunger is a slow explore-bias
the **network rate** has to express.

---

## Body hysteresis (hunger / thirst)

No `foraging` / `drinking` FlyState. Skip courtship acts. Skip
proboscis / drink cosmetics (no feeding MN survived the type gate).
Escape, dart, MDN reverse, and sleep keep their existing first-wins
order in `brainBehavior`.

`exploreDrive = max(walkDrive, hungerDrive, thirstDrive)` when
`nervous < 0.3`; otherwise `exploreDrive = walkDrive` (loom wins).

| trigger | condition | action |
|---|---|---|
| hunger/thirst walk enter | idle && `exploreDrive > 0.22` && `stateAge >= 0.4` | `state = walking` (same as DNp09 walk enter) |
| hunger/thirst walk exit | walking, no dart, `exploreDrive < 0.08` && `stateAge > 0.5` | idle, speed 0 |
| walk speed | walking, no dart/back | `target = (14 + exploreDrive * 55) * tempo` |
| groom suppress | `hungerDrive > 0.5` or `thirstDrive > 0.5` | skip groom enter (need still wins over groom) |
| satiety | `hungerDrive` / `thirstDrive` low | **must not** zero `walkDrive` or scale baselines (siesta-coma class) |
| thirst heading | walking && `thirstDrive > 0.22` && `nervous < 0.3` | bias heading toward designated water (screen edge); `thirstDrive < 0.08` → ignore |
| hunger heading | optional later: food speck in overlay coords && `hungerDrive > 0.22` | turn toward speck; omit until a crumb exists |
| click hunger | stim `hunger` group | walk within the behaviortest hold (explore, not takeoff) |
| click thirst | stim `thirst` group | walk within the hold; water heading only if thirst rate is high |

`--behaviortest` may add hunger/thirst stim probes. Do **not** add extra
required terms to the `--simtest` five-term predicate
(`gfSpont == 0 && gfLoom > 0 && walkOn > 0 && gfStim && siestaPct > 3`).
Satiety must leave siesta walk-drive `> 3%`.

---

## Sleep / clock (this pass)

Idle + hour stay **inputs** (like loom onto LC4). `BrainSignals.sleep` is
the sleepn rate, not `if idle > 600`. Clock cells receive `clockIn =
circadianActivity(hour)` but cannot replace the activity curve via wiring
(~60 chemical outs; LIF rate saturates). `activityScale` stays
`1 - (1-a)*0.35`, times 0.75 when circuit sleep is true. `sensoryGate`
0.55 when sleeping; GF must still fire on loom.

```ts
if (this.sleepIn > 0.001) {
  const add = this.sleepIn * 0.12
  for (const i of this.sleepn) v[i] += add
}
if (this.clockIn > 0.001) {
  const add = this.clockIn * 0.12
  for (const i of this.clock) v[i] += add
}
sleepDrive = clamp(rateSleep / 10, 0, 1)
clockDrive = clamp(rateClock / 10, 0, 1)
sleep = sleepDrive > 0.22
```

## Not this pass

| Motive | In circuit.json? | Notes |
|---|---|---|
| sleep neurons (`FB6A`, `FB2B` → `sleepn`) | **yes** | idle+hour inject; sleep from rate |
| clock (`s-LNv`, `l-LNv` → `clock`) | **yes** | hour inject; activityScale still compressed curve |
| pain | no | no v783 `Basin` / `nocicep` / `ppk` primary_type; hitchhike check empty (`AN_*` ascendings, JO/AMMC auditory). Window slam stays ledge-loss takeoff; harsh loom stays LC4/LPLC2. No `painIn`, no minigame, no ETL |
| courtship | no | skip body acts; no second 1 kHz LIF |
| ORNs / PNs / mushroom body | no | size budget |

---

## Implementation gap (this contract vs current TS)

Wired. `LIFSim` groups `hunger`/`thirst` at baseline 0.036; `sleepn`/`clock`
at 0.004. Hunger/thirst inject like air puff (`* 0.12 * sensoryGate`).
Sleep/clock inject idle+hour at `* 0.12` without sensoryGate.
`SignalBuilder` clamps the four drives; `sleep` is `sleepDrive > 0.22`.
HUD rows + `ROLE_BODY`. Desktop depletion is `stepDepletion`; sleepIn is
`sleepInFromIdle`. Do not regenerate Codex dumps; do not grow the
partner cap past 330.

HUD / extras: fly #1 HUD shows circuit-derived drives. Desktop only
supplies the 0..1 inputs. Extras stay `signals = null` + `extrasMood`.
