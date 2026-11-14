#nullable enable
using System;

namespace MissionForge.Core.Scoring
{
    /// <summary>
    /// The Team Sync meter (design 11.2). Immutable: every change returns a new meter. Gold +25, Silver +15, Bronze +8,
    /// Good Call +3 (game_value, from <c>data/scoring.json</c>). The meter clamps at 100; at 100 a Mission Control Moment is
    /// ready, and choosing one resets the meter to 0.
    /// <para>Decisions (game_value): Platinum counts as Gold (it is a Gold with every player perfect); choosing a moment
    /// resets the meter to 0 (the design does not say).</para>
    /// </summary>
    public sealed class TeamSync
    {
        private TeamSync(ScoringCatalog catalog, double valuePoints, double lastDeltaPoints, int momentsChosen, string? lastMomentId)
        {
            Catalog = catalog; ValuePoints = valuePoints; LastDeltaPoints = lastDeltaPoints; MomentsChosen = momentsChosen; LastMomentId = lastMomentId;
        }

        /// <summary>An empty meter (0 points).</summary>
        public static TeamSync Empty(ScoringCatalog catalog) =>
            new TeamSync(catalog ?? throw new ArgumentNullException(nameof(catalog)), 0.0, 0.0, 0, null);

        /// <summary>Scoring data the meter reads.</summary>
        public ScoringCatalog Catalog { get; }
        /// <summary>Meter value in points, 0 to the maximum (100).</summary>
        public double ValuePoints { get; }
        /// <summary>Points the last change actually added after the clamp (0 after a reset); the <c>delta</c> of <c>sync.meter</c>.</summary>
        public double LastDeltaPoints { get; }
        /// <summary>Number of moments chosen so far.</summary>
        public int MomentsChosen { get; }
        /// <summary>ID of the last moment chosen, or null.</summary>
        public string? LastMomentId { get; }
        /// <summary>True when the meter is full and a Mission Control Moment can be chosen.</summary>
        public bool MomentReady => ValuePoints >= Catalog.TeamSync.MeterMax;

        /// <summary>
        /// Adds the gain of a minigame tier: Gold 25, Silver 15, Bronze 8 points; Platinum counts as Gold; None adds 0.
        /// </summary>
        public TeamSync AddMinigame(Tier tier)
        {
            var pay = Tiers.BoostTier(Catalog, tier);
            var id = Tiers.IdOf(pay);
            if (id == null) return new TeamSync(Catalog, ValuePoints, 0.0, MomentsChosen, LastMomentId);
            return Add(Catalog.TeamSync.Gains[id]);
        }

        /// <summary>Adds the Good Call gain (+3 points).</summary>
        public TeamSync AddGoodCall() => Add(Catalog.TeamSync.Gains["good_call"]);

        private TeamSync Add(double gainPoints)
        {
            var max = Catalog.TeamSync.MeterMax;
            var next = Math.Min(max, ValuePoints + gainPoints);
            return new TeamSync(Catalog, next, next - ValuePoints, MomentsChosen, LastMomentId);
        }

        /// <summary>
        /// Chooses a Mission Control Moment (design 11.2) and resets the meter to 0.
        /// </summary>
        /// <param name="momentId">One of <c>perfect_phase</c>, <c>save_the_mission</c>, <c>golden_window</c>.</param>
        /// <exception cref="InvalidOperationException">The meter is not full.</exception>
        /// <exception cref="ArgumentException">Unknown moment ID.</exception>
        public TeamSync ChooseMoment(string momentId)
        {
            if (!TryChooseMoment(momentId, out var next, out _))
            {
                if (Catalog.TeamSync.Moment(momentId) == null) throw new ArgumentException("Unknown moment '" + momentId + "'.", nameof(momentId));
                throw new InvalidOperationException("Team Sync is at " + ValuePoints + " of " + Catalog.TeamSync.MeterMax + " points: no moment is ready.");
            }
            return next!;
        }

        /// <summary>
        /// Like <see cref="ChooseMoment"/> but returns false (and leaves <paramref name="next"/> null) when the meter is not full or
        /// the ID is unknown. <paramref name="moment"/> is the chosen moment on success.
        /// </summary>
        public bool TryChooseMoment(string momentId, out TeamSync? next, out SyncMomentDef? moment)
        {
            next = null;
            moment = Catalog.TeamSync.Moment(momentId);
            if (moment == null || !MomentReady)
            {
                moment = null;
                return false;
            }
            next = new TeamSync(Catalog, 0.0, 0.0, MomentsChosen + 1, moment.Id);
            return true;
        }
    }
}
