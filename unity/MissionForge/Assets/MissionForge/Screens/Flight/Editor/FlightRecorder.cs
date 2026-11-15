using System.IO;
using MissionForge.Core.Data;
using MissionForge.Data;
using MissionForge.Data.Editor;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Screens.Flight.Editor
{
    /// <summary>
    /// Records the rehearsal C1 flight from <see cref="CoreFlightFeed"/> into Screens/Flight/Recordings/ for
    /// deterministic replay (<c>-mfFlightRecording &lt;path&gt;</c>), screenshots and tests. Batch:
    /// <c>-executeMethod MissionForge.Screens.Flight.Editor.FlightRecorder.RecordC1</c>.
    /// </summary>
    public static class FlightRecorder
    {
        public const string OutputPath = "Assets/MissionForge/Screens/Flight/Recordings/c1_ascent.json";
        /// <summary>Kept every 60th Core step (2 Hz) plus every event step: about 3 MB for a full C1 flight.</summary>
        public const int SampleEveryTicks = 60;
        /// <summary>Upper bound, Core steps (25 simulated minutes).</summary>
        public const int MaxTicks = 120 * 60 * 25;

        [MenuItem("MissionForge/Flight/Record C1 Ascent")]
        public static void RecordC1()
        {
            string temp = Path.Combine(Path.GetTempPath(), "mf-t016-rec-" + Path.GetRandomFileName());
            GameDataSync.Sync(GameDataSync.RepositoryDataPath, temp);
            GameDataSet data = GameDataLoader.LoadFromDirectory(temp);
            Directory.Delete(temp, true);
            GameCatalog catalog = CatalogLoader.Load(data.JsonByPath);
            var feed = new CoreFlightFeed(FlightSession.RehearsalBuild(catalog), catalog, data.JsonByPath);
            FlightRecording rec = FlightRecording.Record(feed, "C1", FlightSession.RehearsalSeed, SampleEveryTicks, MaxTicks);
            Directory.CreateDirectory(Path.GetDirectoryName(OutputPath));
            File.WriteAllText(OutputPath, rec.ToJson());
            FlightTelemetry last = rec.samples[rec.samples.Count - 1];
            Debug.Log("[MissionForge] T016 recording: " + rec.samples.Count + " samples, last MET " + last.metS.ToString("0.0")
                + " s, phase " + last.phase + ", altitude " + (last.altitudeM / 1000).ToString("0.0") + " km, periapsis "
                + (last.periapsisM / 1000).ToString("0.0") + " km, apoapsis " + (last.apoapsisM / 1000).ToString("0.0")
                + " km, outcome " + (feed.Result != null ? feed.Result.Outcome.ToString() : "none") + " -> " + OutputPath);
            AssetDatabase.Refresh();
        }
    }
}
