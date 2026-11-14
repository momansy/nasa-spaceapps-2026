using System;
using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.Vehicle
{
    /// <summary>One named attach empty of a kit part, in kit coordinates (metres, Blender +Z up, +Y forward).</summary>
    [Serializable]
    public sealed class KitAttachPoint
    {
        public string name;
        public Vector3 kitPositionM;
    }

    /// <summary>
    /// One kit part: the imported model plus the layout numbers of <c>assets/blender/kit_manifest.json</c>.
    /// Every length here is a kit <c>game_value</c> or <c>real_world_approximate</c> number (see the manifest's
    /// value_types); none of them is used by any rule, only for placing meshes.
    /// </summary>
    [Serializable]
    public sealed class KitPartEntry
    {
        public string id;
        public string family;
        public GameObject prefab;
        public float lengthM;
        public float diameterBottomM;
        public float diameterTopM;
        public List<KitAttachPoint> attachPoints = new List<KitAttachPoint>();

        public bool TryGetAttach(string name, out Vector3 kitPositionM)
        {
            foreach (KitAttachPoint p in attachPoints)
            {
                if (p.name == name)
                {
                    kitPositionM = p.kitPositionM;
                    return true;
                }
            }
            kitPositionM = Vector3.zero;
            return false;
        }
    }

    /// <summary>
    /// Kit part id → model and layout metadata. Built by the editor menu
    /// <c>MissionForge/Vehicle/Build Kit Library</c> from <c>Art/Models/Kit/</c> and the kit manifest.
    /// </summary>
    [CreateAssetMenu(menuName = "MissionForge/Kit Library", fileName = "KitLibrary")]
    public sealed class KitLibrary : ScriptableObject
    {
        public const string AssetPath = "Assets/MissionForge/Vehicle/KitLibrary.asset";

        [SerializeField] private List<KitPartEntry> parts = new List<KitPartEntry>();

        [NonSerialized] private Dictionary<string, KitPartEntry> _byId;

        public IReadOnlyList<KitPartEntry> Parts => parts;

        public int Count => parts.Count;

        public void SetParts(List<KitPartEntry> entries)
        {
            parts = entries ?? throw new ArgumentNullException(nameof(entries));
            _byId = null;
        }

        public bool TryGet(string id, out KitPartEntry entry)
        {
            if (_byId == null)
            {
                _byId = new Dictionary<string, KitPartEntry>(StringComparer.Ordinal);
                foreach (KitPartEntry p in parts)
                {
                    if (p != null && !string.IsNullOrEmpty(p.id)) _byId[p.id] = p;
                }
            }
            if (id != null && _byId.TryGetValue(id, out entry)) return true;
            entry = null;
            return false;
        }

        public bool Contains(string id) => TryGet(id, out _);
    }
}
