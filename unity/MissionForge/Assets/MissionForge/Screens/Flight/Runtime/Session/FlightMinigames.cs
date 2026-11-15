using MissionForge.App;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// The minigame host of the current flight session. It lives with <see cref="FlightSession"/>, not with a screen
    /// scene, so opening the orbit map (which unloads MF_Flight) neither drops a running minigame nor reuses run ids.
    /// Ticked by the session runner; screens only read <see cref="Host"/> for the banner.
    /// </summary>
    public static class FlightMinigames
    {
        private static RehearsalMinigameChannel _rehearsal;
        private static RoomMinigameChannel _room;
        private static int _sessions; // a scrubbed countdown restarts the flight within the same mission

        public static FlightMinigameHost Host { get; private set; }

        public static long NowMs() => _room != null ? _room.NowMs() : (long)(Time.realtimeSinceStartupAsDouble * 1000.0);

        public static void Ensure(AppRoot app)
        {
            if (Host != null || FlightSession.Feed == null || FlightSession.JsonByPath == null) return;
            ulong seed = FlightSession.Build != null ? FlightSession.Build.Seed : FlightSession.RehearsalSeed;
            IMinigameChannel channel;
            if (FlightSession.IsRehearsal || app == null || app.Room == null || app.Room.Client == null)
            {
                _rehearsal = new RehearsalMinigameChannel(seed, NowMs);
                channel = _rehearsal;
            }
            else
            {
                _room = new RoomMinigameChannel(app.Room.Client);
                channel = _room;
            }
            Host = new FlightMinigameHost(FlightSession.JsonByPath, channel, seed)
            {
                RunIdPrefix = "m" + (app != null ? app.MissionSeq : 0) + "s" + (++_sessions) + "f",
            };
            if (_room != null && !string.IsNullOrEmpty(_room.AssistLevel)) Host.AssistLevel = _room.AssistLevel;
        }

        /// <summary>Starts a run for a Core minigame cue once the vehicle is flying.</summary>
        public static void OnFlightEvent(FlightTelemetryEvent e, FlightTelemetry t)
        {
            if (Host != null && e.kind == FlightEventKind.MinigameCue && t.IsLifted) Host.TryStartFromCue(e);
        }

        public static void Tick()
        {
            if (Host == null) return;
            long now = NowMs();
            _rehearsal?.Tick(now);
            Host.Tick(now);
            if (FlightSession.Feed != null) FlightSession.Feed.BulletTime = Host.IsBulletTime;
        }

        /// <summary>Ends the session's minigames: cancels an open run on the phones (mg.cancel) and releases the channel.</summary>
        public static void End()
        {
            if (Host != null)
            {
                Host.Cancel(FlightMinigameHost.CancelReasons.PhaseChange);
                Host.Dispose();
            }
            _room?.Dispose();
            Host = null;
            _room = null;
            _rehearsal = null;
        }
    }
}
