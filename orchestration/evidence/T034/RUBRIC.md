# T034 rubric: Build Bay environment and camera beauty pass (M1 to M10, U7 camera part, U11)

**Re-score after the builder's second pass.** This supersedes the first RUBRIC.md of 2026-11-15. Every row was scored again from scratch against the regenerated captures (JPEG q90 singles, PNG composites). The first review was used only to check whether each defect it listed is fixed.

- **Reviewer:** independent subagent. It did not build this scene and scored it from the images and code, not from the builder's claims.
- **Date:** 2026-11-15, second pass.
- **Bar:** `orchestration/VISUAL_TARGET.md` section 6. A score of 4 means shippable: it holds up side by side with `assets/media/style/frames/02-build-bay.png`, and an outsider would not pick out the difference in quality. Nothing ships below 4. Section 1 (reference look) and section 2.5 (lighting and render) were the checklists.
- **Method:**
  - Looked at every current capture in `after/` (15, including the new `stage3-late-*`) and `before/`, `complete-beauty-vs-frame02.png`, `buildbay-ui-vs-frame02.png`, the new `assembly-stages-ui.png` (votes 3, 6 and 8), `webgl-chrome-1920x1080.jpg`, and frame 02 at full size.
  - Zoomed crops (Pillow, 1–4×) of the vehicle, the mount, the horizon and sea band, the crane hook and the descending part in the assembly frame, the vote-5 ghost on the mount, the steam vent, and the exploded-view nose.
  - Pixel work on the new files:
    - 5 × 5 median colours (sky corners and centre, left edge, horizon, ground, mount, vehicle sun and shade sides) against frame 02;
    - magenta, clipped-white and near-black counts;
    - the share of the top 200 rows with red ≤ 3 (JPEG-tolerant);
    - vehicle top and bottom rows per capture.
  - Files read:
    - `README.md`;
    - `webgl-fps-high.json`, `-high-full.json` and `-low-full.json`;
    - `editmode-results.xml` (339 total, 339 passed, 0 failed);
    - current constants in `Cameras/BayFraming.cs` (band 200–760 px) and `Stage/BayStage.Framing.cs` (`MinFramedHeightM` 12 m, compare band 300–525 px, scale band bottom 690 px).
  - No video or frame sequence exists, so motion is still judged from code plus stills.

| Item | Score (1-5) | One-line reason | Evidence file(s) |
|---|---|---|---|
| M1 Silhouette and proportion | 3 | The vehicle reads cleanly at about 51 % of the height. The hero structures are still primitive: the launch mount is a single stepped concrete block with a ramp (745–1440, 755–890 in the complete beauty shot), and the service tower is a bare open lattice with no platforms, cladding or piping. Vehicle part owner: T032/T033. | `after/complete-vehicle-beauty-1920x1080.jpg`, `after/beauty-no-ui-*`, `complete-beauty-vs-frame02.png` |
| M2 Material response | 3 | **Fixed:** the mount is now light textured concrete (#495667 / #545561, against #001933 before). The vehicle's sun/shade split holds: fairing #F0C291 against #A4A8AF; frame 02 is #EFD4BF against #687888. **Still open:** tower steel is flat #151C2B with no specular; the scrub ground repeats in a visible grid; vehicle paint unchanged (owner T032/T033). | `after/complete-vehicle-beauty-*`, `after/stage2-mid-no-ui-*` |
| M3 Surface detail | 2 | Unchanged. No railings, stairs, pipes or platform lamps on the tower or mount; the far hall is a plain fogged box (402–543, 597–718); the vehicle still has small black rectangles as "detail". Vehicle owner: T032/T033. | `after/complete-vehicle-beauty-*` |
| M4 Markings | 3 | The apron paint (lane lines, yellow dashed ring) is sparse, generic, logo-free and free of z-fighting. The vehicle has only navy bands, with no teal strakes or stage markings. Vehicle decals owner: T032/T033. | `after/beauty-no-ui-*`, `after/complete-vehicle-beauty-*` |
| M5 Engine fidelity | 2 | At the hero framing the bells are hidden by hold-down clamps (Build Bay full) or show as small dark cones (boosters, 930–1000, 720–750). Section 2.2 cannot be checked. The first-stage cluster in the WebGL frame (925–990, 690–750) is tiny. Owner: T032/T033. | `after/complete-vehicle-beauty-*`, `webgl-chrome-1920x1080.jpg` |
| M6 Edges and normals | 3 | No shading artefacts. Every environment box is unbevelled: the mount block, the apron slab edge (450–1430, 865–950), the side block and the far buildings. | `after/complete-vehicle-beauty-*`, `after/stage1-early-no-ui-*` |
| M7 Wear and frost | 2 | No frost on any tank. The steam vent is a faint grey puff at the lower arm end (895–925, 495–535 in `after/beauty-no-ui`), which reads as a smudge, not boil-off. Trench soot is never in frame. Frost owner: T032/T033. | `after/beauty-no-ui-*` |
| M8 Lighting and render | 3 | **Better:** the mount shadow is lifted; the top-centre sky is now #0F3C73, close to frame 02's #134164; red ≤ 3 covers 39–51 % of the top 200 rows (65–72 % before). **Still failing:** the corners stay saturated blue (#00388F TL, #005EA6 TR, against frame 02 #082134) and there is no navy side vignette (left edge mid #BE9E85, while frame 02 is navy); the horizon is one hard straight line at y ≈ 675 across the width, above a tiled ocean stripe; ground glints are still blobs far from any lamp; the near ground is #0A1A31, with red just under the 12 floor. | `after/complete-vehicle-beauty-*`, `after/beauty-no-ui-*`, frame 02 |
| M9 Technical | 3 | **Fixed:** WebGL median 59.9 fps on High (six live assemblies, p95 17.6 ms), on High with the bay full, and on Low; EditMode 339/339 green; no magenta or clipped whites in any capture; licences recorded; 1K textures. **Still open:** fps is from the build before the final framing and grade tweaks; it was measured only on an M4 at the 60 Hz vsync cap, not a mid-range laptop; triangle and draw-call counts against the 1.8 M / 600 budget are still not measured; `webgl-chrome-1920x1080.jpg` shows the old build (dark mount, smaller vehicle). `index.json` is to be reverted (coordinator). | `README.md` (WebGL section), `webgl-fps-*.json`, `editmode-results.xml`, `webgl-chrome-1920x1080.jpg` |
| M10 Reference match | 2 | Improved: the concrete mount now sits in the palette and the sky centre is calmer. Side by side with frame 02, though, an outsider still sees the gap at once: a block pedestal and bare lattice tower stand in for frame 02's clad teal service tower and legged mount; there are no coastline, hills or clouds; the ocean is a tiled stripe; the corners are saturated. Brief step 4 (T017 hero tower, crane and hall) is still not done. | `complete-beauty-vs-frame02.png`, `pairs/complete-vehicle-beauty-before-after.png` |
| U7 Motion (camera and assembly only) | 3 | **Fixed:** the band is now 200–760 px, so the base clears the timeline; `MinFramedHeightM` is 12 m, so votes 6 and 8 reach 48–50 %. **Still open:** there is no motion capture; the assembly still shows no sparks; the crane cable is drawn straight through the descending fairing; the hook is a flat salmon box (930–990, 635–680); the part blows out to near-white under the work light. The code is sound: unit-tested solve, dolly, orbit, punch-in, and reduced motion as cuts. | `after/assembly-crane-sparks-*`, `after/stage2-mid-ui-*`, `after/stage3-late-ui-*`, `BayStage.Framing.cs:18` |
| U11 Reference match (Build Bay with UI) | 3 | At every stage from vote 6 on, the vehicle owns the free column at 48–54 % against a warm dusk, and the scale-view person label is restored. **Still open:** the compare candidate labels collide with the UI; the exploded nose is clipped by the phase pills; the scene under the panels stays generic. | `buildbay-ui-vs-frame02.png`, `assembly-stages-ui.png`, `after/compare-*`, `after/exploded-*` |

## Below 4

**M1 Silhouette and proportion (3)**
- **Mount:** a stepped block plus a wedge ramp (745–1440, 755–890 in `after/complete-vehicle-beauty`).
- **Tower:** an open square lattice (790–920, 0–755).
- **Frame 02** has a legged mount with teal struts, stairs and a lit opening, and a clad teal tower with platforms and a pipe run.
- **Fix:** brief step 4: hero mount and service tower with frame 02's massing.

**M2 Material response (3)**
- **Fixed:** the mount colour and texture.
- **Open:**
  - Tower steel is flat #151C2B with no sun rim.
  - The scrub ground repeats in a regular grid (right half, 850–1080).
- **Fix:**
  - a metallic, low-roughness steel material so the sun rims the lattice;
  - a macro variation or second UV scale on the ground.

**M3 Surface detail (2)**
- Unchanged from the first review.
- **Fix:** railings, stair runs, pipe runs and lamp fixtures on the tower and mount (trim-sheet approach); detail on the hall silhouette. The vehicle black rectangles belong to T032/T033.

**M4 Markings (3), owner T032/T033**
- **Fix:** vehicle teal strakes and a stage-marking decal atlas.

**M5 Engine fidelity (2), owner T032/T033**
- **Fix:** T033 engines. On the camera side, a slightly lower eye or an open clamp ring so the engine bay reads.

**M6 Edges and normals (3)**
- **Fix:** 5–15 cm bevels with weighted normals on the environment meshes.

**M7 Wear and frost (2)**
- The steam is a faint grey puff (895–925, 495–535).
- No frost (owner T032/T033).
- **Fix:** warm-white, longer, rising and wind-bent steam on the sun side so it backlights. Frost belongs to T032/T033.

**M8 Lighting and render (3)**
- **Fixed:**
  - the mount shadow floor;
  - the top-centre sky tone.
- **Open:**
  - **Saturated corners:** TL #00388F (red 0); red ≤ 3 still covers 39–51 % of the top 200 rows in the no-UI shots.
  - **No navy edge vignette:** the left edge at mid height is #BE9E85. Frame 02 falls off to navy on both sides.
  - **Hard horizon:** a straight line at y ≈ 675 across 0–1920, then a tiled wave stripe (≈ 700–730). No coastline or hills.
  - **Ground glints:** random elliptical blobs away from the lamps (1580–1760, 850–930 and 1450–1520, 965–980).
  - **Near ground:** #0A1A31, red marginally under the sRGB 12 floor.
- **Fix:**
  - a radial or side vignette of about 0.15–0.18 that pulls the edges to navy;
  - lower the upper-sky saturation at the corners;
  - bring a headland or coastline into view;
  - a larger-scale ocean normal with a sun-glint path;
  - cluster the wet sheen around the lamp pools;
  - lift the ground floor slightly.

**M9 Technical (3)**
- **Fixed:**
  - WebGL fps evidence (59.9 median on High and Low, including during assemblies);
  - EditMode results (339/339).
- **Open:**
  - The fps and `webgl-chrome-1920x1080.jpg` come from the build before the final framing, grade and mount changes (README says so; the capture shows the old dark mount).
  - The measurement is vsync-capped on an Apple M4, so headroom on a mid-range laptop is unknown.
  - Visible-triangle and draw-call counts are not measured.
- **Fix:**
  - rebuild WebGL from the final state and re-measure;
  - record triangles and draw calls (Frame Debugger or `UnityStats` in a development build) against 1.8 M / 600;
  - revert `index.json` as planned.

**M10 Reference match (2)**
- **Fix:** in order of effect:
  - hero tower and mount (M1, M3);
  - edge vignette and corner sky (M8);
  - coastline and ocean (M8).

**U7 Motion, camera and assembly (3)**
- **Fixed:** the base now sits at 735–750 px, clear of the timeline at 798. Early stages reach the band:
  - vote 6: 200–735 px, about 50 %;
  - vote 8: 200–720 px, about 48 %.
- **Open:**
  - **No motion evidence:** no video or frame sequence of a dolly, the orbit, a punch-in, or an assembly in normal and reduced motion.
  - **Assembly frame (`after/assembly-crane-sparks`):**
    - no sparks are visible;
    - the crane cable runs straight down through the descending fairing to its base (a dark vertical line, about x 955, 665–790), which is interpenetration;
    - the hook is an untextured salmon box (930–990, 635–680);
    - the lower half of the fairing is blown out to near-white by the work light (935–990, 700–790).
  - **Vote 5:** only the satellite is on the stack, so the camera holds the 42 m empty-pad framing. The only vehicle element is a teal ghost about 45 px tall (940–975, 700–745, about 4 %).
- **Fix:**
  - capture 10–15 s of a part landing (normal and reduced motion);
  - end the cable at the hook and give the hook a model or steel material;
  - cap the work light intensity, or move it off-axis, so the part keeps its form;
  - make sure the sparks fall in front of the part, or capture after descent ends;
  - treat a satellite-only stack as a short stack (12 m minimum) instead of an empty pad.

**U11 Reference match, Build Bay with UI (3)**
- **Fixed:** the scale-view "Person 1.75 m" label is visible again (948–1125, 708–742 in `after/scale-reference`).
- **Open:**
  - **Compare (`after/compare`):** the candidates are now framed at 300–525 px, so their world-anchored labels sit at the top of that band and collide with the UI:
    - "A · Kerolox Workhorse" is half hidden under the rehearsal banner (600–860, 295–325);
    - "B · Hydrol…" is cut off by the Compare chip (1095–1420, 285–315).

    In the before capture both labels sat in open scene.
  - **Exploded (`after/exploded`):** the fairing nose tip is hidden behind the "A · Concept" phase pill (920–1000, 118–165). This is new: before, the exploded stack sat lower.
  - The scene under the panels shares the M8 and M10 gaps.
- **Fix:**
  - place the compare labels below the candidates' noses inside the band, or clamp label positions to the free column clear of the banner and chips (about y 330–520);
  - lower the exploded-view band top to about 185 px.

## Checks

**Vehicle at 45–60 % of the screen height in the free column (512–1408 px), measured on the current captures**

| Capture | Stage | Vehicle top–bottom (px of 1080) | Share | Result |
|---|---|---|---|---|
| `after/stage1-early-*` | vote 3, empty pad | no vehicle; tower and crane framed (42 m) | n/a | n/a |
| `after/vote-in-progress-*` | vote 5, satellite only (ghost fairing shown) | ≈ 700–745 | ≈ 4 % | **Fail** (empty-pad framing) |
| `after/stage2-mid-*` | vote 6, payload and fairing | ≈ 200–735 | ≈ 50 % | Pass (was 35 %) |
| `after/stage3-late-*` | vote 8, fairing and upper-stage engine | ≈ 200–720 | ≈ 48 % | Pass (new) |
| `after/idle-ui-*` | vote 10 | ≈ 200–745 | ≈ 50 % | Pass, base clear of the timeline |
| `after/beauty-no-ui-*` | vote 9 | ≈ 200–750 | ≈ 51 % | Pass |
| `after/complete-vehicle-beauty-*` | full stack with boosters | ≈ 200–750 | ≈ 51 % | Pass |
| `after/reduced-motion-ui-*` | vote 10 | ≈ 200–745 | ≈ 50 % | Pass |
| `webgl-chrome-1920x1080.jpg` | vote 11 (older build) | ≈ 380–760 | ≈ 35 % | Stale build, not scored |

- Horizontal centring is good: the axis is at x ≈ 955–965 in every capture.

**Black void**
- None. No capture has any pixel below 12 on all channels.
- The mount is no longer a dark slab (#445569 against #001933 before). The darkest large area is the near ground at #0A1A31.

**Magenta or missing shaders**
- None: 0 magenta pixels in all 15 after captures.

**Z-fighting, floating objects, seams**
- No z-fighting seen in stills.
- No floating objects.
- **New clipping:** the crane cable passes through the descending fairing in `after/assembly-crane-sparks` (about x 955, 665–790).
- **Seams unchanged:**
  - the hard horizon at y ≈ 675;
  - visible repeats in the ocean stripe and the scrub ground.

**UI regressions against the before captures**

The panel layout, text and data are unchanged, but:
- **Compare:** the candidate labels collide with the rehearsal banner and the Compare chip (see U11). This is still a regression.
- **Exploded:** the fairing nose is clipped under the phase pills. This is new.
- **Exploded (pre-existing):** "Payload" and "Upper stage tanks" still overprint each other (1015–1235, 485–535).
- **Scale:** the person label is restored. Fixed.

**First-review defects: status**
- **Fixed:**
  - the dark mount and its crushed shadow floor;
  - framing at votes 6 and 8;
  - the vehicle base touching the timeline;
  - the scale person label;
  - the missing WebGL fps evidence;
  - the duplicate stage-3 capture (now vote 8).
- **Partly fixed:** the sky saturation (centre fixed, corners not).
- **Open:**
  - the hero tower and mount geometry;
  - the vignette;
  - the hard horizon and tiled ocean;
  - the ground glints and tiling;
  - sparks and hook in the assembly;
  - no motion capture;
  - the compare labels;
  - steam and frost;
  - triangle and draw-call counts.

**Report under "Not verified / failing"**
- Below 4: every scored item (M1–M10, U7, U11).
- Owned mainly by T032/T033: M2 (vehicle paint), M3 (vehicle part), M4 (vehicle decals), M5 and M7 (frost).
- The items closest to 4 are M8, M9, U7 and U11:
  - M8 needs the vignette, horizon and ocean work;
  - M9 needs a re-measure on the final build plus triangle and draw-call counts;
  - U7 needs a motion capture and the assembly fixes;
  - U11 needs the label fixes.
