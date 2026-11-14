using System.IO;
using MissionForge.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Tests
{
    public sealed class RocketKitTests
    {
        [TestCase("hull", ExpectedResult = "hull")]
        [TestCase("hull.001", ExpectedResult = "hull")]
        [TestCase("engine_metal", ExpectedResult = "engine_metal")]
        [TestCase("Nozzle_Hot.002", ExpectedResult = "nozzle_hot")]
        [TestCase("detail_dark", ExpectedResult = "detail_dark")]
        [TestCase("Default-Material", ExpectedResult = null)]
        [TestCase("", ExpectedResult = null)]
        public string SlotFor_MapsImportedMaterialNamesToKitSlots(string name) => RocketKitImport.SlotFor(name);

        [Test]
        public void KitToUnity_MapsBlenderZUpToUnityYUp()
        {
            Vector3 p = KitVehicleAssembler.KitToUnity(new[] { 2.87f, 1.5f, 33.55f });

            Assert.That(p.x, Is.EqualTo(-2.87f).Within(1e-5f));
            Assert.That(p.y, Is.EqualTo(33.55f).Within(1e-5f));
            Assert.That(p.z, Is.EqualTo(-1.5f).Within(1e-5f));
        }

        [Test]
        public void CopyKit_CopiesOnlyFbxAndToleratesAMissingSource()
        {
            string root = Path.Combine(Path.GetTempPath(), "mf-kit-test-" + Path.GetRandomFileName());
            string source = Path.Combine(root, "fbx");
            string target = Path.Combine(root, "kit");
            Directory.CreateDirectory(source);
            File.WriteAllText(Path.Combine(source, "tank_s1_m.fbx"), "x");
            File.WriteAllText(Path.Combine(source, "notes.txt"), "x");
            try
            {
                Assert.That(RocketKitImport.CopyKit(Path.Combine(root, "missing"), target), Is.EqualTo(0));
                Assert.That(RocketKitImport.CopyKit(source, target), Is.EqualTo(1));
                Assert.That(File.Exists(Path.Combine(target, "tank_s1_m.fbx")), Is.True);
                Assert.That(File.Exists(Path.Combine(target, "notes.txt")), Is.False);
            }
            finally
            {
                Directory.Delete(root, true);
            }
        }

        [Test]
        public void DemoVehicle_EveryPartIsImportedAtMetreScaleWithStyleMaterials()
        {
            KitVehicleSpec spec = KitVehicleAssembler.Load(KitStaging.DemoVehiclePath);
            Assert.That(spec, Is.Not.Null, KitStaging.DemoVehiclePath);
            Assert.That(spec.Parts.Count, Is.GreaterThan(5));

            var missing = new System.Collections.Generic.List<string>();
            GameObject vehicle = KitVehicleAssembler.Assemble(spec, null, missing);
            try
            {
                Assert.That(missing, Is.Empty, "kit parts not imported");
                Bounds bounds = KitVehicleAssembler.RendererBounds(vehicle);
                // The demo vehicle is 62.55 m tall (kit manifest): 1 unit = 1 m with +Y up.
                Assert.That(bounds.size.y, Is.EqualTo(62.55f).Within(0.5f));
                Assert.That(bounds.size.x, Is.LessThan(12f), "stack must stand upright, not lie along X");
                foreach (Renderer renderer in vehicle.GetComponentsInChildren<Renderer>())
                {
                    foreach (Material material in renderer.sharedMaterials)
                    {
                        Assert.That(AssetDatabase.GetAssetPath(material), Does.StartWith(RocketKitImport.MaterialFolder),
                            renderer.name + " uses " + (material != null ? material.name : "null"));
                    }
                }
            }
            finally
            {
                Object.DestroyImmediate(vehicle);
            }
        }
    }
}
