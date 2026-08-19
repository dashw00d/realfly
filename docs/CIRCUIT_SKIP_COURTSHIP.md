# Skip courtship body acts

Roadmap item 6. The FlyWire courtship graph is real. A desktop courtship
object is not. Skip body acts until a **second fly with a brain** exists.
We explicitly do **not** want a second 1 kHz LIF. A scripted wing-wiggle
is worse than omitting it. Do not implement one.

This is **not** an ETL. Do not add a courtship slug to `etl.py`
`CORE_TYPES`. Do not add `courtshipDrive` / `songDrive`. Do not retune
LIF constants in `docs/PORT_CONTRACT.md`.

License: regenerated `data/*.json` stay FlyWire **CC BY-NC 4.0**. Code
MIT. Do not commit the raw Codex CSVs (`/tmp/flywire`).

---

## Why skip

Courtship is a **dyad**. pC1 / mAL wiring in v783 is how one animal
sings, orients, and gates toward another fly. Extra overlay flies today
are not that:

- Only fly **#1** runs `LIFSim`.
- Extras stay `signals = null` + `extrasMood` (a ~300 ms delayed, ±8%
  noisy copy of the leader’s walk/nervous/escape/groom/heading). That is
  flocking cosmetics, not a second brain, not a courtship object.
- A second 1 kHz circuit is out of scope (circuit-size budget, and the
  port contract: one sim).

Without a second brained fly there is nothing for pC1 to look at. Mapping
“another overlay sprite” onto pC1 the way loom maps onto LC4 would fake
the stimulus. Mapping a wall-clock onto a wing-wiggle would fake the
body. Hunger is allowed because deprivation is a **number onto cells**;
courtship is not a number.

`escw` (`DNp02` / `DNp04` / `DNp11`) already owns grounded wing-raise
and in-flight beat effort. That is escape, not song. Do not reuse
`wingDrive` as courtship.

---

## Grep (v783 `consolidated_cell_types.csv.gz` column 2)

Strict `primary_type` match. Do not invent unsuffixed names. Counts are
cells, not types.

| Looked-for string | n as `primary_type` | Verdict |
|---|---:|---|
| `P1` | **0** | literature cluster name; **not** a v783 primary_type |
| `pC1` | **0** | unsuffixed form absent; use `pC1a`…`pC1e` |
| `mAL` | **0** | unsuffixed form absent; 23 `mAL*` types exist |
| `vPR6` | **0** | absent as primary **and** additional_type (VNC song; FAFB is brain) |
| `pIP10` | **0** | song DN; not typed here |
| `pMP2` | **0** | not typed here |
| `TN1A` | **0** | VNC; not typed here |

Suffixed names that **do** grep (do not rename them):

| `primary_type` | n | side | in-syn (≥5) | out-syn (≥5) | note |
|---|---:|---|---:|---:|---|
| `pC1a` | 2 | 1 L / 1 R | 1630 | 2076 | ACH out; to `DNp37`, `pC1c` |
| `pC1b` | 2 | 1 L / 1 R | 1222 | 1382 | ACH out |
| `pC1c` | 2 | 1 L / 1 R | 2008 | 2096 | ACH out; in from `pC1a`, `oviIN` |
| `pC1d` | 2 | 1 L / 1 R | 3988 | 3673 | largest pC1; ACH out; to `DNa11` |
| `pC1e` | 2 | 1 L / 1 R | 1996 | 1764 | ACH out |
| `pC2la` | 1 | 1 L | 10 | 59 | tiny; do not treat as a command core |

`pC1f` = 0. All five `pC1*` cores are `super_class=central`. None of them
are in `data/circuit.json` today (708 cells; no `pC*` / `mAL*` members).

`mAL*` primary_types: **107** cells across **23** names. Classification
`class=mAL` is 77 cells. additional_type `mAL_fru` is on 54 cells whose
**primary** is `mAL4` (17), `mAL_f3` (10), `mAL_f4` (10), `mAL_f1` (8),
`mAL_f2` (6), `mAL4I` (2), `mAL5A` (1) — never invent `mAL_fru` as a
`CORE_TYPES` key. `mAL4` alone is 28 cells; that is a dump, not a
command DN.

`vPR13` is **not** a primary_type. It appears only as additional_type on
8 `AN_GNG_SAD_32`. That is not vPR6. Do not substitute.

Related reproductive types that also grep, and that we also skip:
`oviIN` (2), `oviDNa_a` (2), `oviDNa_b` (2), `oviDNb` (2). No desktop
oviposition object.

---

## What we are not doing

| Act | Why not |
|---|---|
| ETL `pC1a`…`pC1e` as a `court` role | types exist; the **stimulus** does not |
| Pull ~10 partners each for pC1 | would spend budget on a dead motive |
| `BrainSignals.courtshipDrive` | no rate to clamp; extras cannot copy a brain they do not have |
| Scripted wing-wiggle / song pulse | worse than omitting; `escw` is already escape wings |
| Treat extra flies as conspecifics | they have `signals = null`; not a courtship object |
| Second `LIFSim` for fly #2 | forbidden; extras stay `extrasMood` |
| Dump all 107 `mAL*` or aSP-g / pIP additional_types | size budget; not named command cores we will drive |

`in-circuit drive onto` a new role must still be hundreds of synapses
**if** this ever ships. That gate is irrelevant while the body act is
skipped. Do not pre-wire a silent courtship population “for later.”

---

## Revisit when (and only when)

A second overlay fly runs its **own** circuit, with a desktop number
onto the other’s pC1 the way loom lands on LC4. That is a product
decision we are not making. Until then, courtship stays omitted in the
README honesty section, `CIRCUIT_EXPAND_CONTRACT.md` “Not this pass”
table, and this file.

Sleep/clock/pain/olfaction are separate roadmap rows. This skip does not
block hunger/thirst (already wired) or a later sleep-neuron swap.
