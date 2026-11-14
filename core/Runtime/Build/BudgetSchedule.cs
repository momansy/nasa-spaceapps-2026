#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>One line of the cost breakdown, $M (game value).</summary>
    public sealed class CostLine
    {
        internal CostLine(string id, string? category, double costM)
        {
            Id = id;
            Category = category;
            CostM = costM;
        }

        /// <summary>Part ID or ledger source ID, or <c>mission_assurance</c> for the assurance adjustment.</summary>
        public string Id { get; }
        /// <summary>Category, or null for ledger lines.</summary>
        public string? Category { get; }
        /// <summary>Cost, $M (game value).</summary>
        public double CostM { get; }
    }

    /// <summary>Kind of a step on the Integration Timeline.</summary>
    public enum StepKind
    {
        /// <summary>Procurement of a part (runs in parallel from day 0).</summary>
        Procure,
        /// <summary>Integration of a part (serial).</summary>
        Integrate,
        /// <summary>A test (serial).</summary>
        Test,
        /// <summary>Fixing a revealed flaw (serial).</summary>
        Fix,
        /// <summary>An anomaly delay (serial).</summary>
        Anomaly,
        /// <summary>A design-review rework (serial).</summary>
        Rework,
    }

    /// <summary>One bar on the Integration Timeline (design 6.1, 6.4). Days are game values.</summary>
    public sealed class TimelineStep
    {
        internal TimelineStep(string id, StepKind kind, string? category, double startDay, double durationDays, bool critical, double slackDays)
        {
            Id = id;
            Kind = kind;
            Category = category;
            StartDay = startDay;
            DurationDays = durationDays;
            Critical = critical;
            SlackDays = slackDays;
        }

        /// <summary>Part ID or ledger source ID.</summary>
        public string Id { get; }
        /// <summary>Step kind.</summary>
        public StepKind Kind { get; }
        /// <summary>Category, or null.</summary>
        public string? Category { get; }
        /// <summary>Start, days from the start of the build.</summary>
        public double StartDay { get; }
        /// <summary>Duration, days. A negative duration is a saving (e.g. stainless steel −5 integration days).</summary>
        public double DurationDays { get; }
        /// <summary>End day.</summary>
        public double EndDay => StartDay + DurationDays;
        /// <summary>On the critical path that sets the launch date.</summary>
        public bool Critical { get; }
        /// <summary>Days this step could slip without moving the launch date (0 on the critical path).</summary>
        public double SlackDays { get; }
    }

    /// <summary>Budget and schedule of a build (design 6.4). All money $M and days are game values.</summary>
    public sealed class BudgetSchedule
    {
        /// <summary>Σ part costs including counts, tanks × material multiplier and drawback extras, $M.</summary>
        public double PartsCostM { get; internal set; }
        /// <summary>Σ ledger costs (tests, fixes, anomaly responses, rework), $M.</summary>
        public double LedgerCostM { get; internal set; }
        /// <summary>Mission-assurance adjustment of the total (7.20: −15% / +20%), $M.</summary>
        public double AssuranceCostM { get; internal set; }
        /// <summary>Total cost, $M.</summary>
        public double TotalCostM => PartsCostM + LedgerCostM + AssuranceCostM;
        /// <summary>Available budget: contract budget plus budget changes (cuts, emergency funding), $M.</summary>
        public double BudgetM { get; internal set; }
        /// <summary>Budget left, $M (negative when over budget).</summary>
        public double RemainingM => BudgetM - TotalCostM;
        /// <summary>Expected refund from booster recovery (7.18), $M. Shown separately; not deducted from cost.</summary>
        public double RecoveryRefundM { get; internal set; }

        /// <summary>Longest procurement lead time (parallel), days.</summary>
        public double MaxLeadDays { get; internal set; }
        /// <summary>Σ integration days (serial), days.</summary>
        public double IntegrationDays { get; internal set; }
        /// <summary>Σ test days, days.</summary>
        public double TestDays { get; internal set; }
        /// <summary>Σ other serial days (fixes, anomalies, rework), days.</summary>
        public double OtherDays { get; internal set; }
        /// <summary>Mission-assurance adjustment (7.20: −10% / +15%), days.</summary>
        public double AssuranceDays { get; internal set; }
        /// <summary>Total schedule: <c>max(lead) + Σ integration + Σ test + other</c>, scaled by assurance, days.</summary>
        public double TotalDays => MaxLeadDays + IntegrationDays + TestDays + OtherDays + AssuranceDays;
        /// <summary>Contract deadline, days.</summary>
        public double DeadlineDays { get; internal set; }
        /// <summary>Days to spare before the deadline (negative when late).</summary>
        public double SlackDays => DeadlineDays - TotalDays;
        /// <summary>Launch-window slips caused by missing the deadline (6.4).</summary>
        public int Slips { get; internal set; }
        /// <summary>Days lost to slips: <c>slips × window interval</c>.</summary>
        public double SlipDays { get; internal set; }
        /// <summary>A slip is mission-ending in Quick Mission (window interval ≥ 365 days, e.g. Mars ≈ 26 months).</summary>
        public bool SlipIsMissionEnding { get; internal set; }

        /// <summary>Cost lines.</summary>
        public IReadOnlyList<CostLine> CostLines { get; internal set; } = Array.Empty<CostLine>();
        /// <summary>All timeline steps (procurement first, then the serial chain in order).</summary>
        public IReadOnlyList<TimelineStep> Timeline { get; internal set; } = Array.Empty<TimelineStep>();
        /// <summary>The critical path: longest-lead procurement step followed by every serial step, in order.</summary>
        public IReadOnlyList<TimelineStep> CriticalPath { get; internal set; } = Array.Empty<TimelineStep>();
    }

    /// <summary>Computes cost, schedule and the critical path (design 6.4, 7.20).</summary>
    public static class BudgetScheduleModel
    {
        /// <summary>Hardware cost of the part chosen in a vote slot, including counts and multipliers, $M (no drawback extras).</summary>
        /// <param name="v">Resolved vehicle.</param>
        /// <param name="slot">Vote slot the part fills (see <see cref="Slots"/>).</param>
        /// <param name="p">The part.</param>
        public static double PartCostM(Vehicle v, string slot, PartDef p)
        {
            switch (slot)
            {
                case Slots.FirstStageEngine:
                    return p.CostM * v.FirstEngineCount;
                case Slots.UpperStageEngine:
                    return p.CostM * v.UpperEngineCount;
                case Slots.FirstStageTank:
                    return TankCostM(p, true) * v.MaterialCostMultiplier;
                case Slots.UpperStageTank:
                    return TankCostM(p, false) * v.MaterialCostMultiplier;
                case Slots.StrapOnBoosters:
                    if (v.BoostersMirrorFirstStage)
                    {
                        double stage = 0;
                        if (v.FirstEngine != null) stage += v.FirstEngine.CostM * v.FirstEngineCount;
                        var tank = v.Part(Slots.FirstStageTank);
                        if (tank != null) stage += TankCostM(tank, true) * v.MaterialCostMultiplier;
                        // Liquid side boosters cost "2× first-stage cost" (design 7.11): data cost_first_stage_mult,
                        // else one first stage per booster; plus any per-booster cost of the option itself.
                        var mult = p.Stats.Get("cost_first_stage_mult") ?? v.BoosterCount;
                        return stage * mult + p.CostM * v.BoosterCount;
                    }
                    return p.CostM * v.BoosterCount;
                default:
                    return p.CostM;
            }
        }

        /// <summary>
        /// Tank structure cost on a stage, $M: the data cost, or <see cref="BuildConstants.TankCostMPerTonnePropellant"/>
        /// per tonne of that stage's propellant capacity when data has none (game_value, design 7.9 gives no tank cost).
        /// </summary>
        public static double TankCostM(PartDef tank, bool firstStage) =>
            tank.CostM > 0 ? tank.CostM : (tank.Stats.TankPropellantKg(firstStage) ?? 0) / 1000.0 * BuildConstants.TankCostMPerTonnePropellant;

        /// <summary>Computes budget, schedule, timeline and critical path for a resolved vehicle.</summary>
        public static BudgetSchedule Compute(Vehicle v)
        {
            var r = new BudgetSchedule();
            var build = v.Build;
            var contract = v.Contract;
            var assurance = v.Part(Slots.MissionAssurance);
            var costFraction = assurance?.Stats.CostFraction ?? 0;
            var daysScale = 1 + (assurance?.Stats.DaysFraction ?? 0);

            // ---- cost
            var lines = new List<CostLine>();
            double parts = 0;
            foreach (var kv in v.ChosenSlots())
            {
                var p = kv.Value;
                var c = PartCostM(v, kv.Key, p) + p.Stats.ExtraCostM;
                parts += c;
                lines.Add(new CostLine(p.Id, kv.Key, c));
            }
            double ledgerCost = 0, budgetDelta = 0;
            foreach (var e in build.Ledger)
            {
                ledgerCost += e.CostM;
                budgetDelta += e.BudgetDeltaM;
                if (e.CostM != 0) lines.Add(new CostLine(e.SourceId, e.Category, e.CostM));
            }
            r.PartsCostM = parts;
            r.LedgerCostM = ledgerCost;
            r.AssuranceCostM = (parts + ledgerCost) * costFraction;
            if (r.AssuranceCostM != 0) lines.Add(new CostLine(Slots.MissionAssurance, Slots.MissionAssurance, r.AssuranceCostM));
            r.CostLines = lines;
            r.BudgetM = contract.BudgetM + budgetDelta;

            var recovery = v.Part(Slots.BoosterRecovery);
            if (recovery != null && recovery.Stats.RefundFraction > 0)
            {
                double hw = 0;
                if (v.FirstEngine != null) hw += PartCostM(v, Slots.FirstStageEngine, v.FirstEngine);
                var ft = v.Part(Slots.FirstStageTank);
                if (ft != null) hw += PartCostM(v, Slots.FirstStageTank, ft);
                if (v.Boosters != null && v.BoostersMirrorFirstStage) hw += PartCostM(v, Slots.StrapOnBoosters, v.Boosters);
                r.RecoveryRefundM = hw * recovery.Stats.RefundFraction;
            }

            // ---- schedule
            var leadExtra = new Dictionary<string, double>();
            foreach (var e in build.Ledger)
                if (e.LeadDays != 0 && e.Category != null)
                    leadExtra[e.Category] = (leadExtra.TryGetValue(e.Category, out var x) ? x : 0) + e.LeadDays;

            var procure = new List<(PartDef part, string slot, double lead)>();
            double maxLead = 0;
            foreach (var kv in v.ChosenSlots())
            {
                var p = kv.Value;
                var lead = p.LeadDays + p.Stats.ExtraLeadDays + (leadExtra.TryGetValue(kv.Key, out var le) ? le : 0);
                lead *= daysScale;
                if (lead > 0) procure.Add((p, kv.Key, lead));
                if (lead > maxLead) maxLead = lead;
            }

            var timeline = new List<TimelineStep>();
            var critical = new List<TimelineStep>();
            // The first part with the maximum lead is the critical procurement step (stable tie-break: vote order).
            string? criticalProcure = null;
            foreach (var (p, slot, lead) in procure) if (lead == maxLead) { criticalProcure = slot; break; }
            foreach (var (p, slot, lead) in procure)
            {
                var isCrit = slot == criticalProcure;
                var step = new TimelineStep(p.Id, StepKind.Procure, slot, 0, lead, isCrit, maxLead - lead);
                timeline.Add(step);
                if (isCrit) critical.Add(step);
            }

            double cursor = maxLead, integ = 0, test = 0, other = 0;
            foreach (var kv in v.ChosenSlots())
            {
                var p = kv.Value;
                var d = (p.IntegDays + p.Stats.ExtraIntegDays) * daysScale;
                if (d == 0) continue;
                var step = new TimelineStep(p.Id, StepKind.Integrate, kv.Key, cursor, d, true, 0);
                timeline.Add(step);
                critical.Add(step);
                cursor += d;
                integ += d;
            }
            foreach (var e in build.Ledger)
            {
                if (e.Days == 0) continue;
                var d = e.Days * daysScale;
                var kind = e.Kind switch
                {
                    LedgerKind.Test => StepKind.Test,
                    LedgerKind.FlawFix => StepKind.Fix,
                    LedgerKind.Rework => StepKind.Rework,
                    _ => StepKind.Anomaly,
                };
                var step = new TimelineStep(e.SourceId, kind, e.Category, cursor, d, true, 0);
                timeline.Add(step);
                critical.Add(step);
                cursor += d;
                if (kind == StepKind.Test) test += d; else other += d;
            }

            // Report the unscaled parts and the assurance difference separately so the sum is exact.
            r.MaxLeadDays = maxLead / daysScale;
            r.IntegrationDays = integ / daysScale;
            r.TestDays = test / daysScale;
            r.OtherDays = other / daysScale;
            r.AssuranceDays = (maxLead + integ + test + other) - (r.MaxLeadDays + r.IntegrationDays + r.TestDays + r.OtherDays);
            r.Timeline = timeline;
            r.CriticalPath = critical;
            r.DeadlineDays = contract.ScheduleDays;

            var overrun = r.TotalDays - r.DeadlineDays;
            if (overrun > 1e-9)
            {
                var interval = Math.Max(1.0, contract.LaunchWindowIntervalDays);
                r.Slips = (int)Math.Ceiling(overrun / interval - 1e-9);
                r.SlipDays = r.Slips * interval;
                r.SlipIsMissionEnding = interval >= 365;
            }
            return r;
        }
    }
}
