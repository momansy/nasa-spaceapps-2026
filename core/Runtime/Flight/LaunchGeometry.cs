using System;

namespace MissionForge.Core.Flight
{
    /// <summary>Launch-site rotation and simplified inclination geometry (design sections 7.1 and 8.3).</summary>
    public static class LaunchGeometry
    {
        /// <summary>Eastward surface-rotation boost in m/s: equatorial speed × cos(latitude).</summary>
        public static double EastwardRotationBoostMs(Body body, double latitudeRad)
        {
            if (body == null) throw new ArgumentNullException(nameof(body));
            FlightGuard.Range(latitudeRad, -Math.PI / 2, Math.PI / 2, nameof(latitudeRad));
            return body.EquatorRotationSpeedMs * Math.Cos(latitudeRad);
        }

        /// <summary>
        /// Prograde launch azimuth east of north in rad for target inclination in rad, using
        /// cos(i) = cos(latitude) sin(azimuth). Requires inclination at least absolute latitude.
        /// </summary>
        public static double LaunchAzimuthRad(double latitudeRad, double targetInclinationRad)
        {
            FlightGuard.Range(latitudeRad, -Math.PI / 2, Math.PI / 2, nameof(latitudeRad));
            FlightGuard.Range(targetInclinationRad, 0, Math.PI / 2, nameof(targetInclinationRad));
            var absoluteLatitudeRad = Math.Abs(latitudeRad);
            if (targetInclinationRad + 1e-12 < absoluteLatitudeRad)
                throw new ArgumentOutOfRangeException(nameof(targetInclinationRad), "Direct ascent cannot reach an inclination below launch-site latitude.");
            var cosLatitude = Math.Cos(latitudeRad);
            if (Math.Abs(cosLatitude) < 1e-12) return 0;
            var sinAzimuth = Math.Cos(targetInclinationRad) / cosLatitude;
            return Math.Asin(Math.Max(-1, Math.Min(1, sinAzimuth)));
        }

        /// <summary>
        /// Simplified inclination delta-v penalty in m/s. For directly reachable inclinations it is
        /// the lost along-track rotation boost versus due east. For a lower-than-site inclination it
        /// adds the ideal plane-change cost 2v sin(delta-i/2) at the supplied parking speed in m/s.
        /// This is a disclosed game_value model, not a launch-trajectory optimizer.
        /// </summary>
        public static double InclinationDeltaVPenaltyMs(Body body, double latitudeRad, double targetInclinationRad,
            double parkingSpeedMs)
        {
            if (body == null) throw new ArgumentNullException(nameof(body));
            FlightGuard.Range(latitudeRad, -Math.PI / 2, Math.PI / 2, nameof(latitudeRad));
            FlightGuard.Range(targetInclinationRad, 0, Math.PI / 2, nameof(targetInclinationRad));
            FlightGuard.Nonnegative(parkingSpeedMs, nameof(parkingSpeedMs));
            var absoluteLatitudeRad = Math.Abs(latitudeRad);
            if (targetInclinationRad < absoluteLatitudeRad)
                return 2 * parkingSpeedMs * Math.Sin((absoluteLatitudeRad - targetInclinationRad) / 2);
            var maximumBoostMs = EastwardRotationBoostMs(body, latitudeRad);
            var alongTrackBoostMs = body.EquatorRotationSpeedMs * Math.Cos(targetInclinationRad);
            return Math.Max(0, maximumBoostMs - alongTrackBoostMs);
        }
    }
}
