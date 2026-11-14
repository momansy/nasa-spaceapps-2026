using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using UnityEngine;

namespace MissionForge.Vehicle
{
    /// <summary>One measured joint of an assembled rig (metres).</summary>
    public readonly struct JointMeasure
    {
        public JointMeasure(string name, string kind, float gapM, float ringMismatchM)
        {
            Name = name;
            Kind = kind;
            GapM = gapM;
            RingMismatchM = ringMismatchM;
        }

        public string Name { get; }
        /// <summary><c>stack</c>, <c>hang</c> or <c>side</c> (assemble.py joint kinds).</summary>
        public string Kind { get; }
        /// <summary>Signed vertical gap (stack, hang) or radial gap to the core skin (side).</summary>
        public float GapM { get; }
        /// <summary>|lower top ring radius − upper bottom ring radius| for stack joints; 0 otherwise.</summary>
        public float RingMismatchM { get; }

        public override string ToString() => Kind + " " + Name + " gap " + GapM.ToString("0.0000") + " m, ring " + RingMismatchM.ToString("0.0000") + " m";
    }

    /// <summary>
    /// Builds the visual vehicle for a build: <see cref="KitResolver"/> picks the kit parts and the attach rules of
    /// <c>assets/blender/scripts/mfkit/assemble.py</c> place them (stack_on, hang_from, side). Kit coordinates
    /// (Blender, +Z up, +Y forward) map to Unity as (x, z, y), which is what the FBX importer does to the kit's own
    /// empties (checked for every attach point by <c>KitEmpties_MatchTheManifestThroughKitToUnity</c>); a kit yaw θ
    /// about +Z is then a Unity yaw −θ about +Y.
    /// </summary>
    public static class VehicleAssembler
    {
        private sealed class Placed
        {
            public KitStep Step;
            public KitPartEntry Entry;
            public Vector3 KitPos;   // origin, kit coordinates (m)
            public float YawDeg;     // about kit +Z
            public Transform Transform;
        }

        /// <summary>Kit (Blender) → Unity position, matching the imported FBX (handedness flip by swapping y and z).</summary>
        public static Vector3 KitToUnity(Vector3 kit) => new Vector3(kit.x, kit.z, kit.y);

        /// <summary>Resolves and assembles the vehicle of <paramref name="build"/> under <paramref name="parent"/>.</summary>
        public static VehicleRig Build(BuildState build, GameCatalog catalog, KitLibrary library, Transform parent)
        {
            KitPlan plan = KitResolver.Resolve(build, catalog, library);
            return Build(plan, library, parent);
        }

        /// <summary>Assembles an already resolved plan.</summary>
        public static VehicleRig Build(KitPlan plan, KitLibrary library, Transform parent)
        {
            if (plan == null) throw new ArgumentNullException(nameof(plan));
            if (library == null) throw new ArgumentNullException(nameof(library));

            var rootGo = new GameObject("VehicleRig");
            rootGo.transform.SetParent(parent, false);
            var rig = new VehicleRig(rootGo.transform, plan);
            rig.missing.AddRange(plan.MissingDataIds);

            // 1. Lay out in kit coordinates.
            var placed = new Dictionary<string, Placed>(StringComparer.Ordinal);
            var order = new List<Placed>();
            foreach (KitStep step in plan.Steps)
            {
                if (!library.TryGet(step.KitId, out KitPartEntry entry) || entry.prefab == null)
                {
                    if (!rig.missing.Contains(step.KitId)) rig.missing.Add(step.KitId);
                    continue;
                }
                var p = new Placed { Step = step, Entry = entry };
                if (!Place(p, placed))
                {
                    if (!rig.missing.Contains(step.KitId)) rig.missing.Add(step.KitId);
                    continue;
                }
                placed[step.Key] = p;
                order.Add(p);
            }

            // 2. Lowest point on the ground (every kit part has its geometry at 0 ≤ z ≤ length).
            float zMin = float.MaxValue, zMax = float.MinValue;
            foreach (Placed p in order)
            {
                zMin = Mathf.Min(zMin, p.KitPos.z);
                zMax = Mathf.Max(zMax, p.KitPos.z + p.Entry.lengthM);
            }
            if (order.Count == 0) zMin = zMax = 0f;
            foreach (Placed p in order) p.KitPos.z -= zMin;
            rig.LengthM = zMax - zMin;

            // 3. Groups and instances.
            var groups = new Dictionary<KitGroup, Transform>();
            foreach (Placed p in order)
            {
                KitGroup groupId = ParentGroup(p.Step.Group);
                if (!groups.TryGetValue(groupId, out Transform group))
                {
                    group = new GameObject(groupId.ToString()).transform;
                    group.SetParent(rig.Root, false);
                    group.localPosition = KitToUnity(new Vector3(0f, 0f, p.KitPos.z));
                    groups[groupId] = group;
                }
                GameObject instance = UnityEngine.Object.Instantiate(p.Entry.prefab, group);
                instance.name = p.Step.Key + "_" + p.Step.KitId;
                instance.transform.localPosition = KitToUnity(p.KitPos) - group.localPosition;
                instance.transform.localRotation = Quaternion.Euler(0f, -p.YawDeg, 0f);
                instance.transform.localScale = Vector3.one;
                p.Transform = instance.transform;
                rig.byKey[p.Step.Key] = instance.transform;
                if (p.Step.Category != null)
                {
                    if (!rig.byCategory.TryGetValue(p.Step.Category, out List<Transform> list))
                    {
                        list = new List<Transform>();
                        rig.byCategory[p.Step.Category] = list;
                    }
                    list.Add(instance.transform);
                }
            }

            // 4. Named transforms.
            StageRig stage1 = groups.TryGetValue(KitGroup.Stage1, out Transform s1) ? new StageRig(1, s1) : null;
            StageRig stage2 = groups.TryGetValue(KitGroup.Stage2, out Transform s2) ? new StageRig(2, s2) : null;
            foreach (Placed p in order)
            {
                switch (p.Step.Group)
                {
                    case KitGroup.Stage1Engines:
                        stage1?.engines.Add(EngineFor(p));
                        break;
                    case KitGroup.Stage2Engines:
                        stage2?.engines.Add(EngineFor(p));
                        break;
                    case KitGroup.Boosters:
                        EngineRig e = EngineFor(p);
                        rig.boosters.Add(new BoosterRig(p.Transform, e.NozzleExit, e.GimbalPivot));
                        break;
                    case KitGroup.Fairing:
                        rig.Fairing = p.Transform;
                        foreach (string side in new[] { "a", "b" })
                        {
                            Transform half = FindDeep(p.Transform, "half_" + side);
                            Transform hinge = Named(p, "hinge_" + side, half);
                            if (half != null) rig.fairingHalves.Add(new FairingHalfRig(half, hinge));
                        }
                        break;
                }
            }
            if (groups.TryGetValue(KitGroup.Interstage, out Transform inter))
            {
                rig.Interstage = inter;
                Placed top = LastIn(order, KitGroup.Interstage);
                if (stage1 != null && top != null) stage1.SeparationJoint = Marker(rig.Root, "Stage1_SeparationJoint", TopOf(top));
            }
            if (stage1 != null) rig.stages.Add(stage1);
            if (stage2 != null) rig.stages.Add(stage2);

            Placed belowPayload = LastBelowFairing(order);
            if (belowPayload != null)
            {
                rig.PayloadRoot = Marker(rig.Root, "PayloadRoot", TopOf(belowPayload));
                if (stage2 != null) stage2.SeparationJoint = rig.PayloadRoot;
            }

            rig.placements = order.ConvertAll(p => (p.Step, p.Entry, p.Transform));
            return rig;
        }

        /// <summary>
        /// Measures every joint with the real imported geometry (renderer bounds) and the kit ring diameters, like
        /// <c>assemble.check_joints</c>: stack gap and ring mismatch, hang gap, side gap to the core skin.
        /// </summary>
        public static List<JointMeasure> MeasureJoints(VehicleRig rig)
        {
            var result = new List<JointMeasure>();
            var byKey = new Dictionary<string, (KitStep step, KitPartEntry entry, Transform t)>(StringComparer.Ordinal);
            foreach (var p in rig.placements) byKey[p.step.Key] = p;
            foreach (var p in rig.placements)
            {
                KitStep s = p.step;
                switch (s.Attach)
                {
                    case KitAttach.StackOn:
                    {
                        if (!byKey.TryGetValue(s.RefKey, out var lower)) break;
                        Bounds lb = RendererBounds(lower.t), ub = RendererBounds(p.t);
                        float gap = ub.min.y - lb.max.y;
                        float ring = Mathf.Abs(lower.entry.diameterTopM - p.entry.diameterBottomM) / 2f;
                        result.Add(new JointMeasure(s.RefKey + " -> " + s.Key, "stack", gap, ring));
                        break;
                    }
                    case KitAttach.HangFrom:
                    {
                        if (!byKey.TryGetValue(s.RefKey, out var holder)) break;
                        Vector3 at = s.RefPoint == "origin" ? holder.t.position : AttachWorld(holder.t, holder.entry, s.RefPoint);
                        float gap = at.y - RendererBounds(p.t).max.y;
                        result.Add(new JointMeasure(s.Key + " under " + s.RefKey + "." + s.RefPoint, "hang", gap, 0f));
                        break;
                    }
                    case KitAttach.Side:
                    {
                        if (!byKey.TryGetValue(s.RefKey, out var core)) break;
                        Vector3 att = AttachWorld(p.t, p.entry, "attach_side");
                        Vector3 axis = core.t.position;
                        float dist = new Vector2(att.x - axis.x, att.z - axis.z).magnitude;
                        result.Add(new JointMeasure(s.Key + " on " + s.RefKey, "side", dist - core.entry.diameterBottomM / 2f, 0f));
                        break;
                    }
                }
            }
            return result;
        }

        /// <summary>World-space bounds of every renderer under <paramref name="root"/>.</summary>
        public static Bounds RendererBounds(Transform root)
        {
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0) return new Bounds(root.position, Vector3.zero);
            Bounds b = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
            return b;
        }

        // ------------------------------------------------------------------ layout (kit coordinates)

        private static bool Place(Placed p, Dictionary<string, Placed> placed)
        {
            KitStep s = p.Step;
            switch (s.Attach)
            {
                case KitAttach.Root:
                    p.KitPos = Vector3.zero;
                    return true;
                case KitAttach.StackOn:
                    if (!TryResolve(placed, s.RefKey, s.RefPoint, out Vector3 on)) return false;
                    p.KitPos = on;
                    return true;
                case KitAttach.HangFrom:
                    if (!TryResolve(placed, s.RefKey, s.RefPoint, out Vector3 at)) return false;
                    p.Entry.TryGetAttach("attach_top", out Vector3 top);
                    p.KitPos = at - top;
                    return true;
                case KitAttach.Side:
                {
                    if (!placed.TryGetValue(s.RefKey, out Placed core)) return false;
                    if (!TryResolve(placed, s.BaseKey, s.BasePoint, out Vector3 basePoint)) return false;
                    p.Entry.TryGetAttach("attach_side", out Vector3 att);
                    float coreR = core.Entry.diameterBottomM / 2f;
                    float az = s.AzimuthDeg * Mathf.Deg2Rad;
                    var outDir = new Vector2(Mathf.Cos(az), Mathf.Sin(az));            // core axis → booster
                    float yawRad = Mathf.Atan2(-outDir.y, -outDir.x) - Mathf.PI / 2f;  // booster +Y faces the core axis
                    Vector2 centre = new Vector2(core.KitPos.x, core.KitPos.y) + outDir * (coreR + att.y);
                    p.KitPos = new Vector3(centre.x, centre.y, basePoint.z);
                    p.YawDeg = yawRad * Mathf.Rad2Deg;
                    return true;
                }
            }
            return false;
        }

        private static bool TryResolve(Dictionary<string, Placed> placed, string key, string point, out Vector3 kit)
        {
            kit = Vector3.zero;
            if (key == null || !placed.TryGetValue(key, out Placed p)) return false;
            if (point == null || point == "origin")
            {
                kit = p.KitPos;
                return true;
            }
            if (!p.Entry.TryGetAttach(point, out Vector3 local)) return false;
            kit = p.KitPos + (Vector3)(Quaternion.AngleAxis(p.YawDeg, Vector3.forward) * local);
            return true;
        }

        // ------------------------------------------------------------------ named transforms

        private static KitGroup ParentGroup(KitGroup g) =>
            g == KitGroup.Stage1Engines ? KitGroup.Stage1 : g == KitGroup.Stage2Engines ? KitGroup.Stage2 : g;

        private static EngineRig EngineFor(Placed p) =>
            new EngineRig(p.Transform, Named(p, "nozzle_exit", null), Named(p, "gimbal_pivot", null));

        /// <summary>The kit empty imported with the FBX, or a new child at the manifest position when the importer dropped it.</summary>
        private static Transform Named(Placed p, string name, Transform under)
        {
            Transform found = FindDeep(p.Transform, name);
            if (found != null) return found;
            if (!p.Entry.TryGetAttach(name, out Vector3 local)) return null;
            var go = new GameObject(name);
            go.transform.SetParent(p.Transform, false);
            go.transform.localPosition = KitToUnity(local);
            if (under != null) go.transform.SetParent(under, true);
            return go.transform;
        }

        private static Vector3 AttachWorld(Transform part, KitPartEntry entry, string name)
        {
            Transform t = FindDeep(part, name);
            if (t != null) return t.position;
            entry.TryGetAttach(name, out Vector3 local);
            return part.TransformPoint(KitToUnity(local));
        }

        private static Transform FindDeep(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            {
                Transform hit = FindDeep(root.GetChild(i), name);
                if (hit != null) return hit;
            }
            return null;
        }

        private static Placed LastIn(List<Placed> order, KitGroup group)
        {
            Placed last = null;
            foreach (Placed p in order) if (p.Step.Group == group) last = p;
            return last;
        }

        private static Placed LastBelowFairing(List<Placed> order)
        {
            Placed fairing = LastIn(order, KitGroup.Fairing);
            if (fairing == null) return null;
            foreach (Placed p in order) if (p.Step.Key == fairing.Step.RefKey) return p;
            return fairing; // fairing on its own: the payload stands at its base
        }

        /// <summary>Kit position of the top ring of a placed stack part, in Unity rig coordinates.</summary>
        private static Vector3 TopOf(Placed p)
        {
            if (p.Step.Group == KitGroup.Fairing && p.Step.Attach == KitAttach.Root) return KitToUnity(p.KitPos);
            p.Entry.TryGetAttach("attach_top", out Vector3 top);
            return KitToUnity(p.KitPos + top);
        }

        private static Transform Marker(Transform parent, string name, Vector3 localPos)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            return go.transform;
        }
    }
}
