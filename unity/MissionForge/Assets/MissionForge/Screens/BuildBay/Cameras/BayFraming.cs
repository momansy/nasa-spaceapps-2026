using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>What the Build Bay camera must hold in frame, world metres.</summary>
    public readonly struct BayShot
    {
        /// <summary>Point on the vehicle axis at the base of the framed subject (the vehicle mount), world m.</summary>
        public readonly Vector3 Base;
        /// <summary>Height of the framed subject above <see cref="Base"/>, m.</summary>
        public readonly float HeightM;
        /// <summary>Half the horizontal width that must stay inside the free column, m.</summary>
        public readonly float HalfWidthM;
        /// <summary>Horizontal azimuth of the camera around the axis, degrees (0 = camera on −Z looking +Z).</summary>
        public readonly float AzimuthDeg;

        public BayShot(Vector3 basePoint, float heightM, float halfWidthM, float azimuthDeg)
        {
            Base = basePoint;
            HeightM = heightM;
            HalfWidthM = halfWidthM;
            AzimuthDeg = azimuthDeg;
        }
    }

    /// <summary>Screen layout the shot is solved for (normalised, so it is resolution independent).</summary>
    public readonly struct BayFrameLayout
    {
        /// <summary>Top of the subject, fraction of screen height from the top edge.</summary>
        public readonly float TopFrac;
        /// <summary>Bottom of the subject, fraction of screen height from the top edge.</summary>
        public readonly float BottomFrac;
        /// <summary>Half the free column width (between the side panels) as a fraction of screen width.</summary>
        public readonly float HalfColumnFrac;
        /// <summary>Camera height above the subject base as a fraction of the subject height (low hero angle).</summary>
        public readonly float EyeFrac;
        public readonly float VerticalFovDeg;
        public readonly float Aspect;

        public BayFrameLayout(float topFrac, float bottomFrac, float halfColumnFrac, float eyeFrac, float verticalFovDeg, float aspect)
        {
            TopFrac = topFrac;
            BottomFrac = bottomFrac;
            HalfColumnFrac = halfColumnFrac;
            EyeFrac = eyeFrac;
            VerticalFovDeg = verticalFovDeg;
            Aspect = aspect;
        }
    }

    /// <summary>
    /// T034 camera direction: solves a camera pose so that the framed subject (the vehicle stack) spans exactly the
    /// band <see cref="BayFrameLayout.TopFrac"/>..<see cref="BayFrameLayout.BottomFrac"/> of the screen height, centred
    /// in the free column between the Build Bay side panels, seen from a low camera. If the subject is too wide for the
    /// column (compare view, scale references) the camera backs off until it fits and keeps the band centred.
    /// Pure math, no scene access, so it is covered by EditMode tests. All layout fractions are game_value art
    /// direction at the 1920 × 1080 reference.
    /// </summary>
    public static class BayFraming
    {
        /// <summary>Default band: subject top 200 px, bottom 760 px of 1080 (52 % of the height), so a landing part and its sparks clear the timeline panel (top ≈ 798 px). game_value.</summary>
        public const float DefaultTopFrac = 200f / 1080f, DefaultBottomFrac = 760f / 1080f;
        /// <summary>Free column 512–1408 px of 1920, minus a 40 px margin each side. game_value.</summary>
        public const float DefaultHalfColumnFrac = (448f - 40f) / 1920f;
        /// <summary>Camera eye at 14 % of the stack height above the mount: a low, heroic angle. game_value.</summary>
        public const float DefaultEyeFrac = 0.14f;

        public static BayFrameLayout DefaultLayout(float verticalFovDeg, float aspect) =>
            new BayFrameLayout(DefaultTopFrac, DefaultBottomFrac, DefaultHalfColumnFrac, DefaultEyeFrac, verticalFovDeg, aspect);

        /// <summary>Solves the camera pose for <paramref name="shot"/>; <paramref name="distanceScale"/> &lt; 1 pushes in.</summary>
        public static Pose Solve(in BayShot shot, in BayFrameLayout layout, float distanceScale = 1f)
        {
            float height = Mathf.Max(0.5f, shot.HeightM);
            float tanHalf = Mathf.Tan(layout.VerticalFovDeg * 0.5f * Mathf.Deg2Rad);
            float nTop = 1f - 2f * layout.TopFrac;       // NDC y, +1 = top edge
            float nBottom = 1f - 2f * layout.BottomFrac;
            float span = Mathf.Atan(nTop * tanHalf) - Mathf.Atan(nBottom * tanHalf);   // wanted angular height, rad

            float eye = layout.EyeFrac * height;          // camera height above the base
            float top = height - eye, bottom = -eye;      // subject ends relative to the eye
            float distance = SolveDistance(top, bottom, span);

            // Horizontal fit: the half width must stay inside the free column (small-angle, pitch ignored).
            float tanHalfH = tanHalf * layout.Aspect;
            float minForWidth = shot.HalfWidthM / Mathf.Max(0.01f, 2f * layout.HalfColumnFrac * tanHalfH);
            bool widthBound = minForWidth > distance;
            distance = Mathf.Max(distance, minForWidth) * Mathf.Max(0.2f, distanceScale);

            float aTop = Mathf.Atan2(top, distance), aBottom = Mathf.Atan2(bottom, distance);
            float pitch = widthBound || !Mathf.Approximately(distanceScale, 1f)
                // Keep the band centre where the layout wants it.
                ? 0.5f * (aTop + aBottom) - Mathf.Atan(0.5f * (nTop + nBottom) * tanHalf)
                : aTop - Mathf.Atan(nTop * tanHalf);

            Quaternion yaw = Quaternion.Euler(0f, shot.AzimuthDeg, 0f);
            Vector3 back = yaw * Vector3.back;
            Vector3 position = shot.Base + Vector3.up * eye + back * distance;
            Vector3 forward = yaw * Vector3.forward;
            Quaternion rotation = Quaternion.LookRotation(forward, Vector3.up) * Quaternion.Euler(-pitch * Mathf.Rad2Deg, 0f, 0f);
            return new Pose(position, rotation);
        }

        /// <summary>Horizontal distance at which a segment from <paramref name="bottom"/> to <paramref name="top"/> (heights relative to the eye) subtends <paramref name="span"/> rad.</summary>
        public static float SolveDistance(float top, float bottom, float span)
        {
            float lo = 0.01f, hi = 100000f;
            for (int i = 0; i < 64; i++)
            {
                float mid = 0.5f * (lo + hi);
                float a = Mathf.Atan2(top, mid) - Mathf.Atan2(bottom, mid);
                if (a > span) lo = mid; else hi = mid;
            }
            return 0.5f * (lo + hi);
        }

        /// <summary>Screen-space y (fraction from the top) of <paramref name="world"/> seen from <paramref name="pose"/>.</summary>
        public static float ScreenFracY(Pose pose, Vector3 world, float verticalFovDeg)
        {
            Vector3 local = Quaternion.Inverse(pose.rotation) * (world - pose.position);
            float ndc = local.y / (local.z * Mathf.Tan(verticalFovDeg * 0.5f * Mathf.Deg2Rad));
            return 0.5f * (1f - ndc);
        }

        /// <summary>Screen-space x (fraction from the left) of <paramref name="world"/> seen from <paramref name="pose"/>.</summary>
        public static float ScreenFracX(Pose pose, Vector3 world, float verticalFovDeg, float aspect)
        {
            Vector3 local = Quaternion.Inverse(pose.rotation) * (world - pose.position);
            float ndc = local.x / (local.z * Mathf.Tan(verticalFovDeg * 0.5f * Mathf.Deg2Rad) * aspect);
            return 0.5f * (1f + ndc);
        }
    }
}
