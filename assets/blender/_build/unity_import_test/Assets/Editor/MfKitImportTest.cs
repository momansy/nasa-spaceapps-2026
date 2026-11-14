// MissionForge kit: Unity import check (task T006).
//
// Not part of the game project. Copy (or symlink) this file into the Assets/Editor folder
// of any URP project whose Assets/Art folder is unity/MissionForge/Assets/Art, then run:
//
//   Unity -batchmode -projectPath <project> -executeMethod MfKitImportTest.Run -quit
//         -mfRepo <repo root> -logFile -
//
// It (1) creates the shared slot materials in Assets/Art/Materials if they are missing,
// (2) applies the import settings and material remaps to every FBX in Assets/Art/Models,
// (3) checks scale, orientation and attach points of every prefab against
//     assets/blender/_build/unity_expect.json (written by the Blender kit),
// (4) assembles the vehicles of assets/blender/assembly_test.json using only the attach
//     empties and (5) saves screenshots and a report into orchestration/evidence/T006/.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class MfKitImportTest
{
    const string ModelsDir = "Assets/Art/Models";
    const string MaterialsDir = "Assets/Art/Materials";
    const float Tol = 0.005f; // metres

    [Serializable] class ExpectEmpty { public string name; public float x, y, z; }
    [Serializable] class ExpectPart
    {
        public string id; public float length; public float diameter_bottom; public float[] bbox_min; public float[] bbox_max;
        public ExpectEmpty[] empties;
    }
    [Serializable] class ExpectFile { public ExpectPart[] parts; }

    [Serializable] class Side { public string core; public float azimuth_deg; public string @base; public float dz; }
    [Serializable] class Step { public string key; public string part; public string stack_on; public string hang_from; public Side side; }
    [Serializable] class Vehicle { public string name; public Step[] parts; }
    [Serializable] class AssemblyFile { public Vehicle[] vehicles; }

    struct Look { public string name; public Color linear; public float metallic; public float roughness; }

    // Linear colours; identical to MATERIAL_LOOK in assets/blender/scripts/mfkit/pipeline.py.
    static readonly Look[] Looks =
    {
        new Look { name = "hull", linear = new Color(0.807f, 0.855f, 0.871f), metallic = 0.0f, roughness = 0.46f },
        new Look { name = "livery", linear = new Color(0.0086f, 0.138f, 0.242f), metallic = 0.0f, roughness = 0.40f },
        new Look { name = "engine_metal", linear = new Color(0.50f, 0.52f, 0.55f), metallic = 0.92f, roughness = 0.36f },
        new Look { name = "nozzle_hot", linear = new Color(0.17f, 0.135f, 0.115f), metallic = 0.82f, roughness = 0.50f },
        new Look { name = "thermal", linear = new Color(0.60f, 0.33f, 0.11f), metallic = 0.0f, roughness = 0.82f },
        new Look { name = "detail_dark", linear = new Color(0.022f, 0.030f, 0.040f), metallic = 0.15f, roughness = 0.62f },
        // Structural-material looks for the `hull` slot (design 7.10). game_value art choices.
        new Look { name = "hull_mat_aluminum_2219", linear = new Color(0.807f, 0.855f, 0.871f), metallic = 0.0f, roughness = 0.46f },
        new Look { name = "hull_mat_aluminum_lithium_2195", linear = new Color(0.62f, 0.66f, 0.70f), metallic = 0.85f, roughness = 0.38f },
        new Look { name = "hull_mat_carbon_composite", linear = new Color(0.020f, 0.022f, 0.026f), metallic = 0.10f, roughness = 0.32f },
        new Look { name = "hull_mat_stainless_steel", linear = new Color(0.63f, 0.64f, 0.65f), metallic = 1.0f, roughness = 0.20f },
    };
    static readonly string[] Slots = { "hull", "livery", "engine_metal", "nozzle_hot", "thermal", "detail_dark" };

    static string Arg(string name, string fallback)
    {
        var a = Environment.GetCommandLineArgs();
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
        return fallback;
    }

    static string Repo => Arg("-mfRepo", Path.GetFullPath(Path.Combine(Application.dataPath, "../../../../..")));
    static string Evidence => Path.Combine(Repo, "orchestration/evidence/T006");

    public static void Run()
    {
        int code = 0;
        var log = new StringBuilder();
        try
        {
            Directory.CreateDirectory(Evidence);
            AssetDatabase.Refresh();
            CreateMaterials(log);
            ConfigureImporters(log);
            var expect = JsonUtility.FromJson<ExpectFile>(File.ReadAllText(Path.Combine(Repo, "assets/blender/_build/unity_expect.json")));
            int bad = Verify(expect, log);
            if (bad > 0) code = 2;
            var asm = JsonUtility.FromJson<AssemblyFile>(File.ReadAllText(Path.Combine(Repo, "assets/blender/assembly_test.json")));
            Assemble(asm, expect, log);
        }
        catch (Exception e)
        {
            log.AppendLine("EXCEPTION " + e);
            code = 3;
        }
        File.WriteAllText(Path.Combine(Evidence, "unity_import_report.md"), log.ToString());
        Debug.Log(log.ToString());
        EditorApplication.Exit(code);
    }

    static void CreateMaterials(StringBuilder log)
    {
        if (!AssetDatabase.IsValidFolder(MaterialsDir)) AssetDatabase.CreateFolder("Assets/Art", "Materials");
        var shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null) throw new Exception("URP Lit shader not found");
        foreach (var look in Looks)
        {
            string path = $"{MaterialsDir}/{look.name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            bool isNew = mat == null;
            if (isNew) mat = new Material(shader);
            mat.shader = shader;
            Color c = look.linear.gamma; c.a = 1f;
            mat.SetColor("_BaseColor", c);
            mat.SetFloat("_Metallic", look.metallic);
            mat.SetFloat("_Smoothness", 1f - look.roughness);
            if (look.name == "nozzle_hot")
            {
                // the game raises _EmissionColor with engine heat (vertex colour R = heat mask)
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", Color.black);
                mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            }
            if (isNew) AssetDatabase.CreateAsset(mat, path); else EditorUtility.SetDirty(mat);
        }
        AssetDatabase.SaveAssets();
        log.AppendLine($"# Unity import report (Unity {Application.unityVersion})\n");
        log.AppendLine($"Shared materials in `{MaterialsDir}`: {string.Join(", ", Looks.Select(l => l.name))}\n");
    }

    static void ConfigureImporters(StringBuilder log)
    {
        var mats = Slots.ToDictionary(s => s, s => AssetDatabase.LoadAssetAtPath<Material>($"{MaterialsDir}/{s}.mat"));
        var guids = AssetDatabase.FindAssets("t:Model", new[] { ModelsDir });
        int n = 0;
        foreach (var guid in guids)
        {
            string path = AssetDatabase.GUIDToAssetPath(guid);
            var mi = AssetImporter.GetAtPath(path) as ModelImporter;
            if (mi == null) continue;
            mi.globalScale = 1f;
            mi.useFileScale = true;
            mi.bakeAxisConversion = false;
            mi.importCameras = false;
            mi.importLights = false;
            mi.importBlendShapes = false;
            mi.importVisibility = false;
            mi.animationType = ModelImporterAnimationType.None;
            mi.importAnimation = false;
            mi.isReadable = false;
            mi.meshCompression = ModelImporterMeshCompression.Off;
            mi.importNormals = ModelImporterNormals.Import;
            mi.importTangents = ModelImporterTangents.CalculateMikk;
            mi.generateSecondaryUV = false;
            mi.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            mi.materialLocation = ModelImporterMaterialLocation.InPrefab;
            foreach (var kv in mats)
                mi.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), kv.Key), kv.Value);
            mi.SaveAndReimport();
            n++;
        }
        log.AppendLine($"Configured {n} FBX importers (scale 1, file scale on, no animation, slot materials remapped to the shared assets).\n");
    }

    static Bounds Lod0Bounds(GameObject go)
    {
        var rs = go.GetComponentsInChildren<MeshRenderer>().Where(r => r.name.EndsWith("_LOD0")).ToArray();
        if (rs.Length == 0) rs = go.GetComponentsInChildren<MeshRenderer>();
        var b = rs[0].bounds;
        foreach (var r in rs) b.Encapsulate(r.bounds);
        return b;
    }

    // Blender (x, y, z), Z up  ->  Unity. Candidates are tested against the attach empties.
    static readonly (string name, Func<Vector3, Vector3> f)[] Mappings =
    {
        ("unity = (-x, z, -y)", v => new Vector3(-v.x, v.z, -v.y)),
        ("unity = (x, z, y)", v => new Vector3(v.x, v.z, v.y)),
        ("unity = (x, z, -y)", v => new Vector3(v.x, v.z, -v.y)),
        ("unity = (-x, z, y)", v => new Vector3(-v.x, v.z, v.y)),
    };
    static int mappingIndex = -1;
    static Vector3 Map(Vector3 blender) => Mappings[Mathf.Max(0, mappingIndex)].f(blender);

    static int Verify(ExpectFile expect, StringBuilder log)
    {
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        // find the axis mapping from the parts that have off-axis empties
        var votes = new int[Mappings.Length];
        var instances = new Dictionary<string, GameObject>();
        foreach (var p in expect.parts)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"{ModelsDir}/{p.id}.fbx");
            if (prefab == null) continue;
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            instances[p.id] = go;
            foreach (var e in p.empties)
            {
                if (Mathf.Abs(e.x) < 0.01f && Mathf.Abs(e.y) < 0.01f) continue;
                var t = FindDeep(go.transform, e.name);
                if (t == null) continue;
                for (int m = 0; m < Mappings.Length; m++)
                    if ((Mappings[m].f(new Vector3(e.x, e.y, e.z)) - t.position).magnitude < Tol) votes[m]++;
            }
        }
        mappingIndex = Array.IndexOf(votes, votes.Max());
        log.AppendLine($"Axis mapping found from off-axis attach empties: **{Mappings[mappingIndex].name}** (votes {string.Join("/", votes)}). The long axis (Blender +Z) is Unity +Y.\n");
        log.AppendLine("| Part | root scale | root rotation | LODGroup | height Y (m) | expected (m) | attach points | materials remapped | result |");
        log.AppendLine("|---|---|---|---|---|---|---|---|---|");
        int bad = 0;
        foreach (var p in expect.parts)
        {
            if (!instances.TryGetValue(p.id, out var go)) { log.AppendLine($"| {p.id} | MISSING FBX | | | | | | | FAIL |"); bad++; continue; }
            bool ok = true;
            bool scaleOk = go.GetComponentsInChildren<Transform>().All(t => (t.lossyScale - Vector3.one).magnitude < 1e-4f);
            bool rotOk = go.GetComponentsInChildren<Transform>().All(t => Quaternion.Angle(t.rotation, Quaternion.identity) < 0.01f);
            bool lod = go.GetComponent<LODGroup>() != null && go.GetComponent<LODGroup>().lodCount >= 2;
            var b = Lod0Bounds(go);
            float expMinY = p.bbox_min[2], expMaxY = p.bbox_max[2];
            bool hOk = Mathf.Abs(b.min.y - expMinY) < Tol && Mathf.Abs(b.max.y - expMaxY) < Tol;
            // horizontal extents under the mapping
            Vector3 a0 = Map(new Vector3(p.bbox_min[0], p.bbox_min[1], 0)), a1 = Map(new Vector3(p.bbox_max[0], p.bbox_max[1], 0));
            bool wOk = Mathf.Abs(Mathf.Min(a0.x, a1.x) - b.min.x) < Tol && Mathf.Abs(Mathf.Max(a0.x, a1.x) - b.max.x) < Tol
                    && Mathf.Abs(Mathf.Min(a0.z, a1.z) - b.min.z) < Tol && Mathf.Abs(Mathf.Max(a0.z, a1.z) - b.max.z) < Tol;
            int attOk = 0;
            foreach (var e in p.empties)
            {
                var t = FindDeep(go.transform, e.name);
                if (t != null && (Map(new Vector3(e.x, e.y, e.z)) - t.position).magnitude < Tol) attOk++;
            }
            bool matsOk = go.GetComponentsInChildren<MeshRenderer>().SelectMany(r => r.sharedMaterials)
                .All(m => m != null && AssetDatabase.GetAssetPath(m).StartsWith(MaterialsDir));
            ok = scaleOk && rotOk && lod && hOk && wOk && attOk == p.empties.Length && matsOk;
            if (!ok) bad++;
            log.AppendLine($"| {p.id} | {(scaleOk ? "1" : "NOT 1")} | {(rotOk ? "identity" : "ROTATED")} | {(lod ? "yes" : "NO")} | {b.min.y:F3}..{b.max.y:F3} | {expMinY:F3}..{expMaxY:F3}{(wOk ? "" : " WIDTH MISMATCH")} | {attOk}/{p.empties.Length} | {(matsOk ? "yes" : "NO")} | {(ok ? "ok" : "FAIL")} |");
        }
        log.AppendLine($"\n**{expect.parts.Length - bad} of {expect.parts.Length} parts pass** (tolerance {Tol * 1000f:F0} mm).\n");
        foreach (var go in instances.Values) UnityEngine.Object.DestroyImmediate(go);
        return bad;
    }

    static Transform FindDeep(Transform root, string name)
    {
        foreach (var t in root.GetComponentsInChildren<Transform>()) if (t.name == name) return t;
        return null;
    }

    static Vector3 Resolve(Dictionary<string, GameObject> placed, string reference)
    {
        int dot = reference.IndexOf('.');
        string key = reference.Substring(0, dot), name = reference.Substring(dot + 1);
        var go = placed[key];
        return name == "origin" ? go.transform.position : FindDeep(go.transform, name).position;
    }

    static void Assemble(AssemblyFile asm, ExpectFile expect, StringBuilder log)
    {
        var dia = expect.parts.ToDictionary(p => p.id, p => p.diameter_bottom);
        log.AppendLine("## Assembled vehicles (built from attach empties only)\n");
        foreach (var v in asm.vehicles)
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var placed = new Dictionary<string, GameObject>();
            var partOf = new Dictionary<string, string>();
            var root = new GameObject(v.name);
            foreach (var s in v.parts)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"{ModelsDir}/{s.part}.fbx");
                if (prefab == null) throw new Exception("missing prefab " + s.part);
                var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                go.name = s.key + " (" + s.part + ")";
                go.transform.SetParent(root.transform, false);
                var lg = go.GetComponent<LODGroup>();
                if (lg != null) lg.ForceLOD(0);
                if (!string.IsNullOrEmpty(s.stack_on))
                    go.transform.position = Resolve(placed, s.stack_on);
                else if (!string.IsNullOrEmpty(s.hang_from))
                    go.transform.position = Resolve(placed, s.hang_from) - FindDeep(go.transform, "attach_top").localPosition;
                else if (s.side != null && !string.IsNullOrEmpty(s.side.core))
                {
                    var core = placed[s.side.core];
                    float coreR = dia[partOf[s.side.core]] / 2f;
                    float az = s.side.azimuth_deg * Mathf.Deg2Rad;
                    Vector3 outDir = Map(new Vector3(Mathf.Cos(az), Mathf.Sin(az), 0f)).normalized;
                    Vector3 att = FindDeep(go.transform, "attach_side").localPosition;
                    Vector3 attH = new Vector3(att.x, 0f, att.z);
                    go.transform.rotation = Quaternion.FromToRotation(attH.normalized, -outDir);
                    Vector3 basePos = Resolve(placed, s.side.@base);
                    Vector3 axis = core.transform.position;
                    Vector3 centre = new Vector3(axis.x, 0f, axis.z) + outDir * (coreR + attH.magnitude);
                    go.transform.position = new Vector3(centre.x, basePos.y + s.side.dz, centre.z);
                }
                placed[s.key] = go;
                partOf[s.key] = s.part;
            }
            // ground the vehicle
            var rs = root.GetComponentsInChildren<MeshRenderer>().Where(r => r.name.EndsWith("_LOD0")).ToArray();
            var b = rs[0].bounds; foreach (var r in rs) b.Encapsulate(r.bounds);
            root.transform.position -= new Vector3(0f, b.min.y, 0f);
            b.center -= new Vector3(0f, b.min.y, 0f);
            log.AppendLine($"- **{v.name}**: {v.parts.Length} parts, height {b.size.y:F2} m, width {Mathf.Max(b.size.x, b.size.z):F2} m. Screenshot `unity_{v.name}.png`.");
            Screenshot(b, Path.Combine(Evidence, $"unity_{v.name}.png"));
        }
    }

    static void Screenshot(Bounds b, string path)
    {
        var lightGo = new GameObject("Key light");
        var l = lightGo.AddComponent<Light>();
        l.type = LightType.Directional; l.intensity = 1.6f; l.color = new Color(1f, 0.93f, 0.82f);
        l.shadows = LightShadows.Soft;
        lightGo.transform.rotation = Quaternion.Euler(38f, 135f, 0f);
        var fillGo = new GameObject("Fill light");
        var f = fillGo.AddComponent<Light>();
        f.type = LightType.Directional; f.intensity = 0.45f; f.color = new Color(0.72f, 0.84f, 1f); f.shadows = LightShadows.None;
        fillGo.transform.rotation = Quaternion.Euler(10f, -60f, 0f);
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.20f, 0.24f, 0.30f);

        const int W = 1080, H = 1920;
        var camGo = new GameObject("Camera");
        var cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.027f, 0.082f, 0.133f); // style guide "Space" #071522
        cam.fieldOfView = 20f;
        cam.aspect = (float)W / H;
        Vector3 dir = new Vector3(-0.75f, 0.22f, -0.62f).normalized;
        float halfH = b.extents.y * 1.08f, halfW = Mathf.Max(b.extents.x, b.extents.z) * 1.6f;
        float fovV = cam.fieldOfView * Mathf.Deg2Rad;
        float dist = Mathf.Max(halfH / Mathf.Tan(fovV / 2f), halfW / (Mathf.Tan(fovV / 2f) * cam.aspect)) + b.extents.magnitude * 0.3f;
        camGo.transform.position = b.center + dir * dist;
        camGo.transform.LookAt(b.center);
        cam.nearClipPlane = Mathf.Max(0.1f, dist * 0.05f);
        cam.farClipPlane = dist * 3f;
        var rt = new RenderTexture(W, H, 24, RenderTextureFormat.ARGB32) { antiAliasing = 8 };
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, W, H), 0, 0);
        tex.Apply();
        File.WriteAllBytes(path, tex.EncodeToPNG());
        RenderTexture.active = null;
        cam.targetTexture = null;
    }
}
