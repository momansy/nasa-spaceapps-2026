#nullable enable
using System;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>
    /// "If chosen" change of the main dashboard metrics for one option (design 4.1, 6.3). Positive means the
    /// value goes up. Δv m/s, mass kg, cost $M, days, success and margins as fractions.
    /// </summary>
    public sealed class DashboardDelta
    {
        /// <summary>Change of total Δv, m/s.</summary>
        public double TotalDvMps { get; internal set; }
        /// <summary>Change of Δv margin, fraction.</summary>
        public double DvMarginFraction { get; internal set; }
        /// <summary>Change of lift-off TWR (null when either side is not computable).</summary>
        public double? LiftoffTwr { get; internal set; }
        /// <summary>Change of upper stage TWR (null when either side is not computable).</summary>
        public double? UpperStageTwr { get; internal set; }
        /// <summary>Change of total mass, kg.</summary>
        public double TotalMassKg { get; internal set; }
        /// <summary>Change of cost, $M.</summary>
        public double CostM { get; internal set; }
        /// <summary>Change of schedule, days.</summary>
        public double ScheduleDays { get; internal set; }
        /// <summary>Change of estimated mission success, fraction.</summary>
        public double Success { get; internal set; }
        /// <summary>Change of the success uncertainty band half-width, fraction.</summary>
        public double SuccessBand { get; internal set; }
        /// <summary>Change of sunlit power balance, W (null when either side has no power system).</summary>
        public double? PowerSunlitW { get; internal set; }
        /// <summary>Change of eclipse power balance, W.</summary>
        public double? PowerEclipseW { get; internal set; }
        /// <summary>Change of data generated, GB/day.</summary>
        public double? DataGeneratedGbPerDay { get; internal set; }
        /// <summary>Change of downlink capacity, GB/day.</summary>
        public double? DownlinkGbPerDay { get; internal set; }
        /// <summary>Change of heat-shield entry speed rating, m/s.</summary>
        public double? MaxEntrySpeedRatingMps { get; internal set; }
        /// <summary>Change of stability margin, calibers.</summary>
        public double? StabilityMarginCalibers { get; internal set; }

        /// <summary>Computes <c>after − before</c>.</summary>
        public static DashboardDelta Between(DashboardMetrics before, DashboardMetrics after)
        {
            static double? Diff(double? a, double? b) => a.HasValue && b.HasValue ? b.Value - a.Value : (double?)null;
            return new DashboardDelta
            {
                TotalDvMps = after.TotalDvMps - before.TotalDvMps,
                DvMarginFraction = after.DvMarginFraction - before.DvMarginFraction,
                LiftoffTwr = Diff(before.LiftoffTwr, after.LiftoffTwr),
                UpperStageTwr = Diff(before.UpperStageTwr, after.UpperStageTwr),
                TotalMassKg = after.TotalMassKg - before.TotalMassKg,
                CostM = after.CostM - before.CostM,
                ScheduleDays = after.ScheduleDays - before.ScheduleDays,
                Success = after.Success.Success - before.Success.Success,
                SuccessBand = after.Success.BandHalfWidth - before.Success.BandHalfWidth,
                PowerSunlitW = Diff(before.PowerSunlitW, after.PowerSunlitW),
                PowerEclipseW = Diff(before.PowerEclipseW, after.PowerEclipseW),
                DataGeneratedGbPerDay = Diff(before.DataGeneratedGbPerDay, after.DataGeneratedGbPerDay),
                DownlinkGbPerDay = Diff(before.DownlinkGbPerDay, after.DownlinkGbPerDay),
                MaxEntrySpeedRatingMps = Diff(before.MaxEntrySpeedRatingMps, after.MaxEntrySpeedRatingMps),
                StabilityMarginCalibers = Diff(before.StabilityMarginCalibers, after.StabilityMarginCalibers),
            };
        }
    }

    /// <summary>The dashboard of a build with one option applied, and the delta against the current build.</summary>
    public sealed class OptionPreview
    {
        internal OptionPreview(string category, string partId, DashboardMetrics metrics, DashboardDelta delta)
        {
            Category = category;
            PartId = partId;
            Metrics = metrics;
            Delta = delta;
        }

        /// <summary>Category voted on.</summary>
        public string Category { get; }
        /// <summary>Option previewed.</summary>
        public string PartId { get; }
        /// <summary>Dashboard if this option is chosen.</summary>
        public DashboardMetrics Metrics { get; }
        /// <summary>Change against the current build (green/red deltas).</summary>
        public DashboardDelta Delta { get; }
    }

    /// <summary>"If chosen" previews (design 4.1, 6.3, 6.10). Never mutates the build.</summary>
    public static class Preview
    {
        /// <summary>
        /// Previews choosing <paramref name="partId"/> for its category. The current build is not changed
        /// (<see cref="BuildState"/> is immutable). If the category already has a part, the preview replaces it.
        /// </summary>
        /// <param name="build">Current build (not changed).</param>
        /// <param name="catalog">Catalog.</param>
        /// <param name="slot">Vote slot (see <see cref="Slots"/>), e.g. <c>first_stage_tank_size</c>.</param>
        /// <param name="partId">Option to preview.</param>
        public static OptionPreview Of(BuildState build, GameCatalog catalog, string slot, string partId)
        {
            var part = catalog.Part(partId);
            var before = Dashboard.Compute(build, catalog);
            return Of(build, catalog, slot, part, before);
        }

        /// <summary>Previews an option for a vote slot against an already computed current dashboard.</summary>
        public static OptionPreview Of(BuildState build, GameCatalog catalog, string slot, PartDef part, DashboardMetrics before)
        {
            if (part == null) throw new ArgumentNullException(nameof(part));
            if (Slots.CategoryOf(slot) != part.Category)
                throw new ArgumentException($"Part '{part.Id}' ({part.Category}) cannot fill vote slot '{slot}'.", nameof(part));
            var after = Dashboard.Compute(build.WithChoice(slot, part.Id), catalog);
            return new OptionPreview(slot, part.Id, after, DashboardDelta.Between(before, after));
        }
    }
}
