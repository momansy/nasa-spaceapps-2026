using System;
using System.Collections;
using UnityEngine;

namespace MissionForge.App
{
    /// <summary>
    /// Desktop-player evidence tool, inert unless the player is started with <c>-mfShot</c>:
    /// <c>MissionForge -mfShot out.png [-mfPhase Build] [-mfWait 6]</c> walks the phase machine to
    /// the requested phase (each step a legal design 17.3 transition), waits, writes a screenshot of
    /// the full frame (3D, post-processing and UI) and quits. Never active in WebGL.
    /// </summary>
    public sealed class EvidenceDirector : MonoBehaviour
    {
        [SerializeField] private SceneFlow flow;

        private const float DefaultWaitSeconds = 6f;

        private void Start()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            string shot = Argument("-mfShot");
            if (string.IsNullOrEmpty(shot) || flow == null || Application.isEditor) return;
            string phaseName = Argument("-mfPhase") ?? "Title";
            float wait = float.TryParse(Argument("-mfWait"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out float w) ? w : DefaultWaitSeconds;
            StartCoroutine(Run(shot, phaseName, wait));
#endif
        }

        private IEnumerator Run(string shot, string phaseName, float wait)
        {
            if (!Enum.TryParse(phaseName, true, out GamePhase target))
            {
                Debug.LogError("[MissionForge] Unknown -mfPhase " + phaseName);
                Application.Quit(2);
                yield break;
            }
            yield return new WaitUntil(() => flow.Current != null && !flow.IsBusy);
            // T031 evidence: -mfCreateRoom opens a room first so the Lobby shows real crew from the (stub) server.
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-mfCreateRoom") >= 0)
            {
                AppRoot app = FindAnyObjectByType<AppRoot>();
                if (app != null && app.Room != null && app.Room.Client != null)
                {
                    app.Room.ConnectIfNeeded();
                    app.Room.Client.CreateRoom();
                    float until = Time.realtimeSinceStartup + 8f;
                    yield return new WaitUntil(() => !string.IsNullOrEmpty(app.Room.Client.RoomCode) || Time.realtimeSinceStartup > until);
                }
            }
            GamePhase[] order = { GamePhase.Title, GamePhase.Lobby, GamePhase.Briefing, GamePhase.ContractVote, GamePhase.Build };
            int targetIndex = Array.IndexOf(order, target);
            for (int i = 1; i <= targetIndex; i++)
            {
                if (!flow.GoToPhase(order[i])) break;
                yield return new WaitUntil(() => !flow.IsBusy);
            }
            yield return new WaitForSecondsRealtime(wait);
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(shot);
            yield return new WaitForSecondsRealtime(1.5f);
            Debug.Log("[MissionForge] Evidence shot " + flow.Current?.Id + " → " + shot);
            Application.Quit(0);
        }

        private static string Argument(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == name) return args[i + 1];
            }
            return null;
        }
    }
}
