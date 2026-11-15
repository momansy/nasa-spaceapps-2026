using MissionForge.App;
using MissionForge.App.Screens;
using MissionForge.Net;
using MissionForge.Screens.BuildBay;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Carries a session from the Build Bay into the flight through the existing <see cref="SceneFlow"/> and
    /// <see cref="GamePhaseMachine"/>, without changing App/:
    /// <list type="bullet">
    /// <item>captures the voted build from the Build Bay while its scene is still loaded (the flight flies it);</item>
    /// <item>rehearsal (no room): the FRR placeholder screen (T027 not on main) advances to COUNTDOWN after a short
    /// pause, so a rehearsal runs Build Bay → FRR → Countdown → Flight unattended;</item>
    /// <item>a <c>phase.set</c> received from the room (sticky resend after a host reconnect, or a second host
    /// device) for COUNTDOWN or FLIGHT walks the flow forward to it through the allowed transitions;</item>
    /// <item>leaving the flight ends the flight session.</item>
    /// </list>
    /// The host itself announces each phase with phase.set (AppRoot.OnPhaseChanged).
    /// </summary>
    public sealed class FlightFlowDirector : MonoBehaviour
    {
        /// <summary>Seconds the rehearsal shows the FRR placeholder before the countdown (game_value).</summary>
        public const float RehearsalFrrSeconds = 4f;

        private AppRoot _app;
        private RoomClient _client;
        private float _frrSince = -1f;
        private GamePhase? _target;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var go = new GameObject("MF_FlightFlowDirector") { hideFlags = HideFlags.DontSave };
            DontDestroyOnLoad(go);
            go.AddComponent<FlightFlowDirector>();
        }

        private void Update()
        {
            if (_app == null)
            {
                _app = AppRoot.Instance;
                if (_app == null || _app.Flow == null) return;
                _app.Flow.ScreenChanged += OnScreenChanged;
                _app.Flow.PhaseChanged += OnPhaseChanged;
            }
            if (_client == null && _app.Room != null && _app.Room.Client != null)
            {
                _client = _app.Room.Client;
                _client.MessageReceived += OnMessage;
            }

            SceneFlow flow = _app.Flow;
            if (flow.Phase == GamePhase.Frr && IsRehearsal() && FrrIsPlaceholder())
            {
                if (_frrSince < 0) _frrSince = Time.unscaledTime;
                if (Time.unscaledTime - _frrSince > RehearsalFrrSeconds && !flow.IsBusy) flow.GoToPhase(GamePhase.Countdown);
            }
            else _frrSince = -1f;

            if (_target.HasValue && !flow.IsBusy) StepToward(_target.Value);
        }

        private void OnDestroy()
        {
            if (_app != null && _app.Flow != null)
            {
                _app.Flow.ScreenChanged -= OnScreenChanged;
                _app.Flow.PhaseChanged -= OnPhaseChanged;
            }
            if (_client != null) _client.MessageReceived -= OnMessage;
        }

        private bool IsRehearsal() => FlightSession.Arg("-mfRehearsal") != null || _client == null || string.IsNullOrEmpty(_client.RoomCode);

        private static bool FrrIsPlaceholder()
        {
            Scene scene = SceneManager.GetSceneByName(ScreenCatalog.Get(ScreenId.FlightReadinessReview).SceneName);
            if (!scene.IsValid() || !scene.isLoaded) return false;
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                ScreenController c = root.GetComponentInChildren<ScreenController>(true);
                if (c != null) return c is RegionScreen;
            }
            return false;
        }

        private void OnScreenChanged(ScreenInfo info)
        {
            // The outgoing scene is unloaded only after this event, so the Build Bay session is still readable here.
            BuildBayScreen bay = FindAnyObjectByType<BuildBayScreen>();
            if (bay != null && bay.Session != null && bay.Session.Build != null)
                FlightSession.HandedOffBuild = bay.Session.Build;
        }

        private void OnPhaseChanged(GamePhase phase)
        {
            if (_target.HasValue && _target.Value == phase) _target = null;
            bool flying = phase == GamePhase.Countdown || phase == GamePhase.Flight;
            if (!flying && FlightSession.Feed != null) FlightSession.End();
        }

        private void OnMessage(Envelope envelope)
        {
            if (envelope == null || envelope.Type != ProtocolNames.Messages.PhaseSet || envelope.Data == null) return;
            string wire = (string)envelope.Data["phase"];
            if (wire == GamePhaseMachine.WireName(GamePhase.Countdown)) _target = GamePhase.Countdown;
            else if (wire == GamePhaseMachine.WireName(GamePhase.Flight)) _target = GamePhase.Flight;
        }

        /// <summary>One allowed transition toward <paramref name="target"/> (Build → FRR → Countdown → Flight).</summary>
        private void StepToward(GamePhase target)
        {
            SceneFlow flow = _app.Flow;
            if (flow.Phase == target) { _target = null; return; }
            GamePhase[] path = { GamePhase.Build, GamePhase.Frr, GamePhase.Countdown, GamePhase.Flight };
            int from = System.Array.IndexOf(path, flow.Phase), to = System.Array.IndexOf(path, target);
            if (from < 0 || to < 0 || from > to) { _target = null; return; }
            flow.GoToPhase(path[from + 1]);
        }
    }
}
