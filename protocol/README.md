# MissionForge protocol

The contract between the Unity host, the Node room server and the phone web client.

| File | What it is | Who reads it |
|---|---|---|
| [`messages.md`](messages.md) | **Source of truth.** Every message: direction, sender, payload fields, units, server validation, the design rule it implements; plus the room, role, vote, poll, flight and minigame rules, limits, error codes and the list of decisions. | everyone |
| [`schema/<type>.schema.json`](schema/) | One JSON Schema (draft 2020-12) per message payload, plus `envelope.schema.json`. Self-contained (`$defs` inside each file), closed (`additionalProperties: false`), with examples. | server (validate incoming `d`), tests of all three parties, C# mirror in `core/Runtime/Protocol/` |
| [`ts/messages.ts`](ts/messages.ts) | TypeScript types: `Envelope`, every payload, the discriminated union `Message`, string-literal enums with their value arrays, `MESSAGE_META` (who sends, where it is delivered, sticky / droppable / pause-blocked / outcome flags). No runtime dependencies. | server and phone client (import directly) |
| [`check.mjs`](check.mjs) | Consistency check, Node 20+, no dependencies. | CI and anyone changing the protocol |

## How each party uses it

- **Room server (`server/`)** imports `ts/messages.ts`. For every incoming frame it runs the common checks of
  `messages.md` §12.1, validates `d` against `schema/<t>.schema.json` (ignoring unknown fields), then applies
  the per-message "Server validation" rules. `MESSAGE_META[t].from` is the allow-list of senders and
  `MESSAGE_META[t].to` is the routing table. The server implements vote resolution (§7.6), role rules (§5),
  timers (§7.2), the snapshot (§4.5) and the limits (§11) exactly as written.
- **Phone client (`client/`)** imports `ts/messages.ts`, sends only the types whose "Sent by" lists player or
  spectator, and renders from the broadcasts. It never recomputes simulation numbers.
- **Unity host (`unity/`, `core/`)** mirrors the payloads in C# under `core/Runtime/Protocol/` from the
  schemas (field names and enum values are identical). It sends the `host → server` and relayed
  `host → server → client` types and receives the `server → host` types, including player input wrapped in
  `relay`.

Wire format: one JSON text frame per message, `{"t": "<type>", "seq": <int>, "d": {...}}`.

## Versioning

- `hello.protocolVersion` is an integer; this is version **1** (`PROTOCOL_VERSION` in `ts/messages.ts`).
  Server and client must match exactly; otherwise the server answers `error` VERSION_MISMATCH and closes.
- **Additive changes keep the version:** a new message type, a new optional field, a new enum value.
  This works because receivers ignore unknown fields and (host and phones) unknown message types.
- **Anything else increases the version:** removing or renaming a type or field, changing a type, unit or
  meaning, making an optional field required, changing a rule in `messages.md`.
- Change `messages.md`, the schema and the TypeScript file in the same pull request as the code that needs
  the change, and run the check.

## Check

```
node protocol/check.mjs
npx -y -p typescript@5 tsc --noEmit --strict protocol/ts/messages.ts
```

`check.mjs` validates every schema's examples against its own schema (and confirms that mutated examples
are rejected), and checks that `messages.md`, `schema/` and `ts/messages.ts` list the same message types,
the same top-level fields with the same required flags, the same shared types and the same enum values.

## Sequence diagrams

### Join and reconnect

```mermaid
sequenceDiagram
    autonumber
    participant H as Host (Unity)
    participant S as Room server
    participant P as Phone (player)

    H->>S: hello {protocolVersion: 1, client: HOST}
    S-->>H: hello.ok
    H->>S: room.create
    S-->>H: room.created {room, hostToken, joinUrl, spectateUrl}
    S-->>H: settings.state, room.state, roles.state, snapshot.end
    Note over H: shows room code and QR (joinUrl)

    P->>S: hello {protocolVersion: 1, client: PHONE}
    S-->>P: hello.ok
    P->>S: clock.ping ×3
    S-->>P: clock.pong ×3
    P->>S: room.join {room, as: PLAYER, nickname, avatar}
    S-->>P: room.joined {id: p3, slot, token}
    S-->>P: settings.state, room.state, roles.state, phase.set, snapshot.end
    S-->>H: room.state (new player)

    Note over P: connection drops (phone sleeps)
    S-->>H: room.state (p3 connected: false, slotExpiresAtMs = now + 3 min)
    Note over S: slot, roles and veto token held for 3 min, p3 abstains meanwhile

    P->>S: hello
    S-->>P: hello.ok
    P->>S: room.resume {room, token}
    S-->>P: room.resumed {kind: PLAYER, id: p3}
    S-->>P: snapshot: settings.state, room.state, roles.state, phase.set, build.state, …
    S-->>P: active round: vote.opened, vote.tags, vote.stage, vote.tally, vote.ack (SNAPSHOT)
    S-->>P: snapshot.end
    S-->>H: room.state (p3 connected: true)

    Note over P,S: if the 3 minutes had passed: error TOKEN_INVALID, then room.join again (as a pending spectator once Build has started)
```

### One part vote round with a veto and a tie

Five players, options A, B, C. p1 holds FLIGHT and does not vote, so tie-breaker 1 does not apply and the
tie goes to the trivia sudden-death.

```mermaid
sequenceDiagram
    autonumber
    participant H as Host (Unity)
    participant S as Room server
    participant B as p2 (BOOSTER)
    participant P as p3, p4, p5

    H->>S: vote.open {roundId, kind: PART, options A B C + deltas, ownerRoles: [BOOSTER], trivia, coinSeed}
    S-->>H: vote.opened {voters: p1..p5, plan}
    S-->>B: vote.opened
    S-->>P: vote.opened
    S-->>P: vote.stage REVEAL (3 s)
    H->>S: vote.insight {role: BOOSTER, lines}
    S-->>B: vote.insight
    S-->>P: vote.stage INSPECT (20 s)
    B->>S: vote.tag {optionId: A, tag: RECOMMENDED}
    S-->>P: vote.tags
    P->>S: ping.send {pingId: TOO_EXPENSIVE, optionId: C} (p4)
    S-->>H: ping.event
    P->>S: vote.veto {optionId: C} (p3)
    S-->>H: vote.vetoed {optionId: C, playerId: p3}
    S-->>P: vote.vetoed, room.state (p3 vetoAvailable: false)
    S-->>P: vote.stage VOTE (20 s, candidateIds: [A, B])
    B->>S: vote.cast {optionId: A}
    S-->>B: vote.ack {optionId: A, reason: CAST}
    P->>S: vote.cast {optionId: B} (p3)
    P->>S: vote.cast {optionId: A} (p4)
    P->>S: vote.cast {optionId: A} (p5)
    P->>S: vote.cast {optionId: B} (p4 changes vote)
    S-->>H: vote.tally (at most every 200 ms, leadingOptionId for the ghost preview)
    S-->>P: vote.tally
    Note over S: timer ends. A = 2 (p2, p5), B = 2 (p3, p4), p1 abstained. Tie, FLIGHT has no ballot
    S-->>P: vote.stage TIEBREAK_TRIVIA (10 s) + vote.trivia.open {question, tiedOptionIds: [A, B]}
    P->>S: vote.trivia.answer {choiceIndex: 0} (p5, wrong)
    P->>S: vote.trivia.answer {choiceIndex: 1} (p4, first correct)
    S-->>H: vote.trivia.result {winnerId: p4, outcomeSeq}
    S-->>P: vote.trivia.result
    S-->>P: vote.stage TIEBREAK_PICK (5 s, pickerId: p4)
    P->>S: vote.trivia.pick {optionId: B} (p4)
    S-->>H: vote.result {winnerId: B, method: TRIVIA, tiedOptionIds: [A, B], outcomeSeq}
    S-->>P: vote.result + vote.stage RESULT (3 s)
    H->>S: vote.commit {winnerId: B, deltas, codexIds}
    S-->>P: vote.commit
    H->>S: build.state, kp.awarded
    S-->>P: build.state, kp.awarded
    S-->>H: vote.stage CLOSED
    S-->>P: vote.stage CLOSED
```

If nobody had answered the trivia correctly, the server would have skipped TIEBREAK_PICK and sent
`vote.result` with `method: COIN_FLIP` (tied options in display order, index `coinSeed mod 2`).

### A minigame round

```mermaid
sequenceDiagram
    autonumber
    participant H as Host (Unity)
    participant S as Room server
    participant P as Phones (players)

    Note over H: enters bullet-time (×0.1)
    H->>S: mg.start {runId, minigameId: MG-08, seed, startAtMs = now + 3 s, durationMs: 20000, params}
    S-->>P: mg.start
    P->>S: mg.ready {runId}
    S-->>H: relay {from: p1, t: mg.ready, d}
    Note over P: instruction + demo until startAtMs, then play locally from seed and params
    P->>S: mg.progress {p: 0.45} (optional, ≤ 2 Hz)
    S-->>H: relay {from: p1, t: mg.progress, d}
    H->>S: mg.state {progress} (≤ 10 Hz)
    S-->>P: mg.state
    P->>S: mg.result {success, perfect, score, elapsedMs, finishedAtMs, mode}
    S-->>H: relay {from: p1, t: mg.result, d}
    Note over H: closes at startAtMs + durationMs + 2 s, or when every active player has reported
    Note over H: f = succeeded / active → tier → boosts, Team Sync, points
    H->>S: mg.summary {fraction, tier: GOLD, boosts, syncDelta: 25, points: 200, factId}
    S-->>P: mg.summary
    H->>S: haptic.cue {cue: TIER_GOLD}
    S-->>P: haptic.cue
    H->>S: boost.state, sync.meter
    S-->>P: boost.state, sync.meter
    Note over H: leaves bullet-time
```

### Host disconnect and resume

```mermaid
sequenceDiagram
    autonumber
    participant H as Host (Unity)
    participant S as Room server
    participant P as Phones

    Note over H: browser refresh / network drop during a vote
    Note over S: pauses at once, freezes vote timer and slot-hold countdowns, keeps room state for 10 min
    S-->>P: game.paused {reason: HOST_DISCONNECTED, roomExpiresAtMs = now + 10 min}
    S-->>P: room.state {hostConnected: false, paused: true}
    P->>S: vote.cast
    S-->>P: error PAUSED
    P->>S: ping.send (still allowed)

    H->>S: hello {client: HOST}
    S-->>H: hello.ok
    H->>S: room.resume {room, token: hostToken, lastOutcomeSeq: 9}
    S-->>H: room.resumed {kind: HOST, paused: true}
    S-->>H: settings.state, room.state, roles.state, game.paused
    S-->>H: active round: vote.opened, vote.vetoed…, vote.tags, vote.stage, vote.tally
    S-->>H: missed outcomes with outcomeSeq > 9 (vote.result, ability.used, …)
    S-->>H: snapshot.end {lastOutcomeSeq}
    S-->>P: room.state {hostConnected: true, paused: true}
    Note over H: restores simulation from its own save + replayed outcomes, re-sends its sticky state
    H->>S: phase.set, build.state, …
    S-->>P: phase.set, build.state, …
    H->>S: game.resume
    S-->>H: game.resumed {pausedForMs}
    S-->>P: game.resumed {pausedForMs}
    Note over P,S: every outstanding deadline moves later by pausedForMs, the vote continues

    Note over S: if the host does not return within 10 min: bye ROOM_EXPIRED to everyone, room destroyed
```
