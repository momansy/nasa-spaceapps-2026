using System;
using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    /// <summary>Design 11.2: Gold +25, Silver +15, Bronze +8, Good Call +3; clamp at 100; moment choice resets to 0.</summary>
    public class TeamSyncTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog();

        [Fact]
        public void Gains_FromData()
        {
            Assert.Equal(25, TeamSync.Empty(C).AddMinigame(Tier.Gold).ValuePoints);
            Assert.Equal(15, TeamSync.Empty(C).AddMinigame(Tier.Silver).ValuePoints);
            Assert.Equal(8, TeamSync.Empty(C).AddMinigame(Tier.Bronze).ValuePoints);
            Assert.Equal(3, TeamSync.Empty(C).AddGoodCall().ValuePoints);
            Assert.Equal(0, TeamSync.Empty(C).AddMinigame(Tier.None).ValuePoints);
        }

        [Fact]
        public void Platinum_CountsAsGold()
        {
            Assert.Equal(25, TeamSync.Empty(C).AddMinigame(Tier.Platinum).ValuePoints);
        }

        [Fact]
        public void MeterClampsAtHundred_AndMomentBecomesReady()
        {
            // 25 + 25 + 25 = 75; + 15 = 90; + 8 = 98; + 3 = 101 -> clamped to 100 (delta applied 2)
            var m = TeamSync.Empty(C);
            m = m.AddMinigame(Tier.Gold).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold);
            Assert.Equal(75, m.ValuePoints);
            Assert.False(m.MomentReady);
            m = m.AddMinigame(Tier.Silver).AddMinigame(Tier.Bronze);
            Assert.Equal(98, m.ValuePoints);
            Assert.False(m.MomentReady);
            m = m.AddGoodCall();
            Assert.Equal(100, m.ValuePoints);
            Assert.Equal(2, m.LastDeltaPoints);
            Assert.True(m.MomentReady);
            // more gains after full stay at 100
            m = m.AddMinigame(Tier.Gold);
            Assert.Equal(100, m.ValuePoints);
            Assert.Equal(0, m.LastDeltaPoints);
        }

        [Theory]
        [InlineData("perfect_phase")]
        [InlineData("save_the_mission")]
        [InlineData("golden_window")]
        public void ChooseMoment_ResetsMeterToZero(string id)
        {
            var m = TeamSync.Empty(C).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold);
            Assert.True(m.MomentReady);
            var after = m.ChooseMoment(id);
            Assert.Equal(0, after.ValuePoints);
            Assert.False(after.MomentReady);
            Assert.Equal(1, after.MomentsChosen);
            Assert.Equal(id, after.LastMomentId);
            Assert.Equal(100, m.ValuePoints); // the original is unchanged
        }

        [Fact]
        public void ChooseMoment_BeforeFull_Throws_AndTryReturnsFalse()
        {
            var m = TeamSync.Empty(C).AddMinigame(Tier.Gold);
            Assert.Throws<InvalidOperationException>(() => m.ChooseMoment("perfect_phase"));
            Assert.False(m.TryChooseMoment("perfect_phase", out var next, out var moment));
            Assert.Null(next);
            Assert.Null(moment);
        }

        [Fact]
        public void ChooseMoment_UnknownId_Throws()
        {
            var m = TeamSync.Empty(C).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold);
            Assert.Throws<ArgumentException>(() => m.ChooseMoment("warp_jump"));
            Assert.False(m.TryChooseMoment("warp_jump", out _, out _));
        }

        [Fact]
        public void GoldenWindow_CarriesTheDoubleScoreMultiplier()
        {
            var m = TeamSync.Empty(C).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold).AddMinigame(Tier.Gold);
            Assert.True(m.TryChooseMoment("golden_window", out _, out var moment));
            Assert.Equal(2.0, moment!.ScoreMultiplierNextPhase);
            Assert.Equal("double_scores_next_phase", moment.Flag);
        }
    }
}
