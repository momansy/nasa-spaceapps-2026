using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.UI;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>Binds the eleven <see cref="MetricRow"/>s to the dashboard panel. Rows are created once and updated in place.</summary>
    public sealed class DashboardView
    {
        private sealed class RowElements
        {
            public VisualElement Root;
            public MfIcon Icon;
            public Label Name, Value, Unit, Word, Detail, Delta;
            public VisualElement Fill, Band;
        }

        private static readonly string[] StatusClasses =
        {
            "bb-status--pending", "bb-status--info", "bb-status--meets", "bb-status--marginal", "bb-status--fails",
        };

        private readonly VisualElement _container;
        private readonly UiText _text;
        private readonly Dictionary<string, RowElements> _rows = new Dictionary<string, RowElements>();

        public DashboardView(VisualElement screen, UiText text)
        {
            _text = text;
            screen.Q<Label>("dashboard-title").text = text.Get("ui.buildbay.dashboard.title");
            screen.Q<Label>("dashboard-subtitle").text = text.Get("ui.buildbay.dashboard.subtitle");
            _container = screen.Q<VisualElement>("metrics");
            _container.Clear();
            foreach (string id in DashboardViewModel.MetricIds) _rows[id] = CreateRow(id);
        }

        /// <summary>Shows <paramref name="metrics"/> with the "if chosen" delta of the leading option, when there is one.</summary>
        public void Show(DashboardMetrics metrics, DashboardDelta leadingDelta)
        {
            foreach (MetricRow row in DashboardViewModel.Build(metrics, _text, leadingDelta)) Apply(row);
        }

        private RowElements CreateRow(string id)
        {
            var r = new RowElements { Root = new VisualElement { name = "metric-" + id } };
            r.Root.AddToClassList("bb-metric");
            var line1 = new VisualElement();
            line1.AddToClassList("bb-metric__line");
            var glyph = new VisualElement();
            glyph.AddToClassList("bb-glyph");
            r.Icon = new MfIcon();
            r.Icon.AddToClassList("bb-glyph__icon");
            glyph.Add(r.Icon);
            r.Name = new Label();
            r.Name.AddToClassList("bb-metric__name");
            r.Value = new Label();
            r.Value.AddToClassList("bb-metric__value");
            r.Unit = new Label();
            r.Unit.AddToClassList("bb-unit");
            line1.Add(glyph);
            line1.Add(r.Name);
            line1.Add(r.Value);
            line1.Add(r.Unit);

            var line2 = new VisualElement();
            line2.AddToClassList("bb-metric__line");
            r.Word = new Label();
            r.Word.AddToClassList("bb-metric__word");
            r.Detail = new Label();
            r.Detail.AddToClassList("bb-metric__detail");
            r.Delta = new Label();
            r.Delta.AddToClassList("bb-delta");
            line2.Add(r.Word);
            line2.Add(r.Detail);
            line2.Add(r.Delta);

            var bar = new VisualElement();
            bar.AddToClassList("bb-metric__bar");
            r.Fill = new VisualElement();
            r.Fill.AddToClassList("bb-metric__fill");
            bar.Add(r.Fill);
            r.Band = new VisualElement();
            r.Band.AddToClassList("bb-metric__band");
            bar.Add(r.Band);

            r.Root.Add(line1);
            r.Root.Add(line2);
            r.Root.Add(bar);
            _container.Add(r.Root);
            return r;
        }

        private void Apply(MetricRow row)
        {
            if (!_rows.TryGetValue(row.Id, out RowElements r)) return;
            r.Name.text = row.Name;
            r.Value.text = row.Value;
            r.Unit.text = row.Unit;
            r.Detail.text = row.Detail;
            r.Word.text = _text.Get(DashboardViewModel.StatusKey(row.Status));
            foreach (string c in StatusClasses) r.Root.RemoveFromClassList(c);
            r.Root.AddToClassList(StatusClasses[(int)row.Status]);
            r.Icon.kind = IconFor(row.Status);
            r.Icon.Tint = TintFor(row.Status);
            r.Fill.style.width = Length.Percent(row.Fill * 100f);
            bool band = row.BandLow >= 0f && row.BandHigh > row.BandLow;
            r.Band.EnableInClassList("bb-hidden", !band);
            if (band)
            {
                r.Band.style.left = Length.Percent(row.BandLow * 100f);
                r.Band.style.width = Length.Percent((row.BandHigh - row.BandLow) * 100f);
            }
            r.Delta.text = row.Delta ?? "";
            r.Delta.EnableInClassList("bb-hidden", row.Delta == null);
            r.Delta.EnableInClassList("bb-delta--good", row.DeltaSign > 0);
            r.Delta.EnableInClassList("bb-delta--bad", row.DeltaSign < 0);
            r.Delta.EnableInClassList("bb-delta--neutral", row.DeltaSign == 0);
        }

        public static string IconFor(MetricStatus s) => s switch
        {
            MetricStatus.Meets => "check",
            MetricStatus.Marginal => "warn",
            MetricStatus.Fails => "cross",
            MetricStatus.Info => "dot",
            _ => "ring",
        };

        public static UnityEngine.Color TintFor(MetricStatus s) => s switch
        {
            MetricStatus.Meets => MfPalette.Meets,
            MetricStatus.Marginal => MfPalette.Marginal,
            MetricStatus.Fails => MfPalette.Fails,
            MetricStatus.Info => MfPalette.Signal,
            _ => MfPalette.Muted,
        };
    }
}
