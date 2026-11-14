# Art/Lighting: the shared URP look (T031 step 6)

Everything in this folder is produced by `Assets/MissionForge/Editor/DesignSystem/LightingFoundation*.cs`
(menu **MissionForge > Design System > Lighting**, or batch
`-executeMethod MissionForge.Editor.DesignSystem.LightingFoundation.All`). Edit the script, not the assets: every
step is idempotent and re-running it restores these values. All numbers are `game_value` art targets
(orchestration/VISUAL_TARGET.md 2.5, assets/media/style/STYLE_GUIDE.md), not physical measurements.

**Do not fork the look.** A new scene picks one rig below and drops the prefab in. It does not build its own
lights, volumes or probes. If a scene needs something different, add an override profile here and record it.

## Rigs

Each rig prefab has the same named children (no runtime C#):

| Child | MF_Rig_DuskPad | MF_Rig_Orbit | MF_Rig_Interior |
|---|---|---|---|
| Key Light (directional) | 4500 K, 2.2, soft shadows (strength 0.85), sun 7° up toward (0.70, 0.12, 0.70) | 5800 K, 2.0, soft shadows, toward the Shell sun (0.90, 0.22, 0.38) | 5000 K, 1.4, soft shadows (0.8), aligned with the HDRI's overhead source (51° up) |
| Fill Light (directional, no shadows) | 8000 K, 0.55 (1/4 of key), T015 fill direction | 8000 K, 0.25, "Earth fill" from below, opposite the sun | 8000 K, 0.35, cool screen bounce from the front |
| Reflection Probe (256 px, HDR) | at pad +30 m, bounds 420 x 260 x 420 m, no box projection, far 3000 m | at origin, 1000 units cube (space scale), no box projection | at +2.5 m, 24 x 8 x 24 m room, **box projection** |
| Volume Global (priority 1) | MF_Volume_Global | MF_Volume_Global | MF_Volume_Global |
| Volume Override (priority 2) | MF_Volume_Dusk | MF_Volume_Orbit | MF_Volume_Interior |
| Skybox (scene RenderSettings) | MF_Sky_Dusk, ambient = Skybox | starfield kept (MF_Shell) | MF_Sky_Interior, ambient = Skybox |

A skybox is a scene setting, not part of a prefab, so `ApplyToScenes` assigns the sky material. The prefab probe
default is **Realtime / OnAwake**. `ApplyToScenes` bakes each placed probe to `Probes/MF_Probe_<scene>.exr` and
switches that instance to **Custom** with the baked cubemap. If the bake fails (for example `-nographics`), the
instance stays Realtime / OnAwake and the log says so. Realtime probes are enabled on every quality tier for that
fallback. Desktop 512 px probes are not built yet: one 256 px bake serves both tiers.

## Which scene uses which rig

| Scene | Rig | Override volume | Status |
|---|---|---|---|
| MF_Title | MF_Rig_Orbit | MF_Volume_Orbit | applied (rig key disabled, see below) |
| MF_Lobby | MF_Rig_Orbit | MF_Volume_Orbit | applied (rig key disabled, see below) |
| MF_BuildBay | MF_Rig_DuskPad (child of `Bay`) | MF_Volume_Dusk | applied |
| MF_Countdown, MF_TestStand | MF_Rig_DuskPad | MF_Volume_Dusk | future |
| MF_Flight, MF_OrbitMap, MF_Debrief | MF_Rig_Orbit | MF_Volume_Orbit | future |
| MF_Briefing, MF_ContractVote, MF_DesignReview, MF_FlightReadinessReview | MF_Rig_Interior | MF_Volume_Interior | future |
| MF_MinigameOverlay, MF_Codex, MF_Settings | none (overlays use the scene underneath) | none | n/a |
| Close-ups and part inspection (any scene) | add a global Volume, priority 3, MF_Volume_CloseUp, weight driven by the camera | MF_Volume_CloseUp | future |

Replaced and **disabled** (not deleted) by `ApplyToScenes`: `MF_Title` TitleRim and TitleFill; `MF_BuildBay`
Bay/DuskKey, Bay/DuskFill and Bay/BayVolume. The launch pad floodlights (spot practicals in MF_LaunchPad) stay.

Re-run `ApplyToScenes` after `ProjectSetup` or `BuildBaySceneBuilder` regenerates a scene, because those builders
recreate scenes from scratch with the old T015 lights.

### Runtime facts (read before changing a rig)

- **MF_Shell stays the active scene** (SceneFlow). Its RenderSettings (starfield skybox, flat dark ambient) and its
  `Sun` light (1.6, no shadows, same direction as the Orbit key) apply in every screen scene. A screen scene's own
  RenderSettings only affect the editor view and the probe bake.
- **Orbit key:** while the Shell `Sun` lights the space screens, the Orbit rig's Key Light component is disabled in
  Title and Lobby so the sun is not doubled (`ShellSunIsOrbitKey` in LightingFoundation.Scenes.cs). To make the rig
  the orbit key, set the Shell sun's intensity to 0 in `ProjectSetup.BuildShellScene` (EarthSystem only reads its
  direction) and flip that flag.
- **Build Bay:** `BayEnvironment` fades every directional light that is not under `Bay`, so the rig is parented under
  `Bay`. It also forces trilight ambient and its own fog while the bay is loaded. Until BayEnvironment adopts the
  skybox, the dusk HDRI drives the editor view, the probe bake and nothing else at runtime. The minimal change is
  in `Screens/BuildBay/Stage/BayEnvironment.cs` (T015-owned): add `[SerializeField] Material skybox` and, when it is
  set, use `RenderSettings.skybox = skybox; RenderSettings.ambientMode = AmbientMode.Skybox;
  DynamicGI.UpdateEnvironment();` instead of the trilight block, restoring the saved skybox on exit. The visible sky
  in the bay is still the `DuskSky` dome in MF_LaunchPad; the dusk HDRI is rotated so its sun azimuth matches the
  dome's sun.

## Volume profiles

| Profile | Settings |
|---|---|
| MF_Volume_Global | Tonemapping ACES. Bloom threshold 1.1 linear (stored as LinearToGamma(1.1) = 1.043 because URP converts it), intensity 0.28, scatter 0.6, HQ filtering off. Colour adjustments post-exposure 0, contrast +8, saturation +4, hue 0, filter white. Split toning shadows (0.40, 0.47, 0.62), highlights (0.62, 0.55, 0.44), balance −10. Shadows/midtones/highlights: shadows (0.90, 0.95, 1.00, +0.03). Lift (0.897, 0.939, 1.000, +0.016) for the navy shadow floor of about sRGB 12. Vignette 0.16, smoothness 0.4, colour #071522. Chromatic aberration, motion blur, lens distortion and film grain at 0; depth of field Off. |
| MF_Volume_Dusk | White balance temperature +12; post-exposure +0.2. |
| MF_Volume_Orbit | White balance temperature −4; contrast +12. |
| MF_Volume_Interior | Bloom intensity 0.18; white balance 0 / 0 (neutral). |
| MF_Volume_CloseUp | Depth of field **Bokeh**, focus 8 m, f/5, 50 mm, 6 blades. Not yet measured on WebGL: if it costs more than 2 ms at 1080p, switch to Gaussian. |

The shadow floor uses Lift and not Shadows/Midtones/Highlights alone, because SMH multiplies and cannot raise
black. Check it with a pixel probe on a fully occluded area of the beauty shot and tune the Lift `w`.

## Quality tiers and renderers

| Tier | Index | Default for | Pipeline asset | Renderer |
|---|---|---|---|---|
| Web | 0 | WebGL | Mobile_RPAsset: HDR, MSAA 4x, scale 1.0, main-light shadows 2 cascades at 2048, soft shadows, SRP Batcher, depth texture, HDR grading | Mobile_Renderer (Forward): SSAO + MfBlurredSceneFeature |
| PC | 1 | Standalone | PC_RPAsset: HDR, MSAA 4x, 4 cascades at 4096, soft shadows, SRP Batcher, HDR grading | PC_Renderer (Forward+): SSAO + MfBlurredSceneFeature |
| Mobile | 2 | Android, iPhone | Mobile_RPAsset (same asset as Web) | Mobile_Renderer; the blur feature skips itself on this tier by name |

Shadow distance is 0 on both assets (space screens need no shadows); `BayEnvironment` raises it to 320 m while the
bay is loaded. No TAA anywhere (the Shell camera uses `AntialiasingMode.None`), and no SSR, compute shaders or VFX
Graph.

SSAO (renderer feature; without the `MODERN_SSAO` define a volume cannot override it): intensity 0.6, radius
1.0 m, direct lighting 0.25, falloff 500 m (the bay vantage is about 190 m from the vehicle, past URP's default
100 m). PC uses full resolution, depth-normals, 8 samples and bilateral blur. Web and Mobile use half resolution,
depth with reconstructed normals, 8 samples and Gaussian blur. In the space screens 1 unit is 1000 km and the
title vehicle is scaled to about 0.05 units per metre, so this radius is very wide there. Check the title shot.

## HDRIs (Poly Haven, CC0, downloaded 2026-11-14)

| File | Slug | URL | Size | Use |
|---|---|---|---|---|
| `HDRI/kloppenheim_06_puresky_2k.hdr` | `kloppenheim_06_puresky` | <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_puresky_2k.hdr> (page <https://polyhaven.com/a/kloppenheim_06_puresky>) | 4 434 394 B, md5 590a829b3cf71216451655e601d542c6 | Dusk sky: sun at 4.7° (column u = 0.613). MF_Sky_Dusk rotation 85.68° puts its azimuth on the key; exposure 0.4. |
| `HDRI/empty_warehouse_01_2k.hdr` | `empty_warehouse_01` | <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/empty_warehouse_01_2k.hdr> (page <https://polyhaven.com/a/empty_warehouse_01>) | 6 581 920 B, md5 bc3fa539601289d2a176b5e8d3be1740 | Neutral interior: overhead source at 51° (u = 0.598) sets the Interior key; rotation 0, exposure 0.7. |

Import: 2D latitude-longitude, no mipmaps (avoids the wrap seam), wrap U repeat and V clamp, max 2048, WebGL
override max 1024. The sun positions were measured as the brightest pixel of each file.
