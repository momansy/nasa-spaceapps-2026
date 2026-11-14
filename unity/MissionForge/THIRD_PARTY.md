# Third-party assets in the MissionForge Unity project

| Asset | Path | Source | Licence |
|---|---|---|---|
| Earth day map (Blue Marble Next Generation, December, topography + bathymetry), resized to 4096×2048 | `Assets/MissionForge/Art/Textures/Earth/earth_day_4k.jpg` | NASA Earth Observatory / Visible Earth, `world.topo.bathy.200412.3x5400x2700.jpg` from <https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/> | Public domain (NASA) |
| Earth night lights (Black Marble 2012, 0.1°), resized to 2048×1024 | `.../earth_night_2k.jpg` | NASA Earth Observatory, `BlackMarble_2012_01deg.jpg` (image record 144875) | Public domain (NASA) |
| Bathymetry (GEBCO 08 via Blue Marble Next Generation), resized to 2048×1024, used as the ocean mask | `.../earth_ocean_2k.jpg` | NASA Earth Observatory, `gebco_08_rev_bath_5400x2700.jpg` | Public domain (NASA / GEBCO) |
| Cloud map 2048×1024 | `.../earth_clouds_2k.jpg` | Solar System Scope, <https://www.solarsystemscope.com/textures/> (`2k_earth_clouds.jpg`, derived from NASA data) | CC BY 4.0 |
| Oxanium 500/700/800 (Latin subset) | `Assets/MissionForge/UI/Fonts/oxanium-*.ttf` | Fontsource build of Oxanium by Severin Meyer | SIL OFL 1.1 (`Oxanium-OFL.txt`) |
| IBM Plex Sans 400/500/600 (Latin subset), IBM Plex Mono Regular/SemiBold | `Assets/MissionForge/UI/Fonts/` | Fontsource / Google Fonts builds of IBM Plex | SIL OFL 1.1 (`IBMPlex-OFL.txt`) |
| QrCodeGenerator 2.0.5 | `Assets/MissionForge/ThirdParty/QrCodeGenerator/` | <https://github.com/manuelbl/QrCodeGenerator> (NuGet) | MIT |
| Lucide icons, 86-icon subset of lucide-static 1.73.0 (converted to path data, not shipped as SVG) | `Assets/MissionForge/UI/Icons/LucideIcons.g.cs` | <https://registry.npmjs.org/lucide-static/-/lucide-static-1.73.0.tgz>, repo <https://github.com/lucide-icons/lucide/tree/1.73.0/icons>; details in `UI/Icons/README.md` | ISC (29 icons derive from Feather, MIT); both texts in `UI/Icons/LICENSE-lucide.txt` |
| HDRI `kloppenheim_06_puresky` 2K (dusk sky for MF_Rig_DuskPad) | `Assets/MissionForge/Art/Lighting/HDRI/kloppenheim_06_puresky_2k.hdr` | Poly Haven, <https://polyhaven.com/a/kloppenheim_06_puresky> (file <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_puresky_2k.hdr>), unmodified | CC0 |
| HDRI `qwantani_sunset_puresky` 2K (dusk sky for MF_Rig_DuskPad since the M8 lighting pass; replaces `kloppenheim_06_puresky`, which stays in the folder but is no longer referenced) | `Assets/MissionForge/Art/Lighting/HDRI/qwantani_sunset_puresky_2k.hdr` | Poly Haven, Greg Zaal (photography) and Jarod Guest (processing), <https://polyhaven.com/a/qwantani_sunset_puresky> (file <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/qwantani_sunset_puresky_2k.hdr>, 4 171 959 B, md5 b918af5fefb341535961ffdad5fab7bc), unmodified, downloaded 2026-11-14 | CC0 |
| HDRI `empty_warehouse_01` 2K (neutral interior for MF_Rig_Interior) | `Assets/MissionForge/Art/Lighting/HDRI/empty_warehouse_01_2k.hdr` | Poly Haven, <https://polyhaven.com/a/empty_warehouse_01> (file <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/empty_warehouse_01_2k.hdr>), unmodified | CC0 |

| Build Bay ground texture sets (T034): `Concrete034` (pad apron), `Concrete031` (trench and deck slabs), `Gravel022` (gravel verge), `Ground037` (scrub), `Ground054` (beach sand), 1K-JPG packages | `Assets/MissionForge/Art/Environment/LaunchPad/Textures/<Id>_{albedo.jpg,normal.png,mask.png}` | ambientCG by Lennart Demes, <https://ambientcg.com/view?id=Concrete034> (same pattern for each id; files `https://ambientcg.com/get?file=<Id>_1K-JPG.zip`), downloaded 2026-11-15. Modified by `Art/Environment/LaunchPad/Source/prepare_textures.py`: albedo re-saved as JPEG q90, NormalGL saved as PNG, Roughness and AmbientOcclusion packed into one URP mask (G occlusion, A smoothness = 1 − roughness) | CC0 |
| Ocean normal map and soft steam puff (T034) | `Assets/MissionForge/Art/Environment/LaunchPad/Textures/Ocean_normal.png`, `Soft_puff.png` | Generated procedurally by `prepare_textures.py` (seeded sine-wave sum; radial falloff); no source imagery | Project-original |

NASA imagery is used as surface data only. No NASA logo, insignia or name is used as branding
(ARCHITECTURE.md section 8). The title screen shows an imagery credit line.

All of the above were downloaded on 2026-11-14. No AI-generated media is included in this project.
