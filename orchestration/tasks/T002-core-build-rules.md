# T002 — Core build rules (package B1)

**Worker:** `ahmed-saeed-amek` · **Owns:** `core/Runtime/Data/`, `core/Runtime/Build/`, `core/dotnet~/Tests/Build/`, `core/dotnet~/Tests/Data/`

Needs the .NET 8 SDK (`dotnet --version`). If it is missing, install it from the official
Microsoft installer; it is a free build tool.

## Goal

The complete build-phase rules engine in pure C#, exactly as specified in design sections
6.3 to 6.11, loading its content from `data/`. The Unity host calls it; it has no Unity
dependency. Follow `core/README.md` and `orchestration/ARCHITECTURE.md` section 3.

## Scope

1. `Core.Data` — typed catalog loaded from JSON text (parts, contracts, tests, anomalies,
   roles, boosts, validation rules) per `data/schema/`. Fails with a clear message on a
   bad reference.
2. `Core.Build.BuildState` — the vehicle under construction: chosen part per vote,
   engine counts, tank sizes, tests run, anomalies resolved, money and days spent.
   Immutable updates so a preview never mutates the real build.
3. `Core.Build.Dashboard` — every metric in the table of section 6.3: total Δv per stage
   with effective Isp, lift-off TWR, upper-stage TWR, total mass, cost, schedule, estimated
   mission success with uncertainty band, payload power balance (sunlit and eclipse), data
   budget, entry speed rating, stability (centre of pressure against centre of mass).
   Include launch-site rotation boost, material multipliers, recovery Δv cost, hot-staging
   bonus, strap-on boosters as a parallel stage, dry tank mass from structural ratios.
4. `Preview(build, option)` — the "if chosen" deltas for every option in a vote round.
5. Budget and schedule (6.4): parallel lead time, serial integration, test days, the
   critical path as a list of steps for the timeline, deadline slips.
6. Reliability (6.5): hidden true reliability drawn from the band with the seeded PRNG,
   maturity bands, test narrowing, redundancy `1 − (1 − R)^n`, engine-out capability.
7. Testing campaign (6.6), redundancy options (6.7), anomaly cards (6.8) with weighted
   seeded draws and the effect of each response, design reviews PDR/CDR/FRR (6.9) with
   rework cost, mission assurance level effects (7.20).
8. Validation rules (6.11) with severity and the exact explanation text key, and the
   "fix exists" check required by section 4.2 for invalid combinations.
9. Vote option filter: which 3 to 5 options a contract offers per vote (6.2), affordability
   flag and over-budget amount (4.2).

## Acceptance

- `dotnet test core/dotnet~` passes. Tests include hand-computed cases for every dashboard
  metric (show the arithmetic in comments), the Appendix A walkthrough build for contract
  C1 (Kerolox Workhorse ×3, S tanks, lift-off TWR about 1.35 after the tank change), each
  validation rule firing and not firing, critical path, redundancy, anomaly determinism
  from a seed.
- No `UnityEngine`, no `System.Random`, no I/O, C# 9, `netstandard2.1`.
- Public API documented with XML comments including units.
- If a design number is missing or contradictory, pick a value, tag it `game_value`, and
  list it under **Decisions** for the orchestrator.

## Design references

Sections 4.2, 6, 7 (all tables), 8.1, 8.2, 19.
