using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Random;
using MissionForge.Core.Session;
using Newtonsoft.Json.Linq;
using CoreInvestigation = MissionForge.Core.Session.Investigation;

namespace MissionForge.EndScreens.Investigation
{
    /// <summary>
    /// The MG-28 run the host starts (T022 contract, client/src/minigames/MG-28/README.md): four cause options from Core
    /// <see cref="CoreInvestigation.Open"/>, the root cause's whole chain, two cards of each other option and two red herrings,
    /// dealt round-robin. Deterministic from the seed.
    /// </summary>
    public sealed class InvestigationSetup
    {
        public const string MinigameId = "MG-28";
        /// <summary>Number of cause options (contract).</summary>
        public const int OptionCount = 4;
        /// <summary>Cards of each wrong option and red herrings dealt (the phone's seeded fallback uses the same counts).</summary>
        public const int CardsPerDistractor = 2;
        public const int Herrings = 2;

        public InvestigationSetup(ClueTable table, string rootCauseId, IReadOnlyList<string> optionIds, IReadOnlyList<int> clues,
            IReadOnlyList<string> playerIds)
        {
            Table = table ?? throw new ArgumentNullException(nameof(table));
            RootCauseId = rootCauseId;
            OptionIds = optionIds;
            CauseOptions = optionIds.Select(table.ModeIndex).ToArray();
            CauseCorrect = optionIds.ToList().IndexOf(rootCauseId);
            if (CauseOptions.Length != OptionCount || CauseCorrect < 0 || CauseOptions.Distinct().Count() != OptionCount)
                throw new ArgumentException("an investigation needs four distinct options including the root cause");
            Clues = clues.ToArray();
            int root = table.ModeIndex(rootCauseId);
            TrueChain = table.ChainOf(root).Select(id => Array.IndexOf(Clues, id)).ToArray();
            ChainLen = TrueChain.Length;
            PlayerIds = playerIds?.ToArray() ?? Array.Empty<string>();
            int slots = Math.Max(1, PlayerIds.Count);
            CardsBySlot = Enumerable.Range(0, slots).Select(s => Enumerable.Range(0, Clues.Length).Where(i => i % slots == s).ToArray()).ToArray();
        }

        public ClueTable Table { get; }
        public string RootCauseId { get; }
        /// <summary>Failure-mode ids of the four options, in the order shown.</summary>
        public IReadOnlyList<string> OptionIds { get; }
        /// <summary>Indices into the failure_mode enum (params.cause_options).</summary>
        public int[] CauseOptions { get; }
        /// <summary>Index into <see cref="CauseOptions"/> of the root cause (params.cause_correct).</summary>
        public int CauseCorrect { get; }
        /// <summary>Clue-card ids dealt (params.clues).</summary>
        public int[] Clues { get; }
        public int ChainLen { get; }
        /// <summary>Per place, the index into <see cref="Clues"/> of the right card.</summary>
        public int[] TrueChain { get; }
        public IReadOnlyList<string> PlayerIds { get; }
        /// <summary>Per slot, the indices into <see cref="Clues"/> dealt to that player.</summary>
        public int[][] CardsBySlot { get; }

        /// <summary>Builds the run for a failure through Core: <see cref="Investigation.Open"/> picks the options.</summary>
        public static InvestigationSetup ForFailure(ClueTable table, string failureModeId, string flightPhase, string slot, ulong seed, IReadOnlyList<string> playerIds)
        {
            InvestigationCase c = CoreInvestigation.Open(failureModeId, flightPhase ?? "", slot ?? "", seed);
            var rng = new SeededRandom(seed).ForStream("mg28_deal");
            var clues = new List<int>(table.ChainOf(table.ModeIndex(c.RootCauseId)));
            foreach (string d in c.DistractorIds) clues.AddRange(table.ChainOf(table.ModeIndex(d)).Take(CardsPerDistractor));
            var herrings = table.Herrings.ToList();
            for (int i = 0; i < Herrings && herrings.Count > 0; i++)
            {
                int k = rng.NextInt(0, herrings.Count);
                clues.Add(herrings[k]);
                herrings.RemoveAt(k);
            }
            for (int i = clues.Count - 1; i > 0; i--)
            {
                int j = rng.NextInt(0, i + 1);
                (clues[i], clues[j]) = (clues[j], clues[i]);
            }
            return new InvestigationSetup(table, c.RootCauseId, c.OptionIds, clues, playerIds);
        }

        public int SlotOf(string playerId)
        {
            for (int i = 0; i < PlayerIds.Count; i++) if (PlayerIds[i] == playerId) return i;
            return -1;
        }

        /// <summary>The player slot holding card <paramref name="clueIndex"/>, or −1.</summary>
        public int OwnerSlot(int clueIndex)
        {
            for (int s = 0; s < CardsBySlot.Length; s++) if (Array.IndexOf(CardsBySlot[s], clueIndex) >= 0) return s;
            return -1;
        }

        /// <summary><c>mg.start.params</c> common to every player.</summary>
        public JObject Params() => new JObject
        {
            { "cause_options", new JArray(CauseOptions) },
            { "cause_correct", CauseCorrect },
            { "clues", new JArray(Clues) },
            { "chain_len", ChainLen },
            { "slots", Math.Max(1, PlayerIds.Count) },
        };

        /// <summary><c>mg.start.assignments</c>: slot and dealt cards per player.</summary>
        public JArray Assignments()
        {
            var list = new JArray();
            for (int i = 0; i < PlayerIds.Count; i++)
            {
                list.Add(new JObject
                {
                    { "playerId", PlayerIds[i] },
                    { "index", i },
                    { "params", new JObject { { "slot", i }, { "cards", new JArray(CardsBySlot[i]) } } },
                });
            }
            return list;
        }

        /// <summary>The <c>mg.start</c> payload (type COOP_SPLIT, flight phase null for a debrief minigame).</summary>
        public JObject MgStart(string runId, uint seed32, long startAtMs, long durationMs, string assistLevel) => new JObject
        {
            { "runId", runId },
            { "minigameId", MinigameId },
            { "type", "COOP_SPLIT" },
            { "seed", seed32 },
            { "startAtMs", startAtMs },
            { "durationMs", durationMs },
            { "assistLevel", assistLevel },
            { "flightPhase", null },
            { "audience", false },
            { "params", Params() },
            { "assignments", Assignments() },
        };
    }
}
