using System;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Payload of <c>flight.hud</c> (protocol/messages.md): the same numbers as the host HUD, in the protocol's units.
    /// Field names are the wire names.
    /// </summary>
    [Serializable]
    public sealed class FlightHudMessage
    {
        public double metS;
        public double altitudeKm;
        public double velocityMs;
        public double verticalSpeedMs;
        public double qKpa;
        public double gLoad;
        public double throttlePct;
        public double propellantPct;
        public double dvRemainingMs;
        public double? apoapsisKm;
        public double? periapsisKm;
        public double heatLoadPct;
        public double warp;

        /// <summary>Protocol: velocity is surface-relative below 70 km and orbital above (game_value switch, Core's).</summary>
        public const double OrbitalVelocityAboveM = 70000;

        public static FlightHudMessage From(FlightTelemetry t)
        {
            double prop = t.stageIndex < t.stagePropellant01.Length ? t.stagePropellant01[t.stageIndex] : 0;
            return new FlightHudMessage
            {
                metS = Round(t.metS, 2),
                altitudeKm = Round(FlightUnits.MetresToKm(t.altitudeM), 3),
                velocityMs = Round(Math.Max(0, t.altitudeM < OrbitalVelocityAboveM ? t.surfaceSpeedMs : t.orbitalSpeedMs), 1),
                verticalSpeedMs = Round(t.verticalSpeedMs, 1),
                qKpa = Round(Math.Max(0, FlightUnits.PascalToKpa(t.dynamicPressurePa)), 2),
                gLoad = Round(t.gLoad, 2),
                throttlePct = Round(Clamp(FlightUnits.FractionToPercent(t.throttle01), 0, 100), 1),
                propellantPct = Round(Clamp(FlightUnits.FractionToPercent(prop), 0, 100), 1),
                dvRemainingMs = Round(Math.Max(0, t.deltaVRemainingMs), 1),
                apoapsisKm = t.HasApoapsis ? Round(FlightUnits.MetresToKm(t.apoapsisM), 2) : (double?)null,
                periapsisKm = t.HasPeriapsis ? Round(FlightUnits.MetresToKm(t.periapsisM), 2) : (double?)null,
                heatLoadPct = Round(Math.Max(0, FlightUnits.FractionToPercent(t.heatLoad01)), 1),
                warp = Clamp(t.warp, 0, 1000),
            };
        }

        private static double Round(double v, int digits) => Math.Round(v, digits);
        private static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;
    }
}
