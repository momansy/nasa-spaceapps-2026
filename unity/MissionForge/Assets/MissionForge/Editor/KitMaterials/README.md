# Kit material pipeline (T031 step 7)

Brings the shared PBR kit material library that T032 exports from Blender into Unity. The
contract is in `orchestration/tasks/T032-model-fidelity-materials-engines.md`, section
"Interface this task provides". The quality bar is in `orchestration/VISUAL_TARGET.md` 2.1 and 2.4.

**Status:** awaiting T032 data. `assets/blender/materials/library.json` does not exist yet, so
the shaders and the importer have been tested only against the fixture library in `Fixtures~/`.

## Files

| Path | Purpose |
|---|---|
| `Art/Shaders/MF_KitLit.shader` (`MissionForge/KitLit`) | Kit PBR shader: UV0 tiling set plus the UV1 part mask |
| `Art/Shaders/MF_KitDecal.shader` (`MissionForge/KitDecal`) | Lit, alpha-clipped decal-atlas quads with a polygon offset |
| `Art/Shaders/Kit/*.hlsl` | Shared inputs (`UnityPerMaterial`), the forward pass, and the shadow/depth/depth-normals passes |
| `Editor/KitMaterials/KitMaterialLibraryImporter.cs` | Menus, the batch entry points and `Import(...)` |
| `KitLibraryParser.cs`, `KitLibraryData.cs` | Read and validate `library.json` v1 |
| `KitTextureSync.cs` | Copy textures and set their import settings |
| `KitMaterialWriter.cs`, `KitMaterialEdit.cs` | Create or update materials and variants in place |
| `KitPartSlots.cs`, `KitPartMaskMap.cs` | The per-part mask strategy and its map |
| `Fixtures~/` | The test library (the `~` folder is not imported by Unity) |
| `Tests/` | EditMode tests (`MissionForge.KitMaterials.Tests`) |

We wrote the shaders by hand in URP 17.6 HLSL. The brief asked for a Shader Graph, but Shader
Graph files cannot be authored reliably by hand. Writing HLSL also keeps the WebGL 2 keyword set
small. The passes are `UniversalForward`, `ShadowCaster` (lit only), `DepthOnly` and
`DepthNormals` (SSAO needs it). Both shaders use `#pragma target 3.5`, no compute, and
`multi_compile_instancing`. They do not support lightmaps, APV, DBuffer decals, light layers,
light cookies, SSR, LOD cross-fade or DOTS instancing. Kit parts are dynamic objects. Add a
feature only when a scene needs it.

## Running it (T032 and T033 run this after every export)

- Editor menu: **MissionForge ▸ Kit ▸ Import Material Library**. It reads
  `<repo>/assets/blender/materials/library.json`. If the file is missing, the menu logs
  `Kit material library not found at <path> — awaiting T032 data` and touches nothing.
- Batch mode:
  `-executeMethod MissionForge.Editor.KitMaterials.KitMaterialLibraryImporter.BatchImportRepository`.
  The exit code is 1 if the report has errors.
- Fixture: **MissionForge ▸ Kit ▸ Import Fixture Library (test)** writes into the `_FixtureTest_`
  folders. Remove them with **Delete Fixture Import (test)**. In batch mode use `BatchImportFixture`.
- Code: `KitMaterialLibraryImporter.Import(libraryJsonPath, textureOutDir, materialOutDir, dryRun)`
  returns an `ImportReport`. The report holds created, updated and unchanged counts, errors,
  warnings and the changed asset paths. Bad input never throws. A missing file becomes an error
  entry. The one-line summary goes to the Console. Errors and warnings are logged as warnings so
  that the test runner does not fail on them.
- The import is idempotent. Each texture is copied only when its bytes differ. Each import
  setting and each material property is written only when its value differs. Existing `.mat`
  assets are edited in place, so their GUIDs and every reference to them survive. Nothing is
  ever deleted: stale `Kit_*__*.mat` variants are listed as warnings. A second run reports
  `0 created, 0 updated`.

Outputs (repository run):
- Textures go to `Art/Textures/Kit/<slot>/<file>`. Part masks go to
  `Art/Textures/Kit/_masks/<part_id>/<file>`.
- Materials go to `Art/Materials/Kit/Kit_<slot>.mat`. This covers the six existing slots plus any
  new ones such as `trim`, `decal` and `foam`. The `decal` slot uses `MissionForge/KitDecal`;
  every other slot uses `MissionForge/KitLit`. `Pad_*.mat` is never touched.
- Mask variants go to `Art/Materials/Kit/Kit_<slot>__<part_id>.mat` (LOD0) and
  `Kit_<slot>__<part_id>__lod1.mat` (LOD1).
- The map goes to `Art/Materials/Kit/KitPartMaskMap.json`.

## library.json as read here (version 1)

- `materials.<slot>`:
  - `albedo`, `normal`, `orm`: paths relative to `library.json`. For `trim` and `decal`, a
    missing map falls back to `trim.textures` or `decals.textures`.
  - `tiling_m`.
  - `tint` (`#RRGGBB`, sRGB).
  - `metallic` and `roughness`: `[min, max]`, `[v]`, `v` or `{min, max}`, each in 0..1.
  - `normal_strength`.
  - `hero`: defaults to true for `trim` and `decal` and false otherwise.
  - `source` and `value_type` (should be `"game_value"`).
  - `alpha_cutoff` (optional, decal only; the default is 0.5).
- `parts.<part_id>`:
  - `lod0_mask` (required) and `lod1_mask`.
  - `mask_res`.
  - `mask_b`: `"heat"` or `"frost"`.
  - **optional** `slots: [...]`. Without it, the slots are read from the renderer materials of
    `Art/Models/Kit/<part_id>.fbx`. **T032: please emit `slots`** so variants do not depend on
    import order.
- `uv`, `trim.rows` and `decals.tiles` are read by the Blender side. This importer ignores them.

Interpretation choices. Please confirm them with T032.
- `tint` multiplies the albedo map. If an albedo already has the tint baked in, that slot must
  set `"tint": "#FFFFFF"`.
- The `metallic` and `roughness` ranges **clamp** the values from the ORM map. They do not remap
  them. When a slot has no ORM map, the flat value is the midpoint of the range.

## Texture import settings

| Role | Type | sRGB | Alpha | Wrap | Aniso | Max (Default) | WebGL |
|---|---|---|---|---|---|---|---|
| albedo | Default | on | from input (decal: alpha is transparency) | Repeat (decal: Clamp) | 4 | 2048 | 1024 override unless `hero` |
| normal | NormalMap | n/a | n/a | Repeat (decal: Clamp) | 4 | 2048 | same |
| orm | Default | off | none | Repeat (decal: Clamp) | 4 | 2048 | same |
| mask (UV1) | Default | off | from input (A = cavity) | Clamp | 1 | `mask_res` (power of two, 32..2048) | always capped at 1024 |

Mipmaps are on for every texture.

## Per-part mask strategy (keeps SRP batching)

Each part has its own UV1 bake, so the mask cannot sit on the shared slot material. Per-renderer
`MaterialPropertyBlock`s would break the SRP Batcher. So the importer makes one **Unity 6 material
variant** per (slot, part, LOD):
- Each variant's `parent` is `Kit_<slot>`.
- A variant overrides only `_PartMask`, plus `_MaskB_IsFrost` for frost parts.
- Every other property, including later `_Frost` or `_WearAmount` edits on the parent, keeps
  following the parent.

Variants are ordinary materials on the same shader, so they batch with the SRP Batcher. The
`decal` slot never gets a variant.

`KitPartMaskMap.json` lists one entry per variant: `part_id`, `lod` (0 or 1), `slot`,
`material`, `mask` and `mask_b`. To use a variant, call
`KitPartMaskMap.FindVariant(mapPath, partId, lod, slot)`. The model postprocessor can then put the
variant on renderers named `<id>_LOD0` and `<id>_LOD1`, falling back to `Kit_<slot>` when no
variant exists.

**Integration still open (outside this folder):**
1. `RocketKitImport.EnsureMaterials()` sets `material.shader` back to URP Lit every time
   *Sync Rocket Kit* or a scene rebuild runs. That undoes this importer's shader. It should skip
   materials whose shader is `MissionForge/Kit*`, or skip all materials once `library.json`
   exists.
2. `RocketKitImport.SlotFor` knows only the six original slots, so FBX slots named `trim`,
   `decal` and `foam` are not replaced yet.
3. `RocketKitModelPostprocessor` does not use the variants yet. It should call
   `KitPartMaskMap.FindVariant`, using the model file name, the LOD suffix and the slot.

## Shader properties (all values are `game_value`)

| Property | Type / units | Meaning |
|---|---|---|
| `_BaseMap` | 2D, sRGB, UV0 | Albedo. In a decal it is the RGBA atlas, and its alpha is clipped by `_Cutoff`. |
| `_BaseColor` | colour (sRGB) | Tint that multiplies the albedo. From `tint`. |
| `_BumpMap`, `_BumpScale` | 2D normal (OpenGL +Y), scalar | Normal map and its strength. From `normal_strength`. |
| `_OrmMap` | 2D, linear | R occlusion, G roughness, B metallic. Smoothness = 1 − roughness. |
| `_OcclusionStrength` | 0..1 | How much ORM.R darkens. |
| `_Metallic` | 0..1 | metallic = ORM.B × `_Metallic`. The importer sets 1 when there is an ORM map and the flat value when there is none. |
| `_Smoothness` | 0..1 | roughness = ORM.G × (1 − `_Smoothness`). The importer sets 0 when there is an ORM map and 1 − flat roughness when there is none. |
| `_MetallicRange`, `_RoughnessRange` | Vector (x min, y max) | Clamp after the multiplier. From `metallic` and `roughness`. |
| `_Tiling` | metres per texture repeat | Applied to the metric UV0 as `uv0 / _Tiling`. From `tiling_m`. Decals are forced to 1. |
| `_PartMask` | 2D, linear, UV1 | R AO, G edge wear, B heat or frost, A cavity (1 = open surface, 0 = crevice). The default "white" is a no-op. |
| `_MaskAOStrength` | 0..1 | Strength of mask R. |
| `_HeatTint` | colour | albedo ×= lerp(1, `_HeatTint`, mask B) when B means heat. White (the default) means no tint. |
| `_MaskB_IsFrost` | 0 or 1 (keyword-free toggle) | 1 means mask B is frost (tanks). |
| `_Frost` | 0..1, **runtime** | Blends white rime (`_FrostColor`, #E9F1F4) over mask B × `_Frost`. Rime has roughness `_FrostRoughness` (0.85) and metallic 0, and it flattens the normal detail. Set it on the parent or variant, or through a renderer's material instance at runtime. |
| `_WearAmount`, `_WearColor` | 0..1, colour | Shows bare metal where mask G > 1 − `_WearAmount`. The edge fades over 0.08 to metallic 0.85 and roughness 0.38. |
| `_GrimeAmount`, `_GrimeColor` | 0..1, colour | Multiplies the albedo by `_GrimeColor` in cavities: (1 − mask A) × `_GrimeAmount`. Grime also adds 0.15 roughness. |
| `_Cutoff` | 0..1 | Decal alpha clip. From `alpha_cutoff`. KitLit has it too, hidden, for the shared layout. |
| `_DecalOffsetFactor`, `_DecalOffsetUnits` | defaults −1, −2 | Decal polygon offset. These are render state only, not in the cbuffer. |
| `_Cull` | CullMode | Back by default. |

**ORM defaults.** If no texture is assigned, the albedo is white, the normal is flat ("bump")
and the ORM is white. With the multipliers above, the material then looks like the old flat URP
Lit material: albedo = `_BaseColor`, metallic = `_Metallic`, smoothness = `_Smoothness` and
AO = 1. The property names match URP Lit's `_BaseColor`, `_Metallic` and `_Smoothness`, so
switching an existing `Kit_*.mat` to KitLit keeps its look until maps arrive.

**SRP Batcher.** Every per-material value lives in one `UnityPerMaterial` cbuffer in
`Kit/MF_KitInput.hlsl`. The layout is identical in every pass of both shaders and never sits
inside an `#if`.

**Decal z-fighting at 300 m.** Take a 24-bit depth buffer and a 0.3 m near plane. At 300 m one
depth step is about 300² / (0.3 × 2²⁴) ≈ 18 mm. The 3 mm geometric offset is therefore not
enough on its own. The polygon offset (factor −1, units −2) covers the rest. The decal writes
depth with the same offset in all its passes, so it stays correct if depth priming is turned on.
The decal queue is `AlphaTest+1`. Decals cast no shadows.

## Tests

`Tests/KitMaterialLibraryImporterTests.cs` covers:
- the fixture imports with 0 errors;
- a second import is idempotent (0 created, 0 updated);
- material GUIDs survive a re-import that updates the material;
- texture import settings: sRGB vs linear, the normal-map type, max 2048, the WebGL 1024 override
  for non-hero sets and masks;
- both shaders are found and `isSupported` (ignored under `-nographics`);
- variants: parent, per-LOD mask, map entries, and inheritance from the parent;
- a missing texture, or a missing library, gives an error entry and no exception;
- a dry run writes nothing.

Each test imports into the `_FixtureTest_` folders and deletes them in TearDown.
