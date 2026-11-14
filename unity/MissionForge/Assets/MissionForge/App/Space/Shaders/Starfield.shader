// MissionForge procedural starfield skybox: three hashed star layers, a faint galactic band and the sun.
// Stars do not twinkle: there is no atmosphere between the camera and the stars (physical).
// Star density, colours and the galactic band are art-directed (game simplification).
Shader "MissionForge/Starfield"
{
    Properties
    {
        _StarBrightness ("Star brightness", Float) = 0.7
        _GalaxyBrightness ("Galactic band brightness", Float) = 0.035
        _GalaxyNormal ("Galactic plane normal", Vector) = (0.35, 0.85, -0.39, 0)
        _SunDiscIntensity ("Sun disc intensity", Float) = 60
        _SunGlowIntensity ("Sun glow intensity", Float) = 1.2
        _SunColor ("Sun colour", Color) = (1.0, 0.96, 0.88, 1)
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" "RenderPipeline" = "UniversalPipeline" }
        Cull Off
        ZWrite Off

        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float _StarBrightness;
                float _GalaxyBrightness;
                float4 _GalaxyNormal;
                float _SunDiscIntensity;
                float _SunGlowIntensity;
                float4 _SunColor;
            CBUFFER_END

            float3 _MF_SunDir;

            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 dir : TEXCOORD0;
            };

            Varyings vert(Attributes input)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                o.dir = input.positionOS.xyz;
                return o;
            }

            float3 Hash33(float3 p)
            {
                p = frac(p * float3(0.1031, 0.1030, 0.0973));
                p += dot(p, p.yxz + 33.33);
                return frac((p.xxy + p.yxx) * p.zyx);
            }

            float Hash13(float3 p)
            {
                p = frac(p * 0.1031);
                p += dot(p, p.zyx + 31.32);
                return frac((p.x + p.y) * p.z);
            }

            float ValueNoise(float3 p)
            {
                float3 i = floor(p);
                float3 f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                float n000 = Hash13(i);
                float n100 = Hash13(i + float3(1, 0, 0));
                float n010 = Hash13(i + float3(0, 1, 0));
                float n110 = Hash13(i + float3(1, 1, 0));
                float n001 = Hash13(i + float3(0, 0, 1));
                float n101 = Hash13(i + float3(1, 0, 1));
                float n011 = Hash13(i + float3(0, 1, 1));
                float n111 = Hash13(i + float3(1, 1, 1));
                return lerp(lerp(lerp(n000, n100, f.x), lerp(n010, n110, f.x), f.y),
                            lerp(lerp(n001, n101, f.x), lerp(n011, n111, f.x), f.y), f.z);
            }

            float Fbm(float3 p)
            {
                float a = 0.5;
                float s = 0.0;
                for (int k = 0; k < 4; k++)
                {
                    s += a * ValueNoise(p);
                    p = p * 2.03 + 17.1;
                    a *= 0.5;
                }
                return s;
            }

            // One layer of stars on a hashed 3D grid. pixelAngle keeps stars at least ~1 px wide.
            float3 StarLayer(float3 dir, float scale, float threshold, float baseRadius, float pixelAngle, float densityBoost)
            {
                float3 p = dir * scale;
                float3 cell = floor(p);
                float3 rnd = Hash33(cell);
                float pick = Hash13(cell + 7.7);
                if (pick < threshold - densityBoost) return 0;
                float3 starPos = cell + 0.25 + rnd * 0.5;
                float3 starDir = normalize(starPos);
                float d = length(dir - starDir);
                float mag = pow(Hash13(cell + 3.1), 5.0);
                float radius = min(max(baseRadius * (0.6 + mag * 1.6), pixelAngle * 0.9), 0.11 / scale);
                float core = exp(-(d * d) / (radius * radius * 0.35));
                // Conserve energy when the radius is clamped up to a pixel.
                float energy = saturate((baseRadius * baseRadius) / (radius * radius)) * 0.7 + 0.3;
                float temp = Hash13(cell + 11.3);
                float3 tint = lerp(float3(1.0, 0.78, 0.60), float3(0.72, 0.84, 1.0), temp);
                tint = lerp(tint, float3(1, 1, 1), 0.45);
                return tint * core * energy * (0.25 + mag * 6.0);
            }

            half4 frag(Varyings i) : SV_Target
            {
                float3 dir = normalize(i.dir);
                float pixelAngle = length(fwidth(dir));

                float band = exp(-pow(dot(dir, normalize(_GalaxyNormal.xyz)) * 3.2, 2.0));
                float clouds = Fbm(dir * 3.5 + 4.0);
                float dust = Fbm(dir * 9.0 - 2.0);
                float galaxy = band * smoothstep(0.25, 0.85, clouds) * (0.55 + 0.45 * dust);

                float3 col = 0;
                // Low star density (STYLE_GUIDE.md). A star never reaches past a quarter of its hash cell
                // (radius x 2.2 < 0.25 / scale), so no star is cut off at a cell boundary.
                col += StarLayer(dir, 40.0, 0.935, 0.0010, pixelAngle, galaxy * 0.04);
                col += StarLayer(dir, 90.0, 0.880, 0.00055, pixelAngle, galaxy * 0.12) * 0.40;
                col += StarLayer(dir, 190.0, 0.900, 0.00030, pixelAngle, galaxy * 0.20) * 0.16;
                col *= _StarBrightness;

                float3 galaxyTint = lerp(float3(0.42, 0.50, 0.80), float3(0.95, 0.78, 0.62), dust);
                col += galaxy * galaxyTint * _GalaxyBrightness;

                // Sun: hard HDR disc plus two glow lobes so bloom produces a natural flare.
                float mu = dot(dir, normalize(_MF_SunDir));
                float disc = smoothstep(0.99990, 0.99996, mu);
                float glow = pow(saturate(mu), 900.0) * 3.0 + pow(saturate(mu), 90.0) * 0.22 + pow(saturate(mu), 9.0) * 0.02;
                col += _SunColor.rgb * (disc * _SunDiscIntensity + glow * _SunGlowIntensity);

                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    Fallback Off
}
