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
        /// <summary>
        /// Smallest framed height, m. Rework 2 (U7): 5 m (was 12 m) so a landed 1.5 m small fairing fills about 16 % of
        /// the screen height instead of 8 %; a 3 m engine-only stack is still framed with room above it.
        /// </summary>
        public const float MinFramedHeightM = 5f;
        /// <summary>
        /// Pad shot (rework 2, U7/U11): with choices made but no modelled part yet, the frame starts at the deck and
        /// spans this height, so the open launch table, its lit exhaust pit, the stairs and the payload stand-in fill the
        /// free column instead of an empty table top. m, game_value.
        /// </summary>
        public const float PadShotHeightM = 24f;
        /// <summary>Room kept beside the stack and the smallest framed half width, m (rework 2; was 3 m and 8 m). game_value.</summary>
        public const float MinSideRoomM = 2f, MinHalfWidthM = 3.5f;
        /// <summary>
        /// Lowest camera eye above the vehicle mount for stacks framed from the mount, m (rework 2): the table top is
        /// <see cref="MountTableAboveMountM"/> above the mount, so with a short stack the low 14 % eye sat below the table
        /// top and filmed its underside. 2.5 m above the table top keeps the stack base in view. game_value.
        /// </summary>
        public const float MinEyeAboveMountM = MountTableAboveMountM + 2.5f;

        /// <summary>
        /// Eye height fraction for a framed height whose base is <paramref name="baseDropM"/> below the mount, raised so
        /// the eye clears the table top by 2.5 m (pure, unit-tested). In the pad shot this keeps the vote ghost and the
        /// stand-in on the table in view (the independent review caught the ghost hidden behind the rail).
        /// </summary>
        public static float EyeFracFor(float framedHeightM, float baseDropM)
        {
            float minFrac = (MinEyeAboveMountM + Mathf.Max(0f, baseDropM)) / Mathf.Max(0.5f, framedHeightM);
            return Mathf.Clamp(Mathf.Max(BayFraming.DefaultEyeFrac, minFrac), BayFraming.DefaultEyeFrac, 0.85f);
        }
        /// <summary>Framed height with nothing on the pad yet, m: the mount, the lower tower and the crane hook.</summary>
        public const float EmptyPadFramedHeightM = 42f;
        /// <summary>Idle orbit: ± sweep around the vantage azimuth, degrees, and its period, s.</summary>
        public const float OrbitAmplitudeDeg = 7f, OrbitPeriodS = 70f;
        /// <summary>Punch-in when a part lands: distance factor at the peak, and in / hold / out times, s.</summary>
        public const float PunchDepth = 0.84f, PunchInS = 0.45f, PunchHoldS = 0.7f, PunchOutS = 1.6f;
        /// <summary>Easing rate of the framed height and width (dolly), 1/s.</summary>
        public const float DollyRate = 2.0f;
        /// <summary>Compare view band: below the contract card (its rig tags stay clear of it) and above the stat table (≈ 540 px). game_value.</summary>
        /// Rework (U11): 330–530 px, with the candidate tags anchored low on each candidate (BuildBayScreen.Tools
        /// CompareTagDepth) so they sit below the right-hand tool chips and above the stat table.
        public const float CompareTopFrac = 330f / 1080f, CompareBottomFrac = 530f / 1080f;
        /// <summary>Compare framing centre shift toward +X, as a fraction of the framed height (pulls the pair left of the chips). game_value.</summary>
        public const float CompareCentreShift = 0.15f;
        /// <summary>Exploded view band top, and the margin on the exploded length, so the nose clears the phase pills (≈ 165 px) and the rehearsal banner (≈ 310 px). game_value.</summary>
        public const float ExplodedTopFrac = 330f / 1080f, ExplodedMargin = 1.08f;
        /// <summary>Scale view band bottom: high enough that the deck, the 1.75 m person and its label clear the timeline. game_value.</summary>
        public const float ScaleBottomFrac = 690f / 1080f;

        [SerializeField] private LaunchPadRig pad;

        private float _extraWidthM;
        private float _assemblyHeadroomM;
        private float _shownHeightM = -1f, _shownHalfWidthM, _shownCentreX, _shownBaseDropM;
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

        /// <summary>
        /// True once any slot has a choice. The payload (the first vote) has no kit model, so a satellite-only build
        /// has an empty rig; rework 2 frames it as the pad shot (<see cref="PadShotHeightM"/> from the deck, with the
        /// payload stand-in on the table) instead of the 42 m empty pad or an empty table top (U7, U11).
        /// </summary>
        private bool HasChoices()
        {
            return _screen != null && _screen.Session != null && _screen.Session.Build != null && _screen.Session.Build.Choices.Count > 0;
        }

        /// <summary>
        /// Height of the stack on the pad, m. <see cref="VehicleRig.LengthM"/> is measured between kit attach points and is
        /// 0 for a single part (a landed fairing alone), so below 1 m the rendered height is used (rework 2, U7: the
        /// landed small fairing was framed as an empty pad).
        /// </summary>
        private float StackHeightM()
        {
            if (Rig == null) return 0f;
            if (Rig.LengthM >= 1f || Rig.Root == null || Rig.Root.GetComponentInChildren<Renderer>() == null) return Rig.LengthM;
            return Mathf.Max(Rig.LengthM, Vehicle.VehicleAssembler.RendererBounds(Rig.Root).size.y);
        }

        /// <summary>Framing state for the evidence log (rework 2 diagnostics): shown height and base drop, stack height, pad shot, headroom, eye.</summary>
        public string FramingState => "framedHeight=" + _shownHeightM.ToString("0.0") + " baseDrop=" + _shownBaseDropM.ToString("0.0") +
            " stack=" + StackHeightM().ToString("0.00") + " lengthM=" + (Rig != null ? Rig.LengthM : 0f).ToString("0.00") + " padShot=" + PadShotWanted() +
            " headroom=" + _assemblyHeadroomM.ToString("0.0") + " eyeFrac=" + EyeFracFor(_shownHeightM, _shownBaseDropM).ToString("0.00") +
            (_screen != null && _screen.Vantage != null ? " camY=" + _screen.Vantage.transform.position.y.ToString("0.0") : "");

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
                _shownBaseDropM = TargetBaseDropM();
                ApplyPose();
            }
        }

        /// <summary>How far below the vehicle mount the framed subject starts, m: the deck for the pad shot, else 0.</summary>
        private float TargetBaseDropM()
        {
            if (!PadShotWanted() || vehicleMount == null) return 0f;
            return Mathf.Max(0f, vehicleMount.position.y - (transform.position.y + LaunchPadRig.DeckTopM));
        }

        /// <summary>Framed height above the mount: the stack (stretched when exploded), headroom for a part being lowered, the scale references.</summary>
        private float TargetHeightM()
        {
            float length = StackHeightM();
            if (_compareA != null || _compareB != null)
            {
                length = Mathf.Max(_compareA != null ? _compareA.LengthM : 0f, _compareB != null ? _compareB.LengthM : 0f);
            }
            else if (Rig != null && _exploded)
            {
                // Frame the fully exploded stack straight away so the dolly and the explosion move together.
                int groups = 0;
                foreach (Transform g in GroupsBottomUp(Rig)) if (g.name != "Boosters") groups++;
                length *= (1f + ExplodeGapFraction * Mathf.Max(0, groups - 1)) * ExplodedMargin;
            }
            if (length < 1f && _extraHeightM <= 0f) return HasChoices() ? PadShotHeightM : EmptyPadFramedHeightM;
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
            // Rework 2 (U7): the minimum was 8 m, which made every short stack width-bound (the camera stood about 2.3x
            // farther than the height solve and a landed 3.6 m small fairing showed about 7 % of the screen height).
            float own = Mathf.Max(RigRadius() + MinSideRoomM, MinHalfWidthM);
            return own + _extraWidthM * (ScaleViewOn ? 0.25f : 0.5f);
        }

        /// <summary>Horizontal frame centre on +X from the vehicle axis, m.</summary>
        private float TargetCentreXM()
        {
            if (ScaleViewOn) return Mathf.Max(0f, _extraWidthM * 0.25f - 4f);
            if (_compareA != null || _compareB != null) return CompareCentreShift * TargetHeightM();
            return 0f;
        }

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
            Vector3 basePoint = vehicleMount.position + Vector3.right * _shownCentreX + Vector3.down * _shownBaseDropM;
            var shot = new BayShot(basePoint, _shownHeightM, _shownHalfWidthM, azimuth);
            float aspect = _screen.Vantage.Lens.Aspect > 0.1f ? _screen.Vantage.Lens.Aspect : 16f / 9f;
            BayFrameLayout layout = BayFraming.DefaultLayout(_screen.Vantage.Lens.FieldOfView, aspect);
            layout = new BayFrameLayout(layout.TopFrac, layout.BottomFrac, layout.HalfColumnFrac, EyeFracFor(_shownHeightM, _shownBaseDropM),
                layout.VerticalFovDeg, layout.Aspect);
            if (_compareA != null || _compareB != null)
            {
                // The compare stat table covers the lower middle of the screen: both candidates sit above it.
                layout = new BayFrameLayout(CompareTopFrac, CompareBottomFrac, layout.HalfColumnFrac, layout.EyeFrac, layout.VerticalFovDeg, layout.Aspect);
            }
            else if (_exploded)
            {
                layout = new BayFrameLayout(ExplodedTopFrac, layout.BottomFrac, layout.HalfColumnFrac, layout.EyeFrac, layout.VerticalFovDeg, layout.Aspect);
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
            TickStandIn();
            if (_screen == null || _screen.Vantage == null) return;
            float dt = Time.unscaledDeltaTime;
            if (_a11y.ReducedMotion)
            {
                _shownHeightM = TargetHeightM();
                _shownHalfWidthM = TargetHalfWidthM();
                _shownCentreX = TargetCentreXM();
                _shownBaseDropM = TargetBaseDropM();
            }
            else
            {
                float k = 1f - Mathf.Exp(-dt * DollyRate);
                if (_shownHeightM <= 0f) _shownHeightM = TargetHeightM();
                _shownHeightM = Mathf.Lerp(_shownHeightM, TargetHeightM(), k);
                _shownHalfWidthM = Mathf.Lerp(_shownHalfWidthM, TargetHalfWidthM(), k);
                _shownCentreX = Mathf.Lerp(_shownCentreX, TargetCentreXM(), k);
                _shownBaseDropM = Mathf.Lerp(_shownBaseDropM, TargetBaseDropM(), k);
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
