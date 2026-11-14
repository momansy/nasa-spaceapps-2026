# T009 assembly test: mating joints

**Overall: all joints pass.**

Measured on the LOD0 meshes in `assets/blender/_assembly_test.blend`. A stack joint passes when the vertical gap is under 2 mm and the two mating rings differ by under 4 mm in radius. A hang joint (engine or upper-stage mount) passes when its top face is within 2 mm of the attach point. A side joint (booster) passes when its `attach_side` point is within 2 mm of the core skin. Negative gap = overlap.

## small_pyro_d15

16 parts, height 17.90 m, 15 joints.

| Joint | Type | Height z (m) | Gap (mm) | Ring radius lower / upper (m) | Result |
|---|---|---|---|---|---|
| e1 under mount1.attach_engine_1 | hang | 0.650 | -0.0 | n/a | ok |
| e2 under mount1.attach_engine_2 | hang | 0.650 | -0.0 | n/a | ok |
| e3 under mount1.attach_engine_3 | hang | 0.650 | -0.0 | n/a | ok |
| e4 under mount1.attach_engine_4 | hang | 0.650 | -0.0 | n/a | ok |
| e5 under mount1.attach_engine_5 | hang | 0.650 | -0.0 | n/a | ok |
| e6 under mount1.attach_engine_6 | hang | 0.650 | -0.0 | n/a | ok |
| e7 under mount1.attach_engine_7 | hang | 0.650 | -0.0 | n/a | ok |
| e8 under mount1.attach_engine_8 | hang | 0.650 | -0.0 | n/a | ok |
| e9 under mount1.attach_engine_9 | hang | 0.650 | -0.0 | n/a | ok |
| mount1 -> tank1 | stack | 1.100 | 0.0 | 0.750 / 0.750 | ok |
| tank1 -> inter | stack | 9.300 | 0.0 | 0.750 / 0.750 | ok |
| inter -> tank2 | stack | 12.200 | 0.0 | 0.750 / 0.750 | ok |
| mount2 under tank2.origin | hang | 12.200 | 0.0 | n/a | ok |
| ue1 under mount2.attach_engine_1 | hang | 11.850 | 0.0 | n/a | ok |
| tank2 -> fairing | stack | 14.300 | 0.0 | 0.750 / 0.750 | ok |

## medium_hot_staging_d37

20 parts, height 57.85 m, 19 joints.

| Joint | Type | Height z (m) | Gap (mm) | Ring radius lower / upper (m) | Result |
|---|---|---|---|---|---|
| e1 under mount1.attach_engine_1 | hang | 2.900 | 0.0 | n/a | ok |
| e2 under mount1.attach_engine_2 | hang | 2.900 | 0.0 | n/a | ok |
| e3 under mount1.attach_engine_3 | hang | 2.900 | 0.0 | n/a | ok |
| e4 under mount1.attach_engine_4 | hang | 2.900 | 0.0 | n/a | ok |
| e5 under mount1.attach_engine_5 | hang | 2.900 | 0.0 | n/a | ok |
| e6 under mount1.attach_engine_6 | hang | 2.900 | 0.0 | n/a | ok |
| e7 under mount1.attach_engine_7 | hang | 2.900 | 0.0 | n/a | ok |
| e8 under mount1.attach_engine_8 | hang | 2.900 | 0.0 | n/a | ok |
| e9 under mount1.attach_engine_9 | hang | 2.900 | 0.0 | n/a | ok |
| mount1 -> tank1 | stack | 3.950 | 0.0 | 1.850 / 1.850 | ok |
| b1 on tank1 | side | 17.350 | -0.0 | n/a | ok |
| b2 on tank1 | side | 17.350 | -0.0 | n/a | ok |
| b3 on tank1 | side | 17.350 | -0.0 | n/a | ok |
| b4 on tank1 | side | 17.350 | -0.0 | n/a | ok |
| tank1 -> inter | stack | 33.550 | 0.0 | 1.850 / 1.850 | ok |
| inter -> tank2 | stack | 39.550 | 0.0 | 1.850 / 1.850 | ok |
| mount2 under tank2.origin | hang | 39.550 | 0.0 | n/a | ok |
| ue1 under mount2.attach_engine_1 | hang | 38.750 | 0.0 | n/a | ok |
| tank2 -> fairing | stack | 46.850 | 0.0 | 1.850 / 1.850 | ok |

## heavy_pneumatic_d54

12 parts, height 79.95 m, 11 joints.

| Joint | Type | Height z (m) | Gap (mm) | Ring radius lower / upper (m) | Result |
|---|---|---|---|---|---|
| e1 under mount1.attach_engine_1 | hang | 4.300 | 0.0 | n/a | ok |
| e2 under mount1.attach_engine_2 | hang | 4.300 | 0.0 | n/a | ok |
| e3 under mount1.attach_engine_3 | hang | 4.300 | 0.0 | n/a | ok |
| mount1 -> tank1 | stack | 5.750 | 0.0 | 2.700 / 2.700 | ok |
| b1 on tank1 | side | 41.050 | 0.0 | n/a | ok |
| b2 on tank1 | side | 41.050 | -0.0 | n/a | ok |
| tank1 -> inter | stack | 45.550 | 0.0 | 2.700 / 2.700 | ok |
| inter -> tank2 | stack | 51.950 | 0.0 | 2.700 / 2.700 | ok |
| mount2 under tank2.origin | hang | 51.950 | 0.0 | n/a | ok |
| ue1 under mount2.attach_engine_1 | hang | 50.850 | 0.0 | n/a | ok |
| tank2 -> fairing | stack | 65.450 | 0.0 | 2.700 / 2.700 | ok |
