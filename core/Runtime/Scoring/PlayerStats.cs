#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Scoring
{
    /// <summary>
    /// What the host knows about one player at debrief (design 11.5): the player ID, the roles held and the metric
    /// values keyed by the <c>metric</c> names of <c>data/awards.json</c> (<c>good_calls</c>, <c>budget_saved_M</c>,
    /// <c>predictions_correct</c>, <c>pilot_precision</c>, <c>minigame_successes</c>, <c>minigame_score</c>,
    /// <c>vetoed_option_would_have_failed</c>, <c>gold_during_blackout_or_abort</c>). Booleans are 1/0. A missing
    /// metric counts as 0.
    /// </summary>
    public sealed class PlayerStats
    {
        /// <summary>Creates the stats of one player.</summary>
        public PlayerStats(string playerId, IReadOnlyList<string> roles, IReadOnlyDictionary<string, double> metrics)
        {
            PlayerId = playerId ?? throw new ArgumentNullException(nameof(playerId));
            Roles = roles ?? throw new ArgumentNullException(nameof(roles));
            Metrics = metrics ?? throw new ArgumentNullException(nameof(metrics));
        }

        /// <summary>Player ID (<c>p1</c>…).</summary>
        public string PlayerId { get; }
        /// <summary>Role IDs held (<c>PM</c>, <c>FLIGHT</c>…); may be empty.</summary>
        public IReadOnlyList<string> Roles { get; }
        /// <summary>Metric values; units depend on the metric (counts, M, 0–1 precision, 1/0 flags).</summary>
        public IReadOnlyDictionary<string, double> Metrics { get; }

        /// <summary>Metric value, 0 when absent.</summary>
        public double Metric(string name) => Metrics.TryGetValue(name, out var v) ? v : 0.0;

        /// <summary>True when the player holds the role.</summary>
        public bool HasRole(string role)
        {
            foreach (var r in Roles) if (string.Equals(r, role, StringComparison.Ordinal)) return true;
            return false;
        }
    }
}
