using System.IO;
using System.Linq;
using MissionForge.EndScreens.Investigation;
using MissionForge.Screens.Debrief;
using NUnit.Framework;

namespace MissionForge.EndScreens.Tests
{
    public sealed class InvestigationHostTests
    {
        private static InvestigationSetup Setup(params string[] players)
        {
            ClueTable table = ClueTable.Parse(File.ReadAllText(Path.Combine(EndTestData.ScreensFolder, "Debrief", "Investigation", "Data", "investigation_clues.json")));
            return InvestigationSetup.ForFailure(table, "pogo_oscillation", "F4", "first_stage_engine", 4022UL, players);
        }

        [Test]
        public void RehearsalCrew_SolvesTheCase_AndTheHostLocksAndSummarises()
        {
            double now = 0.0;
            var host = new InvestigationHost(Setup("p1", "p2", "p3", "p4"), null, EndTestData.Adapter.Scoring, () => now, "m1.mg28", 7u, "ENGINEER");

            for (int i = 0; i < 1200 && !host.State.Locked; i++)
            {
                now += 0.05;
                host.Tick();
            }

            Assert.That(host.IsRehearsal, Is.True);
            Assert.That(host.State.Locked, Is.True, "everyone voted before the deadline");
            Assert.That(now, Is.LessThan(host.DeadlineS));
            Assert.That(host.State.Chain, Is.EqualTo(host.Setup.TrueChain), "the crew built the true chain");
            Assert.That(host.State.Votes.Values.All(v => v == host.Setup.CauseCorrect), Is.True, "the wavering player changed their vote");
            var states = host.Outbox.Where(m => m.Key == "mg.state").ToList();
            Assert.That(states.Count, Is.GreaterThan(3));
            for (int i = 1; i < states.Count; i++) Assert.That((int)states[i].Value["n"], Is.GreaterThan((int)states[i - 1].Value["n"]));
            Assert.That(host.Outbox.Count(m => m.Key == "mg.summary"), Is.EqualTo(1));
            Assert.That((int)host.LastSummary["succeeded"], Is.EqualTo(4));
        }

        [Test]
        public void States_AreSentAtMostTenTimesASecond()
        {
            double now = 0.0;
            InvestigationSetup s = Setup("p1", "p2");
            var host = new InvestigationHost(s, null, EndTestData.Adapter.Scoring, () => now, "m1.mg28", 7u, "ENGINEER");
            int card = s.TrueChain[0];
            string owner = s.PlayerIds[s.OwnerSlot(card)];

            host.Act(owner, 100, "place", new double[] { card, 0 });
            host.Tick();
            host.Act(owner, 101, "clear", new double[] { 0 });
            now += 0.02;
            host.Tick();
            int sentEarly = host.Outbox.Count(m => m.Key == "mg.state");
            now += 0.1;
            host.Tick();

            Assert.That(sentEarly, Is.EqualTo(1), "a second change within 0.1 s waits");
            Assert.That(host.Outbox.Count(m => m.Key == "mg.state"), Is.EqualTo(2));
        }
    
        [Test]
        public void EveryoneVoting_DoesNotFreezeTheChain_UntilTheBoardIsQuiet()
        {
            double now = 0.0;
            InvestigationSetup s = Setup("p1", "p2");
            var host = new InvestigationHost(s, null, EndTestData.Adapter.Scoring, () => now, "m1.mg28", 7u, "ENGINEER");
            host.Act("p1", 100, "vote", new double[] { s.CauseCorrect });
            host.Act("p2", 100, "vote", new double[] { s.CauseCorrect });
            now += 1.0;
            host.Tick();
            Assert.That(host.State.Locked, Is.False, "phones send a vote on every tap; the host waits");

            int card = s.TrueChain[0];
            string owner = s.PlayerIds[s.OwnerSlot(card)];
            Assert.That(host.Act(owner, 101, "place", new double[] { card, 0 }), Is.EqualTo(ActionOutcome.Applied));
            now += InvestigationHost.QuietLockS - 0.5;
            host.Tick();
            Assert.That(host.State.Locked, Is.False);
            now += 1.0;
            host.Tick();
            Assert.That(host.State.Locked, Is.True, "locked once nobody has acted for the quiet period");
        }
    }
}
