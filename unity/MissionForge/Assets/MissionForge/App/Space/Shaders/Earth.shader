// MissionForge Earth surface: day/night terminator, city lights, ocean glint, moving clouds with shadows.
// Game simplification: lighting is an art-directed analytic model, not a radiometric one.
// Sun direction comes from the global _MF_SunDir (unit vector, world space, pointing TO the sun).
Shader "MissionForge/Earth"
{
    Properties
    {
        _DayTex ("Day albedo (equirect)", 2D) = "white" {}
        _NightTex ("Night lights (equirect)", 2D) = "black" {}
        _OceanTex ("Bathymetry (land = white)", 2D) = "white" {}
        _CloudTex ("Clouds (equirect)", 2D) = "black" {}
        _SunIntensity ("Sun intensity", Float) = 2.6
        _NightLightColor ("City light colour", Color) = (1.0, 0.72, 0.38, 1)
        _NightLightBoost ("City light boost", Float) = 5.0
        _CloudOpacity ("Cloud opacity", Range(0, 1)) = 0.92
        _CloudShadow ("Cloud shadow strength", Range(0, 1)) = 0.45
        _SpecColor2 ("Ocean glint colour", Color) = (1.0, 0.93, 0.82, 1)
        _SpecPower ("Ocean glint tightness", Float) = 120
        _SpecStrength ("Ocean glint strength", Float) = 1.6
        _TerminatorTint ("Terminator tint", Color) = (1.0, 0.42, 0.18, 1)
        _AmbientNight ("Night-side ambient", Color) = (0.010, 0.014, 0.026, 1)
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            Name "EarthForward"
            Tags { "LightMode" = "UniversalForward" }
            Cull Back
            ZWrite On

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_DayTex);   SAMPLER(sampler_DayTex);
            TEXTURE2D(_NightTex); SAMPLER(sampler_NightTex);
            TEXTURE2D(_OceanTex); SAMPLER(sampler_OceanTex);
            TEXTURE2D(_CloudTex); SAMPLER(sampler_CloudTex);

            CBUFFER_START(UnityPerMaterial)
                float _SunIntensity;
                float4 _NightLightColor;
                float _NightLightBoost;
                float _CloudOpacity;
                float _CloudShadow;
                float4 _SpecColor2;
                float _SpecPower;
                float _SpecStrength;
                float4 _TerminatorTint;
                float4 _AmbientNight;
            CBUFFER_END

            float3 _MF_SunDir;        // world space, towards the sun
            float _MF_CloudOffset;    // cloud layer longitude offset in UV turns

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float3 positionWS : TEXCOORD2;
                float3 tangentWS : TEXCOORD3;
            };

            Varyings vert(Attributes input)
            {
                Varyings o;
                o.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(o.positionWS);
                o.normalWS = TransformObjectToWorldNormal(input.normalOS);
                // East-pointing tangent of a Y-up UV sphere.
                float3 eastOS = normalize(cross(float3(0, 1, 0), input.normalOS) + float3(1e-5, 0, 0));
                o.tangentWS = TransformObjectToWorldDir(eastOS);
                o.uv = input.uv;
                return o;
            }

            float Luma(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }

            half4 frag(Varyings i) : SV_Target
            {
                float3 n = normalize(i.normalWS);
                float3 v = normalize(GetCameraPositionWS() - i.positionWS);
                float3 l = normalize(_MF_SunDir);
                float ndl = dot(n, l);

                // Local east/north frame to push the cloud shadow away from the sun.
                float3 east = normalize(i.tangentWS);
                float3 north = normalize(cross(n, east));
                float2 sunUv = float2(dot(l, east), dot(l, north));

                float2 cloudUv = i.uv + float2(_MF_CloudOffset, 0);
                float cloud = SAMPLE_TEXTURE2D(_CloudTex, sampler_CloudTex, cloudUv).r;
                float cloudToSun = SAMPLE_TEXTURE2D(_CloudTex, sampler_CloudTex, cloudUv + sunUv * float2(0.0012, 0.0024)).r;
                float cloudShadowSample = SAMPLE_TEXTURE2D(_CloudTex, sampler_CloudTex, cloudUv + sunUv * float2(0.0035, 0.0070)).r;
                cloud = smoothstep(0.08, 0.85, cloud) * _CloudOpacity;

                float3 albedo = SAMPLE_TEXTURE2D(_DayTex, sampler_DayTex, i.uv).rgb;
                float bathy = SAMPLE_TEXTURE2D(_OceanTex, sampler_OceanTex, i.uv).r;
                float ocean = 1.0 - smoothstep(0.86, 0.97, bathy);

                // Slightly deepen and saturate the ocean so land reads clearly from across a room.
                albedo = lerp(albedo, albedo * float3(0.55, 0.78, 1.08), ocean * 0.55);

                float dayAmount = smoothstep(-0.08, 0.30, ndl);
                float lit = saturate(ndl);
                float3 sunTint = lerp(_TerminatorTint.rgb, float3(1, 1, 1), smoothstep(0.0, 0.42, ndl));
                float3 sun = sunTint * _SunIntensity;

                float shadow = 1.0 - _CloudShadow * smoothstep(0.15, 0.9, cloudShadowSample) * (1.0 - cloud);
                float3 surface = albedo * sun * lit * shadow;

                // Ocean sun glint.
                float3 h = normalize(l + v);
                float spec = pow(saturate(dot(n, h)), _SpecPower) * _SpecStrength;
                float sheen = pow(saturate(dot(n, h)), 12.0) * 0.10;
                surface += (spec + sheen) * ocean * _SpecColor2.rgb * sun * (1.0 - cloud) * saturate(ndl * 4.0);

                // Night side: faint ambient plus city lights that fade out through twilight.
                float3 nightTex = SAMPLE_TEXTURE2D(_NightTex, sampler_NightTex, i.uv).rgb;
                float lights = saturate(Luma(nightTex) - 0.09);
                lights = pow(lights * 1.6, 1.35) * _NightLightBoost;
                float nightAmount = 1.0 - smoothstep(-0.18, 0.06, ndl);
                float3 night = albedo * _AmbientNight.rgb * 3.0 + lights * _NightLightColor.rgb * (1.0 - cloud * 0.85);
                surface = surface + night * nightAmount;

                // Clouds: lit by the sun, self-shadowed by sampling towards the sun, dark at night.
                float relief = saturate(1.0 + (cloud - smoothstep(0.08, 0.85, cloudToSun) * _CloudOpacity) * 1.6);
                float3 cloudCol = float3(0.96, 0.97, 1.0) * sun * (lit * 0.92 + 0.08 * dayAmount) * lerp(0.72, 1.0, relief);
                cloudCol += _AmbientNight.rgb * 1.5 * (1.0 - dayAmount);
                float3 col = lerp(surface, cloudCol, cloud);

                return half4(col, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On
            ColorMask R
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings vert(Attributes input) { Varyings o; o.positionCS = TransformObjectToHClip(input.positionOS.xyz); return o; }
            half4 frag(Varyings i) : SV_Target { return 0; }
            ENDHLSL
        }
    }
    Fallback Off
}
