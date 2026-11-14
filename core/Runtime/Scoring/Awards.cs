#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Random;

namespace MissionForge.Core.Scoring
{
    /// <summary>What the award rules read about one player.</summary>
    public sealed class PlayerStats
    {
        /// <summary>Creates the stats.</summary>
        public PlayerStats(string playerId, IReadOnlyList<string> roles, IReadOnlyDictionary<string, double> metrics)
        { PlayerId = playerId; Roles = roles; Metrics = metrics; }
        /// <summary>Player id (<c>p1</c>).</summary>
        public string PlayerId { get; }
        /// <summary>Roles the player holds (<c>PM</c>, <c>FLIGHT</c>...).</summary>
        public IReadOnlyList<string> Roles { get; }
        /// <summary>Values keyed by the <c>metric</c> names of <c>awards.json</c> (<c>good_calls</c>, <c>budget_saved_M</c>...).</summary>
        public IReadOnlyDictionary<string, double> Metrics { get; }

        /// <summary>Metric value, 0 when absent.</summary>
        public double Metric(string name) => Metrics.TryGetValue(name, out var v) ? v : 0.0;
    }

    /// <summary>Awards of one player.</summary>
    public sealed class PlayerAwards
    {
        /// <summary>Creates the record.</summary>
        public PlayerAwards(string playerId, IReadOnlyList<string> awardIds) { PlayerId = playerId; AwardIds = awardIds; }
        /// <summary>Player id.</summary>
        public string PlayerId { get; }
        /// <summary>Award ids, at least one.</summary>
        public IReadOnlyList<string> AwardIds { get; }
    }

    /// <summary>
    /// Individual awards of design 11.5. Awards are positive only, and every player gets at least one.
    /// <b>Decisions (game_value):</b> a <c>highest</c> award goes to the player with the greatest positive metric (a role-bound award only
    /// to holders of the role); ties resolve with <c>SeededRandom(seed).ForStream("tiebreak")</c>; a <c>condition</c> award goes to every
    /// player whose metric is positive; a player may hold at most 4 awards (protocol limit). A player left without an award receives a
    /// role-free <c>highest</c> award nobody has won yet where their own metric is highest (ties and an all-zero case resolve with the same stream; if
    /// every such award is taken they share one), so nobody is last.
    /// </summary>
    public static class AwardAssigner
    {
        /// <summary>Most awards one player may hold (<c>debrief.awards</c> maxItems).</summary>
        public const int MaxAwardsPerPlayer = 4;

        /// <summary>Assigns awards. Same stats and seed give the same result.</summary>
        public static IReadOnlyList<PlayerAwards> Assign(ScoringCatalog catalog, IReadOnlyList<PlayerStats> players, ulong seed)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (players == null) throw new ArgumentNullException(nameof(players));
            var rng = new SeededRandom(seed).ForStream("tiebreak");
            var won = players.ToDictionary(p => p.PlayerId, _ => new List<string>(), StringComparer.Ordinal);

            foreach (var award in catalog.Awards)
            {
                var eligible = players.Where(p => award.Role == null || p.Roles.Contains(award.Role)).ToList();
                if (eligible.Count == 0) continue;
                if (award.Selection == "condition")
                {
                    foreach (var p in eligible)
                        if (p.Metric(award.Metric) > 0.0 && won[p.PlayerId].Count < MaxAwardsPerPlayer) won[p.PlayerId].Add(award.Id);
                    continue;
                }
                var open = eligible.Where(p => won[p.PlayerId].Count < MaxAwardsPerPlayer).ToList();
                if (open.Count == 0) continue;
                double best = open.Max(p => p.Metric(award.Metric));
                if (best <= 0.0) continue;
                var tied = open.Where(p => Math.Abs(p.Metric(award.Metric) - best) < 1e-9).ToList();
                var winner = tied.Count == 1 ? tied[0] : tied[rng.NextInt(0, tied.Count)];
                won[winner.PlayerId].Add(award.Id);
            }

            // Everybody gets at least one. A player with none receives a role-free "highest" award, preferring awards nobody has won yet.
            var claimed = new HashSet<string>(won.Values.SelectMany(v => v), StringComparer.Ordinal);
            var roleFree = catalog.Awards.Where(a => a.Role == null && a.Selection == "highest").ToList();
            foreach (var p in players)
            {
                if (won[p.PlayerId].Count >= catalog.MinAwardsPerPlayer || roleFree.Count == 0) continue;
                var pool = roleFree.Where(a => !claimed.Contains(a.Id)).ToList();
                if (pool.Count == 0) pool = roleFree;
                double top = pool.Max(a => p.Metric(a.Metric));
                var best = pool.Where(a => Math.Abs(p.Metric(a.Metric) - top) < 1e-9).ToList();
                var pick = best[best.Count == 1 ? 0 : rng.NextInt(0, best.Count)].Id;
                won[p.PlayerId].Add(pick);
                claimed.Add(pick);
            }

            return players.Select(p => new PlayerAwards(p.PlayerId, won[p.PlayerId])).ToList();
        }
    }
}
