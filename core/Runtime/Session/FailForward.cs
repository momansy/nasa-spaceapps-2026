#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Random;

namespace MissionForge.Core.Session
{
    /// <summary>
    /// The 14 failure modes of design 8.4 (<c>$defs.failure_mode</c> of <c>data/schema/common.schema.json</c>), in the order of
    /// the design table, with the telemetry channels that give each one away (MG-28 clues, game_value).
    /// </summary>
    public static class FailureModes
    {
        /// <summary>The 14 failure-mode IDs.</summary>
        public static readonly IReadOnlyList<string> All = new[]
        {
            "engine_shutdown", "combustion_instability", "pogo_oscillation", "structural_failure", "stage_recontact",
            "fairing_stuck", "guidance_drift", "radiation_bit_flip", "software_overflow", "solar_array_stuck",
            "cryogenic_leak", "heat_shield_burn_through", "parachute_failure", "range_safety_termination",
        };

        // Three telemetry channel IDs per mode (lower snake case with unit suffix, protocol TelemetryChannel). game_value.
        private static readonly Dictionary<string, string[]> Clues = new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["engine_shutdown"] = new[] { "engines_running", "chamber_pressure_pct", "engine_health_pct" },
            ["combustion_instability"] = new[] { "chamber_pressure_pct", "vibration_pct", "engine_health_pct" },
            ["pogo_oscillation"] = new[] { "vibration_pct", "chamber_pressure_pct", "g_load" },
            ["structural_failure"] = new[] { "load_pct", "q_kpa", "vibration_pct" },
            ["stage_recontact"] = new[] { "g_load", "vibration_pct", "velocity_ms" },
            ["fairing_stuck"] = new[] { "apoapsis_km", "dv_remaining_ms", "velocity_ms" },
            ["guidance_drift"] = new[] { "traj_error_km", "pitch_error_deg", "heading_error_deg" },
            ["radiation_bit_flip"] = new[] { "consoles_amber", "signal_pct", "payload_health_pct" },
            ["software_overflow"] = new[] { "traj_error_km", "pitch_error_deg", "consoles_red" },
            ["solar_array_stuck"] = new[] { "power_balance_w", "battery_pct", "payload_health_pct" },
            ["cryogenic_leak"] = new[] { "prop_stage2_pct", "temp_c", "dv_remaining_ms" },
            ["heat_shield_burn_through"] = new[] { "heat_load_pct", "entry_angle_deg", "temp_c" },
            ["parachute_failure"] = new[] { "chutes_deployed", "descent_rate_ms", "landing_ellipse_km" },
            ["range_safety_termination"] = new[] { "traj_error_km", "altitude_km", "heading_error_deg" },
        };

        /// <summary>True when the ID is one of the 14 modes.</summary>
        public static bool IsKnown(string id) => Clues.ContainsKey(id);

        /// <summary>The three telemetry channels that reveal a failure mode.</summary>
        /// <exception cref="ArgumentException">Unknown failure mode.</exception>
        public static IReadOnlyList<string> ClueChannels(string failureModeId) =>
            Clues.TryGetValue(failureModeId ?? throw new ArgumentNullException(nameof(failureModeId)), out var c)
                ? c : throw new ArgumentException("Unknown failure mode '" + failureModeId + "'.", nameof(failureModeId));
    }

    /// <summary>
    /// The setup of the root-cause investigation minigame MG-28 (design 9.9 step 2): the true root cause, three distractors and the
    /// telemetry channels to look at. Deterministic from the seed (stream <c>investigation</c>, design 17.6).
    /// </summary>
    public sealed class Investigation
    {
        private Investigation(string rootCauseId, IReadOnlyList<string> distractorIds, IReadOnlyList<string> optionIds,
            IReadOnlyList<string> clueChannelIds, IReadOnlyList<string> decoyChannelIds, FlightPhaseId flightPhase, string slot)
        {
            RootCauseId = rootCauseId; DistractorIds = distractorIds; OptionIds = optionIds; ClueChannelIds = clueChannelIds;
            DecoyChannelIds = decoyChannelIds; FlightPhase = flightPhase; Slot = slot;
        }

        /// <summary>The true root cause (a failure-mode ID).</summary>
        public string RootCauseId { get; }
        /// <summary>Three wrong candidates, distinct from the root cause and from each other.</summary>
        public IReadOnlyList<string> DistractorIds { get; }
        /// <summary>The four candidates (root cause and distractors) in the shuffled order the minigame shows them.</summary>
        public IReadOnlyList<string> OptionIds { get; }
        /// <summary>Telemetry channels that point at the root cause (3).</summary>
        public IReadOnlyList<string> ClueChannelIds { get; }
        /// <summary>Channels that point at the distractors only (not in <see cref="ClueChannelIds"/>), for red herrings.</summary>
        public IReadOnlyList<string> DecoyChannelIds { get; }
        /// <summary>Flight phase in which the failure happened.</summary>
        public FlightPhaseId FlightPhase { get; }
        /// <summary>Build slot of the part that failed (<c>first_stage_engine</c>…).</summary>
        public string Slot { get; }

        /// <summary>Opens the investigation of a failure.</summary>
        /// <param name="failureModeId">One of the 14 failure modes; it is the root cause.</param>
        /// <param name="flightPhase">Flight phase of the failure.</param>
        /// <param name="slot">Build slot of the failed part.</param>
        /// <param name="seed">Session seed; the draws use the <c>investigation</c> stream.</param>
        /// <exception cref="ArgumentException">Unknown failure mode or empty slot.</exception>
        public static Investigation Open(string failureModeId, FlightPhaseId flightPhase, string slot, ulong seed)
        {
            var rootClues = FailureModes.ClueChannels(failureModeId);
            if (string.IsNullOrEmpty(slot)) throw new ArgumentException("Slot is empty.", nameof(slot));
            var rng = new SeededRandom(seed).ForStream("investigation");

            // 13 other modes in the fixed design order, shuffled by the stream; the first three are the distractors.
            var others = new List<string>();
            foreach (var m in FailureModes.All) if (m != failureModeId) others.Add(m);
            Shuffle(others, rng);
            var distractors = others.GetRange(0, 3);

            var options = new List<string>(distractors) { failureModeId };
            Shuffle(options, rng);

            var decoys = new List<string>();
            foreach (var d in distractors)
                foreach (var ch in FailureModes.ClueChannels(d))
                    if (Array.IndexOf(ToArray(rootClues), ch) < 0 && !decoys.Contains(ch)) decoys.Add(ch);

            return new Investigation(failureModeId, distractors, options, rootClues, decoys, flightPhase, slot);
        }

        private static string[] ToArray(IReadOnlyList<string> l)
        {
            var a = new string[l.Count];
            for (var i = 0; i < a.Length; i++) a[i] = l[i];
            return a;
        }

        // Fisher–Yates with the seeded stream (one NextInt per position from the end).
        private static void Shuffle(List<string> list, SeededRandom rng)
        {
            for (var i = list.Count - 1; i > 0; i--)
            {
                var j = rng.NextInt(0, i + 1);
                var t = list[i]; list[i] = list[j]; list[j] = t;
            }
        }
    }

    /// <summary>What a Lessons Learned card does for the next attempt.</summary>
    public enum LessonEffectKind
    {
        /// <summary>Sets a build flag (<c>risk_cleared:&lt;risk&gt;</c>).</summary>
        BuildFlag,
        /// <summary>A test of <c>tests.json</c> costs nothing (flag <c>free_test:&lt;testId&gt;</c>).</summary>
        FreeTest,
        /// <summary>A boost of <c>boosts.json</c> at a tier is granted at the start of the retry (flag <c>lesson_boost:&lt;boost&gt;:&lt;tier&gt;</c>).</summary>
        Boost,
    }

    /// <summary>One effect of a lesson card.</summary>
    public sealed class LessonEffect
    {
        private LessonEffect(LessonEffectKind kind, string flag, string? testId, string? boostId, string? boostTierId)
        {
            Kind = kind; Flag = flag; TestId = testId; BoostId = boostId; BoostTierId = boostTierId;
        }
        /// <summary>A <c>risk_cleared:&lt;risk&gt;</c> flag (the prefix is that of <see cref="TestCampaign.RiskClearedPrefix"/>).</summary>
        public static LessonEffect RiskCleared(string risk) => new LessonEffect(LessonEffectKind.BuildFlag, TestCampaign.RiskClearedPrefix + risk, null, null, null);
        /// <summary>A free test.</summary>
        public static LessonEffect FreeTest(string testId) => new LessonEffect(LessonEffectKind.FreeTest, "free_test:" + testId, testId, null, null);
        /// <summary>A starting boost.</summary>
        public static LessonEffect StartBoost(string boostId, string tierId) =>
            new LessonEffect(LessonEffectKind.Boost, "lesson_boost:" + boostId + ":" + tierId, null, boostId, tierId);

        /// <summary>Effect kind.</summary>
        public LessonEffectKind Kind { get; }
        /// <summary>The build flag that carries the effect into the next <see cref="BuildState"/>.</summary>
        public string Flag { get; }
        /// <summary>Test ID of a free test, else null.</summary>
        public string? TestId { get; }
        /// <summary>Boost ID of a starting boost, else null.</summary>
        public string? BoostId { get; }
        /// <summary>Boost tier (<c>bronze</c>, <c>silver</c>, <c>gold</c>) of a starting boost, else null.</summary>
        public string? BoostTierId { get; }
    }

    /// <summary>A Lessons Learned card (design 9.9 step 3): a permanent bonus for the next attempt.</summary>
    public sealed class LessonCard
    {
        internal LessonCard(string failureModeId, IReadOnlyList<LessonEffect> effects)
        {
            FailureModeId = failureModeId; Effects = effects; Id = "lesson_" + failureModeId;
        }
        /// <summary>Card ID, <c>lesson_&lt;failure mode&gt;</c>.</summary>
        public string Id { get; }
        /// <summary>The failure mode the card answers.</summary>
        public string FailureModeId { get; }
        /// <summary>The effects (at least the <c>risk_cleared</c> flag).</summary>
        public IReadOnlyList<LessonEffect> Effects { get; }
        /// <summary>Flags of every effect, in order.</summary>
        public IReadOnlyList<string> BuildFlags()
        {
            var f = new List<string>(Effects.Count);
            foreach (var e in Effects) f.Add(e.Flag);
            return f;
        }
    }

    /// <summary>
    /// The Lessons Learned cards (design 9.9). The table is in code as <c>game_value</c>; a <c>data/lessons.json</c> is proposed in
    /// the T011 report. Each card clears the risk of its failure mode for free ("pogo risk removed") and adds one more effect: a
    /// free test or a starting boost. The wording of the player-facing text, including the real-world parallels and the respectful tone
    /// of design 12.1, belongs to <c>data/strings</c> and the Codex.
    /// </summary>
    public static class LessonsLearned
    {
        private static readonly Dictionary<string, LessonCard> Cards = Build();

        private static LessonCard Card(string mode, params LessonEffect[] extra)
        {
            var list = new List<LessonEffect> { LessonEffect.RiskCleared(mode) };
            list.AddRange(extra);
            return new LessonCard(mode, list);
        }

        private static Dictionary<string, LessonCard> Build()
        {
            var cards = new List<LessonCard>
            {
                Card("engine_shutdown", LessonEffect.FreeTest("engine_hot_fire")),
                Card("combustion_instability", LessonEffect.FreeTest("engine_hot_fire")),
                Card("pogo_oscillation", LessonEffect.FreeTest("pogo_suppression_test")),
                Card("structural_failure", LessonEffect.StartBoost("load_margin", "silver")),
                Card("stage_recontact", LessonEffect.StartBoost("dv_bonus", "bronze")),
                Card("fairing_stuck", LessonEffect.FreeTest("component_qualification")),
                Card("guidance_drift", LessonEffect.StartBoost("precision", "silver")),
                Card("radiation_bit_flip", LessonEffect.FreeTest("software_in_the_loop")),
                Card("software_overflow", LessonEffect.FreeTest("software_in_the_loop"), LessonEffect.RiskCleared("software_fault")),
                Card("solar_array_stuck", LessonEffect.FreeTest("component_qualification")),
                Card("cryogenic_leak", LessonEffect.FreeTest("static_fire")),
                Card("heat_shield_burn_through", LessonEffect.FreeTest("arc_jet_test"), LessonEffect.StartBoost("heat_margin", "bronze")),
                Card("parachute_failure", LessonEffect.FreeTest("drop_test")),
                Card("range_safety_termination", LessonEffect.StartBoost("precision", "bronze")),
            };
            var d = new Dictionary<string, LessonCard>(StringComparer.Ordinal);
            foreach (var c in cards) d[c.FailureModeId] = c;
            return d;
        }

        /// <summary>The 14 cards in the order of <see cref="FailureModes.All"/>.</summary>
        public static IReadOnlyList<LessonCard> All()
        {
            var l = new List<LessonCard>(FailureModes.All.Count);
            foreach (var m in FailureModes.All) l.Add(Cards[m]);
            return l;
        }

        /// <summary>The lesson card of a failure mode.</summary>
        /// <exception cref="ArgumentException">Unknown failure mode.</exception>
        public static LessonCard For(string failureModeId) =>
            Cards.TryGetValue(failureModeId ?? throw new ArgumentNullException(nameof(failureModeId)), out var c)
                ? c : throw new ArgumentException("Unknown failure mode '" + failureModeId + "'.", nameof(failureModeId));
    }

    /// <summary>The retry of design 9.9 step 4: rebuild with the same budget, pre-filled with the previous design.</summary>
    public static class Retry
    {
        /// <summary>
        /// Builds the starting <see cref="BuildState"/> of a retry: the same contract, <paramref name="newSeed"/>, every part choice of
        /// <paramref name="previous"/> except the slot that failed, and the flags of the lesson card (plus <c>retry</c> and
        /// <c>lesson:&lt;id&gt;</c>). Decisions (game_value): the ledger starts empty, so the budget is the contract's budget and earlier tests,
        /// fixes and anomaly costs are not carried; test conditions are not carried, because a test belongs to the attempt it was run in.
        /// Choices whose part no longer exists in the catalog are dropped. Interface change: takes <paramref name="failedSlot"/>.
        /// </summary>
        /// <param name="previous">Build of the failed attempt.</param>
        /// <param name="catalog">Game catalog (the contract must exist).</param>
        /// <param name="lesson">Lesson card of the failure; may be null for a retry without a lesson.</param>
        /// <param name="failedSlot">Slot of the part that failed (<c>first_stage_engine</c>…); its choice is dropped so the team votes again.</param>
        /// <param name="newSeed">Seed of the new attempt.</param>
        public static BuildState Prefill(BuildState previous, GameCatalog catalog, LessonCard? lesson, string failedSlot, ulong newSeed)
        {
            if (previous == null) throw new ArgumentNullException(nameof(previous));
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (failedSlot == null) throw new ArgumentNullException(nameof(failedSlot));
            catalog.Contract(previous.ContractId); // throws CatalogException when the contract is unknown

            var next = BuildState.New(previous.ContractId, newSeed);
            var slots = new List<string>(previous.Choices.Keys);
            slots.Sort(StringComparer.Ordinal);
            foreach (var slot in slots)
            {
                if (slot == failedSlot) continue;
                var partId = previous.Choices[slot];
                if (!catalog.Parts.ContainsKey(partId)) continue;
                next = next.WithChoice(slot, partId);
            }
            next = next.WithFlag("retry");
            if (lesson != null)
            {
                next = next.WithFlag("lesson:" + lesson.Id);
                foreach (var flag in lesson.BuildFlags()) next = next.WithFlag(flag);
            }
            return next;
        }
    }
}
