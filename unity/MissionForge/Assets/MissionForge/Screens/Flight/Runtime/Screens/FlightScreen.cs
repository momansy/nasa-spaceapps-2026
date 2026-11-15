using MissionForge.App;
using MissionForge.Net;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// MF_Flight: the launch and ascent to orbit driven by Core through <see cref="FlightSession"/>, with the HUD of
    /// design 9.6, event callouts (visual cues for audible events), the minigame banner with bullet-time, and the
    /// orbit map on M. Sends <c>flight.hud</c> at ≤ 5 Hz from the same snapshot the HUD shows.
    /// </summary>
    public sealed class FlightScreen : ScreenController
    {
        /// <summary>Protocol limit for flight.hud (messages.md, flight.hud: at most 5 Hz).</summary>
        public const float HudSendIntervalS = 0.2f;
        /// <summary>Seconds after mission end before the rehearsal moves on to the debrief (game_value).</summary>
        private const float RehearsalDebriefDelayS = 12f;

        [SerializeField] private FlightWorld world;
        [SerializeField] private FlightCameraDirector cameraDirector;

        private FlightHudView _hud;
        private MinigameBannerView _banner;
        private float _nextHudSend;
        private bool _started;
        private float _endedAt = -1f;

        public FlightHudView Hud => _hud;
        public FlightMinigameHost Minigames => FlightMinigames.Host;
        public FlightCameraDirector Cameras => cameraDirector;

        public void ConfigureWorld(FlightWorld flightWorld, FlightCameraDirector director)
        {
            world = flightWorld;
            cameraDirector = director;
        }

        protected override void OnEnter()
        {
            FlightSession.EventRaised += OnFlightEvent;
        }

        protected override void OnExit()
        {
            FlightSession.EventRaised -= OnFlightEvent;
        }

        private bool Begin()
        {
            if (App == null || !FlightSession.EnsureStarted(App)) return false;
            if (world != null)
            {
                world.Activate();
                world.Vehicle.Build();
            }
            _hud = new FlightHudView(Screen, FlightSession.Feed.StageCount);
            _hud.SetFeedName(FlightSession.FeedName, FlightSession.IsRehearsal);
            StyleSheet bannerSheet = Resources.Load<StyleSheet>(MinigameBannerView.StyleSheetPath);
            if (bannerSheet != null) Screen.styleSheets.Add(bannerSheet);
            _banner = new MinigameBannerView(Screen);

            FlightMinigames.Ensure(App);
            FlightSession.Run();
            return true;
        }

        private void Update()
        {
            if (!_started)
            {
                _started = Begin();
                if (!_started) return;
            }
            IFlightFeed feed = FlightSession.Feed;
            if (feed == null) return;

            _banner?.Show(FlightMinigames.Host?.Current, FlightMinigames.NowMs());

            FlightTelemetry t = feed.Current;
            HandleKeys();
            _hud.Show(t);
            SendHud(t);

            if (t.missionEnded && _endedAt < 0) _endedAt = Time.unscaledTime;
            if (_endedAt > 0 && FlightSession.IsRehearsal && Time.unscaledTime - _endedAt > RehearsalDebriefDelayS
                && App.Flow.Phase == GamePhase.Flight && !App.Flow.IsBusy && FlightSession.Arg("-mfFlightHold") == null)
                App.Flow.GoToPhase(GamePhase.Debrief);
        }

        private void HandleKeys()
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.vKey.wasPressedThisFrame)
            {
                bool now = _hud.ShowOrbitalVelocity ?? FlightSession.Feed.Current.altitudeM >= FlightHudMessage.OrbitalVelocityAboveM;
                _hud.ShowOrbitalVelocity = !now;
            }
            if (kb.mKey.wasPressedThisFrame && App != null) App.Flow.ShowWithinPhase(ScreenId.OrbitMap);
        }

        private void OnFlightEvent(FlightTelemetryEvent e, FlightTelemetry t)
        {
            if (_hud == null) return;
            string key = e.kind switch
            {
                FlightEventKind.Ignition => "ui.flight.event.ignition",
                FlightEventKind.LiftOff => "ui.flight.event.lift_off",
                FlightEventKind.MaxQ => "ui.flight.event.max_q",
                FlightEventKind.Meco => "ui.flight.event.meco",
                FlightEventKind.Staging => "ui.flight.event.staging",
                FlightEventKind.FairingJettison => "ui.flight.event.fairing",
                FlightEventKind.Seco => "ui.flight.event.seco",
                FlightEventKind.Orbit => "ui.flight.event.orbit",
                FlightEventKind.MissionEnd => "ui.flight.event.mission_end",
                _ => null,
            };
            if (key == null) return;
            _hud.Callout(FlightText.Get(key));
            Debug.Log("[MissionForge] Flight event " + e.kind + " at MET " + t.metS.ToString("0.0") + " s, " + (t.altitudeM / 1000).ToString("0.0") + " km");
        }

        private void SendHud(FlightTelemetry t)
        {
            if (Time.unscaledTime < _nextHudSend || FlightSession.IsRehearsal || App == null || App.Room == null) return;
            RoomClient client = App.Room.Client;
            if (client == null || string.IsNullOrEmpty(client.RoomCode)) return;
            _nextHudSend = Time.unscaledTime + HudSendIntervalS;
            client.Send(ProtocolNames.Messages.FlightHud, FlightHudMessage.From(t));
        }
    }
}
