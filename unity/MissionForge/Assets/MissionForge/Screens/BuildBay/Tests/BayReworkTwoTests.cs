using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>T034 rework 2: tag spreading (U11), the unscaled umbilical arm end (M3) and the framing constants (U7).</summary>
    public sealed class BayReworkTwoTests
    {
        [Test]
        public void SpreadTops_PushesOverlappingTagOnSameSideBelowItsNeighbour()
        {
            // Arrange: "Payload" and "Upper stage tanks" both on the right, 8 px apart, 30 px tall.
            var tags = new List<(bool left, float top, float height)> { (false, 560f, 30f), (false, 568f, 30f) };

            // Act
            List<float> tops = BuildBayScreen.SpreadTops(tags, 4f);

            // Assert
            Assert.That(tops[0], Is.EqualTo(560f));
            Assert.That(tops[1], Is.EqualTo(594f), "second tag starts after the first tag's height plus the gap");
        }

        [Test]
        public void SpreadTops_LeavesTagsOnOppositeSidesAndSeparatedTagsAlone()
        {
            // Arrange
            var tags = new List<(bool left, float top, float height)>
            {
                (true, 300f, 30f), (false, 305f, 30f), (true, 400f, 30f),
            };

            // Act
            List<float> tops = BuildBayScreen.SpreadTops(tags, 4f);

            // Assert
            Assert.That(tops, Is.EqualTo(new List<float> { 300f, 305f, 400f }));
        }

        [Test]
        public void SpreadTops_KeepsInputOrderWhenTagsArriveUnsorted()
        {
            // Arrange: the lower tag is listed first.
            var tags = new List<(bool left, float top, float height)> { (false, 510f, 30f), (false, 500f, 30f) };

            // Act
            List<float> tops = BuildBayScreen.SpreadTops(tags, 4f);

            // Assert
            Assert.That(tops[1], Is.EqualTo(500f), "the upper tag keeps its place");
            Assert.That(tops[0], Is.EqualTo(534f), "the lower tag moves below it");
        }

        [TestCase(0.5f, 2f)]
        [TestCase(1f, 1f)]
        [TestCase(2.5f, 0.4f)]
        public void CompensatingScale_CancelsTheArmStretch(float parentScaleX, float expected)
        {
            Assert.That(BayArmEnd.CompensatingScale(parentScaleX), Is.EqualTo(expected).Within(1e-5f));
            Assert.That(parentScaleX * BayArmEnd.CompensatingScale(parentScaleX), Is.EqualTo(1f).Within(1e-5f));
        }

        [Test]
        public void CompensatingScale_IsBoundedForADegenerateArm()
        {
            Assert.That(BayArmEnd.CompensatingScale(0f), Is.EqualTo(20f).Within(1e-4f));
        }

        [Test]
        public void ArmEnd_SitsAtTheArmTipAtTrueSize_UnderAStretchedArm()
        {
            // Arrange
            var arm = new GameObject("Arm");
            var end = new GameObject("End");
            try
            {
                arm.transform.localScale = new Vector3(1.7f, 1f, 1f);
                end.transform.SetParent(arm.transform, false);
                var c = end.AddComponent<BayArmEnd>();

                // Act (LateUpdate does not run in EditMode; call it through reflection like the player would)
                typeof(BayArmEnd).GetMethod("LateUpdate", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                    .Invoke(c, null);

                // Assert
                Assert.That(end.transform.lossyScale.x, Is.EqualTo(1f).Within(1e-4f));
                Assert.That(end.transform.position.x, Is.EqualTo(1.7f * LaunchPadRig.ArmModelLengthM).Within(1e-3f));
            }
            finally
            {
                Object.DestroyImmediate(arm);
            }
        }

        [Test]
        public void SmallFairing_FillsAtLeastFifteenPercentOfTheScreen_AtTheMinimumFraming()
        {
            // A landed 1.5 m small fairing is framed at MinFramedHeightM inside the 200-760 px band of 1080.
            float band = BayFraming.DefaultBottomFrac - BayFraming.DefaultTopFrac;
            float share = 1.5f / BayStage.MinFramedHeightM * band;
            Assert.That(share, Is.GreaterThanOrEqualTo(0.15f));
        }

        [TestCase(5f, 0f)]
        [TestCase(8f, 0f)]
        public void EyeFracFor_ShortStack_PutsTheEyeAboveTheTableTop(float framedHeightM, float drop)
        {
            float eye = BayStage.EyeFracFor(framedHeightM, drop) * framedHeightM;
            Assert.That(eye, Is.GreaterThanOrEqualTo(BayStage.MountTableAboveMountM + 2.5f - 1e-4f));
        }

        [Test]
        public void EyeFracFor_TallStack_KeepsTheLowHeroEye()
        {
            Assert.That(BayStage.EyeFracFor(45f, 0f), Is.EqualTo(BayFraming.DefaultEyeFrac).Within(1e-5f));
        }

        [Test]
        public void EyeFracFor_PadShot_PutsTheEyeAboveTheTableTop()
        {
            const float drop = 8.5f;   // mount 10.5 m above grade, deck 2 m
            float eyeAboveBase = BayStage.EyeFracFor(BayStage.PadShotHeightM, drop) * BayStage.PadShotHeightM;
            Assert.That(eyeAboveBase - drop, Is.GreaterThanOrEqualTo(BayStage.MountTableAboveMountM + 2.5f - 1e-4f));
        }

        [Test]
        public void PadShot_FramesTheWholeTableWithRoomAbove()
        {
            // The table top is 10 m above the deck (build_hero_pad.py MOUNT_TOP 12 m - DECK_H 2 m).
            Assert.That(BayStage.PadShotHeightM, Is.GreaterThan(10f + 4.7f * BayStage.StandInScale));
        }
    }
}
