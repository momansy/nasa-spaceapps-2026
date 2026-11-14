#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Session
{
    /// <summary>Phase tokens of the session state machine (protocol section 6, design 17.3).</summary>
    public static class Phases
    {
        /// <summary>Players join, roles and settings.</summary>
        public const string Lobby = "LOBBY";
        /// <summary>Contract briefing.</summary>
        public const string Briefing = "BRIEFING";
        /// <summary>Contract vote.</summary>
        public const string ContractVote = "CONTRACT_VOTE";
        /// <summary>Build phase (votes, tests, anomalies, reviews).</summary>
        public const string Build = "BUILD";
        /// <summary>Flight Readiness Review.</summary>
        public const string Frr = "FRR";
        /// <summary>Countdown (F0, F1).</summary>
        public const string Countdown = "COUNTDOWN";
        /// <summary>Flight (F2 to F13).</summary>
        public const string Flight = "FLIGHT";
        /// <summary>Debrief.</summary>
        public const string Debrief = "DEBRIEF";
        /// <summary>Campaign hub.</summary>
        public const string CampaignHub = "CAMPAIGN_HUB";
    }

    /// <summary>Sub-state tokens.</summary>
    public static class SubStates
    {
        /// <summary>No sub-state.</summary>
        public const string None = "NONE";
        /// <summary>BUILD: a part vote is open.</summary>
        public const string VoteRound = "VOTE_ROUND";
        /// <summary>BUILD: a test.</summary>
        public const string Test = "TEST";
        /// <summary>BUILD: an anomaly card.</summary>
        public const string Anomaly = "ANOMALY";
        /// <summary>BUILD: a design review (PDR or CDR).</summary>
        public const string Review = "REVIEW";
        /// <summary>FLIGHT: flying.</summary>
        public const string Flying = "FLYING";
        /// <summary>FLIGHT: abort branch.</summary>
        public const string Abort = "ABORT";
        /// <summary>DEBRIEF: summary.</summary>
        public const string Summary = "SUMMARY";
        /// <summary>DEBRIEF: investigation (MG-28).</summary>
        public const string Investigation = "INVESTIGATION";
    }

    /// <summary>Review tokens.</summary>
    public static class Reviews
    {
        /// <summary>Preliminary Design Review.</summary>
        public const string Pdr = "PDR";
        /// <summary>Critical Design Review.</summary>
        public const string Cdr = "CDR";
        /// <summary>Flight Readiness Review.</summary>
        public const string Frr = "FRR";
    }

    /// <summary>Flight segment tokens.</summary>
    public static class Segments
    {
        /// <summary>F2 to F7 (and F7b).</summary>
        public const string Ascent = "ASCENT";
        /// <summary>F8 and F9.</summary>
        public const string Orbit = "ORBIT";
        /// <summary>F10 and F11.</summary>
        public const string Entry = "ENTRY";
        /// <summary>F12 and F13.</summary>
        public const string Landing = "LANDING";
    }

    /// <summary>Immutable session state: the fields of <c>phase.set</c> plus the mission counter, seed and contract.</summary>
    public sealed class SessionState
    {
        private SessionState(int missionSeq, string mode, string phase, string sub, string? review, string? flightPhase, string? segment,
            string? contractId, ulong seed)
        {
            MissionSeq = missionSeq; Mode = mode; Phase = phase; Sub = sub; Review = review; FlightPhase = flightPhase;
            Segment = segment; ContractId = contractId; Seed = seed;
        }

        /// <summary>Starts a session in the lobby. <b>Decision:</b> <see cref="MissionSeq"/> is 0 until the first mission starts.</summary>
        /// <param name="mode">Game mode token (not interpreted here).</param>
        /// <param name="seed">Session seed (design 17.6).</param>
        public static SessionState Initial(string mode, ulong seed) =>
            new SessionState(0, mode ?? throw new ArgumentNullException(nameof(mode)), Phases.Lobby, SubStates.None, null, null, null, null, seed);

        /// <summary>Mission counter; rises when a mission starts (LOBBY or CAMPAIGN_HUB to BRIEFING) and on retry (DEBRIEF to BUILD).</summary>
        public int MissionSeq { get; }
        /// <summary>Game mode token, not interpreted.</summary>
        public string Mode { get; }
        /// <summary>Phase token.</summary>
        public string Phase { get; }
        /// <summary>Sub-state token.</summary>
        public string Sub { get; }
        /// <summary><c>PDR</c>, <c>CDR</c> or <c>FRR</c> when a review is running, else null.</summary>
        public string? Review { get; }
        /// <summary><c>F0</c> to <c>F14</c> or <c>F7b</c>, else null.</summary>
        public string? FlightPhase { get; }
        /// <summary>Flight segment derived from <see cref="FlightPhase"/> while in FLIGHT, else null.</summary>
        public string? Segment { get; }
        /// <summary>Contract flown, null until chosen.</summary>
        public string? ContractId { get; }
        /// <summary>Session seed.</summary>
        public ulong Seed { get; }

        /// <summary>Returns a copy with the contract set (the host locks or the crew votes it in BRIEFING / CONTRACT_VOTE).</summary>
        public SessionState WithContract(string contractId) =>
            new SessionState(MissionSeq, Mode, Phase, Sub, Review, FlightPhase, Segment, contractId ?? throw new ArgumentNullException(nameof(contractId)), Seed);

        internal SessionState Next(int missionSeq, string phase, string sub, string? review, string? flightPhase, string? segment) =>
            new SessionState(missionSeq, Mode, phase, sub, review, flightPhase, segment, ContractId, Seed);
    }

    /// <summary>Result of a transition attempt: the next state or an error.</summary>
    public sealed class TransitionResult
    {
        private TransitionResult(SessionState? state, string? error) { State = state; Error = error; }
        internal static TransitionResult Ok(SessionState state) => new TransitionResult(state, null);
        internal static TransitionResult Fail(string error) => new TransitionResult(null, error);
        /// <summary>The next state, null on error.</summary>
        public SessionState? State { get; }
        /// <summary>The reason a move is illegal, null on success.</summary>
        public string? Error { get; }
        /// <summary>True when the transition is legal.</summary>
        public bool IsOk => State != null;
    }

    /// <summary>
    /// The phase state machine of design 17.3 with the authoritative transition table and field combinations of
    /// <c>protocol/messages.md</c> section 6. A move that keeps the phase and changes other fields is always allowed (if the
    /// combination is valid). <b>Decisions:</b> F7b belongs to ASCENT; FLIGHT accepts F2-F13 and F7b only (F14 is not in the table);
    /// the contract must be set before BUILD.
    /// </summary>
    public static class SessionMachine
    {
        private static readonly Dictionary<string, string[]> Allowed = new Dictionary<string, string[]>(StringComparer.Ordinal)
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

        /// <summary>
        /// Moves to a new phase and/or fields.
        /// </summary>
        /// <param name="state">Current state.</param>
        /// <param name="phase">Target phase token.</param>
        /// <param name="sub">Target sub-state; null picks the default of the phase (NONE, FLYING, SUMMARY).</param>
        /// <param name="review">Review token for BUILD/REVIEW (PDR or CDR); FRR is implied in the FRR phase when null.</param>
        /// <param name="flightPhase">COUNTDOWN: F0 or F1; FLIGHT: F2-F13 or F7b; otherwise null.</param>
        public static TransitionResult TryTransition(SessionState state, string phase, string? sub = null, string? review = null, string? flightPhase = null)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (!Allowed.ContainsKey(phase)) return TransitionResult.Fail("unknown phase '" + phase + "'");
            bool samePhase = phase == state.Phase;
            if (!samePhase && Array.IndexOf(Allowed[state.Phase], phase) < 0)
                return TransitionResult.Fail("illegal transition " + state.Phase + " -> " + phase);

            sub ??= DefaultSub(phase);
            if (phase == Phases.Frr && review == null) review = Reviews.Frr;
            var fieldError = CheckFields(phase, sub, review, flightPhase);
            if (fieldError != null) return TransitionResult.Fail(fieldError);
            if (phase == Phases.Build && state.ContractId == null) return TransitionResult.Fail("a contract must be chosen before BUILD");

            int seq = state.MissionSeq;
            if (!samePhase)
            {
                bool newMission = phase == Phases.Briefing && (state.Phase == Phases.Lobby || state.Phase == Phases.CampaignHub);
                bool retry = state.Phase == Phases.Debrief && phase == Phases.Build;
                if (newMission || retry) seq++;
            }
            return TransitionResult.Ok(state.Next(seq, phase, sub, review, flightPhase, phase == Phases.Flight ? SegmentOf(flightPhase!) : null));
        }

        /// <summary>Segment of a flight phase token: ASCENT (F2-F7, F7b), ORBIT (F8-F9), ENTRY (F10-F11), LANDING (F12-F13); null otherwise.</summary>
        public static string? SegmentOf(string flightPhase)
        {
            switch (flightPhase)
            {
                case "F2": case "F3": case "F4": case "F5": case "F6": case "F7": case "F7b": return Segments.Ascent;
                case "F8": case "F9": return Segments.Orbit;
                case "F10": case "F11": return Segments.Entry;
                case "F12": case "F13": return Segments.Landing;
                default: return null;
            }
        }

        private static string DefaultSub(string phase) =>
            phase == Phases.Flight ? SubStates.Flying : phase == Phases.Debrief ? SubStates.Summary : SubStates.None;

        private static string? CheckFields(string phase, string sub, string? review, string? flightPhase)
        {
            switch (phase)
            {
                case Phases.Lobby: case Phases.Briefing: case Phases.ContractVote: case Phases.CampaignHub:
                    return sub == SubStates.None && review == null && flightPhase == null ? null : phase + " needs sub NONE and no review or flight phase";
                case Phases.Build:
                    if (sub != SubStates.None && sub != SubStates.VoteRound && sub != SubStates.Test && sub != SubStates.Anomaly && sub != SubStates.Review)
                        return "BUILD sub must be NONE, VOTE_ROUND, TEST, ANOMALY or REVIEW";
                    if (flightPhase != null) return "BUILD has no flight phase";
                    if (sub == SubStates.Review) return review == Reviews.Pdr || review == Reviews.Cdr ? null : "BUILD/REVIEW needs review PDR or CDR";
                    return review == null ? null : "review is only set while sub is REVIEW";
                case Phases.Frr:
                    return sub == SubStates.None && review == Reviews.Frr && flightPhase == null ? null : "FRR needs sub NONE and review FRR";
                case Phases.Countdown:
                    if (sub != SubStates.None || review != null) return "COUNTDOWN needs sub NONE and no review";
                    return flightPhase == "F0" || flightPhase == "F1" ? null : "COUNTDOWN needs flight phase F0 or F1";
                case Phases.Flight:
                    if (sub != SubStates.Flying && sub != SubStates.Abort) return "FLIGHT sub must be FLYING or ABORT";
                    if (review != null) return "FLIGHT has no review";
                    return flightPhase != null && SegmentOf(flightPhase) != null ? null : "FLIGHT needs flight phase F2-F13 or F7b";
                case Phases.Debrief:
                    if (sub != SubStates.Summary && sub != SubStates.Investigation) return "DEBRIEF sub must be SUMMARY or INVESTIGATION";
                    return review == null && flightPhase == null ? null : "DEBRIEF has no review or flight phase";
                default:
                    return "unknown phase '" + phase + "'";
            }
        }
    }
}
