using UnityEngine;

namespace MissionForge.UI
{
    /// <summary>
    /// Pure geometry for <see cref="MfGlassPanel"/>: panel-space to blurred-scene UVs and the rounded-rect
    /// triangle fan. No UI Toolkit or rendering state, so it is covered by EditMode tests (GlassMathTests).
    /// Conventions: panel space has its origin top-left with Y down (UI Toolkit); texture UVs have their origin
    /// bottom-left (UI Toolkit Vertex.uv, Unity RenderTexture sampling), so V is flipped.
    /// </summary>
    public static class GlassMath
    {
        /// <summary>Arc segments per rounded corner; 6 is visually smooth at the 24 px panel radius.</summary>
        public const int DefaultSegmentsPerCorner = 6;

        /// <summary>Vertices produced by <see cref="BuildRoundedRectFan"/>: the centre plus (segments + 1) per corner.</summary>
        public static int FanVertexCount(int segmentsPerCorner) => 1 + 4 * (Mathf.Max(1, segmentsPerCorner) + 1);

        /// <summary>Triangle-list indices for the closed fan: one triangle per perimeter vertex.</summary>
        public static int FanIndexCount(int segmentsPerCorner) => 3 * (FanVertexCount(segmentsPerCorner) - 1);

        /// <summary>Maps a point in panel space (pixels, Y down) to a UV in the full-screen blurred copy (Y up), clamped to 0..1.</summary>
        public static Vector2 PanelToUv(Vector2 panelPoint, Vector2 panelSize)
        {
            if (panelSize.x <= 0f || panelSize.y <= 0f)
                return Vector2.zero;
            return new Vector2(
                Mathf.Clamp01(panelPoint.x / panelSize.x),
                Mathf.Clamp01(1f - panelPoint.y / panelSize.y));
        }

        /// <summary>
        /// UV for <paramref name="localPoint"/> (pixels from the element's top-left) of an untransformed element
        /// whose panel-space rectangle is <paramref name="worldBound"/>.
        /// </summary>
        public static Vector2 ScreenUv(Rect worldBound, Vector2 panelSize, Vector2 localPoint)
        {
            return PanelToUv(worldBound.position + localPoint, panelSize);
        }

        /// <summary>
        /// Scales corner radii (x = top-left, y = top-right, z = bottom-right, w = bottom-left) down uniformly so
        /// adjacent radii never exceed the side they share (CSS border-radius rule). Negative radii become 0.
        /// </summary>
        public static Vector4 ClampRadii(Vector4 radii, Vector2 size)
        {
            radii = Vector4.Max(radii, Vector4.zero);
            float scale = 1f;
            scale = Mathf.Min(scale, SideScale(size.x, radii.x + radii.y));
            scale = Mathf.Min(scale, SideScale(size.x, radii.w + radii.z));
            scale = Mathf.Min(scale, SideScale(size.y, radii.x + radii.w));
            scale = Mathf.Min(scale, SideScale(size.y, radii.y + radii.z));
            return radii * scale;
        }

        /// <summary>
        /// Writes a convex rounded-rect fan into <paramref name="output"/>: index 0 is the centre, then the perimeter
        /// runs clockwise on screen (Y down) from the top-left arc through top-right, bottom-right and bottom-left.
        /// Every corner always emits (segments + 1) points (coincident when its radius is 0), so the count is fixed.
        /// Returns the number of points written (<see cref="FanVertexCount"/>), or 0 if <paramref name="output"/> is too small.
        /// Pair with indices (0, i, i + 1) for i in 1..n-1, wrapping the last perimeter point to 1.
        /// </summary>
        public static int BuildRoundedRectFan(Rect rect, Vector4 radii, int segmentsPerCorner, Vector2[] output)
        {
            int segments = Mathf.Max(1, segmentsPerCorner);
            int count = FanVertexCount(segments);
            if (output == null || output.Length < count)
                return 0;

            Vector4 r = ClampRadii(radii, rect.size);
            output[0] = rect.center;
            int write = 1;
            // Angles in degrees with Y down: 0 = right, 90 = down, so increasing angle is clockwise on screen.
            write = WriteArc(output, write, new Vector2(rect.xMin + r.x, rect.yMin + r.x), r.x, 180f, segments);
            write = WriteArc(output, write, new Vector2(rect.xMax - r.y, rect.yMin + r.y), r.y, 270f, segments);
            write = WriteArc(output, write, new Vector2(rect.xMax - r.z, rect.yMax - r.z), r.z, 0f, segments);
            write = WriteArc(output, write, new Vector2(rect.xMin + r.w, rect.yMax - r.w), r.w, 90f, segments);
            return write;
        }

        /// <summary>
        /// True when the blurred copy was written recently enough to sample: stamp > 0 and
        /// 0 &lt;= currentFrame - stamp &lt;= maxLag. A stamp from the future (frame counter reset) counts as stale.
        /// </summary>
        public static bool IsFrameFresh(float lastWrittenFrame, int currentFrame, int maxLag)
        {
            if (lastWrittenFrame <= 0f)
                return false;
            float lag = currentFrame - lastWrittenFrame;
            return lag >= 0f && lag <= maxLag;
        }

        private static float SideScale(float side, float radiusSum)
        {
            return radiusSum > side && radiusSum > 0f ? Mathf.Max(0f, side) / radiusSum : 1f;
        }

        private static int WriteArc(Vector2[] output, int write, Vector2 centre, float radius, float startDeg, int segments)
        {
            float step = 90f / segments;
            for (int i = 0; i <= segments; i++)
            {
                float rad = (startDeg + step * i) * Mathf.Deg2Rad;
                output[write++] = centre + new Vector2(Mathf.Cos(rad), Mathf.Sin(rad)) * radius;
            }
            return write;
        }
    }
}
