using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using MissionForge.Screens.Preflight;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.TestStand
{
    /// <summary>
    /// Presentation of the Test Stand (T027 step 7): header, the styled test cell (test icon in the chamber ring, the
    /// part under test, a three-step run strip and a progress bar), the results card with the uncertainty band before →
    /// after as two bars, and the Test Failure vote. Status is never colour alone (icon + label + border).
    /// </summary>
    public sealed class TestStandViews
    {
        private static readonly string[] Steps = { "setup", "run", "data" };

        private readonly VisualElement _screen;
        private readonly PreflightText _text;
        private readonly PreflightA11y _a11y;
        private readonly GameCatalog _catalog;
        private VisualElement _cell;
        private VisualElement _ring;
        private VisualElement _progress;
        private readonly List<VisualElement> _steps = new List<VisualElement>();
        private float _cellTime = -1f;
        private VisualElement _results;
        private VisualElement _vote;

        public TestStandViews(VisualElement screen, PreflightText text, PreflightA11y a11y, GameCatalog catalog)
        {
            _screen = screen;
            _text = text;
            _a11y = a11y;
            _catalog = catalog;
            _results = screen.Q<VisualElement>("pf-test-results");
            _vote = screen.Q<VisualElement>("pf-test-vote");
            PfUi.Show(_results, false);
        }

        public void BuildHeader(TestOffer offer, bool rehearsal)
        {
            VisualElement head = _screen.Q<VisualElement>("pf-head");
            head.Clear();
            VisualElement kicker = PfUi.El("pf-kicker");
            kicker.Add(PfUi.Lbl(_text.Get("ui.host.test.lifecycle"), "pf-lifecycle"));
            head.Add(kicker);
            head.Add(PfUi.Lbl(_text.Get("test." + offer.Test.Id + ".name"), "pf-title"));
            head.Add(PfUi.Lbl(_text.Get("test." + offer.Test.Id + ".reveals"), "pf-meta"));
            head.Add(PfUi.Lbl(_text.Format("ui.host.test.basis", _text.Get("test." + offer.Test.Id + ".basis")), "pf-meta"));
            BuildCell(offer);
            VisualElement tag = _screen.Q<VisualElement>("pf-rehearsal-host");
            tag.Clear();
#if UNITY_EDITOR || MF_REHEARSAL
            if (rehearsal) tag.Add(PfUi.RehearsalBanner(_text, _text.Get("ui.host.test.rehearsal")));
#endif
        }

        private void BuildCell(TestOffer offer)
        {
            _cell = _screen.Q<VisualElement>("pf-cell");
            _cell.Clear();
            _cell.AddToClassList("pf-cell--" + offer.Test.Id);
            _ring = PfUi.El("pf-cell__ring");
            var icon = new MfIcon { kind = IconOf(offer.Test.Id) };
            icon.AddToClassList("pf-cell__icon");
            _ring.Add(icon);
            _cell.Add(_ring);
            _cell.Add(PfUi.Lbl(_text.Get("ui.host.test.cell"), "pf-section__title"));
            _cell.Add(PfUi.Lbl(PartName(offer), "pf-cell__part"));
            VisualElement strip = PfUi.El("pf-cell__steps");
            _steps.Clear();
            foreach (string s in Steps)
            {
                VisualElement step = PfUi.El("pf-cell__step");
                step.Add(PfUi.Lbl(_text.Get("ui.host.test.step." + s), "pf-cell__step-label"));
                strip.Add(step);
                _steps.Add(step);
            }
            _cell.Add(strip);
            VisualElement bar = PfUi.El("pf-cell__bar");
            _progress = PfUi.El("pf-cell__bar-fill");
            bar.Add(_progress);
            _cell.Add(bar);
            PfUi.Fill(_progress, 0f);
        }

        public void ShowVote(VisualElement panel)
        {
            _vote.Clear();
            _vote.Add(panel);
        }

        /// <summary>Starts the cell animation (instant with reduced motion).</summary>
        public void ShowCell(TestOffer offer)
        {
            _vote.Clear();
            _cell.AddToClassList("pf-cell--running");
            _cellTime = _a11y.ReducedMotion ? TestStandScreen.CellSeconds : 0f;
            Tick(0f);
        }

        public void Tick(float dt)
        {
            if (_cellTime < 0f) return;
            _cellTime += dt;
            float f = Mathf.Clamp01(_cellTime / TestStandScreen.CellSeconds);
            PfUi.Fill(_progress, f);
            for (int i = 0; i < _steps.Count; i++)
            {
                _steps[i].EnableInClassList("pf-cell__step--done", f >= (i + 1) / (float)_steps.Count);
                _steps[i].EnableInClassList("pf-cell__step--active", f >= i / (float)_steps.Count && f < (i + 1) / (float)_steps.Count);
            }
            if (!_a11y.ReducedMotion && f < 1f)
            {
                float pulse = 1f + 0.04f * Mathf.Sin(_cellTime * 9f);
                _ring.style.scale = new Scale(new Vector2(pulse, pulse));
            }
            else _ring.style.scale = new Scale(Vector2.one);
            if (f >= 1f)
            {
                _cell.RemoveFromClassList("pf-cell--running");
                _cellTime = -1f;
            }
        }

        /// <summary>Results card: every number from Core (offer, outcome, dashboards before and after).</summary>
        public void ShowResults(TestOffer offer, TestOutcome outcome, DashboardMetrics before, DashboardMetrics after)
        {
            _results.Clear();
            _results.Add(PfUi.Lbl(_text.Get("ui.host.test.results"), "pf-section__title"));
            AddRow(_text.Get("ui.host.test.cost"), _text.Money(offer.CostM));
            AddRow(_text.Get("ui.host.test.days"), "+" + _text.Days(offer.Days));
            if (offer.Test.ReliabilityBonus > 0) AddRow(_text.Get("ui.host.test.reliability"), "+" + _text.Percent(offer.Test.ReliabilityBonus, 1));
            if (offer.Test.ClearsRisks.Count > 0)
            {
                var names = new List<string>();
                foreach (string r in offer.Test.ClearsRisks) names.Add(_text.Has("ui.host.test.risk." + r) ? _text.Get("ui.host.test.risk." + r) : r);
                AddRow(_text.Get("ui.host.test.risks"), string.Join(", ", names));
            }

            // Axis zoomed to the bands (display choice): from 5 % below the lower band edge, in 5 % steps, to 100 %.
            double axisMin = System.Math.Max(0, System.Math.Floor(System.Math.Min(before.Success.Low, after.Success.Low) * 20) / 20 - 0.05);
            _results.Add(PfUi.Lbl(_text.Get("ui.host.test.band"), "pf-band__title"));
            _results.Add(Band(_text.Get("ui.host.test.before"), before.Success, "pf-band--before", axisMin));
            _results.Add(Band(_text.Get("ui.host.test.after"), after.Success, "pf-band--after", axisMin));
            _results.Add(PfUi.Lbl(_text.Format("ui.host.test.band_axis", UiText.Number(axisMin * 100, 0) + " " + _text.Get("ui.buildbay.unit.percent")), "pf-meta"));

            bool flaw = outcome.FlawRevealed;
            VisualElement chip = PfUi.El("pf-test-outcome", flaw ? "pf-test-outcome--flaw" : "pf-test-outcome--clear");
            var icon = new MfIcon { kind = flaw ? "marginal" : "meets" };
            icon.AddToClassList("pf-test-outcome__icon");
            chip.Add(icon);
            VisualElement t = PfUi.El("pf-test-outcome__text");
            t.Add(PfUi.Lbl(flaw ? _text.Format("ui.host.test.flaw", CategoryName(offer.TargetCategory)) : _text.Get("ui.host.test.no_flaw"), "pf-test-outcome__title"));
            t.Add(PfUi.Lbl(_text.Format("ui.host.test.reveal_chance", _text.Percent(outcome.RevealChance)), "pf-meta"));
            chip.Add(t);
            _results.Add(chip);
            PfUi.Show(_results, true);
            if (!_a11y.ReducedMotion) MfMotion.Enter(_results);
        }

        public void ShowFailureVote(VisualElement panel, AnomalyDraw draw)
        {
            // The results were on screen for the reading time; the response vote now takes the column (the panel shows the
            // card's name and trigger as its title and "why").
            PfUi.Show(_results, false);
            _vote.Clear();
            _vote.Add(panel);
        }

        public string ResponseDetail(AnomalyDraw draw, string responseId)
        {
            string category = draw.TargetCategory;
            switch (responseId)
            {
                case "fix":
                    string partId = category != null ? draw.Build.Choice(category) : null;
                    if (partId == null) return _text.Get("ui.host.test.response.fix");
                    PartDef part = _catalog.Part(partId);
                    return _text.Format("ui.host.test.response.fix_cost", _text.Money(TestCampaign.FixCostM(part)), _text.Days(BuildConstants.FlawFixDays));
                case "fly_as_is": return _text.Get("ui.host.test.response.fly_as_is");
                case "swap_part": return _text.Format("ui.host.test.response.swap_part", CategoryName(category));
                default: return "";
            }
        }

        public void ShowResponse(string responseId)
        {
            _vote.Clear();
            VisualElement card = PfUi.El("pf-review__outcome", responseId == "fly_as_is" ? "pf-review__outcome--rework" : "pf-review__outcome--pass");
            var icon = new MfIcon { kind = responseId == "fix" ? "wrench" : responseId == "swap_part" ? "git-compare" : "marginal" };
            icon.AddToClassList("pf-review__outcome-icon");
            card.Add(icon);
            card.Add(PfUi.Lbl(_text.Get("ui.host.test.responded." + responseId), "pf-review__outcome-title"));
            _vote.Add(card);
        }

        private void AddRow(string label, string value)
        {
            VisualElement row = PfUi.El("pf-fact");
            row.Add(PfUi.Lbl(label, "pf-fact__label"));
            row.Add(PfUi.Lbl(value, "pf-fact__value"));
            _results.Add(row);
        }

        /// <summary>One band bar: the success estimate's low..high range (Core's ReliabilityEstimate) on an axisMin..100 % track.</summary>
        private VisualElement Band(string label, ReliabilityEstimate e, string cls, double axisMin)
        {
            double low = e.Low, high = System.Math.Min(1.0, e.Success + e.BandHalfWidth);
            VisualElement row = PfUi.El("pf-band", cls);
            VisualElement head = PfUi.El("pf-band__head");
            head.Add(PfUi.Lbl(label, "pf-band__label"));
            head.Add(PfUi.Lbl(_text.Format("ui.host.test.band_range", UiText.Number(low * 100, 1), UiText.Number(high * 100, 1), _text.Get("ui.buildbay.unit.percent"),
                _text.Percent(e.BandHalfWidth, 1)), "pf-band__value"));
            row.Add(head);
            VisualElement track = PfUi.El("pf-band__track");
            VisualElement fill = PfUi.El("pf-band__fill");
            double span = System.Math.Max(0.01, 1.0 - axisMin);
            fill.style.left = Length.Percent((float)((low - axisMin) / span * 100));
            fill.style.width = Length.Percent((float)System.Math.Max(0.6, (high - low) / span * 100));
            track.Add(fill);
            VisualElement mark = PfUi.El("pf-band__mark");
            mark.style.left = Length.Percent((float)((e.Success - axisMin) / span * 100));
            track.Add(mark);
            row.Add(track);
            return row;
        }

        private string PartName(TestOffer offer)
        {
            string category = CategoryName(offer.TargetCategory);
            if (offer.TargetPartId == null) return category;
            string key = "part." + offer.TargetPartId + ".name";
            return category + " · " + (_text.Has(key) ? _text.Get(key) : _catalog.Part(offer.TargetPartId).Name);
        }

        private string CategoryName(string category)
        {
            if (category == null) return "";
            if (category == TestCampaign.VehicleTarget) return _text.Get("ui.host.test.whole_vehicle");
            string key = "vote." + category + ".name";
            return _text.Has(key) ? _text.Get(key) : category;
        }

        /// <summary>Icon per test (Lucide set in the design system).</summary>
        public static string IconOf(string testId)
        {
            switch (testId)
            {
                case "engine_hot_fire": case "static_fire": case "arc_jet_test": return "flame";
                case "vibration_test": return "gauge";
                case "thermal_vacuum_test": return "thermometer";
                case "software_in_the_loop": return "cpu";
                case "drop_test": return "package";
                case "pogo_suppression_test": return "trending-down";
                case "wet_dress_rehearsal": return "fuel";
                default: return "wrench";
            }
        }
    }
}
