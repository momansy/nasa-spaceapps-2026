// MissionForge kit PBR shader (task T031 step 7; contract in T032 "Interface this task provides").
// Hand-written URP HLSL in place of the MF_KitLit Shader Graph named in the brief: Shader Graph
// assets cannot be authored reliably by hand. Property meaning and units: Editor/KitMaterials/README.md.
// Targets WebGL 2 / GLES 3 (target 3.5, no compute, lean keyword set). SRP Batcher compatible:
// every per-material value lives in UnityPerMaterial (Kit/MF_KitInput.hlsl), same layout in all passes.
Shader "MissionForge/KitLit"
{
    Properties
    {
        [MainTexture][NoScaleOffset] _BaseMap("Albedo (sRGB, UV0 metric)", 2D) = "white" {}
        [MainColor] _BaseColor("Tint (multiplies albedo)", Color) = (1, 1, 1, 1)
        [NoScaleOffset][Normal] _BumpMap("Normal (OpenGL +Y)", 2D) = "bump" {}
        _BumpScale("Normal strength", Float) = 1.0
        [NoScaleOffset] _OrmMap("ORM (linear: R occlusion, G roughness, B metallic)", 2D) = "white" {}
        _OcclusionStrength("ORM occlusion strength", Range(0, 1)) = 1.0
        _Metallic("Metallic (multiplies ORM.B)", Range(0, 1)) = 0.0
        _Smoothness("Smoothness (roughness = ORM.G x (1 - value))", Range(0, 1)) = 0.5
        _MetallicRange("Metallic clamp (x min, y max)", Vector) = (0, 1, 0, 0)
        _RoughnessRange("Roughness clamp (x min, y max)", Vector) = (0, 1, 0, 0)
        _Tiling("Tiling (metres per texture repeat on UV0)", Float) = 1.0

        [Header(Part mask on UV1)]
        [NoScaleOffset] _PartMask("Part mask (R AO, G edge wear, B heat or frost, A cavity)", 2D) = "white" {}
        _MaskAOStrength("Mask AO strength", Range(0, 1)) = 1.0
        _HeatTint("Heat tint (multiplied by mask B)", Color) = (1, 1, 1, 1)
        [ToggleUI] _MaskB_IsFrost("Mask B is frost (off = heat)", Float) = 0.0
        _Frost("Frost (0..1, runtime)", Range(0, 1)) = 0.0
        _FrostColor("Frost rime colour", Color) = (0.9137255, 0.9450980, 0.9568627, 1) // #E9F1F4
        _FrostRoughness("Frost roughness", Range(0, 1)) = 0.85
        _WearAmount("Edge wear amount", Range(0, 1)) = 0.0
        _WearColor("Edge wear colour (bare metal)", Color) = (0.62, 0.63, 0.64, 1)
        _GrimeAmount("Cavity grime amount", Range(0, 1)) = 0.0
        _GrimeColor("Grime colour (multiplies albedo)", Color) = (0.45, 0.42, 0.38, 1)

        [HideInInspector] _Cutoff("Alpha cutoff (decal shader only)", Range(0, 1)) = 0.5
        [Enum(UnityEngine.Rendering.CullMode)] _Cull("Cull", Float) = 2
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Opaque"
            "RenderPipeline" = "UniversalPipeline"
            "UniversalMaterialType" = "Lit"
            "Queue" = "Geometry"
            "IgnoreProjector" = "True"
        }
        LOD 300

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            ZWrite On
            Cull [_Cull]

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex MFKitForwardVertex
            #pragma fragment MFKitForwardFragment

            // Universal Pipeline keywords (subset of Lit.shader, enough for the PC Forward+ and
            // Mobile Forward renderers in Assets/Settings).
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

            #include "Assets/MissionForge/Art/Shaders/Kit/MF_KitForwardPass.hlsl"
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }

            ZWrite On
            ZTest LEqual
            ColorMask 0
            Cull [_Cull]

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex MFKitShadowVertex
            #pragma fragment MFKitShadowFragment
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #pragma multi_compile_instancing
            #include "Assets/MissionForge/Art/Shaders/Kit/MF_KitDepthPasses.hlsl"
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }

            ZWrite On
            ColorMask R
            Cull [_Cull]

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex MFKitDepthVertex
            #pragma fragment MFKitDepthFragment
            #pragma multi_compile_instancing
            #include "Assets/MissionForge/Art/Shaders/Kit/MF_KitDepthPasses.hlsl"
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }

            ZWrite On
            Cull [_Cull]

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex MFKitDepthNormalsVertex
            #pragma fragment MFKitDepthNormalsFragment
            #pragma multi_compile_instancing
            #include "Assets/MissionForge/Art/Shaders/Kit/MF_KitDepthPasses.hlsl"
            ENDHLSL
        }
    }

    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
