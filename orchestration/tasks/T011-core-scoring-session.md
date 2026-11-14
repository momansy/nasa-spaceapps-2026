# T011 — Core scoring and session (package B3)

**Worker:** `ahmed-saeed-amek` · `mesh-model: sonnet` · `mesh-effort: high` · **Owns:** `core/Runtime/Scoring/`, `core/Runtime/Session/`, `core/dotnet~/Tests/Scoring/`, `core/dotnet~/Tests/Session/`, `orchestration/evidence/T011/`

Needs the .NET 8 SDK. No MCP server. Queue after T010 (same worker). Use at most one subagent, for
the final review.

## Goal

Pure C# rules for tiers, boosts, Team Sync, score, grades, awards, the session state machine, the
replay log and fail-forward. Namespaces: `MissionForge.Core.Scoring` and `MissionForge.Core.Session`.
Conventions are those of `core/README.md`: `netstandard2.1`, C# 9 without records, no
`UnityEngine` / `System.Random` / I/O / clock, unit suffixes, XML docs with units and design section.

**Do not edit** `core/Runtime/Build`, `Data`, `Flight` or `Random`. You may *call* their public API
(`BuildState`, `GameCatalog`, `SeededRandom`). Do not use the lossy `GameCatalog.Boosts`: parse what
you need yourself. Names below are suggestions; keep them unless you have a reason, and report any
change under **Interface changes**.

## Steps, in order (each ends with its tests passing)

1. **`ScoringCatalog.Load(IReadOnlyDictionary<string,string> files)`**, with the same key convention as
   `CatalogLoader.Load`. It reads:
   - from `boosts.json`: tiers, `below_bronze` and the 11 boosts with kind, target, op, tiers, cap,
     phase, `crewed_only` and scope;
   - from `scoring.json`: team_sync, components, multipliers, grades and `crew_lost_grade`;
   - from `awards.json`: rules and awards;
   - from `assist_levels.json`: `score_multiplier` only;
   - from `contracts.json`: the `objectives` block only.

   A malformed file throws `CatalogException` naming the file. Test against the real `data/` (copy the
   repo-walk helper of `Tests/Data/DesignFixture.cs` into your own test folder).
2. **Tiers (10.3).** `Tiers.Compute(int active, int succeeded, int perfect)` returns `TierResult`
   (`Tier` None/Bronze/Silver/Gold/Platinum, `FractionUnitless`, `Sparkle`). Also
   `Tiers.ComputeSolo(double score01, bool perfect)`. Thresholds come from data. Test every row
   for 1–10 players (17.10), including: 2 players with 1 success is Bronze; 10 players with 3 successes
   is None with a sparkle; 0 active is None.
3. **Boosts (10.4, 11.1).** An immutable `BoostLedger`. `Grant(boostId, tier, source, sourceId)`
   returns the next ledger and a `BoostGrant` (`BoostId`, `Tier`, `Amount`, `Total`, `Unit`, `Capped`,
   `Source`, `SourceId`), which is the shape of `mg.summary.boosts[]` in `protocol/messages.md`.
   - Same-type grants stack additively, then clamp at the cap.
   - For `mul` boosts, the excess over 1 adds: ×1.1 with ×1.25 gives ×1.35 (`data/README.md`, open
     question 8; mark it a **Decision**).
   - Platinum pays Gold.
   - Shields: Silver adds a reroll, Gold a negate, at most 2 held; `ConsumeShield()` takes the oldest.
   - `crew_morale` applies only on crewed contracts, `schedule_recovery` only in the build phase.
4. **Team Sync (11.2).** An immutable `TeamSync`:
   - Gold +25, Silver +15, Bronze +8, Good Call +3; the gains come from data;
   - Platinum counts as Gold (**Decision**);
   - the meter clamps at 100, and `MomentReady` turns true;
   - `ChooseMoment(id)` accepts one of the 3 moment IDs and resets the meter to 0 (**Decision**).
5. **Objectives, score, grade (8.5, 11.3, 11.4).**
   - `ObjectiveEvaluator` evaluates a contract's criteria against
     `IReadOnlyDictionary<string,double> metrics` (booleans as 1/0). Ops are `gte gt lte lt eq within
     is_true`; `within` means |x − value| ≤ tolerance. A missing metric counts as not met and is listed.
   - `ScoreCalculator.Compute(ScoringCatalog, ScoreInput)` returns a `ScoreBreakdown` whose fields
     mirror `debrief.score.breakdown`: objectives, efficiency, safetyRecovery, scienceData, teamwork,
     knowledge, difficultyMult, boostMult. It also carries the total, grade, title key and
     `MissionOutcome` (Success/Partial/Failure).
   - The 1,500 secondary points split equally across the contract's secondaries (**Decision**).
   - Budget and schedule fractions clamp to 0–1.
   - Crew-safe points apply only to crewed contracts.
   - Minigame points earned in a Golden Window phase count double.
   - Crew lost gives grade D.

   Add a hand-computed test and one modelled on Appendix A step 15, showing the arithmetic.
6. **Awards (11.5).** `AwardAssigner.Assign(catalog, IReadOnlyList<PlayerStats>, ulong seed)`.
   `PlayerStats` has a player ID, roles, and metric values keyed by the `metric` names in
   `awards.json`.
   - Every player gets at least one award, and awards are positive only.
   - Ties and leftover players are resolved deterministically from `SeededRandom(seed)
     .ForStream("tiebreak")`. Test 1, 4 and 10 players.
7. **Session state machine (17.3).** Use the authoritative transition table and field combinations of
   `protocol/messages.md` section 6, with the same upper-case tokens.
   - `SessionState` is immutable: `MissionSeq`, `Mode` (a `GameMode` token, not interpreted), `Phase`,
     `Sub`, `Review`, `FlightPhase` (`F0`–`F14`, `F7b`), `Segment` (derived from the flight phase),
     `ContractId`, `Seed`.
   - `SessionMachine.TryTransition(...)` returns the next state, or an error for an illegal move.
   - `MissionSeq` rises on a new mission and on retry (DEBRIEF → BUILD).
8. **Replay log (17.6).** `ReplayLogWriter.Append(kind, tick, payloadJson)`, `ToJson()` and
   `ReplayLog.Parse(json)`.
   - A header holds the seed, contract, mode, assist level and a caller-supplied data hash.
   - An entry holds `Seq`, `Tick` (a 120 Hz flight tick, −1 outside flight), `Kind` and the payload
     as JSON text.
   - Define kind constants: `vote_result`, `build_action`, `pilot_input`, `pilot_action`,
     `mg_summary`, `callout`, `abort`, `mcm_choice`, `phase`.
   - Parse ∘ ToJson must be byte-identical. Seq strictly increases; Tick never decreases.
9. **Fail forward (9.9).**
   - `Investigation.Open(failureModeId, flightPhase, slot, seed)` returns the root cause, 3
     distractors (stream `investigation`) and telemetry clue channel IDs, for MG-28.
   - `LessonsLearned.For(failureModeId)` returns a `LessonCard`: an ID `lesson_<mode>`, and effects as
     build flags (`risk_cleared:<risk>`), free tests or boosts. Cover all 14 IDs of
     `data/schema/common.schema.json` `$defs.failure_mode`; the table lives in code as `game_value`.
     Propose `data/lessons.json` under **Interface changes**.
   - `Retry.Prefill(previous, catalog, lesson, newSeed)` builds a new `BuildState` through
     `BuildState.New` / `WithChoice` / `WithFlag`. It keeps every choice except the slot that failed,
     with the same budget.

## Acceptance

- `dotnet test core/dotnet~` passes (count in `orchestration/evidence/T011/dotnet-test.txt`). Every
  public calculation has a test with the arithmetic in a comment.
- Same inputs and seed give identical results. No file outside the owned paths changed.
- The summary lists **Decisions** (every number you chose, `game_value`) and **Interface changes**.

## Design references

Sections 8.4, 8.5, 9.9, 10.3, 10.4, 11.1–11.5, 17.3, 17.6, 17.10, Appendix A; `protocol/messages.md`
sections 6 and 9.3, `mg.summary`, `debrief.score`, `debrief.awards`; `data/README.md` (scoring questions).
