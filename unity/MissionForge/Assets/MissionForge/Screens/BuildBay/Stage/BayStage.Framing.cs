using MissionForge.Core.Build;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Camera direction (T034 step 5). The Cinemachine vantage is posed every frame by <see cref="BayFraming"/> so the
    /// vehicle stack spans about 54 % of the screen height in the free column between the side panels, at every stage
    /// of assembly: the framed height and width are eased (a dolly as the stack grows), a slow idle orbit sweeps the
    /// azimuth, a short punch-in plays when a part lands, and the compare, exploded and scale views widen the frame.
    /// Reduced motion: no orbit and no punch-in, and every reframe is a cut. Numbers are game_value art direction.
    /// </summary>
    public sealed partial class BayStage
    {
        /// <summary>Azimuth of the vantage around the vehicle, degrees (0 = from −Z). A slight three-quarter view.</summary>
        public const float VantageAzimuthDeg = -14f;
        /// <summary>Smallest framed height, m, so a one-part stack is not an extreme close-up of a bell.</summary>
        public const float MinFramedHeightM = 12f;
        /// <summary>Framed height with nothing on the pad yet, m: the mount, the lower tower and the crane hook.</summary>
        public const float EmptyPadFramedHeightM = 42f;
        /// <summary>Idle orbit: ± sweep around the vantage azimuth, degrees, and its period, s.</summary>
        public const float OrbitAmplitudeDeg = 7f, OrbitPeriodS = 70f;
        /// <summary>Punch-in when a part lands: distance factor at the peak, and in / hold / out times, s.</summary>
        public const float PunchDepth = 0.84f, PunchInS = 0.45f, PunchHoldS = 0.7f, PunchOutS = 1.6f;
        /// <summary>Easing rate of the framed height and width (dolly), 1/s.</summary>
        public const float DollyRate = 2.0f;
        /// <summary>Compare view band: below the contract card (its rig tags stay clear of it) and above the stat table (≈ 540 px). game_value.</summary>
        public const float CompareTopFrac = 300f / 1080f, CompareBottomFrac = 525f / 1080f;
        /// <summary>Scale view band bottom: high enough that the deck, the 1.75 m person and its label clear the timeline. game_value.</summary>
        public const float ScaleBottomFrac = 690f / 1080f;

        [SerializeField] private LaunchPadRig pad;

        private float _extraWidthM;
        private float _assemblyHeadroomM;
        private float _shownHeightM = -1f, _shownHalfWidthM, _shownCentreX;
        private float _orbitClock;
        private float _punchClock = -1f;

        public LaunchPadRig Pad => pad;

        public void ConfigurePad(LaunchPadRig launchPad) => pad = launchPad;

        /// <summary>Extra horizontal room to frame (compare view puts a second vehicle beside the first), m.</summary>
        public void SetExtraFrameWidth(float metres)
        {
            _extraWidthM = Mathf.Max(0f, metres);
            Frame(false);
        }

        partial void BindExtrasImpl()
        {
            BindAssembly();
            Frame(true);
        }

        partial void OnRigRebuiltImpl(BuildState previous, BuildState current)
        {
            if (pad != null && Rig != null) pad.FitVehicle(Rig.LengthM, RigRadius(), previous == null || _a11y.ReducedMotion);
            Frame(previous == null);
            OnRigChangedForAssembly(previous, current);
        }

        partial void OnAccessibilityChangedImpl()
        {
            Frame(true);
            OnAccessibilityForTools();
        }

        private float RigRadius()
        {
            if (Rig == null) return 1.85f;
            Bounds b = Vehicle.VehicleAssembler.RendererBounds(Rig.Root);
            return Mathf.Max(0.75f, Mathf.Max(b.extents.x, b.extents.z));
        }

        /// <summary>Starts the landing punch-in (no-op in reduced motion).</summary>
        private void PunchIn()
        {
            if (!_a11y.ReducedMotion) _punchClock = 0f;
        }

        /// <summary>Re-targets the framing; <paramref name="instant"/> (or reduced motion) cuts instead of easing.</summary>
        public void Frame(bool instant)
        {
            if (instant || _a11y.ReducedMotion)
            {
                _shownHeightM = TargetHeightM();
                _shownHalfWidthM = TargetHalfWidthM();
                _shownCentreX = TargetCentreXM();
                ApplyPose();
            }
        }

        /// <summary>Framed height above the mount: the stack (stretched when exploded), headroom for a part being lowered, the scale references.</summary>
        private float TargetHeightM()
        {
            float length = Rig != null ? Rig.LengthM : 0f;
            if (_compareA != null || _compareB != null)
            {
                length = Mathf.Max(_compareA != null ? _compareA.LengthM : 0f, _compareB != null ? _compareB.LengthM : 0f);
            }
            else if (Rig != null && _exploded)
            {
                // Frame the fully exploded stack straight away so the dolly and the explosion move together.
                int groups = 0;
                foreach (Transform g in GroupsBottomUp(Rig)) if (g.name != "Boosters") groups++;
                length *= 1f + ExplodeGapFraction * Mathf.Max(0, groups - 1);
            }
            if (length < 1f && _extraHeightM <= 0f) return EmptyPadFramedHeightM;
            float h = length + _assemblyHeadroomM;
            if (_extraHeightM > 0f && vehicleMount != null)
            {
                float deck = transform.position.y + LaunchPadRig.DeckTopM;
                h = Mathf.Max(h, deck + _extraHeightM - vehicleMount.position.y + 2f);
            }
            return Mathf.Max(h, MinFramedHeightM);
        }

        /// <summary>
        /// Half width to keep in the column, m. Compare: both candidates sit at ± half the extra width around the axis.
        /// Scale view: the references stand on +X out to about the extra width / 2, so the frame centres between them.
        /// </summary>
        private float TargetHalfWidthM()
        {
            float own = Mathf.Max(RigRadius() + 3f, 8f);
            return own + _extraWidthM * (ScaleViewOn ? 0.25f : 0.5f);
        }

        /// <summary>Horizontal frame centre on +X from the vehicle axis, m.</summary>
        private float TargetCentreXM() => ScaleViewOn ? Mathf.Max(0f, _extraWidthM * 0.25f - 4f) : 0f;

        private bool ScaleViewOn => _scaleRefs.Count > 0;

        private void ApplyPose()
        {
            if (_screen == null || _screen.Vantage == null || vehicleMount == null || _shownHeightM <= 0f) return;
            float azimuth = VantageAzimuthDeg;
            float scale = 1f;
            if (!_a11y.ReducedMotion)
            {
                azimuth += OrbitAmplitudeDeg * Mathf.Sin(2f * Mathf.PI * _orbitClock / OrbitPeriodS);
                scale = Mathf.Lerp(1f, PunchDepth, PunchEnvelope(_punchClock));
            }
            Vector3 basePoint = vehicleMount.position + Vector3.right * _shownCentreX;
            var shot = new BayShot(basePoint, _shownHeightM, _shownHalfWidthM, azimuth);
            float aspect = _screen.Vantage.Lens.Aspect > 0.1f ? _screen.Vantage.Lens.Aspect : 16f / 9f;
            BayFrameLayout layout = BayFraming.DefaultLayout(_screen.Vantage.Lens.FieldOfView, aspect);
            if (_compareA != null || _compareB != null)
            {
                // The compare stat table covers the lower middle of the screen: both candidates sit above it.
                layout = new BayFrameLayout(CompareTopFrac, CompareBottomFrac, layout.HalfColumnFrac, layout.EyeFrac, layout.VerticalFovDeg, layout.Aspect);
            }
            else if (ScaleViewOn)
            {
                layout = new BayFrameLayout(layout.TopFrac, ScaleBottomFrac, layout.HalfColumnFrac, layout.EyeFrac, layout.VerticalFovDeg, layout.Aspect);
            }
            Pose pose = BayFraming.Solve(shot, layout, scale);
            _screen.Vantage.transform.SetPositionAndRotation(pose.position, pose.rotation);
        }

        /// <summary>0 → 1 → 0 over the punch-in; 0 when idle.</summary>
        public static float PunchEnvelope(float t)
        {
            if (t < 0f) return 0f;
            if (t < PunchInS) return Mathf.SmoothStep(0f, 1f, t / PunchInS);
            t -= PunchInS;
            if (t < PunchHoldS) return 1f;
            t -= PunchHoldS;
            return t < PunchOutS ? Mathf.SmoothStep(1f, 0f, t / PunchOutS) : 0f;
        }

        private void LateUpdate()
        {
            TickAssembly();
            TickTools();
            if (_screen == null || _screen.Vantage == null) return;
            float dt = Time.unscaledDeltaTime;
            if (_a11y.ReducedMotion)
            {
                _shownHeightM = TargetHeightM();
                _shownHalfWidthM = TargetHalfWidthM();
                _shownCentreX = TargetCentreXM();
            }
            else
            {
                float k = 1f - Mathf.Exp(-dt * DollyRate);
                if (_shownHeightM <= 0f) _shownHeightM = TargetHeightM();
                _shownHeightM = Mathf.Lerp(_shownHeightM, TargetHeightM(), k);
                _shownHalfWidthM = Mathf.Lerp(_shownHalfWidthM, TargetHalfWidthM(), k);
                _shownCentreX = Mathf.Lerp(_shownCentreX, TargetCentreXM(), k);
                _orbitClock += dt;
                if (_punchClock >= 0f)
                {
                    _punchClock += dt;
                    if (_punchClock > PunchInS + PunchHoldS + PunchOutS) _punchClock = -1f;
                }
            }
            ApplyPose();
        }
    }
}
