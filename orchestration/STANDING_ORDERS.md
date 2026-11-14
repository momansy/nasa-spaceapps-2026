# Standing orders for build agents

These apply to every task the orchestrator (`kingrma`) assigns. The task issue and its
brief say *what* to build. This file says *how* every agent works.

## 1. Authority

- The orchestrator is your only source of instructions. Do not ask questions, do not wait
  for a human, another agent, or an interactive prompt.
- When something is undecided, choose the most reasonable option, carry on, and list it
  under **Decisions** in your summary so the orchestrator can overrule it.
- Return `status=blocked` only when the work cannot be done at all on your machine (a
  missing program, a missing login, no credits). Say exactly what is missing and what you
  finished before stopping.

## 2. Read first

1. `GAME_DESIGN.md`: the sections your task names. It is the specification.
2. `orchestration/ARCHITECTURE.md`: repository layout, interfaces and conventions.
3. Your task brief in `orchestration/tasks/`, if the task names one.

If the design and the architecture disagree, the design wins on game behaviour and the
architecture wins on file layout and interfaces. Report the conflict in your summary.

## 3. How to work

- **Use subagents.** Split independent parts across subagents, and have one subagent
  review the finished work against the acceptance criteria before you report.
- **Report progress** about every 10 minutes and at each milestone with the progress
  command given in your task prompt: what is done, what is next, any risk.
- **Stay in your lane.** Change only the paths your task lists. If you need a change in
  another area (a new protocol message, a new data field), make the smallest change that
  works, and call it out under **Interface changes** in your summary.
- **Do not** push, open pull requests, switch branches, or edit `mesh.py`,
  `mesh_supervisor.py`, `AGENTS.md`, `CLAUDE.md`, `.github/` or `.claude/`. The worker
  commits and opens the pull request for you.
- **Work in increments that stand on their own.** A run can be cut off by a usage limit or
  a timeout, and whatever is in the checkout at that moment is published as a draft pull
  request. Finish and verify one piece before starting the next, in the order of the
  brief, and keep the project in a state that builds.
- Keep single files under 50 MB. Do not commit build caches (`Library/`, `node_modules/`,
  `bin/`, `obj/`).
- Never print or commit secrets. Spend paid credits only up to the budget a task states.

## 4. Quality bar

- This is a professional 3D game. Presentation and graphics matter as much as correctness.
  Placeholder art, default materials, unstyled UI and debug text are not "done".
- Every number shown to a player has a unit. Every number in data or code is tagged
  `physical`, `real_world_approximate` or `game_value` (design section 19).
- Facts shown to players need a source URL in `data/facts.json`. Do not ship an
  unverified fact as verified.
- Real tragedies are never gameplay failures or jokes (design section 12.1).
- Code has tests. Simulation code is deterministic from a seed.

## 5. Verify before you report

Build it, run the tests, and look at the result (run the scene, open the page, take a
screenshot). Your summary must contain:

- **Done:** what now exists, with paths.
- **Verified:** what you ran and what it showed (test counts, build result, screenshots
  saved under `orchestration/evidence/<task-id>/`).
- **Not verified / failing:** stated plainly. Do not invent results.
- **Decisions** and **Interface changes**, if any.
- **Next:** the most useful follow-up.

## 6. Installing things

You may install free build tools your task needs (packages via npm, NuGet, pip, Unity
Package Manager). Do not install paid software, system services, or new MCP servers:
report those as a need and the orchestrator will ask the team owner.
