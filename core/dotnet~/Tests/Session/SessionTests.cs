using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Session;
using MissionForge.Core.Tests.Data;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MissionForge.Core.Tests.Session
{
    public class SessionMachineTests
    {
        private static SessionState At(string phase, string? sub = null, string? review = null, string? flight = null, string? contract = "C1")
        {
            // Walk the legal path to the requested phase.
            var s = SessionState.Initial("STANDARD", 7UL);
            if (contract != null) s = s.WithContract(contract);
            var path = new Dictionary<string, string[]>
            {
                [Phases.Lobby] = new string[0],
                [Phases.Briefing] = new[] { Phases.Briefing },
                [Phases.ContractVote] = new[] { Phases.Briefing, Phases.ContractVote },
                [Phases.Build] = new[] { Phases.Briefing, Phases.ContractVote, Phases.Build },
                [Phases.Frr] = new[] { Phases.Briefing, Phases.ContractVote, Phases.Build, Phases.Frr },
                [Phases.Countdown] = new[] { Phases.Briefing, Phases.ContractVote, Phases.Build, Phases.Frr, Phases.Countdown },
                [Phases.Flight] = new[] { Phases.Briefing, Phases.ContractVote, Phases.Build, Phases.Frr, Phases.Countdown, Phases.Flight },
                [Phases.Debrief] = new[] { Phases.Briefing, Phases.ContractVote, Phases.Build, Phases.Frr, Phases.Countdown, Phases.Flight, Phases.Debrief },
                [Phases.CampaignHub] = new[] { Phases.Briefing, Phases.ContractVote, Phases.Build, Phases.Frr, Phases.Countdown, Phases.Flight, Phases.Debrief, Phases.CampaignHub },
            };
            foreach (var p in path[phase])
            {
                var r = SessionMachine.TryTransition(s, p, p == phase ? sub : null, p == phase ? review : null,
                    p == Phases.Countdown ? "F0" : p == Phases.Flight ? (p == phase ? flight ?? "F2" : "F2") : null);
                Assert.True(r.IsOk, r.Error);
                s = r.State!;
            }
            return s;
        }

        private static readonly Dictionary<string, string[]> Table = new Dictionary<string, string[]>
        {
            [Phases.Lobby] = new[] { Phases.Briefing },
            [Phases.Briefing] = new[] { Phases.ContractVote, Phases.Build, Phases.Lobby },
            [Phases.ContractVote] = new[] { Phases.Build, Phases.Lobby },
            [Phases.Build] = new[] { Phases.Frr, Phases.Lobby },
            [Phases.Frr] = new[] { Phases.Countdown, Phases.Build, Phases.Lobby },
            [Phases.Countdown] = new[] { Phases.Flight, Phases.Frr, Phases.Debrief, Phases.Lobby },
            [Phases.Flight] = new[] { Phases.Debrief, Phases.Lobby },
            [Phases.Debrief] = new[] { Phases.CampaignHub, Phases.Lobby, Phases.Build },
            [Phases.CampaignHub] = new[] { Phases.Briefing, Phases.Lobby },
        };

        private static (string? sub, string? review, string? flight) ValidFieldsFor(string phase) =>
            phase == Phases.Frr ? (null, "FRR", null)
            : phase == Phases.Countdown ? (null, null, "F0")
            : phase == Phases.Flight ? (null, null, "F2")
            : (null, null, null);

        [Fact]
        public void EveryPairOfPhasesIsLegalExactlyWhenTheTableSaysSo()
        {
            foreach (var from in Table.Keys)
                foreach (var to in Table.Keys)
                {
                    if (from == to) continue;
                    var state = At(from);
                    var f = ValidFieldsFor(to);
                    var r = SessionMachine.TryTransition(state, to, f.sub, f.review, f.flight);
                    Assert.Equal(Table[from].Contains(to), r.IsOk);
                    if (!r.IsOk) Assert.Contains("illegal transition", r.Error);
                }
        }

        [Fact]
        public void FullMissionWalkThrough()
        {
            var s = SessionState.Initial("STANDARD", 1234UL);
            Assert.Equal(0, s.MissionSeq);
            SessionState Go(string phase, string? sub = null, string? review = null, string? flight = null)
            {
                var r = SessionMachine.TryTransition(s, phase, sub, review, flight);
                Assert.True(r.IsOk, r.Error);
                return s = r.State!;
            }
            Go(Phases.Briefing);
            Assert.Equal(1, s.MissionSeq);
            Go(Phases.ContractVote);
            s = s.WithContract("C1");
            Go(Phases.Build);
            Go(Phases.Build, SubStates.VoteRound);
            Go(Phases.Build, SubStates.Review, Reviews.Pdr);
            Go(Phases.Build, SubStates.Test);
            Go(Phases.Build, SubStates.Anomaly);
            Go(Phases.Build, SubStates.Review, Reviews.Cdr);
            Go(Phases.Frr);
            Assert.Equal(Reviews.Frr, s.Review);
            Go(Phases.Countdown, flight: "F0");
            Go(Phases.Countdown, flight: "F1");
            Go(Phases.Flight, flight: "F2");
            Assert.Equal(Segments.Ascent, s.Segment);
            Assert.Equal(SubStates.Flying, s.Sub);
            foreach (var f in new[] { "F3", "F4", "F5", "F6", "F7", "F7b", "F8", "F9", "F10", "F11", "F12", "F13" })
                Go(Phases.Flight, flight: f);
            Go(Phases.Flight, SubStates.Abort, flight: "F13");
            Go(Phases.Debrief);
            Assert.Equal(SubStates.Summary, s.Sub);
            Go(Phases.Debrief, SubStates.Investigation);
            Go(Phases.Build);     // retry (9.9)
            Assert.Equal(2, s.MissionSeq);
            Assert.Equal("C1", s.ContractId);
            Assert.Equal(1234UL, s.Seed);
            Assert.Equal("STANDARD", s.Mode);
        }

        [Theory]
        [InlineData("F2", Segments.Ascent)] [InlineData("F5", Segments.Ascent)] [InlineData("F7", Segments.Ascent)] [InlineData("F7b", Segments.Ascent)]
        [InlineData("F8", Segments.Orbit)] [InlineData("F9", Segments.Orbit)]
        [InlineData("F10", Segments.Entry)] [InlineData("F11", Segments.Entry)]
        [InlineData("F12", Segments.Landing)] [InlineData("F13", Segments.Landing)]
        public void SegmentIsDerivedFromTheFlightPhase(string flight, string segment)
        {
            var r = SessionMachine.TryTransition(At(Phases.Countdown), Phases.Flight, null, null, flight);
            Assert.True(r.IsOk, r.Error);
            Assert.Equal(segment, r.State!.Segment);
        }

        [Fact]
        public void MissionSeqRisesOnNewMissionAndRetryOnly()
        {
            var s = At(Phases.Debrief);                  // first mission: seq 1
            Assert.Equal(1, s.MissionSeq);
            var hub = SessionMachine.TryTransition(s, Phases.CampaignHub).State!;
            Assert.Equal(1, hub.MissionSeq);
            var next = SessionMachine.TryTransition(hub, Phases.Briefing).State!;   // new mission
            Assert.Equal(2, next.MissionSeq);
            var lobbyAgain = SessionMachine.TryTransition(next, Phases.Lobby).State!;
            Assert.Equal(2, lobbyAgain.MissionSeq);
            Assert.Equal(3, SessionMachine.TryTransition(lobbyAgain, Phases.Briefing).State!.MissionSeq);
            var retry = SessionMachine.TryTransition(s, Phases.Build).State!;       // DEBRIEF -> BUILD
            Assert.Equal(2, retry.MissionSeq);
            Assert.Equal(1, s.MissionSeq); // immutable
        }

        [Fact]
        public void ChangingFieldsInsideAPhaseKeepsTheSeq()
        {
            var b = At(Phases.Build);
            var t = SessionMachine.TryTransition(b, Phases.Build, SubStates.Test).State!;
            Assert.Equal(b.MissionSeq, t.MissionSeq);
        }

        [Theory]
        [InlineData(Phases.Lobby, "NONE", "PDR", null)]
        [InlineData(Phases.Briefing, "VOTE_ROUND", null, null)]
        [InlineData(Phases.Build, "REVIEW", null, null)]       // review phase without a review
        [InlineData(Phases.Build, "REVIEW", "FRR", null)]      // BUILD review is PDR or CDR
        [InlineData(Phases.Build, "TEST", "PDR", null)]        // review set without REVIEW
        [InlineData(Phases.Build, "FLYING", null, null)]
        [InlineData(Phases.Build, "NONE", null, "F2")]
        public void BadFieldCombinationsAreRejected(string phase, string sub, string? review, string? flight)
        {
            var from = phase == Phases.Lobby ? SessionState.Initial("STANDARD", 1) : At(Phases.Briefing);
            var target = phase == Phases.Lobby ? Phases.Lobby : phase;
            var r = SessionMachine.TryTransition(at(phase, from), target, sub, review, flight);
            Assert.False(r.IsOk);

            SessionState at(string p, SessionState s) => p == Phases.Build ? At(Phases.Build) : s;
        }

        [Fact]
        public void FlightAndCountdownFieldsAreChecked()
        {
            Assert.False(SessionMachine.TryTransition(At(Phases.Frr), Phases.Countdown, null, null, "F2").IsOk);   // COUNTDOWN is F0 or F1
            Assert.False(SessionMachine.TryTransition(At(Phases.Frr), Phases.Countdown).IsOk);                    // missing flight phase
            Assert.False(SessionMachine.TryTransition(At(Phases.Countdown), Phases.Flight, null, null, "F14").IsOk);
            Assert.False(SessionMachine.TryTransition(At(Phases.Countdown), Phases.Flight, null, null, "F1").IsOk);
            Assert.False(SessionMachine.TryTransition(At(Phases.Countdown), Phases.Flight, SubStates.Summary, null, "F2").IsOk);
            Assert.False(SessionMachine.TryTransition(At(Phases.Flight), Phases.Debrief, SubStates.Flying).IsOk);
            Assert.False(SessionMachine.TryTransition(At(Phases.Build), Phases.Frr, null, Reviews.Pdr).IsOk);     // FRR phase needs review FRR
        }

        [Fact]
        public void BuildNeedsAContract()
        {
            var s = SessionMachine.TryTransition(SessionState.Initial("STANDARD", 1), Phases.Briefing).State!;
            var r = SessionMachine.TryTransition(s, Phases.Build);
            Assert.False(r.IsOk);
            Assert.Contains("contract", r.Error);
            Assert.True(SessionMachine.TryTransition(s.WithContract("C0"), Phases.Build).IsOk);
        }

        [Fact]
        public void UnknownPhaseIsAnError() =>
            Assert.False(SessionMachine.TryTransition(SessionState.Initial("STANDARD", 1), "NOPE").IsOk);

        [Fact]
        public void IllegalMovesNamedInTheBrief()
        {
            Assert.False(SessionMachine.TryTransition(At(Phases.Lobby), Phases.Build).IsOk);
            Assert.False(SessionMachine.TryTransition(At(Phases.Build), Phases.Flight, null, null, "F2").IsOk);
            Assert.False(SessionMachine.TryTransition(At(Phases.Flight), Phases.Build).IsOk);
            Assert.False(SessionMachine.TryTransition(At(Phases.Debrief), Phases.Briefing).IsOk);
            Assert.True(SessionMachine.TryTransition(At(Phases.Countdown), Phases.Frr, null, "FRR").IsOk); // scrub
            Assert.True(SessionMachine.TryTransition(At(Phases.Countdown), Phases.Debrief).IsOk);          // pad abort
        }

        [Fact]
        public void SameStateAndInputGiveTheSameNextState()
        {
            var a = SessionMachine.TryTransition(At(Phases.Build), Phases.Frr).State!;
            var b = SessionMachine.TryTransition(At(Phases.Build), Phases.Frr).State!;
            Assert.Equal((a.MissionSeq, a.Phase, a.Sub, a.Review, a.ContractId, a.Seed), (b.MissionSeq, b.Phase, b.Sub, b.Review, b.ContractId, b.Seed));
        }
    }

    public class ReplayLogTests
    {
        private static ReplayLogWriter Writer() => new ReplayLogWriter(new ReplayHeader(18446744073709551615UL, "C1", "STANDARD", "engineer", "sha256:abc123"));

        [Fact]
        public void ParseOfToJsonIsByteIdentical()
        {
            var w = Writer();
            w.Append(ReplayKinds.Phase, -1, "{\"phase\":\"BUILD\"}");
            w.Append(ReplayKinds.VoteResult, -1, "{\"round\":\"m1.part.1\",\"winner\":\"site_equatorial_spaceport\"}");
            w.Append(ReplayKinds.PilotInput, 0, "{\"throttle\":1.0,\"note\":\"quote \\\" and ünïcode\\n\"}");
            w.Append(ReplayKinds.PilotInput, 120, "{}");
            w.Append(ReplayKinds.MgSummary, 600, "[1,2,3]");
            w.Append(ReplayKinds.Phase, -1, "\"DEBRIEF\"");
            var json = w.ToJson();
            var parsed = ReplayLog.Parse(json);
            Assert.Equal(json, parsed.ToJson());
            Assert.Equal(6, parsed.Entries.Count);
            Assert.Equal(18446744073709551615UL, parsed.Header.Seed);
            Assert.Equal("C1", parsed.Header.ContractId);
            Assert.Equal("STANDARD", parsed.Header.Mode);
            Assert.Equal("engineer", parsed.Header.AssistLevel);
            Assert.Equal("sha256:abc123", parsed.Header.DataHash);
        }

        [Fact]
        public void PayloadIsKeptVerbatim()
        {
            var w = Writer();
            const string payload = "{ \"a\" : 1,\n  \"b\":[ 2 , 3 ] }";
            w.Append(ReplayKinds.Callout, 5, payload);
            Assert.Equal(payload, ReplayLog.Parse(w.ToJson()).Entries[0].PayloadJson);
        }

        [Fact]
        public void SeqIsAssignedAndStrictlyIncreases()
        {
            var w = Writer();
            for (int i = 0; i < 5; i++) w.Append(ReplayKinds.BuildAction, -1, "{}");
            Assert.Equal(new[] { 1, 2, 3, 4, 5 }, w.Entries.Select(e => e.Seq).ToArray());
        }

        [Fact]
        public void FlightTicksNeverDecrease()
        {
            var w = Writer();
            w.Append(ReplayKinds.PilotInput, 100, "{}");
            w.Append(ReplayKinds.PilotInput, 100, "{}");   // equal is fine
            w.Append(ReplayKinds.Phase, -1, "{}");         // -1 marks entries outside flight (decision)
            Assert.Throws<ArgumentException>(() => w.Append(ReplayKinds.PilotInput, 99, "{}"));
            Assert.Equal(3, w.Entries.Count);              // the bad entry was not added
        }

        [Fact]
        public void UnknownKindAndBadTickAreRejected()
        {
            var w = Writer();
            Assert.Throws<ArgumentException>(() => w.Append("made_up", 0, "{}"));
            Assert.Throws<ArgumentException>(() => w.Append(ReplayKinds.Phase, -2, "{}"));
            Assert.Empty(w.Entries);
        }

        [Fact]
        public void EveryKindConstantIsAccepted()
        {
            var w = Writer();
            foreach (var k in new[] { "vote_result", "build_action", "pilot_input", "pilot_action", "mg_summary", "callout", "abort", "mcm_choice", "phase" })
                w.Append(k, -1, "{}");
            Assert.Equal(9, w.Entries.Count);
            Assert.Equal(9, ReplayKinds.All.Count);
        }

        [Fact]
        public void ParseRejectsBrokenLogs()
        {
            var good = JObject.Parse(Writer().ToJson());
            Assert.Throws<CatalogException>(() => ReplayLog.Parse("not json"));
            Assert.Throws<CatalogException>(() => ReplayLog.Parse("{}"));

            var w = Writer(); w.Append(ReplayKinds.Phase, -1, "{}"); w.Append(ReplayKinds.Phase, -1, "{}");
            var dupSeq = JObject.Parse(w.ToJson()); dupSeq["entries"]![1]!["seq"] = 1;
            Assert.Throws<CatalogException>(() => ReplayLog.Parse(dupSeq.ToString()));

            var w2 = Writer(); w2.Append(ReplayKinds.PilotInput, 10, "{}"); w2.Append(ReplayKinds.PilotInput, 20, "{}");
            var back = JObject.Parse(w2.ToJson()); back["entries"]![1]!["tick"] = 5;
            Assert.Throws<CatalogException>(() => ReplayLog.Parse(back.ToString()));

            var kind = JObject.Parse(w.ToJson()); kind["entries"]![0]!["kind"] = "bogus";
            Assert.Throws<CatalogException>(() => ReplayLog.Parse(kind.ToString()));
            Assert.NotNull(good);
        }

        [Fact]
        public void SameEntriesGiveTheSameBytes()
        {
            string Run() { var w = Writer(); w.Append(ReplayKinds.Abort, 240, "{\"mode\":\"pad\"}"); return w.ToJson(); }
            Assert.Equal(Run(), Run());
        }

        [Fact]
        public void EmptyLogRoundTrips()
        {
            var json = Writer().ToJson();
            Assert.Equal(json, ReplayLog.Parse(json).ToJson());
        }
    }

    public class FailForwardTests
    {
        private static List<string> SchemaFailureModes()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "data", "schema", "common.schema.json"))) dir = dir.Parent;
            var json = JObject.Parse(File.ReadAllText(Path.Combine(dir!.FullName, "data", "schema", "common.schema.json")));
            return json["$defs"]!["failure_mode"]!["enum"]!.Select(t => t.Value<string>()!).ToList();
        }

        [Fact]
        public void FailureModesMatchTheSchema() => Assert.Equal(SchemaFailureModes(), FailureModes.All);

        [Fact]
        public void LessonCoversAllFourteenModes()
        {
            Assert.Equal(14, FailureModes.All.Count);
            foreach (var mode in SchemaFailureModes())
            {
                var card = LessonsLearned.For(mode);
                Assert.Equal("lesson_" + mode, card.Id);
                Assert.Equal(mode, card.FailureModeId);
                Assert.Contains(card.Effects, e => e.Kind == LessonEffectKind.BuildFlag && e.Value == "risk_cleared:" + mode);
                Assert.Contains(card.Effects, e => e.Kind == LessonEffectKind.FreeTest);
            }
        }

        [Fact]
        public void LessonFreeTestsAreRealTests()
        {
            var catalog = DesignFixture.Catalog();
            foreach (var mode in FailureModes.All)
                foreach (var e in LessonsLearned.For(mode).Effects.Where(x => x.Kind == LessonEffectKind.FreeTest))
                    Assert.NotNull(catalog.Test(e.Value));
        }

        [Fact]
        public void UnknownModeThrows()
        {
            Assert.Throws<ArgumentException>(() => LessonsLearned.For("nope"));
            Assert.Throws<ArgumentException>(() => Investigation.Open("nope", "F5", "slot", 1));
        }

        [Fact]
        public void InvestigationHasRootCauseThreeDistinctDistractorsAndClues()
        {
            foreach (var mode in FailureModes.All)
            {
                var c = Investigation.Open(mode, "F5", "upper_stage_engine", 2026UL);
                Assert.Equal(mode, c.RootCauseId);
                Assert.Equal(3, c.DistractorIds.Count);
                Assert.Equal(3, c.DistractorIds.Distinct().Count());
                Assert.DoesNotContain(mode, c.DistractorIds);
                Assert.All(c.DistractorIds, d => Assert.Contains(d, FailureModes.All));
                Assert.Equal(4, c.OptionIds.Count);
                Assert.Equal(4, c.OptionIds.Distinct().Count());
                Assert.Contains(mode, c.OptionIds);
                Assert.Equal(3, c.ClueChannelIds.Count);
            }
        }

        [Fact]
        public void InvestigationIsDeterministicAndVariesWithTheSeed()
        {
            string Dump(ulong seed) { var c = Investigation.Open("pogo_oscillation", "F4", "first_stage_engine", seed); return string.Join(",", c.OptionIds); }
            Assert.Equal(Dump(5), Dump(5));
            Assert.True(Enumerable.Range(1, 30).Select(s => Dump((ulong)s)).Distinct().Count() > 1);
        }

        [Fact]
        public void RetryKeepsEveryChoiceExceptTheFailedSlotWithTheSameContract()
        {
            var catalog = DesignFixture.Catalog();
            var parts = catalog.PartsInOrder.GroupBy(p => p.Category).Select(g => g.First()).Take(4).ToList();
            Assert.True(parts.Count >= 3);
            var prev = BuildState.New("C1", 11UL);
            foreach (var p in parts) prev = prev.WithVoteResolved(p.Category, p.Id);
            prev = prev.WithLedger(new LedgerEntry(LedgerKind.Test, "t", 2.0, 3.0, category: parts[0].Category))
                       .WithLedger(new LedgerEntry(LedgerKind.Test, "t", 5.0, 1.0, category: parts[1].Category));
            var failed = parts[1].Category;

            var lesson = LessonsLearned.For("pogo_oscillation");
            var next = Retry.Prefill(prev, catalog, lesson, failed, 99UL);

            Assert.Equal("C1", next.ContractId);
            Assert.Equal(99UL, next.Seed);
            Assert.False(next.Has(failed));
            foreach (var p in parts.Where(p => p.Category != failed)) Assert.Equal(p.Id, next.Choice(p.Category));
            Assert.True(next.HasFlag("risk_cleared:pogo_oscillation"));
            Assert.True(next.HasFlag("free_test:pogo_suppression_test"));
            Assert.Single(next.Ledger); // only the kept slot's cost line (the failed slot's 5.0 M line is dropped)
            Assert.Equal(parts[0].Category, next.Ledger[0].Category);
            Assert.Equal(prev.Choices.Count, parts.Count); // the previous state is untouched
        }

        [Fact]
        public void RetryIsDeterministic()
        {
            var catalog = DesignFixture.Catalog();
            var p = catalog.PartsInOrder.First();
            var prev = BuildState.New("C1", 1UL).WithVoteResolved(p.Category, p.Id);
            string Dump() { var n = Retry.Prefill(prev, catalog, LessonsLearned.For("engine_shutdown"), "none", 5UL); return string.Join("|", n.Choices.Select(c => c.Key + "=" + c.Value)) + ";" + string.Join(",", n.Flags); }
            Assert.Equal(Dump(), Dump());
        }

        [Fact]
        public void RetryRejectsAPartMissingFromTheCatalog()
        {
            var catalog = DesignFixture.Catalog();
            var prev = BuildState.New("C1", 1UL).WithChoice("some_slot", "no_such_part");
            Assert.Throws<CatalogException>(() => Retry.Prefill(prev, catalog, LessonsLearned.For("engine_shutdown"), "other", 2UL));
        }
    }
}
