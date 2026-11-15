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
        private FlightMinigameHost _minigames;
        private RehearsalMinigameChannel _rehearsalChannel;
        private RoomMinigameChannel _roomChannel;
        private float _nextHudSend;
        private bool _started;
        private float _endedAt = -1f;

        public FlightHudView Hud => _hud;
        public FlightMinigameHost Minigames => _minigames;
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
            _minigames?.Dispose();
            _roomChannel?.Dispose();
            _minigames = null;
            if (FlightSession.Feed != null) FlightSession.Feed.BulletTime = false;
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

            ulong seed = FlightSession.Build != null ? FlightSession.Build.Seed : FlightSession.RehearsalSeed;
            IMinigameChannel channel;
            if (FlightSession.IsRehearsal)
            {
                _rehearsalChannel = new RehearsalMinigameChannel(seed, NowMs);
                channel = _rehearsalChannel;
            }
            else
            {
                _roomChannel = new RoomMinigameChannel(App.Room.Client);
                channel = _roomChannel;
            }
            _minigames = new FlightMinigameHost(FlightSession.JsonByPath, channel, seed);
            if (_roomChannel != null && !string.IsNullOrEmpty(_roomChannel.AssistLevel)) _minigames.AssistLevel = _roomChannel.AssistLevel;
            FlightSession.Run();
            return true;
        }

        private static long NowMs() => (long)(Time.realtimeSinceStartupAsDouble * 1000.0);

        private void Update()
        {
            if (!_started)
            {
                _started = Begin();
                if (!_started) return;
            }
            IFlightFeed feed = FlightSession.Feed;
            if (feed == null) return;

            long now = _roomChannel != null ? _roomChannel.NowMs() : NowMs();
            _rehearsalChannel?.Tick(now);
            _minigames?.Tick(now);
            if (_minigames != null) feed.BulletTime = _minigames.IsBulletTime;
            _banner?.Show(_minigames?.Current, now);

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
            if (kb.vKey.wasPressedThisFrame) _hud.ShowOrbitalVelocity = !_hud.ShowOrbitalVelocity;
            if (kb.mKey.wasPressedThisFrame && App != null) App.Flow.ShowWithinPhase(ScreenId.OrbitMap);
        }

        private void OnFlightEvent(FlightTelemetryEvent e, FlightTelemetry t)
        {
            if (_hud == null) return;
            if (e.kind == FlightEventKind.MinigameCue && t.IsLifted && _minigames != null)
            {
                _minigames.TryStartFromCue(e);
                return;
            }
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
            if (key != null) _hud.Callout(FlightText.Get(key));
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
