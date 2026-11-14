Every visual task must meet orchestration/VISUAL_TARGET.md

# T032: Model fidelity pass, part 1: PBR material library and the 11 engines

**Worker:** `cyrex04` (Blender MCP, Unity MCP) · **Starts:** now, before any other Blender work
queued for this worker (it goes ahead of T017).

mesh-model: sonnet
mesh-effort: high

**Owns:**
- `assets/blender/materials/` (create: library, textures, HDRIs, sources, bakes,
  `THIRD_PARTY.md`).
- `assets/blender/scripts/mfkit/` (`core.py`, `pipeline.py`, `studio.py`, `beauty.py`,
  `evidence.py`, `engine_common.py`, `parts_engines_s1.py`, `parts_engines_s1b.py`,
  `parts_engines_s2.py`, plus new `materials.py`, `lookdev.py`, `uv.py`, `bake.py`,
  `decals.py`).
- `assets/blender/scripts/AUTHORING.md` and `assets/blender/scripts/kit.py`.
- For the 11 engine ids only: `assets/blender/<id>.blend`, `assets/blender/export/fbx/<id>.fbx`,
  `client/public/models/<id>.glb` and their `kit_manifest.json` entries.
- `orchestration/evidence/T032/`.

**Do not touch:**
- `unity/`. Unity imports through T031's `KitMaterialLibraryImporter`. If that menu exists on
  `main`, you may run it in a local scratch checkout to check your data, but commit nothing
  under `unity/`.
- Mount, tank, structure, fairing and booster geometry; that is T033. Engine-mount generators
  that live in the engine modules keep their geometry.
- `parts_world*.py` and `parts_spacecraft*.py` (T017).

**Read first:**
- `orchestration/VISUAL_TARGET.md`, sections 1, 2 and 6.
- `assets/media/style/STYLE_GUIDE.md`, materials and lighting.
- The frames `assets/media/style/frames/01-title.png` and `02-build-bay.png`.
- The current renders in `orchestration/evidence/T009/` (`contact_sheet_engine_s1.png`,
  `contact_sheet_engine_s2.png`, `*_engines.png`).
- `assets/blender/scripts/AUTHORING.md`; `mfkit/core.py` (`MeshBuilder.lathe` already writes
  metric UVs through `uv_scale`); `mfkit/pipeline.py`; `mfkit/engine_common.py`.
- `GAME_DESIGN.md` 7.7 and 7.8 (engine classes).

This is a long task on a smaller model. **Do one step at a time, verify it, then move on.**
Every step leaves the generator running, every part validating and the exports loadable. Use at
most one subagent, for the final review.

## Goal

The engines are the hero close-ups of the game. Today they are smooth bronze cones with stacked
hoop rings, chrome primitives for pumps and flat plastic materials under a harsh grey studio.
Build the shared PBR material library that every kit part will use, then remake all 11 engines
to VISUAL_TARGET 2.2. They must hold up next to the bells in frames 01 and 02. IDs, origins,
attach points and dimensions do not change.

## Interface this task provides (T031 and T033 depend on it)

```
assets/blender/materials/
  library.json                       # the contract below
  THIRD_PARTY.md                     # every downloaded or derived asset: name, URL, author, licence, date, path, changes
  hdri/<slug>_2k.hdr                 # Poly Haven, CC0 (studio + dusk)
  textures/<material_id>/<material_id>_{albedo.jpg, normal.png, orm.jpg}
  trim/mf_trim_01_{albedo.jpg, normal.png, orm.jpg}           # 2048²
  decals/mf_decals_01_{albedo.png (RGBA), normal.png, orm.jpg} # 2048²
  bakes/<part_id>/<part_id>_lod{0,1}_mask.png                 # UV1: R AO, G edge wear, B heat|frost, A grime
  source/*.blend                     # procedural shaders used to bake textures
```

`library.json` (version 1):
- `"uv"`: `{"uv0": "metric, 1 unit = 1 m; bells angle-normalised", "uv1": "unique 0..1 bake layout"}`
- `"materials"`: for each slot name, an object with:
  - `albedo`, `normal`, `orm` (relative paths);
  - `tiling_m` (metres per texture repeat);
  - `tint` (sRGB hex);
  - `metallic` and `roughness` ranges;
  - `normal_strength`;
  - `hero` (bool, which sets the 2K import);
  - `source` (a list of `{name, url, licence}`);
  - `value_type`: `"game_value"`.
- `"trim"`: `{"textures": {...}, "rows": [{"name": "weld_bead", "v0": 0.0, "v1": 0.0625}, ...]}`
- `"decals"`: `{"textures": {...}, "tiles": [{"id": "fluid_lox", "rect": [u0, v0, u1, v1], "size_m": [w, h]}, ...]}`
- `"parts"`: `{"<part_id>": {"lod0_mask": "...", "lod1_mask": "...", "mask_res": 2048, "mask_b": "heat"}}`

**Slots.** The six existing slots keep their names and their meaning. Append only these:
- `trim`: the trim-sheet strips;
- `decal`: alpha-clipped atlas quads, offset 3 mm along the normal;
- `foam`: spray-on foam insulation, used by T033 on hydrolox tanks.

List them under **Interface changes**. T017 (queued) must append its slots in the same
`library.json` format; tell the orchestrator so its brief can be amended.

## Steps (in order)

1. **Preflight.**
   - Run `kit.py preview 'eng_*'` headless (AUTHORING.md test loop). Confirm no ISSUE lines.
   - Save `evidence/T032/manifest_before.json`, a copy of the 11 engine entries from
     `kit_manifest.json`.
2. **Look-dev setups.**
   - Download two Poly Haven CC0 HDRIs at 2K into `materials/hdri/`: a neutral studio and a
     low-sun sunset. Record their slugs and URLs.
   - Write `mfkit/lookdev.py` with `setup_studio_hdri(scene)` and `setup_dusk_pad(scene)` per
     VISUAL_TARGET 2.5. `dusk_pad` uses ambientCG wet concrete and a 4500 K sun aligned to the
     HDRI sun.
   - Add `--lookdev studio|dusk` to `kit.py preview` and the sheets.
   - Render the **"before" set**: the 11 current engines under `studio_hdri`, 3q and low views at
     1024 px, into `evidence/T032/before/`.
   - Check: the images render and show no hard horizon line.
3. **UVs.**
   - Write `mfkit/uv.py`.
   - Every face gets UV0: metric from the lathe; for bells, u is angle-normalised (constant
     repeats around the circumference) and v is metric along the meridian; box or cylinder
     projection in metres for non-lathe faces.
   - UV1 is a unique layout (Smart UV Project or lightmap pack) with a margin ≥ 4 px at mask
     resolution.
   - Add validation issues for "face without UV0" and "UV1 overlap > 0.5 %".
   - Check: all 11 engines validate, and a UV checker render looks even.
4. **Library skeleton and the first three materials.**
   - Write `mfkit/materials.py`. It loads `library.json` and builds the slot materials
     (Principled BSDF with image textures, UV0 mapping scaled by `tiling_m`, and the mask on
     UV1 multiplied into AO and roughness). It replaces the flat `MATERIAL_LOOK` default but
     keeps `MATERIAL_LOOK` as the fallback tint.
   - Author `hull` (ceramic satin paint), `engine_metal` (brushed steel, directional) and
     `detail_dark`. Use ambientCG or Poly Haven CC0 sources, tinted to the style guide.
   - Write `library.json` v1 and `materials/THIRD_PARTY.md`.
   - Check: a render of one engine in both look-dev setups.
5. **Remaining materials.**
   - `nozzle_hot`: a regen tube-wall bell. Make a procedural Blender shader for tubes, braze
     seams and heat tint, bake it to a tileable 2048² set, and keep the source in `source/`.
     Also make radiative and carbon variants as separate materials: `nozzle_radiative` and
     `nozzle_ablative` exist only as library entries mapped from the engine's params, not as
     new slots.
   - Also author `livery` (teal paint), `thermal` (gold MLI quilt) and `foam` (SOFI, desaturated
     burnt amber with a cell normal, roughness about 0.8).
   - Check: one material ball per entry under `studio_hdri`, combined into
     `evidence/T032/material_library_sheet.png`.
6. **Trim sheet.**
   - Make `trim/mf_trim_01_*`, 2048², with the rows listed in VISUAL_TARGET 2.1, baked from a
     procedural source.
   - Add a `trim="<row>"` option to the band and ring helpers in `MeshBuilder` / `engine_common`,
     mapping the face v into the row's range.
   - Check: the trim sheet image, plus a render of an engine flange and bellows using it.
7. **Decal atlas.**
   - Make `decals/mf_decals_01_*`, 2048² RGBA, with the tiles listed in VISUAL_TARGET 2.1.
     Lettering uses an OFL stencil font (record it). No logos.
   - Write `mfkit/decals.py` with `ctx.decal(tile_id, z, angle, size_m)`. It creates quads that
     conform to the skin, use the `decal` slot, sit offset 3 mm, appear at LOD0 and LOD1, and are
     kept out of attach-plane clearance.
   - Check: the atlas, plus a render with two decals and no z-fighting.
8. **Bakes.**
   - Write `mfkit/bake.py`: a headless Cycles mask bake per part and LOD onto UV1. R is AO, G is
     edge wear (from curvature or pointiness, kept subtle), B is the heat mask from the existing
     `nozzle_hot` heat values, and A is cavity.
   - Engines bake at 2048 for LOD0 and 1024 for LOD1. Add `kit.py bake <pattern>`.
   - Check: the masks for one engine look correct, and bake time per part is stated.
9. **Golden engine: `eng_kerolox_workhorse`.**
   - Rebuild it to VISUAL_TARGET 2.2:
     - bevels (Bevel modifier, angle limit, widths per 2.1) and weighted normals, applied before
       export;
     - a tube-wall bell with at most 2–3 stiffeners and soot at the exit;
     - a turbopump volute;
     - a gas generator and its exhaust duct;
     - 2 gimbal actuators at 90°;
     - at least 4 ducts with bellows and bolted flanges;
     - at least 8 harness lines with clamps;
     - 1–2 small decals.
   - Change the budgets in `pipeline.py` from the flat `HOST_TRI_BUDGET` to the per-family
     table in VISUAL_TARGET 2.3.
   - Check:
     - it validates, LOD0 ≤ 50k and LOD1 ≤ 15k;
     - it renders in both look-devs (3q, low, side, plus a powerhead close-up);
     - it appears side by side with T009's version and with the bell detail of frame 01;
     - score items M1–M8 yourself. **Stop and fix until each is ≥ 4 before you copy the
       approach to other engines.**
10. **The other 10 engines, one at a time**, in this order:
    1. giant (turbine exhaust manifold, film-cooled extension);
    2. staged combustion (two chambers, one oxidiser-rich preburner);
    3. hydrolox high efficiency (dense tube wall, steer-horn feed lines);
    4. methalox full flow (two preburners, two pumps, clean bell);
    5. electric-pump mini (motor housings, inverter box, printed-metal look);
    6. hydrolox vacuum (tube-wall chamber plus a dark carbon extension);
    7. kerolox vacuum (regen chamber plus a radiative extension with heat tint);
    8. methalox vacuum;
    9. hypergolic storable (ablative chamber, radiative extension, valve-heavy injector top);
    10. solid kick motor (titanium or composite case with a weld or flange seam, a
        carbon-phenolic nozzle, no actuators; replace the orange ball).

    After **each** engine: validate, bake, render `after/<id>_3q.png` and `after/<id>_low.png`
    under `studio_hdri`, and export (step 11) before starting the next. A cut-off run then
    still leaves finished engines.
11. **Export (per engine, and again for all at the end).**
    - FBX to `assets/blender/export/fbx/<id>.fbx`: custom normals, tangents, UV0 and UV1,
      materials named by slot.
    - GLB to `client/public/models/<id>.glb`: the phone LOD with ≤ 8 000 triangles, everything
      baked to one 512² set on UV1 (albedo with AO and decals, ORM, normal), ≤ 2 MB.
    - The `.blend` source.
    - Then diff `kit_manifest.json` against `manifest_before.json`. **Attach-point positions,
      `length_m` and the diameters must be identical.** Save `manifest_diff.txt`.
    - Add the GLB texture provenance line to `client/public/models/README.txt`.
12. **Evidence and review.**
    - New contact sheets `contact_sheet_engine_s1.png` and `contact_sheet_engine_s2.png` under
      `studio_hdri`, next to the T009 ones (`engines_before_after_s1.png` and `_s2.png`).
    - A 9-engine cluster close-up under `dusk_pad`, side by side with frame 02
      (`engines_cluster_vs_frame02.png`).
    - The triangle and texture-size table.
    - Update `AUTHORING.md`: the slot table, the `library.json` format, the UV, trim, decal and
      bake rules, and the new budgets.
    - One reviewer subagent fills `evidence/T032/RUBRIC.md` (items M1–M10) for the engines.

## Acceptance

- All 11 engines validate with no ISSUE lines, within the 2.3 budgets. Every face has UV0, and
  UV1 has no overlaps.
- Every engine meets the VISUAL_TARGET 2.2 checklist. The reviewer confirms it per engine in
  `RUBRIC.md`, with every item ≥ 4.
- The library has every slot (the six existing plus `trim`, `decal`, `foam`) with full PBR sets
  and recorded sources and licences. `THIRD_PARTY.md` is complete, and texture sizes follow
  VISUAL_TARGET 2.6.
- FBX and GLB are re-exported with the same IDs. `manifest_diff.txt` shows no change to attach
  points or dimensions. Every GLB is ≤ 8 000 triangles and ≤ 2 MB.
- Evidence in `orchestration/evidence/T032/`:
  - `before/` and `after/` renders for all 11 engines;
  - the two before/after contact sheets;
  - `material_library_sheet.png`, the trim sheet and the decal atlas previews;
  - the cluster render against frame 02;
  - the triangle table, `manifest_diff.txt` and `RUBRIC.md`.
