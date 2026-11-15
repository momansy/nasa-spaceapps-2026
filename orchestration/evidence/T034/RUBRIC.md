# T034 rubric: Build Bay environment and camera beauty pass (rework 2, issue #147)

- **Reviewer:** independent subagent. It did not build this scene. Scores come from the images, pixels and code, not from the builder's claims.
- **Date:** 2026-11-15, rework 2, **final captures** (second review of this run; EditMode results 354 / 354, run 05:01Z).
- **Bar:** `orchestration/VISUAL_TARGET.md` section 6. A 4 means shippable: it holds up side by side with `assets/media/style/frames/02-build-bay.png`, and an outsider would not pick out the difference in quality. Nothing ships below 4. Sections 1 (reference look) and 2.5 (lighting and render) were the checklists.
- **Scope exceptions:**
  - The vehicle models (paint, decals, engine bells, frost, vehicle surface detail) belong to T032/T033. M4 and M5 are scored for the record only. M2, M3 and M7 score the environment and assembly part; the vehicle part is noted.
  - Post-processing: this run turned off URP post-processing stripping in builds (README section 0). `postfx/macos-strip-change-and-nopost-control.jpg` shows grading, tonemapping and vignette running in the player. No score below leans on missing post. See "T031 exceptions".
- **Method:**
  - Looked at the regenerated `after/` captures at full size, the `pairs/*-round2-vs-rework2.jpg` and `complete-beauty-vs-frame02.png`.
  - Zoomed crops (2–4×): under the table at votes 6 and 10, the lamp pools, the arm end, the vote-5 ghost, the exploded tags.
  - Extracted frames from the new `motion/landing-normal-motion.mp4` (t = 0.5, 2.5, 3.2, 4.5, 7, 10, 12.5 s) and `landing-reduced-motion.mp4` (0.5, 4.5, 12.5 s) with ffmpeg, and measured the landed fairing with a pixel ruler.
  - Pixel work (`/tmp/t034/venv/bin/python`, numpy): 40 × 40 medians at the corners, mid edges, top and bottom centre, plus an edge profile at y = 200–900, against frame 02 resized to 1920 × 1080; red ≤ 3 share in the top 200 and bottom 200 rows; clipped whites (all ≥ 250) and near-black (all ≤ 12) with 60 px cluster location; magenta (R, B > 200, G < 80); vehicle nose and base rows with a ruler overlay.
  - Read: `README.md`, `render-stats.txt`, `webgl-fps-*.json`, `editmode-results.xml`, `BayStage.Framing.cs`, `BayStage.StandIn.cs`, `build_hero_pad.py`.

| Item | Score (1-5) | One-line reason | Evidence file(s) |
|---|---|---|---|
| M1 Silhouette and proportion | 3 | **Better:** an open table on splayed teal legs, with girders under the deck where the flat salmon pyramid used to be; the deflector no longer reads as stairs; a detailed hall on land; balconies alternate on the tower; the vehicle holds 46–49 % at votes 6–10. **Still short:** the deflector is now a plain brown wedge with a dark side face (840–1090, 820–930 in `beauty-no-ui`). The apron is a bare hexagon slab. Two bare lattice masts stand where frame 02 has cranes. The bottom quarter of the complete shot is empty dark ground. Vehicle shape: T032/T033. | `after/complete-vehicle-beauty-*`, `after/beauty-no-ui-*`, `after/stage1-early-no-ui-*`, `complete-beauty-vs-frame02.png` |
| M2 Material response | 3 | **Fixed:** sun rim on the white tower columns; matte bronze cryo pipe; the lamp streaks no longer run off the apron (the pools now stop inside the slab). **Open:** the pools are plain light falloff on dry concrete. No lamp head is mirrored and nothing reads wet, so frame 02's wet-reflection cue is still missing. The deflector and pit are flat swatch colour. Vehicle paint: T032/T033. | `after/beauty-no-ui-*`, `after/stage1-early-no-ui-*` |
| M3 Surface detail | 3 | **New:** soffit girders, umbilical trusses with walkways, hose loops, the hall facade, platform lamps, the pit kerb. **Still bare:** the arm-end plate still reads as a plain grey box with one dark dot (850–890, 245–310 in `stage2-mid-no-ui`); the couplers do not read. The deflector, pit walls and slab side face have no joints or plates that read. Vehicle detail: T032/T033. | `after/stage2-mid-no-ui-*`, `after/beauty-no-ui-*`, `motion/landing-normal-motion.mp4` |
| M4 Markings | 3 (T032/T033 exception) | Apron paint is sparse, generic, logo-free and has no z-fighting. The vehicle shows navy bands, no teal strakes. For the record only. | `after/beauty-no-ui-*` |
| M5 Engine fidelity | 2 (T032/T033 exception) | Bells are hidden at the hero framing. At vote 8 the upper-stage engine shows only as dark legs under the fairing (900–1010, 660–705). For the record only. | `after/stage3-late-no-ui-*` |
| M6 Edges and normals | 4 | 12 cm, 3-segment, weight-limited bevels on big forms and 2 cm on thin members (`build_hero_pad.py:53-54`), triangulated with weighted normals kept. The teal legs, girders and tower columns show a clean bright edge line in every close shot. No smoothing gradients, acne or faceting seen. | `after/beauty-no-ui-*`, `after/stage2-mid-no-ui-*`, `after/stage1-early-no-ui-*` |
| M7 Wear and frost | 3 | **Good:** a warm, backlit, continuous steam column from the arm (870–1000, 40–520 in `beauty-no-ui`). The pit wall is no longer crushed. **Open:** no soot or heat staining reads at the deflector, throat or trench mouth: the lighter soot swatch just reads as clean brown paint. Frost: T032/T033. | `after/beauty-no-ui-*`, `after/complete-vehicle-beauty-*` |
| M8 Lighting and render | 3 | **Fixed:** top corners navy (#06142D–#071831 against #082034–#0B2337). Top-200 red ≤ 3 is 0.0–7.6 % (frame 02: 0.1 %). The pit is no longer crushed (vote-6 near-black 20,831 → 6,400 px, now mostly in the tower core). The pad-shot sides are navy (#0D101F). **Open:** at votes 8–10 the mid edges are still warm mauve (#281E26–#2A1F25 at y = 540 against #0A243A). The new deeper bottom corners crush to #000519–#010619 (frame 02 #061F33), and bottom-200 red ≤ 3 is 7.5–20 % against 0.2 %. The wave band still repeats (y 705–730), the glint is still a short strip (1490–1520, 700–725), and the sky has no clouds. Clipped whites are 456–1,146 px against 160 (sun disk and a flat white glow panel at about 600, 840). | `after/beauty-no-ui-*`, `after/complete-vehicle-beauty-*`, `after/stage2-mid-no-ui-*`, frame 02 |
| M9 Technical | 3 | **Done:** single-frame all-pass draw calls 255–588 for most single-vehicle states. All-pass triangles ≤ 1.05 M. WebGL ≥ 45 fps with headroom. EditMode 354/354. 0 magenta. **Open:** compare is 792, over 600. `[late] 02-beauty-no-ui` (vote 8, no UI) reads 658 with SetPass 51. The README calls this a doubled frame, but a doubled frame shows SetPass ≈ 102–110, so 658 is unexplained and may be real. The frames that render twice are still unexplained. `[sat] 01-idle` logs drawCalls = 0. There is no mid-range laptop figure. | `render-stats.txt`, `README.md`, `webgl-fps-*.json`, `editmode-results.xml` |
| M10 Reference match | 3 | Side by side it reads as the same place, with an open girder table, a real hall and navy upper corners. An outsider still sees the gap at once: a hot, saturated, cloudless sky with a big sun bloom; bare masts in place of cranes; a smaller vehicle on a big hexagon slab; a dark, dry bottom quarter with no wet shine; warm mauve mid edges. | `complete-beauty-vs-frame02.png`, `pairs/complete-vehicle-beauty-round2-vs-rework2.jpg` |
| U7 Motion (camera and assembly only) | 3 | **Fixed:** the vote-5 ghost is visible on the table again (478–525, ≈ 4.4 % of the height). The pad shot now looks down on the deck, not the underside. The work light no longer blows out. Reduced motion cuts and fades correctly. **Open:** the ghost is small (rework 1: ≈ 9 %). The landing clip is unchanged: the landed fairing holds ≈ 28 % (t = 4.5 s), the lower 38 % is railing and dark deck wall, and the ring lip hides the fairing base. The stand-in still reads as a glass box. | `after/vote-in-progress-*`, `after/stage1-early-*`, `motion/*.mp4`, `motion/*-contact.jpg` |
| U11 Reference match (Build Bay with UI) | 3 | **Fixed:** the tag overprint ("Payload" 558–592, "Upper stage tanks" 600–632) and the hidden vote ghost. The vehicle sits in the free column at votes 6–10. **Open:** at votes 3–5 the free column is the table, a small stand-in or ghost and the deck. The scene under the panels shares the M8 and M10 gaps. The compare header run-together is a T031 UI issue. | `after/exploded-*`, `after/vote-in-progress-*`, `after/stage1-early-ui-*`, `buildbay-ui-vs-frame02.png` |

## Changes since the first review of this run

- **No score moved.** Each builder change was checked against the new pixels:
  - Pad-shot eye above the table: **confirmed.** The vote-5 ghost is visible (≈ 4.4 %, was ≈ 2 %). This removes the U7/U11 regression, but the free column is still sparse, so U7 and U11 stay at 3.
  - Lamp streaks: **confirmed** shorter and inside the apron. No more floating light. But they still do not read as wet reflections, so M2 stays at 3.
  - Deflector ribs removed: **confirmed.** It no longer reads as stairs, but it now reads as a plain wedge. M1 stays at 3.
  - Lighter soot: **confirmed.** The pit is not crushed (vote 6 near-black 20,831 → 6,400). But no staining reads, so M7 stays at 3.
  - Soffit girders: **confirmed.** The flat salmon pyramid is gone. This helps M1 and M3, but not enough to reach 4 on its own.
  - Deeper navy sides: **partly.** The pad-shot sides are navy, but the vote 8–10 mid edges are still warm mauve (#281E26), and the bottom corners now crush to red = 0. M8 stays at 3.
- **New finding:** the vote-8 no-UI 658 draw-call reading has a normal SetPass (51), which contradicts the README's doubled-frame explanation.

## Below 4

Every item except M6 is below 4. Fixes are ranked by effect.

**M1 Silhouette and proportion (3)**
1. Give the deflector a curved chute shape with side walls and steel plating (now a flat brown wedge, 840–1090, 820–930 in `beauty-no-ui`).
2. Replace one or both bare masts with a crane, or add the lit service buildings and tanks frame 02 has beside the pad.
3. Pull in or raise the complete-vehicle camera so the bottom quarter (y 960–1080) is not flat dark ground.

**M2 Material response (3)**
1. Make the pools read wet: darker, glossier patches with a broken vertical streak and a brighter lamp-head blob near each pole foot (frame 02 1180–1880, 1060–1150 at 2048 wide).
2. Give the deflector and pit roughness breakup and a plate normal.

**M3 Surface detail (3)**
1. Arm-end plate: make the curved plate, couplers and bumper read at vote 6–8 distance (850–890, 245–310).
2. Add joints and anchor plates to the slab side face and the pit walls.

**M4 Markings (3), T032/T033 exception**
- Vehicle teal strakes and stage markings (T032/T033).

**M5 Engine fidelity (2), T032/T033 exception**
- T033 engines.

**M7 Wear and frost (3)**
1. Add visible heat staining (dark-to-straw gradient) on the deflector face and the trench mouth.
2. Frost: T032/T033.

**M8 Lighting and render (3)**
1. Mid edges at votes 8–10: take the framing card to navy over the full side height (now #281E26 at (20, 540); target about #0A243A).
2. Bottom corners: lift them to about #061F33. Now #000519, with red ≤ 3 on 7.5–20 % of the bottom 200 rows.
3. Sea: remove the repeating wave band (y 705–730) and stretch the glint into a column from the sun to the shore.
4. Sky: a few low clouds lit from below; desaturate the top centre toward #144164.
5. Cap the tower-base glow panel below clipping (about 600, 840 in `beauty-no-ui`).

**M9 Technical (3)**
1. Bring the compare view under 600, or get the two-vehicle budget agreed in writing.
2. Re-sample vote 8 no-UI over 30 frames. 658 with SetPass 51 is not proven to be a doubled frame.
3. Find the cause of the doubled frames, and fix the drawCalls = 0 sample.
4. Measure on a mid-range laptop or a throttled GPU profile.

**M10 Reference match (3)**
- In order: the mid edges, bottom corners and sky (M8), wet foreground reflections (M2), cranes in place of bare masts (M1).

**U7 Motion, camera and assembly (3)**
1. Landing: raise the frame so the rail does not fill the lower 38 %, and show the fairing base above the ring lip.
2. Vote ghost: frame it larger (rework 1 was ≈ 9 %; now ≈ 4.4 %).
3. Stand-in: give it a clearer payload read than a glass box.

**U11 Reference match, Build Bay with UI (3)**
- Apply the U7 ghost and stand-in fixes. The rest follows M8 and M10.

## Checks

**Vehicle at 45–60 % of the screen height in the free column (512–1408 px)**

| Capture | Stage | Nose–base (px of 1080) | Share | Result |
|---|---|---|---|---|
| `after/stage1-early-*`, `after/vote5-short-stack-*` | votes 3 and 5, no modelled part | stand-in 350–525 | ≈ 16 % (stand-in) | Pad shot; no vehicle |
| `after/vote-in-progress-*` | vote 5, voting, ghost fairing | 478–525 | ≈ 4.4 % | Visible; small |
| `after/stage2-mid-*` | vote 6 | 200–700 | 46 % | Pass |
| `after/stage3-late-*` | vote 8 | 200–705 | 47 % | Pass |
| `after/beauty-no-ui-*` | vote 10 | 200–725 | 49 % | Pass |
| `after/idle-ui-*` | vote 10 | 200–728 | 49 % | Pass |
| `after/complete-vehicle-beauty-*` | full stack | 200–732 | 49 % | Pass |
| `motion/landing-normal-motion.mp4`, t = 4.5 s | landed small fairing | ≈ 28 % of 720 visible | ≈ 28 % | Below the band; unchanged |

- Horizontal centring is good: the axis is at x ≈ 955–965.

**Black void**
- No void. Near-black px: 19–694 in the wide shots and pad shot (frame 02 has 640); 5,081–6,400 at votes 8 and 6, now mostly the dark tower core (540–720, 300–600) and the engine shadow at vote 8, not the pit.
- Bottom corners #000519–#010619 (red = 0). They are not ≤ 12 in all channels, but they sit below frame 02's #061F33 and read crushed.

**Magenta or missing shaders**
- 0 magenta px in all 17 `after/` captures.

**Clipped whites**
- 58–1,146 px per capture (frame 02 has 160): the sun disk (1080–1200, 360–480), lamp heads, and a flat white glow panel on the tower-base building (about 600, 840). None on the vehicle shells.

**Z-fighting, floating objects, seams**
- No z-fighting seen.
- Lamp pools now stop inside the apron. No floating light.
- Hoses at landing end against the fairing side; they read as touching, not penetrating.
- Seams: the repeating wave band at y 705–730.

**UI regressions against round 2**
- Fixed: the exploded tag overprint. The vote ghost is no longer hidden.
- No new overlap seen. The compare header "Kerolox WorkhorseHydrolox High-Efficiency" run-together is unchanged (T031 UI).

**README against the data**
- The draw-call table matches the single-frame min values in `render-stats.txt`, except the vote-8 no-UI 658 sample: the README calls it a doubled frame, but its SetPass is 51 (a normal single frame).
- `[sat] 01-idle` reads drawCalls = 0, which is a sampling glitch the README does not mention.
- Stale README text: section 1 still says the deflector has "ribs" (line 56) and the streaks are "2.4 m × 18 m" (lines 79–80). Lines 121–127 give the new values.
- WebGL JSON values match the README.

## Rework-1 defects: status

- **Fixed:**
  - closed-box table;
  - far hall a plain box;
  - steel with no sun rim;
  - cryo foil reading neon;
  - bevels 4.5 cm;
  - saturated royal-blue upper corners with red = 0;
  - tag overprint;
  - work-light near-clip;
  - WebGL screenshot outside the bay.
- **Partly fixed:**
  - repeated tower storeys;
  - lamp reflections (pools in place, but not wet);
  - arm-end black cubes (now a truss and a grey box plate);
  - faint, cool steam (now good; staining still missing);
  - hard sea line (softened);
  - draw calls (single-vehicle states mostly under 600; compare 792; vote 8 658 unexplained);
  - empty table at votes 3–5 (stand-in, still a glass box);
  - landed small fairing (8 % → 28 %).
- **Open:**
  - grey-mauve mid edges at votes 8–10;
  - repeating wave band;
  - short glint;
  - mid-range laptop figure.
- **First-review defects of this run:**
  - fixed: the hidden vote ghost, the floating lamp streaks, the staircase deflector, the crushed pit, the flat soffit;
  - new: bottom corners crushed to red = 0.

## T031 exceptions

- None needed for the scores. Post-processing runs in the macOS player and in WebGL (README section 0, `postfx/`).
- Noted only: WebGL still logs the FSR upscaling shader warning (`postProcessingStripWarnings` in every `webgl-fps-*.json`). Whether each effect runs on WebGL was not checked effect by effect.
- The remaining M8 colour gaps come from T034's own framing card and bay volume.

## Report under "Not verified / failing"

- Below 4: M1, M2, M3, M7, M8, M9, M10, U7, U11 (and M4, M5 for the record).
- At 4: M6.
- Closest to 4: U11, M9 (compare view and the 658 sample) and M8 (mid edges and bottom corners).
