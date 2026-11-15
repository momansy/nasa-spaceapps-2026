# T032 engines: triangles and texture sizes

Budgets (VISUAL_TARGET 2.3, game_value): LOD0 <= 50 000, LOD1 <= 15 000 and <= 30 % of LOD0, phone GLB <= 8 000 triangles and <= 2 MB. Masks: UV1, 2048 px (LOD0) / 1024 px (LOD1). Phone set: one 512 px albedo + ORM + normal on UV1. Shared slot textures are 2048 px (hero) or 1024 px.

| Engine | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | GLB (KB) | FBX (KB) | Masks (px) | Issues |
|---|---|---|---|---|---|---|---|---|
| `eng_kerolox_workhorse` | 32,786 | 9,272 | 28 % | 7,759 | 956 | 1,502 | 2048 / 1024 | none |
| `eng_kerolox_giant` | 48,696 | 12,810 | 26 % | 7,760 | 904 | 2,174 | 2048 / 1024 | none |
| `eng_kerolox_staged_combustion` | 48,814 | 14,550 | 30 % | 7,759 | 936 | 2,273 | 2048 / 1024 | none |
| `eng_hydrolox_high_efficiency` | 48,944 | 14,538 | 30 % | 7,759 | 914 | 2,194 | 2048 / 1024 | none |
| `eng_methalox_full_flow` | 41,112 | 10,747 | 26 % | 7,760 | 921 | 1,809 | 2048 / 1024 | none |
| `eng_electric_pump_mini` | 24,488 | 7,125 | 29 % | 7,125 | 967 | 1,062 | 2048 / 1024 | none |
| `eng_hydrolox_vacuum` | 40,512 | 11,706 | 29 % | 7,760 | 904 | 1,729 | 2048 / 1024 | none |
| `eng_kerolox_vacuum` | 47,434 | 12,770 | 27 % | 7,759 | 865 | 1,992 | 2048 / 1024 | none |
| `eng_methalox_vacuum` | 45,338 | 12,233 | 27 % | 7,759 | 908 | 1,851 | 2048 / 1024 | none |
| `eng_hypergolic_storable` | 41,428 | 11,440 | 28 % | 7,760 | 897 | 1,738 | 2048 / 1024 | none |
| `eng_solid_kick_motor` | 15,154 | 4,108 | 27 % | 4,108 | 732 | 642 | 2048 / 1024 | none |

Texel density (UV0 metric): engine_metal 4096 px/m, nozzle_hot 4096 px/m along the meridian (VISUAL_TARGET 2.1 asks >= 1024 px/m on engines).
UV1 island margin: 6 px at mask resolution (>= 4 px required).
