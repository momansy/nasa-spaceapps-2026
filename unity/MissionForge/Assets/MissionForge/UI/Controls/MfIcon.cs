using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Outline icon from the vendored Lucide set (ISC), stroked with Painter2D so it stays crisp at
    /// any size and takes any tint. Status is never carried by colour alone: use the status kinds
    /// "meets" (check in a circle), "marginal" (exclamation in a triangle), "fails" (cross in an
    /// octagon).
    ///
    /// kind: any Lucide name in <see cref="LucideIcons"/>, an upstream alias, or a legacy kind
    /// (check, warn, cross, ring, signal, dot). "dot" is a filled disc, not a Lucide icon.
    ///
    /// Colour: <see cref="Tint"/> when set from C#, otherwise the resolved USS <c>color</c>
    /// (e.g. <c>.mf-icon--signal</c>). Size: the <c>size</c> attribute (24 / 32 / 48) is written
    /// inline and always wins. Otherwise, once MfIcons.uss is loaded (its <c>.mf-icon</c> rule
    /// declares <c>--mf-icon-uss-sized</c>), USS width/height decide (default 26 px, classes
    /// <c>.mf-icon--24/32/48</c>). Without that sheet the icon falls back to an inline 26 x 26 px.
    /// </summary>
    [UxmlElement]
    public partial class MfIcon : VisualElement
    {
        public static readonly string ussClassName = "mf-icon";

        public const string DotKind = "dot";
        public const int DefaultSize = 26;

        /// <summary>Declared by <c>.mf-icon</c> in MfIcons.uss: USS owns width/height.</summary>
        private static readonly CustomStyleProperty<float> UssSizedProperty = new CustomStyleProperty<float>("--mf-icon-uss-sized");
        private static readonly HashSet<string> WarnedKinds = new HashSet<string>();

        private string _kind = DotKind;
        private SvgPath _path;
        private Color _tint = MfPalette.Text;
        private bool _hasTint;
        private int _size;
        private bool _ussSized;
        private float _appliedSize = -1f;

        [UxmlAttribute]
        public string kind
        {
            get => _kind;
            set
            {
                if (_kind == value) return;
                _kind = value;
                ResolveKind();
                MarkDirtyRepaint();
            }
        }

        /// <summary>Icon edge in px: 24, 32 or 48. 0 leaves size to USS (or the 26 px fallback).</summary>
        [UxmlAttribute]
        public int size
        {
            get => _size;
            set
            {
                int clean = value <= 0 ? 0 : value <= 24 ? 24 : value <= 32 ? 32 : 48;
                if (clean != value && value > 0)
                {
                    Debug.LogWarning($"[MfIcon] size {value} is not 24, 32 or 48; using {clean}.");
                }
                if (_size == clean) return;
                _size = clean;
                ApplySize();
            }
        }

        /// <summary>Explicit colour. Setting it overrides USS <c>color</c>; see <see cref="ClearTint"/>.</summary>
        public Color Tint
        {
            get => _hasTint ? _tint : resolvedStyle.color;
            set
            {
                _tint = value;
                _hasTint = true;
                MarkDirtyRepaint();
            }
        }

        /// <summary>True when <see cref="Tint"/> was set from C#.</summary>
        public bool HasTint => _hasTint;

        /// <summary>Drops the explicit tint so the icon follows USS <c>color</c> again.</summary>
        public void ClearTint()
        {
            _hasTint = false;
            MarkDirtyRepaint();
        }

        public MfIcon()
        {
            AddToClassList(ussClassName);
            style.flexShrink = 0;
            pickingMode = PickingMode.Ignore;
            ApplySize();
            ResolveKind();
            generateVisualContent += Draw;
            RegisterCallback<CustomStyleResolvedEvent>(OnCustomStyleResolved);
            RegisterCallback<AttachToPanelEvent>(_ => MarkDirtyRepaint());
        }

        public MfIcon(string kind) : this()
        {
            this.kind = kind;
        }

        private void ResolveKind()
        {
            _path = null;
            if (string.IsNullOrEmpty(_kind) || _kind == DotKind) return;
            if (LucideIcons.TryGetPath(_kind, out SvgPath path))
            {
                _path = path;
                return;
            }
            if (WarnedKinds.Add(_kind))
            {
                Debug.LogWarning($"[MfIcon] Unknown icon kind '{_kind}'; drawing nothing. See UI/Icons/README.md for names.");
            }
        }

        private void OnCustomStyleResolved(CustomStyleResolvedEvent evt)
        {
            bool ussSized = evt.customStyle.TryGetValue(UssSizedProperty, out float flag) && flag > 0f;
            if (ussSized != _ussSized)
            {
                _ussSized = ussSized;
                ApplySize();
            }
            // Colour classes can change without a geometry change; repaint to pick up `color`.
            MarkDirtyRepaint();
        }

        private void ApplySize()
        {
            // 0 means "no inline size": USS width/height apply.
            float edge = _size > 0 ? _size : _ussSized ? 0f : DefaultSize;
            if (Mathf.Approximately(edge, _appliedSize)) return;
            _appliedSize = edge;
            if (edge > 0f)
            {
                style.width = edge;
                style.height = edge;
            }
            else
            {
                style.width = StyleKeyword.Null;
                style.height = StyleKeyword.Null;
            }
            MarkDirtyRepaint();
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            float s = Mathf.Min(r.width, r.height);
            if (s <= 1f) return;

            Color color = _hasTint ? _tint : resolvedStyle.color;
            if (color.a <= 0f) return;

            Painter2D p = ctx.painter2D;
            p.strokeColor = color;
            p.fillColor = color;
            p.lineCap = LineCap.Round;
            p.lineJoin = LineJoin.Round;

            if (_kind == DotKind)
            {
                p.BeginPath();
                p.Arc(r.center, s * 0.24f, 0f, 360f);
                p.Fill();
                return;
            }
            if (_path == null) return;

            float scale = s / LucideIcons.ViewBoxSize;
            Vector2 offset = r.center - new Vector2(LucideIcons.ViewBoxSize, LucideIcons.ViewBoxSize) * (0.5f * scale);
            p.lineWidth = LucideIcons.StrokeWidth * scale;
            _path.Stroke(p, offset, scale);
        }
    }
}
