#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Flight.Mission;

namespace MissionForge.Core.Scoring
{
    /// <summary>What produced a boost (<c>BoostSource</c> of <c>protocol/messages.md</c>).</summary>
    public enum BoostSource { Minigame, Ability, Moment, Lesson, Anomaly }

    /// <summary>Unit of a <see cref="BoostGrant"/> amount (<c>BoostUnit</c> of the protocol).</summary>
    public enum BoostUnit
    {
        /// <summary>Percent, signed: +3 for Δv Bonus gold, −25 for Precision bronze.</summary>
        Pct,
        /// <summary>Multiplier (unitless), e.g. 1.25.</summary>
        Mult,
        /// <summary>Million dollars (game value).</summary>
        MUsd,
        /// <summary>Days (negative = recovered).</summary>
        Days,
        /// <summary>Points (Crew Morale).</summary>
        Points,
        /// <summary>Number of Reliability Shields.</summary>
        Shields,
    }

    /// <summary>Phase in which boosts are earned: <c>schedule_recovery</c> applies in the build phase only.</summary>
    public enum BoostPhase { Build, Flight }

    /// <summary>
    /// One boost applied, the shape of <c>mg.summary.boosts[]</c> and <c>boost.applied.grant</c> (protocol, design 10.4).
    /// <see cref="Amount"/> and <see cref="Total"/> are in <see cref="Unit"/>. For <see cref="BoostUnit.Mult"/> the amount is the
    /// excess over 1 that was added (×1.1 adds 0.1), so <c>Total = previous Total + Amount</c> (Decision, data/README open question 8).
    /// </summary>
    public sealed class BoostGrant
    {
        /// <summary>Creates a grant.</summary>
        public BoostGrant(string boostId, Tier tier, double amount, double total, BoostUnit unit, bool capped, BoostSource source, string? sourceId)
        {
            BoostId = boostId; Tier = tier; Amount = amount; Total = total; Unit = unit; Capped = capped; Source = source; SourceId = sourceId;
        }
        /// <summary>Boost ID in data form (<c>load_margin</c>); the protocol token is the upper-case form (<c>LOAD_MARGIN</c>).</summary>
        public string BoostId { get; }
        /// <summary>Boost tier that produced it (Platinum pays Gold, so this is never Platinum).</summary>
        public Tier Tier { get; }
        /// <summary>Amount added by this grant after the cap, in <see cref="Unit"/>.</summary>
        public double Amount { get; }
        /// <summary>Mission total after the grant and the cap, in <see cref="Unit"/> (shields: number held; multipliers: the multiplier).</summary>
        public double Total { get; }
        /// <summary>Unit of <see cref="Amount"/> and <see cref="Total"/>.</summary>
        public BoostUnit Unit { get; }
        /// <summary>True when the cap reduced the grant (or, for shields, the grant was refused because 2 are held).</summary>
        public bool Capped { get; }
        /// <summary>What produced the boost.</summary>
        public BoostSource Source { get; }
        /// <summary>ID of the source (minigame ID, role ID, lesson ID), or null.</summary>
        public string? SourceId { get; }
    }

    /// <summary>
    /// The boosts earned so far in a mission (design 10.4, 11.1). Immutable: <see cref="Grant"/> and
    /// <see cref="ConsumeShield"/> return the next ledger. Pure and deterministic.
    /// <list type="bullet">
    /// <item>Same-type grants stack additively, then clamp at the cap (design 11.1).</item>
    /// <item>Multiplier boosts add their excess over 1 (×1.1 with ×1.25 gives ×1.35). Decision, game_value.</item>
    /// <item>Platinum pays Gold (design 10.3).</item>
    /// <item>Shields: Silver adds a reroll, Gold a negate, at most 2 held, consumed oldest first. Bronze pays none.</item>
    /// <item><c>crew_morale</c> applies on crewed contracts only; <c>schedule_recovery</c> in the build phase only.</item>
    /// </list>
    /// </summary>
    public sealed class BoostLedger
    {
        private const double Rounding = 1e-9;

        private static readonly IReadOnlyDictionary<string, double> NoTotals = new Dictionary<string, double>(StringComparer.Ordinal);
        private static readonly IReadOnlyList<ShieldKind> NoShields = Array.Empty<ShieldKind>();
        private static readonly IReadOnlyList<BoostGrant> NoGrants = Array.Empty<BoostGrant>();

        // Stored totals are in data units: a fraction for add_fraction, the unit of the target for add, and the excess
        // over 1 for mul boosts.
        private readonly IReadOnlyDictionary<string, double> stored;

        private BoostLedger(ScoringCatalog catalog, bool crewed, BoostPhase phase, IReadOnlyDictionary<string, double> stored,
            IReadOnlyList<ShieldKind> shields, IReadOnlyList<BoostGrant> grants)
        {
            Catalog = catalog; Crewed = crewed; Phase = phase; this.stored = stored; Shields = shields; Grants = grants;
        }

        /// <summary>An empty ledger for a contract (<paramref name="crewed"/>) in a phase.</summary>
        public static BoostLedger Empty(ScoringCatalog catalog, bool crewed, BoostPhase phase = BoostPhase.Flight) =>
            new BoostLedger(catalog ?? throw new ArgumentNullException(nameof(catalog)), crewed, phase, NoTotals, NoShields, NoGrants);

        /// <summary>Scoring data the ledger reads.</summary>
        public ScoringCatalog Catalog { get; }
        /// <summary>True on a crewed contract (Crew Morale can apply).</summary>
        public bool Crewed { get; }
        /// <summary>Current phase (Schedule Recovery applies in <see cref="BoostPhase.Build"/> only).</summary>
        public BoostPhase Phase { get; }
        /// <summary>Shields held, oldest first (at most 2).</summary>
        public IReadOnlyList<ShieldKind> Shields { get; }
        /// <summary>Every grant that changed or tried to change the ledger, in order.</summary>
        public IReadOnlyList<BoostGrant> Grants { get; }
        /// <summary>Number of shields held.</summary>
        public int ShieldsHeld => Shields.Count;

        /// <summary>Same ledger in another phase.</summary>
        public BoostLedger WithPhase(BoostPhase phase) => new BoostLedger(Catalog, Crewed, phase, stored, Shields, Grants);

        /// <summary>
        /// Mission total of a boost in the units of its data: a fraction for <c>add_fraction</c> boosts (0.03 = +3 %), the unit of
        /// the target for <c>add</c> boosts (M, days, morale points), the multiplier (1 when none earned) for <c>mul</c> boosts, and
        /// the number of shields held for the shield.
        /// </summary>
        public double Total(string boostId)
        {
            var rule = Catalog.Boost(boostId) ?? throw new ArgumentException("Unknown boost '" + boostId + "'.", nameof(boostId));
            if (rule.Kind == BoostKind.Shield) return Shields.Count;
            var v = stored.TryGetValue(boostId, out var s) ? s : 0.0;
            return rule.Op == BoostOp.Mul ? 1.0 + v : v;
        }

        /// <summary>
        /// Applies a boost of <paramref name="tier"/> and returns the next ledger. <paramref name="grant"/> describes what
        /// was added; it is null when nothing applies (tier None, Bronze shield, crewed-only boost on an uncrewed contract,
        /// build-only boost in flight), and the same ledger is returned.
        /// </summary>
        /// <param name="boostId">Boost ID in data form (<c>dv_bonus</c>).</param>
        /// <param name="tier">Tier that pays; Platinum pays Gold.</param>
        /// <param name="source">What produced the boost.</param>
        /// <param name="sourceId">Minigame, role or lesson ID, or null.</param>
        /// <param name="grant">The grant for <c>mg.summary.boosts[]</c> or <c>boost.applied</c>.</param>
        public BoostLedger Grant(string boostId, Tier tier, BoostSource source, string? sourceId, out BoostGrant? grant)
        {
            var rule = Catalog.Boost(boostId) ?? throw new ArgumentException("Unknown boost '" + boostId + "'.", nameof(boostId));
            grant = null;
            var payTier = Tiers.BoostTier(Catalog, tier);
            if (payTier == Tier.None) return this;
            if (rule.CrewedOnly && !Crewed) return this;
            if (rule.Phase == "build" && Phase != BoostPhase.Build) return this;
            var tierId = Tiers.IdOf(payTier)!;

            if (rule.Kind == BoostKind.Shield)
            {
                if (!rule.ShieldByTier.TryGetValue(tierId, out var shieldName)) return this;
                var kind = shieldName == "negate_next_failure" ? ShieldKind.Negate : ShieldKind.Reroll;
                var limit = (int)(rule.CapValue ?? 2);
                if (Shields.Count >= limit)
                {
                    grant = new BoostGrant(boostId, payTier, 0, Shields.Count, BoostUnit.Shields, true, source, sourceId);
                    return WithGrant(this, grant);
                }
                var held = new List<ShieldKind>(Shields) { kind };
                grant = new BoostGrant(boostId, payTier, 1, held.Count, BoostUnit.Shields, false, source, sourceId);
                return new BoostLedger(Catalog, Crewed, Phase, stored, held, Append(Grants, grant));
            }

            if (!rule.ValueByTier.TryGetValue(tierId, out var value)) return this;
            var old = stored.TryGetValue(boostId, out var s) ? s : 0.0;
            var delta = rule.Op == BoostOp.Mul ? value - 1.0 : value;
            var next = old + delta;
            var capped = false;
            if (rule.CapValue is double cap)
            {
                var limit = rule.Op == BoostOp.Mul ? cap - 1.0 : cap;
                if (limit < 0 ? next < limit - Rounding : next > limit + Rounding)
                {
                    next = limit;
                    capped = true;
                }
            }
            next = Round(next);
            var amount = Round(next - old);
            var totals = new Dictionary<string, double>(stored, StringComparer.Ordinal) { [boostId] = next };
            var unit = UnitOf(rule);
            grant = new BoostGrant(boostId, payTier, ToUnit(rule, amount, false), ToUnit(rule, next, true), unit, capped, source, sourceId);
            return new BoostLedger(Catalog, Crewed, Phase, totals, Shields, Append(Grants, grant));
        }

        /// <summary>
        /// Removes the oldest shield and returns the next ledger; <paramref name="shield"/> is its kind, or null when none is held.
        /// </summary>
        public BoostLedger ConsumeShield(out ShieldKind? shield)
        {
            if (Shields.Count == 0)
            {
                shield = null;
                return this;
            }
            shield = Shields[0];
            var rest = new List<ShieldKind>(Shields);
            rest.RemoveAt(0);
            return new BoostLedger(Catalog, Crewed, Phase, stored, rest, Grants);
        }

        /// <summary>Unit of a boost in protocol terms: percent for add_fraction, multiplier for mul, else by target.</summary>
        public static BoostUnit UnitOf(BoostRule rule)
        {
            if (rule.Kind == BoostKind.Shield) return BoostUnit.Shields;
            if (rule.Op == BoostOp.AddFraction) return BoostUnit.Pct;
            if (rule.Op == BoostOp.Mul) return BoostUnit.Mult;
            switch (rule.Target)
            {
                case "budget_M": return BoostUnit.MUsd;
                case "schedule_days": return BoostUnit.Days;
                default: return BoostUnit.Points;
            }
        }

        private static double ToUnit(BoostRule rule, double dataValue, bool isTotal)
        {
            if (rule.Op == BoostOp.AddFraction) return Round(dataValue * 100.0);
            if (rule.Op == BoostOp.Mul) return isTotal ? Round(1.0 + dataValue) : dataValue;
            return dataValue;
        }

        private static double Round(double v) => Math.Round(v, 9);

        private static BoostLedger WithGrant(BoostLedger l, BoostGrant g) =>
            new BoostLedger(l.Catalog, l.Crewed, l.Phase, l.stored, l.Shields, Append(l.Grants, g));

        private static IReadOnlyList<BoostGrant> Append(IReadOnlyList<BoostGrant> list, BoostGrant g)
        {
            var next = new List<BoostGrant>(list.Count + 1);
            next.AddRange(list);
            next.Add(g);
            return next;
        }
    }
}
