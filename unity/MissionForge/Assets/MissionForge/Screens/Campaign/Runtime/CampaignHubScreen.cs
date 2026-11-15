using System;
using System.Collections;
using System.Globalization;
using System.Linq;
using MissionForge.App;
using MissionForge.Core.Campaign;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Campaign
{
    /// <summary>
    /// Controller of <c>MF_CampaignHub</c> (design 14.1 screen 15, 13.2): agency band, contracts board, tech tree (nodes
    /// bought with KP through Core <see cref="TechTree.Purchase"/>), hardware inventory with wear and refurbishment cost,
    /// budget carry-over, insurance, milestones and the hall of mission patches. Runs on a rehearsal fixture until the
    /// session hands over T014's <see cref="CampaignState"/> (<see cref="LiveState"/>).
    /// </summary>
    public sealed class CampaignHubScreen : ScreenController
    {
        private const float DataTimeoutSeconds = 20f;

        [Tooltip("Screens/Campaign/Fixtures/campaign_midway.json")]
        [SerializeField] private TextAsset rehearsalFixture;

        /// <summary>The live campaign, set by the session (T014); null means rehearsal.</summary>
        public static CampaignState LiveState { get; set; }
        public static ulong LiveSeed { get; set; } = 1UL;

        private EndText _text;
        private CoreCampaignAdapter _adapter;
        private CampaignState _state;
        private ulong _seed;
        private bool _rehearsal;
        private Coroutine _loading;

        public CampaignView View { get; private set; }
        public event Action<CampaignView> Bound;

        protected override void OnEnter()
        {
            Wire("btn-next", () => App?.Flow.GoToPhase(GamePhase.Briefing));
            Wire("btn-lobby", () => App?.Flow.GoToPhase(GamePhase.Lobby));
            Wire("btn-codex", () => App?.Flow.OpenOverlay(ScreenId.Codex));
            Wire("btn-settings", () => App?.Flow.OpenOverlay(ScreenId.Settings));
            Screen.Query<ScrollView>(className: "mf-hub__scroll").ForEach(sv => MfScrollFade.Attach(sv));
            _loading = StartCoroutine(LoadWhenReady());
        }

        protected override void OnExit()
        {
            if (_loading != null) StopCoroutine(_loading);
        }

        private void Wire(string name, Action action)
        {
            Button b = Screen.Q<Button>(name);
            if (b != null) b.clicked += action;
        }

        private IEnumerator LoadWhenReady()
        {
            float until = Time.realtimeSinceStartup + DataTimeoutSeconds;
            while (App == null || App.Data == null || !App.Data.IsReady)
            {
                if (Time.realtimeSinceStartup > until)
                {
                    Debug.LogWarning("[MissionForge] Campaign hub: game data did not load.");
                    yield break;
                }
                yield return null;
            }
            _text = new EndText(App.Data.Strings.Get);
            try
            {
                _adapter = new CoreCampaignAdapter(App.Data.Data.JsonByPath);
                if (LiveState != null)
                {
                    _state = LiveState;
                    _seed = LiveSeed;
                    _rehearsal = false;
                }
                else
                {
                    var fixture = new FixtureCampaignSource(_adapter, rehearsalFixture.text);
                    _state = fixture.State;
                    _seed = fixture.Seed;
                    _rehearsal = true;
                }
            }
            catch (Exception e)
            {
                Debug.LogError("[MissionForge] Campaign hub: campaign could not be loaded: " + e.Message);
                yield break;
            }
            Bind();
            _loading = null;
        }

        /// <summary>Buys a tech node through Core; the hub shows the new state (T014 persists it).</summary>
        public bool Buy(string techId)
        {
            try
            {
                _state = global::MissionForge.Core.Campaign.Campaign.PurchaseTech(_state, techId);
                if (!_rehearsal) LiveState = _state;
                Bind();
                FocusWhenShown(Screen.Q<Button>("tech-" + techId));
                return true;
            }
            catch (Exception e) when (e is InvalidOperationException || e is ArgumentException)
            {
                Debug.Log("[MissionForge] Campaign hub: " + techId + " not bought: " + e.Message);
                return false;
            }
        }

        private void Bind()
        {
            View = _adapter.Build(_state, _seed, _rehearsal);
            CampaignView v = View;
            var panels = new CampaignPanels(Screen, _text);
            panels.Agency(v);
            panels.Board(v);
            panels.Tech(v, Buy);
            panels.Inventory(v);
            panels.Milestones(v);
            panels.Hall(v);

            SetButton("btn-next", _text["ui.host.campaign.btn.next"], "rocket");
            SetButton("btn-lobby", _text["ui.host.campaign.btn.lobby"], "users");
            SetButton("btn-codex", _text["ui.host.debrief.btn.codex"], "book-open");
            SetButton("btn-settings", _text["ui.host.debrief.btn.settings"], "settings");
            Screen.Q("rehearsal-tag")?.EnableInClassList("mf-hub__rehearsal--hidden", !(v.IsRehearsal && (Application.isEditor || Debug.isDebugBuild)));
            Label tag = Screen.Q<Label>("rehearsal-text");
            if (tag != null) tag.text = _text["ui.host.debrief.rehearsal"];
            FocusWhenShown(Screen.Q<Button>("btn-next"));
            Bound?.Invoke(v);
        }

        private void SetButton(string name, string label, string icon)
        {
            Button b = Screen.Q<Button>(name);
            if (b == null) return;
            b.text = label;
            MfButtons.WithIcon(b, icon);
        }


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
}
