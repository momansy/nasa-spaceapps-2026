#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
using System.Collections;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    public static partial class EvidenceShots
    {
        static partial void RegisterMore()
        {
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("03-vote-in-progress-ghost-tallies", VoteInProgress, 0.8f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("04-assembly-crane-sparks", AssemblyFrame, 0f));
            RegisterTools();
        }

        static partial void RegisterTools();

        /// <summary>Waits (unscaled) until <paramref name="condition"/> holds or <paramref name="timeout"/> passes.</summary>
        public static IEnumerator Until(System.Func<bool> condition, float timeout = 90f)
        {
            float end = Time.realtimeSinceStartup + timeout;
            while (!condition() && Time.realtimeSinceStartup < end) yield return null;
            if (!condition()) Debug.LogWarning("[MissionForge] Evidence: condition not reached before timeout.");
        }

        private static IEnumerator VoteInProgress(BuildBayScreen s)
        {
            yield return ShowUi(true);
            yield return Until(() => s.Round.Stage == "VOTE" && s.Round.VotedIds.Count >= 3 && s.Round.LeadingOptionId != null);
            if (s.Channel is RehearsalVoteChannel r) r.SetPaused(true);
            yield return new WaitForSecondsRealtime(0.6f); // ghost cross-fade
            BuildBayEvidence.AfterCapture = () => { if (s.Channel is RehearsalVoteChannel rr) rr.SetPaused(false); };
        }

        private static IEnumerator AssemblyFrame(BuildBayScreen s)
        {
            yield return Until(() => s.Stage != null && s.Stage.IsAssembling, 120f);
            yield return new WaitForSecondsRealtime(BayStage.DescentSeconds + 0.35f);
        }
    }
}
#endif
