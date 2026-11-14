# T003 — Game data catalog (package A)

**Worker:** coding · **Owns:** `data/` except `data/schema/` (propose schema changes under **Interface changes**)

## Goal

Every content table in the design exists as validated JSON, complete and exact, so that
no later task has to open the design document to find a number.

## Scope

Use `data/README.md` as the checklist and the existing files as worked examples.

1. **Parts** (design section 7): every option of every table 7.1 to 7.20, one file per
   category in `data/parts/`. Copy numbers exactly. Every option has strengths,
   drawbacks, real-world twin, a "Did you know?" fact reference where the design gives
   one, the contracts that offer it, and `value_types`.
2. **Contracts** C0 to C8 (section 5): destination, payload, Δv, budget, schedule, special
   rules, primary/secondary/stretch/safety objectives, the vote list that applies (6.2),
   and the 3 to 5 options offered per vote. Where the design does not list the options
   for a contract, choose them so the contract has at least three different valid builds,
   and record the choice under **Decisions**.
3. **Tests** (6.6), **anomaly cards** (6.8) with trigger weights and responses,
   **validation rules** (6.11), **minigame definitions** MG-01 to MG-30 (10.5: when, type,
   duration, success rule, fact, boost by tier), **achievements** (13.5), **awards**
   (11.5), **scoring constants and grades** (11.3, 11.4), **flight phases** F0 to F14
   (9.1), **pings and reactions** (3.4), **assist levels** (9.3), **abort modes** (9.8).
4. **Strings:** all player-visible English text in `data/strings/en.json`. Facts are
   25 words or fewer on screen (12.1).
5. A generated coverage report `data/COVERAGE.md`: for each design table, rows in the
   design against rows in data.

## Acceptance

- `node tools/validate-data.mjs --strict` passes.
- `data/COVERAGE.md` shows 100% for every table in sections 5, 6.6, 6.8, 6.11, 7, 10.4, 10.5.
- A subagent has independently re-checked every number in section 7 against the JSON and
  its findings are fixed or listed.
- Facts are entered with `status: "unverified"`; verification with sources is task A2.

## Design references

Sections 3 to 13, 19.
