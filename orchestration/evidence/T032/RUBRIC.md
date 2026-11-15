# T032 review rubric: PBR material library and the 11 engines

Reviewer: independent reviewer subagent. I did not do the work. Date: 2026-11-15.
Bar: VISUAL_TARGET section 6. Nothing ships below 4. 4 means it holds up next to the reference frame
and an outsider would not see a quality gap. Set-level items are scored at the weakest engine.

Inputs I looked at: `before/` and `after/` 3q and low renders for all 11 engines; the workhorse side,
powerhead, dusk_3q and dusk_low renders; both contact sheets and both before/after sheets;
`engines_cluster_vs_frame02.png`; `workhorse_t009_vs_t032_vs_frame01.png`; the material library, trim,
decal atlas and decal render images; frames 01 and 02; `triangle_table.md`; `manifest_diff.txt`;
`THIRD_PARTY.md`; `library.json`; the `kit_manifest.json` entries for the 11 engines; texture sizes on
disk. I also read `parts_engines_s1.py`, `parts_engines_s1b.py`, `parts_engines_s2.py` and `engine_common.actuator`
to check the 2.2 items I could not see in the renders.

## 1. Items M1–M10 (engines as a set)

| # | Item | Score | Reason | Weakest engine | Evidence |
|---|---|---|---|---|---|
| M1 | Silhouette and proportion | **4** | Manifest diff shows no change. Silhouettes read at LOD1 and in the 9-engine cluster. First-stage bells do not look like vacuum nozzles. The stacked-ring "lampshade" is gone. | none below 4 | `manifest_diff.txt`, `contact_sheet_engine_s1/s2.png`, `engines_cluster_vs_frame02.png` |
| M2 | Material response | **2.5** | It is real PBR and a clear step up from T009's flat plastic. But `engine_metal` is one coarse brushed-noise texture on every part. Its streaks run vertically across horizontal elbows and spheres, so it reads as scratched aluminium. The radiative and hypergolic extensions have a cloudy, blotchy mottle that reads as dirt, not as heat tint. Under `dusk_pad` everything goes flat grey. | `eng_kerolox_vacuum`, `eng_hypergolic_storable` (also the kick-motor case, which bands) | `after/eng_kerolox_vacuum_3q/low.png`, `after/eng_hypergolic_storable_3q/low.png`, `after/eng_kerolox_workhorse_powerhead.png`, `after/eng_solid_kick_motor_low.png`, `material_library_sheet.png` |
| M3 | Surface detail | **3** | Powerheads are good: bolted flanges, bellows and tube-wall bells. Large surfaces are bare, though: the mount plates are plain discs and the radiative extensions have only a seam and a band. The hypergolic injector top is busy but too small to read. | `eng_kerolox_vacuum`, `eng_hypergolic_storable` | `after/eng_kerolox_workhorse_side.png`, `after/eng_hypergolic_storable_3q.png`, `trim_sheet_preview.png` |
| M4 | Markings | **4** | The atlas is generic, uses the OFL stencil font and has no logos. Decals on the engines are sparse and legible (serial, fluid tag) with no z-fighting in the close-ups. The 300 m z-fighting check has no evidence. | none below 4 | `decal_atlas_preview.png`, `decals_render.png`, `after/eng_kerolox_workhorse_powerhead.png` |
| M5 | Engine fidelity (2.2 checklist) | **3** | The code places 2 actuators at 90° with clevises, at least 4 ducts with 2 bellows and 12-bolt flanges, and at least 8 clamped harness lines on every liquid engine. Visually the checklist is only partly met. The heat-tint gradient (straw, bronze, blue-violet) is not visible on any engine. Kerolox soot rings are barely visible. The workhorse volute cannot be made out in any view. Frame-side actuator ends render as plain blocks. The hypergolic engine has no turbopump or volute (pressure-fed, which is physically fine but not documented as a checklist exception). | `eng_kerolox_vacuum`, `eng_hypergolic_storable` | `after/*_3q.png`, `after/eng_kerolox_workhorse_powerhead.png`, `parts_engines_s2.py` (gen_hypergolic_storable has no `volute`) |
| M6 | Edges and normals | **3** | Flange and bolt edges catch light, and I found no black smoothing gradients. However, the electric-pump bell reads as flat faceted staves in the low view, and there are crisp white silhouette fringes on the low views (hydrolox vacuum pump, workhorse bell edge). Those may be a halo or rim artefact. | `eng_electric_pump_mini` | `after/eng_electric_pump_mini_low.png`, `after/eng_hydrolox_vacuum_low.png`, `after/eng_kerolox_workhorse_low.png` |
| M7 | Wear and frost | **3** | Frost does not apply to engines. Soot at the kerolox exits is too faint to read. The cloudy mottle on the radiative and ablative extensions acts as a universal grime layer, which 2.1 forbids. | `eng_kerolox_vacuum`, `eng_hypergolic_storable` | `after/eng_kerolox_vacuum_low.png`, `after/eng_kerolox_workhorse_low.png` |
| M8 | Lighting and render | **2.5** | `studio_hdri` is soft with no horizon line, which is fine. `dusk_pad` does not match the reference light: it is an overcast grey-lavender sky with no warm 4500 K low-sun rim, no 4:1 key-to-fill ratio, and barely any wet-ground reflection. | `dusk_pad` setup (all engines) | `after/eng_kerolox_workhorse_dusk_3q.png`, `after/eng_kerolox_workhorse_dusk_low.png`, `engines_cluster_vs_frame02.png` |
| M9 | Technical | **4** | Every engine is within budget: LOD0 ≤ 47 950, LOD1 ≤ 30 %, phone GLB ≤ 7 760 triangles and ≤ 1.03 MB. No ISSUE lines. Manifest diff is zero. UV1 margin is 6 px. Hero textures are 2048² and secondary textures 1024². No file is over 8 MB. Licences are recorded. Two nits: new textures total about 63 MB (textures, trim, decals and bakes) against the ~60 MB guide, and THIRD_PARTY says Concrete034 is "kept at 1K" while the files are 2048×1024 and named `_2K`. | none below 4 | `triangle_table.md`, `kit_manifest.json`, `manifest_diff.txt`, `materials/THIRD_PARTY.md`, `library.json` |
| M10 | Reference match | **2.5** | Next to frame 02, the cluster render is cold grey with silver powerheads. The reference has a warm sunset key, navy shadows and bells with a bronze inner rim. Next to frame 01, the workhorse bell tone is close, but the bronze lip is missing and the busy brushed powerhead reads more CAD than "premium stylised realism". An outsider would see the gap immediately. | set | `engines_cluster_vs_frame02.png`, `workhorse_t009_vs_t032_vs_frame01.png` |

Before vs after: the T009 renders score about 2 (flat prototype). T032 is a real improvement in
materials, bell construction and ducting. Most powerhead layouts are the T009 layouts with bellows,
flanges and harnesses added, not new geometry.

## 2. Per engine

| Engine | M1 | M2 | M3 | M5 | M6 | Missing or weak 2.2 items |
|---|---|---|---|---|---|---|
| `eng_kerolox_workhorse` | 4 | 3 | 3.5 | 3.5 | 3.5 | Volute not legible in any render. Heat tint not visible. Soot ring very faint. Second actuator never visible (it exists in code). Frame-side actuator ends render as plain blocks. Brushed noise runs against the geometry. |
| `eng_kerolox_giant` | 4 | 3 | 3.5 | 4 | 3.5 | Turbine exhaust manifold and film-cooled extension are present. Extension mottle reads as grime. No visible heat tint or soot ring. |
| `eng_kerolox_staged_combustion` | 4 | 3 | 3.5 | 4 | 3.5 | One preburner feeding two chambers is correct, with 4 actuators. Heat tint not visible. Each bell has 2 bands plus the manifold, which is at the limit. |
| `eng_hydrolox_high_efficiency` | 4 | 3 | 3.5 | 3.5 | 3.5 | Steer-horn ducts and dual preburners are present. The dense tube wall is faint at 3q distance. Heat tint not visible. The controller box is a plain cube. |
| `eng_methalox_full_flow` | 4 | 3 | 3.5 | 4 | 3.5 | Two pumps and two preburners, clean bell. Heat tint not visible. Preburners read as plain cylinders. |
| `eng_electric_pump_mini` | 4 | 3 | 3.5 | 4 | **3** | Motors and inverter are present. The bell tube texture at this scale reads as faceted staves. The "printed-metal look" is absent. Ducts (r = 10 mm) are hard to read. |
| `eng_hydrolox_vacuum` | 4 | 3 | 3.5 | 3.5 | 3.5 | Carbon extension wrap reads as a flat tiled diagonal. Heat tint not visible. One actuator visible. Possible white halo fringe on the pump in the low view. |
| `eng_kerolox_vacuum` | 4 | **2.5** | **3** | **3** | 3.5 | Radiative extension has blotchy cloud noise instead of a heat-tint gradient. Soot ring not visible. Powerhead is small against a large bare extension. |
| `eng_methalox_vacuum` | 4 | 3 | 3.5 | 3.5 | 3.5 | Tube-wall bell is good and clean. Heat tint not visible. Exit is plain. |
| `eng_hypergolic_storable` | 4 | **2.5** | **3** | **3** | 3.5 | No turbopump or volute (pressure-fed; the exception is not documented). The valve-heavy injector top is too small to read. Extension has blotchy grime and no heat tint. |
| `eng_solid_kick_motor` | 4 | 3 | 3.5 | 4 | 3.5 | Flange and weld seams, carbon-phenolic nozzle and no actuators are all correct. Brushed-metal streak banding across the sphere. The ablative wrap reads as a repeating tile. |

## 3. Below 4: required fixes

- **M2 Material response (2.5), all engines, worst on `eng_kerolox_vacuum` and `eng_hypergolic_storable`:**
  - Rescale `engine_metal` brushing to about 1/3 of its current streak length and contrast.
  - Drive the brushing direction from the lathe or tube UV direction so streaks follow pipes and turn with elbows.
  - Vary roughness between adjacent parts, for example satin pump housings against brushed ducts.
  - Replace the cloudy mottle on `nozzle_radiative` and `nozzle_ablative` with a smooth axial heat-tint gradient and a fine directional finish.
  - Fix the brushing banding on the kick-motor sphere (spherical or triplanar mapping).
- **M3 Surface detail (3), worst on `eng_kerolox_vacuum` and `eng_hypergolic_storable`:**
  - Add trim-sheet seams and a weld or bolt ring at the extension joint, plus stiffener detail on the extensions.
  - Detail the mount plates: bolt circle, lightening pockets, a chamfer.
  - Enlarge or raise the hypergolic valve packages so they read at 3q.
- **M5 Engine fidelity (3), worst on `eng_kerolox_vacuum` and `eng_hypergolic_storable`:**
  - Make the heat tint visible near the throat on uncooled metal (straw, bronze, blue-violet) and on the radiative extensions.
  - Make the kerolox soot rings readable at the exit (workhorse, giant, staged, kerolox vacuum).
  - Rotate the workhorse turbopump, or add a render angle, so the volute scroll is legible.
  - Render clevis forks at the frame-side actuator ends, not blocks.
  - Document the hypergolic pressure-fed exception (no turbopump) in AUTHORING.md and in this rubric's checklist, or add the turbopump.
  - Add the bronze inner rim seen in frames 01 and 02 to the bells.
- **M6 Edges and normals (3), `eng_electric_pump_mini`:**
  - Raise the bell segment count, or reduce the tube repeat, so the bell stops reading as faceted staves.
  - Check whether the white silhouette fringes in the low views (hydrolox vacuum pump, workhorse bell edge) come from a compositing or film-transparency halo, and remove them if so.
- **M7 Wear (3), worst on `eng_kerolox_vacuum` and `eng_hypergolic_storable`:**
  - Remove the universal mottle layer on the extensions.
  - Keep wear on the mask edges only and make the kerolox soot readable but restrained.
- **M8 Lighting and render (2.5), `dusk_pad` (all engines):**
  - Aim the 4500 K sun lamp at 3–8° elevation, matched to the `belfast_sunset_puresky` sun, as a visible warm rim.
  - Set the key-to-fill ratio to about 4:1 and keep shadows navy, not grey.
  - Make the ambientCG concrete visibly wet: lower roughness, puddle mask.
  - Re-render `dusk_3q`, `dusk_low` and the cluster.
- **M10 Reference match (2.5), set:**
  - Re-render the 9-engine cluster under the fixed `dusk_pad` next to frame 02.
  - Re-render the workhorse with a bronze inner rim and a calmer metal finish next to frame 01.
  - Rescore once the M2, M5 and M8 fixes are in.
- **Per-engine rows below 4:**
  - Every engine has M2 = 3 or less.
  - `eng_kerolox_vacuum` and `eng_hypergolic_storable` are at 2.5 / 3 / 3 on M2, M3 and M5.
  - `eng_electric_pump_mini` has M6 = 3.
  - Most engines sit at 3.5 on M3, M5 and M6.
  - The fixes above cover all of them.

## 4. Verdict

T032 does **not** meet the acceptance bar. Six of ten items are below 4: M2 2.5, M3 3, M5 3, M6 3,
M7 3, M8 2.5 and M10 2.5. No engine scores 4 on every per-engine column.

The technical side is solid and shippable (M9 4):
- budgets, LODs and GLB limits met;
- zero manifest diff;
- licences recorded;
- a complete 11-material library, trim sheet and generic decal atlas (M4 4);
- silhouettes intact (M1 4).

The generators do contain the 2.2 checklist parts (actuators, bellows ducts, flanges, harnesses), and
the engines moved from "flat prototype" (2) to "consistent but generic" (3). They do not yet hold up
next to frames 01 and 02:
- the metal reads as uniform scratched aluminium;
- the radiative extensions look dirty rather than heat-tinted;
- heat tint and soot are not visible anywhere;
- the dusk look-dev is overcast grey rather than a warm low sun over wet ground.

Per VISUAL_TARGET section 6, the task must list M2, M3, M5, M6, M7, M8 and M10 under **Not verified / failing**
and must not claim done.
