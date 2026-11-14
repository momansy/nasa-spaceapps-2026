# T010 — Core build rules fixes (package B1, follow-up of T002)

**Worker:** `ahmed-saeed-amek` · `mesh-model: sonnet` · `mesh-effort: high` · **Owns:** `core/Runtime/Build/`, `core/Runtime/Data/`, `core/dotnet~/Tests/Build/`, `core/dotnet~/Tests/Data/`, `orchestration/evidence/T010/`; for item 7 only, `data/contracts.json` and `data/schema/contract.schema.json`

Needs the .NET 8 SDK (`dotnet --version`) and, for item 7, Node 20 (`cd tools && npm install` once). This
task uses no MCP server. Use at most one subagent, for the final review.

## Context

T002 is merged (#44). Its independent review, posted on issue #23, found the bugs below; none are fixed
yet. All part files are on `main` now, so `DesignFixture.Files()` loads the real catalog. First run
`dotnet test core/dotnet~` and save the output as `orchestration/evidence/T010/baseline.txt`. If tests
already fail against the current data, fixing that is step 0.

T011 (`core/Runtime/Scoring`, `Session`), T012 (`tools/balance~`) and T013 (`core/Runtime/Flight/Mission`)
compile against the public API of `Build` and `Data` at the same time. **Do not rename or remove public
types or members.** Add new members; if an old one becomes wrong, keep it and mark it `[Obsolete]`.

## Steps, in order (each ends with its tests passing)

1. **Rule IDs match the data** (found while writing this brief). The `ValidationRules` constants
   (`liftoff_twr`, `total_dv`, …) differ from the IDs in `data/validation_rules.json`
   (`liftoff_twr_too_low`, `delta_v_below_requirement`, …). As a result `catalog.Rule(id)` always returns
   null: data severities, `params.twr_min` and `explanation_key` are never used, and
   `ValidationIssue.TextKey` names keys that do not exist. Change the constant *values* to the data IDs
   (keep the names), read `twr_min`, and default the text key to `validation_rule.<id>.explanation`
   (the strings are in `data/strings/en.parts_b.json`). `part_requirement` and `part_incompatible` stay
   code-only; list them under **Interface changes** as rows to add to the data.
2. **C0 heat shield** (bug 1). The loader reads `requirements.heat_shield_required` into a new
   `ContractDef.HeatShieldRequired`, which defaults to `payload_returns` when the field is absent.
   `Validator` raises the returning-payload rule only when `Returning && HeatShieldRequired`.
3. **Test scope** (bug 2). `TestCampaign.Offer` (Testing.cs, around line 142) compares
   `AppliesTo[0] == "any"`, but `data/tests.json` uses `any_part`. Accept both.
4. **Test Failure after "fly as-is"** (bug 3). Responding `fly_as_is` to `test_failure` records the
   flaw as accepted (for example the flag `flaw_accepted:<slot>`). After that:
   - `TestCampaign.OpenFlaws` no longer returns it;
   - the `flaw_revealed` / `test_revealed_flaw` trigger does not hold for it;
   - `DesignReview.Run` does not flag it again.

   The true reliability keeps the flaw penalty.
5. **Suborbital boost** (bug 4). For a contract whose `Destination == "suborbital"` (C0), the rotation
   boost and the plane-change penalty are 0. Add a `SiteEffects` overload that takes the contract and
   keep the old signature.
6. **Launch-site flags** (bug 5). `no_eastward_launch` (West Coast Polar Range) sets the rotation boost
   to 0 for every target. `stages_fall_on_land` (Inland Steppe) adds a range-fee `CostLine` (a
   `game_value`; suggested $1 M, listed under **Decisions**). Do not invent any other effects.
7. **Fairing fit** (bug 6). `ContractDef.PayloadDiameterM` exists, but no data feeds it. Add the
   smallest support:
   - an optional `payload.diameter_m` in `contract.schema.json`, with a description, valid under the
     existing `value_types.payload`;
   - the loader reads it;
   - values for the fairing contracts C0, C1, C2, C5, C7 and C8, each with a `design_notes` line naming
     its real-world analogue and tagged as a decision. Proposed values: 1.0, 1.2, 2.4, 3.7, 4.5 and
     4.6 m. The fairings are 1.5, 4.0 and 5.4 m.

   `node tools/validate-data.mjs` must pass. If you judge the values indefensible, leave the data
   unchanged, document that the rule is inert, and say so. Either way, a test shows the rule firing
   with a contract that has a diameter.
8. **Engine count per stage** (gap). For `engine_count`, vote options (`VoteOptions.Offered`,
   `Applicable`, and the loader's auto-filled options) contain only parts whose `stats.stage` matches the
   vote's `stage`. `VoteOptions.Commit` rejects a mismatch with `ArgumentException`.
9. **Fast fix-exists search** (gap). `FixSearch.Run` can do up to `FixSearchMaxEvaluations` = 200,000
   evaluations (about 6 s when it hits the cap). Prune it: skip branches already blocked by a rule that
   later votes cannot change, and use optimistic Δv and TWR bounds. Two checks:
   - **Speed:** for every contract C0–C8 and every option of every vote, starting from an empty build,
     `FixCheck.Evaluations` ≤ 5,000.
   - **Correctness:** on C0 and C1, `Exists` equals the result of the old exhaustive search, run with a
     large cap.

   Record timings in the evidence.
10. **C1 walkthrough on the real calls** (gap). Rewrite `C1WalkthroughTests` to play Appendix A through
    the public flow:
    - `VoteOptions.NextVote` + `VoteOptions.Commit` for every vote, with the same choices as today;
    - `AnomalyDeck.DrawSpecific(…, "supplier_delay")` + `AnomalyDeck.Respond(…, "pay_to_expedite")`;
    - `DesignReview.Run(ReviewKind.Pdr, …)`, then `DesignReview.Rework` / `CompleteRework` of
      `upper_stage_tank_size` to `tank_m`;
    - `TestCampaign.Run("thermal_vacuum_test", "instrument", …)`, then `FixFlaw` if a flaw is revealed
      (pick a seed that reveals one, and say which);
    - `ReviewKind.Cdr`, `ReviewKind.Frr` and `FrrPoll.Start.Record(4, 0)`, which gives GO.

    Assert lift-off TWR ≈ 1.35, budget remaining ≥ 0 and no Blocker. The 2% Δv margin of Appendix A is
    not reproducible (28.8%); keep that documented.

## Acceptance

- `dotnet test core/dotnet~` passes, with a test for each item above. Save the output as
  `orchestration/evidence/T010/dotnet-test.txt`, with the test count.
- If you touched `data/`, `node tools/validate-data.mjs` passes.
- Still no `UnityEngine`, `System.Random`, I/O or clock in `core/Runtime`. Public API has XML comments
  with units.
- The summary lists, per item: done or not; plus **Decisions** (each `game_value`) and
  **Interface changes**, including every new public member.

## Design references

Sections 4.2, 5.1, 6.2, 6.6, 6.8, 6.9, 6.11, 7.1, 7.5, 7.6, Appendix A; issue #23; `data/README.md`
(open question 1).

## Orchestrator note: failing tests on main

`dotnet test core/dotnet~` on the orchestrator machine (Windows, .NET 8.0.428) against
current `main`, which has the complete data catalog that did not exist when T002 ran:
295 passed, **3 failed**. Fix these first; they are part of this task.

- `Data.CatalogLoaderTests.Real_data_loads_leniently_and_converts_units_to_SI`:
  a collection read from real data is empty (line 44).
- `Data.CatalogLoaderTests.Modifiers_become_the_derived_stats_of_the_build_rules`:
  assertion false (line 112).
- `Build.PartRuleValidationTests.Rtls_without_grid_fins_is_a_blocker`: string mismatch
  (likely a rule or part ID that changed in the final data).
