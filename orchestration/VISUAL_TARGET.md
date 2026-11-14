# MissionForge visual target (the quality bar for every visual task)

Status: binding for every task that changes 3D art, lighting, rendering or UI (T031 onward).
Date: 2026-11-14. Owner: orchestrator. It works alongside `assets/media/style/STYLE_GUIDE.md`,
which still sets the palette, status language, safe regions and shot direction. This file says
how good the result must look and how we check it.

**Reference.** The approved Higgsfield frames are the target: `assets/media/style/frames/01-title.png`
… `06-mission-control.png` and `assets/media/key-art/missionforge-16x9.png`, `-1x1.png`. Every
visual task puts its evidence **side by side with the matching frame** and is scored with the
rubric at the end. Nothing ships with any rubric item below 4.

All numbers below are `game_value` art and performance targets unless they are tagged otherwise.
They are not physical measurements. Physical dimensions still come from `mfkit/spec.py` and
`data/`, and no visual change may alter them.

---

## 1. What the reference looks like (read this before you change anything)

- **Hardware.** Satin ceramic-white paint (#E8EEF0) with one broad, soft highlight, never a
  plastic hotspot. Panel seams are visible only in raking light. Brushed-silver interstages and
  rings show directional anisotropy. Thin teal (#55C5CD) strakes and bands carry a slim silver
  edge. Bells are dark warm graphite with a bronze inner rim. The engineering detail is
  believable but **restrained**: clean surfaces, detail grouped where real hardware has it (joints,
  engine bay, umbilicals). Nothing is covered evenly in greebles.
- **Light.** Warm low sun about 4500 K as a rim on one side, cool sky fill about 8000 K, key to fill
  around 4:1. Navy shadows that keep their form and are never crushed to black. Highlights on white
  shells stay below clipping. Wet reflective ground at the pad, warm practical lights, and a slow
  vignette into navy at the frame edges (frame 02).
- **Mood.** Optimistic, calm and expensive. It should feel like a premium stylised-realism game
  trailer, not a CAD viewport and not a debug HUD.

## 2. 3D models: the bar

### 2.1 Materials (PBR, every part, no exceptions)

| Requirement | Pass condition |
|---|---|
| Full PBR set on every material | albedo (sRGB), normal (OpenGL +Y, as glTF and Unity expect), ORM (R occlusion, G roughness, B metallic, linear). No flat-colour material survives except `detail_dark` small parts, and even those get roughness breakup. |
| Resolution | 2048² for hero sets: engine bells and chambers, engine metal, trim sheet, decal atlas, fairing and stage paint. 1024² for secondary tiling sets. Per-part bake masks are 2048² for the 11 engines and 4 fairings and 1024² for everything else. WebGL import override: 1024² max for non-hero sets. |
| Texel density | UV0 is metric (1 UV unit = 1 m, already produced by `MeshBuilder.lathe`). Tiling sets give ≥ 512 px/m on stage skins and ≥ 1024 px/m on engines. Report the measured density per family. |
| Roughness breakup | No surface has a uniform roughness. Paint 0.40–0.55 with low-frequency mottling of ±0.05. Metals use directional brushing. Foam is rough, about 0.8, with a cell normal. (Style guide recipes.) |
| Trim sheet | One shared 2048² trim sheet with labelled rows: weld bead, single rivet row, double rivet row, panel gap, hat stringer, bolt flange, bellows, braided hose, cable clamp strip, hinge and latch strip, vent grille. Bands and rings in the generator map onto trim rows (UV v inside the row's range). |
| Decals | One shared 2048² RGBA decal atlas with these marks and nothing else: stage markings, fluid ID bands (LOX, RP-1, LH2, CH4, GN2), "NO STEP", lifting-point and centre-of-gravity markers, hazard chevrons, ARM/SAFE plugs, generic serials (format `MF-S1-0427`). Lettering uses an OFL stencil face recorded in THIRD_PARTY. **No NASA, agency, company or national logos or flags, and no real mission patches.** Decals are sparse: at most about 6 per stage-size part, sized to read at the Build Bay framing. |
| Edges | Every hard edge that is visible at hero distance has a bevel: 2 segments at LOD0, 1 at LOD1. Width scales with the part: 3–6 mm on engine parts, 6–15 mm on stage hardware. Weighted normals keep flat faces flat. Custom split normals are exported in both FBX and GLB. No black smoothing gradients across large faces. |
| Wear | Subtle only. Edge wear from the per-part mask on no more than about 10 % of painted area, concentrated at handling points and access panels. Soot only at kerolox engine exits, booster aft skirts and the hot-staging interstage. No rust, no universal grime layer, no scratches on hero white paint. |
| Cryogenic tanks | A frost layer (white rime with a sparkle-free rough normal) masked over the LOX, LH2 and LCH4 sections. Driven by one 0..1 parameter so Unity can fade it in during propellant loading. Foam-insulated hydrolox tanks show spray-on foam (SOFI) texture in a desaturated burnt amber (tune it next to frame 02 so it sits in the palette), not flat orange plastic. Renders show a "dry" state and a "fuelled" state. |

### 2.2 Engines (design 7.7 and 7.8)

- **Bells.** Regeneratively cooled bells show a coolant-tube (or channel) texture along the
  meridians. The tube count stays constant from throat to exit: bell UV u is angle-normalised,
  not metric. Use at most 2–3 hat-band stiffeners and an exit manifold torus where the real
  class has one. **No stacks of evenly spaced hoop rings** (the current "lampshade" look).
  Radiatively cooled extensions (kerolox vacuum, the hydrolox vacuum extension, the hypergolic
  extension) are smooth dark metal or carbon with a heat-tint gradient and no tubes. Solid and
  ablative nozzles use matte carbon-phenolic with a layered wrap texture.
- **Heat tint.** A gradient near the throat (straw → bronze → blue-violet on uncooled metal,
  restrained) driven by the existing `nozzle_hot` heat mask. Kerolox exits get soot rings;
  hydrolox and methalox stay clean.
- **Powerhead at believable density at LOD0.** Each engine needs:
  - a turbopump with a volute housing, a bolt flange and an inducer inlet;
  - a gas generator with an exhaust duct, or preburner(s), matched to the engine class. Workhorse
    and giant are open-cycle (the giant has a turbine exhaust manifold around the bell). Staged
    combustion has one oxidiser-rich preburner feeding two chambers. Full-flow has two preburners
    and two pumps. Electric-pump has motor housings and an inverter box;
  - an injector dome with a gimbal block on top;
  - **2 gimbal actuators at 90° with clevis ends** (none on the fixed solid kick motor);
  - at least 4 major propellant ducts, each with at least 2 bellows sections and a flanged end
    (at least 12 bolts per flange);
  - at least 8 small lines or harnesses with clamps.

  Every pipe ends at a flange or a component. Nothing floats, intersects or ends in mid-air.
- **Silhouette.** It stays readable at LOD1 and in a 9-engine cluster. First-stage bells must not
  look like vacuum nozzles (style guide).

### 2.3 Triangle budgets (raised; replaces the flat 30 000 host limit)

| Family | LOD0 max | LOD1 max (30 % rule kept) | Phone GLB |
|---|---|---|---|
| Engines (hero) | 50 000 | 15 000 | 8 000 tris, ≤ 2 MB |
| Strap-on boosters | 50 000 | 15 000 | 8 000, ≤ 2 MB |
| Tanks, fairings, interstages, engine mounts (thrust structure and aft heat shield) | 40 000 | 12 000 | 8 000, ≤ 2 MB |
| Adapters | 20 000 | 6 000 | 8 000, ≤ 2 MB |

Scene budgets, checked by T031's WebGL measurement:
- Heavy assembled vehicle at LOD0: ≤ 1 000 000 triangles.
- Build Bay frame at 1920×1080: ≤ 1 800 000 visible triangles and ≤ 600 draw calls with the SRP
  Batcher on.
- WebGL target is 60 fps on a mid-range laptop. Below 45 fps fails (same as T015).

Detail that does not change the silhouette goes into normal maps or the trim sheet, not geometry.

### 2.4 UVs, bakes and exports

- **UV0** is metric tiling (bell faces are angle-normalised). **UV1** is a unique, non-overlapping
  0..1 layout with a margin of ≥ 4 px at bake resolution. No face may lack UV0.
- Each part gets a mask bake on UV1: R ambient occlusion, G edge wear (from curvature), B heat
  mask (engines) or frost mask (tanks), A cavity and grime.
- Phone GLB: everything (albedo with AO and decals, ORM, normal) is baked to one 512² set on UV1
  of the phone LOD, embedded, ≤ 8 000 triangles, ≤ 2 MB.
- **IDs, origins, attach empties and dimensions never change.** A re-export must produce a zero
  diff on attach-point positions and `length_m` / `diameter_*` in `kit_manifest.json`.

### 2.5 Lighting and render standards

- **Blender look-dev**: two scripted, deterministic setups used by every model task.
  - `studio_hdri`: a neutral CC0 HDRI from Poly Haven, a soft shadow-catcher floor and a
    graded navy backdrop with no hard horizon line.
  - `dusk_pad`: a Poly Haven sunset HDRI with the sun 3–8° above the horizon, a 4500 K sun lamp
    aligned to it, and wet concrete from ambientCG that shows reflections.
  - Cycles, at least 256 samples with denoising, AgX (or Filmic) view transform, 35–50 mm lens
    (85–120 mm for tracking shots). Record the exact HDRI slug and URL.
- **Unity URP** (T031 sets this up for every scene):
  - HDRI skybox and ambient for ground and dusk scenes; orbit scenes use sun plus Earth fill.
  - A baked reflection probe per environment zone (256 px WebGL, 512 px desktop; box projection
    indoors).
  - Post-processing starting points:
    - tonemapping: **ACES**;
    - **bloom**: threshold about 1.1 linear, intensity 0.2–0.35, only sun, flame, plasma and
      practicals bloom;
    - **SSAO** renderer feature: intensity 0.5–0.8, radius 0.5 m close-up to 1.5 m wide;
    - **colour grading**: warm white balance at dusk, navy shadows and warm highlights split
      toning, contrast around +8, and navy shadow floor ≥ sRGB 12 (never crushed);
    - **depth of field**: Bokeh, or Gaussian if Bokeh costs > 2 ms on WebGL; close-ups and part
      inspection only;
    - vignette ≤ 0.18;
    - chromatic aberration, motion blur, lens distortion and film grain all off.
  - MSAA 4× (or SMAA High) and no TAA, because it smears gantry lines. Main-light shadows use
    2 cascades on WebGL and 4 on desktop, at 2048 or 4096, with no acne and no peter-panning at
    mating rings.
  - No screen-space reflections, compute shaders or VFX Graph (WebGL 2 constraint, see T015).

### 2.6 Sources and licences

- Allowed: **Poly Haven** and **ambientCG** (CC0), procedural Blender shaders baked to textures,
  OFL fonts for decal lettering. **NASA 3D Resources** models may be used as shape reference or
  as background props only. Attribute them, and never imply NASA endorsement or show NASA
  insignia (ARCHITECTURE.md section 8).
- Not allowed: paid or "editorial use" assets, ripped game assets, AI-generated textures without a
  `assets/media/CREDITS.md` entry, and anything without a stated licence.
- **Record every asset**: name, URL, author, licence, download date, local path and any
  modification.
  - Blender-side assets go in `assets/blender/materials/THIRD_PARTY.md` and in each texture's
    `source` entry in `library.json`.
  - Unity-shipped assets go in `unity/MissionForge/THIRD_PARTY.md`.
- Repository hygiene: no LFS here. No single texture over 8 MB. About 60 MB of new textures per
  task at most. Use JPEG q90 for albedo and ORM, and PNG for normal maps and masks.

## 3. Host UI (Unity UI Toolkit, 1920×1080 reference): the bar

### 3.1 Design system (lives in `unity/MissionForge/Assets/MissionForge/UI/`)

- **Type.**
  - Display face **Oxanium** 600/700, already in the repo under OFL: titles and logo only,
    sentence case.
  - UI and body face **IBM Plex Sans** 400/500/600. Numerals are **tabular**: verify that the
    digit advance widths are equal. If they are not, make an OFL derivative with tabular figures
    as the default, renamed because "Plex" is a Reserved Font Name.
  - IBM Plex Mono only for room codes and code-like identifiers. **No monospace labels and no
    all-caps body text.** Capitals only for identifiers of 3 words or fewer (PDR, LIVE, room
    code), tracked +4 %.

| Token | Size px | Line height | Use |
|---|---|---|---|
| display | 96 | 1.1 | title lockup, end-screen hero |
| h1 | 64 | 1.15 | screen title |
| h2 | 44 | 1.2 | panel title |
| h3 | 36 | 1.25 | card title, option name |
| kpi | 56 / 72 | 1.0 | key numbers (tabular) |
| body | 32 | 1.35 | default |
| label | 24 | 1.3 | **minimum for any text a player must read** |
| meta | 20 | 1.3 | dense table heads and ticks only, never essential |

Units render at 70 % size in Muted, baseline-aligned, with a thin space before them. Negative
numbers use a true minus (U+2212).

- **Spacing.** A 4 px base scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Panel padding 32, gutters 24,
  safe margin 5 % (96 px horizontal, 54 px vertical). **Radii**: 8 for controls, 16 for cards,
  24 for panels, 999 for pills.
- **Elevation.**
  - e0: scene.
  - e1 card: Console at 88 %, a 1 px Ceramic-10 % border, and a 9-slice shadow sprite (24 px
    soft, Space at 40 %).
  - e2 **glass panel**: a blurred copy of the scene behind the panel, then Console at 72–80 %
    and a 1 px Ceramic-16 % top highlight.
  - e3 modal: Space-92 % scrim, an e2 panel and a stronger shadow.
  - e4 toast.

  UI Toolkit has no box-shadow and no backdrop blur. Shadows are 9-slice sprites. Glass samples
  a downsampled, Kawase-blurred camera copy produced by a URP renderer feature (fragment shader
  only, WebGL 2). Never put glass on glass. Glass panels must pass contrast over the brightest
  background in that scene. High-contrast mode makes every panel opaque Console.
- **Iconography.** One open-licence outline family for host and phone (**Lucide, ISC**), 2 px
  stroke at 24 px, sizes 24, 32 and 48, imported as vector images (or 2× PNG). Status keeps its
  shapes: check in a circle (Meets), exclamation in a triangle (Marginal), cross in an octagon
  (Fails). No letter glyphs, dashes or underscores standing in for icons.
- **Motion.** Use these tokens and nothing else:

| Token | Duration | Curve | Use |
|---|---|---|---|
| micro | 120 ms | ease-out-cubic | hover, press |
| state | 200 ms | ease-out-cubic | select, toggle, tab |
| enter / exit | 320 / 220 ms | ease-out-cubic / ease-in-cubic | panels, cards, toasts |
| screen | 600 ms | ease-in-out-cubic | screen transitions |
| count | 900–1200 ms | ease-out-quart | number count-up, tally growth |
| pulse | 1600 ms period | ease-in-out-sine | timer warning (last 5 s only) |
| celebrate | 480 ms | ease-out-back (≤ 6 % overshoot) | success moments only |

List stagger is 40 ms per item, with at most 8 items staggered. In reduced motion, movement
becomes an opacity fade of 150 ms or less, there is no pulse, and count-ups jump to the value.
- **Data visualisation.**
  - **Bars**: 12 px tall, radius 6, Ceramic-10 % track.
    - Fill follows status: Meets is solid, Marginal is 45° hatch, Fails is cross-hatch.
    - The requirement marker is a 2 px line with a triangle cap and a label.
    - The "if chosen" delta is a ghost segment in Signal at 40 % with an arrow, a signed value and
      a unit.
  - **Radial gauges and timer rings**: a 270° arc, 12 px stroke, a threshold tick with its label,
    and the status glyph at the arc end.
  - **Gantt timeline**: 32 px rows, radius 4.
    - The critical path has a solid fill, a 2 px Sunlight outline and a chevron pattern.
    - Slack is drawn as a hollow dotted outline.
    - The deadline is a labelled Fails-coloured line.
    - A "now" marker is shown.
  - **Tallies**: one segment per option with its letter badge and voter dots.
  - **Sparklines**: a 2 px line with an end dot and no axes.
  - **Categorical series**, in this order: Signal #55C5CD, Sunlight #FFCE83, periwinkle #A5B4FC,
    rose #F4A6C6. The last two are proposals that must pass contrast on Console. Each series is
    also told apart by letter or pattern.
- **Empty and loading states.** A skeleton block with a static shimmer, then an explicit
  localised message ("Waiting for the first vote"). **Never show "—", "_", "–– %" or a grey
  stand-in bar in a shipped view.**

### 3.2 Screen rules

- **Readable across a room**: test the 1080p capture downscaled to 33 % (640×360). The screen
  title, every KPI number and every status label must still be legible. If possible, also check
  a real TV or projector from 4 m.
- **Contrast**: WCAG AA. 4.5:1 for body, 3:1 for text ≥ 24 px semibold and for component
  boundaries. Measure over the worst background frame.
- **No debug text in the shipped view**: no design section numbers ("6.3 READINESS"), no
  developer descriptions ("Schedule Gantt · critical path highlighted"), and no corner-bracket
  placeholder labels. No text overflow, clipping or overlap at 100 % or 200 % text, or in RTL.
- **The 3D scene is part of the composition.** Panels sit in the outer 24 % columns. The middle
  52 % shows the lit hardware, and the screen has no giant Earth disc behind the Build Bay rocket.

## 4. Phone UI (React client, 390 CSS px wide): the bar

The phone uses the same language, scaled down.
- **Tokens.** Identical values come from `UI/Theme/tokens.json` (T031 writes it; a later client
  task consumes it). Ship Oxanium and IBM Plex Sans as subset woff2 web fonts instead of
  `system-ui`, and IBM Plex Mono for the room code only.
- **Type.**
  - display 32, h1 24, h2 20, body 16, label 14, meta 12. The meta size is never used for
    essential text.
  - Tabular numerals and sentence case.
  - **No monospace all-caps labels** ("PART VOTE · INSPECT", "CHAMBER PRESSURE"): use 14 px
    Plex Sans semibold in Muted instead.
- **Touch targets** are at least 48×48 px. The primary action is always enabled-looking or
  clearly disabled with a reason, never dark teal on teal. Use at most one bordered container
  level (no card-in-card-in-card). Toasts never cover the part card's key stats.
- **3D part viewer.**
  - Load the textured GLB.
  - Light it with a small PMREM environment from the same Poly Haven HDRI, use ACES tone mapping
    and sRGB output, and add a soft contact shadow.
  - Frame the part so it fills 70 % of the viewer.
  - Do not use a scanline background.
- **Budgets.** First load JS ≤ 250 kB gzip, fonts ≤ 120 kB, 60 fps scrolling on a mid-range
  Android phone.

## 5. Before/after checklist (each item ticked with an evidence image)

3D
- [ ] Flat plastic materials → PBR sets with roughness breakup on every part
- [ ] Geometry-only, sparse panel lines → trim-sheet seams, rivet rows and stringers at believable density
- [ ] Black rectangles and dots as "detail" → modelled hatches, ports and decals
- [ ] Lampshade bells with stacked rings → tube-textured bells, few stiffeners, heat tint, soot where right
- [ ] Primitive spheres and cylinders as pumps → volutes, preburner or GG, gimbal actuators, bellows ducts, flanges
- [ ] Voids between engines and skirts → thrust structure, aft heat shield blanket and engine skirts closing the gaps
- [ ] Orange plastic hydrolox tanks → SOFI foam texture; frost on cryogenic sections (fuelled state)
- [ ] Wood-looking interstage floor and orange "porthole" disc on the fairing → correct materials or removed
- [ ] Hard faceted shading → bevels with weighted normals
- [ ] Split navy-wall / grey-floor studio with harsh light → HDRI look-dev with soft shadows and reflections
- [ ] Budgets, LODs, attach points and IDs unchanged or within the new limits (manifest diff attached)

UI
- [ ] Monospace all-caps everywhere → type scale (Oxanium, Plex Sans, tabular numerals)
- [ ] Dash and underscore placeholders, grey stand-in bars → real data or designed empty states
- [ ] Design section numbers and developer notes on screen → removed
- [ ] Overlapping or overflowing text (phase chips, panel headers, footer notes) → none at 100 %, 200 % or RTL
- [ ] Flat boxes with thin borders → elevation levels, glass over the 3D scene, consistent radii
- [ ] Mixed pill, ellipse and rectangle status chips → one status component (colour + shape + label + border)
- [ ] Hyperlink-style nav tabs → a phase stepper or nav component with clear current, done and locked states
- [ ] Rocket pasted over an Earth disc in the Build Bay → lit pad scene in the middle 52 %
- [ ] No motion → motion tokens applied, reduced-motion variant verified
- [ ] Untuned URP → shared volume profile and lighting rig on every scene

## 6. Review rubric (score 1–5 per item; **nothing ships below 4**)

Anchors:
- **1**: placeholder or debug.
- **2**: works but flat; prototype look.
- **3**: consistent but generic.
- **4**: shippable. It holds up side by side with the reference frame, and an outsider would not
  pick out the difference in quality.
- **5**: showcase quality, as good as the reference.

| # | 3D item | What the reviewer looks at |
|---|---|---|
| M1 | Silhouette and proportion | Unchanged dimensions; readable at LOD1 and in clusters |
| M2 | Material response | PBR under both HDRI setups, roughness breakup, no plastic look |
| M3 | Surface detail | Trim, seams, rivets and stringers where real hardware has them; restrained |
| M4 | Markings | Decals legible, sparse, generic, no logos, no z-fighting at 300 m |
| M5 | Engine fidelity | Section 2.2 checklist met per engine |
| M6 | Edges and normals | Bevels catch light; no shading artefacts |
| M7 | Wear and frost | Subtle, physically placed |
| M8 | Lighting and render | Matches the reference light (warm key, cool fill, unclipped whites) |
| M9 | Technical | Budgets, LODs, UVs, exports, manifest zero-diff, licences recorded |
| M10 | Reference match | Side-by-side with frame 01, 02 or 03 |

| # | UI item | What the reviewer looks at |
|---|---|---|
| U1 | Typography | Scale, faces and tabular numerals; no mono or caps abuse |
| U2 | Layout and rhythm | Spacing scale, alignment, safe regions |
| U3 | Colour and contrast | Palette tokens, AA contrast measured |
| U4 | Surfaces | Elevation, glass, radii, shadows |
| U5 | Icons | One family, no placeholder glyphs, status shapes |
| U6 | Data visualisation | Section 3.1 styles; every number has a unit, status never hue-only |
| U7 | Motion | Tokens, smoothness, reduced motion |
| U8 | Room readability | The 33 % downscale test |
| U9 | Accessibility modes | High contrast, 200 % text, RTL |
| U10 | Polish | No placeholders, overflow or debug text |
| U11 | Reference match | Side-by-side with frame 01, 02 or 06 |

Each task writes `orchestration/evidence/<task>/RUBRIC.md`: one row per item with the score, a
one-line reason and the evidence file. A reviewer subagent that did not do the work fills it in
before the task reports. If any item is below 4, the task reports it under **Not verified /
failing** and does not claim done.
