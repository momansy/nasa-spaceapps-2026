using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Shows its <see cref="highOnly"/> objects only on <see cref="BayQuality"/> High, and applies the pipeline side of
    /// the quality setting while the bay is loaded. Sits on the always-active <c>Bay/Dressing</c> root (T034).
    /// </summary>
    public sealed class BayQualityGroup : MonoBehaviour
    {
        [SerializeField] private List<GameObject> highOnly = new List<GameObject>();
        [Tooltip("Main-light shadow distance on High, m (BayEnvironment's bay value).")]
        [SerializeField] private float highShadowDistanceM = 320f;

        public void Configure(List<GameObject> objects) => highOnly = objects;

        private void OnEnable()
        {
            BayQuality.Changed += Apply;
            SceneManager.activeSceneChanged += OnActiveSceneChanged;
            Apply();
        }

        private bool _reapply;

        // BayEnvironment re-applies its shadow distance when the active scene changes; re-apply ours a frame later.
        private void OnActiveSceneChanged(Scene previous, Scene next) => _reapply = true;

        private void LateUpdate()
        {
            if (!_reapply) return;
            _reapply = false;
            Apply();
        }

        private void Start() => Apply();   // after BayEnvironment.OnEnable has set its own shadow distance

        private void OnDisable()
        {
            BayQuality.Changed -= Apply;
            SceneManager.activeSceneChanged -= OnActiveSceneChanged;
            BayQuality.RestorePipeline();
        }

        private void Apply()
        {
            bool high = !BayQuality.IsLow;
            foreach (GameObject g in highOnly) if (g != null) g.SetActive(high);
            BayQuality.ApplyPipeline(highShadowDistanceM);
        }
    }
}
