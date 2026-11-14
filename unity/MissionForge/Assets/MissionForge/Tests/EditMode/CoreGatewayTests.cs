using System.Collections.Generic;
using MissionForge.App;
using MissionForge.Core.Build;
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
        public void DefaultGateway_IsBoundToTheCorePackage()
        {
            Assert.That(CoreGateway.Current, Is.InstanceOf<MissionForgeCoreGateway>());
            Assert.That(CoreGateway.Current.IsAvailable, Is.True);
        }

        [Test]
        public void IdealDeltaV_ForKnownStage_MatchesTheRocketEquation()
        {
            double deltaV = CoreGateway.Current.IdealDeltaVMs(311.0, 100000.0, 20000.0);

            Assert.That(deltaV, Is.EqualTo(ExpectedDeltaVMs).Within(ToleranceMs));
        }

        [Test]
        public void IdealDeltaV_IsExactlyWhatCoreComputes()
        {
            double viaGateway = new MissionForgeCoreGateway().IdealDeltaVMs(348.0, 25000.0, 4000.0);

            Assert.That(viaGateway, Is.EqualTo(RocketEquation.DeltaVMs(348.0, 25000.0, 4000.0)));
        }

        /// <summary>Known case (physical): 1 000 000 N / (50 000 kg · 9.80665 m/s²) = 2.0394.</summary>
        [Test]
        public void LiftoffTwr_ForKnownVehicle_MatchesCore()
        {
            Assert.That(CoreGateway.Current.LiftoffTwr(1000000.0, 50000.0), Is.EqualTo(2.0394).Within(0.0001));
        }

        [Test]
        public void IdealDeltaV_WithInvalidMass_IsRejectedByCore()
        {
            Assert.That(() => CoreGateway.Current.IdealDeltaVMs(311.0, 10000.0, 20000.0),
                Throws.TypeOf<System.ArgumentOutOfRangeException>());
        }

        [Test]
        public void LoadCatalog_KeepsTheFiles()
        {
            var gateway = new MissionForgeCoreGateway();
            gateway.LoadCatalog(new Dictionary<string, string> { { "contracts.json", "{}" }, { "roles.json", "{}" } });

            Assert.That(gateway.CatalogFileCount, Is.EqualTo(2));
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
