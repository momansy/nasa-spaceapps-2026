using MissionForge.UI;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// Contract widgets shared by the Mission Briefing and the Contract Vote (T027): fact rows with units, objective rows
    /// (icon shape + kind label, never colour alone), constraint rows, and the difficulty marker (filled pips + label).
    /// </summary>
    public static class ContractViews
    {
        public static VisualElement Facts(ContractBriefing b)
        {
            VisualElement facts = PfUi.El("pf-facts");
            foreach (BriefingFact f in b.Facts)
            {
                VisualElement row = PfUi.El("pf-fact");
                row.Add(PfUi.Lbl(f.Label, "pf-fact__label"));
                row.Add(PfUi.Lbl(f.Value, "pf-fact__value"));
                facts.Add(row);
            }
            return facts;
        }

        public static VisualElement Objective(BriefingObjective o, PreflightText t)
        {
            VisualElement row = PfUi.El("pf-objective", "pf-objective--" + o.Kind);
            var icon = new MfIcon { kind = IconOf(o.Kind) };
            icon.AddToClassList("pf-objective__icon");
            row.Add(icon);
            VisualElement text = PfUi.El("pf-objective__text");
            text.Add(PfUi.Lbl(t.Get("ui.host.briefing.objective." + o.Kind), "pf-objective__kind"));
            text.Add(PfUi.Lbl(o.Text, "pf-objective__body"));
            row.Add(text);
            return row;
        }

        public static VisualElement Constraint(string text)
        {
            VisualElement row = PfUi.El("pf-constraint");
            var icon = new MfIcon { kind = "marginal" };
            icon.AddToClassList("pf-constraint__icon");
            row.Add(icon);
            row.Add(PfUi.Lbl(text, "pf-constraint__text"));
            return row;
        }

        /// <summary>Difficulty 1..3 as three pips (filled = level) with its label, so it never relies on colour.</summary>
        public static VisualElement Difficulty(int level, PreflightText t)
        {
            VisualElement row = PfUi.El("pf-difficulty", "pf-difficulty--" + level);
            VisualElement pips = PfUi.El("pf-difficulty__pips");
            for (int i = 1; i <= 3; i++) pips.Add(PfUi.El("pf-difficulty__pip", i <= level ? "pf-difficulty__pip--on" : null));
            row.Add(pips);
            row.Add(PfUi.Lbl(t.Get("ui.host.briefing.difficulty." + level), "pf-difficulty__label"));
            return row;
        }

        public static string IconOf(string kind) =>
            kind == "primary" ? "target" : kind == "stretch" ? "star" : kind == "safety" ? "shield-check" : "circle-dot";
    }
}
