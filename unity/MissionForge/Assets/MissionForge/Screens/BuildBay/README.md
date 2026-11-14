# Build Bay (T015)

The host screen the audience watches for most of a session (design 6.1, 14.1 #5): the live rocket on a launch pad at
dusk in the centre, the Readiness Dashboard on the left, the vote panel on the right, the Integration Timeline and the
budget bar along the bottom, the contract objective and the phase tracker (A → B/PDR → C/CDR → D/FRR) along the top.

**Core is the only source of numbers.** The dashboard is `Dashboard.Compute`; "if chosen" deltas are `Preview.Of`
(`OptionPreview.Delta`); options are `VoteOptions.NextVote/For/Commit`; the Gantt is `DashboardMetrics.Budget`
(`Timeline`, `CriticalPath`, `TotalCostM`, `BudgetM`, `DeadlineDays`); the maturity band is
`BuildConstants.BandHalfWidth`. Unity only converts units for display (kg → t, m/s → km/s for entry, fraction → %).
Display-only bands (Marginal when Δv margin < 5 %, budget left < 10 %, slack < 10 % of the deadline) are `game_value`
constants in `Model/DashboardViewModel.cs`.

## Interface for T016 (`Assets/MissionForge/Vehicle/`, asmdef `MissionForge.Vehicle`, references only `MissionForge.Core`)

| Type | Use |
|---|---|
| `KitLibrary` (ScriptableObject, `Vehicle/KitLibrary.asset`) | kit part id → imported model + layout numbers (length, ring diameters, attach empties) from `assets/blender/kit_manifest.json`. Rebuild: **MissionForge ▸ Vehicle ▸ Refresh Kit Imports And Build Library** (copies `assets/blender/export/fbx/` into `Art/Models/Kit/` with T008's importer settings). |
| `KitResolver.Resolve(BuildState, GameCatalog, KitLibrary) → KitPlan` | data ids → kit ids: engines/fairings by id, engine counts → `mount_s{1,2}_{n}_d{dd}`, tanks → `spec.tank_id(stage, size, family)` (hydrolox family when that stage's engine burns LH2/LOX), interstages by separation system and diameter pair, adapters where diameters differ. Unmodelled ids land in `KitPlan.MissingDataIds` (logged once by the screen, never a crash). Today only `strap_2_liquid_side` has no model. |
| `VehicleAssembler.Build(BuildState, GameCatalog, KitLibrary, Transform parent) → VehicleRig` | places parts with the `assemble.py` rules (stack_on, hang_from, side). The rig origin is the lowest point (put it on a `VehicleMount`). |
| `VehicleRig` | bottom-up `Stages[]` (`Root`, `Engines[]` with `NozzleExit` and `GimbalPivot`, `SeparationJoint`), `Boosters[]` (`Root`, `NozzleExit`, `GimbalPivot`), `Interstage`, `FairingHalves[]` (`Half`, `Hinge`), `Fairing`, `PayloadRoot`, `LengthM`, `PartFor(category)`, `PartsFor(category)`, `PartByKey(key)`. Groups are named `Stage1`, `Boosters`, `Interstage`, `Stage2`, `Adapter`, `Fairing`. |
| `VehicleAssembler.MeasureJoints(rig)` | gap / ring mismatch of every joint (tests: ≤ 3 mm). |

Kit → Unity axes: the FBX importer maps kit (x, y, z) to Unity (x, z, y) (checked for every attach empty by
`KitEmpties_MatchTheManifestThroughKitToUnity`); a kit yaw θ about +Z is a Unity yaw −θ about +Y. (T008's
`KitVehicleAssembler` uses (−x, z, −y), a 180° yaw away; harmless for symmetric stacks, wrong for strap-ons.)

**Launch pad:** `Art/Environment/LaunchPad/MF_LaunchPad.prefab` with a `VehicleMount` transform (10.5 m above grade,
inside the exhaust opening) and `LaunchPadRig` (tower of stacked 8 m segments that follows the vehicle length, crane
with hook and cable, two umbilical arms). Pieces are authored by `Art/Environment/LaunchPad/Source/build_launchpad.py`
(headless Blender, `.blend` kept beside it) and rebuilt with **MissionForge ▸ Build Bay ▸ Rebuild Pad And Scene**.
**Swap point:** when T017 exports `world_*` gantry and pad parts to `assets/blender/export/fbx/`, drop them into
`LaunchPad/Models/` and point `LaunchPadPrefabBuilder` at them.

## Votes

`BuildBayScreen.Director.cs` runs the PART rounds: `VoteOptions.NextVote` → `VoteOptions.For` → `vote.open`
(`Model/VoteMessages.cs`) → the server's `vote.opened / stage / tally / tags / vetoed / result / cancelled` and
`ping.event` update `Model/VoteRoundModel.cs` → on `vote.result` the host applies the winner with
`VoteOptions.Commit` and sends `vote.commit` and `build.state` → the part is assembled → next vote; when none remain
the app moves to the FRR through `SceneFlow.GoToPhase`. Timers use `endsAtMs` against the server clock
(`VoteClock`, offset from `clock.ping/pong`) and stay hidden until the offset is known. Hidden tallies stay hidden
(no counts, no leader, no ghost) until `vote.result`. Other round kinds render generically.

**Rehearsal driver** (`Director/RehearsalVoteChannel.cs`, editor and `MF_REHEARSAL` builds only (the T015 evidence and WebGL measurement builds define it; release builds do not), labelled
REHEARSAL): a seeded stand-in server with four players (tags, pings, a veto, runoff, FLIGHT tiebreak) feeding the same
handler. Used whenever no room is open; `-mfRehearsal` forces it. Flags (command line, or `?name=value` in WebGL):
`-mfContract C1`, `-mfBayVotes N` (seeded start), `-mfRehearsalPace 0.5`, `-mfHiddenTallies`, `-mfSolo`,
`-mfRtl`, `-mfText200`, `-mfHighContrast`, `-mfReducedMotion`, `-mfBayShots <dir>` (evidence run).

## Preview tools (design 6.10)

Chips and keys (Input System): **C** compare (top two options of the vote, split view + stat table from
`Preview.Of`), **X** exploded view (groups separated along the axis, leader-line labels), **R** scale reference
(person 1.75 m, ten-storey building ≈ 30 m, Saturn V 110.6 m as a ghost outline — `real_world_approximate`, no logos),
**M** stability markers (CoM / CoP from `DashboardMetrics.CenterOfMassM/CenterOfPressureM`, placed by fraction of
`VehicleLengthM` on the rig, with the explanation). **Space** skips an assembly animation.

## Accessibility

RTL (`bb-rtl`: panels swap sides), 200 % text (`bb-text-200`: every size through `--bb-fs-*`, lines wrap, panels
scroll), high contrast (`bb-hc`: solid Space surfaces, Ceramic text and borders, nothing translucent behind text),
reduced motion (assembly fades in place, no sparks, camera cuts). Sources: room `settings.state` (language, a11y) and
the flags above.

## Builds and evidence

**MissionForge ▸ Build Bay ▸ Build macOS Evidence Player / Build WebGL** write to the git-ignored
`unity/MissionForge/Builds/`. Evidence and measurements: `orchestration/evidence/T015/`.
