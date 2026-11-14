using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Designed overflow cue for dense lists inside panels (VISUAL_TARGET 3.2: no hard clipping through text).
    /// When a <see cref="ScrollView"/>'s content is taller than its viewport, a gradient from transparent to the panel
    /// surface colour covers the bottom <see cref="FadeHeight"/> px, with a chevron-down icon, so the cut reads as
    /// "more below" instead of a slice through a row. Hidden when everything fits or the list is scrolled to the end.
    /// Usage: <c>MfScrollFade.Attach(scrollView)</c>; the colour comes from USS <c>--mf-fade-colour</c> on the fade
    /// element (class <c>mf-scrollfade</c>, default Console #112B40).
    /// </summary>
    public sealed class MfScrollFade : VisualElement
    {
        public const string UssClassName = "mf-scrollfade";
        public const string IconUssClassName = "mf-scrollfade__icon";

        /// <summary>Fade height in px at 1920 x 1080 (game_value).</summary>
        public const float FadeHeight = 64f;

        /// <summary>Share of the fade that is a gradient; the rest is solid surface colour.</summary>
        private const float GradientFraction = 0.55f;

        /// <summary>Overflow below this many px is treated as fitting (layout rounding).</summary>
        private const float FitTolerance = 1f;

        private static readonly CustomStyleProperty<Color> s_ColourProperty = new CustomStyleProperty<Color>("--mf-fade-colour");
        private static readonly Color DefaultColour = new Color(17f / 255f, 43f / 255f, 64f / 255f, 1f);

        private readonly ScrollView _scroll;
        private Color _colour = DefaultColour;

        private MfScrollFade(ScrollView scroll)
        {
            _scroll = scroll;
            pickingMode = PickingMode.Ignore;
            AddToClassList(UssClassName);
            style.position = Position.Absolute;
            style.left = 0;
            style.right = 0;
            style.bottom = 0;
            style.height = FadeHeight;
            style.display = DisplayStyle.None;

            var icon = new MfIcon { kind = "chevron-down", pickingMode = PickingMode.Ignore };
            icon.AddToClassList(IconUssClassName);
            Add(icon);

            generateVisualContent += OnGenerateVisualContent;
            RegisterCallback<CustomStyleResolvedEvent>(OnCustomStyleResolved);
            scroll.contentContainer.RegisterCallback<GeometryChangedEvent>(_ => Refresh());
            scroll.contentViewport.RegisterCallback<GeometryChangedEvent>(_ => Refresh());
            scroll.verticalScroller.valueChanged += _ => Refresh();
        }

        /// <summary>Adds the fade to <paramref name="scroll"/> (once) and returns it.</summary>
        public static MfScrollFade Attach(ScrollView scroll)
        {
            if (scroll == null) return null;
            MfScrollFade existing = FindExisting(scroll);
            if (existing != null) return existing;
            var fade = new MfScrollFade(scroll);
            scroll.hierarchy.Add(fade);
            return fade;
        }

        /// <summary>True when the content extends below the visible viewport (pure, for tests).</summary>
        public static bool HasOverflowBelow(float contentHeight, float viewportHeight, float scrollOffset)
        {
            return contentHeight - (viewportHeight + scrollOffset) > FitTolerance;
        }

        private static MfScrollFade FindExisting(ScrollView scroll)
        {
            foreach (VisualElement child in scroll.hierarchy.Children())
            {
                if (child is MfScrollFade fade) return fade;
            }
            return null;
        }

        private void Refresh()
        {
            bool overflow = HasOverflowBelow(_scroll.contentContainer.layout.height,
                _scroll.contentViewport.layout.height, _scroll.scrollOffset.y);
            style.display = overflow ? DisplayStyle.Flex : DisplayStyle.None;
            BringToFront();
        }

        private void OnCustomStyleResolved(CustomStyleResolvedEvent evt)
        {
            _colour = evt.customStyle.TryGetValue(s_ColourProperty, out Color c) ? c : DefaultColour;
            MarkDirtyRepaint();
        }

        private void OnGenerateVisualContent(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            if (r.width < 1f || r.height < 1f) return;
            // Transparent -> surface over the top part, then solid, so the last line is covered rather than sliced.
            float yMid = Mathf.Lerp(r.yMin, r.yMax, GradientFraction);
            Color32 clear = new Color(_colour.r, _colour.g, _colour.b, 0f);
            Color32 solid = _colour;
            MeshWriteData mesh = ctx.Allocate(6, 12);
            mesh.SetNextVertex(new Vertex { position = new Vector3(r.xMin, r.yMin, Vertex.nearZ), tint = clear });
            mesh.SetNextVertex(new Vertex { position = new Vector3(r.xMax, r.yMin, Vertex.nearZ), tint = clear });
            mesh.SetNextVertex(new Vertex { position = new Vector3(r.xMax, yMid, Vertex.nearZ), tint = solid });
            mesh.SetNextVertex(new Vertex { position = new Vector3(r.xMin, yMid, Vertex.nearZ), tint = solid });
            mesh.SetNextVertex(new Vertex { position = new Vector3(r.xMax, r.yMax, Vertex.nearZ), tint = solid });
            mesh.SetNextVertex(new Vertex { position = new Vector3(r.xMin, r.yMax, Vertex.nearZ), tint = solid });
            ushort[] indices = { 0, 1, 2, 2, 3, 0, 3, 2, 4, 4, 5, 3 };
            foreach (ushort i in indices) mesh.SetNextIndex(i);
        }
    }
}
