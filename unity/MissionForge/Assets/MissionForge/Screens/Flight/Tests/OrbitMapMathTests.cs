using System;
using MissionForge.Core.Flight;
using NUnit.Framework;
using UnityEngine;

namespace MissionForge.Screens.Flight.Tests
{
    /// <summary>EditMode tests of the MF_OrbitMap geometry (pure; no scene, no Painter2D).</summary>
    public sealed class OrbitMapMathTests
    {
        private static readonly double R = Body.Earth.RadiusM;
        private static readonly double Mu = Body.Earth.MuM3S2;

        [Test]
        public void CircularOrbit400Km_HasZeroEccentricityAndEqualApsides()
        {
            double r = R + 400_000;
            double v = Math.Sqrt(Mu / r);

            OrbitConic conic = OrbitMapMath.ConicFrom(r, 0, 0, v, Mu, R);

            Assert.That(conic.IsValid, Is.True);
            Assert.That(conic.IsBound, Is.True);
            Assert.That(conic.IsPeriapsisBelowSurface, Is.False);
            Assert.That(conic.Eccentricity, Is.LessThan(1e-9));
            Assert.That(conic.PeriapsisAltitudeM, Is.EqualTo(400_000).Within(1.0));
            Assert.That(conic.ApoapsisAltitudeM, Is.EqualTo(400_000).Within(1.0));
        }

        [Test]
        public void CircularOrbit_SamplesAClosedRingAtTheOrbitRadius()
        {
            double r = R + 400_000;
            OrbitConic conic = OrbitMapMath.ConicFrom(r, 0, 0, Math.Sqrt(Mu / r), Mu, R);

            var points = OrbitMapMath.SampleConic(conic, 64, 12 * R);

            Assert.That(points.Count, Is.EqualTo(65));
            Assert.That((points[0] - points[64]).magnitude, Is.LessThan(1f));
            foreach (Vector2 p in points) Assert.That(p.magnitude, Is.EqualTo(r).Within(10.0));
        }

        [Test]
        public void EllipticalOrbit_MatchesVisVivaAndCoreElementsWithin1M()
        {
            double rp = R + 200_000;
            double ra = R + 1_000_000;
            double a = 0.5 * (rp + ra);
            double vp = Math.Sqrt(Mu * (2 / rp - 1 / a)); // vis-viva at periapsis
            double w = 0.7; // periapsis direction, rad
            double px = rp * Math.Cos(w), py = rp * Math.Sin(w);
            double vx = -vp * Math.Sin(w), vy = vp * Math.Cos(w);

            OrbitConic conic = OrbitMapMath.ConicFrom(px, py, vx, vy, Mu, R);
            OrbitalElements core = OrbitalMechanics.Elements(new FlightState(px, py, vx, vy, 1000), Mu);

            Assert.That(conic.PeriapsisRadiusM, Is.EqualTo(rp).Within(1.0));
            Assert.That(conic.ApoapsisRadiusM, Is.EqualTo(ra).Within(1.0));
            Assert.That(conic.PeriapsisRadiusM, Is.EqualTo(core.PeriapsisRadiusM).Within(1.0));
            Assert.That(conic.ApoapsisRadiusM, Is.EqualTo(core.ApoapsisRadiusM).Within(1.0));
            Assert.That(conic.SemiMajorAxisM, Is.EqualTo(a).Within(1.0));
            Assert.That(conic.ArgumentOfPeriapsisRad, Is.EqualTo(w).Within(1e-6));
            var apo = conic.ApoapsisPointM;
            Assert.That(Math.Sqrt(apo.xM * apo.xM + apo.yM * apo.yM), Is.EqualTo(ra).Within(1.0));
            Assert.That(Math.Atan2(apo.yM, apo.xM), Is.EqualTo(w - Math.PI).Within(1e-6));
        }

        [Test]
        public void SuborbitalState_FlagsPeriapsisBelowSurface()
        {
            // 100 km up, climbing at 1 km/s with 2 km/s horizontal: a sounding-rocket arc.
            OrbitConic conic = OrbitMapMath.ConicFrom(R + 100_000, 0, 1000, 2000, Mu, R);

            Assert.That(conic.IsValid, Is.True);
            Assert.That(conic.IsBound, Is.True);
            Assert.That(conic.IsPeriapsisBelowSurface, Is.True);
            Assert.That(conic.PeriapsisAltitudeM, Is.LessThan(0));
        }

        [Test]
        public void EscapeState_SamplesOnlyTheNearBranchInsideTheLimit()
        {
            double r = R + 400_000;
            double v = 1.2 * OrbitalMechanics.EscapeSpeedMs(Mu, r);
            double limit = 12 * R;

            OrbitConic conic = OrbitMapMath.ConicFrom(r, 0, 0, v, Mu, R);
            var points = OrbitMapMath.SampleConic(conic, 100, limit);

            Assert.That(conic.IsBound, Is.False);
            Assert.That(double.IsPositiveInfinity(conic.ApoapsisAltitudeM), Is.True);
            Assert.That(points.Count, Is.EqualTo(100));
            foreach (Vector2 p in points) Assert.That(p.magnitude, Is.LessThanOrEqualTo(limit * 1.0001));
            Assert.That(points[0].magnitude, Is.EqualTo(limit).Within(limit * 1e-4));
        }

        [Test]
        public void NonFiniteState_IsInvalidAndSamplesNothing()
        {
            OrbitConic conic = OrbitMapMath.ConicFrom(double.NaN, 0, 0, 0, Mu, R);

            Assert.That(conic.IsValid, Is.False);
            Assert.That(OrbitMapMath.SampleConic(conic, 32, 12 * R).Count, Is.EqualTo(0));
        }

        [Test]
        public void MapTransform_KeepsEarthCentredAndFitsTheViewRadius()
        {
            const float width = 1600, height = 900, margin = 48;
            double fit = 2 * R;

            MapTransform map = MapTransform.Fit(width, height, fit, margin);

            Vector2 centre = map.ToPanel(0, 0);
            Assert.That(centre.x, Is.EqualTo(800f).Within(1e-3f));
            Assert.That(centre.y, Is.EqualTo(450f).Within(1e-3f));
            double[,] edges = { { fit, 0 }, { 0, fit }, { -fit, 0 }, { 0, -fit } };
            for (int i = 0; i < 4; i++)
            {
                Vector2 p = map.ToPanel(edges[i, 0], edges[i, 1]);
                Assert.That((p - centre).magnitude, Is.EqualTo(450f - margin).Within(0.01f));
                Assert.That(p.x, Is.InRange(0f, width));
                Assert.That(p.y, Is.InRange(0f, height));
            }
        }

        [Test]
        public void MapTransform_PutsThePadOnTopAndDownrangeToTheRight()
        {
            MapTransform map = MapTransform.Fit(1000, 1000, 2 * R, 0);

            Vector2 pad = map.ToPanel(R, 0);
            Vector2 downrange = map.DirectionToPanel(0, 1);

            Assert.That(pad.x, Is.EqualTo(500f).Within(0.01f));
            Assert.That(pad.y, Is.LessThan(500f));
            Assert.That(downrange.x, Is.EqualTo(1f).Within(1e-5f));
            Assert.That(downrange.y, Is.EqualTo(0f).Within(1e-5f));
        }

        [Test]
        public void FitRadius_IsAtLeastTwoEarthRadiiAndAtMostTwelve()
        {
            OrbitConic low = OrbitMapMath.ConicFrom(R + 400_000, 0, 0, Math.Sqrt(Mu / (R + 400_000)), Mu, R);
            double high = 40 * R;
            OrbitConic far = OrbitMapMath.ConicFrom(high, 0, 0, Math.Sqrt(Mu / high), Mu, R);

            Assert.That(OrbitMapMath.FitRadiusM(low, R + 400_000, R), Is.EqualTo(OrbitMapMath.MinViewRadiusBodyRadii * R).Within(1.0));
            Assert.That(OrbitMapMath.FitRadiusM(far, high, R), Is.EqualTo(12 * R).Within(1.0));
        }

        [Test]
        public void GroundTrack_UnwrapsAcrossTheAntimeridian()
        {
            double unwrapped = OrbitMapMath.UnwrapAngleRad(3.0, -3.0);

            Assert.That(unwrapped, Is.EqualTo(2 * Math.PI - 3.0).Within(1e-12));
            Assert.That(OrbitMapMath.GroundTrackAngleRad(0, R), Is.EqualTo(Math.PI / 2).Within(1e-12));
        }

        [Test]
        public void Trail_IgnoresDuplicateTicksAndStaysBounded()
        {
            var trail = new OrbitTrailBuffer();
            double r = R + 400_000;

            Assert.That(trail.Add(1, 0, r, 0), Is.True);
            Assert.That(trail.Add(1, 0, r, 0), Is.False);
            for (int i = 2; i < 20_000; i++)
            {
                double angle = i * 1e-3; // ~6.8 km per step: every step is stored until decimation
                trail.Add(i, i, r * Math.Cos(angle), r * Math.Sin(angle));
            }

            Assert.That(trail.Points.Count, Is.LessThanOrEqualTo(OrbitTrailBuffer.MaxPoints));
            Assert.That(trail.GroundTrackRad, Is.EqualTo(19_999 * 1e-3).Within(1e-9));
        }
    }
}
