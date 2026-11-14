using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// e2 glass panel (VISUAL_TARGET 3.1). Draws the blurred scene copy published by the URP feature
    /// MissionForge.Rendering.MfBlurredSceneFeature (global texture <c>_MfBlurredSceneTex</c>) aligned to the
    /// element's screen rect and clipped to its rounded corners, then a Console tint and a 1 px Ceramic top highlight.
    /// Children render normally on top.
    ///
    /// Falls back to an opaque Console panel (class <c>mf-glass--opaque</c>, styled in Glass.uss) when
    /// <see cref="ForceOpaque"/> is set, an ancestor has <c>mf-hc</c> or <c>bb-hc</c> (high contrast), the quality
    /// tier is "Mobile", or the blurred copy is missing, not created, or more than <see cref="MaxFrameLag"/> frames old.
    /// The UI assembly does not reference URP: the contract is only the two shader globals.
    /// Never nest glass in glass (the copy is the scene without UI, so nested glass would not show the outer panel).
    /// </summary>
    [UxmlElement]
    public partial class MfGlassPanel : VisualElement
    {
        public const string UssClassName = "mf-glass";
        public const string OpaqueUssClassName = "mf-glass--opaque";
        public const string GlobalTextureName = "_MfBlurredSceneTex";
        public const string GlobalFrameName = "_MfBlurredSceneFrame";
        public const string OpaqueQualityTier = "Mobile";
        public const int MaxFrameLag = 2;

        private const string HighContrastClass = "mf-hc";
        private const string BuildBayHighContrastClass = "bb-hc";
        private const int Segments = GlassMath.DefaultSegmentsPerCorner;
        private const float HighlightThickness = 1f;

        /// <summary>Console #112B40 at 92 % (tokens.json console-92; linear-space blend, reads like 72 % sRGB).</summary>
        public static readonly Color DefaultTint = new Color(17f / 255f, 43f / 255f, 64f / 255f, 0.92f);

        /// <summary>Ceramic #E8EEF0 at 16 %.</summary>
        public static readonly Color DefaultHighlight = new Color(232f / 255f, 238f / 255f, 240f / 255f, 0.16f);

        private static readonly CustomStyleProperty<Color> s_TintProperty = new CustomStyleProperty<Color>("--mf-glass-tint");
        private static readonly CustomStyleProperty<Color> s_HighlightProperty = new CustomStyleProperty<Color>("--mf-glass-highlight");

        // Shared scratch buffer: generateVisualContent runs on the main thread one element at a time.
        private static readonly Vector2[] s_Fan = new Vector2[GlassMath.FanVertexCount(Segments)];

        private static int s_TextureId;
        private static int s_FrameId;
        private static bool s_IdsReady;

        /// <summary>Set by high-contrast mode: every glass panel renders as opaque Console from the next frame.</summary>
        public static bool ForceOpaque { get; set; }

        private Color m_Tint = DefaultTint;
        private Color m_Highlight = DefaultHighlight;
        private bool m_IsOpaque = true;
        private Texture m_Source;
        private IVisualElementScheduledItem m_Ticker;

        /// <summary>True while the panel shows the opaque fallback instead of the blurred scene.</summary>
        public bool IsOpaque => m_IsOpaque;

        public MfGlassPanel()
        {
            AddToClassList(UssClassName);
            AddToClassList(OpaqueUssClassName);
            generateVisualContent += OnGenerateVisualContent;
            RegisterCallback<CustomStyleResolvedEvent>(OnCustomStyleResolved);
            RegisterCallback<AttachToPanelEvent>(OnAttachToPanel);
            RegisterCallback<DetachFromPanelEvent>(OnDetachFromPanel);
        }

        private void OnAttachToPanel(AttachToPanelEvent evt)
        {
            if (m_Ticker == null)
                m_Ticker = schedule.Execute(Tick).Every(0);
            else
                m_Ticker.Resume();
            Tick();
        }

        private void OnDetachFromPanel(DetachFromPanelEvent evt)
        {
            m_Ticker?.Pause();
            m_Source = null;
        }

        private void OnCustomStyleResolved(CustomStyleResolvedEvent evt)
        {
            ICustomStyle custom = evt.customStyle;
            m_Tint = custom.TryGetValue(s_TintProperty, out Color tint) ? tint : DefaultTint;
            m_Highlight = custom.TryGetValue(s_HighlightProperty, out Color highlight) ? highlight : DefaultHighlight;
            MarkDirtyRepaint();
        }

        /// <summary>Runs every frame while attached: re-evaluates the fallback and repaints glass so UVs track motion.</summary>
        private void Tick()
        {
            Texture source = ShouldForceOpaque() ? null : ResolveBlurredScene();
            m_Source = source;
            SetOpaque(source == null);

            if (!m_IsOpaque && IsOnScreen())
                MarkDirtyRepaint();
        }

        private bool ShouldForceOpaque()
        {
            return ForceOpaque || MfQualityTier.Is(OpaqueQualityTier) || HasHighContrastAncestor();
        }

        private bool HasHighContrastAncestor()
        {
            for (VisualElement e = this; e != null; e = e.parent)
            {
                if (e.ClassListContains(HighContrastClass) || e.ClassListContains(BuildBayHighContrastClass))
                    return true;
            }
            return false;
        }

        private static Texture ResolveBlurredScene()
        {
            if (!s_IdsReady)
            {
                s_TextureId = Shader.PropertyToID(GlobalTextureName);
                s_FrameId = Shader.PropertyToID(GlobalFrameName);
                s_IdsReady = true;
            }

            if (!(Shader.GetGlobalTexture(s_TextureId) is RenderTexture rt) || rt == null || !rt.IsCreated())
                return null;

            return GlassMath.IsFrameFresh(Shader.GetGlobalFloat(s_FrameId), Time.frameCount, MaxFrameLag) ? rt : null;
        }

        private void SetOpaque(bool opaque)
        {
            if (m_IsOpaque == opaque)
                return;
            m_IsOpaque = opaque;
            EnableInClassList(OpaqueUssClassName, opaque);
            MarkDirtyRepaint();
        }

        private bool IsOnScreen()
        {
            IResolvedStyle s = resolvedStyle;
            if (s.display == DisplayStyle.None || s.visibility != Visibility.Visible)
                return false;
            Rect bound = worldBound;
            return bound.width >= 1f && bound.height >= 1f;
        }

        private void OnGenerateVisualContent(MeshGenerationContext ctx)
        {
            if (m_IsOpaque || m_Source == null || panel == null)
                return;

            IResolvedStyle s = resolvedStyle;
            float left = s.borderLeftWidth;
            float top = s.borderTopWidth;
            float right = s.borderRightWidth;
            float bottom = s.borderBottomWidth;

            // Fill the padding box so the USS border stays visible around the glass.
            Rect fill = new Rect(left, top, layout.width - left - right, layout.height - top - bottom);
            if (fill.width < 1f || fill.height < 1f)
                return;

            Vector4 radii = new Vector4(
                Mathf.Max(0f, s.borderTopLeftRadius - Mathf.Max(left, top)),
                Mathf.Max(0f, s.borderTopRightRadius - Mathf.Max(right, top)),
                Mathf.Max(0f, s.borderBottomRightRadius - Mathf.Max(right, bottom)),
                Mathf.Max(0f, s.borderBottomLeftRadius - Mathf.Max(left, bottom)));
            radii = GlassMath.ClampRadii(radii, fill.size);

            int count = GlassMath.BuildRoundedRectFan(fill, radii, Segments, s_Fan);
            if (count == 0)
                return;

            Vector2 panelSize = panel.visualTree.layout.size;
            DrawFan(ctx, count, m_Source, Color.white, panelSize, true);
            DrawFan(ctx, count, null, m_Tint, panelSize, false);
            DrawHighlight(ctx, fill, radii, m_Highlight);
        }

        private void DrawFan(MeshGenerationContext ctx, int count, Texture texture, Color colour, Vector2 panelSize, bool sampleScene)
        {
            int perimeter = count - 1;
            MeshWriteData mesh = ctx.Allocate(count, perimeter * 3, texture);
            Color32 tint = colour;

            for (int i = 0; i < count; i++)
            {
                Vector2 p = s_Fan[i];
                Vector2 uv = sampleScene ? GlassMath.PanelToUv(this.LocalToWorld(p), panelSize) : Vector2.zero;
                mesh.SetNextVertex(new Vertex { position = new Vector3(p.x, p.y, Vertex.nearZ), tint = tint, uv = uv });
            }

            for (int i = 0; i < perimeter; i++)
            {
                mesh.SetNextIndex(0);
                mesh.SetNextIndex((ushort)(1 + i));
                mesh.SetNextIndex((ushort)(1 + (i + 1) % perimeter));
            }
        }

        private static void DrawHighlight(MeshGenerationContext ctx, Rect fill, Vector4 radii, Color colour)
        {
            float x0 = fill.xMin + radii.x;
            float x1 = fill.xMax - radii.y;
            if (x1 - x0 < 1f || colour.a <= 0f)
                return;

            float y0 = fill.yMin;
            float y1 = fill.yMin + HighlightThickness;
            Color32 tint = colour;
            MeshWriteData mesh = ctx.Allocate(4, 6, null);
            mesh.SetNextVertex(new Vertex { position = new Vector3(x0, y0, Vertex.nearZ), tint = tint });
            mesh.SetNextVertex(new Vertex { position = new Vector3(x1, y0, Vertex.nearZ), tint = tint });
            mesh.SetNextVertex(new Vertex { position = new Vector3(x1, y1, Vertex.nearZ), tint = tint });
            mesh.SetNextVertex(new Vertex { position = new Vector3(x0, y1, Vertex.nearZ), tint = tint });
            mesh.SetNextIndex(0);
            mesh.SetNextIndex(1);
            mesh.SetNextIndex(2);
            mesh.SetNextIndex(2);
            mesh.SetNextIndex(3);
            mesh.SetNextIndex(0);
        }
    }
}
