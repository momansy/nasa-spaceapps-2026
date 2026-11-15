# T032 review rubric: PBR material library and the 11 engines (round 2, after requeue)

Reviewer: independent reviewer subagent. I did not do the work. Date: 2026-11-15.
Bar: VISUAL_TARGET section 6. Nothing ships below 4. 4 means it holds up next to the reference frame
and an outsider would not see a quality gap. Set-level items are scored at the weakest engine.

Inputs: all `after/` and `before/` renders (including workhorse `side`, `powerhead`, `volute`, `dusk_3q`,
`dusk_low`), both contact sheets, the cluster and workhorse comparisons, frames 01 and 02, `triangle_table.md`,
`manifest_diff.txt`, `library.json`, `THIRD_PARTY.md`, the slot textures, `engine_common.py`, `materials.py`,
`bake.py`, `lookdev.py` and `AUTHORING.md`. I zoomed crops with `magick` and checked each requeue claim against
the pixels.

Requeue claims, checked:
- Verified: the satin/brushed split on the powerheads; the bronze `nozzle_inner` liner and exit lip (clear in every
  regen-bell low view); the cloud mottle removed from `nozzle_radiative`; heat tint now visible; clevis forks at the
  frame-side actuator ends (a fork and pin under a small pad); mount-plate pockets and bolt circle (underside, low
  views); extension weld/bolt rings and seams; larger hypergolic valve packages; the pressure-fed exception in
  `AUTHORING.md`; the kick case no longer bands; the dusk regrade (navy fill, warm horizon, reflections).
- Partly true: the kerolox soot rings read on workhorse and staged, but not on `eng_kerolox_vacuum`, where the whole
  inside is uniformly black. The studio rim is softer, but there is still a crisp white edge on the right-hand silhouette
  in the low views. The electric-pump bell may be 96 segments, but it still reads as broad staves.
- Not fixed: `nozzle_hot_albedo.jpg` and `nozzle_hot_orm.jpg` still carry the large cloudy mottle. It shows as dirty
  blotches on every regen bell. `THIRD_PARTY.md` still says Concrete034 is "kept at 1K", but the files are 2048×1024.

## 1. Items M1–M10 (engines as a set)

| # | Item | Score | Reason | Weakest engine | Evidence |
|---|---|---|---|---|---|
| M1 | Silhouette and proportion | **4** | Manifest diff shows no change. Silhouettes read at LOD1 and in the cluster. First-stage bells do not look like vacuum nozzles. | none below 4 | `manifest_diff.txt`, `contact_sheet_engine_s1/s2.png`, `engines_cluster_vs_frame02.png` |
| M2 | Material response | **3** | Clear progress: calmer satin housings against brushed ducts, and bronze liners. Three problems remain. (1) The `nozzle_hot` tube walls are covered in cloudy light/dark blotches, which read as dirt on clean hydrolox and methalox bells. (2) The radiative heat tint comes in three hard, saturated bands (violet, copper, grey) that change exactly at the stiffeners, so it reads as anodised panels, not a restrained gradient. (3) The `eng_hydrolox_vacuum` carbon extension is a flat brown with even stripes. | `eng_methalox_vacuum`, `eng_hydrolox_high_efficiency`, `eng_kerolox_vacuum` | `after/eng_methalox_vacuum_low.png`, `after/eng_hydrolox_high_efficiency_low.png`, `after/eng_kerolox_vacuum_3q.png`, `after/eng_hydrolox_vacuum_3q.png`, `materials/textures/nozzle_hot/*` |
| M3 | Surface detail | **3.5** | Mount-plate pockets and bolt circles, joint flanges with bolts and weld beads are now present. But the longitudinal weld seams render as bright white stripes that look painted on. The `eng_hydrolox_vacuum` extension (most of the engine) is still bare. | `eng_hydrolox_vacuum`, `eng_kerolox_vacuum` | `after/eng_kerolox_vacuum_3q.png`, `after/eng_hypergolic_storable_3q.png`, `after/eng_hydrolox_vacuum_3q.png` |
| M4 | Markings | **4** | Unchanged since round 1: generic OFL stencil atlas, sparse and legible decals (serial, fluid tag), no logos. There is still no 300 m z-fighting evidence. | none below 4 | `decal_atlas_preview.png`, `decals_render.png`, `after/eng_kerolox_workhorse_powerhead.png` |
| M5 | Engine fidelity (2.2 checklist) | **3.5** | Heat tint is now visible, clevises exist and the hypergolic exception is documented. Gaps: (1) The workhorse volute is a constant-section torus, not a scroll, and its discharge is an open, unflanged, faceted tube end beside a bellows that clips into the ring. This breaks "every pipe ends at a flange or a component". (2) There is no readable soot ring on `eng_kerolox_vacuum`. (3) There is no heat tint on the `eng_hydrolox_vacuum` extension, which 2.2 lists. | `eng_kerolox_workhorse`, `eng_hydrolox_vacuum`, `eng_kerolox_vacuum` | `after/eng_kerolox_workhorse_volute.png`, `after/eng_kerolox_workhorse_powerhead.png`, `after/eng_kerolox_vacuum_low.png`, `after/eng_hydrolox_vacuum_3q.png` |
| M6 | Edges and normals | **3** | Flange and bolt edges catch light well. But: the workhorse volute port and the elbow end caps show about 10-sided facets at the hero close-up; the electric-pump bell reads as broad flat staves; and a crisp white rim fringe still traces the right-hand silhouettes in the low views. | `eng_electric_pump_mini`, `eng_kerolox_workhorse` | `after/eng_electric_pump_mini_low.png`, `after/eng_kerolox_workhorse_volute.png`, `after/eng_methalox_vacuum_low.png`, `after/eng_hydrolox_high_efficiency_low.png` |
| M7 | Wear and frost | **3** | Frost does not apply to engines. The extensions are now clean and kerolox soot is restrained on workhorse and staged. But the `nozzle_hot` mottle is a universal grime layer on every regen bell, including hydrolox and methalox bells, which 2.2 says must stay clean. 2.1 forbids this. | `eng_methalox_vacuum`, `eng_hydrolox_high_efficiency` | `after/eng_methalox_vacuum_low.png`, `after/eng_hydrolox_high_efficiency_low.png`, `after/eng_kerolox_giant_3q.png` |
| M8 | Lighting and render | **3** | `dusk_pad` is much better: navy fill, a warm horizon, reflections and a gold rim. But the ground reads as an ice floe with mirror pools, not a concrete pad. The hardware is underexposed: `dusk_low` is close to a navy silhouette, the bronze liner barely shows, and the key is a thin edge, not a visible 4:1 key. In frame 02 the hardware is well lit and its forms read. | `dusk_pad` (all engines) | `after/eng_kerolox_workhorse_dusk_3q.png`, `after/eng_kerolox_workhorse_dusk_low.png`, `engines_cluster_vs_frame02.png` |
| M9 | Technical | **4** | All engines are within 2.3: LOD0 ≤ 48 944, LOD1 ≤ 30 %, phone ≤ 7 760 triangles and ≤ 967 KB. No ISSUE lines and zero manifest diff. UV1 margin is 6 px. No file is over 8 MB. Nits: I agree with the lead's total of about 68 MB of new textures (textures 25 MB, trim 0.6, decals 0.7, bakes 42) against the ~60 MB guide; the bakes are the driver. The Concrete034 "1K" note in THIRD_PARTY is still wrong. | none below 4 | `triangle_table.md`, `manifest_diff.txt`, `materials/THIRD_PARTY.md`, `library.json` |
| M10 | Reference match | **3** | Next to frame 02 the mood is now close (warm horizon, navy), but the engines are near-black charcoal shapes on an icy floor, with the powerhead detail lost. Next to frame 01 the workhorse now has the bronze lip and a close bell tone, but the grey powerhead still reads CAD rather than premium stylised realism. An outsider would still see a gap, smaller than in round 1. | set | `engines_cluster_vs_frame02.png`, `workhorse_t009_vs_t032_vs_frame01.png` |

Before vs after: the T009 renders are about 2. Round 1 was 3. This round is 3–3.5, a real step up.

## 2. Per engine

| Engine | M1 | M2 | M3 | M5 | M6 | Missing or weak 2.2 items |
|---|---|---|---|---|---|---|
| `eng_kerolox_workhorse` | 4 | 3.5 | 3.5 | **3.5** | **3** | Volute is a plain torus. Its discharge is an open, faceted, unflanged tube end, and a bellows clips the ring. Faceted elbow cap. White rim fringe in the low view. Exit soot is faint but present. |
| `eng_kerolox_giant` | 4 | **3** | 3.5 | 4 | 3.5 | Bell tube wall is blotchy and speckled (nozzle_hot mottle). Bronze liner, turbine exhaust manifold and throat tint are good. |
| `eng_kerolox_staged_combustion` | 4 | 3.5 | 3.5 | 4 | 3.5 | Mild bell mottle. Soot bands at the exits read. |
| `eng_hydrolox_high_efficiency` | 4 | **3** | 3.5 | 3.5 | **3** | A clean hydrolox bell that is blotchy all over. The controller box is still a plain cube. White right-edge fringe in the low view. |
| `eng_methalox_full_flow` | 4 | 3.5 | 3.5 | 4 | 3.5 | Mild bell mottle. Preburners are plain cylinders. |
| `eng_electric_pump_mini` | 4 | **3** | 3.5 | 4 | **3** | The bell still reads as about 24 broad flat staves (the tube repeat is too coarse for r ≈ 0.2 m). Bronze liner is good. |
| `eng_hydrolox_vacuum` | 4 | **3** | **3** | **3.5** | 3.5 | The carbon extension is flat brown with even stripes. No heat tint and no detail on most of the engine. |
| `eng_kerolox_vacuum` | 4 | **3** | 3.5 | **3.5** | 3.5 | Heat tint comes in three hard, saturated bands. The weld seam is a bright white stripe. No readable soot ring (the inside is uniformly black). |
| `eng_methalox_vacuum` | 4 | **3** | 3.5 | 4 | **3** | Heavy blotchy mottle on a clean methalox bell. White silhouette fringe. |
| `eng_hypergolic_storable` | 4 | **3** | 3.5 | 4 | 3.5 | The exception is documented and the valve packages now read in close-up. Heat tint is banded and saturated, as on the kerolox vacuum. |
| `eng_solid_kick_motor` | 4 | 3.5 | 3.5 | 4 | 3.5 | Banding is fixed. The case is clean but plain. The carbon-phenolic nozzle is fine. |

## 3. Below 4: required fixes

- **M2 / M7 (3): regenerate `nozzle_hot` (and check `nozzle_inner`).**
  - Remove the low-frequency cloud noise from `nozzle_hot_albedo.jpg` and `nozzle_hot_orm.jpg`.
  - Keep only the tube-wall pattern plus fine directional roughness breakup.
  - Leave grime to mask A, and keep soot on kerolox exits only.
  - Re-render `eng_methalox_vacuum`, `eng_hydrolox_high_efficiency` and `eng_kerolox_giant`.
- **M2 / M5: radiative heat tint (`eng_kerolox_vacuum`, `eng_hypergolic_storable`).**
  - Drive heat with one continuous axial value across all extension sections, so the colour does not step at the
    stiffeners.
  - Desaturate it (straw and bronze about 50 % of the current chroma, violet only near the joint).
  - Fade it to dark metal over the lower half.
  - Dull the weld-seam bead to the extension's own roughness and colour, so it is a relief line, not a white stripe.
- **M2 / M3 / M5: `eng_hydrolox_vacuum` extension.**
  - Give the carbon wrap real roughness and normal variation.
  - Add a restrained heat-tint fade near the joint, or document why carbon-carbon is exempt.
  - Add a stiffener or attach ring so the extension is not a bare cone.
- **M5 / M6: workhorse volute (`parts_engines_s1.py`).**
  - Model a scroll whose cross-section grows around the pump.
  - End the discharge in a flanged duct to the chamber, with at least 12 bolts.
  - Stop the bellows from clipping the ring.
  - Raise the segment count on the port and the elbow end caps (at least 24 at LOD0).
  - Re-render `after/eng_kerolox_workhorse_volute.png` and `_powerhead.png`.
- **M5: kerolox vacuum soot.**
  - Make a soot ring readable at the exit (outer lip band or inner rim) against a lighter interior, the way workhorse
    and staged read.
- **M6: electric-pump bell and rim fringe.**
  - Raise `tubes_per_tile` density, or the u repeat, on `eng_electric_pump_mini` so individual tubes read rather than
    staves.
  - Lower the studio rim strength or widen it further, or move it off-axis, until no white edge line remains on the
    low views of methalox vacuum, hydrolox HE and workhorse.
- **M8 / M10: `dusk_pad`.**
  - Make the floor read as pad concrete: lower the puddle coverage, use smaller and fewer pools, and show visible
    aggregate and joints, not ice.
  - Raise the key so hardware is lit (about 4:1 key to fill measured on the engine, not on the floor), and keep the
    shadow floor at sRGB 12 or above.
  - Re-render `dusk_3q`, `dusk_low` and the cluster, and recheck them against frame 02.
- **M9 nits (not blocking):** correct the Concrete034 line in `THIRD_PARTY.md` (2048×1024, `_2K` files). Consider JPEG
  or 8-bit trimming of the bake masks to get back to about 60 MB.

## 4. Verdict

T032 does **not** meet the acceptance bar. Seven items are below 4: M2 3, M3 3.5, M5 3.5, M6 3, M7 3, M8 3
and M10 3. No engine scores 4 in every per-engine column.

The requeue fixed most of what it claimed (see the list at the top), and the technical side stays shippable
(M1, M4, M9 at 4). What holds it below 4 is the unchanged `nozzle_hot` cloud mottle on every regen bell, the
stepped radiative tint, the workhorse volute's open port, the leftover rim fringes and stave-like mini bell, and
a dusk floor that reads as ice with underlit hardware.

Per VISUAL_TARGET section 6, the task must list M2, M3, M5, M6, M7, M8 and M10 under **Not verified / failing**
and must not claim done.
