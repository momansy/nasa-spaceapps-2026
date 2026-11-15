using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// Procedural meshes for the T034 environment, saved under <c>Art/Environment/LaunchPad/Meshes/</c>. Coordinates are
    /// metres in the bay's local frame (pad axis at the origin, +Y up, the vantage looks roughly along +Z). Every
    /// dimension is a game_value layout choice; nothing here is a physical site survey. UV0 is metric (1 UV = 1 m).
    /// </summary>
    public static class BayDressingMeshes
    {
        /// <summary>Vantage forward on the ground plane (BayStage.VantageAzimuthDeg −14°).</summary>
        public static readonly Vector3 Forward = Quaternion.Euler(0f, BayStage.VantageAzimuthDeg, 0f) * Vector3.forward;
        /// <summary>Distance of the shoreline ahead of the pad along <see cref="Forward"/>, m.</summary>
        public const float ShoreM = 560f;
        /// <summary>Grade (top of the old site ground) and the still-water level, m.</summary>
        public const float GradeY = -0.42f, SeaY = -1.1f;
        /// <summary>Apron edge (deck circumradius 44 m) and the outer edge of the gravel verge, m.</summary>
        public const float ApronR = 44f, GravelR = 82f;
        /// <summary>Height the far sea edge is lifted to, m: above the highest vantage eye (about 26 m above grade).</summary>
        public const float HorizonLiftM = 40f;

        public static Mesh Save(Mesh mesh, string name)
        {
            string path = BayDressingAssets.MeshesDir + "/" + name + ".asset";
            mesh.name = name;
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing == null)
            {
                AssetDatabase.CreateAsset(mesh, path);
                return mesh;
            }
            EditorUtility.CopySerialized(mesh, existing);
            EditorUtility.SetDirty(existing);
            return existing;
        }

        /// <summary>Signed distance past the (gently curving) shoreline; &gt; 0 is sea.</summary>
        public static float PastShore(float x, float z)
        {
            Vector3 right = Vector3.Cross(Vector3.up, Forward);
            float along = x * Forward.x + z * Forward.z;
            float across = x * right.x + z * right.z;
            float shore = ShoreM + 70f * Mathf.Sin(across * 0.0042f + 0.6f) + 25f * Mathf.Sin(across * 0.013f + 1.9f);
            return along - shore;
        }

        /// <summary>Terrain height: flat at grade near the pad, low scrub dunes further out, a beach down to the sea.</summary>
        public static float Height(float x, float z)
        {
            float r = Mathf.Sqrt(x * x + z * z);
            float flat = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(GravelR + 10f, GravelR + 120f, r));
            float dunes = 1.6f * Mathf.PerlinNoise(x * 0.006f + 11.3f, z * 0.006f + 4.1f) + 0.6f * Mathf.PerlinNoise(x * 0.02f + 2.7f, z * 0.02f + 8.8f);
            float past = PastShore(x, z);
            float beach = Mathf.Clamp01((past + 60f) / 90f);           // 0 inland → 1 under water
            float h = GradeY + flat * dunes * (1f - beach);
            return Mathf.Lerp(h, SeaY - 2.5f, Mathf.SmoothStep(0f, 1f, beach));
        }

        /// <summary>Terrain grid (submesh 0 scrub, 1 sand) with a hole-free cover of the old site disc.</summary>
        public static Mesh Terrain(float halfSize = 1600f, int cells = 192)
        {
            int n = cells + 1;
            var v = new Vector3[n * n];
            var uv = new Vector2[n * n];
            float step = 2f * halfSize / cells;
            for (int j = 0; j < n; j++)
            for (int i = 0; i < n; i++)
            {
                float x = -halfSize + i * step, z = -halfSize + j * step;
                v[j * n + i] = new Vector3(x, Height(x, z), z);
                uv[j * n + i] = new Vector2(x, z);
            }
            var scrub = new List<int>();
            var sand = new List<int>();
            for (int j = 0; j < cells; j++)
            for (int i = 0; i < cells; i++)
            {
                int a = j * n + i, b = a + 1, c = a + n, d = c + 1;
                float cx = -halfSize + (i + 0.5f) * step, cz = -halfSize + (j + 0.5f) * step;
                if (PastShore(cx, cz) > 60f) continue;                       // under the sea: no terrain needed
                List<int> list = PastShore(cx, cz) > -45f ? sand : scrub;
                list.AddRange(new[] { a, c, b, b, c, d });
            }
            var mesh = new Mesh { indexFormat = IndexFormat.UInt32, vertices = v, uv = uv, subMeshCount = 2 };
            mesh.SetTriangles(scrub, 0);
            mesh.SetTriangles(sand, 1);
            mesh.RecalculateNormals();
            mesh.RecalculateTangents();
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>Flat annulus from <paramref name="inner"/> to <paramref name="outer"/> at height <paramref name="y"/>.</summary>
        public static Mesh Annulus(float inner, float outer, float y, int segments = 96)
        {
            var v = new List<Vector3>();
            var uv = new List<Vector2>();
            var t = new List<int>();
            for (int k = 0; k <= segments; k++)
            {
                float a = 2f * Mathf.PI * k / segments;
                float ca = Mathf.Cos(a), sa = Mathf.Sin(a);
                // Ragged outer edge so the verge does not read as a drawn circle.
                float o = outer + 5f * Mathf.PerlinNoise(k * 0.21f, 3.1f) - 2.5f;
                v.Add(new Vector3(inner * ca, y, inner * sa));
                v.Add(new Vector3(o * ca, y, o * sa));
                uv.Add(new Vector2(inner * ca, inner * sa));
                uv.Add(new Vector2(o * ca, o * sa));
                if (k == segments) continue;
                int i0 = 2 * k;
                t.AddRange(new[] { i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3 });
            }
            return Finish(v, uv, t);
        }

        /// <summary>Sea surface: a subdivided plane from just inside the shore to the horizon (fog is per vertex).</summary>
        public static Mesh Ocean(float nearM, float farM, float halfWidthM, int along = 48, int across = 32)
        {
            Vector3 right = Vector3.Cross(Vector3.up, Forward);
            var v = new List<Vector3>();
            var uv = new List<Vector2>();
            var t = new List<int>();
            for (int j = 0; j <= along; j++)
            {
                // Denser rows near the shore, where the glint and the fog gradient live.
                float f = Mathf.Pow(j / (float)along, 2f);
                float d = Mathf.Lerp(nearM, farM, f);
                for (int i = 0; i <= across; i++)
                {
                    float s = Mathf.Lerp(-halfWidthM, halfWidthM, i / (float)across);
                    Vector3 p = Forward * d + right * s;
                    // Past ~3 km the sea is fully hazed; it rises gently so its far edge meets the horizon line
                    // (the camera far plane is 6 km, and the dusk dome below the horizon is dark).
                    float rise = HorizonLiftM * Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(3000f, farM, d));
                    v.Add(new Vector3(p.x, SeaY + rise, p.z));
                    uv.Add(new Vector2(p.x, p.z));
                }
            }
            int w = across + 1;
            for (int j = 0; j < along; j++)
            for (int i = 0; i < across; i++)
            {
                int a = j * w + i, b = a + 1, c = a + w, e = c + 1;
                t.AddRange(new[] { a, c, b, b, c, e });
            }
            return Finish(v, uv, t);
        }

        /// <summary>
        /// Headland: a low coastal ridge on an arc at <paramref name="distanceM"/> from the pad, spanning bearings
        /// <paramref name="fromDeg"/>..<paramref name="toDeg"/> relative to <see cref="Forward"/> (positive = right). Its
        /// crest follows smooth noise up to <paramref name="peakM"/> and tapers to the sea at both ends; the back slope
        /// runs 300 m further out. Below the waterline it continues 6 m so no gap shows. game_value composition.
        /// </summary>
        public static Mesh Headland(float distanceM, float fromDeg, float toDeg, float peakM, int seed, int columns = 64)
        {
            var v = new List<Vector3>();
            var uv = new List<Vector2>();
            var t = new List<int>();
            float baseBearing = Mathf.Atan2(Forward.x, Forward.z) * Mathf.Rad2Deg;
            for (int i = 0; i <= columns; i++)
            {
                float f = i / (float)columns;
                float bearing = (baseBearing + Mathf.Lerp(fromDeg, toDeg, f)) * Mathf.Deg2Rad;
                var dir = new Vector3(Mathf.Sin(bearing), 0f, Mathf.Cos(bearing));
                float taper = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(f * 4f)) * Mathf.SmoothStep(0f, 1f, Mathf.Clamp01((1f - f) * 2.5f));
                float n = 0.65f * Mathf.PerlinNoise(f * 3.1f + seed, 0.37f) + 0.35f * Mathf.PerlinNoise(f * 9.7f + seed * 2f, 1.9f);
                float crest = SeaY + peakM * taper * (0.35f + 0.9f * n);
                float d = distanceM + 40f * Mathf.Sin(f * 5.3f + seed);
                v.Add(dir * d + Vector3.up * (SeaY - 6f));
                v.Add(dir * (d + 60f) + Vector3.up * crest);
                v.Add(dir * (d + 360f) + Vector3.up * (SeaY + (crest - SeaY) * 0.5f));
                uv.Add(new Vector2(f * 400f, 0f));
                uv.Add(new Vector2(f * 400f, 60f));
                uv.Add(new Vector2(f * 400f, 360f));
                if (i == columns) continue;
                int a = 3 * i;
                t.AddRange(new[] { a, a + 1, a + 3, a + 3, a + 1, a + 4, a + 1, a + 2, a + 4, a + 4, a + 2, a + 5 });
            }
            return Finish(v, uv, t);
        }

        /// <summary>
        /// Sun-glint path on the sea: a strip from <paramref name="nearM"/> to <paramref name="farM"/> along the ground
        /// direction toward the sun, widening with distance, riding just above the (lifted) sea surface. UV v runs along
        /// the path; vertex alpha fades in after the shore and out at the far end.
        /// </summary>
        public static Mesh GlintPath(Vector3 towardSun, float nearM, float farM, float nearHalfWidthM, float farHalfWidthM, int rows = 40)
        {
            Vector3 dir = new Vector3(towardSun.x, 0f, towardSun.z).normalized;
            Vector3 side = Vector3.Cross(Vector3.up, dir);
            var v = new List<Vector3>();
            var uv = new List<Vector2>();
            var col = new List<Color>();
            var t = new List<int>();
            for (int j = 0; j <= rows; j++)
            {
                float f = j / (float)rows;
                float d = Mathf.Lerp(nearM, farM, f * f);
                float hw = Mathf.Lerp(nearHalfWidthM, farHalfWidthM, f);
                float rise = HorizonLiftM * Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(3000f, 5900f, d));
                float a = Mathf.SmoothStep(0f, 1f, f * 6f) * Mathf.SmoothStep(0f, 1f, (1f - f) * 3f);
                for (int s = -1; s <= 1; s += 2)
                {
                    v.Add(dir * d + side * (s * hw) + Vector3.up * (SeaY + rise + 0.15f));
                    uv.Add(new Vector2(s < 0 ? 0f : 1f, d / 220f));
                    col.Add(new Color(1f, 1f, 1f, a));
                }
                if (j == rows) continue;
                int k = 2 * j;
                t.AddRange(new[] { k, k + 2, k + 1, k + 1, k + 2, k + 3 });
            }
            Mesh m = Finish(v, uv, t);
            m.SetColors(col);
            return m;
        }

        /// <summary>
        /// Vertical haze band on an arc of radius <paramref name="radiusM"/> centred on the pad, covering bearings
        /// ±<paramref name="halfArcDeg"/> around <see cref="Forward"/>, from <paramref name="bottomY"/> to
        /// <paramref name="topY"/>; UV v = 0 at the top, 1 at the bottom (Horizon_band.png). It softens the sea-sky line.
        /// </summary>
        public static Mesh HorizonArc(float radiusM, float halfArcDeg, float bottomY, float topY, int columns = 48)
        {
            var v = new List<Vector3>();
            var uv = new List<Vector2>();
            var t = new List<int>();
            float baseBearing = Mathf.Atan2(Forward.x, Forward.z) * Mathf.Rad2Deg;
            for (int i = 0; i <= columns; i++)
            {
                float f = i / (float)columns;
                float b = (baseBearing + Mathf.Lerp(-halfArcDeg, halfArcDeg, f)) * Mathf.Deg2Rad;
                var dir = new Vector3(Mathf.Sin(b), 0f, Mathf.Cos(b));
                v.Add(dir * radiusM + Vector3.up * topY);
                v.Add(dir * radiusM + Vector3.up * bottomY);
                uv.Add(new Vector2(f, 0f));
                uv.Add(new Vector2(f, 1f));
                if (i == columns) continue;
                int a = 2 * i;
                t.AddRange(new[] { a, a + 2, a + 1, a + 1, a + 2, a + 3 });
            }
            return Finish(v, uv, t);
        }

        /// <summary>Open cone along +Z from radius <paramref name="r0"/> to <paramref name="r1"/>; vertex alpha fades to 0.</summary>
        public static Mesh Cone(float length, float r0, float r1, float alpha0, int segments = 20)
        {
            var v = new List<Vector3>();
            var uv = new List<Vector2>();
            var col = new List<Color>();
            var t = new List<int>();
            const int rings = 6;
            for (int j = 0; j <= rings; j++)
            {
                float f = j / (float)rings;
                float r = Mathf.Lerp(r0, r1, f);
                float a = alpha0 * Mathf.Pow(1f - f, 1.6f);
                for (int k = 0; k <= segments; k++)
                {
                    float ang = 2f * Mathf.PI * k / segments;
                    v.Add(new Vector3(r * Mathf.Cos(ang), r * Mathf.Sin(ang), f * length));
                    uv.Add(new Vector2(k / (float)segments, f));
                    col.Add(new Color(1f, 1f, 1f, a));
                }
            }
            int w = segments + 1;
            for (int j = 0; j < rings; j++)
            for (int k = 0; k < segments; k++)
            {
                int a = j * w + k, b = a + 1, c = a + w, d = c + 1;
                t.AddRange(new[] { a, c, b, b, c, d });
            }
            Mesh m = Finish(v, uv, t);
            m.SetColors(col);
            return m;
        }

        /// <summary>Unit quad in XZ (1 × 1 m, centred, facing +Y) with 0..1 UVs, for decals and paint.</summary>
        public static Mesh GroundQuad()
        {
            var v = new List<Vector3> { new Vector3(-0.5f, 0f, -0.5f), new Vector3(0.5f, 0f, -0.5f), new Vector3(-0.5f, 0f, 0.5f), new Vector3(0.5f, 0f, 0.5f) };
            var uv = new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1) };
            return Finish(v, uv, new List<int> { 0, 2, 1, 1, 2, 3 });
        }

        /// <summary>Unit quad in XY facing −Z (towards the vantage) with 0..1 UVs, for glow cards.</summary>
        public static Mesh Card()
        {
            var v = new List<Vector3> { new Vector3(-0.5f, -0.5f, 0f), new Vector3(0.5f, -0.5f, 0f), new Vector3(-0.5f, 0.5f, 0f), new Vector3(0.5f, 0.5f, 0f) };
            var uv = new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1) };
            return Finish(v, uv, new List<int> { 0, 2, 1, 1, 2, 3 });
        }

        /// <summary>
        /// Copy of <paramref name="source"/> with box-projected metric UV0 (each vertex projected along its dominant normal
        /// axis), so the untextured Blender pad pieces can take tiling PBR sets. Submeshes are kept. With
        /// <paramref name="onlySubmesh"/> ≥ 0 only that submesh's vertices are re-projected and every other vertex keeps
        /// its authored UV (rework 2: the hero pieces' atlas UVs must survive the concrete projection).
        /// </summary>
        public static Mesh WithBoxUv(Mesh source, int onlySubmesh = -1)
        {
            var m = Object.Instantiate(source);
            Vector3[] v = m.vertices;
            Vector3[] n = m.normals;
            Vector2[] authored = m.uv;
            var uv = new Vector2[v.Length];
            bool[] project = new bool[v.Length];
            if (onlySubmesh < 0 || onlySubmesh >= m.subMeshCount || authored.Length != v.Length)
            {
                for (int i = 0; i < v.Length; i++) project[i] = true;
            }
            else
            {
                foreach (int i in m.GetTriangles(onlySubmesh)) project[i] = true;
            }
            for (int i = 0; i < v.Length; i++)
            {
                if (!project[i])
                {
                    uv[i] = authored[i];
                    continue;
                }
                Vector3 a = new Vector3(Mathf.Abs(n[i].x), Mathf.Abs(n[i].y), Mathf.Abs(n[i].z));
                uv[i] = a.y >= a.x && a.y >= a.z ? new Vector2(v[i].x, v[i].z)
                    : a.x >= a.z ? new Vector2(v[i].z, v[i].y) : new Vector2(v[i].x, v[i].y);
            }
            m.uv = uv;
            m.RecalculateTangents();
            return m;
        }

        private static Mesh Finish(List<Vector3> v, List<Vector2> uv, List<int> t)
        {
            var m = new Mesh { indexFormat = v.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            m.SetVertices(v);
            m.SetUVs(0, uv);
            m.SetTriangles(t, 0);
            m.RecalculateNormals();
            m.RecalculateTangents();
            m.RecalculateBounds();
            return m;
        }
    }
}
