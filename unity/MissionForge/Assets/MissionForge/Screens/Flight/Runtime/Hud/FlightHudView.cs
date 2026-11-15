using System.Collections.Generic;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// The flight HUD of design 9.6, built on the T031 design system: mission clock and phase name top-left, flight
    /// state (altitude, velocity, vertical speed, q, g, Mach, throttle) in the left glass column, vehicle and orbit
    /// state (Δv per stage, propellant, apsides, inclination, heat load) in the right column, the mission phase strip
    /// and the active-boost slots along the bottom. Every value comes from one <see cref="FlightTelemetry"/> snapshot
    /// and every number carries a unit (<see cref="FlightUnits"/>).
    /// </summary>
    public sealed class FlightHudView
    {
        public const string StyleSheetResource = "FlightUI/FlightHud";

        /// <summary>Phases shown in the strip for an orbital contract (data/flight_phases.json order).</summary>
        public static readonly string[] StripPhases = { "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8" };

        /// <summary>Boost slots shown even when empty (game_value: four, as mg.summary carries at most four boosts).</summary>
        public const int BoostSlots = 4;

        private readonly VisualElement _root;
        private readonly Label _clock, _phaseName, _feedTag, _speed;
        private readonly Dictionary<string, Label> _values = new Dictionary<string, Label>();
        private readonly Dictionary<string, Label> _names = new Dictionary<string, Label>();
        private readonly VisualElement _throttleFill;
        private readonly VisualElement _stageList;
        private readonly List<(Label name, Label value, VisualElement fill, VisualElement row)> _stages = new List<(Label, Label, VisualElement, VisualElement)>();
        private readonly Dictionary<string, VisualElement> _phaseSteps = new Dictionary<string, VisualElement>();
        private readonly Label _callout;
        private float _calloutUntil;

        public bool ShowOrbitalVelocity { get; set; }
        public VisualElement Root => _root;

        public FlightHudView(VisualElement parent, int stageCount)
        {
            StyleSheet sheet = Resources.Load<StyleSheet>(StyleSheetResource);
            if (sheet != null && !parent.styleSheets.Contains(sheet)) parent.styleSheets.Add(sheet);

            _root = new VisualElement { name = "flight-hud", pickingMode = PickingMode.Ignore };
            _root.AddToClassList("fl-hud");
            parent.Add(_root);

            // Top-left: mission clock and phase.
            var top = Box(_root, "fl-top");
            _clock = Text(top, "fl-clock mf-kpi--l");
            _phaseName = Text(top, "fl-phase-name mf-h3");
            _speed = Text(top, "fl-speed mf-label");
            _feedTag = Text(top, "fl-feed-tag mf-meta");

            // Left column: flight state.
            var left = Panel(_root, "fl-col fl-col--left");
            Metric(left, "altitude", "ui.flight.altitude", hero: true);
            Metric(left, "velocity", "ui.flight.velocity.surface", hero: true);
            Metric(left, "vspeed", "ui.flight.vertical_speed");
            Metric(left, "q", "ui.flight.q");
            Metric(left, "g", "ui.flight.g_load");
            Metric(left, "mach", "ui.flight.mach");
            Metric(left, "throttle", "ui.flight.throttle");
            var track = Box(left, "fl-bar");
            _throttleFill = Box(track, "fl-bar__fill");

            // Right column: vehicle and orbit.
            var right = Panel(_root, "fl-col fl-col--right");
            Text(right, "fl-section mf-label").text = FlightText.Get("ui.flight.delta_v");
            _stageList = Box(right, "fl-stages");
            for (int i = 0; i < Mathf.Max(1, stageCount); i++)
            {
                VisualElement row = Box(_stageList, "fl-stage");
                var head = Box(row, "fl-stage__head");
                Label n = Text(head, "fl-stage__name mf-label");
                Label v = Text(head, "fl-stage__value mf-label");
                var bar = Box(row, "fl-bar fl-bar--thin");
                VisualElement fill = Box(bar, "fl-bar__fill fl-bar__fill--prop");
                n.text = FlightText.Format("ui.flight.stage", i + 1);
                _stages.Add((n, v, fill, row));
            }
            Metric(right, "propellant", "ui.flight.propellant");
            Metric(right, "apo", "ui.flight.apoapsis");
            Metric(right, "peri", "ui.flight.periapsis");
            Metric(right, "incl", "ui.flight.inclination");
            Metric(right, "heat", "ui.flight.heat_load");

            // Bottom: phase strip and boosts.
            var bottom = Box(_root, "fl-bottom");
            var strip = Box(bottom, "fl-strip");
            foreach (string id in StripPhases)
            {
                var step = Box(strip, "fl-step");
                Text(step, "fl-step__id mf-meta").text = id;
                Text(step, "fl-step__name mf-label").text = FlightText.Get("flight_phase." + id + ".name");
                _phaseSteps[id] = step;
            }
            var boosts = Box(bottom, "fl-boosts");
            Text(boosts, "fl-boosts__title mf-label").text = FlightText.Get("ui.flight.boosts");
            var slots = Box(boosts, "fl-boosts__slots");
            for (int i = 0; i < BoostSlots; i++) Box(slots, "fl-boost-slot");
            Text(boosts, "fl-boosts__empty mf-meta").text = FlightText.Get("ui.flight.boost_empty");

            _callout = Text(_root, "fl-callout mf-h2");
            _callout.style.display = DisplayStyle.None;
        }

        public void SetFeedName(string feedName, bool rehearsal)
        {
            string key = feedName == "RecordedFlightFeed" ? "ui.flight.feed.recorded" : "ui.flight.feed.core";
            _feedTag.text = FlightText.Get(key) + (rehearsal ? "  ·  " + FlightText.Get("ui.flight.rehearsal") : "");
        }

        /// <summary>Shows a one-line event callout (visual cue for an audible event) for a few seconds.</summary>
        public void Callout(string text, float seconds = 3.5f)
        {
            _callout.text = text;
            _callout.style.display = DisplayStyle.Flex;
            _calloutUntil = Time.unscaledTime + seconds;
        }

        public void Show(FlightTelemetry t)
        {
            if (t == null) return;
            _clock.text = FlightUnits.MissionClock(t.metS);
            _phaseName.text = FlightText.Get("flight_phase." + t.phase + ".name");
            double ff = FlightSession.FastForward(t);
            _speed.text = t.warp > 1.01 ? FlightText.Format("ui.flight.time_warp", t.warp.ToString("0"))
                : t.warp < 0.99 ? FlightText.Get("ui.flight.minigame.slowmo")
                : ff > 1 ? FlightText.Format("ui.flight.fast_forward", ff.ToString("0")) : "";
            _speed.style.display = string.IsNullOrEmpty(_speed.text) ? DisplayStyle.None : DisplayStyle.Flex;

            Set("altitude", FlightUnits.Altitude(t.altitudeM));
            _names["velocity"].text = FlightText.Get(ShowOrbitalVelocity ? "ui.flight.velocity.orbital" : "ui.flight.velocity.surface");
            Set("velocity", FlightUnits.Speed(ShowOrbitalVelocity ? t.orbitalSpeedMs : t.surfaceSpeedMs));
            Set("vspeed", FlightUnits.VerticalSpeed(t.verticalSpeedMs));
            Set("q", FlightUnits.DynamicPressure(t.dynamicPressurePa));
            Set("g", FlightUnits.GLoad(t.gLoad));
            _values["mach"].text = t.mach.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
            Set("throttle", FlightUnits.Percent(t.throttle01));
            _throttleFill.style.width = Length.Percent((float)(Mathf.Clamp01((float)t.throttle01) * 100f));

            for (int i = 0; i < _stages.Count; i++)
            {
                double dv = i < t.stageDeltaVMs.Length ? t.stageDeltaVMs[i] : 0;
                double prop = i < t.stagePropellant01.Length ? t.stagePropellant01[i] : 0;
                var (_, value, fill, row) = _stages[i];
                (string v, string u) = FlightUnits.Speed(dv);
                value.text = MfText.WithUnit(v, u);
                fill.style.width = Length.Percent(Mathf.Clamp01((float)prop) * 100f);
                row.EnableInClassList("fl-stage--active", i == t.stageIndex);
                row.EnableInClassList("fl-stage--spent", i < t.stageIndex);
            }
            double activeProp = t.stageIndex < t.stagePropellant01.Length ? t.stagePropellant01[t.stageIndex] : 0;
            Set("propellant", FlightUnits.Percent(activeProp));
            Set("apo", FlightUnits.Apsis(t.apoapsisM));
            Set("peri", FlightUnits.Apsis(t.periapsisM));
            Set("incl", FlightUnits.Degrees(t.inclinationRad));
            Set("heat", FlightUnits.Percent(t.heatLoad01));

            int current = System.Array.IndexOf(StripPhases, t.phase);
            for (int i = 0; i < StripPhases.Length; i++)
            {
                VisualElement step = _phaseSteps[StripPhases[i]];
                step.EnableInClassList("fl-step--current", i == current);
                step.EnableInClassList("fl-step--done", current >= 0 ? i < current : PhaseOrder(t.phase) > PhaseOrder(StripPhases[i]));
            }

            if (_callout.style.display == DisplayStyle.Flex && Time.unscaledTime > _calloutUntil)
                _callout.style.display = DisplayStyle.None;
        }

        private static int PhaseOrder(string id)
        {
            if (string.IsNullOrEmpty(id) || id[0] != 'F') return -1;
            string digits = id.Substring(1).TrimEnd('b');
            return int.TryParse(digits, out int n) ? n : -1;
        }

        private void Set(string key, (string value, string unit) v) => _values[key].text = MfText.WithUnit(v.value, v.unit);

        private void Metric(VisualElement parent, string key, string labelKey, bool hero = false)
        {
            var row = Box(parent, hero ? "fl-metric fl-metric--hero" : "fl-metric");
            Label name = Text(row, "fl-metric__name mf-label");
            name.text = FlightText.Get(labelKey);
            Label value = Text(row, hero ? "fl-metric__value mf-kpi" : "fl-metric__value mf-h3");
            _names[key] = name;
            _values[key] = value;
        }

        private static VisualElement Panel(VisualElement parent, string classes)
        {
            var panel = new MfGlassPanel { pickingMode = PickingMode.Ignore };
            panel.AddToClassList(MfGlassPanel.UssClassName);
            foreach (string c in classes.Split(' ')) panel.AddToClassList(c);
            parent.Add(panel);
            return panel;
        }

        private static VisualElement Box(VisualElement parent, string classes)
        {
            var e = new VisualElement { pickingMode = PickingMode.Ignore };
            foreach (string c in classes.Split(' ')) e.AddToClassList(c);
            parent.Add(e);
            return e;
        }

        private static Label Text(VisualElement parent, string classes)
        {
            var l = new Label { pickingMode = PickingMode.Ignore };
            foreach (string c in classes.Split(' ')) l.AddToClassList(c);
            parent.Add(l);
            return l;
        }
    }
}
