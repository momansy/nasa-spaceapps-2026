using System;
using MissionForge.Core.Build;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>Top strip: contract name + primary objective, and the phase tracker A › B/PDR › C/CDR › D/FRR.</summary>
    public sealed class TopBarView
    {
        private readonly VisualElement _phases;
        private readonly UiText _text;

        public TopBarView(VisualElement screen, UiText text)
        {
            _text = text;
            _phases = screen.Q<VisualElement>("phase-tracker");
            ContractName = screen.Q<Label>("contract-name");
            Objective = screen.Q<Label>("objective-primary");
        }

        private Label ContractName { get; }
        private Label Objective { get; }

        public void Show(BuildBaySession session)
        {
            string id = session.Contract.Id;
            string nameKey = "contract." + id + ".name";
            ContractName.text = (id + " · " + (_text.Has(nameKey) ? _text.Get(nameKey) : id)).ToUpperInvariant();
            string objKey = "contract." + id + ".objective.primary";
            Objective.text = _text.Get("ui.buildbay.objectives.primary") + ": " + (_text.Has(objKey) ? _text.Get(objKey) : "—");

            _phases.Clear();
            ProgramPhase current = session.Phase;
            string[] keys = { "ui.buildbay.phase.a", "ui.buildbay.phase.b", "ui.buildbay.phase.c", "ui.buildbay.phase.d" };
            for (int i = 0; i < keys.Length; i++)
            {
                if (i > 0)
                {
                    var link = new VisualElement();
                    link.AddToClassList("bb-phase__link");
                    _phases.Add(link);
                }
                var chip = new VisualElement();
                chip.AddToClassList("bb-phase");
                bool done = i < (int)current, now = i == (int)current;
                chip.EnableInClassList("bb-phase--done", done);
                chip.EnableInClassList("bb-phase--current", now);
                if (done)
                {
                    var icon = new MfIcon { kind = "check", Tint = MfPalette.Meets };
                    icon.style.width = 18; icon.style.height = 18; icon.style.marginRight = 4;
                    chip.Add(icon);
                }
                var label = new Label(_text.Get(keys[i]));
                label.AddToClassList("bb-phase__label");
                chip.Add(label);
                _phases.Add(chip);
            }
        }
    }

    /// <summary>Bottom strip: Gantt of Core's timeline with critical path and slack, deadline, and the budget bar.</summary>
    public sealed class TimelineView
    {
        private readonly UiText _text;
        private readonly GanttView _gantt;
        private readonly BudgetBarView _budgetBar;
        private readonly Label _budgetText;

        public TimelineView(VisualElement screen, UiText text)
        {
            _text = text;
            screen.Q<Label>("timeline-title").text = text.Get("ui.buildbay.timeline.title").ToUpperInvariant();
            screen.Q<Label>("budget-title").text = text.Get("ui.buildbay.budget.title").ToUpperInvariant();
            _gantt = screen.Q<GanttView>("gantt");
            _budgetBar = screen.Q<BudgetBarView>("budget-bar");
            _budgetText = screen.Q<Label>("budget-text");
            _legend = screen.Q<VisualElement>("timeline-legend");
        }

        private readonly VisualElement _legend;

        public void Show(BuildBaySession session, double previewCostDeltaM, bool rtl)
        {
            BudgetSchedule b = session.Metrics.Budget;
            GanttModel model = TimelineViewModel.Build(b, session.PartName, _text);
            string days = _text.Get("ui.buildbay.unit.days");
            string deadline = _text.Get("ui.buildbay.timeline.deadline") + " " + UiText.Number(b.DeadlineDays, 0) + " " + days;
            string slack = _text.Get("ui.buildbay.timeline.slack") + " " + UiText.Signed(b.SlackDays, 0) + " " + days;
            _gantt.SetModel(model, deadline, slack, _text.Get("ui.buildbay.timeline.critical"), rtl);
            _legend.Clear();
            _legend.Add(LegendItem(_text.Get("ui.buildbay.timeline.critical"), MfPalette.Signal, true));
            _legend.Add(LegendItem(slack, b.SlackDays >= 0 ? MfPalette.Meets : MfPalette.Fails, false));
            _legend.Add(LegendItem(deadline, MfPalette.Sunlight, false));

            _budgetBar.SetValues(b.BudgetM, b.TotalCostM, previewCostDeltaM);
            string text = _text.Get("ui.buildbay.budget.spent") + " " + DashboardViewModel.Money(b.TotalCostM) +
                          "  ·  " + _text.Get("ui.buildbay.budget.remaining") + " " + DashboardViewModel.Money(b.RemainingM);
            if (Math.Abs(previewCostDeltaM) > 0.05)
                text += "  ·  " + _text.Get("ui.buildbay.budget.preview") + " " + (previewCostDeltaM > 0 ? "↑ +" : "↓ ") + DashboardViewModel.Money(previewCostDeltaM);
            _budgetText.text = text;
        }

        private static VisualElement LegendItem(string label, Color colour, bool hatched)
        {
            var item = new VisualElement();
            item.AddToClassList("bb-legend__item");
            var swatch = new VisualElement();
            swatch.AddToClassList("bb-legend__swatch");
            swatch.style.backgroundColor = colour;
            if (hatched)
            {
                swatch.style.borderTopWidth = swatch.style.borderBottomWidth = swatch.style.borderLeftWidth = swatch.style.borderRightWidth = 2;
                swatch.style.borderTopColor = swatch.style.borderBottomColor = swatch.style.borderLeftColor = swatch.style.borderRightColor = MfPalette.Ceramic;
                var stripe = new VisualElement();
                stripe.style.position = Position.Absolute;
                stripe.style.left = 8; stripe.style.top = -4; stripe.style.width = 3; stripe.style.height = 22;
                stripe.style.backgroundColor = MfPalette.Space;
                stripe.style.rotate = new Rotate(40);
                swatch.style.overflow = Overflow.Hidden;
                swatch.Add(stripe);
            }
            var text = new Label(label);
            text.AddToClassList("bb-legend__text");
            item.Add(swatch);
            item.Add(text);
            return item;
        }
    }
}
