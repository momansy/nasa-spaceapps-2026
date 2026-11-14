#nullable enable
using System;

namespace MissionForge.Core.Session
{
    /// <summary>Top-level game phase (design 17.3; <c>Phase</c> of <c>protocol/messages.md</c> section 6).</summary>
    public enum SessionPhase { Lobby, Briefing, ContractVote, Build, Frr, Countdown, Flight, Debrief, CampaignHub }

    /// <summary>Sub-state inside a phase (<c>SubPhase</c> of the protocol).</summary>
    public enum SessionSub { None, VoteRound, Test, Anomaly, Review, Flying, Abort, Summary, Investigation }

    /// <summary>Design review (<c>ReviewId</c> of the protocol): PDR and CDR in BUILD, FRR in its own phase.</summary>
    public enum ReviewId { Pdr, Cdr, Frr }

    /// <summary>
    /// Flight phase of design 9.1. The protocol puts F0–F1 in COUNTDOWN and F2–F13 in FLIGHT; F14 is the DEBRIEF phase and
    /// F7b the parallel booster-return track, signalled by <see cref="SessionState.BoosterTrack"/>. F14 and F7b are therefore
    /// known tokens but are rejected as a <see cref="SessionState.FlightPhase"/>.
    /// </summary>
    public enum FlightPhaseId { F0, F1, F2, F3, F4, F5, F6, F7, F7b, F8, F9, F10, F11, F12, F13, F14 }

    /// <summary>Flight segment (<c>FlightSegment</c> of the protocol), derived from the flight phase.</summary>
    public enum FlightSegment { Ascent, Orbit, Entry, Landing }

    /// <summary>
    /// The upper-case tokens of <c>protocol/messages.md</c> section 6 and the conversions between them and the enums.
    /// </summary>
    public static class SessionTokens
    {
        /// <summary>Protocol token of a phase (<c>CONTRACT_VOTE</c>).</summary>
        public static string Token(SessionPhase p) => p switch
        {
            SessionPhase.Lobby => "LOBBY",
            SessionPhase.Briefing => "BRIEFING",
            SessionPhase.ContractVote => "CONTRACT_VOTE",
            SessionPhase.Build => "BUILD",
            SessionPhase.Frr => "FRR",
            SessionPhase.Countdown => "COUNTDOWN",
            SessionPhase.Flight => "FLIGHT",
            SessionPhase.Debrief => "DEBRIEF",
            _ => "CAMPAIGN_HUB",
        };

        /// <summary>Protocol token of a sub-state (<c>VOTE_ROUND</c>).</summary>
        public static string Token(SessionSub s) => s switch
        {
            SessionSub.None => "NONE",
            SessionSub.VoteRound => "VOTE_ROUND",
            SessionSub.Test => "TEST",
            SessionSub.Anomaly => "ANOMALY",
            SessionSub.Review => "REVIEW",
            SessionSub.Flying => "FLYING",
            SessionSub.Abort => "ABORT",
            SessionSub.Summary => "SUMMARY",
            _ => "INVESTIGATION",
        };

        /// <summary>Protocol token of a review (<c>PDR</c>, <c>CDR</c>, <c>FRR</c>).</summary>
        public static string Token(ReviewId r) => r switch { ReviewId.Pdr => "PDR", ReviewId.Cdr => "CDR", _ => "FRR" };

        /// <summary>Protocol token of a segment (<c>ASCENT</c>…).</summary>
        public static string Token(FlightSegment s) => s switch
        {
            FlightSegment.Ascent => "ASCENT",
            FlightSegment.Orbit => "ORBIT",
            FlightSegment.Entry => "ENTRY",
            _ => "LANDING",
        };

        /// <summary>Token of a flight phase: <c>F0</c>…<c>F14</c> and <c>F7b</c>.</summary>
        public static string Token(FlightPhaseId f) => f == FlightPhaseId.F7b ? "F7b" : f.ToString();

        /// <summary>Parses a phase token (case-sensitive upper case); false when unknown.</summary>
        public static bool TryParse(string? token, out SessionPhase phase)
        {
            foreach (SessionPhase p in Enum.GetValues(typeof(SessionPhase)))
                if (Token(p) == token) { phase = p; return true; }
            phase = SessionPhase.Lobby;
            return false;
        }

        /// <summary>Parses a sub-state token; false when unknown.</summary>
        public static bool TryParse(string? token, out SessionSub sub)
        {
            foreach (SessionSub s in Enum.GetValues(typeof(SessionSub)))
                if (Token(s) == token) { sub = s; return true; }
            sub = SessionSub.None;
            return false;
        }

        /// <summary>Parses a flight-phase token (<c>F0</c>…<c>F14</c>, <c>F7b</c>); false when unknown.</summary>
        public static bool TryParse(string? token, out FlightPhaseId phase)
        {
            foreach (FlightPhaseId f in Enum.GetValues(typeof(FlightPhaseId)))
                if (Token(f) == token) { phase = f; return true; }
            phase = FlightPhaseId.F0;
            return false;
        }

        /// <summary>
        /// Segment of a flight phase (protocol section 6): ASCENT F2–F7 (and the F7b track), ORBIT F8–F9, ENTRY F10–F11,
        /// LANDING F12–F13; null for F0, F1 and F14.
        /// </summary>
        public static FlightSegment? SegmentOf(FlightPhaseId f)
        {
            switch (f)
            {
                case FlightPhaseId.F2: case FlightPhaseId.F3: case FlightPhaseId.F4: case FlightPhaseId.F5:
                case FlightPhaseId.F6: case FlightPhaseId.F7: case FlightPhaseId.F7b:
                    return FlightSegment.Ascent;
                case FlightPhaseId.F8: case FlightPhaseId.F9:
                    return FlightSegment.Orbit;
                case FlightPhaseId.F10: case FlightPhaseId.F11:
                    return FlightSegment.Entry;
                case FlightPhaseId.F12: case FlightPhaseId.F13:
                    return FlightSegment.Landing;
                default:
                    return null;
            }
        }
    }

    /// <summary>
    /// The position of a session in the game state machine (design 17.3, <c>phase.set</c> of the protocol). Immutable; the
    /// only way to a new state is <see cref="SessionMachine.TryTransition"/>, which keeps the field combinations of
    /// <c>protocol/messages.md</c> section 6 valid.
    /// </summary>
    public sealed class SessionState
    {
        internal SessionState(int missionSeq, string mode, SessionPhase phase, SessionSub sub, ReviewId? review,
            FlightPhaseId? flightPhase, bool boosterTrack, string? contractId, ulong seed)
        {
            MissionSeq = missionSeq; Mode = mode; Phase = phase; Sub = sub; Review = review; FlightPhase = flightPhase;
            BoosterTrack = boosterTrack; ContractId = contractId; Seed = seed;
        }

        /// <summary>The state before anything happens: LOBBY, mission counter 0.</summary>
        /// <param name="mode">A <c>GameMode</c> token (<c>QUICK</c>, <c>CAMPAIGN</c>…); not interpreted.</param>
        /// <param name="seed">Session seed (design 17.6).</param>
        public static SessionState Initial(string mode, ulong seed) =>
            new SessionState(0, mode ?? throw new ArgumentNullException(nameof(mode)), SessionPhase.Lobby, SessionSub.None, null, null, false, null, seed);

        /// <summary>Mission counter: 0 before the first mission, +1 on each new mission and each retry.</summary>
        public int MissionSeq { get; }
        /// <summary>Game mode token; not interpreted by Core.</summary>
        public string Mode { get; }
        /// <summary>Top-level phase.</summary>
        public SessionPhase Phase { get; }
        /// <summary>Sub-state; None when the phase has none.</summary>
        public SessionSub Sub { get; }
        /// <summary>PDR or CDR when <see cref="Sub"/> is Review; FRR in the FRR phase; null otherwise.</summary>
        public ReviewId? Review { get; }
        /// <summary>F0 or F1 in COUNTDOWN, F2–F13 in FLIGHT, null otherwise.</summary>
        public FlightPhaseId? FlightPhase { get; }
        /// <summary>Flight segment, derived from <see cref="FlightPhase"/> in FLIGHT; null otherwise.</summary>
        public FlightSegment? Segment => Phase == SessionPhase.Flight && FlightPhase.HasValue ? SessionTokens.SegmentOf(FlightPhase.Value) : null;
        /// <summary>True while the parallel booster-return track F7b runs (FLIGHT only).</summary>
        public bool BoosterTrack { get; }
        /// <summary>Contract chosen, or null until one is chosen.</summary>
        public string? ContractId { get; }
        /// <summary>Seed of the current mission; every random draw derives from it (design 17.6).</summary>
        public ulong Seed { get; }
    }
}
