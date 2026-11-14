Every visual task must meet orchestration/VISUAL_TARGET.md

# T031: Unity host UI revamp, design system and rendering foundation

**Worker:** `yousuf-amek` (Unity MCP, Blender MCP) · **Starts after:** T015 is merged to `main`
(queue directly behind it, before T016).

**Owns:**
- `unity/MissionForge/Assets/MissionForge/UI/` (theme, components, fonts, icons, motion; create
  subfolders `Components/`, `Icons/`, `Motion/`, `Sprites/`). The existing files are yours to
  rework.
- `unity/MissionForge/Assets/MissionForge/Screens/BuildBay/**/*.uxml` and `*.uss`. These are
  styling and markup only. Controller C# changes are limited to renamed element names and
  classes; list them.
- `unity/MissionForge/Assets/MissionForge/Art/Lighting/` (create: volume profiles, lighting-rig
  prefabs, HDRIs, reflection-probe setups).
- `unity/MissionForge/Assets/MissionForge/Art/Shaders/` (create).
- `unity/MissionForge/Assets/MissionForge/Art/Materials/Kit/` and `Art/Textures/Kit/` (outputs of
  the kit material importer).
- `unity/MissionForge/Assets/MissionForge/Art/Models/` (refresh of kit imports only).
- `unity/MissionForge/Assets/MissionForge/Editor/KitMaterials/` and `Editor/DesignSystem/`
  (create).
- `unity/MissionForge/Assets/MissionForge/Scenes/Dev/MF_DesignSystem.unity` (create).
- In `MF_Title`, `MF_Lobby` and `MF_BuildBay`: lighting, volume, probe and UIDocument objects
  only.
- `unity/MissionForge/THIRD_PARTY.md` (append).
- `orchestration/evidence/T031/`.

**Settings lock:** T015 releases it on merge. While this task runs it is the only task that may
change `Assets/Settings/` (URP assets, renderer data, volume profiles), the Graphics and Quality
settings in `ProjectSettings/`, and `Packages/` (only to add free Unity packages such as Vector
Graphics). List every such change.

**Read first:**
- `orchestration/VISUAL_TARGET.md` (the bar; section 3 is your spec, and section 2.5 Unity
  covers rendering).
- `assets/media/style/STYLE_GUIDE.md`.
- The reference frames `assets/media/style/frames/01-title.png`, `02-build-bay.png` and
  `06-mission-control.png`.
- The "before" captures in `orchestration/evidence/T008/` and `orchestration/evidence/T015/`.
- The T015 brief (Build Bay layout rules, WebGL limits) and the T032 brief, section "Interface
  this task provides" (the kit material library contract).
- `GAME_DESIGN.md` 14.1, 14.3 and 14.4.

**Read only (do not edit):** `core/`, `data/`, `protocol/`, `assets/`, the
`Assets/MissionForge/{Data,Net,Tests,Vehicle}` code, and `Art/Environment/`. `App/Screens/TitleScreen.cs`,
`LobbyScreen.cs` and `App/ChromeController.cs` may get the smallest edits needed to bind
renamed elements; list them under **Interface changes**.

## Goal

The team owner says the game currently looks terrible. The host screens show flat boxes,
monospace capitals everywhere, dash placeholders and debug labels over a rocket pasted onto an
Earth disc. This task builds a real design system and the shared URP look. It then re-skins
Title, Lobby and the Build Bay so that each holds up side by side with the Higgsfield frames.
Every later Unity task (T016, T023, T024, T026) reuses this system instead of styling its own
screens.

## Rules

- Player-visible text still comes from `data/strings/en*.json`. Numbers still come from Core.
  Do not change behaviour, messages or data flow; this is presentation.
- WebGL 2 first: no compute shaders, no VFX Graph, no SSR. Every custom shader is Shader Graph
  or URP HLSL that compiles for WebGL.
- UI Toolkit limits to design around:
  - There is no box-shadow: use 9-slice sprites.
  - There is no backdrop blur: use a blurred camera copy (step 5).
  - There is no `calc()`, and there are no dashed borders: use textures.
  - USS `transition-*` is available for motion.
  - If this editor's USS supports `filter`, note that it blurs an element's own content, not the
    scene behind it.
- Keep the status language from the style guide (colour + shape + label + border) everywhere.

## Steps (in order; each leaves the project compiling and every scene usable)

1. **Preflight and "before" set.**
   - Confirm T015 is on `main`, the project compiles with zero errors, and the EditMode tests
     pass. If not, return `status=blocked` with the errors.
   - Capture 1920×1080 "before" shots of Title, Lobby and Build Bay into
     `evidence/T031/before/`.
2. **Tokens and typography.**
   - Write `UI/Theme/tokens.json`, the single source for palette, type scale, spacing, radii,
     elevation and motion, with every value from VISUAL_TARGET 3.1 tagged `game_value`.
   - Generate or rewrite `MissionForgeTheme.uss` variables from it. Add an EditMode test that
     fails if the USS and the JSON disagree.
   - Create font assets for Oxanium (display) and IBM Plex Sans (UI). Verify that the Plex digit
     advance widths are equal. If they are not, build a renamed OFL derivative with tabular
     figures as the default, and record it.
   - Add type classes (`mf-display`, `mf-h1`, `mf-h2`, `mf-h3`, `mf-kpi`, `mf-body`, `mf-label`,
     `mf-meta`, `mf-unit`). Restrict Plex Mono to `mf-code`.
3. **Icons.**
   - Import a Lucide (ISC) subset as vector images or 2× PNG into `UI/Icons/`, and record the
     licence.
   - Extend `MfIcon` to named icons plus the three status shapes. Replace every letter, dash or
     underscore that stands in for an icon.
4. **Components.**
   - In `UI/Components/`, build UXML templates, USS and C# controls where needed: button
     (primary, secondary, ghost, danger; L 72 px, M 56, S 44), chip and tag, status badge,
     card, panel (opaque and glass), segmented control, toggle, text field, seat and avatar card,
     metric bar (requirement marker plus "if chosen" ghost delta), radial gauge and timer ring,
     Gantt row, tally bar, phase stepper, top navigation, toast, modal, tooltip or "explain"
     popover, skeleton, and a key/value row with unit.
   - Each component needs default, hover, focus, pressed, disabled and selected states where
     they apply.
   - Build `Scenes/Dev/MF_DesignSystem.unity` (editor and development only), a specimen page
     showing every token, type style, icon and component state.
   - Evidence: `design-system-specimen-1920x1080.png`.
5. **Surfaces and motion.**
   - Make 9-slice shadow sprites for e1–e4.
   - Add a URP renderer feature `MfBlurredSceneFeature`: ¼-resolution dual-Kawase blur, fragment
     only, written to a global RenderTexture.
   - Add an `MfGlassPanel` element that samples that texture aligned to its screen rect. Fall
     back to opaque in high-contrast mode, on the Mobile quality tier, or when the feature is
     missing.
   - Add `UI/Motion/` with the motion tokens as USS transition classes plus C# helpers (enter
     and exit, stagger, number count-up, timer pulse). Each helper honours reduced motion.
   - Measure the blur cost on WebGL and state it; the budget is ≤ 1.5 ms at 1080p.
6. **Rendering foundation (used by every scene).**
   - Tune `PC_RPAsset` and `Mobile_RPAsset` (HDR, MSAA or SMAA, shadows, SRP Batcher) and their
     renderers (SSAO feature, blur feature).
   - Build volume profiles in `Art/Lighting/`:
     - `MF_Volume_Global`: ACES, bloom, colour grading and vignette, per VISUAL_TARGET 2.5;
     - overrides `MF_Volume_Dusk`, `MF_Volume_Orbit`, `MF_Volume_Interior` and
       `MF_Volume_CloseUp` (DoF).
   - Build lighting-rig prefabs `MF_Rig_DuskPad`, `MF_Rig_Orbit` and `MF_Rig_Interior`. Each has
     a sun or key light with its colour temperature, an HDRI skybox and ambient (Poly Haven CC0,
     2K, slug and URL recorded) or the orbit Earth-fill setup, and baked reflection probes.
   - Apply them to `MF_Title` (Orbit), `MF_Lobby` (Orbit) and `MF_BuildBay` (DuskPad). In
     `MF_BuildBay`, keep T015's lighting intent (warm 4500 K key, cool 8000 K fill) and replace
     its ad-hoc objects with the rig.
   - Write `Art/Lighting/README.md` saying which rig and volume each future scene uses.
   - Evidence: Build Bay beauty shots without UI, before and after.
7. **Kit material pipeline in Unity** (the contract is in the T032 brief).
   - Build the `MF_KitLit` Shader Graph:
     - UV0 tiling albedo, normal and ORM (smoothness = 1 − G);
     - a UV1 part mask (AO, edge wear, heat or frost, grime) with parameters `_HeatTint`,
       `_Frost` (0..1, settable at runtime by later tasks), `_WearAmount` and `_Tiling`;
     - SRP Batcher compatible.
   - Build an `MF_KitDecal` shader: alpha clip plus a polygon offset, with no z-fighting at
     300 m.
   - Write the editor importer `Editor/KitMaterials/KitMaterialLibraryImporter.cs` (menu
     *MissionForge ▸ Kit ▸ Import Material Library*). It reads
     `assets/blender/materials/library.json` and copies textures into `Art/Textures/Kit/` with
     import settings (sRGB or linear, normal map, max 2048, WebGL override 1024 for non-hero).
     It then creates or updates `Kit_<slot>.mat` for every slot, including new ones such as
     `trim`, `decal` and `foam`, and assigns per-part masks. It is idempotent and re-runnable;
     T032 and T033 run it after each export.
   - Refresh the kit FBX imports in `Art/Models/` (same settings T015 chose; normals imported,
     tangents MikkTSpace) and keep `RocketKitImport` and `KitLibrary` working.
   - If T032 has not exported anything yet, finish the shader and importer against the
     contract, test them with a tiny fixture library in `Editor/KitMaterials/Fixtures/`, and say
     "awaiting T032 data".
8. **Title** (reference frame 01).
   - Logo lockup in the reserved upper-left 45 % × 35 %, in the display face with no glow
     blobs.
   - Primary and secondary buttons from the system. The server-status badge and the imagery
     credit use the meta style, set on a scrim instead of a grey box.
   - The lit vehicle uses kit materials (or the current ones if T032 is pending) under
     `MF_Rig_Orbit`. Gentle motion: camera drift and staggered entry.
   - Evidence: `title_vs_frame01.png`, with the capture on the left and frame 01 on the right.
9. **Lobby.**
   - Seat cards with avatars from the system. Empty seats show a designed "Waiting for crew"
     state, not mono "Seat 05 open".
   - The join panel shows a large tabular room code and the QR on a white card. Mission settings
     use segmented controls.
   - Players appear as they join, with enter motion. The panels are glass over the orbit scene.
   - Evidence: `lobby_vs_frame06.png`.
10. **Build Bay panels** (reference frame 02).
    - Re-skin T015's dashboard, vote panel, timeline, budget bar, phase tracker and top
      navigation with the components.
    - Remove section numbers and developer notes. Every value shows real Core data or a
      designed empty state.
    - Use the metric bars with requirement markers and delta ghosts, the Gantt with critical
      path, slack and deadline per VISUAL_TARGET 3.1, and vote option cards with tallies and
      the timer ring.
    - Panels are glass in the outer 24 % columns, and the middle 52 % stays the pad scene.
    - Evidence:
      - `buildbay_vs_frame02.png`;
      - `buildbay_vote_in_progress.png`;
      - `buildbay_downscale_33pct.png`, the room-readability test.
11. **Accessibility and performance.**
    - Check high contrast (opaque panels, no imagery behind text), 200 % text, RTL with the
      panels swapped, and reduced motion on all three screens. Keep an evidence shot of each.
    - Measure contrast for the main text and status styles over the worst background, and keep
      the table in `evidence/T031/contrast.md`.
    - Make a WebGL build to a git-ignored folder. Measure the median fps at 1920×1080 on the
      Build Bay during an assembly animation, with post and glass on and then off. State the
      machine. The target and failure line are in VISUAL_TARGET 2.3.
12. **Documentation and review.**
    - Write `UI/DESIGN_SYSTEM.md` covering how a new screen uses the tokens, components, glass,
      motion, rigs and volumes, with a "do not fork the theme" rule.
    - A reviewer subagent that did not build the UI scores `evidence/T031/RUBRIC.md` (items U1–U11
      and M8) against the side-by-side images. Anything below 4 goes back to the relevant step
      before you report.

## Acceptance

- Zero compile errors and no new console warnings from your code. All existing and new
  EditMode tests pass, including the tokens-JSON/USS sync test.
- Title, Lobby and Build Bay use only system components and tokens. No placeholder glyphs,
  dashes, section numbers, developer notes, mono labels or overflow at 100 %, 200 % or RTL.
- The shared URP setup (volumes, rigs, probes, SSAO, blur) is in place and applied to the three
  scenes. Every HDRI and icon set is listed in `unity/MissionForge/THIRD_PARTY.md`.
- `KitMaterialLibraryImporter` runs cleanly (on T032 data if present, otherwise on the fixture),
  and the Build Bay vehicle has no default or flat materials when T032 data exists.
- WebGL fps is reported with post and glass on and off. Results below 45 fps are listed as
  failing.
- `RUBRIC.md` shows every item at ≥ 4, or the shortfall is reported plainly.
- Evidence in `orchestration/evidence/T031/`, all 1920×1080:
  - before and after for each screen;
  - the specimen page;
  - the three side-by-side images against frames 01, 02 and 06;
  - the downscale test;
  - high contrast, 200 % text plus RTL, and reduced-motion stills;
  - Build Bay beauty shots without UI, before and after;
  - `contrast.md`, the fps note and `RUBRIC.md`.
