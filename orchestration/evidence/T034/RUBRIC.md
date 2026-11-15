# T034 rubric: Build Bay environment and camera beauty pass (M1 to M10, U7 camera part, U11)

**Rework round 1 (issue #129).** This replaces the earlier RUBRIC.md. Every row was scored again from scratch against the rework captures. The earlier review was used only to check whether each defect it listed is fixed.

- **Reviewer:** independent subagent. It did not build this scene. It scored from the images, pixels and code, not from the builder's claims.
- **Date:** 2026-11-15, rework round 1.
- **Bar:** `orchestration/VISUAL_TARGET.md` section 6. A 4 means shippable: it holds up side by side with `assets/media/style/frames/02-build-bay.png`, and an outsider would not pick out the difference in quality. Nothing ships below 4. Sections 1 (reference look) and 2.5 (lighting and render) were the checklists.
- **Scope exceptions:**
  - The vehicle models (paint, decals, engine bells, frost, vehicle surface detail) belong to T032/T033. M4 and M5 are scored for the record only. M2, M3 and M7 score the environment and assembly part; the vehicle part is noted.
  - Every player build of this project runs **without post-processing**: URP strips the Panini shader and then skips all post passes (README, "Finding outside T034's paths"). That means no ACES, no bloom, no grade and no URP vignette in any capture. This is outside T034's paths. It is mentioned where it matters, but what is on screen is what is scored.
- **Method:**
  - Looked at all 17 `after/` captures, the `before/` and `round1/` sets, `complete-beauty-vs-frame02.png`, `buildbay-ui-vs-frame02.png`, `assembly-stages-ui.png`, every `pairs/*` file, both motion contact sheets, and `webgl-chrome-1920x1080.jpg` at full size.
  - Extracted frames from both MP4s (normal motion at 4 fps, reduced motion at 2 fps) and made zoomed contact sheets of the landing.
  - Pillow crops at 2–3× of the tower, the mount, the horizon, the ground, the steam, the hook and part in the assembly still, the arm-end box, and the exploded nose.
  - Pixel work: 40 × 40 median colours at the corners, mid edges, top centre and ground against frame 02 (scaled to 1920 × 1080); the share of the top 200 rows with red ≤ 3; clipped-white (all channels ≥ 250), near-black (all ≤ 12) and magenta counts with clusters located; vehicle nose and base rows with a pixel ruler; a pixel diff of the vote-3 and vote-5 captures.
  - Read: `README.md`, `render-stats.txt`, all four `webgl-fps-*.json`, `measure-webgl-fps.mjs`, `editmode-results.xml` (340 / 340 passed, run 01:06Z = 04:06 local, after the last script change at 04:04), `BayDressingAssets.cs` (hero materials), `build_hero_pad.py` (bevel 4.5 cm plus weighted normals), and the fairing diameters in `data/contracts.json`.

| Item | Score (1-5) | One-line reason | Evidence file(s) |
|---|---|---|---|
| M1 Silhouette and proportion | 3 | **Much better:** a clad tower with platforms, a crown house and a legged teal table with stairs now gives frame 02's massing, and the vehicle holds 46–49 % of the height. **Still short:** the table is a closed concrete box under a teal portal (no open legs over a lit exhaust opening). The far hall is a plain box (402–543, 597–718), the apron is a flat hexagon slab and the ramp is a block. Every tower storey repeats the same module. Vehicle shape: T032/T033. | `after/complete-vehicle-beauty-*`, `after/beauty-no-ui-*`, `complete-beauty-vs-frame02.png` |
| M2 Material response | 3 | Concrete is textured and the ground is drier. But the "metallic" tower steel (#C4CCCF, metallic 0.55) reads as flat mauve-grey with no sun rim on the lattice (620–850, 0–700 in `beauty-no-ui`). The gold cryo lines read as glowing neon strips, not foil. No wet reflection is visible in any lamp pool. Vehicle paint: T032/T033. | `after/beauty-no-ui-*`, `after/stage2-mid-no-ui-*`, `after/complete-vehicle-beauty-*` |
| M3 Surface detail | 3 | **New:** railings, stair flights with landings, platform lamps, a pipe run on stand-offs, a glazed crown and hold-down posts, which is restrained and placed where real pads have them. **Still bare:** the arm-end boxes are plain near-black cubes beside the vehicle (#011631 at 828–885, 240–330 in `stage2-mid-no-ui`). The hall, apron and ramp have no detail. The mount face is a flat wall that fills the lower 35 % at votes 3–8. Vehicle detail: T032/T033. | `after/stage2-mid-no-ui-*`, `after/stage3-late-no-ui-*`, `after/complete-vehicle-beauty-*` |
| M4 Markings | 3 (T032/T033 exception) | Apron paint is sparse, generic, logo-free and has no z-fighting. The vehicle still has only navy bands and no teal strakes. Scored for the record; vehicle decals are owned by T032/T033. | `after/beauty-no-ui-*` |
| M5 Engine fidelity | 2 (T032/T033 exception) | Bells are hidden at the hero framing. The vote-8 upper-stage engine shows only as small legs (900–1010, 660–700). Scored for the record; owned by T032/T033. | `after/stage3-late-no-ui-*`, `after/complete-vehicle-beauty-*` |
| M6 Edges and normals | 3 | No shading artefacts. The hero meshes have 4.5 cm bevels with weighted normals (`build_hero_pad.py:53`), which is under the 5–15 cm asked for big forms, and they do not visibly catch light at any capture distance. The T015 apron slab edge (450–1430, 865–950), the ramp, the hall, the arm-end boxes and the lamp bases are still hard unbevelled boxes. | `after/complete-vehicle-beauty-*`, `after/stage2-mid-no-ui-*` |
| M7 Wear and frost | 3 | The steam is now a rising column (920–1000, 60–330 in `complete-vehicle-beauty`). It is faint, cool grey-white and not backlit, and the arm-end source still reads as a small grey smudge (900–925, 480–515 in `idle-ui`). The concrete has stains in its texture. There is no trench soot in frame. Frost: T032/T033. | `after/complete-vehicle-beauty-*`, `after/idle-ui-*` |
| M8 Lighting and render | 3 | **Better:** navy falloff in the top corners and along the bottom; headlands on both sides; a haze band; the stray ground glints are gone. **Still failing:** the corners are saturated royal blue (#001441 against frame 02's #092135, with B/G of about 3.2 against 1.6). Red ≤ 3 now covers 55–70 % of the top 200 rows (39–51 % in round 1; 0 % in frame 02). The top centre is #005AB0 against #174669. The mid edges are grey-mauve (#3E3B40), not navy. The sea line is still hard and straight at y ≈ 675, the wave band still repeats (0–780, 705–735), and the glint path is a short strip (1480–1560, 705–720). No post-processing (outside T034). | `after/complete-vehicle-beauty-*`, `after/beauty-no-ui-*`, frame 02 |
| M9 Technical | 3 | **Done:** WebGL rebuilt at 04:06, after the last code change at 04:04. 59.9 fps vsync and 110 uncapped during six assemblies on an M4. All-pass triangles are at most 1.10 M (under 1.8 M). EditMode 340/340. 0 magenta. **Open:** engine draw calls are 1,087–1,496 in the fuller states, over 600. The "main view" 448 is a self-defined count without the shadow and prepass draws. There is no mid-range laptop figure. `webgl-chrome-1920x1080.jpg` shows the FRR screen, not the Build Bay, so the "near-complete" fps runs probably ended outside the bay. | `README.md`, `render-stats.txt`, `webgl-fps-*.json`, `webgl-chrome-1920x1080.jpg`, `editmode-results.xml` |
| M10 Reference match | 3 | Up from 2. Side by side it now reads as the same kind of place: a clad tower on the left, the vehicle in the centre, a dusk sun on the right, headlands and navy edges. An outsider still sees the gap at once. The sky is saturated and cloudless. There are two bare masts where frame 02 has its cranes. The bottom quarter is flat dark ground with no wet reflections. The hall is a box. The gold lines glow. | `complete-beauty-vs-frame02.png`, `pairs/complete-vehicle-beauty-round1-vs-rework.jpg` |
| U7 Motion (camera and assembly only) | 3 | **Fixed:** a 13 s capture in normal and reduced motion (reduced motion fades the part in place and cuts the camera); the cable ends at a modelled hook block with a sheave; sparks fall in front of the part. **Open:** in the still, the part's lower half is still near-clipped (R = 255, G 238–253 at 945–970, 670–720). A landed 1.5 m small fairing stays about 8 % of the screen height for the rest of the clip (about 60 of 720 px), and the punch-in barely changes that. Votes 3 and 5 frame an empty table top (the satellite has no model and there is no ghost). | `motion/*.mp4`, `motion/*-contact.jpg`, `after/assembly-crane-sparks-*`, `after/vote5-short-stack-*` |
| U11 Reference match (Build Bay with UI) | 3 | **Fixed:** the compare tags now sit at y 485–520, clear of the banner and the chips (B is 7 px under the Stability chip). The exploded nose (y ≈ 320) clears the phase pills and the banner. Votes 6–10 hold the vehicle in the free column at 46–49 %. **Open:** at votes 3 and 5 the free column is an empty mount and a concrete wall. "Payload" still overprints "Upper stage tanks" in the exploded view (1018–1230, 560–605). The scene under the panels shares the M8 and M10 gaps. | `buildbay-ui-vs-frame02.png`, `assembly-stages-ui.png`, `after/compare-*`, `after/exploded-*`, `after/stage1-early-ui-*` |

## Below 4

Every item is below 4. Fixes are listed in order of effect.

**M1 Silhouette and proportion (3)**
- Open the table: show the splayed legs over a dark exhaust opening lit by its lamps, as in frame 02 (2048-wide frame, 860–1220, 990–1090). Do not show a closed concrete face.
- Replace the far hall box (402–543, 597–718) with T017's site silhouette, or add a roofline, doors and a lit window band.
- Break the repeated tower storeys: vary the balcony side and the cladding per storey, and add one taller machine level.

**M2 Material response (3)**
- Tower steel: lower the roughness and check that the sun-facing flanges catch a rim. Make the probe capture include the bright dusk side. In the current captures the lattice has no highlight at all.
- Cryo lines: remove any emissive, or lower the foil smoothness, so they read as wrapped pipe and not light strips (the 480–580 band in `stage1-early-no-ui`).
- Wet sheen: make the lamp-pool patches show visible reflections of the lamp heads (frame 02 has bright streaks under every lamp). None show now.

**M3 Surface detail (3)**
- Model the arm-end umbilical plates (connector plate, hose loops, a hinge) in place of the near-black cubes. They sit next to the vehicle in every vehicle shot.
- Add panel joints, a drain channel and anchor plates to the mount wall, which fills the lower third at votes 3–8.
- Add a kerb, joints and trim to the apron slab and the ramp.

**M4 Markings (3), T032/T033 exception**
- Vehicle teal strakes and stage markings (T032/T033).

**M5 Engine fidelity (2), T032/T033 exception**
- T033 engines. On the camera side, a lower eye at vote 8 or later would let the engine bay read.

**M6 Edges and normals (3)**
- Raise the bevel on big hero forms (table deck, columns, plinth) to 8–15 cm so the edges catch the sun at bay distance.
- Bevel the T015 leftovers that are still in frame: the apron slab, the ramp, the hall, the arm-end boxes and the lamp bases.

**M7 Wear and frost (3)**
- Steam: make it warmer (about #F2E6D8 on the sun side), denser near the vent and longer, so it backlights against the sun. Give the vent a visible fitting so the puff does not come out of a black box.
- Add light soot and heat staining at the flame opening and the trench edge.
- Frost: T032/T033.

**M8 Lighting and render (3)**
- Corner and top sky: lift the red channel and lower the saturation. Aim for about #0A2236 in the corners and #17466A at the top centre. Right now 55–70 % of the top 200 rows have red ≤ 3.
- Mid edges: let the framing card reach navy over the full height of both sides. It is #3E3B40 at (30, 540) now.
- Horizon: break the straight sea line at y ≈ 675 between the headlands with a far shore, low cloud or a thin haze bank. Add some sky clouds lit from below.
- Sea: remove the repeating wave band (0–780, 705–735). Make the glint path a long column under the sun (frame 02 has it from the sun down to the shore).
- Report the post-processing strip to T031. With ACES and the grade back on, re-check the sky and the clipped sun.

**M9 Technical (3)**
- Bring the full-state draw calls under 600 on the engine counter. Static-batch or combine the hero pieces, railings and lamps, and drop shadow casting on small parts. Otherwise get the orchestrator to agree in writing that the budget means main-view draws.
- Measure on a mid-range laptop, or a throttled GPU profile, and say which one.
- Re-take the WebGL screenshot while the Build Bay is on screen. Make sure the "near-complete" runs stay in the bay for the whole window, or report how long they were on FRR.
- Fix the `[mid] 02-beauty-no-ui triangles=0` reading in `render-stats.txt`.

**M10 Reference match (3)**
- In order of effect: sky colour and clouds (M8), wet reflections in the foreground (M2), an open legged table (M1), cranes or lit service buildings in place of the bare masts, and a hall with detail.

**U7 Motion, camera and assembly (3)**
- Work light: cap it lower for the punched-in shot, or angle it more, so the part keeps its form under the sparks (945–970, 670–720 now reads near-white).
- Small parts: when the stack is shorter than about 5 m, let the punch-in frame the part itself, not the 12 m table, so a landed small fairing is not 8 % of the screen.
- Empty table at votes 3–5: show a payload stand-in (a ghost or a dispenser) on the table, or hold the wider pad framing until a part with a model exists.

**U11 Reference match, Build Bay with UI (3)**
- Separate the "Payload" and "Upper stage tanks" exploded tags (1018–1230, 560–605), for example with a minimum vertical gap between tags.
- Apply the U7 fix for votes 3–5, so the free column is not an empty mount and a concrete wall.
- The rest follows M8 and M10.

## Checks

**Vehicle at 45–60 % of the screen height in the free column (512–1408 px), measured on the current captures**

| Capture | Stage | Vehicle nose–base (px of 1080) | Share | Result |
|---|---|---|---|---|
| `after/stage1-early-*` | vote 3 (mass 0.2 t, choices already made) | no vehicle; table framed at 12 m | 0 % | Fail. The frame is identical to vote 5 (mean diff 0.93 / 255). |
| `after/vote5-short-stack-*` | vote 5, satellite only | no vehicle and no ghost; 12 m table | 0 % | Fail (empty table) |
| `after/vote-in-progress-*` | vote 5, voting | ghost fairing about 590–690 | ≈ 9 % | Fail |
| `after/stage2-mid-*` | vote 6, 5.4 m fairing | ≈ 200–694 | ≈ 46 % | Pass |
| `after/stage3-late-*` | vote 8, fairing and engine | ≈ 200–697 | ≈ 46 % | Pass |
| `after/beauty-no-ui-*` | vote 10 | ≈ 200–726 | ≈ 49 % | Pass |
| `after/idle-ui-*`, `after/reduced-motion-ui-*` | vote 10 | ≈ 200–730 | ≈ 49 % | Pass |
| `after/complete-vehicle-beauty-*` | full stack with boosters | ≈ 200–730 | ≈ 49 % | Pass |
| `motion/landing-normal-motion.mp4` | vote 5, 1.5 m small fairing landed | about 60 of 720 px | ≈ 8 % | Fail |

- Horizontal centring is good: the axis is at x ≈ 955–965 in every capture.

**Black void**
- None.
- Near-black pixels: 0–19 per capture (frame 02 has 538).
- The near ground is #111F32 at (960, 1040), above the sRGB 12 floor.
- The darkest large surfaces are the arm-end boxes at #011631. They are small, but they read as holes next to the vehicle.

**Magenta or missing shaders**
- None: 0 magenta pixels in all 17 `after/` captures.

**Clipped whites**
- 491–1,069 px per capture (frame 02 has 107).
- Almost all are in the sun disk (1080–1200, 440–480) and the lamp heads.
- In the assembly still, the part plus sparks clip at 945–970, 670–720.
- None are on the vehicle shells in the beauty shots.
- Without tonemapping (post-processing stripped), the sun disk clipping is expected.

**Z-fighting, floating objects, seams**
- No z-fighting seen.
- **Hall in the sea:** the far hall's base sits inside the sea band (about y 718), so it reads as standing in the water.
- **Arm-end boxes:** they butt against the fairing edge (about x 885, 240–330 at vote 6). They are not visibly penetrating.
- **Seams:**
  - the hard sea line at y ≈ 675;
  - the repeating wave band at 705–735;
  - a regular dot grid on the scrub ground (1500–1900, 850–1000), which the macro variation softens but does not remove.

**UI regressions against the before captures**
- Fixed: the compare tags are clear of the rehearsal banner and the Compare and Stability chips.
- Fixed: the exploded nose is clear of the phase pills.
- Fixed: the scale-view person label is visible (948–1110, 708–742).
- Still there (pre-existing): the "Payload" and "Upper stage tanks" tag overlap in the exploded view.
- Not T034's: the compare table headers "Kerolox Workhorse" and "Hydrolox High-Efficiency" run together (773–1173, 575). This is the same in round 1 and comes from the T031 UI.

**Round-1 defects: status**
- **Fixed:**
  - the hero tower and mount geometry (now clad tower, platforms, stairs, legged table);
  - the cable ends at the hook;
  - the hook is a real model;
  - sparks fall in front of the part;
  - a motion capture exists in normal and reduced motion;
  - the compare tags;
  - the exploded nose;
  - stray ground glints;
  - WebGL rebuilt from the final state;
  - triangle and draw-call counts recorded.
- **Partly fixed:**
  - the navy vignette (top corners and bottom yes; mid edges grey);
  - the corner sky (darker but still saturated; the red-0 share went up);
  - the hard horizon (headlands added; the sea line is still straight between them);
  - the ocean (larger swell; the wave band still repeats; the glint is short);
  - ground tiling (macro patches; the grid is still visible);
  - wet sheen at the lamps (blobs gone; no visible reflection);
  - the work-light blowout (fine in the clip; near-clipped in the still);
  - the satellite-only short stack (framing changed, but the table is empty);
  - the steam (longer and rising, but faint and cool);
  - metallic tower steel (set in the material; not visible on screen);
  - bevels (on hero meshes only, at 4.5 cm).
- **Open:**
  - the draw-call budget on the engine counter;
  - a mid-range laptop measurement;
  - the WebGL screenshot of the bay;
  - the hall box;
  - the arm-end boxes;
  - the exploded tag overlap.

**Report under "Not verified / failing"**
- Below 4: every scored item (M1–M10, U7, U11).
- Owned mainly by T032/T033: M4, M5, and the vehicle parts of M2, M3 and M7.
- Closest to 4: U11 (one tag overlap plus the empty early stages), U7 (work-light cap and small-part framing) and M9 (draw calls and the bay screenshot).
- M8 and M10 need the sky colour, clouds and wet foreground. These are also affected by the post-processing strip that T031 owns.

## Builder corrections after this review (scores unchanged)

- **WebGL near-complete runs:** confirmed. The two vote-18 runs ran past vote 22 into the Flight Readiness Review, so
  `webgl-fps-high-full-uncapped.json` and `webgl-fps-low-full-uncapped.json` were deleted. They were re-run from vote 12
  for 60 s, and both end in the Build Bay at vote 18 with the full-height vehicle: High 161.3 fps, Low 188.7 fps
  uncapped (`webgl-fps-*-late-uncapped.json`). `webgl-chrome-1920x1080.jpg` is now that High run's last frame.
- **Vote-3 label:** the README now says vote 3 already has two choices with no 3D part yet (short-stack framing), and
  that the 42 m empty-pad framing, which applies only before the first choice, is not captured.
- **Render stats:** the README now gives the maximum as 1,496 draws and 98 SetPass. It says the main-view count is
  task-defined, not a Unity counter, and that the all-pass draw-call budget is **not met**. It also explains the
  `triangles=0` rows (the counter was sampled on a screenshot frame).
- **Wet sheen, steam and bevel:** the README now marks these as open, as measured here.
