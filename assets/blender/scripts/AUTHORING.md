# Authoring a kit part (rules for every `mfkit/parts_*.py` module)

Read `mfkit/core.py` (MeshBuilder API), `mfkit/spec.py` (shared dimensions: never hard-code a
dimension that exists there), `mfkit/pipeline.py` (register / PartCtx / validate) and, for
engines, `mfkit/engine_common.py`. `parts_structures.py::gen_adapter` is the worked example.

## Generator contract

```python
def gen_something(ctx):          # called once per LOD (ctx.lod is 0 or 1)
    mb = ctx.mesh()              # MeshBuilder; ctx.mesh("half_a") for separable sub-objects
    ...
    ctx.empty("attach_top", (0, 0, length))
    ctx.meta.update(length_m=..., diameter_bottom_m=..., diameter_top_m=..., ...)

register("part_id", "family", gen_something, "7.x", **params)   # params -> ctx.params
```

- Units metres, +Z up (stack axis), +Y forward. Origin = centre of the bottom mating ring.
  All geometry has z >= 0. Stack parts (everything except boosters) keep all geometry within
  0 <= z <= length_m and the outer skin radius at z = 0 and z = length_m is exactly the stack
  radius (validation tolerance 3 mm). Raised detail (stringers, raceways, bolts, pods) must
  stay at least 0.02 m away from both end planes and must not exceed the skin radius there.
- Material slots, by name only: `hull`, `livery`, `engine_metal`, `nozzle_hot`, `thermal`,
  `detail_dark`, plus the appended T017 and T032 slots (see the T032 section below). Generators
  never create materials or load textures: `mfkit/materials.py` builds every slot from
  `assets/blender/materials/library.json`. `nozzle_hot` faces carry the heat mask (the `heat=`
  argument, 0..1).
- LOD: use `mb.seg(n)` for radial segments and `mb.steps(n)` for lengthwise steps, and wrap
  small detail (bolts, thin pipes, ribs) in `if mb.want(0):` so LOD1 drops it. LOD0 and LOD1
  budgets are per family (T032 section below; 30 000 for families without a row); LOD1 is cut to
  30 % automatically (procedural reduction first,
  decimation only as a fallback, so make LOD1 naturally light).
- Normals: lathe profiles face to the RIGHT of the travel direction in the r-z plane.
  Bottom->top faces outward. Open shells need an inner wall (top->bottom) or they look
  see-through from inside. Hard edges appear automatically at profile corners sharper than
  `crease` degrees.
- meta: always `length_m`, `diameter_bottom_m`, `diameter_top_m`; add `stack=False` or
  `ring_check=False` only where the brief for that family says so; add a `value_types` dict
  tagging numbers `physical`, `real_world_approximate` or `game_value`.

## Test loop (headless; the live Blender session belongs to the lead agent)

    BL=/Applications/Blender.app/Contents/MacOS/Blender
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- preview 'eng_kerolox_*' --views 3q,side,low --size 640 2>&1 | grep -E "PART|ISSUE|DONE|Error|Traceback|File |line "

Views: 3q, side, front, back3q, low, under, top, high. `--lod 1` shows LOD1. Output:
`assets/blender/_build/preview/<id>.png` (git-ignored). Open it and look at it. A part is
done when it prints no ISSUE line, the render looks like release-quality stylised realism
(clean silhouette, believable engineering detail, no z-fighting, no inside-out faces, no
floating pieces) and LOD1 still reads as the same part.

## T017 additions: world and spacecraft parts

Modules: `parts_world.py` (pad and gantry), `parts_world_sites.py` (site props, phone dioramas),
`parts_spacecraft_capsules.py` (capsules, heat shields), `parts_spacecraft_les.py`,
`parts_spacecraft_sat.py`, `parts_spacecraft_landers.py`. Evidence helpers (not part modules):
`parts_world_render.py` (gantry beside a vehicle), `parts_spacecraft_evidence.py` (capsule x shield sheet,
satellite stowed/deployed and the fairing-fit report).

### New material slots (appended after `detail_dark`; Unity maps them by name)

| Slot | Look (style guide recipe, linear RGB, game_value) | Use |
|---|---|---|
| `gantry` | Console navy `#112B40`, metallic 0.20, roughness 0.62 | tower steel, launch mount |
| `concrete` | neutral grey 0.20, metallic 0, roughness 0.88 | decks, trench, buildings' roofs, dunes, cliff rock |
| `ground` | dark olive-grey (0.058, 0.066, 0.052), roughness 0.95 | diorama ground, hills, rail bed |
| `foliage` | deep green (0.040, 0.105, 0.052), roughness 0.80 | palms, treeline, grass |
| `solar_cell` | blue-black (0.018, 0.034, 0.095), metallic 0.25, roughness 0.28 | solar panels, cell strings |
| `heat_shield` | charcoal brown (0.062, 0.046, 0.038), roughness 0.84 | TPS dish, inflatable cover, palm trunks |

Insulation blankets reuse `thermal`; seams and tile mosaics use `detail_dark`.

### Non-stack parts

`pipeline.NON_STACK_FAMILIES` lists the family prefixes (`world_`, `spacecraft_tps`, `spacecraft_sat`,
`spacecraft_lander`, `spacecraft_les_pod`) that are not stack segments: `validate()` skips the `attach_top`
and mating-ring checks for them and instead requires every name in `meta["required_empties"]`. Their
meta carries `stack=False`, `ring_check=False`, `length_m` and `max_diameter_m`. Capsules and the escape
tower are normal stack parts (bottom ring = a kit diameter, `attach_top` at `length_m`).

### Frames

- Pad parts: origin at ground level under the vehicle axis (deck top at `spec.PAD_DECK_H`). Gantry parts:
  origin at ground level under the tower axis, which stands `spec.GANTRY_OFFSET_X` along +X; arms reach -X.
- Capsules: origin at the centre of the bottom mating ring, +Z up; sub-objects `heatshield` and (deep space)
  `service_module`. Shield parts `tps_<type>__<cap id>`: origin at the shield apex, rim plane at
  `meta.depth_m`, empty `capsule_rim`. Phone cards `tps_<type>` show `cap_standard` exploded above the shield.
- Satellite: origin at the separation ring, +Z launch axis, nadir +Y. Stowed pose is in `meta.wing_stow`.
- Landers: origin on the ground under the lander axis; the sky crane is authored with the rover lowered.

## T032 additions: PBR material library, UVs, trim, decals, bakes and budgets

### Slots (append only; Unity maps them by name)

| Slot | Library entry (`library.json` → `materials`) | Use |
|---|---|---|
| `hull` | ceramic satin paint, tint `#E8EEF0`, roughness 0.40–0.55 | stage skins |
| `livery` | teal paint `#176887` | strakes, bands |
| `engine_metal` | brushed steel (ambientCG Metal009), tint `#8F949B`, roughness 0.15–0.42 | pumps, ducts, gimbal hardware |
| `nozzle_hot` | regen tube wall (procedural), graphite `#55504B`, UV u angle-normalised, heat tint | bells, chambers |
| `thermal` | gold MLI quilt | blankets |
| `detail_dark` | dark rubber/composite with roughness breakup | connectors, small boxes |
| `trim` (T032) | shared 2048² trim sheet, rows below | bands and rings mapped onto a row |
| `decal` (T032) | 2048² RGBA atlas, alpha clip 0.5 | conformal decal quads, 3 mm off the skin |
| `foam` (T032) | SOFI, desaturated burnt amber, roughness ~0.8 | hydrolox tanks (T033) |

Library-only variants of `nozzle_hot` (material names in `mb` calls, not new slots, mapped to the
`nozzle_hot` slot in Unity): `nozzle_radiative` (smooth dark radiatively cooled extension with
heat tint) and `nozzle_ablative` (matte carbon-phenolic wrap). `core.VARIANT_SLOTS` lists them.

### `library.json` (version 1)

`uv` (UV0 metric, bells angle-normalised; UV1 unique bake layout), `channel_layout`,
`materials.<slot>` = `{albedo, normal, orm, tiling_m, tint (sRGB hex), metallic [min,max],
roughness [min,max], normal_strength, hero, source [{name,url,licence}], value_type: game_value}`
plus optional `uv_mode` (`angle`, `trim`, `atlas`), `tubes_per_tile`, `heat_tint`, `alpha`.
`trim.rows[]` = `{name, v0, v1}`; `decals.tiles[]` = `{id, rect [u0,v0,u1,v1], size_m [w,h]}`;
`parts.<id>` = `{lod0_mask, lod1_mask, mask_res, mask_b}`. Textures: albedo sRGB (JPEG q90),
ORM linear (R occlusion, G roughness, B metallic, JPEG), normal OpenGL +Y (PNG). Rebuild with
`assets/blender/materials/source/build_library.py -- <ids|all>`; every source is recorded in
`assets/blender/materials/THIRD_PARTY.md`. T017 and T033 append their slots in the same format.

### UVs, trim and decals

- UV0 (`UVMap`): metric (1 unit = 1 m) from `MeshBuilder`; bells pass `tubes=N` to
  `bell_nozzle` so u is angle-normalised and the tube count is constant from throat to exit
  (`TUBES_PER_TILE` = 12 per repeat). Pick N so one tube is about 2.5–4 cm wide at the exit
  (game_value: fewer, wider tubes than the real hardware so they read at Build Bay distance).
- UV1 (`UV1`): added by `uv.add_uv1`, unique, margin 6 px at mask resolution. Validation reports
  faces without UV0 and UV1 overlap above 0.5 %.
- Trim rows: `weld_bead`, `rivet_single`, `rivet_double`, `panel_gap`, `hat_stringer`,
  `bolt_flange`, `bellows`, `braided_hose`, `cable_clamp_strip`, `hinge_latch_strip`,
  `vent_grille`. Pass `trim="<row>"` to `mb.band`, `stiffener`, `harness(braided=True)`.
- Decals: `ctx.decal(tile_id, z, angle, size_m, r_at=...)`. Tiles: fluid bands (`fluid_lox`,
  `fluid_rp1`, `fluid_lh2`, `fluid_ch4`, `fluid_gn2`), `no_step`, `stage_1/2`, `serial_s1/s2`,
  `arm_plug`, `safe_plug`, `hazard_chevrons`, `lift_point`, `cg_marker`. At most about 6 per
  stage-size part, 1–2 per engine. No logos, flags or agency marks.

### Engine rules (VISUAL_TARGET 2.2)

No stacks of evenly spaced hoop rings: at most 2–3 dark stiffeners
(`band_mat="nozzle_hot", stiffener_trim=None`) and an exit manifold where the class has one.
Every engine: turbopump `volute()` with an `inducer()` inlet and a bolt flange, gas generator or
preburner(s) for its cycle, injector dome with gimbal block, two `actuator()`s at 90° (none on
the solid kick motor), at least 4 `duct()`s with 2 bellows and flanged ends (≥ 12 bolts), at
least 8 `harness()` lines with clamps. Kerolox engines set `meta["soot"] = {z0_m, z1_m, strength}`;
the bake writes it into mask A above `materials.SOOT_START`.

### Bakes

`kit.py bake '<pattern>'` writes `materials/bakes/<id>/<id>_lod{0,1}_mask.png` (2048 / 1024 px
for engines): R AO (distance 10 % of the part diagonal), G edge wear, B heat (or frost), A cavity
grime (≤ 0.5) or soot (above 0.82). Only the bake copy is renderable during a pass, so the source
LODs never occlude it. **Re-bake after any geometry change** (UV1 follows the mesh). About 11 s
per engine on the Apple GPU.

### Budgets (VISUAL_TARGET 2.3, game_value)

| Family | LOD0 | LOD1 (and ≤ 30 % of LOD0) | Phone GLB |
|---|---|---|---|
| Engines, boosters | 50 000 | 15 000 | 8 000 tris, ≤ 2 MB |
| Tanks, fairings, interstages, mounts | 40 000 | 12 000 | 8 000 tris, ≤ 2 MB |
| Adapters | 20 000 | 6 000 | 8 000 tris, ≤ 2 MB |

### Exports

`kit.py build` writes the FBX (custom normals, tangents, UV0 and UV1, materials named by slot),
the phone GLB (`phone_bake.py`: one 512² albedo/ORM/normal set on UV1, alpha MASK for decals,
embedded) and the `.blend`. `kit.py attachdiff '<pattern>'` must print `SAME` for every part:
attach points, `length_m` and diameters never change. `kit.py t032 sheets|cluster|table|manifestdiff`
writes the T032 evidence. Look-dev for previews: `--lookdev studio|dusk` (Cycles, AgX).
