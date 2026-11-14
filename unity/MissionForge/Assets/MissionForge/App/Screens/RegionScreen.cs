using System.Collections.Generic;
using UnityEngine.UIElements;

namespace MissionForge.App.Screens
{
    /// <summary>
    /// Controller for the screens whose layout regions are delivered by T001 and filled by later
    /// tasks. It wires the navigation buttons by naming convention so the whole flow of design
    /// section 17.3 can be walked end to end: "btn-continue" advances to the next phase,
    /// "btn-back" / "btn-close" closes an overlay or returns to the phase's primary screen.
    /// </summary>
    public sealed class RegionScreen : ScreenController
    {
        private static readonly string[] ContinueNames = { "btn-continue" };
        private static readonly string[] BackNames = { "btn-back", "btn-close" };

        protected override void OnEnter()
        {
            foreach (string name in ContinueNames)
            {
                Screen.Query<Button>(name).ForEach(button => button.clicked += Continue);
            }
            foreach (string name in BackNames)
            {
                Screen.Query<Button>(name).ForEach(button => button.clicked += Back);
            }
        }

        private void Continue()
        {
            IReadOnlyList<GamePhase> next = GamePhaseMachine.NextPhases(App.Flow.Phase);
            if (next.Count > 0) App.Flow.GoToPhase(next[0]);
        }

        private void Back()
        {
            if (App.Flow.Overlay != null)
            {
                App.Flow.CloseOverlay();
                return;
            }
            App.Flow.ShowWithinPhase(ScreenCatalog.PrimaryFor(App.Flow.Phase).Id);
        }
    }
}
