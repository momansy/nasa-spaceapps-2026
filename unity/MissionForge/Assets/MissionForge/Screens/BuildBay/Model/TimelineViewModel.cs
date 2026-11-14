using System;
using System.Collections.Generic;
using MissionForge.Core.Build;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>One bar of the Integration Timeline Gantt, in days (game values from Core's BudgetSchedule).</summary>
    public readonly struct GanttBar
    {
        public GanttBar(int lane, double startDay, double endDay, bool critical, double slackDays, string label, StepKind kind)
        {
            Lane = lane;
            StartDay = startDay;
            EndDay = endDay;
            Critical = critical;
            SlackDays = slackDays;
            Label = label;
            Kind = kind;
        }

        public int Lane { get; }
        public double StartDay { get; }
        public double EndDay { get; }
        public bool Critical { get; }
        public double SlackDays { get; }
        public string Label { get; }
        public StepKind Kind { get; }
    }

    /// <summary>The Gantt view model: lanes of bars, the deadline and the end of the schedule.</summary>
    public sealed class GanttModel
    {
        public GanttModel(IReadOnlyList<GanttBar> bars, IReadOnlyList<string> laneNames, double totalDays, double deadlineDays, double axisDays)
        {
            Bars = bars;
            LaneNames = laneNames;
            TotalDays = totalDays;
            DeadlineDays = deadlineDays;
            AxisDays = axisDays;
        }

        public IReadOnlyList<GanttBar> Bars { get; }
        public IReadOnlyList<string> LaneNames { get; }
        /// <summary>Launch-ready day (Core <c>BudgetSchedule.TotalDays</c>).</summary>
        public double TotalDays { get; }
        public double DeadlineDays { get; }
        /// <summary>Right end of the time axis, days (≥ deadline and total, rounded up to 30 days).</summary>
        public double AxisDays { get; }
        public double SlackDays => DeadlineDays - TotalDays;
        public float X(double day) => AxisDays <= 0 ? 0f : (float)Math.Max(0, Math.Min(1, day / AxisDays));
    }

    /// <summary>Builds the Gantt from <c>DashboardMetrics.Budget</c> (Timeline, CriticalPath, deadline). Display only.</summary>
    public static class TimelineViewModel
    {
        /// <summary>Axis tick spacing, days (game_value, display only).</summary>
        public const double TickDays = 30;

        public const int ProcureLane = 0;
        public const int SerialLane = 1;

        public static GanttModel Build(BudgetSchedule budget, Func<string, string> partName, UiText t)
        {
            if (budget == null) throw new ArgumentNullException(nameof(budget));
            var bars = new List<GanttBar>();
            double end = 0;
            foreach (TimelineStep s in budget.Timeline)
            {
                int lane = s.Kind == StepKind.Procure ? ProcureLane : SerialLane;
                double a = Math.Min(s.StartDay, s.EndDay), b = Math.Max(s.StartDay, s.EndDay);
                bars.Add(new GanttBar(lane, a, b, s.Critical, s.SlackDays, partName?.Invoke(s.Id) ?? s.Id, s.Kind));
                end = Math.Max(end, b);
            }
            double total = budget.TotalDays;
            double axis = Math.Max(Math.Max(total, budget.DeadlineDays), end);
            axis = Math.Max(TickDays, Math.Ceiling(axis * 1.05 / TickDays) * TickDays);
            string[] lanes =
            {
                t?.Get("ui.buildbay.timeline.step.lead") ?? "Lead time",
                t?.Get("ui.buildbay.timeline.step.integration") ?? "Integration",
            };
            return new GanttModel(bars, lanes, total, budget.DeadlineDays, axis);
        }
    }
}
