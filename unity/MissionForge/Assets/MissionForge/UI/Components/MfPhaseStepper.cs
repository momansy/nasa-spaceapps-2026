using System.Collections.Generic;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>State of one step: done (check icon, solid), current (Signal plate, bold), locked (lock icon, dim).</summary>
    public enum MfStepState
    {
        Locked,
        Current,
        Done,
    }

    /// <summary>
    /// Phase stepper (top navigation and the Build Bay A › B › C › D tracker): pill steps joined by a rail, each with
    /// an icon shape for its state so the state never depends on colour alone. Labels come from the caller.
    /// </summary>
    [UxmlElement]
    public partial class MfPhaseStepper : VisualElement
    {
        private readonly List<VisualElement> _steps = new List<VisualElement>();

        public MfPhaseStepper()
        {
            AddToClassList("mf-stepper");
            pickingMode = PickingMode.Ignore;
        }

        /// <summary>Compact variant (labels only for the current step) for narrow bars.</summary>
        [UxmlAttribute] public bool compact { get => ClassListContains("mf-stepper--compact"); set => EnableInClassList("mf-stepper--compact", value); }

        public void SetSteps(IReadOnlyList<string> labels)
        {
            Clear();
            _steps.Clear();
            for (int i = 0; i < labels.Count; i++)
            {
                if (i > 0)
                {
                    var rail = new VisualElement { pickingMode = PickingMode.Ignore };
                    rail.AddToClassList("mf-stepper__rail");
                    Add(rail);
                }
                var step = new VisualElement { name = "step-" + i, pickingMode = PickingMode.Ignore };
                step.AddToClassList("mf-step");
                var icon = new MfIcon { pickingMode = PickingMode.Ignore };
                icon.AddToClassList("mf-step__icon");
                var label = new Label(labels[i]) { pickingMode = PickingMode.Ignore };
                label.AddToClassList("mf-step__label");
                step.Add(icon);
                step.Add(label);
                Add(step);
                _steps.Add(step);
            }
        }

        /// <summary>Marks steps before <paramref name="current"/> done, the current one current, the rest locked.</summary>
        public void SetCurrent(int current)
        {
            for (int i = 0; i < _steps.Count; i++)
            {
                SetState(i, i < current ? MfStepState.Done : i == current ? MfStepState.Current : MfStepState.Locked);
            }
        }

        public void SetState(int index, MfStepState state)
        {
            if (index < 0 || index >= _steps.Count) return;
            VisualElement step = _steps[index];
            step.EnableInClassList("mf-step--done", state == MfStepState.Done);
            step.EnableInClassList("mf-step--current", state == MfStepState.Current);
            step.EnableInClassList("mf-step--locked", state == MfStepState.Locked);
            var icon = (MfIcon)step[0];
            icon.kind = state == MfStepState.Done ? "check" : state == MfStepState.Current ? "circle-dot" : "lock";
            icon.Tint = state == MfStepState.Done ? MfPalette.Meets : state == MfStepState.Current ? MfPalette.Space : MfPalette.Muted;
        }
    }
}
