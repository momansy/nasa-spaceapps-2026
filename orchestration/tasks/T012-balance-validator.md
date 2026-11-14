# T012 — Balance validator (package I1)

**Worker:** `ahmed-saeed-amek` · `mesh-model: sonnet` · `mesh-effort: high` · **Owns:** `tools/balance~/`, `orchestration/evidence/T012/`

Needs the .NET 8 SDK. No MCP server. Queue after T010, so the fixed build rules are on `main`. Use
at most one subagent, for the final review.

## Goal

Design 17.10 and 18.1 require that every contract C0–C8 has **at least 3 meaningfully different valid
builds within budget and schedule**, and **no single dominant build**. Write a .NET 8 console tool that
searches part combinations through Core's real build rules and reports this. The tool **reports; it
never changes `data/`, `core/` or the Core solution.** Recommended data changes go in the report.

## Interface

- `tools/balance~/MissionForge.Balance.csproj` (net8.0, C# 9+, nullable) with
  `<ProjectReference Include="../../core/dotnet~/MissionForge.Core.csproj" />`. Do not add it to
  `core/dotnet~/MissionForge.Core.sln`.
- Run it with: `dotnet run -c Release --project tools/balance~ -- [--data data] [--contract C1]
  [--max-evals 300000] [--seed 1] [--out orchestration/evidence/T012] [--check]`.
- It writes `balance-report.md` and `balance-report.json` to `--out`. Exit code 0; with `--check`,
  exit 1 when any contract fails a rule; 2 on bad input.
- The tool may read files (it is not Core). It loads the catalog with `CatalogLoader.Load` from every
  `*.json` under `data/`, `data/parts/` and `data/strings/`.
- Same arguments give a byte-identical report: no timestamps. The report header shows the commit, from
  `git rev-parse --short HEAD` when available.

## Rules used (state them in the report)

- **Valid build:** every vote of `VoteOptions.VotesFor(contract)` is filled with an option from
  `VoteOptions.Offered`. The build must also have:
  - no Blocker from `Validator.Validate(build, catalog, ValidationMode.Complete)`;
  - `Dashboard.Compute(...).Budget.RemainingM ≥ 0`;
  - `Budget.TotalDays ≤ Budget.DeadlineDays`.

  Majors are allowed but counted. Use the displayed success estimate (`DashboardMetrics.Success`),
  never the hidden truth.
- **Search.** `FixSearch` is too slow to call per build, so do not use it. Build states with
  `BuildState.WithChoice`.
  - Enumerate the propulsion-coupled slots exhaustively, depth-first, pruning a branch as soon as a
    `ValidationMode.Partial` Blocker or the cost lower bound rules it out. Those slots are: launch
    site, both engines, both counts, both tanks, material, strap-on, separation, fairing, booster
    recovery, heat shield, escape system, capsule and lander.
  - Fill the other slots with two variants: cheapest, and most reliable.
  - Stop at `--max-evals`. If capped, say so per contract; seeded sampling of the rest is allowed.
  - Target under 10 minutes for all contracts.
- **Meaningfully different (Decision, document it).** Group valid builds by *architecture*: the tuple
  (first-stage engine, upper-stage engine, booster-recovery family, strap-on). The recovery families
  are expendable, parachute and propulsive. A contract passes when ≥ 3 architectures have a valid
  build.
- **Archetypes of 18.1:** the cheapest valid build (cheap and risky), the highest-success valid build
  (expensive and safe), and the best valid reusable build, if any. Show their part lists and metrics.
- **Dominance.** Keep the best build per architecture, then compute the Pareto front on cost ↓,
  schedule days ↓ and estimated success ↑. Flag **dominant** when one architecture is alone on the
  front. Flag **near-dominant** when it is within 2% of the best on every axis.
- **Unused parts (18.1 "every part has a reason to exist"):** parts that appear in no Pareto-front
  build of any contract.

## Steps, in order (each leaves a runnable tool)

1. Project, argument parsing, catalog loading. One contract is evaluated and printed to the console.
2. The search with pruning and the evaluation count. Test it on C1 against a brute-force count over a
   reduced option set.
3. Architectures, archetypes, Pareto front, dominance, unused parts.
4. The Markdown and JSON reports, and `--check`.
5. Run it on all contracts. Commit the reports in `orchestration/evidence/T012/`.
6. Add a **Recommended data changes** section. Each change names the file, ID, field, current value,
   proposed value and the reason, such as "fairing_small dominates because no contract has a payload
   diameter". Recommendations only: do not apply them.

Small xUnit tests for the pure parts (Pareto front, architecture grouping) may live in
`tools/balance~/Tests/`, run with `dotnet test tools/balance~/Tests`.

## Acceptance

- `dotnet build tools/balance~ -c Release` has no warnings. A full run finishes and writes both
  reports; a second run gives identical files.
- For each of C0–C8 the report states:
  - valid/total evaluated, and whether the search was capped;
  - the number of architectures and PASS/FAIL against ≥ 3;
  - the archetypes, dominance flags, and Majors per archetype.
- `git status` shows changes only under the two owned paths. Never commit `bin/` or `obj/`.
- The summary pastes the per-contract PASS/FAIL table, the dominant builds and the top recommended
  data changes. List **Decisions**.

## Design references

Sections 5.1, 6.3, 6.4, 6.11, 7, 17.10, 18.1–18.3; `data/README.md` (open questions).
