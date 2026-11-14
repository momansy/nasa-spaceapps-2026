using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Random;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Deterministic builds for rehearsal, evidence and tests: each vote takes a winnable option picked by Core's seeded
    /// PRNG (stream <c>rehearsal</c>) and is committed through <see cref="VoteOptions.Commit"/>, so every state is one
    /// a real session could reach. Display tooling only; never used for scoring.
    /// </summary>
    public static class SeededBuilds
    {
        public const string Stream = "rehearsal";

        /// <summary>Resolves up to <paramref name="votes"/> votes of <paramref name="contractId"/> from an empty build.</summary>
        public static BuildState Partial(GameCatalog catalog, string contractId, ulong seed, int votes)
        {
            BuildState build = BuildState.New(contractId, seed);
            for (int i = 0; i < votes; i++)
            {
                string slot = VoteOptions.NextVote(build, catalog);
                if (slot == null) break;
                string pick = Pick(build, catalog, slot, i);
                if (pick == null) break;
                build = VoteOptions.Commit(build, catalog, slot, pick);
            }
            return build;
        }

        /// <summary>A winnable option for <paramref name="slot"/>, chosen by the seeded PRNG.</summary>
        public static string Pick(BuildState build, GameCatalog catalog, string slot, int round)
        {
            IReadOnlyList<VoteOption> options = VoteOptions.For(build, catalog, slot, runFixSearch: false);
            var winnable = new List<VoteOption>();
            foreach (VoteOption o in options) if (o.CanWin) winnable.Add(o);
            if (winnable.Count == 0)
            {
                // Only options with a Blocker are left: let Core's fix-exists search decide which can still win.
                foreach (VoteOption o in VoteOptions.For(build, catalog, slot, runFixSearch: true)) if (o.CanWin) winnable.Add(o);
            }
            if (winnable.Count == 0) return null;
            SeededRandom random = new SeededRandom(build.Seed).ForStream(Stream + ":" + slot + ":" + round);
            return winnable[random.NextInt(0, winnable.Count)].Part.Id;
        }
    }
}
