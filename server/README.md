# MissionForge room server

The room server of `GAME_DESIGN.md` §17.1 and `orchestration/ARCHITECTURE.md`: it implements
`protocol/messages.md` and is the authority for membership, roles, votes, polls and timers. The
Unity host and the phone web clients both connect here over WebSocket; the host owns the
simulation, this server owns rooms, roles, votes and reconnection.

## Run locally

```bash
cd server
npm install
npm test            # unit + integration tests (vitest)
npm run dev          # starts the server with tsx, no build step
```

`npm run dev` (or `npm start` after `npm run build`) starts a WebSocket server on `PORT`
(default `8787`). Connect a client to `ws://localhost:8787`.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | TCP port the WebSocket server listens on. |
| `PROTOCOL_SCHEMA_DIR` | auto | Directory holding `protocol/schema/*.schema.json`, used to validate every payload (`BAD_PAYLOAD`). By default the server walks up from its own location to the nearest `protocol/schema`, so it works from a checkout; set this when `server/dist` is deployed without the repository. |
| `CLIENT_BASE_URL` | `http://localhost:5173/` | Base URL the phone client is served from. Echoed into `room.created.joinUrl` / `.spectateUrl` as `<CLIENT_BASE_URL>?room=<CODE>` (and `&watch=1` for the audience link) — see protocol §4.1. Point this at wherever `client/` is deployed. |

There is no database and no persistent storage: all room state lives in memory for the life of
the process, matching the design's resilience model (a room survives a host refresh for up to 10
minutes, a player disconnect for up to 3 minutes, but the whole server restarting loses every
room, same as the spec's "no accounts, no personal data" privacy stance in §17.9).

## Deploying to a small host

The server is a single Node 20+ process with two runtime dependencies (`ws`, `ajv`) and no database, so it runs
on anything that can run `node dist/index.js` and expose one TCP port:

1. `npm run build` (compiles `src/` and the imported `protocol/ts/messages.ts` to `server/dist/`;
   because `protocol/ts/messages.ts` lives outside `server/`, `tsc` nests the output under
   `dist/server/src/` and `dist/protocol/ts/` to preserve the relative path — `npm start` already
   points at the right place, `dist/server/src/index.js`; `tools/postbuild.mjs` marks `dist/protocol/` as CommonJS because that folder is compiled from outside the ESM package).
2. Copy `server/dist/`, `server/package.json`, `protocol/schema/` and `server/node_modules` (or run
   `npm install --omit=dev` on the target) to the host, and set `PROTOCOL_SCHEMA_DIR` to the copied schema folder.
3. Run `PORT=8787 CLIENT_BASE_URL=https://play.example.org/ node dist/server/src/index.js`, behind a reverse
   proxy that terminates TLS and forwards `wss://` to the process (nginx `proxy_pass` to
   `http://127.0.0.1:8787` with the `Upgrade`/`Connection` headers, or an equivalent on Fly.io /
   Render / a small VPS). A process manager (`systemd`, `pm2`) should restart it on crash — a
   restart loses all rooms, which is an acceptable trade-off for a 10-15 minute mission.
4. Health check: open a WebSocket to the port and send `hello`; a `hello.ok` reply within 5 s
   means the process is healthy.

The server needs no outbound network access and stores no data outside its own process memory.

## Code layout

| Path | What |
|---|---|
| `src/rooms/roomCode.ts`, `identity.ts` | Room code generation, nickname normalisation/profanity filter, reconnect tokens (protocol §4.1, §14, GAME_DESIGN §3.1). Pure functions. |
| `src/roles/roles.ts` | Role group table for 1-10 players, RANDOM/PICK/VOTE assignment, leave/arrive/rotate rebalancing (protocol §5). Pure functions. |
| `src/votes/rules.ts`, `resolve.ts` | Vote stage profiles and durations, winnable options, vetoes, tags, and the full resolution algorithm: all-abstain, runoff, every tie-breaker, Emergency Funding (protocol §7). Pure functions. |
| `src/timers/clock.ts`, `reconnect.ts`, `pause.ts` | Clock abstraction, 3-minute slot hold, 10-minute room hold, pause freeze/resume deadline shifting (protocol §4.3, §4.4). Pure, clock-injectable. |
| `src/limits/tokenBucket.ts`, `messageLimits.ts` | Token-bucket rate limiting per message type and the overall per-connection budget / FLOOD detection (protocol §11). Pure, clock-injectable. |
| `src/rooms/room.ts` | The `Room` aggregate: wires every engine above into one room's live state (membership, settings, role assignment, the active vote round, the active poll, the outcome log, pause state). |
| `src/rooms/orchestrate.ts` | Drives the vote-round stage machine (REVEAL → … → CLOSED) over real timers by reacting to `Room.onStageEndHook`. |
| `src/wire/connection.ts` | The `Connection` interface `Room` talks to, plus `FakeConnection` for tests (no real socket). |
| `src/wire/routing.ts` | Generic recipient resolution driven by `protocol/ts/messages.ts`'s `MESSAGE_META` table (`to: SENDER / HOST / EVERYONE / CLIENTS / ROLE / TO / …`). |
| `src/wire/dispatch.ts` | Per-type handlers for message families that need room business logic (rooms, roles, votes, polls, abilities, phase/pause). Everything else falls through to the generic relay. |
| `src/wire/validate.ts` | Payload validation against `protocol/schema/*.schema.json` with ajv (unknown fields ignored, first failing field reported as `BAD_PAYLOAD.field`; protocol §12.1 step 8). |
| `src/wire/server.ts`, `wsConnection.ts` | The real WebSocket bootstrap: handshake, envelope and rate-limit checks (protocol §2, §3, §11, §12.1), `bye` close codes (§14 `ByeReason`). |
| `src/index.ts` | Entry point. |
| `tools/simulate.mjs` | Load script (see below). |

## Tests

`npm test` runs the full vitest suite: unit tests for every voting rule (ties, vetoes, abstains,
runoff, all-abstain, the "at least two options remain" veto rule), role merging for 1-10 players,
reconnect/pause timing with a fake clock, and `Room`-level integration tests (using `FakeConnection`,
no real socket) that exercise full vote rounds including veto, FLIGHT tie-break, trivia
sudden-death and runoff, a GO/NO-GO poll, and pause/resume deadline shifting.

`src/wire/dispatch.test.ts` audits that every one of the protocol's message types is either a
pre-room handshake type, has an explicit handler, or is correctly delivered by the generic
`MESSAGE_META`-driven relay.

## Load script

```bash
npm run simulate
```

Starts its own server instance on `SIMULATE_PORT` (default `8821`) and runs a scripted session
over real WebSockets with **one host, 10 players and 50 spectators**: room creation, all 10
players joining, 50 spectators joining, role lock, five PART vote rounds (prints `vote.cast` →
`vote.ack` round-trip time percentiles across all 50 ballots cast, and flags any over the 200 ms
design target of §17.8), a full GO/NO-GO poll calling every console, and a ping fan-out check.

## Measured load numbers

`npm run simulate` on the development laptop (Node 20+, server and 61 clients on loopback, so this is
server processing time, not network latency): 5 vote rounds, 10 players, 50 spectators.

| Measurement | n | p50 | p95 | max |
|---|---|---|---|---|
| Player `vote.cast` to `vote.ack` | 50 | 0 ms | 2 ms | 2 ms |
| Spectator (audience) `vote.cast` to `vote.ack` | 250 | 5 ms | 7 ms | 8 ms |
| Ping fan-out to host and 9 other players | 1 | 2 ms | | |

The design target of §17.8 is under 200 ms; 0 of 300 ballots exceeded it. Real phones add their own
network latency on top.

## Behaviour added beyond the wire basics (all covered by tests)

- Slot holds (3 min) and the 10-minute host-absent room expiry are enforced by `Room.sweep()`, which the
  connection manager calls once a second; hold countdowns freeze while paused.
- Pause freezes the vote-stage timer and the poll-call timer and resumes them with the time left.
- `vote.tally` (open or hidden, at most every 200 ms), `vote.ack` for veto / runoff resets, poll per-call
  timeout (NO_ANSWER), ability requests auto-declined after 5 s or on host drop, host stream caps
  (`console.telemetry` 10 Hz per role, `flight.hud` 5 Hz, `pilot.hud` / `mg.state` 10 Hz) and blackout
  discards, 1 s `react.audience` aggregation, promotion of pending players when a vote opens or a new
  mission starts, `room.close` / expiry `bye` to everyone, `bye REPLACED` for a second connection on a
  token, and the §4.5 snapshot (sticky messages, active round, own ballot, poll call, minigame, host
  outcome-log replay).

## Known gaps

These are simplifications or unverified areas; none affects `npm test` or `npm run simulate`.

- **Outbound 50 KB/s shedding** (§11, droppable types sent *to* a client) is not implemented. Inbound
  limits and the host stream caps above are.
- **Pending spectators that are offline** when a vote opens are not promoted until a later round (they
  have no live socket to receive `room.promoted`).
- **Per-message business checks on host-bound relays are partial.** Player messages for the host go
  inside the `relay` wrapper (refused with PAUSED when the host is away) and `pilot.input`,
  `pilot.action` and `copilot.action` check phase and seat (`NOT_PILOT`). `mg.*`, `console.*`,
  `ping.send.optionId`, `pilot.assign` and `pilot.hud.to` have no extra checks beyond sender class,
  schema and rate limit.
- **Solo play** does not skip INSPECT (§7.1), and a *disconnected* FLIGHT holder's ballot still counts
  in the FLIGHT tie-break (§4.3 says it should be ignored).
- **Stage and poll timers use real `setTimeout`**, not the injected fake clock (deadlines and pause
  maths do use the clock); tests drive them with vitest fake timers.
- **`phase.set` does not check the transition graph** (`INVALID_TRANSITION`).
- **Decision Time in a tie-break** ends the stage and names the winner (`DECISION_TIME`); the optional
  `vote.trivia.result` is skipped in that case.
- **Independent review**: a reviewer subagent audited the code against `protocol/messages.md` and found
  the problems fixed in this pass (missing roundId/stage/seat validation, roles never auto-locking,
  `settings.roleAssignMode` not reaching the role engine, pause/resume idempotence, missing
  `ability.used` for Emergency Funding). The gaps above are what remained.
- The server holds all state in memory; a restart loses every room (by design, §17.9).
