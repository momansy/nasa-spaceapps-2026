using System;
using System.Collections.Generic;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Scoring;
using FlightOutcome = MissionForge.Core.Flight.Mission.MissionOutcome;
using MissionForge.EndScreens.Sources;
using MissionForge.Net;
using MissionForge.Screens.Flight;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// T063: the debrief record of a live room, built from what was actually flown (<see cref="FlightSession.LastFlight"/>,
    /// Core's <see cref="FlightResult"/>) and the room's players. Core still computes the score, grade and awards from it
    /// (<see cref="CoreDebriefAdapter"/>). Returns null when there is no honest result to show: no finished Core flight, a
    /// rehearsal flight, or the rehearsal stand-in build flown because the voted build was not flyable. The screen then
    /// shows "Session summary unavailable" and no score; fixtures are never used in a live room.
    /// </summary>
    public static class LiveDebrief
    {
        /// <summary>Score term inputs the live session does not measure yet (game simplification, stated in the summary).</summary>
        private const double UnmeasuredScienceFraction = 0.0;

        /// <summary>True when the host runs a real room (a room code, not forced into rehearsal).</summary>
        public static bool IsLiveRoom(AppRoot app)
        {
            RoomClient client = app != null && app.Room != null ? app.Room.Client : null;
            return client != null && !string.IsNullOrEmpty(client.RoomCode) && FlightSession.Arg("-mfRehearsal") == null;
        }

        /// <summary>The record for the flight that just ended, or null when none can be shown honestly.</summary>
        public static DebriefRecord FromLastFlight(AppRoot app)
        {
            FlightSummary flight = FlightSession.LastFlight;
            if (flight == null || flight.IsRehearsal || flight.Result == null || !flight.FlewVotedBuild) return null;
            return Build(flight.Build, flight.Catalog, flight.Result, flight.MissionLengthS, flight.Phases,
                Players(app), AssistLevel(app));
        }

        /// <summary>Maps one finished flight to a debrief record (pure; tested in EditMode).</summary>
        public static DebriefRecord Build(BuildState build, GameCatalog catalog, FlightResult result, double missionLengthS,
            IReadOnlyList<(double metS, string phase)> phases, IReadOnlyList<RecordedPlayer> players, string assistLevelId)
        {
            if (build == null) throw new ArgumentNullException(nameof(build));
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (result == null) throw new ArgumentNullException(nameof(result));
            ContractDef contract = catalog.Contract(build.ContractId);
            DashboardMetrics m = Dashboard.Compute(build, catalog);
            IReadOnlyDictionary<string, double> metrics = result.Metrics ?? new Dictionary<string, double>();

            var input = new ScoreInput
            {
                ContractId = build.ContractId,
                AssistLevelId = string.IsNullOrEmpty(assistLevelId) ? "engineer" : assistLevelId,
                Metrics = metrics,
                Crewed = contract.Crewed,
                CrewLost = contract.Crewed && result.Outcome == FlightOutcome.Failure,
                CrewSafe = contract.Crewed && Flag(metrics, "crew_safe"),
                BoosterRecovered = Flag(metrics, "booster_recovered"),
                CapsuleRecovered = Flag(metrics, "capsule_recovered"),
                BudgetRemainingFraction = Fraction(contract.BudgetM - m.CostM, contract.BudgetM),
                ScheduleMarginFraction = Fraction(contract.ScheduleDays - m.ScheduleDays, contract.ScheduleDays),
                ScienceFraction = UnmeasuredScienceFraction,
            };

            var timeline = new List<TimelineEventView>();
            foreach ((double metS, string phase) in phases ?? Array.Empty<(double, string)>())
            {
                if (phase == "F0") continue;
                timeline.Add(new TimelineEventView(Math.Max(0, metS), TimelineKind.Phase, "flight_phase." + phase + ".name", null));
            }

            FailureView failure = null;
            if (result.Outcome == FlightOutcome.Failure && !string.IsNullOrEmpty(result.FailureMode))
            {
                failure = new FailureView(result.FailureMode, result.FailurePhase ?? "", result.FailureSlot ?? "", missionLengthS);
                timeline.Add(new TimelineEventView(missionLengthS, TimelineKind.Failure, "ui.host.debrief.failure_mode." + result.FailureMode, null));
            }

            return new DebriefRecord
            {
                FixtureId = "live",
                Input = input,
                Seed = build.Seed,
                Players = players ?? Array.Empty<RecordedPlayer>(),
                Timeline = timeline,
                MissionLengthS = Math.Max(0, missionLengthS),
                Failure = failure,
                RetryAvailable = false,
            };
        }

        private static IReadOnlyList<RecordedPlayer> Players(AppRoot app)
        {
            RoomClient client = app?.Room?.Client;
            var list = new List<RecordedPlayer>();
            if (client?.LastRoomState == null) return list;
            var noStats = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (PlayerInfoDto p in client.LastRoomState.Players)
            {
                IReadOnlyList<string> roles = client.LastRolesState != null ? client.LastRolesState.RolesOf(p.Id) : null;
                var player = new DebriefPlayer(p.Id, p.Nickname, p.Avatar != null ? p.Avatar.SuitId : "", roles ?? Array.Empty<string>());
                list.Add(new RecordedPlayer(player, noStats));
            }
            return list;
        }

        private static string AssistLevel(AppRoot app) => app?.Room?.Client?.LastSettings?.AssistLevel;

        private static bool Flag(IReadOnlyDictionary<string, double> metrics, string key) =>
            metrics.TryGetValue(key, out double v) && v > 0.5;

        private static double Fraction(double left, double total) => total > 0 ? Math.Max(0, Math.Min(1, left / total)) : 0;
    }
}
