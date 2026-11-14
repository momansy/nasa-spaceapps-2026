Every visual task must meet orchestration/VISUAL_TARGET.md

# T033: Model fidelity pass, part 2: tanks, mounts, interstages, fairings, boosters, adapters

**Worker:** `cyrex04` (Blender MCP, Unity MCP) · **Starts after:** T032 is merged to `main` (it
provides the material library, UV, trim, decal and bake tooling). If `yousuf-amek` is free
first, the orchestrator may give it this task instead; the brief is the same.

mesh-model: sonnet
mesh-effort: high

**Owns** (for the 86 non-engine kit parts: 20 tanks, 24 engine mounts, 30 interstages,
4 fairings, 2 strap-on boosters, 6 adapters):
- `assets/blender/scripts/mfkit/parts_tanks.py`, `parts_structures.py`, `parts_fairings.py`,
  `parts_boosters.py`, and the mount generator functions wherever they live (including inside
  the engine modules; leave the engine generators alone).
- `mfkit/spec.py`, append only (for example `ox_fraction` per tank family, tagged `game_value`).
- Additive changes to `mfkit/materials.py`, `decals.py`, `bake.py`, `lookdev.py`, `beauty.py`
  and `evidence.py`.
- `assets/blender/materials/`: new library entries, bakes and sources, plus additions to
  `THIRD_PARTY.md` and `library.json`. Never change an existing entry's meaning.
- For those 86 ids: `assets/blender/<id>.blend`, `assets/blender/export/fbx/<id>.fbx`,
  `client/public/models/<id>.glb` and their `kit_manifest.json` entries.
- `assets/blender/_assembly_test.blend`.
- `orchestration/evidence/T033/`.

**Do not touch:**
- `unity/`. T031's `KitMaterialLibraryImporter` pulls your data; you may run it in a local
  scratch checkout to check it, and commit nothing under `unity/`.
- Engine geometry (T032).
- `parts_world*.py` and `parts_spacecraft*.py` (T017).

If T017 runs at the same time, change `pipeline.py` and `core.py` only for budget-table entries,
and coordinate through the orchestrator.

**Read first:**
- `orchestration/VISUAL_TARGET.md` (all of section 2 and the rubric).
- The T032 brief, section "Interface this task provides", and the updated
  `assets/blender/scripts/AUTHORING.md`.
- `assets/media/style/STYLE_GUIDE.md`.
- The frames `assets/media/style/frames/01-title.png`, `02-build-bay.png` and `03-ascent.png`.
- The T009 sheets in `orchestration/evidence/T009/` (tank, mount, interstage, fairing, booster,
  adapter) and the three `beauty_*.png` renders.
- T032's engine evidence; match its finish.
- `GAME_DESIGN.md` 7.5, 7.6, 7.9, 7.11 and 7.12.

Work one family at a time. **Finish, validate, bake, export and render a family before you start
the next.** Inside a family, perfect one "golden" part, score it against the rubric (every item
≥ 4), then apply the same approach to its siblings. Use at most one subagent, for the final
review.

## Goal

The stage hardware has to match the engines from T032. Today:
- the stage skins are flat white plastic with black rectangles as "detail";
- the hydrolox tanks are orange plastic;
- black voids show between the engines and the skirts;
- the hot-staging floors look like wood;
- the fairing carries an unexplained orange disc.

Bring all 86 parts to the VISUAL_TARGET bar with T032's library. The finished assembled
vehicles must hold up in hero renders next to `02-build-bay.png` and `03-ascent.png`. IDs,
origins, attach points and dimensions do not change.

## Steps (in order)

1. **Preflight.**
   - Confirm the T032 tooling works on `main`: `kit.py preview --lookdev studio`, `kit.py bake`,
     and the library loads.
   - Save `evidence/T033/manifest_before.json` for the 86 ids.
   - Render the "before" contact sheets per family under `studio_hdri` into `before/`.
2. **Tanks (20).** Golden part: `tank_s1_m`, then `tank_s1_m_hydrolox`.
   - Painted variants:
     - circumferential and longitudinal weld beads from the trim sheet;
     - raceway and cable tray with clamp strips;
     - a modelled access panel with a bolt ring, replacing the black rectangles;
     - LOX vent, fill and drain ports;
     - sparse decals (fluid ID band, stage marking, serial).
   - Hydrolox variants: the `foam` material (SOFI) on the insulated barrel, bare ring frames and
     feedlines in `engine_metal` or `hull`, and foam ramps at protrusions.
   - **Frost**: the B channel of the mask holds the oxidiser-section frost mask (the height from
     `spec.ox_fraction`) and the cryogenic feedlines. The material has a `frost` amount from 0 to
     1. Painted LOX sections take full rime; foam takes only light frost at bare metal.
   - Render "dry" and "fuelled" states.
   - Export, then the family before/after sheet `tanks_before_after.png`.
3. **Engine mounts (24).** Golden part: `mount_s1_9_d37`.
   - A thrust structure (thrust puck or octaweb-style beams with bolted gussets).
   - An aft heat shield with a quilted blanket (`thermal`) and engine boots around each engine
     position.
   - A skirt with stringers and rivet rows from the trim sheet, hold-down points and a T-0
     umbilical plate.
   - **No visible voids** between the skirt and the engines in any view, including the existing
     `*_engines.png` angles.
   - Engine positions and attach empties stay exactly where they are.
4. **Interstages (30).** Golden parts: `interstage_pyro_d37`, `interstage_pneumatic_d37` and
   `interstage_hot_staging_d37`.
   - Composite or aluminium skin with fastener rows and a separation-plane seam (trim).
   - Separation hardware that reads correctly for each system: pyro uses a frangible joint line
     and the existing pods restyled as retro motors with fairings; pneumatic uses pusher
     housings; hot staging keeps the truss with bolted nodes and vent openings.
   - The hot-staging floor becomes an ablative heat-shield plate (charcoal, matte, per the style
     guide recipe), not wood.
   - Soot only on hot-staging vents.
5. **Fairings (4).** Golden part: `fairing_standard`.
   - A separation-rail seam with fastener rows, acoustic vents, an access door with a hinge strip
     and a payload-access decal.
   - A nose cap with a thermal tip.
   - Remove the orange disc and the floating black squares, or replace them with real modelled
     features.
   - The halves stay separable, with their hinges intact.
6. **Strap-on boosters (2).**
   - Segmented case field joints (pin rows from the trim sheet).
   - An aft skirt with 2 TVC actuators.
   - A carbon-phenolic nozzle with the ablative look from T032's library.
   - Forward and aft attach struts with a ball-joint fitting.
   - A nose cone with a separation-motor ring.
   - Soot at the aft skirt only.
7. **Adapters (6).** Ring frames, rivet rows, a stage-transition decal band and bevels. These
   are quick, so batch them.
8. **Hero vehicle renders.**
   - Rebuild `_assembly_test.blend` with the three seeded vehicles (small pyro d15, medium hot
     staging d37, heavy pneumatic d54) using all-new parts and T032's engines.
   - Under `dusk_pad`, at 1920×1080:
     - each vehicle framed like `02-build-bay.png`: centred in the middle 52 %, 35–50 mm lens,
       low camera, wet ground reflections;
     - each vehicle fuelled with frost on;
     - one tracking shot like `03-ascent.png` (85–120 mm against the dusk sky; no plume is
       needed, and do not fake one);
     - one lineup.
   - Compose `hero_<vehicle>_vs_frame02.png` and `ascent_vs_frame03.png` side by side.
9. **Export check and documentation.**
   - Re-export all 86 parts: FBX, GLB (≤ 8 000 triangles, ≤ 2 MB, 512² baked set) and `.blend`.
   - Diff `kit_manifest.json` against `manifest_before.json`: no change to attach points or
     dimensions. Save `manifest_diff.txt`.
   - Re-run `assemble.py`'s joint report: every mating ring within 3 mm.
   - Update `AUTHORING.md` with the per-family detail rules (frost mask, foam, mounts).
10. **Review.** One reviewer subagent fills `evidence/T033/RUBRIC.md` (items M1–M10) per family
    and for the hero renders. Anything below 4 is fixed or reported as failing.

## Acceptance

- All 86 parts validate within the VISUAL_TARGET 2.3 budgets. Every face has UV0, UV1 has no
  overlaps, and each part has a mask bake.
- Every part uses library materials, and no flat-colour material remains. Cryogenic sections
  carry the frost mask, and hydrolox tanks use `foam`. No voids show at the engine mounts.
  Decals are generic, with no logos.
- FBX and GLB are re-exported with the same IDs. `manifest_diff.txt` shows no change to attach
  points or dimensions. The joint report shows all rings ≤ 3 mm.
- Every new source is recorded in `assets/blender/materials/THIRD_PARTY.md` and
  `library.json`.
- `RUBRIC.md` shows every item ≥ 4, or the shortfall is reported plainly.
- Evidence in `orchestration/evidence/T033/`:
  - before and after contact sheets per family;
  - the tank dry and fuelled pair;
  - mount close-ups from the old `*_engines.png` angles;
  - three hero renders plus their side-by-sides against frame 02;
  - the ascent shot against frame 03;
  - the lineup;
  - the triangle table, `manifest_diff.txt`, the joint report and `RUBRIC.md`.
