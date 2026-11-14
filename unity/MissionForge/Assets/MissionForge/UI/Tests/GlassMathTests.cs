using MissionForge.UI;
using NUnit.Framework;
using UnityEngine;

namespace MissionForge.UI.Tests
{
    public sealed class GlassMathTests
    {
        private const float Epsilon = 1e-3f;
        private static readonly Vector2 Panel = new Vector2(1920f, 1080f);

        private static void AssertUv(Vector2 expected, Vector2 actual)
        {
            Assert.That(actual.x, Is.EqualTo(expected.x).Within(Epsilon), "u");
            Assert.That(actual.y, Is.EqualTo(expected.y).Within(Epsilon), "v");
        }

        [Test]
        public void ScreenUv_TopLeftOfPanel_MapsToUv01()
        {
            Vector2 uv = GlassMath.ScreenUv(new Rect(0f, 0f, 400f, 300f), Panel, Vector2.zero);

            AssertUv(new Vector2(0f, 1f), uv);
        }

        [Test]
        public void ScreenUv_BottomRightOfPanel_MapsToUv10()
        {
            var bound = new Rect(1520f, 780f, 400f, 300f);

            Vector2 uv = GlassMath.ScreenUv(bound, Panel, new Vector2(400f, 300f));

            AssertUv(new Vector2(1f, 0f), uv);
        }

        [Test]
        public void ScreenUv_CentredPanel_MapsCornersAndCentre()
        {
            var bound = new Rect(760f, 340f, 400f, 400f);

            Vector2 centre = GlassMath.ScreenUv(bound, Panel, new Vector2(200f, 200f));
            Vector2 topLeft = GlassMath.ScreenUv(bound, Panel, Vector2.zero);
            Vector2 bottomRight = GlassMath.ScreenUv(bound, Panel, new Vector2(400f, 400f));

            AssertUv(new Vector2(0.5f, 0.5f), centre);
            AssertUv(new Vector2(760f / 1920f, 1f - 340f / 1080f), topLeft);
            AssertUv(new Vector2(1160f / 1920f, 1f - 740f / 1080f), bottomRight);
        }

        [Test]
        public void PanelToUv_PointOutsidePanel_IsClampedToUnitRange()
        {
            Vector2 uv = GlassMath.PanelToUv(new Vector2(-50f, 2000f), Panel);

            AssertUv(new Vector2(0f, 0f), uv);
        }

        [Test]
        public void PanelToUv_ZeroPanelSize_ReturnsZero()
        {
            Assert.That(GlassMath.PanelToUv(new Vector2(10f, 10f), Vector2.zero), Is.EqualTo(Vector2.zero));
        }

        [Test]
        public void FanCounts_SixSegments_Are29VerticesAnd84Indices()
        {
            Assert.That(GlassMath.FanVertexCount(6), Is.EqualTo(29));
            Assert.That(GlassMath.FanIndexCount(6), Is.EqualTo(84));
        }

        [Test]
        public void BuildRoundedRectFan_ReturnsExpectedVertexCountWithCentreFirst()
        {
            var rect = new Rect(10f, 20f, 300f, 200f);
            var output = new Vector2[GlassMath.FanVertexCount(6)];

            int count = GlassMath.BuildRoundedRectFan(rect, new Vector4(24f, 24f, 24f, 24f), 6, output);

            Assert.That(count, Is.EqualTo(29));
            Assert.That(output[0].x, Is.EqualTo(rect.center.x).Within(Epsilon));
            Assert.That(output[0].y, Is.EqualTo(rect.center.y).Within(Epsilon));
        }

        [TestCase(24f, 24f, 24f, 24f)]
        [TestCase(0f, 0f, 0f, 0f)]
        [TestCase(500f, 0f, 10f, 80f)]
        [TestCase(999f, 999f, 999f, 999f)]
        public void BuildRoundedRectFan_AllPointsInsideRect(float tl, float tr, float br, float bl)
        {
            var rect = new Rect(10f, 20f, 300f, 200f);
            var output = new Vector2[GlassMath.FanVertexCount(6)];

            int count = GlassMath.BuildRoundedRectFan(rect, new Vector4(tl, tr, br, bl), 6, output);

            Assert.That(count, Is.EqualTo(29));
            for (int i = 0; i < count; i++)
            {
                Vector2 p = output[i];
                Assert.That(p.x, Is.InRange(rect.xMin - Epsilon, rect.xMax + Epsilon), $"x of point {i}");
                Assert.That(p.y, Is.InRange(rect.yMin - Epsilon, rect.yMax + Epsilon), $"y of point {i}");
            }
        }

        [Test]
        public void BuildRoundedRectFan_ZeroRadii_HitsTheFourCorners()
        {
            var rect = new Rect(0f, 0f, 100f, 50f);
            var output = new Vector2[GlassMath.FanVertexCount(6)];

            GlassMath.BuildRoundedRectFan(rect, Vector4.zero, 6, output);

            // Each corner emits 7 coincident points; the first of each block is the corner.
            AssertUv(new Vector2(0f, 0f), output[1]);
            AssertUv(new Vector2(100f, 0f), output[8]);
            AssertUv(new Vector2(100f, 50f), output[15]);
            AssertUv(new Vector2(0f, 50f), output[22]);
        }

        [Test]
        public void BuildRoundedRectFan_PerimeterIsClockwiseOnScreen()
        {
            var rect = new Rect(0f, 0f, 300f, 200f);
            var output = new Vector2[GlassMath.FanVertexCount(6)];
            int count = GlassMath.BuildRoundedRectFan(rect, new Vector4(24f, 24f, 24f, 24f), 6, output);

            // Shoelace sum over the perimeter: positive means clockwise when Y points down.
            float area = 0f;
            for (int i = 1; i < count; i++)
            {
                Vector2 a = output[i];
                Vector2 b = output[i == count - 1 ? 1 : i + 1];
                area += a.x * b.y - b.x * a.y;
            }

            Assert.That(area, Is.GreaterThan(0f));
        }

        [Test]
        public void BuildRoundedRectFan_OutputTooSmall_ReturnsZero()
        {
            int count = GlassMath.BuildRoundedRectFan(new Rect(0f, 0f, 10f, 10f), Vector4.zero, 6, new Vector2[4]);

            Assert.That(count, Is.EqualTo(0));
        }

        [Test]
        public void ClampRadii_OversizedRadii_ScaleToFitShortestSide()
        {
            Vector4 r = GlassMath.ClampRadii(new Vector4(100f, 100f, 100f, 100f), new Vector2(300f, 100f));

            Assert.That(r.x, Is.EqualTo(50f).Within(Epsilon));
            Assert.That(r.z, Is.EqualTo(50f).Within(Epsilon));
        }

        [TestCase(100f, 100, 2, true)]
        [TestCase(99f, 100, 2, true)]
        [TestCase(98f, 100, 2, true)]
        [TestCase(97f, 100, 2, false)]
        [TestCase(0f, 100, 2, false)]
        [TestCase(150f, 100, 2, false)]
        public void IsFrameFresh_RespectsLagWindow(float stamp, int frame, int maxLag, bool expected)
        {
            Assert.That(GlassMath.IsFrameFresh(stamp, frame, maxLag), Is.EqualTo(expected));
        }
    }
}
