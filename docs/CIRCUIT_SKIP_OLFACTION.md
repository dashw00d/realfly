# Circuit skip: olfaction / non-loom vision

Roadmap item 7. Counted with a strict match on
`/tmp/flywire/consolidated_cell_types.csv.gz` (column 2) and
`classification.csv.gz` (`class` / `sub_class`). Do not treat this file
as a license to invent `primary_type` strings; if a string is not in a
table below, it is not in v783. **Do not add glomeruli.** **Do not ETL.**

This is the size argument for why ORNs, antennal-lobe PNs, Kenyon cells,
and the rest of the optic-glomerulus LCs stay out of `circuit.json`.
Hunger/thirst already shipped. Sleep/clock wait on tests. Courtship is
a separate skip (no second 1 kHz LIF).

License: regenerated `data/*.json` stay FlyWire **CC BY-NC 4.0**. Code
MIT. Do not commit the raw Codex CSVs.

---

## Why skip (item 7, in one paragraph)

The live fly is 708 cells at 1 kHz (`378` cores + `330` partners,
`18861` edges). The recipe is **tens of new cores + ~10 partners**, not
thousands. v783 has **2,279** `ORN_*` cells across **53** glomeruli,
**685** antennal-lobe PNs (`class=ALPN`, **182** types), and **5,177**
Kenyon cells. Dumping them “because FlyWire has them” would replace the
escape/walk animal with an olfactory dump that has **no desktop odor**
to inject. There is no `odor` / `olfact` / `glomerul` field in `src/`.
Until a specific window class exists as a “flower” (or another 0..1
odor number, the way loom hits LC4), LC4 + LPLC2 are the visual system
and olfaction is omitted.

---

## Grep (source of truth)

```sh
gzip -dc /tmp/flywire/consolidated_cell_types.csv.gz | awk -F, '
  NR>1 {c[$2]++} END {for (t in c) print c[t], t}' | sort -nr
gzip -dc /tmp/flywire/consolidated_cell_types.csv.gz | grep -c ',ORN_'
gzip -dc /tmp/flywire/classification.csv.gz | awk -F, 'NR>1{c[$4]++}
  END {for (t in c) print c[t], t}' | sort -nr
```

`primary_type` never contains the substrings `olfact` or `glomerul`
(0 types, 0 cells). Those labels live on `classification.csv`
`class` / `sub_class` only.

| grep / class | types | cells | notes |
|---|---:|---:|---|
| `primary_type` `^ORN_` | **53** | **2279** | every olfactory ORN; 53 glomeruli |
| `class=olfactory` | 53 typed + 2 untyped | **2281** | 2 antennal-nerve afferents have no `primary_type`; do not name them |
| `class=ALPN` | **182** | **685** | `sub_class=uniglomerular` 69/278, `multiglomerular` 111/399, empty 2/8 |
| `class=hygrosensory` `^HRN_` | 4 | 74 | VP glomeruli; not odor |
| `class=thermosensory` `^TRN_` | 4 | 29 | VP glomeruli; not odor |
| `class=Kenyon_Cell` `^KC` | 11 | **5177** | mushroom body; `KCg-m` alone is 2189 |
| `class=MBON` | 35 | 96 | |
| `class=DAN` (`^PAM` + `^PPL`) | 27 | 331 | PAM 15/307, PPL 12/24 |
| `class=MBIN` | 2 | 4 | `APL` (2), `DPM` (2) |
| `super_class=visual_projection` | — | **7684** | LC4+LPLC2 = 314; **7370** are the rest of optic glomeruli |
| LC / LPLC / LLPC / LPC `primary_type`s | 66 | 5311 | only `LC4` (104) and `LPLC2` (210) are cores today |

Current circuit vs a dump:

| graph | neurons | vs 1 kHz budget (708) |
|---|---:|---|
| live `circuit.json` | 708 | 1.0× |
| + all `ORN_*` as cores | 708 + 2279 | **4.2×** |
| + all `ALPN` | +685 more | **5.2×** |
| + Kenyon + MBON + DAN + MBIN | +5608 more | **13.1×** |
| + non-loom `visual_projection` | +7370 more | **23.5×** |

Even the **smallest** olfactory glomerulus is already a dump of tens of
ORNs (`ORN_VA5` = 12) plus its uPNs (`VA5_lPN` = 6). The **largest**
(`ORN_DA1` = 127 + `DA1_lPN` 15 + `DA1_vPN` 2 = **144** cores) is more
than hunger+thirst combined (40). Partners (~10 per *role*, not per
cell) would still be pulled on top. In-circuit drive onto a new role
must be hundreds of synapses — that gate is about *picking a command
population*, not a license to take every ORN that synapses onto it.

---

## Olfactory receptor neurons (`ORN_*`)

`class=olfactory`, `super_class=sensory`, nerve `AN`. 430 of 2281 are
`sub_class=pheromone` (the rest have empty `sub_class`). Every typed
row is `primary_type` `ORN_<glomerulus>`.

| `primary_type` | n | | `primary_type` | n | | `primary_type` | n |
|---|---:|---|---|---:|---|---|---:|
| `ORN_DA1` | 127 | | `ORN_VA1d` | 97 | | `ORN_VA1v` | 94 |
| `ORN_VL1` | 80 | | `ORN_DL3` | 79 | | `ORN_VM4` | 75 |
| `ORN_VL2a` | 71 | | `ORN_DL1` | 69 | | `ORN_DM1` | 68 |
| `ORN_V` | 67 | | `ORN_VA2` | 67 | | `ORN_VM5d` | 67 |
| `ORN_DM3` | 61 | | `ORN_VA6` | 60 | | `ORN_DM2` | 54 |
| `ORN_DL4` | 52 | | `ORN_DM6` | 52 | | `ORN_DL5` | 42 |
| `ORN_DM5` | 42 | | `ORN_DA4l` | 40 | | `ORN_DA4m` | 40 |
| `ORN_DM4` | 40 | | `ORN_DA2` | 39 | | `ORN_DC1` | 39 |
| `ORN_VM2` | 37 | | `ORN_VM3` | 37 | | `ORN_DC3` | 33 |
| `ORN_VM6m` | 33 | | `ORN_VM7d` | 33 | | `ORN_DP1m` | 32 |
| `ORN_D` | 31 | | `ORN_VA4` | 31 | | `ORN_VC3` | 31 |
| `ORN_DA3` | 30 | | `ORN_VA3` | 29 | | `ORN_VC2` | 29 |
| `ORN_VL2p` | 28 | | `ORN_VC1` | 26 | | `ORN_VM6v` | 26 |
| `ORN_VM7v` | 26 | | `ORN_VC5` | 25 | | `ORN_VM1` | 25 |
| `ORN_DP1l` | 24 | | `ORN_VC4` | 23 | | `ORN_VM5v` | 23 |
| `ORN_DC4` | 22 | | `ORN_VA7m` | 22 | | `ORN_VM6l` | 21 |
| `ORN_DC2` | 20 | | `ORN_DL2v` | 18 | | `ORN_VA7l` | 16 |
| `ORN_DL2d` | 14 | | `ORN_VA5` | 12 | | | |

53 glomeruli, every name grepped: `D`, `DA1`, `DA2`, `DA3`, `DA4l`,
`DA4m`, `DC1`, `DC2`, `DC3`, `DC4`, `DL1`, `DL2d`, `DL2v`, `DL3`,
`DL4`, `DL5`, `DM1`, `DM2`, `DM3`, `DM4`, `DM5`, `DM6`, `DP1l`,
`DP1m`, `V`, `VA1d`, `VA1v`, `VA2`, `VA3`, `VA4`, `VA5`, `VA6`,
`VA7l`, `VA7m`, `VC1`, `VC2`, `VC3`, `VC4`, `VC5`, `VL1`, `VL2a`,
`VL2p`, `VM1`, `VM2`, `VM3`, `VM4`, `VM5d`, `VM5v`, `VM6l`, `VM6m`,
`VM6v`, `VM7d`, `VM7v`.

Do **not** invent `ORN_VP*`. VP glomeruli are `HRN_*` / `TRN_*` (below).

---

## Antennal-lobe projection neurons (`class=ALPN`)

685 cells, 182 `primary_type`s, all `super_class=central`.

| `sub_class` | types | cells |
|---|---:|---:|
| `uniglomerular` | 69 | 278 |
| `multiglomerular` | 111 | 399 |
| (empty) | 2 | 8 | `CB3623` (6), `Z_vPNml1` (2) |

Uniglomerular names (all grepped; this is the “one glomerulus” list):

`DA1_lPN` (15), `DA1_vPN` (2), `DA2_lPN` (11), `DA3_adPN` (4),
`DA4l_adPN` (2), `DA4m_adPN` (2), `DC1_adPN` (2), `DC2_adPN` (4),
`DC3_adPN` (5), `DC4_adPN` (2), `DC4_vPN` (4), `DL1_adPN` (4),
`DL2d_adPN` (10), `DL2d_vPN` (4), `DL2v_adPN` (8), `DL3_lPN` (10),
`DL4_adPN` (2), `DL5_adPN` (2), `DM1_lPN` (2), `DM2_lPN` (4),
`DM3_adPN` (2), `DM4_adPN` (2), `DM4_vPN` (2), `DM5_lPN` (5),
`DM6_adPN` (6), `DP1l_adPN` (2), `DP1l_vPN` (2), `DP1m_adPN` (2),
`D_adPN` (6), `VA1d_adPN` (6), `VA1d_vPN` (2), `VA1v_adPN` (9),
`VA1v_vPN` (4), `VA2_adPN` (2), `VA3_adPN` (4), `VA4_lPN` (2),
`VA5_lPN` (6), `VA6_adPN` (2), `VA7l_adPN` (2), `VA7m_lPN` (6),
`VC1_lPN` (2), `VC2_lPN` (2), `VC3_adPN` (8), `VC4_adPN` (5),
`VC5_lvPN` (5), `VL1_ilPN` (2), `VL1_vPN` (2), `VL2a_adPN` (2),
`VL2a_vPN` (5), `VL2p_adPN` (2), `VL2p_vPN` (2), `VM1_lPN` (4),
`VM2_adPN` (4), `VM3_adPN` (4), `VM4_adPN` (2), `VM4_lvPN` (5),
`VM5d_adPN` (9), `VM5v_adPN` (6), `VM6_adPN` (2), `VM7d_adPN` (5),
`VM7v_adPN` (4), `VP1d_il2PN` (2), `VP1l+_lvPN` (9), `VP1m_l2PN` (2),
`VP2_adPN` (2), `VP2_l2PN` (2), `VP4_vPN` (2), `V_ilPN` (2),
`V_l2PN` (2).

Multiglomerular types are mostly `M_vPNml*`, `M_lvPNm*`, `M_adPNm*`,
`M_lPNm*`, `M_l2PN*`, plus 22 `CB*` types (91 cells). Do not pull them
as a “small PN core.” `M_vPNml53` alone is 13 cells and is still one
of 111 multi types.

`BiT` (2) is `class=TPN` `sub_class=water_PN`, **already** a `thirst`
core. It is not an ALPN and is not a reason to add olfactory PNs.

---

## One glomerulus is still a no (no desktop odor)

Roadmap: *“Add a glomerulus when there is a desktop odor/visual (e.g. a
specific window class as a ‘flower’). Until then, LC4 + LPLC2 are the
visual system.”*

| glomerulus | ORNs | uPNs | cores if dumped | typical odor (literature, not a type string) |
|---|---:|---:|---:|---|
| `DA1` | 127 `ORN_DA1` | 17 (`DA1_lPN`+`DA1_vPN`) | **144** | pheromone |
| `VA2` | 67 | 2 `VA2_adPN` | 69 | food-ish |
| `DM1` | 68 | 2 `DM1_lPN` | 70 | food-ish |
| `VA5` | 12 | 6 `VA5_lPN` | **18** | smallest ORN type |

18 cores is inside the “tens” cap **if** a 0..1 odor number existed to
inject the way `loomL` hits LC4 / `hungerIn` hits hunger NSCs. It does
not. Adding `ORN_VA5` without that number is the DNg11-shaped failure
mode in reverse: a population with nothing to transduce. Do not pick a
glomerulus “to have olfaction.” Do not add Kenyon cells as the
downstream of a missing odor (see next section).

VP hygro/thermo (still no desktop humidity/heat odor):

| `primary_type` | n | class |
|---|---:|---|
| `HRN_VP4` | 29 | hygrosensory |
| `HRN_VP1d` | 16 | hygrosensory |
| `HRN_VP5` | 16 | hygrosensory |
| `HRN_VP1l` | 13 | hygrosensory |
| `TRN_VP1m` | 13 | thermosensory |
| `TRN_VP2` | 7 | thermosensory |
| `TRN_VP3a` | 7 | thermosensory |
| `TRN_VP3b` | 2 | thermosensory |

---

## Mushroom body (do not dump)

Odor identity past the AL is Kenyon cells. That is a different brain.

| `class` | types | cells | `primary_type`s (all grepped) |
|---|---:|---:|---|
| `Kenyon_Cell` | 11 | 5177 | `KCg-m` 2189, `KCab` 1643, `KCapbp-m` 338, `KCapbp-ap2` 298, `KCg-d` 295, `KCapbp-ap1` 280, `KCab-p` 128, `KCg-s1` 2, `KCg-s2` 2, `KCab-ap1` 1, `KCg-s3` 1 |
| `MBON` | 35 | 96 | `MBON01`…`MBON07`, `MBON09`…`MBON33`, `MBON35`, `MBON15-like`, `MBON17-like` (no `MBON08`, no `MBON34`) |
| `DAN` | 27 | 331 | `PAM01`…`PAM15`, `PPL101`…`PPL108`, `PPL201`…`PPL204` (not the string `PPL1`) |
| `MBIN` | 2 | 4 | `APL` (2), `DPM` (2) |

`KCg-m` (2189) is already 3× the whole live circuit. PAM/PPL1 DAN
dumps were already rejected in `docs/CIRCUIT_TYPES_FOUND.md`.

---

## Non-loom vision (rest of optic glomeruli)

`LC4` (104) and `LPLC2` (210) are the looming cores. Everything else in
`super_class=visual_projection` is **7,370** cells / **321** types.
Named LC-family `primary_type`s besides those two: **4,997** cells
(`LC12` 381, `LC17` 276, `LC10a` 237, `LLPC2` 235, `LLPC1` 219, …).
Do not add them “because they are visual.” A later flower-window would
pick **one** LC/glomerulus with a desktop number, the same rule as
odor.

Currently in `etl.py` `CORE_TYPES` for vision: `"LC4": "lc4"`,
`"LPLC2": "lplc2"` only.

---

## Already in the box (do not expand from this note)

| slug | types | n | why it is not olfaction |
|---|---|---:|---|
| `lc4` / `lplc2` | `LC4`, `LPLC2` | 314 | loom, not odor / not other optic glomeruli |
| `thirst` includes `BiT` | `BiT` | 2 | `water_PN`; desktop number is `thirstIn` |

Roles **not** in `circuit.json` after this skip: any `ORN_*`, any
`class=ALPN`, any `^KC`, any `MBON*` / `PAM*` / `PPL*`, `APL`, `DPM`,
`HRN_*`, `TRN_*`, any LC other than `LC4`/`LPLC2`.

---

## When this becomes a yes

1. A desktop 0..1 exists (named window class, crumb, “flower”) that can
   land on **one** glomerulus the way loom lands on LC4.
2. Grep that glomerulus’s exact `ORN_*` + its uniglomerular PN types
   from the tables above. Cap is still tens of cores + ~10 partners.
   If the ORN type is 127 cells (`ORN_DA1`), **do not take the whole
   type** — that is a dump; pick a different glomerulus or a PN-only
   command if the synapse gate still passes.
3. Do **not** pull Kenyon / MBON / PAM to “finish the pathway.”
4. `in-circuit drive onto <slug>` still has to be hundreds of synapses.
5. `--simtest` / `--behaviortest` predicates stay as they are. Do not
   retune `docs/PORT_CONTRACT.md` LIF constants.

Until then: no `CORE_TYPES` rows for ORN/PN/KC, no new
`BrainSignals` odor field, no glomerulus in `circuit.json`.

---

## Rejected (do not add)

| String / class | n | Why |
|---|---:|---|
| all `ORN_*` | 2279 | no odor; explodes the 708-cell budget |
| all `class=ALPN` | 685 | same; 182 types |
| one glomerulus (`ORN_VA5`+`VA5_lPN`, `ORN_DA1`+PNs, …) | 18–144 | no desktop number this pass |
| `HRN_*` / `TRN_*` | 74 / 29 | VP hygro/thermo; no humidity/heat odor |
| `Kenyon_Cell` / `MBON` / `DAN` / `MBIN` | 5608 | mushroom body dump |
| remaining `visual_projection` | 7370 | non-loom optic glomeruli |
| 2 untyped `class=olfactory` cells | 2 | no `primary_type`; do not invent one |
| `BiT` as an olfactory PN | 2 | already `thirst` |

Proposed `CORE_TYPES` for this item: **none**.
