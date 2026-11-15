using System;
using System.Collections.Generic;

namespace MissionForge.Screens.Briefing
{
    public enum BriefingStepKind
    {
        /// <summary>The contract card appears.</summary>
        Card,
        Objectives,
        Constraints,
        /// <summary>CAPCOM line <see cref="BriefingStep.Index"/> is spoken and subtitled.</summary>
        Line,
    }

    public readonly struct BriefingStep
    {
        public BriefingStep(int atMs, BriefingStepKind kind, int index)
        {
            AtMs = atMs;
            Kind = kind;
            Index = index;
        }

        public int AtMs { get; }
        public BriefingStepKind Kind { get; }
        public int Index { get; }
    }

    /// <summary>
    /// Timing of one briefing page (T027 step 3): the card, objectives and constraints enter in sequence while the
    /// CAPCOM lines run one sentence at a time. A page never exceeds its budget (the whole briefing is at most 60 s). Pure.
    /// All values are <c>game_value</c> editorial pacing.
    /// </summary>
    public static class BriefingTimeline
    {
        public const int CardAtMs = 300;
        public const int ObjectivesAtMs = 2600;
        public const int ConstraintsAtMs = 5600;
        public const int FirstLineAtMs = 900;
        public const int MinLineMs = 2600;
        public const int MaxLineMs = 7000;
        public const int MsPerChar = 48;
        public const int GapMs = 350;
        public const int HoldMs = 2500;
        public const int MaxBriefingMs = 60000;

        /// <summary>How long a CAPCOM line stays up (reading speed, bounded).</summary>
        public static int LineDurationMs(int chars) => Math.Max(MinLineMs, Math.Min(MaxLineMs, chars * MsPerChar));

        /// <summary>Steps of a page for CAPCOM lines of the given lengths, fitted into <paramref name="budgetMs"/>; <paramref name="totalMs"/> is the page end including the hold.</summary>
        public static IReadOnlyList<BriefingStep> Plan(IReadOnlyList<int> lineChars, int budgetMs, out int totalMs)
        {
            var steps = new List<BriefingStep> { new BriefingStep(CardAtMs, BriefingStepKind.Card, 0) };
            steps.Add(new BriefingStep(ObjectivesAtMs, BriefingStepKind.Objectives, 0));
            steps.Add(new BriefingStep(ConstraintsAtMs, BriefingStepKind.Constraints, 0));

            long natural = 0;
            for (int i = 0; i < lineChars.Count; i++) natural += LineDurationMs(lineChars[i]) + GapMs;
            long available = Math.Max(1000, budgetMs - FirstLineAtMs - HoldMs);
            double scale = natural > available ? available / (double)natural : 1.0;

            int at = FirstLineAtMs;
            for (int i = 0; i < lineChars.Count; i++)
            {
                steps.Add(new BriefingStep(at, BriefingStepKind.Line, i));
                at += (int)((LineDurationMs(lineChars[i]) + GapMs) * scale);
            }
            totalMs = Math.Max(at, ConstraintsAtMs + 1500) + HoldMs;
            steps.Sort((a, b) => a.AtMs.CompareTo(b.AtMs));
            return steps;
        }
    }
}
