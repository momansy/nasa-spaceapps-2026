# T014 — Core campaign and modes (package B4)

**Worker:** `momansy` (Codex) · **Owns:** `core/Runtime/Campaign/`, `core/dotnet~/Tests/Campaign/`, `orchestration/evidence/T014/`

Needs the .NET 8 SDK. This task uses no MCP server. **Queue after T013** (same worker). It is bounded:
work in the order below, finish and test each step before the next, and if the run ends early, stop
at a step boundary.

## Goal

The persistent layer around single missions, in namespace `MissionForge.Core.Campaign`:
- the Agency Campaign (13.2);
- the other modes of 13.3, as configuration of a mission;
- leaderboard records (13.6);
- achievements (13.5).

Same conventions as the rest of Core: `netstandard2.1`, C# 9 without records, no `System.Random` /
I/O / clock. The host passes dates as strings and saves JSON text itself.

**Do not edit** `Build`, `Data`, `Flight`, `Scoring` or `Session`. Campaign takes a mission's outcome
through its own input type, `MissionReport`. The host fills it from the debrief, so this task does not
depend on whether T011 is merged. `MissionReport` holds:
- contract ID, mode, outcome (Success/Partial/Failure), score and grade;
- budget remaining $M, schedule margin days, on time;
- Knowledge Points earned;
- the recovered hardware (part IDs);
- the failure mode, if any;
- the met objectives.

Campaign changes a build only through the public `BuildState` API:
- `WithLedger(new LedgerEntry(LedgerKind.Budget, "<source>", costM, days, budgetDeltaM))` for money and
  days;
- `WithFlag`;
- `WithCondition(slot, PartCondition.With(reliabilityDelta: …))` for wear.

Every number the design leaves open goes in `CampaignConstants`, tagged `game_value`, and is listed
under **Decisions**. Do not add data files; propose a `data/campaign.json` under **Interface changes**.

## Steps, in order

1. **`CampaignState`.** Immutable, with `ToJson()` / `FromJson()` and a `version` field. It holds:
   - agency name, logo ID and home launch site;
   - reputation (0–100), Knowledge Points and the carried-over budget;
   - unlocked parts, the inventory and milestones;
   - the missions flown, and the insurance flag.

   Test that a JSON round trip is identical, and that an unknown version fails with a clear message.
2. **Reputation and contracts board.**
   - `Campaign.Record(state, MissionReport)` returns a `CampaignUpdate`: the next state plus every
     change with its reason.
   - Reputation rises with success and on-time delivery and falls with failure and slips.
   - `ContractsBoard.Offer(state, seed)` offers 2–3 contracts from C0–C8. Harder ones unlock at
     reputation thresholds; the draws use `SeededRandom(seed).ForStream("campaign")`.
   - Supplier trust: a part-price discount that scales with reputation, applied as a negative-cost
     ledger line on the new build.
3. **Budget carry-over and insurance.**
   - A percentage of the leftover budget carries into the next mission, as a `budgetDeltaM` line.
   - Optional insurance: a premium is paid up front, and part of the budget comes back after a
     failure.
4. **Tech tree.** Nodes are bought with Knowledge Points and unlock parts:
   - methalox: `eng_methalox_full_flow`, `eng_methalox_vacuum`;
   - laser comms: `comm_laser`;
   - terrain-relative navigation: `nav_terrain_relative`;
   - HIAD: `tps_inflatable_decelerator`;
   - hot staging: `sep_hot_staging`.

   Each node has a real-tech text key (`campaign.tech.<id>.name` / `.real_tech`) and prerequisites.
   `Campaign.IsPartAvailable(state, partId)` is the filter the host applies to vote options.
5. **Hardware inventory with wear.**
   - Recovered boosters, fairings and capsules enter the inventory with a flight count.
   - Reusing one gives a cost refund line and a reliability penalty per flight, which refurbishing
     (cost and days) resets.
   - `Inventory.ApplyReuse(build, catalog, itemId)` returns the adjusted `BuildState`.
6. **Milestones:** first orbit, first recovery, first crew, first lunar flyby, first Mars landing.
   Each is detected from `MissionReport` once and emits an event with a cinematic ID and a Codex
   unlock ID.
7. **Modes (13.1, 13.3).** `ModeRules.For(mode, options)` returns a `MissionSetupRules`: budget and
   schedule override or multiplier, part filter, seed policy, assist lock, and the leaderboard metric.
   Mode tokens are those of `GameMode` in `protocol/messages.md`.

   | Mode | Rules |
   |---|---|
   | Quick | Defaults. |
   | Sandbox | Unlimited budget and time, all parts, no leaderboard. |
   | Challenge of the Day | Seed and contract from a caller-supplied `yyyy-MM-dd` string (FNV-1a hash into `SeededRandom`), plus a fixed parts pool. |
   | Heritage | Era part allow-lists in code: one 1960s lunar-flyby preset, and one more. |
   | Classroom | Flags for pause, lock votes and export; no personal data. |
   | Solo | One player; the advisor flag. |
   | Speedrun | Ranked by schedule days. |
   | Budget Crunch | A fixed small budget (a game value). |
8. **Leaderboards (13.6).**
   - `LeaderboardRecord`: contract, mode, team name, score, budget efficiency, schedule days, seed,
     date string. There are no player names.
   - `TeamName.Validate` enforces a length limit and an allowed character set.
   - `Leaderboard.Insert` / `Top(n)` / `Rank`, with deterministic tie order, and JSON round trip.
9. **Achievements (13.5)**, from `data/achievements.json` (`criteria` use the objective ops
   `gte gt lte lt eq within is_true`). `Achievements.Evaluate(state, MissionReport, metrics)` returns
   the newly unlocked IDs, once each.

## Acceptance

- `dotnet test core/dotnet~` passes, with tests for every step: hand-checked reputation and carry-over
  arithmetic, wear over several flights, a tech-tree purchase with and without enough KP, the
  same-date daily challenge giving the same seed and contract, and each mode's rules.
- Determinism: the same state, report and seed give the same result.
- The output goes in `orchestration/evidence/T014/dotnet-test.txt`. The summary lists steps done and
  not done, **Decisions** and **Interface changes**, including the proposed `data/campaign.json`
  fields and the string keys to add.

## Not in this task

Spectator mode (13.7, server and client), cosmetics and patches (13.4), and the campaign hub UI.

## Design references

Sections 13.1–13.6, 7 (part IDs), 12.2 (Knowledge Points), 17.9 (privacy); `protocol/messages.md`
`GameMode`, `kp.awarded`; `data/achievements.json`.
