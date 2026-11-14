using System;
using System.Collections.Generic;
using MissionForge.Core.Session;
using Xunit;

namespace MissionForge.Core.Tests.Session
{
    /// <summary>protocol/messages.md section 6: the authoritative transition table and field combinations.</summary>
    public class SessionMachineTests
    {
        // A valid target for each phase (the field combination of protocol section 6).
        private static SessionTarget Valid(SessionPhase p, string? contract = "C1") => p switch
        {
            SessionPhase.Lobby => new SessionTarget(p),
            SessionPhase.Briefing => new SessionTarget(p),
            SessionPhase.ContractVote => new SessionTarget(p),
            SessionPhase.Build => new SessionTarget(p, SessionSub.VoteRound, contractId: contract),
            SessionPhase.Frr => new SessionTarget(p, SessionSub.None, ReviewId.Frr, contractId: contract),
            SessionPhase.Countdown => new SessionTarget(p, flightPhase: FlightPhaseId.F1, contractId: contract),
            SessionPhase.Flight => new SessionTarget(p, SessionSub.Flying, flightPhase: FlightPhaseId.F4, contractId: contract),
            SessionPhase.Debrief => new SessionTarget(p, SessionSub.Summary, contractId: contract),
            _ => new SessionTarget(p),
        };

        private static SessionState At(SessionPhase p, int seq = 1)
        {
            // Build a state in phase p by a legal path from the initial state.
            var s = SessionState.Initial("QUICK", 42UL);
            var path = new Dictionary<SessionPhase, SessionPhase[]>
            {
                [SessionPhase.Lobby] = new SessionPhase[0],
                [SessionPhase.Briefing] = new[] { SessionPhase.Briefing },
                [SessionPhase.ContractVote] = new[] { SessionPhase.Briefing, SessionPhase.ContractVote },
                [SessionPhase.Build] = new[] { SessionPhase.Briefing, SessionPhase.Build },
                [SessionPhase.Frr] = new[] { SessionPhase.Briefing, SessionPhase.Build, SessionPhase.Frr },
                [SessionPhase.Countdown] = new[] { SessionPhase.Briefing, SessionPhase.Build, SessionPhase.Frr, SessionPhase.Countdown },
                [SessionPhase.Flight] = new[] { SessionPhase.Briefing, SessionPhase.Build, SessionPhase.Frr, SessionPhase.Countdown, SessionPhase.Flight },
                [SessionPhase.Debrief] = new[] { SessionPhase.Briefing, SessionPhase.Build, SessionPhase.Frr, SessionPhase.Countdown, SessionPhase.Flight, SessionPhase.Debrief },
                [SessionPhase.CampaignHub] = new[] { SessionPhase.Briefing, SessionPhase.Build, SessionPhase.Frr, SessionPhase.Countdown, SessionPhase.Flight, SessionPhase.Debrief, SessionPhase.CampaignHub },
            };
            foreach (var step in path[p])
            {
                var r = SessionMachine.TryTransition(s, Valid(step));
                Assert.True(r.IsOk, r.Message);
                s = r.State!;
            }
            return s;
        }

        // The table of protocol section 6.
        private static readonly Dictionary<SessionPhase, SessionPhase[]> Allowed = new Dictionary<SessionPhase, SessionPhase[]>
        {
            [SessionPhase.Lobby] = new[] { SessionPhase.Briefing },
            [SessionPhase.Briefing] = new[] { SessionPhase.ContractVote, SessionPhase.Build, SessionPhase.Lobby },
            [SessionPhase.ContractVote] = new[] { SessionPhase.Build, SessionPhase.Lobby },
            [SessionPhase.Build] = new[] { SessionPhase.Frr, SessionPhase.Lobby },
            [SessionPhase.Frr] = new[] { SessionPhase.Countdown, SessionPhase.Build, SessionPhase.Lobby },
            [SessionPhase.Countdown] = new[] { SessionPhase.Flight, SessionPhase.Frr, SessionPhase.Debrief, SessionPhase.Lobby },
            [SessionPhase.Flight] = new[] { SessionPhase.Debrief, SessionPhase.Lobby },
            [SessionPhase.Debrief] = new[] { SessionPhase.CampaignHub, SessionPhase.Lobby, SessionPhase.Build },
            [SessionPhase.CampaignHub] = new[] { SessionPhase.Briefing, SessionPhase.Lobby },
        };

        [Fact]
        public void EveryPhasePair_FollowsTheProtocolTable()
        {
            foreach (SessionPhase from in Enum.GetValues(typeof(SessionPhase)))
                foreach (SessionPhase to in Enum.GetValues(typeof(SessionPhase)))
                {
                    var state = At(from);
                    var result = SessionMachine.TryTransition(state, Valid(to));
                    var expected = from == to || Array.IndexOf(Allowed[from], to) >= 0;
                    Assert.True(result.IsOk == expected, SessionTokens.Token(from) + " -> " + SessionTokens.Token(to) + ": " + result.Message);
                    if (!expected)
                    {
                        Assert.Equal("INVALID_TRANSITION", result.ErrorCode);
                        Assert.Null(result.State);
                    }
                }
        }

        [Fact]
        public void HappyPath_WalksTheWholeGame()
        {
            var s = SessionState.Initial("QUICK", 7UL);
            Assert.Equal(0, s.MissionSeq);
            Assert.Equal(SessionPhase.Lobby, s.Phase);
            s = Go(s, new SessionTarget(SessionPhase.Briefing, newSeed: 99UL));
            Assert.Equal(1, s.MissionSeq);
            Assert.Equal(99UL, s.Seed);
            s = Go(s, new SessionTarget(SessionPhase.ContractVote));
            s = Go(s, new SessionTarget(SessionPhase.Build, SessionSub.VoteRound, contractId: "C1"));
            s = Go(s, new SessionTarget(SessionPhase.Build, SessionSub.Review, ReviewId.Pdr));
            s = Go(s, new SessionTarget(SessionPhase.Build, SessionSub.Test));
            s = Go(s, new SessionTarget(SessionPhase.Build, SessionSub.Review, ReviewId.Cdr));
            s = Go(s, new SessionTarget(SessionPhase.Frr, review: ReviewId.Frr));
            s = Go(s, new SessionTarget(SessionPhase.Countdown, flightPhase: FlightPhaseId.F0));
            s = Go(s, new SessionTarget(SessionPhase.Countdown, flightPhase: FlightPhaseId.F1));
            s = Go(s, new SessionTarget(SessionPhase.Flight, SessionSub.Flying, flightPhase: FlightPhaseId.F2));
            s = Go(s, new SessionTarget(SessionPhase.Flight, SessionSub.Abort, flightPhase: FlightPhaseId.F5));
            s = Go(s, new SessionTarget(SessionPhase.Flight, SessionSub.Flying, flightPhase: FlightPhaseId.F7, boosterTrack: true));
            Assert.True(s.BoosterTrack);
            s = Go(s, new SessionTarget(SessionPhase.Debrief, SessionSub.Summary));
            Assert.False(s.BoosterTrack);
            s = Go(s, new SessionTarget(SessionPhase.Debrief, SessionSub.Investigation));
            s = Go(s, new SessionTarget(SessionPhase.CampaignHub));
            Assert.Null(s.ContractId);
            s = Go(s, new SessionTarget(SessionPhase.Briefing, newSeed: 100UL));
            Assert.Equal(2, s.MissionSeq);
            Assert.Equal(100UL, s.Seed);
            Assert.Equal("QUICK", s.Mode);
        }

        private static SessionState Go(SessionState s, SessionTarget t)
        {
            var r = SessionMachine.TryTransition(s, t);
            Assert.True(r.IsOk, SessionTokens.Token(s.Phase) + " -> " + SessionTokens.Token(t.Phase) + ": " + r.Message);
            return r.State!;
        }

        [Fact]
        public void MissionSeq_RisesOnNewMission_AndOnRetry_NotOtherwise()
        {
            var s = At(SessionPhase.Briefing);
            Assert.Equal(1, s.MissionSeq);
            s = At(SessionPhase.Debrief);
            Assert.Equal(1, s.MissionSeq);
            // retry: DEBRIEF -> BUILD
            var retry = Go(s, new SessionTarget(SessionPhase.Build, SessionSub.None, newSeed: 555UL));
            Assert.Equal(2, retry.MissionSeq);
            Assert.Equal(555UL, retry.Seed);
            Assert.Equal("C1", retry.ContractId);
            // an ordinary move inside a mission does not raise it
            var frr = Go(retry, new SessionTarget(SessionPhase.Frr, review: ReviewId.Frr));
            Assert.Equal(2, frr.MissionSeq);
            // same-phase update does not raise it
            var stay = Go(s, new SessionTarget(SessionPhase.Debrief, SessionSub.Investigation));
            Assert.Equal(1, stay.MissionSeq);
            // the new mission from the hub
            var hub = Go(s, new SessionTarget(SessionPhase.CampaignHub));
            var next = Go(hub, new SessionTarget(SessionPhase.Briefing));
            Assert.Equal(2, next.MissionSeq);
            Assert.Equal(s.Seed, next.Seed);            // no new seed given: seed kept
        }

        [Fact]
        public void BriefingCanLockTheContractDirectly()
        {
            var s = At(SessionPhase.Briefing);
            var b = Go(s, new SessionTarget(SessionPhase.Build, SessionSub.VoteRound, contractId: "C3"));
            Assert.Equal("C3", b.ContractId);
        }

        [Fact]
        public void BuildWithoutAContract_IsRejected()
        {
            var s = At(SessionPhase.Briefing);
            var r = SessionMachine.TryTransition(s, new SessionTarget(SessionPhase.Build));
            Assert.False(r.IsOk);
            Assert.Equal("INVALID_TRANSITION", r.ErrorCode);
            Assert.Contains("contract", r.Message);
        }

        [Theory]
        [InlineData(SessionPhase.Lobby, SessionSub.VoteRound, null, null)]
        [InlineData(SessionPhase.Briefing, SessionSub.None, ReviewId.Pdr, null)]
        [InlineData(SessionPhase.ContractVote, SessionSub.None, null, FlightPhaseId.F0)]
        [InlineData(SessionPhase.Build, SessionSub.Flying, null, null)]
        [InlineData(SessionPhase.Build, SessionSub.Review, null, null)]            // REVIEW needs PDR or CDR
        [InlineData(SessionPhase.Build, SessionSub.Review, ReviewId.Frr, null)]    // FRR is not a BUILD review
        [InlineData(SessionPhase.Build, SessionSub.Test, ReviewId.Pdr, null)]      // review only with sub REVIEW
        [InlineData(SessionPhase.Build, SessionSub.None, null, FlightPhaseId.F2)]
        [InlineData(SessionPhase.Frr, SessionSub.None, null, null)]                // FRR needs review FRR
        [InlineData(SessionPhase.Frr, SessionSub.None, ReviewId.Pdr, null)]
        [InlineData(SessionPhase.Frr, SessionSub.Test, ReviewId.Frr, null)]
        [InlineData(SessionPhase.Countdown, SessionSub.None, null, null)]
        [InlineData(SessionPhase.Countdown, SessionSub.None, null, FlightPhaseId.F2)]
        [InlineData(SessionPhase.Flight, SessionSub.None, null, FlightPhaseId.F2)]
        [InlineData(SessionPhase.Flight, SessionSub.Flying, null, FlightPhaseId.F1)]
        [InlineData(SessionPhase.Flight, SessionSub.Flying, null, FlightPhaseId.F14)]
        [InlineData(SessionPhase.Flight, SessionSub.Flying, null, FlightPhaseId.F7b)]
        [InlineData(SessionPhase.Flight, SessionSub.Flying, null, null)]
        [InlineData(SessionPhase.Flight, SessionSub.Flying, ReviewId.Cdr, FlightPhaseId.F5)]
        [InlineData(SessionPhase.Debrief, SessionSub.None, null, null)]
        [InlineData(SessionPhase.Debrief, SessionSub.Flying, null, null)]
        [InlineData(SessionPhase.Debrief, SessionSub.Summary, null, FlightPhaseId.F14)]
        public void InvalidFieldCombinations_AreRejected(SessionPhase phase, SessionSub sub, ReviewId? review, FlightPhaseId? fp)
        {
            // from a state that may legally reach the phase, so only the combination is wrong
            var from = phase == SessionPhase.Lobby || phase == SessionPhase.Briefing || phase == SessionPhase.ContractVote ? At(SessionPhase.Briefing)
                : phase == SessionPhase.Build ? At(SessionPhase.Briefing)
                : phase == SessionPhase.Frr ? At(SessionPhase.Build)
                : phase == SessionPhase.Countdown ? At(SessionPhase.Frr)
                : phase == SessionPhase.Flight ? At(SessionPhase.Countdown)
                : At(SessionPhase.Flight);
            var r = SessionMachine.TryTransition(from, new SessionTarget(phase, sub, review, fp, contractId: "C1"));
            Assert.False(r.IsOk, "expected an error but got " + SessionTokens.Token(phase));
            Assert.Equal("INVALID_TRANSITION", r.ErrorCode);
        }

        [Fact]
        public void BoosterTrack_OnlyInFlight()
        {
            var s = At(SessionPhase.Build);
            Assert.False(SessionMachine.TryTransition(s, new SessionTarget(SessionPhase.Build, SessionSub.Test, boosterTrack: true)).IsOk);
            var f = At(SessionPhase.Flight);
            Assert.True(SessionMachine.TryTransition(f, new SessionTarget(SessionPhase.Flight, SessionSub.Flying, flightPhase: FlightPhaseId.F6, boosterTrack: true)).IsOk);
        }

        [Theory]
        [InlineData(FlightPhaseId.F2, FlightSegment.Ascent)]
        [InlineData(FlightPhaseId.F7, FlightSegment.Ascent)]
        [InlineData(FlightPhaseId.F8, FlightSegment.Orbit)]
        [InlineData(FlightPhaseId.F9, FlightSegment.Orbit)]
        [InlineData(FlightPhaseId.F10, FlightSegment.Entry)]
        [InlineData(FlightPhaseId.F11, FlightSegment.Entry)]
        [InlineData(FlightPhaseId.F12, FlightSegment.Landing)]
        [InlineData(FlightPhaseId.F13, FlightSegment.Landing)]
        public void Segment_IsDerivedFromTheFlightPhase(FlightPhaseId fp, FlightSegment expected)
        {
            var s = Go(At(SessionPhase.Countdown), new SessionTarget(SessionPhase.Flight, SessionSub.Flying, flightPhase: fp));
            Assert.Equal(expected, s.Segment);
        }

        [Fact]
        public void Segment_IsNullOutsideFlight_AndForF0F1()
        {
            Assert.Null(At(SessionPhase.Build).Segment);
            Assert.Null(At(SessionPhase.Countdown).Segment);
            Assert.Null(At(SessionPhase.Debrief).Segment);
            Assert.Null(SessionTokens.SegmentOf(FlightPhaseId.F0));
            Assert.Null(SessionTokens.SegmentOf(FlightPhaseId.F14));
            Assert.Equal(FlightSegment.Ascent, SessionTokens.SegmentOf(FlightPhaseId.F7b));
        }

        [Fact]
        public void Tokens_MatchTheProtocolAndRoundTrip()
        {
            Assert.Equal("CONTRACT_VOTE", SessionTokens.Token(SessionPhase.ContractVote));
            Assert.Equal("CAMPAIGN_HUB", SessionTokens.Token(SessionPhase.CampaignHub));
            Assert.Equal("VOTE_ROUND", SessionTokens.Token(SessionSub.VoteRound));
            Assert.Equal("INVESTIGATION", SessionTokens.Token(SessionSub.Investigation));
            Assert.Equal("PDR", SessionTokens.Token(ReviewId.Pdr));
            Assert.Equal("LANDING", SessionTokens.Token(FlightSegment.Landing));
            Assert.Equal("F7b", SessionTokens.Token(FlightPhaseId.F7b));
            Assert.Equal("F14", SessionTokens.Token(FlightPhaseId.F14));
            foreach (SessionPhase p in Enum.GetValues(typeof(SessionPhase)))
            {
                Assert.True(SessionTokens.TryParse(SessionTokens.Token(p), out SessionPhase back));
                Assert.Equal(p, back);
            }
            foreach (SessionSub p in Enum.GetValues(typeof(SessionSub)))
            {
                Assert.True(SessionTokens.TryParse(SessionTokens.Token(p), out SessionSub back));
                Assert.Equal(p, back);
            }
            foreach (FlightPhaseId p in Enum.GetValues(typeof(FlightPhaseId)))
            {
                Assert.True(SessionTokens.TryParse(SessionTokens.Token(p), out FlightPhaseId back));
                Assert.Equal(p, back);
            }
            Assert.False(SessionTokens.TryParse("lobby", out SessionPhase _));
            Assert.False(SessionTokens.TryParse("F15", out FlightPhaseId _));
        }

        [Fact]
        public void PadAbort_CountdownToDebrief_And_Scrub_CountdownToFrr()
        {
            var c = At(SessionPhase.Countdown);
            Assert.True(SessionMachine.TryTransition(c, new SessionTarget(SessionPhase.Debrief, SessionSub.Summary)).IsOk);
            Assert.True(SessionMachine.TryTransition(c, new SessionTarget(SessionPhase.Frr, review: ReviewId.Frr)).IsOk);
        }

        [Fact]
        public void ReworkFromFrr_ReturnsToBuild()
        {
            var f = At(SessionPhase.Frr);
            Assert.True(SessionMachine.TryTransition(f, new SessionTarget(SessionPhase.Build, SessionSub.VoteRound)).IsOk);
        }

        [Fact]
        public void LeavingForLobby_ClearsTheContract_AndKeepsTheSeedAndSeq()
        {
            var b = At(SessionPhase.Build);
            var l = Go(b, new SessionTarget(SessionPhase.Lobby));
            Assert.Null(l.ContractId);
            Assert.Equal(b.Seed, l.Seed);
            Assert.Equal(b.MissionSeq, l.MissionSeq);
        }

        [Fact]
        public void ModeCanBeChanged_AndIsNotInterpreted()
        {
            var l = SessionState.Initial("QUICK", 1UL);
            var s = Go(l, new SessionTarget(SessionPhase.Briefing, mode: "HERITAGE"));
            Assert.Equal("HERITAGE", s.Mode);
        }

        [Fact]
        public void Transitions_AreDeterministic_AndTheOldStateIsUnchanged()
        {
            var a = At(SessionPhase.Build);
            var r1 = SessionMachine.TryTransition(a, new SessionTarget(SessionPhase.Frr, review: ReviewId.Frr));
            var r2 = SessionMachine.TryTransition(a, new SessionTarget(SessionPhase.Frr, review: ReviewId.Frr));
            Assert.Equal(r1.State!.Phase, r2.State!.Phase);
            Assert.Equal(r1.State.MissionSeq, r2.State.MissionSeq);
            Assert.Equal(SessionPhase.Build, a.Phase);
        }
    }
}
