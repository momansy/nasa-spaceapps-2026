# MissionForge game data

Game content as JSON, validated by `node tools/validate-data.mjs` (see `tools/README.md`).
`GAME_DESIGN.md` is the specification; `orchestration/ARCHITECTURE.md` section 4 fixes the
file names. Numbers are copied from the design tables, never rounded or invented. Where the
design is silent or ambiguous the data says so in a `design_notes` field next to the value.

## What exists

| File | Content | Design section | Status |
|---|---|---|---|
| `schema/*.schema.json` | JSON Schemas (draft 2020-12), one per file type, plus `common.schema.json` | 17.5 | complete |
| `parts/launch_site.json` | 4 launch sites | 7.1 | complete |
| `parts/first_stage_engine.json` | 6 first-stage engines | 7.7 | complete |
| `contracts.json` | C0 and C1 | 5, 6.2 | C2 to C8 to do |
| `roles.json` | 10 roles, merge order | 3.3 | complete |
| `boosts.json` | 4 tiers, 11 boosts | 10.3, 10.4 | complete |
| `strings/en.json` | English text for everything above | — | grows with every file |

## Conventions

**IDs** never change once merged.

| Kind | Form | Example |
|---|---|---|
| Part | lowercase snake_case with the category prefix below | `eng_kerolox_workhorse` |
| Contract | `C0` to `C8` | `C1` |
| Minigame | as in design 10.5 | `MG-01`, `MG-08b`, `MG-10a` |
| Fact | as in design 12.4 | `F01` |
| Role | console call sign | `FLIGHT` |
| Test, anomaly, boost, achievement, Codex entry, validation rule | lowercase snake_case | `engine_hot_fire` |
| Flight phase | as in design 9.1 | `F0` to `F14`, `F7b` |

Facts and flight phases share the letter F (`F10` is both a fact and a phase in the design).
They never share a field: facts live in `facts`, phases in `flight_phases`.

**Units** are in the field name, in the unit of the design table: `thrust_sl_kN`, `isp_vac_s`,
`mass_t`, `mass_kg`, `cost_M` (game $M), `lead_days`, `data_GB_per_day`. Core converts to SI
when it loads the files.

**Proportions are fractions.** 98.5% is `0.985`, a 40% throttle floor is `0.4`, "+1% Δv" is
`0.01`.

**Text** is never inline. Every player-visible string is a key into `strings/<lang>.json`
(a flat map). Key form: `<kind>.<id>.<field>`, for example `part.eng_kerolox_giant.name`,
`part.eng_kerolox_giant.drawback.1`, `category.launch_site.name`, `contract.C1.objective.primary`,
`vote.upper_stage_tank_size.name`, `role.FLIGHT.ability.name`, `boost.dv_bonus.name`,
`tier.gold.name`. Fields that hold keys end in `_key` or `_keys`, plus `twin`, `strengths` and
`drawbacks` on parts. Keys under `ui.` are reserved for interface text referenced from code.
`design_notes` is the only free English text in data; it is for designers and is never shown.

**value_types** tags every group of numbers with its provenance (design section 19):
`physical`, `real_world_approximate` or `game_value`. On a part the groups are `stats`, `game`,
`modifiers` and `rules`; a single field can override its group with a dotted key
(`"stats.eastward_boost_m_s": "physical"`), and a modifier can carry its own `value_type`.
Other files tag their groups at the level the schema states. The validator fails a numeric
group without a tag.

**Missing means the design gives no value.** A field is left out, not set to 0 or guessed.
Suggested loader defaults: no `cost_M`, `lead_days` or `integ_days` contributes 0; no
`reliability` means the part does not roll; no `contracts` means the option is offered wherever
its category is voted; absent arrays are empty.

### Parts (`parts/<category>.json`)

One file per category; the file's `category` equals the file name and every part repeats it.
Common envelope: `id`, `category`, `name_key`, `twin`, `strengths`, `drawbacks`, `facts`,
`contracts`, `model`, `stats`, `game`, `modifiers`, `rules`, `failure_modes`, `value_types`,
`design_notes`.

- `stats` holds the figures of the option; its allowed fields depend on the category
  (`$defs/stats_<category>` in `part.schema.json`). Several categories have no stats at all.
- `game` holds `cost_M`, `lead_days`, `integ_days`, `reliability`, `maturity`. `cost_M` is the
  option's whole contribution to cost, `lead_days` takes part in the maximum, `integ_days` in
  the sum (it may be negative: stainless steel is −5).
- `modifiers` are effects on the whole vehicle or mission:
  `{ "target": "dry_mass_t", "op": "mul", "value": 0.88, "scope": "vehicle" }`.
  - `op: "mul"` — multiplier, copied as printed (`0.88×` → 0.88, `×1.5` → 1.5).
  - `op: "add_fraction"` — relative change, copied as printed (`−15%` → −0.15, `+1.5% Δv` → 0.015).
  - `op: "add"` — absolute, in the unit of the target name (`+$2 M` → `cost_M` 2; reliability
    `−0.3%` → `reliability` −0.003, which is percentage points).
  - Proposed combination in Core: `(base × Π mul × (1 + Σ add_fraction)) + Σ add`.
  - Targets, scopes and conditions are closed lists in `common.schema.json` (`$defs/effect`).
- `rules` are hooks: `requires_part`, `requires_any_part`, `incompatible_with_part`,
  `anomaly_weight`, `enables_minigame`, `test_mitigates_failure_mode`, `recommends_test`, `flag`.
  A `flag` is a snake_case marker for a drawback or strength the design states without a number
  (`no_eastward_launch`). Core must implement or deliberately ignore each flag.
- A qualitative table cell ("+stability in atmosphere") is a string key in `strengths` or
  `drawbacks`, plus a `flag` if Core must act on it. It gets a modifier only if the design
  gives a number.

The same effect shape is used by tests, anomaly responses, role abilities and minigame
rewards. Boosts use the same `target` and `op` with one value per tier.

### Contracts (`contracts.json`)

`votes` is the vote order of design 6.2; `step` is the 6.2 number (sub-votes share a step).
`engine_count` and `tank_size` are voted once per stage, so those votes carry `stage`. A vote
has `options` only where the design enumerates them; otherwise the options are the parts of
the category whose `contracts` includes the contract or is absent. The validator checks the
two against each other. `requirements` is the machine-readable form of the special rules;
`objectives` use `criteria` of the form `{ "metric", "op", "value", "tolerance" }`, where each
metric name must be implemented by Core.

### Schema annotations

The schemas carry four custom keywords that other tools ignore and the validator uses:
`x-data-files` (which files a schema validates), `x-id` (this field declares an ID of a kind),
`x-ref` (this field references an ID or a string key), `x-value-groups` (groups that need a
`value_types` tag). A new file type needs only a new schema with `x-data-files`; the validator
picks it up without code changes.

## Checklist: files still to write

Use the exact file name and the exact part IDs below; `contracts.json` already references
some of them. Copy every row of the design table.

### Parts

| File | Section | IDs, in table order |
|---|---|---|
| `parts/instrument.json` | 7.2.1 | `inst_wide_field_optical_camera`, `inst_multispectral_imager`, `inst_thermal_infrared_camera`, `inst_synthetic_aperture_radar` |
| `parts/satellite_power.json` | 7.2.1 | `satpwr_body_mounted_solar_cells`, `satpwr_deployable_solar_wings`, `satpwr_large_deployable_array` |
| `parts/attitude_control.json` | 7.2.1 | `adcs_magnetorquers_only`, `adcs_reaction_wheels`, `adcs_reaction_wheels_star_tracker` |
| `parts/capsule.json` | 7.2.2 | `cap_compact`, `cap_standard`, `cap_deep_space` |
| `parts/life_support.json` | 7.2.2 | `ls_open_loop`, `ls_regenerative` |
| `parts/mars_lander.json` | 7.2.3 | `lander_airbag`, `lander_legged`, `lander_sky_crane` |
| `parts/heat_shield.json` | 7.3 | `tps_avcoat_ablator`, `tps_pica_ablator`, `tps_reusable_ceramic_tiles`, `tps_inflatable_decelerator` |
| `parts/escape_system.json` | 7.4 | `les_escape_tower`, `les_integrated_pusher`, `les_ejection_seats` |
| `parts/fairing.json` | 7.5 | `fairing_small`, `fairing_standard`, `fairing_large`, `fairing_reusable_large` |
| `parts/engine_count.json` | 7.6 | `engcount_first_1`, `engcount_first_3`, `engcount_first_5`, `engcount_first_9`, `engcount_upper_1`, `engcount_upper_2` |
| `parts/upper_stage_engine.json` | 7.8 | `eng_hydrolox_vacuum`, `eng_kerolox_vacuum`, `eng_methalox_vacuum`, `eng_hypergolic_storable`, `eng_solid_kick_motor` |
| `parts/tank_size.json` | 7.9 | `tank_xs`, `tank_s`, `tank_m`, `tank_l`, `tank_xl`; structural ratios go in `category_params` |
| `parts/structural_material.json` | 7.10 | `mat_aluminum_2219`, `mat_aluminum_lithium_2195`, `mat_carbon_composite`, `mat_stainless_steel` |
| `parts/strap_on_booster.json` | 7.11 | `strap_none`, `strap_2_small_solid`, `strap_4_small_solid`, `strap_2_heavy_solid`, `strap_2_liquid_side` |
| `parts/separation_system.json` | 7.12 | `sep_pyro_bolts_springs`, `sep_pneumatic_pushers`, `sep_hot_staging` |
| `parts/avionics.json` | 7.13 | `avi_commercial_single`, `avi_triple_redundant_commercial`, `avi_radiation_hardened`, `avi_rad_hard_backup` |
| `parts/navigation_sensor.json` | 7.14 | `nav_imu_only`, `nav_imu_gnss`, `nav_imu_gnss_star_tracker`, `nav_terrain_relative` |
| `parts/aero_control.json` | 7.15 | `aero_gimbal_only`, `aero_fins`, `aero_grid_fins` |
| `parts/rcs.json` | 7.15 | `rcs_cold_gas`, `rcs_monopropellant_hydrazine`, `rcs_bipropellant` |
| `parts/power_system.json` | 7.16 | `pwr_primary_batteries`, `pwr_liion_body_solar`, `pwr_deployable_solar_liion`, `pwr_fuel_cells`, `pwr_rtg` |
| `parts/communications.json` | 7.17 | `comm_uhf`, `comm_s_band`, `comm_x_band`, `comm_ka_band`, `comm_relay_network`, `comm_laser` |
| `parts/booster_recovery.json` | 7.18 | `brec_expendable`, `brec_parachute_splashdown`, `brec_propulsive_rtls`, `brec_propulsive_drone_ship` |
| `parts/capsule_recovery.json` | 7.19 | `crec_parachutes_splashdown`, `crec_parachutes_soft_landing_rockets`, `crec_propulsive_landing` |
| `parts/mission_assurance.json` | 7.20 | `assur_faster_cheaper`, `assur_standard`, `assur_class_a` |

With the two files that exist, that is 26 categories and 102 options.

### Other files

| File | Section | Schema | IDs |
|---|---|---|---|
| `contracts.json` (add C2 to C8) | 5.1 to 5.3, 6.2 | `contract.schema.json` | `C2` … `C8` |
| `tests.json` | 6.6 | `test.schema.json` | `component_qualification`, `engine_hot_fire`, `static_fire`, `wet_dress_rehearsal`, `vibration_test`, `thermal_vacuum_test`, `drop_test`, `arc_jet_test`, `software_in_the_loop`, `pogo_suppression_test` |
| `anomalies.json` | 6.8 | `anomaly.schema.json` | `supplier_delay`, `budget_cut`, `test_failure`, `weather_front`, `engineering_breakthrough`, `range_conflict`, `payload_overweight`, `software_bug_found`, `contamination_in_clean_room`, `key_engineer_sick`, `helium_shortage`, `lightning_season` |
| `validation_rules.json` | 6.11 | `validation_rule.schema.json` | one per table row, snake_case |
| `minigames.json` | 10.5 | `minigame.schema.json` | `MG-01` … `MG-30`, including `MG-08b` and `MG-10a` |
| `facts.json` | 12.4 | `fact.schema.json` | `F01` … `F40`; status `unverified` |
| `codex.json` | 8.3, 12.1, 12.2 | `codex.schema.json` | snake_case |
| `achievements.json` | 13.5 | `achievement.schema.json` | snake_case of the name (`penny_pincher`) |
| `strings/en.json` | all | `strings.schema.json` | — |

`engine_hot_fire`, `supplier_delay`, `weather_front`, `lightning_season` and `range_conflict`
are already referenced by the part files; `F05`, `F24` and `F26` likewise. Until the catalog is
complete these show as warnings; `--strict` turns them into errors.

`validation_rules.json` is not named in ARCHITECTURE.md section 4; the name follows the
pattern of the other files.

### Content with no schema yet

These design tables have no file type here. Each needs a schema in `data/schema/` (with
`x-data-files`) before its data can be added, because `--strict` rejects files no schema claims:
individual awards (11.5), scoring constants and grades (11.3, 11.4), Team Sync meter (11.2),
flight phases (9.1), pings and reactions (3.4), assist levels (9.3), abort modes (9.8),
player-count scaling (3.2), vote timings (4.1).

Game-wide numbers that belong to no part and have no data file yet: maturity uncertainty
bands (7.0: ±1%, ±3%, ±6%), propellant densities (19), rework fee of 30% (6.9).

## Open design questions found while entering the data

Recorded here so nobody resolves them silently. Details are in the `design_notes` of each file.

1. **C0 has no detail in the design** beyond its row in 5.1: its secondary and stretch
   objectives are the generic examples of 5.2, and nothing says how the mandatory parachute
   recovery is built or whether a suborbital return needs a heat shield.
2. **Vote counts.** By the 6.2 annotations C1 has 22 votes and C0 has 19; section 2.2 expects
   14 to 20.
3. **Strengths of first-stage engines.** Table 7.7 has no Strengths column; four engines have
   none.
4. **Per-contract availability** is given only for Kerolox Workhorse (17.5), tank sizes (7.9)
   and a few "only for" remarks.
5. **Equatorial Spaceport** "+$10 M, +20 days": read as already included in $18 M and 20 days.
6. **"Tropical storm" and "fog" anomaly cards** do not exist in 6.8; mapped to `weather_front`.
7. **Hydrolox High-Efficiency** thrust is the 109% figure of the real engine while the throttle
   range also says 109%.
8. **Stacking of multiplier boosts** (×1.1 with ×1.25) under "stack additively" (11.1).
9. **Percent changes to reliability** ("−0.3%", "+1%") are stored as percentage points.
10. **Payload masses**: the 150 kg of C1 against the voted satellite components; table 5.1
    gives capsule masses of 6 t (C3) and 8 t (C4), table 7.2.2 has 6 t, 9 t and 10 t capsules.
11. **Material cost multiplier** (7.10) has no stated base: tanks have no cost in 7.9.
12. **Landing legs**: 7.18 says RTLS "needs grid fins & legs", but no part offers legs.
13. **Role areas**: roles may tag options "in their area" (3.4), but no table maps roles to
    part categories.
14. **Minigame types**: MG-28 and MG-30 are "Cooperative", which is not one of the four types
    of 10.2; the schema accepts `cooperative`.

## English strings may be split by area

`data/strings/en.json` holds the shared strings. A task that adds a lot of content writes
its English text to its own fragment, `data/strings/en.<area>.json` (for example
`en.parts_propulsion.json`), so parallel tasks never edit the same file. The validator
merges every `en*.json` file; a key defined twice is an error. Loaders must do the same.
