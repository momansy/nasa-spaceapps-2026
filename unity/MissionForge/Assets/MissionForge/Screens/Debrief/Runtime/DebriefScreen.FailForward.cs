using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using MissionForge.App;
using MissionForge.Core.Session;
using MissionForge.EndScreens.Investigation;
using MissionForge.EndScreens.Sources;
using MissionForge.Screens.Flight;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// Fail forward (design 9.9): instant replay → root-cause investigation (MG-28) → Lessons Learned → Retry, all inside
    /// MF_Debrief as layers over the debrief columns.
    /// </summary>
    public sealed partial class DebriefScreen
    {
        private const string LayerClass = "mf-debrief--layer";

        [Header("Fail forward")]
        [Tooltip("T016 flight recording the 2-D replay reads (Screens/Flight/Recordings/c1_ascent.json).")]
        [SerializeField] private TextAsset flightRecording;
        [Tooltip("Failing channel and failure time for the rehearsal replay (Screens/Debrief/Fixtures/replay_c1_pogo.json).")]
        [SerializeField] private TextAsset replayFixture;
        [Tooltip("MG-28 clue table (Screens/Debrief/Investigation/Data/investigation_clues.json).")]
        [SerializeField] private TextAsset clueTable;
        [Tooltip("Codex link table, for the lesson's real-world parallel (Screens/Codex/Data/codex_links.json).")]
        [SerializeField] private TextAsset codexLinks;

        private ReplayLayer _replay;
        private InvestigationLayer _investigationLayer;
        private InvestigationHost _investigation;
        private RoomMinigameChannel _channel;

        public ReplayLayer Replay => _replay;
        public InvestigationHost InvestigationRun => _investigation;
        public InvestigationLayer InvestigationView => _investigationLayer;

        /// <summary>
        /// A live flight hands over its own recording and failure trace (<see cref="EndScreenSession.LiveReplay"/>); in rehearsal
        /// the fixture is used only when it describes the same failure as the debrief.
        /// </summary>
        partial void ReplayAvailable(ref bool available) => available = ReplayJson(out _, out _);

        private bool ReplayJson(out string recording, out string failure)
        {
            recording = null;
            failure = null;
            if (_view?.Failure == null) return false;
            if (EndScreenSession.LiveReplay != null && !_view.IsRehearsal)
            {
                recording = EndScreenSession.LiveReplay.RecordingJson;
                failure = EndScreenSession.LiveReplay.FailureJson;
                return !string.IsNullOrEmpty(recording) && !string.IsNullOrEmpty(failure);
            }
            if (!_view.IsRehearsal || flightRecording == null || replayFixture == null) return false;
            string fixtureMode;
            try { fixtureMode = (string)Newtonsoft.Json.Linq.JObject.Parse(replayFixture.text)["failure"]; }
            catch (Newtonsoft.Json.JsonException) { return false; }
            if (fixtureMode != _view.Failure.FailureModeId) return false;
            recording = flightRecording.text;
            failure = replayFixture.text;
            return true;
        }

        partial void InvestigationAvailable(ref bool available) => available = clueTable != null;

        partial void OpenReplayLayer()
        {
            if (_view?.Failure == null) return;
            CloseLayers();
            ReplayView view;
            try
            {
                if (!ReplayJson(out string recording, out string failure)) return;
                view = new RecordingReplaySource(recording, failure, _view.IsRehearsal).Load();
            }
            catch (Exception e)
            {
                Debug.LogWarning("[MissionForge] Debrief: the replay could not be built: " + e.Message);
                return;
            }
            VisualElement host = ShowLayerHost(true);
            _replay = new ReplayLayer(host, view, _text, BackToDebrief, () => OpenInvestigationLayer());
            _replay.Open();
        }

        partial void OpenInvestigationLayer()
        {
            if (_view?.Failure == null) return;
            _replay?.Close();
            _replay = null;
            _investigationLayer?.Close();
            _investigationLayer = null;
            if (_investigation == null) try
            {
                ClueTable table = ClueTable.Parse(clueTable.text);
                IReadOnlyList<string> players = _view.Players.Select(p => p.Id).ToList();
                if (!_view.IsRehearsal && App?.Room?.Client != null)
                {
                    _channel = new RoomMinigameChannel(App.Room.Client);
                    if (_channel.PlayerIds.Count > 0) players = _channel.PlayerIds;
                }
                InvestigationSetup setup = InvestigationSetup.ForFailure(table, _view.Failure.FailureModeId, _view.Failure.FlightPhaseId, _view.Failure.Slot, _view.Seed, players);
                string runId = "m" + Math.Max(1, App != null ? App.MissionSeq : 1) + ".mg28";
                _investigation = new InvestigationHost(setup, _channel, _adapter.Scoring, () => Time.realtimeSinceStartup, runId,
                    (uint)(_view.Seed & 0xFFFFFFFFUL), _channel?.AssistLevel ?? AssistLevelWire(_view.AssistLevelId));
            }
            catch (Exception e)
            {
                Debug.LogWarning("[MissionForge] Debrief: the investigation could not start: " + e.Message);
                return;
            }

            CodexEntryView lessonEntry = null;
            try
            {
                var codex = new CodexSource(App.Data.Data.JsonByPath, codexLinks != null ? codexLinks.text : null, new CodexUnlocks(), _view.IsRehearsal);
                lessonEntry = codex.Find(CodexSource.LessonId(_view.Failure.FailureModeId));
            }
            catch (Exception e)
            {
                Debug.LogWarning("[MissionForge] Debrief: no Codex parallel for the lesson: " + e.Message);
            }

            VisualElement host = ShowLayerHost(true);
            var players2 = _view.Players.ToDictionary(p => p.Id, p => p);
            _investigationLayer = new InvestigationLayer(host, _investigation, players2, lessonEntry, _text, BackToDebrief, OpenLessonInCodex, StartRetry);
            _investigationLayer.Open();
        }

        private static string AssistLevelWire(string id) => string.IsNullOrEmpty(id) ? "ENGINEER" : id.ToUpperInvariant();

        private VisualElement ShowLayerHost(bool on)
        {
            Screen.EnableInClassList(LayerClass, on);
            return Screen.Q("layer-host");
        }

        private void BackToDebrief()
        {
            CloseLayers();
            ShowLayerHost(false);
            Screen.Q<Button>(DebriefPanels.ContinueButton)?.Focus();
        }

        private void CloseLayers()
        {
            _replay?.Close();
            _replay = null;
            _investigationLayer?.Close();
            _investigationLayer = null;
        }

        /// <summary>Ends the MG-28 run for good (a new debrief or leaving the screen): the summary goes out if it was open.</summary>
        private void EndInvestigation()
        {
            CloseLayers();
            _investigation?.Dispose();
            _investigation = null;
            _channel?.Dispose();
            _channel = null;
        }

        private void OpenLessonInCodex()
        {
            if (_view?.Failure == null || App == null) return;
            string id = CodexSource.LessonId(_view.Failure.FailureModeId);
            EndScreenSession.UnlockedCodex.Add(id);
            EndScreenSession.CodexFocus = id;
            App.Flow.OpenOverlay(ScreenId.Codex);
        }

        /// <summary>
        /// Retry (9.9.4): the Lessons Learned flags from Core go into <see cref="EndScreenSession.Retry"/> for the Build Bay, and
        /// the host walks the legal phase path Debrief → Lobby → Briefing → Contract vote → Build.
        /// </summary>
        public void StartRetry()
        {
            if (_view?.Failure == null) return;
            string mode = _view.Failure.FailureModeId;
            LessonCard lesson = LessonsLearned.For(mode);
            var flags = lesson.Effects.Select(e => e.Kind == LessonEffectKind.BuildFlag ? e.Value : Retry.FreeTestPrefix + e.Value).ToList();
            EndScreenSession.Retry = new RetryHandoff(_view.ContractId, mode, _view.Failure.Slot, lesson.Id, flags);
            EndScreenSession.UnlockedCodex.Add(CodexSource.LessonId(mode));
            RetryStarted?.Invoke(EndScreenSession.Retry);
            if (App != null) App.StartCoroutine(WalkToBuild(App.Flow));
        }

        /// <summary>Raised when the retry hand-off is written (evidence).</summary>
        public event Action<RetryHandoff> RetryStarted;

        private static IEnumerator WalkToBuild(SceneFlow flow)
        {
            foreach (GamePhase phase in new[] { GamePhase.Lobby, GamePhase.Briefing, GamePhase.ContractVote, GamePhase.Build })
            {
                while (flow.IsBusy || flow.Overlay != null) yield return null;
                if (!flow.GoToPhase(phase)) yield break;
                yield return null;
            }
        }
    }
}
