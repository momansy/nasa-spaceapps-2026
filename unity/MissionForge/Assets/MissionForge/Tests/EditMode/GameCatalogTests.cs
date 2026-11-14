using System.Collections.Generic;
using System.IO;
using MissionForge.Data;
using MissionForge.Data.Editor;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Tests
{
    /// <summary>Runs the real repository catalog (data/) through the sync, the loader and the string merge.</summary>
    public sealed class GameCatalogTests
    {
        /// <summary>Part count of the catalog on main when T008 ran (design section 6, data/parts/*.json).</summary>
        private const int ExpectedPartCount = 102;

        private string _target;
        private GameDataSet _data;

        [OneTimeSetUp]
        public void SyncRealCatalog()
        {
            _target = Path.Combine(Path.GetTempPath(), "mf-catalog-test-" + Path.GetRandomFileName());
            GameDataSync.Sync(GameDataSync.RepositoryDataPath, _target);
            _data = GameDataLoader.LoadFromDirectory(_target);
        }

        [OneTimeTearDown]
        public void Cleanup()
        {
            if (Directory.Exists(_target)) Directory.Delete(_target, true);
        }

        [Test]
        public void Catalog_ContainsTheCoreFiles()
        {
            foreach (string file in new[] { "contracts.json", "tests.json", "anomalies.json", "roles.json", "boosts.json", "minigames.json", "facts.json" })
            {
                Assert.That(_data.TryGetText(file, out _), Is.True, file + " was not synced");
            }
        }

        [Test]
        public void Catalog_HasEveryPart()
        {
            int parts = 0;
            foreach (KeyValuePair<string, string> file in _data.JsonByPath)
            {
                if (!file.Key.StartsWith("parts/")) continue;
                JToken options = JObject.Parse(file.Value)["parts"];
                Assert.That(options, Is.Not.Null, file.Key + " has no parts array");
                parts += ((JArray)options).Count;
            }
            Assert.That(parts, Is.EqualTo(ExpectedPartCount));
        }

        [Test]
        public void Strings_MergeEveryEnglishFileWithoutClashes()
        {
            GameStrings strings = GameStrings.Merge(_data);

            Assert.That(strings.Files, Does.Contain("strings/en.json"));
            Assert.That(strings.Files.Count, Is.GreaterThanOrEqualTo(4));
            Assert.That(strings.Conflicts, Is.Empty);
            Assert.That(strings.Get("category.launch_site.name"), Is.EqualTo("Launch site"));
            Assert.That(strings.TryGet("contract.C2.name", out _), Is.True, "key from en.content.json");
            Assert.That(strings.TryGet("category.avionics.name", out _), Is.True, "key from en.parts_b.json");
        }

        [Test]
        public void Strings_ReportDuplicateKeysAndKeepTheFirst()
        {
            var data = new GameDataSet(new Dictionary<string, string>
            {
                { "strings/en.json", "{\"a\":\"one\",\"b\":\"two\"}" },
                { "strings/en.extra.json", "{\"a\":\"clash\",\"c\":\"three\"}" },
                { "strings/es.json", "{\"a\":\"uno\"}" },
                { "contracts.json", "{}" },
            });

            GameStrings strings = GameStrings.Merge(data);

            Assert.That(strings.Count, Is.EqualTo(3));
            Assert.That(strings.Get("a"), Is.EqualTo("clash"), "ordinal order: strings/en.extra.json sorts before strings/en.json");
            Assert.That(strings.Conflicts.Count, Is.EqualTo(1));
            Assert.That(strings.Get("missing"), Is.EqualTo("[missing]"));
        }

        [TestCase("strings/en.json", ExpectedResult = true)]
        [TestCase("strings/en.parts_a.json", ExpectedResult = true)]
        [TestCase("strings/es.json", ExpectedResult = false)]
        [TestCase("strings/en_gb.json", ExpectedResult = false)]
        [TestCase("contracts.json", ExpectedResult = false)]
        public bool IsStringFile_MatchesOnlyTheLanguage(string path) => GameStrings.IsStringFile(path, "en");
    }
}
