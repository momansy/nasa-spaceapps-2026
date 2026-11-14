using MissionForge.Core.Build;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Vantage framing: the camera keeps the whole vehicle and the top of the tower inside the middle 52 % of the
    /// width and between the top strip and the timeline (STYLE_GUIDE safe regions), moving smoothly as the vehicle
    /// grows (reduced motion: it cuts). Pixel bands are game_value layout numbers at the 1080 p reference.
    /// </summary>
    public sealed partial class BayStage
    {
        /// <summary>Top of the free band below the contract strip, px from the top at 1080 p.</summary>
        public const float BandTopPx = 250f;
        /// <summary>Bottom of the free band above the timeline, px from the top at 1080 p.</summary>
        public const float BandBottomPx = 800f;
        /// <summary>Minimum framed height so a short stack still shows the pad and tower, m.</summary>
        public const float MinFramedHeightM = 46f;
        /// <summary>Azimuth of the vantage around the vehicle, degrees (0 = from −Z). A slight three-quarter view.</summary>
        public const float VantageAzimuthDeg = -14f;

        [SerializeField] private LaunchPadRig pad;

        private Vector3 _camTargetPos;
        private Quaternion _camTargetRot;
        private bool _hasCamTarget;
        private float _extraWidthM;

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

        /// <summary>Computes the vantage pose for the current rig; <paramref name="instant"/> cuts instead of easing.</summary>
        public void Frame(bool instant)
        {
            if (_screen == null || _screen.Vantage == null || vehicleMount == null) return;
            float length = Rig != null ? Rig.LengthM : 0f;
            float ground = transform.position.y + LaunchPadRig.DeckTopM;
            float top = Mathf.Max(vehicleMount.position.y + length + 3f, pad != null ? pad.TowerTopY + 18f : 0f);
            top = Mathf.Max(top, ground + _extraHeightM + 4f);
            float height = Mathf.Max(top - ground, MinFramedHeightM);
            float fov = _screen.Vantage.Lens.FieldOfView;
            float bandPx = BandBottomPx - BandTopPx;
            float pxPerM = bandPx / height;
            float tanHalf = Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad);
            float distance = 1080f / (pxPerM * 2f * tanHalf);
            // Horizontal: the middle 52 % of 1920 px must hold the vehicle (and the compare twin).
            float aspect = 16f / 9f;
            float halfWidthM = 0.26f * 1080f * aspect / pxPerM;
            float neededHalfWidth = 12f + _extraWidthM * 0.5f;
            if (neededHalfWidth > halfWidthM) distance *= neededHalfWidth / halfWidthM;

            float bandCentrePx = (BandTopPx + BandBottomPx) * 0.5f;
            float pxPerMAtDistance = 1080f / (2f * distance * tanHalf);
            float centreY = ground + height * 0.5f + (bandCentrePx - 540f) / pxPerMAtDistance;
            Vector3 axis = vehicleMount.position + Vector3.right * (_extraWidthM * 0.5f);
            Quaternion yaw = Quaternion.Euler(0f, VantageAzimuthDeg, 0f);
            Vector3 back = yaw * Vector3.back;
            float camY = ground + height * 0.32f;
            _camTargetPos = new Vector3(axis.x, camY, axis.z) + back * distance;
            Vector3 lookAt = new Vector3(axis.x, centreY, axis.z);
            _camTargetRot = Quaternion.LookRotation(lookAt - _camTargetPos, Vector3.up);
            _hasCamTarget = true;
            if (instant || _a11y.ReducedMotion)
            {
                _screen.Vantage.transform.SetPositionAndRotation(_camTargetPos, _camTargetRot);
            }
        }

        private void LateUpdate()
        {
            if (!_hasCamTarget || _screen == null || _screen.Vantage == null) return;
            Transform t = _screen.Vantage.transform;
            float k = 1f - Mathf.Exp(-Time.unscaledDeltaTime * 2.2f);
            t.SetPositionAndRotation(Vector3.Lerp(t.position, _camTargetPos, k), Quaternion.Slerp(t.rotation, _camTargetRot, k));
            TickAssembly();
            TickTools();
        }
    }
}
