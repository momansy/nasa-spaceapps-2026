#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;

namespace MissionForge.Core.Scoring
{
    /// <summary>What produced a boost (protocol BoostSource).</summary>
    public enum BoostSource
    {
        /// <summary>A minigame tier.</summary>
        Minigame,
        /// <summary>A role ability.</summary>
        Ability,
        /// <summary>A Mission Control Moment.</summary>
        Moment,
        /// <summary>A lesson learned (design 9.9).</summary>
        Lesson,
        /// <summary>An anomaly card.</summary>
        Anomaly,
    }

    /// <summary>One boost grant; the shape of <c>mg.summary.boosts[]</c> (protocol BoostGrant).</summary>
    public sealed class BoostGrant
    {
        /// <summary>Creates a grant record.</summary>
        public BoostGrant(string boostId, Tier tier, double amount, double total, string unit, bool capped, BoostSource source,
            string? sourceId, bool applied)
        {
            BoostId = boostId; Tier = tier; Amount = amount; Total = total; Unit = unit; Capped = capped; Source = source;
            SourceId = sourceId; Applied = applied;
        }
        /// <summary>Boost id, lower case (<c>dv_bonus</c>); the protocol token is the upper-case form.</summary>
        public string BoostId { get; }
        /// <summary>Tier that produced it.</summary>
        public Tier Tier { get; }
        /// <summary>Amount this event actually added, in <see cref="Unit"/>. For <c>mul</c> boosts the increase of the factor.</summary>
        public double Amount { get; }
        /// <summary>Mission total for the boost after the grant and the cap, in <see cref="Unit"/> (a factor for <c>mul</c>).</summary>
        public double Total { get; }
        /// <summary><c>fraction</c>, <c>factor</c>, <c>$M</c>, <c>days</c>, <c>points</c> or <c>shield</c> (shield count).</summary>
        public string Unit { get; }
        /// <summary>True when the cap reduced the grant.</summary>
        public bool Capped { get; }
        /// <summary>What produced the boost.</summary>
        public BoostSource Source { get; }
        /// <summary>Id of the source (minigame id, role id, lesson id) or null.</summary>
        public string? SourceId { get; }
        /// <summary>False when the boost did not apply (crewed-only on an uncrewed contract, build-only outside the build phase, Bronze shield).</summary>
        public bool Applied { get; }
    }

    /// <summary>Result of <see cref="BoostLedger.Grant"/>: the next ledger and the grant record.</summary>
    public sealed class GrantResult
    {
        /// <summary>Creates a result.</summary>
        public GrantResult(BoostLedger ledger, BoostGrant grant) { Ledger = ledger; Grant = grant; }
        /// <summary>The ledger after the grant.</summary>
        public BoostLedger Ledger { get; }
        /// <summary>The grant record.</summary>
        public BoostGrant Grant { get; }
    }

    /// <summary>Result of <see cref="BoostLedger.ConsumeShield"/>.</summary>
    public sealed class ShieldUse
    {
        /// <summary>Creates a result.</summary>
        public ShieldUse(BoostLedger ledger, string? shield) { Ledger = ledger; Shield = shield; }
        /// <summary>The ledger after the shield was consumed (unchanged when none was held).</summary>
        public BoostLedger Ledger { get; }
        /// <summary><c>reroll_next_failure</c> or <c>negate_next_failure</c>; null when no shield was held.</summary>
        public string? Shield { get; }
    }

    /// <summary>
    /// Immutable boost ledger of one mission (design 10.4, 11.1). Same-type grants add up, then clamp at the cap.
    /// <b>Decision (game_value):</b> for <c>mul</c> boosts the excess over 1 adds, so x1.1 and x1.25 give x1.35 (data/README.md,
    /// open question 8). Platinum pays Gold. Shields: Silver adds a reroll, Gold a negate, at most the cap (2) held; the oldest is used first.
    /// </summary>
    public sealed class BoostLedger
    {
        private readonly ScoringCatalog _catalog;
        private readonly IReadOnlyDictionary<string, double> _totals;
        private readonly IReadOnlyList<string> _shields;

        private BoostLedger(ScoringCatalog catalog, bool crewed, IReadOnlyDictionary<string, double> totals, IReadOnlyList<string> shields)
        { _catalog = catalog; Crewed = crewed; _totals = totals; _shields = shields; }

        /// <summary>Creates an empty ledger for a mission.</summary>
        /// <param name="catalog">Scoring data.</param>
        /// <param name="crewed">True on a crewed contract (crew_morale applies only then).</param>
        public static BoostLedger Empty(ScoringCatalog catalog, bool crewed) =>
            new BoostLedger(catalog ?? throw new ArgumentNullException(nameof(catalog)), crewed, new Dictionary<string, double>(), Array.Empty<string>());

        /// <summary>True on a crewed contract.</summary>
        public bool Crewed { get; }

        /// <summary>Shields held, oldest first (<c>reroll_next_failure</c> / <c>negate_next_failure</c>).</summary>
        public IReadOnlyList<string> Shields => _shields;

        /// <summary>
        /// Mission total of an effect boost in its unit: sum for <c>add</c> and <c>add_fraction</c> (0 when none), factor for
        /// <c>mul</c> (1 when none).
        /// </summary>
        public double Total(string boostId)
        {
            if (_totals.TryGetValue(boostId, out var v)) return v;
            return _catalog.Boosts.TryGetValue(boostId, out var def) && def.Op == "mul" ? 1.0 : 0.0;
        }

        /// <summary>The score multiplier x1.0-x1.5 (boost <c>score_multiplier</c>), already capped.</summary>
        public double ScoreMultiplier => Total("score_multiplier");

        /// <summary>Grants a boost for a tier.</summary>
        /// <param name="boostId">Boost id (<c>dv_bonus</c>).</param>
        /// <param name="tier">Tier that produced it; Platinum pays Gold. <see cref="Tier.None"/> is rejected.</param>
        /// <param name="source">What produced it.</param>
        /// <param name="sourceId">Minigame, role or lesson id, or null.</param>
        /// <param name="buildPhase">True while the BUILD phase is active (build-only boosts apply only then).</param>
        public GrantResult Grant(string boostId, Tier tier, BoostSource source, string? sourceId, bool buildPhase = false)
        {
            if (!_catalog.Boosts.TryGetValue(boostId, out var def)) throw new ArgumentException("unknown boost '" + boostId + "'", nameof(boostId));
            if (tier == Tier.None) throw new ArgumentException("tier None pays no boost", nameof(tier));
            var paid = Tiers.PaidTier(tier);
            _catalog.Boosts[boostId].Tiers.TryGetValue(Tiers.Id(paid)!, out var value);
            string unit = UnitOf(def);

            if (value == null || (def.CrewedOnly && !Crewed) || (def.Phase == "build" && !buildPhase))
                return new GrantResult(this, new BoostGrant(boostId, tier, 0.0, Total(boostId), unit, false, source, sourceId, false));

            if (def.Kind == "shield")
            {
                int max = (int)(def.CapValue ?? 2);
                if (_shields.Count >= max)
                    return new GrantResult(this, new BoostGrant(boostId, tier, 0.0, _shields.Count, unit, true, source, sourceId, true));
                var next = new List<string>(_shields) { value.Shield ?? "reroll_next_failure" };
                return new GrantResult(new BoostLedger(_catalog, Crewed, _totals, next), new BoostGrant(boostId, tier, 1.0, next.Count, unit, false, source, sourceId, true));
            }

            double before = Total(boostId);
            double raw = def.Op == "mul" ? before + (value.Value - 1.0) : before + value.Value;
            double after = Clamp(def, raw);
            bool capped = Math.Abs(after - raw) > 1e-12;
            var totals = new Dictionary<string, double>(_totals) { [boostId] = after };
            return new GrantResult(new BoostLedger(_catalog, Crewed, totals, _shields),
                new BoostGrant(boostId, tier, after - before, after, unit, capped, source, sourceId, true));
        }

        /// <summary>Uses the oldest shield. When none is held the ledger is returned unchanged with a null shield.</summary>
        public ShieldUse ConsumeShield()
        {
            if (_shields.Count == 0) return new ShieldUse(this, null);
            var rest = _shields.Skip(1).ToList();
            return new ShieldUse(new BoostLedger(_catalog, Crewed, _totals, rest), _shields[0]);
        }

        private static double Clamp(BoostDef def, double v)
        {
            if (def.CapValue == null) return v;
            double cap = def.CapValue.Value;
            // A negative cap (precision, fuel saver, schedule recovery) is a floor; a positive cap is a ceiling.
            return cap < 0 ? Math.Max(v, cap) : Math.Min(v, cap);
        }

        private static string UnitOf(BoostDef def)
        {
            if (def.Kind == "shield") return "shield";
            if (def.Op == "mul") return "factor";
            if (def.Op == "add_fraction") return "fraction";
            switch (def.Target)
            {
                case "budget_M": return "$M";
                case "schedule_days": return "days";
                default: return "points";
            }
        }
    }
}
