using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace MissionForge.EndScreens.Investigation
{
    /// <summary>One MG-28 clue card: the failure mode it belongs to (index, −1 = red herring) and its place in that mode's chain.</summary>
    public sealed class Clue
    {
        public Clue(int id, int mode, int order, string channel, string pattern, string phase)
        {
            Id = id;
            Mode = mode;
            Order = order;
            Channel = channel;
            Pattern = pattern;
            Phase = phase;
        }

        public int Id { get; }
        public int Mode { get; }
        public int Order { get; }
        public string Channel { get; }
        public string Pattern { get; }
        public string Phase { get; }
        public bool IsHerring => Mode < 0;
    }

    /// <summary>
    /// The MG-28 clue table shared with the phone (client/src/minigames/MG-28/clues.ts, mirrored in
    /// Screens/Debrief/Investigation/Data/investigation_clues.json). Indices are the numbers on the wire.
    /// </summary>
    public sealed class ClueTable
    {
        public ClueTable(IReadOnlyList<string> failureModes, IReadOnlyList<Clue> clues)
        {
            FailureModes = failureModes ?? throw new ArgumentNullException(nameof(failureModes));
            Clues = clues ?? throw new ArgumentNullException(nameof(clues));
            for (int i = 0; i < clues.Count; i++)
            {
                if (clues[i].Id != i) throw new FormatException("investigation clues: clue " + i + " has id " + clues[i].Id);
            }
        }

        public IReadOnlyList<string> FailureModes { get; }
        public IReadOnlyList<Clue> Clues { get; }

        public static ClueTable Parse(string json)
        {
            JObject o = JObject.Parse(json);
            var modes = ((JArray)o["failure_modes"]).Select(t => (string)t).ToList();
            var clues = ((JArray)o["clues"]).Select(c => new Clue((int)c["id"], (int)c["mode"], (int)c["order"],
                (string)c["channel"], (string)c["pattern"], (string)c["phase"])).ToList();
            return new ClueTable(modes, clues);
        }

        public int ModeIndex(string failureModeId)
        {
            for (int i = 0; i < FailureModes.Count; i++) if (FailureModes[i] == failureModeId) return i;
            throw new ArgumentException("unknown failure mode '" + failureModeId + "'", nameof(failureModeId));
        }

        /// <summary>Clue ids of one failure mode, in chain order (clues.ts chainOf).</summary>
        public IReadOnlyList<int> ChainOf(int mode) => Clues.Where(c => c.Mode == mode).OrderBy(c => c.Order).Select(c => c.Id).ToList();

        public IReadOnlyList<int> Herrings => Clues.Where(c => c.IsHerring).Select(c => c.Id).ToList();
    }
}
