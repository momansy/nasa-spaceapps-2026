using System.Collections.Generic;

namespace MissionForge.App
{
    /// <summary>
    /// Session phases of design section 17.3, plus the pre-session Title.
    /// LOBBY → BRIEFING → CONTRACT_VOTE → BUILD → FRR → COUNTDOWN → FLIGHT → DEBRIEF → (CAMPAIGN_HUB | LOBBY).
    /// </summary>
    public enum GamePhase
    {
        Title,
        Lobby,
        Briefing,
        ContractVote,
        Build,
        Frr,
        Countdown,
        Flight,
        Debrief,
        CampaignHub,
    }

    /// <summary>
    /// Pure transition table for the host flow. No Unity types, so it is unit-testable.
    /// The session rules themselves (votes, reviews, aborts) belong to Core.Session; this
    /// only decides which host screen group may follow which.
    /// </summary>
    public static class GamePhaseMachine
    {
        private static readonly Dictionary<GamePhase, GamePhase[]> Allowed = new Dictionary<GamePhase, GamePhase[]>
        {
            { GamePhase.Title, new[] { GamePhase.Lobby } },
            { GamePhase.Lobby, new[] { GamePhase.Briefing, GamePhase.Title } },
            { GamePhase.Briefing, new[] { GamePhase.ContractVote } },
            { GamePhase.ContractVote, new[] { GamePhase.Build } },
            { GamePhase.Build, new[] { GamePhase.Frr } },
            // A NO-GO at the Flight Readiness Review sends the team back to rework the build.
            { GamePhase.Frr, new[] { GamePhase.Countdown, GamePhase.Build } },
            { GamePhase.Countdown, new[] { GamePhase.Flight } },
            { GamePhase.Flight, new[] { GamePhase.Debrief } },
            { GamePhase.Debrief, new[] { GamePhase.CampaignHub, GamePhase.Lobby } },
            { GamePhase.CampaignHub, new[] { GamePhase.Lobby, GamePhase.Briefing } },
        };

        /// <summary>The main line shown in the top-bar stepper, in order.</summary>
        public static readonly GamePhase[] MainLine =
        {
            GamePhase.Lobby, GamePhase.Briefing, GamePhase.ContractVote, GamePhase.Build,
            GamePhase.Frr, GamePhase.Countdown, GamePhase.Flight, GamePhase.Debrief,
        };

        public static bool CanTransition(GamePhase from, GamePhase to)
        {
            if (to == GamePhase.Title) return true; // Quitting to the title is always allowed.
            if (!Allowed.TryGetValue(from, out GamePhase[] next)) return false;
            foreach (GamePhase candidate in next)
            {
                if (candidate == to) return true;
            }
            return false;
        }

        public static IReadOnlyList<GamePhase> NextPhases(GamePhase from)
        {
            return Allowed.TryGetValue(from, out GamePhase[] next) ? next : System.Array.Empty<GamePhase>();
        }

        /// <summary>Wire name used in room.state / phase.set (design section 17.3 spelling).</summary>
        public static string WireName(GamePhase phase)
        {
            switch (phase)
            {
                case GamePhase.Title: return "TITLE";
                case GamePhase.Lobby: return "LOBBY";
                case GamePhase.Briefing: return "BRIEFING";
                case GamePhase.ContractVote: return "CONTRACT_VOTE";
                case GamePhase.Build: return "BUILD";
                case GamePhase.Frr: return "FRR";
                case GamePhase.Countdown: return "COUNTDOWN";
                case GamePhase.Flight: return "FLIGHT";
                case GamePhase.Debrief: return "DEBRIEF";
                case GamePhase.CampaignHub: return "CAMPAIGN_HUB";
                default: return phase.ToString().ToUpperInvariant();
            }
        }

        /// <summary>Short label for the stepper.</summary>
        public static string StepLabel(GamePhase phase)
        {
            switch (phase)
            {
                case GamePhase.ContractVote: return "CONTRACT";
                case GamePhase.Frr: return "FRR";
                default: return phase.ToString().ToUpperInvariant();
            }
        }
    }
}
