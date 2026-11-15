using System;
using System.Collections.Generic;
using MissionForge.Core.Data;
using MissionForge.Screens.Preflight;

namespace MissionForge.Screens.Briefing
{
    /// <summary>One labelled fact of the contract card, value already with its unit.</summary>
    public sealed class BriefingFact
    {
        public string Label;
        public string Value;
    }

    /// <summary>One objective line: kind is primary, secondary, stretch or safety (shape and label, never colour alone).</summary>
    public sealed class BriefingObjective
    {
        public string Kind;
        public string Text;
    }

    /// <summary>
    /// Everything the Mission Briefing and the Contract Vote cards show about one contract, built only from Core's
    /// <see cref="ContractDef"/> and the strings (<c>contract.&lt;id&gt;.*</c>, <c>ui.host.briefing.*</c>). Numbers are
    /// formatted with their units; nothing is recomputed.
    /// </summary>
    public sealed class ContractBriefing
    {
        public const int MaxSecondary = 6;
        public const int MaxSpecialRules = 6;
        public const int MaxCapcomLines = 8;

        public string ContractId;
        public string Name;
        public string Destination;
        public string Payload;
        public string InspiredBy;
        public bool Crewed;
        /// <summary>Difficulty tier 1..3 from Core's numbers (Δv, crewed, returning); shown as a marker with a label.</summary>
        public int Difficulty;
        public readonly List<BriefingFact> Facts = new List<BriefingFact>();
        public readonly List<string> SpecialRules = new List<string>();
        public readonly List<BriefingObjective> Objectives = new List<BriefingObjective>();
        public readonly List<string> Constraints = new List<string>();

        public static ContractBriefing From(ContractDef c, PreflightText t)
        {
            var b = new ContractBriefing
            {
                ContractId = c.Id,
                Name = Key(t, "contract." + c.Id + ".name", c.Name),
                Destination = Key(t, "contract." + c.Id + ".destination", c.Destination),
                Payload = Key(t, "contract." + c.Id + ".payload", ""),
                InspiredBy = Key(t, "contract." + c.Id + ".inspired_by", ""),
                Crewed = c.Crewed,
                Difficulty = DifficultyOf(c),
            };
            b.Facts.Add(new BriefingFact { Label = t.Get("ui.host.briefing.fact.dv"), Value = t.KmPerS(c.DvRequiredMps) });
            b.Facts.Add(new BriefingFact { Label = t.Get("ui.host.briefing.fact.budget"), Value = t.Money(c.BudgetM) + " · " + t.Get("ui.host.briefing.game_scaled") });
            b.Facts.Add(new BriefingFact { Label = t.Get("ui.host.briefing.fact.schedule"), Value = t.Days(c.ScheduleDays) });
            for (int i = 1; i <= MaxSpecialRules; i++)
            {
                string key = "contract." + c.Id + ".special_rule." + i;
                if (t.Has(key)) b.SpecialRules.Add(t.Get(key));
            }
            b.AddObjective(t, "primary", "contract." + c.Id + ".objective.primary");
            for (int i = 1; i <= MaxSecondary; i++) b.AddObjective(t, "secondary", "contract." + c.Id + ".objective.secondary." + i);
            b.AddObjective(t, "stretch", "contract." + c.Id + ".objective.stretch");
            b.AddObjective(t, "safety", "contract." + c.Id + ".objective.safety");
            b.AddConstraints(c, t);
            return b;
        }

        /// <summary>1 easy … 3 hard, from Core's contract numbers (display only): crewed or entry or Δv above 11 km/s is 3; Δv above 9.5 km/s or a return is 2.</summary>
        public static int DifficultyOf(ContractDef c)
        {
            if (c.Crewed || c.EntrySpeedMps.HasValue && c.EntrySpeedMps.Value > 10000 || c.DvRequiredMps > 11000) return 3;
            if (c.Returning || c.DvRequiredMps > 9500 || c.RequiredUpperStageStarts > 1) return 2;
            return 1;
        }

        private void AddObjective(PreflightText t, string kind, string key)
        {
            if (t.Has(key)) Objectives.Add(new BriefingObjective { Kind = kind, Text = t.Get(key) });
        }

        private void AddConstraints(ContractDef c, PreflightText t)
        {
            if (c.InclinationDeg.HasValue) Constraints.Add(t.Format("ui.host.briefing.constraint.inclination", Num(c.InclinationDeg.Value, 1)));
            if (c.PayloadDiameterM.HasValue) Constraints.Add(t.Format("ui.host.briefing.constraint.diameter", Num(c.PayloadDiameterM.Value, 1)));
            if (c.Crewed) Constraints.Add(t.Get("ui.host.briefing.constraint.crewed"));
            if (c.HeatShieldRequired)
                Constraints.Add(c.EntrySpeedMps.HasValue
                    ? t.Format("ui.host.briefing.constraint.heat_shield_speed", Num(c.EntrySpeedMps.Value / 1000.0, 1))
                    : t.Get("ui.host.briefing.constraint.heat_shield"));
            if (c.RequiredUpperStageStarts > 1) Constraints.Add(t.Format("ui.host.briefing.constraint.restarts", c.RequiredUpperStageStarts));
            if (c.LongCoast) Constraints.Add(t.Get("ui.host.briefing.constraint.long_coast"));
            if (c.BoosterLandingRequired) Constraints.Add(t.Get("ui.host.briefing.constraint.booster_landing"));
            Constraints.Add(t.Format("ui.host.briefing.constraint.window", Num(c.LaunchWindowIntervalDays, 0)));
        }

        /// <summary>
        /// CAPCOM lines, one sentence each: the contract's own (<c>ui.host.capcom.briefing.&lt;id&gt;.&lt;n&gt;</c>) when written,
        /// otherwise the template filled from the contract's data. Arguments: {0} name, {1} destination, {2} Δv, {3} budget, {4} days, {5} payload.
        /// </summary>
        public IReadOnlyList<string> CapcomLines(PreflightText t)
        {
            var lines = new List<string>();
            for (int i = 1; i <= MaxCapcomLines; i++)
            {
                string key = "ui.host.capcom.briefing." + ContractId + "." + i;
                if (!t.Has(key)) break;
                lines.Add(Fill(t, key));
            }
            if (lines.Count > 0) return lines;
            for (int i = 1; i <= MaxCapcomLines; i++)
            {
                string key = "ui.host.capcom.template." + i;
                if (!t.Has(key)) break;
                lines.Add(Fill(t, key));
            }
            return lines;
        }

        /// <summary>One or two CAPCOM lines that introduce this contract among several offered ones.</summary>
        public IReadOnlyList<string> IntroLines(PreflightText t, int number)
        {
            var lines = new List<string>();
            for (int i = 1; i <= 2; i++)
            {
                string key = "ui.host.capcom.offer." + i;
                if (t.Has(key)) lines.Add(Fill(t, key).Replace("{n}", number.ToString()));
            }
            return lines;
        }

        private string Fill(PreflightText t, string key)
        {
            string raw = t.Get(key);
            string dv = FactValue(0), budget = FactValue(1), days = FactValue(2);
            try
            {
                return string.Format(System.Globalization.CultureInfo.InvariantCulture, raw, Name, Destination, dv, budget, days, Payload);
            }
            catch (FormatException)
            {
                return raw;
            }
        }

        private string FactValue(int i) => i < Facts.Count ? Facts[i].Value : "";

        private static string Key(PreflightText t, string key, string fallback) => t.Has(key) ? t.Get(key) : fallback;

        private static string Num(double v, int decimals) => MissionForge.Screens.BuildBay.UiText.Number(v, decimals);
    }
}
