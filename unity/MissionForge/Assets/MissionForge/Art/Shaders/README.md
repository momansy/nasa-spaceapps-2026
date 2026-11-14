# Art/Shaders

Custom shaders and render features for the MissionForge look (T031). WebGL 2 first: fragment-only
URP HLSL, no compute, no VFX Graph.

## Blurred scene copy for glass panels

| Piece | Path |
|---|---|
| Blur shader | `MfKawaseBlur.shader` (`Hidden/MissionForge/KawaseBlur`) |
| Renderer feature | `Rendering/MfBlurredSceneFeature.cs`, type `MissionForge.Rendering.MfBlurredSceneFeature, MissionForge.Rendering` |
| UI consumer | `UI/Components/MfGlassPanel.cs` (`MissionForge.UI`, no URP reference) |
| Base styles | `UI/Components/Glass.uss` (`.mf-glass`, `.mf-glass--opaque`) |

UI Toolkit has no backdrop blur. Instead, a URP renderer feature makes a blurred copy of the
graded scene each frame, and `MfGlassPanel` draws the part of it behind the panel.

### What the feature does

- **Event:** `AfterRenderingPostProcessing`. The copy is the final tonemapped and graded scene.
  It runs before the screen-space UI overlay, so UI never appears in the copy and glass never
  shows glass. The pass sets `requiresIntermediateTexture = true`, so post-processing does not
  resolve straight to the backbuffer. If the active target is still the backbuffer, the pass
  skips that frame.
- **Cameras:** only `CameraType.Game` base cameras. Scene view, preview, reflection and overlay
  cameras are skipped. In a camera stack, the copy is the base camera's output without later
  overlay cameras.
- **Chain** (defaults: `downsample = 4`, `iterations = 2`, `offset = 1.0`):
  1. A prefilter with pass 0 takes full resolution down to ¼ resolution. It uses offset
     `downsample / 2`, so the 4 bilinear taps cover the 4×4 footprint.
  2. Two dual-Kawase down passes (pass 0) take ¼ to ⅛ and then ⅛ to 1/16.
  3. Two dual-Kawase up passes (pass 1) take 1/16 to ⅛ and then ⅛ to ¼.
  4. The last up pass writes a **persistent RTHandle** (¼ resolution, bilinear, clamp, no
     mips). The handle is imported into the render graph, so it outlives the frame.
- **Format:** `R8G8B8A8_SRGB` in linear projects (this project is linear), and
  `R8G8B8A8_UNorm` otherwise or when sRGB is not renderable. 8 bits is enough after
  tonemapping, and sRGB storage avoids banding in dark gradients. `SRGB8_ALPHA8` is
  colour-renderable on WebGL 2.
- **Settings:** the serialized fields are `m_Shader` (falls back to `Shader.Find`) and
  `m_Settings { downsample, iterations, offset }`. In the editor, `Create()` fills `m_Shader`
  so the reference is saved with the renderer asset and the shader ships in player builds. If
  the renderer asset is never re-saved, add the shader to *Always Included Shaders*.

### Global contract

| Global | Type | Meaning |
|---|---|---|
| `_MfBlurredSceneTex` | `RenderTexture` | Blurred copy covering the full camera viewport. UV (0,0) is bottom-left. |
| `_MfBlurredSceneFrame` | float | `Time.frameCount` when the copy was last recorded |

Both are set on the CPU with `Shader.SetGlobalTexture` and `Shader.SetGlobalFloat` while the
pass is recorded, so `Shader.GetGlobalTexture` and `Shader.GetGlobalFloat` read them back from
C#. The texture object stays the same from frame to frame and only changes when the screen size
changes.

### Fallback rules (opaque Console panel, class `mf-glass--opaque`)

`MfGlassPanel` checks these every frame and only toggles the class when the result changes:

1. `MfGlassPanel.ForceOpaque` is true (high-contrast mode sets it).
2. The panel or any ancestor has class `mf-hc` or `bb-hc`.
3. The quality tier name is `Mobile`. The feature also skips the pass entirely on this tier.
4. `_MfBlurredSceneTex` is null, is not a `RenderTexture`, or `IsCreated()` is false.
5. `_MfBlurredSceneFrame` is more than 2 frames behind `Time.frameCount`, or is ahead of it.
   This covers a missing feature, a renderer without the feature, and a camera that stopped
   rendering.

> **Note:** in `ProjectSettings/QualitySettings.asset`, the `PC` tier excludes WebGL and the
> WebGL default is tier 0 (`Mobile`). As configured today, glass is **always opaque on WebGL**.
> Enabling glass on WebGL needs a non-Mobile tier for WebGL (owned by step 6 of T031).

### Cost model (to be replaced by measurements)

At 1920×1080 with the defaults:

| Pass | Target | Pixels written | Taps per pixel | Taps |
|---|---|---|---|---|
| Prefilter | 480×270 | 129,600 | 5 | 648 k |
| Down 1 | 240×135 | 32,400 | 5 | 162 k |
| Down 2 | 120×67 | 8,040 | 5 | 40 k |
| Up 1 | 240×135 | 32,400 | 8 | 259 k |
| Up 2 (result) | 480×270 | 129,600 | 8 | 1,037 k |
| **Total** | | **≈ 0.33 Mpx** | | **≈ 2.15 M bilinear taps** |

That is about the bandwidth of one single-tap full-screen 1080p pass (2.07 Mpx). The main costs:

- the prefilter's full-resolution reads;
- five render-target switches, which matter on tiled GPUs;
- the UI cost: each glass panel adds 2 draws (a textured fan of 29 vertices and a tint fan)
  plus a highlight quad, and regenerates its geometry every frame while visible.

The T031 budget is **≤ 1.5 ms at 1080p on WebGL**. A measured number with the machine,
browser, and glass on and off will be added here (evidence in `orchestration/evidence/T031/`).
