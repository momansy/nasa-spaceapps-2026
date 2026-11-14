// Translucent "ghost" for the Build Bay (T015): the leading vote option in its slot (Signal teal) and the scale
// references. Unlit, transparent, Fresnel rim so the silhouette reads against the rocket and the sky. WebGL 2 safe.
Shader "MissionForge/Ghost"
{
    Properties
    {
        _Color ("Colour", Color) = (0.333, 0.773, 0.804, 1)
        _Fill ("Face opacity", Range(0, 1)) = 0.16
        _Rim ("Rim opacity", Range(0, 1)) = 0.85
        _RimPower ("Rim power", Range(0.5, 8)) = 2.5
        _Fade ("Fade (animated)", Range(0, 1)) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            Name "Ghost"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Back
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Fill, _Rim, _RimPower, _Fade;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 normalWS : TEXCOORD0; float3 viewWS : TEXCOORD1; };

            Varyings vert(Attributes v)
            {
                Varyings o;
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(ws);
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.viewWS = GetWorldSpaceViewDir(ws);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                float ndv = saturate(abs(dot(normalize(i.normalWS), normalize(i.viewWS))));
                half rim = pow(1 - ndv, _RimPower);
                half a = saturate(_Fill + rim * _Rim) * _Fade * _Color.a;
                return half4(_Color.rgb * (1 + rim), a);
            }
            ENDHLSL
        }
    }
}
