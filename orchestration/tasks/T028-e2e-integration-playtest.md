# T028 — End-to-end integration and playtest: server + host + 1, 3, 6, 10 phones (package I2)

**Worker:** any coding worker with Node 20+ (22 preferred) and Playwright Chromium; suggested
`yahia-aglan` (Codex, QA) or `mohammed-alainieh`. No MCP server needed. Optional: the .NET 8 SDK
(step 8 only). If dispatched to a $20 Claude worker, add `mesh-model: sonnet` and
`mesh-effort: high`.

**Owns (create):** `tools/e2e/` and `orchestration/evidence/T028/`. Nothing else.

**This task finds defects; it does not fix them.** Do not edit `server/`, `client/`, `unity/`,
`core/`, `protocol/`, `data/` or `docs/`. You may run their own build and test commands (`npm ci`,
`npm run build`, `npm test`), which write only git-ignored output (`node_modules/`, `dist/`,
`test-results/`). If a defect blocks a segment, work around it **inside `tools/e2e/`** when that is
honest (for example the scripted host skips a broken message and says so), record the defect, and
carry on to the next segment. Never paper over a failure in the results.

Usage limits can cut a run off: **each step leaves a runnable harness and committed results**.
Use at most one subagent, for the final review. **Split point:** steps 1–4, then 5–9.

## Read first

`GAME_DESIGN.md` 2.2, 3.1, 3.2, 4, 6.9, 9.1, 9.4, 9.5, 10.3, 13.7, 17 (17.3 state machine, 17.7
resilience, 17.8 performance targets, 17.10 testing), 20.3; `orchestration/ARCHITECTURE.md`
sections 2, 5, 7; `protocol/messages.md` (all of sections 2–12, then the references you need) and
`protocol/schema/`; `protocol/ts/messages.ts` (`MESSAGE_META`); `server/README.md` and
`server/tools/simulate.mjs` (a fake host and players over real sockets: reuse its patterns, do not
edit it); `client/README.md` (run, `?room=`, `&watch=1`, mock script, test ids) and
`client/e2e/session.spec.ts` (selectors that already work on the phone UI);
`client/src/net/wsConnection.ts` (the phone connects to `VITE_ROOM_SERVER_URL`, else same-origin
`/ws`); `docs/play/host/index.html` (`?server=`, `?perf=1` and `window.mfPerf`) and
`unity/MissionForge/Assets/MissionForge/Net/ServerUrlResolver.cs`; `data/contracts.json` (C1 vote
list), `data/minigames.json`, `data/parts/*.json`.

## What to build

- `tools/e2e/package.json` (own dependencies: `@playwright/test`, `ws`, `ajv`; Node ESM) and a
  `README.md` with the one-command runs below.
- `tools/e2e/lib/`:
  - **stack launcher:** builds (if missing) and starts the real room server (`server/`,
    `PORT=<ephemeral>`, `CLIENT_BASE_URL` pointing at your static server, `PROTOCOL_SCHEMA_DIR`);
    a static HTTP server for `client/dist/` and `docs/play/host/` that serves `.unityweb` files
    with `Content-Encoding: gzip` and the right MIME types (`application/wasm`,
    `application/javascript`, `application/octet-stream`), and **proxies WebSocket upgrades on
    `/ws`** to the room server so the phone build's same-origin `/ws` works without a rebuild;
  - **frame recorder** inside that proxy: every frame both ways, with a monotonic timestamp,
    connection id, role (host / player / spectator) and byte size, written as NDJSON per run; each
    frame validated with ajv against `protocol/schema/<type>.schema.json` and the envelope schema;
  - **phone driver:** one Playwright page per phone (390×844, `hasTouch`, `isMobile`), opened at
    `/?room=<CODE>` (spectators with `&watch=1`), joins with a generated nickname, then follows a
    per-screen policy: votes by tapping a card and the vote button (a seeded choice), answers its
    poll call (GO, or NO_GO when the scenario asks), presses callouts when an alert appears, plays
    minigames in one-button or relaxed mode with generic taps (or lets them time out; record which);
    an injected `requestAnimationFrame` probe gives page fps; console errors and page errors are
    captured;
  - **metrics:** per run and per client, see step 6.
- `tools/e2e/host/scripted-host.mjs`, the **stub host**: a Node WebSocket client that plays the
  Unity host by the protocol (`hello` as host, `room.create`, `settings.set`, `phase.set` for every
  phase, `vote.open` / `vote.commit`, `poll.open`, `build.state`, `flight.hud` at 5 Hz,
  `console.config` and `console.telemetry` at ≤ 10 Hz per console, `console.alert`, `pilot.assign`,
  `mg.start` / `mg.summary`, `blackout.set`, `boost.applied`, `sync.meter`, `debrief.*`). Its
  numbers come from `tools/e2e/fixtures/c1/*.json` built from `data/contracts.json` (C1 votes and
  option ids) and `data/parts/*.json`; every "if chosen" number in a fixture is labelled
  `fixture (not Core)` in the file and in the results. The C1 script follows design 2.2 and 17.3
  with shortened timers: LOBBY → BRIEFING → CONTRACT_VOTE (C1, C0, C2) → BUILD (at least five PART
  rounds including one with a veto and one forced tie, one TEST quick vote, one PDR REVIEW vote) →
  FRR (poll round 1 with one NO_GO, round 2 all GO) → COUNTDOWN (MG-07) → FLIGHT F2–F9 (MG-08,
  MG-09, MG-10a, MG-13, MG-15, MG-21; one blackout) → DEBRIEF.
- `tools/e2e/run.mjs` and `npm run e2e -- --players 1,3,6,10 [--host stub|unity|both]
  [--spectators N] [--seed N]` writing everything under `orchestration/evidence/T028/runs/<runId>/`.

## Steps (in order)

1. **Preflight.** Record Node, npm, Playwright and Chromium versions, the OS and machine, and
   `git rev-parse HEAD`. `npm ci && npm test && npm run build` in `server/` and `client/` (record the
   test counts; failures are defects, not blockers, unless nothing builds). If neither the server
   nor the client builds, return `status=blocked` with the errors.
2. **Harness and a 1-phone smoke.** Stack launcher, frame recorder with schema validation, phone
   driver, and a scripted host that only does LOBBY → BRIEFING. One phone joins, sees the lobby and
   the briefing. Evidence: phone screenshots and the frame log.
3. **Full C1 script, 1 phone, stub host.** Complete the scripted host and fixtures; run lobby to
   debrief with one phone (solo rules: no vote timer, direct choice, solo minigame tiers). Fix your
   harness until the run is stable twice in a row with the same seed.
4. **Unity WebGL host.** Serve `docs/play/host/` and open
   `/host/?server=ws://127.0.0.1:<port>/ws&perf=1` in Chromium at 1920×1080: first headless with
   `--use-angle=swiftshader --enable-unsafe-swiftshader --enable-webgl --ignore-gpu-blocklist`,
   then headed if headless fails. Read the room code from the host's `room.created` frame (via
   `page.on('websocket')` or the proxy), press the title screen's New Mission control, let phones
   join, confirm the host's lobby shows them (screenshot), and walk forward with Page Down / the
   on-screen controls as far as the current build allows, screenshot each screen and record
   `window.mfPerf` fps. Record which host screens are real and which are still T001 placeholders.
   If the WebGL host cannot start, record the exact error and the flags tried, file it as a defect
   and use the stub host for the remaining steps.
5. **Player counts.** Run the full C1 script with **1, 3, 6 and 10 phones** (stub host), plus 2
   spectators in the 6- and 10-phone runs (audience vote weight 1 in one of them), and the Unity
   host for the lobby segment of each run where step 4 works. Scenarios inside the runs: one phone
   drops its socket mid-vote and resumes within 3 minutes (slot and role kept, abstains while away);
   one phone reloads the page and resumes from the token; the host socket drops for 20 s during
   BUILD (`game.paused` with `HOST_DISCONNECTED`, then resume); a late joiner after BUILD starts
   becomes a pending spectator.
6. **Measurements** (per run, per client, p50 / p95 / max where it applies):
   - vote round trip: phone `vote.cast` sent → `vote.ack` received at that phone, and → the next
     `vote.tally` that includes the voter (target < 200 ms on a local network, design 17.8);
   - poll: `poll.answer` → `poll.answered`; minigame: `mg.result` sent → relayed to the host;
   - message rates received: `flight.hud` (≤ 5 Hz), `console.telemetry` per role (≤ 10 Hz),
     `vote.tally` (≤ 5 Hz), `pilot.hud` if any (≤ 10 Hz); bytes per second per client (< 50 KB/s);
   - fps: Unity host (`window.mfPerf`) and each phone during a minigame (target 30+), with CPU
     throttling ×4 through CDP on one phone in the 10-phone run;
   - errors: `error` frames by code, schema violations, phone console errors, page errors, server
     stderr, frames for unknown types, seq gaps.
7. **Defects and results.** `orchestration/evidence/T028/DEFECTS.md`: a numbered list `D-001`, `D-002`,
   … each with severity (Blocker / Major / Minor), component (`server`, `client`, `unity`,
   `protocol`, `data`, `core`, `docs`), title, exact repro (command, run id, seed, player count, the
   seq numbers or timestamps in the frame log), expected (cite the protocol or design section),
   actual, evidence files, and whether the harness worked around it. One defect per root cause.
   `RESULTS.md`: per player count a table of segments (lobby, briefing, contract vote, each part
   round, test, PDR, FRR, countdown, each minigame, blackout, debrief, each resilience scenario)
   marked pass / fail / not reached, the measurement table against the targets, and which host was
   used where. Keep each log under 5 MB (gzip larger ones) and every file under 50 MB.
8. **Optional: Core-generated fixtures.** If the .NET 8 SDK is available, add
   `tools/e2e/core-fixtures~/` (a small console project referencing `core/` read only) that writes
   the C1 vote options and "if chosen" numbers with `VoteOptions.For` and `Preview.Of`, and rerun the
   3-phone case with them. Skip this step without it and say so.
9. **Review.** One subagent re-runs the 3-phone case from a clean checkout with the README's one
   command and checks this acceptance list before you report.

## Acceptance

- `cd tools/e2e && npm ci && npx playwright install chromium && npm run e2e -- --players 1,3,6,10`
  runs unattended on Windows and macOS (state which you ran) and reproduces your results.
- All four player counts were attempted with the full C1 script; every segment is marked pass,
  fail or not reached with a reason; the resilience scenarios ran.
- Every frame of every run was schema-checked; the counts of valid and invalid frames are in
  `RESULTS.md`.
- `DEFECTS.md` lists every defect found, numbered, each reproducible from its repro line; nothing
  outside `tools/e2e/` and `orchestration/evidence/T028/` changed (git-ignored build output excepted).
- Evidence in `orchestration/evidence/T028/`: `RESULTS.md`, `DEFECTS.md`, `ENVIRONMENT.md` (versions,
  machine, commit), one run folder per player count with the frame log, metrics JSON, the phone
  screenshots at lobby, a part vote, the FRR poll, one minigame and the debrief, and the Unity host
  screenshots and fps from step 4 (or the recorded reason it could not run).
