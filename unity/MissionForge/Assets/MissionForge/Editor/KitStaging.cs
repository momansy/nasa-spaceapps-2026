using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace MissionForge.Editor
{
    /// <summary>
    /// Puts the assembled kit vehicle into the generated scenes: on a launch pad in the Build Bay and
    /// as the rocket silhouette on the right of the title frame (STYLE_GUIDE.md shot direction).
    /// The space backdrop uses 1 unit = 1000 km, so both vehicles are dioramas placed in front of
    /// the screen's camera vantage and scaled down; every size and distance here is a game_value.
    /// </summary>
    public static class KitStaging
    {
        public const string DemoVehiclePath = RocketKitImport.KitFolder + "/demo.vehicle.json";

        // Build Bay framing (game values). Distance in scene units, scale in scene units per metre.
        private const float BayDistanceUnits = 9.0f;
        private const float BayVehicleFrameHeight = 0.64f; // Vehicle height as a fraction of the frame height.
        private const float DeckRadiusM = 17f;
        private const float DeckThicknessM = 2.4f;
        private const float MountClearanceM = 3.0f;        // Deck to lowest engine exit.

        // Title framing (game values).
        private const float TitleDistanceUnits = 10.5f;
        private const float TitleRightOffset = 0.58f;       // Fraction of the half-width, right of centre.
        private const float TitleUpOffset = 0.06f;          // Fraction of the half-height, above centre.
        private const float TitleVehicleFrameHeight = 0.50f;
        private const float TitlePitchDeg = 9f;             // Gentle gravity-turn lean towards the right.

        // Light colours: 4500 K warm key and 8000 K cool fill from STYLE_GUIDE.md, about 4:1 (game values).
        private static readonly Color WarmKey = new Color(1.00f, 0.80f, 0.62f);
        private static readonly Color CoolFill = new Color(0.80f, 0.86f, 1.00f);

        public static void AddBuildBayPad(Transform screenRoot, Transform vantage)
        {
            KitVehicleSpec spec = KitVehicleAssembler.Load(DemoVehiclePath);
            var stage = new GameObject("BuildBayPad");
            stage.transform.SetParent(screenRoot, false);

            float frameHeight = FrameHeight(BayDistanceUnits);
            Vector3 forwardFlat = Vector3.ProjectOnPlane(vantage.forward, Vector3.up).normalized;

            // Assemble and measure while the stage is at the origin with identity rotation and scale,
            // so the bounds are in stage-local metres.
            var missing = new List<string>();
            GameObject vehicle = spec != null ? KitVehicleAssembler.Assemble(spec, stage.transform, missing) : null;
            float heightM = 60f;
            if (vehicle != null)
            {
                Bounds b = KitVehicleAssembler.RendererBounds(vehicle);
                heightM = Mathf.Max(b.size.y, 1f);
                vehicle.transform.localPosition = new Vector3(-b.center.x, MountClearanceM - b.min.y, -b.center.z);
            }
            BuildPad(stage.transform, vehicle);

            float scale = frameHeight * BayVehicleFrameHeight / (heightM + MountClearanceM);
            stage.transform.localScale = Vector3.one * scale;
            stage.transform.position = vantage.position + vantage.forward * BayDistanceUnits - vantage.up * (frameHeight * 0.27f);
            stage.transform.rotation = Quaternion.LookRotation(-forwardFlat, Vector3.up);
            AddLight(stage.transform, "BayKey", WarmKey, 1.5f, Quaternion.LookRotation(vantage.forward * 0.6f + vantage.right * 0.65f - Vector3.up * 0.45f));
            AddLight(stage.transform, "BayFill", CoolFill, 0.38f, Quaternion.LookRotation(vantage.forward * 0.4f - vantage.right * 0.8f - Vector3.up * 0.1f));
            Report("Build Bay", spec, missing);
        }

        public static void AddTitleVehicle(Transform screenRoot, Transform vantage)
        {
            KitVehicleSpec spec = KitVehicleAssembler.Load(DemoVehiclePath);
            if (spec == null)
            {
                Debug.LogWarning("[MissionForge] No " + DemoVehiclePath + "; the title frame has no rocket silhouette.");
                return;
            }
            var rig = new GameObject("TitleVehicle");
            rig.transform.SetParent(screenRoot, false);

            // Assemble and measure at identity first so the bounds are in rig-local metres.
            var missing = new List<string>();
            GameObject vehicle = KitVehicleAssembler.Assemble(spec, rig.transform, missing);
            Bounds b = KitVehicleAssembler.RendererBounds(vehicle);
            vehicle.transform.localPosition = -b.center;

            float frameHeight = FrameHeight(TitleDistanceUnits);
            float halfWidth = frameHeight * 0.5f * (16f / 9f);
            rig.transform.position = vantage.position + vantage.forward * TitleDistanceUnits
                                     + vantage.right * (halfWidth * TitleRightOffset)
                                     + vantage.up * (frameHeight * 0.5f * TitleUpOffset);
            rig.transform.rotation = Quaternion.LookRotation(-vantage.forward, vantage.up) * Quaternion.Euler(0f, 0f, TitlePitchDeg);

            rig.transform.localScale = Vector3.one * (frameHeight * TitleVehicleFrameHeight / Mathf.Max(b.size.y, 1f));
            AddLight(rig.transform, "TitleRim", WarmKey, 0.9f, Quaternion.LookRotation(vantage.forward + vantage.right * 0.9f - vantage.up * 0.2f));
            AddLight(rig.transform, "TitleFill", CoolFill, 0.22f, Quaternion.LookRotation(vantage.forward - vantage.right * 0.5f));
            Report("Title", spec, missing);
        }

        private static float FrameHeight(float distance) => 2f * distance * Mathf.Tan(0.5f * 34f * Mathf.Deg2Rad);

        private static void BuildPad(Transform stage, GameObject vehicle)
        {
            Dictionary<string, Material> kit = RocketKitImport.EnsureMaterials();
            Material deck = PadMaterial("Pad_deck", "#18293A", 0.10f, 0.32f, Color.black);
            ColorUtility.TryParseHtmlString("#55C5CD", out Color signal);
            Material marking = PadMaterial("Pad_marking", "#55C5CD", 0.0f, 0.4f, signal * 0.8f);

            var pad = new GameObject("Pad");
            pad.transform.SetParent(stage, false);
            Cylinder(pad.transform, "Deck", deck, DeckRadiusM, DeckThicknessM, -DeckThicknessM * 0.5f);
            Cylinder(pad.transform, "DeckLip", kit["detail_dark"], DeckRadiusM + 0.6f, 0.8f, -DeckThicknessM + 0.4f);
            Cylinder(pad.transform, "Marking", marking, DeckRadiusM - 1.2f, 0.06f, 0.03f, 0.4f);
            Cylinder(pad.transform, "MarkingInner", deck, DeckRadiusM - 1.6f, 0.08f, 0.04f);

            // Four hold-down posts from the deck to the bottom of the first stage, clear of the engines.
            float postTop = MountClearanceM + 4f;
            float postRadius = 2.6f;
            if (vehicle != null)
            {
                Bounds stack = StackBounds(vehicle); // Stage is still at identity here: metres.
                postTop = Mathf.Max(stack.min.y, 0.5f);
                postRadius = Mathf.Max(stack.extents.z * 0.92f, 1.5f);
            }
            for (int i = 0; i < 4; i++)
            {
                float angle = (45f + 90f * i) * Mathf.Deg2Rad;
                var post = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.DestroyImmediate(post.GetComponent<Collider>());
                post.name = "HoldDown" + i;
                post.transform.SetParent(pad.transform, false);
                post.transform.localPosition = new Vector3(Mathf.Cos(angle) * postRadius, postTop * 0.5f, Mathf.Sin(angle) * postRadius);
                post.transform.localRotation = Quaternion.Euler(0f, -angle * Mathf.Rad2Deg, 0f);
                post.transform.localScale = new Vector3(1.1f, postTop, 0.8f);
                post.GetComponent<MeshRenderer>().sharedMaterial = kit["detail_dark"];
            }
        }

        /// <summary>Bounds of the stack without the engines (engine part IDs start with "eng_").</summary>
        private static Bounds StackBounds(GameObject vehicle)
        {
            bool any = false;
            var bounds = new Bounds();
            foreach (Transform part in vehicle.transform)
            {
                if (part.name.StartsWith("eng_") || part.name.StartsWith("booster_")) continue;
                Bounds b = KitVehicleAssembler.RendererBounds(part.gameObject);
                if (b.size == Vector3.zero) continue;
                if (!any) { bounds = b; any = true; } else bounds.Encapsulate(b);
            }
            return any ? bounds : KitVehicleAssembler.RendererBounds(vehicle);
        }

        private static void Cylinder(Transform parent, string name, Material material, float radiusM, float heightM, float centreYM, float emissionBoost = 0f)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Object.DestroyImmediate(go.GetComponent<Collider>());
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0f, centreYM, 0f);
            go.transform.localScale = new Vector3(radiusM * 2f, heightM * 0.5f, radiusM * 2f); // Unity cylinder: 1 m wide, 2 m tall.
            var renderer = go.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
        }

        private static Material PadMaterial(string name, string hex, float metallic, float smoothness, Color emission)
        {
            string path = RocketKitImport.MaterialFolder + "/" + name + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(material, path);
            }
            ColorUtility.TryParseHtmlString(hex, out Color colour);
            material.SetColor("_BaseColor", colour);
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Smoothness", smoothness);
            if (emission.maxColorComponent > 0f)
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", emission);
                material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            }
            EditorUtility.SetDirty(material);
            return material;
        }

        private static void AddLight(Transform parent, string name, Color colour, float intensity, Quaternion rotation)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.rotation = rotation;
            var light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = colour;
            light.intensity = intensity;
            light.shadows = LightShadows.None;
        }

        private static void Report(string where, KitVehicleSpec spec, List<string> missing)
        {
            if (spec == null)
            {
                Debug.LogWarning("[MissionForge] " + where + ": no kit vehicle at " + DemoVehiclePath + "; pad shown empty.");
            }
            else if (missing.Count > 0)
            {
                Debug.LogWarning("[MissionForge] " + where + ": kit parts not imported yet: " + string.Join(", ", missing));
            }
        }
    }
}
