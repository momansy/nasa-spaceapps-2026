#nullable enable
using System;

namespace MissionForge.Core.Scoring
{
    /// <summary>Minigame tier (design 10.3).</summary>
    public enum Tier
    {
        /// <summary>Below Bronze: no boost, only a cosmetic sparkle when somebody succeeded.</summary>
        None = 0,
        /// <summary>Bronze.</summary>
        Bronze = 1,
        /// <summary>Silver.</summary>
        Silver = 2,
        /// <summary>Gold.</summary>
        Gold = 3,
        /// <summary>Platinum: Gold with every active player perfect.</summary>
        Platinum = 4,
    }

    /// <summary>Outcome of a tier computation.</summary>
    public sealed class TierResult
    {
        /// <summary>Creates a result.</summary>
        public TierResult(Tier tier, double fractionUnitless, bool sparkle) { Tier = tier; FractionUnitless = fractionUnitless; Sparkle = sparkle; }
        /// <summary>The tier reached.</summary>
        public Tier Tier { get; }
        /// <summary>Completion fraction f = succeeded / active, unitless 0-1 (the performance score in solo play).</summary>
        public double FractionUnitless { get; }
        /// <summary>True when the tier is None but at least one player succeeded (cosmetic only).</summary>
        public bool Sparkle { get; }
    }

    /// <summary>Tier rules of design 10.3. Thresholds come from <c>data/boosts.json</c>.</summary>
    public static class Tiers
    {
        private const double Epsilon = 1e-9;

        /// <summary>
        /// Tier of a team minigame run. f = <paramref name="succeeded"/> / <paramref name="active"/>; the highest tier whose
        /// <c>min_fraction</c> f reaches wins; Platinum also needs every active player perfect. 0 active players is None.
        /// </summary>
        /// <param name="catalog">Scoring data.</param>
        /// <param name="active">Players who were connected and loaded, count.</param>
        /// <param name="succeeded">Active players who succeeded, count.</param>
        /// <param name="perfect">Active players who were perfect, count.</param>
        public static TierResult Compute(ScoringCatalog catalog, int active, int succeeded, int perfect)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (active <= 0) return new TierResult(Tier.None, 0.0, false);
            succeeded = Math.Max(0, Math.Min(succeeded, active));
            perfect = Math.Max(0, Math.Min(perfect, active));
            double f = (double)succeeded / active;
            var tier = Reach(catalog, f, perfect >= active);
            return new TierResult(tier, f, tier == Tier.None && succeeded >= catalog.CosmeticMinSuccesses);
        }

        /// <summary>Tier of a solo run: the performance score <paramref name="score01"/> plays the role of f (design 10.3).</summary>
        /// <param name="catalog">Scoring data.</param>
        /// <param name="score01">Performance score, unitless 0-1.</param>
        /// <param name="perfect">True for a perfect run.</param>
        public static TierResult ComputeSolo(ScoringCatalog catalog, double score01, bool perfect)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            double f = Math.Max(0.0, Math.Min(1.0, score01));
            var tier = Reach(catalog, f, perfect);
            return new TierResult(tier, f, tier == Tier.None && f > 0.0);
        }

        /// <summary>Boost tier a tier pays: Platinum pays Gold (design 10.4).</summary>
        public static Tier PaidTier(Tier tier) => tier == Tier.Platinum ? Tier.Gold : tier;

        /// <summary>Lower-case data id of a tier (<c>gold</c>), or null for None.</summary>
        public static string? Id(Tier tier) => tier == Tier.None ? null : tier.ToString().ToLowerInvariant();

        /// <summary>Parses a data id or protocol token (<c>gold</c>, <c>GOLD</c>, <c>NONE</c>).</summary>
        public static Tier Parse(string id)
        {
            switch (id.ToLowerInvariant())
            {
                case "bronze": return Tier.Bronze;
                case "silver": return Tier.Silver;
                case "gold": return Tier.Gold;
                case "platinum": return Tier.Platinum;
                case "none": return Tier.None;
                default: throw new ArgumentException("unknown tier '" + id + "'", nameof(id));
            }
        }

        private static Tier Reach(ScoringCatalog catalog, double f, bool allPerfect)
        {
            var best = Tier.None;
            foreach (var def in catalog.Tiers)
            {
                if (f + Epsilon < def.MinFractionUnitless) continue;
                if (def.RequiresAllPerfect && !allPerfect) continue;
                var t = Parse(def.Id);
                if (t > best) best = t;
            }
            return best;
        }
    }
}
