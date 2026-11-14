#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Session
{
    /// <summary>The state the host wants to move to (the fields of a <c>phase.set</c>).</summary>
    public sealed class SessionTarget
    {
        /// <summary>Creates a target.</summary>
        /// <param name="phase">Top-level phase.</param>
        /// <param name="sub">Sub-state (None when the phase has none).</param>
        /// <param name="review">PDR/CDR when <paramref name="sub"/> is Review; FRR in the FRR phase.</param>
        /// <param name="flightPhase">F0/F1 in COUNTDOWN, F2–F13 in FLIGHT.</param>
        /// <param name="boosterTrack">True while F7b runs (FLIGHT only).</param>
        /// <param name="contractId">Chosen contract; null keeps the current one (LOBBY, BRIEFING from LOBBY/CAMPAIGN_HUB and CAMPAIGN_HUB clear it).</param>
        /// <param name="mode">New <c>GameMode</c> token, or null to keep.</param>
        /// <param name="newSeed">Seed for a new mission or a retry, or null to keep the current seed.</param>
        public SessionTarget(SessionPhase phase, SessionSub sub = SessionSub.None, ReviewId? review = null,
            FlightPhaseId? flightPhase = null, bool boosterTrack = false, string? contractId = null, string? mode = null, ulong? newSeed = null)
        {
            Phase = phase; Sub = sub; Review = review; FlightPhase = flightPhase; BoosterTrack = boosterTrack;
            ContractId = contractId; Mode = mode; NewSeed = newSeed;
        }
        /// <summary>Target phase.</summary>
        public SessionPhase Phase { get; }
        /// <summary>Target sub-state.</summary>
        public SessionSub Sub { get; }
        /// <summary>Target review.</summary>
        public ReviewId? Review { get; }
        /// <summary>Target flight phase.</summary>
        public FlightPhaseId? FlightPhase { get; }
        /// <summary>Booster-return track running.</summary>
        public bool BoosterTrack { get; }
        /// <summary>Contract to set, or null to keep.</summary>
        public string? ContractId { get; }
        /// <summary>Mode to set, or null to keep.</summary>
        public string? Mode { get; }
        /// <summary>Seed to set on a new mission or retry, or null to keep.</summary>
        public ulong? NewSeed { get; }
    }

    /// <summary>Result of <see cref="SessionMachine.TryTransition"/>: the next state, or an error.</summary>
    public sealed class TransitionResult
    {
        private TransitionResult(SessionState? state, string? message) { State = state; Message = message; }
        internal static TransitionResult Ok(SessionState state) => new TransitionResult(state, null);
        internal static TransitionResult Fail(string message) => new TransitionResult(null, message);
        /// <summary>True when the move is legal.</summary>
        public bool IsOk => State != null;
        /// <summary>The next state; null on an error.</summary>
        public SessionState? State { get; }
        /// <summary>Protocol error code for an illegal move: always <c>INVALID_TRANSITION</c>; null on success.</summary>
        public string? ErrorCode => State == null ? "INVALID_TRANSITION" : null;
        /// <summary>Human-readable reason; null on success.</summary>
        public string? Message { get; }
    }

    /// <summary>
    /// The game state machine (design 17.3) with the authoritative transition table and field combinations of
    /// <c>protocol/messages.md</c> section 6. Pure: <see cref="TryTransition"/> returns a new <see cref="SessionState"/> or an error.
    /// <para>
    /// <c>MissionSeq</c> rises by 1 when a new mission starts (LOBBY or CAMPAIGN_HUB → BRIEFING) and on a retry (DEBRIEF → BUILD,
    /// design 9.9). Decisions: the contract is cleared on LOBBY, CAMPAIGN_HUB and a new mission; BUILD and every later phase need a
    /// contract; a change of mode or flight phase inside a phase is always allowed if the field combination is valid (no ordering
    /// is enforced between flight phases, because aborts and holds revisit phases).
    /// </para>
    /// </summary>
    public static class SessionMachine
    {
        private static readonly Dictionary<SessionPhase, SessionPhase[]> Graph = new Dictionary<SessionPhase, SessionPhase[]>
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

        /// <summary>True when the phase graph allows a change from one phase to another (a phase to itself is always allowed).</summary>
        public static bool CanChangePhase(SessionPhase from, SessionPhase to)
        {
            if (from == to) return true;
            return Array.IndexOf(Graph[from], to) >= 0;
        }

        /// <summary>Phases reachable in one step from a phase, not counting itself.</summary>
        public static IReadOnlyList<SessionPhase> NextPhases(SessionPhase from) => Graph[from];

        /// <summary>
        /// Moves the session. On success <see cref="TransitionResult.State"/> is the next state; otherwise
        /// <see cref="TransitionResult.ErrorCode"/> is <c>INVALID_TRANSITION</c>. Never throws for an illegal move.
        /// </summary>
        public static TransitionResult TryTransition(SessionState current, SessionTarget to)
        {
            if (current == null) throw new ArgumentNullException(nameof(current));
            if (to == null) throw new ArgumentNullException(nameof(to));

            var combo = CheckCombination(to);
            if (combo != null) return TransitionResult.Fail(combo);
            if (!CanChangePhase(current.Phase, to.Phase))
                return TransitionResult.Fail("Phase " + SessionTokens.Token(current.Phase) + " cannot go to " + SessionTokens.Token(to.Phase) + ".");

            var seq = current.MissionSeq;
            var seed = current.Seed;
            var contract = to.ContractId ?? current.ContractId;
            var newMission = current.Phase != to.Phase && to.Phase == SessionPhase.Briefing;
            var retry = current.Phase == SessionPhase.Debrief && to.Phase == SessionPhase.Build;
            if (newMission || retry)
            {
                seq = checked(seq + 1);
                if (to.NewSeed.HasValue) seed = to.NewSeed.Value;
            }
            if (newMission) contract = to.ContractId;
            if (to.Phase == SessionPhase.Lobby || to.Phase == SessionPhase.CampaignHub) contract = to.ContractId;

            if (RequiresContract(to.Phase) && string.IsNullOrEmpty(contract))
                return TransitionResult.Fail("Phase " + SessionTokens.Token(to.Phase) + " needs a contract.");

            return TransitionResult.Ok(new SessionState(seq, to.Mode ?? current.Mode, to.Phase, to.Sub, to.Review,
                to.FlightPhase, to.BoosterTrack, contract, seed));
        }

        private static bool RequiresContract(SessionPhase p) =>
            p == SessionPhase.Build || p == SessionPhase.Frr || p == SessionPhase.Countdown || p == SessionPhase.Flight || p == SessionPhase.Debrief;

        /// <summary>Field combinations of protocol section 6; returns a message for an invalid combination, else null.</summary>
        private static string? CheckCombination(SessionTarget t)
        {
            var name = SessionTokens.Token(t.Phase);
            if (t.BoosterTrack && t.Phase != SessionPhase.Flight) return "boosterTrack is allowed in FLIGHT only.";
            switch (t.Phase)
            {
                case SessionPhase.Lobby:
                case SessionPhase.Briefing:
                case SessionPhase.ContractVote:
                case SessionPhase.CampaignHub:
                    if (t.Sub != SessionSub.None) return name + " has no sub-state.";
                    if (t.Review != null) return name + " has no review.";
                    if (t.FlightPhase != null) return name + " has no flight phase.";
                    return null;
                case SessionPhase.Build:
                    if (t.Sub != SessionSub.None && t.Sub != SessionSub.VoteRound && t.Sub != SessionSub.Test
                        && t.Sub != SessionSub.Anomaly && t.Sub != SessionSub.Review)
                        return "BUILD does not allow sub-state " + SessionTokens.Token(t.Sub) + ".";
                    if (t.Sub == SessionSub.Review)
                    {
                        if (t.Review != ReviewId.Pdr && t.Review != ReviewId.Cdr) return "BUILD REVIEW needs review PDR or CDR.";
                    }
                    else if (t.Review != null) return "A review is allowed in BUILD only with sub-state REVIEW.";
                    if (t.FlightPhase != null) return "BUILD has no flight phase.";
                    return null;
                case SessionPhase.Frr:
                    if (t.Sub != SessionSub.None) return "FRR has no sub-state.";
                    if (t.Review != ReviewId.Frr) return "FRR needs review FRR.";
                    if (t.FlightPhase != null) return "FRR has no flight phase.";
                    return null;
                case SessionPhase.Countdown:
                    if (t.Sub != SessionSub.None) return "COUNTDOWN has no sub-state.";
                    if (t.Review != null) return "COUNTDOWN has no review.";
                    if (t.FlightPhase != FlightPhaseId.F0 && t.FlightPhase != FlightPhaseId.F1) return "COUNTDOWN needs flight phase F0 or F1.";
                    return null;
                case SessionPhase.Flight:
                    if (t.Sub != SessionSub.Flying && t.Sub != SessionSub.Abort) return "FLIGHT needs sub-state FLYING or ABORT.";
                    if (t.Review != null) return "FLIGHT has no review.";
                    if (t.FlightPhase == null || t.FlightPhase < FlightPhaseId.F2 || t.FlightPhase > FlightPhaseId.F13 || t.FlightPhase == FlightPhaseId.F7b)
                        return "FLIGHT needs a flight phase F2–F13 (the booster track F7b is signalled by boosterTrack).";
                    return null;
                default: // Debrief
                    if (t.Sub != SessionSub.Summary && t.Sub != SessionSub.Investigation) return "DEBRIEF needs sub-state SUMMARY or INVESTIGATION.";
                    if (t.Review != null) return "DEBRIEF has no review.";
                    if (t.FlightPhase != null) return "DEBRIEF has no flight phase.";
                    return null;
            }
        }
    }
}
