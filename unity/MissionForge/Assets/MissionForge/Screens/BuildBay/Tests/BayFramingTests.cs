using NUnit.Framework;
using UnityEngine;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>T034 step 5: the vehicle fills 45–60 % of the screen height in the free column at every stack height.</summary>
    public sealed class BayFramingTests
    {
        private const float Fov = 30f;
        private const float Aspect = 16f / 9f;
        private static readonly Vector3 Base = new Vector3(0f, 10.5f, -8000f);

        [TestCase(8f)]
        [TestCase(12f)]
        [TestCase(24f)]
        [TestCase(45f)]
        [TestCase(70f)]
        [TestCase(110f)]
        public void Solve_PutsTheStackInTheBand(float height)
        {
            // A slender stack (half width a quarter of its height, at most 6 m) is height-bound, not width-bound.
            var shot = new BayShot(Base, height, Mathf.Min(6f, height * 0.25f), -14f);
            BayFrameLayout layout = BayFraming.DefaultLayout(Fov, Aspect);

            Pose pose = BayFraming.Solve(shot, layout);

            float top = BayFraming.ScreenFracY(pose, Base + Vector3.up * height, Fov);
            float bottom = BayFraming.ScreenFracY(pose, Base, Fov);
            Assert.That(top, Is.EqualTo(BayFraming.DefaultTopFrac).Within(0.002f));
            Assert.That(bottom, Is.EqualTo(BayFraming.DefaultBottomFrac).Within(0.002f));
            Assert.That(bottom - top, Is.InRange(0.45f, 0.60f));
            Assert.That(BayFraming.ScreenFracX(pose, Base + Vector3.up * (height * 0.5f), Fov, Aspect), Is.EqualTo(0.5f).Within(0.002f));
        }

        [Test]
        public void Solve_BacksOffForAWideSubjectAndKeepsItInTheColumn()
        {
            var shot = new BayShot(Base, 60f, 40f, -14f);
            BayFrameLayout layout = BayFraming.DefaultLayout(Fov, Aspect);

            Pose pose = BayFraming.Solve(shot, layout);

            Vector3 right = Quaternion.Euler(0f, -14f, 0f) * Vector3.right;
            float xRight = BayFraming.ScreenFracX(pose, Base + Vector3.up * 30f + right * 40f, Fov, Aspect);
            Assert.That(xRight, Is.LessThanOrEqualTo(0.5f + BayFraming.DefaultHalfColumnFrac + 0.01f));
            float top = BayFraming.ScreenFracY(pose, Base + Vector3.up * 60f, Fov);
            float bottom = BayFraming.ScreenFracY(pose, Base, Fov);
            Assert.That(0.5f * (top + bottom), Is.EqualTo(0.5f * (BayFraming.DefaultTopFrac + BayFraming.DefaultBottomFrac)).Within(0.01f));
        }

        [Test]
        public void Solve_PunchInMovesCloserAlongTheSameView()
        {
            var shot = new BayShot(Base, 60f, 6f, -14f);
            BayFrameLayout layout = BayFraming.DefaultLayout(Fov, Aspect);

            Pose wide = BayFraming.Solve(shot, layout);
            Pose close = BayFraming.Solve(shot, layout, 0.85f);

            float dWide = Vector3.Distance(new Vector3(wide.position.x, 0f, wide.position.z), new Vector3(Base.x, 0f, Base.z));
            float dClose = Vector3.Distance(new Vector3(close.position.x, 0f, close.position.z), new Vector3(Base.x, 0f, Base.z));
            Assert.That(dClose, Is.EqualTo(dWide * 0.85f).Within(0.01f * dWide));
        }

        [Test]
        public void PunchEnvelope_RisesHoldsAndReturnsToRest()
        {
            Assert.That(BayStage.PunchEnvelope(-1f), Is.EqualTo(0f));
            Assert.That(BayStage.PunchEnvelope(0f), Is.EqualTo(0f).Within(1e-5f));
            Assert.That(BayStage.PunchEnvelope(BayStage.PunchInS + BayStage.PunchHoldS * 0.5f), Is.EqualTo(1f));
            Assert.That(BayStage.PunchEnvelope(BayStage.PunchInS + BayStage.PunchHoldS + BayStage.PunchOutS + 0.01f), Is.EqualTo(0f));
        }

        [Test]
        public void SolveDistance_SubtendsTheRequestedAngle()
        {
            float d = BayFraming.SolveDistance(50f, -10f, 0.3f);

            Assert.That(Mathf.Atan2(50f, d) - Mathf.Atan2(-10f, d), Is.EqualTo(0.3f).Within(1e-4f));
        }
    }
}
