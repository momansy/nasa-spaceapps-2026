using System;
using MissionForge.Core.Build;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// What the pre-flight screens announce to the rest of the game (T027). T026's MinigameDirector listens for
    /// <see cref="FrrConcluded"/> to fire MG-07 at countdown F1; the Build Bay listens for <see cref="ReviewClosed"/> /
    /// <see cref="TestCompleted"/> if it wants to react without awaiting the flows.
    /// </summary>
    public static class PreflightEvents
    {
        /// <summary>The briefing ended (played out or skipped); true when the contract was locked (no vote follows).</summary>
        public static event Action<bool> BriefingFinished;

        /// <summary>The contract the team chose (or the host locked). Contract id, e.g. <c>C1</c>.</summary>
        public static event Action<string> ContractChosen;

        /// <summary>A test finished; the outcome carries the new build and the flaw result.</summary>
        public static event Action<TestOutcome> TestCompleted;

        /// <summary>A PDR / CDR closed; passed = the team voted Pass.</summary>
        public static event Action<ReviewKind, bool> ReviewClosed;

        /// <summary>The FRR poll ended: the outcome and the final <c>poll.result</c> (console call order = <c>answers</c>).</summary>
        public static event Action<PollOutcome, PollResult> FrrConcluded;

        public static void RaiseBriefingFinished(bool locked) => BriefingFinished?.Invoke(locked);
        public static void RaiseContractChosen(string id) => ContractChosen?.Invoke(id);
        public static void RaiseTestCompleted(TestOutcome o) => TestCompleted?.Invoke(o);
        public static void RaiseReviewClosed(ReviewKind k, bool passed) => ReviewClosed?.Invoke(k, passed);
        public static void RaiseFrrConcluded(PollOutcome o, PollResult r) => FrrConcluded?.Invoke(o, r);
    }
}
