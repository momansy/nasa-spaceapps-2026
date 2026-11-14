using System.Collections.Generic;
using System.IO;
using MissionForge.Core.Build;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>
    /// Runs a complete C1 build through the director's message path (Core options → vote.open → rehearsal server →
    /// Core commit → vote.commit + build.state) and writes every payload to <c>&lt;temp&gt;/mf-t015-payloads/</c>, one
    /// JSON line per message, so they can be checked against protocol/schema with a JSON Schema validator
    /// (orchestration/evidence/T015/validate-payloads.mjs).
    /// </summary>
    public sealed class PayloadDumpTests
    {
        public static string Folder => Path.Combine(Path.GetTempPath(), "mf-t015-payloads");

        [Test]
        public void FullC1Build_ProducesProtocolPayloads()
        {
            Directory.CreateDirectory(Folder);
            string file = Path.Combine(Folder, "payloads.jsonl");
            var lines = new List<string>();
            long clock = 1_800_000_000_000;
            var channel = new RehearsalVoteChannel(TestCatalog.Seed, 1f, () => clock);
            var model = new VoteRoundModel();
            channel.Received += (t, d) =>
            {
                lines.Add(JsonConvert.SerializeObject(new JObject { ["t"] = t, ["d"] = d }, Formatting.None));
                model.Apply(t, d);
            };
            var session = new BuildBaySession(TestCatalog.Catalog, BuildState.New("C1", TestCatalog.Seed));
            int round = 0;
            for (string slot = session.NextVote; slot != null; slot = session.NextVote)
            {
                round++;
                IReadOnlyList<VoteOption> options = VoteOptions.For(session.Build, session.Catalog, slot);
                Assert.That(options.Count, Is.GreaterThanOrEqualTo(2), slot);
                string roundId = "m1.b" + round;
                JObject open = VoteMessages.Open(roundId, slot, options, (uint)round);
                lines.Add(JsonConvert.SerializeObject(new JObject { ["t"] = "vote.open", ["d"] = open }, Formatting.None));
                channel.Send("vote.open", open);
                for (int i = 0; i < 600 && model.Stage != "CLOSED"; i++)
                {
                    clock += 100;
                    channel.Tick();
                }
                Assert.That(model.WinnerId, Is.Not.Null, slot);
                OptionPreview applied = null;
                foreach (VoteOption o in options) if (o.Part.Id == model.WinnerId) applied = o.Preview;
                session.Commit(slot, model.WinnerId);
                lines.Add(JsonConvert.SerializeObject(new JObject { ["t"] = "vote.commit", ["d"] = VoteMessages.Commit(roundId, model.WinnerId, applied) }, Formatting.None));
                lines.Add(JsonConvert.SerializeObject(new JObject { ["t"] = "build.state", ["d"] = VoteMessages.BuildState(session.Build, session.Catalog, session.Metrics) }, Formatting.None));
                Assert.That(round, Is.LessThan(40));
            }
            File.WriteAllLines(file, lines);
            TestContext.WriteLine(lines.Count + " payloads, " + round + " rounds → " + file);
            Assert.That(round, Is.EqualTo(VoteOptions.VotesFor(TestCatalog.Catalog.Contract("C1")).Count));
        }
    }
}
