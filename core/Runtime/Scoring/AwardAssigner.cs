#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Random;

namespace MissionForge.Core.Scoring
{
    /// <summary>The awards one player receives at debrief (design 11.5).</summary>
    public sealed class PlayerAwards
    {
        /// <summary>Creates the record.</summary>
        public PlayerAwards(string playerId, IReadOnlyList<string> awardIds) { PlayerId = playerId; AwardIds = awardIds; }
        /// <summary>Player ID.</summary>
        public string PlayerId { get; }
        /// <summary>Award IDs in the list order of <c>awards.json</c>; never empty when there is at least one award in the data.</summary>
        public IReadOnlyList<string> AwardIds { get; }
    }

    /// <summary>The awards of a whole team, in the order the players were passed in.</summary>
    public sealed class AwardResult
    {
        /// <summary>Creates the result.</summary>
        public AwardResult(IReadOnlyList<PlayerAwards> players) { Players = players; }
        /// <summary>One entry per player, in input order.</summary>
        public IReadOnlyList<PlayerAwards> Players { get; }
        /// <summary>Awards of a player, or null for an unknown ID.</summary>
        public PlayerAwards? For(string playerId)
        {
            foreach (var p in Players) if (p.PlayerId == playerId) return p;
            return null;
        }
    }

    /// <summary>
    /// Individual recognition at debrief (design 11.5): every player receives at least one award, awards are positive only
    /// (no last place, no shaming), and the result is deterministic from the seed.
    /// <para>
    /// Rules (Decisions, game_value):
    /// 1. Awards are visited in the list order of <c>awards.json</c>. A <c>highest</c> award goes to the eligible player with the
    ///    largest metric value above 0; a <c>condition</c> award goes to every eligible player whose metric is non-zero. A player
    ///    is eligible when the award's <c>role</c>, if any, is among their roles.
    /// 2. Ties for a <c>highest</c> award go to the tied player holding the fewest awards so far; remaining ties are broken by one
    ///    draw from <c>SeededRandom(seed).ForStream("tiebreak")</c> over the tied players sorted by player ID (so the input order
    ///    does not matter).
    /// 3. A player below the minimum of awards (1, from the data; a team of 10 has more players than the 8 awards) shares the award they have the
    ///    largest positive claim to; with no positive claim they share one of the role-free <c>highest</c> awards with the fewest
    ///    recipients, picked with the same stream. The recognition is for effort on the team, not a ranking.
    /// </para>
    /// </summary>
    public static class AwardAssigner
    {
        private const double TieEpsilon = 1e-9;

        /// <summary>Assigns the awards. <paramref name="players"/> may be empty; IDs must be unique.</summary>
        /// <exception cref="ArgumentException">Duplicate player ID.</exception>
        public static AwardResult Assign(ScoringCatalog catalog, IReadOnlyList<PlayerStats> players, ulong seed)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (players == null) throw new ArgumentNullException(nameof(players));
            var sorted = new List<PlayerStats>(players);
            sorted.Sort((a, b) => string.CompareOrdinal(a.PlayerId, b.PlayerId));
            for (var i = 1; i < sorted.Count; i++)
                if (sorted[i].PlayerId == sorted[i - 1].PlayerId) throw new ArgumentException("Duplicate player ID '" + sorted[i].PlayerId + "'.", nameof(players));

            var rng = new SeededRandom(seed).ForStream("tiebreak");
            var held = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            foreach (var p in sorted) held[p.PlayerId] = new HashSet<string>(StringComparer.Ordinal);
            var recipients = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var a in catalog.Awards) recipients[a.Id] = 0;

            void Give(PlayerStats p, AwardDef a)
            {
                if (held[p.PlayerId].Add(a.Id)) recipients[a.Id]++;
            }

            // ---- pass 1: the award list in order
            foreach (var award in catalog.Awards)
            {
                var eligible = new List<PlayerStats>();
                foreach (var p in sorted) if (Eligible(award, p) && p.Metric(award.Metric) > 0.0) eligible.Add(p);
                if (eligible.Count == 0) continue;
                if (award.Selection == "condition")
                {
                    foreach (var p in eligible) Give(p, award);
                    continue;
                }
                var best = double.MinValue;
                foreach (var p in eligible) best = Math.Max(best, p.Metric(award.Metric));
                var tied = new List<PlayerStats>();
                foreach (var p in eligible) if (p.Metric(award.Metric) >= best - TieEpsilon) tied.Add(p);
                Give(Pick(tied, p => held[p.PlayerId].Count, rng), award);
            }

            // ---- pass 2: players below the minimum (1) share awards
            foreach (var p in sorted)
            {
                while (held[p.PlayerId].Count < catalog.MinAwardsPerPlayer && held[p.PlayerId].Count < catalog.Awards.Count)
                {
                    var claims = new List<AwardDef>();
                    var bestClaim = 0.0;
                    foreach (var a in catalog.Awards)
                    {
                        if (held[p.PlayerId].Contains(a.Id) || !Eligible(a, p)) continue;
                        var v = p.Metric(a.Metric);
                        if (v <= 0.0) continue;
                        if (v > bestClaim + TieEpsilon) { bestClaim = v; claims.Clear(); }
                        if (v >= bestClaim - TieEpsilon) claims.Add(a);
                    }
                    if (claims.Count == 0)
                        foreach (var a in catalog.Awards) if (!held[p.PlayerId].Contains(a.Id) && a.Role == null && a.Selection == "highest") claims.Add(a);
                    if (claims.Count == 0)
                        foreach (var a in catalog.Awards) if (!held[p.PlayerId].Contains(a.Id) && a.Role == null) claims.Add(a);
                    if (claims.Count == 0)
                        foreach (var a in catalog.Awards) if (!held[p.PlayerId].Contains(a.Id)) claims.Add(a);
                    Give(p, PickAward(claims, a => recipients[a.Id], rng));
                }
            }

            var result = new List<PlayerAwards>(players.Count);
            foreach (var p in players)
            {
                var ids = new List<string>();
                foreach (var a in catalog.Awards) if (held[p.PlayerId].Contains(a.Id)) ids.Add(a.Id);
                result.Add(new PlayerAwards(p.PlayerId, ids));
            }
            return new AwardResult(result);
        }

        private static bool Eligible(AwardDef award, PlayerStats p) => award.Role == null || p.HasRole(award.Role);

        private static PlayerStats Pick(List<PlayerStats> tied, Func<PlayerStats, int> load, SeededRandom rng)
        {
            var min = int.MaxValue;
            foreach (var p in tied) min = Math.Min(min, load(p));
            var pool = new List<PlayerStats>();
            foreach (var p in tied) if (load(p) == min) pool.Add(p);
            return pool.Count == 1 ? pool[0] : pool[rng.NextInt(0, pool.Count)];
        }

        private static AwardDef PickAward(List<AwardDef> options, Func<AwardDef, int> load, SeededRandom rng)
        {
            var min = int.MaxValue;
            foreach (var a in options) min = Math.Min(min, load(a));
            var pool = new List<AwardDef>();
            foreach (var a in options) if (load(a) == min) pool.Add(a);
            return pool.Count == 1 ? pool[0] : pool[rng.NextInt(0, pool.Count)];
        }
    }
}
