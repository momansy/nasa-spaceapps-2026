using System.IO;
using System.Linq;
using MissionForge.Core.Data;
using MissionForge.Data;
using MissionForge.Data.Editor;
using Newtonsoft.Json;
using NUnit.Framework;

namespace MissionForge.Screens.Flight.Tests
{
    internal static class FlightTestData
    {
        private static GameDataSet _data;
        private static GameCatalog _catalog;

        public static GameDataSet Data
        {
            get
            {
                if (_data != null) return _data;
                string target = Path.Combine(Path.GetTempPath(), "mf-t016-data-" + Path.GetRandomFileName());
                GameDataSync.Sync(GameDataSync.RepositoryDataPath, target);
                _data = GameDataLoader.LoadFromDirectory(target);
                Directory.Delete(target, true);
                return _data;
            }
        }

        public static GameCatalog Catalog => _catalog ??= CatalogLoader.Load(Data.JsonByPath);

        public static CoreFlightFeed NewFeed() =>
            new CoreFlightFeed(FlightSession.RehearsalBuild(Catalog), Catalog, Data.JsonByPath);
    }

    public sealed class FlightFeedTests
    {
        [Test]
        public void CoreFeed_StartsOnThePadAtTMinusTen()
        {
            CoreFlightFeed feed = FlightTestData.NewFeed();
            Assert.AreEqual(-10.0, feed.Current.metS, 1e-9);
            Assert.AreEqual(0.0, feed.Current.altitudeM, 1e-6);
            Assert.AreEqual(2, feed.StageCount);
            Assert.AreEqual(1.0, feed.Current.pressureRatio, 1e-9);
        }

        [Test]
        public void CoreFeed_SameSeedGivesIdenticalTelemetry()
        {
            CoreFlightFeed a = FlightTestData.NewFeed();
            CoreFlightFeed b = FlightTestData.NewFeed();
            for (int i = 0; i < 6000; i++)
            {
                string ja = JsonConvert.SerializeObject(a.Step());
                string jb = JsonConvert.SerializeObject(b.Step());
                if (ja != jb) Assert.Fail("Telemetry diverged at step " + i);
            }
        }

        [Test]
        public void CoreFeed_EmitsIgnitionLiftOffAndClimbs()
        {
            CoreFlightFeed feed = FlightTestData.NewFeed();
            var kinds = new System.Collections.Generic.List<FlightEventKind>();
            for (int i = 0; i < 120 * 40; i++) kinds.AddRange(feed.Step().events.Select(e => e.kind));
            CollectionAssert.Contains(kinds, FlightEventKind.Ignition);
            CollectionAssert.Contains(kinds, FlightEventKind.LiftOff);
            Assert.Greater(feed.Current.altitudeM, 100.0);
            Assert.Greater(feed.Current.metS, 0.0);
            Assert.Less(feed.Current.pressureRatio, 1.0);
        }

        [Test]
        public void GroundAngle_StaysOnThePadUntilLiftOff()
        {
            CoreFlightFeed feed = FlightTestData.NewFeed();
            while (!feed.Current.IsLifted) feed.Step();
            Assert.AreEqual(0.0, feed.Current.groundAngleRad * MissionForge.Core.Flight.Body.Earth.RadiusM, 2.0,
                "pad drift (m) before lift-off: the ground frame must remove Earth's rotation");
            for (int i = 0; i < 120 * 10; i++) feed.Step();
            double inertialMinusGroundM = (feed.Current.DownrangeAngleRad - feed.Current.groundAngleRad) * MissionForge.Core.Flight.Body.Earth.RadiusM;
            Assert.Greater(System.Math.Abs(inertialMinusGroundM), 1.0, "after lift-off the inertial angle includes the pad's rotation");
        }

        [Test]
        public void Recording_RoundTripsThroughJsonAndReplaysTheSameValues()
        {
            CoreFlightFeed feed = FlightTestData.NewFeed();
            FlightRecording rec = FlightRecording.Record(feed, "C1", FlightSession.RehearsalSeed, 12, 120 * 30);
            FlightRecording back = FlightRecording.FromJson(rec.ToJson());
            Assert.AreEqual(rec.samples.Count, back.samples.Count);
            var replay = new RecordedFlightFeed(back);
            int i = 0;
            while (!replay.IsFinished)
            {
                FlightTelemetry r = replay.Step();
                FlightTelemetry o = rec.samples[++i];
                Assert.AreEqual(o.metS, r.metS, 1e-9);
                Assert.AreEqual(o.altitudeM, r.altitudeM, 1e-6);
                Assert.AreEqual(o.phase, r.phase);
                Assert.AreEqual(o.events.Count, r.events.Count);
            }
            Assert.AreEqual(rec.samples.Count - 1, i);
        }

        [Test]
        public void Recording_KeepsEveryEventStep()
        {
            CoreFlightFeed source = FlightTestData.NewFeed();
            FlightRecording rec = FlightRecording.Record(source, "C1", FlightSession.RehearsalSeed, 60, 120 * 20);
            Assert.IsTrue(rec.samples.Any(s => s.events.Any(e => e.kind == FlightEventKind.Ignition)));
            Assert.IsTrue(rec.samples.Any(s => s.events.Any(e => e.kind == FlightEventKind.LiftOff)));
        }

        [Test]
        public void BulletTime_SlowsSimulatedTimeTenfold()
        {
            CoreFlightFeed normal = FlightTestData.NewFeed();
            CoreFlightFeed slow = FlightTestData.NewFeed();
            for (int i = 0; i < 120 * 20; i++) { normal.Step(); slow.Step(); }
            Assume.That(normal.Current.IsLifted, "vehicle must be flying");
            double t0 = normal.Current.metS;
            slow.BulletTime = true;
            for (int i = 0; i < 120; i++) { normal.Step(); slow.Step(); }
            Assert.AreEqual(1.0, normal.Current.metS - t0, 1e-6);
            Assert.AreEqual(0.1, slow.Current.metS - t0, 1e-6);
            Assert.AreEqual(0.1, slow.Current.warp, 1e-9);
        }
    }

    public sealed class FlightUnitsTests
    {
        [Test]
        public void Altitude_SwitchesFromMetresToKilometres()
        {
            Assert.AreEqual(("850", "m"), FlightUnits.Altitude(850.4));
            Assert.AreEqual(("402.3", "km"), FlightUnits.Altitude(402_300));
        }

        [Test]
        public void Pressure_Speed_G_Percent_Degrees()
        {
            Assert.AreEqual(("31.2", "kPa"), FlightUnits.DynamicPressure(31_200));
            Assert.AreEqual(("7 812", "m/s"), FlightUnits.Speed(7811.6));
            Assert.AreEqual(("+310", "m/s"), FlightUnits.VerticalSpeed(310.2));
            Assert.AreEqual(("−12", "m/s"), FlightUnits.VerticalSpeed(-12.3));
            Assert.AreEqual(("1.9", "g"), FlightUnits.GLoad(1.94));
            Assert.AreEqual(("62", "%"), FlightUnits.Percent(0.615));
            Assert.AreEqual(("97.6", "°"), FlightUnits.Degrees(97.6 * System.Math.PI / 180));
        }

        [Test]
        public void Apsis_IsDashWhenUndefined()
        {
            Assert.AreEqual(("—", "km"), FlightUnits.Apsis(double.NaN));
            Assert.AreEqual(("300", "km"), FlightUnits.Apsis(300_000));
        }

        [Test]
        public void MissionClock_CountsDownThenUp()
        {
            Assert.AreEqual("T−00:10", FlightUnits.MissionClock(-10));
            Assert.AreEqual("T−00:01", FlightUnits.MissionClock(-0.2));
            Assert.AreEqual("T+00:00", FlightUnits.MissionClock(0));
            Assert.AreEqual("T+01:02", FlightUnits.MissionClock(62.4));
            Assert.AreEqual("T+01:00:05", FlightUnits.MissionClock(3605));
        }
    }
}
