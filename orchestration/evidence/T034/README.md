# T034 evidence: Build Bay environment and camera beauty pass

Date 2026-11-15. Machine: Apple M4 MacBook (integrated GPU, built-in Retina display at 60 Hz), macOS 26.6,
Unity 6000.6.9f1. All captures are 1920 × 1080 from the macOS evidence player
(`MissionForge ▸ Build Bay ▸ Build macOS Evidence Player`, `-buildTarget OSXUniversal`, MF_REHEARSAL).

## How the captures were made

`capture_bay.sh <repo> <out>` runs the player with the T015/T031 seeds:

| Set | Flags | Shots |
|---|---|---|
| `full` | `-mfBayVotes 9` | idle with UI, beauty without UI, compare, exploded, scale reference, complete-vehicle beauty |
| `vote` | `-mfBayVotes 4 -mfRehearsalPace 0.6` | vote in progress, assembly (crane, sparks, work light) |
| `early` | `-mfBayVotes 2` | vote 3 of 22: nothing stacked yet (empty-pad framing) |
| `mid` | `-mfBayVotes 5` | vote 6 of 22: payload on the pad |
| `late` | `-mfBayVotes 7` | vote 8 of 22: stack growing |
| `rm` | `-mfBayVotes 9 -mfReducedMotion` | reduced motion |

`compose.py <evidence> <before> <after> <frame02>` copies the captures into `before/` and `after/` and writes the
composites (single captures are stored as JPEG q90 to keep the repository light; composites are PNG). **Before** = this branch's base (`bb8faa3d`, T031 merged) built and captured with the same script and
seeds before any T034 change. **After** = the final T034 build.

| File | What |
|---|---|
| `pairs/*-before-after.png` | before (left) and after (right) for idle with UI, beauty, complete vehicle, assembly, compare, exploded, scale |
| `complete-beauty-vs-frame02.png` | complete-vehicle beauty shot next to reference frame 02 |
| `buildbay-ui-vs-frame02.png` | the Build Bay with its UI next to frame 02 |
| `assembly-stages-ui.png` | three assembly stages with the UI on (vote 3, vote 6, vote 8 of 22); vote 10 is `after/idle-ui-*` |
| `after/reduced-motion-ui-1920x1080.jpg` | reduced motion (same framing; no orbit, punch-in, steam or work light) |
| `RUBRIC.md` | VISUAL_TARGET 3D rubric, scored by an independent reviewer subagent |
| `webgl-fps*.json`, `webgl-chrome-1920x1080.jpg` | WebGL frame-rate measurement (see below) |
| `editmode-results.xml` | final EditMode run: 339 / 339 passed |

## Vehicle framing (step 5), measured

`BayFraming.Solve` (unit-tested, `Screens/BuildBay/Tests/BayFramingTests.cs`) puts the stack between 200 px and
760 px of 1080 (52 % of the screen height; the bottom clears the timeline panel at about 798 px), centred at x = 960 px in the free column between the side panels
(512–1408 px). Before, the complete vehicle filled about 23 % of the height (T031 RUBRIC U11).
The compare view uses 300–525 px so both candidates sit between the contract card and T015's stat table; the scale view (200–690 px) centres between the
vehicle and the Saturn V outline and keeps the 1.75 m person above the timeline; the exploded view frames the fully exploded stack; an empty pad frames 42 m
(mount, tower, crane hook); stacks shorter than 12 m are framed as 12 m. All numbers are `game_value` layout choices.

Motion (not visible in stills): a ±7° idle orbit with a 70 s period, a dolly as the stack grows (rate 2 /s),
an ease-out while the crane lowers a top part (headroom 0.7 × 22 m lift) and a punch-in to 84 % distance for
0.45 s in, 0.7 s hold and 1.6 s out when a part lands. Reduced motion: none of these, every reframe is a cut.

## WebGL frame rate (step 7)

Build: `Unity -batchmode -quit -buildTarget WebGL -executeMethod MissionForge.Screens.BuildBay.Editor.BuildBayBuilds.WebGL`
(Library/PlayerDataCache cleared first, as T031 requires) → git-ignored `unity/MissionForge/Builds/BayWebGL/`, 58.2 MiB,
served with `python3 -m http.server 8971`, measured with `measure-webgl-fps.mjs` (T015/T031 method: desktop Chrome
through Playwright, viewport 1920 × 1080, DPR 1). Machine as above (Apple M4 MacBook, integrated GPU, 60 Hz display).

| Run | URL flags | Median fps | p95 / worst frame during assembly | File |
|---|---|---|---|---|
| High (default), six live assemblies | `?mfBayVotes=4&mfRehearsalPace=0.5`, 80 s | **59.9** (overall and during assembly) | 17.6 / 17.7 ms | `webgl-fps-high.json` |
| High, near-complete vehicle (Build Bay full) | `?mfBayVotes=18&mfRehearsalPace=0.5`, 70 s | **59.9** | no assembly in the window | `webgl-fps-high-full.json` |
| Low quality | `…&mfBayQuality=low`, 70 s | **59.9** | no assembly in the window | `webgl-fps-low-full.json` |

- Passes the 45 fps floor (target 60). 60 fps is the display's vsync cap, so headroom was not measured.
- The machine is an Apple M4 laptop, faster than a typical "mid-range laptop"; a slower GPU was not available. The
  **Low** tier (`-mfBayQuality low`, `?mfBayQuality=low`, or the **Q** key) is the fallback: 85 % render scale,
  160 m shadow distance, and no floodlight cones, glows, soot, steam or distant silhouettes.
- These numbers come from the WebGL build made before the last framing/grade tweaks (band 200–760 px, the bay
  vignette/saturation override, lighter mount concrete). Those tweaks add no passes, lights or geometry; the WebGL
  build was **not** re-measured after them.
- Console errors: one favicon 404 and the room client's reconnects to `ws://localhost:8787` (no room server running).
- Triangle and draw-call counts were not measured.
