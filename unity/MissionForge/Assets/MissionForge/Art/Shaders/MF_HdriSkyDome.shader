// HDRI sky dome for the lighting rigs (T031, M8). Drawn on the inside of a large sphere that is a child of a rig
// prefab, so the HDRI shows even though MF_Shell (starfield skybox) stays the active scene and owns
// RenderSettings.skybox at runtime. The direction is camera-relative and the depth is pushed to the far plane, so the
// dome never parallaxes, never clips scenery and covers the Shell skybox (drawn later with ZTest LEqual at the far
// plane). Sampling matches Skybox/Panoramic (latitude-longitude, same _Rotation convention), so the rotation solved in
// LightingFoundation.Rigs.cs for the skybox material also aligns this dome with the key light.
// Dusk grade: zenith multiplier, warm horizon band toward the sun, below-horizon colour and optional haze toward the
// fog colour. _MaxRadiance clamps the sun (about 6e4 in the source) so half-precision targets never overflow.
// WebGL 2 safe: one texture fetch, no derivatives, no compute.
Shader "MissionForge/HdriSkyDome"
{
    Properties
    {
        [NoScaleOffset] _MainTex ("HDRI (latitude-longitude, linear HDR)", 2D) = "grey" {}
        _Rotation ("Rotation (degrees, Skybox/Panoramic convention)", Float) = 0
        _Exposure ("Exposure", Float) = 1
        _Tint ("Tint", Color) = (1, 1, 1, 1)
        _ZenithTint ("Zenith multiplier (dusk grade)", Color) = (1, 1, 1, 1)
        _HorizonTint ("Horizon multiplier toward the sun", Color) = (1, 1, 1, 1)
        _HorizonPower ("Horizon band sharpness", Float) = 4
        _SunDir ("Direction to the sun (world)", Vector) = (0, 0.1, 1, 0)
        _BelowHorizon ("Below-horizon colour (linear)", Color) = (0.03, 0.04, 0.06, 1)
        _HazeStrength ("Horizon haze toward the fog colour", Range(0, 1)) = 0
        _MaxRadiance ("Radiance clamp", Float) = 48
    }
    SubShader
    {
        Tags { "RenderType" = "Background" "Queue" = "Geometry+500" "RenderPipeline" = "UniversalPipeline" "PreviewType" = "Skybox" }
        Pass
        {
            Name "SkyDome"
            Tags { "LightMode" = "UniversalForward" }
            Cull Front
            ZWrite On
            ZTest LEqual
            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);

            CBUFFER_START(UnityPerMaterial)
                float4 _Tint, _ZenithTint, _HorizonTint, _BelowHorizon, _SunDir;
                float _Rotation, _Exposure, _HorizonPower, _HazeStrength, _MaxRadiance;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 dirWS : TEXCOORD0; };

            Varyings vert(Attributes v)
            {
                Varyings o;
                float3 positionWS = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(positionWS);
                // Far plane, nudged inside it so a later skybox (ZTest LEqual at exactly the far plane) fails.
            #if UNITY_REVERSED_Z
                o.positionCS.z = o.positionCS.w * 1e-5;
            #else
                o.positionCS.z = o.positionCS.w * (1.0 - 1e-5);
            #endif
                o.dirWS = positionWS - _WorldSpaceCameraPos;
                return o;
            }

            // Skybox/Panoramic rotates the sphere by +_Rotation about Y and samples with the unrotated direction, so a
            // world direction w maps to texture direction R(-_Rotation) w.
            float2 LatLongUV(float3 w)
            {
                float a = radians(_Rotation);
                float s = sin(a), c = cos(a);
                float3 d = float3(c * w.x + s * w.z, w.y, -s * w.x + c * w.z);
                float longitude = atan2(d.z, d.x);
                float latitude = acos(clamp(d.y, -1.0, 1.0));
                return float2(0.5 - longitude * (0.5 / PI), 1.0 - latitude * (1.0 / PI));
            }

            float4 frag(Varyings i) : SV_Target
            {
                float3 d = normalize(i.dirWS);
                float3 col = SAMPLE_TEXTURE2D_LOD(_MainTex, sampler_MainTex, LatLongUV(d), 0).rgb;
                col = min(col, _MaxRadiance.xxx) * _Exposure * _Tint.rgb;

                // The bay frames only the lowest ~20° of sky, so the upper-sky grade ramps in just above the horizon.
                float up = saturate(d.y);
                col *= lerp(float3(1, 1, 1), _ZenithTint.rgb, smoothstep(0.0, 0.3, up));

                float2 sunXZ = _SunDir.xz;
                float2 dirXZ = d.xz;
                float towardSun = saturate(dot(normalize(dirXZ + 1e-5), normalize(sunXZ + 1e-5)) * 0.5 + 0.5);
                float band = pow(saturate(1.0 - up), max(_HorizonPower, 0.01)) * towardSun * towardSun;
                col *= lerp(float3(1, 1, 1), _HorizonTint.rgb, band);

                col = lerp(col, _BelowHorizon.rgb, saturate(-d.y * 12.0));
                col = lerp(col, unity_FogColor.rgb, _HazeStrength * pow(saturate(1.0 - abs(d.y)), 10.0));
                return float4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
