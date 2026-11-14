using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.UI;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Binds the eleven <see cref="MetricRow"/>s to the dashboard panel with design-system metric rows (T031): status icon
    /// shape, name, status word, tabular value with its unit at 70 %, and an <see cref="MfMetricBar"/> with the
    /// requirement marker and the "if chosen" ghost. A pending metric shows a designed waiting state instead of a dash.
    /// Rows are created once and updated in place.
    /// </summary>
    public sealed class DashboardView
    {
        private sealed class RowElements
        {
            public VisualElement Root;
            public MfIcon Icon;
            public Label Name, Word, Value, Pending, Detail, Ghost;
            public MfMetricBar Bar;
        }

        private static readonly string[] StatusClasses =
        {
            "mf-metric--pending", "mf-metric--info", "mf-metric--meets", "mf-metric--marginal", "mf-metric--fails",
        };

        private readonly VisualElement _container;
        private readonly UiText _text;
        private readonly Dictionary<string, RowElements> _rows = new Dictionary<string, RowElements>();
        private bool _rtl;

        public DashboardView(VisualElement screen, UiText text)
        {
            _text = text;
            screen.Q<Label>("dashboard-title").text = text.Get("ui.buildbay.dashboard.title");
            screen.Q<Label>("dashboard-subtitle").text = text.Get("ui.buildbay.dashboard.subtitle");
            _container = screen.Q<VisualElement>("metrics");
            _container.Clear();
            if (_container is ScrollView scroll) MfScrollFade.Attach(scroll);
            foreach (string id in DashboardViewModel.MetricIds) _rows[id] = CreateRow(id);
        }

        /// <summary>Shows <paramref name="metrics"/> with the "if chosen" delta of the leading option, when there is one.</summary>
        public void Show(DashboardMetrics metrics, DashboardDelta leadingDelta, bool rtl = false)
        {
            _rtl = rtl;
            foreach (MetricRow row in DashboardViewModel.Build(metrics, _text, leadingDelta)) Apply(row);
        }

        private RowElements CreateRow(string id)
        {
            var r = new RowElements { Root = new VisualElement { name = "metric-" + id } };
            r.Root.AddToClassList("mf-metric");
            var line = new VisualElement();
            line.AddToClassList("mf-metric__line");
            r.Icon = new MfIcon();
            r.Icon.AddToClassList("mf-metric__icon");
            r.Name = new Label();
            r.Name.AddToClassList("mf-metric__name");
            r.Word = new Label();
            r.Word.AddToClassList("mf-metric__word");
            r.Value = new Label { enableRichText = true };
            r.Value.AddToClassList("mf-metric__value");
            r.Pending = new Label();
            r.Pending.AddToClassList("mf-metric__pending");
            line.Add(r.Icon);
            line.Add(r.Name);
            line.Add(r.Value);
            line.Add(r.Pending);
            r.Bar = new MfMetricBar();
            r.Bar.AddToClassList("mf-metric__bar");
            r.Bar.AddToClassList(MfMetricBar.CompactClass);
            var detailLine = new VisualElement();
            detailLine.AddToClassList("mf-metric__detail-line");
            r.Detail = new Label();
            r.Detail.AddToClassList("mf-metric__detail");
            r.Ghost = new Label();
            r.Ghost.AddToClassList("mf-metric__ghost");
            detailLine.Add(r.Word);
            detailLine.Add(r.Detail);
            detailLine.Add(r.Ghost);
            r.Root.Add(line);
            r.Root.Add(r.Bar);
            r.Root.Add(detailLine);
            _container.Add(r.Root);
            return r;
        }

        private void Apply(MetricRow row)
        {
            if (!_rows.TryGetValue(row.Id, out RowElements r)) return;
            MfStatus status = ToStatus(row.Status);
            bool pending = row.Status == MetricStatus.Pending || row.Value == "—";
            r.Name.text = row.Name;
            r.Word.text = row.Status == MetricStatus.Info ? "" : _text.Get(DashboardViewModel.StatusKey(row.Status));
            r.Word.style.display = row.Status == MetricStatus.Info || pending ? DisplayStyle.None : DisplayStyle.Flex;
            r.Value.text = pending ? "" : MfText.WithUnit(row.Value, row.Unit);
            r.Value.style.display = pending ? DisplayStyle.None : DisplayStyle.Flex;
            // A designed empty state (VISUAL_TARGET 3.1): the localised reason, never a dash.
            r.Pending.text = pending ? row.Detail : "";
            r.Pending.style.display = pending ? DisplayStyle.Flex : DisplayStyle.None;
            foreach (string c in StatusClasses) r.Root.RemoveFromClassList(c);
            r.Root.AddToClassList(StatusClasses[(int)row.Status]);
            // Empty state: the reason on its own line under the name, and no grey stand-in bar (VISUAL_TARGET 3.1).
            r.Root.EnableInClassList("mf-metric--empty", pending);
            r.Icon.kind = pending ? "hourglass" : MfStatusBadge.IconFor(status);
            r.Icon.Tint = MfDraw.StatusColour(status);
            r.Detail.text = pending ? "" : row.Detail;
            r.Ghost.text = row.Delta != null ? MfText.TrueMinus(row.Delta) : "";
            r.Ghost.style.display = row.Delta != null ? DisplayStyle.Flex : DisplayStyle.None;
            r.Bar.Set(row.Fill, pending ? MfStatus.Pending : status, row.Requirement, null, row.Ghost, null, row.BandLow, row.BandHigh, _rtl);
            r.Bar.style.display = pending ? DisplayStyle.None : DisplayStyle.Flex; // no grey stand-in bar in the empty state
        }

        public static MfStatus ToStatus(MetricStatus s) => s switch
        {
            MetricStatus.Meets => MfStatus.Meets,
            MetricStatus.Marginal => MfStatus.Marginal,
            MetricStatus.Fails => MfStatus.Fails,
            MetricStatus.Info => MfStatus.Info,
            _ => MfStatus.Pending,
        };

        public static string IconFor(MetricStatus s) => MfStatusBadge.IconFor(ToStatus(s));

        public static UnityEngine.Color TintFor(MetricStatus s) => MfDraw.StatusColour(ToStatus(s));
    }
}
