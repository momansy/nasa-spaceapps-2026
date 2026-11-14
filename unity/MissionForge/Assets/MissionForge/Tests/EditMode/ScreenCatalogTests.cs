using System.Collections.Generic;
using System.IO;
using MissionForge.App;
using NUnit.Framework;
using UnityEditor;

namespace MissionForge.Tests
{
    public sealed class ScreenCatalogTests
    {
        private const int HostScreenCount = 16; // Design section 14.1.

        [Test]
        public void Catalog_HasOneEntryPerHostScreen()
        {
            Assert.That(ScreenCatalog.All.Count, Is.EqualTo(HostScreenCount));
            var ids = new HashSet<ScreenId>();
            var scenes = new HashSet<string>();
            foreach (ScreenInfo info in ScreenCatalog.All)
            {
                Assert.That(ids.Add(info.Id), Is.True, "duplicate id " + info.Id);
                Assert.That(scenes.Add(info.SceneName), Is.True, "duplicate scene " + info.SceneName);
                Assert.That(info.Title, Is.Not.Empty);
            }
        }

        [Test]
        public void EveryPhase_HasAPrimaryScreen()
        {
            foreach (GamePhase phase in System.Enum.GetValues(typeof(GamePhase)))
            {
                Assert.That(() => ScreenCatalog.PrimaryFor(phase), Throws.Nothing, phase.ToString());
                Assert.That(ScreenCatalog.PrimaryFor(phase).Kind, Is.EqualTo(ScreenKind.Primary));
            }
        }

        [Test]
        public void EveryScreen_HasASceneInBuildSettings_AndALayout()
        {
            var buildScenes = new HashSet<string>();
            foreach (EditorBuildSettingsScene scene in EditorBuildSettings.scenes)
            {
                if (scene.enabled) buildScenes.Add(Path.GetFileNameWithoutExtension(scene.path));
            }

            Assert.That(buildScenes, Does.Contain(ScreenCatalog.ShellSceneName));
            foreach (ScreenInfo info in ScreenCatalog.All)
            {
                Assert.That(buildScenes, Does.Contain(info.SceneName));
                string layout = "Assets/MissionForge/UI/Layouts/" + info.Layout + ".uxml";
                Assert.That(File.Exists(layout), Is.True, layout);
            }
        }

        [Test]
        public void ShellScene_IsFirstInBuildSettings()
        {
            Assert.That(EditorBuildSettings.scenes.Length, Is.GreaterThan(0));
            Assert.That(Path.GetFileNameWithoutExtension(EditorBuildSettings.scenes[0].path), Is.EqualTo(ScreenCatalog.ShellSceneName));
        }
    }
}
