#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>One issue found by validation or a design review.</summary>
    public sealed class ValidationIssue
    {
        internal ValidationIssue(string ruleId, Severity severity, string textKey, string text, IReadOnlyDictionary<string, string> args)
        {
            RuleId = ruleId;
            Severity = severity;
            TextKey = textKey;
            Text = text;
            Args = args;
        }

        /// <summary>Rule ID (see <see cref="ValidationRules"/>).</summary>
        public string RuleId { get; }
        /// <summary>Severity.</summary>
        public Severity Severity { get; }
        /// <summary>Strings key of the explanation shown to players.</summary>
        public string TextKey { get; }
        /// <summary>English explanation (design 6.11 text), with placeholders filled.</summary>
        public string Text { get; }
        /// <summary>Placeholder values for the localised text (e.g. <c>N</c> = "4").</summary>
        public IReadOnlyDictionary<string, string> Args { get; }

        /// <inheritdoc />
        public override string ToString() => $"{Severity} {RuleId}: {Text}";
    }

    /// <summary>Rule IDs, default text keys and the exact design 6.11 explanation texts.</summary>
    public static class ValidationRules
    {
        /// <summary>Lift-off TWR ≤ 1.0 → Blocker.</summary>
        public const string LiftoffTwr = "liftoff_twr";
        /// <summary>Total Δv &lt; requirement → Blocker (Major when within 3%).</summary>
        public const string TotalDv = "total_dv";
        /// <summary>Crewed contract without launch escape → Blocker.</summary>
        public const string CrewedEscape = "crewed_escape";
        /// <summary>Returning payload without heat shield → Blocker.</summary>
        public const string ReturnHeatShield = "return_heat_shield";
        /// <summary>Heat shield rating &lt; contract entry speed → Major.</summary>
        public const string HeatShieldRating = "heat_shield_rating";
        /// <summary>Payload doesn't fit fairing → Blocker.</summary>
        public const string FairingFit = "fairing_fit";
        /// <summary>Power negative in eclipse → Major.</summary>
        public const string EclipsePower = "eclipse_power";
        /// <summary>Upper stage restarts &lt; required burns → Blocker.</summary>
        public const string UpperRestarts = "upper_restarts";
        /// <summary>Hydrolox upper + long coast without boil-off mitigation → Major.</summary>
        public const string BoilOff = "boil_off";
        /// <summary>Data generated &gt; downlink capacity → Minor.</summary>
        public const string DataBudget = "data_budget";
        /// <summary>
        /// A chosen part's data rule <c>requires_part</c> / <c>requires_any_part</c> is not met (e.g. RTLS booster
        /// landing needs grid fins, design 7.18) → Blocker. Not a 6.11 row: it enforces the part rules of 17.5.
        /// </summary>
        public const string PartRequirement = "part_requirement";
        /// <summary>Two chosen parts are incompatible (data rule <c>incompatible_with_part</c>) → Blocker. Enforces 17.5 part rules.</summary>
        public const string PartIncompatible = "part_incompatible";

        /// <summary>All rules in design order.</summary>
        public static readonly IReadOnlyList<string> All = new[]
        {
            LiftoffTwr, TotalDv, CrewedEscape, ReturnHeatShield, HeatShieldRating, FairingFit, EclipsePower,
            UpperRestarts, BoilOff, DataBudget, PartRequirement, PartIncompatible,
        };

        /// <summary>Default severity of each rule (design 6.11).</summary>
        public static Severity DefaultSeverity(string ruleId) => ruleId switch
        {
            HeatShieldRating => Severity.Major,
            EclipsePower => Severity.Major,
            BoilOff => Severity.Major,
            DataBudget => Severity.Minor,
            _ => Severity.Blocker,
        };

        /// <summary>Default strings key: <c>validation.&lt;rule id&gt;</c>.</summary>
        public static string DefaultTextKey(string ruleId) => "validation." + ruleId;

        /// <summary>The exact explanation text of design 6.11 (placeholder <c>{N}</c> for starts).</summary>
        public static string DefaultText(string ruleId) => ruleId switch
        {
            LiftoffTwr => "Thrust must exceed weight or the rocket won't leave the pad.",
            TotalDv => "Not enough Δv to reach the target orbit.",
            CrewedEscape => "Crewed vehicles need a way to escape a failing rocket.",
            ReturnHeatShield => "Reentry heating would destroy the vehicle.",
            HeatShieldRating => "Shield not rated for this entry speed.",
            FairingFit => "Payload diameter exceeds fairing.",
            EclipsePower => "Batteries will drain during Earth's shadow.",
            UpperRestarts => "This mission needs {N} engine starts.",
            BoilOff => "Liquid hydrogen boils off during long coasts.",
            DataBudget => "You'll collect more data than you can send home.",
            PartRequirement => "{part} needs {required}.",
            PartIncompatible => "{part} cannot be used with {other}.",
            _ => ruleId,
        };

        /// <summary>Categories a rule needs decided before it can be judged in a partial build (vote preview).</summary>
        public static IReadOnlyList<string> RequiredCategories(string ruleId) => ruleId switch
        {
            LiftoffTwr => new[] { Slots.FirstStageEngine, Slots.FirstStageTank },
            TotalDv => new[] { Slots.UpperStageEngine, Slots.UpperStageTank, Slots.FirstStageEngine, Slots.FirstStageTank },
            CrewedEscape => new[] { Slots.LaunchEscape },
            ReturnHeatShield => new[] { Slots.HeatShield },
            HeatShieldRating => new[] { Slots.HeatShield },
            FairingFit => new[] { Slots.Fairing },
            EclipsePower => Array.Empty<string>(),
            UpperRestarts => new[] { Slots.UpperStageEngine },
            BoilOff => new[] { Slots.UpperStageEngine },
            DataBudget => new[] { Slots.PayloadInstrument, Slots.Communications },
            _ => Array.Empty<string>(),
        };
    }

    /// <summary>How undecided categories are treated by <see cref="Validator"/>.</summary>
    public enum ValidationMode
    {
        /// <summary>Judge the build as it would fly now: anything undecided is missing (reviews, FRR).</summary>
        Complete,
        /// <summary>Skip rules whose inputs are not all decided yet (vote previews, "Will not fly").</summary>
        Partial,
    }

    /// <summary>Validation rules of design 6.11.</summary>
    public static class Validator
    {
        /// <summary>Validates a build. Issues are ordered by rule order of design 6.11.</summary>
        public static IReadOnlyList<ValidationIssue> Validate(BuildState build, GameCatalog catalog, ValidationMode mode = ValidationMode.Complete)
        {
            var v = new Vehicle(build, catalog);
            return Validate(v, Dashboard.Compute(v), catalog, mode);
        }

        /// <summary>Validates with an already computed dashboard.</summary>
        public static IReadOnlyList<ValidationIssue> Validate(Vehicle v, DashboardMetrics d, GameCatalog catalog, ValidationMode mode)
        {
            var issues = new List<ValidationIssue>();
            var c = v.Contract;
            bool Judgeable(string rule)
            {
                if (mode == ValidationMode.Complete) return true;
                foreach (var cat in ValidationRules.RequiredCategories(rule))
                    if (!v.Build.Has(cat) && c.VoteFor(cat) != null) return false;
                return true;
            }
            void Add(string rule, Severity? severity = null, Dictionary<string, string>? args = null)
            {
                var def = catalog.Rule(rule);
                var sev = severity ?? def?.Severity ?? ValidationRules.DefaultSeverity(rule);
                var key = string.IsNullOrEmpty(def?.TextKey) ? ValidationRules.DefaultTextKey(rule) : def!.TextKey;
                var text = string.IsNullOrEmpty(def?.Text) ? ValidationRules.DefaultText(rule) : def!.Text;
                var a = args ?? new Dictionary<string, string>();
                foreach (var kv in a) text = text.Replace("{" + kv.Key + "}", kv.Value);
                issues.Add(new ValidationIssue(rule, sev, key, text, a));
            }
            double Param(string rule, string name, double fallback)
            {
                var def = catalog.Rule(rule);
                return def != null && def.Params.TryGetValue(name, out var x) ? x : fallback;
            }

            // Lift-off TWR ≤ 1.0 → Blocker
            if (Judgeable(ValidationRules.LiftoffTwr))
            {
                var twr = d.LiftoffTwr ?? 0;
                if (twr <= BuildConstants.MinLiftoffTwr)
                    Add(ValidationRules.LiftoffTwr, args: new Dictionary<string, string> { ["twr"] = F(twr, "0.00") });
            }

            // Total Δv < requirement → Blocker, Major when the shortfall is within 3%
            if (Judgeable(ValidationRules.TotalDv) && d.TotalDvMps < d.DvRequiredMps)
            {
                var within = Param(ValidationRules.TotalDv, "major_margin_fraction", 0.03);
                var shortfall = (d.DvRequiredMps - d.TotalDvMps) / d.DvRequiredMps;
                Add(ValidationRules.TotalDv, shortfall <= within ? Severity.Major : Severity.Blocker,
                    new Dictionary<string, string> { ["margin"] = F(-shortfall * 100, "0.0") });
            }

            // Crewed contract without launch escape → Blocker
            if (c.Crewed && Judgeable(ValidationRules.CrewedEscape) && v.Part(Slots.LaunchEscape) == null)
                Add(ValidationRules.CrewedEscape);

            // Returning payload without heat shield → Blocker; rating below entry speed → Major
            if (c.Returning)
            {
                var shield = v.Part(Slots.HeatShield);
                if (Judgeable(ValidationRules.ReturnHeatShield) && shield == null)
                    Add(ValidationRules.ReturnHeatShield);
                if (shield != null && c.EntrySpeedMps.HasValue && d.MaxEntrySpeedRatingMps.HasValue &&
                    d.MaxEntrySpeedRatingMps.Value < c.EntrySpeedMps.Value)
                    Add(ValidationRules.HeatShieldRating, args: new Dictionary<string, string>
                    {
                        ["rating_km_s"] = F(d.MaxEntrySpeedRatingMps.Value / 1000, "0.0"),
                        ["entry_km_s"] = F(c.EntrySpeedMps.Value / 1000, "0.0"),
                    });
            }

            // Payload doesn't fit fairing → Blocker
            var fairing = v.Part(Slots.Fairing);
            if (fairing != null && fairing.Stats.DiameterM.HasValue)
            {
                var payloadD = PayloadDiameterM(v);
                if (payloadD.HasValue && payloadD.Value > fairing.Stats.DiameterM.Value)
                    Add(ValidationRules.FairingFit, args: new Dictionary<string, string>
                    {
                        ["payload_m"] = F(payloadD.Value, "0.0"),
                        ["fairing_m"] = F(fairing.Stats.DiameterM.Value, "0.0"),
                    });
            }
            else if (fairing == null && mode == ValidationMode.Complete && c.VoteFor(Slots.Fairing) != null)
            {
                Add(ValidationRules.FairingFit, args: new Dictionary<string, string> { ["payload_m"] = "?", ["fairing_m"] = "0" });
            }

            // Power negative in eclipse → Major (a balance that is zero up to rounding is not negative)
            if (d.PowerEclipseW.HasValue && d.PowerEclipseW.Value < -PowerBalanceToleranceW)
                Add(ValidationRules.EclipsePower, args: new Dictionary<string, string> { ["eclipse_W"] = F(d.PowerEclipseW.Value, "0") });

            // Upper stage restarts < required burns → Blocker
            if (Judgeable(ValidationRules.UpperRestarts))
            {
                var starts = v.UpperEngine == null ? 0 : 1 + (v.UpperEngine.Stats.Restarts ?? 0);
                if (starts < c.RequiredUpperStageStarts)
                    Add(ValidationRules.UpperRestarts, args: new Dictionary<string, string>
                    {
                        ["N"] = c.RequiredUpperStageStarts.ToString(CultureInfo.InvariantCulture),
                        ["starts"] = starts.ToString(CultureInfo.InvariantCulture),
                    });
            }

            // Hydrolox upper + long coast without boil-off mitigation → Major
            if (c.LongCoast && v.UpperEngine != null && v.UpperEngine.Propellant == Propellants.Hydrolox && !HasBoilOffMitigation(v))
                Add(ValidationRules.BoilOff);

            // Data generated > downlink capacity → Minor
            if (Judgeable(ValidationRules.DataBudget) && d.DataGeneratedGbPerDay.HasValue && d.DownlinkGbPerDay.HasValue &&
                d.DataGeneratedGbPerDay.Value > d.DownlinkGbPerDay.Value)
                Add(ValidationRules.DataBudget, args: new Dictionary<string, string>
                {
                    ["generated_GB_day"] = F(d.DataGeneratedGbPerDay.Value, "0.0"),
                    ["downlink_GB_day"] = F(d.DownlinkGbPerDay.Value, "0.0"),
                });

            // Part rules from data (17.5): requires_part, requires_any_part, incompatible_with_part. In Partial mode a
            // requirement is judged only once every slot that could hold a required part has been decided.
            foreach (var kv in v.ChosenSlots())
            {
                var part = kv.Value;
                foreach (var r in part.Rules)
                {
                    if (r.Kind == "requires_part" || r.Kind == "requires_any_part")
                    {
                        bool met = false, decidable = true;
                        foreach (var id in r.Parts)
                        {
                            if (IsChosen(v, id)) { met = true; break; }
                            var other = catalog.Parts.TryGetValue(id, out var o) ? o : null;
                            if (other == null) continue;
                            foreach (var slot in Slots.ForCategory(other.Category))
                                if (!v.Build.Has(slot) && c.VoteFor(slot) != null) decidable = false;
                        }
                        if (!met && (mode == ValidationMode.Complete || decidable))
                            Add(ValidationRules.PartRequirement, args: new Dictionary<string, string>
                            {
                                ["part"] = part.Name,
                                ["required"] = string.Join(" or ", NamesOf(catalog, r.Parts)),
                            });
                    }
                    else if (r.Kind == "incompatible_with_part")
                    {
                        foreach (var id in r.Parts)
                            if (IsChosen(v, id))
                                Add(ValidationRules.PartIncompatible, args: new Dictionary<string, string>
                                {
                                    ["part"] = part.Name,
                                    ["other"] = string.Join(", ", NamesOf(catalog, new[] { id })),
                                });
                    }
                }
            }

            return issues;
        }

        private static bool IsChosen(Vehicle v, string partId)
        {
            foreach (var kv in v.Build.Choices) if (kv.Value == partId) return true;
            return false;
        }

        private static IEnumerable<string> NamesOf(GameCatalog catalog, IReadOnlyList<string> ids)
        {
            foreach (var id in ids) yield return catalog.Parts.TryGetValue(id, out var p) ? p.Name : id;
        }

        /// <summary>Highest severity among issues, or null when there are none.</summary>
        public static Severity? Worst(IReadOnlyList<ValidationIssue> issues)
        {
            Severity? w = null;
            foreach (var i in issues) if (w == null || i.Severity > w) w = i.Severity;
            return w;
        }

        /// <summary>True when any issue is a Blocker.</summary>
        public static bool HasBlocker(IReadOnlyList<ValidationIssue> issues)
        {
            foreach (var i in issues) if (i.Severity == Severity.Blocker) return true;
            return false;
        }

        /// <summary>Payload diameter, m: the contract's fixed value or the largest payload-bay part diameter.</summary>
        public static double? PayloadDiameterM(Vehicle v)
        {
            if (v.Contract.PayloadDiameterM.HasValue) return v.Contract.PayloadDiameterM;
            double? max = null;
            foreach (var kv in v.ChosenSlots())
                if (Slots.IsPayload(kv.Key) && kv.Value.Stats.DiameterM.HasValue)
                    max = Math.Max(max ?? 0, kv.Value.Stats.DiameterM.Value);
            return max;
        }

        private static bool HasBoilOffMitigation(Vehicle v)
        {
            if (v.Build.HasFlag("boil_off_mitigation")) return true;
            foreach (var p in v.ChosenParts()) if (p.HasTag("boil_off_mitigation")) return true;
            return false;
        }

        /// <summary>
        /// Floating-point tolerance of the eclipse power balance, W. Numerical, not a game value: an exactly
        /// balanced budget (orbit-average generation = load) computes as about −1e-14 W.
        /// </summary>
        private const double PowerBalanceToleranceW = 1e-9;

        private static string F(double x, string format) => x.ToString(format, CultureInfo.InvariantCulture);
    }
}
