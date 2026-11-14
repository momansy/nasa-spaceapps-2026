using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.UI;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>Top strip: contract name + primary objective, and the phase tracker A › B/PDR › C/CDR › D/FRR (MfPhaseStepper).</summary>
    public sealed class TopBarView
    {
        private static readonly string[] PhaseKeys = { "ui.buildbay.phase.a", "ui.buildbay.phase.b", "ui.buildbay.phase.c", "ui.buildbay.phase.d" };

        private readonly MfPhaseStepper _phases;
        private readonly UiText _text;
        private bool _built;

        public TopBarView(VisualElement screen, UiText text)
        {
            _text = text;
            _phases = screen.Q<MfPhaseStepper>("phase-tracker");
            ContractId = screen.Q<Label>("contract-id");
            ContractName = screen.Q<Label>("contract-name");
            Objective = screen.Q<Label>("objective-primary");
        }

        private Label ContractId { get; }
        private Label ContractName { get; }
        private Label Objective { get; }

        public void Show(BuildBaySession session)
        {
            string id = session.Contract.Id;
            string nameKey = "contract." + id + ".name";
            ContractId.text = id;
            ContractName.text = _text.Has(nameKey) ? _text.Get(nameKey) : id;
            string objKey = "contract." + id + ".objective.primary";
            bool hasObjective = _text.Has(objKey);
            Objective.text = hasObjective ? _text.Get("ui.buildbay.objectives.primary") + ": " + _text.Get(objKey) : "";
            // Null (not Flex) when shown, so USS modes can still hide it (200 % text hides the paragraph).
            Objective.style.display = hasObjective ? new StyleEnum<DisplayStyle>(StyleKeyword.Null) : DisplayStyle.None;

            if (!_built)
            {
                var labels = new List<string>();
                foreach (string k in PhaseKeys) labels.Add(_text.Get(k));
                _phases.SetSteps(labels);
                _built = true;
            }
            _phases.SetCurrent((int)session.Phase);
        }
    }

    /// <summary>
    /// Bottom strip: Gantt of Core's timeline (MfGanttChart: critical path solid + Sunlight outline + chevrons, slack as a
    /// hollow dotted outline, labelled Fails-coloured deadline, "now" marker) and the budget as an MfMetricBar
    /// (spent fill, budget requirement marker, leading option's "if chosen" ghost). Values from Core's BudgetSchedule.
    /// </summary>
    public sealed class TimelineView
    {
        private readonly UiText _text;
        private readonly MfGanttChart _gantt;
        private readonly MfMetricBar _budgetBar;
        private readonly Label _budgetText;
        private readonly VisualElement _legend;
        private readonly MfEmptyState _empty;

        public TimelineView(VisualElement screen, UiText text)
        {
            _text = text;
            screen.Q<Label>("timeline-title").text = text.Get("ui.buildbay.timeline.title");
            screen.Q<Label>("budget-title").text = text.Get("ui.buildbay.budget.title");
            _gantt = screen.Q<MfGanttChart>("gantt");
            _budgetBar = screen.Q<MfMetricBar>("budget-bar");
            _budgetText = screen.Q<Label>("budget-text");
            _legend = screen.Q<VisualElement>("timeline-legend");
            _empty = screen.Q<MfEmptyState>("timeline-empty");
            if (_empty != null) _empty.text = text.Get("ui.buildbay.timeline.empty");
        }

        public void Show(BuildBaySession session, double previewCostDeltaM, bool rtl)
        {
            BudgetSchedule b = session.Metrics.Budget;
            GanttModel model = TimelineViewModel.Build(b, session.PartName, _text);
            string days = _text.Get("ui.buildbay.unit.days");
            string deadline = _text.Get("ui.buildbay.timeline.deadline") + " " + UiText.Number(b.DeadlineDays, 0) + " " + days;
            string slack = _text.Get("ui.buildbay.timeline.slack") + " " + MfText.Signed(b.SlackDays, 0) + " " + days;

            bool any = model.Bars.Count > 0;
            _gantt.style.display = any ? DisplayStyle.Flex : DisplayStyle.None;
            if (_empty != null) _empty.style.display = any ? DisplayStyle.None : DisplayStyle.Flex;
            var bars = new List<MfGanttBar>(model.Bars.Count);
            foreach (GanttBar g in model.Bars) bars.Add(new MfGanttBar(g.Lane, g.StartDay, g.EndDay, g.Critical, g.Label, g.Kind == StepKind.Test));
            _gantt.Set(model.LaneNames, bars, model.AxisDays, model.TotalDays, model.DeadlineDays, deadline,
                0, _text.Get("ui.buildbay.timeline.now"), TimelineViewModel.TickDays, rtl, days);

            _legend.Clear();
            _legend.Add(LegendItem(_text.Get("ui.buildbay.timeline.critical"), "mf-legend__swatch--critical"));
            _legend.Add(LegendItem(slack, b.SlackDays >= 0 ? "mf-legend__swatch--slack" : "mf-legend__swatch--late"));
            // The deadline is labelled once, on the chart's deadline line (it was also repeated here).

            // Budget: spent against the budget marker; the leading option's extra cost as the ghost delta.
            double scale = Math.Max(b.BudgetM, b.TotalCostM + Math.Max(0, previewCostDeltaM)) * 1.1;
            float F(double m) => scale <= 0 ? 0f : (float)Math.Max(0, Math.Min(1, m / scale));
            MfStatus status = b.RemainingM < 0 ? MfStatus.Fails
                : b.RemainingM < b.BudgetM * DashboardViewModel.BudgetMarginalFraction ? MfStatus.Marginal : MfStatus.Meets;
            bool preview = Math.Abs(previewCostDeltaM) > 0.05;
            _budgetBar.Set(F(b.TotalCostM), status, F(b.BudgetM), null, preview ? F(b.TotalCostM + previewCostDeltaM) : -1f, null, -1f, -1f, rtl);

            string text = _text.Get("ui.buildbay.budget.spent") + " " + DashboardViewModel.Money(b.TotalCostM) +
                          " \u00B7 " + _text.Get("ui.buildbay.budget.remaining") + " " + MfText.TrueMinus(DashboardViewModel.Money(b.RemainingM).Replace("$-", "-$"));
            if (preview)
                text += " \u00B7 <color=#55C5CD>" + _text.Get("ui.buildbay.budget.preview") + " " + (previewCostDeltaM > 0 ? "↑ +" : "↓ " + MfText.Minus) +
                        DashboardViewModel.Money(Math.Abs(previewCostDeltaM)) + "</color>";
            _budgetText.text = text;
        }

        private static VisualElement LegendItem(string label, string swatchClass)
        {
            var item = new VisualElement();
            item.AddToClassList("mf-legend__item");
            var swatch = new VisualElement();
            swatch.AddToClassList("mf-legend__swatch");
            swatch.AddToClassList(swatchClass);
            var text = new Label(label);
            text.AddToClassList("mf-legend__text");
            item.Add(swatch);
            item.Add(text);
            return item;
        }
    }
}
