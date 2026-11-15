using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Scoring;
using Newtonsoft.Json.Linq;

namespace MissionForge.EndScreens.Investigation
{
    /// <summary>Shared MG-28 state the host keeps (mg.state.shared): the chain, the votes and the lock. Immutable.</summary>
    public sealed class InvestigationState
    {
        internal InvestigationState(int[] chain, IReadOnlyDictionary<string, int> votes, IReadOnlyDictionary<string, int> lastN, bool locked, int stateN)
        {
            Chain = chain;
            Votes = votes;
            LastN = lastN;
            Locked = locked;
            StateN = stateN;
        }

        /// <summary>Per chain place, the index into the setup's clues, or −1.</summary>
        public IReadOnlyList<int> Chain { get; }
        /// <summary>Current vote per player (index into cause_options).</summary>
        public IReadOnlyDictionary<string, int> Votes { get; }
        /// <summary>Last accepted action counter per player.</summary>
        public IReadOnlyDictionary<string, int> LastN { get; }
        public bool Locked { get; }
        /// <summary>mg.state counter; increases with every change.</summary>
        public int StateN { get; }

        public int[] VoteCounts
        {
            get
            {
                var counts = new int[InvestigationSetup.OptionCount];
                foreach (int v in Votes.Values) if (v >= 0 && v < counts.Length) counts[v]++;
                return counts;
            }
        }
    }

    public enum ActionOutcome
    {
        Applied,
        /// <summary>The counter n was not above the player's last one (late or duplicated message).</summary>
        Stale,
        /// <summary>The vote is locked; nothing changes any more.</summary>
        Locked,
        /// <summary>Unknown action, wrong arguments or a player not in the run.</summary>
        Invalid,
        /// <summary>A player tried to place a card dealt to someone else.</summary>
        NotOwner,
    }

    /// <summary>Per-player MG-28 result as the phone decides it (README "Result").</summary>
    public sealed class InvestigationResult
    {
        public InvestigationResult(IReadOnlyList<string> succeeded, IReadOnlyList<string> perfect, int active)
        {
            Succeeded = succeeded;
            Perfect = perfect;
            Active = active;
        }

        public IReadOnlyList<string> Succeeded { get; }
        public IReadOnlyList<string> Perfect { get; }
        public int Active { get; }
    }

    /// <summary>
    /// Pure reducer of the MG-28 shared state (T022 contract): actions <c>place</c> [clueIndex, chainSlot],
    /// <c>clear</c> [chainSlot], <c>vote</c> [optionIndex]; per-player increasing counters; the host decides the lock.
    /// <b>Decisions (game_value):</b> a player may place only cards dealt to them (any player may clear a place); placing a card
    /// already on the chain moves it; a place that holds another card is overwritten (that card returns to its owner's hand);
    /// a vote can change until the lock; an action with a counter not above the player's last one is stale and ignored.
    /// </summary>
    public static class InvestigationReducer
    {
        public static InvestigationState Start(InvestigationSetup setup) =>
            new InvestigationState(Enumerable.Repeat(-1, setup.ChainLen).ToArray(), new Dictionary<string, int>(), new Dictionary<string, int>(), false, 0);

        public static ActionOutcome Apply(InvestigationSetup setup, InvestigationState state, string playerId, int n, string action,
            IReadOnlyList<double> x, out InvestigationState next)
        {
            next = state;
            if (setup == null || state == null) throw new ArgumentNullException(setup == null ? nameof(setup) : nameof(state));
            int slot = setup.SlotOf(playerId);
            if (slot < 0) return ActionOutcome.Invalid;
            if (state.LastN.TryGetValue(playerId, out int last) && n <= last) return ActionOutcome.Stale;
            if (state.Locked) return ActionOutcome.Locked;

            var lastN = new Dictionary<string, int>(state.LastN) { [playerId] = n };
            var chain = state.Chain.ToArray();
            var votes = new Dictionary<string, int>(state.Votes);
            ActionOutcome outcome = ActionOutcome.Invalid;
            switch (action)
            {
                case "place":
                    if (Ints(x, 2, out int[] p) && p[0] >= 0 && p[0] < setup.Clues.Length && p[1] >= 0 && p[1] < setup.ChainLen)
                    {
                        if (setup.OwnerSlot(p[0]) != slot)
                        {
                            outcome = ActionOutcome.NotOwner;
                            break;
                        }
                        for (int i = 0; i < chain.Length; i++) if (chain[i] == p[0]) chain[i] = -1;
                        chain[p[1]] = p[0];
                        outcome = ActionOutcome.Applied;
                    }
                    break;
                case "clear":
                    if (Ints(x, 1, out int[] c) && c[0] >= 0 && c[0] < setup.ChainLen)
                    {
                        chain[c[0]] = -1;
                        outcome = ActionOutcome.Applied;
                    }
                    break;
                case "vote":
                    if (Ints(x, 1, out int[] v) && v[0] >= 0 && v[0] < InvestigationSetup.OptionCount)
                    {
                        votes[playerId] = v[0];
                        outcome = ActionOutcome.Applied;
                    }
                    break;
            }
            if (outcome != ActionOutcome.Applied)
            {
                // The counter is still consumed, so a replay of the same message stays stale.
                next = new InvestigationState(state.Chain.ToArray(), state.Votes, lastN, state.Locked, state.StateN);
                return outcome;
            }
            next = new InvestigationState(chain, votes, lastN, false, state.StateN + 1);
            return ActionOutcome.Applied;
        }

        /// <summary>The host locks the vote (everyone voted, or the deadline).</summary>
        public static InvestigationState Lock(InvestigationState state) =>
            state.Locked ? state : new InvestigationState(state.Chain.ToArray(), state.Votes, state.LastN, true, state.StateN + 1);

        public static bool EveryoneVoted(InvestigationSetup setup, InvestigationState state) =>
            setup.PlayerIds.Count > 0 && setup.PlayerIds.All(state.Votes.ContainsKey);

        /// <summary>The cause option with the most votes (ties: the lowest index), or −1 without votes.</summary>
        public static int Leading(InvestigationState state)
        {
            int[] counts = state.VoteCounts;
            int best = -1;
            for (int i = 0; i < counts.Length; i++) if (counts[i] > 0 && (best < 0 || counts[i] > counts[best])) best = i;
            return best;
        }

        /// <summary><c>mg.state.shared</c>: chain, votes per option, locked.</summary>
        public static JObject Shared(InvestigationState state) => new JObject
        {
            { "chain", new JArray(state.Chain) },
            { "votes", new JArray(state.VoteCounts) },
            { "locked", state.Locked },
        };

        /// <summary>Success = own vote is the root cause; perfect = success and every own card right (README "Result").</summary>
        public static InvestigationResult Results(InvestigationSetup setup, InvestigationState state)
        {
            var succeeded = new List<string>();
            var perfect = new List<string>();
            for (int s = 0; s < setup.PlayerIds.Count; s++)
            {
                string id = setup.PlayerIds[s];
                if (!state.Votes.TryGetValue(id, out int vote) || vote != setup.CauseCorrect) continue;
                succeeded.Add(id);
                bool allRight = true;
                foreach (int card in setup.CardsBySlot[s])
                {
                    int truePlace = Array.IndexOf(setup.TrueChain, card);
                    int placed = state.Chain.ToList().IndexOf(card);
                    if (truePlace >= 0 ? placed != truePlace : placed >= 0) allRight = false;
                }
                if (allRight) perfect.Add(id);
            }
            return new InvestigationResult(succeeded, perfect, setup.PlayerIds.Count);
        }

        /// <summary><c>mg.summary</c> payload; tier, Team Sync and points come from Core and data/scoring.json.</summary>
        public static JObject Summary(ScoringCatalog catalog, InvestigationSetup setup, InvestigationState state, string runId)
        {
            InvestigationResult r = Results(setup, state);
            TierResult tier = Tiers.Compute(catalog, r.Active, r.Succeeded.Count, r.Perfect.Count);
            string tierId = Tiers.Id(tier.Tier);
            return new JObject
            {
                { "runId", runId },
                { "minigameId", InvestigationSetup.MinigameId },
                { "active", r.Active },
                { "succeeded", r.Succeeded.Count },
                { "fraction", tier.FractionUnitless },
                { "tier", tierId == null ? "NONE" : tierId.ToUpperInvariant() },
                { "succeededIds", new JArray(r.Succeeded) },
                { "perfectIds", new JArray(r.Perfect) },
                { "sparkle", tier.Sparkle },
                { "boosts", new JArray() },
                { "syncDelta", tierId == null ? 0 : (int)Math.Round(catalog.SyncGain(Tiers.Id(Tiers.PaidTier(tier.Tier)))) },
                { "points", tierId == null ? 0 : (int)Math.Round(catalog.TermPoints("teamwork", "minigame_" + tierId)) },
                { "factId", null },
            };
        }

        private static bool Ints(IReadOnlyList<double> x, int count, out int[] values)
        {
            values = null;
            if (x == null || x.Count != count) return false;
            values = new int[count];
            for (int i = 0; i < count; i++)
            {
                double d = x[i];
                if (double.IsNaN(d) || d != Math.Floor(d) || d < int.MinValue || d > int.MaxValue) return false;
                values[i] = (int)d;
            }
            return true;
        }
    }
}
