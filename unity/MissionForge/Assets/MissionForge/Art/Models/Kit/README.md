# Rocket kit models (Unity copy)

The one art root for kit models in the host. Source of truth: the procedural generator in
`assets/blender/scripts/` (tasks T006/T009). Unity FBX exports land in
`assets/blender/export/fbx/`; `MissionForge/Art/Sync Rocket Kit` (also run by
`MissionForge/Rebuild Scenes And Assets`) copies them here, overwriting files of the same name
so `.meta` GUIDs and scene references survive.

- Import: `RocketKitModelPostprocessor` sets scale 1 (1 unit = 1 m, FBX written in cm with
  Convert Units on), bakes the axis conversion (+Y up, identity root), and replaces the six
  kit material slots (`hull`, `livery`, `engine_metal`, `nozzle_hot`, `thermal`,
  `detail_dark`) with the URP materials in `Art/Materials/Kit/` (STYLE_GUIDE.md recipes).
  Each FBX holds `<id>_LOD0` and `<id>_LOD1`; Unity builds the LOD group from the suffixes.
- `demo.vehicle.json`: a two-stage 3.7 m vehicle with two solid strap-ons
  (62.55 m, presentation only, `game_value` layout) used on the Build Bay pad and the title.
  Positions are kit coordinates (Blender +Z up); `KitVehicleAssembler` maps them to Unity as
  `(-x, z, -y)`.

**Interim files (T008, 2026-11-14):** the nine FBX files of the demo vehicle besides
`adapter_d54_to_d37.fbx` were exported by running the unmodified kit generator from a scratch copy
outside the repository (all parts validated, 17/17 joints with 0 m gap) because T009 had not yet
published `assets/blender/export/fbx/`. When T009 exports, the sync replaces them.
