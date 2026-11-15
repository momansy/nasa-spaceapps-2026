using System;
using System.Collections.Generic;
using MissionForge.Core.Build;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>Readiness status of one metric (design 14.4: colour + shape + label + border, never colour alone).</summary>
    public enum MetricStatus
    {
        /// <summary>Not computable yet (the vote that decides it is still open).</summary>
        Pending,
        /// <summary>No requirement applies (mass, success): shown without a verdict.</summary>
        Info,
        Meets,
        Marginal,
        Fails,
    }

    /// <summary>One row of the Readiness Dashboard, ready to display.</summary>
    public sealed class MetricRow
    {
        public MetricRow(string id, string name, string value, string unit, MetricStatus status, string detail, float fill, string delta = null, int deltaSign = 0)
        {
            Id = id;
            Name = name;
            Value = value;
            Unit = unit;
            Status = status;
            Detail = detail;
            Fill = fill;
            Delta = delta;
            DeltaSign = deltaSign;
        }

        public string Id { get; }
        public string Name { get; }
        /// <summary>Formatted number (or a status word for stability).</summary>
        public string Value { get; }
        public string Unit { get; }
        public MetricStatus Status { get; }
        /// <summary>Requirement / context line.</summary>
        public string Detail { get; }
        /// <summary>Bar fill 0..1 against the requirement (or a natural scale).</summary>
        public float Fill { get; }
        /// <summary>Preview delta for the leading option with arrow, sign and unit, or null.</summary>
        public string Delta { get; }
        /// <summary>+1 better, −1 worse, 0 neutral (drives the delta colour together with the arrow).</summary>
        public int DeltaSign { get; }
        /// <summary>Uncertainty band on the bar (0..1), or −1 when the metric has none (only mission success has one).</summary>
        public float BandLow { get; set; } = -1f;
        public float BandHigh { get; set; } = -1f;
        /// <summary>Requirement position on the bar (0..1, same scale as <see cref="Fill"/>), or −1 when none (T031 marker).</summary>
        public float Requirement { get; set; } = -1f;
        /// <summary>Bar position if the leading option is chosen (0..1), or −1 without a preview (T031 ghost delta).</summary>
        public float Ghost { get; set; } = -1f;
    }

    /// <summary>
    /// Maps Core's <see cref="DashboardMetrics"/> to the eleven rows of design 6.3. Every number shown is a Core value;
    /// the only arithmetic here is unit conversion for display (kg › t, m/s › km/s for entry speed, fraction › %).
    /// Status bands come from Core's own verdicts (TwrStatus, StabilityStatus, UpperStageTwrWarning) and the
    /// validation severities of design 6.11; the "marginal" money and time bands are game_value display choices.
    /// </summary>
    public static class DashboardViewModel
    {
        /// <summary>Δv margin below which a flyable build shows Marginal, fraction (game_value, display only).</summary>
        public const double DvMarginalFraction = 0.05;
        /// <summary>Remaining budget below this share of the budget shows Marginal (game_value, display only).</summary>
        public const double BudgetMarginalFraction = 0.10;
        /// <summary>Schedule slack below this share of the deadline shows Marginal (game_value, display only).</summary>
        public const double ScheduleMarginalFraction = 0.10;

        public static readonly string[] MetricIds =
        {
            "dv", "liftoff_twr", "upper_twr", "mass", "cost", "schedule", "success", "power", "data", "entry", "stability",
        };

        public static IReadOnlyList<MetricRow> Build(DashboardMetrics m, UiText t, DashboardDelta delta = null)
        {
            if (m == null) throw new ArgumentNullException(nameof(m));
            if (t == null) throw new ArgumentNullException(nameof(t));
            return new[]
            {
                DeltaV(m, t, delta), LiftoffTwr(m, t, delta), UpperTwr(m, t, delta), Mass(m, t, delta),
                Cost(m, t, delta), Schedule(m, t, delta), Success(m, t, delta), Power(m, t, delta),
                Data(m, t, delta), Entry(m, t, delta), Stability(m, t, delta),
            };
        }

        public static string StatusKey(MetricStatus s) => "ui.buildbay.status." + s.ToString().ToLowerInvariant();

        private static string Name(UiText t, string id) => t.Get("ui.buildbay.metric." + id + ".name");

        private static MetricRow Pending(UiText t, string id, string unitKey) =>
            new MetricRow(id, Name(t, id), "—", t.Get(unitKey), MetricStatus.Pending, t.Get("ui.buildbay.metric.pending"), 0f);

        private static MetricRow DeltaV(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.m_s";
            if (m.TotalDvMps <= 0) return Pending(t, "dv", unit);
            double margin = m.DvMarginFraction;
            MetricStatus s = m.TotalDvMps < m.DvRequiredMps ? MetricStatus.Fails
                : margin < DvMarginalFraction ? MetricStatus.Marginal : MetricStatus.Meets;
            string detail = t.Format("ui.buildbay.metric.dv.detail",
                t.WithUnit(UiText.Number(m.DvRequiredMps, 0), unit), UiText.Signed(margin * 100, 1) + "\u00A0%");
            return new MetricRow("dv", Name(t, "dv"), UiText.Number(m.TotalDvMps, 0), t.Get(unit), s, detail,
                Ratio(m.TotalDvMps, m.DvRequiredMps * 1.25), DeltaText(d?.TotalDvMps, 0, t, unit, true), Sign(d?.TotalDvMps, true))
            {
                Requirement = Ratio(m.DvRequiredMps, m.DvRequiredMps * 1.25),
                Ghost = GhostAt(m.TotalDvMps, d?.TotalDvMps, m.DvRequiredMps * 1.25),
            };
        }

        private static MetricRow LiftoffTwr(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.ratio";
            if (!m.LiftoffTwr.HasValue) return Pending(t, "liftoff_twr", unit);
            MetricStatus s = m.LiftoffTwrStatus switch
            {
                TwrStatus.Ideal => MetricStatus.Meets,
                TwrStatus.WillNotFly => MetricStatus.Fails,
                TwrStatus.Unknown => MetricStatus.Pending,
                _ => MetricStatus.Marginal,
            };
            return new MetricRow("liftoff_twr", Name(t, "liftoff_twr"), UiText.Number(m.LiftoffTwr.Value, 2), t.Get(unit), s,
                t.Get("ui.buildbay.metric.liftoff_twr.detail"), Ratio(m.LiftoffTwr.Value, 2.0),
                DeltaText(d?.LiftoffTwr, 2, t, unit, true), Sign(d?.LiftoffTwr, true))
            {
                Requirement = Ratio(LiftoffTwrFloor, 2.0),
                Ghost = GhostAt(m.LiftoffTwr.Value, d?.LiftoffTwr, 2.0),
            };
        }

        private static MetricRow UpperTwr(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.ratio";
            if (!m.UpperStageTwr.HasValue) return Pending(t, "upper_twr", unit);
            MetricStatus s = m.UpperStageTwrWarning ? MetricStatus.Marginal : MetricStatus.Meets;
            return new MetricRow("upper_twr", Name(t, "upper_twr"), UiText.Number(m.UpperStageTwr.Value, 2), t.Get(unit), s,
                t.Get("ui.buildbay.metric.upper_twr.detail"), Ratio(m.UpperStageTwr.Value, 1.5),
                DeltaText(d?.UpperStageTwr, 2, t, unit, true), Sign(d?.UpperStageTwr, true))
            {
                Requirement = Ratio(UpperTwrFloor, 1.5),
                Ghost = GhostAt(m.UpperStageTwr.Value, d?.UpperStageTwr, 1.5),
            };
        }

        private static MetricRow Mass(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.t";
            double tonnes = m.TotalMassKg / 1000.0;
            return new MetricRow("mass", Name(t, "mass"), UiText.Number(tonnes, tonnes < 100 ? 1 : 0), t.Get(unit), MetricStatus.Info,
                t.Get("ui.buildbay.metric.mass.detail"), Ratio(tonnes, 600),
                DeltaText(d == null ? (double?)null : d.TotalMassKg / 1000.0, 1, t, unit, false), 0)
            {
                Ghost = GhostAt(tonnes, d == null ? (double?)null : d.TotalMassKg / 1000.0, 600),
            };
        }

        private static MetricRow Cost(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.money_m";
            BudgetSchedule b = m.Budget;
            MetricStatus s = b.RemainingM < 0 ? MetricStatus.Fails
                : b.RemainingM < b.BudgetM * BudgetMarginalFraction ? MetricStatus.Marginal : MetricStatus.Meets;
            string detail = t.Format("ui.buildbay.metric.cost.detail", Money(b.BudgetM));
            return new MetricRow("cost", Name(t, "cost"), UiText.Number(b.TotalCostM, 1), t.Get(unit), s, detail,
                Ratio(b.TotalCostM, b.BudgetM * 1.25), DeltaText(d?.CostM, 1, t, unit, false), Sign(d?.CostM, false))
            {
                Requirement = Ratio(b.BudgetM, b.BudgetM * 1.25),
                Ghost = GhostAt(b.TotalCostM, d?.CostM, b.BudgetM * 1.25),
            };
        }

        private static MetricRow Schedule(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.days";
            BudgetSchedule b = m.Budget;
            MetricStatus s = b.SlackDays < 0 ? MetricStatus.Fails
                : b.SlackDays < b.DeadlineDays * ScheduleMarginalFraction ? MetricStatus.Marginal : MetricStatus.Meets;
            string detail = t.Format("ui.buildbay.metric.schedule.detail",
                t.WithUnit(UiText.Number(b.DeadlineDays, 0), unit), t.WithUnit(UiText.Signed(b.SlackDays, 0), unit));
            return new MetricRow("schedule", Name(t, "schedule"), UiText.Number(b.TotalDays, 0), t.Get(unit), s, detail,
                Ratio(b.TotalDays, b.DeadlineDays * 1.25), DeltaText(d?.ScheduleDays, 0, t, unit, false), Sign(d?.ScheduleDays, false))
            {
                Requirement = Ratio(b.DeadlineDays, b.DeadlineDays * 1.25),
                Ghost = GhostAt(b.TotalDays, d?.ScheduleDays, b.DeadlineDays * 1.25),
            };
        }

        private static MetricRow Success(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.percent";
            ReliabilityEstimate r = m.Success;
            string value = UiText.Number(r.Success * 100, 1);
            string detail = t.Format("ui.buildbay.metric.success.detail", UiText.Number(r.BandHalfWidth * 100, 1) + "\u00A0%",
                UiText.Number(r.Low * 100, 1), UiText.Number(r.High * 100, 1) + "\u00A0%");
            return new MetricRow("success", Name(t, "success"), value, t.Get(unit), MetricStatus.Info, detail,
                (float)r.Success, DeltaText(d == null ? (double?)null : d.Success * 100, 1, t, unit, true), Sign(d?.Success, true))
            {
                BandLow = (float)r.Low,
                BandHigh = (float)r.High,
                Ghost = GhostAt(r.Success, d?.Success, 1.0),
            };
        }

        private static MetricRow Power(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.w";
            if (!m.PowerSunlitW.HasValue || !m.PowerEclipseW.HasValue) return Pending(t, "power", unit);
            double worst = Math.Min(m.PowerSunlitW.Value, m.PowerEclipseW.Value);
            MetricStatus s = worst < 0 ? MetricStatus.Fails : MetricStatus.Meets;
            string detail = t.Format("ui.buildbay.metric.power.detail",
                t.WithUnit(UiText.Signed(m.PowerSunlitW.Value, 0), unit), t.WithUnit(UiText.Signed(m.PowerEclipseW.Value, 0), unit));
            double load = Math.Max(1, m.PowerLoadW);
            return new MetricRow("power", Name(t, "power"), UiText.Signed(worst, 0), t.Get(unit), s, detail,
                Ratio(load + worst, 2 * load), DeltaText(d?.PowerEclipseW, 0, t, unit, true), Sign(d?.PowerEclipseW, true))
            {
                Requirement = Ratio(load, 2 * load),
                Ghost = GhostAt(load + worst, d?.PowerEclipseW, 2 * load),
            };
        }

        private static MetricRow Data(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.gb_day";
            if (!m.DataGeneratedGbPerDay.HasValue || !m.DownlinkGbPerDay.HasValue) return Pending(t, "data", unit);
            double gen = m.DataGeneratedGbPerDay.Value, down = m.DownlinkGbPerDay.Value;
            MetricStatus s = gen > down ? MetricStatus.Marginal : MetricStatus.Meets;
            string detail = t.Format("ui.buildbay.metric.data.detail", t.WithUnit(UiText.Number(gen, 1), unit), t.WithUnit(UiText.Number(down, 1), unit));
            return new MetricRow("data", Name(t, "data"), UiText.Signed(down - gen, 1), t.Get(unit), s, detail,
                Ratio(down, Math.Max(gen, 0.1) * 2), DeltaText(d?.DownlinkGbPerDay, 1, t, unit, true), Sign(d?.DownlinkGbPerDay, true))
            {
                Requirement = Ratio(Math.Max(gen, 0.1), Math.Max(gen, 0.1) * 2),
                Ghost = GhostAt(down, d?.DownlinkGbPerDay, Math.Max(gen, 0.1) * 2),
            };
        }

        private static MetricRow Entry(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.km_s";
            if (!m.ContractEntrySpeedMps.HasValue)
                return new MetricRow("entry", Name(t, "entry"), "—", t.Get(unit), MetricStatus.Info, t.Get("ui.buildbay.metric.entry.not_returning"), 0f);
            string required = t.Format("ui.buildbay.metric.entry.detail", t.WithUnit(UiText.Number(m.ContractEntrySpeedMps.Value / 1000.0, 1), unit));
            if (!m.MaxEntrySpeedRatingMps.HasValue)
                return new MetricRow("entry", Name(t, "entry"), "—", t.Get(unit), MetricStatus.Pending, required, 0f);
            MetricStatus s = m.MaxEntrySpeedRatingMps.Value < m.ContractEntrySpeedMps.Value ? MetricStatus.Fails : MetricStatus.Meets;
            return new MetricRow("entry", Name(t, "entry"), UiText.Number(m.MaxEntrySpeedRatingMps.Value / 1000.0, 1), t.Get(unit), s, required,
                Ratio(m.MaxEntrySpeedRatingMps.Value, m.ContractEntrySpeedMps.Value * 1.25),
                DeltaText(d?.MaxEntrySpeedRatingMps / 1000.0, 1, t, unit, true), Sign(d?.MaxEntrySpeedRatingMps, true))
            {
                Requirement = Ratio(m.ContractEntrySpeedMps.Value, m.ContractEntrySpeedMps.Value * 1.25),
                Ghost = GhostAt(m.MaxEntrySpeedRatingMps.Value, d?.MaxEntrySpeedRatingMps, m.ContractEntrySpeedMps.Value * 1.25),
            };
        }

        private static MetricRow Stability(DashboardMetrics m, UiText t, DashboardDelta d)
        {
            const string unit = "ui.buildbay.unit.calibers";
            if (m.Stability == StabilityStatus.Unknown || !m.StabilityMarginCalibers.HasValue)
                return new MetricRow("stability", Name(t, "stability"), "—", t.Get(unit), MetricStatus.Pending, t.Get("ui.buildbay.metric.pending"), 0f);
            MetricStatus s = m.Stability == StabilityStatus.Stable ? MetricStatus.Meets : MetricStatus.Marginal;
            string word = m.Stability switch
            {
                StabilityStatus.Stable => t.Get("ui.buildbay.stability.stable"),
                StabilityStatus.Marginal => t.Get("ui.buildbay.stability.marginal"),
                _ => t.Get("ui.buildbay.stability.gimbal"),
            };
            string value = UiText.Signed(m.StabilityMarginCalibers.Value, 2);
            return new MetricRow("stability", Name(t, "stability"), value, t.Get(unit), s, word,
                Ratio(m.StabilityMarginCalibers.Value + 1, 3), DeltaText(d?.StabilityMarginCalibers, 2, t, unit, true), Sign(d?.StabilityMarginCalibers, true))
            {
                Requirement = Ratio(StableMarginCalibers + 1, 3),
                Ghost = GhostAt(m.StabilityMarginCalibers.Value + 1, d?.StabilityMarginCalibers, 3),
            };
        }

        // ---------------------------------------------------------------- helpers

        // Requirement markers use Core's own thresholds (physical/game rules live in MissionForge.Core.Build.BuildConstants).
        private const double LiftoffTwrFloor = BuildConstants.IdealLiftoffTwrMin;
        private const double UpperTwrFloor = BuildConstants.UpperStageTwrWarning;
        private const double StableMarginCalibers = BuildConstants.StableMarginCalibers;

        public static string Money(double m) => "$" + UiText.Number(m, m < 100 ? 1 : 0) + " M";

        /// <summary>Bar position after an "if chosen" delta, or −1 when there is no delta.</summary>
        private static float GhostAt(double value, double? delta, double scale) =>
            delta.HasValue && Math.Abs(delta.Value) > 1e-9 ? Ratio(value + delta.Value, scale) : -1f;

        private static float Ratio(double value, double scale) =>
            scale <= 0 ? 0f : (float)Math.Max(0, Math.Min(1, value / scale));

        /// <summary>"↑ +120 m/s": arrow, sign and unit (style guide). Null when there is no delta or it rounds to zero.</summary>
        public static string DeltaText(double? delta, int decimals, UiText t, string unitKey, bool higherIsBetter)
        {
            if (!delta.HasValue) return null;
            double rounded = Math.Round(delta.Value, decimals);
            if (rounded == 0) return null;
            string arrow = rounded > 0 ? "↑" : "↓";
            return arrow + " " + t.WithUnit(UiText.Signed(delta.Value, decimals), unitKey);
        }

        private static int Sign(double? delta, bool higherIsBetter)
        {
            if (!delta.HasValue || Math.Abs(delta.Value) < 1e-9) return 0;
            int s = delta.Value > 0 ? 1 : -1;
            return higherIsBetter ? s : -s;
        }
    }
}
