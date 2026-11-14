using System;
using System.Collections.Generic;
using MissionForge.Core.Data;
using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    public class CatalogLoadTests
    {
        [Fact]
        public void LoadsRealData()
        {
            var c = ScoringFixture.Catalog;
            Assert.Equal(4, c.Tiers.Count);
            Assert.Equal(11, c.Boosts.Count);
            Assert.Equal(3, c.SyncMoments.Count);
            Assert.Equal(100.0, c.SyncMeterMax);
            Assert.Equal(25.0, c.SyncGain("gold"));
            Assert.Equal(5, c.Grades.Count);
            Assert.Equal(0.8, c.AssistMultipliers["cadet"]);
            Assert.Equal(1.25, c.AssistMultipliers["flight_director"]);
            Assert.Equal(8, c.Awards.Count);
            Assert.Equal(1.5, c.ScoreBoostCap);
            Assert.True(c.Objectives.ContainsKey("C1"));
            Assert.NotNull(c.Objectives["C4"].Safety);
        }

        [Fact]
        public void MalformedFileNamesTheFile()
        {
            var files = ScoringFixture.Files();
            files["scoring.json"] = "{ not json";
            var ex = Assert.Throws<CatalogException>(() => ScoringCatalog.Load(files));
            Assert.Contains("scoring.json", ex.Message);
        }

        [Fact]
        public void MissingFileNamesTheFile()
        {
            var files = ScoringFixture.Files();
            files.Remove("awards.json");
            var ex = Assert.Throws<CatalogException>(() => ScoringCatalog.Load(files));
            Assert.Contains("awards.json", ex.Message);
        }

        [Fact]
        public void KeyConventionAcceptsDataPrefixAndBackslashes()
        {
            var files = new Dictionary<string, string>();
            foreach (var kv in ScoringFixture.Files()) files["data\\" + kv.Key] = kv.Value;
            Assert.Equal(11, ScoringCatalog.Load(files).Boosts.Count);
        }
    }

    public class TierTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog;

        // f = succeeded / active; thresholds from data: Bronze 0.33, Silver 0.66, Gold 1.0, Platinum 1.0 with all perfect.
        [Theory]
        [InlineData(1, 0, Tier.None, false)]       // f = 0
        [InlineData(1, 1, Tier.Gold, false)]       // f = 1
        [InlineData(2, 1, Tier.Bronze, false)]     // f = 0.5 (brief: 2 players, 1 success is Bronze)
        [InlineData(2, 2, Tier.Gold, false)]
        [InlineData(3, 1, Tier.Bronze, false)]     // f = 0.333 >= 0.33
        [InlineData(3, 2, Tier.Silver, false)]     // f = 0.667 >= 0.66
        [InlineData(3, 3, Tier.Gold, false)]
        [InlineData(4, 1, Tier.None, true)]        // f = 0.25 < 0.33, a success: sparkle
        [InlineData(4, 2, Tier.Bronze, false)]     // f = 0.5
        [InlineData(4, 3, Tier.Silver, false)]     // f = 0.75
        [InlineData(4, 4, Tier.Gold, false)]
        [InlineData(5, 1, Tier.None, true)]        // f = 0.2
        [InlineData(5, 2, Tier.Bronze, false)]     // f = 0.4
        [InlineData(5, 3, Tier.Bronze, false)]     // f = 0.6 < 0.66
        [InlineData(5, 4, Tier.Silver, false)]     // f = 0.8
        [InlineData(6, 2, Tier.Bronze, false)]     // f = 0.333
        [InlineData(6, 4, Tier.Silver, false)]     // f = 0.667
        [InlineData(7, 2, Tier.None, true)]        // f = 0.286
        [InlineData(7, 3, Tier.Bronze, false)]     // f = 0.429
        [InlineData(7, 5, Tier.Silver, false)]     // f = 0.714
        [InlineData(8, 3, Tier.Bronze, false)]     // f = 0.375
        [InlineData(8, 5, Tier.Bronze, false)]     // f = 0.625 < 0.66
        [InlineData(8, 6, Tier.Silver, false)]     // f = 0.75
        [InlineData(9, 3, Tier.Bronze, false)]     // f = 0.333
        [InlineData(9, 6, Tier.Silver, false)]     // f = 0.667
        [InlineData(10, 0, Tier.None, false)]
        [InlineData(10, 3, Tier.None, true)]       // f = 0.3 (brief: 10 players, 3 successes is None with a sparkle)
        [InlineData(10, 4, Tier.Bronze, false)]    // f = 0.4
        [InlineData(10, 6, Tier.Bronze, false)]    // f = 0.6
        [InlineData(10, 7, Tier.Silver, false)]    // f = 0.7
        [InlineData(10, 10, Tier.Gold, false)]
        public void TeamTiers(int active, int succeeded, Tier expected, bool sparkle)
        {
            var r = Tiers.Compute(C, active, succeeded, 0);
            Assert.Equal(expected, r.Tier);
            Assert.Equal(sparkle, r.Sparkle);
            Assert.Equal((double)succeeded / active, r.FractionUnitless, 9);
        }

        [Fact]
        public void ZeroActiveIsNoneWithoutSparkle()
        {
            var r = Tiers.Compute(C, 0, 0, 0);
            Assert.Equal(Tier.None, r.Tier);
            Assert.False(r.Sparkle);
            Assert.Equal(0.0, r.FractionUnitless);
        }

        [Theory]
        [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)] [InlineData(5)]
        [InlineData(6)] [InlineData(7)] [InlineData(8)] [InlineData(9)] [InlineData(10)]
        public void PlatinumNeedsEveryPlayerPerfect(int n)
        {
            Assert.Equal(Tier.Platinum, Tiers.Compute(C, n, n, n).Tier);
            Assert.Equal(Tier.Gold, Tiers.Compute(C, n, n, n - 1).Tier);
            Assert.Equal(Tier.Gold, Tiers.Compute(C, n, n, 0).Tier);
        }

        [Fact]
        public void TierNeverDecreasesWithMoreSuccesses()
        {
            for (int n = 1; n <= 10; n++)
            {
                var last = Tier.None;
                for (int s = 0; s <= n; s++)
                {
                    var t = Tiers.Compute(C, n, s, 0).Tier;
                    Assert.True(t >= last, "n=" + n + " s=" + s);
                    last = t;
                }
            }
        }

        [Fact]
        public void SoloUsesTheScoreAsFraction()
        {
            Assert.Equal(Tier.None, Tiers.ComputeSolo(C, 0.2, false).Tier);
            Assert.True(Tiers.ComputeSolo(C, 0.2, false).Sparkle);
            Assert.False(Tiers.ComputeSolo(C, 0.0, false).Sparkle);
            Assert.Equal(Tier.Bronze, Tiers.ComputeSolo(C, 0.5, false).Tier);
            Assert.Equal(Tier.Silver, Tiers.ComputeSolo(C, 0.7, false).Tier);
            Assert.Equal(Tier.Gold, Tiers.ComputeSolo(C, 1.0, false).Tier);
            Assert.Equal(Tier.Platinum, Tiers.ComputeSolo(C, 1.0, true).Tier);
            Assert.Equal(Tier.Gold, Tiers.ComputeSolo(C, 7.0, false).Tier); // clamped to 1
        }
    }

    public class BoostTests
    {
        private static BoostLedger Empty(bool crewed = false) => BoostLedger.Empty(ScoringFixture.Catalog, crewed);

        [Fact]
        public void SameTypeAddsThenClampsAtCap()
        {
            // dv_bonus Gold = +0.03, cap +0.08: 0.03, 0.06, then 0.09 clamps to 0.08 (amount 0.02).
            var l = Empty();
            var g1 = l.Grant("dv_bonus", Tier.Gold, BoostSource.Minigame, "MG-09"); l = g1.Ledger;
            var g2 = l.Grant("dv_bonus", Tier.Gold, BoostSource.Minigame, "MG-10a"); l = g2.Ledger;
            var g3 = l.Grant("dv_bonus", Tier.Gold, BoostSource.Minigame, "MG-15"); l = g3.Ledger;
            Assert.Equal(0.03, g1.Grant.Total, 9);
            Assert.Equal(0.06, g2.Grant.Total, 9);
            Assert.False(g2.Grant.Capped);
            Assert.Equal(0.08, g3.Grant.Total, 9);
            Assert.Equal(0.02, g3.Grant.Amount, 9);
            Assert.True(g3.Grant.Capped);
            Assert.Equal("fraction", g3.Grant.Unit);
            Assert.Equal(0.08, l.Total("dv_bonus"), 9);
        }

        [Fact]
        public void LedgerIsImmutable()
        {
            var empty = Empty();
            var after = empty.Grant("budget_refund", Tier.Gold, BoostSource.Minigame, null).Ledger;
            Assert.Equal(0.0, empty.Total("budget_refund"));
            Assert.Equal(4.0, after.Total("budget_refund"));
        }

        [Fact]
        public void MultiplierExcessOverOneAdds()
        {
            // Decision: x1.1 and x1.25 stack to 1 + 0.1 + 0.25 = x1.35, not x1.375.
            var l = Empty();
            var g1 = l.Grant("data_multiplier", Tier.Bronze, BoostSource.Minigame, null); l = g1.Ledger;
            var g2 = l.Grant("data_multiplier", Tier.Silver, BoostSource.Minigame, null); l = g2.Ledger;
            Assert.Equal(1.1, g1.Grant.Total, 9);
            Assert.Equal(0.1, g1.Grant.Amount, 9);
            Assert.Equal(1.35, g2.Grant.Total, 9);
            Assert.Equal(0.25, g2.Grant.Amount, 9);
            Assert.Equal("factor", g2.Grant.Unit);
        }

        [Fact]
        public void MultiplierCapsAtItsCap()
        {
            // data_multiplier Gold = x1.5 (excess 0.5), cap x2: 1.5, 2.0, then 2.5 clamps to 2.0.
            var l = Empty();
            for (int i = 0; i < 2; i++) l = l.Grant("data_multiplier", Tier.Gold, BoostSource.Minigame, null).Ledger;
            Assert.Equal(2.0, l.Total("data_multiplier"), 9);
            var third = l.Grant("data_multiplier", Tier.Gold, BoostSource.Minigame, null);
            Assert.True(third.Grant.Capped);
            Assert.Equal(2.0, third.Grant.Total, 9);
            Assert.Equal(0.0, third.Grant.Amount, 9);
        }

        [Fact]
        public void NegativeCapIsAFloor()
        {
            // precision Gold = -0.8, cap -0.9: -0.8, then -1.6 clamps to -0.9.
            var l = Empty().Grant("precision", Tier.Gold, BoostSource.Minigame, null).Ledger;
            var second = l.Grant("precision", Tier.Gold, BoostSource.Minigame, null);
            Assert.Equal(-0.9, second.Grant.Total, 9);
            Assert.True(second.Grant.Capped);
            Assert.Equal(-0.1, second.Grant.Amount, 9);
        }

        [Fact]
        public void PlatinumPaysGold()
        {
            var p = Empty().Grant("dv_bonus", Tier.Platinum, BoostSource.Minigame, null);
            Assert.Equal(0.03, p.Grant.Total, 9);
            Assert.Equal(Tier.Platinum, p.Grant.Tier);
        }

        [Fact]
        public void TierNoneIsRejected() =>
            Assert.Throws<ArgumentException>(() => Empty().Grant("dv_bonus", Tier.None, BoostSource.Minigame, null));

        [Fact]
        public void UnknownBoostIsRejected() =>
            Assert.Throws<ArgumentException>(() => Empty().Grant("nope", Tier.Gold, BoostSource.Minigame, null));

        [Fact]
        public void ShieldsSilverRerollGoldNegateAtMostTwoOldestFirst()
        {
            var l = Empty();
            Assert.False(l.Grant("reliability_shield", Tier.Bronze, BoostSource.Minigame, null).Grant.Applied); // Bronze pays no shield
            l = l.Grant("reliability_shield", Tier.Silver, BoostSource.Minigame, null).Ledger;
            l = l.Grant("reliability_shield", Tier.Gold, BoostSource.Minigame, null).Ledger;
            Assert.Equal(new[] { "reroll_next_failure", "negate_next_failure" }, l.Shields);
            var third = l.Grant("reliability_shield", Tier.Gold, BoostSource.Minigame, null);
            Assert.True(third.Grant.Capped);
            Assert.Equal(2, third.Ledger.Shields.Count);
            var use = l.ConsumeShield();
            Assert.Equal("reroll_next_failure", use.Shield);
            Assert.Equal(new[] { "negate_next_failure" }, use.Ledger.Shields);
            Assert.Null(Empty().ConsumeShield().Shield);
        }

        [Fact]
        public void CrewMoraleOnlyOnCrewedContracts()
        {
            var uncrewed = Empty(crewed: false).Grant("crew_morale", Tier.Gold, BoostSource.Minigame, null);
            Assert.False(uncrewed.Grant.Applied);
            Assert.Equal(0.0, uncrewed.Ledger.Total("crew_morale"));
            var crewed = Empty(crewed: true).Grant("crew_morale", Tier.Gold, BoostSource.Minigame, null);
            Assert.True(crewed.Grant.Applied);
            Assert.Equal(20.0, crewed.Ledger.Total("crew_morale"));
        }

        [Fact]
        public void CrewMoraleStopsAtTheMeterMax()
        {
            var l = Empty(crewed: true);
            for (int i = 0; i < 6; i++) l = l.Grant("crew_morale", Tier.Gold, BoostSource.Minigame, null).Ledger; // 6 x 20 = 120 -> 100
            Assert.Equal(100.0, l.Total("crew_morale"));
        }

        [Fact]
        public void ScheduleRecoveryOnlyInBuildPhase()
        {
            Assert.False(Empty().Grant("schedule_recovery", Tier.Gold, BoostSource.Minigame, null, buildPhase: false).Grant.Applied);
            // Gold = -5 days, cap -15: -5, -10, -15, then -20 clamps to -15.
            var l = Empty();
            for (int i = 0; i < 4; i++) l = l.Grant("schedule_recovery", Tier.Gold, BoostSource.Minigame, null, buildPhase: true).Ledger;
            Assert.Equal(-15.0, l.Total("schedule_recovery"));
        }

        [Fact]
        public void ScoreMultiplierCapsAtOnePointFive()
        {
            // Gold = x1.2 (excess 0.2): 1.2, 1.4, then 1.6 clamps to 1.5.
            var l = Empty();
            for (int i = 0; i < 3; i++) l = l.Grant("score_multiplier", Tier.Gold, BoostSource.Minigame, null).Ledger;
            Assert.Equal(1.5, l.ScoreMultiplier, 9);
            Assert.Equal(1.0, Empty().ScoreMultiplier);
        }

        [Fact]
        public void SameInputsGiveSameLedger()
        {
            BoostLedger Run() =>
                Empty().Grant("dv_bonus", Tier.Silver, BoostSource.Minigame, "a").Ledger.Grant("fuel_saver", Tier.Gold, BoostSource.Moment, null).Ledger;
            Assert.Equal(Run().Total("dv_bonus"), Run().Total("dv_bonus"));
            Assert.Equal(Run().Total("fuel_saver"), Run().Total("fuel_saver"));
        }
    }

    public class TeamSyncTests
    {
        private static TeamSync New() => TeamSync.New(ScoringFixture.Catalog);

        [Fact]
        public void GainsComeFromData()
        {
            // Gold 25 + Silver 15 + Bronze 8 + Good Call 3 = 51.
            var s = New().AddTier(Tier.Gold).AddTier(Tier.Silver).AddTier(Tier.Bronze).AddGoodCall();
            Assert.Equal(51.0, s.MeterPoints);
            Assert.False(s.MomentReady);
        }

        [Fact]
        public void NoneAddsNothingAndPlatinumCountsAsGold()
        {
            Assert.Equal(0.0, New().AddTier(Tier.None).MeterPoints);
            Assert.Equal(25.0, New().AddTier(Tier.Platinum).MeterPoints);
        }

        [Fact]
        public void ClampsAtOneHundredAndTurnsReady()
        {
            var s = New();
            for (int i = 0; i < 3; i++) s = s.AddTier(Tier.Gold); // 75
            Assert.False(s.MomentReady);
            s = s.AddTier(Tier.Gold);                              // 100
            Assert.True(s.MomentReady);
            s = s.AddTier(Tier.Gold);                              // clamps
            Assert.Equal(100.0, s.MeterPoints);
        }

        [Fact]
        public void ChoosingAMomentResetsTheMeter()
        {
            var full = New().AddTier(Tier.Gold).AddTier(Tier.Gold).AddTier(Tier.Gold).AddTier(Tier.Gold);
            var choice = full.ChooseMoment("golden_window");
            Assert.Equal("golden_window", choice.MomentId);
            Assert.Equal("double_scores_next_phase", choice.Flag);
            Assert.Equal(0.0, choice.Sync.MeterPoints);
            Assert.Equal(100.0, full.MeterPoints); // immutable
        }

        [Fact]
        public void AllThreeMomentsAreChoosable()
        {
            var full = New().AddTier(Tier.Gold).AddTier(Tier.Gold).AddTier(Tier.Gold).AddTier(Tier.Gold);
            foreach (var id in new[] { "perfect_phase", "save_the_mission", "golden_window" })
                Assert.Equal(id, full.ChooseMoment(id).MomentId);
        }

        [Fact]
        public void ChoosingBeforeFullOrWithAnUnknownIdFails()
        {
            Assert.Throws<InvalidOperationException>(() => New().AddTier(Tier.Gold).ChooseMoment("golden_window"));
            var full = New().AddTier(Tier.Gold).AddTier(Tier.Gold).AddTier(Tier.Gold).AddTier(Tier.Gold);
            Assert.Throws<ArgumentException>(() => full.ChooseMoment("nope"));
        }
    }
}
