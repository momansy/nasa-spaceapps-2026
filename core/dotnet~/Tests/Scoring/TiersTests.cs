using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    /// <summary>Design 10.3 and 17.10: tier calculation for 1–10 players, thresholds 0.33 / 0.66 / 1.00 from data.</summary>
    public class TiersTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog();

        private static TierResult T(int active, int ok, int perfect = 0) => Tiers.Compute(C, active, ok, perfect);

        [Fact]
        public void ZeroActive_IsNoneWithoutSparkle()
        {
            var r = T(0, 0);
            Assert.Equal(Tier.None, r.Tier);
            Assert.Equal(0.0, r.FractionUnitless);
            Assert.False(r.Sparkle);
        }

        [Fact]
        public void TwoPlayers_OneSuccessIsBronze_BothIsGold()
        {
            // f = 1 / 2 = 0.5 >= 0.33 and < 0.66 -> Bronze (design 10.3, "2 players")
            Assert.Equal(Tier.Bronze, T(2, 1).Tier);
            Assert.Equal(0.5, T(2, 1).FractionUnitless);
            Assert.Equal(Tier.None, T(2, 0).Tier);
            Assert.False(T(2, 0).Sparkle);
            Assert.Equal(Tier.Gold, T(2, 2).Tier);
        }

        [Fact]
        public void TenPlayers_ThreeSuccessesIsNoneWithSparkle()
        {
            // f = 3 / 10 = 0.30 < 0.33 -> None, sparkle because one or more succeeded
            var r = T(10, 3);
            Assert.Equal(Tier.None, r.Tier);
            Assert.True(r.Sparkle);
            Assert.Null(r.TierId);
        }

        // Every row for 1..10 players, hand-computed: letter k is the tier for k successes (k = 0..N);
        // N none, B Bronze (f >= 0.33), S Silver (f >= 0.66), G Gold (f = 1). E.g. N = 7: 2/7 = 0.286 N, 3/7 = 0.429 B,
        // 5/7 = 0.714 S, 7/7 = 1 G. N = 10 matches the design's example (0-3 none, 4-6 Bronze, 7-9 Silver, 10 Gold).
        [Theory]
        [InlineData(1, "NG")]
        [InlineData(2, "NBG")]
        [InlineData(3, "NBSG")]
        [InlineData(4, "NNBSG")]
        [InlineData(5, "NNBBSG")]
        [InlineData(6, "NNBBSSG")]
        [InlineData(7, "NNNBBSSG")]
        [InlineData(8, "NNNBBBSSG")]
        [InlineData(9, "NNNBBBSSSG")]
        [InlineData(10, "NNNNBBBSSSG")]
        public void EveryRowOneToTenPlayers(int players, string expected)
        {
            Assert.Equal(players + 1, expected.Length);
            for (var ok = 0; ok <= players; ok++)
            {
                var want = expected[ok] switch { 'N' => Tier.None, 'B' => Tier.Bronze, 'S' => Tier.Silver, _ => Tier.Gold };
                Assert.Equal(want, T(players, ok).Tier);
            }
        }

        [Theory]
        [InlineData(1, 0, Tier.None)]
        [InlineData(1, 1, Tier.Gold)]
        [InlineData(3, 1, Tier.Bronze)]   // 0.3333 >= 0.33
        [InlineData(3, 2, Tier.Silver)]   // 0.6667 >= 0.66
        [InlineData(3, 3, Tier.Gold)]
        [InlineData(4, 1, Tier.None)]     // 0.25
        [InlineData(4, 2, Tier.Bronze)]   // 0.5
        [InlineData(4, 3, Tier.Silver)]   // 0.75
        [InlineData(6, 2, Tier.Bronze)]   // 0.3333
        [InlineData(6, 4, Tier.Silver)]   // 0.6667
        [InlineData(10, 4, Tier.Bronze)]
        [InlineData(10, 6, Tier.Bronze)]  // 0.60 < 0.66
        [InlineData(10, 7, Tier.Silver)]
        [InlineData(10, 9, Tier.Silver)]
        [InlineData(10, 10, Tier.Gold)]
        public void SelectedRows(int active, int ok, Tier expected) => Assert.Equal(expected, T(active, ok).Tier);

        [Fact]
        public void Platinum_NeedsEveryActivePlayerPerfect()
        {
            Assert.Equal(Tier.Gold, T(4, 4, 3).Tier);        // one player not perfect
            Assert.Equal(Tier.Platinum, T(4, 4, 4).Tier);
            Assert.Equal(Tier.Silver, T(4, 3, 3).Tier);      // not everyone succeeded: never Platinum
            Assert.Equal(Tier.Platinum, T(1, 1, 1).Tier);
        }

        [Fact]
        public void PlatinumPaysGold()
        {
            Assert.Equal(Tier.Gold, Tiers.BoostTier(C, Tier.Platinum));
            Assert.Equal(Tier.Gold, Tiers.BoostTier(C, Tier.Gold));
            Assert.Equal(Tier.Silver, Tiers.BoostTier(C, Tier.Silver));
            Assert.Equal(Tier.None, Tiers.BoostTier(C, Tier.None));
        }

        [Fact]
        public void InputsAreClamped()
        {
            Assert.Equal(Tier.Gold, T(3, 9).Tier);           // succeeded clamped to active
            Assert.Equal(Tier.None, T(3, -2).Tier);
            Assert.Equal(Tier.Platinum, T(3, 3, 99).Tier);   // perfect clamped to succeeded
        }

        [Theory]
        [InlineData(0.0, false, Tier.None, false)]
        [InlineData(0.2, false, Tier.None, true)]
        [InlineData(0.33, false, Tier.Bronze, false)]
        [InlineData(0.5, false, Tier.Bronze, false)]
        [InlineData(0.66, false, Tier.Silver, false)]
        [InlineData(0.99, false, Tier.Silver, false)]
        [InlineData(1.0, false, Tier.Gold, false)]
        [InlineData(1.0, true, Tier.Platinum, false)]
        [InlineData(0.9, true, Tier.Silver, false)]   // perfect alone never makes Platinum
        [InlineData(1.7, false, Tier.Gold, false)]    // clamped to 1
        [InlineData(-0.5, false, Tier.None, false)]
        public void Solo_UsesTheSameThresholds(double s, bool perfect, Tier expected, bool sparkle)
        {
            var r = Tiers.ComputeSolo(C, s, perfect);
            Assert.Equal(expected, r.Tier);
            Assert.Equal(sparkle, r.Sparkle);
        }

        [Fact]
        public void IdRoundTrip()
        {
            foreach (var t in new[] { Tier.Bronze, Tier.Silver, Tier.Gold, Tier.Platinum })
                Assert.Equal(t, Tiers.FromId(Tiers.IdOf(t)!));
            Assert.Throws<System.ArgumentException>(() => Tiers.FromId("diamond"));
        }
    }
}
