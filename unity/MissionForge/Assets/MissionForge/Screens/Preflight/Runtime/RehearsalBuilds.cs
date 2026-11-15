#if UNITY_EDITOR || MF_REHEARSAL
using System;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// Rehearsal stand-in for the Build Bay's votes (editor and MF_REHEARSAL builds only): continues a build with Core's
    /// own seeded picker (<see cref="SeededBuilds.Pick"/>) and <see cref="VoteOptions.Commit"/>, so the review screens can
    /// be shown in sequence without phones. Data, not logic: every number still comes from Core.
    /// </summary>
    public static class RehearsalBuilds
    {
        private const int MaxVotes = 128;

        /// <summary>Commits votes until none remain or <paramref name="stopBefore"/> says the next slot must stay open.</summary>
        public static BuildState Continue(BuildState build, GameCatalog catalog, Func<string, bool> stopBefore = null)
        {
            int round = 0;
            foreach (string s in Slots.VoteOrder) if (build.Has(s)) round++;
            for (int i = 0; i < MaxVotes; i++)
            {
                string slot = VoteOptions.NextVote(build, catalog);
                if (slot == null || stopBefore != null && stopBefore(slot)) break;
                string pick = SeededBuilds.Pick(build, catalog, slot, round++);
                if (pick == null) break;
                build = VoteOptions.Commit(build, catalog, slot, pick);
            }
            return build;
        }

        /// <summary>All votes but the last one (a forced FRR Blocker: one category undecided).</summary>
        public static BuildState AllButLast(BuildState build, GameCatalog catalog)
        {
            BuildState full = Continue(build, catalog);
            BuildState prev = build;
            BuildState cur = build;
            while (true)
            {
                BuildState next = Continue(cur, catalog, StopAfterOne());
                if (next == cur) break;
                prev = cur;
                cur = next;
                if (VoteOptions.NextVote(cur, catalog) == null) break;
            }
            return VoteOptions.NextVote(full, catalog) == null ? prev : full;
        }

        private static Func<string, bool> StopAfterOne()
        {
            int calls = 0;
            return _ => calls++ > 0;
        }

        /// <summary>Index of a slot in the design 6.2 vote order (int.MaxValue when it is not a voted slot).</summary>
        public static int VoteIndex(string slot)
        {
            for (int i = 0; i < Slots.VoteOrder.Count; i++) if (Slots.VoteOrder[i] == slot) return i;
            return int.MaxValue;
        }
    }
}
#endif
