using System;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>Summary of a deterministic simplified ballistic atmospheric entry.</summary>
    public sealed class EntryProfileResult
    {
        internal EntryProfileResult(double peakHeatFluxWm2, double heatLoadJm2, double peakGLoadUnitless,
            double terminalSpeedMs, double durationS)
        {
            PeakHeatFluxWm2 = peakHeatFluxWm2;
            HeatLoadJm2 = heatLoadJm2;
            PeakGLoadUnitless = peakGLoadUnitless;
            TerminalSpeedMs = terminalSpeedMs;
            DurationS = durationS;
        }
        public double PeakHeatFluxWm2 { get; }
        public double HeatLoadJm2 { get; }
        public double PeakGLoadUnitless { get; }
        public double TerminalSpeedMs { get; }
        public double DurationS { get; }
    }

    /// <summary>Fixed-flight-path-angle entry model used by the mission phase driver.</summary>
    public static class EntryProfile
    {
        /// <summary>
        /// Simulates from 120 km to dense atmosphere with a fixed path angle. Ballistic coefficient
        /// is kg/m² and nose radius is m. The fixed angle is a disclosed game_value simplification.
        /// </summary>
        public static EntryProfileResult Simulate(Body body, double entrySpeedMs, double noseRadiusM,
            double ballisticCoefficientKgM2 = 350, double flightPathAngleRad = -0.10471975511965977)
        {
            if (body == null) throw new ArgumentNullException(nameof(body));
            FlightGuard.Positive(entrySpeedMs, nameof(entrySpeedMs));
            FlightGuard.Positive(noseRadiusM, nameof(noseRadiusM));
            FlightGuard.Positive(ballisticCoefficientKgM2, nameof(ballisticCoefficientKgM2));
            FlightGuard.Range(flightPathAngleRad, -Math.PI / 2, -0.001, nameof(flightPathAngleRad));
            const double stepS = 0.05; // game_value integration step
            var altitudeM = PhysicalConstants.EntryInterfaceAltitudeM;
            var speedMs = entrySpeedMs;
            var heatLoadJm2 = 0.0;
            var previousHeatFluxWm2 = 0.0;
            var peakHeatFluxWm2 = 0.0;
            var peakGLoadUnitless = 0.0;
            var durationS = 0.0;
            while (altitudeM > 0 && speedMs > 100 && durationS < 2000)
            {
                var densityKgM3 = body.DensityKgM3(altitudeM);
                var dragAccelerationMs2 = 0.5 * densityKgM3 * speedMs * speedMs / ballisticCoefficientKgM2;
                var heatFluxWm2 = EntryPhysics.HeatFluxWm2(densityKgM3, noseRadiusM, speedMs);
                heatLoadJm2 = EntryPhysics.IntegrateHeatLoadJm2(heatLoadJm2, previousHeatFluxWm2, heatFluxWm2, stepS);
                peakHeatFluxWm2 = Math.Max(peakHeatFluxWm2, heatFluxWm2);
                peakGLoadUnitless = Math.Max(peakGLoadUnitless, dragAccelerationMs2 / PhysicalConstants.StandardGravityMs2);
                var gravityAlongPathMs2 = -body.GravityMs2(body.RadiusM + Math.Max(0, altitudeM)) * Math.Sin(flightPathAngleRad);
                speedMs = Math.Max(0, speedMs + (gravityAlongPathMs2 - dragAccelerationMs2) * stepS);
                altitudeM += speedMs * Math.Sin(flightPathAngleRad) * stepS;
                previousHeatFluxWm2 = heatFluxWm2;
                durationS += stepS;
            }
            return new EntryProfileResult(peakHeatFluxWm2, heatLoadJm2, peakGLoadUnitless, speedMs, durationS);
        }
    }
}
