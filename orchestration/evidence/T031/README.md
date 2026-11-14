# T031 evidence: host UI revamp, design system and rendering foundation

All captures are 1920 × 1080 unless stated. Date 2026-11-14. Machine: Apple M4 MacBook (integrated GPU,
built-in Retina display at 60 Hz), macOS 26.6.2, Unity 6000.6.9f1, Google Chrome 157.0.8103.51.

## How the captures were made

| Set | Player | Command |
|---|---|---|
| Title, Lobby (`after/`, `accessibility/title-*`, `accessibility/lobby-*`) | macOS look-dev player (`MissionForge ▸ Build ▸ MacLookDev`, git-ignored `Logs/lookdev/`) | `-screen-fullscreen 0 -screen-width 1920 -screen-height 1080 -window-mode windowed -mfShot <png> -mfPhase Title|Lobby [-mfCreateRoom] -mfWait 6` plus `-mfHighContrast`, `-mfReducedMotion` or `-mfText200 -mfRtl`. The Lobby runs against the project's stub room server (`unity/MissionForge/Tools~/stub-server/server.mjs --host 127.0.0.1 --bots 5`, `ws://localhost:8787`): the room code and the five crew members (bots) arrive over the real room protocol. |
| Build Bay (`after/buildbay-*`, `buildbay_vote_in_progress.png`, `accessibility/buildbay-*`) | `BuildBayBuilds.MacEvidence` (MF_REHEARSAL) | `-mfBayShots <dir> -mfBayOnly <states>` with the T015 seeds: `-mfBayVotes 9` (idle, beauty, complete vehicle), `-mfBayVotes 4 -mfRehearsalPace 0.6` (vote in progress, assembly). |
| Specimen | `SpecimenSceneBuilder.BuildPlayer` (development build of `Scenes/Dev/MF_DesignSystem.unity`) | `-mfShot design-system-specimen-1920x1080.png` |
| Side by side, downscale | `compose.py` (Pillow) | capture on the left, reference frame on the right, each scaled to 936 × 526 on a 1920 × 1080 canvas; the downscale test is the Build Bay capture at 640 × 360 shown 1:1. |

`capture.sh`, `capture_bay.sh` and `compose.py` in this folder reproduce the set (paths are arguments).

The "before" set was captured at commit bf9709da (T015 merged, this branch's base) with the same players and flags.

## WebGL frame rate (step 11)

Build: `MissionForge ▸ Build Bay ▸ Build WebGL` → git-ignored `unity/MissionForge/Builds/BayWebGL/` (Web quality
tier, Mobile_RPAsset: HDR, MSAA 4×, SSAO, MfBlurredSceneFeature), served on `localhost:8971`, measured with
`measure-webgl-fps.mjs` (the T015 method: desktop Chrome through Playwright, viewport 1920 × 1080, DPR 1, 80 s,
`?mfBayVotes=4&mfRehearsalPace=0.5` so six assembly animations run during the window).

| Run | URL flags | Median fps during assembly | p95 frame | Worst frame | Median fps overall | File |
|---|---|---|---|---|---|---|
| Post-processing and glass **on** | (none) | **59.9** | 18.4 ms | 18.7 ms | 59.9 | `webgl-fps-post-glass-on.json` |
| Post-processing and glass **off** | `&mfNoPost&mfNoGlass` | **59.9** | 17.6 ms | 17.7 ms | 59.9 | `webgl-fps-post-glass-off.json` |

- Both runs pass the VISUAL_TARGET 2.3 target (60 fps; failure line 45 fps).
- The off switches (`MissionForge.Rendering.MfRenderToggles`) were confirmed active in the WebGL build by its console
  line `[MissionForge] Render toggles: post off, glass off`.
- 60 fps is the display's vsync cap, so headroom was not measured.
- **Blur cost:** not isolated. The two runs differ by 0.8 ms at p95 for post and glass together, which is
  consistent with the ≤ 1.5 ms budget at 1080p but is not a GPU timing of the blur pass alone (WebGL exposes no
  per-pass GPU timer here and both runs sit at the vsync cap). Treat the blur budget as **not verified**.
- Console errors in both runs: one favicon 404 only.

## Other files

- `contrast.md`: WCAG contrast table over the worst backgrounds (every row passes).
- `RUBRIC.md`: VISUAL_TARGET rubric U1–U11 and M8, scored by an independent reviewer subagent.
- `before/`, `after/`, `accessibility/`: the captures listed above.
