using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>Readiness status in the style-guide language (colour + shape + label + border; never hue alone).</summary>
    public enum MfStatus
    {
        Pending,
        Info,
        Meets,
        Marginal,
        Fails,
    }

    /// <summary>
    /// Status badge: MfIcon shape (meets = check in circle, marginal = exclamation in triangle, fails = cross in
    /// octagon), a label and the border treatment from Controls.uss. The label text comes from the caller (strings).
    /// </summary>
    [UxmlElement]
    public partial class MfStatusBadge : VisualElement
    {
        private static readonly string[] Modifiers = { "mf-status--pending", "mf-status--info", "mf-status--meets", "mf-status--marginal", "mf-status--fails" };

        private readonly MfIcon _icon;
        private readonly Label _label;
        private MfStatus _status = MfStatus.Pending;

        public MfStatusBadge()
        {
            AddToClassList("mf-status");
            _icon = new MfIcon();
            _icon.AddToClassList("mf-status__icon");
            _label = new Label();
            _label.AddToClassList("mf-status__label");
            Add(_icon);
            Add(_label);
            Apply();
        }

        [UxmlAttribute]
        public string text
        {
            get => _label.text;
            set => _label.text = value;
        }

        [UxmlAttribute]
        public MfStatus status
        {
            get => _status;
            set { _status = value; Apply(); }
        }

        public void Set(MfStatus s, string label)
        {
            _status = s;
            _label.text = label;
            Apply();
        }

        private void Apply()
        {
            foreach (string m in Modifiers) RemoveFromClassList(m);
            AddToClassList(Modifiers[(int)_status]);
            _icon.kind = IconFor(_status);
            _icon.Tint = MfDraw.StatusColour(_status);
        }

        /// <summary>The icon shape for a status (the three status shapes plus neutral ones).</summary>
        public static string IconFor(MfStatus s) => s switch
        {
            MfStatus.Meets => "meets",
            MfStatus.Marginal => "marginal",
            MfStatus.Fails => "fails",
            MfStatus.Info => "info",
            _ => "hourglass",
        };
    }
}
