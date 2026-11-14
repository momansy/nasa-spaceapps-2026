#nullable enable
using System;

namespace MissionForge.Core.Scoring
{
    /// <summary>Result of choosing a Mission Control Moment.</summary>
    public sealed class MomentChoice
    {
        /// <summary>Creates a result.</summary>
        public MomentChoice(TeamSync sync, string momentId, string flag) { Sync = sync; MomentId = momentId; Flag = flag; }
        /// <summary>The meter after the choice (reset to 0).</summary>
        public TeamSync Sync { get; }
        /// <summary>The chosen moment.</summary>
        public string MomentId { get; }
        /// <summary>Flag the host raises (<c>auto_perfect_next_flight_phase</c>...).</summary>
        public string Flag { get; }
    }

    /// <summary>
    /// Immutable Team Sync meter (design 11.2). Gold +25, Silver +15, Bronze +8, Good Call +3 (from data); the meter clamps at 100 and
    /// <see cref="MomentReady"/> turns true. <b>Decision (game_value):</b> Platinum counts as Gold; choosing a moment resets the meter to 0.
    /// </summary>
    public sealed class TeamSync
    {
        private readonly ScoringCatalog _catalog;

        private TeamSync(ScoringCatalog catalog, double meter) { _catalog = catalog; MeterPoints = meter; }

        /// <summary>An empty meter.</summary>
        public static TeamSync New(ScoringCatalog catalog) => new TeamSync(catalog ?? throw new ArgumentNullException(nameof(catalog)), 0.0);

        /// <summary>Meter value, points 0-100.</summary>
        public double MeterPoints { get; }

        /// <summary>True when the meter is full and a moment may be chosen.</summary>
        public bool MomentReady => MeterPoints >= _catalog.SyncMeterMax - 1e-9;

        /// <summary>Adds the gain of a minigame tier (None adds nothing; Platinum counts as Gold).</summary>
        public TeamSync AddTier(Tier tier)
        {
            var paid = Tiers.PaidTier(tier);
            return paid == Tier.None ? this : Add(_catalog.SyncGain(Tiers.Id(paid)!));
        }

        /// <summary>Adds the gain of a Good Call (+3).</summary>
        public TeamSync AddGoodCall() => Add(_catalog.SyncGain("good_call"));

        private TeamSync Add(double gainPoints) =>
            new TeamSync(_catalog, Math.Min(_catalog.SyncMeterMax, MeterPoints + gainPoints));

        /// <summary>Chooses one of the moments and resets the meter to 0.</summary>
        /// <exception cref="InvalidOperationException">The meter is not full.</exception>
        /// <exception cref="ArgumentException">The id is not one of the moments of the data.</exception>
        public MomentChoice ChooseMoment(string momentId)
        {
            foreach (var m in _catalog.SyncMoments)
            {
                if (m.Id != momentId) continue;
                if (!MomentReady) throw new InvalidOperationException("Team Sync meter is not full");
                return new MomentChoice(new TeamSync(_catalog, 0.0), m.Id, m.Flag);
            }
            throw new ArgumentException("unknown Mission Control Moment '" + momentId + "'", nameof(momentId));
        }
    }
}
