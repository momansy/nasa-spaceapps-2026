using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace MissionForge.UI.Tests
{
    public class SvgPathTests
    {
        private const float Eps = 1e-3f;

        private static void AssertPoint(Vector2 expected, Vector2 actual, string what)
        {
            Assert.That(Vector2.Distance(expected, actual), Is.LessThan(Eps), $"{what}: expected {expected}, got {actual}");
        }

        [Test]
        public void Arc_EndsExactlyAtEndpoint_AndBulgesUpForSweepOne()
        {
            SvgPath path = SvgPath.Parse("M 0 0 A 10 10 0 0 1 20 0");

            Assert.AreEqual(3, path.Count, "MoveTo + two 90 degree cubic segments");
            Assert.AreEqual(SvgCommandType.MoveTo, path[0].Type);
            Assert.AreEqual(SvgCommandType.CubicTo, path[1].Type);
            Assert.AreEqual(SvgCommandType.CubicTo, path[2].Type);
            AssertPoint(new Vector2(10f, -10f), path[1].End, "arc midpoint (y down, sweep 1)");
            AssertPoint(new Vector2(20f, 0f), path[2].End, "arc end");
        }

        [Test]
        public void Arc_SweepZero_BulgesDown()
        {
            SvgPath path = SvgPath.Parse("M0 0A10 10 0 0 0 20 0");
            AssertPoint(new Vector2(10f, 10f), path[1].End, "arc midpoint");
            AssertPoint(new Vector2(20f, 0f), path[path.Count - 1].End, "arc end");
        }

        [Test]
        public void Arc_RadiusTooSmall_IsScaledUpToSpanEndpoints()
        {
            SvgPath path = SvgPath.Parse("M0 0A1 1 0 0 1 20 0");
            AssertPoint(new Vector2(10f, -10f), path[1].End, "scaled arc midpoint");
            AssertPoint(new Vector2(20f, 0f), path[path.Count - 1].End, "arc end");
        }

        [Test]
        public void Arc_ZeroRadius_BecomesLine()
        {
            SvgPath path = SvgPath.Parse("M0 0A0 5 0 0 1 20 0");
            Assert.AreEqual(2, path.Count);
            Assert.AreEqual(SvgCommandType.LineTo, path[1].Type);
            AssertPoint(new Vector2(20f, 0f), path[1].End, "line end");
        }

        [Test]
        public void Arc_CompactFlagsAndRelativeEndpoint_Parse()
        {
            SvgPath path = SvgPath.Parse("M0 0a10 10 0 0120 0");
            AssertPoint(new Vector2(20f, 0f), path[path.Count - 1].End, "arc end");
        }

        [Test]
        public void Arc_FullCircleFromTwoHalves_HasExpectedBounds()
        {
            SvgPath path = SvgPath.Parse("M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12Z");
            Assert.IsTrue(path.TryGetBounds(out Vector2 min, out Vector2 max));
            AssertPoint(new Vector2(2f, 2f), min, "min");
            AssertPoint(new Vector2(22f, 22f), max, "max");
        }

        [Test]
        public void Numbers_CompactForms_Parse()
        {
            SvgPath path = SvgPath.Parse("M1.5.5L-.5-1e1l10-5");
            AssertPoint(new Vector2(1.5f, 0.5f), path[0].A, "1.5.5");
            AssertPoint(new Vector2(-0.5f, -10f), path[1].A, "-.5-1e1");
            AssertPoint(new Vector2(9.5f, -15f), path[2].A, "relative 10-5");
        }

        [Test]
        public void ImplicitRepeats_AfterMoveTo_BecomeLineTo()
        {
            SvgPath abs = SvgPath.Parse("M0 0 10 0 10 10");
            Assert.AreEqual(SvgCommandType.MoveTo, abs[0].Type);
            Assert.AreEqual(SvgCommandType.LineTo, abs[1].Type);
            Assert.AreEqual(SvgCommandType.LineTo, abs[2].Type);
            AssertPoint(new Vector2(10f, 10f), abs[2].A, "absolute implicit L");

            SvgPath rel = SvgPath.Parse("m1 1 2 2");
            AssertPoint(new Vector2(1f, 1f), rel[0].A, "first m is absolute");
            Assert.AreEqual(SvgCommandType.LineTo, rel[1].Type);
            AssertPoint(new Vector2(3f, 3f), rel[1].A, "implicit relative l");
        }

        [Test]
        public void RelativeHV_AndCommandAfterClose_StartFromSubpathStart()
        {
            SvgPath path = SvgPath.Parse("M5 5h2v2zl1 0");
            AssertPoint(new Vector2(7f, 5f), path[1].A, "h");
            AssertPoint(new Vector2(7f, 7f), path[2].A, "v");
            Assert.AreEqual(SvgCommandType.Close, path[3].Type);
            Assert.AreEqual(SvgCommandType.MoveTo, path[4].Type, "implicit move after Z");
            AssertPoint(new Vector2(5f, 5f), path[4].A, "subpath start");
            AssertPoint(new Vector2(6f, 5f), path[5].A, "l after z");
        }

        [Test]
        public void SmoothCubic_ReflectsPreviousControlPoint()
        {
            SvgPath path = SvgPath.Parse("M0 0C0 10 10 10 10 0S20-10 20 0");
            Assert.AreEqual(SvgCommandType.CubicTo, path[2].Type);
            AssertPoint(new Vector2(10f, -10f), path[2].A, "reflected control");
            AssertPoint(new Vector2(20f, 0f), path[2].C, "end");

            SvgPath noPrev = SvgPath.Parse("M3 4s1 1 2 0");
            AssertPoint(new Vector2(3f, 4f), noPrev[1].A, "S without C uses current point");
        }

        [Test]
        public void SmoothQuadratic_ReflectsPreviousControlPoint()
        {
            SvgPath path = SvgPath.Parse("M0 0Q5 10 10 0T20 0");
            Assert.AreEqual(SvgCommandType.QuadTo, path[2].Type);
            AssertPoint(new Vector2(15f, -10f), path[2].A, "reflected control");
            AssertPoint(new Vector2(20f, 0f), path[2].B, "end");
        }

        [Test]
        public void TinyStroke_IsReplacedByDot()
        {
            SvgPath path = SvgPath.Parse(new[] { "M12 16v.01", "M3 3h4" });
            Assert.AreEqual(SvgCommandType.Dot, path[0].Type);
            AssertPoint(new Vector2(12f, 16.005f), path[0].A, "dot centre");
            Assert.AreEqual(SvgCommandType.MoveTo, path[1].Type);
        }

        [Test]
        public void EmptyData_ParsesToNothing()
        {
            Assert.AreEqual(0, SvgPath.Parse("").Count);
            Assert.AreEqual(0, SvgPath.Parse(" ,\n").Count);
        }

        [TestCase("L1 1")]
        [TestCase("Z")]
        [TestCase("M0")]
        [TestCase("M0 0 L x")]
        [TestCase("M0 0Z 1 1")]
        [TestCase("M0 0A10 10 0 2 1 20 0")]
        public void InvalidData_ThrowsFormatException(string d)
        {
            Assert.Throws<FormatException>(() => SvgPath.Parse(d));
        }
    }

    public class LucideIconTests
    {
        // The subset requested by T031 (VISUAL_TARGET.md 3.1), using the names in the brief.
        private static readonly string[] RequestedNames =
        {
            "check", "x", "circle", "circle-check", "triangle-alert", "octagon-x", "circle-dot",
            "circle-alert", "info", "signal", "wifi", "wifi-off", "users", "user", "user-plus",
            "qr-code", "settings", "book-open", "rocket", "play", "pause", "chevron-right",
            "chevron-left", "chevron-up", "chevron-down", "arrow-up", "arrow-down", "arrow-right",
            "clock", "timer", "hourglass", "git-compare", "expand", "ruler", "crosshair", "lock",
            "lock-open", "gauge", "flag", "zap", "satellite", "radio", "eye", "eye-off", "loader",
            "sparkles", "dollar-sign", "calendar", "calendar-clock", "weight", "fuel", "sun",
            "contrast", "type", "languages", "smartphone", "monitor", "wrench", "layers", "vote",
            "hand", "crown", "star", "award", "target", "orbit", "globe", "battery", "cpu",
            "thermometer", "wind", "mountain", "flame", "shield", "shield-check", "trending-up",
            "trending-down", "minus", "plus", "ellipsis", "list-checks", "construction", "package",
            "cable", "scan-line", "link",
        };

        [Test]
        public void EveryIcon_ParsesToFiniteCommandsInsideViewBox()
        {
            int checkedIcons = 0;
            foreach (string name in LucideIcons.Names)
            {
                Assert.IsTrue(LucideIcons.TryGetPath(name, out SvgPath path), $"{name} failed to parse");
                Assert.GreaterOrEqual(path.Count, 1, $"{name} has no commands");
                for (int i = 0; i < path.Count; i++)
                {
                    SvgCommand c = path[i];
                    for (int k = 0; k < c.PointCount; k++)
                    {
                        Vector2 p = c.GetPoint(k);
                        Assert.IsFalse(float.IsNaN(p.x) || float.IsNaN(p.y) || float.IsInfinity(p.x) || float.IsInfinity(p.y),
                            $"{name}: non-finite point {p}");
                        Assert.That(p.x, Is.InRange(-2f, 26f), $"{name}: x out of range in {c}");
                        Assert.That(p.y, Is.InRange(-2f, 26f), $"{name}: y out of range in {c}");
                    }
                }
                checkedIcons++;
            }
            Assert.AreEqual(RequestedNames.Length, checkedIcons);
        }

        [Test]
        public void EveryRequestedName_Resolves()
        {
            var missing = new List<string>();
            foreach (string name in RequestedNames)
            {
                if (!LucideIcons.Contains(name)) missing.Add(name);
            }
            Assert.IsEmpty(missing, "unresolved: " + string.Join(", ", missing));
        }

        [TestCase("check", "check")]
        [TestCase("warn", "triangle-exclamation-point")]
        [TestCase("cross", "x")]
        [TestCase("ring", "circle")]
        [TestCase("signal", "signal")]
        [TestCase("meets", "circle-check")]
        [TestCase("marginal", "triangle-exclamation-point")]
        [TestCase("fails", "octagon-x")]
        [TestCase("triangle-alert", "triangle-exclamation-point")]
        [TestCase("circle-alert", "circle-exclamation-point")]
        [TestCase("unlock", "lock-open")]
        [TestCase("more-horizontal", "ellipsis")]
        public void LegacyStatusAndUpstreamAliases_Resolve(string alias, string expected)
        {
            Assert.AreEqual(expected, LucideIcons.Resolve(alias));
            Assert.IsTrue(LucideIcons.TryGetPath(alias, out SvgPath path));
            Assert.Greater(path.Count, 0);
        }

        [Test]
        public void EveryAlias_PointsAtAnExistingIcon()
        {
            foreach (string alias in LucideIcons.AliasNames)
            {
                Assert.IsNotNull(LucideIcons.Resolve(alias), alias);
                Assert.IsTrue(LucideIcons.TryGetPath(alias, out _), alias);
            }
        }

        [Test]
        public void StatusShapes_AreDistinctIcons()
        {
            Assert.AreNotEqual(LucideIcons.Resolve("meets"), LucideIcons.Resolve("marginal"));
            Assert.AreNotEqual(LucideIcons.Resolve("marginal"), LucideIcons.Resolve("fails"));
            Assert.AreNotEqual(LucideIcons.Resolve("meets"), LucideIcons.Resolve("fails"));
        }

        [Test]
        public void UnknownOrEmptyName_DoesNotResolve()
        {
            Assert.IsNull(LucideIcons.Resolve("definitely-not-an-icon"));
            Assert.IsNull(LucideIcons.Resolve(""));
            Assert.IsNull(LucideIcons.Resolve(null));
            Assert.IsFalse(LucideIcons.TryGetPath("definitely-not-an-icon", out SvgPath path));
            Assert.IsNull(path);
        }

        [Test]
        public void TryGetPath_ReturnsCachedInstance()
        {
            Assert.IsTrue(LucideIcons.TryGetPath("rocket", out SvgPath first));
            Assert.IsTrue(LucideIcons.TryGetPath("rocket", out SvgPath second));
            Assert.AreSame(first, second);
        }

        [Test]
        public void QrCode_DotsBecomeDotCommands()
        {
            Assert.IsTrue(LucideIcons.TryGetPath("qr-code", out SvgPath path));
            int dots = 0;
            for (int i = 0; i < path.Count; i++)
            {
                if (path[i].Type == SvgCommandType.Dot) dots++;
            }
            Assert.Greater(dots, 0);
        }
    }

    public class MfIconTests
    {
        [Test]
        public void Defaults_AreBackwardsCompatible()
        {
            var icon = new MfIcon();
            Assert.AreEqual("dot", icon.kind);
            Assert.AreEqual(26f, icon.style.width.value.value);
            Assert.AreEqual(26f, icon.style.height.value.value);
            Assert.AreEqual(PickingMode.Ignore, icon.pickingMode);
            Assert.IsTrue(icon.ClassListContains(MfIcon.ussClassName));
            Assert.IsFalse(icon.HasTint);
        }

        [TestCase(24, 24f)]
        [TestCase(32, 32f)]
        [TestCase(48, 48f)]
        public void Size_SetsWidthAndHeight(int size, float expected)
        {
            var icon = new MfIcon { size = size };
            Assert.AreEqual(expected, icon.style.width.value.value);
            Assert.AreEqual(expected, icon.style.height.value.value);

            icon.size = 0;
            Assert.AreEqual(26f, icon.style.width.value.value, "size 0 restores the default");
        }

        [Test]
        public void Tint_IsExplicitUntilCleared()
        {
            var icon = new MfIcon { kind = "check", Tint = Color.red };
            Assert.IsTrue(icon.HasTint);
            Assert.AreEqual(Color.red, icon.Tint);
            icon.ClearTint();
            Assert.IsFalse(icon.HasTint);
        }

        [TestCase("check")]
        [TestCase("warn")]
        [TestCase("cross")]
        [TestCase("ring")]
        [TestCase("signal")]
        [TestCase("dot")]
        [TestCase("meets")]
        [TestCase("marginal")]
        [TestCase("fails")]
        [TestCase("rocket")]
        public void KnownKinds_DoNotWarn(string kind)
        {
            var icon = new MfIcon { kind = kind };
            Assert.AreEqual(kind, icon.kind);
            LogAssert.NoUnexpectedReceived();
        }

        [Test]
        public void UnknownKind_WarnsOnce()
        {
            string kind = "no-such-icon-" + Guid.NewGuid().ToString("N");
            LogAssert.Expect(LogType.Warning, new Regex("Unknown icon kind '" + kind + "'"));
            _ = new MfIcon { kind = kind };
            var second = new MfIcon { kind = kind };
            Assert.AreEqual(kind, second.kind);
            LogAssert.NoUnexpectedReceived();
        }
    }
}
