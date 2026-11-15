using System.IO;
using MissionForge.Data;
using MissionForge.Data.Editor;
using MissionForge.EndScreens.Sources;
using UnityEngine;

namespace MissionForge.EndScreens.Tests
{
    /// <summary>The repository data (data/) synced and loaded once per test run, and the end-screen fixtures on disk.</summary>
    internal static class EndTestData
    {
        private static GameDataSet _data;
        private static CoreDebriefAdapter _adapter;

        public static GameDataSet Data
        {
            get
            {
                if (_data != null) return _data;
                string target = Path.Combine(Path.GetTempPath(), "mf-t024-data-" + Path.GetRandomFileName());
                GameDataSync.Sync(GameDataSync.RepositoryDataPath, target);
                _data = GameDataLoader.LoadFromDirectory(target);
                Directory.Delete(target, true);
                return _data;
            }
        }

        public static CoreDebriefAdapter Adapter => _adapter ??= new CoreDebriefAdapter(Data.JsonByPath);

        public static string ScreensFolder => Path.Combine(Application.dataPath, "MissionForge", "Screens");

        public static string Fixture(string screen, string name) =>
            File.ReadAllText(Path.Combine(ScreensFolder, screen, "Fixtures", name + ".json"));

        public static DebriefView Debrief(string name) =>
            new FixtureDebriefSource(Adapter, Fixture("Debrief", name)).Load();
    }
}
