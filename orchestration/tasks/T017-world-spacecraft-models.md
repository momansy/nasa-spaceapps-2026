# T017 — World and spacecraft models (package G2 part 1, with the G1 payload parts)

**Worker:** `cyrex04` (Blender MCP, Unity MCP) · **Starts after:** T009 (queue behind it;
best after T009 is merged to `main`)

mesh-model: sonnet
mesh-effort: high

**Owns:** `assets/blender/scripts/mfkit/parts_world*.py`, `assets/blender/scripts/mfkit/parts_spacecraft*.py`,
and for the part ids this task creates: `assets/blender/<id>.blend`,
`assets/blender/export/fbx/<id>.fbx`, `client/public/models/<id>.glb`, their entries in
`assets/blender/kit_manifest.json`; plus `orchestration/evidence/T017/`.
**Narrow edits allowed** (T009 has finished with them; keep each change small and additive):
`mfkit/pipeline.py` (add your modules to `PART_MODULES`; a family-based exemption in
`validate()` for non-stack world parts), `mfkit/core.py` `SLOTS` and `pipeline.MATERIAL_LOOK`
(append new slots only, never change existing ones), `mfkit/spec.py` (append new sections),
`scripts/AUTHORING.md` (append a section). Do not touch `unity/`; Unity import is T015's job.

This is a $20 plan: keep runs short. **Finish, validate and export one family before you
start the next**, in the order below. Use at most one subagent, for the final review.

## Read first

`assets/blender/scripts/AUTHORING.md` (the contract for every part module),
`mfkit/core.py`, `mfkit/spec.py`, `mfkit/pipeline.py`, `parts_fairings.py` (separable halves
with hinge empties) and `parts_boosters.py` (`stack=False` parts with side attach empties);
`assets/media/style/STYLE_GUIDE.md` (materials table, hardware continuity: the observation
satellite design, the blunt capsule); `GAME_DESIGN.md` 6.1, 6.10, 7.1 to 7.4; `data/README.md`
for the part ids.

## Standard (same as the kit)

Metres, +Z up, +Y forward in Blender; FBX export to `assets/blender/export/fbx/` and GLB to
`client/public/models/` exactly as T009 left the pipeline (check `pipeline.FBX_DIR`; if it
still points into `unity/`, stop and report, do not write into `unity/`). File name = id.
Host LOD0 ≤ 30 000 triangles, LOD1 ≤ 30 %; phone GLB ≤ 8 000 triangles and 2 MB. Stylised
realism, clean silhouettes, restrained bevels, no greebles, no logos or text. Every
dimension you add goes into `spec.py` with a `value_types` tag (`physical`,
`real_world_approximate` or `game_value`) and, where real hardware inspired it, a comment
naming the class (for example "Orion class, 5.0 m").

New material slots (append; document each with its style-guide recipe in `AUTHORING.md`
and list them under **Interface changes**, since Unity must map them):
`gantry` (Console navy structure), `concrete`, `ground`, `foliage`, `solar_cell`,
`heat_shield`. Use existing slots everywhere else (`thermal` for insulation blankets).

## Families, in order

1. **Launch pad and gantry** (needed first: T015 may import them). Non-stack world parts,
   `stack=False`, origin at ground level under the vehicle axis:
   `world_pad_deck` (deck, launch mount opening, hold-down clamps, empty `vehicle_base` at
   deck height on the axis), `world_flame_trench` (concrete trench and deflector, mates
   under the deck), `world_gantry_base`, `world_gantry_segment` (stackable, 6.0 m tall,
   `game_value`, empties `attach_top`), `world_gantry_crown` (crane head and lightning
   rod), `world_crane_arm` (empties `pivot` and `hook`), `world_umbilical_arm` (empties
   `pivot` and `tip`), `world_crew_access_arm`, `world_lightning_mast`. The gantry stands
   beside the vehicle axis at a clearance that fits an 8.4 m core plus strap-ons
   (record the offset in `spec.py`). Evidence: one render of a gantry stacked to 60 m
   beside an assembled kit vehicle from `assemble.py`.
2. **Launch-site prop sets (7.1), modest detail** (≤ 5 000 triangles per prop): small
   prop sets that make each site recognisable from the Build Bay camera without drawing
   the eye: equatorial (palm clusters, humid treeline, low assembly hall), subtropical coast
   (dunes and beach grass, water tower, lightning masts, large generic assembly building),
   west-coast polar (coastal hills and cliff edge, blockhouse), inland steppe (flat grass
   tufts, rail line with an erector car, drop-zone marker). Name them `world_site_<site>_<prop>`.
   For each launch-site id (`site_equatorial_spaceport`, `site_subtropical_coast`,
   `site_west_coast_polar_range`, `site_inland_steppe_cosmodrome`) export a phone diorama
   GLB `client/public/models/<site id>.glb` (pad plus that site's props, ≤ 8 000
   triangles) for the part card viewer.
3. **Capsules (7.2.2) and heat shields (7.3).** `cap_compact`, `cap_standard`,
   `cap_deep_space` (with its service module as a separable sub-object `service_module`
   and its own radiators and solar wings). Blunt capsule shape, heat-shield face
   downward, mating ring at the bottom that matches a kit stack diameter (suggested
   `game_value` targets: compact on 3.7 m, standard and deep-space 5.0 m capsules on a
   5.4 m ring; check against `spec.DIAMETERS` and the kit adapters). Empties: `attach_top`
   (docking ring / escape tower mount), `attach_pod_1..4` (pusher pods), `parachute_bay`.
   The heat shield is a separable sub-object `heatshield`; the four shield types
   (`tps_avcoat_ablator`, `tps_pica_ablator`, `tps_reusable_ceramic_tiles`,
   `tps_inflatable_decelerator` with its inflated torus stack) are generated per capsule
   base diameter as `tps_<type>__<cap id>` meshes for Unity, and as one phone GLB each,
   `client/public/models/<tps id>.glb`, shown on `cap_standard`.
4. **Launch escape (7.4).** `les_escape_tower` (tractor tower on `attach_top`, nozzle ring
   canted outward, jettison motor), `les_integrated_pusher` (four side pods for
   `attach_pod_1..4`, `stack=False`), `les_ejection_seats` (a single seat for the part card).
5. **Earth-observation satellite (7.2.1).** One compact insulated bus, nadir aperture and a
   separate communications antenna, matching the style guide's satellite (it is the design
   anchor for key art and the C1 briefing). Power variants as separate ids:
   `satpwr_body_mounted_solar_cells` (cells on the bus, no wings),
   `satpwr_deployable_solar_wings` and `satpwr_large_deployable_array` (wings as sub-objects
   `wing_l`, `wing_r` with hinge empties `hinge_wing_l/r`, authored deployed, with the stowed
   angle in meta so Unity and the phone can animate MG-15). Origin at the separation ring,
   `stack=False`; empties `aperture` and `antenna` with the nadir axis in meta. Stowed it
   must fit inside `fairing_small` (check against `spec.FAIRINGS`, leave clearance).
6. **Mars landers (7.2.3).** `lander_airbag` (tetrahedral petals with inflated airbag
   cluster), `lander_legged` (three legs, deck, round solar arrays), `lander_sky_crane`
   (descent stage and rover as sub-objects `descent_stage`, `rover`, empty `bridle`).

Instrument modules (four `inst_*` ids) and a Mars aeroshell are a follow-up, not this task.

## Acceptance

- `kit.py build` validates every id above with no ISSUE line; `.blend`, FBX and GLB exist
  at the owned paths within budget; `kit_manifest.json` lists them with attach points.
- Existing kit parts still build and validate unchanged (run `kit.py build` for one engine
  and one tank before and after your pipeline edits).
- Renders look like release-quality stylised realism with the style-guide materials.
- Evidence in `orchestration/evidence/T017/`: one contact sheet per family
  (`kit.py sheets <family> --out orchestration/evidence/T017`; the default writes to T006),
  the gantry-beside-vehicle render, each capsule with each shield, satellite stowed and
  deployed, and a triangle-count table. Report families not reached as not done.
