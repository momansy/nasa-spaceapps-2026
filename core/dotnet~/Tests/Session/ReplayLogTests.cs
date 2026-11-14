using System;
using MissionForge.Core.Session;
using Xunit;

namespace MissionForge.Core.Tests.Session
{
    /// <summary>Design 17.6: the replay log. Parse then write is byte-identical; seq strictly increases; flight ticks never decrease.</summary>
    public class ReplayLogTests
    {
        private static ReplayLogWriter NewWriter() =>
            new ReplayLogWriter(new ReplayHeader(18446744073709551615UL, "C1", "QUICK", "engineer", "sha256:abc123"));

        private static ReplayLogWriter Sample()
        {
            var w = NewWriter();
            w.Append(ReplayKinds.Phase, -1, "{\"phase\":\"BUILD\",\"sub\":\"VOTE_ROUND\"}");
            w.Append(ReplayKinds.VoteResult, -1, "{ \"slot\" : \"upper_stage_engine\", \"winner\":\"eng_kerolox_vacuum\", \"tally\":[3,1] }");
            w.Append(ReplayKinds.BuildAction, -1, "{\"action\":\"test\",\"test\":\"engine_hot_fire\"}");
            w.Append(ReplayKinds.PilotInput, 0, "{\"throttle\":1.0,\"pitch\":1.5707963267948966}");
            w.Append(ReplayKinds.PilotInput, 120, "{\"throttle\":0.85,\"pitch\":1.2}");
            w.Append(ReplayKinds.PilotAction, 120, "{\"stage\":true}");
            w.Append(ReplayKinds.MgSummary, 360, "{\"minigameId\":\"MG-08\",\"tier\":\"GOLD\",\"note\":\"café \\\"quoted\\\" — ok\"}");
            w.Append(ReplayKinds.Callout, 361, "{\"text\":\"THROTTLE DOWN\"}");
            w.Append(ReplayKinds.Abort, 900, "{\"mode\":\"pad_abort\"}");
            w.Append(ReplayKinds.McmChoice, 901, "{\"moment\":\"golden_window\"}");
            w.Append(ReplayKinds.Phase, -1, "{\"phase\":\"DEBRIEF\"}");
            return w;
        }

        [Fact]
        public void KindConstants_AreTheNineOfTheBrief()
        {
            Assert.Equal(new[] { "vote_result", "build_action", "pilot_input", "pilot_action", "mg_summary", "callout", "abort", "mcm_choice", "phase" },
                ReplayKinds.All);
            foreach (var k in ReplayKinds.All) Assert.True(ReplayKinds.IsKnown(k));
            Assert.False(ReplayKinds.IsKnown("chat"));
        }

        [Fact]
        public void ParseThenToJson_IsByteIdentical()
        {
            var json = Sample().ToJson();
            var again = ReplayLog.Parse(json).ToJson();
            Assert.Equal(json, again);
            // and a second round trip
            Assert.Equal(json, ReplayLog.Parse(again).ToJson());
        }

        [Fact]
        public void Header_RoundTrips_IncludingASeedAbove2To53()
        {
            var log = ReplayLog.Parse(Sample().ToJson());
            Assert.Equal(18446744073709551615UL, log.Header.Seed);
            Assert.Equal("C1", log.Header.ContractId);
            Assert.Equal("QUICK", log.Header.Mode);
            Assert.Equal("engineer", log.Header.AssistLevelId);
            Assert.Equal("sha256:abc123", log.Header.DataHash);
        }

        [Fact]
        public void Entries_KeepSeqTickKindAndCompactPayload()
        {
            var log = ReplayLog.Parse(Sample().ToJson());
            Assert.Equal(11, log.Entries.Count);
            for (var i = 0; i < log.Entries.Count; i++) Assert.Equal(i + 1, log.Entries[i].Seq);
            Assert.Equal(-1, log.Entries[0].Tick);
            Assert.Equal("vote_result", log.Entries[1].Kind);
            // white space inside the caller's payload is removed, property order is kept
            Assert.Equal("{\"slot\":\"upper_stage_engine\",\"winner\":\"eng_kerolox_vacuum\",\"tally\":[3,1]}", log.Entries[1].PayloadJson);
            Assert.Equal(120, log.Entries[4].Tick);
            Assert.Contains("café", log.Entries[6].PayloadJson);
        }

        [Fact]
        public void Writer_AssignsSeqFromOne_AndReturnsIt()
        {
            var w = NewWriter();
            Assert.Equal(1, w.Append("phase", -1, "{}"));
            Assert.Equal(2, w.Append("phase", -1, null));
            Assert.Equal(3, w.Append("phase", 5, ""));
            Assert.Equal(3, w.Count);
            Assert.Equal("{}", w.ToLog().Entries[1].PayloadJson);
        }

        [Fact]
        public void FlightTicks_NeverDecrease_ButMinusOneIsAlwaysAllowed()
        {
            var w = NewWriter();
            w.Append("pilot_input", 100, "{}");
            w.Append("phase", -1, "{}");                  // outside flight: fine after a flight tick
            w.Append("pilot_input", 100, "{}");           // equal is fine
            Assert.Throws<ArgumentException>(() => w.Append("pilot_input", 99, "{}"));
            Assert.Equal(3, w.Count);                      // the rejected entry was not added
            w.Append("pilot_input", 101, "{}");
        }

        [Fact]
        public void BadKindTickOrPayload_Throws_AndAddsNothing()
        {
            var w = NewWriter();
            Assert.Throws<ArgumentException>(() => w.Append("", 0, "{}"));
            Assert.Throws<ArgumentException>(() => w.Append("Phase", 0, "{}"));
            Assert.Throws<ArgumentException>(() => w.Append("two words", 0, "{}"));
            Assert.Throws<ArgumentException>(() => w.Append("phase", -2, "{}"));
            Assert.Throws<ArgumentException>(() => w.Append("phase", 0, "{not json"));
            Assert.Throws<ArgumentException>(() => w.Append("phase", 0, "{} {}"));
            Assert.Equal(0, w.Count);
        }

        [Fact]
        public void NumbersAndStringsInPayloads_SurviveTheRoundTrip()
        {
            var w = NewWriter();
            w.Append("pilot_input", 0, "{\"a\":0.1,\"b\":1e-7,\"c\":123456789012,\"d\":-0.5,\"e\":\"2026-11-15T10:00:00Z\",\"f\":null,\"g\":[],\"h\":{}}");
            var json = w.ToJson();
            Assert.Equal(json, ReplayLog.Parse(json).ToJson());
            Assert.Contains("\"e\":\"2026-11-15T10:00:00Z\"", json);   // date-like strings are not reformatted
            Assert.Contains("123456789012", json);
        }

        [Fact]
        public void ScalarAndArrayPayloads_AreAllowed()
        {
            var w = NewWriter();
            w.Append("callout", -1, "\"hello\"");
            w.Append("callout", -1, "[1,2,3]");
            w.Append("callout", -1, "42");
            var json = w.ToJson();
            Assert.Equal(json, ReplayLog.Parse(json).ToJson());
        }

        [Fact]
        public void EmptyLog_RoundTrips()
        {
            var json = NewWriter().ToJson();
            Assert.Equal("{\"version\":1,\"header\":{\"seed\":\"18446744073709551615\",\"contract\":\"C1\",\"mode\":\"QUICK\",\"assist\":\"engineer\",\"dataHash\":\"sha256:abc123\"},\"entries\":[]}", json);
            Assert.Empty(ReplayLog.Parse(json).Entries);
            Assert.Equal(json, ReplayLog.Parse(json).ToJson());
        }

        [Fact]
        public void SameAppends_GiveIdenticalText()
        {
            Assert.Equal(Sample().ToJson(), Sample().ToJson());
        }

        [Theory]
        [InlineData("not json")]
        [InlineData("[]")]
        [InlineData("{}")]
        [InlineData("{\"version\":2,\"header\":{},\"entries\":[]}")]
        [InlineData("{\"version\":1,\"header\":{\"seed\":\"x\",\"contract\":\"C1\",\"mode\":\"QUICK\",\"assist\":\"engineer\",\"dataHash\":\"h\"},\"entries\":[]}")]
        [InlineData("{\"version\":1,\"header\":{\"seed\":\"1\",\"contract\":\"C1\",\"mode\":\"QUICK\",\"assist\":\"engineer\",\"dataHash\":\"h\"}}")]
        // seq does not increase
        [InlineData("{\"version\":1,\"header\":{\"seed\":\"1\",\"contract\":\"C1\",\"mode\":\"QUICK\",\"assist\":\"engineer\",\"dataHash\":\"h\"},\"entries\":[{\"seq\":2,\"tick\":-1,\"kind\":\"phase\",\"payload\":{}},{\"seq\":2,\"tick\":-1,\"kind\":\"phase\",\"payload\":{}}]}")]
        // flight tick decreases
        [InlineData("{\"version\":1,\"header\":{\"seed\":\"1\",\"contract\":\"C1\",\"mode\":\"QUICK\",\"assist\":\"engineer\",\"dataHash\":\"h\"},\"entries\":[{\"seq\":1,\"tick\":50,\"kind\":\"phase\",\"payload\":{}},{\"seq\":2,\"tick\":49,\"kind\":\"phase\",\"payload\":{}}]}")]
        // no payload
        [InlineData("{\"version\":1,\"header\":{\"seed\":\"1\",\"contract\":\"C1\",\"mode\":\"QUICK\",\"assist\":\"engineer\",\"dataHash\":\"h\"},\"entries\":[{\"seq\":1,\"tick\":-1,\"kind\":\"phase\"}]}")]
        // bad kind
        [InlineData("{\"version\":1,\"header\":{\"seed\":\"1\",\"contract\":\"C1\",\"mode\":\"QUICK\",\"assist\":\"engineer\",\"dataHash\":\"h\"},\"entries\":[{\"seq\":1,\"tick\":-1,\"kind\":\"Phase\",\"payload\":{}}]}")]
        public void Parse_RejectsBadLogs(string json)
        {
            Assert.Throws<FormatException>(() => ReplayLog.Parse(json));
        }
    }
}
