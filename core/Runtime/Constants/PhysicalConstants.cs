namespace MissionForge.Core
{
    /// <summary>
    /// Physical constants of design section 8.1, converted to SI units (m, kg, s).
    /// The design table lists lengths in km; the values here are the same numbers in metres.
    /// All are tagged "physical" in the numeric assumptions register (design section 19);
    /// values the design marks with "~" are approximate and noted as such.
    /// </summary>
    public static class PhysicalConstants
    {
        /// <summary>
        /// Standard gravity g0 in m/s² (design section 8.1: 9.80665 m/s²).
        /// Used by the rocket equation and thrust-to-weight ratio (design section 6.3).
        /// </summary>
        public const double StandardGravityMs2 = 9.80665;

        /// <summary>
        /// Earth standard gravitational parameter μ = GM in m³/s² (design section 8.1: 3.986 × 10¹⁴ m³/s²).
        /// </summary>
        public const double EarthMuM3S2 = 3.986e14;

        /// <summary>
        /// Earth mean radius in m (design section 8.1: 6,371 km). The game uses a spherical Earth
        /// (design section 8.3).
        /// </summary>
        public const double EarthMeanRadiusM = 6_371_000.0;

        /// <summary>
        /// Eastward surface speed of Earth's rotation at the equator in m/s (design section 8.1: ~465 m/s).
        /// A launch site at latitude φ gets about this value × cos(φ) for free (design section 7.1).
        /// </summary>
        public const double EarthEquatorRotationSpeedMs = 465.0;

        /// <summary>
        /// Sea-level air density ρ0 in kg/m³ (design section 8.1: 1.225 kg/m³).
        /// </summary>
        public const double SeaLevelAirDensityKgM3 = 1.225;

        /// <summary>
        /// Atmospheric scale height H in m (design section 8.1: ~8.5 km). The game uses a single
        /// exponential atmosphere, ρ(h) = ρ0 · e^(−h/H) (design sections 8.2 and 8.3).
        /// </summary>
        public const double EarthScaleHeightM = 8_500.0;

        /// <summary>
        /// Altitude of the Kármán line, the edge of space, in m (design section 8.1: 100 km).
        /// </summary>
        public const double KarmanLineAltitudeM = 100_000.0;

        /// <summary>
        /// Altitude of the entry interface in m (design section 8.1: ~120 km).
        /// </summary>
        public const double EntryInterfaceAltitudeM = 120_000.0;

        /// <summary>
        /// Mars standard gravitational parameter μ in m³/s² (design section 8.1: 4.283 × 10¹³ m³/s²).
        /// </summary>
        public const double MarsMuM3S2 = 4.283e13;

        /// <summary>
        /// Mars radius in m (design section 8.1: 3,390 km).
        /// </summary>
        public const double MarsRadiusM = 3_390_000.0;

        /// <summary>
        /// Mars surface atmospheric density in kg/m³ (design section 8.1: ~0.020 kg/m³).
        /// </summary>
        public const double MarsSurfaceDensityKgM3 = 0.020;

        /// <summary>
        /// Mars atmospheric scale height in m (design section 8.1: ~11 km).
        /// </summary>
        public const double MarsScaleHeightM = 11_000.0;
    }
}
