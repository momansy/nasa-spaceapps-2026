using System;
using System.Collections.Generic;

namespace MissionForge.App
{
    /// <summary>
    /// The single doorway from the Unity host into MissionForge.Core. The host never reimplements
    /// rules: every simulation number comes through here. While the Core package is not merged
    /// (task T001 timing note) the default gateway reports itself unavailable instead of guessing.
    /// </summary>
    public interface ICoreGateway
    {
        /// <summary>True once a real MissionForge.Core is bound.</summary>
        bool IsAvailable { get; }

        /// <summary>Hands the game data JSON (relative path → text) to Core.Data.</summary>
        void LoadCatalog(IReadOnlyDictionary<string, string> jsonByPath);

        /// <summary>
        /// Ideal rocket-equation Δv in m/s for a stage: Isp in s, wet and dry mass in kg (physical model, Core.Build).
        /// </summary>
        double IdealDeltaVMs(double ispS, double wetMassKg, double dryMassKg);
    }

    /// <summary>Placeholder used until com.missionforge.core is in the manifest. Never fabricates results.</summary>
    public sealed class UnavailableCoreGateway : ICoreGateway
    {
        public const string Reason = "MissionForge.Core is not bound: the core/ package was not on main when T001 was built.";

        public bool IsAvailable => false;

        public void LoadCatalog(IReadOnlyDictionary<string, string> jsonByPath)
        {
            // Nothing to hand over to yet; the data stays available from GameDataService.
        }

        public double IdealDeltaVMs(double ispS, double wetMassKg, double dryMassKg)
        {
            throw new NotSupportedException(Reason);
        }
    }

    /// <summary>Process-wide access point. A Core task replaces <see cref="Current"/> with the real adapter.</summary>
    public static class CoreGateway
    {
        private static ICoreGateway _current = new UnavailableCoreGateway();

        public static ICoreGateway Current
        {
            get => _current;
            set => _current = value ?? throw new ArgumentNullException(nameof(value));
        }
    }
}
