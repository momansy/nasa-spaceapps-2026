using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.Vehicle
{
    /// <summary>One engine of a stage: the part root and its two named transforms (kit empties).</summary>
    public sealed class EngineRig
    {
        public EngineRig(Transform root, Transform nozzleExit, Transform gimbalPivot)
        {
            Root = root;
            NozzleExit = nozzleExit;
            GimbalPivot = gimbalPivot;
        }

        public Transform Root { get; }
        /// <summary>Centre of the nozzle exit plane (plume origin, flight view).</summary>
        public Transform NozzleExit { get; }
        /// <summary>Gimbal pivot (thrust-vector steering).</summary>
        public Transform GimbalPivot { get; }
    }

    /// <summary>A core stage: root transform (moves as one body after staging), engines and separation joint.</summary>
    public sealed class StageRig
    {
        internal readonly List<EngineRig> engines = new List<EngineRig>();

        public StageRig(int number, Transform root)
        {
            Number = number;
            Root = root;
        }

        /// <summary>1 = first stage, 2 = upper stage.</summary>
        public int Number { get; }
        public Transform Root { get; }
        public IReadOnlyList<EngineRig> Engines => engines;
        /// <summary>Plane at which this stage separates from the part above it (interstage separation plane / payload base), or null.</summary>
        public Transform SeparationJoint { get; internal set; }
    }

    /// <summary>One strap-on booster.</summary>
    public sealed class BoosterRig
    {
        public BoosterRig(Transform root, Transform nozzleExit, Transform gimbalPivot)
        {
            Root = root;
            NozzleExit = nozzleExit;
            GimbalPivot = gimbalPivot;
        }

        public Transform Root { get; }
        public Transform NozzleExit { get; }
        public Transform GimbalPivot { get; }
    }

    /// <summary>One payload-fairing half and its hinge.</summary>
    public sealed class FairingHalfRig
    {
        public FairingHalfRig(Transform half, Transform hinge)
        {
            Half = half;
            Hinge = hinge;
        }

        public Transform Half { get; }
        public Transform Hinge { get; }
    }

    /// <summary>
    /// The assembled vehicle of <see cref="VehicleAssembler.Build"/>. Units metres, +Y up; the rig root's origin is
    /// the vehicle's lowest point on the axis (place it on a pad's <c>VehicleMount</c>). Lists are bottom-up.
    /// Presentation only: no rule or performance number is read from the rig.
    /// </summary>
    public sealed class VehicleRig
    {
        internal readonly List<StageRig> stages = new List<StageRig>();
        internal readonly List<BoosterRig> boosters = new List<BoosterRig>();
        internal readonly List<FairingHalfRig> fairingHalves = new List<FairingHalfRig>();
        internal readonly Dictionary<string, List<Transform>> byCategory = new Dictionary<string, List<Transform>>();
        internal readonly Dictionary<string, Transform> byKey = new Dictionary<string, Transform>();
        internal readonly List<string> missing = new List<string>();
        internal List<(KitStep step, KitPartEntry entry, Transform t)> placements = new List<(KitStep, KitPartEntry, Transform)>();

        internal VehicleRig(Transform root, KitPlan plan)
        {
            Root = root;
            Plan = plan;
        }

        public Transform Root { get; }
        public KitPlan Plan { get; }

        /// <summary>Core stages, bottom-up (first stage, then upper stage). A stage is present once any of its parts is.</summary>
        public IReadOnlyList<StageRig> Stages => stages;
        public IReadOnlyList<BoosterRig> Boosters => boosters;
        /// <summary>Interstage root, or null.</summary>
        public Transform Interstage { get; internal set; }
        public IReadOnlyList<FairingHalfRig> FairingHalves => fairingHalves;
        /// <summary>Fairing root, or null.</summary>
        public Transform Fairing { get; internal set; }
        /// <summary>Base of the payload (top of the payload adapter / bottom of the fairing), or null when nothing is above stage 2.</summary>
        public Transform PayloadRoot { get; internal set; }
        /// <summary>Overall height from the lowest nozzle exit to the fairing tip, m.</summary>
        public float LengthM { get; internal set; }
        /// <summary>Kit ids or data ids that could not be shown.</summary>
        public IReadOnlyList<string> Missing => missing;

        /// <summary>The first part root shown for a vote slot (<c>Slots.*</c>), or null when the slot has no model.</summary>
        public Transform PartFor(string category) =>
            category != null && byCategory.TryGetValue(category, out List<Transform> list) && list.Count > 0 ? list[0] : null;

        /// <summary>Every part root shown for a vote slot (e.g. all nine engines).</summary>
        public IReadOnlyList<Transform> PartsFor(string category) =>
            category != null && byCategory.TryGetValue(category, out List<Transform> list) ? list : (IReadOnlyList<Transform>)System.Array.Empty<Transform>();

        /// <summary>Part root by plan key (<c>tank1</c>, <c>e3</c>…), or null.</summary>
        public Transform PartByKey(string key) => key != null && byKey.TryGetValue(key, out Transform t) ? t : null;
    }
}
