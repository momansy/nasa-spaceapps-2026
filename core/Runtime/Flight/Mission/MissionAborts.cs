using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    public sealed partial class MissionSim
    {
        private bool abortOutcomePartial;

        /// <summary>Abort IDs currently allowed by phase, fitted hardware and simplified delta-v gates.</summary>
        public IReadOnlyList<string> AvailableAborts()
        {
            if (setup.Aborts == null || Result != null) return Array.Empty<string>();
            var result = new List<string>();
            foreach (var mode in setup.Aborts.Modes.OrderBy(m => m.Id, StringComparer.Ordinal))
                if (mode.FlightPhaseIds.Contains(phase) && AbortRequirementsMet(mode)) result.Add(mode.Id);
            return result.AsReadOnly();
        }

        /// <summary>Carries out an available abort immediately and returns the emitted events.</summary>
        public IReadOnlyList<FlightEvent> Abort(string abortId)
        {
            if (abortId == null) throw new ArgumentNullException(nameof(abortId));
            events.Clear();
            if (!AvailableAborts().Contains(abortId))
                throw new InvalidOperationException($"Abort '{abortId}' is not available in phase {phase}.");
            PerformAbort(abortId);
            return events.ToArray();
        }

        private bool AbortRequirementsMet(AbortModeDef mode)
        {
            if (mode.RequiresEscapeSystem && spec.Vehicle.Part(Slots.LaunchEscape) == null) return false;
            foreach (var requirement in mode.Requirements)
            {
                if (requirement == "delta_v_for_lower_orbit" && (AltitudeM < 70_000 || PropellantKg <= 0)) return false;
                if (requirement == "recoverable_vehicle" && spec.RecoveryKind == "brec_expendable") return false;
                if (requirement == "delta_v_to_turn_back" && PropellantKg <= Stage.PropellantMassKg * 0.10) return false;
                if (requirement == "deorbit_delta_v" && PropellantKg <= 0) return false;
            }
            return true;
        }

        private void PerformAbort(string abortId)
        {
            Emit("abort", abortId);
            abortOutcomePartial = true;
            if (abortId == "pad_abort" || abortId == "ascent_abort")
            {
                metrics["crew_safe"] = 1;
                metrics["capsule_recovered"] = 1;
                Finish(MissionOutcome.Partial);
            }
            else if (abortId == "abort_to_orbit" || abortId == "return_to_launch_site")
            {
                Finish(MissionOutcome.Partial);
            }
            else if (abortId == "early_return") Enter("F9");
        }

        private bool TryAutomaticEscape()
        {
            if (spec.Vehicle.Part(Slots.LaunchEscape) == null) return false;
            var candidates = phase == "F2" ? new[] { "pad_abort", "ascent_abort" }
                : new[] { "ascent_abort", "pad_abort" };
            var available = AvailableAborts();
            foreach (var candidate in candidates)
            {
                if (!available.Contains(candidate)) continue;
                PerformAbort(candidate);
                return true;
            }
            return false;
        }
    }
}
