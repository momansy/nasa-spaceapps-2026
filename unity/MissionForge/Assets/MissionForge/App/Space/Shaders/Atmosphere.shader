// MissionForge atmosphere shell: single-scattering Rayleigh + Mie, ray-marched per pixel.
// Drawn on a sphere slightly larger than the planet, additive, front faces.
// Physical model: exponential density, Rayleigh/Mie phase functions, planet shadow.
// Game simplification: the shell is ~3x thicker than the real atmosphere (see EarthSystem) and
// coefficients are scaled to keep the real vertical optical depth, so the limb reads on a TV.
Shader "MissionForge/Atmosphere"
{
    Properties
    {
        _SunIntensity ("Sun intensity", Float) = 14
        _RayleighScale ("Rayleigh density scale", Float) = 1
        _MieScale ("Mie density scale", Float) = 1
        _MieG ("Mie anisotropy g", Range(0, 0.95)) = 0.76
        _Tint ("Tint", Color) = (1, 1, 1, 1)
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            Name "Atmosphere"
            Tags { "LightMode" = "UniversalForward" }
            Cull Back
            ZWrite Off
            ZTest LEqual
            Blend One One

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            #define VIEW_STEPS 8
            #define LIGHT_STEPS 3

            CBUFFER_START(UnityPerMaterial)
                float _SunIntensity;
                float _RayleighScale;
                float _MieScale;
                float _MieG;
                float4 _Tint;
            CBUFFER_END

            float3 _MF_SunDir;
            float3 _MF_PlanetCenter;   // world space
            float _MF_PlanetRadius;    // world units
            float _MF_AtmoRadius;      // world units

            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
            };

            Varyings vert(Attributes input)
            {
                Varyings o;
                o.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(o.positionWS);
                return o;
            }

            // Returns near/far distances along the ray; x > y means no hit.
            float2 RaySphere(float3 ro, float3 rd, float radius)
            {
                float b = dot(ro, rd);
                float c = dot(ro, ro) - radius * radius;
                float h = b * b - c;
                if (h < 0.0) return float2(1e9, -1e9);
                h = sqrt(h);
                return float2(-b - h, -b + h);
            }

            half4 frag(Varyings i) : SV_Target
            {
                float3 camPos = GetCameraPositionWS();
                float3 ro = camPos - _MF_PlanetCenter;
                float3 rd = normalize(i.positionWS - camPos);
                float3 l = normalize(_MF_SunDir);

                float rp = _MF_PlanetRadius;
                float ra = _MF_AtmoRadius;
                float thickness = ra - rp;

                float2 ta = RaySphere(ro, rd, ra);
                if (ta.x > ta.y) return 0;
                float2 tp = RaySphere(ro, rd, rp);
                float t0 = max(ta.x, 0.0);
                float t1 = ta.y;
                bool hitsPlanet = tp.x < tp.y && tp.x > 0.0;
                if (hitsPlanet) t1 = min(t1, tp.x);
                if (t1 <= t0) return 0;

                // Scale heights as a fraction of the (exaggerated) shell thickness.
                float hR = thickness * 0.20;
                float hM = thickness * 0.07;
                // Real vertical optical depths (Rayleigh ~0.046/0.108/0.265, Mie ~0.02), rescaled to this shell.
                float3 betaR = float3(0.046, 0.108, 0.265) / hR * _RayleighScale;
                float betaM = 0.02 / hM * _MieScale;

                float ds = (t1 - t0) / VIEW_STEPS;
                float odR = 0.0;
                float odM = 0.0;
                float3 sumR = 0.0;
                float3 sumM = 0.0;

                for (int s = 0; s < VIEW_STEPS; s++)
                {
                    float3 p = ro + rd * (t0 + (s + 0.5) * ds);
                    float height = max(length(p) - rp, 0.0);
                    float dR = exp(-height / hR) * ds;
                    float dM = exp(-height / hM) * ds;
                    odR += dR;
                    odM += dM;

                    // Planet shadow: soft edge so the terminator does not band.
                    float bl = dot(p, l);
                    float closest = sqrt(max(dot(p, p) - bl * bl, 0.0));
                    float shadow = bl > 0.0 ? 1.0 : smoothstep(rp * 0.985, rp * 1.012, closest);
                    if (shadow <= 0.0) continue;

                    float tl = RaySphere(p, l, ra).y;
                    float dl = tl / LIGHT_STEPS;
                    float odLR = 0.0;
                    float odLM = 0.0;
                    for (int j = 0; j < LIGHT_STEPS; j++)
                    {
                        float3 q = p + l * ((j + 0.5) * dl);
                        float hq = max(length(q) - rp, 0.0);
                        odLR += exp(-hq / hR) * dl;
                        odLM += exp(-hq / hM) * dl;
                    }
                    float3 tau = betaR * (odR + odLR) + betaM * 1.1 * (odM + odLM);
                    float3 att = exp(-tau) * shadow;
                    sumR += dR * att;
                    sumM += dM * att;
                }

                float mu = dot(rd, l);
                float phaseR = 0.0596831 * (1.0 + mu * mu);
                float g = _MieG;
                float g2 = g * g;
                float phaseM = 0.1193662 * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));

                float3 col = _SunIntensity * (sumR * betaR * phaseR + sumM * betaM * phaseM) * _Tint.rgb;
                return half4(col, 0);
            }
            ENDHLSL
        }
    }
    Fallback Off
}
