using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.App
{
    /// <summary>
    /// What the host screens of one mission share while scenes are swapped (T027): the contract on offer or chosen, the
    /// session seed and the current Core build. Screens read and write it instead of passing arguments through the
    /// scene loader; <see cref="Reset"/> runs when a new mission starts. No rules live here, only state.
    /// </summary>
    public static class MissionContext
    {
        /// <summary>Session seed used when the room gives none (any fixed value; replays match for the same seed). game_value.</summary>
        public const ulong DefaultSeed = 2026UL;

        /// <summary>Contract the host locked in the lobby (Quick Mission fixed contract); null when the team votes.</summary>
        public static string LockedContractId { get; set; }

        /// <summary>Contracts offered to the vote (2–3 ids, Core's <c>ContractsBoard.Offer</c>); null until the briefing computed them.</summary>
        public static IReadOnlyList<string> OfferedContractIds { get; set; }

        /// <summary>The chosen contract (set by the Contract Vote or the lock); the Build Bay starts from it.</summary>
        public static string ContractId { get; set; }

        public static ulong Seed { get; set; } = DefaultSeed;

        /// <summary>The build as the last pre-flight screen left it (null before the first vote).</summary>
        public static BuildState Build { get; set; }

        /// <summary>The category a review's Rework reopened (null when none); the Build Bay re-votes it and calls DesignReview.CompleteRework.</summary>
        public static string ReworkCategory { get; set; }

        /// <summary>
        /// Build Bay hook (T063, Preflight README "Build Bay hook"): after a committed vote the Build Bay calls this with
        /// (build, catalog, committed slot, or null to re-check after an interlude). It runs <c>PreflightSchedule.After</c>
        /// and, when it names a Test Stand offer or a Design Review, switches to that screen and returns true (the Build Bay
        /// scene is then unloaded; it resumes from <see cref="Build"/> when the screen hands back). Returns false when no
        /// interlude is due. Registered by the TestStand assembly (it references Preflight and the Build Bay, which the Build
        /// Bay cannot reference back); null in builds without it.
        /// </summary>
        public static Func<BuildState, GameCatalog, string, bool> StartInterlude { get; set; }

        public static void Reset()
        {
            ReworkCategory = null;
            LockedContractId = null;
            OfferedContractIds = null;
            ContractId = null;
            Build = null;
            Seed = DefaultSeed;
        }
    }
}
