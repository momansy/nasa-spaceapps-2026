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

## Environment and camera (T034)

- **Camera** (`Cameras/BayFraming.cs`, `Stage/BayStage.Framing.cs`): the Cinemachine `Vantage` is posed every frame by
  `BayFraming.Solve` so the stack spans 200–760 px of 1080 (52 %) centred in the free column (512–1408 px). It eases
  as the stack grows, sweeps ±7° over 70 s when idle, eases out while the crane lowers a top part and punches in to
  84 % distance when a part lands. Compare (330–530 px, shifted left of the tool chips; the candidate tags point 86 %
  of the way down each candidate so they sit below the chips and above the stat table), scale (200–690 px, centred
  between the vehicle and the Saturn V outline) and exploded (330–760 px, the fully exploded stack plus 8 %, so the nose
  clears the phase pills and the rehearsal banner) have their own bands. Empty pad (no choice yet): 42 m framed; any
  choice (a satellite-only build has no kit model yet) or a short stack: at least 12 m. Reduced motion: no orbit or
  punch-in, every reframe is a cut. Tests: `BayFramingTests`.
- **Assembly feel** (`Stage/BayStage.Atmosphere.cs`, `BayStage.Assembly.cs`): the crane cable ends at the hero hook
  block, whose bowl rests on the part (`HookDropM` 2.65 m); a 3400 K work light (16, capped) rakes the joint from 55°
  off the camera axis during the weld; sparks fountain from the camera-facing side of the joint; each tank on the stack
  gets a warm-white, buoyant, wind-bent boil-off plume on the sun side (game_value cue, not a simulated rate). Steam
  and the work light are off in reduced motion; steam is off on Low quality.
- **Framing card** (`Stage/BayFrameGrade.cs`): a camera-attached card (`Textures/Frame_grade.png`) pulls the side edges
  and top corners to navy #071522 like frame 02; the URP vignette stays at VISUAL_TARGET's 0.18 cap.
- **Quality toggle** (`Stage/BayQuality.cs`, `BayQualityGroup.cs`): `-mfBayQuality low` / `?mfBayQuality=low` / **Q**.
  Low = 85 % render scale, 160 m shadows, no floodlight cones, glows, soot, steam or distant silhouettes.
- **Haze** (`Stage/BayEnvironment.cs`): fog and ambient are re-applied when the active scene changes, so the bay keeps
  its haze when the Shell becomes active after the bay (evidence and WebGL players).
- **Dressing** (`Editor/BayDressing*.cs`, menu **MissionForge ▸ Build Bay ▸ Apply Environment Dressing (T034)**, batch
  `BayDressingBuilder.Run`): rebuilds `Bay/Dressing` in `MF_BuildBay.unity` and overrides the `MF_LaunchPad` instance
  (the prefab asset is untouched): CC0 ambientCG concrete on the deck (box-projected metric UVs), gravel verge, scrub
  and sand terrain (170 m macro-variation detail map against tiling; dry scrub, wet sheen only in the lamp pools), sea
  with a 140 m swell and a horizon lift into the haze, two hazed headlands, a horizon haze band and a sun-glint strip
  toward the dusk sun (10° right of the view, T031), the **hero pad** (below), T017 `world_flame_trench`, T017 site
  silhouettes, flood cones and glows, crew figures, apron paint and soot, the bay haze colour and a framing volume (`Art/Environment/LaunchPad/MF_Volume_BayFrame.asset`: vignette
  0.18, saturation −8, priority 2.5 over T031's profiles). Re-run it after `BuildBaySceneBuilder` and T031's
  `LightingFoundation.ApplyToScenes`. Textures: `Art/Environment/LaunchPad/Source/prepare_textures.py`; licences in
  `unity/MissionForge/THIRD_PARTY.md`. Evidence and measurements: `orchestration/evidence/T034/`.
- **Hero pad** (T034 rework; `Art/Environment/LaunchPad/Source/build_hero_pad.py` → `Models/Hero/`, headless Blender):
  clad 8 m tower storeys (two variants: vehicle-side work platform; plus a camera-side balcony) with columns, braces,
  cladding, foil-wrapped cryo lines, a pipe run, railings and lamps; a crown machine house; a plant building at the
  tower foot; a legged teal launch table with stairs, plinth and lamps; and a hook block. 4.5 cm bevels with hardened,
  area-weighted normals (imported as authored). The dressing builder adds them as `Hero_*` children of the rig's
  `Segment_NN`, crown, tower, mount and hook and hides the T015 meshes, so `LaunchPadRig`'s segment stacking, crown
  height, crane pivot, hook and `VehicleMount` contracts are unchanged. Materials `LP_hero_*` (metallic light steel and
  teal paint that pick up the dusk sky); `LP_steel` (jib, masts) is now metallic too.
