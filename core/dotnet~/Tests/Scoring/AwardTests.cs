using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    /// <summary>Design 11.5: every player gets at least one award, positive only, deterministic ties.</summary>
    public class AwardTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog();

        private static PlayerStats P(string id, string[]? roles = null, params (string k, double v)[] m)
        {
            var d = new Dictionary<string, double>();
            foreach (var (k, v) in m) d[k] = v;
            return new PlayerStats(id, roles ?? new string[0], d);
        }

        private static string Signature(AwardResult r) =>
            string.Join("|", r.Players.Select(p => p.PlayerId + ":" + string.Join(",", p.AwardIds)));

        [Fact]
        public void AppendixA_FourPlayers_GetTheirNamedAwards()
        {
            // P1 PM saved 6 M -> Budget Hawk; P2 3 Good Calls -> Best Callout; P3 best precision -> Steady Hands;
            // P4 most predictions -> Fact Finder. Team Player goes to the most minigame successes (P2, 8).
            var players = new[]
            {
                P("p1", new[] { "FLIGHT", "PM" }, ("budget_saved_M", 6), ("good_calls", 1), ("minigame_successes", 7), ("predictions_correct", 1)),
                P("p2", new[] { "BOOSTER", "STRUCT" }, ("good_calls", 3), ("minigame_successes", 8), ("predictions_correct", 1)),
                P("p3", new[] { "GUIDO", "FIDO" }, ("pilot_precision", 0.9), ("minigame_successes", 6)),
                P("p4", new[] { "EECOM" }, ("predictions_correct", 2), ("minigame_successes", 5)),
            };
            var r = AwardAssigner.Assign(C, players, 7);
            Assert.Contains("budget_hawk", r.For("p1")!.AwardIds);
            Assert.Contains("best_callout", r.For("p2")!.AwardIds);
            Assert.Contains("steady_hands", r.For("p3")!.AwardIds);
            Assert.Contains("fact_finder", r.For("p4")!.AwardIds);
            Assert.Contains("team_player", r.For("p2")!.AwardIds);
            foreach (var p in r.Players) Assert.NotEmpty(p.AwardIds);
        }

        [Fact]
        public void OnePlayer_GetsEveryAwardTheyQualifyFor_AtLeastOne()
        {
            var r = AwardAssigner.Assign(C, new[] { P("solo", new[] { "PM" }, ("budget_saved_M", 2), ("good_calls", 1)) }, 1);
            Assert.Equal(new[] { "best_callout", "budget_hawk" }, r.For("solo")!.AwardIds);
        }

        [Fact]
        public void OnePlayerWithNothing_StillGetsOneRoleFreeAward()
        {
            var r = AwardAssigner.Assign(C, new[] { P("solo") }, 1);
            var ids = r.For("solo")!.AwardIds;
            Assert.Single(ids);
            var award = C.Awards.First(a => a.Id == ids[0]);
            Assert.Null(award.Role);
            Assert.Equal("highest", award.Selection);
        }

        [Fact]
        public void TenPlayers_EveryoneGetsAnAward_EvenWithMoreThanEightAwardsOfNeed()
        {
            var players = new List<PlayerStats>();
            for (var i = 1; i <= 10; i++)
                players.Add(P("p" + i, i == 1 ? new[] { "PM" } : null,
                    ("good_calls", i % 3), ("minigame_successes", i), ("predictions_correct", i == 4 ? 3 : 0), ("pilot_precision", i == 6 ? 0.8 : 0.0),
                    ("budget_saved_M", i == 1 ? 5 : 0)));
            var r = AwardAssigner.Assign(C, players, 2026);
            Assert.Equal(10, r.Players.Count);
            foreach (var p in r.Players) Assert.NotEmpty(p.AwardIds);
            // the highest minigame_successes (p10) is the Team Player; the highest precision (p6) has Steady Hands
            Assert.Contains("team_player", r.For("p10")!.AwardIds);
            Assert.Contains("steady_hands", r.For("p6")!.AwardIds);
            Assert.Contains("fact_finder", r.For("p4")!.AwardIds);
            Assert.Contains("budget_hawk", r.For("p1")!.AwardIds);
        }

        [Fact]
        public void PositiveOnly_NobodyGetsAnAwardForAZeroMetric()
        {
            // Nobody made a Good Call, so nobody wins Best Callout; the budget award needs a PM with savings.
            var players = new[] { P("p1", null, ("minigame_successes", 3)), P("p2", null, ("minigame_successes", 2)) };
            var r = AwardAssigner.Assign(C, players, 3);
            Assert.DoesNotContain("best_callout", r.For("p1")!.AwardIds.Concat(r.For("p2")!.AwardIds));
            Assert.Contains("team_player", r.For("p1")!.AwardIds);
            // p2 has a positive claim only to Team Player, so shares it
            Assert.Equal(new[] { "team_player" }, r.For("p2")!.AwardIds);
            Assert.DoesNotContain("budget_hawk", r.For("p1")!.AwardIds);
        }

        [Fact]
        public void BudgetHawk_NeedsThePmRole()
        {
            var players = new[] { P("p1", new[] { "FLIGHT" }, ("budget_saved_M", 99)), P("p2", new[] { "PM" }, ("budget_saved_M", 1)) };
            var r = AwardAssigner.Assign(C, players, 5);
            Assert.Contains("budget_hawk", r.For("p2")!.AwardIds);
            Assert.DoesNotContain("budget_hawk", r.For("p1")!.AwardIds);
        }

        [Fact]
        public void ConditionAwards_GoToEveryoneWhoMeetsThem()
        {
            var players = new[]
            {
                P("p1", null, ("vetoed_option_would_have_failed", 1), ("gold_during_blackout_or_abort", 1)),
                P("p2", null, ("vetoed_option_would_have_failed", 1)),
                P("p3", null, ("gold_during_blackout_or_abort", 1)),
            };
            var r = AwardAssigner.Assign(C, players, 9);
            Assert.Contains("veto_visionary", r.For("p1")!.AwardIds);
            Assert.Contains("veto_visionary", r.For("p2")!.AwardIds);
            Assert.DoesNotContain("veto_visionary", r.For("p3")!.AwardIds);
            Assert.Contains("calm_under_pressure", r.For("p1")!.AwardIds);
            Assert.Contains("calm_under_pressure", r.For("p3")!.AwardIds);
        }

        [Fact]
        public void Ties_AreSpreadToPlayersWithFewerAwards()
        {
            // p1 wins Best Callout alone (3 Good Calls); Fact Finder is tied 2-2 between p1 and p2: p2 holds fewer awards, so p2 gets it.
            var players = new[]
            {
                P("p1", null, ("good_calls", 3), ("predictions_correct", 2)),
                P("p2", null, ("good_calls", 1), ("predictions_correct", 2)),
            };
            var r = AwardAssigner.Assign(C, players, 11);
            Assert.Contains("fact_finder", r.For("p2")!.AwardIds);
            Assert.DoesNotContain("fact_finder", r.For("p1")!.AwardIds);
        }

        [Fact]
        public void SameSeedSameResult_InputOrderDoesNotMatter()
        {
            var players = new List<PlayerStats>();
            for (var i = 1; i <= 6; i++) players.Add(P("p" + i, null, ("good_calls", 2), ("predictions_correct", 1), ("minigame_successes", 4)));
            var a = AwardAssigner.Assign(C, players, 123);
            var b = AwardAssigner.Assign(C, players, 123);
            Assert.Equal(Signature(a), Signature(b));
            var reversed = new List<PlayerStats>(players);
            reversed.Reverse();
            var c = AwardAssigner.Assign(C, reversed, 123);
            foreach (var p in players) Assert.Equal(a.For(p.PlayerId)!.AwardIds, c.For(p.PlayerId)!.AwardIds);
        }

        [Fact]
        public void TiebreakStream_UsesTheSeed()
        {
            var players = new List<PlayerStats>();
            for (var i = 1; i <= 4; i++) players.Add(P("p" + i, null, ("good_calls", 2), ("predictions_correct", 2), ("minigame_successes", 5), ("pilot_precision", 0.5)));
            var signatures = new HashSet<string>();
            for (ulong seed = 1; seed <= 20; seed++) signatures.Add(Signature(AwardAssigner.Assign(C, players, seed)));
            Assert.True(signatures.Count > 1, "a fully tied team must be resolved by the seeded stream, giving different results for different seeds");
        }

        [Fact]
        public void EveryAwardIsKnown_AndPlayersAreReturnedInInputOrder()
        {
            var players = new[] { P("zed", null, ("good_calls", 1)), P("amy", null, ("minigame_successes", 1)) };
            var r = AwardAssigner.Assign(C, players, 1);
            Assert.Equal(new[] { "zed", "amy" }, r.Players.Select(p => p.PlayerId));
            var known = new HashSet<string>(C.Awards.Select(a => a.Id));
            foreach (var p in r.Players) foreach (var id in p.AwardIds) Assert.Contains(id, known);
        }

        [Fact]
        public void MinimumFromData_IsHonoured()
        {
            // awards.json says min_awards_per_player = 1; with 2 every player must hold at least two awards.
            var files = ScoringFixture.Files();
            files["awards.json"] = files["awards.json"].Replace("\"min_awards_per_player\": 1", "\"min_awards_per_player\": 2");
            var catalog = ScoringCatalog.Load(files);
            Assert.Equal(2, catalog.MinAwardsPerPlayer);
            var players = new[] { P("p1", null, ("good_calls", 3)), P("p2"), P("p3") };
            var r = AwardAssigner.Assign(catalog, players, 4);
            foreach (var p in r.Players) Assert.True(p.AwardIds.Count >= 2, p.PlayerId);
        }

        [Fact]
        public void EmptyTeam_GivesEmptyResult_DuplicateIdsThrow()
        {
            Assert.Empty(AwardAssigner.Assign(C, new PlayerStats[0], 1).Players);
            Assert.Throws<System.ArgumentException>(() => AwardAssigner.Assign(C, new[] { P("a"), P("a") }, 1));
        }
    }
}
