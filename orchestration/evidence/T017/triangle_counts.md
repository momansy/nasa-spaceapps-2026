# T017 triangle counts and sizes

Budgets: host LOD0 <= 30 000 triangles, LOD1 <= 30 % of LOD0 (min 200), phone GLB <= 8 000 triangles and <= 2 MB. Generated from `assets/blender/kit_manifest.json`.

| Part | Family | LOD0 tris | LOD1 tris | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|
| cap_compact | spacecraft_capsule | 7,744 | 2,084 | 7,744 | 227 | 251 | yes |
| cap_deep_space | spacecraft_capsule | 9,080 | 2,639 | 2,639 | 287 | 114 | yes |
| cap_standard | spacecraft_capsule | 7,792 | 2,108 | 7,792 | 228 | 254 | yes |
| lander_airbag | spacecraft_lander | 1,584 | 460 | 1,584 | 64 | 52 | yes |
| lander_legged | spacecraft_lander | 1,644 | 478 | 1,644 | 83 | 82 | yes |
| lander_sky_crane | spacecraft_lander | 1,904 | 550 | 1,904 | 92 | 92 | yes |
| les_ejection_seats | spacecraft_les_pod | 216 | 194 | 216 | 33 | 18 | yes |
| les_escape_tower | spacecraft_les_tower | 2,888 | 840 | 2,888 | 106 | 95 | yes |
| les_integrated_pusher | spacecraft_les_pod | 528 | 194 | 528 | 46 | 28 | yes |
| satpwr_body_mounted_solar_cells | spacecraft_sat | 1,300 | 378 | 1,300 | 63 | 64 | yes |
| satpwr_deployable_solar_wings | spacecraft_sat | 1,420 | 409 | 1,420 | 90 | 77 | yes |
| satpwr_large_deployable_array | spacecraft_sat | 1,444 | 416 | 1,444 | 91 | 78 | yes |
| site_equatorial_spaceport | world_site_diorama | 4,880 | 1,420 | 4,880 | 195 | 252 | yes |
| site_inland_steppe_cosmodrome | world_site_diorama | 5,524 | 1,607 | 5,524 | 224 | 330 | yes |
| site_subtropical_coast | world_site_diorama | 6,040 | 1,757 | 6,040 | 235 | 307 | yes |
| site_west_coast_polar_range | world_site_diorama | 4,244 | 1,234 | 4,244 | 156 | 217 | yes |
| tps_avcoat_ablator | spacecraft_tps_card | 7,792 | 2,108 | 7,792 | 239 | 254 | yes |
| tps_avcoat_ablator__cap_compact | spacecraft_tps | 4,320 | 384 | 4,320 | 112 | 139 | yes |
| tps_avcoat_ablator__cap_deep_space | spacecraft_tps | 4,320 | 384 | 4,320 | 113 | 139 | yes |
| tps_avcoat_ablator__cap_standard | spacecraft_tps | 4,320 | 384 | 4,320 | 113 | 139 | yes |
| tps_inflatable_decelerator | spacecraft_tps_card | 6,912 | 2,010 | 6,912 | 213 | 201 | yes |
| tps_inflatable_decelerator__cap_compact | spacecraft_tps | 3,440 | 1,000 | 3,440 | 93 | 87 | yes |
| tps_inflatable_decelerator__cap_deep_space | spacecraft_tps | 3,440 | 1,000 | 3,440 | 93 | 87 | yes |
| tps_inflatable_decelerator__cap_standard | spacecraft_tps | 3,440 | 1,000 | 3,440 | 93 | 87 | yes |
| tps_pica_ablator | spacecraft_tps_card | 5,008 | 1,456 | 5,008 | 170 | 162 | yes |
| tps_pica_ablator__cap_compact | spacecraft_tps | 1,536 | 384 | 1,536 | 56 | 48 | yes |
| tps_pica_ablator__cap_deep_space | spacecraft_tps | 1,536 | 384 | 1,536 | 56 | 48 | yes |
| tps_pica_ablator__cap_standard | spacecraft_tps | 1,536 | 384 | 1,536 | 56 | 48 | yes |
| tps_reusable_ceramic_tiles | spacecraft_tps_card | 5,272 | 1,532 | 5,272 | 182 | 177 | yes |
| tps_reusable_ceramic_tiles__cap_compact | spacecraft_tps | 1,800 | 384 | 1,800 | 66 | 63 | yes |
| tps_reusable_ceramic_tiles__cap_deep_space | spacecraft_tps | 1,800 | 384 | 1,800 | 66 | 63 | yes |
| tps_reusable_ceramic_tiles__cap_standard | spacecraft_tps | 1,800 | 384 | 1,800 | 66 | 63 | yes |
| world_crane_arm | world_pad | 488 | 194 | 488 | 38 | 27 | yes |
| world_crew_access_arm | world_pad | 320 | 104 | 320 | 32 | 25 | yes |
| world_flame_trench | world_pad | 120 | 96 | 120 | 26 | 11 | yes |
| world_gantry_base | world_pad | 168 | 72 | 168 | 25 | 13 | yes |
| world_gantry_crown | world_pad | 636 | 194 | 636 | 45 | 38 | yes |
| world_gantry_segment | world_pad | 556 | 194 | 556 | 37 | 36 | yes |
| world_lightning_mast | world_pad | 620 | 194 | 620 | 45 | 30 | yes |
| world_pad_deck | world_pad | 1,008 | 292 | 1,008 | 53 | 55 | yes |
| world_site_equatorial_hall | world_site | 136 | 64 | 136 | 25 | 13 | yes |
| world_site_equatorial_palms | world_site | 816 | 236 | 816 | 59 | 41 | yes |
| world_site_equatorial_treeline | world_site | 1,500 | 436 | 1,500 | 65 | 53 | yes |
| world_site_polar_blockhouse | world_site | 194 | 164 | 194 | 28 | 13 | yes |
| world_site_polar_cliff_hills | world_site | 806 | 232 | 806 | 44 | 29 | yes |
| world_site_steppe_drop_zone | world_site | 632 | 194 | 632 | 35 | 30 | yes |
| world_site_steppe_grass | world_site | 1,212 | 352 | 1,212 | 114 | 110 | yes |
| world_site_steppe_rail_erector | world_site | 916 | 265 | 916 | 49 | 64 | yes |
| world_site_subtropical_assembly | world_site | 112 | 112 | 112 | 26 | 12 | yes |
| world_site_subtropical_dunes | world_site | 948 | 275 | 948 | 71 | 55 | yes |
| world_site_subtropical_water_tower | world_site | 808 | 233 | 808 | 44 | 32 | yes |
| world_umbilical_arm | world_pad | 520 | 184 | 520 | 38 | 29 | yes |
