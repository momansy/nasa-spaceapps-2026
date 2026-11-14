// Dusk sky dome for the Build Bay (T015). Unlit, drawn on the inside of a large sphere around the pad; WebGL 2 safe
// (no compute, no derivatives beyond the basics). Colours are art-direction game_values from STYLE_GUIDE.md: deep
// Space/Console zenith, warm Sunlight horizon band brightest towards the low sun, cool haze opposite it.
Shader "MissionForge/DuskSky"
{
    Properties
    {
        _Zenith ("Zenith", Color) = (0.035, 0.07, 0.13, 1)
        _Mid ("Mid sky", Color) = (0.11, 0.2, 0.33, 1)
        _Horizon ("Horizon (sun side)", Color) = (1.0, 0.62, 0.38, 1)
        _HorizonCool ("Horizon (away from sun)", Color) = (0.32, 0.38, 0.5, 1)
        _Ground ("Below horizon", Color) = (0.05, 0.05, 0.06, 1)
        _SunDir ("Direction to sun (world)", Vector) = (0.6, 0.12, 0.8, 0)
        _SunGlow ("Sun glow strength", Float) = 1.6
        _Exposure ("Exposure", Float) = 1.0
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry+500" "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            Name "Sky"
            Cull Front
            ZWrite On
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Zenith, _Mid, _Horizon, _HorizonCool, _Ground;
                float4 _SunDir;
                half _SunGlow, _Exposure;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 dirWS : TEXCOORD0; };

            Varyings vert(Attributes v)
            {
                Varyings o;
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(ws);
                o.dirWS = ws - TransformObjectToWorld(float3(0, 0, 0));
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                float3 d = normalize(i.dirWS);
                float3 sun = normalize(_SunDir.xyz);
                float h = d.y;
                float towardSun = saturate(dot(normalize(float3(d.x, 0, d.z)), normalize(float3(sun.x, 0, sun.z))) * 0.5 + 0.5);
                half3 horizon = lerp(_HorizonCool.rgb, _Horizon.rgb, towardSun * towardSun);
                half3 col;
                if (h >= 0)
                {
                    float band = pow(saturate(1 - h), 6);
                    col = lerp(_Zenith.rgb, _Mid.rgb, pow(saturate(1 - h), 2));
                    col = lerp(col, horizon, band);
                }
                else
                {
                    col = lerp(horizon * 0.35, _Ground.rgb, saturate(-h * 8));
                }
                float glow = pow(saturate(dot(d, sun)), 24) * _SunGlow + pow(saturate(dot(d, sun)), 512) * 4;
                col += _Horizon.rgb * glow;
                return half4(col * _Exposure, 1);
            }
            ENDHLSL
        }
    }
}
