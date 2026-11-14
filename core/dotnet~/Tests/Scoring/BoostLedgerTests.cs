using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    /// <summary>Design 10.4 and 11.1: stacking, caps, Platinum pays Gold, shields, crewed-only and build-only boosts.</summary>
    public class BoostLedgerTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog();

        private static BoostLedger Empty(bool crewed = false, BoostPhase phase = BoostPhase.Flight) => BoostLedger.Empty(C, crewed, phase);

        private static BoostLedger Grant(BoostLedger l, string id, Tier tier, out BoostGrant g)
        {
            var next = l.Grant(id, tier, BoostSource.Minigame, "MG-08", out var grant);
            g = grant!;
            return next;
        }

        [Fact]
        public void AddFraction_GoldLoadMargin_IsPlusFifteenPercent()
        {
            // Load Margin gold = +0.15 -> amount 0.15 x 100 = +15 %, total 15 % (protocol example of mg.summary)
            var l = Grant(Empty(), "load_margin", Tier.Gold, out var g);
            Assert.Equal(15, g.Amount);
            Assert.Equal(15, g.Total);
            Assert.Equal(BoostUnit.Pct, g.Unit);
            Assert.False(g.Capped);
            Assert.Equal(Tier.Gold, g.Tier);
            Assert.Equal(BoostSource.Minigame, g.Source);
            Assert.Equal("MG-08", g.SourceId);
            Assert.Equal(0.15, l.Total("load_margin"));
        }

        [Fact]
        public void SameTypeStacksAdditively_ThenClampsAtCap()
        {
            // Δv Bonus: gold +3 % three times = 9 % > cap 8 %. After two: 6 %; third adds only 2 (capped).
            var l = Empty();
            l = Grant(l, "dv_bonus", Tier.Gold, out var g1);
            l = Grant(l, "dv_bonus", Tier.Gold, out var g2);
            Assert.Equal(6, g2.Total);
            l = Grant(l, "dv_bonus", Tier.Gold, out var g3);
            Assert.Equal(2, g3.Amount);
            Assert.Equal(8, g3.Total);
            Assert.True(g3.Capped);
            l = Grant(l, "dv_bonus", Tier.Gold, out var g4);
            Assert.Equal(0, g4.Amount);
            Assert.Equal(8, g4.Total);
            Assert.True(g4.Capped);
            Assert.Equal(0.08, l.Total("dv_bonus"));
            Assert.Equal(3, g1.Amount);
        }

        [Fact]
        public void NegativeCap_Precision_ClampsAtMinusNinetyPercent()
        {
            // Precision gold -0.8, then silver -0.5 = -1.3 -> clamped to cap -0.9 (amount -0.1 => -10 %)
            var l = Grant(Empty(), "precision", Tier.Gold, out _);
            l = Grant(l, "precision", Tier.Silver, out var g);
            Assert.Equal(-10, g.Amount);
            Assert.Equal(-90, g.Total);
            Assert.True(g.Capped);
            Assert.Equal(-0.9, l.Total("precision"));
        }

        [Fact]
        public void Multiplier_ExcessOverOneAdds_1p1With1p25Is1p35()
        {
            // Data multiplier: bronze x1.1 -> +0.10; silver x1.25 -> +0.25; total 1 + 0.10 + 0.25 = x1.35 (Decision, not 1.1 * 1.25 = 1.375)
            var l = Grant(Empty(), "data_multiplier", Tier.Bronze, out var g1);
            Assert.Equal(BoostUnit.Mult, g1.Unit);
            Assert.Equal(0.1, g1.Amount);
            Assert.Equal(1.1, g1.Total);
            l = Grant(l, "data_multiplier", Tier.Silver, out var g2);
            Assert.Equal(0.25, g2.Amount);
            Assert.Equal(1.35, g2.Total);
            Assert.Equal(1.35, l.Total("data_multiplier"));
        }

        [Fact]
        public void Multiplier_ClampsAtCap()
        {
            // Score multiplier: gold x1.2 -> +0.2 each; 3 grants = 1.6 > cap 1.5. Third adds 0.1 (capped).
            var l = Empty();
            l = Grant(l, "score_multiplier", Tier.Gold, out _);
            l = Grant(l, "score_multiplier", Tier.Gold, out var g2);
            Assert.Equal(1.4, g2.Total);
            l = Grant(l, "score_multiplier", Tier.Gold, out var g3);
            Assert.Equal(0.1, g3.Amount);
            Assert.Equal(1.5, g3.Total);
            Assert.True(g3.Capped);
            Assert.Equal(1.5, l.Total("score_multiplier"));
        }

        [Fact]
        public void NoGrantYet_MultiplierTotalIsOne_OthersZero()
        {
            var l = Empty();
            Assert.Equal(1.0, l.Total("score_multiplier"));
            Assert.Equal(1.0, l.Total("data_multiplier"));
            Assert.Equal(0.0, l.Total("dv_bonus"));
            Assert.Equal(0.0, l.Total("budget_refund"));
        }

        [Fact]
        public void PlatinumPaysGold()
        {
            var l = Grant(Empty(), "heat_margin", Tier.Platinum, out var g);
            Assert.Equal(15, g.Amount);          // gold +0.15 x 100
            Assert.Equal(Tier.Gold, g.Tier);
            Assert.Equal(0.15, l.Total("heat_margin"));
        }

        [Fact]
        public void TierNone_GrantsNothing()
        {
            var l = Empty();
            var next = l.Grant("dv_bonus", Tier.None, BoostSource.Minigame, "MG-01", out var g);
            Assert.Null(g);
            Assert.Same(l, next);
        }

        [Fact]
        public void BudgetRefund_HasNoCap_AndUnitIsMillionDollars()
        {
            // 4 + 4 + 2 + 1 = 11 M, never capped
            var l = Empty();
            l = Grant(l, "budget_refund", Tier.Gold, out _);
            l = Grant(l, "budget_refund", Tier.Gold, out _);
            l = Grant(l, "budget_refund", Tier.Silver, out _);
            l = Grant(l, "budget_refund", Tier.Bronze, out var g);
            Assert.Equal(BoostUnit.MUsd, g.Unit);
            Assert.Equal(11, g.Total);
            Assert.False(g.Capped);
        }

        [Fact]
        public void Shields_SilverRerolls_GoldNegates_BronzeNone_MaxTwo_OldestFirst()
        {
            var l = Empty();
            l = l.Grant("reliability_shield", Tier.Bronze, BoostSource.Minigame, "MG-01", out var none);
            Assert.Null(none);
            Assert.Equal(0, l.ShieldsHeld);

            l = Grant(l, "reliability_shield", Tier.Silver, out var g1);
            Assert.Equal(BoostUnit.Shields, g1.Unit);
            Assert.Equal(1, g1.Total);
            l = Grant(l, "reliability_shield", Tier.Gold, out var g2);
            Assert.Equal(2, g2.Total);
            Assert.Equal(new[] { ShieldKind.Reroll, ShieldKind.Negate }, l.Shields);

            // a third shield is refused: 2 held at once
            l = Grant(l, "reliability_shield", Tier.Gold, out var g3);
            Assert.True(g3.Capped);
            Assert.Equal(0, g3.Amount);
            Assert.Equal(2, g3.Total);
            Assert.Equal(2, l.ShieldsHeld);

            l = l.ConsumeShield(out var first);
            Assert.Equal(ShieldKind.Reroll, first);
            l = l.ConsumeShield(out var second);
            Assert.Equal(ShieldKind.Negate, second);
            l = l.ConsumeShield(out var third);
            Assert.Null(third);
            Assert.Equal(0, l.ShieldsHeld);
        }

        [Fact]
        public void PlatinumShield_IsANegate()
        {
            var l = Grant(Empty(), "reliability_shield", Tier.Platinum, out _);
            Assert.Equal(new[] { ShieldKind.Negate }, l.Shields);
        }

        [Fact]
        public void Ledger_IsImmutable()
        {
            var a = Empty();
            var b = Grant(a, "dv_bonus", Tier.Gold, out _);
            Assert.Equal(0.0, a.Total("dv_bonus"));
            Assert.Equal(0.03, b.Total("dv_bonus"));
            Assert.Empty(a.Grants);
            Assert.Single(b.Grants);
        }

        [Fact]
        public void CrewMorale_OnlyOnCrewedContracts_CapsAtHundred()
        {
            var uncrewed = Empty(crewed: false).Grant("crew_morale", Tier.Gold, BoostSource.Minigame, "MG-24", out var none);
            Assert.Null(none);
            Assert.Equal(0.0, uncrewed.Total("crew_morale"));

            // gold +20 points; five grants reach the 100-point meter maximum, the sixth adds 0
            var l = Empty(crewed: true);
            for (var i = 0; i < 5; i++) l = Grant(l, "crew_morale", Tier.Gold, out _);
            Assert.Equal(100, l.Total("crew_morale"));
            l = Grant(l, "crew_morale", Tier.Bronze, out var g);
            Assert.Equal(0, g.Amount);
            Assert.True(g.Capped);
            Assert.Equal(BoostUnit.Points, g.Unit);
        }

        [Fact]
        public void ScheduleRecovery_OnlyInBuildPhase_CapsAtMinusFifteenDays()
        {
            var flight = Empty(phase: BoostPhase.Flight).Grant("schedule_recovery", Tier.Gold, BoostSource.Minigame, "MG-30", out var none);
            Assert.Null(none);
            Assert.Equal(0.0, flight.Total("schedule_recovery"));

            // gold -5 days x 3 = -15 (cap), a fourth adds 0
            var l = Empty(phase: BoostPhase.Build);
            for (var i = 0; i < 3; i++) l = Grant(l, "schedule_recovery", Tier.Gold, out _);
            Assert.Equal(-15, l.Total("schedule_recovery"));
            l = Grant(l, "schedule_recovery", Tier.Silver, out var g);
            Assert.True(g.Capped);
            Assert.Equal(-15, g.Total);
            Assert.Equal(BoostUnit.Days, g.Unit);

            // the phase can change on the same ledger
            var inFlight = l.WithPhase(BoostPhase.Flight).Grant("schedule_recovery", Tier.Gold, BoostSource.Minigame, null, out var g2);
            Assert.Null(g2);
            Assert.Equal(-15, inFlight.Total("schedule_recovery"));
        }

        [Fact]
        public void UnknownBoost_Throws()
        {
            Assert.Throws<System.ArgumentException>(() => Empty().Grant("warp_drive", Tier.Gold, BoostSource.Ability, null, out _));
            Assert.Throws<System.ArgumentException>(() => Empty().Total("warp_drive"));
        }

        [Fact]
        public void SameSequence_GivesIdenticalLedgers()
        {
            BoostLedger Run()
            {
                var l = Empty();
                l = Grant(l, "dv_bonus", Tier.Gold, out _);
                l = Grant(l, "fuel_saver", Tier.Silver, out _);
                l = Grant(l, "reliability_shield", Tier.Gold, out _);
                return l;
            }
            var a = Run();
            var b = Run();
            Assert.Equal(a.Total("dv_bonus"), b.Total("dv_bonus"));
            Assert.Equal(a.Total("fuel_saver"), b.Total("fuel_saver"));
            Assert.Equal(a.Shields, b.Shields);
        }
    }
}
