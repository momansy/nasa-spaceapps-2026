using System;
using System.Collections.Generic;
using MissionForge.Core.Flight;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Shape of the current two-body conic for drawing, built from Core's <see cref="OrbitalMechanics.Elements"/>.
    /// Unity never propagates: this only describes the curve Core's elements define. SI units, Core's planet-centred
    /// inertial 2-D frame (launch site on +x).
    /// </summary>
    public readonly struct OrbitConic
    {
        public OrbitConic(double semiMajorAxisM, double eccentricity, double argumentOfPeriapsisRad,
            double periapsisRadiusM, double apoapsisRadiusM, double bodyRadiusM)
        {
            IsValid = true;
            SemiMajorAxisM = semiMajorAxisM;
            Eccentricity = eccentricity;
            ArgumentOfPeriapsisRad = argumentOfPeriapsisRad;
            PeriapsisRadiusM = periapsisRadiusM;
            ApoapsisRadiusM = apoapsisRadiusM;
            BodyRadiusM = bodyRadiusM;
        }

        /// <summary>No drawable conic (non-finite state, state at the centre, or Core's exactly parabolic case).</summary>
        public static OrbitConic Invalid => default;

        public bool IsValid { get; }
        /// <summary>Semi-major axis, m; negative for a hyperbola (Core convention).</summary>
        public double SemiMajorAxisM { get; }
        public double Eccentricity { get; }
        /// <summary>In-plane angle of the periapsis direction from +x, rad (Core's periapsis longitude; 0 for a circle).</summary>
        public double ArgumentOfPeriapsisRad { get; }
        public double PeriapsisRadiusM { get; }
        /// <summary>Apoapsis radius, m; +∞ when unbound.</summary>
        public double ApoapsisRadiusM { get; }
        public double BodyRadiusM { get; }

        public bool IsBound => IsValid && SemiMajorAxisM > 0 && Eccentricity < 1;
        /// <summary>True when the conic dips under the surface (suborbital arc, or the vehicle still on the pad).</summary>
        public bool IsPeriapsisBelowSurface => IsValid && PeriapsisRadiusM < BodyRadiusM;
        /// <summary>Semi-latus rectum p = a(1 − e²), m (positive for ellipses and hyperbolas).</summary>
        public double SemiLatusRectumM => SemiMajorAxisM * (1 - Eccentricity * Eccentricity);
        public double PeriapsisAltitudeM => PeriapsisRadiusM - BodyRadiusM;
        public double ApoapsisAltitudeM => IsBound ? ApoapsisRadiusM - BodyRadiusM : double.PositiveInfinity;

        /// <summary>Radius at true anomaly ν (r = p / (1 + e cos ν)), m; +∞ outside a hyperbola's near branch.</summary>
        public double RadiusAtM(double trueAnomalyRad)
        {
            double denominator = 1 + Eccentricity * Math.Cos(trueAnomalyRad);
            return denominator > 0 ? SemiLatusRectumM / denominator : double.PositiveInfinity;
        }

        /// <summary>Point of the conic at true anomaly ν in the Core frame, m.</summary>
        public (double xM, double yM) PointAtM(double trueAnomalyRad)
        {
            double r = RadiusAtM(trueAnomalyRad);
            double angle = ArgumentOfPeriapsisRad + trueAnomalyRad;
            return (r * Math.Cos(angle), r * Math.Sin(angle));
        }

        public (double xM, double yM) PeriapsisPointM => PointAtM(0);

        /// <summary>Apoapsis point, m; NaN when unbound.</summary>
        public (double xM, double yM) ApoapsisPointM => IsBound ? PointAtM(Math.PI) : (double.NaN, double.NaN);
    }

    /// <summary>
    /// Metres (Core frame, y up) → panel pixels (y down). The map is rotated so the launch site sits at the top of the
    /// Earth and, by default, mirrored so downrange runs to the right (seen from the other side of the orbital
    /// plane). Both are presentation choices (game_value), not physics.
    /// </summary>
    public readonly struct MapTransform
    {
        /// <summary>Launch site (+x in Core) drawn at the top of the Earth (game_value).</summary>
        public const double DefaultRotationRad = Math.PI / 2;
        /// <summary>Downrange to the right, like the flight view (game_value).</summary>
        public const bool DefaultMirrorX = true;

        public MapTransform(Vector2 centrePx, double scalePxPerM, double rotationRad, bool mirrorX)
        {
            CentrePx = centrePx;
            ScalePxPerM = scalePxPerM;
            RotationRad = rotationRad;
            MirrorX = mirrorX;
        }

        public Vector2 CentrePx { get; }
        public double ScalePxPerM { get; }
        public double RotationRad { get; }
        public bool MirrorX { get; }

        /// <summary>Centres the body in the panel and fits a circle of <paramref name="fitRadiusM"/> inside it, less a margin.</summary>
        public static MapTransform Fit(float widthPx, float heightPx, double fitRadiusM, float marginPx,
            double rotationRad = DefaultRotationRad, bool mirrorX = DefaultMirrorX)
        {
            var centre = new Vector2(widthPx * 0.5f, heightPx * 0.5f);
            double usablePx = Math.Max(1.0, Math.Min(widthPx, heightPx) * 0.5 - marginPx);
            double scale = fitRadiusM > 0 && !double.IsInfinity(fitRadiusM) ? usablePx / fitRadiusM : 0;
            return new MapTransform(centre, scale, rotationRad, mirrorX);
        }

        public Vector2 ToPanel(double xM, double yM)
        {
            Vector2 d = DirectionScaled(xM, yM, ScalePxPerM);
            return CentrePx + d;
        }

        /// <summary>Unit screen-space direction of a Core-frame vector (e.g. velocity for the heading tick).</summary>
        public Vector2 DirectionToPanel(double dxM, double dyM)
        {
            Vector2 d = DirectionScaled(dxM, dyM, 1);
            return d.sqrMagnitude > 0 ? d.normalized : Vector2.zero;
        }

        public float LengthToPx(double lengthM) => (float)(lengthM * ScalePxPerM);

        private Vector2 DirectionScaled(double xM, double yM, double scale)
        {
            double c = Math.Cos(RotationRad), s = Math.Sin(RotationRad);
            double xr = (c * xM - s * yM) * scale;
            double yr = (s * xM + c * yM) * scale;
            if (MirrorX) xr = -xr;
            return new Vector2((float)xr, (float)-yr);
        }
    }

    /// <summary>Pure geometry for MF_OrbitMap. Everything physical comes from Core; this only shapes it for drawing.</summary>
    public static class OrbitMapMath
    {
        /// <summary>Map never zooms out beyond this many body radii, so escape cases stay readable (game_value).</summary>
        public const double MaxViewRadiusBodyRadii = 12;
        /// <summary>Minimum view radius: a low orbit still separates from the limb (game_value).</summary>
        public const double MinViewRadiusBodyRadii = 1.3;

        private const double CircularEccentricity = 1e-12; // Core's own circular threshold
        private const double AsymptoteGuardRad = 1e-6;

        /// <summary>Conic from a planar inertial state (m, m/s) using Core's elements. Invalid when Core rejects it.</summary>
        public static OrbitConic ConicFrom(double positionXM, double positionYM, double velocityXMs, double velocityYMs,
            double muM3S2, double bodyRadiusM)
        {
            if (!IsFinite(positionXM) || !IsFinite(positionYM) || !IsFinite(velocityXMs) || !IsFinite(velocityYMs))
                return OrbitConic.Invalid;
            if (positionXM == 0 && positionYM == 0) return OrbitConic.Invalid;
            try
            {
                // Mass does not enter the two-body elements; 1 kg only satisfies FlightState's positivity guard.
                var state = new FlightState(positionXM, positionYM, velocityXMs, velocityYMs, 1.0);
                OrbitalElements e = OrbitalMechanics.Elements(state, muM3S2);
                return new OrbitConic(e.SemiMajorAxisM, e.EccentricityUnitless, e.PeriapsisLongitudeRad,
                    e.PeriapsisRadiusM, e.ApoapsisRadiusM, bodyRadiusM);
            }
            catch (ArgumentException)
            {
                // Core rejects the exactly parabolic state (no finite a); the map then shows trail and vehicle only.
                return OrbitConic.Invalid;
            }
        }

        public static OrbitConic ConicFrom(FlightTelemetry t, double muM3S2, double bodyRadiusM) => t == null
            ? OrbitConic.Invalid
            : ConicFrom(t.positionXM, t.positionYM, t.velocityXMs, t.velocityYMs, muM3S2, bodyRadiusM);

        public static OrbitConic ConicFrom(FlightTelemetry t) =>
            ConicFrom(t, Body.Earth.MuM3S2, Body.Earth.RadiusM);

        /// <summary>
        /// Points of the conic in the Core frame, m. A bound orbit inside <paramref name="radiusLimitM"/> is returned
        /// closed (n + 1 points, last = first). Otherwise (escape, or apoapsis beyond the limit) only the near branch
        /// within the limit is sampled, symmetric about periapsis (n points, open).
        /// </summary>
        public static IReadOnlyList<Vector2> SampleConic(OrbitConic conic, int n, double radiusLimitM)
        {
            if (!conic.IsValid || n < 2 || !(conic.SemiLatusRectumM > 0)) return Array.Empty<Vector2>();
            bool closed = conic.IsBound && conic.ApoapsisRadiusM <= radiusLimitM;
            var points = new List<Vector2>(n + 1);
            if (closed)
            {
                for (int i = 0; i <= n; i++) points.Add(ToVector(conic.PointAtM(2 * Math.PI * (i % n) / n)));
                return points;
            }
            if (conic.Eccentricity < CircularEccentricity || conic.PeriapsisRadiusM > radiusLimitM)
                return Array.Empty<Vector2>();
            double cosAtLimit = (conic.SemiLatusRectumM / radiusLimitM - 1) / conic.Eccentricity;
            double nuMaxRad = Math.Acos(Math.Max(-1, Math.Min(1, cosAtLimit)));
            if (!conic.IsBound) nuMaxRad = Math.Min(nuMaxRad, Math.Acos(-1 / conic.Eccentricity) - AsymptoteGuardRad);
            for (int i = 0; i < n; i++)
            {
                double nu = -nuMaxRad + 2 * nuMaxRad * i / (n - 1);
                points.Add(ToVector(conic.PointAtM(nu)));
            }
            return points;
        }

        /// <summary>Radius the map must show, m: apoapsis (when bound) and the vehicle, at least 2 R, at most 12 R.</summary>
        public static double FitRadiusM(OrbitConic conic, double vehicleRadiusM, double bodyRadiusM)
        {
            double fit = MinViewRadiusBodyRadii * bodyRadiusM;
            if (conic.IsBound && IsFinite(conic.ApoapsisRadiusM)) fit = Math.Max(fit, conic.ApoapsisRadiusM);
            if (IsFinite(vehicleRadiusM)) fit = Math.Max(fit, vehicleRadiusM);
            return Math.Min(fit, MaxViewRadiusBodyRadii * bodyRadiusM);
        }

        /// <summary>Angle of the sub-vehicle point from the launch site (+x), rad in (−π, π].</summary>
        public static double GroundTrackAngleRad(double positionXM, double positionYM) => Math.Atan2(positionYM, positionXM);

        /// <summary>Continues an unwrapped angle with a new wrapped sample (assumes less than π between samples), rad.</summary>
        public static double UnwrapAngleRad(double previousUnwrappedRad, double wrappedRad)
        {
            double delta = wrappedRad - previousUnwrappedRad;
            delta -= 2 * Math.PI * Math.Round(delta / (2 * Math.PI));
            return previousUnwrappedRad + delta;
        }

        /// <summary>Points on a circle of <paramref name="radiusM"/> from one angle to another (Core frame, m).</summary>
        public static IReadOnlyList<Vector2> SampleArc(double radiusM, double fromRad, double toRad, int n)
        {
            if (n < 2 || !IsFinite(fromRad) || !IsFinite(toRad)) return Array.Empty<Vector2>();
            var points = new List<Vector2>(n);
            for (int i = 0; i < n; i++)
            {
                double a = fromRad + (toRad - fromRad) * i / (n - 1);
                points.Add(new Vector2((float)(radiusM * Math.Cos(a)), (float)(radiusM * Math.Sin(a))));
            }
            return points;
        }

        private static Vector2 ToVector((double xM, double yM) p) => new Vector2((float)p.xM, (float)p.yM);

        private static bool IsFinite(double v) => !double.IsNaN(v) && !double.IsInfinity(v);
    }
}
