using MissionForge.App.Screens;
using MissionForge.Net;
using NUnit.Framework;

namespace MissionForge.Tests
{
    /// <summary>Lobby controls build contract-valid settings.set patches (judging-day settings, RELEASE.md 6.3).</summary>
    public sealed class LobbySettingsPatchTests
    {
        [TestCase("10", 10)]
        [TestCase("60", 60)]
        public void VoteTimer_AcceptsTenToSixtySeconds(string value, int expected)
        {
            SettingsPatchDto patch = LobbyScreen.BuildPatch(ProtocolNames.Fields.VoteTimerS, value);
            Assert.AreEqual(expected, patch.VoteTimerS);
            Assert.IsNull(patch.InspectTimerS);
        }

        [TestCase("9")]
        [TestCase("61")]
        [TestCase("abc")]
        public void VoteTimer_RejectsOutOfRange(string value)
        {
            Assert.IsNull(LobbyScreen.BuildPatch(ProtocolNames.Fields.VoteTimerS, value));
        }

        [TestCase("5", 5)]
        [TestCase("20", 20)]
        [TestCase("60", 60)]
        public void InspectTimer_AcceptsFiveToSixtySeconds(string value, int expected)
        {
            SettingsPatchDto patch = LobbyScreen.BuildPatch(ProtocolNames.Fields.InspectTimerS, value);
            Assert.AreEqual(expected, patch.InspectTimerS);
            Assert.IsNull(patch.VoteTimerS);
        }

        [TestCase("4")]
        [TestCase("61")]
        public void InspectTimer_RejectsOutOfRange(string value)
        {
            Assert.IsNull(LobbyScreen.BuildPatch(ProtocolNames.Fields.InspectTimerS, value));
        }

        [TestCase("0", 0)]
        [TestCase("1", 1)]
        public void AudienceVoteWeight_AcceptsZeroOrOne(string value, int expected)
        {
            Assert.AreEqual(expected, LobbyScreen.BuildPatch(ProtocolNames.Fields.AudienceVoteWeight, value).AudienceVoteWeight);
        }

        [Test]
        public void AudienceVoteWeight_RejectsTwo()
        {
            Assert.IsNull(LobbyScreen.BuildPatch(ProtocolNames.Fields.AudienceVoteWeight, "2"));
        }

        [Test]
        public void UnknownKey_ReturnsNull()
        {
            Assert.IsNull(LobbyScreen.BuildPatch("nope", "1"));
        }

        [Test]
        public void TextSettings_PassThrough()
        {
            Assert.AreEqual("HIDDEN", LobbyScreen.BuildPatch(ProtocolNames.Fields.TallyVisibility, "HIDDEN").TallyVisibility);
        }
    }
}
