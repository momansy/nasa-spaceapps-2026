# T032 engines: triangles and texture sizes

Budgets (VISUAL_TARGET 2.3, game_value): LOD0 <= 50 000, LOD1 <= 15 000 and <= 30 % of LOD0, phone GLB <= 8 000 triangles and <= 2 MB. Masks: UV1, 2048 px (LOD0) / 1024 px (LOD1). Phone set: one 512 px albedo + ORM + normal on UV1. Shared slot textures are 2048 px (hero) or 1024 px.

| Engine | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | GLB (KB) | FBX (KB) | Masks (px) | Issues |
|---|---|---|---|---|---|---|---|---|
| `eng_kerolox_workhorse` | 32,086 | 9,472 | 30 % | 7,760 | 1,008 | 1,469 | 2048 / 1024 | none |
| `eng_kerolox_giant` | 47,950 | 12,854 | 27 % | 7,759 | 975 | 2,137 | 2048 / 1024 | none |
| `eng_kerolox_staged_combustion` | 47,102 | 13,706 | 29 % | 7,760 | 980 | 2,199 | 2048 / 1024 | none |
| `eng_hydrolox_high_efficiency` | 47,820 | 13,915 | 29 % | 7,760 | 983 | 2,131 | 2048 / 1024 | none |
| `eng_methalox_full_flow` | 40,116 | 10,791 | 27 % | 7,759 | 972 | 1,774 | 2048 / 1024 | none |
| `eng_electric_pump_mini` | 20,076 | 5,841 | 29 % | 5,841 | 939 | 896 | 2048 / 1024 | none |
| `eng_hydrolox_vacuum` | 38,018 | 11,250 | 30 % | 7,759 | 1,003 | 1,630 | 2048 / 1024 | none |
| `eng_kerolox_vacuum` | 43,994 | 12,018 | 27 % | 7,760 | 927 | 1,846 | 2048 / 1024 | none |
| `eng_methalox_vacuum` | 44,258 | 12,277 | 28 % | 7,760 | 970 | 1,811 | 2048 / 1024 | none |
| `eng_hypergolic_storable` | 37,812 | 10,720 | 28 % | 7,760 | 975 | 1,592 | 2048 / 1024 | none |
| `eng_solid_kick_motor` | 15,154 | 4,108 | 27 % | 4,108 | 770 | 639 | 2048 / 1024 | none |

Texel density (UV0 metric): engine_metal 2048 px/m, nozzle_hot 4096 px/m along the meridian (VISUAL_TARGET 2.1 asks >= 1024 px/m on engines).
UV1 island margin: 6 px at mask resolution (>= 4 px required).
