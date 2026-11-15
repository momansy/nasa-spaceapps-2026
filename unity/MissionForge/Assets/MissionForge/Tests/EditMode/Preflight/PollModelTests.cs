using MissionForge.Core.Build;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Screens.Preflight.Tests
{
    public sealed class PollModelTests
    {
        private static JObject Call(string id, int i, int n, string player, params string[] roles) => new JObject
        {
            ["pollId"] = id, ["context"] = "FRR", ["round"] = 1, ["index"] = i, ["total"] = n, ["playerId"] = player,
            ["roles"] = new JArray(roles), ["endsAtMs"] = 1000L * (i + 5),
        };

        private static JObject Answered(string id, string player, string answer, params string[] roles) => new JObject
        {
            ["pollId"] = id,
            ["entry"] = new JObject { ["playerId"] = player, ["roles"] = new JArray(roles), ["answer"] = answer },
        };

        [Test]
        public void Messages_MapToConsoleStates()
        {
            var m = new PollModel();
            m.Begin("m1.frr.1", "FRR", 1, new[] { "BOOSTER", "STRUCT", "GUIDO", "FLIGHT" }, 5000, 0);
            Assert.IsTrue(m.IsActive);
            Assert.IsNull(m.AnswerOf("BOOSTER"), "waiting consoles have no answer");

            m.Apply("poll.call", Call("m1.frr.1", 1, 2, "p2", "BOOSTER", "STRUCT"), 100);
            Assert.IsTrue(m.IsBeingCalled("STRUCT"));
            Assert.AreEqual(6000, m.CallEndsAtMs);

            m.Apply("poll.answered", Answered("m1.frr.1", "p2", "GO", "BOOSTER", "STRUCT"), 200);
            Assert.AreEqual("GO", m.AnswerOf("STRUCT"));
            Assert.IsFalse(m.IsBeingCalled("STRUCT"));

            m.Apply("poll.call", Call("m1.frr.1", 2, 2, "p3", "GUIDO"), 300);
            m.Apply("poll.answered", Answered("m1.frr.1", "p3", "NO_GO", "GUIDO"), 400);
            Assert.AreEqual("NO_GO", m.AnswerOf("GUIDO"));
            Assert.IsNull(m.AnswerOf("FLIGHT"));
        }

        [Test]
        public void Result_ListsNoAnswerForDisconnectedAndIgnoresOtherPolls()
        {
            var m = new PollModel();
            m.Begin("a", "FRR", 1, new[] { "BOOSTER", "FLIGHT" }, 5000, 0);
            Assert.IsFalse(m.Apply("poll.call", Call("other", 1, 1, "p1", "FLIGHT"), 0), "another poll id is ignored");
            m.Apply("poll.result", new JObject
            {
                ["pollId"] = "a", ["context"] = "FRR", ["round"] = 1, ["outcomeSeq"] = 4, ["allGo"] = true, ["noGoCount"] = 0,
                ["answers"] = new JArray
                {
                    new JObject { ["playerId"] = "p1", ["roles"] = new JArray("FLIGHT"), ["answer"] = "GO" },
                    new JObject { ["playerId"] = "p2", ["roles"] = new JArray("BOOSTER"), ["answer"] = "NO_ANSWER" },
                },
            }, 0);
            Assert.IsFalse(m.IsActive);
            Assert.AreEqual("NO_ANSWER", m.AnswerOf("BOOSTER"));
            m.Result.CountConsoles(out int go, out int noGo);
            Assert.AreEqual(1, go);
            Assert.AreEqual(0, noGo);
        }

        [Test]
        public void FrrPollOutcomes_GoOneNoGoTwoNoGo_FollowCore()
        {
            FrrPoll poll = FrrPoll.Start;
            (PollOutcome a, FrrPoll p1) = poll.Record(9, 0);
            Assert.AreEqual(PollOutcome.Go, a);
            (PollOutcome b, FrrPoll p2) = poll.Record(8, 1);
            Assert.AreEqual(PollOutcome.DiscussAndRepoll, b);
            (PollOutcome c, FrrPoll p3) = p2.Record(7, 2);
            Assert.AreEqual(PollOutcome.ReworkOffered, c);
            (PollOutcome d, _) = p2.Record(10, 0);
            Assert.AreEqual(PollOutcome.Go, d, "a clean second round after one NO-GO round proceeds");
        }
    }
}
