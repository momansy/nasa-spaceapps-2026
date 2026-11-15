using MissionForge.App;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// MF_Countdown (design 9.1 F0–F2): the voted vehicle on MF_LaunchPad at dusk, rollout complete, liquid-oxygen
    /// vapour venting during propellant loading, the countdown clock from Core's F1 timer, the ignition sequence and
    /// hold-down release. At ignition (Core enters F2) the app moves to FLIGHT; both scenes show the same session and
    /// the same pad shot, so the hand-off is seamless.
    /// </summary>
    public sealed class CountdownScreen : ScreenController
    {
        [SerializeField] private FlightWorld world;
        [SerializeField] private FlightCameraDirector cameraDirector;

        private Label _clock, _status;
        private Label[] _sequence;
        private bool _handedOff;
        private bool _started;

        public void ConfigureWorld(FlightWorld flightWorld, FlightCameraDirector director)
        {
            world = flightWorld;
            cameraDirector = director;
        }

        protected override void OnEnter()
        {
            StyleSheet sheet = Resources.Load<StyleSheet>(FlightHudView.StyleSheetResource);
            if (sheet != null) Screen.styleSheets.Add(sheet);
            var panel = new VisualElement { pickingMode = PickingMode.Ignore };
            panel.AddToClassList("fl-cd");
            Screen.Add(panel);
            AddLabel(panel, "fl-cd__title mf-h3").text = FlightText.Get("ui.flight.countdown.title");
            _clock = AddLabel(panel, "fl-cd__clock");
            _status = AddLabel(panel, "fl-cd__status mf-h3");
            var seq = new VisualElement { pickingMode = PickingMode.Ignore };
            seq.AddToClassList("fl-cd__seq");
            panel.Add(seq);
            string[] keys = { "ui.flight.countdown.rollout", "ui.flight.countdown.loading", "ui.flight.countdown.ignition", "ui.flight.countdown.release" };
            _sequence = new Label[keys.Length];
            for (int i = 0; i < keys.Length; i++)
            {
                _sequence[i] = AddLabel(seq, "fl-cd__item mf-label");
                _sequence[i].text = FlightText.Get(keys[i]);
            }
            if (App != null && App.Flow != null) App.Flow.ScreenChanged += OnScreenChanged;
        }

        protected override void OnExit()
        {
            if (App != null && App.Flow != null) App.Flow.ScreenChanged -= OnScreenChanged;
        }

        private void OnScreenChanged(ScreenInfo info)
        {
            // The flight scene has taken over: switch this world off so the two pads never double their lights.
            if (info != null && info.Id != ScreenId.Countdown && world != null && FlightWorld.Active != world)
                world.gameObject.SetActive(false);
            if (info != null && info.Id != ScreenId.Countdown && Screen != null) Screen.style.display = DisplayStyle.None;
        }

        private void Update()
        {
            if (!_started)
            {
                if (App == null || !FlightSession.EnsureStarted(App)) return;
                _started = true;
                if (world != null)
                {
                    world.Activate();
                    world.Vehicle.Build();
                }
                FlightSession.Run();
            }
            FlightTelemetry t = FlightSession.Feed?.Current;
            if (t == null) return;
            _clock.text = FlightUnits.MissionClock(t.metS);
            int stage = t.phase == "F0" ? 0 : t.phase == "F1" ? 1 : t.IsLifted ? 4 : 2;
            if (t.phase == "F2" && t.throttle01 > 0.5) stage = 3;
            for (int i = 0; i < _sequence.Length; i++)
            {
                _sequence[i].EnableInClassList("fl-cd__item--done", i < stage);
                _sequence[i].EnableInClassList("fl-cd__item--now", i == stage);
            }
            _status.text = stage < _sequence.Length ? _sequence[stage].text : FlightText.Get("ui.flight.event.lift_off");

            if (!_handedOff && (t.phase == "F2" || t.IsLifted) && App != null && App.Flow != null && App.Flow.Phase == GamePhase.Countdown)
                _handedOff = App.Flow.GoToPhase(GamePhase.Flight);
        }

        private static Label AddLabel(VisualElement parent, string classes)
        {
            var l = new Label { pickingMode = PickingMode.Ignore };
            foreach (string c in classes.Split(' ')) l.AddToClassList(c);
            parent.Add(l);
            return l;
        }
    }
}
