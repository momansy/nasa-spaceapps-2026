using System.Collections.Generic;

namespace MissionForge.App
{
    /// <summary>The sixteen host screens of design section 14.1.</summary>
    public enum ScreenId
    {
        Title,
        Lobby,
        Briefing,
        ContractVote,
        BuildBay,
        TestStand,
        DesignReview,
        FlightReadinessReview,
        Countdown,
        Flight,
        MinigameOverlay,
        OrbitMap,
        Debrief,
        Codex,
        CampaignHub,
        Settings,
    }

    public enum ScreenKind
    {
        /// <summary>The primary screen of a phase.</summary>
        Primary,
        /// <summary>A screen that belongs to a phase but is not its first screen (Test Stand inside BUILD).</summary>
        Secondary,
        /// <summary>Drawn on top of whatever screen is showing (Minigame, Codex, Settings).</summary>
        Overlay,
    }

    public sealed class ScreenInfo
    {
        public ScreenId Id { get; }
        public string SceneName { get; }
        public string Title { get; }
        public GamePhase Phase { get; }
        public ScreenKind Kind { get; }
        /// <summary>UXML file name in UI/Layouts (without extension).</summary>
        public string Layout { get; }

        public ScreenInfo(ScreenId id, string title, GamePhase phase, ScreenKind kind)
        {
            Id = id;
            SceneName = ScreenCatalog.ScenePrefix + id;
            Title = title;
            Phase = phase;
            Kind = kind;
            Layout = id.ToString();
        }
    }

    /// <summary>One additive scene per host screen. Single source of truth for names, titles and phases.</summary>
    public static class ScreenCatalog
    {
        public const string ScenePrefix = "MF_";
        public const string ShellSceneName = "MF_Shell";

        public static readonly IReadOnlyList<ScreenInfo> All = new[]
        {
            new ScreenInfo(ScreenId.Title, "MISSIONFORGE", GamePhase.Title, ScreenKind.Primary),
            new ScreenInfo(ScreenId.Lobby, "LOBBY", GamePhase.Lobby, ScreenKind.Primary),
            new ScreenInfo(ScreenId.Briefing, "MISSION BRIEFING", GamePhase.Briefing, ScreenKind.Primary),
            new ScreenInfo(ScreenId.ContractVote, "CONTRACT VOTE", GamePhase.ContractVote, ScreenKind.Primary),
            new ScreenInfo(ScreenId.BuildBay, "BUILD BAY", GamePhase.Build, ScreenKind.Primary),
            new ScreenInfo(ScreenId.TestStand, "TEST STAND", GamePhase.Build, ScreenKind.Secondary),
            new ScreenInfo(ScreenId.DesignReview, "DESIGN REVIEW", GamePhase.Build, ScreenKind.Secondary),
            new ScreenInfo(ScreenId.FlightReadinessReview, "FLIGHT READINESS REVIEW", GamePhase.Frr, ScreenKind.Primary),
            new ScreenInfo(ScreenId.Countdown, "LAUNCH PAD", GamePhase.Countdown, ScreenKind.Primary),
            new ScreenInfo(ScreenId.Flight, "FLIGHT", GamePhase.Flight, ScreenKind.Primary),
            new ScreenInfo(ScreenId.MinigameOverlay, "MINIGAME", GamePhase.Flight, ScreenKind.Overlay),
            new ScreenInfo(ScreenId.OrbitMap, "ORBIT MAP", GamePhase.Flight, ScreenKind.Secondary),
            new ScreenInfo(ScreenId.Debrief, "DEBRIEF", GamePhase.Debrief, ScreenKind.Primary),
            new ScreenInfo(ScreenId.Codex, "CODEX", GamePhase.Title, ScreenKind.Overlay),
            new ScreenInfo(ScreenId.CampaignHub, "CAMPAIGN HUB", GamePhase.CampaignHub, ScreenKind.Primary),
            new ScreenInfo(ScreenId.Settings, "SETTINGS & ACCESSIBILITY", GamePhase.Title, ScreenKind.Overlay),
        };

        public static ScreenInfo Get(ScreenId id)
        {
            foreach (ScreenInfo info in All)
            {
                if (info.Id == id) return info;
            }
            throw new KeyNotFoundException("No screen registered for " + id);
        }

        public static bool TryGetBySceneName(string sceneName, out ScreenInfo info)
        {
            foreach (ScreenInfo candidate in All)
            {
                if (candidate.SceneName == sceneName)
                {
                    info = candidate;
                    return true;
                }
            }
            info = null;
            return false;
        }

        /// <summary>The first screen shown when a phase begins.</summary>
        public static ScreenInfo PrimaryFor(GamePhase phase)
        {
            foreach (ScreenInfo info in All)
            {
                if (info.Phase == phase && info.Kind == ScreenKind.Primary) return info;
            }
            throw new KeyNotFoundException("No primary screen for phase " + phase);
        }
    }
}
