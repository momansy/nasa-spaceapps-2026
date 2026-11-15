using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Payload stand-in (T034 rework 2, U7/U11). The payload and the early votes have no kit model, so after the first
    /// choices the launch table used to stand empty in the middle of the frame. Until a part with a model is on the
    /// pad, a translucent Signal-teal stand-in (payload adapter, dispenser and a boxy spacecraft, in the ghost
    /// material) marks where the stack will rise, and the camera frames the whole open launch table with it
    /// (<see cref="PadShotHeightM"/>). It hides while a vote's ghost or an assembly shows the real part, and in the
    /// compare, exploded and scale views. Shapes and sizes are game_value, not a model of any payload.
    /// </summary>
    public sealed partial class BayStage
    {
        /// <summary>Stand-in ghost opacity (the ghost material's _Fade), 0..1. game_value.</summary>
        public const float StandInFade = 1f;
        /// <summary>Stand-in scale (1 = a 3.2 m adapter, 4.7 m tall); 1.6 reads at the pad-shot distance. game_value.</summary>
        public const float StandInScale = 1.6f;

        private GameObject _standIn;
        private readonly List<Renderer> _standInRenderers = new List<Renderer>();

        /// <summary>True when the stack has choices but nothing with a 3D model yet (votes 2 to 5 of a rehearsal).</summary>
        private bool PadShotWanted()
        {
            bool tools = _compareA != null || _compareB != null || _exploded || ScaleViewOn;
            return !tools && HasChoices() && StackHeightM() < 1f && _extraHeightM <= 0f;
        }

        private void TickStandIn()
        {
            bool show = PadShotWanted() && _ghostKey == null && !_assembling && ghostMaterial != null && vehicleMount != null;
            if (show && _standIn == null) BuildStandIn();
            if (_standIn != null && _standIn.activeSelf != show) _standIn.SetActive(show);
        }

        private void BuildStandIn()
        {
            _standIn = new GameObject("PayloadStandIn");
            _standIn.transform.SetParent(vehicleMount, false);
            _standIn.transform.localPosition = Vector3.up * MountTableAboveMountM;
            _standIn.transform.localScale = Vector3.one * StandInScale;
            // (primitive, local centre, local scale): adapter ring, dispenser drum, spacecraft bus, two folded arrays.
            var parts = new (PrimitiveType type, Vector3 at, Vector3 size)[]
            {
                (PrimitiveType.Cylinder, new Vector3(0f, 0.35f, 0f), new Vector3(3.2f, 0.35f, 3.2f)),
                (PrimitiveType.Cylinder, new Vector3(0f, 1.6f, 0f), new Vector3(2.4f, 0.9f, 2.4f)),
                (PrimitiveType.Cube, new Vector3(0f, 3.6f, 0f), new Vector3(1.9f, 2.2f, 1.9f)),
                (PrimitiveType.Cube, new Vector3(1.15f, 3.6f, 0f), new Vector3(0.12f, 2.0f, 1.6f)),
                (PrimitiveType.Cube, new Vector3(-1.15f, 3.6f, 0f), new Vector3(0.12f, 2.0f, 1.6f)),
            };
            foreach (var (type, at, size) in parts)
            {
                GameObject p = GameObject.CreatePrimitive(type);
                Collider c = p.GetComponent<Collider>();
                if (c != null) Destroy(c);
                p.transform.SetParent(_standIn.transform, false);
                p.transform.localPosition = at;
                p.transform.localScale = size;
                var r = p.GetComponent<MeshRenderer>();
                r.sharedMaterial = ghostMaterial;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                _standInRenderers.Add(r);
            }
            SetFade(_standInRenderers, StandInFade);
        }
    }
}
