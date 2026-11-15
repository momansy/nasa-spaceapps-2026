using System;
using System.Collections;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Controller of <c>MF_BuildBay</c> (design 6.1, 14.1 #5). Owns the session build and binds the five regions:
    /// readiness dashboard (left), vote panel (right), rocket on the pad (centre, <see cref="BayStage"/>), timeline +
    /// budget (bottom), contract + phase tracker (top). Every number comes from MissionForge.Core.
    /// </summary>
    public sealed partial class BuildBayScreen : ScreenController
    {
        /// <summary>Contract used when the app has not chosen one (C1 Earth Watch, the first campaign contract).</summary>
        public const string DefaultContractId = "C1";
        /// <summary>Session seed used when none is given (any fixed value; replays match for the same seed).</summary>
        public const ulong DefaultSeed = 2026UL;
        private const float DataTimeoutSeconds = 20f;

        [SerializeField] private BayStage stage;

        private UiText _text;
        private DashboardView _dashboard;
        private TopBarView _topBar;
        private TimelineView _timeline;
        private readonly BayAccessibility _a11y = new BayAccessibility();
        private Coroutine _boot;

        public BuildBaySession Session { get; private set; }
        public UiText Text => _text;
        public BayStage Stage => stage;
        public BayAccessibility Accessibility => _a11y;

        /// <summary>"If chosen" delta of the option currently leading the vote, or null.</summary>
        public DashboardDelta LeadingDelta { get; private set; }

        /// <summary>Raised once the session exists and the views are bound.</summary>
        public event Action Ready;

        protected override void OnEnter()
        {
            _boot = StartCoroutine(Boot());
        }

        protected override void OnExit()
        {
            if (_boot != null) StopCoroutine(_boot);
            ExitDirector();
            if (Session != null) Session.Changed -= OnBuildChanged;
            _a11y.Changed -= ApplyAccessibility;
        }

        private IEnumerator Boot()
        {
            float deadline = Time.realtimeSinceStartup + DataTimeoutSeconds;
            while ((App == null || App.Data == null || !App.Data.IsReady) && Time.realtimeSinceStartup < deadline) yield return null;
            if (App == null || App.Data == null || !App.Data.IsReady)
            {
                Debug.LogError("[MissionForge] Build Bay: game data did not load (" + (App?.Data?.LastError ?? "no data service") + ").");
                yield break;
            }

            GameCatalog catalog;
            try
            {
                catalog = CatalogCache.Get(App.Data.Data);
            }
            catch (CatalogException e)
            {
                Debug.LogError("[MissionForge] Build Bay: catalog rejected by Core: " + e.Message);
                yield break;
            }

            _text = UiText.From(catalog.Strings);
            string contractId = Argument("-mfContract") ?? MissionContext.ContractId ?? DefaultContractId;
            if (!catalog.Contracts.ContainsKey(contractId)) contractId = DefaultContractId;
            int seededVotes = int.TryParse(Argument("-mfBayVotes"), out int v) ? v : 0;
            // T063: back from a Test Stand, Design Review or FRR rework, the bay resumes the mission's build.
            BuildState resumed = MissionContext.Build != null && MissionContext.Build.ContractId == contractId ? MissionContext.Build : null;
            BuildState initial = seededVotes > 0
                ? SeededBuilds.Partial(catalog, contractId, DefaultSeed, seededVotes)
                : resumed ?? BuildState.New(contractId, DefaultSeed);
            Session = new BuildBaySession(catalog, initial);
            Session.Changed += OnBuildChanged;

            _dashboard = new DashboardView(Screen, _text);
            _topBar = new TopBarView(Screen, _text);
            _timeline = new TimelineView(Screen, _text);
            _a11y.ApplyCommandLine();
            if (App.Room != null && App.Room.Client?.LastSettings != null) _a11y.FromRoom(App.Room.Client.LastSettings);
            _a11y.Changed += ApplyAccessibility;
            ApplyAccessibility();

            if (stage != null) stage.Bind(this);
            BindDirector();
            Refresh();
            EnterPanels();
            Ready?.Invoke();
#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
            BuildBayEvidence.Attach(this);
#endif
        }

        /// <summary>Shows a leading option's "if chosen" preview (dashboard deltas, budget bar) or clears it.</summary>
        public void SetLeadingPreview(DashboardDelta delta)
        {
            LeadingDelta = delta;
            Refresh();
        }

        public void Refresh()
        {
            if (Session == null) return;
            _dashboard.Show(Session.Metrics, LeadingDelta, _a11y.RightToLeft);
            _topBar.Show(Session);
            _timeline.Show(Session, LeadingDelta?.CostM ?? 0, _a11y.RightToLeft);
        }

        private void OnBuildChanged(BuildState previous, BuildState current)
        {
            LeadingDelta = null;
            Refresh();
        }

        /// <summary>T031 motion: the four regions enter on the enter token with a 40 ms stagger (reduced motion: fade only).</summary>
        private void EnterPanels()
        {
            string[] regions = { "bb-dashboard", "bb-top", "bb-bottom", "bb-vote" };
            for (int i = 0; i < regions.Length; i++)
            {
                VisualElement region = Screen.Q<VisualElement>(regions[i]);
                if (region == null) continue;
                region.AddToClassList("mf-motion");
                MissionForge.UI.MfMotion.Enter(region, i);
            }
        }

        private void ApplyAccessibility()
        {
            _a11y.ApplyTo(Screen);
            if (stage != null) stage.SetAccessibility(_a11y);
            Refresh();
        }

        /// <summary>
        /// A command-line value (<c>-mfName value</c>); in WebGL the page URL query (<c>?mfName=value</c>) stands in for
        /// the command line. Used for demos, rehearsal pacing and evidence only.
        /// </summary>
        internal static string Argument(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return QueryValue(name);
        }

        internal static bool Flag(string name) => Array.IndexOf(Environment.GetCommandLineArgs(), name) >= 0 || QueryValue(name) != null;

        private static string QueryValue(string name)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            string url = Application.absoluteURL ?? "";
            int q = url.IndexOf('?');
            if (q < 0) return null;
            string key = name.TrimStart('-');
            foreach (string pair in url.Substring(q + 1).Split('&'))
            {
                string[] kv = pair.Split('=');
                if (kv[0] == key) return kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : "";
            }
#endif
            return null;
        }
    }
}
