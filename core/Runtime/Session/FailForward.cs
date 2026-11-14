#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Random;

namespace MissionForge.Core.Session
{
    /// <summary>The 14 failure modes of <c>data/schema/common.schema.json</c> (<c>$defs.failure_mode</c>, design 8.4).</summary>
    public static class FailureModes
    {
        /// <summary>All failure mode ids, in schema order.</summary>
        public static readonly IReadOnlyList<string> All = new[]
        {
            "engine_shutdown", "combustion_instability", "pogo_oscillation", "structural_failure", "stage_recontact",
            "fairing_stuck", "guidance_drift", "radiation_bit_flip", "software_overflow", "solar_array_stuck",
            "cryogenic_leak", "heat_shield_burn_through", "parachute_failure", "range_safety_termination",
        };
    }

    /// <summary>A case for the root-cause investigation minigame MG-28 (design 9.9).</summary>
    public sealed class InvestigationCase
    {
        /// <summary>Creates a case.</summary>
        public InvestigationCase(string rootCauseId, IReadOnlyList<string> distractorIds, IReadOnlyList<string> optionIds, IReadOnlyList<string> clueChannelIds)
        { RootCauseId = rootCauseId; DistractorIds = distractorIds; OptionIds = optionIds; ClueChannelIds = clueChannelIds; }
        /// <summary>The failure mode that really happened.</summary>
        public string RootCauseId { get; }
        /// <summary>Three wrong failure modes.</summary>
        public IReadOnlyList<string> DistractorIds { get; }
        /// <summary>The four choices (root cause and distractors) in a seeded order.</summary>
        public IReadOnlyList<string> OptionIds { get; }
        /// <summary>Telemetry channels that carry the clue for the root cause.</summary>
        public IReadOnlyList<string> ClueChannelIds { get; }
    }

    /// <summary>
    /// Builds MG-28 cases. <b>Decision (game_value):</b> the root cause is the failure mode itself; the three distractors are drawn
    /// without replacement from the other 13 modes with <c>SeededRandom(seed).ForStream("investigation")</c> refined by mode and slot,
    /// so a case never changes for the same inputs; the clue channels are a fixed table (three per mode).
    /// </summary>
    public static class Investigation
    {
        /// <summary>Number of wrong choices next to the root cause.</summary>
        public const int DistractorCount = 3;

        private static readonly Dictionary<string, string[]> Clues = new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["engine_shutdown"] = new[] { "chamber_pressure_kpa", "turbopump_rpm", "propellant_flow_kgs" },
            ["combustion_instability"] = new[] { "chamber_pressure_kpa", "vibration_hz", "injector_temp_k" },
            ["pogo_oscillation"] = new[] { "thrust_oscillation_hz", "feedline_pressure_kpa", "axial_accel_g" },
            ["structural_failure"] = new[] { "strain_gauge_ue", "axial_accel_g", "dynamic_pressure_kpa" },
            ["stage_recontact"] = new[] { "separation_velocity_ms", "relative_distance_m", "stage_attitude_deg" },
            ["fairing_stuck"] = new[] { "fairing_pyro_v", "separation_sensor", "payload_mass_kg" },
            ["guidance_drift"] = new[] { "gyro_bias_deg_h", "attitude_error_deg", "gps_residual_m" },
            ["radiation_bit_flip"] = new[] { "memory_edac_count", "cpu_reset_count", "radiation_dose_krad" },
            ["software_overflow"] = new[] { "cpu_load_pct", "watchdog_resets", "sensor_rate_hz" },
            ["solar_array_stuck"] = new[] { "array_current_a", "deploy_motor_a", "bus_voltage_v" },
            ["cryogenic_leak"] = new[] { "tank_pressure_kpa", "tank_temp_k", "boiloff_rate_kgs" },
            ["heat_shield_burn_through"] = new[] { "heat_flux_wm2", "backshell_temp_k", "tps_recession_mm" },
            ["parachute_failure"] = new[] { "dynamic_pressure_kpa", "descent_rate_ms", "canopy_load_n" },
            ["range_safety_termination"] = new[] { "crosstrack_error_km", "impact_prediction_km", "guidance_mode" },
        };

        /// <summary>Opens a case for MG-28.</summary>
        /// <param name="failureModeId">The failure mode that happened (one of <see cref="FailureModes.All"/>).</param>
        /// <param name="flightPhase">Flight phase token of the failure (<c>F5</c>); part of the draw so the same mode in another phase differs.</param>
        /// <param name="slot">Part category (slot) the failure happened in.</param>
        /// <param name="seed">Session seed.</param>
        public static InvestigationCase Open(string failureModeId, string flightPhase, string slot, ulong seed)
        {
            if (!Clues.TryGetValue(failureModeId, out var clues)) throw new ArgumentException("unknown failure mode '" + failureModeId + "'", nameof(failureModeId));
            var rng = new SeededRandom(seed).ForStream("investigation").ForStream(failureModeId + "/" + flightPhase + "/" + slot);
            var pool = FailureModes.All.Where(m => m != failureModeId).ToList();
            var distractors = new List<string>();
            for (int i = 0; i < DistractorCount; i++)
            {
                int k = rng.NextInt(0, pool.Count);
                distractors.Add(pool[k]);
                pool.RemoveAt(k);
            }
            var options = new List<string>(distractors) { failureModeId };
            for (int i = options.Count - 1; i > 0; i--)
            {
                int j = rng.NextInt(0, i + 1);
                (options[i], options[j]) = (options[j], options[i]);
            }
            return new InvestigationCase(failureModeId, distractors, options, clues);
        }
    }

    /// <summary>Kind of a lesson effect.</summary>
    public enum LessonEffectKind
    {
        /// <summary>A build flag (<c>risk_cleared:&lt;risk&gt;</c>).</summary>
        BuildFlag,
        /// <summary>A free test (test id) on the next attempt.</summary>
        FreeTest,
        /// <summary>A boost (boost id) granted at the start of the next attempt.</summary>
        Boost,
    }

    /// <summary>One effect of a lesson card.</summary>
    public sealed class LessonEffect
    {
        /// <summary>Creates an effect.</summary>
        public LessonEffect(LessonEffectKind kind, string value) { Kind = kind; Value = value; }
        /// <summary>The kind.</summary>
        public LessonEffectKind Kind { get; }
        /// <summary>Flag, test id or boost id.</summary>
        public string Value { get; }
    }

    /// <summary>A Lessons Learned card (design 9.9): a permanent bonus for the next attempt.</summary>
    public sealed class LessonCard
    {
        /// <summary>Creates a card.</summary>
        public LessonCard(string id, string failureModeId, IReadOnlyList<LessonEffect> effects) { Id = id; FailureModeId = failureModeId; Effects = effects; }
        /// <summary>Card id, <c>lesson_&lt;mode&gt;</c>.</summary>
        public string Id { get; }
        /// <summary>Failure mode the card answers.</summary>
        public string FailureModeId { get; }
        /// <summary>Effects on the next attempt.</summary>
        public IReadOnlyList<LessonEffect> Effects { get; }
    }

    /// <summary>
    /// Lessons Learned table (design 9.9). <b>Decision (game_value):</b> every failure mode clears its own risk (<c>risk_cleared:&lt;mode&gt;</c>,
    /// "pogo risk removed for free") and gives one free test that targets it. Proposed <c>data/lessons.json</c> is listed under Interface
    /// changes of the task report.
    /// </summary>
    public static class LessonsLearned
    {
        private static readonly Dictionary<string, string> FreeTests = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["engine_shutdown"] = "engine_hot_fire",
            ["combustion_instability"] = "static_fire",
            ["pogo_oscillation"] = "pogo_suppression_test",
            ["structural_failure"] = "vibration_test",
            ["stage_recontact"] = "component_qualification",
            ["fairing_stuck"] = "vibration_test",
            ["guidance_drift"] = "software_in_the_loop",
            ["radiation_bit_flip"] = "component_qualification",
            ["software_overflow"] = "software_in_the_loop",
            ["solar_array_stuck"] = "thermal_vacuum_test",
            ["cryogenic_leak"] = "wet_dress_rehearsal",
            ["heat_shield_burn_through"] = "arc_jet_test",
            ["parachute_failure"] = "drop_test",
            ["range_safety_termination"] = "software_in_the_loop",
        };

        /// <summary>Prefix of the build flag a lesson sets.</summary>
        public const string RiskClearedPrefix = "risk_cleared:";

        /// <summary>The card for a failure mode.</summary>
        /// <exception cref="ArgumentException">Unknown failure mode.</exception>
        public static LessonCard For(string failureModeId)
        {
            if (!FreeTests.TryGetValue(failureModeId, out var test)) throw new ArgumentException("unknown failure mode '" + failureModeId + "'", nameof(failureModeId));
            return new LessonCard("lesson_" + failureModeId, failureModeId, new[]
            {
                new LessonEffect(LessonEffectKind.BuildFlag, RiskClearedPrefix + failureModeId),
                new LessonEffect(LessonEffectKind.FreeTest, test),
            });
        }
    }

    /// <summary>Retry after a failure (design 9.9): rebuild with the same budget, pre-filled with the previous design.</summary>
    public static class Retry
    {
        /// <summary>Flag prefix for a free test granted by a lesson.</summary>
        public const string FreeTestPrefix = "free_test:";

        /// <summary>
        /// Builds the next attempt: same contract (hence the same budget), a new seed, every choice kept except <paramref name="failedSlot"/>,
        /// the test condition and cost entries of kept parts, and the build flags of the lesson (<c>risk_cleared:...</c>, <c>free_test:...</c>).
        /// </summary>
        /// <param name="previous">The failed build.</param>
        /// <param name="catalog">Game catalog; every kept part id must exist in it.</param>
        /// <param name="lesson">The Lessons Learned card earned.</param>
        /// <param name="failedSlot">Part category (slot) that failed; it is left undecided.</param>
        /// <param name="newSeed">Seed of the new attempt.</param>
        /// <exception cref="CatalogException">A kept part is not in the catalog.</exception>
        public static BuildState Prefill(BuildState previous, GameCatalog catalog, LessonCard lesson, string failedSlot, ulong newSeed)
        {
            if (previous == null) throw new ArgumentNullException(nameof(previous));
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (lesson == null) throw new ArgumentNullException(nameof(lesson));
            var next = BuildState.New(previous.ContractId, newSeed);
            foreach (var kv in previous.Choices.OrderBy(k => k.Key, StringComparer.Ordinal))
            {
                if (kv.Key == failedSlot) continue;
                catalog.Part(kv.Value);
                next = next.WithChoice(kv.Key, kv.Value);
                if (previous.Conditions.TryGetValue(kv.Key, out var cond)) next = next.WithCondition(kv.Key, cond);
            }
            foreach (var entry in previous.Ledger)
                if (entry.Category != null && entry.Category != failedSlot) next = next.WithLedger(entry);
            foreach (var effect in lesson.Effects)
            {
                if (effect.Kind == LessonEffectKind.BuildFlag) next = next.WithFlag(effect.Value);
                else if (effect.Kind == LessonEffectKind.FreeTest) next = next.WithFlag(FreeTestPrefix + effect.Value);
            }
            return next;
        }
    }
}
