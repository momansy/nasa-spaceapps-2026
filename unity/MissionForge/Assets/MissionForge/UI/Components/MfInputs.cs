using System;
using System.Collections.Generic;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Segmented control: one Button per option, the selected one gets .mf-segmented__item--on (Ceramic plate, bold).
    /// Selection is visual only; the owner decides what a click means (for example sending settings.set and waiting
    /// for settings.state to confirm, as LobbyScreen does).
    /// </summary>
    [UxmlElement]
    public partial class MfSegmented : VisualElement
    {
        public const string ItemClass = "mf-segmented__item";
        public const string OnClass = "mf-segmented__item--on";

        private readonly Dictionary<string, Button> _items = new Dictionary<string, Button>();

        public MfSegmented()
        {
            AddToClassList("mf-segmented");
        }

        public event Action<string> Clicked;

        public void SetOptions(string namePrefix, params (string value, string label)[] options)
        {
            Clear();
            _items.Clear();
            foreach ((string value, string label) in options)
            {
                string captured = value;
                var b = new Button(() => Clicked?.Invoke(captured)) { text = label, name = namePrefix + "-" + value };
                b.AddToClassList(ItemClass);
                Add(b);
                _items[value] = b;
            }
        }

        public void Select(string value)
        {
            foreach (KeyValuePair<string, Button> pair in _items) pair.Value.EnableInClassList(OnClass, pair.Key == value);
        }

        public Button Item(string value) => _items.TryGetValue(value, out Button b) ? b : null;
    }

    /// <summary>Toggle: a focusable track with a knob and a label; Space/Enter or a click flips it.</summary>
    [UxmlElement]
    public partial class MfToggle : VisualElement
    {
        private readonly Label _label;
        private bool _on;

        public MfToggle()
        {
            AddToClassList("mf-toggle");
            focusable = true;
            var track = new VisualElement();
            track.AddToClassList("mf-toggle__track");
            var knob = new VisualElement();
            knob.AddToClassList("mf-toggle__knob");
            track.Add(knob);
            _label = new Label();
            _label.AddToClassList("mf-toggle__label");
            Add(track);
            Add(_label);
            RegisterCallback<ClickEvent>(_ => Flip());
            RegisterCallback<NavigationSubmitEvent>(_ => Flip());
        }

        public event Action<bool> Changed;

        [UxmlAttribute] public string text { get => _label.text; set => _label.text = value; }

        [UxmlAttribute]
        public bool value
        {
            get => _on;
            set { _on = value; EnableInClassList("mf-toggle--on", value); }
        }

        private void Flip()
        {
            if (!enabledInHierarchy) return;
            value = !_on;
            Changed?.Invoke(_on);
        }
    }

    /// <summary>Key/value row with unit: label (Muted, label size) left, value (tabular) right, unit at 70 % in Muted.</summary>
    [UxmlElement]
    public partial class MfKeyValue : VisualElement
    {
        private readonly Label _key;
        private readonly Label _value;
        private string _rawValue = "", _unit = "";

        public MfKeyValue()
        {
            AddToClassList("mf-kv");
            _key = new Label();
            _key.AddToClassList("mf-kv__key");
            _value = new Label { enableRichText = true };
            _value.AddToClassList("mf-kv__value");
            Add(_key);
            Add(_value);
        }

        [UxmlAttribute] public string key { get => _key.text; set => _key.text = value; }
        [UxmlAttribute] public string value { get => _rawValue; set { _rawValue = value ?? ""; Render(); } }
        [UxmlAttribute] public string unit { get => _unit; set { _unit = value ?? ""; Render(); } }

        public void Set(string keyText, string valueText, string unitText)
        {
            _key.text = keyText;
            _rawValue = valueText ?? "";
            _unit = unitText ?? "";
            Render();
        }

        private void Render() => _value.text = MfText.WithUnit(_rawValue, _unit);
    }

    /// <summary>
    /// Adds a leading Lucide icon to a Button. A Button draws its own text, so the icon is absolutely placed in the
    /// extra start padding (.mf-btn--icon) and the controller can keep setting button.text as before.
    /// A TextElement with child elements loses its text measurement in layout (it is sized from its children),
    /// so the button would collapse to its padding and clip its label. <see cref="FitToText"/> restores the
    /// width as a min-width from the measured label, on every layout pass and whenever the text changes.
    /// </summary>
    public static class MfButtons
    {
        private const string FittedClass = "mf-btn--fitted";

        public static Button WithIcon(Button button, string icon)
        {
            if (button == null) return null;
            MfIcon existing = button.Q<MfIcon>(className: "mf-btn__icon");
            if (existing == null)
            {
                existing = new MfIcon();
                existing.AddToClassList("mf-btn__icon");
                button.Add(existing);
            }
            button.AddToClassList("mf-btn--icon");
            existing.kind = icon;
            FitToText(button);
            return button;
        }

        /// <summary>Keeps <paramref name="button"/> at least as wide as its text plus padding and borders.</summary>
        public static void FitToText(Button button)
        {
            if (button == null || button.ClassListContains(FittedClass)) return;
            button.AddToClassList(FittedClass);
            button.RegisterCallback<GeometryChangedEvent>(_ => ApplyMinWidth(button));
            button.RegisterCallback<ChangeEvent<string>>(_ => ApplyMinWidth(button));
            button.RegisterCallback<CustomStyleResolvedEvent>(_ => ApplyMinWidth(button));
        }

        private static void ApplyMinWidth(Button button)
        {
            if (button.panel == null) return;
            IResolvedStyle rs = button.resolvedStyle;
            float textWidth = string.IsNullOrEmpty(button.text)
                ? 0f
                : button.MeasureTextSize(button.text, 0f, VisualElement.MeasureMode.Undefined, 0f, VisualElement.MeasureMode.Undefined).x;
            float needed = UnityEngine.Mathf.Ceil(textWidth + rs.paddingLeft + rs.paddingRight + rs.borderLeftWidth + rs.borderRightWidth);
            if (float.IsNaN(needed) || needed <= 0f) return;
            StyleLength current = button.style.minWidth;
            if (current.keyword == StyleKeyword.Undefined && UnityEngine.Mathf.Abs(current.value.value - needed) < 0.5f) return;
            button.style.minWidth = needed;
        }
    }
}
