# Circuit types found (FlyWire v783)

Inventory for `docs/CIRCUIT_EXPANSION_ROADMAP.md` step 0. Every
`primary_type` below was counted with a strict match on
`/tmp/flywire/consolidated_cell_types.csv.gz` (column 2). Classification
and synapse totals come from `classification.csv.gz` and
`connections.csv.gz` (edges with `syn_count >= 5`). Do not treat this
file as a license to invent names; if a string is not in the table, it
is not in v783.

Hunger + thirst + sleep + clock are in `data/circuit.json` after the
second ETL. Pain is still empty. Do not invent names.

License: regenerated `data/*.json` stay FlyWire **CC BY-NC 4.0**. Code
MIT. Do not commit the raw Codex CSVs.

---

## Caps used

| Motive | Cap | Picked | Cells |
|---|---:|---:|---:|
| Hunger | 4 types | 4 | 34 |
| Thirst | 3 types | 3 | 6 |
| Sleep + clock | 4 types **total** | 2 + 2 | 8 + 16 |
| Pain | 2 types | 0 | 0 |

Proposed `etl.py` `CORE_TYPES` slugs: family names (`hunger`, `thirst`,
`sleepn`, `clock`) so several cores can share one `BrainSignals` field
the way `DNp02` / `DNp04` / `DNp11` share `escw`. Finer slugs are
optional HUD labels, not extra motives.

---

## Hunger (first internal-state circuit)

Small named SEZ + pars intercerebralis peptide cores only. All four are
`super_class=endocrine`, nerve `NCC`. **Zero chemical outputs** in the
Codex graph (peptide release is not a `connections.csv` edge). In-circuit
drive is therefore **onto** these cells: pull each type’s strongest
partners so `in-circuit drive onto hunger` is hundreds of synapses, then
inject desktop `hungerIn` the way loom hits LC4. Do not script foraging
from a wall clock.

| `primary_type` | n | side | additional_type | in-syn | out-syn | slug | finer |
|---|---:|---|---|---:|---:|---|---|
| `SEZ_NSC_Hugin` | 4 | 2L / 2R | `Hugin-RG` | 459 | 0 | `hunger` | `hugin` |
| `m_NSC_DH44` | 6 | 3L / 3R | `DH44, PI1` | 4355 | 0 | `hunger` | `dh44` |
| `m_NSC_DILP` | 18 | 8L / 10R | `IPC, PI1` | 3648 | 0 | `hunger` | `dilp` |
| `m_NSC_DMS` | 6 | 2L / 4R | `DMS, PI2` | 1319 | 0 | `hunger` | `dms` |

- `SEZ_NSC_Hugin`: only `Hugin` / `hugin` primary_type. `sub_class=SEZ-NSC`.
  Feeding / gut peptide. Strongest chemical in-partners: `AN_multi_74`
  (279), `DNp68` (83), `AN_multi_1` (48), `CB0026` (32). Tiny named
  command-like core.
- `m_NSC_DH44`: only `DH44` primary_type. Medial PI metabolic / diuretic
  NSCs. Prefer this over huge classes.
- `m_NSC_DILP`: only `Dilp` / `DILP` primary_type. Insulin-producing
  cells (`class=pars_intercerebralis`, `sub_class=medial_NSC`). Largest
  of the four but still a named PI population, not a dump.
- `m_NSC_DMS`: medial PI myosuppressin (`DMS, PI2`). Completes the named
  PI peptide set.

Shared field: `hungerDrive`. 34 cores + ~10 reserved partners each stays
inside the “tens of cells + partners, not thousands” budget.

---

## Thirst (same ETL pass as hunger if both ship)

No `leucokinin` / `Lk` / `IR56` / `IR7` / `thirst` / `water` string
exists as a `primary_type`. These three are the small named stand-ins.

| `primary_type` | n | side | class / note | in-syn | out-syn | slug | finer |
|---|---:|---|---|---:|---:|---|---|
| `AstA1` | 2 | 1L / 1R | only `AstA*` type; putative_primary central | 3193 | 17819 (GABA) | `thirst` | `asta1` |
| `BiT` | 2 | 1L / 1R | `class=TPN` `sub_class=water_PN`; additional `aDT6a` | 1307 | 820 (SER) | `thirst` | `bit` |
| `SEZ_NSC_CAPA` | 2 | 1L / 1R | `sub_class=SEZ-NSC`; additional `CAPA` | 1677 | 0 | `thirst` | `capa` |

- `AstA1`: command-scale allatostatin-A. Real chemical outs (unlike the
  NSCs). Best thirst *command*.
- `BiT`: named water projection neuron because IR water taste types are
  absent. Not an IR cell.
- `SEZ_NSC_CAPA`: osmoregulation / diuresis peptide, Hugin’s SEZ-NSC
  sibling. Pair with hunger NSCs for partner pull; do **not** treat as
  MN-Ve / pumping.

Shared field: `thirstDrive`. Skip `LB2d` (7 labellar `sugar/water` GRNs)
and `LB3` (122) — sensory dumps, not thirst commands.

---

## Sleep (in circuit.json — `sleepn`)

Idle + hour inject onto these cells. `BrainSignals.sleep` is the
population rate, not `idle > 600`. Cap is **shared with clock** (4 types
total). In-circuit drive onto `sleepn`: **809** syn. Zero edges onto GF.

| `primary_type` | n | side | note | in-syn | out-syn | slug | finer |
|---|---:|---|---|---:|---:|---|---|
| `FB6A` | 4 | 2L / 2R | R23E10 dFB sleep-promoting tangential; best small named core | 8032 | 9014 (GLUT) | `sleepn` | `fb6a` |
| `FB2B` | 4 | 2L / 2R | ExFl1 analog (Hulse FB2B_a absent; SS57264 sleep type) | 2393 | 867 (GLUT) | `sleepn` | `fb2b` |

`ExFl` / `dFB` are not primary_type strings. `FB6A_c` (2, additional
`FB6A`) is a subtype, not a second core. Wake-promoting PPL1 dFB DANs
`FB5H` / `FB6H` / `FB7B` are rejected.

---

## Clock (in circuit.json — with sleep, not a third slider)

PDF LNvs receive `clockIn = circadianActivity(hour)`. Chemical outs are
**~60 syn** (peptide), so they cannot set network gain via wiring.
`activityScale` stays the compressed hour curve; `clockDrive` is HUD.
No primary_type contains `PDF`. In-circuit drive onto `clock`: **998** syn.

| `primary_type` | n | side | note | in-syn | out-syn | slug | finer |
|---|---:|---|---|---:|---:|---|---|
| `s-LNv` | 8 | 4L / 4R | small PDF LNvs; additional `s-LNv_b`; visual_projection | 517 | 528 | `clock` | `slnv` |
| `l-LNv` | 8 | 4L / 4R | large PDF LNvs; optic bilateral | 1645 | 531 | `clock` | `llnv` |

`5th-LNv` (2) is a tiny add-on, not a fifth type under the cap.
`DN1a` (4) is a morning-cell partner if a later pass has room.

---

## Pain

**Empty.** No v783 `primary_type` or `additional_type` contains `Basin`,
`nocicep`, `ppk`, `A00c`, `mdIV`, or `pain`. Classification has no
nociceptive sub_class. Do not substitute bitter GRNs (`LB1*`) or
mechanosensory bristles.

Hitchhike check on live `data/circuit.json` (732 cells, root_id lookup
in Codex): **zero** named nociceptive types even as `other` /
`ascending`. The 29 reserved ascending partners are `AN_*`
(`AN_IPS_GNG_7`, `AN_multi_*`, …). Ten `class=mechanosensory` partners
are JO/AMMC auditory (`JO-A`, `AMMC-A1`), not nociceptors.

Window-close-underfoot stays ledge-loss takeoff. Harsh loom stays
LC4/LPLC2 `WindowLoom`. No `painIn` / extra-drive group. Pulling a
substitute sensory dump would bloat past the partner cap — **skip,
do not ETL**. Later ETL for this motive is a no-op.

---

## Rejected (do not add)

| String / class | n | Why |
|---|---:|---|
| `m_NSC_unknown` | 10 | PI3, no named peptide |
| `SEZ_NSC_CAPA` as hunger | 2 | osmoregulation; listed under thirst |
| `l_NSC_CRZ` / `l_NSC_ITP` / `l_NSC_DH31` | 6 / 8 / 6 | lateral NSCs; ITP has 0 chemical edges; over hunger cap |
| `AN_GNG_165` and all `AN_GNG_*` | 38+ / 1030 cells, 336 GNG types | not command DNs |
| `GNG800f` | 2 | only non-AN GNG type; not feeding / motor |
| `LB3` | 122 | sugar/water GRN dump |
| `LB2d` | 7 | sugar/water labellar GRN, not a thirst command |
| `claw_tpGRN` / `dorsal_tpGRN` | 60 / 11 | taste pegs; no desktop taste |
| `FB5H` `FB6H` `FB7B` | 2 each | PPL1 wake DANs |
| `ER5` | 21 | literature R5; over the 4-type sleep/clock cap |
| `ExR5` | 4 | extra-ring, not classic R5 |
| `FB6C` `FB6E` `FB6G` `FB6I` `FB6Z` `FB7A` `FB7K` | 2–9 | extra R23E10; over cap |
| `FB2B_b` | 4 | ExFl1-adjacent subtype; `FB2B` already listed |
| `s-CPDN3A`…`E` / `APDN3` | 12–38 | DN3 dumps; explode partner budget |
| `LN-DN1` `LN-DN2` | 2 / 4 | labial_nerve_sensory_descending, not clock |
| PAM / PPL1 DAN dumps, all ORNs, Kenyon cells, P1 / pC1 | — | roadmap rejects |

---

## Proposed `CORE_TYPES` (when ETL happens)

```python
# hunger + thirst (phase 1–2) — peptide NSCs need their own partners pulled
"SEZ_NSC_Hugin": "hunger",
"m_NSC_DH44":    "hunger",
"m_NSC_DILP":    "hunger",
"m_NSC_DMS":     "hunger",
"AstA1":         "thirst",
"BiT":           "thirst",
"SEZ_NSC_CAPA":  "thirst",

# sleep + clock (in circuit.json; 809 / 998 in-circuit syn)
"FB6A":  "sleepn",
"FB2B":  "sleepn",
"s-LNv": "clock",
"l-LNv": "clock",
```

Command-DN baselines stay deterministic `0.036`-class. `sleepn` / `clock`
are 0.004 (quiet until idle+hour). Never scale LIF baselines linearly by
hunger/mood. Peptide cores with 0 chemical outs are still valid if
partners supply hundreds of in-synapses and the desktop number lands on
the group.

---

## Exact arrays (copy for later agents)

```
hunger: SEZ_NSC_Hugin, m_NSC_DH44, m_NSC_DILP, m_NSC_DMS
thirst: AstA1, BiT, SEZ_NSC_CAPA
sleep:  FB6A, FB2B
clock:  s-LNv, l-LNv
pain:   (none)
```
