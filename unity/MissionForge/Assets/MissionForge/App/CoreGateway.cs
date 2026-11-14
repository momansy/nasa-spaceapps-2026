using System;
using System.Collections.Generic;
using MissionForge.Core.Build;

namespace MissionForge.App
{
    /// <summary>
    /// The single doorway from the Unity host into MissionForge.Core. The host never reimplements
    /// rules: every simulation number comes through here, so tests can swap the implementation.
    /// </summary>
    public interface ICoreGateway
    {
        /// <summary>True once a real MissionForge.Core is bound.</summary>
        bool IsAvailable { get; }

        /// <summary>Number of data files handed to Core by the last <see cref="LoadCatalog"/> call.</summary>
        int CatalogFileCount { get; }

        /// <summary>Hands the game data JSON (relative path → text) to Core.Data.</summary>
        void LoadCatalog(IReadOnlyDictionary<string, string> jsonByPath);

        /// <summary>
        /// Ideal rocket-equation Δv in m/s for a stage: Isp in s, wet and dry mass in kg (physical model, Core.Build).
        /// </summary>
        double IdealDeltaVMs(double ispS, double wetMassKg, double dryMassKg);

        /// <summary>Lift-off thrust-to-weight ratio (dimensionless): sea-level thrust in N, mass in kg (physical model, Core.Build).</summary>
        double LiftoffTwr(double thrustSlN, double massKg);
    }

    /// <summary>
    /// Binds the host to the com.missionforge.core package (core/ at the repository root).
    /// Core does not have a catalog parser yet (Core.Data is a later task), so <see cref="LoadCatalog"/>
    /// keeps the JSON for when it lands and never interprets rules itself.
    /// </summary>
    public sealed class MissionForgeCoreGateway : ICoreGateway
    {
        private IReadOnlyDictionary<string, string> _catalog = new Dictionary<string, string>();

        public bool IsAvailable => true;

        public int CatalogFileCount => _catalog.Count;

        public void LoadCatalog(IReadOnlyDictionary<string, string> jsonByPath)
        {
            _catalog = jsonByPath ?? throw new ArgumentNullException(nameof(jsonByPath));
        }

        public double IdealDeltaVMs(double ispS, double wetMassKg, double dryMassKg) =>
            RocketEquation.DeltaVMs(ispS, wetMassKg, dryMassKg);

        public double LiftoffTwr(double thrustSlN, double massKg) =>
            RocketEquation.LiftoffTwr(thrustSlN, massKg);
    }

    /// <summary>Stand-in for tests that need a gateway without Core. Never fabricates results.</summary>
    public sealed class UnavailableCoreGateway : ICoreGateway
    {
        public const string Reason = "MissionForge.Core is not bound.";

        public bool IsAvailable => false;

        public int CatalogFileCount => 0;

        public void LoadCatalog(IReadOnlyDictionary<string, string> jsonByPath)
        {
        }

        public double IdealDeltaVMs(double ispS, double wetMassKg, double dryMassKg) => throw new NotSupportedException(Reason);

        public double LiftoffTwr(double thrustSlN, double massKg) => throw new NotSupportedException(Reason);
    }

    /// <summary>Process-wide access point; defaults to the real Core package.</summary>
    public static class CoreGateway
    {
        private static ICoreGateway _current = new MissionForgeCoreGateway();

        public static ICoreGateway Current
        {
            get => _current;
            set => _current = value ?? throw new ArgumentNullException(nameof(value));
        }
    }
}
