using System;
using System.Collections;
using System.Collections.Generic;
using MissionForge.App;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// Controller of <c>MF_Debrief</c> (design 14.1 screen 13, 9.9, 11.3–11.5, 12.2). Shows the debrief of the mission that
    /// just ended (<see cref="EndScreenSession.PendingDebrief"/>) or, in rehearsal, a fixture, both mapped through Core by
    /// <see cref="CoreDebriefAdapter"/>. On a failure it offers the fail-forward flow (replay, investigation, lessons, retry).
    /// </summary>
    public sealed partial class DebriefScreen : ScreenController
    {
        private const float DataTimeoutSeconds = 20f;

        [Tooltip("Rehearsal fixtures (Screens/Debrief/Fixtures/*.json), in the order the fixture picker shows them.")]
        [SerializeField] private TextAsset[] fixtures = Array.Empty<TextAsset>();

        private EndText _text;
        private CoreDebriefAdapter _adapter;
        private DebriefView _view;
        private DebriefPanels _panels;
        private Coroutine _loading;

        /// <summary>The debrief currently shown (null until data has loaded).</summary>
        public DebriefView View => _view;

        /// <summary>Raised after a debrief has been bound (evidence and tests wait for it).</summary>
        public event Action<DebriefView> Bound;

        protected override void OnEnter()
        {
            _panels = new DebriefPanels(Screen);
            Screen.Query<ScrollView>(className: "mf-end-scroll").ForEach(sv => MfScrollFade.Attach(sv));
            WireButtons();
            _loading = StartCoroutine(LoadWhenDataReady());
        }

        protected override void OnExit()
        {
            if (_loading != null) StopCoroutine(_loading);
            _loading = null;
            EndInvestigation();
        }

        private IEnumerator LoadWhenDataReady()
        {
            float until = Time.realtimeSinceStartup + DataTimeoutSeconds;
            while (App == null || App.Data == null || !App.Data.IsReady)
            {
                if (Time.realtimeSinceStartup > until)
                {
                    Debug.LogWarning("[MissionForge] Debrief: game data did not load; the debrief cannot be computed.");
                    yield break;
                }
                yield return null;
            }
            _text = new EndText(App.Data.Strings.Get);
            try
            {
                _adapter = new CoreDebriefAdapter(App.Data.Data.JsonByPath);
            }
            catch (Exception e)
            {
                Debug.LogError("[MissionForge] Debrief: Core could not load the scoring data: " + e.Message);
                yield break;
            }
            string fixture = (Application.isEditor || Debug.isDebugBuild ? CommandLine.Value("-mfDebriefFixture") : null) ?? EndScreenSession.RehearsalFixture;
            ShowRecord(EndScreenSession.PendingDebrief, fixture);
            _loading = null;
        }

        /// <summary>Shows the live record when there is one, otherwise the named rehearsal fixture.</summary>
        public void ShowRecord(DebriefRecord live, string fixtureId)
        {
            IDebriefSource source = live != null
                ? new CoreDebriefSource(_adapter, live)
                : new FixtureDebriefSource(_adapter, FixtureText(fixtureId));
            Bind(source.Load());
        }

        /// <summary>Switches the rehearsal fixture (fixture picker, evidence).</summary>
        public void ShowFixture(string fixtureId)
        {
            if (_adapter == null) return;
            EndScreenSession.RehearsalFixture = fixtureId;
            ShowRecord(null, fixtureId);
        }

        public IReadOnlyList<string> FixtureIds
        {
            get
            {
                var ids = new List<string>();
                foreach (TextAsset f in fixtures) if (f != null) ids.Add(f.name);
                return ids;
            }
        }

        private string FixtureText(string fixtureId)
        {
            foreach (TextAsset f in fixtures)
            {
                if (f != null && f.name == fixtureId) return f.text;
            }
            if (fixtures.Length > 0 && fixtures[0] != null) return fixtures[0].text;
            throw new InvalidOperationException("Debrief has no rehearsal fixtures assigned.");
        }

        private void Bind(DebriefView view)
        {
            EndInvestigation();
            Screen.EnableInClassList(LayerClass, false);
            _view = view;
            EndScreenSession.LastDebrief = view;
            _panels.Bind(view, _text, FixtureIds, ShowFixture);
            SetActions(view);
            Bound?.Invoke(view);
        }

        private void WireButtons()
        {
            Button(DebriefPanels.ContinueButton, Continue);
            Button(DebriefPanels.CodexButton, () => App?.Flow.OpenOverlay(ScreenId.Codex));
            Button(DebriefPanels.SettingsButton, () => App?.Flow.OpenOverlay(ScreenId.Settings));
            Button(DebriefPanels.ReplayButton, OpenReplay);
            Button(DebriefPanels.InvestigateButton, OpenInvestigation);
            Button(DebriefPanels.RetryButton, OpenInvestigation);
        }

        private void Button(string name, Action action)
        {
            Button b = Screen.Q<Button>(name);
            if (b != null) b.clicked += action;
        }

        private void SetActions(DebriefView view)
        {
            bool failed = view.Failure != null;
            _panels.SetButton(DebriefPanels.ContinueButton, _text["ui.host.debrief.btn.continue"], true, "arrow-right");
            _panels.SetButton(DebriefPanels.CodexButton, _text["ui.host.debrief.btn.codex"], true, "book-open");
            _panels.SetButton(DebriefPanels.SettingsButton, _text["ui.host.debrief.btn.settings"], true, "settings");
            _panels.SetButton(DebriefPanels.ReplayButton, _text["ui.host.debrief.btn.replay"], failed && HasReplay, "play");
            _panels.SetButton(DebriefPanels.InvestigateButton, _text["ui.host.debrief.btn.investigate"], failed && HasInvestigation, "scan-line");
            _panels.SetButton(DebriefPanels.RetryButton, _text["ui.host.debrief.btn.retry"], view.RetryAvailable && HasInvestigation, "wrench");
            FocusWhenShown(Screen.Q<Button>(failed && HasReplay ? DebriefPanels.ReplayButton : DebriefPanels.ContinueButton));
        }

        /// <summary>Debrief → Campaign Hub (design 17.3).</summary>
        private void Continue()
        {
            if (App == null || App.Flow == null) return;
            App.Flow.GoToPhase(GamePhase.CampaignHub);
        }

        // The replay (step 7) and investigation (step 8) layers plug in through these partial members.
        partial void ReplayAvailable(ref bool available);
        partial void InvestigationAvailable(ref bool available);
        partial void OpenReplayLayer();
        partial void OpenInvestigationLayer();

        private bool HasReplay
        {
            get
            {
                bool available = false;
                ReplayAvailable(ref available);
                return available;
            }
        }

        private bool HasInvestigation
        {
            get
            {
                bool available = false;
                InvestigationAvailable(ref available);
                return available;
            }
        }

        /// <summary>Opens the instant replay of the failure (button, evidence).</summary>
        public void OpenReplay() => OpenReplayLayer();

        /// <summary>Opens the root-cause investigation (button, evidence).</summary>
        public void OpenInvestigation() => OpenInvestigationLayer();

        /// <summary>Focuses <paramref name="target"/> once SceneFlow has enabled the screen (it is disabled while fading in).</summary>
        internal static void FocusWhenShown(VisualElement target)
        {
            if (target == null) return;
            int tries = 0;
            IVisualElementScheduledItem item = null;
            item = target.schedule.Execute(() =>
            {
                tries++;
                if (target.panel != null && target.enabledInHierarchy && target.resolvedStyle.display != DisplayStyle.None)
                {
                    target.Focus();
                    if (target.panel.focusController.focusedElement == target || tries > 40) item.Pause();
                }
                else if (tries > 40) item.Pause();
            }).Every(50);
        }
    }

    /// <summary>Command-line arguments for rehearsal and evidence (desktop players and the editor).</summary>
    public static class CommandLine
    {
        public static string Value(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == name) return args[i + 1];
            }
            return null;
        }

        public static bool Flag(string name) => Array.IndexOf(Environment.GetCommandLineArgs(), name) >= 0;
    }
}
