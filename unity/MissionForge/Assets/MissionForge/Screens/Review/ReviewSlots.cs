using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Screens.Review
{
    /// <summary>
    /// Which decided categories a REWORK_CATEGORY vote offers after a review (T027 steps 5–6). Only Core data: the
    /// categories each issue names (<c>category</c> argument, or Core's <see cref="ValidationRules.RequiredCategories"/>
    /// for a design rule). When no issue names a decided category (budget, schedule, an undecided vote), the three decided
    /// categories with the highest re-integration fee are offered (display choice, game_value).
    /// </summary>
    public static class ReviewSlots
    {
        public const int FallbackCount = 3;
        /// <summary>Protocol maximum of a vote's options.</summary>
        public const int MaxSlots = 10;

        public static List<string> For(ReviewReport report, BuildState build, GameCatalog catalog)
        {
            var slots = new List<string>();
            foreach (ValidationIssue i in report.Issues)
            {
                if (i.Args != null && i.Args.TryGetValue("category", out string c)) Add(slots, build, c);
                foreach (string rc in ValidationRules.RequiredCategories(i.RuleId)) Add(slots, build, rc);
            }
            if (slots.Count > MaxSlots) slots.RemoveRange(MaxSlots, slots.Count - MaxSlots);
            if (slots.Count > 0) return slots;
            var decided = new List<(string slot, double fee)>();
            foreach (string s in Slots.VoteOrder) if (build.Has(s)) decided.Add((s, DesignReview.ReworkFeeM(build, catalog, s)));
            decided.Sort((a, b) => b.fee.CompareTo(a.fee));
            for (int i = 0; i < decided.Count && i < FallbackCount; i++) slots.Add(decided[i].slot);
            return slots;
        }

        private static void Add(List<string> slots, BuildState build, string slot)
        {
            if (!string.IsNullOrEmpty(slot) && build.Has(slot) && !slots.Contains(slot)) slots.Add(slot);
        }
    }
}
