#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
using System.Collections;
using System.IO;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    public static partial class EvidenceShots
    {
        static partial void RegisterMore()
        {
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("03-vote-in-progress-ghost-tallies", VoteInProgress, 0.8f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("04-assembly-crane-sparks", AssemblyFrame, 0f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("10-landing-sequence", LandingSequence, 0f));
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

        /// <summary>Length of the landing sequence, s of real time (T034 rework, U7 motion evidence).</summary>
        public const float SequenceSeconds = 13f;

        /// <summary>
        /// Records a part landing as a full-resolution JPEG frame sequence into <c>&lt;shots&gt;/10-landing-sequence/</c>:
        /// from the moment the crane starts lowering the next voted part, for <see cref="SequenceSeconds"/> of real time
        /// (the bay animates on unscaled time, so the capture cannot slow it down). Each frame's real time is written to
        /// <c>timestamps.txt</c>; make_motion.sh encodes the frames with those exact durations, so the clip plays at real
        /// speed. UI is shown unless <c>-mfBaySeqNoUi</c> is set.
        /// </summary>
        private static IEnumerator LandingSequence(BuildBayScreen s)
        {
            yield return ShowUi(!BuildBayScreen.Flag("-mfBaySeqNoUi"));
            yield return Until(() => s.Stage != null && s.Stage.IsAssembling, 120f);
            string dir = Path.Combine(BuildBayEvidence.Folder, "10-landing-sequence");
            Directory.CreateDirectory(dir);
            var stamps = new System.Text.StringBuilder();
            float start = Time.realtimeSinceStartup;
            int i = 0;
            bool wasAssembling = true;
            while (Time.realtimeSinceStartup - start < SequenceSeconds)
            {
                yield return new WaitForEndOfFrame();
                float t = Time.realtimeSinceStartup - start;
                Texture2D full = ScreenCapture.CaptureScreenshotAsTexture();
                File.WriteAllBytes(Path.Combine(dir, "frame_" + i.ToString("000") + ".jpg"), full.EncodeToJPG(88));
                Object.Destroy(full);
                stamps.Append(i.ToString("000")).Append(' ').Append(t.ToString("0.000", System.Globalization.CultureInfo.InvariantCulture)).Append('\n');
                if (wasAssembling && !s.Stage.IsAssembling)
                    Debug.Log("[MissionForge] Evidence sequence: assembly ended at frame " + i + ", t = " + t.ToString("0.00") + " s");
                wasAssembling = s.Stage.IsAssembling;
                i++;
            }
            File.WriteAllText(Path.Combine(dir, "timestamps.txt"), stamps.ToString());
            Debug.Log("[MissionForge] Evidence sequence: " + i + " frames in " + SequenceSeconds + " s");
        }
    }
}
#endif
