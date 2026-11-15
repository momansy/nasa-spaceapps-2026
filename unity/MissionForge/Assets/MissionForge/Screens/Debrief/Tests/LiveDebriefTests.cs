using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Flight.Mission;
using MissionForge.EndScreens.Sources;
using MissionForge.Screens.Debrief;
using MissionForge.Screens.Flight;
using NUnit.Framework;

namespace MissionForge.EndScreens.Tests
{
    /// <summary>
    /// T063: a live room's debrief is built from the flight that was flown and the room's players, never from a fixture.
    /// Core's <see cref="FlightResult"/> has an internal constructor (only the simulation makes one), so the tests build
    /// one by reflection with the values a finished C1 flight reports.
    /// </summary>
    public sealed class LiveDebriefTests
    {
        private static GameCatalog s_catalog;
        private static GameCatalog Catalog => s_catalog ??= CatalogLoader.Load(EndTestData.Data.JsonByPath, "en", lenient: true);

        private static FlightResult Result(MissionOutcome outcome, string mode, string phase, string slot, Dictionary<string, double> metrics) =>
            (FlightResult)Activator.CreateInstance(typeof(FlightResult), BindingFlags.NonPublic | BindingFlags.Instance, null,
                new object[] { outcome, mode, phase, slot, metrics }, null);

        private static IReadOnlyList<RecordedPlayer> Crew(params string[] names) =>
            names.Select((n, i) => new RecordedPlayer(new DebriefPlayer("p" + i, n, "suit_" + i, Array.Empty<string>()),
                new Dictionary<string, double>())).ToList();

        [Test]
        public void Build_ScoresTheFlownBuildWithTheRoomPlayers()
        {
            BuildState build = FlightSession.RehearsalBuild(Catalog);
            var metrics = new Dictionary<string, double> { ["orbit_altitude_km"] = 300, ["inclination_deg"] = 97.5 };
            var phases = new List<(double, string)> { (0, "F0"), (0, "F1"), (10, "F2"), (75, "F4") };

            DebriefRecord record = LiveDebrief.Build(build, Catalog, Result(MissionOutcome.Success, null, null, null, metrics),
                480, phases, Crew("Ada", "Yuri", "Sally"), "engineer");
            DebriefView view = EndTestData.Adapter.Build(record, isRehearsal: false);

            Assert.That(view.IsRehearsal, Is.False);
            Assert.That(view.ContractId, Is.EqualTo("C1"));
            Assert.That(view.Players.Select(p => p.Nickname), Is.EqualTo(new[] { "Ada", "Yuri", "Sally" }));
            Assert.That(view.Failure, Is.Null);
            Assert.That(record.Input.Metrics["orbit_altitude_km"], Is.EqualTo(300));
            Assert.That(record.Input.BudgetRemainingFraction, Is.InRange(0.0, 1.0));
            Assert.That(record.Input.ScheduleMarginFraction, Is.InRange(0.0, 1.0));
            Assert.That(record.Timeline.Select(t => t.LabelKey), Is.EqualTo(new[] { "flight_phase.F1.name", "flight_phase.F2.name", "flight_phase.F4.name" }));
            Assert.That(record.MissionLengthS, Is.EqualTo(480));
        }

        [Test]
        public void Build_FailureCarriesTheFailurePointAndNoRetry()
        {
            BuildState build = FlightSession.RehearsalBuild(Catalog);
            FlightResult failed = Result(MissionOutcome.Failure, "pogo_oscillation", "F4", "first_stage_engine", new Dictionary<string, double>());

            DebriefRecord record = LiveDebrief.Build(build, Catalog, failed, 74.2, Array.Empty<(double, string)>(), Crew("Ada"), null);
            DebriefView view = EndTestData.Adapter.Build(record, isRehearsal: false);

            Assert.That(view.Failure, Is.Not.Null);
            Assert.That(view.Failure.FailureModeId, Is.EqualTo("pogo_oscillation"));
            Assert.That(view.Failure.FlightPhaseId, Is.EqualTo("F4"));
            Assert.That(view.Outcome, Is.EqualTo("Failure"));
            Assert.That(view.RetryAvailable, Is.False);
            Assert.That(record.Input.CrewLost, Is.False, "C1 is uncrewed");
            Assert.That(record.Input.AssistLevelId, Is.EqualTo("engineer"));
            Assert.That(record.Timeline.Last().Kind, Is.EqualTo(TimelineKind.Failure));
        }

        [Test]
        public void NoFlight_GivesNoRecord_AndNoRoomIsNotLive()
        {
            Assume.That(FlightSession.LastFlight, Is.Null);
            Assert.That(LiveDebrief.FromLastFlight(app: null), Is.Null);
            Assert.That(LiveDebrief.IsLiveRoom(app: null), Is.False);
        }
    }
}
