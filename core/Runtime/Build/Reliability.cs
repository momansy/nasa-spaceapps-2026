#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>The hidden truth about one part, drawn from the session seed (design 6.5). Host-only: never send to phones.</summary>
    public readonly struct HiddenPartTruth
    {
        internal HiddenPartTruth(double bandPosition, bool hasFlaw)
        {
            BandPosition = bandPosition;
            HasFlaw = hasFlaw;
        }

        /// <summary>Where the true reliability sits inside the maturity band, −1 (low edge) to +1 (high edge).</summary>
        public double BandPosition { get; }
        /// <summary>The part carries a hidden flaw that a test can reveal.</summary>
        public bool HasFlaw { get; }
    }

    /// <summary>One factor of the mission success product.</summary>
    public sealed class ReliabilityItem
    {
        internal ReliabilityItem(string id, string category, string? partId, string phase, double reliability,
            double bandHalfWidth, int units, bool engineOutCapable)
        {
            Id = id;
            Category = category;
            PartId = partId;
            Phase = phase;
            Reliability = reliability;
            BandHalfWidth = bandHalfWidth;
            Units = units;
            EngineOutCapable = engineOutCapable;
        }

        /// <summary>Item ID: the category, or <c>first_stage_cluster</c> / <c>upper_stage_cluster</c> / <c>boosters</c>.</summary>
        public string Id { get; }
        /// <summary>Category of the part.</summary>
        public string Category { get; }
        /// <summary>Part ID, or null.</summary>
        public string? PartId { get; }
        /// <summary>Flight phase group in which the item is used (<c>ascent</c>, <c>staging</c>, <c>orbit</c>, <c>entry</c>, <c>landing</c>, <c>all</c>).</summary>
        public string Phase { get; }
        /// <summary>Probability the item works for the whole flight, 0–1 (game value).</summary>
        public double Reliability { get; }
        /// <summary>Half-width of the uncertainty band of <see cref="Reliability"/>, fraction.</summary>
        public double BandHalfWidth { get; }
        /// <summary>Number of identical units (engines, boosters, redundant computers).</summary>
        public int Units { get; }
        /// <summary>For engine clusters: the cluster survives one engine failure.</summary>
        public bool EngineOutCapable { get; }
    }

    /// <summary>Estimated mission success with its uncertainty band (design 6.3, 6.5).</summary>
    public sealed class ReliabilityEstimate
    {
        internal ReliabilityEstimate(double success, double band, IReadOnlyList<ReliabilityItem> items)
        {
            Success = success;
            BandHalfWidth = band;
            Items = items;
        }

        /// <summary>Product of all item reliabilities, 0–1.</summary>
        public double Success { get; }
        /// <summary>± half-width of the uncertainty band, fraction (independent items combined in quadrature).</summary>
        public double BandHalfWidth { get; }
        /// <summary>Lower edge of the band, clamped to 0.</summary>
        public double Low => Math.Max(0, Success - BandHalfWidth);
        /// <summary>Upper edge of the band, clamped to 1.</summary>
        public double High => Math.Min(1, Success + BandHalfWidth);
        /// <summary>The factors.</summary>
        public IReadOnlyList<ReliabilityItem> Items { get; }
    }

    /// <summary>
    /// Reliability and uncertainty (design 6.5, 6.7, 7.6, 7.20). Statistical models (redundancy, engine-out
    /// binomial) are physical/statistical; all reliability numbers are game values.
    /// </summary>
    public static class ReliabilityModel
    {
        /// <summary>
        /// Reliability of <paramref name="n"/> parallel redundant units where any one suffices:
        /// <c>R_system = 1 − (1 − R)^n</c> (design 6.5; statistical model).
        /// </summary>
        public static double Redundant(double r, int n) => n <= 1 ? r : 1 - Math.Pow(1 - r, n);

        /// <summary>
        /// Reliability of an engine cluster of <paramref name="n"/> engines, each with reliability <paramref name="r"/>.
        /// Without engine-out every engine must work: <c>Rⁿ</c>. With engine-out one failure is survivable:
        /// <c>Rⁿ + n·Rⁿ⁻¹·(1 − R)</c> (binomial; statistical model).
        /// </summary>
        public static double Cluster(double r, int n, bool engineOut)
        {
            if (n <= 0) return 1;
            var all = Math.Pow(r, n);
            return engineOut && n >= 2 ? all + n * Math.Pow(r, n - 1) * (1 - r) : all;
        }

        /// <summary>Derivative of <see cref="Cluster"/> with respect to the engine reliability, used to propagate the band.</summary>
        public static double ClusterSlope(double r, int n, bool engineOut)
        {
            if (n <= 0) return 0;
            if (engineOut && n >= 2) return n * (n - 1) * Math.Pow(r, n - 2) * (1 - r);
            return n * Math.Pow(r, n - 1);
        }

        /// <summary>The hidden truth for a part: band position and flaw, from (seed, part ID). Order-independent.</summary>
        public static HiddenPartTruth Hidden(ulong seed, PartDef part)
        {
            var u = BuildRandom.Uniform(seed, BuildRandom.ReliabilityStream, part.Id, 0);
            var f = BuildRandom.Uniform(seed, BuildRandom.ReliabilityStream, part.Id, 1);
            return new HiddenPartTruth(2 * u - 1, f < BuildConstants.FlawChance(part.Maturity));
        }

        /// <summary>Mission-assurance option in use (null when undecided or Standard with no stats).</summary>
        private static PartDef? Assurance(Vehicle v) => v.Part(Slots.MissionAssurance);

        /// <summary>Band scale of the mission assurance level (×1.5 Faster-Cheaper, ×0.5 Class A).</summary>
        public static double AssuranceBandScale(Vehicle v) => Assurance(v)?.Stats.BandScale ?? 1.0;

        /// <summary>Reliability bonus of the mission assurance level for every part (Class A +1%).</summary>
        public static double AssuranceBonus(Vehicle v) => Assurance(v)?.Stats.ReliabilityBonus ?? 0.0;

        /// <summary>
        /// Displayed (estimated) reliability of one unit of a part and its band half-width.
        /// The true value sits inside the maturity band; each test moves the estimate toward the truth and
        /// narrows the band by the same factor, so the band always contains the truth.
        /// </summary>
        /// <param name="v">Resolved vehicle.</param>
        /// <param name="slot">Vote slot whose part is evaluated (its tests and responses are recorded per slot).</param>
        public static (double estimate, double band) Displayed(Vehicle v, string slot)
        {
            var part = v.Part(slot) ?? throw new InvalidOperationException($"Nothing chosen in '{slot}'.");
            var (est, band, _) = Evaluate(v, slot, part);
            return (est, band);
        }

        /// <summary>True reliability of one unit of the part in a slot (host-only, used by the flight failure model).</summary>
        public static double True(Vehicle v, string slot)
        {
            var part = v.Part(slot) ?? throw new InvalidOperationException($"Nothing chosen in '{slot}'.");
            return Evaluate(v, slot, part).truth;
        }

        /// <summary>
        /// True when the part's reliability is per unit and the option has several parallel units
        /// (data: <c>unit_reliability</c> and <c>redundancy</c>). Otherwise <c>reliability</c> is already the
        /// option's system value as printed in the design tables (e.g. triple-redundant avionics 99.2%).
        /// </summary>
        public static bool IsPerUnit(PartDef part) => part.Stats.Get("unit_reliability").HasValue && part.Stats.Redundancy > 1;

        private static (double estimate, double band, double truth) Evaluate(Vehicle v, string slot, PartDef part)
        {
            var baseR = IsPerUnit(part) ? part.Stats.Get("unit_reliability")!.Value : part.Reliability ?? 1.0;
            var cond = v.Build.Condition(slot);
            var hidden = Hidden(v.Build.Seed, part);
            var b0 = BuildConstants.BandHalfWidth(part.Maturity) * AssuranceBandScale(v);
            var truth = baseR + hidden.BandPosition * b0;
            var testScale = cond.BandScale;
            var estimate = truth + (baseR - truth) * testScale;
            var band = b0 * testScale;
            var bonus = cond.ReliabilityDelta + AssuranceBonus(v);
            truth += bonus;
            estimate += bonus;
            if (hidden.HasFlaw && !cond.FlawFixed)
            {
                truth -= BuildConstants.FlawReliabilityPenalty;
                if (cond.FlawRevealed) estimate -= BuildConstants.FlawReliabilityPenalty;
            }
            return (Clamp(estimate), band, Clamp(truth));
        }

        private static double Clamp(double r) => Math.Max(0, Math.Min(BuildConstants.MaxReliability, r));

        /// <summary>
        /// Engine-out capability of a stage (design 6.5, 7.6): the count option allows it (<c>partial</c> or
        /// <c>yes</c>; data without the field allows it for 2+ engines) and the remaining thrust still gives
        /// lift-off TWR &gt; 1 (first stage) or upper-stage TWR ≥ 0.3 (upper stage). Δv from the ideal rocket
        /// equation does not depend on thrust, so only TWR is checked (simplification).
        /// </summary>
        public static bool EngineOutCapable(Vehicle v, bool firstStage)
        {
            var engine = firstStage ? v.FirstEngine : v.UpperEngine;
            var n = firstStage ? v.FirstEngineCount : v.UpperEngineCount;
            if (engine == null || n < 2) return false;
            var countOption = v.Part(firstStage ? Slots.FirstStageEngineCount : Slots.UpperStageEngineCount);
            var allowed = countOption?.Stats.EngineOut ?? "partial";
            if (allowed == "none" || allowed == "no") return false;
            var g0 = PhysicalConstants.StandardGravityMs2;
            if (firstStage)
            {
                var m0 = v.Mass.TotalKg;
                if (m0 <= 0) return false;
                var thrust = v.FirstThrustSlN * (n - 1) / n + v.BoostersThrustSlN;
                return thrust / (m0 * g0) > BuildConstants.MinLiftoffTwr;
            }
            if (v.UpperStackMassKg <= 0) return false;
            return v.UpperThrustVacN * (n - 1) / n / (v.UpperStackMassKg * g0) >= BuildConstants.UpperStageTwrWarning;
        }

        /// <summary>Phase group in which a category's part is used (for the success breakdown).</summary>
        public static string PhaseOf(string category) => category switch
        {
            Slots.FirstStageEngine => "ascent",
            Slots.StrapOnBoosters => "ascent",
            Slots.Fairing => "ascent",
            Slots.LaunchEscape => "ascent",
            Slots.AeroControl => "ascent",
            Slots.StageSeparation => "staging",
            Slots.UpperStageEngine => "orbit_insertion",
            Slots.HeatShield => "entry",
            Slots.CapsuleRecovery => "landing",
            Slots.Lander => "landing",
            Slots.BoosterRecovery => "recovery",
            Slots.Avionics => "all",
            Slots.Navigation => "all",
            _ => "orbit",
        };

        /// <summary>Estimated mission success shown on the dashboard (displayed estimates, never the hidden truth).</summary>
        public static ReliabilityEstimate Estimate(Vehicle v) => Compute(v, useTruth: false);

        /// <summary>True mission success probability (host-only; for the flight model and debrief).</summary>
        public static ReliabilityEstimate TrueSuccess(Vehicle v) => Compute(v, useTruth: true);

        private static ReliabilityEstimate Compute(Vehicle v, bool useTruth)
        {
            var items = new List<ReliabilityItem>();
            (double r, double b) Unit(string slot, PartDef p)
            {
                var (est, band, truth) = Evaluate(v, slot, p);
                return useTruth ? (truth, 0.0) : (est, band);
            }

            // Engine clusters
            double firstCluster = 1, firstClusterBand = 0;
            foreach (var first in new[] { true, false })
            {
                var engine = first ? v.FirstEngine : v.UpperEngine;
                if (engine == null || engine.Reliability == null) continue;
                var n = first ? v.FirstEngineCount : v.UpperEngineCount;
                var countOption = v.Part(first ? Slots.FirstStageEngineCount : Slots.UpperStageEngineCount);
                var eo = EngineOutCapable(v, first);
                var engineSlot = first ? Slots.FirstStageEngine : Slots.UpperStageEngine;
                var (r, b) = Unit(engineSlot, engine);
                var c = Clamp(Cluster(r, n, eo) + (countOption?.Stats.ReliabilityModifier ?? 0));
                var cb = Math.Abs(ClusterSlope(r, n, eo)) * b;
                if (first) { firstCluster = c; firstClusterBand = cb; }
                items.Add(new ReliabilityItem(first ? "first_stage_cluster" : "upper_stage_cluster", engineSlot, engine.Id,
                    PhaseOf(engineSlot), c, cb, n, eo));
            }

            // Strap-on boosters
            if (v.Boosters != null && v.BoosterCount > 0)
            {
                var k = v.BoosterCount;
                double r, b;
                if (v.BoostersMirrorFirstStage)
                {
                    r = Math.Pow(firstCluster, k);
                    b = k * Math.Pow(firstCluster, k - 1) * firstClusterBand;
                }
                else if (v.Boosters.Reliability != null)
                {
                    var (ru, bu) = Unit(Slots.StrapOnBoosters, v.Boosters);
                    r = Math.Pow(ru, k);
                    b = k * Math.Pow(ru, k - 1) * bu;
                }
                else { r = 1; b = 0; }
                r = Clamp(r + v.Boosters.Stats.ReliabilityModifier);
                if (r < 1 || b > 0)
                    items.Add(new ReliabilityItem("boosters", Slots.StrapOnBoosters, v.Boosters.Id, "ascent", r, b, k, false));
            }

            // Every other part with a reliability
            foreach (var kv in v.ChosenSlots())
            {
                var slot = kv.Key;
                var p = kv.Value;
                if (p.Reliability == null) continue;
                if (slot == Slots.FirstStageEngine || slot == Slots.UpperStageEngine ||
                    slot == Slots.StrapOnBoosters || slot == Slots.FirstStageEngineCount ||
                    slot == Slots.UpperStageEngineCount) continue;
                var (r, b) = Unit(slot, p);
                var n = IsPerUnit(p) ? p.Stats.Redundancy : 1;
                var rs = Redundant(r, n);
                var bs = n <= 1 ? b : n * Math.Pow(1 - r, n - 1) * b;
                items.Add(new ReliabilityItem(slot, slot, p.Id, PhaseOf(slot), rs, bs, n, false));
            }

            double success = 1, relVar = 0;
            foreach (var it in items)
            {
                success *= it.Reliability;
                if (it.Reliability > 0) relVar += Math.Pow(it.BandHalfWidth / it.Reliability, 2);
            }
            var band = success * Math.Sqrt(relVar);
            return new ReliabilityEstimate(success, band, items);
        }
    }
}
