using NUnit.Framework;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>T031 motion: only plain numbers count up, and the count keeps Core's decimals, grouping and sign.</summary>
    public sealed class KpiCountUpTests
    {
        [TestCase("9,718", 9718.0, 0, true, false)]
        [TestCase("1.20", 1.2, 2, false, false)]
        [TestCase("-3.5", -3.5, 1, false, false)]
        [TestCase("−12", -12.0, 0, false, false)]
        [TestCase("+12", 12.0, 0, false, true)]
        [TestCase("98.5", 98.5, 1, false, false)]
        public void TryNumber_ParsesPlainNumbers(string value, double number, int decimals, bool grouped, bool plus)
        {
            bool ok = DashboardView.TryNumber(value, out double n, out int d, out bool g, out bool p);

            Assert.That(ok, Is.True);
            Assert.That(n, Is.EqualTo(number).Within(1e-9));
            Assert.That(d, Is.EqualTo(decimals));
            Assert.That(g, Is.EqualTo(grouped));
            Assert.That(p, Is.EqualTo(plus));
        }

        [TestCase("$6.0 M")]
        [TestCase("LEO")]
        [TestCase("1.2 ±0.1")]
        [TestCase("")]
        [TestCase(null)]
        public void TryNumber_RejectsAnythingElse(string value)
        {
            Assert.That(DashboardView.TryNumber(value, out _, out _, out _, out _), Is.False);
        }
    }
}
