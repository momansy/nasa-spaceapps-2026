using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>Program phase shown on the tracker (design 3.x: A concept, B/PDR, C/CDR, D/FRR).</summary>
    public enum ProgramPhase
    {
        A,
        B,
        C,
        D,
    }

    /// <summary>
    /// The host's build for the Build Bay: one immutable Core <see cref="BuildState"/> plus its dashboard. Every
    /// number comes from Core (<see cref="Dashboard.Compute(BuildState, GameCatalog)"/>, <see cref="VoteOptions"/>,
    /// <see cref="Preview"/>); this class only keeps the current state and announces changes.
    /// </summary>
    public sealed class BuildBaySession
    {
        public BuildBaySession(GameCatalog catalog, BuildState build)
        {
            Catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            SetBuild(build ?? throw new ArgumentNullException(nameof(build)));
        }

        public GameCatalog Catalog { get; }
        public BuildState Build { get; private set; }
        public DashboardMetrics Metrics { get; private set; }
        public ContractDef Contract => Catalog.Contract(Build.ContractId);

        /// <summary>Raised after every change of <see cref="Build"/>: (previous, current).</summary>
        public event Action<BuildState, BuildState> Changed;

        public void SetBuild(BuildState build)
        {
            BuildState previous = Build;
            Build = build ?? throw new ArgumentNullException(nameof(build));
            Metrics = Dashboard.Compute(build, Catalog);
            if (previous != null) Changed?.Invoke(previous, build);
        }

        /// <summary>Next vote slot (Core), or null when every part is chosen.</summary>
        public string NextVote => VoteOptions.NextVote(Build, Catalog);

        /// <summary>The PART votes of this contract in order (Core).</summary>
        public IReadOnlyList<ContractVote> Votes => VoteOptions.VotesFor(Contract);

        /// <summary>Resolves a vote through Core (<see cref="VoteOptions.Commit"/>) and returns the new build.</summary>
        public BuildState Commit(string slot, string partId)
        {
            BuildState next = VoteOptions.Commit(Build, Catalog, slot, partId);
            SetBuild(next);
            return next;
        }

        /// <summary>Program phase for the tracker: A until propulsion votes start, B through propulsion (PDR), C for subsystems (CDR), D when every vote is done (FRR).</summary>
        public ProgramPhase Phase
        {
            get
            {
                string next = NextVote;
                if (next == null) return ProgramPhase.D;
                bool propulsionStarted = false, propulsionDone = true;
                foreach (string slot in Slots.PropulsionGroup)
                {
                    if (Contract.VoteFor(slot) == null) continue;
                    if (Build.Has(slot)) propulsionStarted = true; else propulsionDone = false;
                }
                if (IsPropulsion(next)) return ProgramPhase.B;
                if (propulsionDone && propulsionStarted) return ProgramPhase.C;
                return ProgramPhase.A;
            }
        }

        private static bool IsPropulsion(string slot)
        {
            foreach (string s in Slots.PropulsionGroup) if (s == slot) return true;
            return false;
        }

        /// <summary>Localised part name (Core resolves the strings key at load), or the id.</summary>
        public string PartName(string partId)
        {
            if (partId != null && Catalog.Parts.TryGetValue(partId, out PartDef p)) return string.IsNullOrEmpty(p.Name) ? partId : p.Name;
            return partId;
        }
    }
}
