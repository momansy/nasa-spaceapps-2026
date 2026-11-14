using MissionForge.App;
using NUnit.Framework;

namespace MissionForge.Tests
{
    public sealed class CoreGatewayTests
    {
        /// <summary>
        /// Known case (physical): Δv = Isp · g0 · ln(m_wet / m_dry)
        /// = 311 s · 9.80665 m/s² · ln(100 000 kg / 20 000 kg) = 3049.868 · 1.6094379 = 4908.57 m/s.
        /// </summary>
        private const double ExpectedDeltaVMs = 4908.57;
        private const double ToleranceMs = 0.01;

        [Test]
        public void IdealDeltaV_ForKnownStage_MatchesTheRocketEquation()
        {
            ICoreGateway core = CoreGateway.Current;
            if (!core.IsAvailable)
            {
                Assert.Ignore("MissionForge.Core is not in this checkout yet (core/ was not on main during T001). " +
                              "This test runs as soon as a real ICoreGateway is bound.");
            }

            double deltaV = core.IdealDeltaVMs(311.0, 100000.0, 20000.0);

            Assert.That(deltaV, Is.EqualTo(ExpectedDeltaVMs).Within(ToleranceMs));
        }

        [Test]
        public void UnavailableGateway_RefusesToInventNumbers()
        {
            var gateway = new UnavailableCoreGateway();

            Assert.That(gateway.IsAvailable, Is.False);
            Assert.That(() => gateway.IdealDeltaVMs(311.0, 100000.0, 20000.0), Throws.TypeOf<System.NotSupportedException>());
        }

        [Test]
        public void Current_CannotBeSetToNull()
        {
            Assert.That(() => CoreGateway.Current = null, Throws.TypeOf<System.ArgumentNullException>());
        }
    }
}
