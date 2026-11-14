#ifndef MF_KIT_DEPTH_PASSES_INCLUDED
#define MF_KIT_DEPTH_PASSES_INCLUDED

// ShadowCaster, DepthOnly and DepthNormals for the kit shaders, following URP 17.6
// Shaders/ShadowCasterPass.hlsl, DepthOnlyPass.hlsl and LitDepthNormalsPass.hlsl.
// DepthNormals feeds SSAO (_CameraNormalsTexture). Define MF_KIT_DECAL before including to
// alpha-clip with the decal's _Cutoff.

#include "Assets/MissionForge/Art/Shaders/Kit/MF_KitInput.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

// ---------------------------------------------------------------- ShadowCaster
// Set by URP ShadowUtils.SetupShadowCasterConstantBuffer for the normal bias.
float3 _LightDirection;
float3 _LightPosition;

struct MFKitShadowAttributes
{
    float4 positionOS : POSITION;
    float3 normalOS   : NORMAL;
    float2 uv0        : TEXCOORD0;
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

struct MFKitShadowVaryings
{
    float2 uv0        : TEXCOORD0;
    float4 positionCS : SV_POSITION;
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

MFKitShadowVaryings MFKitShadowVertex(MFKitShadowAttributes input)
{
    MFKitShadowVaryings output = (MFKitShadowVaryings)0;
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_TRANSFER_INSTANCE_ID(input, output);

    float3 positionWS = TransformObjectToWorld(input.positionOS.xyz);
    float3 normalWS = TransformObjectToWorldNormal(input.normalOS);
#if defined(_CASTING_PUNCTUAL_LIGHT_SHADOW)
    float3 lightDirectionWS = normalize(_LightPosition - positionWS);
#else
    float3 lightDirectionWS = _LightDirection;
#endif
    float4 positionCS = TransformWorldToHClip(ApplyShadowBias(positionWS, normalWS, lightDirectionWS));
    output.positionCS = ApplyShadowClamping(positionCS);
    output.uv0 = input.uv0;
    return output;
}

half4 MFKitShadowFragment(MFKitShadowVaryings input) : SV_TARGET
{
    UNITY_SETUP_INSTANCE_ID(input);
#if defined(MF_KIT_DECAL)
    clip(MFKit_SampleAlpha(MFKit_TiledUV(input.uv0)) - _Cutoff);
#endif
    return 0;
}

// ---------------------------------------------------------------- DepthOnly
struct MFKitDepthAttributes
{
    float4 positionOS : POSITION;
    float2 uv0        : TEXCOORD0;
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

struct MFKitDepthVaryings
{
    float2 uv0        : TEXCOORD0;
    float4 positionCS : SV_POSITION;
    UNITY_VERTEX_INPUT_INSTANCE_ID
    UNITY_VERTEX_OUTPUT_STEREO
};

MFKitDepthVaryings MFKitDepthVertex(MFKitDepthAttributes input)
{
    MFKitDepthVaryings output = (MFKitDepthVaryings)0;
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_TRANSFER_INSTANCE_ID(input, output);
    UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
    output.uv0 = input.uv0;
    output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
    return output;
}

half MFKitDepthFragment(MFKitDepthVaryings input) : SV_TARGET
{
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
#if defined(MF_KIT_DECAL)
    clip(MFKit_SampleAlpha(MFKit_TiledUV(input.uv0)) - _Cutoff);
#endif
    return input.positionCS.z;
}

// ---------------------------------------------------------------- DepthNormals
struct MFKitDepthNormalsAttributes
{
    float4 positionOS : POSITION;
    float3 normalOS   : NORMAL;
    float4 tangentOS  : TANGENT;
    float2 uv0        : TEXCOORD0;
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

struct MFKitDepthNormalsVaryings
{
    float4 positionCS : SV_POSITION;
    float2 uv0        : TEXCOORD1;
    half3  normalWS   : TEXCOORD2;
    half4  tangentWS  : TEXCOORD3;
    UNITY_VERTEX_INPUT_INSTANCE_ID
    UNITY_VERTEX_OUTPUT_STEREO
};

MFKitDepthNormalsVaryings MFKitDepthNormalsVertex(MFKitDepthNormalsAttributes input)
{
    MFKitDepthNormalsVaryings output = (MFKitDepthNormalsVaryings)0;
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_TRANSFER_INSTANCE_ID(input, output);
    UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);

    output.uv0 = input.uv0;
    output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
    VertexNormalInputs normalInput = GetVertexNormalInputs(input.normalOS, input.tangentOS);
    output.normalWS = half3(normalInput.normalWS);
    float tangentSign = input.tangentOS.w * float(GetOddNegativeScale());
    output.tangentWS = half4(normalInput.tangentWS.xyz, tangentSign);
    return output;
}

void MFKitDepthNormalsFragment(MFKitDepthNormalsVaryings input, out half4 outNormalWS : SV_Target0)
{
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

    float2 uv = MFKit_TiledUV(input.uv0);
#if defined(MF_KIT_DECAL)
    clip(MFKit_SampleAlpha(uv) - _Cutoff);
#endif

    float tangentSign = input.tangentWS.w;
    float3 bitangent = tangentSign * cross(input.normalWS.xyz, input.tangentWS.xyz);
    float3 normalTS = MFKit_SampleNormalTS(uv);
    float3 normalWS = TransformTangentToWorld(normalTS, half3x3(input.tangentWS.xyz, bitangent.xyz, input.normalWS.xyz));
    outNormalWS = half4(NormalizeNormalPerPixel(normalWS), 0.0);
}

#endif // MF_KIT_DEPTH_PASSES_INCLUDED
