using System;
using System.Collections.Generic;
using MissionForge.Core.Scoring;
using MissionForge.Net;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Screens.Flight.Tests
{
    public sealed class FlightMinigameHostTests
    {
        private const long T0Ms = 1_794_650_000_000;
        private const ulong Seed = 2026;

        private sealed class FakeChannel : IMinigameChannel
        {
            public long Now = T0Ms;
            public bool Connected = true;
            public List<string> Players = new List<string> { "p1", "p2", "p3" };
            public readonly List<KeyValuePair<string, JObject>> Sent = new List<KeyValuePair<string, JObject>>();

            public event Action<string, string, JObject> Received;
            public bool IsConnected => Connected;
            public IReadOnlyList<string> PlayerIds => Players;
            public long NowMs() => Now;
            public void Send(string type, object payload) => Sent.Add(new KeyValuePair<string, JObject>(type, (JObject)payload));
            public void Raise(string from, string type, JObject data) => Received?.Invoke(from, type, data);

            public List<JObject> SentOf(string type) =>
                Sent.FindAll(kv => kv.Key == type).ConvertAll(kv => kv.Value);
        }

        private static FlightMinigameHost NewHost(FakeChannel ch) =>
            new FlightMinigameHost(FlightTestData.Data.JsonByPath, ch, Seed);

        private static JObject Ready(string runId) => new JObject { ["runId"] = runId };

        private static JObject Result(string runId, bool success, bool perfect) => new JObject
        {
            ["runId"] = runId, ["minigameId"] = "MG-08", ["success"] = success, ["perfect"] = perfect,
            ["score"] = success ? 0.9 : 0.2, ["value"] = JValue.CreateNull(), ["elapsedMs"] = 19000,
            ["finishedAtMs"] = T0Ms + 20000, ["mode"] = "STANDARD",
        };

        private static string StartAndGetRunId(FlightMinigameHost host, FakeChannel ch)
        {
            Assert.IsTrue(host.TryStart("MG-08", "F4"));
            return (string)ch.SentOf(ProtocolNames.Messages.MgStart)[0]["runId"];
        }

        [Test]
        public void Start_SendsCompleteMgStartAtLeastThreeSecondsAhead()
        {
            var ch = new FakeChannel();
            var host = NewHost(ch);

            Assert.IsTrue(host.TryStart("MG-08", "F4"));

            List<JObject> starts = ch.SentOf(ProtocolNames.Messages.MgStart);
            Assert.AreEqual(1, starts.Count);
            JObject d = starts[0];
            StringAssert.IsMatch("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$", (string)d["runId"]);
            Assert.AreEqual("MG-08", (string)d["minigameId"]);
            Assert.AreEqual("PARALLEL_SOLO", (string)d["type"]);
            long seed = d["seed"].Value<long>();
            Assert.That(seed, Is.InRange(0L, (long)uint.MaxValue));
            Assert.GreaterOrEqual(d["startAtMs"].Value<long>(), T0Ms + 3000);
            Assert.That(d["durationMs"].Value<long>(), Is.InRange(5000L, 60000L));
            Assert.AreEqual(20000L, d["durationMs"].Value<long>());
            Assert.AreEqual("ENGINEER", (string)d["assistLevel"]);
            Assert.AreEqual("F4", (string)d["flightPhase"]);
            Assert.AreEqual(false, d["audience"].Value<bool>());
            Assert.IsInstanceOf<JObject>(d["params"]);
            Assert.IsInstanceOf<JArray>(d["assignments"]);
            Assert.AreEqual(0, ((JArray)d["assignments"]).Count);

            Assert.IsNotNull(host.Current);
            Assert.AreEqual(MinigameRunState.Intro, host.Current.State);
            Assert.IsTrue(host.IsBulletTime);
        }

        [Test]
        public void Start_RefusesUnknownIdAndSecondRunWhileActive()
        {
            var ch = new FakeChannel();
            var host = NewHost(ch);

            Assert.IsFalse(host.TryStart("MG-99", "F4"));
            Assert.IsTrue(host.TryStart("MG-08", "F4"));
            Assert.IsFalse(host.TryStart("MG-09", "F5"));

            Assert.AreEqual(1, ch.SentOf(ProtocolNames.Messages.MgStart).Count);
            Assert.AreEqual("MG-08", host.Current.MinigameId);
        }

        [Test]
        public void Close_AllReadyPlayersSucceed_GivesGoldAndClosesEarly()
        {
            var ch = new FakeChannel();
            var host = NewHost(ch);
            string runId = StartAndGetRunId(host, ch);
            foreach (string p in ch.Players) ch.Raise(p, ProtocolNames.Messages.MgReady, Ready(runId));
            ch.Raise("p1", ProtocolNames.Messages.MgResult, Result(runId, true, true));
            ch.Raise("p2", ProtocolNames.Messages.MgResult, Result(runId, true, false));
            ch.Raise("p3", ProtocolNames.Messages.MgResult, Result(runId, true, false));

            long nowMs = T0Ms + 15000; // before the 20 s play time ends
            host.Tick(nowMs);

            List<JObject> summaries = ch.SentOf(ProtocolNames.Messages.MgSummary);
            Assert.AreEqual(1, summaries.Count);
            JObject s = summaries[0];
            Assert.AreEqual(runId, (string)s["runId"]);
            Assert.AreEqual(3, s["active"].Value<int>());
            Assert.AreEqual(3, s["succeeded"].Value<int>());
            Assert.AreEqual(1.0, s["fraction"].Value<double>(), 1e-9);
            Assert.AreEqual("GOLD", (string)s["tier"]);
            Assert.AreEqual(25, s["syncDelta"].Value<int>());
            Assert.AreEqual(200, s["points"].Value<int>());
            Assert.AreEqual(0, ((JArray)s["boosts"]).Count);
            Assert.AreEqual(1, ((JArray)s["perfectIds"]).Count);
            Assert.IsNotNull(s["factId"]);

            Assert.AreEqual(MinigameRunState.Result, host.Current.State);
            Assert.AreEqual(Tier.Gold, host.Current.Tier);
            Assert.IsFalse(host.IsBulletTime);

            host.Tick(nowMs + FlightMinigameHost.ResultHoldMs);
            Assert.IsNull(host.Current);
        }

        [Test]
        public void Close_SomeoneNeverReports_SummarySentAtDeadline()
        {
            var ch = new FakeChannel { Players = new List<string> { "p1", "p2" } };
            var host = NewHost(ch);
            string runId = StartAndGetRunId(host, ch);
            long startAtMs = ch.SentOf(ProtocolNames.Messages.MgStart)[0]["startAtMs"].Value<long>();
            ch.Raise("p1", ProtocolNames.Messages.MgReady, Ready(runId));
            ch.Raise("p2", ProtocolNames.Messages.MgReady, Ready(runId));
            ch.Raise("p1", ProtocolNames.Messages.MgResult, Result(runId, true, false));
            ch.Raise("p2", ProtocolNames.Messages.MgProgress, new JObject { ["runId"] = runId, ["p"] = 0.5 });
            ch.Raise("p2", ProtocolNames.Messages.MgResult, Result("f9.stale", true, true)); // stale run: ignored

            host.Tick(startAtMs + 1000);
            Assert.AreEqual(MinigameRunState.Playing, host.Current.State);
            Assert.AreEqual(0.75, host.Current.Progress01, 1e-9);

            host.Tick(startAtMs + 20000 + 1999);
            Assert.AreEqual(0, ch.SentOf(ProtocolNames.Messages.MgSummary).Count);
            Assert.AreEqual(MinigameRunState.Closing, host.Current.State);

            host.Tick(startAtMs + 20000 + 2000);
            List<JObject> summaries = ch.SentOf(ProtocolNames.Messages.MgSummary);
            Assert.AreEqual(1, summaries.Count);
            Assert.AreEqual(2, summaries[0]["active"].Value<int>());
            Assert.AreEqual(1, summaries[0]["succeeded"].Value<int>());
            Assert.AreEqual("BRONZE", (string)summaries[0]["tier"]);
            Assert.AreEqual(8, summaries[0]["syncDelta"].Value<int>());
            Assert.AreEqual(60, summaries[0]["points"].Value<int>());
        }

        [Test]
        public void Result_SecondResultFromSamePlayerIsIgnored()
        {
            var ch = new FakeChannel { Players = new List<string> { "p1", "p2" } };
            var host = NewHost(ch);
            string runId = StartAndGetRunId(host, ch);
            ch.Raise("p1", ProtocolNames.Messages.MgReady, Ready(runId));
            ch.Raise("p2", ProtocolNames.Messages.MgReady, Ready(runId));
            ch.Raise("p1", ProtocolNames.Messages.MgResult, Result(runId, false, false));
            ch.Raise("p1", ProtocolNames.Messages.MgResult, Result(runId, true, true));
            ch.Raise("p2", ProtocolNames.Messages.MgResult, Result(runId, false, false));

            host.Tick(T0Ms + 10000);

            JObject s = ch.SentOf(ProtocolNames.Messages.MgSummary)[0];
            Assert.AreEqual(0, s["succeeded"].Value<int>());
            Assert.AreEqual("NONE", (string)s["tier"]);
        }

        [Test]
        public void Cancel_SendsMgCancelAndGoesIdle()
        {
            var ch = new FakeChannel();
            var host = NewHost(ch);
            string runId = StartAndGetRunId(host, ch);

            host.Cancel(FlightMinigameHost.CancelReasons.PhaseChange);

            List<JObject> cancels = ch.SentOf(ProtocolNames.Messages.MgCancel);
            Assert.AreEqual(1, cancels.Count);
            Assert.AreEqual(runId, (string)cancels[0]["runId"]);
            Assert.AreEqual("PHASE_CHANGE", (string)cancels[0]["reason"]);
            Assert.IsNull(host.Current);
            Assert.IsTrue(host.TryStart("MG-09", "F5"));
        }

        [Test]
        public void Rehearsal_SameSeedGivesSameSummary()
        {
            JObject a = RunRehearsal(Seed);
            JObject b = RunRehearsal(Seed);

            Assert.IsNotNull(a);
            Assert.AreEqual(4, a["active"].Value<int>());
            Assert.AreEqual(a.ToString(Formatting.None), b.ToString(Formatting.None));
        }

        private static JObject RunRehearsal(ulong seed)
        {
            long nowMs = T0Ms;
            var ch = new RehearsalMinigameChannel(seed, () => nowMs);
            var host = new FlightMinigameHost(FlightTestData.Data.JsonByPath, ch, seed);
            Assert.IsTrue(host.TryStart("MG-08", "F4"));
            for (int i = 0; i < 600 && host.LastSummary == null; i++)
            {
                nowMs += 100;
                ch.Tick(nowMs);
                host.Tick(nowMs);
            }
            return host.LastSummary;
        }
    }
}
