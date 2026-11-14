using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor
{
    /// <summary>
    /// A vehicle assembled from rocket-kit parts, as stored in <c>Kit/*.vehicle.json</c>.
    /// Positions are Blender kit coordinates in metres (+Z up = stack axis, AUTHORING.md); the
    /// assembler converts them to Unity (+Y up). This is presentation only: no rule or
    /// performance number is derived from it.
    /// </summary>
    [Serializable]
    public sealed class KitVehicleSpec
    {
        [JsonProperty("vehicle_id")] public string VehicleId;
        [JsonProperty("parts")] public List<KitPlacement> Parts = new List<KitPlacement>();
    }

    [Serializable]
    public sealed class KitPlacement
    {
        /// <summary>Kit part ID = FBX file name in the Kit folder.</summary>
        [JsonProperty("part_id")] public string PartId;

        /// <summary>Origin of the part in kit coordinates, metres: [x, y, z] with z up.</summary>
        [JsonProperty("position_m")] public float[] PositionM = { 0f, 0f, 0f };

        /// <summary>Rotation about the stack axis in degrees.</summary>
        [JsonProperty("yaw_deg")] public float YawDeg;
    }

    public static class KitVehicleAssembler
    {
        /// <summary>Kit (Blender, Z up, +Y forward) to Unity (Y up) for a model imported with bakeAxisConversion.</summary>
        public static Vector3 KitToUnity(float[] p) => new Vector3(-p[0], p[2], -p[1]);

        public static KitVehicleSpec Load(string assetPath)
        {
            string full = Path.GetFullPath(assetPath);
            if (!File.Exists(full)) return null;
            return JsonConvert.DeserializeObject<KitVehicleSpec>(File.ReadAllText(full));
        }

        /// <summary>
        /// Instantiates every part of <paramref name="spec"/> under a new root. Parts whose FBX is not
        /// imported yet are skipped and named in <paramref name="missing"/>; nothing is faked.
        /// </summary>
        public static GameObject Assemble(KitVehicleSpec spec, Transform parent, List<string> missing)
        {
            var root = new GameObject("Vehicle_" + spec.VehicleId);
            root.transform.SetParent(parent, false);
            foreach (KitPlacement placement in spec.Parts)
            {
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(RocketKitImport.KitFolder + "/" + placement.PartId + ".fbx");
                if (model == null)
                {
                    missing?.Add(placement.PartId);
                    continue;
                }
                var part = (GameObject)PrefabUtility.InstantiatePrefab(model, root.transform);
                part.name = placement.PartId;
                part.transform.localPosition = KitToUnity(placement.PositionM);
                part.transform.localRotation = Quaternion.Euler(0f, -placement.YawDeg, 0f);
            }
            return root;
        }

        /// <summary>World-space bounds of every renderer under <paramref name="root"/>.</summary>
        public static Bounds RendererBounds(GameObject root)
        {
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0) return new Bounds(root.transform.position, Vector3.zero);
            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            return bounds;
        }
    }
}
