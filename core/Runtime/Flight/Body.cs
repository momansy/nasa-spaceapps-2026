using System;

namespace MissionForge.Core.Flight
{
    /// <summary>Spherical body and single exponential atmosphere (design 8.1–8.3); SI units.</summary>
    public sealed class Body
    {
        /// <summary>Earth using shared physical constants; constant sound speed 340 m/s is game_value.</summary>
        public static Body Earth { get; } = new Body(PhysicalConstants.EarthMuM3S2,
            PhysicalConstants.EarthMeanRadiusM, PhysicalConstants.SeaLevelAirDensityKgM3,
            PhysicalConstants.EarthScaleHeightM, PhysicalConstants.EarthEquatorRotationSpeedMs, 340);

        /// <summary>Mars using shared physical constants; rotation 240 m/s and sound speed 240 m/s are game_value approximations.</summary>
        public static Body Mars { get; } = new Body(PhysicalConstants.MarsMuM3S2,
            PhysicalConstants.MarsRadiusM, PhysicalConstants.MarsSurfaceDensityKgM3,
            PhysicalConstants.MarsScaleHeightM, 240, 240);

        /// <summary>Creates a body from μ (m³/s²), radius (m), density (kg/m³), scale height (m), equatorial speed (m/s), sound speed (m/s).</summary>
        public Body(double muM3S2, double radiusM, double surfaceDensityKgM3, double scaleHeightM,
            double equatorRotationSpeedMs, double soundSpeedMs)
        {
            FlightGuard.Positive(muM3S2, nameof(muM3S2));
            FlightGuard.Positive(radiusM, nameof(radiusM));
            FlightGuard.Nonnegative(surfaceDensityKgM3, nameof(surfaceDensityKgM3));
            FlightGuard.Positive(scaleHeightM, nameof(scaleHeightM));
            FlightGuard.Finite(equatorRotationSpeedMs, nameof(equatorRotationSpeedMs));
            FlightGuard.Positive(soundSpeedMs, nameof(soundSpeedMs));
            MuM3S2 = muM3S2; RadiusM = radiusM; SurfaceDensityKgM3 = surfaceDensityKgM3;
            ScaleHeightM = scaleHeightM; EquatorRotationSpeedMs = equatorRotationSpeedMs;
            SoundSpeedMs = soundSpeedMs;
        }

        /// <summary>Gravitational parameter μ in m³/s² (physical).</summary>
        public double MuM3S2 { get; }
        /// <summary>Spherical radius in m (physical, simplified).</summary>
        public double RadiusM { get; }
        /// <summary>Surface atmospheric density in kg/m³ (physical, simplified).</summary>
        public double SurfaceDensityKgM3 { get; }
        /// <summary>Single atmospheric scale height in m (physical, simplified).</summary>
        public double ScaleHeightM { get; }
        /// <summary>Signed equatorial rotation speed in m/s; positive is counterclockwise.</summary>
        public double EquatorRotationSpeedMs { get; }
        /// <summary>Angular rotation speed in rad/s, derived from equatorial speed / radius.</summary>
        public double RotationRateRadS => EquatorRotationSpeedMs / RadiusM;
        /// <summary>Constant sound speed in m/s (game_value: isothermal Mach model).</summary>
        public double SoundSpeedMs { get; }

        /// <summary>Inverse-square gravity magnitude μ/r² in m/s² at center-distance r in m (design 8.2).</summary>
        public double GravityMs2(double radiusM)
        {
            FlightGuard.Positive(radiusM, nameof(radiusM));
            return MuM3S2 / radiusM / radiusM;
        }

        /// <summary>Density ρ0 exp(-h/H) in kg/m³ at altitude h in m. Below ground is clamped to surface (game_value).</summary>
        public double DensityKgM3(double altitudeM) => SurfaceDensityKgM3 * PressureRatioUnitless(altitudeM);

        /// <summary>Dimensionless p/p0 = exp(-h/H), isothermal simplification (design 8.2). A vacuum body returns zero.</summary>
        public double PressureRatioUnitless(double altitudeM)
        {
            FlightGuard.Finite(altitudeM, nameof(altitudeM));
            return SurfaceDensityKgM3 == 0 ? 0 : Math.Exp(-Math.Max(0, altitudeM) / ScaleHeightM);
        }

        /// <summary>Dimensionless Mach number from nonnegative air-relative speed in m/s and constant sound speed.</summary>
        public double MachUnitless(double airSpeedMs)
        {
            FlightGuard.Nonnegative(airSpeedMs, nameof(airSpeedMs));
            return airSpeedMs / SoundSpeedMs;
        }
    }
}
