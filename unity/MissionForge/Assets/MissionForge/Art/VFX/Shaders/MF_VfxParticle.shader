// T016 particle shader for plumes, Mach diamonds, vapour and pad exhaust. WebGL 2 safe (no compute, no textures):
// the soft round sprite is analytic from the particle UV. _Additive 1 = additive glow (plumes), 0 = alpha (vapour).
Shader "MissionForge/VFX/Particle"
{
    Properties
    {
        [HDR] _Tint ("Tint", Color) = (1,1,1,1)
        _Softness ("Edge softness", Range(0.05, 1)) = 0.6
        _Intensity ("Intensity", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" "IgnoreProjector"="True" }
        Pass
        {
            Name "Unlit"
            Blend [_SrcBlend] [_DstBlend]
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Tint;
                half _Softness;
                half _Intensity;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; half4 color : COLOR; float2 uv : TEXCOORD0; };
            struct Varyings { float4 positionCS : SV_POSITION; half4 color : COLOR; float2 uv : TEXCOORD0; };

            Varyings vert (Attributes v)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.color = v.color;
                o.uv = v.uv;
                return o;
            }

            half4 frag (Varyings i) : SV_Target
            {
                float2 d = i.uv * 2.0 - 1.0;
                half r = saturate(1.0 - length(d));
                half a = smoothstep(0.0, _Softness, r);
                half4 c = i.color * _Tint;
                c.a *= a;
                c.rgb *= _Intensity;
                // Premultiplied output works for both blend set-ups (One One additive, One OneMinusSrcAlpha alpha).
                c.rgb *= c.a;
                return c;
            }
            ENDHLSL
        }
    }
}
