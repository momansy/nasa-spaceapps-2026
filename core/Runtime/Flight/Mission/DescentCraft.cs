using System;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>
    /// Entry, parachute and terminal-burn physics for one descending craft (capsule, lander, booster).
    /// Physical: kernel drag, Sutton-Graves heating, g-load. game_value: blunt-body and parachute drag areas,
    /// blackout threshold, a constant-thrust terminal engine with no minimum throttle, no lift (ballistic entry).
    /// </summary>
    public sealed class DescentCraft
    {
        /// <summary>Hypersonic-to-subsonic drag coefficient of a blunt capsule (game_value; kernel table is rocket-like).</summary>
        public const double BluntBodyCd = 1.2;
        /// <summary>Heat flux above which radio blackout starts, W/m² (game_value).</summary>
        public const double BlackoutFluxWm2 = 2.0e5;
        /// <summary>Side-on heating multiplier when the shield is not held forward (game_value).</summary>
        public const double MisalignedHeatMultiplier = 3;
        /// <summary>Sea-level sink speeds the parachutes are sized for, m/s (game_value).</summary>
        /// <summary>Suicide-burn deceleration margin: plan to stop 30% sooner than the straight-line profile (game_value).</summary>
        public const double TerminalDecelerationMargin = 1.3;
        public const double DrogueDesignSpeedMs = 75, MainDesignSpeedMs = 7;
        /// <summary>Inflation (reefing) times of the drogue and main chutes, s (game_value); drag area ramps smoothly.</summary>
        public const double DrogueInflationS = 3, MainInflationS = 10;

        private readonly Body body;
        private readonly FlightDynamics dynamics;
        private readonly double areaM2, noseRadiusM, finalMassKg, bodyCdAM2, drogueCdAM2, mainCdAM2;
        private readonly EngineModel? engine;
        private double previousFluxWm2;
        private bool terminalLatched;
        private double ageS, drogueSinceS = double.NaN, mainSinceS = double.NaN;

        /// <param name="finalMassKg">Craft mass with its landing propellant burned, kg.</param>
        /// <param name="bodyCd">Body drag coefficient; null uses the blunt-body value.</param>
        public DescentCraft(Body body, double areaM2, double noseRadiusM, double finalMassKg,
            double shieldCapacityJm2, EngineModel? landingEngine, double bodyCd = BluntBodyCd)
        {
            this.body = body; dynamics = new FlightDynamics(body);
            this.areaM2 = areaM2; this.noseRadiusM = noseRadiusM; this.finalMassKg = finalMassKg;
            ShieldCapacityJm2 = shieldCapacityJm2; engine = landingEngine;
            bodyCdAM2 = bodyCd * areaM2;
            var g = PhysicalConstants.StandardGravityMs2;
            var rho0 = Body.Earth.SurfaceDensityKgM3;
            drogueCdAM2 = 2 * finalMassKg * g / (rho0 * DrogueDesignSpeedMs * DrogueDesignSpeedMs);
            mainCdAM2 = 2 * finalMassKg * g / (rho0 * MainDesignSpeedMs * MainDesignSpeedMs);
        }

        public double ShieldCapacityJm2 { get; }
        public double HeatFluxWm2 { get; private set; }
        public double HeatLoadJm2 { get; private set; }
        public double PeakHeatFluxWm2 { get; private set; }
        public double GLoadUnitless { get; private set; }
        public double PeakGLoadUnitless { get; private set; }
        public bool DrogueDeployed => !double.IsNaN(drogueSinceS);
        public bool MainDeployed => !double.IsNaN(mainSinceS);
        public void DeployDrogue() { if (!DrogueDeployed) drogueSinceS = ageS; }
        public void DeployMain() { if (!MainDeployed) mainSinceS = ageS; }
        private static double Inflation(double ageS, double sinceS, double durationS)
        {
            var f = Math.Min(1, Math.Max(0, (ageS - sinceS) / durationS));
            return f * f * (3 - 2 * f);
        }
        /// <summary>Shield held toward the flow; false multiplies the heating (game_value).</summary>
        public bool ShieldForward { get; set; } = true;
        public bool TerminalBurning { get; private set; }
        public double HeatLoadPercent => ShieldCapacityJm2 > 0 ? 100 * HeatLoadJm2 / ShieldCapacityJm2 : 0;

        public double AirSpeedMs(FlightState s)
        {
            var x = s.VelocityXMs + body.RotationRateRadS * s.PositionYM;
            var y = s.VelocityYMs - body.RotationRateRadS * s.PositionXM;
            return Math.Sqrt(x * x + y * y);
        }
        public double AltitudeM(FlightState s) => s.RadiusM - body.RadiusM;

        /// <summary>Throttle of the terminal engine for a landing at <paramref name="targetSpeedMs"/> (suicide-burn timing).</summary>
        public double TerminalThrottle(FlightState s, double targetSpeedMs)
        {
            if (engine == null || s.MassKg <= finalMassKg + 1e-6) return 0;
            var h = Math.Max(0.5, AltitudeM(s));
            var v = AirSpeedMs(s);
            var g = body.GravityMs2(s.RadiusM);
            var available = engine.ThrustN(body.PressureRatioUnitless(AltitudeM(s))) / s.MassKg;
            var needed = TerminalDecelerationMargin * (v > targetSpeedMs ? (v * v - targetSpeedMs * targetSpeedMs) / (2 * h) : 0) + g;
            if (!terminalLatched && needed < 0.9 * available) return 0; // game_value ignition margin
            terminalLatched = true;
            return Math.Max(0, Math.Min(1, needed / available));
        }

        /// <summary>Advances one fixed step; <paramref name="throttle"/> drives the terminal engine retrograde.</summary>
        public FlightState Step(FlightState s, double timeS, double throttle)
        {
            var airSpeed = AirSpeedMs(s);
            var altitude = AltitudeM(s);
            var tableCd = Aerodynamics.DragCoefficientUnitless(body.MachUnitless(airSpeed));
            var cdA = bodyCdAM2 + (MainDeployed ? mainCdAM2 * Inflation(ageS, mainSinceS, MainInflationS)
                : DrogueDeployed ? drogueCdAM2 * Inflation(ageS, drogueSinceS, DrogueInflationS) : 0);
            ageS += Rk4Integrator.FixedStepS;
            var effectiveArea = cdA / Math.Max(1e-3, tableCd); // kernel multiplies the table Cd back in
            var dirX = airSpeed > 0 ? -(s.VelocityXMs + body.RotationRateRadS * s.PositionYM) / airSpeed : 0;
            var dirY = airSpeed > 0 ? -(s.VelocityYMs - body.RotationRateRadS * s.PositionXM) / airSpeed : 1;
            TerminalBurning = throttle > 0 && engine != null;
            var control = new FlightControl(TerminalBurning ? engine : null, TerminalBurning ? throttle : 0,
                dirX, dirY, effectiveArea, finalMassKg);
            var d = dynamics.Derivative(timeS, s, control);
            var grav = body.GravityMs2(s.RadiusM);
            var rx = s.PositionXM / s.RadiusM; var ry = s.PositionYM / s.RadiusM;
            // Non-gravitational acceleration, g (drag plus thrust).
            GLoadUnitless = EntryPhysics.GLoadUnitless(d.AccelerationXMs2 + grav * rx, d.AccelerationYMs2 + grav * ry);
            PeakGLoadUnitless = Math.Max(PeakGLoadUnitless, GLoadUnitless);
            var flux = EntryPhysics.HeatFluxWm2(body.DensityKgM3(altitude), noseRadiusM, airSpeed)
                * (ShieldForward ? 1 : MisalignedHeatMultiplier);
            HeatLoadJm2 = EntryPhysics.IntegrateHeatLoadJm2(HeatLoadJm2, previousFluxWm2, flux, Rk4Integrator.FixedStepS);
            previousFluxWm2 = flux; HeatFluxWm2 = flux; PeakHeatFluxWm2 = Math.Max(PeakHeatFluxWm2, flux);
            return dynamics.Step(s, timeS, control);
        }
    }
}
