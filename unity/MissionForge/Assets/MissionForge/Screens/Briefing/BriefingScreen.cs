using System;
using System.Collections.Generic;
using MissionForge.App;
using MissionForge.Core.Data;
using MissionForge.Screens.Preflight;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;
using UnityEngine.Video;

namespace MissionForge.Screens.Briefing
{
    /// <summary>
    /// Controller of <c>MF_Briefing</c> (design 14.1 #3, T027 step 3): at most 60 s, skippable. For the C1 Earth Watch contract
    /// the approved cinematic plays through a <see cref="VideoPlayer"/> URL (StreamingAssets, WebGL-safe) and holds its last
    /// frame; other contracts show the Shell's Earth. Over it, in sequence: the contract card (name, destination, payload,
    /// delta-v, budget, schedule, special rules, "inspired by"), objectives, constraints, and the CAPCOM line one sentence at a time,
    /// always subtitled. With several offered contracts each is introduced in turn; a locked contract is briefed in full.
    /// Reduced motion: a still frame and instant text.
    /// </summary>
    public sealed class BriefingScreen : PreflightScreen
    {
        public const string VideoFile = "c1-earth-watch-briefing.mp4";
        public const string VideoContractId = "C1";
        /// <summary>Pause after the last page before the app moves on, s (game_value).</summary>
        public const float HandOverDelaySeconds = 1.5f;

        private sealed class Page
        {
            public ContractBriefing Brief;
            public IReadOnlyList<string> Lines;
            public bool Full;
        }

        private readonly List<Page> _pages = new List<Page>();
        private int _pageIndex;
        private IReadOnlyList<BriefingStep> _steps;
        private int _stepIndex;
        private int _pageTotalMs;
        private float _pageClock;
        private bool _finished;
        private float _finishedAt;
        private bool _locked;
        private bool _skipPressed;

        private VisualElement _videoEl;
        private VisualElement _left;
        private MfGlassPanel _card;
        private VisualElement _capcom;
        private Label _capcomLine;
        private VideoPlayer _player;
        private RenderTexture _texture;
        private VisualElement _objectivesEl;
        private VisualElement _constraintsEl;
        private VisualElement _factsEl;
        private Button _skipButton;

        public IReadOnlyList<string> PageContractIds
        {
            get
            {
                var ids = new List<string>();
                foreach (Page p in _pages) ids.Add(p.Brief.ContractId);
                return ids;
            }
        }

        public bool IsFinished => _finished;
        public bool IsPlayingVideo => _player != null && _player.isPlaying;

        protected override void OnReady()
        {
            // A briefing starts a mission: forget the previous mission's build state (the host's lobby lock stays).
            MissionContext.Build = null;
            MissionContext.ReworkCategory = null;
            MissionContext.ContractId = null;
            MissionContext.OfferedContractIds = null;
            _videoEl = Screen.Q<VisualElement>("pf-video");
            _left = Screen.Q<VisualElement>("pf-brief-left");
            _card = Screen.Q<MfGlassPanel>("pf-brief-card");
            _capcom = Screen.Q<VisualElement>("pf-capcom");
            BuildPages();
            BuildFooter();
            if (_pages.Count == 0)
            {
                Debug.LogError("[MissionForge] Briefing: no contract to brief.");
                return;
            }
            ShowPage(0);
        }

        protected override void OnClose()
        {
            if (_player != null) _player.Stop();
            if (_texture != null)
            {
                _texture.Release();
                Destroy(_texture);
            }
        }

        // ------------------------------------------------------------------ pages

        private void BuildPages()
        {
            _pages.Clear();
            IReadOnlyList<string> ids = ContractIds(out _locked);
            for (int i = 0; i < ids.Count; i++)
            {
                if (!Catalog.Contracts.TryGetValue(ids[i], out ContractDef def)) continue;
                ContractBriefing brief = ContractBriefing.From(def, Text);
                bool full = _locked || ids.Count == 1;
                var lines = new List<string>();
                if (!full) lines.AddRange(brief.IntroLines(Text, i + 1));
                lines.AddRange(full ? brief.CapcomLines(Text) : new List<string>(brief.CapcomLines(Text)).GetRange(0, Math.Min(1, brief.CapcomLines(Text).Count)));
                _pages.Add(new Page { Brief = brief, Lines = lines, Full = full });
            }
        }

        /// <summary>The contracts to brief: the host's locked contract, else the offered ones (Core's ContractsBoard, 2–3 ids).</summary>
        private static IReadOnlyList<string> ContractIds(out bool locked) => ContractOffer.Resolve(out locked);

        private void ShowPage(int index)
        {
            _pageIndex = index;
            Page page = _pages[index];
            _left.Clear();
            _card.Clear();
            _capcom.Clear();
            BuildHeader(page);
            BuildCard(page);
            BuildCapcom(page);

            int budget = BriefingTimeline.MaxBriefingMs / Math.Max(1, _pages.Count);
            var chars = new List<int>();
            foreach (string l in page.Lines) chars.Add(l.Length);
            _steps = BriefingTimeline.Plan(chars, budget, out _pageTotalMs);
            _stepIndex = 0;
            _pageClock = 0f;
            _finished = false;
            bool video = page.Brief.ContractId == VideoContractId;
            SetVideo(video);
            if (A11y.ReducedMotion) RevealAll();
        }

        private void BuildHeader(Page page)
        {
            ContractBriefing b = page.Brief;
            VisualElement kicker = PfUi.El("pf-kicker");
            kicker.Add(PfUi.Lbl(Text.Get("ui.host.briefing.lifecycle"), "pf-lifecycle"));
            kicker.Add(PfUi.Lbl(b.ContractId, "pf-idchip"));
            if (_pages.Count > 1) kicker.Add(PfUi.Lbl(Text.Format("ui.host.briefing.option_of", _pageIndex + 1, _pages.Count), "pf-pagechip"));
            _left.Add(kicker);
            _left.Add(PfUi.Lbl(b.Name, "pf-title"));
            _left.Add(PfUi.Lbl(b.Destination, "pf-subtitle"));
            if (!string.IsNullOrEmpty(b.InspiredBy)) _left.Add(PfUi.Lbl(Text.Get("ui.host.briefing.inspired_by") + " " + b.InspiredBy, "pf-meta"));
            if (!string.IsNullOrEmpty(b.Payload)) _left.Add(PfUi.Lbl(b.Payload, "pf-meta"));
            Hide(_left);
        }

        private void BuildCard(Page page)
        {
            ContractBriefing b = page.Brief;
            _factsEl = PfUi.El("pf-facts");
            foreach (BriefingFact f in b.Facts)
            {
                VisualElement row = PfUi.El("pf-fact");
                row.Add(PfUi.Lbl(f.Label, "pf-fact__label"));
                row.Add(PfUi.Lbl(f.Value, "pf-fact__value"));
                _factsEl.Add(row);
            }
            _card.Add(_factsEl);
            foreach (string rule in b.SpecialRules) _factsEl.Add(PfUi.Lbl(rule, "pf-rule"));

            _objectivesEl = PfUi.El("pf-section");
            _objectivesEl.Add(PfUi.Lbl(Text.Get("ui.host.briefing.objectives"), "pf-section__title"));
            foreach (BriefingObjective o in b.Objectives) _objectivesEl.Add(ObjectiveRow(o));
            _constraintsEl = PfUi.El("pf-section");
            _constraintsEl.Add(PfUi.Lbl(Text.Get("ui.host.briefing.constraints"), "pf-section__title"));
            foreach (string c in b.Constraints) _constraintsEl.Add(ConstraintRow(c));
            if (!page.Full)
            {
                PfUi.Show(_objectivesEl, false);
                PfUi.Show(_constraintsEl, false);
            }
            _card.Add(_objectivesEl);
            _card.Add(_constraintsEl);
            Hide(_card);
            Hide(_objectivesEl);
            Hide(_constraintsEl);
        }

        private VisualElement ObjectiveRow(BriefingObjective o)
        {
            VisualElement row = PfUi.El("pf-objective", "pf-objective--" + o.Kind);
            var icon = new MfIcon { kind = o.Kind == "primary" ? "target" : o.Kind == "stretch" ? "star" : o.Kind == "safety" ? "shield-check" : "circle" };
            icon.AddToClassList("pf-objective__icon");
            row.Add(icon);
            VisualElement text = PfUi.El("pf-objective__text");
            text.Add(PfUi.Lbl(Text.Get("ui.host.briefing.objective." + o.Kind), "pf-objective__kind"));
            text.Add(PfUi.Lbl(o.Text, "pf-objective__body"));
            row.Add(text);
            return row;
        }

        private VisualElement ConstraintRow(string text)
        {
            VisualElement row = PfUi.El("pf-constraint");
            var icon = new MfIcon { kind = "marginal" };
            icon.AddToClassList("pf-constraint__icon");
            row.Add(icon);
            row.Add(PfUi.Lbl(text, "pf-constraint__text"));
            return row;
        }

        private void BuildCapcom(Page page)
        {
            _capcom.Add(PfUi.Lbl(Text.Get("ui.host.capcom.name"), "pf-capcom__who"));
            _capcomLine = PfUi.Lbl("", "pf-capcom__line");
            _capcom.Add(_capcomLine);
            Hide(_capcom);
        }

        private void BuildFooter()
        {
            VisualElement footer = Screen.Q<VisualElement>("pf-footer");
            footer.Clear();
            _skipButton = PfUi.Btn(Text.Get("ui.host.briefing.skip"), "ghost", Skip);
            footer.Add(_skipButton);
            footer.Add(PfUi.Lbl(Text.Get("ui.host.briefing.skip_hint"), "pf-hint"));
            _skipButton.Focus();
#if UNITY_EDITOR || MF_REHEARSAL
            VisualElement host = Screen.Q<VisualElement>("pf-rehearsal-host");
            host.Clear();
            if (IsRehearsal) host.Add(PfUi.RehearsalBanner(Text, Text.Get("ui.host.briefing.rehearsal")));
#endif
        }

        // ------------------------------------------------------------------ video

        private void SetVideo(bool show)
        {
            PfUi.Show(_videoEl, show);
            if (!show)
            {
                if (_player != null) _player.Stop();
                return;
            }
            if (_player == null)
            {
                _texture = new RenderTexture(1280, 720, 0) { name = "BriefingVideo" };
                _player = gameObject.AddComponent<VideoPlayer>();
                _player.playOnAwake = false;
                _player.isLooping = false;
                _player.source = VideoSource.Url;
                _player.url = System.IO.Path.Combine(Application.streamingAssetsPath, "media", "briefing", VideoFile);
                _player.renderMode = VideoRenderMode.RenderTexture;
                _player.targetTexture = _texture;
                _player.audioOutputMode = VideoAudioOutputMode.None;
                _player.skipOnDrop = true;
                _player.errorReceived += (_, message) => Debug.LogWarning("[MissionForge] Briefing video: " + message);
                _videoEl.style.backgroundImage = Background.FromRenderTexture(_texture);
            }
            if (A11y.ReducedMotion)
            {
                // A still frame: seek to the closing establishing shot and hold it.
                _player.prepareCompleted += HoldLastFrame;
                _player.Prepare();
            }
            else
            {
                _player.Play();
            }
        }

        private void HoldLastFrame(VideoPlayer vp)
        {
            vp.prepareCompleted -= HoldLastFrame;
            vp.frame = Math.Max(0, (long)vp.frameCount - 2);
            vp.Pause();
        }

        // ------------------------------------------------------------------ sequence

        protected override void OnTick()
        {
            if (_pages.Count == 0) return;
            HandleSkipKey();
            if (_finished)
            {
                if (Time.unscaledTime - _finishedAt >= HandOverDelaySeconds) HandOver();
                return;
            }
            _pageClock += Time.unscaledDeltaTime;
            int ms = (int)(_pageClock * 1000f);
            while (_stepIndex < _steps.Count && _steps[_stepIndex].AtMs <= ms) Apply(_steps[_stepIndex++]);
            if (ms >= _pageTotalMs) EndPage();
        }

        private void HandleSkipKey()
        {
            var keyboard = UnityEngine.InputSystem.Keyboard.current;
            if (keyboard != null && (keyboard.spaceKey.wasPressedThisFrame || keyboard.enterKey.wasPressedThisFrame)) Skip();
        }

        private void Apply(BriefingStep step)
        {
            switch (step.Kind)
            {
                case BriefingStepKind.Card:
                    Reveal(_left);
                    Reveal(_card);
                    Reveal(_capcom);
                    break;
                case BriefingStepKind.Objectives: Reveal(_objectivesEl); break;
                case BriefingStepKind.Constraints: Reveal(_constraintsEl); break;
                case BriefingStepKind.Line:
                    _capcomLine.text = _pages[_pageIndex].Lines[step.Index];
                    break;
            }
        }

        /// <summary>Skip: the first press shows everything at once, the next one leaves the briefing.</summary>
        public void Skip()
        {
            if (_pages.Count == 0) return;
            if (!_finished)
            {
                _stepIndex = _steps.Count;
                RevealAll();
                _capcomLine.text = string.Join(" ", _pages[_pageIndex].Lines);
                EndPage(skipped: true);
                return;
            }
            HandOver();
        }

        private void RevealAll()
        {
            Reveal(_left);
            Reveal(_card);
            Reveal(_capcom);
            Reveal(_objectivesEl);
            Reveal(_constraintsEl);
            if (_pages[_pageIndex].Lines.Count > 0 && A11y.ReducedMotion) _capcomLine.text = string.Join(" ", _pages[_pageIndex].Lines);
        }

        private void EndPage(bool skipped = false)
        {
            if (_pageIndex + 1 < _pages.Count && !skipped)
            {
                ShowPage(_pageIndex + 1);
                return;
            }
            _finished = true;
            _finishedAt = Time.unscaledTime - (skipped ? HandOverDelaySeconds * 0.4f : 0f);
        }

        private bool _handedOver;

        private void HandOver()
        {
            if (_handedOver) return;
            _handedOver = true;
            PreflightEvents.RaiseBriefingFinished(_locked);
            if (App?.Flow != null) _ = NavigateAsync(() => App != null && App.Flow.GoToPhase(GamePhase.ContractVote));
        }

        // ------------------------------------------------------------------ reveal helpers

        private void Hide(VisualElement e)
        {
            e.AddToClassList("mf-motion");
            e.AddToClassList("mf-motion-enter");
            e.AddToClassList(MfMotion.EnterFromClass);
        }

        private void Reveal(VisualElement e)
        {
            if (e == null) return;
            e.RemoveFromClassList(MfMotion.EnterFromClass);
        }
    }
}
