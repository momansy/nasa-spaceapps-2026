using System.IO;
using MissionForge.Data;
using MissionForge.Data.Editor;
using NUnit.Framework;

namespace MissionForge.Tests
{
    public sealed class GameDataTests
    {
        private const string EngineJson = "{\"id\":\"eng_kerolox_workhorse\",\"stats\":{\"isp_vac_s\":311}}";
        private string _source;
        private string _target;

        [SetUp]
        public void SetUp()
        {
            string root = Path.Combine(Path.GetTempPath(), "mf-data-test-" + Path.GetRandomFileName());
            _source = Path.Combine(root, "data");
            _target = Path.Combine(root, "streaming");
            Directory.CreateDirectory(Path.Combine(_source, "parts"));
            Directory.CreateDirectory(Path.Combine(_source, "schema"));
            File.WriteAllText(Path.Combine(_source, "parts", "engines.json"), EngineJson);
            File.WriteAllText(Path.Combine(_source, "contracts.json"), "[]");
            File.WriteAllText(Path.Combine(_source, "schema", "part.schema.json"), "{}");
        }

        [TearDown]
        public void TearDown()
        {
            string root = Path.GetDirectoryName(_source);
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }

        [Test]
        public void Sync_ThenLoad_ReturnsEveryDataFileWithItsText()
        {
            int copied = GameDataSync.Sync(_source, _target);
            GameDataSet data = GameDataLoader.LoadFromDirectory(_target);

            Assert.That(copied, Is.EqualTo(2));
            Assert.That(data.Count, Is.EqualTo(2));
            Assert.That(data.GetText("parts/engines.json"), Is.EqualTo(EngineJson));
            Assert.That(data.GetText("contracts.json"), Is.EqualTo("[]"));
        }

        [Test]
        public void Sync_SkipsSchemas()
        {
            GameDataSync.Sync(_source, _target);
            GameDataSet data = GameDataLoader.LoadFromDirectory(_target);

            Assert.That(data.TryGetText("schema/part.schema.json", out _), Is.False);
        }

        [Test]
        public void Sync_RemovesFilesDeletedFromTheSource()
        {
            GameDataSync.Sync(_source, _target);
            File.Delete(Path.Combine(_source, "contracts.json"));

            GameDataSync.Sync(_source, _target);
            GameDataSet data = GameDataLoader.LoadFromDirectory(_target);

            Assert.That(data.Count, Is.EqualTo(1));
            Assert.That(File.Exists(Path.Combine(_target, "contracts.json")), Is.False);
        }

        [Test]
        public void Sync_WithMissingSource_WritesAnEmptyIndex()
        {
            int copied = GameDataSync.Sync(Path.Combine(_source, "does-not-exist"), _target);
            GameDataSet data = GameDataLoader.LoadFromDirectory(_target);

            Assert.That(copied, Is.EqualTo(0));
            Assert.That(data.Count, Is.EqualTo(0));
        }

        [Test]
        public void Index_IsSortedAndUsesForwardSlashes()
        {
            GameDataSync.Sync(_source, _target);
            GameDataIndex index = GameDataIndex.Parse(File.ReadAllText(Path.Combine(_target, GameDataIndex.FileName)));

            Assert.That(index.Files, Is.EqualTo(new[] { "contracts.json", "parts/engines.json" }));
        }

        [Test]
        public void Index_Parse_RejectsEmptyText()
        {
            Assert.That(() => GameDataIndex.Parse("  "), Throws.TypeOf<System.FormatException>());
        }

        [Test]
        public void Loader_ToRequestUrl_AddsFileSchemeOnlyToLocalPaths()
        {
            Assert.That(GameDataLoader.ToRequestUrl("/tmp/x/data/"), Is.EqualTo("file:///tmp/x/data"));
            Assert.That(GameDataLoader.ToRequestUrl("https://example.org/play/host/StreamingAssets/data"), Is.EqualTo("https://example.org/play/host/StreamingAssets/data"));
        }

        [Test]
        public void GetText_ForUnknownFile_Throws()
        {
            GameDataSync.Sync(_source, _target);
            GameDataSet data = GameDataLoader.LoadFromDirectory(_target);

            Assert.That(() => data.GetText("missing.json"), Throws.TypeOf<System.Collections.Generic.KeyNotFoundException>());
        }
    }
}
