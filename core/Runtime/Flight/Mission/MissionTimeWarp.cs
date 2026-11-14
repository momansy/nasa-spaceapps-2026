using System;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>Pure time-warp gate for mission and UI use (design 9.7).</summary>
    public static class MissionTimeWarp
    {
        public const double MaximumWarpFactor = 1000;
        public const double MinigameWarpFactor = 0.1;

        /// <summary>Resolves a requested factor under powered, altitude and minigame constraints.</summary>
        public static double Resolve(double requestedWarpFactor, bool powered, double altitudeM, bool minigameActive)
        {
            FlightGuard.Finite(requestedWarpFactor, nameof(requestedWarpFactor));
            FlightGuard.Finite(altitudeM, nameof(altitudeM));
            if (minigameActive) return MinigameWarpFactor;
            if (powered || altitudeM < 70_000) return 1;
            return Math.Max(1, Math.Min(MaximumWarpFactor, requestedWarpFactor));
        }
    }
}
