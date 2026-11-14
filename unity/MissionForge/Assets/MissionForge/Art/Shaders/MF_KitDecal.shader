// MissionForge kit decal shader (task T031 step 7). Lit, alpha-clipped atlas quads that the kit
// generator places 3 mm off the skin along the normal (T032 decals.py). Same lighting and the same
// UnityPerMaterial layout as MissionForge/KitLit (Kit/MF_KitInput.hlsl), so it is SRP Batcher compatible.
//
// Z-fighting at 300 m: with a 24-bit depth buffer and a 0.3 m near plane, one depth step at 300 m is
// about 300^2 / (0.3 * 2^24) = 18 mm, so the 3 mm geometric offset alone is not enough. The polygon
// offset (default factor -1, units -2) adds slope-scaled bias plus two depth steps. The decal writes
// depth with the same offset in every pass, so the result also holds if depth priming is enabled.
// Decals cast no shadows (no ShadowCaster pass) to avoid acne on the skin they sit on.
Shader "MissionForge/KitDecal"
{
    Properties
    {
        [MainTexture][NoScaleOffset] _BaseMap("Decal atlas albedo (sRGB RGBA, UV0 atlas)", 2D) = "white" {}
        [MainColor] _BaseColor("Tint (multiplies albedo)", Color) = (1, 1, 1, 1)
        _Cutoff("Alpha cutoff", Range(0, 1)) = 0.5
        [NoScaleOffset][Normal] _BumpMap("Normal (OpenGL +Y)", 2D) = "bump" {}
        _BumpScale("Normal strength", Float) = 1.0
        [NoScaleOffset] _OrmMap("ORM (linear: R occlusion, G roughness, B metallic)", 2D) = "white" {}
        _OcclusionStrength("ORM occlusion strength", Range(0, 1)) = 1.0
        _Metallic("Metallic (multiplies ORM.B)", Range(0, 1)) = 0.0
        _Smoothness("Smoothness (roughness = ORM.G x (1 - value))", Range(0, 1)) = 0.5
        _MetallicRange("Metallic clamp (x min, y max)", Vector) = (0, 1, 0, 0)
        _RoughnessRange("Roughness clamp (x min, y max)", Vector) = (0, 1, 0, 0)
        _Tiling("Tiling (keep 1: atlas UVs)", Float) = 1.0

        _DecalOffsetFactor("Polygon offset factor", Float) = -1
        _DecalOffsetUnits("Polygon offset units", Float) = -2
        [Enum(UnityEngine.Rendering.CullMode)] _Cull("Cull", Float) = 2

        // Shared UnityPerMaterial layout with KitLit; the decal does not read the part mask.
        [HideInInspector][NoScaleOffset] _PartMask("Part mask", 2D) = "white" {}
        [HideInInspector] _MaskAOStrength("Mask AO strength", Range(0, 1)) = 1.0
        [HideInInspector] _HeatTint("Heat tint", Color) = (1, 1, 1, 1)
        [HideInInspector] _MaskB_IsFrost("Mask B is frost", Float) = 0.0
        [HideInInspector] _Frost("Frost", Range(0, 1)) = 0.0
        [HideInInspector] _FrostColor("Frost rime colour", Color) = (0.9137255, 0.9450980, 0.9568627, 1)
        [HideInInspector] _FrostRoughness("Frost roughness", Range(0, 1)) = 0.85
        [HideInInspector] _WearAmount("Edge wear amount", Range(0, 1)) = 0.0
        [HideInInspector] _WearColor("Edge wear colour", Color) = (0.62, 0.63, 0.64, 1)
        [HideInInspector] _GrimeAmount("Cavity grime amount", Range(0, 1)) = 0.0
        [HideInInspector] _GrimeColor("Grime colour", Color) = (0.45, 0.42, 0.38, 1)
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "TransparentCutout"
            "RenderPipeline" = "UniversalPipeline"
            "UniversalMaterialType" = "Lit"
            "Queue" = "AlphaTest+1"
            "IgnoreProjector" = "True"
        }
        LOD 300

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            ZWrite On
            ZTest LEqual
            Offset [_DecalOffsetFactor], [_DecalOffsetUnits]
            Cull [_Cull]

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex MFKitForwardVertex
            #pragma fragment MFKitForwardFragment

            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile _ EVALUATE_SH_MIXED EVALUATE_SH_VERTEX
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BLENDING
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BOX_PROJECTION
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #include_with_pragmas "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Fog.hlsl"

            #pragma multi_compile_instancing

            #define MF_KIT_DECAL 1
            #include "Assets/MissionForge/Art/Shaders/Kit/MF_KitForwardPass.hlsl"
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }

            ZWrite On
            ColorMask R
            Offset [_DecalOffsetFactor], [_DecalOffsetUnits]
            Cull [_Cull]

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex MFKitDepthVertex
            #pragma fragment MFKitDepthFragment
            #pragma multi_compile_instancing
            #define MF_KIT_DECAL 1
            #include "Assets/MissionForge/Art/Shaders/Kit/MF_KitDepthPasses.hlsl"
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }

            ZWrite On
            Offset [_DecalOffsetFactor], [_DecalOffsetUnits]
            Cull [_Cull]

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex MFKitDepthNormalsVertex
            #pragma fragment MFKitDepthNormalsFragment
            #pragma multi_compile_instancing
            #define MF_KIT_DECAL 1
            #include "Assets/MissionForge/Art/Shaders/Kit/MF_KitDepthPasses.hlsl"
            ENDHLSL
        }
    }

    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
