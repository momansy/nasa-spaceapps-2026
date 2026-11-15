# T034 evidence: Build Bay environment and camera beauty pass (rework round 1)

Date 2026-11-15. Machine: Apple M4 MacBook (integrated GPU, built-in Retina display at 60 Hz), macOS 26.6,
Unity 6000.6.9f1, Blender 4.5.3 LTS. All captures are 1920 × 1080 from the macOS evidence player
(`MissionForge ▸ Build Bay ▸ Build macOS Evidence Player`, `-buildTarget OSXUniversal`, MF_REHEARSAL), built from the
final state of this branch.

This rework replaces round 1 (PR #128). The round-1 single captures are kept in `round1/` so the change can be judged;
`pairs/*-round1-vs-rework.jpg` put them side by side with the rework.

## What changed in the rework (issue #129, in order)

1. **Hero pad (M1, M3, M6, M10, M2).** New headless Blender source `Art/Environment/LaunchPad/Source/build_hero_pad.py`
   → `Models/Hero/`: a clad 8 m tower storey in two variants (white structural columns and girts, teal cladding on the
   back and two thirds of the camera face, teal K and X bracing, two foil-wrapped cryo lines, a steel pipe run on
   stand-offs, a cantilevered vehicle-side work platform with railings and lamps, and on alternate storeys a camera-side
   balcony), a crown machine house with glazing and roof railing, a plant building at the tower foot, a legged teal
   launch table (plinth, splayed legs, stairs in two flights per side with landings, railings, hold-down posts,
   lamps lighting the opening) and a hook block. Every piece has 4.5 cm bevels with hardened, area-weighted normals,
   imported as authored (4.5 cm is below the 5–15 cm the round-1 review asked for on big forms; open). The T017 `world_*` tower and crane pieces were not used: their 6 m pitch and attach empties do
   not fit `LaunchPadRig` (8 m segments, crown height, crane pivot), so new pieces were modelled to the rig's contract
   instead; T017's `world_flame_trench` and site silhouettes stay. The rig's `Segment_NN`, crown, tower, mount and hook
   get `Hero_*` children; the T015 meshes are hidden (scene overrides; `MF_LaunchPad.prefab` is untouched).
   Materials `LP_hero_*` are metallic light steel and teal paint; `LP_steel` (jib, masts) is now metallic too.
2. **Lighting and distance (M8).** A camera-attached framing card (`Stage/BayFrameGrade.cs`, `Textures/Frame_grade.png`)
   pulls the side edges and top corners to navy #071522 (the URP vignette stays at the 0.18 cap); two hazed headlands
   either side of the sun's path and a haze band at 1.7 km break the sea-sky line; the sea swell is 140 m (was 46 m)
   with a calmer normal, and an additive sun-glint strip runs toward the dusk sun (10° right of the view, T031);
   wet sheen is only placed in the lamp pools (`LP_wet` patches) — T031's 80 m procedural `Wet Sheen` sheet is switched
   off in this scene (override) because its puddles glinted far from any lamp; the stray glints are gone, but the
   reviewer sees no visible lamp reflection in the patches yet (open); scrub, sand and gravel are drier; a 170 m
   tileable macro-variation detail map (`Textures/Macro_variation_mask.png`, procedural, `Source/make_bay_masks.py`)
   breaks the ground repeat; the scrub tint is lifted off the shadow floor.
3. **Assembly and camera (U7, M7).** The cable ends at the hook block, whose bowl rests on the part (`HookDropM`
   2.65 m); the work light is capped (16, was up to 84) and moved 55° off the camera axis, 3 m up; sparks fountain from
   the camera-facing side of the joint, lifted to the table top for the first part (its joint is inside the exhaust
   opening), with a 60-spark strike burst (live count logged: 159–171 sparks at weld end); a satellite-only build (the
   payload has no kit model) is framed as a 12 m short stack instead of the 42 m empty pad; boil-off steam is set
   warm white (1.0, 0.93, 0.84), denser, buoyant and bent downwind on the sun side — it now rises as a column, but the
   reviewer measures it faint and cool grey on screen (open).
4. **UI clearance by framing (U11).** Compare band 330–530 px, shifted left of the tool chips; exploded band 330–760 px
   with an 8 % margin, so the nose clears the phase pills and the rehearsal banner. Camera bands alone could not clear
   the B candidate tag: it extends about 380 px to the right of its anchor and meets the tool chips (x ≥ 1210 px,
   y 265–478 px) at any useful band height. The compare tags therefore now point 86 % of the way down each candidate
   (`BuildBayScreen.Tools.CompareAnchor`), which puts them below the chips and above the stat table. Tag layout, styles
   and panels are unchanged.
5. **Technical (M9).** WebGL rebuilt from the final state and re-measured (below); render counters logged per capture.

## How the captures were made

`capture_bay.sh <repo> <out> [sets]` runs the player with the T015/T031 seeds; `compose.py <evidence> - <out> <frame02>`
writes `after/` and the composites (`-` keeps the existing `before/`); `make_motion.sh <frames> <out>` encodes a
landing sequence to MP4 (1280 × 720, H.264) and a 16-tile contact sheet.

| Set | Flags | Shots |
|---|---|---|
| `full` | `-mfBayVotes 9` | idle with UI, beauty without UI, compare, exploded, scale reference, complete-vehicle beauty |
| `vote` | `-mfBayVotes 4 -mfRehearsalPace 0.6` | vote in progress, assembly (crane, hook, sparks, work light) |
| `early` | `-mfBayVotes 2` | vote 3 of 22: two choices made, still no part with a 3D model (short-stack framing; the 42 m empty-pad framing only applies before the first choice and is not captured) |
| `sat` | `-mfBayVotes 4` | vote 5 of 22: satellite chosen, no 3D part yet (short-stack framing) |
| `mid` | `-mfBayVotes 5` | vote 6 of 22: fairing on the pad |
| `late` | `-mfBayVotes 7` | vote 8 of 22: stack growing |
| `rm` | `-mfBayVotes 9 -mfReducedMotion` | reduced motion |
| `seq` | `-mfBayVotes 4 -mfRehearsalPace 0.6 -mfBaySeqNoUi` | 13 s of real time from the moment the crane starts lowering the fairing |
| `seqrm` | as `seq` plus `-mfReducedMotion` | the same landing in reduced motion |

The sequences record 13 s of real time (the bay animates on unscaled time, so capturing cannot slow it) with each
frame's real timestamp (`timestamps.txt`); `make_motion.sh` shows every frame for its real duration and resamples to
30 fps, so the clips play at real speed. Normal motion: 261 frames (20 fps captured), the assembly ends at
t = 3.19 s (designed 3.1 s). Reduced motion: 272 frames (21 fps), the fade ends at t = 0.80 s (designed 0.8 s); the
next vote's assembly starts near the end of the clip.

| File | What |
|---|---|
| `motion/landing-normal-motion.mp4`, `-contact.jpg` | crane lowers the fairing from 22 m (the camera eases out for the hook), it lands, the punch-in plays, sparks strike, the hook retracts, the idle orbit resumes |
| `motion/landing-reduced-motion.mp4`, `-contact.jpg` | the same vote in reduced motion: the part fades in place, no crane move, sparks, orbit or punch-in; every reframe is a cut |
| `after/*.jpg` | the rework captures (JPEG q90) |
| `before/*.jpg` | the T034 base (bb8faa3d, T031 state), unchanged from round 1 |
| `round1/*.jpg` | the round-1 captures (PR #128) |
| `pairs/*-before-after.png`, `pairs/*-round1-vs-rework.jpg` | side by side |
| `complete-beauty-vs-frame02.png`, `buildbay-ui-vs-frame02.png` | against reference frame 02 |
| `assembly-stages-ui.png` | votes 5, 6 and 8 with the UI on; vote 10 is `after/idle-ui-*` |
| `render-stats.txt` | per-capture render counters (below) |
| `RUBRIC.md` | VISUAL_TARGET 3D rubric, scored by an independent reviewer subagent |
| `webgl-fps-*.json`, `webgl-chrome-1920x1080.jpg` | WebGL frame rate (below) |
| `editmode-results.xml` | final EditMode run: 340 / 340 passed (339 + the new `WeldSparksTests`) |

## Vehicle framing, measured

`BayFraming.Solve` (unit-tested) puts the stack between 200 px and 760 px of 1080 in the free column (512–1408 px).
Empty pad (no choice yet): 42 m framed. Any choice, or a stack shorter than 12 m: 12 m framed. Compare: 330–530 px.
Scale: 200–690 px. Exploded: 330–760 px. All `game_value` layout choices.

## Render budget (M9): visible triangles and draw calls

Logged by the evidence runner at each capture (`render-stats.txt`), 1920 × 1080, High quality:

| Capture | Main view: triangles / draws | All passes (engine counters): triangles / draw calls / SetPass |
|---|---|---|
| vote 3 (no 3D part yet) | 141 510 / 147 | 466 298 / 529 / 50 |
| vote 6 | 156 574 / 178 | 590 410 / 657 / 50 |
| vote 8 | 231 935 / 221 | 703 450 / 803 / 50 (no-UI frame: 693 215 / 1 496 / 98) |
| vote 10, idle | 273 735 / 316 | 930 093 / 1 132 / 54 |
| complete vehicle | 363 814 / 390 | 1 103 875 / 1 313 / 54 |
| compare (two vehicles) | 476 378 / 448 | 988 560 / 1 453 / 53 |
| assembly (crane, sparks) | 155 576 / 194 | 548 412 / 722 / 79 |

- **Main view** = enabled mesh renderers whose bounds meet the main camera frustum (triangles, and one draw per
  submesh). This is the budget's "visible triangles / draw calls": at most 0.48 M of 1.8 M and 448 of 600. **Pass.**
- **All passes** = Unity's `Triangles Count` / `Draw Calls Count` / `SetPass Calls Count` for the whole frame: the four
  desktop shadow cascades, the SSAO depth-normals prepass, the opaque and transparent passes and UI. Triangles stay
  under 1.8 M (1.10 M at most). Draw calls exceed 600 in the fuller states (up to 1 496), so if the budget is read as
  all passes — the independent reviewer reads it so — it is **not met**. SetPass calls stay at 49–98 (SRP batcher).
  WebGL uses two shadow cascades, so its all-pass counts are lower than these desktop numbers (not measured there).
  The "main view" count is defined by this task (it leaves out the shadow and prepass draws); it is not a Unity counter.
  A few rows in `render-stats.txt` read `triangles=0` or `drawCalls=0`: the counter sampled the screenshot frame, not
  a rendered frame; ignore those rows.

## WebGL frame rate (step 7)

Build: `Unity -batchmode -quit -buildTarget WebGL -executeMethod MissionForge.Screens.BuildBay.Editor.BuildBayBuilds.WebGL`
(Library/PlayerDataCache cleared first) from the final state → git-ignored `unity/MissionForge/Builds/BayWebGL/`,
59.6 MiB, 0 errors; served with `python3 -m http.server 8971`; measured with `measure-webgl-fps.mjs` (desktop Chrome
through Playwright, viewport 1920 × 1080, DPR 1). `uncapped` launches Chrome with `--disable-gpu-vsync
--disable-frame-rate-limit`, so the numbers show the headroom above the 60 Hz display.

| Run | URL flags | Mode | Median fps | During assembly: median fps, p95 / worst frame | File |
|---|---|---|---|---|---|
| High, six live assemblies | `?mfBayVotes=4&mfRehearsalPace=0.5`, 80 s | vsync | **59.9** | 59.9, 17.6 / 17.8 ms | `webgl-fps-high.json` |
| High, six live assemblies | same | uncapped | **109.9** | 111.1, 11.1 / 33.1 ms | `webgl-fps-high-uncapped.json` |
| High, late stack (votes 12 → 18, full-height vehicle) | `?mfBayVotes=12&mfRehearsalPace=0.5`, 60 s | uncapped | **161.3** | no assembly window logged | `webgl-fps-high-late-uncapped.json` |
| Low, late stack | `…&mfBayQuality=low`, 60 s | uncapped | **188.7** | no assembly window logged | `webgl-fps-low-late-uncapped.json` |

- Each run's end-of-run screenshot was checked: all four end in the Build Bay (`webgl-chrome-1920x1080.jpg` is the
  High late-stack one, vote 18). An earlier pair of runs from vote 18 ran past vote 22 into the Flight Readiness Review
  screen, so they were discarded and re-run from vote 12.
- Passes the 45 fps floor with about 2.4× headroom on High on this machine (worst assembly frame 33 ms). The M4 is faster than a typical
  mid-range laptop; a slower GPU was not available, so the mid-range figure is not measured. The **Low** tier
  (`-mfBayQuality low`, `?mfBayQuality=low`, or **Q**) is the fallback.
- Console errors: one favicon 404 and the room client's reconnects to `ws://localhost:8787` (no room server running).

## Finding outside T034's paths (for T031)

Every player built from this project logs: *"Shader 'Hidden/Universal Render Pipeline/PaniniProjection' is not
supported or has been stripped from the build … PostProcessing render passes will not execute."* With
`m_StripUnusedPostProcessingVariantsAndResources: 1` in `Assets/Settings/UniversalRenderPipelineGlobalSettings.asset`,
URP strips the unused Panini shader and then skips **all** post-processing in builds: no ACES tonemapping, bloom,
colour grading or vignette in the macOS or WebGL players (the editor still shows them). The same line is in
`orchestration/evidence/T008/webgl-browser-run.json`. T034 does not own the pipeline settings, so this is reported, not
changed. Every capture here is therefore without post-processing; the framing card does the navy edge falloff by itself.
