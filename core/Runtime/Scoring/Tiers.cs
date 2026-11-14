#nullable enable
using System;

namespace MissionForge.Core.Scoring
{
    /// <summary>Completion tier of a minigame run (design 10.3). <c>None</c> is below Bronze.</summary>
    public enum Tier { None, Bronze, Silver, Gold, Platinum }

    /// <summary>
    /// Outcome of the tier calculation: tier, completion fraction f (0–1, unitless) and the cosmetic sparkle shown
    /// when the tier is <see cref="Tier.None"/> but someone succeeded.
    /// </summary>
    public sealed class TierResult
    {
        /// <summary>Creates a result.</summary>
        public TierResult(Tier tier, double fractionUnitless, bool sparkle)
        {
            Tier = tier; FractionUnitless = fractionUnitless; Sparkle = sparkle;
        }
        /// <summary>Tier reached.</summary>
        public Tier Tier { get; }
        /// <summary>Completion fraction f = succeeded / active (0–1, unitless); in solo play the performance score s.</summary>
        public double FractionUnitless { get; }
        /// <summary>True when <see cref="Tier"/> is None and at least one player succeeded: cosmetic only, no stat boost (design 10.3).</summary>
        public bool Sparkle { get; }
        /// <summary>ID used in data and protocol of the tier: <c>bronze</c>…<c>platinum</c>; null for None.</summary>
        public string? TierId => Tiers.IdOf(Tier);
    }

    /// <summary>
    /// Completion tiers (design 10.3, 17.10). Pure and deterministic. The thresholds are game_value and come from
    /// <c>data/boosts.json</c> through the <see cref="ScoringCatalog"/> (0.33 Bronze, 0.66 Silver, 1.00 Gold).
    /// </summary>
    public static class Tiers
    {
        // The thresholds are decimal fractions such as 0.33; the quotient succeeded / active is rounded to a double.
        private const double Epsilon = 1e-9;

        /// <summary>
        /// Tier of a group run: f = succeeded / active. None below Bronze; Gold when everyone succeeded; Platinum when,
        /// in addition, every active player was perfect. Disconnected players are not counted in <paramref name="active"/>.
        /// Interface change: takes the catalog because the thresholds come from data.
        /// </summary>
        /// <param name="catalog">Scoring data (tier thresholds).</param>
        /// <param name="active">Players connected and loaded (0–10). 0 gives None with f = 0.</param>
        /// <param name="succeeded">Active players who succeeded; clamped to 0…active.</param>
        /// <param name="perfect">Active players who were perfect; clamped to 0…succeeded.</param>
        public static TierResult Compute(ScoringCatalog catalog, int active, int succeeded, int perfect)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (active <= 0) return new TierResult(Tier.None, 0.0, false);
            if (succeeded < 0) succeeded = 0;
            if (succeeded > active) succeeded = active;
            if (perfect < 0) perfect = 0;
            if (perfect > succeeded) perfect = succeeded;
            var f = (double)succeeded / active;
            var allPerfect = perfect == active;
            return Resolve(catalog, f, allPerfect, succeeded >= catalog.CosmeticMinSuccesses);
        }

        /// <summary>
        /// Tier of a solo run (design 10.3): the performance score s (0–1, unitless) uses the same thresholds as f.
        /// Platinum needs s = 1 and <paramref name="perfect"/>. Decision: the sparkle shows when the tier is None and s &gt; 0
        /// (the design says "≥ 1 success"; a solo score above 0 is read as one).
        /// </summary>
        /// <param name="catalog">Scoring data.</param>
        /// <param name="score01">Performance score s; clamped to 0…1.</param>
        /// <param name="perfect">Whether the run was perfect.</param>
        public static TierResult ComputeSolo(ScoringCatalog catalog, double score01, bool perfect)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            var s = double.IsNaN(score01) ? 0.0 : Math.Max(0.0, Math.Min(1.0, score01));
            return Resolve(catalog, s, perfect, s > 0.0);
        }

        private static TierResult Resolve(ScoringCatalog catalog, double f, bool allPerfect, bool someSuccess)
        {
            var tier = Tier.None;
            foreach (var def in catalog.Tiers)
            {
                if (f + Epsilon < def.MinFractionUnitless) continue;
                if (def.RequiresAllPerfect && !allPerfect) continue;
                var t = FromId(def.Id);
                if (t > tier) tier = t;
            }
            return new TierResult(tier, f, tier == Tier.None && someSuccess);
        }

        /// <summary>Data ID of a tier (<c>bronze</c>…<c>platinum</c>), or null for None.</summary>
        public static string? IdOf(Tier tier) => tier switch
        {
            Tier.Bronze => "bronze",
            Tier.Silver => "silver",
            Tier.Gold => "gold",
            Tier.Platinum => "platinum",
            _ => null,
        };

        /// <summary>Tier of a data ID; throws for an unknown ID.</summary>
        public static Tier FromId(string id) => id switch
        {
            "bronze" => Tier.Bronze,
            "silver" => Tier.Silver,
            "gold" => Tier.Gold,
            "platinum" => Tier.Platinum,
            _ => throw new ArgumentException("Unknown tier ID '" + id + "'.", nameof(id)),
        };

        /// <summary>
        /// Boost tier that pays for a tier (<c>boosts.json</c> <c>boost_tier</c>): Platinum pays Gold (design 10.3).
        /// Returns <see cref="Tier.None"/> for None.
        /// </summary>
        public static Tier BoostTier(ScoringCatalog catalog, Tier tier)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            var id = IdOf(tier);
            if (id == null) return Tier.None;
            var def = catalog.Tier(id);
            return def == null ? tier : FromId(def.BoostTier);
        }
    }
}
