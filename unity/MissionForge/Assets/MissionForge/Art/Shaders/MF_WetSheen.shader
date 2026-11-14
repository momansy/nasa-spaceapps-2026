// Wet-ground sheen for outdoor rigs (T031, M8). A thin transparent sheet a few centimetres above the ground that adds
// what wet concrete adds: darkening, and in puddles a glossy specular layer (reflection probe, sun glint,
// practical-light streaks). It does not replace the ground material (Art/Environment is owned by the environment tasks).
// Lighting is URP's own UniversalFragmentPBR with _ALPHAPREMULTIPLY_ON: diffuse is weighted by alpha, specular is
// not, so a nearly clear sheet still reflects fully. Puddles are world-space value noise (no texture); the sheet
// fades out radially from the object origin and with fog, so it has no visible edge.
// WebGL 2 safe: fragment-only, no derivatives, no compute. Blend One OneMinusSrcAlpha, ZWrite Off, polygon offset so
// it never z-fights with the ground.
Shader "MissionForge/WetSheen"
{
    Properties
    {
        _BaseColor ("Wet tint (darkening colour, linear)", Color) = (0.02, 0.035, 0.06, 1)
        _DampDarken ("Damp darkening (alpha)", Range(0, 1)) = 0.18
        _PuddleDarken ("Puddle darkening (alpha)", Range(0, 1)) = 0.35
        _DampSmoothness ("Damp smoothness", Range(0, 1)) = 0.72
        _PuddleSmoothness ("Puddle smoothness", Range(0, 1)) = 0.96
        _PuddleScale ("Puddle size (m)", Float) = 22
        _PuddleCoverage ("Puddle coverage (0..1)", Range(0, 1)) = 0.45
        _PuddleSoftness ("Puddle edge softness", Range(0.01, 0.5)) = 0.12
        _DampSpecular ("Damp specular share (puddles 1)", Range(0, 1)) = 0.3
        _SpecularBoost ("Specular boost", Range(0, 4)) = 1
        _FadeStart ("Radial fade start (m)", Float) = 120
        _FadeEnd ("Radial fade end (m)", Float) = 450
    }
    SubShader
    {
        Tags
        {
            "RenderType" = "Transparent"
            "Queue" = "Transparent-100"
            "RenderPipeline" = "UniversalPipeline"
            "IgnoreProjector" = "True"
        }
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Blend One OneMinusSrcAlpha
            ZWrite Off
            ZTest LEqual
            Offset -1, -1
            Cull Back

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vert
            #pragma fragment frag

            #define _SURFACE_TYPE_TRANSPARENT 1
            #define _ALPHAPREMULTIPLY_ON 1

            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BLENDING
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BOX_PROJECTION
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #include_with_pragmas "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Fog.hlsl"

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
                half _DampDarken, _PuddleDarken, _DampSmoothness, _PuddleSmoothness;
                float _PuddleScale, _PuddleCoverage, _PuddleSoftness, _DampSpecular, _SpecularBoost, _FadeStart, _FadeEnd;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float3 originWS : TEXCOORD2;
                half3 vertexSH : TEXCOORD3;
            };

            Varyings vert(Attributes v)
            {
                Varyings o;
                VertexPositionInputs p = GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS = p.positionCS;
                o.positionWS = p.positionWS;
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.originWS = TransformObjectToWorld(float3(0, 0, 0));
                o.vertexSH = SampleSHVertex(half3(o.normalWS));
                return o;
            }

            // Hash without sine (Dave Hoskins), stable at world coordinates of a few hundred metres.
            float Hash12(float2 p)
            {
                float3 p3 = frac(float3(p.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return frac((p3.x + p3.y) * p3.z);
            }

            float ValueNoise(float2 p)
            {
                float2 i = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                float a = Hash12(i), b = Hash12(i + float2(1, 0)), c = Hash12(i + float2(0, 1)), d = Hash12(i + float2(1, 1));
                return lerp(lerp(a, b, u.x), lerp(c, d, u.x), u.y);
            }

            half4 frag(Varyings i) : SV_Target
            {
                float2 xz = i.positionWS.xz / max(_PuddleScale, 0.1);
                float n = ValueNoise(xz) * 0.65 + ValueNoise(xz * 2.7 + 17.3) * 0.35;
                // Puddles where the noise is above 1 - coverage (value noise clusters around 0.5, so the covered share is
                // somewhat below _PuddleCoverage).
                float threshold = 1.0 - _PuddleCoverage;
                float puddle = smoothstep(threshold - _PuddleSoftness, threshold + _PuddleSoftness, n);

                float radius = length(i.positionWS.xz - i.originWS.xz);
                float fade = 1.0 - smoothstep(_FadeStart, max(_FadeEnd, _FadeStart + 1.0), radius);

                SurfaceData s = (SurfaceData)0;
                s.albedo = _BaseColor.rgb;
                s.metallic = 0;
                s.specular = half3(0, 0, 0);
                s.smoothness = lerp(_DampSmoothness, _PuddleSmoothness, puddle);
                s.occlusion = 1;
                s.alpha = saturate(lerp(_DampDarken, _PuddleDarken, puddle));
                s.normalTS = half3(0, 0, 1);

                InputData d = (InputData)0;
                d.positionWS = i.positionWS;
                d.normalWS = normalize(i.normalWS);
                d.viewDirectionWS = GetWorldSpaceNormalizeViewDir(i.positionWS);
            #if defined(MAIN_LIGHT_CALCULATE_SHADOWS)
                d.shadowCoord = TransformWorldToShadowCoord(i.positionWS);
            #else
                d.shadowCoord = float4(0, 0, 0, 0);
            #endif
                d.fogCoord = 0;
                d.vertexLighting = half3(0, 0, 0);
                d.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(i.positionCS);
                d.bakedGI = SampleSHPixel(i.vertexSH, d.normalWS);
                d.shadowMask = half4(1, 1, 1, 1);

                half4 c = UniversalFragmentPBR(d, s);
                // Premultiplied output: rgb = diffuse * alpha + specular. Damp concrete mostly darkens (little
                // reflection); puddles mirror the sky, sun and practicals. Then fade the whole sheet with distance from
                // its origin and with fog so it has no edge and sits inside the haze.
                c.rgb *= lerp(_DampSpecular, 1.0, puddle) * _SpecularBoost;
                float4 positionCS = TransformWorldToHClip(i.positionWS);
                // MixFogColor(1, 0, f) is the fog transmittance, and 1 when fog is off.
                half visibility = MixFogColor(half3(1, 1, 1), half3(0, 0, 0), ComputeFogFactor(positionCS.z)).r;
                half k = fade * visibility;
                return half4(c.rgb * k, c.a * k);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
