using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Vehicle;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Preview tools of design 6.10 on the 3D side: compare (two candidate rigs side by side), exploded view (stages
    /// separated along the axis), scale reference (person 1.75 m, ten-storey building ≈ 30 m, Saturn V 110.6 m as a
    /// ghost outline — all real_world_approximate, no logos) and the anchor points for the stability markers.
    /// </summary>
    public sealed partial class BayStage
    {
        /// <summary>Gap between exploded groups as a fraction of the vehicle length (game_value).</summary>
        public const float ExplodeGapFraction = 0.10f;
        /// <summary>Saturn V height used to frame the scale view, m (real_world_approximate).</summary>
        public const float SaturnVHeightM = 110.6f;

        [SerializeField] private GameObject humanModel;
        [SerializeField] private GameObject buildingModel;
        [SerializeField] private GameObject saturnModel;

        private VehicleRig _compareA, _compareB;
        private readonly List<GameObject> _scaleRefs = new List<GameObject>();
        private bool _exploded;
        private float _explode;
        private float _extraHeightM;

        public VehicleRig CompareA => _compareA;
        public VehicleRig CompareB => _compareB;
        public bool Exploded => _exploded;
        public IReadOnlyList<GameObject> ScaleRefs => _scaleRefs;

        public void ConfigureTools(GameObject human, GameObject building, GameObject saturn)
        {
            humanModel = human;
            buildingModel = building;
            saturnModel = saturn;
        }

        partial void OnAccessibilityChangedToolsImpl()
        {
            if (_a11y.ReducedMotion) _explode = _exploded ? 1f : 0f;
        }

        // ------------------------------------------------------------------ compare

        /// <summary>Shows two candidate builds side by side (null clears). The live rig is hidden meanwhile.</summary>
        public void ShowCompare(BuildState a, BuildState b)
        {
            if (_compareA != null) Destroy(_compareA.Root.gameObject);
            if (_compareB != null) Destroy(_compareB.Root.gameObject);
            _compareA = _compareB = null;
            if (Rig != null) Rig.Root.gameObject.SetActive(a == null);
            if (a == null || b == null || _screen == null)
            {
                SetExtraFrameWidth(0f);
                return;
            }
            _compareA = VehicleAssembler.Build(a, _screen.Session.Catalog, library, vehicleMount);
            _compareB = VehicleAssembler.Build(b, _screen.Session.Catalog, library, vehicleMount);
            float r = Mathf.Max(Radius(_compareA), Radius(_compareB));
            float offset = r + 7f;
            _compareA.Root.localPosition = Vector3.left * offset;
            _compareB.Root.localPosition = Vector3.right * offset;
            SetExtraFrameWidth(2f * offset);
        }

        private static float Radius(VehicleRig rig)
        {
            Bounds b = VehicleAssembler.RendererBounds(rig.Root);
            return Mathf.Max(b.extents.x, b.extents.z);
        }

        // ------------------------------------------------------------------ exploded

        public void SetExploded(bool on)
        {
            _exploded = on;
            if (_a11y.ReducedMotion) _explode = on ? 1f : 0f;
        }

        /// <summary>Applies the exploded offsets (called every frame from LateUpdate through TickTools).</summary>
        private void TickTools()
        {
            float target = _exploded ? 1f : 0f;
            _explode = _a11y.ReducedMotion ? target : Mathf.MoveTowards(_explode, target, Time.unscaledDeltaTime * 1.6f);
            if (Rig == null) return;
            float gap = Rig.LengthM * ExplodeGapFraction * Mathf.SmoothStep(0f, 1f, _explode);
            int i = 0;
            foreach (Transform group in GroupsBottomUp(Rig))
            {
                if (group.name == "Boosters") { group.localPosition = new Vector3(0f, group.localPosition.y, 0f); continue; }
                Vector3 p = group.localPosition;
                float baseY = GroupBaseY(group);
                group.localPosition = new Vector3(p.x, baseY + gap * i, p.z);
                i++;
            }
        }

        private readonly Dictionary<Transform, float> _groupBase = new Dictionary<Transform, float>();

        private float GroupBaseY(Transform group)
        {
            if (!_groupBase.TryGetValue(group, out float y))
            {
                y = group.localPosition.y;
                _groupBase[group] = y;
            }
            return y;
        }

        private static IEnumerable<Transform> GroupsBottomUp(VehicleRig rig)
        {
            foreach (string name in new[] { "Stage1", "Boosters", "Interstage", "Stage2", "Adapter", "Fairing" })
            {
                Transform t = rig.Root.Find(name);
                if (t != null) yield return t;
            }
        }

        // ------------------------------------------------------------------ scale reference

        public void SetScaleReference(bool on)
        {
            foreach (GameObject g in _scaleRefs) if (g != null) Destroy(g);
            _scaleRefs.Clear();
            _extraHeightM = 0f;
            if (!on || pad == null)
            {
                SetExtraFrameWidth(_compareA != null ? _extraWidthM : 0f);
                return;
            }
            float r = Rig != null ? RigRadius() : 2f;
            float deck = transform.position.y + LaunchPadRig.DeckTopM;
            Vector3 axis = vehicleMount.position;
            // Person at the foot of the mount, building and Saturn V outline beside the pad (right, camera side).
            _scaleRefs.Add(Ref(humanModel, new Vector3(axis.x + 13f, deck, axis.z - 12f)));
            _scaleRefs.Add(Ref(buildingModel, new Vector3(axis.x + 26f, deck, axis.z - 4f)));
            _scaleRefs.Add(Ref(saturnModel, new Vector3(axis.x + 46f + r, deck, axis.z + 6f)));
            _extraHeightM = SaturnVHeightM;
            SetExtraFrameWidth(2f * (46f + r + 8f));
        }

        private GameObject Ref(GameObject model, Vector3 at)
        {
            if (model == null) return null;
            GameObject g = Instantiate(model, transform);
            g.transform.position = at;
            if (ghostMaterial != null)
            {
                foreach (Renderer r in g.GetComponentsInChildren<Renderer>())
                {
                    var mats = new Material[r.sharedMaterials.Length];
                    for (int i = 0; i < mats.Length; i++) mats[i] = ghostMaterial;
                    r.sharedMaterials = mats;
                    r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }
            }
            return g;
        }

        // ------------------------------------------------------------------ stability anchors

        /// <summary>
        /// World point on the rig axis at <paramref name="metresFromNose"/> of Core's stability model, placed by fraction
        /// of <paramref name="modelLengthM"/> (DashboardMetrics.VehicleLengthM) along the visual rig.
        /// </summary>
        public Vector3? AxisPointFromNose(double metresFromNose, double modelLengthM)
        {
            if (Rig == null || modelLengthM <= 0) return null;
            float frac = Mathf.Clamp01((float)(metresFromNose / modelLengthM));
            Bounds b = VehicleAssembler.RendererBounds(Rig.Root);
            return new Vector3(vehicleMount.position.x, b.max.y - frac * (b.max.y - b.min.y), vehicleMount.position.z);
        }
    }
}
