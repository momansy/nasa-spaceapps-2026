# T014 — Core campaign and modes evidence

**Status:** verified on .NET 8; Release build and all tests pass.
**Source:** GAME_DESIGN.md §13, T014 task brief and protocol GameMode.
**Scope:** core/Runtime/Campaign/, core/dotnet~/Tests/Campaign/, orchestration/evidence/T014/.

## Done — steps in task order
1. Immutable `CampaignState`, version 1 JSON save/load and unknown-version errors.
2. `Campaign.Record`, reputation and schedule adjustments, deterministic 2/3-card contracts board and supplier trust ledger.
3. Budget carry-over and optional insurance premium/failure claim.
4. Research tech tree for methalox, laser comms, terrain-relative navigation, HIAD and hot staging; Knowledge Point purchases and part filter.
5. Inventory item identities, cumulative flight count across recoveries, reuse ledger refund, per-flight reliability loss and refurbishment cost/days.
6. One-time milestones with cinematic/Codex IDs.
7. All nine protocol GameMode values (Quick, Campaign and seven additional options); date-keyed daily seed and fixed pool; two Heritage presets.
8. Anonymous team-only leaderboard records, deterministic ranking and JSON.
9. Schema-driven achievements, including operators `gte`, `gt`, `lte`, `lt`, `eq`, `within`, `is_true`; one-time unlocks.

## Verification
- Verification used a dedicated worktree and branch based on PR #71, then merged current
  `origin/main` (`237a753`) to test against the latest Build/Data APIs and fixes.
- .NET SDK 8.0.428, runtime 8.0.34 and MSBuild 17.11.71 were used from the existing local
  T007 SDK installation. NuGet restore completed through its isolated configuration.
- `dotnet test core/dotnet~ --configuration Release`: **PASS — 376 passed, 0 failed,
  0 skipped; exit code 0**. The exact output is in `dotnet-test.txt`.
- Campaign-only regression run: **29 passed, 0 failed, 0 skipped**.
- Release build status: **PASS** for `MissionForge.Core` (`netstandard2.1`) and
  `MissionForge.Core.Tests` (`net8.0`).
- Static catalog review found invalid Daily/Heritage pool part IDs; these were corrected and a new catalog-integrity regression test was added.
- Compatibility was checked against current `BuildState`, `Vehicle`, `BudgetScheduleModel`,
  `SeededRandom`, `GameCatalog`, protocol GameMode tokens and the shipped
  `data/achievements.json`.
- Campaign Core has no file I/O, system clock, Unity dependency or `System.Random` usage. The tests can read fixture JSON from disk.

## Bugs discovered and corrected during real verification
- Qualified the `TeamName` validator type in `LeaderboardRecord`; its property name had
  shadowed the validator and prevented Campaign Core from compiling.
- Removed the test namespace/type collision around `Campaign` and imported `Slots`; these
  defects prevented the T014 regression project from compiling.
- Hardened achievement contract parsing against non-string/null entries and removed
  nullable compiler warnings.
- Preserved an in-flight inventory item's stable `ItemId` when it is recovered; the
  previous code retained wear but silently assigned a new physical identity.
- Supplier trust now discounts the actual selected hardware quantity and build slot cost
  via `BudgetScheduleModel.PartCostM`; the previous calculation charged only one engine
  regardless of engine count. A three-engine hand calculation is covered by regression.
- Campaign state now rejects duplicate inventory item IDs, preventing ambiguous lookup
  and multi-item consumption when loading a malformed save.
- Blank recovery entries no longer create a false first-recovery milestone.
- An independent reviewer found the last two edge cases above; both findings were fixed
  and the affected tests and complete suite were rerun.
- Merging current `main` supplied the already-approved Build/Data corrections behind the
  three unrelated baseline failures seen on PR #71's older base.

## Unverified functionality / remaining integration risk
- No Campaign Hub UI exists in T014's scope, so host-side wiring of `MissionReport`, mode
  rules, inventory consumption/recovery and achievement JSON remains an integration task.
- Game-balance constants and curated Heritage pools are deterministic and tested but still
  require the design owner's balance approval, as originally documented.

## Decisions (all proposed numeric values are `game_value`)
- Reputation: success +8, partial +3, failure −8, on time +2, late −3; clamp to [0,100].
- Contract reputation gates: C0–C2 at start; C3–C4 at 25; C5–C6 at 50; C7–C8 at 75. Offer count alternates 3 and 2 by mission number.
- Supplier-trust maximum discount: 10% at 100 reputation, linear.
- Carry-over: 25% of unused mission budget; only the newest mission's carry and claim are available next mission to avoid re-applying previous carry repeatedly.
- Insurance: $3M premium, pays 20% of initial mission budget on failure, capped at $8M.
- Tech KP prices: methalox 10, laser 12, terrain-relative 16, HIAD 18, hot staging 8. Terrain requires laser; HIAD requires terrain.
- Reuse: 35% part-cost refund, 1 percentage point reliability penalty per flight; refurbish for 10% of part cost + 2 days.
- Budget Crunch: $25M.
- Daily mode: FNV-1a 64-bit hash of exact ISO date, `SeededRandom(...).ForStream("campaign")`; contract C0–C8; fixed part allow-list.
- Heritage: `1960s_lunar_flyby` and `early_satellites` catalog-part allow-lists. They are gameplay approximations, not verified historical vehicle specifications.
- Team names: max 24 UTF-16 characters; Unicode letters/digits, spaces, '_' and '-'.
- Deterministic leaderboard tie priority after primary metric: score, budget efficiency, schedule days, team, date, seed.
- `within` checks `abs(actual - target) <= tolerance`; absent tolerance means exact match.
- In-flight inventory is retained as unavailable until the host supplies a recovery outcome; unrecovered items are discarded, preventing reused items' flight counts from resetting.

## Interface changes proposed (not edited outside owned paths)
Suggested `data/campaign.json` structure:
```json
{
  "schema_version": 1,
  "reputation": {
    "success": 8, "partial": 3, "failure": -8,
    "on_time": 2, "late": -3, "intermediate_gate": 25,
    "advanced_gate": 50, "expert_gate": 75
  },
  "carry_fraction": 0.25,
  "supplier_discount_cap_fraction": 0.10,
  "insurance": { "premium_M": 3, "recovery_fraction": 0.20, "claim_cap_M": 8 },
  "reuse": { "refund_fraction": 0.35, "wear_reliability_fraction": 0.01,
    "refurb_cost_fraction": 0.10, "refurb_days": 2 },
  "budget_crunch_M": 25
}
```
Localizable string keys: for each tech `campaign.tech.<id>.name` and `campaign.tech.<id>.real_tech`, where id is methalox, laser_comms, terrain_relative, hiad, hot_staging. Milestone keys: `campaign.milestone.<id>` for first_orbit, first_recovery, first_crew, first_lunar_flyby, first_mars_landing. Achievement keys are already declared by `data/achievements.json`.

## Integration notes / manual review
- The host passes a `MissionReport` with contract, outcome, score/grade, budget/time, KP, recovered part IDs, and objectives. It must call `Inventory.Consume(itemId)` when a reused item is installed; `Campaign.Record` resolves the resulting in-flight items from the debrief and preserves their flight counts.
- The host must read `data/achievements.json` and pass the JSON text as the fourth argument to `Achievements.Evaluate` to ensure data and runtime remain synchronized.
- The host maps `MissionSetupRules` into its build, voting, and leaderboard setup without changing the room protocol.
- The leaderboard does not contain player IDs, emails, or devices. The room server/client remains responsible for safe anonymous team naming and moderation.
- Team owner/orchestrator should check game-balance constants and Heritage presets before approving.

## Next
Obtain independent approval of PR #71 and merge only with the orchestrator's authorization.
