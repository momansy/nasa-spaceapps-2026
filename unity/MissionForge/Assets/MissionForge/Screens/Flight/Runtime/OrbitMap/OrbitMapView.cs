using System;
using System.Collections.Generic;
using MissionForge.Core.Flight;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// 2-D map of the Earth and the current conic for the host big screen. Draws with Painter2D: Earth disk with a
    /// night half and an atmosphere ring, the orbit (or suborbital arc), the trail flown so far, the ground track on
    /// the limb, apsis markers and the vehicle with a heading tick. Apsis text is child Labels placed each update.
    /// Geometry is recomputed in <see cref="SetTelemetry"/>; Unity propagates nothing.
    /// </summary>
    public sealed class OrbitMapView : VisualElement
    {
        // ---- Presentation constants (game_value, tuned for reading from across a room at 1080p) ----
        private const float MarginPx = 96f;              // room for apsis labels outside the orbit
        private const int OrbitSamples = 256;
        private const int ArcSamplesPerTurn = 180;
        private const double AtmosphereThicknessM = 100_000; // Kármán line, drawn at scale but never thinner than:
        private const float MinAtmospherePx = 4f;
        private const float OrbitWidthPx = 4f;
        private const float TrailWidthPx = 3f;
        private const float GroundTrackWidthPx = 8f;
        private const float VehicleRadiusPx = 10f;
        private const float HeadingTickPx = 34f;
        private const float ApsisMarkerPx = 11f;
        private const float LabelOffsetPx = 44f;
        private const float LabelEdgePx = 120f;          // keep label centres this far from the view edges
        private const float NightAlpha = 0.55f;

        private static readonly Color EarthColour = MfPalette.Ocean;
        private static readonly Color NightColour = MfPalette.WithAlpha(MfPalette.Space, NightAlpha);
        private static readonly Color AtmosphereColour = MfPalette.WithAlpha(MfPalette.Signal, 0.35f);
        private static readonly Color OrbitColour = MfPalette.Signal;
        // Suborbital arc uses the Marginal status colour, always paired with the "Suborbital" text label (design 14.4).
        private static readonly Color SuborbitalColour = MfPalette.Marginal;
        private static readonly Color TrailColour = MfPalette.WithAlpha(MfPalette.Ceramic, 0.56f);
        private static readonly Color GroundTrackColour = MfPalette.Sunlight;
        private static readonly Color MarkerColour = MfPalette.Ceramic;
        private static readonly Color OutlineColour = MfPalette.Space;

        private readonly double _bodyRadiusM;
        private readonly double _muM3S2;
        private readonly Label _apoapsisLabel;
        private readonly Label _periapsisLabel;
        private readonly Label _messageLabel;
        private OrbitTrailBuffer _trail = new OrbitTrailBuffer();
        private FlightTelemetry _telemetry;

        // Geometry cache in panel pixels, rebuilt by RebuildGeometry.
        private bool _geometryDirty = true;
        private bool _hasGeometry;
        private MapTransform _map;
        private OrbitConic _conic;
        private List<Vector2> _orbitPx = new List<Vector2>();
        private List<Vector2> _trailPx = new List<Vector2>();
        private List<Vector2> _groundTrackPx = new List<Vector2>();
        private List<Vector2> _nightPx = new List<Vector2>();
        private Vector2 _vehiclePx, _headingPx, _padPx, _apoapsisPx, _periapsisPx;
        private bool _showOrbit, _showApoapsis, _showPeriapsis;

        public OrbitMapView() : this(Body.Earth.RadiusM, Body.Earth.MuM3S2) { }

        public OrbitMapView(double bodyRadiusM, double muM3S2)
        {
            _bodyRadiusM = bodyRadiusM;
            _muM3S2 = muM3S2;
            AddToClassList("mf-orbit-map__view");
            pickingMode = PickingMode.Ignore;
            _apoapsisLabel = MakeLabel("mf-orbit-map__apsis");
            _periapsisLabel = MakeLabel("mf-orbit-map__apsis");
            _messageLabel = MakeLabel("mf-orbit-map__message");
            _messageLabel.text = FlightText.Get("ui.flight.map.no_orbit");
            generateVisualContent += Draw;
            RegisterCallback<GeometryChangedEvent>(evt =>
            {
                if (evt.target == this) Refresh();
            });
        }

        /// <summary>Trail drawn by the view. The screen points this at <see cref="OrbitMapTrail.Shared"/>.</summary>
        public OrbitTrailBuffer Trail
        {
            get => _trail;
            set { _trail = value ?? new OrbitTrailBuffer(); Refresh(); }
        }

        public OrbitConic Conic => _conic;

        public void SetTelemetry(FlightTelemetry t)
        {
            _telemetry = t;
            Refresh();
        }

        /// <summary>Adds one step to the trail; drawn on the next repaint.</summary>
        public void AddTrailPoint(FlightTelemetry t)
        {
            if (!_trail.Add(t)) return;
            _geometryDirty = true;
            MarkDirtyRepaint();
        }

        private void Refresh()
        {
            RebuildGeometry();
            UpdateLabels();
            MarkDirtyRepaint();
        }

        private Label MakeLabel(string cls)
        {
            var label = new Label { pickingMode = PickingMode.Ignore };
            label.AddToClassList("mf-label");
            label.AddToClassList(cls);
            label.style.display = DisplayStyle.None;
            Add(label);
            return label;
        }

        private void RebuildGeometry()
        {
            _geometryDirty = false;
            Rect rect = contentRect;
            FlightTelemetry t = _telemetry;
            _hasGeometry = t != null && rect.width > 1 && rect.height > 1 && !float.IsNaN(rect.width);
            if (!_hasGeometry) return;

            _conic = OrbitMapMath.ConicFrom(t, _muM3S2, _bodyRadiusM);
            double vehicleRadiusM = Math.Sqrt(t.positionXM * t.positionXM + t.positionYM * t.positionYM);
            double fitRadiusM = OrbitMapMath.FitRadiusM(_conic, vehicleRadiusM, _bodyRadiusM);
            _map = MapTransform.Fit(rect.width, rect.height, fitRadiusM, MarginPx);

            // Before lift-off the "orbit" is the pad's rotation conic: meaningless, so it is hidden.
            _showOrbit = t.IsLifted && _conic.IsValid;
            double limitM = OrbitMapMath.MaxViewRadiusBodyRadii * _bodyRadiusM;
            _orbitPx = _showOrbit ? ToPanel(OrbitMapMath.SampleConic(_conic, OrbitSamples, limitM)) : new List<Vector2>();
            _trailPx = ToPanel(_trail.Points);

            double trackRad = Math.Max(-2 * Math.PI, Math.Min(2 * Math.PI, _trail.GroundTrackRad));
            int trackSamples = Math.Max(2, (int)(ArcSamplesPerTurn * Math.Abs(trackRad) / (2 * Math.PI)));
            _groundTrackPx = ToPanel(OrbitMapMath.SampleArc(_bodyRadiusM, 0, trackRad, trackSamples));

            // Sun fixed along +x in the inertial frame: a daylight launch (game_value); night is the far half.
            _nightPx = ToPanel(OrbitMapMath.SampleArc(_bodyRadiusM, Math.PI / 2, 3 * Math.PI / 2, ArcSamplesPerTurn / 2));

            _vehiclePx = _map.ToPanel(t.positionXM, t.positionYM);
            _headingPx = _map.DirectionToPanel(t.velocityXMs, t.velocityYMs);
            _padPx = _map.ToPanel(_bodyRadiusM, 0);

            _showApoapsis = _showOrbit && _conic.IsBound && _conic.ApoapsisRadiusM <= limitM;
            _showPeriapsis = _showOrbit && !_conic.IsPeriapsisBelowSurface && _conic.PeriapsisRadiusM <= limitM;
            var apo = _conic.ApoapsisPointM;
            var peri = _conic.PeriapsisPointM;
            _apoapsisPx = _showApoapsis ? _map.ToPanel(apo.xM, apo.yM) : Vector2.zero;
            _periapsisPx = _showPeriapsis ? _map.ToPanel(peri.xM, peri.yM) : Vector2.zero;
        }

        private void UpdateLabels()
        {
            FlightTelemetry t = _telemetry;
            bool show = _hasGeometry && t != null;
            // Numbers are Core's apsis altitudes; the conic only supplies them if the feed has none.
            double apoM = t != null && t.HasApoapsis ? t.apoapsisM : _conic.ApoapsisAltitudeM;
            double periM = t != null && t.HasPeriapsis ? t.periapsisM : _conic.PeriapsisAltitudeM;
            PlaceApsis(_apoapsisLabel, show && _showApoapsis, _apoapsisPx, "ui.flight.map.apoapsis", apoM);
            PlaceApsis(_periapsisLabel, show && _showPeriapsis, _periapsisPx, "ui.flight.map.periapsis", periM);
            bool suborbital = show && t.IsLifted && _conic.IsValid && _conic.IsPeriapsisBelowSurface;
            _messageLabel.style.display = suborbital ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void PlaceApsis(Label label, bool visible, Vector2 markerPx, string key, double altitudeM)
        {
            label.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (!visible) return;
            var (value, unit) = FlightUnits.Apsis(altitudeM);
            label.text = FlightText.Get(key) + " " + value + " " + unit;
            Vector2 outward = markerPx - _map.CentrePx;
            outward = outward.sqrMagnitude > 0 ? outward.normalized : Vector2.down;
            Vector2 at = markerPx + outward * LabelOffsetPx;
            Rect rect = contentRect;
            at.x = Mathf.Clamp(at.x, Mathf.Min(LabelEdgePx, rect.width / 2), Mathf.Max(rect.width - LabelEdgePx, rect.width / 2));
            at.y = Mathf.Clamp(at.y, 24f, Mathf.Max(24f, rect.height - 24f));
            // Centred on (left, top) by the USS translate: -50% -50%.
            label.style.left = at.x;
            label.style.top = at.y;
        }

        private List<Vector2> ToPanel(IReadOnlyList<Vector2> pointsM)
        {
            var result = new List<Vector2>(pointsM.Count);
            for (int i = 0; i < pointsM.Count; i++) result.Add(_map.ToPanel(pointsM[i].x, pointsM[i].y));
            return result;
        }

        private void Draw(MeshGenerationContext mgc)
        {
            if (_geometryDirty) RebuildGeometry();
            if (!_hasGeometry) return;
            Painter2D p = mgc.painter2D;
            p.lineJoin = LineJoin.Round;
            p.lineCap = LineCap.Round;
            Vector2 centre = _map.CentrePx;
            float earthPx = _map.LengthToPx(_bodyRadiusM);

            float atmospherePx = Mathf.Max(MinAtmospherePx, _map.LengthToPx(AtmosphereThicknessM));
            StrokeCircle(p, centre, earthPx + atmospherePx * 0.5f, AtmosphereColour, atmospherePx);

            // Orbit first, so the Earth disk hides the part of a suborbital conic that runs underground.
            bool suborbital = _conic.IsPeriapsisBelowSurface;
            Polyline(p, _orbitPx, suborbital ? SuborbitalColour : OrbitColour, OrbitWidthPx);

            FillCircle(p, centre, earthPx, EarthColour);
            FillPolygon(p, _nightPx, NightColour);

            Polyline(p, _groundTrackPx, GroundTrackColour, GroundTrackWidthPx);
            FillCircle(p, _padPx, GroundTrackWidthPx * 0.75f, GroundTrackColour);

            if (_trailPx.Count > 0)
            {
                var trail = new List<Vector2>(_trailPx) { _vehiclePx };
                Polyline(p, trail, TrailColour, TrailWidthPx);
            }

            if (_showApoapsis) Diamond(p, _apoapsisPx, ApsisMarkerPx);
            if (_showPeriapsis) Diamond(p, _periapsisPx, ApsisMarkerPx);

            if (_headingPx != Vector2.zero)
            {
                p.strokeColor = MarkerColour;
                p.lineWidth = 4f;
                p.BeginPath();
                p.MoveTo(_vehiclePx);
                p.LineTo(_vehiclePx + _headingPx * HeadingTickPx);
                p.Stroke();
            }
            FillCircle(p, _vehiclePx, VehicleRadiusPx, MarkerColour);
            StrokeCircle(p, _vehiclePx, VehicleRadiusPx, OutlineColour, 3f);
        }

        private static void Polyline(Painter2D p, IReadOnlyList<Vector2> pts, Color colour, float width)
        {
            if (pts.Count < 2) return;
            p.strokeColor = colour;
            p.lineWidth = width;
            p.BeginPath();
            p.MoveTo(pts[0]);
            for (int i = 1; i < pts.Count; i++) p.LineTo(pts[i]);
            p.Stroke();
        }

        private static void FillPolygon(Painter2D p, IReadOnlyList<Vector2> pts, Color colour)
        {
            if (pts.Count < 3) return;
            p.fillColor = colour;
            p.BeginPath();
            p.MoveTo(pts[0]);
            for (int i = 1; i < pts.Count; i++) p.LineTo(pts[i]);
            p.ClosePath();
            p.Fill();
        }

        private static void FillCircle(Painter2D p, Vector2 c, float r, Color colour)
        {
            if (!(r > 0)) return;
            p.fillColor = colour;
            p.BeginPath();
            p.Arc(c, r, Angle.Degrees(0), Angle.Degrees(360));
            p.ClosePath();
            p.Fill();
        }

        private static void StrokeCircle(Painter2D p, Vector2 c, float r, Color colour, float width)
        {
            if (!(r > 0)) return;
            p.strokeColor = colour;
            p.lineWidth = width;
            p.BeginPath();
            p.Arc(c, r, Angle.Degrees(0), Angle.Degrees(360));
            p.ClosePath();
            p.Stroke();
        }

        private static void Diamond(Painter2D p, Vector2 c, float r)
        {
            p.fillColor = MarkerColour;
            p.strokeColor = OutlineColour;
            p.lineWidth = 3f;
            p.BeginPath();
            p.MoveTo(c + new Vector2(0, -r));
            p.LineTo(c + new Vector2(r, 0));
            p.LineTo(c + new Vector2(0, r));
            p.LineTo(c + new Vector2(-r, 0));
            p.ClosePath();
            p.Fill();
            p.Stroke();
        }
    }
}
