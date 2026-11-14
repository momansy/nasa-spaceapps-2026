# T031 evidence: host UI revamp, design system and rendering foundation

All captures are 1920 × 1080 unless stated. Date 2026-11-14 (recaptured in run 3 on the final builds). Machine: Apple M4 MacBook (integrated GPU,
built-in Retina display at 60 Hz), macOS 26.6.2, Unity 6000.6.9f1, Google Chrome 157.0.8103.51.

## How the captures were made

| Set | Player | Command |
|---|---|---|
| Title, Lobby (`after/`, `accessibility/title-*`, `accessibility/lobby-*`) | macOS look-dev player (`MissionForge ▸ Build ▸ MacLookDev`, git-ignored `Logs/lookdev/`) | `-screen-fullscreen 0 -screen-width 1920 -screen-height 1080 -window-mode windowed -mfShot <png> -mfPhase Title|Lobby [-mfCreateRoom] -mfWait 6` plus `-mfHighContrast`, `-mfReducedMotion` or `-mfText200 -mfRtl`. The Lobby runs against the project's stub room server (`unity/MissionForge/Tools~/stub-server/server.mjs --host 127.0.0.1 --bots 5`, `ws://localhost:8787`): the room code and the five crew members (bots) arrive over the real room protocol. |
| Build Bay (`after/buildbay-*`, `buildbay_vote_in_progress.png`, `accessibility/buildbay-*`) | `BuildBayBuilds.MacEvidence` (MF_REHEARSAL) | `-mfBayShots <dir> -mfBayOnly <states>` with the T015 seeds: `-mfBayVotes 9` (idle, beauty, complete vehicle), `-mfBayVotes 4 -mfRehearsalPace 0.6` (vote in progress, assembly). |
| Specimen | `SpecimenSceneBuilder.BuildPlayer` (development build of `Scenes/Dev/MF_DesignSystem.unity`) | `-mfShot design-system-specimen-1920x1080.png` |
| Side by side, downscale | `compose.py` (Pillow) | capture on the left, reference frame on the right, each scaled to 936 × 526 on a 1920 × 1080 canvas; the downscale test is the Build Bay capture at 640 × 360 shown 1:1. |

`capture.sh`, `capture_bay.sh` and `compose.py` in this folder reproduce the set (paths are arguments). Build the players with `-buildTarget OSXUniversal` first.

The "before" set was captured at commit bf9709da (T015 merged, this branch's base) with the same players and flags.

## WebGL frame rate (step 11), run 3

Build: `MissionForge ▸ Build Bay ▸ Build WebGL` run as
`Unity -batchmode -quit -buildTarget WebGL -executeMethod MissionForge.Screens.BuildBay.Editor.BuildBayBuilds.WebGL`
→ git-ignored `unity/MissionForge/Builds/BayWebGL/` (Web quality tier, Mobile_RPAsset: HDR, MSAA 4×, SSAO,
MfBlurredSceneFeature), served on `127.0.0.1:8971`, measured with `measure-webgl-fps.mjs` (the T015 method: desktop
Chrome through Playwright, viewport 1920 × 1080, DPR 1, 80 s, `?mfBayVotes=4&mfRehearsalPace=0.5` so six assembly
animations run during the window).

| Run | URL flags | Median fps during assembly | p95 frame | Worst frame | Median fps overall | File |
|---|---|---|---|---|---|---|
| Post-processing and glass **on** | (none) | **59.9** | 17.6 ms | 17.8 ms | 59.9 | `webgl-fps-post-glass-on.json` |
| Post-processing and glass **off** | `&mfNoPost&mfNoGlass` | **59.9** | 17.6 ms | 17.7 ms | 59.9 | `webgl-fps-post-glass-off.json` |

- Both runs pass the VISUAL_TARGET 2.3 target (60 fps; failure line 45 fps).
- **Glass is confirmed rendering in the "on" run** (`webgl-chrome-post-glass-on-1920x1080.png`: the panels show the
  blurred dusk sky; the "off" capture shows opaque Console panels). In run 2 it never rendered (see below), so the run-2
  "on" number did not include the blur.
- 60 fps is the display's vsync cap, so headroom was not measured. **Blur cost:** still not isolated (WebGL exposes no
  per-pass GPU timer here and both runs sit at the cap); the on/off p95 difference is 0 ms. The ≤ 1.5 ms budget is
  therefore **not verified** by a timing, only bounded by "no measurable frame-time change at the vsync cap".
- Console errors in both runs: one favicon 404 only.

## Run 3 fixes found while re-verifying

- **Glass never rendered in any player (run 2).** `MfBlurredSceneFeature` had `m_Shader: {fileID: 0}` in both renderer
  assets, so players stripped the Hidden Kawase blur shader, the feature never ran, and every glass panel stayed on
  its opaque fallback. Both renderers now serialise the shader reference.
- **Batch builds must start on the target platform.** A WebGL build started from an editor on the Standalone target
  included only PC_RPAsset in URP's variant stripping, while the WebGL Web tier runs Mobile_RPAsset: every Lit and
  WetSheen variant was stripped (magenta ground, invisible pad). The same happened in reverse for a Mac build started
  on the WebGL target, and the incremental player cache then reused the bad shader data. Always pass `-buildTarget`
  (`OSXUniversal` or `WebGL`), and clear `Library/PlayerDataCache` after switching. Every capture here was checked for
  magenta (none).

## Run 4 (2026-11-15): fixes from the run-3 rubric, full recapture

All players were rebuilt (`-buildTarget OSXUniversal`) and every capture, composite and the specimen were retaken with
the same scripts (`capture.sh`, `capture_bay.sh` now writes to `/tmp/t031/r7`, `compose.py`). `measure_contrast.py`
needs Pillow 11 (`get_flattened_data`); with Pillow 10 run it with `Image.Image.get_flattened_data` aliased to
`getdata` (that is how the run-4 table was produced). The WebGL fps numbers above were **not** re-measured in run 4:
run 4 changed only UI layout and the wet-ground material values (no new passes or shaders).

| Rubric item | Change (paths under `unity/MissionForge/Assets/MissionForge/`) |
|---|---|
| U2, U10 | Vote-stage pills tightened so Reveal, Inspect, Vote and Result sit on one line (`Screens/BuildBay/UI/BuildBay.uss`). |
| U6 | Marginal/Fails zero values draw a patterned stub; the compact requirement marker stays inside its box and no longer runs through the detail line (`UI/Components/MfMetricBar.cs`). The timer ring has a labelled threshold tick and a threshold zone (`MfRadialGauge.cs`). The Gantt has day labels under the ticks, a labelled "Today" marker, names for short bars and chevrons that start after the bar label (`MfGanttChart.cs`). |
| U10 | No-break spaces between numbers and units on vote cards ("30 days" never splits); feed lines and metric detail lines wrap instead of ellipsising; the feed shows the newest three. Specimen captions corrected (Console 92 %). |
| U7 | Build Bay motion: the four regions enter with the 40 ms stagger, option cards enter once per round, the winning card plays `MfMotion.Celebrate`, Readiness KPI values count up (`BuildBayScreen.cs`, `Views/VotePanelView.cs`, `Views/DashboardView.cs`; `KpiCountUpTests`). Reduced motion keeps these as fades or jumps. |
| U9 | 200 % text: status, chip and button icons scale; the Gantt rows, label band and axis scale with the text; the Title pitch sits on a Space-80 % scrim; the rehearsal-only tag is hidden at 200 % so it no longer covers the tools. RTL: Lobby headings, room code and setting labels align right. |
| M8 | Wet ground reads as a damp apron, not open water: puddle coverage 40 % → 20 %, puddle scale 22 → 11 m, damp darkening 0.6 → 0.5 (`Art/Lighting/MF_WetSheen.mat`, `Editor/DesignSystem/LightingFoundation.Rigs.cs`). |

## Other files

- `contrast.md`: WCAG contrast measured on the captured frames (`measure_contrast.py`, boxes in `contrast_regions.json`), with the verdict for each failing cell.
- `RUBRIC.md`: VISUAL_TARGET rubric U1–U11 and M8, scored by an independent reviewer subagent.
- `before/`, `after/`, `accessibility/`: the captures listed above.
