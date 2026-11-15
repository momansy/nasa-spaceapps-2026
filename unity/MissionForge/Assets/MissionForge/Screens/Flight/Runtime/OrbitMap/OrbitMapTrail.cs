using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Trajectory flown so far, in Core-frame metres, plus the unwrapped ground-track angle from the launch site.
    /// Bounded: at most <see cref="MaxPoints"/> points; when full, every other point is dropped and the spacing
    /// doubles, so a long coast never grows the buffer. Steps are de-duplicated by tick so several screens may feed it.
    /// </summary>
    public sealed class OrbitTrailBuffer
    {
        /// <summary>Upper bound on stored points (game_value: smooth at map scale, cheap to redraw every frame).</summary>
        public const int MaxPoints = 2000;

        /// <summary>Initial distance between stored points, m (game_value: ~1 px at a 2 R view on a 1080p map).</summary>
        public const double InitialSpacingM = 2000;

        /// <summary>MET going back by more than this means a new flight started, s (game_value).</summary>
        private const double RestartToleranceS = 1;

        private List<Vector2> _points = new List<Vector2>();
        private double _spacingM = InitialSpacingM;
        private long _lastTick = long.MinValue;
        private double _lastMetS = double.NegativeInfinity;
        private bool _hasAngle;

        public IReadOnlyList<Vector2> Points => _points;

        /// <summary>Ground-track angle flown from the launch site, rad, unwrapped (2π = one full revolution).</summary>
        public double GroundTrackRad { get; private set; }

        public double SpacingM => _spacingM;

        /// <summary>Adds a step. Returns true when the buffer changed.</summary>
        public bool Add(FlightTelemetry t) => t != null && Add(t.tick, t.metS, t.positionXM, t.positionYM);

        public bool Add(long tick, double metS, double positionXM, double positionYM)
        {
            if (!IsFinite(positionXM) || !IsFinite(positionYM) || !IsFinite(metS)) return false;
            if (tick <= _lastTick)
            {
                if (metS >= _lastMetS - RestartToleranceS) return false; // same step fed twice
                Clear(); // a new flight restarted the tick counter
            }
            _lastTick = tick;
            _lastMetS = metS;

            double wrapped = OrbitMapMath.GroundTrackAngleRad(positionXM, positionYM);
            GroundTrackRad = _hasAngle ? OrbitMapMath.UnwrapAngleRad(GroundTrackRad, wrapped) : wrapped;
            _hasAngle = true;

            var p = new Vector2((float)positionXM, (float)positionYM);
            if (_points.Count > 0 && (p - _points[_points.Count - 1]).magnitude < _spacingM) return true;
            _points.Add(p);
            if (_points.Count > MaxPoints)
            {
                _points = Decimate(_points);
                _spacingM *= 2;
            }
            return true;
        }

        public void Clear()
        {
            _points = new List<Vector2>();
            _spacingM = InitialSpacingM;
            _lastTick = long.MinValue;
            _lastMetS = double.NegativeInfinity;
            GroundTrackRad = 0;
            _hasAngle = false;
        }

        /// <summary>Every other point, always keeping the first and the newest.</summary>
        private static List<Vector2> Decimate(List<Vector2> source)
        {
            var kept = new List<Vector2>(source.Count / 2 + 2);
            for (int i = 0; i < source.Count; i += 2) kept.Add(source[i]);
            if ((source.Count - 1) % 2 != 0) kept.Add(source[source.Count - 1]);
            return kept;
        }

        private static bool IsFinite(double v) => !double.IsNaN(v) && !double.IsInfinity(v);
    }

    /// <summary>
    /// The one trail of the current flight. Static so it survives SceneFlow switching between MF_Flight and
    /// MF_OrbitMap; both screens feed it from <c>FlightSession.Stepped</c> (duplicates are ignored by tick).
    /// </summary>
    public static class OrbitMapTrail
    {
        public static OrbitTrailBuffer Shared { get; } = new OrbitTrailBuffer();

        public static IReadOnlyList<Vector2> Points => Shared.Points;

        public static double GroundTrackRad => Shared.GroundTrackRad;

        public static void Add(FlightTelemetry t) => Shared.Add(t);

        public static void Clear() => Shared.Clear();

        /// <summary>Statics survive play sessions when domain reload is off; start each session empty.</summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay() => Clear();
    }
}
