using System;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace MissionForge.Rendering
{
    /// <summary>
    /// Produces the blurred scene copy that UI Toolkit glass panels (MissionForge.UI.MfGlassPanel) sample.
    /// After post-processing on Game base cameras it downsamples the graded colour to 1/<see cref="Settings.downsample"/>
    /// resolution, runs a dual-Kawase pyramid and writes the result into a persistent RTHandle that outlives the
    /// render graph. Contract (see Art/Shaders/README.md):
    ///   global texture <c>_MfBlurredSceneTex</c> (the RenderTexture) and global float <c>_MfBlurredSceneFrame</c>
    ///   (Time.frameCount of the last write). Skipped entirely on the "Mobile" quality tier.
    /// </summary>
    [DisallowMultipleRendererFeature("MF Blurred Scene")]
    public sealed class MfBlurredSceneFeature : ScriptableRendererFeature
    {
        public const string ShaderName = "Hidden/MissionForge/KawaseBlur";
        public const string GlobalTextureName = "_MfBlurredSceneTex";
        public const string GlobalFrameName = "_MfBlurredSceneFrame";
        public const string DisabledQualityTier = "Mobile";

        /// <summary>Measurement switch (<see cref="MfRenderToggles"/>, -mfNoGlass): skip the pass so every glass panel falls back to opaque.</summary>
        public static bool ForceDisabled { get; set; }

        [Serializable]
        public sealed class Settings
        {
            [Tooltip("Resolution divisor of the blurred copy (4 = quarter resolution: 1920x1080 -> 480x270).")]
            [Range(1, 8)] public int downsample = 4;

            [Tooltip("Dual-Kawase levels: this many half-res downsamples, then as many upsamples back.")]
            [Range(0, MfBlurredScenePass.MaxIterations)] public int iterations = 2;

            [Tooltip("Tap distance multiplier in source texels (1 = reference dual filter).")]
            [Range(0.25f, 4f)] public float offset = 1f;
        }

        [SerializeField] private Shader m_Shader;
        [SerializeField] private Settings m_Settings = new Settings();

        private Material m_Material;
        private MfBlurredScenePass m_Pass;

        public override void Create()
        {
#if UNITY_EDITOR
            // Serialise the reference when the renderer asset is saved so the shader ships in player builds.
            if (m_Shader == null)
                m_Shader = Shader.Find(ShaderName);
#endif
            if (m_Settings == null)
                m_Settings = new Settings();

            m_Pass ??= new MfBlurredScenePass();
            EnsureMaterial();
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            CameraData cameraData = renderingData.cameraData;
            if (cameraData.cameraType != CameraType.Game || cameraData.renderType != CameraRenderType.Base)
                return;

            // Glass falls back to opaque on the Mobile tier (MfGlassPanel sees a stale frame stamp).
            if (ForceDisabled || MfQualityTier.Is(DisabledQualityTier))
                return;

            if (m_Pass == null || !EnsureMaterial())
                return;

            m_Pass.Setup(m_Material, m_Settings);
            renderer.EnqueuePass(m_Pass);
        }

        protected override void Dispose(bool disposing)
        {
            m_Pass?.Dispose();
            m_Pass = null;
            CoreUtils.Destroy(m_Material);
            m_Material = null;
        }

        private bool EnsureMaterial()
        {
            Shader shader = m_Shader != null ? m_Shader : Shader.Find(ShaderName);
            if (shader == null || !shader.isSupported)
                return false;

            if (m_Material != null && m_Material.shader == shader)
                return true;

            CoreUtils.Destroy(m_Material);
            m_Material = CoreUtils.CreateEngineMaterial(shader);
            return m_Material != null;
        }
    }

    /// <summary>
    /// Render Graph pass behind <see cref="MfBlurredSceneFeature"/>. Records 1 + 2 * iterations raster passes:
    /// prefilter (full -> 1/downsample), iterations x dual-Kawase down, iterations x dual-Kawase up. The last
    /// pass writes the imported persistent RTHandle. Allocation-free per frame once the handle exists.
    /// </summary>
    internal sealed class MfBlurredScenePass : ScriptableRenderPass, IDisposable
    {
        public const int MaxIterations = 4;
        private const int PassDown = 0;
        private const int PassUp = 1;

        private static readonly int s_BlitTextureId = Shader.PropertyToID("_BlitTexture");
        private static readonly int s_BlitScaleBiasId = Shader.PropertyToID("_BlitScaleBias");
        private static readonly int s_BlurOffsetId = Shader.PropertyToID("_MfBlurOffset");
        private static readonly int s_GlobalTextureId = Shader.PropertyToID(MfBlurredSceneFeature.GlobalTextureName);
        private static readonly int s_GlobalFrameId = Shader.PropertyToID(MfBlurredSceneFeature.GlobalFrameName);
        private static readonly Vector4 s_IdentityScaleBias = new Vector4(1f, 1f, 0f, 0f);

        private static readonly string[] s_DownNames =
            { "MF Blur Prefilter", "MF Blur Down 1", "MF Blur Down 2", "MF Blur Down 3", "MF Blur Down 4" };
        private static readonly string[] s_UpNames =
            { "MF Blur Up 0", "MF Blur Up 1", "MF Blur Up 2", "MF Blur Up 3" };
        private static readonly string[] s_LevelNames =
            { "_MfBlurLevel0", "_MfBlurLevel1", "_MfBlurLevel2", "_MfBlurLevel3", "_MfBlurLevel4" };
        private static readonly string[] s_UpLevelNames =
            { "_MfBlurUp0", "_MfBlurUp1", "_MfBlurUp2", "_MfBlurUp3" };

        private readonly MaterialPropertyBlock m_Props = new MaterialPropertyBlock();
        private readonly TextureHandle[] m_Levels = new TextureHandle[MaxIterations + 1];
        private readonly int[] m_LevelWidth = new int[MaxIterations + 1];
        private readonly int[] m_LevelHeight = new int[MaxIterations + 1];
        private readonly GraphicsFormat m_Format;

        private RTHandle m_Result;
        private Material m_Material;
        private int m_Downsample = 4;
        private int m_Iterations = 2;
        private float m_Offset = 1f;

        private sealed class BlurPassData
        {
            public TextureHandle source;
            public Material material;
            public MaterialPropertyBlock props;
            public int shaderPass;
            public float offset;
        }

        public MfBlurredScenePass()
        {
            profilingSampler = new ProfilingSampler("MF Blurred Scene");
            renderPassEvent = RenderPassEvent.AfterRenderingPostProcessing;
            // Keeps post-processing off the backbuffer so the graded colour can be sampled here.
            requiresIntermediateTexture = true;
            m_Format = PickFormat();
        }

        public void Setup(Material material, MfBlurredSceneFeature.Settings settings)
        {
            m_Material = material;
            m_Downsample = Mathf.Max(1, settings.downsample);
            m_Iterations = Mathf.Clamp(settings.iterations, 0, MaxIterations);
            m_Offset = Mathf.Max(0f, settings.offset);
        }

        public void Dispose()
        {
            Shader.SetGlobalTexture(s_GlobalTextureId, (Texture)null);
            m_Result?.Release();
            m_Result = null;
        }

        public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
        {
            if (m_Material == null)
                return;

            UniversalResourceData resourceData = frameData.Get<UniversalResourceData>();
            UniversalCameraData cameraData = frameData.Get<UniversalCameraData>();

            // The backbuffer cannot be sampled. requiresIntermediateTexture normally prevents this; if another pass
            // already resolved to the backbuffer, skip: the UI sees a stale frame stamp and goes opaque.
            if (resourceData.isActiveTargetBackBuffer)
                return;

            TextureHandle source = resourceData.activeColorTexture;
            if (!source.IsValid())
                return;

            RenderTextureDescriptor cameraDesc = cameraData.cameraTargetDescriptor;
            int width = Mathf.Max(1, cameraDesc.width / m_Downsample);
            int height = Mathf.Max(1, cameraDesc.height / m_Downsample);

            var resultDesc = new RenderTextureDescriptor(width, height, m_Format, GraphicsFormat.None)
            {
                msaaSamples = 1,
                useMipMap = false,
                autoGenerateMips = false,
            };
            RenderingUtils.ReAllocateHandleIfNeeded(ref m_Result, resultDesc, FilterMode.Bilinear,
                TextureWrapMode.Clamp, name: MfBlurredSceneFeature.GlobalTextureName);

            TextureHandle result = renderGraph.ImportTexture(m_Result);
            RecordPyramid(renderGraph, source, result, width, height);

            // CPU-side globals: the UI reads them with Shader.GetGlobalTexture / GetGlobalFloat.
            Shader.SetGlobalTexture(s_GlobalTextureId, m_Result.rt);
            Shader.SetGlobalFloat(s_GlobalFrameId, Time.frameCount);
        }

        private void RecordPyramid(RenderGraph renderGraph, TextureHandle source, TextureHandle result, int width, int height)
        {
            int iterations = m_Iterations;

            // Prefilter: full res -> 1/downsample. Offset downsample/2 puts the diagonal taps at +-downsample/4
            // texels (+-1 texel at 4x), so the bilinear taps cover the whole 4x4 footprint instead of aliasing.
            m_LevelWidth[0] = width;
            m_LevelHeight[0] = height;
            m_Levels[0] = iterations == 0 ? result : CreateLevel(renderGraph, width, height, s_LevelNames[0]);
            AddBlurPass(renderGraph, s_DownNames[0], source, m_Levels[0], PassDown, m_Downsample * 0.5f, iterations == 0);

            for (int i = 1; i <= iterations; i++)
            {
                m_LevelWidth[i] = Mathf.Max(1, m_LevelWidth[i - 1] / 2);
                m_LevelHeight[i] = Mathf.Max(1, m_LevelHeight[i - 1] / 2);
                m_Levels[i] = CreateLevel(renderGraph, m_LevelWidth[i], m_LevelHeight[i], s_LevelNames[i]);
                AddBlurPass(renderGraph, s_DownNames[i], m_Levels[i - 1], m_Levels[i], PassDown, m_Offset, false);
            }

            TextureHandle current = m_Levels[iterations];
            for (int i = iterations - 1; i >= 0; i--)
            {
                bool isLast = i == 0;
                TextureHandle destination = isLast
                    ? result
                    : CreateLevel(renderGraph, m_LevelWidth[i], m_LevelHeight[i], s_UpLevelNames[i]);
                AddBlurPass(renderGraph, s_UpNames[i], current, destination, PassUp, m_Offset, isLast);
                current = destination;
            }
        }

        private TextureHandle CreateLevel(RenderGraph renderGraph, int width, int height, string name)
        {
            var desc = new TextureDesc(width, height)
            {
                format = m_Format,
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                clearBuffer = false,
                name = name,
            };
            return renderGraph.CreateTexture(desc);
        }

        private void AddBlurPass(RenderGraph renderGraph, string passName, TextureHandle source, TextureHandle destination,
            int shaderPass, float offset, bool writesPersistentResult)
        {
            using (IRasterRenderGraphBuilder builder = renderGraph.AddRasterRenderPass<BlurPassData>(passName, out BlurPassData passData))
            {
                passData.source = source;
                passData.material = m_Material;
                passData.props = m_Props;
                passData.shaderPass = shaderPass;
                passData.offset = offset;

                builder.UseTexture(source, AccessFlags.Read);
                builder.SetRenderAttachment(destination, 0, AccessFlags.Write);

                // Nothing inside the graph reads the imported result; the UI samples it afterwards.
                if (writesPersistentResult)
                    builder.AllowPassCulling(false);

                builder.SetRenderFunc(static (BlurPassData data, RasterGraphContext context) => ExecuteBlur(data, context));
            }
        }

        private static void ExecuteBlur(BlurPassData data, RasterGraphContext context)
        {
            RTHandle source = data.source;
            MaterialPropertyBlock props = data.props;
            props.Clear();
            props.SetTexture(s_BlitTextureId, source);
            props.SetVector(s_BlitScaleBiasId, s_IdentityScaleBias);
            props.SetFloat(s_BlurOffsetId, data.offset);
            context.cmd.DrawProcedural(Matrix4x4.identity, data.material, data.shaderPass, MeshTopology.Triangles, 3, 1, props);
        }

        private static GraphicsFormat PickFormat()
        {
            // The copy is taken after tonemapping, so 8 bits per channel is enough. sRGB storage in linear projects
            // keeps dark gradients from banding; it is colour-renderable on WebGL 2 (SRGB8_ALPHA8).
            GraphicsFormat preferred = QualitySettings.activeColorSpace == ColorSpace.Linear
                ? GraphicsFormat.R8G8B8A8_SRGB
                : GraphicsFormat.R8G8B8A8_UNorm;
            return SystemInfo.IsFormatSupported(preferred, GraphicsFormatUsage.Render)
                ? preferred
                : GraphicsFormat.R8G8B8A8_UNorm;
        }
    }
}
