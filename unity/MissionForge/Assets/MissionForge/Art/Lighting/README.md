# Art/Lighting: the shared URP look (T031 step 6)

Everything in this folder is produced by `Assets/MissionForge/Editor/DesignSystem/LightingFoundation*.cs`
(menu **MissionForge > Design System > Lighting**, or batch
`-executeMethod MissionForge.Editor.DesignSystem.LightingFoundation.All`; `LightingFoundation.LookOnly` runs volumes, rigs
and scenes without touching the URP assets and renderers). Edit the script, not the assets: every
step is idempotent and re-running it restores these values. All numbers are `game_value` art targets
(orchestration/VISUAL_TARGET.md 2.5, assets/media/style/STYLE_GUIDE.md), not physical measurements.

**Do not fork the look.** A new scene picks one rig below and drops the prefab in. It does not build its own
lights, volumes or probes. If a scene needs something different, add an override profile here and record it.

## Rigs

Each rig prefab has the same named children (no runtime C#):

| Child | MF_Rig_DuskPad | MF_Rig_Orbit | MF_Rig_Interior |
|---|---|---|---|
| Key Light (directional) | 4500 K, 2.2, soft shadows (strength 0.85). It is the sun: on the HDRI sun (6.09° up), 10° right of the bay view axis (yaw −4°), so it back-lights the vehicle from inside the frame | 5800 K, 2.0, soft shadows, toward the Shell sun (0.90, 0.22, 0.38) | 5000 K, 1.4, soft shadows (0.8), aligned with the HDRI's overhead source (51° up) |
| Fill Light (directional, no shadows) | 8000 K, 0.55 (1/4 of key), T015 fill direction (from the camera side) | 6800 K, 1.0, Earth-shine from below, opposite the sun | 8000 K, 0.35, cool screen bounce from the front |
| Rim Light (directional, no shadows) | amber (1.0, 0.58, 0.30), 3.2, from 65° right of the bay view axis, 4° up, behind the vehicle | amber (1.0, 0.58, 0.30), 1.8, from the title camera's right and behind the vehicle | none |
| Sky Dome (`MF_SkyDome_Dusk`, Reflection Probe Static) | dusk HDRI on an inside-out sphere, depth at the far plane (see below) | none (starfield from MF_Shell) | none |
| Wet Sheen (`MF_WetSheen`) | 800 m plane 4 cm above the site ground, fades out 120–450 m | none | none |
| Reflection Probe (256 px, HDR) | at pad +30 m, influence 3000 x 800 x 3000 m (all visible ground), no box projection, far 3000 m | at origin, 1000 units cube (space scale), no box projection | at +2.5 m, 24 x 8 x 24 m room, **box projection** |
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
Bay/DuskKey, Bay/DuskFill and Bay/BayVolume.

`MF_BuildBay` scene-level overrides on the `MF_LaunchPad` instance (the Art/Environment prefab itself is never edited):

- `DuskSky` (T015's gradient dome, shader `MissionForge/DuskSky`) is set inactive; the rig Sky Dome replaces it.
- The pad floodlights (`pad_floodlight/Flood` spots) are re-aimed from almost horizontal (they washed the vehicle front
  flat) to 15° off vertical towards the pad: 3400 K, 1400, range 60 m, 92°/38° cone, no shadows, so they cast warm
  pools on the deck. **Light budget:** URP Forward (Web tier) shades 4 additional lights per object and the rig has
  two additional directionals (fill, rim), so only the two floodlights nearest the bay camera stay on; the rear one
  (30, 2, 24) keeps its lamp head but its Light is disabled. Main light + 4 additional lights, one shadowed light.

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
- **Build Bay sky (why the HDRI never showed):** two things hid it. (1) MF_Shell stays the active scene, so the
  runtime `RenderSettings.skybox` is the Shell starfield; MF_BuildBay's `MF_Sky_Dusk` skybox only ever drove the editor
  view, and `BayEnvironment` (T015) never sets a skybox. (2) MF_LaunchPad's `DuskSky` dome (procedural purple-to-orange
  gradient, opaque, ZWrite at 2400 m) covered the whole sky anyway. Nothing in `Screens/BuildBay` touches camera clear
  flags or background colour. The fix needs no runtime C#: the DuskPad rig carries a **Sky Dome** (shader
  `Art/Shaders/MF_HdriSkyDome.shader`) that samples the HDRI by camera-relative direction with the same rotation
  convention as Skybox/Panoramic, writes depth just inside the far plane (so the later Shell skybox fails its depth test
  and no scenery is clipped) and is graded for dusk in the material (deep-blue upper sky, orange band towards the sun,
  radiance clamp 48 so the sun blooms without overflowing half floats). `DuskSky` is switched off by a scene override.
- **Build Bay lights:** `BayEnvironment` fades every directional light that is not under `Bay`, so the rig is parented
  under `Bay`. It still forces trilight ambient and its own fog while the bay is loaded; the HDRI therefore drives what
  you see (dome) and reflections (probe), not the ambient. To also use it for ambient, `BayEnvironment.cs` (T015-owned)
  would set `RenderSettings.ambientMode = AmbientMode.Skybox` with this skybox; not done here.
- **Reflection probes bake only Reflection Probe Static objects.** The Sky Dome has that flag, so the bay probe holds
  the graded sky. Environment objects (pad, hills) are not static and are not in the probe (they live in
  Art/Environment; flagging them is the environment task's call).
- **Wet ground:** the site ground material is not ours, so the rig adds a **Wet Sheen** sheet (shader
  `Art/Shaders/MF_WetSheen.shader`, premultiplied URP PBR): damp areas darken the ground 60 % and keep 25 % of their
  reflection, world-space noise puddles (coverage 0.4, 22 m) darken 70 % and mirror the sky, sun and floodlights at
  smoothness 0.95. Polygon offset and a 4 cm lift (`ApplyToScenes` reads `site_ground`'s top, y = −0.4) prevent
  z-fighting; it fades with distance and fog. With the sun in front of the camera the ground material's own sun
  specular brightens the plain ground; the sheen's darkening is what keeps it navy.
- **Sun placement:** T015's sun was 59° right of the view, out of frame, so the dome could never show a sun disc and
  the vehicle was lit flat from the front by the floodlights. The sun is now in frame behind the vehicle (key = HDRI
  sun, 0.00° apart, logged by Build Rigs); the amber Rim Light gives the vehicle's right silhouette a warm edge; the
  fill keeps the camera side readable. If `BayStage.VantageAzimuthDeg` (−14°) changes, update `BayVantageYawDeg`.

## Volume profiles

| Profile | Settings |
|---|---|
| MF_Volume_Global | Tonemapping ACES. Bloom threshold 1.1 linear (stored as LinearToGamma(1.1) = 1.043 because URP converts it), intensity 0.28, scatter 0.6, HQ filtering off. Colour adjustments post-exposure 0, contrast +8, saturation +4, hue 0, filter white. Split toning shadows (0.40, 0.47, 0.62), highlights (0.62, 0.55, 0.44), balance −10. Shadows/midtones/highlights: shadows (0.90, 0.95, 1.00, +0.03). Lift (0.897, 0.939, 1.000, +0.016) for the navy shadow floor of about sRGB 12. Vignette 0.16, smoothness 0.4, colour #071522. Chromatic aberration, motion blur, lens distortion and film grain at 0; depth of field Off. |
| MF_Volume_Dusk | White balance temperature +8 (was +12; that neutralised the HDRI's blue upper sky); post-exposure +0.2. |
| MF_Volume_Orbit | White balance temperature +2 (was −4; with the cool Earth fill it turned the title's ceramic shell blue-grey); contrast +12. |
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
| `HDRI/qwantani_sunset_puresky_2k.hdr` | `qwantani_sunset_puresky` | <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/qwantani_sunset_puresky_2k.hdr> (page <https://polyhaven.com/a/qwantani_sunset_puresky>) | 4 171 959 B, md5 b918af5fefb341535961ffdad5fab7bc | **Dusk sky** (since the M8 pass): visible sun disc (peak radiance about 59 000) at 6.09° (u = 0.6001, luminance-weighted centroid), blue sky, warm horizon, cirrus. Rotation 130.04° puts the sun on the key. MF_Sky_Dusk exposure 0.3 (editor view); MF_SkyDome_Dusk exposure 0.12 plus the dusk grade. |
| `HDRI/kloppenheim_06_puresky_2k.hdr` | `kloppenheim_06_puresky` | <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_puresky_2k.hdr> (page <https://polyhaven.com/a/kloppenheim_06_puresky>) | 4 434 394 B, md5 590a829b3cf71216451655e601d542c6 | No longer referenced: a hazy afternoon sky whose sun is hidden behind cloud (peak radiance about 32), so it gave no sun disc. Kept for reference. |
| `HDRI/empty_warehouse_01_2k.hdr` | `empty_warehouse_01` | <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/empty_warehouse_01_2k.hdr> (page <https://polyhaven.com/a/empty_warehouse_01>) | 6 581 920 B, md5 bc3fa539601289d2a176b5e8d3be1740 | Neutral interior: overhead source at 51° (u = 0.598) sets the Interior key; rotation 0, exposure 0.7. |

Import: 2D latitude-longitude, no mipmaps (avoids the wrap seam), wrap U repeat and V clamp, max 2048, WebGL
override max 1024. The sun positions were measured as the brightest pixel of each file.
