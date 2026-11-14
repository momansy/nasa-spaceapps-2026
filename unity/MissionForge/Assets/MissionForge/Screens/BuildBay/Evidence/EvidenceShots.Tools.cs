#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
using System.Collections;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    public static partial class EvidenceShots
    {
        static partial void RegisterTools()
        {
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("05-compare", Compare, 1.2f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("06-exploded", s => Only(s, BuildBayScreen.Tool.Exploded), 2.2f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("07-scale-reference", s => Only(s, BuildBayScreen.Tool.Scale), 2.5f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("08-stability-markers", s => Only(s, BuildBayScreen.Tool.Stability), 2.5f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("09-complete-vehicle-beauty", CompleteBeauty, 3f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("10-accessibility-view", s => Only(s, null), 2.5f));
        }

        private static void Pause(BuildBayScreen s, bool paused)
        {
            if (s.Channel is RehearsalVoteChannel r) r.SetPaused(paused);
        }

        private static IEnumerator Compare(BuildBayScreen s)
        {
            yield return ShowUi(true);
            yield return Until(() => s.Round.Stage == "VOTE" && s.Round.VotedIds.Count >= 2, 120f);
            Pause(s, true);
            s.SetTool(BuildBayScreen.Tool.Compare, true);
            yield return new WaitForSecondsRealtime(1.5f);
            BuildBayEvidence.AfterCapture = () => s.SetTool(BuildBayScreen.Tool.Compare, false);
        }

        /// <summary>Shows exactly one tool (or none), holding the rehearsal so the frame is stable.</summary>
        private static IEnumerator Only(BuildBayScreen s, BuildBayScreen.Tool? tool)
        {
            yield return ShowUi(true);
            yield return Until(() => s.Stage != null && !s.Stage.IsAssembling, 30f);
            Pause(s, true);
            foreach (BuildBayScreen.Tool t in System.Enum.GetValues(typeof(BuildBayScreen.Tool)))
            {
                bool on = tool.HasValue && t == tool.Value;
                if (s.IsToolOn(t) != on) s.SetTool(t, on);
            }
            yield return null;
        }

        private static IEnumerator CompleteBeauty(BuildBayScreen s)
        {
            foreach (BuildBayScreen.Tool t in System.Enum.GetValues(typeof(BuildBayScreen.Tool))) if (s.IsToolOn(t)) s.SetTool(t, false);
            Pause(s, false);
            yield return Until(() => s.Session.NextVote == null && s.Stage != null && !s.Stage.IsAssembling, 600f);
            yield return ShowUi(false);
            yield return new WaitForSecondsRealtime(2f);
        }
    }
}
#endif
