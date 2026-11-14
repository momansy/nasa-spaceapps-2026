// Dual-Kawase blur used by MfBlurredSceneFeature (T031 step 5, VISUAL_TARGET 3.1 "e2 glass panel").
// Fragment-only full-screen passes driven by Core's Blit.hlsl Vert (procedural triangle, SV_VertexID), so it
// compiles for WebGL 2 / GLES3: no compute, no texture arrays outside XR, no integer ops in the fragment stage.
//
// Inputs (set per draw by MfBlurredSceneFeature through a MaterialPropertyBlock):
//   _BlitTexture            source level (bilinear, clamp). Unity fills _BlitTexture_TexelSize from it.
//   _BlitScaleBias          (1, 1, 0, 0).
//   _MfBlurOffset           tap distance multiplier in source texels (1.0 = reference dual filter).
//
// Pass 0 "MfKawaseDown": centre x4 + 4 diagonal taps at +-0.5*offset texels, /8 (Bjorge, SIGGRAPH 2015).
//                        The feature also uses it for the full-res -> 1/4 prefilter with offset = downsample/2,
//                        which places the diagonal taps at +-1 texel so the 4 bilinear taps cover the 4x4 block.
// Pass 1 "MfKawaseUp":   4 cross taps at +-1*offset texels (weight 1) + 4 diagonal at +-0.5*offset (weight 2), /12.
// Output alpha is forced to 1 so the UI never alpha-blends the scene copy away.
Shader "Hidden/MissionForge/KawaseBlur"
{
    HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Common.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"

        float _MfBlurOffset;

        half3 SampleSource(float2 uv)
        {
            return SAMPLE_TEXTURE2D_X_LOD(_BlitTexture, sampler_LinearClamp, uv, 0).rgb;
        }

        half4 FragDown(Varyings input) : SV_Target
        {
            UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
            float2 uv = input.texcoord;
            float2 d = _BlitTexture_TexelSize.xy * (0.5 * _MfBlurOffset);

            half3 c = SampleSource(uv) * 4.0;
            c += SampleSource(uv + float2(-d.x, -d.y));
            c += SampleSource(uv + float2( d.x, -d.y));
            c += SampleSource(uv + float2( d.x,  d.y));
            c += SampleSource(uv + float2(-d.x,  d.y));

            return half4(c * (1.0 / 8.0), 1.0);
        }

        half4 FragUp(Varyings input) : SV_Target
        {
            UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
            float2 uv = input.texcoord;
            float2 f = _BlitTexture_TexelSize.xy * _MfBlurOffset;
            float2 h = f * 0.5;

            half3 c = SampleSource(uv + float2(-f.x, 0.0));
            c += SampleSource(uv + float2( f.x, 0.0));
            c += SampleSource(uv + float2(0.0, -f.y));
            c += SampleSource(uv + float2(0.0,  f.y));

            half3 d = SampleSource(uv + float2(-h.x, -h.y));
            d += SampleSource(uv + float2( h.x, -h.y));
            d += SampleSource(uv + float2( h.x,  h.y));
            d += SampleSource(uv + float2(-h.x,  h.y));

            return half4((c + d * 2.0) * (1.0 / 12.0), 1.0);
        }
    ENDHLSL

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        LOD 100
        ZTest Always ZWrite Off Cull Off Blend Off

        Pass // 0
        {
            Name "MfKawaseDown"

            HLSLPROGRAM
                #pragma vertex Vert
                #pragma fragment FragDown
            ENDHLSL
        }

        Pass // 1
        {
            Name "MfKawaseUp"

            HLSLPROGRAM
                #pragma vertex Vert
                #pragma fragment FragUp
            ENDHLSL
        }
    }

    Fallback Off
}
