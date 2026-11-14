#ifndef MF_KIT_FORWARD_PASS_INCLUDED
#define MF_KIT_FORWARD_PASS_INCLUDED

// UniversalForward pass for the kit shaders. Mirrors URP 17.6 Shaders/LitForwardPass.hlsl
// (main + additional lights, shadows, SSAO, SH + reflection probes, fog through
// UniversalFragmentPBR) without lightmaps, APV, DBuffer decals, light layers or cookies:
// kit parts are dynamic objects and the WebGL 2 variant count stays small.
// Define MF_KIT_DECAL before including to get the alpha-clipped decal surface (no part mask).

#include "Assets/MissionForge/Art/Shaders/Kit/MF_KitInput.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

struct MFKitForwardAttributes
{
    float4 positionOS : POSITION;
    float3 normalOS   : NORMAL;
    float4 tangentOS  : TANGENT;
    float2 uv0        : TEXCOORD0;  // metric tiling UV
    float2 uv1        : TEXCOORD1;  // unique part-mask UV
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

struct MFKitForwardVaryings
{
    float4 uv         : TEXCOORD0;  // xy UV0, zw UV1
    float3 positionWS : TEXCOORD1;
    float3 normalWS   : TEXCOORD2;
    half4  tangentWS  : TEXCOORD3;  // xyz tangent, w sign
#ifdef _ADDITIONAL_LIGHTS_VERTEX
    half4  fogFactorAndVertexLight : TEXCOORD4; // x fog, yzw vertex light
#else
    half   fogFactor  : TEXCOORD4;
#endif
#if defined(REQUIRES_VERTEX_SHADOW_COORD_INTERPOLATOR)
    float4 shadowCoord : TEXCOORD5;
#endif
    half3  vertexSH   : TEXCOORD6;
    float4 positionCS : SV_POSITION;
    UNITY_VERTEX_INPUT_INSTANCE_ID
    UNITY_VERTEX_OUTPUT_STEREO
};

MFKitForwardVaryings MFKitForwardVertex(MFKitForwardAttributes input)
{
    MFKitForwardVaryings output = (MFKitForwardVaryings)0;
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_TRANSFER_INSTANCE_ID(input, output);
    UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);

    VertexPositionInputs vertexInput = GetVertexPositionInputs(input.positionOS.xyz);
    VertexNormalInputs normalInput = GetVertexNormalInputs(input.normalOS, input.tangentOS);

    half fogFactor = 0;
#if !defined(_FOG_FRAGMENT)
    fogFactor = ComputeFogFactor(vertexInput.positionCS.z);
#endif

    output.uv = float4(input.uv0, input.uv1);
    output.positionWS = vertexInput.positionWS;
    output.normalWS = normalInput.normalWS;
    real tangentSign = input.tangentOS.w * GetOddNegativeScale();
    output.tangentWS = half4(normalInput.tangentWS.xyz, tangentSign);

#ifdef _ADDITIONAL_LIGHTS_VERTEX
    half3 vertexLight = VertexLighting(vertexInput.positionWS, normalInput.normalWS);
    output.fogFactorAndVertexLight = half4(fogFactor, vertexLight);
#else
    output.fogFactor = fogFactor;
#endif

#if defined(REQUIRES_VERTEX_SHADOW_COORD_INTERPOLATOR)
    output.shadowCoord = GetShadowCoord(vertexInput);
#endif

    output.vertexSH = SampleSHVertex(half3(output.normalWS));
    output.positionCS = vertexInput.positionCS;
    return output;
}

void MFKitInitInputData(MFKitForwardVaryings input, half3 normalTS, out InputData inputData)
{
    inputData = (InputData)0;
    inputData.positionWS = input.positionWS;

    float tangentSign = input.tangentWS.w;
    float3 bitangent = tangentSign * cross(input.normalWS.xyz, input.tangentWS.xyz);
    half3x3 tangentToWorld = half3x3(input.tangentWS.xyz, bitangent.xyz, input.normalWS.xyz);
    inputData.tangentToWorld = tangentToWorld;
    inputData.normalWS = NormalizeNormalPerPixel(TransformTangentToWorld(normalTS, tangentToWorld));
    inputData.viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);

#if defined(REQUIRES_VERTEX_SHADOW_COORD_INTERPOLATOR)
    inputData.shadowCoord = input.shadowCoord;
#elif defined(MAIN_LIGHT_CALCULATE_SHADOWS)
    inputData.shadowCoord = TransformWorldToShadowCoord(inputData.positionWS);
#else
    inputData.shadowCoord = float4(0, 0, 0, 0);
#endif

#ifdef _ADDITIONAL_LIGHTS_VERTEX
    inputData.fogCoord = InitializeInputDataFog(float4(input.positionWS, 1.0), input.fogFactorAndVertexLight.x);
    inputData.vertexLighting = input.fogFactorAndVertexLight.yzw;
#else
    inputData.fogCoord = InitializeInputDataFog(float4(input.positionWS, 1.0), input.fogFactor);
#endif

    inputData.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(input.positionCS);
    inputData.bakedGI = SampleSHPixel(input.vertexSH, inputData.normalWS);
    inputData.shadowMask = unity_ProbesOcclusion; // No lightmaps on kit parts.
}

void MFKitForwardFragment(MFKitForwardVaryings input, out half4 outColor : SV_Target0)
{
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

    SurfaceData surfaceData;
    MFKit_InitBaseSurface(input.uv.xy, surfaceData);
#if defined(MF_KIT_DECAL)
    clip(surfaceData.alpha - _Cutoff);
#else
    MFKit_ApplyPartMask(input.uv.zw, surfaceData);
#endif
    surfaceData.alpha = 1.0h; // Opaque or cutout: never blended.

    InputData inputData;
    MFKitInitInputData(input, surfaceData.normalTS, inputData);

    half4 color = UniversalFragmentPBR(inputData, surfaceData);
    color.rgb = MixFog(color.rgb, inputData.fogCoord);
    color.a = 1.0h;
    outColor = color;
}

#endif // MF_KIT_FORWARD_PASS_INCLUDED
