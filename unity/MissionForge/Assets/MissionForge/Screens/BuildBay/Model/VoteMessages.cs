using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Host › server payloads of the Build Bay (protocol/messages.md §7 and the schemas in protocol/schema/):
    /// <c>vote.open</c> for a PART round with Core's options and "if chosen" deltas, <c>vote.commit</c>, and the
    /// sticky <c>build.state</c>. Every number is read from Core; this class only shapes JSON.
    /// </summary>
    public static class VoteMessages
    {
        /// <summary>
        /// Roles whose area a vote slot is (design 3.3 role descriptions; display/tagging only). Most relevant first,
        /// at most three as the schema allows.
        /// </summary>
        public static readonly IReadOnlyDictionary<string, string[]> OwnerRoles = new Dictionary<string, string[]>
        {
            { Slots.LaunchSite, new[] { "FIDO" } },
            { Slots.PayloadInstrument, new[] { "PAYLOAD" } },
            { Slots.PayloadPower, new[] { "EECOM", "PAYLOAD" } },
            { Slots.PayloadAttitude, new[] { "GUIDO", "PAYLOAD" } },
            { Slots.Capsule, new[] { "EECOM", "RETRO" } },
            { Slots.LifeSupport, new[] { "EECOM" } },
            { Slots.Lander, new[] { "RETRO", "FIDO" } },
            { Slots.HeatShield, new[] { "RETRO" } },
            { Slots.CapsuleRecovery, new[] { "RETRO" } },
            { Slots.LaunchEscape, new[] { "FLIGHT", "STRUCT" } },
            { Slots.Fairing, new[] { "STRUCT", "PAYLOAD" } },
            { Slots.UpperStageEngine, new[] { "BOOSTER", "FIDO" } },
            { Slots.UpperStageEngineCount, new[] { "BOOSTER" } },
            { Slots.UpperStageTank, new[] { "STRUCT", "FIDO" } },
            { Slots.StageSeparation, new[] { "STRUCT" } },
            { Slots.FirstStageEngine, new[] { "BOOSTER" } },
            { Slots.FirstStageEngineCount, new[] { "BOOSTER" } },
            { Slots.FirstStageTank, new[] { "STRUCT", "BOOSTER" } },
            { Slots.StructuralMaterial, new[] { "STRUCT" } },
            { Slots.StrapOnBoosters, new[] { "BOOSTER", "STRUCT" } },
            { Slots.BoosterRecovery, new[] { "RETRO", "BOOSTER" } },
            { Slots.Avionics, new[] { "GUIDO" } },
            { Slots.Navigation, new[] { "GUIDO" } },
            { Slots.AeroControl, new[] { "GUIDO", "STRUCT" } },
            { Slots.Rcs, new[] { "GUIDO" } },
            { Slots.PowerSystem, new[] { "EECOM" } },
            { Slots.Communications, new[] { "INCO" } },
            { Slots.MissionAssurance, new[] { "PM" } },
        };

        public static string Afford(VoteOption o) =>
            o.OverBudgetM <= 0 ? "OK" : o.CanUseEmergencyFunding ? "EMERGENCY_FUNDING" : "NEVER";

        /// <summary>The "if chosen" deltas of one option in protocol form (Δv m/s, TWR, cost $M, schedule days, mass t, success %).</summary>
        public static JArray Deltas(OptionPreview p)
        {
            DashboardMetrics m = p.Metrics;
            DashboardDelta d = p.Delta;
            var list = new JArray
            {
                Delta("TOTAL_DV_MS", m.TotalDvMps, d.TotalDvMps, d.TotalDvMps, true),
                Delta("COST_M", m.CostM, d.CostM, d.CostM, false),
                Delta("SCHEDULE_DAYS", m.ScheduleDays, d.ScheduleDays, d.ScheduleDays, false),
                Delta("TOTAL_MASS_T", m.TotalMassKg / 1000.0, d.TotalMassKg / 1000.0, 0, true),
                Delta("SUCCESS_PCT", m.Success.Success * 100, d.Success * 100, d.Success, true),
            };
            if (m.LiftoffTwr.HasValue && d.LiftoffTwr.HasValue) list.Add(Delta("LIFTOFF_TWR", m.LiftoffTwr.Value, d.LiftoffTwr.Value, d.LiftoffTwr.Value, true));
            return list;
        }

        private static JObject Delta(string metric, double value, double delta, double sign, bool higherIsBetter)
        {
            string rating = Math.Abs(sign) < 1e-9 ? "NEUTRAL" : (sign > 0) == higherIsBetter ? "GOOD" : "BAD";
            return new JObject { ["metric"] = metric, ["value"] = Round(value), ["delta"] = Round(delta), ["rating"] = rating };
        }

        private static double Round(double v) => Math.Round(v, 4);

        /// <summary><c>vote.open</c> for a PART round over Core's options for <paramref name="slot"/>.</summary>
        public static JObject Open(string roundId, string slot, IReadOnlyList<VoteOption> options, uint coinSeed, JObject timers = null)
        {
            var opts = new JArray();
            foreach (VoteOption o in options)
            {
                var warnings = new JArray();
                foreach (ValidationIssue issue in o.Blockers)
                {
                    if (warnings.Count == 4) break;
                    if (!string.IsNullOrEmpty(issue.TextKey)) warnings.Add(new JObject { ["key"] = issue.TextKey });
                }
                opts.Add(new JObject
                {
                    ["id"] = o.Part.Id,
                    ["partId"] = o.Part.Id,
                    ["label"] = null,
                    ["costM"] = Math.Max(0, Round(o.Preview.Delta.CostM)),
                    ["afford"] = Afford(o),
                    ["overBudgetByM"] = Round(o.OverBudgetM),
                    ["overScheduleByDays"] = Round(o.OverScheduleDays),
                    ["willNotFly"] = o.WillNotFly,
                    ["fixExists"] = o.Fix?.Exists ?? false,
                    ["warnings"] = warnings,
                    ["deltas"] = Deltas(o.Preview),
                });
            }
            OwnerRoles.TryGetValue(slot, out string[] owners);
            return new JObject
            {
                ["roundId"] = roundId,
                ["kind"] = "PART",
                ["subjectId"] = slot,
                ["title"] = new JObject { ["key"] = "vote." + slot + ".name" },
                ["why"] = null,
                ["ownerRoles"] = new JArray(owners ?? Array.Empty<string>()),
                ["options"] = opts,
                ["defaultOptionId"] = null,
                ["hint"] = null,
                ["predict"] = null,
                ["trivia"] = null,
                ["coinSeed"] = coinSeed,
                ["timers"] = timers,
            };
        }

        /// <summary><c>vote.commit</c> after the host applied the winner (deltas = the winner's "if chosen" deltas).</summary>
        public static JObject Commit(string roundId, string winnerId, OptionPreview applied) => new JObject
        {
            ["roundId"] = roundId,
            ["winnerId"] = winnerId,
            ["deltas"] = applied != null ? Deltas(applied) : new JArray(),
            ["codexIds"] = new JArray(),
        };

        /// <summary>Sticky <c>build.state</c> from the current build and its dashboard (Core).</summary>
        public static JObject BuildState(BuildState build, GameCatalog catalog, DashboardMetrics m)
        {
            var parts = new JArray();
            foreach (ContractVote v in VoteOptions.VotesFor(catalog.Contract(build.ContractId)))
            {
                string id = build.Choice(v.Slot);
                if (id == null) continue;
                int count = catalog.Parts.TryGetValue(id, out PartDef p) ? Math.Max(1, p.Stats.Count ?? 1) : 1;
                parts.Add(new JObject { ["category"] = v.Slot, ["partId"] = id, ["count"] = Math.Min(99, count) });
            }
            BudgetSchedule b = m.Budget;
            var metrics = new JArray
            {
                Metric("TOTAL_DV_MS", m.TotalDvMps, m.DvRequiredMps, m.TotalDvMps <= 0 ? "NEUTRAL" : m.TotalDvMps >= m.DvRequiredMps ? "GOOD" : "BAD"),
                Metric("TOTAL_MASS_T", m.TotalMassKg / 1000.0, null, "NEUTRAL"),
                Metric("COST_M", b.TotalCostM, b.BudgetM, b.RemainingM >= 0 ? "GOOD" : "BAD"),
                Metric("BUDGET_LEFT_M", b.RemainingM, null, b.RemainingM >= 0 ? "GOOD" : "BAD"),
                Metric("SCHEDULE_DAYS", b.TotalDays, b.DeadlineDays, b.SlackDays >= 0 ? "GOOD" : "BAD"),
                Metric("SUCCESS_PCT", m.Success.Success * 100, null, "NEUTRAL"),
                Metric("SUCCESS_BAND_PCT", m.Success.BandHalfWidth * 100, null, "NEUTRAL"),
            };
            if (m.LiftoffTwr.HasValue)
                metrics.Add(Metric("LIFTOFF_TWR", m.LiftoffTwr.Value, null, m.LiftoffTwrStatus == TwrStatus.Ideal ? "GOOD" : m.LiftoffTwrStatus == TwrStatus.WillNotFly ? "BAD" : "MARGINAL"));
            var issues = new JArray();
            var all = new List<ValidationIssue>(Validator.Validate(new MissionForge.Core.Build.Vehicle(build, catalog), m, catalog, ValidationMode.Partial));
            all.Sort((x, y) => y.Severity.CompareTo(x.Severity)); // most severe first
            foreach (ValidationIssue i in all)
            {
                if (string.IsNullOrEmpty(i.TextKey) || string.IsNullOrEmpty(i.RuleId)) continue;
                issues.Add(new JObject { ["ruleId"] = i.RuleId, ["severity"] = i.Severity.ToString().ToUpperInvariant(), ["text"] = new JObject { ["key"] = i.TextKey } });
            }
            return new JObject
            {
                ["contractId"] = build.ContractId,
                ["parts"] = parts,
                ["metrics"] = metrics,
                ["budgetTotalM"] = Math.Max(0, Round(b.BudgetM)),
                ["budgetSpentM"] = Math.Max(0, Round(b.TotalCostM)),
                ["scheduleLimitDays"] = Math.Max(0, Round(b.DeadlineDays)),
                ["scheduleUsedDays"] = Math.Max(0, Round(b.TotalDays)),
                ["issues"] = issues,
            };
        }

        private static JObject Metric(string id, double value, double? required, string rating) => new JObject
        {
            ["metric"] = id,
            ["value"] = Round(value),
            ["required"] = required.HasValue ? (JToken)Round(required.Value) : JValue.CreateNull(),
            ["rating"] = rating,
        };
    }
}
