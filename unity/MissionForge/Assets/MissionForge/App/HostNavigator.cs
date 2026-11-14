using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace MissionForge.App
{
    /// <summary>
    /// Keyboard shortcuts for the person running the big screen:
    /// Page Down advances to the next phase, F1 opens the Codex, F2 opens Settings, Escape closes an overlay.
    /// </summary>
    public sealed class HostNavigator : MonoBehaviour
    {
        [SerializeField] private SceneFlow flow;

        private void Update()
        {
            Keyboard keyboard = Keyboard.current;
            if (keyboard == null || flow == null || flow.IsBusy) return;

            if (keyboard.escapeKey.wasPressedThisFrame)
            {
                flow.CloseOverlay();
            }
            else if (keyboard.f1Key.wasPressedThisFrame)
            {
                flow.OpenOverlay(ScreenId.Codex);
            }
            else if (keyboard.f2Key.wasPressedThisFrame)
            {
                flow.OpenOverlay(ScreenId.Settings);
            }
            else if (keyboard.pageDownKey.wasPressedThisFrame && flow.Overlay == null)
            {
                IReadOnlyList<GamePhase> next = GamePhaseMachine.NextPhases(flow.Phase);
                if (next.Count > 0) flow.GoToPhase(next[0]);
            }
        }
    }
}
