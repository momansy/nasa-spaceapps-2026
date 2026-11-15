using System;
using MissionForge.App;
using MissionForge.Core.Flight;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// MF_OrbitMap: secondary screen of the FLIGHT phase. Shows the Earth, the current conic, the trail, the ground
    /// track and the apsides from the shared <see cref="FlightSession"/>; the flight keeps running underneath.
    /// M or Escape returns to MF_Flight.
    /// </summary>
    public sealed class OrbitMapScreen : ScreenController
    {
        private const string StyleSheetPath = "FlightUI/OrbitMap";
        private const string RootName = "orbit-map";

        private VisualElement _root;
        private OrbitMapView _view;
        private Label _inclinationValue;
        private Label _groundTrackValue;

        protected override void OnEnter()
        {
            StartSession();
            BuildLayout();
            FlightSession.Stepped += OnStepped;
            Refresh();
        }

        protected override void OnExit()
        {
            FlightSession.Stepped -= OnStepped;
            _root?.RemoveFromHierarchy();
            _root = null;
            _view = null;
            _inclinationValue = null;
            _groundTrackValue = null;
        }

        private void Update()
        {
            if (App == null || _view == null) return;
            if (FlightSession.Feed == null) StartSession(); // game data may not have been ready on enter
            Refresh();
            if (BackPressed()) App.Flow.ShowWithinPhase(ScreenId.Flight);
        }

        private void StartSession()
        {
            if (FlightSession.EnsureStarted(App)) FlightSession.Run();
        }

        private static void OnStepped(FlightTelemetry t) => OrbitMapTrail.Add(t);

        private static bool BackPressed()
        {
            Keyboard kb = Keyboard.current;
            return kb != null && (kb.mKey.wasPressedThisFrame || kb.escapeKey.wasPressedThisFrame);
        }

        private void Refresh()
        {
            FlightTelemetry t = FlightSession.Feed?.Current;
            _view.SetTelemetry(t);
            if (t == null)
            {
                _inclinationValue.text = "— °";
                _groundTrackValue.text = "— km";
                return;
            }
            var (incValue, incUnit) = FlightUnits.Degrees(t.inclinationRad);
            _inclinationValue.text = incValue + " " + incUnit;
            // Surface arc from the pad to the sub-vehicle point in the inertial frame (Earth rotation not shown;
            // a map simplification, not physics).
            double trackKm = FlightUnits.MetresToKm(Body.Earth.RadiusM * Math.Abs(OrbitMapTrail.GroundTrackRad));
            _groundTrackValue.text = FlightUnits.Grouped(Math.Round(trackKm)) + " km";
        }

        private void BuildLayout()
        {
            Screen.Q<VisualElement>(RootName)?.RemoveFromHierarchy();
            _root = new VisualElement { name = RootName, pickingMode = PickingMode.Ignore };
            _root.AddToClassList("mf-orbit-map");
            StyleSheet sheet = Resources.Load<StyleSheet>(StyleSheetPath);
            if (sheet != null) _root.styleSheets.Add(sheet);
            else Debug.LogWarning("[MissionForge] OrbitMap: stylesheet Resources/" + StyleSheetPath + " not found; using inline defaults.");

            var header = new VisualElement();
            header.AddToClassList("mf-orbit-map__header");
            var title = new Label(FlightText.Get("ui.flight.map.title"));
            title.AddToClassList("mf-h1");
            title.AddToClassList("mf-orbit-map__title");
            header.Add(title);
            header.Add(Readout("ui.flight.map.inclination", out _inclinationValue));
            header.Add(Readout("ui.flight.map.ground_track", out _groundTrackValue));
            var hint = new Label(FlightText.Get("ui.flight.map.back"));
            hint.AddToClassList("mf-label");
            hint.AddToClassList("mf-orbit-map__hint");
            header.Add(hint);
            _root.Add(header);

            var stage = new VisualElement();
            stage.AddToClassList("mf-card");
            stage.AddToClassList("mf-orbit-map__stage");
            _view = new OrbitMapView { Trail = OrbitMapTrail.Shared };
            stage.Add(_view);
            _root.Add(stage);

            Screen.Add(_root);
        }

        private static VisualElement Readout(string labelKey, out Label value)
        {
            var group = new VisualElement();
            group.AddToClassList("mf-orbit-map__readout");
            var name = new Label(FlightText.Get(labelKey));
            name.AddToClassList("mf-label");
            name.AddToClassList("mf-orbit-map__readout-name");
            value = new Label();
            value.AddToClassList("mf-kpi");
            value.AddToClassList("mf-orbit-map__readout-value");
            group.Add(name);
            group.Add(value);
            return group;
        }
    }
}
