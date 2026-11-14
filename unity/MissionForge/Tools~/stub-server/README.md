# MissionForge stub room server

A small in-memory WebSocket room server for developing and testing the Unity host
(`Assets/MissionForge/Net`) without the real `server/` or any phones. It speaks the wire contract
in [`protocol/`](../../../../protocol/README.md) (protocol version 1): it loads
`protocol/schema/*.schema.json` and `MESSAGE_META` from `protocol/ts/messages.ts` at start-up, so
message types, allowed senders, routing and payload validation come straight from the contract.

- Zero npm dependencies: the RFC 6455 handshake and framing are implemented on `node:http` and
  `node:crypto` (`lib/websocket.mjs`).
- Requires Node.js 22 or newer (the smoke test uses the built-in `WebSocket` client).
- Development only: no TLS, no rate limits, no profanity filter, no persistence, and it listens on
  all network interfaces by default so phones on the same Wi-Fi can reach it. Do not expose it to
  the internet.

The folder name ends in `~`, so Unity ignores it (no import, no `.meta` files).

## Run

```sh
node server.mjs                        # ws://localhost:8787
node server.mjs --port 0               # pick a free port
node server.mjs --bots 3               # 3 fake players join every new room (lobby demo, no phones)
MISSIONFORGE_STUB_BOTS=3 node server.mjs   # same, from the environment
node smoke.mjs                         # self-test; prints PASS/FAIL lines, exit code 1 on failure
```

| Option | Default | Meaning |
|---|---|---|
| `--port <n>` | `8787` | TCP port; `0` picks a free one |
| `--host <addr>` | all interfaces | Bind address (use `127.0.0.1` to stay local) |
| `--bots <n>` | `0` (or `MISSIONFORGE_STUB_BOTS`) | Fake players (0–10) that join each new room one by one |
| `--bot-interval-ms <n>` | `1500` | Delay between bot joins |
| `--client-url <url>` | `http://localhost:5173/` | Phone client base URL used for `room.created.joinUrl` / `spectateUrl` |
| `--slot-hold-ms <n>` | `180000` | How long a dropped player keeps the seat |
| `--room-hold-ms <n>` | `600000` | How long a room survives without its host |
| `--idle-timeout-ms <n>` | `15000` | Close connections silent for this long (`bye` IDLE_TIMEOUT) |
| `--protocol-dir <path>` | `<repo>/protocol` | Where the contract lives (also `MISSIONFORGE_PROTOCOL_DIR`) |

`--simulate-players` and `--simulate-interval-ms` still work as aliases of `--bots` and
`--bot-interval-ms`.

Once it accepts connections the server prints `LISTENING <port>` on stdout; tests read that line
to learn the port. `GET /health` returns `{"ok":true,"rooms":<count>}`.

Bots are players without a socket (always `connected: true`) called Nova, Orion, Vega, Lyra,
Altair, Juno, Kepler, Halley, Ceres and Rigel, with avatars `{suitId: suit_orange…, patchId:
patch_comet…}`. Each join broadcasts `room.state` and `roles.state`, exactly like a phone join.

## What is implemented

Everything a lobby needs, following `protocol/messages.md`:

- **Connection:** `hello` / `hello.ok` (HOST and PHONE limits), `clock.ping` / `clock.pong`,
  `error`, `bye` (close code = `bye.closeCode`), hello timeout (5 s), join timeout (30 s), idle
  timeout.
- **Common validation** (§12.1) in order: frame size, envelope (`envelope.schema.json`), `seq`
  strictly increasing per connection, `hello` first and once, known type, allowed sender
  (FORBIDDEN / NOT_IN_ROOM / ALREADY_IN_ROOM), payload schema with unknown fields ignored
  (BAD_PAYLOAD + `field`), PAUSED for pause-blocked types.
- **Rooms:** `room.create` / `room.created` + snapshot (`settings.state`, `room.state`,
  `roles.state`, `game.paused` if paused, sticky host messages for phones, `snapshot.end`),
  `room.join` / `room.joined` (nickname normalisation, NICK_TAKEN with suggestion, lowest free
  slot, pending spectators for LATE_JOIN / ROOM_FULL), `room.resume` / `room.resumed` (REPLACED,
  TOKEN_INVALID, FORBIDDEN on token kind), `room.leave`, `room.kick`, `room.close`,
  `room.promoted` at a new mission, slot hold and room hold timers.
- **Settings:** `settings.set` / `settings.state`, SETTING_LOCKED outside LOBBY.
- **Roles:** group table by player count, `roles.pick`, `roles.vote`, `roles.lock`, `roles.set`,
  `roles.rotate`, auto-lock when leaving LOBBY, rebalancing on leave and late arrival.
- **Phase:** `phase.set` transition graph and field combinations (INVALID_TRANSITION), new-mission
  reset when `missionSeq` increases.
- **Pause:** `game.pause` / `game.resume`, host disconnect pause with `roomExpiresAtMs`, frozen
  slot-hold countdowns.
- **Relays:** every `host → server → client` type is validated and forwarded by
  `MESSAGE_META.to` (sticky ones are replayed in snapshots); every `client → server → host` type
  arrives at the host inside `relay`.

Not simulated: votes, polls, abilities and the outcome log (`snapshot.end.lastOutcomeSeq` is
always 0). Those messages are validated and then ignored (logged once on stderr).

## Files

| File | Purpose |
|---|---|
| `server.mjs` | CLI, HTTP listener, wiring |
| `lib/contract.mjs` | Loads `protocol/` (schemas, `MESSAGE_META`) and validates payloads |
| `lib/validation.mjs` | Common validation of every received frame (§12.1) |
| `lib/rooms.mjs` | Room hub: sessions, rooms, handlers, timers, bots |
| `lib/roles.mjs` | Role groups, lobby assignment and rebalancing (§5) |
| `lib/rules.mjs` | Pure rules: phase field combinations, nicknames, routing, payloads |
| `lib/protocol.mjs` | Constants the stub's own logic needs (codes, defaults, tables) |
| `lib/websocket.mjs` | WebSocket handshake, frame parser/encoder, connection |
| `smoke.mjs` | End-to-end self-test; validates every frame both ways against `protocol/schema` |

The Unity EditMode test `StubServerIntegrationTests` starts this server with `--port 0` and runs
the real C# client against it (set `MISSIONFORGE_STUB_SERVER` to the `server.mjs` path to
override discovery).
