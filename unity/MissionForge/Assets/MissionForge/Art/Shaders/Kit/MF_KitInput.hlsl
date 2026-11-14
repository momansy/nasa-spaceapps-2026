#ifndef MF_KIT_INPUT_INCLUDED
#define MF_KIT_INPUT_INCLUDED

// Shared material inputs for MissionForge/KitLit and MissionForge/KitDecal (task T031 step 7).
// Hand-written URP 17.6 HLSL instead of a Shader Graph: Shader Graph files cannot be authored
// reliably by hand, and this keeps the WebGL 2 keyword set under our control.
//
// Conventions (contract in orchestration/tasks/T032-model-fidelity-materials-engines.md):
//   UV0 is metric (1 UV unit = 1 m). _Tiling is metres per texture repeat, so the sampled
//       coordinate is uv0 / _Tiling.
//   UV1 is the unique 0..1 bake layout carrying the per-part mask:
//       R ambient occlusion, G edge wear, B heat (engines) or frost (tanks), A cavity
//       (1 = open surface, 0 = crevice; grime collects where A is low).
//   ORM is linear: R occlusion, G roughness, B metallic. Smoothness = 1 - roughness.
// Every number marked game_value is an artistic presentation choice, not a physical constant.

#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/SurfaceData.hlsl"
#include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Packing.hlsl"

// game_value constants of the part-mask look.
#define MF_KIT_MIN_TILING_M            0.001  // Guards a zero _Tiling (metres per repeat).
#define MF_KIT_WEAR_SOFTNESS           0.08   // Mask G band above the wear threshold that fades in.
#define MF_KIT_WEAR_METALLIC           0.85   // Bare metal revealed at worn edges.
#define MF_KIT_WEAR_ROUGHNESS          0.38
#define MF_KIT_GRIME_ROUGHNESS_ADD     0.15   // Grime makes cavities duller.
#define MF_KIT_FROST_NORMAL_FLATTEN    0.85   // Rime hides the base normal detail (sparkle-free).

// NOTE: identical layout in every pass of both kit shaders, never #if'd (SRP Batcher).
CBUFFER_START(UnityPerMaterial)
    half4  _BaseColor;
    half4  _HeatTint;
    half4  _FrostColor;
    half4  _WearColor;
    half4  _GrimeColor;
    float4 _MetallicRange;   // x min, y max (clamp after the multiplier)
    float4 _RoughnessRange;  // x min, y max (clamp after the multiplier)
    float  _Tiling;          // metres per texture repeat on UV0
    half   _BumpScale;
    half   _Metallic;        // multiplies ORM.B
    half   _Smoothness;      // roughness = ORM.G * (1 - _Smoothness)
    half   _OcclusionStrength;
    half   _MaskAOStrength;
    half   _MaskB_IsFrost;   // 0 = mask B is heat, 1 = mask B is frost
    half   _Frost;           // 0..1, runtime (propellant loading)
    half   _FrostRoughness;
    half   _WearAmount;      // 0..1
    half   _GrimeAmount;     // 0..1
    half   _Cutoff;          // decal alpha clip
CBUFFER_END

TEXTURE2D(_BaseMap);  SAMPLER(sampler_BaseMap);
TEXTURE2D(_BumpMap);  SAMPLER(sampler_BumpMap);
TEXTURE2D(_OrmMap);   SAMPLER(sampler_OrmMap);
TEXTURE2D(_PartMask); SAMPLER(sampler_PartMask);

float2 MFKit_TiledUV(float2 uv0)
{
    return uv0 / max(_Tiling, MF_KIT_MIN_TILING_M);
}

half3 MFKit_SampleNormalTS(float2 tiledUV)
{
    half4 packedNormal = SAMPLE_TEXTURE2D(_BumpMap, sampler_BumpMap, tiledUV);
    return UnpackNormalScale(packedNormal, _BumpScale);
}

half MFKit_SampleAlpha(float2 tiledUV)
{
    return SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, tiledUV).a * _BaseColor.a;
}

// Base PBR surface from the UV0 tiling set. With every texture unassigned (white albedo, flat
// "bump", white ORM) this reproduces the flat URP Lit look: albedo = _BaseColor,
// metallic = _Metallic, smoothness = _Smoothness, occlusion = 1.
void MFKit_InitBaseSurface(float2 uv0, out SurfaceData surface)
{
    float2 uv = MFKit_TiledUV(uv0);
    half4 albedo = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, uv);
    half3 orm = SAMPLE_TEXTURE2D(_OrmMap, sampler_OrmMap, uv).rgb;

    half roughness = clamp(orm.g * (1.0h - _Smoothness), _RoughnessRange.x, _RoughnessRange.y);

    surface = (SurfaceData)0;
    surface.albedo = albedo.rgb * _BaseColor.rgb;
    surface.alpha = albedo.a * _BaseColor.a;
    surface.metallic = clamp(orm.b * _Metallic, _MetallicRange.x, _MetallicRange.y);
    surface.smoothness = 1.0h - roughness;
    surface.occlusion = lerp(1.0h, orm.r, _OcclusionStrength);
    surface.normalTS = MFKit_SampleNormalTS(uv);
    surface.specular = half3(0.0h, 0.0h, 0.0h);
    surface.emission = half3(0.0h, 0.0h, 0.0h);
    surface.clearCoatMask = 0.0h;
    surface.clearCoatSmoothness = 0.0h;
}

// Per-part UV1 mask. The default "white" mask with the default parameters is a no-op:
// AO 1, wear threshold 1, heat tint white, frost 0, cavity 1.
void MFKit_ApplyPartMask(float2 uv1, inout SurfaceData surface)
{
    half4 mask = SAMPLE_TEXTURE2D(_PartMask, sampler_PartMask, uv1);

    // R: baked ambient occlusion.
    surface.occlusion *= lerp(1.0h, mask.r, _MaskAOStrength);

    // A: cavity -> grime.
    half grime = saturate((1.0h - mask.a) * _GrimeAmount);
    surface.albedo = lerp(surface.albedo, surface.albedo * _GrimeColor.rgb, grime);
    surface.smoothness = saturate(surface.smoothness - grime * MF_KIT_GRIME_ROUGHNESS_ADD);

    // G: edge wear above a threshold that drops as _WearAmount rises.
    half threshold = 1.0h - _WearAmount;
    half wear = smoothstep(threshold, threshold + MF_KIT_WEAR_SOFTNESS, mask.g);
    surface.albedo = lerp(surface.albedo, _WearColor.rgb, wear);
    surface.metallic = lerp(surface.metallic, MF_KIT_WEAR_METALLIC, wear);
    surface.smoothness = lerp(surface.smoothness, 1.0h - MF_KIT_WEAR_ROUGHNESS, wear);

    // B: heat tint (multiplied by mask B) or frost rime (mask B x _Frost).
    half isFrost = step(0.5h, _MaskB_IsFrost);
    half heat = mask.b * (1.0h - isFrost);
    surface.albedo *= lerp(half3(1.0h, 1.0h, 1.0h), _HeatTint.rgb, heat);

    half frost = saturate(mask.b * _Frost) * isFrost;
    surface.albedo = lerp(surface.albedo, _FrostColor.rgb, frost);
    surface.metallic = lerp(surface.metallic, 0.0h, frost);
    surface.smoothness = lerp(surface.smoothness, 1.0h - _FrostRoughness, frost);
    surface.normalTS = normalize(lerp(surface.normalTS, half3(0.0h, 0.0h, 1.0h), frost * MF_KIT_FROST_NORMAL_FLATTEN));
}

#endif // MF_KIT_INPUT_INCLUDED
