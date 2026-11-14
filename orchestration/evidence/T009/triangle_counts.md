# T009 kit: triangle counts and sizes

Budgets: host LOD0 <= 30 000 triangles, LOD1 <= 30 % of LOD0, phone GLB <= 8 000 triangles and <= 2 MB. Lengths in metres.

## First-stage engines (design 7.7)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `eng_electric_pump_mini` | 0.65 | 0.25 / 0.2 | 7,742 | 2,252 | 29 % | 7,742 | 233 | 303 | yes |
| `eng_hydrolox_high_efficiency` | 4.3 | 2.4 / 1 | 26,030 | 7,462 | 29 % | 7,462 | 740 | 231 | yes |
| `eng_kerolox_giant` | 5.6 | 3.7 / 1.5 | 25,686 | 6,784 | 26 % | 6,784 | 720 | 218 | yes |
| `eng_kerolox_staged_combustion` | 3.6 | 1.45 / 1.6 | 25,588 | 7,444 | 29 % | 7,444 | 736 | 242 | yes |
| `eng_kerolox_workhorse` | 2.9 | 0.92 / 0.55 | 16,220 | 4,280 | 26 % | 4,280 | 462 | 141 | yes |
| `eng_methalox_full_flow` | 3.1 | 1.3 / 0.8 | 14,408 | 4,192 | 29 % | 4,192 | 413 | 136 | yes |

## Upper-stage engines (design 7.8)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `eng_hydrolox_vacuum` | 2.2 | 1.45 / 0.5 | 23,442 | 5,812 | 25 % | 5,812 | 625 | 170 | yes |
| `eng_hypergolic_storable` | 3.9 | 2.5 / 0.7 | 17,240 | 5,052 | 29 % | 5,052 | 467 | 170 | yes |
| `eng_kerolox_vacuum` | 3.9 | 3 / 0.55 | 18,098 | 5,390 | 30 % | 5,390 | 502 | 159 | yes |
| `eng_methalox_vacuum` | 4.7 | 2.5 / 0.8 | 18,882 | 5,494 | 29 % | 5,494 | 525 | 161 | yes |
| `eng_solid_kick_motor` | 2.03 | 0.75 / 0.9 | 14,628 | 4,168 | 28 % | 4,168 | 394 | 125 | yes |

## First-stage engine mounts (design 7.6)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `mount_s1_1_d15` | 0.7 | 1.5 / 1.5 | 4,004 | 1,164 | 29 % | 4,004 | 138 | 186 | yes |
| `mount_s1_1_d37` | 1.6 | 3.7 / 3.7 | 5,558 | 1,616 | 29 % | 5,558 | 173 | 264 | yes |
| `mount_s1_1_d54` | 2.2 | 5.4 / 5.4 | 7,763 | 2,258 | 29 % | 7,763 | 239 | 362 | yes |
| `mount_s1_1_d84` | 3.2 | 8.4 / 8.4 | 11,033 | 3,209 | 29 % | 3,209 | 331 | 129 | yes |
| `mount_s1_3_d15` | 0.7 | 1.5 / 1.5 | 4,978 | 1,447 | 29 % | 4,978 | 168 | 236 | yes |
| `mount_s1_3_d37` | 1.6 | 3.7 / 3.7 | 7,105 | 2,066 | 29 % | 7,105 | 217 | 350 | yes |
| `mount_s1_3_d54` | 2.2 | 5.4 / 5.4 | 9,721 | 2,828 | 29 % | 2,828 | 284 | 121 | yes |
| `mount_s1_3_d84` | 3.2 | 8.4 / 8.4 | 13,063 | 3,800 | 29 % | 3,800 | 373 | 156 | yes |
| `mount_s1_5_d15` | 0.7 | 1.5 / 1.5 | 6,102 | 1,774 | 29 % | 6,102 | 185 | 289 | yes |
| `mount_s1_5_d37` | 1.6 | 3.7 / 3.7 | 7,917 | 2,302 | 29 % | 7,917 | 231 | 391 | yes |
| `mount_s1_5_d54` | 2.2 | 5.4 / 5.4 | 10,917 | 3,176 | 29 % | 3,176 | 303 | 135 | yes |
| `mount_s1_5_d84` | 3.2 | 8.4 / 8.4 | 18,057 | 5,254 | 29 % | 5,254 | 494 | 205 | yes |
| `mount_s1_9_d15` | 0.7 | 1.5 / 1.5 | 8,846 | 2,572 | 29 % | 2,572 | 257 | 127 | yes |
| `mount_s1_9_d37` | 1.6 | 3.7 / 3.7 | 10,604 | 3,084 | 29 % | 3,084 | 296 | 144 | yes |
| `mount_s1_9_d54` | 2.2 | 5.4 / 5.4 | 13,499 | 3,926 | 29 % | 3,926 | 373 | 172 | yes |
| `mount_s1_9_d84` | 3.2 | 8.4 / 8.4 | 19,847 | 5,820 | 29 % | 5,820 | 513 | 238 | yes |

## Upper-stage engine mounts (design 7.6)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `mount_s2_1_d15` | 0.35 | 1.28 / 1.28 | 4,040 | 1,175 | 29 % | 4,040 | 128 | 136 | yes |
| `mount_s2_1_d37` | 0.8 | 3.216 / 3.216 | 4,524 | 1,315 | 29 % | 4,524 | 141 | 156 | yes |
| `mount_s2_1_d54` | 1.1 | 4.712 / 4.712 | 5,280 | 1,536 | 29 % | 5,280 | 161 | 184 | yes |
| `mount_s2_1_d84` | 1.6 | 7.352 / 7.352 | 6,646 | 1,932 | 29 % | 6,646 | 199 | 237 | yes |
| `mount_s2_2_d15` | 0.35 | 1.28 / 1.28 | 4,692 | 1,364 | 29 % | 4,692 | 147 | 157 | yes |
| `mount_s2_2_d37` | 0.8 | 3.216 / 3.216 | 5,232 | 1,521 | 29 % | 5,232 | 162 | 179 | yes |
| `mount_s2_2_d54` | 1.1 | 4.712 / 4.712 | 5,988 | 1,742 | 29 % | 5,988 | 181 | 207 | yes |
| `mount_s2_2_d84` | 1.6 | 7.352 / 7.352 | 7,354 | 2,138 | 29 % | 7,354 | 221 | 260 | yes |

## Propellant tanks (design 7.9)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `tank_s1_l` | 23.4 | 5.4 / 5.4 | 13,044 | 3,795 | 29 % | 3,795 | 377 | 185 | yes |
| `tank_s1_l_hydrolox` | 57.3 | 5.4 / 5.4 | 19,556 | 5,689 | 29 % | 5,689 | 551 | 266 | yes |
| `tank_s1_m` | 29.6 | 3.7 / 3.7 | 12,368 | 3,598 | 29 % | 3,598 | 351 | 169 | yes |
| `tank_s1_m_hydrolox` | 39.8 | 5.4 / 5.4 | 19,016 | 5,532 | 29 % | 5,532 | 538 | 256 | yes |
| `tank_s1_s` | 14.6 | 3.7 / 3.7 | 10,016 | 2,913 | 29 % | 2,913 | 295 | 142 | yes |
| `tank_s1_s_hydrolox` | 35.3 | 3.7 / 3.7 | 16,200 | 4,714 | 29 % | 4,714 | 464 | 217 | yes |
| `tank_s1_xl` | 25.8 | 8.4 / 8.4 | 16,272 | 4,734 | 29 % | 4,734 | 466 | 239 | yes |
| `tank_s1_xl_hydrolox` | 59.2 | 8.4 / 8.4 | 23,972 | 6,974 | 29 % | 6,974 | 671 | 328 | yes |
| `tank_s1_xs` | 8.2 | 1.5 / 1.5 | 7,096 | 2,064 | 29 % | 7,096 | 219 | 329 | yes |
| `tank_s1_xs_hydrolox` | 20.8 | 1.5 / 1.5 | 12,396 | 3,606 | 29 % | 3,606 | 358 | 170 | yes |
| `tank_s2_l` | 12 | 3.7 / 3.7 | 8,812 | 2,563 | 29 % | 2,563 | 262 | 119 | yes |
| `tank_s2_l_hydrolox` | 16.2 | 5.4 / 5.4 | 11,696 | 3,402 | 29 % | 3,402 | 343 | 156 | yes |
| `tank_s2_m` | 7.3 | 3.7 / 3.7 | 8,056 | 2,343 | 29 % | 2,343 | 238 | 110 | yes |
| `tank_s2_m_hydrolox` | 17.6 | 3.7 / 3.7 | 11,420 | 3,323 | 29 % | 3,323 | 331 | 148 | yes |
| `tank_s2_s` | 4 | 3.7 / 3.7 | 7,832 | 2,278 | 29 % | 7,832 | 231 | 359 | yes |
| `tank_s2_s_hydrolox` | 8.3 | 3.7 / 3.7 | 8,696 | 2,529 | 29 % | 2,529 | 263 | 117 | yes |
| `tank_s2_xl` | 13.5 | 5.4 / 5.4 | 10,564 | 3,073 | 29 % | 3,073 | 305 | 143 | yes |
| `tank_s2_xl_hydrolox` | 16.7 | 8.4 / 8.4 | 13,916 | 4,048 | 29 % | 4,048 | 398 | 189 | yes |
| `tank_s2_xs` | 2.1 | 1.5 / 1.5 | 5,556 | 1,616 | 29 % | 5,556 | 175 | 248 | yes |
| `tank_s2_xs_hydrolox` | 4.7 | 1.5 / 1.5 | 6,004 | 1,746 | 29 % | 6,004 | 192 | 263 | yes |

## Interstages by separation system (design 7.12)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `interstage_hot_staging_d15` | 2.9 | 1.5 / 1.5 | 5,252 | 1,526 | 29 % | 5,252 | 162 | 221 | yes |
| `interstage_hot_staging_d15_to_d37` | 6 | 1.5 / 3.7 | 7,062 | 2,054 | 29 % | 7,062 | 218 | 300 | yes |
| `interstage_hot_staging_d37` | 6 | 3.7 / 3.7 | 7,360 | 2,140 | 29 % | 7,360 | 211 | 323 | yes |
| `interstage_hot_staging_d37_to_d15` | 2.9 | 3.7 / 1.5 | 7,062 | 2,054 | 29 % | 7,062 | 219 | 299 | yes |
| `interstage_hot_staging_d37_to_d54` | 6.4 | 3.7 / 5.4 | 10,676 | 3,105 | 29 % | 3,105 | 334 | 124 | yes |
| `interstage_hot_staging_d54` | 6.4 | 5.4 / 5.4 | 10,742 | 3,124 | 29 % | 3,124 | 306 | 123 | yes |
| `interstage_hot_staging_d54_to_d37` | 6 | 5.4 / 3.7 | 10,676 | 3,105 | 29 % | 3,105 | 332 | 124 | yes |
| `interstage_hot_staging_d54_to_d84` | 7 | 5.4 / 8.4 | 16,480 | 4,795 | 29 % | 4,795 | 496 | 184 | yes |
| `interstage_hot_staging_d84` | 7 | 8.4 / 8.4 | 16,744 | 4,872 | 29 % | 4,872 | 463 | 185 | yes |
| `interstage_hot_staging_d84_to_d54` | 6.4 | 8.4 / 5.4 | 16,480 | 4,795 | 29 % | 4,795 | 501 | 184 | yes |
| `interstage_pneumatic_d15` | 2.9 | 1.5 / 1.5 | 5,056 | 1,470 | 29 % | 5,056 | 158 | 218 | yes |
| `interstage_pneumatic_d15_to_d37` | 6 | 1.5 / 3.7 | 7,086 | 2,061 | 29 % | 7,086 | 222 | 307 | yes |
| `interstage_pneumatic_d37` | 6 | 3.7 / 3.7 | 7,256 | 2,110 | 29 % | 7,256 | 205 | 324 | yes |
| `interstage_pneumatic_d37_to_d15` | 2.9 | 3.7 / 1.5 | 6,426 | 1,869 | 29 % | 6,426 | 205 | 280 | yes |
| `interstage_pneumatic_d37_to_d54` | 6.4 | 3.7 / 5.4 | 9,450 | 2,749 | 29 % | 2,749 | 293 | 124 | yes |
| `interstage_pneumatic_d54` | 6.4 | 5.4 / 5.4 | 9,388 | 2,731 | 29 % | 2,731 | 258 | 122 | yes |
| `interstage_pneumatic_d54_to_d37` | 6 | 5.4 / 3.7 | 9,450 | 2,749 | 29 % | 2,749 | 291 | 124 | yes |
| `interstage_pneumatic_d54_to_d84` | 7 | 5.4 / 8.4 | 13,136 | 3,821 | 29 % | 3,821 | 391 | 162 | yes |
| `interstage_pneumatic_d84` | 7 | 8.4 / 8.4 | 13,144 | 3,823 | 29 % | 3,823 | 357 | 162 | yes |
| `interstage_pneumatic_d84_to_d54` | 6.4 | 8.4 / 5.4 | 13,136 | 3,821 | 29 % | 3,821 | 392 | 163 | yes |
| `interstage_pyro_d15` | 2.9 | 1.5 / 1.5 | 4,876 | 1,418 | 29 % | 4,876 | 163 | 233 | yes |
| `interstage_pyro_d15_to_d37` | 6 | 1.5 / 3.7 | 6,762 | 1,966 | 29 % | 6,762 | 226 | 330 | yes |
| `interstage_pyro_d37` | 6 | 3.7 / 3.7 | 6,932 | 2,016 | 29 % | 6,932 | 216 | 346 | yes |
| `interstage_pyro_d37_to_d15` | 2.9 | 3.7 / 1.5 | 6,306 | 1,834 | 29 % | 6,306 | 210 | 301 | yes |
| `interstage_pyro_d37_to_d54` | 6.4 | 3.7 / 5.4 | 9,396 | 2,732 | 29 % | 2,732 | 307 | 132 | yes |
| `interstage_pyro_d54` | 6.4 | 5.4 / 5.4 | 9,334 | 2,715 | 29 % | 2,715 | 281 | 131 | yes |
| `interstage_pyro_d54_to_d37` | 6 | 5.4 / 3.7 | 9,156 | 2,663 | 29 % | 2,663 | 299 | 126 | yes |
| `interstage_pyro_d54_to_d84` | 7 | 5.4 / 8.4 | 13,526 | 3,935 | 29 % | 3,935 | 420 | 182 | yes |
| `interstage_pyro_d84` | 7 | 8.4 / 8.4 | 13,534 | 3,937 | 29 % | 3,937 | 389 | 181 | yes |
| `interstage_pyro_d84_to_d54` | 6.4 | 8.4 / 5.4 | 13,136 | 3,821 | 29 % | 3,821 | 408 | 172 | yes |

## Stack adapters (kit helper)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `adapter_d15_to_d37` | 3 | 1.5 / 3.7 | 2,242 | 650 | 29 % | 2,242 | 77 | 114 | yes |
| `adapter_d37_to_d15` | 3 | 3.7 / 1.5 | 2,242 | 650 | 29 % | 2,242 | 77 | 114 | yes |
| `adapter_d37_to_d54` | 2.3 | 3.7 / 5.4 | 3,592 | 1,004 | 28 % | 3,592 | 111 | 183 | yes |
| `adapter_d54_to_d37` | 2.3 | 5.4 / 3.7 | 3,592 | 1,004 | 28 % | 3,592 | 111 | 183 | yes |
| `adapter_d54_to_d84` | 4.1 | 5.4 / 8.4 | 5,520 | 1,532 | 28 % | 5,520 | 156 | 279 | yes |
| `adapter_d84_to_d54` | 4.1 | 8.4 / 5.4 | 5,520 | 1,532 | 28 % | 5,520 | 155 | 278 | yes |

## Payload fairings (design 7.5)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `fairing_large` | 14.5 | 5.4 / 0 | 10,092 | 2,932 | 29 % | 2,932 | 320 | 112 | yes |
| `fairing_reusable_large` | 14.5 | 5.4 / 0 | 11,004 | 3,200 | 29 % | 3,200 | 354 | 126 | yes |
| `fairing_small` | 3.6 | 1.5 / 0 | 6,332 | 1,840 | 29 % | 6,332 | 220 | 223 | yes |
| `fairing_standard` | 11 | 3.7 / 0 | 9,476 | 2,756 | 29 % | 2,756 | 304 | 109 | yes |

## Strap-on boosters (design 7.11)

| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris | FBX (KB) | GLB (KB) | Within budget |
|---|---|---|---|---|---|---|---|---|---|
| `booster_heavy_solid` | 45.5 | 3.7 / 3.7 | 19,382 | 5,778 | 30 % | 5,778 | 506 | 204 | yes |
| `booster_small_solid` | 20 | 1.6 / 1.6 | 8,934 | 2,598 | 29 % | 2,598 | 255 | 89 | yes |

**Totals:** 97 parts, 1,036,170 LOD0 triangles; FBX 31.1 MB, GLB 19.9 MB, .blend 32.7 MB.
