#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
using System.Collections;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>The T015 evidence list (brief "Acceptance"), in capture order.</summary>
    public static partial class EvidenceShots
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register()
        {
            BuildBayEvidence.Shots.Clear();
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("01-idle-bay-partial-vehicle", s => ShowUi(true), 3f));
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("02-beauty-no-ui", s => ShowUi(false), 1f));
            RegisterMore();
            BuildBayEvidence.Shots.Add(new BuildBayEvidence.Shot("99-restore", s => ShowUi(true), 0.5f));
        }

        static partial void RegisterMore();

        /// <summary>Shows or hides every UI document (Build Bay panels and the Shell chrome) for UI-free beauty shots.</summary>
        public static IEnumerator ShowUi(bool shown)
        {
            foreach (UIDocument doc in Object.FindObjectsByType<UIDocument>())
            {
                if (doc.rootVisualElement != null) doc.rootVisualElement.style.display = shown ? DisplayStyle.Flex : DisplayStyle.None;
            }
            yield return null;
        }
    }
}
#endif
