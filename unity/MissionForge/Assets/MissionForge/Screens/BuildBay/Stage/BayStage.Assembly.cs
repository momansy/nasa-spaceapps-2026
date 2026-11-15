using System.Collections;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Vehicle;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Live assembly and ghost (T015 step 7, design 6.10). When a vote resolves, the chosen part is lowered by the
    /// pad crane on its cable, stylised technicians stand by at the joint and welding sparks fly, then it settles
    /// (about 3 s, game_value; skippable). During a vote the leading option shows as a translucent Signal-teal ghost
    /// in its slot and cross-fades when the lead changes. Reduced motion: fade in place, no sparks, no camera move.
    /// </summary>
    public sealed partial class BayStage
    {
        /// <summary>Assembly timing, s (game_value): descent, weld, cable retract.</summary>
        public const float DescentSeconds = 1.6f, WeldSeconds = 1.0f, RetractSeconds = 0.5f, FadeSeconds = 0.8f;
        /// <summary>Height above its slot from which the crane lowers a new part, m (game_value).</summary>
        public const float LiftHeightM = 22f;
        /// <summary>
        /// Depth of the hook block below the cable end, m (build_hero_pad.py hero_crane_hook: the hook's bowl bottoms out
        /// about 2.6 m down). The cable ends at the hook; the hook's bowl rests on the part's lifting point. game_value.
        /// </summary>
        public const float HookDropM = 2.65f;
        /// <summary>
        /// Hero launch table top above the VehicleMount, m (build_hero_pad.py MOUNT_TOP 12 m − 10.5 m). The first part's
        /// joint is inside the table's exhaust opening, so the sparks are lifted to the table top to be seen. game_value.
        /// </summary>
        public const float MountTableAboveMountM = 1.5f;
        public const float GhostFadeSeconds = 0.35f;

        [SerializeField] private Material ghostMaterial;
        [SerializeField] private Material sparkMaterial;
        [SerializeField] private GameObject technicianModel;
        [SerializeField] private Material platformMaterial;
        private Transform _platform;

        private static readonly int FadeId = Shader.PropertyToID("_Fade");
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");

        private sealed class Ghost
        {
            public VehicleRig Rig;
            public float Fade;
            public float Target;
            public readonly List<Renderer> Renderers = new List<Renderer>();
        }

        private readonly List<Ghost> _ghosts = new List<Ghost>();
        private readonly Dictionary<Transform, Vector3> _rest = new Dictionary<Transform, Vector3>();
        private readonly Dictionary<Transform, Vector3> _liftTargets = new Dictionary<Transform, Vector3>();
        private string _ghostKey;
        private Coroutine _assembly;
        private bool _assembling;
        private bool _skipRequested;
        private ParticleSystem _sparks;
        private readonly List<GameObject> _technicians = new List<GameObject>();
        private MaterialPropertyBlock _mpb;

        public void ConfigureAssembly(Material ghost, Material spark, GameObject technician, Material platform)
        {
            ghostMaterial = ghost;
            sparkMaterial = spark;
            technicianModel = technician;
            platformMaterial = platform;
        }

        public bool IsAssembling => _assembling;

        /// <summary>Skips the running assembly animation (host key / chip).</summary>
        public void SkipAssembly() => _skipRequested = true;

        /// <summary>Waits until the current assembly animation has finished.</summary>
        public IEnumerator WaitForAssembly()
        {
            yield return null;
            while (_assembling) yield return null;
        }

        private void BindAssembly()
        {
            _mpb = new MaterialPropertyBlock();
            CreateSparks();
            CreateTechnicians();
            CreateAtmosphere();
        }

        private void OnRigChangedForAssembly(BuildState previous, BuildState current)
        {
            _rest.Clear();
            _liftTargets.Clear();
            _groupBase.Clear();
            if (Rig != null)
            {
                foreach (KitStep step in Rig.Plan.Steps)
                {
                    Transform t = Rig.PartByKey(step.Key);
                    if (t != null) _rest[t] = t.localPosition;
                }
            }
            if (previous == null || Rig == null)
            {
                RefreshSteamVents();
                return;
            }
            string slot = null;
            foreach (KeyValuePair<string, string> c in current.Choices)
            {
                if (previous.Choice(c.Key) != c.Value) { slot = c.Key; break; }
            }
            if (slot == null) { RefreshSteamVents(); return; }
            IReadOnlyList<Transform> parts = Rig.PartsFor(slot);
            if (parts.Count == 0) { RefreshSteamVents(); return; }
            if (_assembly != null) StopCoroutine(_assembly);
            bool hanging = false;
            foreach (KitStep step in Rig.Plan.Steps) if (step.Category == slot && step.Attach == KitAttach.HangFrom) hanging = true;
            _assembly = StartCoroutine(Assemble(parts, hanging));
            RefreshSteamVents();   // clears the vents while the part is lowered; Assemble re-places them
        }

        private void TickAssembly()
        {
            if (!_assembling)
            {
                float k = _a11y.ReducedMotion ? 1f : 1f - Mathf.Exp(-Time.unscaledDeltaTime * 4f);
                foreach (KeyValuePair<Transform, Vector3> kv in _rest)
                {
                    if (kv.Key == null) continue;
                    Vector3 target = _liftTargets.TryGetValue(kv.Key, out Vector3 lift) ? lift : kv.Value;
                    kv.Key.localPosition = Vector3.Lerp(kv.Key.localPosition, target, k);
                }
            }
            for (int i = _ghosts.Count - 1; i >= 0; i--)
            {
                Ghost g = _ghosts[i];
                float step = Time.unscaledDeltaTime / GhostFadeSeconds;
                g.Fade = Mathf.MoveTowards(g.Fade, g.Target, _a11y.ReducedMotion ? 1f : step);
                SetFade(g.Renderers, g.Fade);
                if (g.Target <= 0f && g.Fade <= 0f)
                {
                    if (g.Rig != null) Destroy(g.Rig.Root.gameObject);
                    _ghosts.RemoveAt(i);
                }
            }
        }

        // ------------------------------------------------------------------ ghost

        /// <summary>Shows <paramref name="partId"/> as a ghost in the slot of <paramref name="slot"/>; null clears it.</summary>
        public void ShowGhost(string slot, string partId)
        {
            string key = slot == null || partId == null ? null : slot + "=" + partId;
            if (key == _ghostKey) return;
            _ghostKey = key;
            foreach (Ghost g in _ghosts) g.Target = 0f;
            _liftTargets.Clear();
            if (key == null || _screen == null || library == null || ghostMaterial == null) return;
            BuildState preview = _screen.Session.Build.WithChoice(slot, partId);
            VehicleRig rig = VehicleAssembler.Build(preview, _screen.Session.Catalog, library, vehicleMount);
            rig.Root.name = "GhostRig";
            var ghost = new Ghost { Rig = rig, Fade = 0f, Target = 1f };
            var keep = new HashSet<Transform>(rig.PartsFor(slot));
            // Parts that only exist in the preview (a provisional mount, an adapter) are ghosts too, and the real
            // stack moves to the preview layout so the ghost's slot opens up ("make room").
            _liftTargets.Clear();
            foreach (KitStep step in rig.Plan.Steps)
            {
                Transform g = rig.PartByKey(step.Key);
                Transform real = Rig != null ? Rig.PartByKey(step.Key) : null;
                if (g == null) continue;
                if (real == null || step.Category == slot) keep.Add(g);
                else _liftTargets[real] = real.parent.InverseTransformPoint(g.position);
            }
            foreach (Renderer r in rig.Root.GetComponentsInChildren<Renderer>(true))
            {
                if (!IsUnder(r.transform, keep))
                {
                    r.enabled = false;
                    continue;
                }
                var mats = new Material[r.sharedMaterials.Length];
                for (int i = 0; i < mats.Length; i++) mats[i] = ghostMaterial;
                r.sharedMaterials = mats;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                ghost.Renderers.Add(r);
            }
            SetFade(ghost.Renderers, 0f);
            _ghosts.Add(ghost);
        }

        private static bool IsUnder(Transform t, HashSet<Transform> roots)
        {
            for (Transform p = t; p != null; p = p.parent) if (roots.Contains(p)) return true;
            return false;
        }

        private void SetFade(List<Renderer> renderers, float fade)
        {
            if (_mpb == null) _mpb = new MaterialPropertyBlock();
            foreach (Renderer r in renderers)
            {
                if (r == null) continue;
                r.GetPropertyBlock(_mpb);
                _mpb.SetFloat(FadeId, fade);
                r.SetPropertyBlock(_mpb);
            }
        }

        // ------------------------------------------------------------------ assembly

        private IEnumerator Assemble(IReadOnlyList<Transform> parts, bool hanging)
        {
            _assembling = true;
#if MF_REHEARSAL
            Debug.Log("[MissionForge] Assembly start " + Time.realtimeSinceStartup.ToString("0.00"));
#endif
            _skipRequested = false;
            var finals = new List<Vector3>();
            foreach (Transform p in parts) finals.Add(p.position);
            Bounds b = BoundsOf(parts);
            Bounds whole = VehicleAssembler.RendererBounds(Rig.Root);
            float jointY = hanging ? b.max.y : b.min.y;
            Vector3 jointCentre = new Vector3(vehicleMount.position.x, jointY, vehicleMount.position.z);
            float radius = Mathf.Max(0.8f, Mathf.Max(b.extents.x, b.extents.z));

            if (_a11y.ReducedMotion || pad == null)
            {
                // Fade in place: the part is shown at its final position through the ghost material, then made solid.
                var renderers = RenderersOf(parts);
                var original = new Dictionary<Renderer, Material[]>();
                foreach (Renderer r in renderers)
                {
                    original[r] = r.sharedMaterials;
                    var mats = new Material[r.sharedMaterials.Length];
                    for (int i = 0; i < mats.Length; i++) mats[i] = ghostMaterial;
                    if (ghostMaterial != null) r.sharedMaterials = mats;
                }
                for (float t = 0; t < FadeSeconds && !_skipRequested; t += Time.unscaledDeltaTime)
                {
                    SetFade(renderers, t / FadeSeconds);
                    yield return null;
                }
                foreach (var kv in original) if (kv.Key != null) kv.Key.sharedMaterials = kv.Value;
                SetFade(renderers, 1f);
                _assembling = false;
                RefreshSteamVents();
                yield break;
            }

            // Approach: hanging parts (engines, upper mount) rise on a lift from below; the topmost part is lowered
            // straight down by the crane; a part inserted into the stack is lowered beside it, then slid in.
            bool top = !hanging && b.max.y >= whole.max.y - 0.05f;
            Vector3 side = Vector3.zero;
            if (!hanging && !top)
            {
                Vector3 toTower = pad.Jib != null ? pad.Jib.position - vehicleMount.position : Vector3.left;
                toTower.y = 0f;
                side = toTower.normalized * (radius * 2f + 3f);
            }
            Vector3 start = hanging ? Vector3.down * 7f : top ? Vector3.up * LiftHeightM : side + Vector3.up * 4f;
            _assemblyHeadroomM = top ? LiftHeightM * 0.7f : 0f;   // the camera eases out so the hook stays in frame
            SetWorkLight(jointCentre, radius, true);
            float height = b.max.y - b.min.y;
            if (!hanging) pad.AimCrane(vehicleMount.position + side);
            PlaceTechnicians(jointCentre, radius);
            for (float t = 0; t < DescentSeconds && !_skipRequested; t += Time.unscaledDeltaTime)
            {
                float u = Mathf.SmoothStep(0f, 1f, t / DescentSeconds);
                Vector3 offset;
                if (hanging || top) offset = Vector3.Lerp(start, Vector3.zero, u);
                else
                {
                    // Down first (60 %), then slide in (40 %).
                    float down = Mathf.Clamp01(u / 0.6f), slide = Mathf.Clamp01((u - 0.6f) / 0.4f);
                    offset = Vector3.Lerp(side, Vector3.zero, slide) + Vector3.up * Mathf.Lerp(4f, 0f, down);
                }
                for (int i = 0; i < parts.Count; i++) if (parts[i] != null) parts[i].position = finals[i] + offset;
                if (!hanging)
                {
                    pad.AimCrane(vehicleMount.position + new Vector3(offset.x, 0f, offset.z));
                    pad.SetHookHeight(b.min.y + height + offset.y + HookDropM);
                }
                yield return null;
            }
            for (int i = 0; i < parts.Count; i++) if (parts[i] != null) parts[i].position = finals[i];
            _assemblyHeadroomM = 0f;
            if (!_skipRequested) PunchIn();
            if (!_skipRequested && _sparks != null)
            {
                // On the camera-facing side of the joint, fountaining up and out toward the camera before gravity
                // pulls them down, so the sparks read in front of the part (and above a mount's railing).
                Vector3 toCam = _screen != null && _screen.Vantage != null ? _screen.Vantage.transform.position - jointCentre : Vector3.back;
                toCam.y = 0f;
                toCam = toCam.sqrMagnitude > 1e-4f ? toCam.normalized : Vector3.back;
                Vector3 sparkAt = jointCentre;
                if (vehicleMount != null) sparkAt.y = Mathf.Max(sparkAt.y, vehicleMount.position.y + MountTableAboveMountM);
                _sparks.transform.SetPositionAndRotation(sparkAt + toCam * (radius + 0.25f) + Vector3.up * 0.3f,
                    Quaternion.LookRotation((toCam + Vector3.up * 0.6f).normalized, Vector3.up));
                var shape = _sparks.shape;
                shape.radius = Mathf.Clamp(radius * 0.35f, 0.3f, 1.2f);
                _sparks.Play();
                _sparks.Emit(60);   // an initial burst as the weld strikes
            }
            for (float t = 0; t < WeldSeconds && !_skipRequested; t += Time.unscaledDeltaTime)
            {
                FlickerWorkLight(t);
                yield return null;
            }
#if MF_REHEARSAL
            if (_sparks != null) Debug.Log("[MissionForge] Weld sparks alive " + _sparks.particleCount + " at " + _sparks.transform.position);
#endif
            SetWorkLight(jointCentre, radius, false);
            if (_sparks != null) _sparks.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            if (!hanging)
            {
                float from = b.max.y + HookDropM, to = pad.HookPoint != null ? pad.HookPoint.position.y - 4f : from;
                for (float t = 0; t < RetractSeconds && !_skipRequested; t += Time.unscaledDeltaTime)
                {
                    pad.SetHookHeight(Mathf.Lerp(from, to, t / RetractSeconds));
                    yield return null;
                }
                pad.SetHookHeight(to);
            }
            HideTechnicians();
            _assembling = false;
            RefreshSteamVents();
#if MF_REHEARSAL
            Debug.Log("[MissionForge] Assembly end " + Time.realtimeSinceStartup.ToString("0.00"));
#endif
        }

        private static Bounds BoundsOf(IReadOnlyList<Transform> parts)
        {
            bool any = false;
            var b = new Bounds();
            foreach (Transform p in parts)
            {
                if (p == null) continue;
                Bounds pb = VehicleAssembler.RendererBounds(p);
                if (!any) { b = pb; any = true; } else b.Encapsulate(pb);
            }
            return b;
        }

        private static List<Renderer> RenderersOf(IReadOnlyList<Transform> parts)
        {
            var list = new List<Renderer>();
            foreach (Transform p in parts) if (p != null) list.AddRange(p.GetComponentsInChildren<Renderer>());
            return list;
        }

        // ------------------------------------------------------------------ sparks and technicians

        private void CreateSparks()
        {
            if (sparkMaterial == null) return;
            _sparks = CreateWeldSparks(transform, sparkMaterial);
        }

        /// <summary>
        /// Weld spark emitter (stopped and cleared; <c>Play</c> starts it): a cone of short-lived, stretched, additive
        /// sparks along the emitter's +Z that fall under gravity. Simulated on unscaled time like the rest of the bay.
        /// Public for the EditMode test. game_value art direction.
        /// </summary>
        public static ParticleSystem CreateWeldSparks(Transform parent, Material material)
        {
            var go = new GameObject("WeldSparks");
            go.transform.SetParent(parent, false);
            var sparks = go.AddComponent<ParticleSystem>();
            sparks.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = sparks.main;
            main.playOnAwake = false;
            main.loop = true;
            main.duration = 1f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.35f, 0.9f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(2.5f, 7.5f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.09f, 0.2f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.85f, 0.45f), new Color(1f, 0.55f, 0.2f));
            main.gravityModifier = 1.2f;
            main.useUnscaledTime = true;   // the bay animates on unscaled time; keep the sparks in step with it
            main.maxParticles = 400;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var emission = sparks.emission;
            emission.enabled = true;
            emission.rateOverTime = 260f;
            var shape = sparks.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Cone;   // sprays along the emitter's +Z (set toward the camera)
            shape.angle = 55f;
            shape.radius = 0.6f;
            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.velocityScale = 0.06f;
            renderer.lengthScale = 2f;
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return sparks;
        }

        /// <summary>Suit and skin tones for the stylised technicians (game_value palette; diverse by design 6.10).</summary>
        private static readonly Color[] Suits =
        {
            new Color(0.88f, 0.48f, 0.18f), new Color(0.92f, 0.93f, 0.94f), new Color(0.20f, 0.42f, 0.62f), new Color(0.88f, 0.48f, 0.18f),
        };
        private static readonly Color[] Skins =
        {
            new Color(0.36f, 0.22f, 0.15f), new Color(0.87f, 0.69f, 0.56f), new Color(0.62f, 0.43f, 0.30f), new Color(0.47f, 0.31f, 0.21f),
        };

        private void CreateTechnicians()
        {
            if (technicianModel == null) return;
            // Temporary work platform (grating disc) the technicians stand on at the joint.
            GameObject disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(disc.GetComponent<Collider>());
            disc.name = "WorkPlatform";
            disc.transform.SetParent(transform, false);
            if (platformMaterial != null) disc.GetComponent<Renderer>().sharedMaterial = platformMaterial;
            disc.SetActive(false);
            _platform = disc.transform;
            for (int i = 0; i < Suits.Length; i++)
            {
                GameObject t = Instantiate(technicianModel, transform);
                t.name = "Technician_" + i;
                float scale = 0.94f + 0.04f * (i % 3);
                t.transform.localScale = Vector3.one * scale;
                foreach (Renderer r in t.GetComponentsInChildren<Renderer>())
                {
                    Material[] mats = r.sharedMaterials;
                    for (int m = 0; m < mats.Length; m++)
                    {
                        if (mats[m] == null) continue;
                        Color c = mats[m].name.StartsWith("LP_suit") ? Suits[i] : mats[m].name.StartsWith("LP_skin") ? Skins[i] : mats[m].GetColor(BaseColorId);
                        var block = new MaterialPropertyBlock();
                        block.SetColor(BaseColorId, c);
                        r.SetPropertyBlock(block, m);
                    }
                }
                t.SetActive(false);
                _technicians.Add(t);
            }
        }

        private void PlaceTechnicians(Vector3 joint, float radius)
        {
            if (pad == null) return;
            // Standing on a work platform around the joint: four positions on the camera-facing half, 1 m out.
            Vector3 toCam = _screen != null && _screen.Vantage != null ? _screen.Vantage.transform.position - joint : Vector3.back;
            toCam.y = 0f;
            float baseAngle = Mathf.Atan2(toCam.z, toCam.x);
            for (int i = 0; i < _technicians.Count; i++)
            {
                float a = baseAngle + (-0.9f + 0.6f * i);
                Vector3 at = joint + new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a)) * (radius + 1.0f + 0.3f * (i % 2));
                at.y = Mathf.Max(joint.y - 1.1f, transform.position.y + LaunchPadRig.DeckTopM);
                _technicians[i].transform.position = at;
                _technicians[i].transform.rotation = Quaternion.LookRotation(new Vector3(joint.x - at.x, 0f, joint.z - at.z), Vector3.up);
                _technicians[i].SetActive(true);
            }
            if (_platform != null)
            {
                float y = Mathf.Max(joint.y - 1.1f, transform.position.y + LaunchPadRig.DeckTopM) - 0.08f;
                _platform.position = new Vector3(joint.x, y, joint.z);
                _platform.localScale = new Vector3(2f * (radius + 2.6f), 0.08f, 2f * (radius + 2.6f));
                _platform.gameObject.SetActive(y > transform.position.y + LaunchPadRig.DeckTopM + 0.5f);
            }
        }

        private void HideTechnicians()
        {
            foreach (GameObject t in _technicians) t.SetActive(false);
            if (_platform != null) _platform.gameObject.SetActive(false);
        }

        private void OnAccessibilityForTools()
        {
            if (_a11y.ReducedMotion && _sparks != null) _sparks.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            RefreshSteamVents();
            OnAccessibilityChangedTools();
        }

        partial void OnAccessibilityChangedToolsImpl();
        private void OnAccessibilityChangedTools() => OnAccessibilityChangedToolsImpl();
    }
}
