using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Vehicle;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>Step 3 of T015: kit resolution and static assembly against the real kit models.</summary>
    public sealed class VehicleAssemblyTests
    {
        /// <summary>Mating tolerance from the brief: every ring within 3 mm.</summary>
        private const float RingToleranceM = 0.003f;

        private static readonly string[] KitSlots =
        {
            Slots.Fairing, Slots.UpperStageEngine, Slots.UpperStageEngineCount, Slots.UpperStageTank, Slots.StageSeparation,
            Slots.FirstStageEngine, Slots.FirstStageEngineCount, Slots.FirstStageTank, Slots.StrapOnBoosters,
        };

        private KitLibrary _library;
        private readonly List<GameObject> _spawned = new List<GameObject>();

        [OneTimeSetUp]
        public void LoadLibrary()
        {
            _library = AssetDatabase.LoadAssetAtPath<KitLibrary>(KitLibrary.AssetPath);
            Assert.That(_library, Is.Not.Null, "Run MissionForge/Vehicle/Build Kit Library first: " + KitLibrary.AssetPath);
        }

        [TearDown]
        public void Cleanup()
        {
            foreach (GameObject go in _spawned) Object.DestroyImmediate(go);
            _spawned.Clear();
        }

        [Test]
        public void Library_HasEveryKitModel()
        {
            Assert.That(_library.Count, Is.EqualTo(97));
            foreach (KitPartEntry e in _library.Parts) Assert.That(e.prefab, Is.Not.Null, e.id + " has no imported model");
        }

        [Test]
        public void KitEmpties_MatchTheManifestThroughKitToUnity()
        {
            var wrong = new List<string>();
            int checkedCount = 0;
            foreach (KitPartEntry e in _library.Parts)
            {
                foreach (KitAttachPoint a in e.attachPoints)
                {
                    Transform t = FindDeep(e.prefab.transform, a.name);
                    if (t == null) continue;
                    checkedCount++;
                    Vector3 local = e.prefab.transform.InverseTransformPoint(t.position);
                    Vector3 expected = VehicleAssembler.KitToUnity(a.kitPositionM);
                    if ((local - expected).magnitude > 0.002f) wrong.Add(e.id + "." + a.name + " fbx " + local.ToString("F3") + " manifest›unity " + expected.ToString("F3"));
                }
            }
            Assert.That(checkedCount, Is.GreaterThan(100));
            Assert.That(wrong, Is.Empty, string.Join("\n", wrong.Take(12)));
        }

        private static Transform FindDeep(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            {
                Transform hit = FindDeep(root.GetChild(i), name);
                if (hit != null) return hit;
            }
            return null;
        }

        [Test]
        public void Resolver_MapsEveryC1OptionToAKitModel()
        {
            GameCatalog catalog = TestCatalog.Catalog;
            BuildState complete = TestCatalog.C1Small();
            var unmodelled = new List<string>();
            foreach (string slot in KitSlots)
            {
                foreach (PartDef option in VoteOptions.Offered(BuildState.New("C1", TestCatalog.Seed), catalog, slot))
                {
                    BuildState build = complete.WithChoice(slot, option.Id);
                    KitPlan plan = KitResolver.Resolve(build, catalog, _library);
                    foreach (string id in plan.MissingDataIds) if (!unmodelled.Contains(id)) unmodelled.Add(id);
                    bool shown = option.Id == "strap_none" || plan.Steps.Any(s => s.Category == slot);
                    if (option.Id == "strap_2_liquid_side") continue; // no kit model by design (data_part_map.json), reported
                    Assert.That(shown, Is.True, slot + " option " + option.Id + " is not shown: " + string.Join(", ", plan.Steps));
                }
            }
            Assert.That(unmodelled, Is.SubsetOf(new[] { "strap_2_liquid_side" }), "Unexpected parts without kit model");
        }

        [Test]
        public void Resolver_UsesHydroloxTanksForHydroloxEngines()
        {
            KitPlan plan = KitResolver.Resolve(TestCatalog.HeavyWithStrapOns(), TestCatalog.Catalog, _library);
            Assert.That(plan.Find("tank1").KitId, Is.EqualTo("tank_s1_l_hydrolox"));
            Assert.That(plan.Find("tank2").KitId, Is.EqualTo("tank_s2_l_hydrolox"));
            Assert.That(plan.Find("mount1").KitId, Is.EqualTo("mount_s1_5_d54"));
            Assert.That(plan.Find("fairing").KitId, Is.EqualTo("fairing_reusable_large"));
        }

        [Test]
        public void Resolver_KnownFairingAliasMapsToTheKitId()
        {
            Assert.That(KitResolver.KitIdFor("fairing_large_reusable"), Is.EqualTo("fairing_reusable_large"));
            Assert.That(KitResolver.KitIdFor("fairing_reusable_large"), Is.EqualTo("fairing_reusable_large"));
        }

        [Test]
        public void Resolver_PartialBuildNeverThrowsAndGrows()
        {
            GameCatalog catalog = TestCatalog.Catalog;
            BuildState build = BuildState.New("C1", TestCatalog.Seed);
            int previous = 0;
            foreach (string slot in new[] { Slots.Fairing, Slots.UpperStageEngine, Slots.UpperStageTank, Slots.StageSeparation, Slots.FirstStageEngine, Slots.FirstStageTank })
            {
                build = build.WithChoice(slot, TestCatalog.C1Small().Choice(slot));
                KitPlan plan = KitResolver.Resolve(build, catalog, _library);
                Assert.That(plan.Steps.Count, Is.GreaterThan(previous), "adding " + slot + " did not grow the vehicle");
                previous = plan.Steps.Count;
            }
        }

        [TestCase("C1Small", 9, 0)]
        [TestCase("MidThreeEngine", 3, 0)]
        [TestCase("HeavyWithStrapOns", 5, 2)]
        public void SeededBuild_AssemblesWithEveryRingWithin3mm(string name, int firstEngines, int boosters)
        {
            BuildState build = name == "C1Small" ? TestCatalog.C1Small()
                : name == "MidThreeEngine" ? TestCatalog.MidThreeEngine()
                : TestCatalog.HeavyWithStrapOns();
            var parent = new GameObject("test-" + name);
            _spawned.Add(parent);

            VehicleRig rig = VehicleAssembler.Build(build, TestCatalog.Catalog, _library, parent.transform);

            Assert.That(rig.Missing, Is.Empty, "missing: " + string.Join(", ", rig.Missing));
            Assert.That(rig.Stages.Count, Is.EqualTo(2));
            Assert.That(rig.Stages[0].Engines.Count, Is.EqualTo(firstEngines));
            Assert.That(rig.Boosters.Count, Is.EqualTo(boosters));
            Assert.That(rig.FairingHalves.Count, Is.EqualTo(2), "fairing halves");
            Assert.That(rig.PayloadRoot, Is.Not.Null);
            Assert.That(rig.Interstage, Is.Not.Null);
            foreach (EngineRig e in rig.Stages[0].Engines)
            {
                Assert.That(e.NozzleExit, Is.Not.Null);
                Assert.That(e.GimbalPivot, Is.Not.Null);
            }

            List<JointMeasure> joints = VehicleAssembler.MeasureJoints(rig);
            Assert.That(joints.Count, Is.GreaterThan(5));
            foreach (JointMeasure j in joints)
            {
                Assert.That(Mathf.Abs(j.GapM), Is.LessThanOrEqualTo(RingToleranceM), j.ToString());
                Assert.That(j.RingMismatchM, Is.LessThanOrEqualTo(RingToleranceM), j.ToString());
            }

            // Lowest point on the rig origin, height matches the geometry.
            Bounds b = VehicleAssembler.RendererBounds(rig.Root);
            Assert.That(b.min.y, Is.EqualTo(0f).Within(RingToleranceM), "lowest point");
            Assert.That(b.size.y, Is.EqualTo(rig.LengthM).Within(0.01f), "LengthM");
            TestContext.WriteLine(name + ": " + rig.LengthM.ToString("0.00") + " m, " + joints.Count + " joints");
        }
    }
}
