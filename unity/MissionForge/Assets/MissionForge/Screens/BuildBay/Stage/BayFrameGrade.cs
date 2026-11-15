using UnityEngine;
using UnityEngine.Rendering;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Camera-attached framing card for the Build Bay (T034 rework, rubric M8): a full-screen quad just past the near
    /// plane carrying <c>Frame_grade.png</c>, which pulls the left and right edges and the top corners of the frame to
    /// navy (#071522) the way frame 02 does. The URP vignette stays at VISUAL_TARGET's 0.18 cap; this card is the
    /// art-directed edge falloff on top of it, and it also desaturates the saturated upper-sky corners. It lives as a
    /// child of the main camera only while the bay is loaded (created in OnEnable, destroyed in OnDisable).
    /// Coverage and strength are game_value art direction.
    /// </summary>
    public sealed class BayFrameGrade : MonoBehaviour
    {
        /// <summary>Distance of the card in front of the camera's near plane, m.</summary>
        public const float NearOffsetM = 0.02f;

        [SerializeField] private Material material;
        [SerializeField] private Mesh card;

        private GameObject _card;
        private Camera _camera;
        private float _fov, _aspect, _near;

        public void Configure(Material gradeMaterial, Mesh cardMesh)
        {
            material = gradeMaterial;
            card = cardMesh;
        }

        private void OnDisable() => Release();

        private void OnDestroy() => Release();

        private void LateUpdate()
        {
            Camera cam = Camera.main;
            if (cam == null || material == null || card == null)
            {
                Release();
                return;
            }
            if (cam != _camera || _card == null) Attach(cam);
            if (!Mathf.Approximately(cam.fieldOfView, _fov) || !Mathf.Approximately(cam.aspect, _aspect) ||
                !Mathf.Approximately(cam.nearClipPlane, _near))
                Fit(cam);
        }

        private void Attach(Camera cam)
        {
            Release();
            _camera = cam;
            _card = new GameObject("BayFrameGrade") { hideFlags = HideFlags.DontSave };
            _card.transform.SetParent(cam.transform, false);
            _card.AddComponent<MeshFilter>().sharedMesh = card;
            var r = _card.AddComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = LightProbeUsage.Off;
            r.reflectionProbeUsage = ReflectionProbeUsage.Off;
            Fit(cam);
        }

        /// <summary>Sizes the unit card to exactly cover the view at its distance (1 % overscan).</summary>
        private void Fit(Camera cam)
        {
            _fov = cam.fieldOfView;
            _aspect = cam.aspect;
            _near = cam.nearClipPlane;
            if (_card == null) return;
            float d = cam.nearClipPlane + NearOffsetM;
            float h = 2f * d * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad) * 1.01f;
            _card.transform.localPosition = new Vector3(0f, 0f, d);
            _card.transform.localRotation = Quaternion.identity;
            _card.transform.localScale = new Vector3(h * cam.aspect, h, 1f);
        }

        private void Release()
        {
            if (_card != null)
            {
                if (Application.isPlaying) Destroy(_card);
                else DestroyImmediate(_card);
            }
            _card = null;
            _camera = null;
        }
    }
}
