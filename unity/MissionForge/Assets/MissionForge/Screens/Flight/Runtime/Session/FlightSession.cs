using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// The one flight of the current mission, shared by MF_Countdown, MF_Flight and MF_OrbitMap. It outlives screen
    /// scenes (SceneFlow loads and unloads them) so the countdown hands off to the flight without a restart. A hidden
    /// runner steps the feed at Core's fixed 120 steps per second of real time (times the playback rate).
    /// </summary>
    public static class FlightSession
    {
        /// <summary>Core fixed step, s (design 8.2, physical integrator choice).</summary>
        public const double FixedStepS = 1.0 / 120.0;

        /// <summary>Seed of the rehearsal C1 build (the Appendix A walkthrough build used by Core's tests).</summary>
        public const ulong RehearsalSeed = 2026;

        public static IFlightFeed Feed { get; private set; }
        public static IFlightControlSink Controls { get; private set; }
        public static BuildState Build { get; private set; }
        public static GameCatalog Catalog { get; private set; }
        public static IReadOnlyDictionary<string, string> JsonByPath { get; private set; }

        /// <summary>"CoreFlightFeed" or "RecordedFlightFeed": what is driving the view (reported in evidence).</summary>
        public static string FeedName { get; private set; } = "";

        /// <summary>True when no room is open: rehearsal drivers stand in for phones.</summary>
        public static bool IsRehearsal { get; private set; }

        /// <summary>Display interpolation factor between <c>Feed.Previous</c> and <c>Feed.Current</c>, 0–1.</summary>
        public static float Alpha => Runner != null ? Runner.Alpha : 1f;

        /// <summary>Real-time playback multiplier (1 = real time). Presentation only; Core still takes fixed steps.</summary>
        public static float PlaybackRate { get; set; } = 1f;

        public static bool IsRunning => Runner != null && Runner.Running;

        /// <summary>Raised for every event of every simulation step, in order.</summary>
        public static event Action<FlightTelemetryEvent, FlightTelemetry> EventRaised;

        /// <summary>Raised after every simulation step.</summary>
        public static event Action<FlightTelemetry> Stepped;

        /// <summary>Build captured from the Build Bay when the session left the BUILD phase.</summary>
        public static BuildState HandedOffBuild { get; set; }

        internal static FlightSessionRunner Runner { get; private set; }

        /// <summary>Starts the session once (no-op if it already runs). Returns false when game data is not ready.</summary>
        public static bool EnsureStarted(AppRoot app)
        {
            if (Feed != null) return true;
            if (app == null || app.Data == null || !app.Data.IsReady) return false;
            try
            {
                JsonByPath = app.Data.Data.JsonByPath;
                Catalog = CatalogCache.Get(app.Data.Data);
                IsRehearsal = Arg("-mfRehearsal") != null || app.Room == null || app.Room.Client == null
                    || string.IsNullOrEmpty(app.Room.Client.RoomCode);
                if (float.TryParse(Arg("-mfFlightRate"), NumberStyles.Float, CultureInfo.InvariantCulture, out float rate) && rate > 0)
                    PlaybackRate = rate;

                string recording = Arg("-mfFlightRecording");
                if (!string.IsNullOrEmpty(recording))
                {
                    var feed = new RecordedFlightFeed(FlightRecording.FromJson(LoadRecording(recording)));
                    Build = RehearsalBuild(Catalog);
                    Use(feed, feed, "RecordedFlightFeed");
                }
                else
                {
                    Build = UsableBuild(HandedOffBuild, Catalog) ?? RehearsalBuild(Catalog);
                    var feed = new CoreFlightFeed(Build, Catalog, JsonByPath);
                    Use(feed, feed, "CoreFlightFeed");
                }
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError("[MissionForge] Flight: could not start the flight session: " + e.Message);
                Feed = null;
                return false;
            }
        }

        /// <summary>Drives the view from an explicit feed (tests, evidence).</summary>
        public static void Use(IFlightFeed feed, IFlightControlSink controls, string name)
        {
            Feed = feed ?? throw new ArgumentNullException(nameof(feed));
            Controls = controls;
            FeedName = name ?? feed.GetType().Name;
            if (Runner == null)
            {
                var go = new GameObject("MF_FlightSession") { hideFlags = HideFlags.DontSave };
                UnityEngine.Object.DontDestroyOnLoad(go);
                Runner = go.AddComponent<FlightSessionRunner>();
            }
            Runner.Running = false;
        }

        /// <summary>Starts (or resumes) stepping the feed in real time.</summary>
        public static void Run()
        {
            if (Runner != null) Runner.Running = true;
        }

        public static void Pause()
        {
            if (Runner != null) Runner.Running = false;
        }

        /// <summary>Ends the session (leaving the flight phase). The next countdown starts a new flight.</summary>
        public static void End()
        {
            if (Runner != null) UnityEngine.Object.Destroy(Runner.gameObject);
            Runner = null;
            Feed = null;
            Controls = null;
            Build = null;
            HandedOffBuild = null;
            FeedName = "";
        }

        internal static void Raise(FlightTelemetry t)
        {
            OrbitMapTrail.Add(t);
            foreach (FlightTelemetryEvent e in t.events) EventRaised?.Invoke(e, t);
            Stepped?.Invoke(t);
        }

        /// <summary>The build is flyable when Core can turn it into a flight spec (fuelled, every stage chosen).</summary>
        public static BuildState UsableBuild(BuildState build, GameCatalog catalog)
        {
            if (build == null || catalog == null) return null;
            try
            {
                Core.Flight.Mission.FlightVehicleSpec.FromBuild(build, catalog);
                return build;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[MissionForge] Flight: the voted build is not flyable (" + e.Message + "); using the rehearsal C1 build.");
                return null;
            }
        }

        /// <summary>
        /// Rehearsal vehicle: the C1 Appendix A build (same choices as Core's MissionFixture.C1), which Core's
        /// autopilot test flies to a 150 km+ periapsis. Display tooling only; never scored.
        /// </summary>
        public static BuildState RehearsalBuild(GameCatalog catalog) => BuildState.New("C1", RehearsalSeed)
            .WithChoice(Slots.LaunchSite, "site_west_coast_polar_range")
            .WithChoice(Slots.PayloadInstrument, "inst_multispectral_imager")
            .WithChoice(Slots.PayloadPower, "satpwr_deployable_solar_wings")
            .WithChoice(Slots.PayloadAttitude, "adcs_reaction_wheels_star_tracker")
            .WithChoice(Slots.Fairing, "fairing_small")
            .WithChoice(Slots.UpperStageEngine, "eng_kerolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_m")
            .WithChoice(Slots.StageSeparation, "sep_pyro_bolts_springs")
            .WithChoice(Slots.FirstStageEngine, "eng_kerolox_workhorse")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithChoice(Slots.FirstStageTank, "tank_s")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_expendable")
            .WithChoice(Slots.Avionics, "avi_commercial_single")
            .WithChoice(Slots.Navigation, "nav_imu_gnss")
            .WithChoice(Slots.AeroControl, "aero_gimbal_only")
            .WithChoice(Slots.Rcs, "rcs_cold_gas")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_x_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");

        private static string LoadRecording(string nameOrPath)
        {
            if (System.IO.File.Exists(nameOrPath)) return System.IO.File.ReadAllText(nameOrPath);
            TextAsset asset = Resources.Load<TextAsset>("FlightRecordings/" + nameOrPath);
            if (asset == null) throw new System.IO.FileNotFoundException("Flight recording not found: " + nameOrPath);
            return asset.text;
        }

        /// <summary>Command-line flag value (desktop) or <c>?name=value</c> query parameter (WebGL).</summary>
        public static string Arg(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] != name) continue;
                return i + 1 < args.Length && !args[i + 1].StartsWith("-") ? args[i + 1] : "";
            }
            string url = Application.absoluteURL;
            if (!string.IsNullOrEmpty(url))
            {
                string key = name.TrimStart('-');
                int q = url.IndexOf('?');
                if (q >= 0)
                {
                    foreach (string pair in url.Substring(q + 1).Split('&'))
                    {
                        string[] kv = pair.Split('=');
                        if (kv[0] == key) return kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : "";
                    }
                }
            }
            return null;
        }
    }

    /// <summary>Steps the session feed: 120 Core steps per real second × playback rate; display interpolates.</summary>
    internal sealed class FlightSessionRunner : MonoBehaviour
    {
        /// <summary>Cap so a long frame hitch never stalls the main thread (game_value).</summary>
        private const int MaxStepsPerFrame = 2400;

        private double _accumulatorS;

        public bool Running { get; set; }
        public float Alpha { get; private set; } = 1f;

        private void Update()
        {
            IFlightFeed feed = FlightSession.Feed;
            if (!Running || feed == null) return;
            double stepS = FlightSession.FixedStepS;
            if (feed is RecordedFlightFeed recorded) stepS *= recorded.TicksPerStep;
            _accumulatorS += Time.unscaledDeltaTime * FlightSession.PlaybackRate;
            int steps = 0;
            while (_accumulatorS >= stepS && steps < MaxStepsPerFrame && !feed.IsFinished)
            {
                _accumulatorS -= stepS;
                FlightSession.Raise(feed.Step());
                steps++;
            }
            if (steps >= MaxStepsPerFrame || feed.IsFinished) _accumulatorS = 0;
            Alpha = Mathf.Clamp01((float)(_accumulatorS / stepS));
        }
    }
}
