using MissionForge.App;
using NUnit.Framework;

namespace MissionForge.Tests
{
    public sealed class GamePhaseMachineTests
    {
        [Test]
        public void MainLine_FollowsDesignSection17_3_InOrder()
        {
            GamePhase[] expected =
            {
                GamePhase.Lobby, GamePhase.Briefing, GamePhase.ContractVote, GamePhase.Build,
                GamePhase.Frr, GamePhase.Countdown, GamePhase.Flight, GamePhase.Debrief,
            };

            Assert.That(GamePhaseMachine.MainLine, Is.EqualTo(expected));
            for (int i = 0; i < expected.Length - 1; i++)
            {
                Assert.That(GamePhaseMachine.CanTransition(expected[i], expected[i + 1]), Is.True, expected[i] + " → " + expected[i + 1]);
            }
        }

        [Test]
        public void CanTransition_RejectsSkippingAPhase()
        {
            Assert.That(GamePhaseMachine.CanTransition(GamePhase.Lobby, GamePhase.Build), Is.False);
            Assert.That(GamePhaseMachine.CanTransition(GamePhase.Briefing, GamePhase.Flight), Is.False);
            Assert.That(GamePhaseMachine.CanTransition(GamePhase.Countdown, GamePhase.Debrief), Is.False);
        }

        [Test]
        public void Debrief_LeadsToCampaignHubOrLobby()
        {
            Assert.That(GamePhaseMachine.NextPhases(GamePhase.Debrief), Is.EquivalentTo(new[] { GamePhase.CampaignHub, GamePhase.Lobby }));
        }

        [Test]
        public void Frr_NoGo_ReturnsToBuild()
        {
            Assert.That(GamePhaseMachine.CanTransition(GamePhase.Frr, GamePhase.Build), Is.True);
            Assert.That(GamePhaseMachine.CanTransition(GamePhase.Frr, GamePhase.Countdown), Is.True);
        }

        [Test]
        public void AnyPhase_CanQuitToTitle()
        {
            foreach (GamePhase phase in System.Enum.GetValues(typeof(GamePhase)))
            {
                Assert.That(GamePhaseMachine.CanTransition(phase, GamePhase.Title), Is.True, phase.ToString());
            }
        }

        [Test]
        public void WireName_UsesDesignSpelling()
        {
            Assert.That(GamePhaseMachine.WireName(GamePhase.ContractVote), Is.EqualTo("CONTRACT_VOTE"));
            Assert.That(GamePhaseMachine.WireName(GamePhase.CampaignHub), Is.EqualTo("CAMPAIGN_HUB"));
            Assert.That(GamePhaseMachine.WireName(GamePhase.Frr), Is.EqualTo("FRR"));
        }
    }
}
