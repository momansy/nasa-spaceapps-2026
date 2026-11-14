# MissionForge stub room server

A small in-memory WebSocket room server for developing and testing the Unity host screen
(`Assets/MissionForge/Net`). It is a **provisional stand-in** until the real `server/` and the
formal `protocol/messages.md` land; when they do, this folder can be deleted.

- Zero npm dependencies: the RFC 6455 handshake and framing are implemented on `node:http` and
  `node:crypto` (`lib/websocket.mjs`).
- Requires Node.js 22 or newer (the smoke test uses the built-in `WebSocket` client).
- Development only: no TLS, no authentication, no persistence, and it listens on all network
  interfaces by default so phones on the same Wi-Fi can reach it. Do not expose it to the internet.

The folder name ends in `~`, so Unity ignores it (no import, no `.meta` files).

## Run

```sh
node server.mjs                       # ws://localhost:8787
node server.mjs --port 0              # pick a free port
node server.mjs --simulate-players 6  # fake players join every new room (lobby demo)
node smoke.mjs                        # self-test; prints PASS/FAIL lines, exit code 1 on failure
```

| Option | Default | Meaning |
|---|---|---|
| `--port <n>` | `8787` | TCP port; `0` picks a free one |
| `--host <addr>` | all interfaces | Bind address (use `127.0.0.1` to stay local) |
| `--simulate-players <n>` | `0` | Fake players that join each new room one by one |
| `--simulate-interval-ms <n>` | `1500` | Delay between simulated joins |
| `--simulate-roles <n>` | `4` | How many of the simulated players get a role (the rest stay unassigned) |

Once it accepts connections the server prints `LISTENING <port>` on stdout; tests read that line
to learn the port. `GET /health` returns `{"ok":true,"rooms":<count>}`.

Simulated players are called Nova, Orion, Vega, Lyra, Altair, Juno, Kepler, Halley, Ceres and
Rigel, with avatars `astro_01` to `astro_10`.

## Protocol (provisional)

JSON text frames with the envelope `{"t":"<type>","seq":<int>,"d":{...}}`. `seq` is a per-sender
counter; the server does not check it. Every name below lives in **one place per side**:

- C#: `Assets/MissionForge/Net/ProtocolNames.cs` (source of truth)
- stub: `lib/protocol.mjs` (keep in sync by hand)

| Direction | Type | Payload `d` | Server reaction |
|---|---|---|---|
| host → server | `room.create` | `{ "client":"host", "version":1 }` | `room.created`, then `room.state` |
| server → host | `room.created` | `{ "code":"ABCD", "hostToken":"<opaque>" }` (`joinUrl` is optional and not sent by the stub) | |
| host → server | `room.resume` | `{ "code", "hostToken" }` | `room.state`, or `error` `room_not_found` / `invalid_token` |
| player → server | `room.join` | `{ "code", "nickname", "avatar" }` | `room.joined`, then `room.state` to everyone |
| server → player | `room.joined` | `{ "playerId", "token" }` | |
| host → server | `room.settings` | partial settings object | `room.state` to everyone |
| host → server | `phase.set` | `{ "phase":"BRIEFING" }` | `room.state` to everyone |
| server → all | `room.state` | `{ "code", "phase", "players":[...], "settings":{...} }` | sent on every change |
| either → server | `ping` | `{ "t": <client ms> }` | `pong` with the same `t` |
| server → client | `error` | `{ "code", "message" }` | |

Player entry: `{ "id":"p1", "nickname":"Nova", "avatar":"astro_03", "role":"FLIGHT"|null, "connected":true, "spectator":false }`.

Settings: `{ "roleMode":"random"|"pick"|"vote", "assist":"cadet"|"engineer"|"flight_director", "voteTimerS":30, "hiddenTallies":false }`.

Error codes: `bad_envelope`, `unknown_type`, `room_not_found`, `invalid_token`, `invalid_nickname`,
`invalid_settings`, `invalid_phase`, `not_host`, `server_full`.

### Stub behaviour worth knowing

- Room codes are 4 letters from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I, O or L). Codes in `room.join`
  and `room.resume` are case-insensitive.
- Roles are handed out in the design document's order (FLIGHT, BOOSTER, STRUCT, GUIDO, FIDO,
  EECOM, INCO, PAYLOAD, RETRO, PM): each joining player gets the first role nobody holds. The
  `roleMode` setting is stored and broadcast but does not change this.
- At most 10 players; later joiners are added with `"spectator":true` and no role.
- When a player's socket drops, the player stays in the list with `"connected":false`. There is
  no player rejoin yet: joining again creates a new player.
- When the host's socket drops, the room is kept so `room.resume` works. A resume from a new
  connection closes the previous host connection with close code 4000.
- Nicknames are trimmed and must be 1–16 characters; an unusable avatar id becomes `astro_01`.
- `voteTimerS` must be an integer from 5 to 300; unknown settings keys are rejected.
- `phase.set` accepts any `UPPER_SNAKE_CASE` name; the stub does not know the real phase list.
- Rooms live until the process exits (at most 200).

## Files

| File | Purpose |
|---|---|
| `server.mjs` | CLI, HTTP listener, wiring |
| `lib/websocket.mjs` | WebSocket handshake, frame parser/encoder, connection |
| `lib/rooms.mjs` | Rooms, players, message handlers, player simulation |
| `lib/protocol.mjs` | Message names, error codes, roles, limits |
| `smoke.mjs` | End-to-end self-test of all of the above |

The Unity EditMode test `StubServerIntegrationTests` starts this server with `--port 0` and runs
the real C# client against it.
