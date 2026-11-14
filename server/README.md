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
| `CLIENT_BASE_URL` | `http://localhost:5173/` | Base URL the phone client is served from. Echoed into `room.created.joinUrl` / `.spectateUrl` as `<CLIENT_BASE_URL>?room=<CODE>` (and `&watch=1` for the audience link) — see protocol §4.1. Point this at wherever `client/` is deployed. |

There is no database and no persistent storage: all room state lives in memory for the life of
the process, matching the design's resilience model (a room survives a host refresh for up to 10
minutes, a player disconnect for up to 3 minutes, but the whole server restarting loses every
room, same as the spec's "no accounts, no personal data" privacy stance in §17.9).

## Deploying to a small host

The server is a single Node 20+ process with one dependency (`ws`) and no database, so it runs
on anything that can run `node dist/index.js` and expose one TCP port:

1. `npm run build` (compiles `src/` and the imported `protocol/ts/messages.ts` to `server/dist/`;
   because `protocol/ts/messages.ts` lives outside `server/`, `tsc` nests the output under
   `dist/server/src/` and `dist/protocol/ts/` to preserve the relative path — `npm start` already
   points at the right place, `dist/server/src/index.js`).
2. Copy `server/dist/`, `server/package.json` and `server/node_modules` (or run `npm install
   --omit=dev` on the target) to the host.
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

## Known gaps (read before relying on this for anything beyond the acceptance checklist)

This was built in one pass against a very large protocol (105 message types, ~20 interacting
server-side rules). The vote/role/reconnect/rate-limit engines and the `Room` integration are
unit- and integration-tested in depth. The following are mechanically wired and verified to not
crash in the load script, but are **not** verified against every rule in `protocol/messages.md`:

- **No JSON Schema validation.** Incoming `d` is trusted to match its TypeScript type; `BAD_PAYLOAD`
  is not produced by validating against `protocol/schema/*.schema.json` (no `ajv` dependency was
  added). A malformed payload from a buggy client will likely throw inside a handler and surface
  as a generic `INTERNAL` error rather than a precise `BAD_PAYLOAD` with a `field`.
- **Spectator reactions are not aggregated into `react.audience`.** `ping.send`/`react.send` from
  players broadcast correctly; the 1 Hz spectator-reaction aggregation window described in
  protocol §13 message index is not implemented.
- **`room.close` does not close every connection.** The handler is a no-op placeholder; the
  connection manager does not yet walk the room's connections and send `bye` ROOM_CLOSED to each.
- **Promotion of pending spectators** (`room.promoted`, late joiners becoming full voters at the
  next vote round or new mission) is not implemented — `joinPlayer` correctly marks a late joiner
  as a pending spectator, but nothing promotes them later.
- **The snapshot (protocol §4.5)** sends `settings.state`, `room.state`, `roles.state`,
  `game.paused` and `snapshot.end`, but not the sticky host messages, the active vote/poll/minigame
  replay, or the host-only outcome-log replay on resume — `Room` has the generic sticky cache and
  outcome log needed for this (`broadcastExplicit`, `outcomeLog`), but `sendSnapshotEnd` in
  `wire/server.ts` does not yet read them back out.
- **Ability flow** (`ability.use`/`ability.requested`/`ability.resolve`/`ability.consume`) is
  wired for FLIGHT's Decision Time and the request/accept/decline round trip, but a host that
  never answers within 5 s is not auto-declined with `NOT_APPLICABLE` as the design specifies.
- **`console.telemetry` rate limiting** (host ≤ 10 Hz per role) and other host-side droppable-type
  shedding under the 50 KB/s per-client budget are not implemented; only the inbound per-type and
  overall budgets (§11) are enforced today.

None of these affect the acceptance checks exercised by `npm test` or `npm run simulate`, but they
should be closed before this is treated as a finished implementation of §17.1.
