using System;
using MissionForge.Core.Scoring;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Top-centre banner on the host flight view showing what the phones are playing, plus a full-screen bullet-time
    /// tint. Pure presentation: call <see cref="Show"/> every frame with <see cref="FlightMinigameHost.Current"/>.
    /// Does not load its style sheet; attach <see cref="StyleSheetPath"/> to a parent.
    /// </summary>
    public sealed class MinigameBannerView
    {
        /// <summary>Asset path of the banner layout style sheet.</summary>
        public const string StyleSheetPath = "FlightUI/MinigameBanner"; // Resources path

        private const string IntroClass = "fl-mg-banner--intro";
        private const string PlayingClass = "fl-mg-banner--playing";
        private const string ResultClass = "fl-mg-banner--result";
        private const string TierClassPrefix = "fl-mg-tier--";

        private readonly VisualElement _tint;
        private readonly VisualElement _root;
        private readonly Label _name;
        private readonly VisualElement _slowmoChip;
        private readonly Label _howTo;
        private readonly Label _status;
        private readonly VisualElement _meter;
        private readonly VisualElement _meterFill;
        private readonly Label _meterLabel;
        private readonly Label _result;
        private string _tierClass;

        public MinigameBannerView(VisualElement parent)
        {
            if (parent == null) throw new ArgumentNullException(nameof(parent));

            _tint = new VisualElement { name = "fl-slowmo-tint", pickingMode = PickingMode.Ignore };
            _tint.AddToClassList("fl-slowmo-tint");
            parent.Add(_tint);

            _root = new VisualElement { name = "fl-mg-banner", pickingMode = PickingMode.Ignore };
            _root.AddToClassList("fl-mg-banner");
            _root.AddToClassList("mf-card");
            parent.Add(_root);

            var header = new VisualElement();
            header.AddToClassList("fl-mg-header");
            _root.Add(header);

            _name = NewLabel("fl-mg-name", "mf-h3");
            header.Add(_name);

            _slowmoChip = new VisualElement();
            _slowmoChip.AddToClassList("mf-chip");
            _slowmoChip.AddToClassList("fl-mg-slowmo");
            var chipLabel = NewLabel("mf-chip__label", null);
            chipLabel.text = FlightText.Get("ui.flight.minigame.slowmo");
            _slowmoChip.Add(chipLabel);
            header.Add(_slowmoChip);

            _howTo = NewLabel("fl-mg-howto", "mf-label");
            _root.Add(_howTo);

            _status = NewLabel("fl-mg-status", "mf-h3");
            _root.Add(_status);

            _meter = new VisualElement();
            _meter.AddToClassList("fl-mg-meter");
            _meterFill = new VisualElement();
            _meterFill.AddToClassList("fl-mg-meter__fill");
            _meter.Add(_meterFill);
            _root.Add(_meter);

            _meterLabel = NewLabel("fl-mg-meter__label", "mf-label");
            _root.Add(_meterLabel);

            _result = NewLabel("fl-mg-result", "mf-h3");
            _root.Add(_result);

            Show(null, 0);
        }

        /// <summary>The banner root, for tests or extra styling.</summary>
        public VisualElement Root => _root;

        /// <summary>Updates the banner from a run snapshot; hides everything when <paramref name="run"/> is null.</summary>
        /// <param name="run">Current run, or null when idle.</param>
        /// <param name="nowMs">Server clock, ms since the Unix epoch (for the countdown).</param>
        public void Show(MinigameRunView run, long nowMs)
        {
            bool visible = run != null;
            SetVisible(_root, visible);
            SetVisible(_tint, visible && run.IsBulletTime);
            if (!visible) return;

            _name.text = FlightText.Get(run.NameKey);
            _howTo.text = FlightText.Get(run.HowToPlayKey);
            SetVisible(_slowmoChip, run.IsBulletTime);

            bool intro = run.State == MinigameRunState.Intro;
            bool playing = run.State == MinigameRunState.Playing || run.State == MinigameRunState.Closing;
            bool result = run.State == MinigameRunState.Result;
            _root.EnableInClassList(IntroClass, intro);
            _root.EnableInClassList(PlayingClass, playing);
            _root.EnableInClassList(ResultClass, result);

            if (intro)
            {
                long seconds = Math.Max(0L, (run.StartAtMs - nowMs + 999L) / 1000L);
                _status.text = FlightText.Format("ui.flight.minigame.starts_in", seconds);
            }
            else if (playing)
            {
                _status.text = FlightText.Get("ui.flight.minigame.playing");
            }
            else
            {
                _status.text = FlightText.Get("ui.flight.minigame.result");
            }

            SetVisible(_meter, playing);
            SetVisible(_meterLabel, playing);
            if (playing)
            {
                float p = Mathf.Clamp01((float)run.Progress01);
                _meterFill.style.scale = new Scale(new Vector3(p, 1f, 1f));
                _meterLabel.text = FlightText.Get("ui.flight.minigame.team_progress") + "  " + Mathf.RoundToInt(p * 100f) + " %";
            }

            SetVisible(_result, result);
            if (result)
            {
                _result.text = FlightText.Format("ui.flight.minigame.succeeded", run.Succeeded, run.Active) + "  ·  " + TierName(run.Tier);
            }
            SetTierClass(result ? run.Tier : (Tier?)null);
        }

        /// <summary>Player-facing tier name ("Gold"), or "No tier".</summary>
        public static string TierName(Tier tier) =>
            tier == Tier.None
                ? FlightText.Get("ui.flight.minigame.tier.none")
                : FlightText.Get("tier." + tier.ToString().ToLowerInvariant() + ".name");

        private void SetTierClass(Tier? tier)
        {
            string next = tier.HasValue ? TierClassPrefix + tier.Value.ToString().ToLowerInvariant() : null;
            if (next == _tierClass) return;
            if (_tierClass != null) _root.RemoveFromClassList(_tierClass);
            if (next != null) _root.AddToClassList(next);
            _tierClass = next;
        }

        private static Label NewLabel(string cls, string typeClass)
        {
            var label = new Label { pickingMode = PickingMode.Ignore };
            label.AddToClassList(cls);
            if (typeClass != null) label.AddToClassList(typeClass);
            return label;
        }

        private static void SetVisible(VisualElement e, bool visible) =>
            e.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
    }
}
