# T015 — Unity Build Bay at release quality (package F2, part 1)

**Worker:** `yousuf-amek` (Unity MCP, Blender MCP) · **Starts after:** T008 is merged to `main`
**Owns:** `unity/MissionForge/Assets/MissionForge/Screens/BuildBay/` (create),
`unity/MissionForge/Assets/MissionForge/Vehicle/` (create),
`unity/MissionForge/Assets/MissionForge/Scenes/MF_BuildBay.unity` (+ `.meta`),
`unity/MissionForge/Assets/MissionForge/Art/Environment/LaunchPad/` (create),
`unity/MissionForge/Assets/MissionForge/Art/Models/` (refresh of kit imports only),
`orchestration/evidence/T015/`. This task holds the **settings lock**: it is the only task
that may change `unity/MissionForge/ProjectSettings/`, `Packages/` and `Assets/Settings/`
while it runs, and only if a step cannot be done otherwise (list every such change).

Read first: `GAME_DESIGN.md` 4, 6.1 to 6.4, 6.10, 6.11, 14.1, 14.3, 14.4, 15, 16;
`orchestration/ARCHITECTURE.md`; `assets/media/style/STYLE_GUIDE.md` (palette, safe
regions, Build Bay shot direction, material and lighting recipes); `protocol/messages.md`
sections 4.5, 6 and 7 plus `protocol/schema/vote.*.schema.json`, `ping.event`,
`build.state`, `build.event`; `assets/blender/scripts/AUTHORING.md` and
`assets/blender/scripts/mfkit/assemble.py` (the attach rules); the T008 brief.

Read only (do not edit): `core/`, `data/`, `protocol/`, `assets/blender/`, and the T001/T008
code in `Assets/MissionForge/{App,Data,Net,UI,Editor,Tests}`. If you truly need a hook in
those folders (for example registering a controller), make the smallest change and list it
under **Interface changes**. The existing `UI/Layouts/BuildBay.uxml` is T001's draft: build
your own layout in your folder and point the scene's `UIDocument` at it; do not delete the
old file.

## Goal

The Build Bay is the screen the audience watches for most of a session. In the centre, the
live rocket stands on a launch pad and gantry at dusk and grows piece by piece as votes
resolve; around it sit the readiness dashboard, the vote panel, the integration timeline and
the phase tracker. It must look like a shipped game, not a debug view (standing orders 4).

## Rules for this screen

- **Core is the only source of numbers.** Dashboard values come from
  `MissionForge.Core.Build.Dashboard.Compute(BuildState, GameCatalog)`; "if chosen" deltas
  from `Preview.Of(...)` (`OptionPreview.Delta`, a `DashboardDelta`); vote options from
  `VoteOptions.NextVote/For/Commit`; timeline from `DashboardMetrics.Budget`
  (`Timeline`, `CriticalPath`, `TotalCostM`, `BudgetM`, `DeadlineDays`). Never recompute a
  rule in Unity. Convert units only for display (kg → t, m/s → km/s where the design says so).
- **The room server is the authority for votes.** The host sends `vote.open` (with the
  option deltas it computed) and `vote.commit`; it renders `vote.opened`, `vote.stage`,
  `vote.tally`, `vote.tags`, `vote.vetoed`, `vote.result`, `vote.cancelled`, `ping.event`
  exactly as `protocol/messages.md` defines them. Timers use `endsAtMs` corrected by the
  clock offset from `clock.ping/pong`, never a local guess. Hidden tallies stay hidden.
- **Layout (style guide):** dashboard in the left outer 24 % of width, vote panel in the
  right outer 24 %, rocket and gantry inside the middle 52 %, timeline and budget bar along
  the bottom, contract objectives and phase tracker (A → B/PDR → C/CDR → D/FRR) along the
  top. Panels swap sides for right-to-left languages. 32 px body / 24 px labels / 64 px
  titles at 1920×1080. Every number has a unit; status uses colour **plus** shape, label and
  border (Meets / Marginal / Fails); deltas show an arrow, a sign and a unit.
- **Unity units:** 1 unit = 1 m, +Y up. Kit FBX come from `assets/blender/export/fbx/`
  (exported by T009). Use LOD0/LOD1 as exported.
- **WebGL first:** no VFX Graph, no compute shaders, no screen-space reflections. Particles
  are the built-in Particle System; shaders are Shader Graph or URP HLSL that compile for
  WebGL 2.
- Player-visible text comes from `data/strings/en*.json` through the existing data service.
  No hard-coded English in UXML except developer-only labels, which must not ship visible.

## Interface this task provides (T016 depends on it)

In `Assets/MissionForge/Vehicle/` with its own asmdef `MissionForge.Vehicle` (references
`MissionForge.Core`, no UI): a `KitLibrary` ScriptableObject (kit part id → prefab, built by
an editor menu from `Art/Models/`), a `KitResolver` that maps a Core `BuildState` to kit part
ids, and `VehicleAssembler.Build(BuildState, GameCatalog, KitLibrary, Transform parent) →
VehicleRig`. `VehicleRig` exposes, bottom-up: stage groups (root transform, engine
`nozzle_exit` and `gimbal_pivot` transforms, separation joint), booster groups, interstage,
fairing halves with their hinges, payload root, `LengthM`, and `PartFor(category)`. Also
`Art/Environment/LaunchPad/MF_LaunchPad.prefab` with a `VehicleMount` transform where a rig's
lowest point sits. Document both in `Screens/BuildBay/README.md`.

Kit id resolution: engines and boosters map by id; engine counts map to the mount parts;
tanks use `spec.tank_id(stage, size, family)` with `family = hydrolox` when that stage's
engine is hydrolox; interstages by separation system and diameter pair; adapters where
diameters differ; fairings by id. Known mismatch to handle and report: the kit registers
`fairing_large_reusable`, the data id is `fairing_reusable_large`. Any data id with no kit
model is logged once and listed in your summary; it never crashes the screen.

## Steps (in order; each leaves the project compiling and the scene usable)

1. **Preflight.** Open the project; confirm zero compile errors and that Core is bound
   (an EditMode test calling Core passes). If T008 is not merged or the project does not
   compile on `main`, return `status=blocked` naming the errors; do not redo T008.
2. **Screen skeleton and live dashboard.** Create `Screens/BuildBay/` with an asmdef,
   `BuildBayScreen : ScreenController` bound in `MF_BuildBay`, your UXML/USS (extending
   the shared theme) with all five regions. Feed the dashboard from Core for a seeded C1
   build. All eleven metrics of 6.3 with units, status and the ± band on mission success.
   Evidence: screenshot.
3. **Vehicle assembly, static.** Refresh the kit imports in `Art/Models/` from
   `assets/blender/export/fbx/` (same import settings T008 chose), build `KitLibrary`,
   `KitResolver`, `VehicleAssembler` following `assemble.py` rules. EditMode test: three
   seeded builds (C1 small, a mid-size three-engine build, a heavy build with strap-ons)
   assemble with every mating ring within 3 mm.
4. **Launch pad at dusk.** `MF_LaunchPad.prefab` and the scene's environment: pad deck,
   launch mount, flame trench, gantry with crane arms and umbilical arms, lightning masts,
   distant site scenery kept low-contrast under the panels. Gantry height follows the
   vehicle length (stacked segments). If T017 has exported `world_*` gantry and pad parts
   to `assets/blender/export/fbx/`, import them into your LaunchPad folder; otherwise author
   the pieces with Blender MCP (source `.blend` in `Art/Environment/LaunchPad/Source/`) to
   the same modular standard, and note the swap point. Lighting per style guide: warm key
   about 4500 K low sun, cool fill about 8000 K, filmic tone curve, subtle bloom only on
   practicals; no default materials anywhere. Cinemachine vantage framing the rocket in
   the middle 52 %. Evidence: beauty screenshot with and without UI.
5. **Vote panel and build director.** `BuildBayDirector` runs PART rounds for the C1 vote
   order: `VoteOptions.NextVote` → `vote.open` with options and deltas → render stages →
   on `vote.result` call `VoteOptions.Commit`, send `vote.commit` and `build.state` →
   next vote, until none remain (then hand over to the next screen through the app's
   navigator). Option cards (name, category, key stats with units, drawbacks always
   visible, hidden-risk badge, "if chosen" deltas), live tallies (or hidden), timer, role
   tags, pings, vetoed options struck through, solo mode, runoff and tiebreak stages.
   Other round kinds (TEST, ANOMALY, REVIEW) render generically; their flows belong to
   later tasks. Add a **rehearsal driver** (editor and development builds only, labelled
   "REHEARSAL" on screen) that feeds synthetic, seeded `vote.*` envelopes for four players
   through the same handler, so the screen can be shown without phones. EditMode tests for
   message → view-model mapping and timer arithmetic.
6. **Timeline, budget, phase tracker.** Gantt of `Budget.Timeline` with the critical path
   highlighted (pattern, not colour alone), slack shown, deadline line; budget bar with
   spent / remaining / leading-option preview; contract objectives and phase tracker at the
   top.
7. **Live assembly and ghost.** When a vote resolves, the chosen part animates in: crane
   lowers it on a cable, technicians (stylised, diverse, simple silhouettes) and welding
   sparks at the joint, settle (about 3 s, `game_value`, skippable). During a vote the
   leading option (`vote.tally.leadingOptionId`) shows as a translucent Signal-teal ghost
   in its slot, swapping smoothly when the lead changes. Reduced motion: fade in place, no
   sparks, no camera move.
8. **Preview tools (6.10).** Host toggles by on-screen chips and keys via the Input System:
   **compare** (split view of two candidate builds, default the top two options, with a
   stat-difference table from `Preview.Of`); **exploded view** (stages separated along the
   axis with leader-line labels for tanks, engines, payload); **scale reference** (human
   1.75 m, a 10-storey building about 30 m, Saturn V 110.6 m as a ghost outline, all tagged
   `real_world_approximate`, no logos); **stability markers** CoM and CoP from
   `DashboardMetrics.CenterOfMassM/CenterOfPressureM` (metres from the nose), placed by
   fraction of `VehicleLengthM` on the visual rig, with the one-line explanation of why CoP
   should sit aft of CoM.
9. **Polish, accessibility, performance.** RTL swap, 200 % text, high-contrast mode (no
   imagery behind text), reduced motion. Run the editor WebGL build to a git-ignored folder
   (do not commit to `docs/play/`), load it in a desktop browser, and measure the median
   frame rate at 1920×1080 during an assembly animation; state the machine.
10. **Review and evidence.** One subagent reviews the result against this brief's
    acceptance list and the style guide before you report.

## Acceptance

- `MF_BuildBay` opens with zero console errors and warnings from your code; all EditMode
  tests pass (existing and new), including: kit resolution for every option C1 offers,
  ring gaps ≤ 3 mm for the three seeded builds, dashboard values identical to
  `Dashboard.Compute` for the same build, vote message mapping and timer tests.
- In rehearsal mode a complete C1 build runs from the first vote to the last with the
  vehicle assembled on the pad, without errors. If `server/` (T004) is on `main`, the same
  run works against it with scripted WebSocket clients; state which you ran.
- Every element of 6.1 and 6.10 listed above is present (livery vote and phone AR are out of
  scope). No placeholder art, default materials or debug text in the shipped view.
- WebGL build succeeds; measured frame rate reported (target 60 fps at 1080p on a mid-range
  laptop; below 45 fps is listed as failing).
- Evidence in `orchestration/evidence/T015/`, all 1920×1080: idle bay with partial vehicle;
  vote in progress with ghost and tallies; assembly frame with crane and sparks; compare;
  exploded; scale reference; stability markers; complete vehicle beauty shot; RTL with
  200 % text; high contrast; plus the Unity test summary and the WebGL frame-rate note.
