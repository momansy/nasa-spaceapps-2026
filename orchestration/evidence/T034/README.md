# T034 evidence: Build Bay environment and camera beauty pass (rework 2, issue #147)

Date 2026-11-15. Machine: Apple M4 MacBook (integrated GPU, built-in Retina display at 60 Hz), macOS 26.6,
Unity 6000.6.9f1, Blender 4.5.3 LTS. All captures are 1920 × 1080 from the macOS evidence player
(`MissionForge ▸ Build Bay ▸ Build macOS Evidence Player`, `-buildTarget OSXUniversal`, MF_REHEARSAL), built from the
final state of this branch (the last dressing, build and capture run, after the last code change).

Rework 2 continues #129 / PR #146 (merged into this branch together with `main`). Folders:

| Folder | What |
|---|---|
| `before/` | the T034 base (bb8faa3d, T031 state), unchanged since round 1 |
| `round1/` | round 1 (PR #128) |
| `round2/` | rework 1 (PR #146): the `after/` set of that PR, kept for comparison |
| `after/` | **rework 2** (this run) |
| `pairs/*-round2-vs-rework2.jpg` | rework 1 next to rework 2, every capture (17 pairs) |
| `pairs/*-before-after.png` | T034 base next to rework 2 |
| `postfx/` | post-processing before/after and no-post controls (macOS and WebGL) |
| `motion/` | landing clips (normal and reduced motion) with contact sheets |

## 0. Post-processing in player builds (orchestrator comment on #147, done first)

**Change:** `unity/MissionForge/Assets/Settings/UniversalRenderPipelineGlobalSettings.asset`, three flags only:
`m_StripUnusedPostProcessingVariantsAndResources` (the live `URPShaderStrippingSetting` entry and the legacy field) and
`m_StripUnusedPostProcessingVariants` set from 1 to 0. No pipeline or renderer asset needed a change. The quality
toggle (Q / `-mfBayQuality low` / `?mfBayQuality=low`) is unchanged.

**Verified:**
- macOS build log: `Hidden/Universal Render Pipeline/PaniniProjection` is now compiled into the player. The player
  log no longer prints *"Shader 'Hidden/Universal Render Pipeline/PaniniProjection' … stripped … PostProcessing render
  passes will not execute"*.
- macOS control (`postfx/macos-strip-change-and-nopost-control.jpg`), same scene, vote 10: the build with the flags
  off vs the same build with `-mfNoPost` differ by **24.9 / 255** mean per channel (graded vs ungraded). The rework-1
  capture vs the flags-off build differ by only **2.4 / 255**.
- WebGL (`postfx/webgl-before-after-nopost.jpg`, Chrome 1920 × 1080, vote 12): post on vs `?mfNoPost` differ by
  **9.3 / 255**. The mean RGB of the sky strip between the panels is (43.6, 52.6, 69.9) with post and (62.1, 68.4, 82.5)
  without, so grading, tonemapping and vignette run in the WebGL player.
- WebGL frame rate with post on: see section 3 (59.9 fps vsync, 93–159 fps uncapped).

**Correction to the rework-1 README:** it said every player capture ran *without* post-processing. The control above
shows that is not what happened: the rework-1 captures were already graded (2.4 / 255 from the post-on build, 24.9 / 255
from the no-post control). The Panini warning was printed, but grading still ran. The flag change removes the warning
and keeps every post shader in the build either way.

**Still logged in WebGL (not fixed, outside T034):** *"Shader 'Hidden/Universal Render Pipeline/Edge Adaptive Spatial
Upsampling' is not supported or has been stripped from the build (in 'Blit FSR Upscaling'). PostProcessing render
passes will not execute."* It is captured in `postProcessingStripWarnings` of every `webgl-fps-*.json`. The FSR
upscaling shader is not supported on WebGL. The no-post control shows that the grade is applied anyway. Whether any
single effect (for example bloom) is skipped on WebGL was not checked effect by effect.

## 1. What changed in rework 2 (issue #147 list, in order)

### Hero art (M1, M3, M6, M10)
- **Open-legged table over a lit exhaust opening** (`Source/build_hero_pad.py`, `hero_launch_mount`): the closed
  concrete plinth is gone. Under the table: splayed corner legs, new mid legs on the camera and far faces with portal
  struts, an exhaust pit with a concrete kerb, a sloped steel flame deflector with ribs that turns the plume toward the
  trench (+X), heat-stained throat plates, warm glow strips on the kerb and at the trench mouth, eight lamps on the table
  soffit and four pit floodlights. T017's `world_flame_trench` is no longer placed: with the plinth gone it stood under
  the table as a solid 8 m block.
- **Umbilical arm ends**: new `hero_umbilical_truss` (stretches with the arm: white chords, teal diagonals, walkway,
  rail, hose trays) and `hero_umbilical_end` (hinge yoke and pin, swing frame, curved connector plate with five
  couplers, bumper strip, three sagging hose loops, work lamp). The end plate never stretches: `Stage/BayArmEnd.cs`
  keeps it at the arm tip at true size (unit-tested). The T015 arm meshes and their end cube are hidden.
- **Bevels**: two tiers. Every box whose smallest side is ≥ 0.5 m gets a **12 cm**, 3-segment, weight-limited bevel.
  Thinner members (rails, braces, treads) get 2 cm. The meshes are triangulated in Blender with the custom normals
  kept, because Unity was discarding about 300 bevel n-gons as "self-intersecting".
- **Far hall**: new `hero_far_hall` (60 × 34 × 42 m main bay: white pilasters every 4 m, floor bands, a two-leaf
  full-height door with a lit seam and lintel, lit window bands, a stepped roof with parapet and rooftop plant, a mast,
  aviation lights, and a low annex with three loading doors and lamps). It stands 430 m out along the view, on land. T017's
  plain assembly box stood about 750 m out, in the sea band. The equatorial hall box was removed with it.

### Materials and light (M2, M7, M8)
- **One colour atlas for the hero pieces** (`Source/hero_atlas.py` → `Textures/Hero_atlas_{albedo,mask,emission}.png`,
  material `LP_hero_atlas`). Each painted or metal face points its UVs at a 16 px swatch. The atlas also carries
  metallic and smoothness, plus emission for the lamps, aviation lights, pit glow and hall windows.
- **Cryo foil** (`hero_core` swatch): #9C8358, metallic 0.45, smoothness 0.30, no emission (it was #C8923F, metallic 0.85,
  smoothness 0.60). It now reads as matte, crinkled foil.
- **Sun rim on the steel**: `hero_white` metallic 0.50, smoothness 0.62, with the 12 cm bevels catching the low sun.
- **Lamp reflections in the wet patches**: each floodlight has a warm additive streak from the pole foot toward the camera,
  2.4 m × 18 m, lying on its own wet patch (`LP_lamp_reflection`). All streaks merge into one mesh.
- **Steam**: warmer and denser. Material (1.25, 1.05, 0.86), start colour (1, 0.88, 0.72, α 0.55) (was α 0.34),
  20 puffs/s (was 12), puffs 1.4–2.6 m.
- **Corner sky toward navy**: the framing card (`Textures/Frame_grade.png`, `Source/make_bay_masks.py`) now has slate
  edges and corners (#2A323E, up to α 0.92) and a dusky top band (#2E485E, up to α 0.6). The bay volume
  (`MF_Volume_BayFrame.asset`, bay only; the T031 profiles are not edited) also overrides split-toning shadows to
  (0.50, 0.50, 0.55) and lift to neutral. T031's blue shadow tint and lift had driven the red channel of the dark upper
  sky to 0. Measured (40 px medians at 1920 × 1080, `after/beauty-no-ui`):

  | Point | Rework 1 | Rework 2 | Frame 02 |
  |---|---|---|---|
  | top-left corner | #001645 | #06142E | #092034 |
  | top-right corner | #001B4B | #071731 | #0B2438 |
  | top centre | #1F68B2 | #3B4E7C | #174669 |
  | mid left edge | #3E3B40 | #2B2127 | #0A243A |
  | mid right edge | #453C3E | #2D2126 | #0D263C |
  | share of the top 200 rows with red ≤ 3 | 59 % | 4 % | 0 % |

  The mid edges are darker but still a warm, dark mauve, not navy. The frame as a whole is warmer than frame 02.
  The side card shifts to a deeper navy (#0C2038) below the top corners. Even so, the grade turns it mauve over the
  warm haze.
- **Hard sea horizon**: a second, low and dense haze card (1.25 km arc, −8 to 34 m) sits just past the shore.

### Framing (U7, U11, M10)
- **Votes 3 and 5 (choices made, no modelled part yet):** a *pad shot*. The frame starts at the deck and spans 24 m,
  with the eye 2.5 m above the table top. The first independent review of this run caught the vote ghost hidden behind
  the table rail from a lower eye, so the eye was raised. The open table, the lit pit, the stairs and a translucent payload stand-in (`Stage/BayStage.StandIn.cs`: adapter ring,
  dispenser, bus and folded arrays in the ghost material, scale 1.6) fill the free column. The stand-in hides while a
  ghost or an assembly shows the real part, and in the tool views.
- **Small parts:** the minimum framed height is now 5 m (was 12 m). The minimum framed half width is 3.5 m (was 8 m),
  which had made every short stack width-bound, with the camera about 2.3 × too far. The camera eye now stays at least
  2.5 m above the table top in every shot (`BayStage.EyeFracFor`, unit-tested). Before this, short
  stacks were filmed from under the table top. Bug found: `VehicleRig.LengthM` is 0 for a single part, so the framing
  now falls back to the rendered height. Result: the landed small fairing fills about 30 % of the screen height
  (`motion/landing-normal-motion-contact.jpg`, from t = 3.2 s). The framing state is logged every 30 frames in
  `render-stats.txt` (`[seq] Evidence sequence …`).
- **Exploded tags:** tags on the same side are pushed apart by at least their height plus 4 px
  (`BuildBayScreen.SpreadTops`, unit-tested). "Payload" and "Upper stage tanks" no longer overprint
  (`after/exploded-*`). Tag layout and styles are otherwise unchanged.

### Fixes after the first independent review of this run
- The pad-shot eye was raised above the table top (the vote-5 ghost had been hidden behind the rail).
- Lamp reflection streaks are now 1.5 m × at most 11 m, dimmer, and cut short so they end 3 m inside the apron edge
  (two had run off it).
- The flame deflector lost its cross ribs (it read as a staircase); edge rails only.
- The soot swatch is lighter (#5A4C42; the pit wall was crushed to black).
- The table soffit got girders both ways every 2.75 m (it was one flat surface).
- The framing card's sides shift to deeper navy below the top corners.

### Technical (M9)
- Two material slots per hero piece (atlas + box-UV concrete) instead of up to eleven.
- The paint, soot, wet, reflection and floodlight cone and glow decals are merged into one mesh per material.
- Crew figures, lamp poles, extra flood towers and lightning masts no longer cast shadows. Shadow casters at vote 10
  went from 145 submeshes (an interim rework-2 build, before this step) to 88 (`render-stats.txt`, "Shadow casters").
- High shadow distance is 200 m (was 320 m). The camera stands 60–130 m from the pad.
- The render counters are now the median of the last 30 frames, with min and max (`Evidence/BuildBayEvidence.cs`).

## 2. Render budget (M9), from `render-stats.txt`

"All passes" is Unity's `Draw Calls Count` for the whole frame: four desktop shadow cascades, the SSAO depth-normals
prepass, opaque, transparent and UI. The table gives the **single-render frame** (the min over up to 30 frames). Some
frames read exactly double (max = 2 × min, with SetPass also doubled, about 110 against 55). That looks like the whole
frame rendering twice on some frames. The cause was not found. The median equals the min except where only 1–3 frames
were sampled.

| Capture | Main view: triangles / draws | All passes: draw calls (single frame), rework 1 → rework 2 | All-pass triangles |
|---|---|---|---|
| vote 3 / vote 5 (pad shot, UI) | 149 762 / 111 | 529 → **327** (no UI: 273) | 0.61 M |
| vote 5, vote in progress | 156 790 / 120 | 550 → **345** | 0.61 M |
| vote 6 (fairing, UI) | 179 492 / 94 | 657 → **305** (no UI: 255) | 0.65 M |
| vote 8 (UI) | 255 257 / 125 | 803 → **379** | 0.84 M |
| vote 10 idle (UI) | 295 693 / 186 | 1 132 → **553** | 0.97 M |
| vote 10 beauty (no UI) | 295 693 / 186 | 1 087 → **500** | 0.95 M |
| complete vehicle | 387 002 / 233 | 1 313 → **574** | 1.05 M |
| exploded | 323 367 / 202 | 1 239 → **588** | 0.91 M |
| scale reference | 327 887 / 230 | 1 072 → **521** | 0.66 M |
| assembly (crane, sparks) | 160 466 / 100 | 722 → **377** | 0.62 M |
| compare (two vehicles) | 498 336 / 318 | 1 453 → **792** | 0.94 M |

Every single-vehicle state in the table is at or under 600 all-pass draw calls (the highest is 588). **Exception:**
the `[late] 02-beauty-no-ui` row in `render-stats.txt` (vote 8, no UI) reads 658 from a single sample, with a normal
SetPass of 51. The independent reviewer pointed out that this is not the doubled-frame case. So it counts as a real
658-draw frame over the 600 budget. The previous run read 329 for the same state, and the difference is not
explained. The compare view, with two
complete vehicles, is 792. The vehicle parts are T032/T033 models with several material slots each, and T034 does not
own them. All-pass triangles are 1.05 M at most, under the 1.8 M budget.

## 3. WebGL rebuild and frame rate (step 7)

Build: `Unity -batchmode -quit -buildTarget WebGL -executeMethod MissionForge.Screens.BuildBay.Editor.BuildBayBuilds.WebGL`
(Library/PlayerDataCache cleared first), from the final state, after the last code change. Output: git-ignored
`unity/MissionForge/Builds/BayWebGL/`, 62.5 MiB, 0 errors. Served with `python3 -m http.server 8971`. Measured with
`measure-webgl-fps.mjs` (desktop Chrome through Playwright, 1920 × 1080, DPR 1). "uncapped" turns vsync and the
frame-rate limit off.

| Run | URL flags | Mode | Median fps | During assembly: median, p95 / worst frame | File |
|---|---|---|---|---|---|
| High, six live assemblies | `?mfBayVotes=4&mfRehearsalPace=0.5`, 80 s | vsync | **59.9** | 59.9, 17.6 / 17.7 ms | `webgl-fps-high.json` |
| High, six live assemblies | same | uncapped | **92.6** | 95.2, 12.7 / 31.2 ms | `webgl-fps-high-uncapped.json` |
| High, late stack (votes 12 → 18) | `?mfBayVotes=12&mfRehearsalPace=0.5`, 60 s | uncapped | **114.9** | no assembly window logged | `webgl-fps-high-late-uncapped.json` |
| Low, late stack | `…&mfBayQuality=low`, 60 s | uncapped | **158.7** | no assembly window logged | `webgl-fps-low-late-uncapped.json` |

- All four runs end in the Build Bay. `webgl-chrome-1920x1080.jpg` is the last frame of the High late-stack run,
  vote 18.
- The 45 fps floor holds with about 2 × headroom on High on this M4 (worst assembly frame 31 ms uncapped).
- Uncapped figures are a little below rework 1 (110 / 161 / 189 fps). A second Unity editor was running on the
  machine during all runs. In an earlier set of runs in this session the figures were 86 / 98 / 119 fps, so the
  numbers vary from run to run. Causes were not isolated.
- A mid-range laptop was not available, so that figure is **not measured**.
- Console errors: one favicon 404, plus the FSR warning above.

## 4. How the captures were made

`capture_bay.sh <repo> <out> [sets]` runs the player with the T015/T031 seeds. Rework 2: a set is retried up to twice
if a shot is not 1920 × 1080 (the window was once resized to 3420 × 2146 mid-run). `compose.py <evidence> - <out>
<frame02>` writes `after/`, the pairs and the composites. `make_motion.sh <frames> <out>` (set `PYTHON` to a Python with
Pillow) encodes a landing to MP4 at real speed, with a 16-tile contact sheet. Sets: `full` (`-mfBayVotes 9`), `vote`
(`-mfBayVotes 4 -mfRehearsalPace 0.6`), `early` (`2`), `sat` (`4`), `mid` (`5`), `late` (`7`), `rm` (`9`,
reduced motion), `seq` / `seqrm` (13 s from the start of a crane descent).

Rebuilding the art: `Blender -b --factory-startup --python Source/build_hero_pad.py` (it fails loudly on NaN or
far-out bevel vertices), `python Source/make_bay_masks.py`, then
`Unity -batchmode -executeMethod MissionForge.Screens.BuildBay.Editor.BayDressingBuilder.Run`.

## 5. Tests

`editmode-results.xml`: **354 / 354 passed** (EditMode, final state). New: `Tests/BayReworkTwoTests.cs` (14 cases: tag
spreading, arm-end compensation and placement, small-fairing share at the minimum framing, eye height above the table,
pad-shot height).
