# T011 summary: Core scoring and session

Implemented by `momansy-claude` (Claude Code), taking over from `ahmed-saeed-amek`, whose worker stalled after steps 2-7 without pushing
anything (issue #57). Everything below was redone from the brief.

## Result

- `dotnet test core/dotnet~`: **567 passed, 0 failed** (162 of them new for T011; the rest are the existing Core tests). Full log:
  `dotnet-test.txt`.
- Only owned paths changed: `core/Runtime/Scoring/`, `core/Runtime/Session/`, `core/dotnet~/Tests/Scoring/`, `core/dotnet~/Tests/Session/`
  and `orchestration/evidence/T011/`.
- Pure C# (`netstandard2.1`, C# 9, no records, no `UnityEngine` / `System.Random` / I/O / clock). Same inputs and seed give identical results
  (tests for every calculation that draws randomness or builds a state).

## Steps

| Step | Code | Tests |
|---|---|---|
| 1 `ScoringCatalog.Load` | `Scoring/ScoringCatalog.cs` | `CatalogLoadTests` (real `data/`, malformed and missing files name the file, key convention) |
| 2 Tiers | `Scoring/Tiers.cs` | `TierTests`: 31 table rows for 1-10 players, Platinum for every count, solo |
| 3 Boosts | `Scoring/Boosts.cs` | `BoostTests`: stacking, caps (ceiling and floor), mul excess, Platinum pays Gold, shields, crewed-only, build-only |
| 4 Team Sync | `Scoring/TeamSync.cs` | `TeamSyncTests` |
| 5 Objectives, score, grade | `Scoring/Score.cs` | `ObjectiveEvaluatorTests`, `ScoreTests` (hand-computed example, every-term example with arithmetic, Appendix A step 15) |
| 6 Awards | `Scoring/Awards.cs` | `AwardTests` (1, 4 and 10 players, ties, role-bound, condition awards) |
| 7 Session machine | `Session/SessionMachine.cs` | `SessionMachineTests`: every phase pair against the protocol table, full walk-through, field combinations |
| 8 Replay log | `Session/ReplayLog.cs` | `ReplayLogTests`: Parse(ToJson) byte-identical, Seq and Tick rules |
| 9 Fail forward | `Session/FailForward.cs` | `FailForwardTests`: all 14 failure modes against the schema enum, investigation, lessons, retry |

## Decisions (every number is `game_value` unless stated)

- **Mul boosts:** the excess over 1 adds (x1.1 + x1.25 = x1.35), then the cap applies. A negative cap (precision, fuel saver, schedule recovery) is a floor.
  `BoostGrant.Amount` for a mul boost is the increase of the factor.
- **Boosts that do not apply** (crew_morale uncrewed, schedule_recovery outside BUILD, Bronze shield) return a grant with `Applied = false` and change nothing.
- **Team Sync:** Platinum counts as Gold; choosing a moment needs a full meter and resets it to 0.
- **Secondary points:** the 1,500 split equally across the contract's secondaries; each met one pays its share.
- **Efficiency and science** are fraction x points, fractions clamped to 0-1. **Crew-safe** points need a crewed contract, `CrewSafe`, and not `CrewLost`.
  The `safety` objective of C4 and C6 is listed in `Objectives` (kind SAFETY) with those points.
- **Golden Window** doubles the minigame points of a run flagged `InGoldenWindow`; Good Call points do not double.
- **Outcome:** Success = primary met and crew not lost; Partial = primary missed, a secondary met, crew not lost; otherwise Failure. Crew lost forces grade D.
- **Awards:** a `highest` award goes to the greatest positive metric (role-bound awards only to role holders); ties use `SeededRandom(seed).ForStream("tiebreak")`;
  `condition` awards go to every player with a positive metric; at most 4 per player. A player with none gets a role-free `highest` award nobody has won,
  where their own metric is best (all zero: seeded pick).
- **Session:** `MissionSeq` starts at 0 in the lobby, rises on LOBBY/CAMPAIGN_HUB -> BRIEFING and on DEBRIEF -> BUILD. F7b belongs to ASCENT; FLIGHT accepts F2-F13 and F7b
  (F14 is not in the protocol table). BUILD needs a contract.
- **Replay:** `Seq` is assigned (previous + 1). `Tick` -1 marks entries outside flight and may appear at any time; flight ticks (>= 0) never decrease. The seed is written as a
  decimal string and the payload as a JSON string, so the canonical form round-trips byte for byte.
- **Investigation:** root cause = the failure mode; three distractors drawn without replacement from the other 13 with the `investigation` stream (refined by mode, phase and slot);
  fixed table of three clue channels per mode.
- **Lessons:** each mode gives `risk_cleared:<mode>` and one free test (`free_test:<test_id>`) that targets it (table in code).
- **Retry:** same contract (so the same budget), new seed, every choice kept except the failed slot, kept parts keep their test condition and cost lines, lesson flags added.

## Interface changes

- `Tiers.Compute(ScoringCatalog, active, succeeded, perfect)` and `Tiers.ComputeSolo(ScoringCatalog, score01, perfect)`: take the catalog because thresholds come from data.
- `BoostLedger.Empty(catalog, crewed)` and `Grant(boostId, tier, source, sourceId, buildPhase)` return a `GrantResult { Ledger, Grant }` (`BoostGrant` mirrors `mg.summary.boosts[]`
  plus `Applied`).
- `Retry.Prefill(previous, catalog, lesson, failedSlot, newSeed)`: one extra argument, the failed slot, because a `LessonCard` does not know it.
- `Investigation.Open` returns an `InvestigationCase` (root cause, distractors, the four options in seeded order, clue channels).
- **Proposed `data/lessons.json`** (not created; `data/` is not owned by this task): `{ "lessons": [ { "id": "lesson_<mode>", "failure_mode": "<mode>", "effects": [
  { "kind": "build_flag", "value": "risk_cleared:<mode>" }, { "kind": "free_test", "value": "<test id>" } ] } ] }` for the 14 modes, so designers can tune the table that now lives in
  `LessonsLearned`. The table in code is the `game_value` source until then.
- `ObjectiveDef.Kind` uses the protocol tokens `PRIMARY`, `SECONDARY`, `STRETCH`, `SAFETY`.

## Not done

- The brief's optional final-review subagent was not run.
- No Unity import was done, so no `.meta` files were generated (as the Core README says).
