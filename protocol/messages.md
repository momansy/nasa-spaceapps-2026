# MissionForge network protocol — messages

**Protocol version: 1.** This file is the source of truth for every message exchanged between the Unity
host, the Node room server and the phone web clients. `protocol/schema/` and `protocol/ts/messages.ts`
mirror it and `node protocol/check.mjs` fails if they drift. Section numbers such as §4.2 refer to
`GAME_DESIGN.md`.

Contents: [1 Authority](#1-authority) · [2 Transport and conventions](#2-transport-and-conventions) ·
[3 Connection lifecycle](#3-connection-lifecycle) · [4 Rooms, joining and reconnecting](#4-rooms-joining-and-reconnecting) ·
[5 Roles and abilities](#5-roles-and-abilities) · [6 Phase state machine](#6-phase-state-machine) ·
[7 Votes](#7-votes) · [8 GO/NO-GO poll](#8-gono-go-poll) · [9 Flight](#9-flight) · [10 Minigames](#10-minigames) ·
[11 Limits](#11-limits) · [12 Errors and message index](#12-errors-and-message-index) ·
[13 Message reference](#13-message-reference) · [14 Shared types](#14-shared-types) ·
[15 Enumerations](#15-enumerations) · [16 Decisions](#16-decisions) · [17 Design conflicts](#17-design-conflicts)

## 1. Authority

| Party | Connection kind | Count per room | Owns |
|---|---|---|---|
| Unity host | `host` | exactly 1 | Simulation, build state, dashboard numbers, every "if chosen" preview number, physics, failure rolls, boosts, tiers, score, phase state machine, minigame timing |
| Room server | — | 1 | Membership, role assignment and merging, vote collection and vote resolution, vote and poll timers, veto tokens, ability-spent flags, reconnect tokens, pause state, routing, rate limits |
| Phone | `player` | 1–10 | Input; runs minigames locally and reports compact results |
| Phone | `spectator` | unlimited | Advisory audience votes, reactions |

Phones never recompute simulation numbers. The server never interprets game data: it only uses the flags
and numbers the host puts in `vote.open`.

## 2. Transport and conventions

- **Transport.** One WebSocket per device to `wss://<server>/ws`. Every message is one **text** frame
  holding one JSON object. Binary frames are a protocol violation.
- **Envelope.** `{"t": "<type>", "seq": <int>, "d": {...}}` and nothing else (`schema/envelope.schema.json`).
  `d` is always an object; messages without fields send `{}`.
- **`seq`.** Assigned by the sender, per connection and per direction: the first message is 1 and each
  following message adds 1. A new connection starts again at 1. The server rejects a client `seq` that is
  not greater than the previous one (BAD_ENVELOPE). `error.re` quotes the `seq` of the rejected message.
  When the server relays a message it stamps its own `seq` for the receiving connection.
- **One type, one shape, one sender class.** Each message type has exactly one payload schema. A type is
  sent either by clients, or by the host, or by the server, never by two of them (the three handshake
  types `hello`, `clock.ping`, `room.resume` are sent by host and phones alike, with the same shape).
- **Relay, host → clients.** Types marked *relayed unchanged* are validated by the server and forwarded
  with the same `t` and `d`. The host never receives its own relayed messages back.
- **Relay, client → host.** Types marked *relayed inside `relay`* are validated by the server and
  delivered to the host as `{"t":"relay","seq":n,"d":{"from":"<PlayerId>","t":"<type>","d":{...}}}`.
- **Identifiers.** All identifiers are ASCII strings with the patterns in [Shared types](#14-shared-types).
  Enumerated values are upper-case tokens, except telemetry channel ids (lower snake case with unit suffix).
- **No free text.** The only user-typed string in the protocol is the nickname, filtered by the server
  (§17.9). Everything players see is referenced by id: a `TextRef` (string-table key plus arguments), a
  data id, or an enumerated value. There is no chat message.
- **No personal data.** No accounts, emails, real names, device ids or location. Tokens are random and
  live only in the room.
- **Units.** Every numeric field name carries its unit: `…Ms` milliseconds (durations), `…AtMs` absolute
  server-clock milliseconds since the Unix epoch, `…S` seconds, `…M` $M (game value), `…Days`, `…Km`,
  `…Kpa`, `…Pct` percent 0–100, `…T` tonnes; `dv…Ms` and `velocityMs`/`…SpeedMs` are metres per second
  as stated in each field description. Fractions named `fraction`, `score`, `p`, `throttle` are 0–1.
- **Clock.** Every absolute time uses the **server clock**. Each client (host included) estimates the
  offset with `clock.ping` / `clock.pong` and converts to local time for countdowns. The host stamps the
  absolute times it issues (`mg.start.startAtMs`, `console.alert.endsAtMs`, `blackout.set.expectedEndAtMs`)
  in server-clock time.
- **Unknown data.** Receivers MUST ignore unknown fields in `d` and, on the client and host side, unknown
  message types. The server answers an unknown type from a client with `error` UNKNOWN_TYPE (non-fatal).
  The schemas say `additionalProperties: false` to check what a **sender** of this version may emit; a
  receiver must not reject a message because of an extra field.

## 3. Connection lifecycle

1. The client opens the WebSocket and sends `hello` within 5 s. The server answers `hello.ok`, or
   `error` VERSION_MISMATCH + `bye` + close 4001.
2. Within 30 s the client sends `room.create` (host), `room.join` (phone) or `room.resume` (either).
   Meanwhile only `clock.ping` is accepted; anything else gets NOT_IN_ROOM.
3. The server answers `room.created` / `room.joined` / `room.resumed`, then the **snapshot**
   (section 4.5), then `snapshot.end`.
4. **Heartbeat.** Every client sends `clock.ping` every 5 s (`hello.ok.heartbeatMs`). The server closes
   a connection that sent no frame for 15 s (`bye` IDLE_TIMEOUT, close 4010). A client that receives no
   `clock.pong` for 10 s closes the socket and reconnects.
5. **Reconnect.** After any unexpected close the client reconnects with backoff 0.5 s, 1 s, 2 s, 4 s, then
   every 5 s, sending `hello` then `room.resume`. It stops on TOKEN_INVALID or ROOM_NOT_FOUND and after
   `bye` with `canResume = false`.
6. **Close.** Before closing, the server sends `bye`; the WebSocket close code equals `bye.closeCode`
   (4000–4010, see `ByeReason`).

## 4. Rooms, joining and reconnecting

### 4.1 Room code and URLs (§3.1)

- Room code: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, no O), unique among live rooms.
- Player join URL and QR content: `<clientBaseUrl>?room=<CODE>`, e.g. `https://play.example.org/?room=KQXM`.
- Audience URL and QR content: `<clientBaseUrl>?room=<CODE>&watch=1`.
- `clientBaseUrl` is server configuration; the host shows the URLs it receives in `room.created`. The
  URLs carry only the room code, never a nickname or token. The phone client reads `room`, shows the
  nickname and avatar form (players) or joins at once (`watch=1`), and knows its room-server URL from its
  build configuration.

### 4.2 Players and spectators (§3.1, §3.2, §13.7)

- At most 10 players. A player gets the lowest free seat (`slot` 1–10) and a new `PlayerId`.
- `room.join` with `as = PLAYER` makes a **player** while the phase is LOBBY, BRIEFING or CONTRACT_VOTE and
  a seat is free. Otherwise the joiner becomes a **spectator with `pendingPlayer = true`**
  (`spectatorReason` LATE_JOIN or ROOM_FULL).
- **Promotion.** When the host opens a vote round of any kind (`vote.open`), before the electorate is
  fixed, and when a new mission starts (`missionSeq` increases), the server promotes pending players in
  join order while seats are free: `room.promoted` to each, then `room.state` and `roles.state` to all.
- Spectators are anonymous and are never listed, only counted. They receive every message delivered to
  "all players and spectators". They may send `vote.cast` and `vote.predict` (audience tallies),
  `react.send`, `player.prefs`, `clock.ping`, `room.leave`; everything else is FORBIDDEN.

### 4.3 Disconnects and slot hold (§3.1 step 5, §17.7)

- When a player's connection drops, the slot, roles, veto token and nickname are **held for 3 minutes**
  (`slotHoldMs` = 180000). `room.state` shows `connected = false` and `slotExpiresAtMs`.
- While away the player abstains: ballots already cast are ignored at close, GO/NO-GO calls are skipped
  (NO_ANSWER), the player is not active in minigames.
- The hold countdown runs only while the game is not paused (a phone that sleeps during a pause keeps its
  seat). When the hold ends the token is revoked, the seat is freed and the roles are redistributed
  (section 5.3). Returning later means a new `room.join`.
- Spectator connections that drop are forgotten after the same 3 minutes.
- A second connection that resumes a token replaces the first, which gets `bye` REPLACED (close 4003).

### 4.4 Host disconnect and pause (§17.7, §9.2)

- When the host connection drops, the server pauses the game at once and broadcasts `game.paused` with
  reason HOST_DISCONNECTED and `roomExpiresAtMs` = now + 10 min (`roomHoldMs` = 600000). It keeps all room
  state: membership, settings, roles, veto and ability flags, the active vote or poll with its ballots and
  remaining stage time, the sticky host messages and the outcome log.
- The host reconnects with `hello` + `room.resume` (host token, `lastOutcomeSeq`). The room **stays
  paused** until the host sends `game.resume`.
- If the host does not return within 10 minutes the server sends `bye` ROOM_EXPIRED to everyone and
  destroys the room.
- While paused (either reason) every server timer and slot-hold countdown is frozen, messages flagged
  *rejected with PAUSED* are refused, and relays to an absent host are refused with PAUSED. On
  `game.resumed` every outstanding deadline moves later by `pausedForMs`.
- Pings, reactions, preferences, `clock.ping`, `room.leave` and `mg.result` are accepted while paused.

### 4.5 Snapshot (join, resume)

After `room.created`, `room.joined` or `room.resumed` the server sends, in this order, the messages that
exist, then `snapshot.end`:

1. `settings.state`
2. `room.state`
3. `roles.state`
4. `game.paused` (only if paused)
5. Sticky host messages, latest of each, phones only: `phase.set`, `build.state`, `boost.state`,
   `sync.meter`, `pilot.assign`, `blackout.set`, `console.config` (one per role the player holds),
   `debrief.score`, `debrief.awards`, `debrief.facts`
6. Active vote round: `vote.opened`, `vote.insight` (phones, one per owner role the player holds), each `vote.vetoed` so far, `vote.tags`, `vote.trivia.open` (if in a
   tie-break), `vote.stage` (current stage with its current `endsAtMs`), `vote.tally`, and to phones
   `vote.ack` with reason SNAPSHOT
7. Active poll: the current `poll.call`
8. Active minigame, players only (and spectators if `audience`): `mg.start`
9. Host only: every outcome-log message with `outcomeSeq` greater than `room.resume.lastOutcomeSeq`, in
   order (`vote.predict.result`, `vote.trivia.result`, `vote.result`, `poll.result`, `ability.used`)
10. `snapshot.end`

**Sticky messages.** The server keeps the latest message of each sticky type (`console.config` and
`vote.insight`: latest per role; `vote.insight` is dropped when its round closes). `mg.start` is dropped from the cache by `mg.summary` or `mg.cancel`; the three `debrief.*`
messages when the phase leaves DEBRIEF; everything except `phase.set` at a new-mission reset.

**Outcome log.** Every message with an `outcomeSeq` is appended to a per-room log kept for the life of the
room. It is how the host recovers results it missed during a refresh (§17.1: "resolves votes so a host
refresh can't lose them") and it is the vote-result part of the replay log (§17.6). The host stores the
last `outcomeSeq` it has applied.

## 5. Roles and abilities

### 5.1 Role groups by player count (§3.2, §3.3)

All ten roles are always staffed. For *n* players the server uses exactly these groups, in this order:

| Players | Groups |
|---|---|
| 10 | FLIGHT · BOOSTER · STRUCT · GUIDO · FIDO · EECOM · INCO · PAYLOAD · RETRO · PM |
| 9 | FLIGHT+PM · BOOSTER · STRUCT · GUIDO · FIDO · EECOM · INCO · PAYLOAD · RETRO |
| 8 | FLIGHT+PM · BOOSTER+STRUCT · GUIDO · FIDO · EECOM · INCO · PAYLOAD · RETRO |
| 7 | FLIGHT+PM · BOOSTER+STRUCT · GUIDO+FIDO · EECOM · INCO · PAYLOAD · RETRO |
| 6 | FLIGHT+PM · BOOSTER+STRUCT · GUIDO+FIDO · EECOM+INCO · PAYLOAD · RETRO |
| 5 | FLIGHT+PM · BOOSTER+STRUCT · GUIDO+FIDO · EECOM+INCO · PAYLOAD+RETRO |
| 4 | FLIGHT+PM · BOOSTER+STRUCT · GUIDO+FIDO · EECOM+INCO+PAYLOAD+RETRO |
| 3 | FLIGHT+PM · BOOSTER+STRUCT+GUIDO+FIDO · EECOM+INCO+PAYLOAD+RETRO |
| 2 | FLIGHT+PM+BOOSTER+STRUCT+GUIDO · FIDO+EECOM+INCO+PAYLOAD+RETRO |
| 1 | all ten roles |

Inside a group, roles are listed in canonical order (`RoleId` order); the group's **lead** is its first
role in that order (so FLIGHT+PM has lead FLIGHT).

### 5.2 Assignment in the lobby (§3.3)

While `locked` is false the server recomputes the groups whenever the player count changes; this clears
all picks (PICK) and keeps FLIGHT votes for players still present (VOTE). Roles lock on `roles.lock`, on
`roles.set`, on `roles.rotate`, or automatically when the phase leaves LOBBY. At lock:

- **RANDOM:** groups are dealt to players by a uniform random permutation.
- **PICK:** claimed groups stay with their claimers; the remaining groups are dealt at random to the
  players without a group.
- **VOTE:** the player with the most FLIGHT votes gets the group containing FLIGHT (ties: lowest `slot`;
  no votes: random); the other groups are dealt at random.

Entering LOBBY again sets `locked = false` and keeps the current assignment until it is changed.
The server's random choices here need not be seeded; they are recorded by `roles.state`.

### 5.3 Rebalancing after lock

- **A player leaves** (`room.leave`, kick, slot hold elapsed): all their roles go, as one block, to the
  connected player with the fewest roles (ties: lowest `slot`; if nobody is connected, the player with
  the fewest roles).
- **A player arrives** (join during BRIEFING or CONTRACT_VOTE, or promotion): the player holding the most
  roles (ties: highest `slot`) hands over the last ⌊k/2⌋ of their *k* roles in canonical order. With 9 or
  fewer players before the arrival somebody always holds at least two roles.
- Each change is announced by `roles.state`. Spent abilities are tracked per role and stay spent.
- The host can replace the whole assignment at any time with `roles.set`.

### 5.4 Abilities (§3.3, once per mission)

The server keeps the spent flag per role (`roles.state.abilitiesUsed`) and clears all of them at a
new-mission reset.

| Role | Ability | Who applies the effect | Extra field in `ability.use` |
|---|---|---|---|
| FLIGHT | Decision Time: ends a stalled vote; breaks ties | server (section 7.6) | `roundId` (required), `optionId` |
| BOOSTER | Hot-Fire Discount: next engine test costs 50 % less | host | — |
| STRUCT | Reinforce: +10 % load margin on one stage | host | `stageIndex` (required) |
| GUIDO | Course Correct: halves insertion error once | host | — |
| FIDO | Window Extension: +5 min launch window once | host | — |
| EECOM | Load Shed: prevents one brownout | host | — |
| INCO | Priority Pass: doubles data from one ground pass | host | — |
| PAYLOAD | Golden Hour: one science capture counts ×2 | host | — |
| RETRO | Recovery Fleet: shrinks landing ellipse; guaranteed recovery | host | — |
| PM | Emergency Funding: +10 % budget once | host | — |

Flow for host-applied abilities: `ability.use` → `ability.requested` → `ability.resolve` →
`ability.used` to everyone (or `error` ABILITY_REJECTED to the player). PM's ability is also spent by the
server when an option with `afford = EMERGENCY_FUNDING` wins a vote (trigger OVER_BUDGET_WIN), and any
ability can be spent by the host with `ability.consume`.

## 6. Phase state machine

The host owns the state machine (§17.3) and announces every change with `phase.set`. The server checks
the top-level transition and stores the latest message.

```
LOBBY → BRIEFING → CONTRACT_VOTE → BUILD{ VOTE_ROUND* | TEST | ANOMALY | REVIEW(PDR,CDR) }
      → FRR → COUNTDOWN → FLIGHT{ F2..F13 with minigame overlays, ABORT branches }
      → DEBRIEF{ INVESTIGATION? } → (CAMPAIGN_HUB | LOBBY)
```

| From | Allowed next `phase` |
|---|---|
| LOBBY | BRIEFING |
| BRIEFING | CONTRACT_VOTE, BUILD (host locked the contract), LOBBY |
| CONTRACT_VOTE | BUILD, LOBBY |
| BUILD | FRR, LOBBY |
| FRR | COUNTDOWN, BUILD (rework), LOBBY |
| COUNTDOWN | FLIGHT, FRR (scrub), DEBRIEF (pad abort), LOBBY |
| FLIGHT | DEBRIEF, LOBBY |
| DEBRIEF | CAMPAIGN_HUB, LOBBY, BUILD (retry, §9.9) |
| CAMPAIGN_HUB | BRIEFING, LOBBY |

A `phase.set` that keeps `phase` and changes other fields is always allowed. Field combinations:

| `phase` | `sub` | `review` | `flightPhase` | `segment` |
|---|---|---|---|---|
| LOBBY, BRIEFING, CONTRACT_VOTE, CAMPAIGN_HUB | NONE | null | null | null |
| BUILD | NONE, VOTE_ROUND, TEST, ANOMALY, REVIEW | PDR or CDR iff `sub` = REVIEW, else null | null | null |
| FRR | NONE | FRR | null | null |
| COUNTDOWN | NONE | null | F0 or F1 | null |
| FLIGHT | FLYING, ABORT | null | F2–F13 | ASCENT (F2–F7), ORBIT (F8–F9), ENTRY (F10–F11), LANDING (F12–F13) |
| DEBRIEF | SUMMARY, INVESTIGATION | null | null | null |

Minigames are overlays, not phases: a run is active from `mg.start` to `mg.summary` or `mg.cancel` in any
phase except LOBBY.

**Server effects of the phase**

- Joining as a player is possible in LOBBY, BRIEFING, CONTRACT_VOTE; from BUILD on, joiners wait as
  pending spectators (§3.1 rule 4).
- Leaving LOBBY locks roles (section 5.2). `player.profile`, `roles.pick`, `roles.vote`, and the settings
  `roleAssignMode` and `assistLevel` are LOBBY-only.
- A change of `phase` cancels the active vote round (`vote.cancelled`, PHASE_CHANGE) and the active poll.
- **New-mission reset**, when `missionSeq` increases: every player's veto token is restored, all ability
  flags are cleared, pending players are promoted, the sticky cache is emptied except `phase.set`. The
  outcome log and its numbering continue.

## 7. Votes

Every group decision uses the same messages. The host opens a round with `vote.open`; the server runs
the stages, collects ballots and resolves the result alone.

### 7.1 Profiles by kind

| Profile | Kinds | Stages in order | Veto | Role tags | Runoff | Early close |
|---|---|---|---|---|---|---|
| FULL | PART | REVEAL → [PREDICT] → INSPECT → VOTE → [RUNOFF] → [TIEBREAK_TRIVIA → TIEBREAK_PICK] → RESULT → CLOSED | yes | yes | if `strictMajority` | no |
| CHOICE | CONTRACT, REWORK_CATEGORY, LIVERY, PATCH, PILOT | REVEAL → INSPECT (CONTRACT only) → VOTE → [RUNOFF] → [TIEBREAK_TRIVIA → TIEBREAK_PICK] → RESULT → CLOSED | no | no | if `strictMajority` | yes |
| QUICK | TEST, ANOMALY, REVIEW, ABORT, FLIGHT_DECISION, MCM | VOTE → [TIEBREAK_TRIVIA → TIEBREAK_PICK] → RESULT → CLOSED | no | no | never | yes |

Stages in brackets happen only when needed: PREDICT when `vote.open.predict` is set; RUNOFF per 7.5;
the two TIEBREAK stages when a tie reaches tie-breaker 2 and `vote.open.trivia` is set (the host sends
`trivia: null` for time-critical quick votes).

**PREDICT comes before INSPECT.** Phones show option names only during REVEAL and PREDICT; Part Cards
with stats appear at INSPECT (see Decisions).

**Early close.** In CHOICE and QUICK profiles the VOTE and RUNOFF stages end as soon as every *connected*
voter has a ballot and at least one ballot exists (`closedBy` = ALL_VOTED). PART rounds always run the full timer so votes can be changed
(§4.1), unless FLIGHT uses Decision Time or the host sends `vote.close`.

**Solo.** With exactly one player in the room (`vote.opened.solo`), INSPECT is skipped, VOTE has no timer
and the first ballot decides at once (`closedBy` = SOLO) (§4.2 Solo play). PREDICT still runs.

### 7.2 Stage durations (server timer defaults)

| Stage | FULL | CHOICE | QUICK | Override field |
|---|---|---|---|---|
| REVEAL | 3 s | 3 s | — | `revealMs` |
| PREDICT | 8 s | — | — | `predictMs` |
| INSPECT | `settings.inspectTimerS` (default 20 s) | CONTRACT: `settings.inspectTimerS`; others — | — | `inspectMs` |
| VOTE | `settings.voteTimerS` (default 20 s) | `settings.voteTimerS` | 10 s; ABORT and MCM 5 s | `voteMs` |
| RUNOFF | 10 s | 10 s | — | `runoffMs` |
| TIEBREAK_TRIVIA | 10 s | 10 s | 10 s | `triviaMs` |
| TIEBREAK_PICK | 5 s | 5 s | 5 s | `pickMs` |
| RESULT | 3 s | 3 s | 2 s | `resultMs` |

With `settings.a11y.slowTimers` every default above is multiplied by 1.5 and rounded up to a whole second.
Values given in `vote.open.timers` are used exactly. PREDICT ends early when every connected voter has
answered. Only one vote round or poll can be active in a room at a time; a round is active from
`vote.open` until `vote.stage` CLOSED or `vote.cancelled`.

### 7.3 Winnable options (§4.2 Affordability, Invalid combos, Veto)

An option is **winnable** when all of these hold:

1. it has not been vetoed;
2. not (`willNotFly` and not `fixExists`);
3. `afford` is OK, or `afford` is EMERGENCY_FUNDING and PM's ability is not spent.

Only winnable options can receive ballots (`vote.cast` errors: OPTION_VETOED, OPTION_NOT_WINNABLE,
OPTION_UNAFFORDABLE) and only they can win. Unwinnable options stay visible with their banners so players
learn why. If PM's ability becomes spent during a round, ballots on EMERGENCY_FUNDING options are cleared
(`vote.ack` OPTION_REMOVED) and `vote.stage` is re-sent with the new `candidateIds`.

### 7.4 Ballots, electorate, audience

- **Electorate** = `vote.opened.voters`: all players in the room when the round opened. Players who join
  later do not vote in this round.
- A ballot is the last accepted `vote.cast` of a voter in the current voting stage. **Abstain** = no
  ballot at close, or disconnected at close (§3.1 rule 5).
- **Audience.** Spectator ballots are tallied separately ("Audience says"). With
  `audienceVoteWeight = 1` the audience's favourite winnable option, if unique, adds **one** ballot to that
  option's count; with a tie among audience favourites, or no audience ballots, it adds nothing. The
  audience ballot never prevents the all-abstain rule: that rule looks at player ballots only.
- **Tallies.** OPEN: `vote.tally` carries counts. HIDDEN: counts are null until `vote.result`.

### 7.5 Vetoes and tags

- **Veto** (`vote.veto`, PART rounds, stages INSPECT and VOTE): one per player per mission; removes one
  option; an option can be vetoed once; at least two winnable options must remain. Ballots and tags on the
  option are cleared.
- **Tags** (`vote.tag`, PART rounds, stages PREDICT, INSPECT, VOTE): holders of `ownerRoles` only.
  One tag per holder and option; one RECOMMENDED per holder and round.

### 7.6 Resolution (§4.2)

When the VOTE stage closes the server computes, with *C* = winnable options in display order and
count(o) = player ballots for o (+1 for the audience ballot when it applies):

1. **All abstain** (no player ballot). The winner is the first that applies:
   a. for each role in `ownerRoles` order, the option its holder tagged RECOMMENDED, if winnable →
      `ABSTAIN_RECOMMENDED`;
   b. `defaultOptionId`, if set and winnable → `ABSTAIN_DEFAULT`;
   c. the winnable option with the lowest `costM`, first in display order among equals →
      `ABSTAIN_CHEAPEST`.
2. **Runoff** (only if `vote.opened.strictMajority`, first round only): if the highest count is not more
   than half of all counted ballots **and** at least three options received a ballot, the two options
   with the highest counts (equal counts: earlier in display order) go to a RUNOFF stage. All ballots,
   player and audience, are emptied (`vote.ack` RUNOFF_RESET) and only the two candidates can be voted
   for. When RUNOFF closes: if nobody voted, the candidate with the higher first-round count wins
   (`RUNOFF`), and equal first-round counts go to step 4 with both as tied; otherwise continue at step 3
   with the runoff counts.
3. **Plurality.** If exactly one option has the highest count it wins → `PLURALITY` (or `RUNOFF` after a
   runoff). Otherwise the options sharing the highest count are **tied** (*T*).
4. **Tie-breakers, in the design's order:**
   0. *Decision Time:* if FLIGHT used the ability in this round with an `optionId` in *T* →
      `DECISION_TIME`.
   1. *FLIGHT's vote:* if the holder of FLIGHT has a ballot on an option in *T* → `FLIGHT_TIEBREAK`.
   2. *Trivia sudden-death:* if `vote.open.trivia` is set: stage TIEBREAK_TRIVIA with
      `vote.trivia.open`. The first correct `vote.trivia.answer` in order of arrival ends the stage
      (`vote.trivia.result`). With a winner: stage TIEBREAK_PICK; their `vote.trivia.pick` wins →
      `TRIVIA`. If they do not pick in time their own ballot wins if it is in *T* (`TRIVIA`); otherwise go
      to 3. With no correct answer go to 3.
   3. *Seeded draw:* *T* in display order, index `coinSeed mod |T|` → `COIN_FLIP`. The host shows the
      coin-flip animation during RESULT.
5. **Emergency Funding.** If the winner has `afford = EMERGENCY_FUNDING`, `vote.result.emergencyFunding`
   is true, PM's ability becomes spent and `ability.used` (OVER_BUDGET_WIN) follows the result.
6. The server appends `vote.result` to the outcome log, broadcasts it with `vote.stage` RESULT, and
   after the RESULT duration sends `vote.stage` CLOSED. The host answers with `vote.commit`.

**Decision Time** (FLIGHT ability): in VOTE or RUNOFF it closes the stage at once (`closedBy` =
DECISION_TIME) and the steps above run; in TIEBREAK_TRIVIA or TIEBREAK_PICK its `optionId` (required,
must be in *T*) wins at once with method `DECISION_TIME`.

**Two players.** No special case: ties go to FLIGHT's ballot first (§3.2), then trivia, then the draw.

### 7.7 Option ids for quick votes

| Kind | Option ids | Suggested `defaultOptionId` |
|---|---|---|
| TEST | `TEST`, `SKIP` | `SKIP` |
| REVIEW | `PASS`, `REWORK` | `PASS` |
| ABORT | `ABORT`, `CONTINUE` | `CONTINUE` |
| MCM | `PERFECT_PHASE`, `SAVE_THE_MISSION`, `GOLDEN_WINDOW` | `SAVE_THE_MISSION` |
| ANOMALY | response ids from the anomaly card data | the card's no-cost response |
| FLIGHT_DECISION | ids from the decision data (e.g. `BURN_NOW`, `WAIT`) | the conservative choice |
| PILOT | PlayerIds | the next player in rotation |

The server does not check these ids (except PILOT); they are the contract between host and phone.

## 8. GO/NO-GO poll

The polling ritual (§4.3, §6.9) is run by the server one console at a time: `poll.open` → for each call
`poll.call` → `poll.answer` → `poll.answered` → … → `poll.result`.

- Call order: walk `poll.open.order`; each **connected** player is called once, at the first of their roles
  in the list, and answers for all their listed roles. Disconnected holders are not called and are
  recorded as NO_ANSWER at the end.
- Answer window per call: `perCallMs` (5 s by design); no answer → NO_ANSWER. The next call starts as soon
  as the answer arrives.
- `allGo` is true when no answer is NO_GO. NO_ANSWER does not block.
- The host owns what follows (§6.9): any NO-GO → 15 s discussion on the host screen → `poll.open` with
  `round = 2`; a second NO-GO round → a `REVIEW` vote offering `REWORK`.
- A poll and a vote round cannot be active together. A change of `phase` cancels the poll silently.

The countdown minigame MG-07 "Go/No-Go Poll" is a different thing: it is a RELAY minigame run with
`mg.start` (each phone shows readings and has a correct answer).

## 9. Flight

### 9.1 Seats and input (§9.2, §9.4)

- `pilot.assign` names pilot, co-pilot and booster pilot and says whether a seat reads the host device
  or the player's phone. The server accepts `pilot.input` / `pilot.action` only from the player assigned
  to the seat named by `craft` and only when that seat's input source is PHONE; `copilot.action` only
  from `copilotId`.
- Hold-to-confirm gestures (STAGE 0.3 s, ABORT 1.5 s) are timed on the phone; the action is sent once.
- Pause is host-only (`game.pause`); there is no pause action from phones.

### 9.2 Console channels (§3.3, §9.5)

`console.telemetry.v` for a role carries these channels and no others:

| Role | Channels (unit) |
|---|---|
| FLIGHT | `met_s` (s), `altitude_km` (km), `velocity_ms` (m/s), `countdown_s` (s to T-0), `hold` (0/1), `consoles_red` (count), `consoles_amber` (count) |
| BOOSTER | `chamber_pressure_pct` (% of nominal), `engines_running` (count), `engines_total` (count), `engine_health_pct` (%), `prop_stage1_pct` (%), `prop_stage2_pct` (%), `throttle_pct` (%) |
| STRUCT | `q_kpa` (kPa), `load_pct` (% of structural limit), `g_load` (g), `vibration_pct` (%) |
| GUIDO | `traj_error_km` (km from ideal path), `pitch_error_deg` (°), `heading_error_deg` (°) |
| FIDO | `apoapsis_km` (km), `periapsis_km` (km), `inclination_deg` (°), `window_remaining_s` (s), `dv_remaining_ms` (m/s) |
| EECOM | `battery_pct` (%), `power_balance_w` (W), `temp_c` (°C), `cabin_pressure_kpa` (kPa), `cabin_co2_pct` (%) |
| INCO | `signal_pct` (%), `data_downlinked_gb` (GB), `next_pass_s` (s), `in_pass` (0/1) |
| PAYLOAD | `targets_captured` (count), `targets_total` (count), `payload_health_pct` (%), `data_stored_gb` (GB) |
| RETRO | `entry_angle_deg` (°), `heat_load_pct` (% of TPS capacity), `landing_ellipse_km` (km), `descent_rate_ms` (m/s), `chutes_deployed` (count) |
| PM | `budget_left_m` ($M), `schedule_margin_days` (days), `score_pts` (points), `sync_meter` (0–100) |

A player holding several roles receives one stream per role. The host sends at most 10
`console.telemetry` per second per role (4 Hz is enough for most gauges); the server drops the excess.

### 9.3 Callouts and Good Calls (§9.5)

`console.alert` (host → role-holder) opens a window; `console.callout` with the matching `calloutId`
(and `arg`) whose `atMs` is inside the window earns a Good Call, announced by `console.goodcall`
(+3 Team Sync, +20 teamwork points). The host accepts `atMs` at most 300 ms earlier than the arrival
time (§17.7). Late or false callouts are shown on the host and otherwise ignored.

### 9.4 Blackout (§9.1 F11)

Between `blackout.set` active = true and active = false phones show static; `console.telemetry`,
`flight.hud` and `pilot.hud` are neither sent nor relayed. Votes, minigames and haptics still work.

## 10. Minigames

1. Host → `mg.start` (at least 3 s before `startAtMs`); the host simulation is in bullet-time (×0.1).
2. Each phone loads, sends `mg.ready`, shows instruction and demo, starts at `startAtMs`.
3. During play: optional `mg.progress` (≤ 2 Hz); shared-state minigames exchange `mg.action` /
   `mg.state` (≤ 10 Hz).
4. Each phone sends exactly one `mg.result` when its play ends.
5. The host closes the run at `startAtMs + durationMs + 2000 ms` (300 ms latency tolerance plus margin)
   or earlier when every active player has reported, and sends `mg.summary`.

**Tier (§10.3), computed by the host.** active = players who sent `mg.ready` and are connected at close;
f = succeeded / active. NONE f < 0.33 · BRONZE f ≥ 0.33 · SILVER f ≥ 0.66 · GOLD f = 1 · PLATINUM = GOLD
and every active player `perfect`. Solo: f = the player's `score`. Team Sync: Gold/Platinum +25,
Silver +15, Bronze +8. Teamwork points: 250 / 200 / 120 / 60.

During a pause phones freeze their minigame clock; on `game.resumed` they add `pausedForMs` to
`startAtMs`. Only one run can be active at a time. A reconnecting phone receives the sticky `mg.start`
and may still play if the run has not ended. A phone whose `mg.result` is refused with PAUSED (host
away) keeps it and sends it again after `game.resumed`; the host's close time has moved by the same pause.

## 11. Limits

- **Per client, outbound from the server: under 50 KB/s** (§17.8). The server sheds *droppable* types
  first, keeping only the newest of each: `flight.hud`, `vote.tally`, `react.audience`, `pilot.input`, `pilot.hud`, `console.telemetry`, `mg.progress`, `mg.state`.
- **Telemetry: at most 10 Hz per console** (`console.telemetry` per role); `flight.hud` ≤ 5 Hz;
  `pilot.hud` ≤ 10 Hz; `mg.state` ≤ 10 Hz; `vote.tally` ≤ 5 Hz.
- **Frame size:** phone → server 2,048 bytes; host → server 65,536 bytes; before `hello.ok` 1,024 bytes.
- **Overall inbound budget:** phone 60 messages/s and 8,192 bytes/s; host 400 messages/s and
  262,144 bytes/s. More than 3× either for 2 consecutive seconds → FLOOD (fatal).
- **Per-type limits** are token buckets (sustained rate, burst). A message over its limit is dropped and
  answered with `error` RATE_LIMITED and `retryAfterMs`; droppable types are dropped without an error.

| Type | Limit (token bucket: sustained rate, burst) |
|---|---|
| `hello` | once |
| `clock.ping` | 2/s, burst 4 |
| `room.create` | 1/s, burst 2 |
| `room.join` | 1/s, burst 3 |
| `room.resume` | 1/s, burst 3 |
| `room.leave` | 1/s |
| `player.profile` | 1 per 2 s, burst 2 |
| `player.prefs` | 1/s, burst 2 |
| `roles.pick` | 2/s, burst 4 |
| `roles.vote` | 2/s, burst 4 |
| `ability.use` | 1/s, burst 2 |
| `vote.predict` | 2/s, burst 4 |
| `vote.tag` | 2/s, burst 4 |
| `vote.cast` | 4/s, burst 8 |
| `vote.veto` | 1/s, burst 2 |
| `vote.trivia.answer` | 2/s, burst 4 |
| `vote.trivia.pick` | 2/s, burst 4 |
| `ping.send` | 1 per 2 s, burst 3 |
| `react.send` | players 2/s, burst 4; spectators 1/s, burst 2 |
| `poll.answer` | 2/s, burst 4 |
| `pilot.input` | 30/s, burst 40 |
| `pilot.action` | 10/s, burst 10 |
| `copilot.action` | 10/s, burst 10 |
| `console.callout` | 2/s, burst 4 |
| `console.request` | 1/s, burst 2 |
| `mg.ready` | 1/s, burst 2 |
| `mg.progress` | 2/s, burst 4 |
| `mg.action` | 10/s, burst 20 |
| `mg.result` | 1/s, burst 2 |

Host messages have no per-type limit other than the telemetry rates above.

## 12. Errors and message index

### 12.1 Common validation, in order, for every received frame

1. Text frame, size within the limit → else FRAME_TOO_LARGE / BAD_ENVELOPE (fatal).
2. Parses as a JSON object with `t`, `seq`, `d`; `seq` greater than the last → else BAD_ENVELOPE (fatal).
3. `hello` is first and sent once → else HANDSHAKE_REQUIRED (fatal).
4. Overall and per-type rate limits → RATE_LIMITED, or FLOOD (fatal).
5. `t` is known → else UNKNOWN_TYPE.
6. The connection kind may send `t` ("Sent by" in the reference) → else FORBIDDEN.
7. The connection is in a room when `t` needs one → else NOT_IN_ROOM (or ALREADY_IN_ROOM for
   `room.create` / `room.join` / `room.resume`).
8. `d` satisfies the schema of `t`, ignoring unknown fields → else BAD_PAYLOAD with `field`.
9. The game is not paused, for types flagged *rejected with PAUSED* → else PAUSED.
10. The type-specific rules listed under "Server validation" in the reference, in the order written.

A rejected message has no effect. Every rejection is answered with `error` (`re` = its `seq`).

### 12.2 Error codes

| Code | Fatal | Meaning |
|---|---|---|
| `BAD_ENVELOPE` | yes | Frame is not a JSON object with exactly `t` (string), `seq` (integer) and `d` (object), is a binary frame, or `seq` is not greater than the previous `seq` on this connection. |
| `FRAME_TOO_LARGE` | yes | Frame larger than `hello.ok.maxFrameBytes` (before `hello.ok`: 1,024 bytes). |
| `HANDSHAKE_REQUIRED` | yes | First message was not `hello`, or `hello` was sent twice. |
| `VERSION_MISMATCH` | yes | `hello.protocolVersion` differs from the server version; `serverProtocolVersion` is set. |
| `FLOOD` | yes | More than 3× the overall message or byte budget for 2 consecutive seconds. |
| `UNKNOWN_TYPE` | no | `t` is not a message type the server accepts from any sender. |
| `BAD_PAYLOAD` | no | `d` fails the schema of `t` (missing or mistyped known field, value out of range). `field` names the first failing field. Unknown fields are ignored, never an error. |
| `FORBIDDEN` | no | This connection kind may not send `t` (e.g. a spectator sent `vote.veto`, a phone sent `vote.open`). |
| `NOT_IN_ROOM` | no | The message needs room membership but this connection has not joined, created or resumed a room. |
| `ALREADY_IN_ROOM` | no | `room.create`, `room.join` or `room.resume` on a connection that is already in a room. |
| `ROOM_NOT_FOUND` | no | No live room has this code. |
| `TOKEN_INVALID` | no | Unknown, revoked or expired token (slot hold of 3 min elapsed, player kicked, room gone). |
| `NICK_REJECTED` | no | Nickname blocked by the profanity filter; `suggestion` carries a safe nickname from the filtered list. |
| `NICK_TAKEN` | no | Another player in the room has the same nickname (case-insensitive); `suggestion` carries a free variant. |
| `RATE_LIMITED` | no | Per-type rate limit exceeded; the message was dropped. `retryAfterMs` is set. |
| `PAUSED` | no | Gameplay input while the game is paused (including while the host is disconnected). |
| `WRONG_PHASE` | no | Not allowed in the current phase (e.g. `player.profile` outside LOBBY). |
| `WRONG_STAGE` | no | Not allowed in the current vote stage (e.g. `vote.cast` during INSPECT). |
| `INVALID_TRANSITION` | no | `phase.set` asks for a transition that is not in the phase graph, or an inconsistent phase/sub/flightPhase combination. |
| `SETTING_LOCKED` | no | A lobby-only setting was changed outside LOBBY. |
| `UNKNOWN_PLAYER` | no | A referenced PlayerId is not a player of this room. |
| `STALE_ID` | no | The `roundId`, `pollId`, `runId`, `alertId` or `requestId` does not match the active one. |
| `DUPLICATE_ID` | no | The host reused a `roundId`, `pollId` or `runId` already used in this room. |
| `ROUND_ACTIVE` | no | The host opened a vote or poll while another vote or poll is active. |
| `NO_WINNABLE_OPTION` | no | `vote.open` has no winnable option. |
| `UNKNOWN_OPTION` | no | `optionId` is not an option of the round (or not a current candidate in RUNOFF / TIEBREAK stages). |
| `OPTION_VETOED` | no | The option has been vetoed. |
| `OPTION_NOT_WINNABLE` | no | The option is marked "Will not fly" with no fix available (§4.2 Invalid combos). |
| `OPTION_UNAFFORDABLE` | no | The option is over budget/schedule and Emergency Funding is spent or cannot cover it (§4.2 Affordability). |
| `NOT_A_VOTER` | no | The player is not in the round electorate (`vote.opened.voters`). |
| `VETO_NOT_ALLOWED` | no | This vote kind or stage does not allow vetoes. |
| `VETO_USED` | no | The player already used the one veto of this mission. |
| `VETO_MIN_OPTIONS` | no | The veto would leave fewer than two winnable options. |
| `NOT_ROLE_HOLDER` | no | The sender does not hold the role required for the action. |
| `ALREADY_ANSWERED` | no | A prediction, trivia answer, poll answer or minigame result was already recorded for this sender. |
| `NOT_YOUR_TURN` | no | The sender is not the player currently called (poll) or the trivia winner (pick). |
| `ABILITY_USED` | no | The once-per-mission ability of that role is already spent. |
| `ABILITY_REJECTED` | no | The host declined the ability (`ability.resolve.accepted = false`). The ability stays available. |
| `ROLE_TAKEN` | no | `roles.pick`: another player already holds that role group. |
| `INVALID_ASSIGNMENT` | no | `roles.set`: the assignment is not a partition of all ten roles over current players. |
| `NOT_PILOT` | no | Pilot or co-pilot input from a phone that is not assigned to that seat, or the seat input source is HOST_DEVICE. |
| `INTERNAL` | no | Unexpected server fault. The message may or may not have been applied. |

### 12.3 Message index

| # | Type | Direction | Sent by | Delivered to | Design |
|---|---|---|---|---|---|
| 1 | [`hello`](#hello) | any → server | connection not yet in a room | server only | §17.1, §17.4 |
| 2 | [`hello.ok`](#hellook) | server → host and clients | server | the connection concerned (reply) | §17.1, §17.8 |
| 3 | [`clock.ping`](#clockping) | any → server | host, player, spectator, connection not yet in a room | server only | §17.7, §17.8 |
| 4 | [`clock.pong`](#clockpong) | server → host and clients | server | the connection concerned (reply) | §17.7 |
| 5 | [`error`](#error) | server → host and clients | server | the connection concerned (reply) | §17.4 |
| 6 | [`bye`](#bye) | server → host and clients | server | the connection concerned (reply) | §17.7 |
| 7 | [`relay`](#relay) | server → host | server | host only | §17.1, §17.4 |
| 8 | [`snapshot.end`](#snapshotend) | server → host and clients | server | the connection concerned (reply) | §17.7 |
| 9 | [`room.create`](#roomcreate) | host → server | connection not yet in a room | server only | §3.1 step 1, §14.1 |
| 10 | [`room.created`](#roomcreated) | server → host | server | host only | §3.1 step 1, §17.7 |
| 11 | [`room.join`](#roomjoin) | client → server | connection not yet in a room | server only | §3.1 steps 2–4, §13.7, §17.9 |
| 12 | [`room.joined`](#roomjoined) | server → client | server | the connection concerned (reply) | §3.1, §17.7 |
| 13 | [`room.resume`](#roomresume) | any → server | connection not yet in a room | server only | §3.1 step 5, §17.7 |
| 14 | [`room.resumed`](#roomresumed) | server → host and clients | server | the connection concerned (reply) | §17.7 |
| 15 | [`room.state`](#roomstate) | server → host and clients | server | host, all players, all spectators | §3.1, §3.2, §17.4 |
| 16 | [`room.leave`](#roomleave) | client → server | player, spectator | server only | §3.1 |
| 17 | [`room.kick`](#roomkick) | host → server | host | server only | §17.9, §13.3 |
| 18 | [`room.close`](#roomclose) | host → server | host | server only | §17.7 |
| 19 | [`room.promoted`](#roompromoted) | server → client | server | one client chosen by the server | §3.1 step 4 |
| 20 | [`player.profile`](#playerprofile) | client → server | player | server only | §3.1 step 2 |
| 21 | [`player.prefs`](#playerprefs) | client → server | player, spectator | server only | §16 |
| 22 | [`settings.set`](#settingsset) | host → server | host | server only | §3.3, §4.1, §4.2, §9.3, §9.4, §13.7, §16 |
| 23 | [`settings.state`](#settingsstate) | server → host and clients | server | host, all players, all spectators | §3.3, §4.1, §4.2, §9.3, §13.7, §16 |
| 24 | [`roles.pick`](#rolespick) | client → server | player | server only | §3.3 (player pick, first come) |
| 25 | [`roles.vote`](#rolesvote) | client → server | player | server only | §3.3 (vote) |
| 26 | [`roles.lock`](#roleslock) | host → server | host | server only | §3.3, §3.2 |
| 27 | [`roles.set`](#rolesset) | host → server | host | server only | §3.3, §13.3 Classroom |
| 28 | [`roles.rotate`](#rolesrotate) | host → server | host | server only | §3.3 ("Roles rotate between missions in Campaign mode") |
| 29 | [`roles.state`](#rolesstate) | server → host and clients | server | host, all players, all spectators | §3.2, §3.3 |
| 30 | [`ability.use`](#abilityuse) | client → server | player | server only | §3.3 (once-per-mission ability), §4.2 |
| 31 | [`ability.requested`](#abilityrequested) | server → host | server | host only | §3.3 |
| 32 | [`ability.resolve`](#abilityresolve) | host → server | host | server only | §3.3 |
| 33 | [`ability.consume`](#abilityconsume) | host → server | host | server only | §6.8 (Budget Cut → "use Emergency Funding") |
| 34 | [`ability.used`](#abilityused) | server → host and clients | server | host, all players, all spectators | §3.3, §4.2 Affordability |
| 35 | [`phase.set`](#phaseset) | host → server → client (relayed unchanged) | host | all players and spectators | §17.3, §2.1, §9.1, §9.4 |
| 36 | [`game.pause`](#gamepause) | host → server | host | server only | §9.2 (Pause, host only), §13.3 Classroom |
| 37 | [`game.paused`](#gamepaused) | server → host and clients | server | host, all players, all spectators | §17.7, §9.2 |
| 38 | [`game.resume`](#gameresume) | host → server | host | server only | §9.2, §17.7 |
| 39 | [`game.resumed`](#gameresumed) | server → host and clients | server | host, all players, all spectators | §17.7 |
| 40 | [`notice.show`](#noticeshow) | host → server → client (relayed unchanged) | host | players listed in `d.to`; all players and spectators when `d.to` is null | §12.2, §13.3, §16, §3.2 (solo hint) |
| 41 | [`build.state`](#buildstate) | host → server → client (relayed unchanged) | host | all players and spectators | §6.1, §6.3, §6.4, §6.9, §6.11 |
| 42 | [`build.event`](#buildevent) | host → server → client (relayed unchanged) | host | all players and spectators | §6.6, §6.8, §6.9, §9.9 |
| 43 | [`flight.event`](#flightevent) | host → server → client (relayed unchanged) | host | all players and spectators | §9.1 (possible events, fact moments), §8.4, §9.8 |
| 44 | [`flight.hud`](#flighthud) | host → server → client (relayed unchanged) | host | all players and spectators | §9.6 (HUD), §13.7 (spectators see the host view) |
| 45 | [`vote.open`](#voteopen) | host → server | host | server only | §4.1, §4.2, §4.3, §6.6, §6.8, §6.9, §9.4, §9.8, §11.2, §14.3 |
| 46 | [`vote.opened`](#voteopened) | server → host and clients | server | host, all players, all spectators | §4.1 steps 1–2, §14.3 |
| 47 | [`vote.stage`](#votestage) | server → host and clients | server | host, all players, all spectators | §4.1 (steps and durations), §4.2 (runoff, tie-breakers) |
| 48 | [`vote.insight`](#voteinsight) | host → server → client (relayed unchanged) | host | player(s) holding `d.role` | §3.3 (Insight during Build), §4.1 step 3 |
| 49 | [`vote.predict`](#votepredict) | client → server | player, spectator | server only | §4.1 step 4, §12.2 Predict-before-vote, §13.7 |
| 50 | [`vote.predict.result`](#votepredictresult) | server → host and clients | server | host, all players, all spectators | §4.1 step 4, §11.3 (correct predictions 50 each) |
| 51 | [`vote.tag`](#votetag) | client → server | player | server only | §3.4 Role tags, §4.1 step 3 |
| 52 | [`vote.tags`](#votetags) | server → host and clients | server | host, all players, all spectators | §3.4 Role tags |
| 53 | [`vote.cast`](#votecast) | client → server | player, spectator | server only | §4.1 step 5, §4.2, §13.7 (audience votes), §17.4 |
| 54 | [`vote.ack`](#voteack) | server → client | server | the connection concerned (reply) | §4.1 step 5, §17.8 (vote round trip < 200 ms) |
| 55 | [`vote.tally`](#votetally) | server → host and clients | server | host, all players, all spectators | §4.1 step 5 (live tallies, open or hidden), §6.1 (leading option ghost), §13.7 ("Audience says" bar) |
| 56 | [`vote.veto`](#voteveto) | client → server | player | server only | §4.2 Veto token |
| 57 | [`vote.vetoed`](#votevetoed) | server → host and clients | server | host, all players, all spectators | §4.2 Veto token ("VETO — PROP") |
| 58 | [`vote.close`](#voteclose) | host → server | host | server only | §13.3 Classroom (teacher controls), §4.1 |
| 59 | [`vote.cancel`](#votecancel) | host → server | host | server only | §17.3 |
| 60 | [`vote.cancelled`](#votecancelled) | server → host and clients | server | host, all players, all spectators | §17.3 |
| 61 | [`vote.trivia.open`](#votetriviaopen) | server → host and clients | server | host, all players, all spectators | §4.2 tie-breaker 2 (trivia sudden-death), §12.2 |
| 62 | [`vote.trivia.answer`](#votetriviaanswer) | client → server | player | server only | §4.2 tie-breaker 2 |
| 63 | [`vote.trivia.result`](#votetriviaresult) | server → host and clients | server | host, all players, all spectators | §4.2 tie-breaker 2, §11.3 (trivia tiebreaks 30) |
| 64 | [`vote.trivia.pick`](#votetriviapick) | client → server | player | server only | §4.2 tie-breaker 2 ("the first correct answer picks among the tied options") |
| 65 | [`vote.result`](#voteresult) | server → host and clients | server | host, all players, all spectators | §4.1 step 6, §4.2 (all rules), §17.4 |
| 66 | [`vote.commit`](#votecommit) | host → server → client (relayed unchanged) | host | all players and spectators | §4.1 steps 6–7 (dashboard deltas, budget and schedule deducted, Codex unlock) |
| 67 | [`ping.send`](#pingsend) | client → server | player | server only | §3.4 (quick pings, no free-text chat), §17.9 |
| 68 | [`ping.event`](#pingevent) | server → host and clients | server | host, all players, all spectators | §3.4, §17.4 |
| 69 | [`react.send`](#reactsend) | client → server | player, spectator | server only | §3.4 (emoji reactions), §13.7 |
| 70 | [`react.event`](#reactevent) | server → host and clients | server | host, all players, all spectators | §3.4 |
| 71 | [`react.audience`](#reactaudience) | server → host and clients | server | host, all players, all spectators | §13.7 |
| 72 | [`poll.open`](#pollopen) | host → server | host | server only | §4.3 (GO/NO-GO ritual), §6.9 (FRR), §3.3 (FLIGHT calls polls) |
| 73 | [`poll.call`](#pollcall) | server → host and clients | server | host, all players, all spectators | §4.3, §6.9 |
| 74 | [`poll.answer`](#pollanswer) | client → server | player | server only | §4.3 ("each player answers GO or NO-GO on their device") |
| 75 | [`poll.answered`](#pollanswered) | server → host and clients | server | host, all players, all spectators | §4.3, §6.9 |
| 76 | [`poll.result`](#pollresult) | server → host and clients | server | host, all players, all spectators | §6.9 ("Any NO-GO opens a quick discussion (15 s), then a re-poll") |
| 77 | [`pilot.assign`](#pilotassign) | host → server → client (relayed unchanged) | host | all players and spectators | §9.4 (pilot rotation, co-pilot, booster pilot, pass the controls) |
| 78 | [`pilot.input`](#pilotinput) | client → server → host (relayed inside relay) | player | host only | §9.2 (controls), §9.4 (phones become virtual gamepads) |
| 79 | [`pilot.action`](#pilotaction) | client → server → host (relayed inside relay) | player | host only | §9.2 (controls), §9.4, §9.8 |
| 80 | [`copilot.action`](#copilotaction) | client → server → host (relayed inside relay) | player | host only | §9.4 (co-pilot handles staging and deploys) |
| 81 | [`pilot.hud`](#pilothud) | host → server → client (relayed unchanged) | host | players listed in `d.to` | §9.2, §9.5 (pilot sees console requests as prompts), §9.3 (guidance cue) |
| 82 | [`console.config`](#consoleconfig) | host → server → client (relayed unchanged) | host | player(s) holding `d.role` | §9.5, §3.3 (flight console per role) |
| 83 | [`console.telemetry`](#consoletelemetry) | host → server → client (relayed unchanged) | host | player(s) holding `d.role` | §9.5, §17.4, §17.8 (≤ 10 Hz per console) |
| 84 | [`console.alert`](#consolealert) | host → server → client (relayed unchanged) | host | player(s) holding `d.role` | §9.5 ("the role-holder gets a subtle alert") |
| 85 | [`console.callout`](#consolecallout) | client → server → host (relayed inside relay) | player | host only | §9.5 (callout buttons), §17.4 |
| 86 | [`console.request`](#consolerequest) | client → server → host (relayed inside relay) | player | host only | §9.5 ("Consoles also let roles request actions") |
| 87 | [`console.goodcall`](#consolegoodcall) | host → server → client (relayed unchanged) | host | all players and spectators | §9.5 (Good Call), §11.2 (+3 Team Sync), §11.3 (20 points) |
| 88 | [`blackout.set`](#blackoutset) | host → server → client (relayed unchanged) | host | all players and spectators | §9.1 F11 ("Phones show static"), MG-25, MG-26 |
| 89 | [`haptic.cue`](#hapticcue) | host → server → client (relayed unchanged) | host | players listed in `d.to`; all players when `d.to` is null | §15 Haptics, §10.4 (phone vibration pattern) |
| 90 | [`sync.meter`](#syncmeter) | host → server → client (relayed unchanged) | host | all players and spectators | §11.2 (Team Sync meter & Mission Control Moment) |
| 91 | [`boost.applied`](#boostapplied) | host → server → client (relayed unchanged) | host | all players and spectators | §10.4, §11.1 ("Boosts apply immediately and visibly") |
| 92 | [`boost.state`](#booststate) | host → server → client (relayed unchanged) | host | all players and spectators | §11.1 (stacking, shields shown as icons), §9.6 (active boost icons) |
| 93 | [`mg.start`](#mgstart) | host → server → client (relayed unchanged) | host | all players; also spectators when the run has `audience` = true | §10.1, §10.2, §17.4, §17.7 |
| 94 | [`mg.ready`](#mgready) | client → server → host (relayed inside relay) | player | host only | §10.3 ("Active means connected and loaded") |
| 95 | [`mg.progress`](#mgprogress) | client → server → host (relayed inside relay) | player | host only | §14.1 screen 11 (team progress meter) |
| 96 | [`mg.action`](#mgaction) | client → server → host (relayed inside relay) | player | host only | §10.2 (cooperative split, relay, team-sync), MG-19, MG-28, MG-30 |
| 97 | [`mg.state`](#mgstate) | host → server → client (relayed unchanged) | host | all players; also spectators when the run has `audience` = true | §10.2, §14.1 screen 11 |
| 98 | [`mg.result`](#mgresult) | client → server → host (relayed inside relay) | player | host only | §10.1 rule 9, §10.3, §17.4, §17.7 (results timestamped locally, 300 ms tolerance) |
| 99 | [`mg.summary`](#mgsummary) | host → server → client (relayed unchanged) | host | all players and spectators | §10.3 (fraction and tiers), §10.4 (boosts), §11.2, §11.3, §17.4 |
| 100 | [`mg.cancel`](#mgcancel) | host → server → client (relayed unchanged) | host | all players and spectators | §10.1 rule 3, §9.8 |
| 101 | [`kp.awarded`](#kpawarded) | host → server → client (relayed unchanged) | host | all players and spectators | §4.1 step 4, §11.3 Knowledge, §12.2 Knowledge Points |
| 102 | [`codex.unlock`](#codexunlock) | host → server → client (relayed unchanged) | host | players listed in `d.to`; all players and spectators when `d.to` is null | §4.1 step 7, §12.2 Mission Codex, §10.3 (Platinum badge) |
| 103 | [`debrief.score`](#debriefscore) | host → server → client (relayed unchanged) | host | all players and spectators | §11.3, §11.4, §5.2, §8.5, §9.9 |
| 104 | [`debrief.awards`](#debriefawards) | host → server → client (relayed unchanged) | host | all players and spectators | §11.5 (individual recognition, positive only), §14.2 screen 8 |
| 105 | [`debrief.facts`](#debrieffacts) | host → server → client (relayed unchanged) | host | all players and spectators | §12.2 (debrief comparison), §9.9 (Lessons Learned), §2.2 (facts collected) |

## 13. Message reference

105 message types. Each section gives direction, sender, delivery, the design rule it implements, the payload fields of `d`, the server validation and an example frame.

<!-- group: Connection -->

**Connection**

### `hello`

| | |
|---|---|
| Direction | any → server |
| Sent by | connection not yet in a room |
| Delivered to | server only |
| Design | §17.1, §17.4 |
| Rate limit | once |

First message on every connection. Declares the protocol version and the kind of application. The server answers `hello.ok`, or `error` VERSION_MISMATCH followed by `bye` and close.

| Field | Type | Required | Description |
|---|---|---|---|
| `protocolVersion` | `int 1…65535` | yes | Protocol version the sender implements. This document defines version 1. |
| `client` | `ClientKind` | yes | Kind of application. Selects the frame-size and rate budget of the connection. |
| `appVersion` | `string /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/` | yes | Build version of the application, for logs only. |
| `lang` | `LangTag` | no | Preferred language of the device, used only for server-chosen nickname suggestions. Default "en". |

**Server validation** (after the common checks):

- Must be the first message of the connection and sent once → HANDSHAKE_REQUIRED (fatal).
- `protocolVersion` ≠ server version → VERSION_MISMATCH (fatal), `serverProtocolVersion` set.
- Not received within 5 s of the WebSocket opening → `bye` HANDSHAKE_TIMEOUT.

**Example**

```json
{"t":"hello","seq":1,"d":{"protocolVersion":1,"client":"PHONE","appVersion":"0.3.1","lang":"en"}}
```

### `hello.ok`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §17.1, §17.8 |

Accepts the handshake and states the limits of this connection. After it the client must send `room.create` (host), `room.join` (phone) or `room.resume` (either) within 30 s.

| Field | Type | Required | Description |
|---|---|---|---|
| `protocolVersion` | `int 1…65535` | yes | Server protocol version (equals the client version). |
| `serverTimeMs` | `TimeMs` | yes | Server clock when the message was sent. |
| `heartbeatMs` | `int 1000…60000` | yes | Interval at which the client must send `clock.ping`. Always 5000. |
| `idleTimeoutMs` | `int 1000…120000` | yes | The server drops the connection after this long without any frame. Always 15000. |
| `maxFrameBytes` | `int 1024…1048576` | yes | Largest frame the client may send, UTF-8 bytes. PHONE: 2048. HOST: 65536. |
| `maxMsgsPerSec` | `int 1…1000` | yes | Overall message budget of the connection. PHONE: 60. HOST: 400. |
| `maxBytesPerSec` | `int 1024…10485760` | yes | Overall inbound byte budget of the connection. PHONE: 8192. HOST: 262144. |

**Example**

```json
{"t":"hello.ok","seq":1,"d":{"protocolVersion":1,"serverTimeMs":1794650000000,"heartbeatMs":5000,"idleTimeoutMs":15000,"maxFrameBytes":2048,"maxMsgsPerSec":60,"maxBytesPerSec":8192}}
```

### `clock.ping`

| | |
|---|---|
| Direction | any → server |
| Sent by | host, player, spectator, connection not yet in a room |
| Delivered to | server only |
| Design | §17.7, §17.8 |
| Rate limit | 2/s, burst 4 |

Heartbeat and clock probe. Sent every `heartbeatMs` (5 s) by every client, and three times 200 ms apart right after `hello.ok`. The client keeps the offset from the sample with the smallest round trip: `offset = serverTimeMs − (clientTimeMs + rtt/2)`. A client that gets no `clock.pong` for 10 s must reconnect.

| Field | Type | Required | Description |
|---|---|---|---|
| `clientTimeMs` | `number ≥ 0` | yes | Sender's local monotonic or wall clock in milliseconds; echoed back unchanged. |

**Server validation** (after the common checks):

- Allowed before joining a room (after `hello.ok`).

**Example**

```json
{"t":"clock.ping","seq":1,"d":{"clientTimeMs":81234.5}}
```

### `clock.pong`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §17.7 |

Answer to `clock.ping`.

| Field | Type | Required | Description |
|---|---|---|---|
| `clientTimeMs` | `number ≥ 0` | yes | Echo of `clock.ping.clientTimeMs`. |
| `serverTimeMs` | `TimeMs` | yes | Server clock when the ping was processed. |

**Example**

```json
{"t":"clock.pong","seq":1,"d":{"clientTimeMs":81234.5,"serverTimeMs":1794650001200}}
```

### `error`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §17.4 |

Rejects one message from this connection. The rejected message had no effect. When `fatal` is true the server sends `bye` next and closes the socket.

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | `ErrorCode` | yes | Error code (see the error table). |
| `fatal` | `boolean` | yes | True when the connection is closed because of this error. |
| `re` | `int 0…2147483647 \| null` | yes | `seq` of the rejected message; null when the frame could not be parsed. |
| `reT` | `string (0–64 chars) \| null` | yes | `t` of the rejected message; null when unknown. |
| `retryAfterMs` | `int 0…600000` | no | RATE_LIMITED only: wait at least this long before sending this type again. |
| `field` | `string (0–64 chars)` | no | BAD_PAYLOAD only: name of the first failing field (dotted path). |
| `serverProtocolVersion` | `int 1…65535` | no | VERSION_MISMATCH only: version the server speaks. |
| `suggestion` | `Nickname` | no | NICK_REJECTED / NICK_TAKEN only: a nickname the server would accept. |

**Example**

```json
{"t":"error","seq":1,"d":{"code":"VETO_USED","fatal":false,"re":41,"reT":"vote.veto"}}
```

### `bye`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §17.7 |

Last message before the server closes the socket. Carries the reason because browsers do not reliably expose close reasons. The WebSocket close code equals `closeCode`.

| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | `ByeReason` | yes | Why the connection is being closed. |
| `closeCode` | `int 4000…4999` | yes | WebSocket close code the server uses (fixed per reason, see ByeReason). |
| `canResume` | `boolean` | yes | True when the token is still valid and the client should reconnect and send `room.resume` (SERVER_SHUTDOWN, IDLE_TIMEOUT, FLOOD, PROTOCOL_VIOLATION). False otherwise. |

**Example**

```json
{"t":"bye","seq":1,"d":{"reason":"KICKED","closeCode":4002,"canResume":false}}
```

### `relay`

| | |
|---|---|
| Direction | server → host |
| Sent by | server |
| Delivered to | host only |
| Design | §17.1, §17.4 |

Wrapper for every player message that the server forwards to the host. The server validates the inner message (sender, schema, rate, seat), then forwards it unchanged inside `d`, adding who sent it. The envelope `seq` is the server→host sequence; the player's own `seq` is not forwarded. If the host is disconnected the inner message is rejected with PAUSED and not queued.

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | `PlayerId` | yes | Player who sent the inner message. |
| `t` | `RelayedType` | yes | Type of the inner message. |
| `d` | `object` | yes | Payload of the inner message, exactly as sent by the player and valid against the schema of `t`. |

**Example**

```json
{"t":"relay","seq":1,"d":{"from":"p3","t":"mg.result","d":{"runId":"m1.mg08","minigameId":"MG-08","success":true,"perfect":false,"score":0.91,"value":null,"elapsedMs":19840,"finishedAtMs":1794650520000,"mode":"STANDARD"}}}
```

### `snapshot.end`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §17.7 |

Marks the end of the state snapshot sent after `room.created`, `room.joined` or `room.resumed`. Until it arrives the receiver should build state silently (no animations, no haptics).

| Field | Type | Required | Description |
|---|---|---|---|
| `serverTimeMs` | `TimeMs` | yes | Server clock when the snapshot was completed. |
| `lastOutcomeSeq` | `int 0…2147483647` | yes | Sequence number of the newest entry in the room outcome log; 0 when the log is empty. |

**Example**

```json
{"t":"snapshot.end","seq":1,"d":{"serverTimeMs":1794650000300,"lastOutcomeSeq":12}}
```

<!-- group: Room and membership -->

**Room and membership**

### `room.create`

| | |
|---|---|
| Direction | host → server |
| Sent by | connection not yet in a room |
| Delivered to | server only |
| Design | §3.1 step 1, §14.1 |
| Rate limit | 1/s, burst 2 |

The host application opens a new room ("New Mission"). The connection becomes the room's host. The server answers `room.created`, then `settings.state`, `room.state`, `roles.state`, `snapshot.end`.

| Field | Type | Required | Description |
|---|---|---|---|
| `settings` | `SettingsPatch` | no | Initial settings; missing fields take their defaults. |

**Server validation** (after the common checks):

- `hello.client` must be HOST → FORBIDDEN.
- Connection already in a room → ALREADY_IN_ROOM.

**Example**

```json
{"t":"room.create","seq":1,"d":{"settings":{"voteTimerS":20,"strictMajority":false}}}
```

### `room.created`

| | |
|---|---|
| Direction | server → host |
| Sent by | server |
| Delivered to | host only |
| Design | §3.1 step 1, §17.7 |

Confirms the new room and gives the host everything it shows on the title screen. The host renders `joinUrl` as the QR code.

| Field | Type | Required | Description |
|---|---|---|---|
| `room` | `RoomCode` | yes | The 4-letter room code. |
| `hostToken` | `Token` | yes | Host reconnect token. The host must persist it (PlayerPrefs / localStorage) so a refresh can `room.resume`. |
| `joinUrl` | `string /^https?://[^\s?#]+\?room=[A-HJ-NP-Z]{4}$/ (0–200 chars)` | yes | Player join URL and QR content: `<clientBaseUrl>?room=<CODE>`. |
| `spectateUrl` | `string /^https?://[^\s?#]+\?room=[A-HJ-NP-Z]{4}&watch=1$/ (0–200 chars)` | yes | Audience join URL and QR content: `<clientBaseUrl>?room=<CODE>&watch=1`. |
| `maxPlayers` | `int 1…10` | yes | Player slots. Always 10. |
| `slotHoldMs` | `int 0…3600000` | yes | How long a disconnected player keeps slot and roles. Always 180000 (3 min). |
| `roomHoldMs` | `int 0…3600000` | yes | How long the room survives without its host. Always 600000 (10 min). |

**Example**

```json
{"t":"room.created","seq":1,"d":{"room":"KQXM","hostToken":"hT_5uJ2m9Qe7LwXc1Vb8Nz0A","joinUrl":"https://play.example.org/?room=KQXM","spectateUrl":"https://play.example.org/?room=KQXM&watch=1","maxPlayers":10,"slotHoldMs":180000,"roomHoldMs":600000}}
```

### `room.join`

| | |
|---|---|
| Direction | client → server |
| Sent by | connection not yet in a room |
| Delivered to | server only |
| Design | §3.1 steps 2–4, §13.7, §17.9 |
| Rate limit | 1/s, burst 3 |

A phone joins a room as a player or as a spectator. No account and no personal data: only a nickname and an avatar. The server answers `room.joined` followed by the snapshot. A PLAYER request becomes a spectator with `pendingPlayer = true` when the Build phase has started (late join) or when all 10 slots are taken.

| Field | Type | Required | Description |
|---|---|---|---|
| `room` | `RoomCode` | yes | Room code typed or taken from the `room` URL parameter, upper-cased. |
| `as` | `JoinAs` | yes | PLAYER, or SPECTATOR when the URL has `watch=1`. |
| `nickname` | `string (2–32 chars)` | no | Requested nickname, before server normalisation. Required when `as` = PLAYER; ignored for SPECTATOR. |
| `avatar` | `Avatar` | no | Requested avatar. Required when `as` = PLAYER; ignored for SPECTATOR. |
| `prefs` | `PlayerPrefs` | no | Device preferences; defaults (all false, 100 %, haptics true, lang from `hello`) when missing. |

**Server validation** (after the common checks):

- `hello.client` must be PHONE → FORBIDDEN.
- Connection already in a room → ALREADY_IN_ROOM.
- No live room with this code → ROOM_NOT_FOUND.
- `as` = PLAYER without `nickname` or `avatar`, or nickname not matching `Nickname` after normalisation (NFC, trim, collapse inner whitespace) → BAD_PAYLOAD.
- Nickname hits the profanity filter → NICK_REJECTED with `suggestion`.
- Nickname equals another player's nickname, case-insensitive → NICK_TAKEN with `suggestion`.
- Phase is LOBBY, BRIEFING or CONTRACT_VOTE and a slot is free → joins as player. Otherwise → joins as spectator with `pendingPlayer = true` (not an error).

**Example**

```json
{"t":"room.join","seq":1,"d":{"room":"KQXM","as":"PLAYER","nickname":"Nova","avatar":{"suitId":"suit_orange","patchId":"patch_comet"},"prefs":{"lang":"en","relaxed":false,"oneButton":false,"holdToToggle":false,"reducedMotion":false,"highContrast":false,"textScalePct":100,"screenReader":false,"haptics":true}}}
```

### `room.joined`

| | |
|---|---|
| Direction | server → client |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §3.1, §17.7 |

Confirms the join and hands out the reconnect token. The phone stores `room` and `token` in sessionStorage. The snapshot follows.

| Field | Type | Required | Description |
|---|---|---|---|
| `room` | `RoomCode` | yes | Room code. |
| `kind` | `MemberKind` | yes | Membership actually granted. |
| `id` | `PlayerId \| SpectatorId` | yes | PlayerId when `kind` = PLAYER, SpectatorId when SPECTATOR. |
| `slot` | `int 1…10 \| null` | yes | Seat number for players; null for spectators. |
| `nickname` | `Nickname \| null` | yes | Nickname after normalisation; null for spectators who gave none. |
| `token` | `Token` | yes | Reconnect token for `room.resume`. |
| `spectatorReason` | `SpectatorReason \| null` | yes | Why the member is a spectator; null for players. |
| `pendingPlayer` | `boolean` | yes | True when the spectator will be promoted to player at the next vote round (see `room.promoted`). |

**Example**

```json
{"t":"room.joined","seq":1,"d":{"room":"KQXM","kind":"PLAYER","id":"p3","slot":3,"nickname":"Nova","token":"pT_8sK3n0Rf6MxYd2Wc9Oa1B","spectatorReason":null,"pendingPlayer":false}}
```

### `room.resume`

| | |
|---|---|
| Direction | any → server |
| Sent by | connection not yet in a room |
| Delivered to | server only |
| Design | §3.1 step 5, §17.7 |
| Rate limit | 1/s, burst 3 |

Reattaches a new connection to an existing membership (player, spectator or host) using the token. The server answers `room.resumed` followed by the snapshot. Any older connection using the same token receives `bye` REPLACED.

| Field | Type | Required | Description |
|---|---|---|---|
| `room` | `RoomCode` | yes | Room code. |
| `token` | `Token` | yes | Token from `room.joined` or `room.created`. |
| `lastOutcomeSeq` | `int 0…2147483647` | no | Host only: sequence number of the last outcome the host has durably applied (0 = none). The server replays every later outcome during the snapshot. Ignored for phones. |

**Server validation** (after the common checks):

- Connection already in a room → ALREADY_IN_ROOM.
- No live room with this code → ROOM_NOT_FOUND.
- Token unknown, revoked (kick) or expired (slot hold elapsed) → TOKEN_INVALID; the phone must `room.join` again.
- Token kind must match `hello.client` (host token ⇔ HOST) → FORBIDDEN.

**Example**

```json
{"t":"room.resume","seq":1,"d":{"room":"KQXM","token":"pT_8sK3n0Rf6MxYd2Wc9Oa1B"}}
```

### `room.resumed`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §17.7 |

Confirms the resume. The snapshot follows. The token stays the same.

| Field | Type | Required | Description |
|---|---|---|---|
| `room` | `RoomCode` | yes | Room code. |
| `kind` | `ConnKind` | yes | Membership that was resumed. |
| `id` | `string /^host$/ \| PlayerId \| SpectatorId` | yes | The literal "host" for the host, else a PlayerId or a SpectatorId. |
| `slot` | `int 1…10 \| null` | yes | Seat number for players; null otherwise. |
| `pendingPlayer` | `boolean` | yes | Spectators only: still waiting to be promoted. False otherwise. |
| `paused` | `boolean` | yes | True when the game is paused at the time of the resume. |

**Example**

```json
{"t":"room.resumed","seq":1,"d":{"room":"KQXM","kind":"PLAYER","id":"p3","slot":3,"pendingPlayer":false,"paused":false}}
```

### `room.state`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §3.1, §3.2, §17.4 |

Full membership snapshot. Sent in every snapshot and broadcast after any change to it: join, leave, kick, disconnect, reconnect, slot expiry, promotion, profile or preference change, veto use, pause change, host connect/disconnect. Roles are in `roles.state`, the phase in `phase.set`.

| Field | Type | Required | Description |
|---|---|---|---|
| `room` | `RoomCode` | yes | Room code. |
| `hostConnected` | `boolean` | yes | False while the host is away (the game is then paused). |
| `paused` | `boolean` | yes | True while the game is paused for any reason. |
| `players` | `PlayerInfo[] (0–10)` | yes | Players ordered by `slot`. |
| `spectatorCount` | `int 0…1000000` | yes | Connected spectators, including pending players. |
| `pendingPlayerCount` | `int 0…1000000` | yes | Spectators waiting to be promoted to player. |

**Example**

```json
{"t":"room.state","seq":1,"d":{"room":"KQXM","hostConnected":true,"paused":false,"players":[{"id":"p1","slot":1,"nickname":"Ada","avatar":{"suitId":"suit_white","patchId":"patch_orbit"},"connected":true,"slotExpiresAtMs":null,"vetoAvailable":true,"prefs":{"lang":"en","relaxed":false,"oneButton":false,"holdToToggle":false,"reducedMotion":false,"highContrast":false,"textScalePct":100,"screenReader":false,"haptics":true}},{"id":"p3","slot":3,"nickname":"Nova","avatar":{"suitId":"suit_orange","patchId":"patch_comet"},"connected":false,"slotExpiresAtMs":1794650180000,"vetoAvailable":false,"prefs":{"lang":"en","relaxed":false,"oneButton":false,"holdToToggle":false,"reducedMotion":false,"highContrast":false,"textScalePct":100,"screenReader":false,"haptics":true}}],"spectatorCount":4,"pendingPlayerCount":1}}
```

### `room.leave`

| | |
|---|---|
| Direction | client → server |
| Sent by | player, spectator |
| Delivered to | server only |
| Design | §3.1 |
| Rate limit | 1/s |

The member leaves for good. The slot is freed at once (no 3-minute hold), the token is revoked, the player's roles are redistributed, and the server answers `bye` LEFT.

_No fields: `d` is the empty object `{}`._

**Server validation** (after the common checks):

- None beyond the common rules.

**Example**

```json
{"t":"room.leave","seq":1,"d":{}}
```

### `room.kick`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §17.9, §13.3 |

The host removes a player. The player receives `bye` KICKED, the token is revoked, the slot is freed and the roles are redistributed. The person can join again with the room code.

| Field | Type | Required | Description |
|---|---|---|---|
| `playerId` | `PlayerId` | yes | Player to remove. |

**Server validation** (after the common checks):

- `playerId` is not a player of the room → UNKNOWN_PLAYER.

**Example**

```json
{"t":"room.kick","seq":1,"d":{"playerId":"p7"}}
```

### `room.close`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §17.7 |

The host ends the session. Every connection receives `bye` ROOM_CLOSED and all tokens are revoked.

_No fields: `d` is the empty object `{}`._

**Server validation** (after the common checks):

- None beyond the common rules.

**Example**

```json
{"t":"room.close","seq":1,"d":{}}
```

### `room.promoted`

| | |
|---|---|
| Direction | server → client |
| Sent by | server |
| Delivered to | one client chosen by the server |
| Design | §3.1 step 4 |

Tells a pending spectator that it is now a full player. Sent when a vote round opens (before the electorate is fixed) or a new mission starts, while a slot is free; pending players are promoted in join order. The token stays valid; the SpectatorId is retired. `room.state` and `roles.state` follow for everyone.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `PlayerId` | yes | The new PlayerId. |
| `slot` | `int 1…10` | yes | Seat number. |
| `roles` | `RoleId[] (0–10, unique)` | yes | Roles received through rebalancing (see Role rules); may be empty before roles lock. |

**Example**

```json
{"t":"room.promoted","seq":1,"d":{"id":"p6","slot":5,"roles":["PAYLOAD","RETRO"]}}
```

### `player.profile`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §3.1 step 2 |
| Rate limit | 1 per 2 s, burst 2 |

Changes the sender's nickname and avatar. The server broadcasts `room.state`.

| Field | Type | Required | Description |
|---|---|---|---|
| `nickname` | `string (2–32 chars)` | yes | Requested nickname, before server normalisation. |
| `avatar` | `Avatar` | yes | Requested avatar. |

**Server validation** (after the common checks):

- Phase is not LOBBY → WRONG_PHASE.
- Nickname rules as in `room.join` → BAD_PAYLOAD / NICK_REJECTED / NICK_TAKEN.

**Example**

```json
{"t":"player.profile","seq":1,"d":{"nickname":"Nova Prime","avatar":{"suitId":"suit_teal","patchId":"patch_comet"}}}
```

### `player.prefs`

| | |
|---|---|
| Direction | client → server |
| Sent by | player, spectator |
| Delivered to | server only |
| Design | §16 |
| Rate limit | 1/s, burst 2 |

Sets the sender's accessibility and language preferences at any time, including while paused. For players the server broadcasts `room.state` so the host can adapt (for example subtitles or text scale on shared prompts). Spectator preferences are stored but not broadcast.

| Field | Type | Required | Description |
|---|---|---|---|
| `prefs` | `PlayerPrefs` | yes | Complete preference set (all fields). |

**Server validation** (after the common checks):

- None beyond the common rules.

**Example**

```json
{"t":"player.prefs","seq":1,"d":{"prefs":{"lang":"en","relaxed":true,"oneButton":false,"holdToToggle":false,"reducedMotion":false,"highContrast":false,"textScalePct":150,"screenReader":false,"haptics":true}}}
```

<!-- group: Settings -->

**Settings**

### `settings.set`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §3.3, §4.1, §4.2, §9.3, §9.4, §13.7, §16 |

The host changes one or more room settings. Only the fields present change. The server broadcasts `settings.state`. Changes to timers and vote rules apply from the next vote round; a round already open keeps the values in its `vote.opened`.

| Field | Type | Required | Description |
|---|---|---|---|
| `settings` | `SettingsPatch` | yes | Fields to change. |

**Server validation** (after the common checks):

- `roleAssignMode` or `assistLevel` present while the phase is not LOBBY → SETTING_LOCKED (nothing is applied).
- Changing `roleAssignMode` clears lobby picks and FLIGHT votes.

**Example**

```json
{"t":"settings.set","seq":1,"d":{"settings":{"tallyVisibility":"HIDDEN","strictMajority":true,"audienceVoteWeight":1}}}
```

### `settings.state`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §3.3, §4.1, §4.2, §9.3, §13.7, §16 |

Complete current settings. Sent in every snapshot and after every accepted `settings.set`. This is how accessibility flags reach every device.

| Field | Type | Required | Description |
|---|---|---|---|
| `settings` | `RoomSettings` | yes | All settings. |

**Example**

```json
{"t":"settings.state","seq":1,"d":{"settings":{"roleAssignMode":"RANDOM","voteTimerS":20,"inspectTimerS":20,"tallyVisibility":"OPEN","strictMajority":false,"assistLevel":"ENGINEER","audienceVoteWeight":0,"pilotRotation":"PER_SEGMENT","pilotSelect":"ROTATION","passTheControls":false,"lang":"en","a11y":{"slowTimers":false,"relaxedMinigames":false,"reducedMotion":false,"highContrast":false,"subtitles":true,"explainTooltips":false}}}}
```

<!-- group: Roles and abilities -->

**Roles and abilities**

### `roles.pick`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §3.3 (player pick, first come) |
| Rate limit | 2/s, burst 4 |

PICK mode: the sender claims a role group, or releases the current claim with null. A player holds at most one group; claiming another releases the previous one. The server broadcasts `roles.state`.

| Field | Type | Required | Description |
|---|---|---|---|
| `lead` | `RoleId \| null` | yes | Lead role of the group to claim (see `roles.state.groups[].lead`), or null to release. |

**Server validation** (after the common checks):

- `settings.roleAssignMode` ≠ PICK, or roles locked → WRONG_PHASE.
- `lead` is not the lead of a current group → BAD_PAYLOAD.
- Group already held by another player → ROLE_TAKEN.

**Example**

```json
{"t":"roles.pick","seq":1,"d":{"lead":"GUIDO"}}
```

### `roles.vote`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §3.3 (vote) |
| Rate limit | 2/s, burst 4 |

VOTE mode: the sender votes for the player who should be Flight Director. Sending again changes the vote. A player may vote for themself. The server broadcasts `roles.state`.

| Field | Type | Required | Description |
|---|---|---|---|
| `playerId` | `PlayerId` | yes | Candidate for the FLIGHT group. |

**Server validation** (after the common checks):

- `settings.roleAssignMode` ≠ VOTE, or roles locked → WRONG_PHASE.
- `playerId` is not a player of the room → UNKNOWN_PLAYER.

**Example**

```json
{"t":"roles.vote","seq":1,"d":{"playerId":"p1"}}
```

### `roles.lock`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §3.3, §3.2 |

The host finalises role assignment in the lobby. The server computes the role groups for the current player count, completes the assignment for the active mode (see Role rules), sets `locked = true` and broadcasts `roles.state`. If the host never sends it, the server does the same automatically when the phase leaves LOBBY.

_No fields: `d` is the empty object `{}`._

**Server validation** (after the common checks):

- Phase is not LOBBY → WRONG_PHASE.
- No players in the room → WRONG_PHASE.

**Example**

```json
{"t":"roles.lock","seq":1,"d":{}}
```

### `roles.set`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §3.3, §13.3 Classroom |

The host assigns roles explicitly (teacher override, manual fix after players leave). Allowed in any phase. Sets `locked = true`. Spent abilities stay spent because they are tracked per role.

| Field | Type | Required | Description |
|---|---|---|---|
| `assignments` | `object[] (1–10)` | yes | One entry per player who receives roles. |
| `assignments[].playerId` | `PlayerId` | yes | Player. |
| `assignments[].roles` | `RoleId[] (0–10, unique)` | yes | Roles for that player; may be empty. |

**Server validation** (after the common checks):

- Any `playerId` not a player of the room, or listed twice → UNKNOWN_PLAYER / INVALID_ASSIGNMENT.
- The union of all `roles` is not exactly the ten roles, or a role appears twice → INVALID_ASSIGNMENT.

**Example**

```json
{"t":"roles.set","seq":1,"d":{"assignments":[{"playerId":"p1","roles":["FLIGHT","PM","BOOSTER","STRUCT","GUIDO"]},{"playerId":"p2","roles":["FIDO","EECOM","INCO","PAYLOAD","RETRO"]}]}}
```

### `roles.rotate`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §3.3 ("Roles rotate between missions in Campaign mode") |

Campaign rotation between missions. The server recomputes the role groups for the current player count and gives group *i* (table order) to the player who is next in slot order after the previous holder of group *i*; with unchanged membership every player moves on by one group. Sets `locked = true` and broadcasts `roles.state`.

_No fields: `d` is the empty object `{}`._

**Server validation** (after the common checks):

- Phase is not LOBBY or CAMPAIGN_HUB → WRONG_PHASE.

**Example**

```json
{"t":"roles.rotate","seq":1,"d":{}}
```

### `roles.state`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §3.2, §3.3 |

Complete role assignment. Sent in every snapshot and after every change (pick, vote, lock, set, rotate, rebalance after a leave or a promotion, ability spent, new mission). `groups` always covers all ten roles exactly once.

| Field | Type | Required | Description |
|---|---|---|---|
| `mode` | `RoleAssignMode` | yes | Active assignment mode. |
| `locked` | `boolean` | yes | False in the lobby until roles are locked; true afterwards. |
| `groups` | `RoleGroup[] (1–10)` | yes | Role groups for the current player count, in table order. |
| `flightVotes` | `object[] (0–10)` | yes | VOTE mode before lock: current votes per candidate (candidates with at least one vote). Empty otherwise. |
| `flightVotes[].playerId` | `PlayerId` | yes | Candidate. |
| `flightVotes[].n` | `int 0…10` | yes | Votes received. |
| `abilitiesUsed` | `RoleId[] (0–10, unique)` | yes | Roles whose once-per-mission ability is spent in the current mission. |

**Example**

```json
{"t":"roles.state","seq":1,"d":{"mode":"RANDOM","locked":true,"groups":[{"lead":"FLIGHT","roles":["FLIGHT","PM"],"playerId":"p1"},{"lead":"BOOSTER","roles":["BOOSTER","STRUCT"],"playerId":"p2"},{"lead":"GUIDO","roles":["GUIDO","FIDO"],"playerId":"p3"},{"lead":"EECOM","roles":["EECOM","INCO","PAYLOAD","RETRO"],"playerId":"p4"}],"flightVotes":[],"abilitiesUsed":["BOOSTER"]}}
```

### `ability.use`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §3.3 (once-per-mission ability), §4.2 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 1/s, burst 2 |

The holder of a role uses its once-per-mission ability. FLIGHT (Decision Time) is resolved by the server: it ends the current VOTE or RUNOFF stage at once, or, during a tie-break, makes `optionId` win. Every other ability changes the simulation, so the server asks the host with `ability.requested` and spends the ability only when the host accepts. On success everyone receives `ability.used`.

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `RoleId` | yes | Role whose ability is used. |
| `roundId` | `RoundId` | no | FLIGHT only, required: the active vote round. |
| `optionId` | `OptionId` | no | FLIGHT only. Required during TIEBREAK_TRIVIA / TIEBREAK_PICK (must be a tied option; it wins). Optional during VOTE / RUNOFF: if the close produces a tie that includes it, it wins. |
| `stageIndex` | `int 1…4` | no | STRUCT only, required: stage to reinforce (1 = first stage, 2 = upper stage, …). |

**Server validation** (after the common checks):

- Sender does not hold `role` → NOT_ROLE_HOLDER.
- Ability already spent this mission, or a request for it is pending at the host → ABILITY_USED.
- FLIGHT: `roundId` missing → BAD_PAYLOAD; not the active round → STALE_ID; stage not VOTE, RUNOFF, TIEBREAK_TRIVIA or TIEBREAK_PICK → WRONG_STAGE; `optionId` missing in a tie-break stage → BAD_PAYLOAD; `optionId` not a current candidate → UNKNOWN_OPTION.
- STRUCT without `stageIndex` → BAD_PAYLOAD.
- PM: allowed; the host decides. (Emergency Funding is also spent automatically when an over-budget option wins.)
- Other roles: phase is LOBBY, DEBRIEF or CAMPAIGN_HUB → WRONG_PHASE.
- Host later declines → ABILITY_REJECTED with `re` = this message's `seq`.

**Example**

```json
{"t":"ability.use","seq":1,"d":{"role":"FLIGHT","roundId":"m1.r07","optionId":"eng_kerolox_workhorse"}}
```

### `ability.requested`

| | |
|---|---|
| Direction | server → host |
| Sent by | server |
| Delivered to | host only |
| Design | §3.3 |

Asks the host to apply a simulation ability (every role except FLIGHT). The host must answer `ability.resolve` within 5 s; no answer, or a host disconnect before the answer, counts as declined with reason NOT_APPLICABLE.

| Field | Type | Required | Description |
|---|---|---|---|
| `requestId` | `RequestId` | yes | Server-chosen id to quote in `ability.resolve`. |
| `playerId` | `PlayerId` | yes | Player who used the ability. |
| `role` | `RoleId` | yes | Role whose ability is requested (never FLIGHT). |
| `stageIndex` | `int 1…4 \| null` | yes | STRUCT: stage to reinforce; null for other roles. |

**Example**

```json
{"t":"ability.requested","seq":1,"d":{"requestId":"ab.4","playerId":"p2","role":"STRUCT","stageIndex":1}}
```

### `ability.resolve`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §3.3 |

The host accepts or declines an `ability.requested`. On accept the server marks the ability spent and broadcasts `ability.used` and `roles.state`; on decline it sends `error` ABILITY_REJECTED to the player and the ability stays available.

| Field | Type | Required | Description |
|---|---|---|---|
| `requestId` | `RequestId` | yes | Id from `ability.requested`. |
| `accepted` | `boolean` | yes | True when the host applied the ability effect. |
| `reason` | `AbilityRejectReason \| null` | yes | Why it was declined; null when accepted. |

**Server validation** (after the common checks):

- Unknown or already answered `requestId` → STALE_ID.

**Example**

```json
{"t":"ability.resolve","seq":1,"d":{"requestId":"ab.4","accepted":true,"reason":null}}
```

### `ability.consume`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §6.8 (Budget Cut → "use Emergency Funding") |

The host spends a role ability through a game event, without a player request. The server marks it spent and broadcasts `ability.used` (trigger HOST) and `roles.state`.

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `RoleId` | yes | Role whose ability is spent. |
| `reason` | `AbilityConsumeReason` | yes | What spent it. |

**Server validation** (after the common checks):

- Ability already spent → ABILITY_USED.

**Example**

```json
{"t":"ability.consume","seq":1,"d":{"role":"PM","reason":"ANOMALY_RESPONSE"}}
```

### `ability.used`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §3.3, §4.2 Affordability |
| Flags | outcome log |

Announces that a role ability is now spent for this mission. An outcome-log message: the host applies its effect (for trigger OVER_BUDGET_WIN the host adds the +10 % budget).

| Field | Type | Required | Description |
|---|---|---|---|
| `outcomeSeq` | `OutcomeSeq` | yes | Position in the room outcome log. |
| `role` | `RoleId` | yes | Role whose ability was spent. |
| `playerId` | `PlayerId \| null` | yes | Current holder of the role; null if nobody holds it. |
| `trigger` | `AbilityTrigger` | yes | What spent it. |
| `roundId` | `RoundId \| null` | yes | Vote round concerned (FLIGHT Decision Time, PM over-budget win); null otherwise. |
| `stageIndex` | `int 1…4 \| null` | yes | STRUCT Reinforce: stage; null otherwise. |

**Example**

```json
{"t":"ability.used","seq":1,"d":{"outcomeSeq":9,"role":"PM","playerId":"p1","trigger":"OVER_BUDGET_WIN","roundId":"m1.r07","stageIndex":null}}
```

<!-- group: Phase and game flow -->

**Phase and game flow**

### `phase.set`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §17.3, §2.1, §9.1, §9.4 |
| Flags | sticky (single) |

The host announces the current position in the game state machine. The server checks the transition against the phase graph, stores the message, applies the server-side effects of the phase (join rules, role lock, new-mission reset) and relays it unchanged. Sent on every change of any field.

| Field | Type | Required | Description |
|---|---|---|---|
| `missionSeq` | `int 0…100000` | yes | Mission counter. 0 before the first mission. The host increases it by 1 when a new mission or a retry starts; the server then performs the new-mission reset. |
| `mode` | `GameMode` | yes | Game mode, for client UI. |
| `phase` | `Phase` | yes | Top-level phase. |
| `sub` | `SubPhase` | yes | Sub-state; NONE when the phase has none. |
| `review` | `ReviewId \| null` | yes | PDR or CDR when `sub` = REVIEW; FRR when `phase` = FRR; null otherwise. |
| `flightPhase` | `FlightPhase \| null` | yes | F0 or F1 in COUNTDOWN, F2–F13 in FLIGHT, null otherwise. |
| `segment` | `FlightSegment \| null` | yes | Flight segment in FLIGHT; null otherwise. |
| `boosterTrack` | `boolean` | yes | True while the parallel booster-return track F7b is running. |
| `contractId` | `DataId \| null` | yes | Chosen contract; null until one is chosen. |
| `step` | `object \| null` | yes | Build progress for the phase tracker; null outside BUILD. |
| `step.index` | `int 1…99` | yes | Current build step, 1-based. |
| `step.total` | `int 1…99` | yes | Planned number of build steps. |

**Server validation** (after the common checks):

- `phase` change not in the phase graph → INVALID_TRANSITION.
- `sub`, `review`, `flightPhase` or `segment` not allowed for `phase` (see Phase rules) → INVALID_TRANSITION.
- `missionSeq` lower than the last one → INVALID_TRANSITION.
- A change of `phase` cancels an active vote round (`vote.cancelled` PHASE_CHANGE) and an active poll.

**Example**

```json
{"t":"phase.set","seq":1,"d":{"missionSeq":1,"mode":"QUICK","phase":"BUILD","sub":"VOTE_ROUND","review":null,"flightPhase":null,"segment":null,"boosterTrack":false,"contractId":"C1","step":{"index":7,"total":18}}}
```

### `game.pause`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §9.2 (Pause, host only), §13.3 Classroom |

The host pauses the game. The server freezes every server timer and slot-hold countdown and broadcasts `game.paused`.

_No fields: `d` is the empty object `{}`._

**Server validation** (after the common checks):

- Already paused → ignored (no error, no broadcast).

**Example**

```json
{"t":"game.pause","seq":1,"d":{}}
```

### `game.paused`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §17.7, §9.2 |

The game is paused. While paused: all server timers and slot-hold countdowns are frozen, phones freeze local minigame clocks, and the server rejects pause-blocked messages with PAUSED. Sent on `game.pause`, when the host connection drops, and in snapshots taken while paused.

| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | `PauseReason` | yes | Why the game is paused. HOST_DISCONNECTED takes precedence when both apply. |
| `atMs` | `TimeMs` | yes | Server clock when the pause began. |
| `roomExpiresAtMs` | `TimeMs \| null` | yes | HOST_DISCONNECTED: when the room is destroyed if the host does not return (pause start + 10 min); null for HOST_REQUEST. |

**Example**

```json
{"t":"game.paused","seq":1,"d":{"reason":"HOST_DISCONNECTED","atMs":1794650400000,"roomExpiresAtMs":1794651000000}}
```

### `game.resume`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §9.2, §17.7 |

The host resumes the game. Required after `game.pause` and also after a host reconnect: the room stays paused after `room.resumed` until the host, having restored its state, sends this.

_No fields: `d` is the empty object `{}`._

**Server validation** (after the common checks):

- Not paused → ignored (no error, no broadcast).

**Example**

```json
{"t":"game.resume","seq":1,"d":{}}
```

### `game.resumed`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §17.7 |

The game continues. Every deadline issued before the pause (`…AtMs` fields of `vote.stage`, `poll.call`, `mg.start`, `console.alert` windows, `blackout.set`, `room.state.players[].slotExpiresAtMs`) moves later by `pausedForMs`; receivers shift their local copies and the server does not resend them.

| Field | Type | Required | Description |
|---|---|---|---|
| `atMs` | `TimeMs` | yes | Server clock when the game resumed. |
| `pausedForMs` | `int 0…2147483647` | yes | Length of the pause in milliseconds. |

**Example**

```json
{"t":"game.resumed","seq":1,"d":{"atMs":1794650460000,"pausedForMs":60000}}
```

### `notice.show`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | players listed in `d.to`; all players and spectators when `d.to` is null |
| Design | §12.2, §13.3, §16, §3.2 (solo hint) |

The host shows a short text on phones: CAPCOM subtitle, hint, "what just happened" summary, classroom discussion prompt, fact moment or warning. Text is always a string-table reference.

| Field | Type | Required | Description |
|---|---|---|---|
| `kind` | `NoticeKind` | yes | What kind of notice. |
| `text` | `TextRef` | yes | Text to show (≤ 25 words on screen, §12.1). |
| `factId` | `DataId \| null` | yes | Fact shown (kind FACT), so the phone can link to the Codex; null otherwise. |
| `durationMs` | `int 0…60000` | yes | How long to show it; 0 = until dismissed by the user. |
| `to` | `PlayerId[] (1–10, unique) \| null` | yes | Players to show it to; null = every player and spectator. |

**Server validation** (after the common checks):

- A `to` entry that is not a player → UNKNOWN_PLAYER (nothing is relayed).

**Example**

```json
{"t":"notice.show","seq":1,"d":{"kind":"FACT","text":{"key":"fact.F12.short"},"factId":"F12","durationMs":6000,"to":null}}
```

### `build.state`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §6.1, §6.3, §6.4, §6.9, §6.11 |
| Flags | sticky (single) |

Current build as computed by the host: chosen parts, Readiness Dashboard, budget, schedule and open validation issues. Sent after every commit, test, anomaly resolution and rework. Phones show it on the "our rocket" and design-review screens; they never recompute it.

| Field | Type | Required | Description |
|---|---|---|---|
| `contractId` | `DataId` | yes | Contract being built for. |
| `parts` | `object[] (0–40)` | yes | Parts committed so far, in vote order. |
| `parts[].category` | `DataId` | yes | Part category id (e.g. "first_stage_engine"). |
| `parts[].partId` | `DataId` | yes | Chosen part id. |
| `parts[].count` | `int 1…99` | yes | Quantity (engine count, redundancy level); 1 when not applicable. |
| `metrics` | `object[] (0–14)` | yes | Readiness Dashboard values. |
| `metrics[].metric` | `MetricId` | yes | Metric (unit in the id). |
| `metrics[].value` | `number` | yes | Current value. |
| `metrics[].required` | `number \| null` | yes | Contract requirement or limit for this metric, same unit; null when none. |
| `metrics[].rating` | `Rating` | yes | Colour class. |
| `budgetTotalM` | `number ≥ 0` | yes | Contract budget in $M (game value), including Emergency Funding once triggered. |
| `budgetSpentM` | `number ≥ 0` | yes | Spent so far in $M (game value). |
| `scheduleLimitDays` | `number ≥ 0` | yes | Contract deadline in days (game value). |
| `scheduleUsedDays` | `number ≥ 0` | yes | Schedule used so far in days (game value). |
| `issues` | `object[] (0–20)` | yes | Open validation issues, most severe first. |
| `issues[].ruleId` | `DataId` | yes | Validation rule id (§6.11). |
| `issues[].severity` | `Severity` | yes | Severity. |
| `issues[].text` | `TextRef` | yes | Explanation shown to players. |

**Example**

```json
{"t":"build.state","seq":1,"d":{"contractId":"C1","parts":[{"category":"launch_site","partId":"site_west_polar","count":1},{"category":"upper_stage_engine","partId":"eng_kerolox_vacuum","count":1}],"metrics":[{"metric":"TOTAL_DV_MS","value":9890,"required":9700,"rating":"MARGINAL"},{"metric":"LIFTOFF_TWR","value":1.35,"required":1,"rating":"GOOD"}],"budgetTotalM":90,"budgetSpentM":41.6,"scheduleLimitDays":180,"scheduleUsedDays":96,"issues":[{"ruleId":"dv_margin_low","severity":"MAJOR","text":{"key":"rule.dv_margin_low","args":{"marginPct":2}}}]}}
```

### `build.event`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §6.6, §6.8, §6.9, §9.9 |

One build-phase event for the phone feed: a test result, a revealed flaw, a drawn anomaly card, a review opening or passing, a rework, a deadline slip, a Lessons Learned bonus. The decision itself, if any, is a separate vote.

| Field | Type | Required | Description |
|---|---|---|---|
| `kind` | `BuildEventKind` | yes | What happened. |
| `subjectId` | `DataId \| null` | yes | Test id, anomaly card id, review id, part category id or lesson id; null when none. |
| `text` | `TextRef` | yes | One-line description. |
| `deltas` | `Delta[] (0–16)` | yes | Dashboard changes caused by the event; empty when none. |
| `factId` | `DataId \| null` | yes | Related fact to show; null when none. |

**Example**

```json
{"t":"build.event","seq":1,"d":{"kind":"FLAW_FOUND","subjectId":"test_thermal_vacuum","text":{"key":"test.thermal_vacuum.flaw_heater"},"deltas":[{"metric":"COST_M","value":42.6,"delta":1,"rating":"BAD"}],"factId":null}}
```

### `flight.event`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §9.1 (possible events, fact moments), §8.4, §9.8 |

One flight event for the phone feed: lift-off, Max Q, staging, engine-out, abort, touchdown and so on, with its fact moment.

| Field | Type | Required | Description |
|---|---|---|---|
| `eventId` | `DataId` | yes | Event id from the game data (e.g. "engine_out", "meco"). |
| `flightPhase` | `FlightPhase` | yes | Flight phase in which it happened. |
| `metS` | `number` | yes | Mission elapsed time in seconds (negative before lift-off). |
| `severity` | `EventSeverity` | yes | Severity. |
| `text` | `TextRef` | yes | One-line description. |
| `factId` | `DataId \| null` | yes | Fact moment to show; null when none. |

**Example**

```json
{"t":"flight.event","seq":1,"d":{"eventId":"max_q","flightPhase":"F4","metS":62.4,"severity":"INFO","text":{"key":"event.max_q"},"factId":"F09"}}
```

### `flight.hud`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §9.6 (HUD), §13.7 (spectators see the host view) |
| Flags | droppable |

Compact copy of the host HUD for every phone header and for spectators. At most 5 Hz. Not sent during a blackout.

| Field | Type | Required | Description |
|---|---|---|---|
| `metS` | `number` | yes | Mission elapsed time, s (negative before lift-off). |
| `altitudeKm` | `number` | yes | Altitude above the surface, km. |
| `velocityMs` | `number ≥ 0` | yes | Speed, m/s (surface-relative below 70 km, orbital above). |
| `verticalSpeedMs` | `number` | yes | Vertical speed, m/s (positive up). |
| `qKpa` | `number ≥ 0` | yes | Dynamic pressure, kPa. |
| `gLoad` | `number` | yes | Acceleration felt, in g. |
| `throttlePct` | `number 0…100` | yes | Throttle, percent. |
| `propellantPct` | `number 0…100` | yes | Propellant left in the active stage, percent. |
| `dvRemainingMs` | `number ≥ 0` | yes | Δv remaining in the vehicle, m/s. |
| `apoapsisKm` | `number \| null` | yes | Apoapsis altitude, km; null when not defined. |
| `periapsisKm` | `number \| null` | yes | Periapsis altitude, km; null when not defined. |
| `heatLoadPct` | `number ≥ 0` | yes | Heat load as percent of heat-shield capacity. |
| `warp` | `number 0…1000` | yes | Simulation time factor: 0.1 during minigame bullet-time, 1 normal, up to 1000 in coasts (§9.7, §10.1). |

**Example**

```json
{"t":"flight.hud","seq":1,"d":{"metS":62.4,"altitudeKm":12.8,"velocityMs":468,"verticalSpeedMs":310,"qKpa":31.2,"gLoad":1.9,"throttlePct":72,"propellantPct":61.5,"dvRemainingMs":8120,"apoapsisKm":38.4,"periapsisKm":null,"heatLoadPct":0,"warp":1}}
```

<!-- group: Votes -->

**Votes**

### `vote.open`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §4.1, §4.2, §4.3, §6.6, §6.8, §6.9, §9.4, §9.8, §11.2, §14.3 |
| Flags | rejected with PAUSED while the game is paused |

The host opens a vote round of any kind and hands the server everything needed to run and resolve it without the host: options with host-computed "if chosen" numbers and flags, the role area, the optional Predict question and trivia tie-break question with their answers, and the seed of the coin flip. The server promotes pending players, fixes the electorate, builds the stage plan for `kind` (see Vote profiles) and broadcasts `vote.opened` then `vote.stage`. Answers, the default option and the coin seed are never forwarded to phones.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | New round id, never used before in this room. |
| `kind` | `VoteKind` | yes | Vote kind; selects the profile. |
| `subjectId` | `DataId \| null` | yes | What is being decided: part category id (PART), test id (TEST), anomaly card id (ANOMALY), review id (REVIEW, REWORK_CATEGORY), abort mode id (ABORT), decision id (FLIGHT_DECISION), flight segment (PILOT); null for CONTRACT, LIVERY, PATCH, MCM. |
| `title` | `TextRef` | yes | Title shown on every device (category name, card title, question). |
| `why` | `TextRef \| null` | yes | One sentence on why it matters (§4.1 step 1); null when none. |
| `ownerRoles` | `RoleId[] (0–3, unique)` | yes | Roles whose area this is, most relevant first. Their holders may tag options, receive `vote.insight`, and their Recommended tag decides an all-abstain round. Empty when no role owns it. |
| `options` | `VoteOption[] (2–10)` | yes | Options in display order, unique ids. PART: 3–5 (§6.2). Quick kinds: 2–3. |
| `defaultOptionId` | `OptionId \| null` | yes | Option that wins when nobody votes and no Recommended tag applies (e.g. SKIP, CONTINUE, PASS). Must be null for PART so that the cheapest option wins (§4.2 Abstain). |
| `hint` | `object \| null` | yes | Solo hint (§3.2, §4.2 Solo play); null in multiplayer. |
| `hint.optionId` | `OptionId` | yes | Option the AI Flight Director suggests. |
| `hint.reason` | `TextRef` | yes | Reason shown with the hint. |
| `predict` | `Question \| null` | yes | Predict question (§4.1 step 4, about 1 round in 3); null for none. PART only. |
| `trivia` | `Question \| null` | yes | Trivia sudden-death question used if the vote ties (§4.2 tie-breaker 2); null to skip straight to the coin flip. Its `id` is a fact id. |
| `coinSeed` | `Uint32` | yes | Seed of the visible coin flip, drawn by the host from its `tiebreak` random stream (§17.6). Winner = tied options in display order, index `coinSeed mod count`. |
| `timers` | `VoteTimers \| null` | yes | Stage duration overrides; null for profile defaults. |

**Server validation** (after the common checks):

- Phase is LOBBY → WRONG_PHASE.
- Another vote round or a poll is active (stage not CLOSED) → ROUND_ACTIVE.
- `roundId` used before → DUPLICATE_ID.
- Duplicate option ids; `defaultOptionId`, `hint.optionId` not an option; `predict`/`trivia` with `correctIndex` ≥ number of choices; `predict` on a kind other than PART; PILOT option id that is not a PlayerId of the room → BAD_PAYLOAD.
- No winnable option (see Winnable) → NO_WINNABLE_OPTION.

**Example**

```json
{"t":"vote.open","seq":1,"d":{"roundId":"m1.r07","kind":"PART","subjectId":"first_stage_engine","title":{"key":"category.first_stage_engine.name"},"why":{"key":"category.first_stage_engine.why"},"ownerRoles":["BOOSTER"],"options":[{"id":"eng_kerolox_workhorse","partId":"eng_kerolox_workhorse","label":null,"costM":10.8,"afford":"OK","overBudgetByM":0,"overScheduleByDays":0,"willNotFly":false,"fixExists":false,"warnings":[],"deltas":[{"metric":"TOTAL_DV_MS","value":9890,"delta":420,"rating":"GOOD"},{"metric":"LIFTOFF_TWR","value":1.31,"delta":1.31,"rating":"GOOD"},{"metric":"COST_M","value":52.4,"delta":10.8,"rating":"NEUTRAL"},{"metric":"SCHEDULE_DAYS","value":98,"delta":2,"rating":"NEUTRAL"}]},{"id":"eng_electric_mini","partId":"eng_electric_mini","label":null,"costM":6.3,"afford":"OK","overBudgetByM":0,"overScheduleByDays":0,"willNotFly":true,"fixExists":false,"warnings":[{"key":"rule.twr_below_one"}],"deltas":[{"metric":"LIFTOFF_TWR","value":0.74,"delta":0.74,"rating":"BAD"}]},{"id":"eng_methalox_reusable","partId":"eng_methalox_reusable","label":null,"costM":44.1,"afford":"EMERGENCY_FUNDING","overBudgetByM":3.5,"overScheduleByDays":0,"willNotFly":false,"fixExists":false,"warnings":[],"deltas":[{"metric":"TOTAL_DV_MS","value":10140,"delta":670,"rating":"GOOD"},{"metric":"BUDGET_LEFT_M","value":-3.5,"delta":-44.1,"rating":"BAD"}]}],"defaultOptionId":null,"hint":null,"predict":{"id":"pq_vacuum_isp","prompt":{"key":"predict.most_efficient_vacuum"},"choices":[{"key":"part.eng_kerolox_workhorse.name"},{"key":"part.eng_electric_mini.name"},{"key":"part.eng_methalox_reusable.name"}],"correctIndex":2},"trivia":{"id":"F05","prompt":{"key":"trivia.F05.prompt"},"choices":[{"key":"trivia.F05.a"},{"key":"trivia.F05.b"},{"key":"trivia.F05.c"}],"correctIndex":1},"coinSeed":2891336453,"timers":null}}
```

### `vote.opened`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.1 steps 1–2, §14.3 |

Public description of the round for every device, including the host as confirmation. Contains the options with their "if chosen" numbers, the electorate, the rules in force and the stage plan. `vote.stage` follows immediately.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `kind` | `VoteKind` | yes | Vote kind. |
| `subjectId` | `DataId \| null` | yes | As in `vote.open`. |
| `title` | `TextRef` | yes | Title. |
| `why` | `TextRef \| null` | yes | Why it matters; null when none. |
| `ownerRoles` | `RoleId[] (0–3, unique)` | yes | Roles whose holders may tag options. |
| `options` | `VoteOption[] (2–10)` | yes | Options in display order. |
| `hint` | `object \| null` | yes | Solo hint; null in multiplayer. |
| `hint.optionId` | `OptionId` | yes | Suggested option. |
| `hint.reason` | `TextRef` | yes | Reason shown with the hint. |
| `predict` | `QuestionPublic \| null` | yes | Predict question without its answer; null for none. |
| `voters` | `PlayerId[] (0–10, unique)` | yes | Electorate: every player in the room when the round opened, connected or not. Fixed for the round, except that players who leave or are kicked are removed. |
| `solo` | `boolean` | yes | True when the room has exactly one player: no INSPECT stage, untimed VOTE, first ballot decides (§4.2 Solo play). |
| `vetoAllowed` | `boolean` | yes | True when this kind allows vetoes (PART). |
| `tagsAllowed` | `boolean` | yes | True when this kind allows role tags (PART). |
| `strictMajority` | `boolean` | yes | True when a runoff is possible in this round (setting on and kind is PART or CHOICE profile). |
| `tallyVisibility` | `TallyVisibility` | yes | Tally visibility in force for this round. |
| `audienceVoteWeight` | `int 0…1` | yes | Audience weight in force for this round. |
| `plan` | `StagePlan[] (1–9)` | yes | Stages that will run in order, with planned durations. Conditional stages (RUNOFF, TIEBREAK_TRIVIA, TIEBREAK_PICK) are not listed; they are announced by `vote.stage` if they happen. |

**Example**

```json
{"t":"vote.opened","seq":1,"d":{"roundId":"m1.r07","kind":"PART","subjectId":"first_stage_engine","title":{"key":"category.first_stage_engine.name"},"why":{"key":"category.first_stage_engine.why"},"ownerRoles":["BOOSTER"],"options":[{"id":"eng_kerolox_workhorse","partId":"eng_kerolox_workhorse","label":null,"costM":10.8,"afford":"OK","overBudgetByM":0,"overScheduleByDays":0,"willNotFly":false,"fixExists":false,"warnings":[],"deltas":[{"metric":"TOTAL_DV_MS","value":9890,"delta":420,"rating":"GOOD"},{"metric":"LIFTOFF_TWR","value":1.31,"delta":1.31,"rating":"GOOD"},{"metric":"COST_M","value":52.4,"delta":10.8,"rating":"NEUTRAL"},{"metric":"SCHEDULE_DAYS","value":98,"delta":2,"rating":"NEUTRAL"}]},{"id":"eng_electric_mini","partId":"eng_electric_mini","label":null,"costM":6.3,"afford":"OK","overBudgetByM":0,"overScheduleByDays":0,"willNotFly":true,"fixExists":false,"warnings":[{"key":"rule.twr_below_one"}],"deltas":[{"metric":"LIFTOFF_TWR","value":0.74,"delta":0.74,"rating":"BAD"}]},{"id":"eng_methalox_reusable","partId":"eng_methalox_reusable","label":null,"costM":44.1,"afford":"EMERGENCY_FUNDING","overBudgetByM":3.5,"overScheduleByDays":0,"willNotFly":false,"fixExists":false,"warnings":[],"deltas":[{"metric":"TOTAL_DV_MS","value":10140,"delta":670,"rating":"GOOD"},{"metric":"BUDGET_LEFT_M","value":-3.5,"delta":-44.1,"rating":"BAD"}]}],"hint":null,"predict":{"id":"pq_vacuum_isp","prompt":{"key":"predict.most_efficient_vacuum"},"choices":[{"key":"part.eng_kerolox_workhorse.name"},{"key":"part.eng_electric_mini.name"},{"key":"part.eng_methalox_reusable.name"}]},"voters":["p1","p2","p3","p4"],"solo":false,"vetoAllowed":true,"tagsAllowed":true,"strictMajority":false,"tallyVisibility":"OPEN","audienceVoteWeight":0,"plan":[{"stage":"REVEAL","durationMs":3000},{"stage":"PREDICT","durationMs":8000},{"stage":"INSPECT","durationMs":20000},{"stage":"VOTE","durationMs":20000},{"stage":"RESULT","durationMs":3000}]}}
```

### `vote.stage`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.1 (steps and durations), §4.2 (runoff, tie-breakers) |

The round entered a stage. The server is the only clock for vote stages. CLOSED ends the round: after it the host may open the next vote.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `stage` | `VoteStage` | yes | Stage that just began. |
| `startedAtMs` | `TimeMs` | yes | Server clock when the stage began. |
| `endsAtMs` | `TimeMs \| null` | yes | Server clock when the stage ends; null for untimed stages (solo VOTE, CLOSED). A stage can end earlier (early close, Decision Time, host close, trivia answered). |
| `candidateIds` | `OptionId[] (0–10, unique)` | yes | Options that can be chosen in this stage: all winnable options (VOTE), the two runoff options (RUNOFF), the tied options (TIEBREAK_TRIVIA, TIEBREAK_PICK). For REVEAL, PREDICT, INSPECT, RESULT and CLOSED: all options not vetoed. |
| `pickerId` | `PlayerId \| null` | yes | TIEBREAK_PICK only: the trivia winner who must send `vote.trivia.pick`; null otherwise. |

**Example**

```json
{"t":"vote.stage","seq":1,"d":{"roundId":"m1.r07","stage":"VOTE","startedAtMs":1794650031000,"endsAtMs":1794650051000,"candidateIds":["eng_kerolox_workhorse","eng_methalox_reusable"],"pickerId":null}}
```

### `vote.insight`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | player(s) holding `d.role` |
| Design | §3.3 (Insight during Build), §4.1 step 3 |
| Flags | sticky (per role, until the round closes) |

Extra information for the holder of one role about the options of the current round (for example reliability ranges for BOOSTER). Computed by the host and delivered only to the player(s) holding `role`. Send it right after `vote.opened`.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `role` | `RoleId` | yes | Role whose holder receives the insight (routing key). |
| `lines` | `object[] (1–20)` | yes | Insight lines. |
| `lines[].optionId` | `OptionId` | yes | Option the line is about. |
| `lines[].text` | `TextRef` | yes | Insight line with its numbers in `args`. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.
- An `optionId` that is not an option of the round → UNKNOWN_OPTION.

**Example**

```json
{"t":"vote.insight","seq":1,"d":{"roundId":"m1.r07","role":"BOOSTER","lines":[{"optionId":"eng_kerolox_workhorse","text":{"key":"insight.reliability_range","args":{"lowPct":97.5,"highPct":99.5}}}]}}
```

### `vote.predict`

| | |
|---|---|
| Direction | client → server |
| Sent by | player, spectator |
| Delivered to | server only |
| Design | §4.1 step 4, §12.2 Predict-before-vote, §13.7 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 2/s, burst 4 |

The sender's answer to the Predict question. The first answer is final ("commit to a prediction"). Spectator answers only feed the audience histogram.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `choiceIndex` | `int 0…3` | yes | Zero-based index into `vote.opened.predict.choices`. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.
- Stage is not PREDICT → WRONG_STAGE.
- `choiceIndex` ≥ number of choices → BAD_PAYLOAD.
- Sender already answered → ALREADY_ANSWERED.
- Player not in `voters` → NOT_A_VOTER.

**Example**

```json
{"t":"vote.predict","seq":1,"d":{"roundId":"m1.r07","choiceIndex":2}}
```

### `vote.predict.result`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.1 step 4, §11.3 (correct predictions 50 each) |
| Flags | outcome log |

Sent when the PREDICT stage ends: the correct answer and who got it right. An outcome-log message: the host awards Knowledge Points (50 per correct prediction) and announces them with `kp.awarded`. The PREDICT stage ends early when every connected voter has answered.

| Field | Type | Required | Description |
|---|---|---|---|
| `outcomeSeq` | `OutcomeSeq` | yes | Position in the room outcome log. |
| `roundId` | `RoundId` | yes | Round id. |
| `correctIndex` | `int 0…3` | yes | Index of the correct choice. |
| `results` | `object[] (0–10)` | yes | One entry per voter. |
| `results[].playerId` | `PlayerId` | yes | Voter. |
| `results[].choiceIndex` | `int 0…3 \| null` | yes | Their answer; null when they did not answer. |
| `results[].correct` | `boolean` | yes | True when the answer is correct. |
| `audienceCounts` | `(int 0…1000000)[] (2–4)` | yes | Spectator answers per choice, in choice order. |

**Example**

```json
{"t":"vote.predict.result","seq":1,"d":{"outcomeSeq":7,"roundId":"m1.r07","correctIndex":2,"results":[{"playerId":"p1","choiceIndex":2,"correct":true},{"playerId":"p2","choiceIndex":0,"correct":false},{"playerId":"p3","choiceIndex":null,"correct":false},{"playerId":"p4","choiceIndex":2,"correct":true}],"audienceCounts":[3,0,5]}}
```

### `vote.tag`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §3.4 Role tags, §4.1 step 3 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 2/s, burst 4 |

A role-holder puts a Recommended or Concern badge on an option in their area, or removes it with null. Each holder has at most one tag per option and at most one RECOMMENDED per round: recommending another option moves the badge. The server broadcasts `vote.tags`.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `optionId` | `OptionId` | yes | Option to tag. |
| `tag` | `TagKind \| null` | yes | Badge to set, or null to remove the sender's badge from this option. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.
- Round has `tagsAllowed = false`, or stage is not PREDICT, INSPECT or VOTE → WRONG_STAGE.
- Sender holds none of `ownerRoles` → NOT_ROLE_HOLDER.
- Unknown option → UNKNOWN_OPTION; vetoed option → OPTION_VETOED.

**Example**

```json
{"t":"vote.tag","seq":1,"d":{"roundId":"m1.r07","optionId":"eng_kerolox_workhorse","tag":"RECOMMENDED"}}
```

### `vote.tags`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §3.4 Role tags |

All role tags of the round. Sent after every accepted `vote.tag`, after a veto that removed tags, and in snapshots.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `tags` | `object[] (0–30)` | yes | Current tags. |
| `tags[].optionId` | `OptionId` | yes | Tagged option. |
| `tags[].playerId` | `PlayerId` | yes | Role-holder who tagged it. |
| `tags[].role` | `RoleId` | yes | The first role in `ownerRoles` that this player holds. |
| `tags[].tag` | `TagKind` | yes | Badge. |

**Example**

```json
{"t":"vote.tags","seq":1,"d":{"roundId":"m1.r07","tags":[{"optionId":"eng_kerolox_workhorse","playerId":"p2","role":"BOOSTER","tag":"RECOMMENDED"},{"optionId":"eng_methalox_reusable","playerId":"p2","role":"BOOSTER","tag":"CONCERN"}]}}
```

### `vote.cast`

| | |
|---|---|
| Direction | client → server |
| Sent by | player, spectator |
| Delivered to | server only |
| Design | §4.1 step 5, §4.2, §13.7 (audience votes), §17.4 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 4/s, burst 8 |

Casts or changes the sender's ballot. The last accepted ballot counts; ballots can be changed until the stage ends. A spectator's ballot goes to the separate audience tally. The server answers `vote.ack` and updates `vote.tally`.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `optionId` | `OptionId` | yes | Option voted for. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.
- Stage is not VOTE or RUNOFF → WRONG_STAGE.
- Player not in `voters` → NOT_A_VOTER.
- Option not in the round, or not a runoff candidate in RUNOFF → UNKNOWN_OPTION.
- Option vetoed → OPTION_VETOED.
- `willNotFly && !fixExists` → OPTION_NOT_WINNABLE.
- `afford` = NEVER, or `afford` = EMERGENCY_FUNDING while PM's ability is spent → OPTION_UNAFFORDABLE.

**Example**

```json
{"t":"vote.cast","seq":1,"d":{"roundId":"m1.r07","optionId":"eng_kerolox_workhorse"}}
```

### `vote.ack`

| | |
|---|---|
| Direction | server → client |
| Sent by | server |
| Delivered to | the connection concerned (reply) |
| Design | §4.1 step 5, §17.8 (vote round trip < 200 ms) |

Tells one player or spectator what their own ballot currently is. Sent after an accepted `vote.cast`, when their ballot is emptied (veto, option no longer winnable, runoff), and in snapshots. Needed because tallies may be hidden.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `optionId` | `OptionId \| null` | yes | The receiver's current ballot; null when empty. |
| `reason` | `BallotChange` | yes | Why this is being sent. |

**Example**

```json
{"t":"vote.ack","seq":1,"d":{"roundId":"m1.r07","optionId":"eng_kerolox_workhorse","reason":"CAST"}}
```

### `vote.tally`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.1 step 5 (live tallies, open or hidden), §6.1 (leading option ghost), §13.7 ("Audience says" bar) |
| Flags | droppable |

Live tally during VOTE and RUNOFF. Sent at most every 200 ms when something changed, and once at the start of each of those stages. With hidden tallies the counts, the audience counts and the leader are null for everyone, including the host; only who has voted is shown.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `stage` | `VoteStage` | yes | VOTE or RUNOFF. |
| `counts` | `OptionCount[] (0–10) \| null` | yes | Player ballots per candidate option in display order; null when tallies are hidden. |
| `votedIds` | `PlayerId[] (0–10, unique)` | yes | Players who currently have a ballot. |
| `audienceCounts` | `OptionCount[] (0–10) \| null` | yes | Spectator ballots per candidate option; null when tallies are hidden. |
| `audienceTotal` | `int 0…1000000` | yes | Number of spectators who currently have a ballot. |
| `leadingOptionId` | `OptionId \| null` | yes | Option with the most player ballots (first in display order among equals) for the ghost preview; null when nobody has voted or tallies are hidden. |

**Example**

```json
{"t":"vote.tally","seq":1,"d":{"roundId":"m1.r07","stage":"VOTE","counts":[{"optionId":"eng_kerolox_workhorse","n":2},{"optionId":"eng_methalox_reusable","n":1}],"votedIds":["p1","p2","p4"],"audienceCounts":[{"optionId":"eng_kerolox_workhorse","n":3},{"optionId":"eng_methalox_reusable","n":6}],"audienceTotal":9,"leadingOptionId":"eng_kerolox_workhorse"}}
```

### `vote.veto`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §4.2 Veto token |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 1/s, burst 2 |

Uses the sender's one veto of the mission to remove an option before voting closes. Ballots and tags on the option are cleared. The server broadcasts `vote.vetoed`, `room.state` (veto spent) and updated tags and tally.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `optionId` | `OptionId` | yes | Option to remove. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.
- Round has `vetoAllowed = false`, or stage is not INSPECT or VOTE → VETO_NOT_ALLOWED.
- Player not in `voters` → NOT_A_VOTER.
- Sender's veto already used this mission → VETO_USED.
- Unknown option → UNKNOWN_OPTION.
- Option already vetoed ("an option can only be vetoed once") → OPTION_VETOED.
- Fewer than two winnable options would remain → VETO_MIN_OPTIONS.

**Example**

```json
{"t":"vote.veto","seq":1,"d":{"roundId":"m1.r07","optionId":"eng_methalox_reusable"}}
```

### `vote.vetoed`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.2 Veto token ("VETO — PROP") |

An option was vetoed. The host plays the veto animation naming the vetoer's role. Replayed in snapshots for every veto of the active round.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `optionId` | `OptionId` | yes | Removed option. |
| `playerId` | `PlayerId` | yes | Player who spent the veto. |
| `clearedVoterIds` | `PlayerId[] (0–10, unique)` | yes | Players whose ballot was on the removed option and is now empty (each also receives `vote.ack` OPTION_REMOVED). |
| `remainingOptionIds` | `OptionId[] (2–10, unique)` | yes | Options still in the round, in display order. |

**Example**

```json
{"t":"vote.vetoed","seq":1,"d":{"roundId":"m1.r07","optionId":"eng_methalox_reusable","playerId":"p3","clearedVoterIds":["p4"],"remainingOptionIds":["eng_kerolox_workhorse","eng_electric_mini"]}}
```

### `vote.close`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §13.3 Classroom (teacher controls), §4.1 |

The host ends the current stage now (skip button, teacher control). REVEAL, PREDICT and INSPECT move to the next stage; VOTE and RUNOFF close and resolve with the ballots present (`closedBy` = HOST); TIEBREAK stages fall through to the next tie-breaker; RESULT moves to CLOSED.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.

**Example**

```json
{"t":"vote.close","seq":1,"d":{"roundId":"m1.r07"}}
```

### `vote.cancel`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §17.3 |

The host abandons the round without a result. No veto is refunded. The server broadcasts `vote.cancelled`.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.

**Example**

```json
{"t":"vote.cancel","seq":1,"d":{"roundId":"m1.r07"}}
```

### `vote.cancelled`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §17.3 |

The round ended without a result. Devices leave the vote screen. No `vote.stage` CLOSED follows.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `reason` | `CancelReason` | yes | Why it was cancelled. |

**Example**

```json
{"t":"vote.cancelled","seq":1,"d":{"roundId":"m1.r07","reason":"HOST"}}
```

### `vote.trivia.open`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.2 tie-breaker 2 (trivia sudden-death), §12.2 |

The vote is tied and FLIGHT's ballot did not decide it: a single fact question is asked. Sent together with `vote.stage` TIEBREAK_TRIVIA. The first correct answer, in order of arrival at the server, wins the right to pick among the tied options.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `question` | `QuestionPublic` | yes | The question without its answer; `id` is the fact id. |
| `tiedOptionIds` | `OptionId[] (2–10, unique)` | yes | The tied options, in display order. |

**Example**

```json
{"t":"vote.trivia.open","seq":1,"d":{"roundId":"m1.r07","question":{"id":"F05","prompt":{"key":"trivia.F05.prompt"},"choices":[{"key":"trivia.F05.a"},{"key":"trivia.F05.b"},{"key":"trivia.F05.c"}]},"tiedOptionIds":["eng_kerolox_workhorse","eng_methalox_reusable"]}}
```

### `vote.trivia.answer`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §4.2 tie-breaker 2 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 2/s, burst 4 |

The sender's single answer to the trivia question. The stage ends at the first correct answer, or when every connected voter has answered, or on the timer.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `choiceIndex` | `int 0…3` | yes | Zero-based index into the question's choices. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.
- Stage is not TIEBREAK_TRIVIA → WRONG_STAGE.
- Player not in `voters` → NOT_A_VOTER.
- `choiceIndex` ≥ number of choices → BAD_PAYLOAD.
- Sender already answered → ALREADY_ANSWERED.

**Example**

```json
{"t":"vote.trivia.answer","seq":1,"d":{"roundId":"m1.r07","choiceIndex":1}}
```

### `vote.trivia.result`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.2 tie-breaker 2, §11.3 (trivia tiebreaks 30) |
| Flags | outcome log |

Outcome of the trivia sudden-death. With a winner, `vote.stage` TIEBREAK_PICK follows; without one, the coin flip decides and `vote.result` follows. An outcome-log message: the host awards the 30 knowledge score points to the winner.

| Field | Type | Required | Description |
|---|---|---|---|
| `outcomeSeq` | `OutcomeSeq` | yes | Position in the room outcome log. |
| `roundId` | `RoundId` | yes | Round id. |
| `factId` | `DataId` | yes | Fact the question was about. |
| `correctIndex` | `int 0…3` | yes | Index of the correct choice. |
| `winnerId` | `PlayerId \| null` | yes | First player to answer correctly; null when nobody did. |
| `answers` | `object[] (0–10)` | yes | Answers in order of arrival. |
| `answers[].playerId` | `PlayerId` | yes | Player who answered. |
| `answers[].choiceIndex` | `int 0…3` | yes | Their answer. |
| `answers[].correct` | `boolean` | yes | True when correct. |

**Example**

```json
{"t":"vote.trivia.result","seq":1,"d":{"outcomeSeq":8,"roundId":"m1.r07","factId":"F05","correctIndex":1,"winnerId":"p4","answers":[{"playerId":"p2","choiceIndex":0,"correct":false},{"playerId":"p4","choiceIndex":1,"correct":true}]}}
```

### `vote.trivia.pick`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §4.2 tie-breaker 2 ("the first correct answer picks among the tied options") |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 2/s, burst 4 |

The trivia winner picks the winning option among the tied ones. If no pick arrives before the stage ends, the winner's own ballot is used when it is on a tied option; otherwise the coin flip decides.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id. |
| `optionId` | `OptionId` | yes | One of the tied options. |

**Server validation** (after the common checks):

- `roundId` is not the active round → STALE_ID.
- Stage is not TIEBREAK_PICK → WRONG_STAGE.
- Sender is not `vote.stage.pickerId` → NOT_YOUR_TURN.
- `optionId` is not a tied option → UNKNOWN_OPTION.

**Example**

```json
{"t":"vote.trivia.pick","seq":1,"d":{"roundId":"m1.r07","optionId":"eng_kerolox_workhorse"}}
```

### `vote.result`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.1 step 6, §4.2 (all rules), §17.4 |
| Flags | outcome log |

The resolved outcome of the round, sent with `vote.stage` RESULT. Resolved entirely by the server (see Vote resolution). An outcome-log message: the host applies the winner to the simulation and answers `vote.commit`. If `emergencyFunding` is true an `ability.used` (PM, OVER_BUDGET_WIN) follows.

| Field | Type | Required | Description |
|---|---|---|---|
| `outcomeSeq` | `OutcomeSeq` | yes | Position in the room outcome log. |
| `roundId` | `RoundId` | yes | Round id. |
| `kind` | `VoteKind` | yes | Vote kind. |
| `subjectId` | `DataId \| null` | yes | As in `vote.open`. |
| `winnerId` | `OptionId` | yes | Winning option. |
| `method` | `ResolveMethod` | yes | Rule that decided the winner. |
| `closedBy` | `CloseCause` | yes | Why the deciding voting stage ended. |
| `counts` | `OptionCount[] (0–10)` | yes | Final ballots per candidate of the deciding stage (the runoff if one was held), in display order, including the audience ballot when it counted. |
| `ballots` | `object[] (0–10)` | yes | One entry per voter. |
| `ballots[].playerId` | `PlayerId` | yes | Voter. |
| `ballots[].optionId` | `OptionId \| null` | yes | Their final ballot in the deciding stage; null = abstained (did not vote, or disconnected at close). |
| `audienceCounts` | `OptionCount[] (0–10)` | yes | Spectator ballots per candidate of the deciding stage ("Audience says"). |
| `audienceBallot` | `OptionId \| null` | yes | Option that received the audience's one extra ballot (weight 1 and a unique audience favourite); null otherwise. |
| `firstRoundCounts` | `OptionCount[] (0–10) \| null` | yes | When a runoff was held: the first-round counts; null otherwise. |
| `tiedOptionIds` | `OptionId[] (0–10, unique)` | yes | Options that tied for first place before tie-breaking; empty when there was no tie. |
| `triviaWinnerId` | `PlayerId \| null` | yes | Trivia sudden-death winner when `method` = TRIVIA; null otherwise. |
| `vetoes` | `object[] (0–8)` | yes | Vetoes used in this round. |
| `vetoes[].optionId` | `OptionId` | yes | Vetoed option. |
| `vetoes[].playerId` | `PlayerId` | yes | Player who vetoed it. |
| `emergencyFunding` | `boolean` | yes | True when the winner has `afford` = EMERGENCY_FUNDING: PM's Emergency Funding is now spent (§4.2 Affordability). |

**Example**

```json
{"t":"vote.result","seq":1,"d":{"outcomeSeq":10,"roundId":"m1.r07","kind":"PART","subjectId":"first_stage_engine","winnerId":"eng_kerolox_workhorse","method":"FLIGHT_TIEBREAK","closedBy":"TIMER","counts":[{"optionId":"eng_kerolox_workhorse","n":2},{"optionId":"eng_methalox_reusable","n":2}],"ballots":[{"playerId":"p1","optionId":"eng_kerolox_workhorse"},{"playerId":"p2","optionId":"eng_kerolox_workhorse"},{"playerId":"p3","optionId":"eng_methalox_reusable"},{"playerId":"p4","optionId":"eng_methalox_reusable"}],"audienceCounts":[{"optionId":"eng_kerolox_workhorse","n":3},{"optionId":"eng_methalox_reusable","n":6}],"audienceBallot":null,"firstRoundCounts":null,"tiedOptionIds":["eng_kerolox_workhorse","eng_methalox_reusable"],"triviaWinnerId":null,"vetoes":[],"emergencyFunding":false}}
```

### `vote.commit`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §4.1 steps 6–7 (dashboard deltas, budget and schedule deducted, Codex unlock) |

The host has applied the result to the simulation. Carries the dashboard changes actually applied and the Codex entries unlocked. It is also the host's acknowledgement of `vote.result`. Send it during the RESULT stage; a fresh `build.state` follows for build votes.

| Field | Type | Required | Description |
|---|---|---|---|
| `roundId` | `RoundId` | yes | Round id of the applied result. |
| `winnerId` | `OptionId` | yes | Option that was applied. |
| `deltas` | `Delta[] (0–16)` | yes | Dashboard changes applied (green/red); empty for votes that do not change the build. |
| `codexIds` | `DataId[] (0–8)` | yes | Codex entries unlocked for everyone by this commit. |

**Server validation** (after the common checks):

- `roundId` is not a resolved round of this room → STALE_ID.

**Example**

```json
{"t":"vote.commit","seq":1,"d":{"roundId":"m1.r07","winnerId":"eng_kerolox_workhorse","deltas":[{"metric":"TOTAL_DV_MS","value":9890,"delta":420,"rating":"GOOD"},{"metric":"COST_M","value":52.4,"delta":10.8,"rating":"NEUTRAL"}],"codexIds":["codex_gas_generator_cycle"]}}
```

<!-- group: Pings and reactions -->

**Pings and reactions**

### `ping.send`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §3.4 (quick pings, no free-text chat), §17.9 |
| Rate limit | 1 per 2 s, burst 3 |

A player sends one of the eight enumerated quick pings, optionally pointing at an option of the active vote round. Allowed in every phase and while paused.

| Field | Type | Required | Description |
|---|---|---|---|
| `pingId` | `PingId` | yes | Which ping. |
| `optionId` | `OptionId \| null` | yes | Option of the active round the ping points at; null for none. |

**Server validation** (after the common checks):

- `optionId` set while no round is active, or not an option of the active round → UNKNOWN_OPTION.

**Example**

```json
{"t":"ping.send","seq":1,"d":{"pingId":"CHECK_DRAWBACK","optionId":"eng_methalox_reusable"}}
```

### `ping.event`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §3.4, §17.4 |

A player pinged. The host shows it next to the player's avatar; phones show it in the vote screen.

| Field | Type | Required | Description |
|---|---|---|---|
| `playerId` | `PlayerId` | yes | Player who pinged. |
| `pingId` | `PingId` | yes | Which ping. |
| `roundId` | `RoundId \| null` | yes | Active vote round when the ping was sent; null when none. |
| `optionId` | `OptionId \| null` | yes | Option pointed at; null for none. |

**Example**

```json
{"t":"ping.event","seq":1,"d":{"playerId":"p2","pingId":"CHECK_DRAWBACK","roundId":"m1.r07","optionId":"eng_methalox_reusable"}}
```

### `react.send`

| | |
|---|---|
| Direction | client → server |
| Sent by | player, spectator |
| Delivered to | server only |
| Design | §3.4 (emoji reactions), §13.7 |
| Rate limit | players 2/s, burst 4; spectators 1/s, burst 2 |

An emoji reaction from a player or a spectator. Allowed in every phase and while paused.

| Field | Type | Required | Description |
|---|---|---|---|
| `emoji` | `ReactionId` | yes | Which emoji. |

**Server validation** (after the common checks):

- None beyond the common rules.

**Example**

```json
{"t":"react.send","seq":1,"d":{"emoji":"ROCKET"}}
```

### `react.event`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §3.4 |

A player reacted. Shown next to the player's avatar.

| Field | Type | Required | Description |
|---|---|---|---|
| `playerId` | `PlayerId` | yes | Player who reacted. |
| `emoji` | `ReactionId` | yes | Which emoji. |

**Example**

```json
{"t":"react.event","seq":1,"d":{"playerId":"p4","emoji":"FIRE"}}
```

### `react.audience`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §13.7 |
| Flags | droppable |

Spectator reactions, aggregated: one message per second in which at least one spectator reacted. Spectators are anonymous.

| Field | Type | Required | Description |
|---|---|---|---|
| `windowMs` | `int 100…10000` | yes | Length of the aggregation window. Always 1000. |
| `counts` | `ReactionCounts` | yes | Reactions received in the window, per emoji. |

**Example**

```json
{"t":"react.audience","seq":1,"d":{"windowMs":1000,"counts":{"ROCKET":7,"THUMBS_UP":2,"GRIMACE":0,"FIRE":4,"THINKING":1}}}
```

<!-- group: GO/NO-GO poll -->

**GO/NO-GO poll**

### `poll.open`

| | |
|---|---|
| Direction | host → server |
| Sent by | host |
| Delivered to | server only |
| Design | §4.3 (GO/NO-GO ritual), §6.9 (FRR), §3.3 (FLIGHT calls polls) |
| Flags | rejected with PAUSED while the game is paused |

The host starts one round of the GO/NO-GO polling ritual. The server calls the consoles one at a time in the given order: each connected player is called once, at the position of the first of their roles in `order`, and answers for all their roles. The host owns the surrounding flow: after a round with any NO-GO it shows the 15 s discussion and opens round 2; after two NO-GO rounds it opens a REVIEW vote offering Rework (§6.9).

| Field | Type | Required | Description |
|---|---|---|---|
| `pollId` | `PollId` | yes | New poll id, never used before in this room. |
| `context` | `PollContext` | yes | FRR or final launch poll. |
| `round` | `int 1…9` | yes | Round number of this poll within the review (1 = first poll, 2 = re-poll). |
| `order` | `RoleId[] (1–10, unique)` | yes | Consoles in call order. Roles not listed are not called. |
| `perCallMs` | `int 3000…15000` | yes | Answer window per call in milliseconds. Use 5000 (scaled by the server ×1.5 when `a11y.slowTimers`). |

**Server validation** (after the common checks):

- Phase is not FRR or COUNTDOWN → WRONG_PHASE.
- A vote round or another poll is active → ROUND_ACTIVE.
- `pollId` used before → DUPLICATE_ID.

**Example**

```json
{"t":"poll.open","seq":1,"d":{"pollId":"m1.frr.1","context":"FRR","round":1,"order":["BOOSTER","STRUCT","GUIDO","FIDO","EECOM","INCO","PAYLOAD","RETRO","PM","FLIGHT"],"perCallMs":5000}}
```

### `poll.call`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.3, §6.9 |

FLIGHT calls one console. The called player's phone shows GO / NO-GO buttons; the host shows who is being called. The next call follows as soon as the answer arrives or the window ends. Disconnected players are not called; they are recorded as NO_ANSWER.

| Field | Type | Required | Description |
|---|---|---|---|
| `pollId` | `PollId` | yes | Poll id. |
| `context` | `PollContext` | yes | FRR or final launch poll. |
| `round` | `int 1…9` | yes | Round number. |
| `index` | `int 1…10` | yes | Position of this call, 1-based. |
| `total` | `int 1…10` | yes | Number of calls in this poll. |
| `playerId` | `PlayerId` | yes | Player being called. |
| `roles` | `RoleId[] (1–10, unique)` | yes | Roles from `order` that this player answers for. |
| `endsAtMs` | `TimeMs` | yes | Server clock when the answer window ends. |

**Example**

```json
{"t":"poll.call","seq":1,"d":{"pollId":"m1.frr.1","context":"FRR","round":1,"index":2,"total":4,"playerId":"p3","roles":["GUIDO","FIDO"],"endsAtMs":1794650705000}}
```

### `poll.answer`

| | |
|---|---|
| Direction | client → server |
| Sent by | player |
| Delivered to | server only |
| Design | §4.3 ("each player answers GO or NO-GO on their device") |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 2/s, burst 4 |

The called player answers GO or NO-GO.

| Field | Type | Required | Description |
|---|---|---|---|
| `pollId` | `PollId` | yes | Poll id. |
| `answer` | `GoNoGo` | yes | The answer. |

**Server validation** (after the common checks):

- `pollId` is not the active poll → STALE_ID.
- Sender is not the player currently called → NOT_YOUR_TURN.

**Example**

```json
{"t":"poll.answer","seq":1,"d":{"pollId":"m1.frr.1","answer":"GO"}}
```

### `poll.answered`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §4.3, §6.9 |

One console answered (or its window ended). The host plays the callout ("GUIDO: GO").

| Field | Type | Required | Description |
|---|---|---|---|
| `pollId` | `PollId` | yes | Poll id. |
| `entry` | `PollEntry` | yes | The recorded answer. |

**Example**

```json
{"t":"poll.answered","seq":1,"d":{"pollId":"m1.frr.1","entry":{"playerId":"p3","roles":["GUIDO","FIDO"],"answer":"GO"}}}
```

### `poll.result`

| | |
|---|---|
| Direction | server → host and clients |
| Sent by | server |
| Delivered to | host, all players, all spectators |
| Design | §6.9 ("Any NO-GO opens a quick discussion (15 s), then a re-poll") |
| Flags | outcome log |

All consoles have been polled. An outcome-log message: the host decides what follows (proceed, discussion and re-poll, or Rework vote).

| Field | Type | Required | Description |
|---|---|---|---|
| `outcomeSeq` | `OutcomeSeq` | yes | Position in the room outcome log. |
| `pollId` | `PollId` | yes | Poll id. |
| `context` | `PollContext` | yes | FRR or final launch poll. |
| `round` | `int 1…9` | yes | Round number. |
| `answers` | `PollEntry[] (0–10)` | yes | All answers in call order, followed by disconnected players as NO_ANSWER. |
| `allGo` | `boolean` | yes | True when no answer is NO_GO. |
| `noGoCount` | `int 0…10` | yes | Number of NO_GO answers. |

**Example**

```json
{"t":"poll.result","seq":1,"d":{"outcomeSeq":21,"pollId":"m1.frr.1","context":"FRR","round":1,"answers":[{"playerId":"p2","roles":["BOOSTER","STRUCT"],"answer":"GO"},{"playerId":"p3","roles":["GUIDO","FIDO"],"answer":"GO"},{"playerId":"p4","roles":["EECOM","INCO","PAYLOAD","RETRO"],"answer":"NO_GO"},{"playerId":"p1","roles":["PM","FLIGHT"],"answer":"GO"}],"allGo":false,"noGoCount":1}}
```

<!-- group: Flight -->

**Flight**

### `pilot.assign`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §9.4 (pilot rotation, co-pilot, booster pilot, pass the controls) |
| Flags | sticky (single) |

The host names who sits in the pilot, co-pilot and booster-pilot seats and where each seat reads its input. The server stores it to authorise `pilot.input`, `pilot.action` and `copilot.action`. Sent at every seat change (each flight segment by default).

| Field | Type | Required | Description |
|---|---|---|---|
| `segment` | `FlightSegment \| null` | yes | Segment the assignment is for; null before flight. |
| `pilotId` | `PlayerId \| null` | yes | Pilot of the main vehicle; null when nobody is named (host operator flies). |
| `pilotInput` | `InputSource` | yes | Input source of the pilot seat. PHONE requires `pilotId`. |
| `copilotId` | `PlayerId \| null` | yes | Co-pilot handling staging and deploys on their phone; null for none. |
| `boosterPilotId` | `PlayerId \| null` | yes | Second pilot flying the returning booster; null for none. |
| `boosterInput` | `InputSource \| null` | yes | Input source of the booster seat; null when there is no booster pilot. |

**Server validation** (after the common checks):

- A named player is not a player of the room → UNKNOWN_PLAYER.
- `pilotInput` = PHONE with `pilotId` null, or `boosterPilotId` set with `boosterInput` null → BAD_PAYLOAD.

**Example**

```json
{"t":"pilot.assign","seq":1,"d":{"segment":"ASCENT","pilotId":"p3","pilotInput":"PHONE","copilotId":"p2","boosterPilotId":null,"boosterInput":null}}
```

### `pilot.input`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §9.2 (controls), §9.4 (phones become virtual gamepads) |
| Flags | droppable; rejected with PAUSED while the game is paused |
| Rate limit | 30/s, burst 40 |

Analogue state of a phone used as a virtual gamepad. Sent on change at up to 30 Hz, and at 5 Hz while unchanged as a keep-alive; if the host receives none for 500 ms it centres pitch, yaw and roll and holds throttle. The server may drop all but the newest queued input.

| Field | Type | Required | Description |
|---|---|---|---|
| `craft` | `Craft` | yes | Seat: VEHICLE for the pilot, BOOSTER for the booster pilot. |
| `n` | `int 0…2147483647` | yes | Input counter, increasing; the host ignores inputs older than the last applied. |
| `throttle` | `number 0…1` | yes | Throttle position, 0 = closed, 1 = full. |
| `pitch` | `number -1…1` | yes | Pitch axis. |
| `yaw` | `number -1…1` | yes | Yaw axis. |
| `roll` | `number -1…1` | yes | Roll axis. |

**Server validation** (after the common checks):

- Phase is not COUNTDOWN or FLIGHT → WRONG_PHASE.
- Sender is not the player assigned to that seat, or the seat input source is HOST_DEVICE → NOT_PILOT.

**Example**

```json
{"t":"pilot.input","seq":1,"d":{"craft":"VEHICLE","n":1841,"throttle":0.72,"pitch":-0.15,"yaw":0,"roll":0}}
```

### `pilot.action`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §9.2 (controls), §9.4, §9.8 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 10/s, burst 10 |

A discrete pilot action from a phone used as a virtual gamepad. Hold gestures are completed on the phone before sending. ABORT is a request: the host opens an ABORT vote unless the escape system fires on its own.

| Field | Type | Required | Description |
|---|---|---|---|
| `craft` | `Craft` | yes | Seat: VEHICLE or BOOSTER. |
| `n` | `int 0…2147483647` | yes | Action counter, increasing; the host ignores duplicates. |
| `action` | `PilotAction` | yes | Which action. |
| `attMode` | `AttMode` | no | Required when `action` = ATT_HOLD. |
| `deploy` | `DeployTarget` | no | Required when `action` = DEPLOY. |

**Server validation** (after the common checks):

- Phase is not COUNTDOWN or FLIGHT → WRONG_PHASE.
- Sender is not the player assigned to that seat, or the seat input source is HOST_DEVICE → NOT_PILOT.
- ATT_HOLD without `attMode`, or DEPLOY without `deploy` → BAD_PAYLOAD.

**Example**

```json
{"t":"pilot.action","seq":1,"d":{"craft":"VEHICLE","n":12,"action":"STAGE"}}
```

### `copilot.action`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §9.4 (co-pilot handles staging and deploys) |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 10/s, burst 10 |

The co-pilot stages or deploys from their phone while the pilot flies. The co-pilot seat always reads from the phone.

| Field | Type | Required | Description |
|---|---|---|---|
| `n` | `int 0…2147483647` | yes | Action counter, increasing; the host ignores duplicates. |
| `action` | `CopilotAction` | yes | STAGE or DEPLOY. |
| `deploy` | `DeployTarget` | no | Required when `action` = DEPLOY. |

**Server validation** (after the common checks):

- Phase is not COUNTDOWN or FLIGHT → WRONG_PHASE.
- Sender is not `pilot.assign.copilotId` → NOT_PILOT.
- DEPLOY without `deploy` → BAD_PAYLOAD.

**Example**

```json
{"t":"copilot.action","seq":1,"d":{"n":3,"action":"DEPLOY","deploy":"FAIRING"}}
```

### `pilot.hud`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | players listed in `d.to` |
| Design | §9.2, §9.5 (pilot sees console requests as prompts), §9.3 (guidance cue) |
| Flags | droppable |

State the virtual gamepad needs to draw itself: throttle read-back, modes, what STAGE and DEPLOY would do now, pending console requests and the guidance cue. Sent to the phones in pilot seats at up to 10 Hz.

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | `PlayerId[] (1–3, unique)` | yes | Phones to deliver to (pilot, co-pilot, booster pilot). |
| `craft` | `Craft` | yes | Vehicle the state is about. |
| `throttlePct` | `number 0…100` | yes | Actual throttle, percent. |
| `attMode` | `AttMode` | yes | Active attitude hold mode. |
| `rcsOn` | `boolean` | yes | RCS enabled. |
| `canStage` | `boolean` | yes | True when STAGE would do something now. |
| `deployTarget` | `DeployTarget \| null` | yes | What the context deploy button would deploy now; null for nothing. |
| `warp` | `number 0…1000` | yes | Simulation time factor. |
| `prompts` | `object[] (0–4)` | yes | Open console requests, oldest first. |
| `prompts[].requestId` | `DataId` | yes | Console request id. |
| `prompts[].role` | `RoleId` | yes | Console that asked. |
| `cue` | `TextRef \| null` | yes | Guidance cue for the current assist level; null for none. |

**Server validation** (after the common checks):

- A `to` entry that is not a player → UNKNOWN_PLAYER.

**Example**

```json
{"t":"pilot.hud","seq":1,"d":{"to":["p3","p2"],"craft":"VEHICLE","throttlePct":72,"attMode":"PROGRADE","rcsOn":false,"canStage":false,"deployTarget":null,"warp":1,"prompts":[{"requestId":"point_antenna","role":"INCO"}],"cue":{"key":"cue.throttle_down_max_q"}}}
```

### `console.config`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | player(s) holding `d.role` |
| Design | §9.5, §3.3 (flight console per role) |
| Flags | sticky (per role) |

Layout of one role console for the current flight phase: gauge ranges and limits, and which callout and request buttons to show. Sent when the flight starts and whenever the set changes. Delivered to the holder(s) of `role`.

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `RoleId` | yes | Console (routing key). |
| `channels` | `object[] (0–12)` | yes | Channels shown on this console. |
| `channels[].id` | `TelemetryChannel` | yes | Channel. |
| `channels[].min` | `number` | yes | Gauge minimum, channel unit. |
| `channels[].max` | `number` | yes | Gauge maximum, channel unit. |
| `channels[].warnLow` | `number \| null` | yes | Lower limit; below it the value is out of limits. Null for none. |
| `channels[].warnHigh` | `number \| null` | yes | Upper limit; above it the value is out of limits. Null for none. |
| `calloutIds` | `DataId[] (0–12, unique)` | yes | Callout buttons available now. |
| `requestIds` | `DataId[] (0–8, unique)` | yes | Request buttons available now. |

**Example**

```json
{"t":"console.config","seq":1,"d":{"role":"STRUCT","channels":[{"id":"q_kpa","min":0,"max":50,"warnLow":null,"warnHigh":35},{"id":"load_pct","min":0,"max":120,"warnLow":null,"warnHigh":100}],"calloutIds":["throttle_down_max_q","structural_overload"],"requestIds":["reduce_throttle"]}}
```

### `console.telemetry`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | player(s) holding `d.role` |
| Design | §9.5, §17.4, §17.8 (≤ 10 Hz per console) |
| Flags | droppable |

Live telemetry for one role console, computed by the host and delivered only to the holder(s) of `role`. At most 10 messages per second per role; the server drops the excess. Not sent during a blackout.

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `RoleId` | yes | Console (routing key). |
| `metS` | `number` | yes | Mission elapsed time of the sample, s. |
| `v` | `TelemetryValues` | yes | Values of this role's channels. |

**Server validation** (after the common checks):

- More than 10 per second for the same `role` → dropped silently (no error).

**Example**

```json
{"t":"console.telemetry","seq":1,"d":{"role":"STRUCT","metS":62.4,"v":{"q_kpa":31.2,"load_pct":88.5,"g_load":1.9,"vibration_pct":34}}}
```

### `console.alert`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | player(s) holding `d.role` |
| Design | §9.5 ("the role-holder gets a subtle alert") |

A parameter of one console went out of limits. Opens the window in which the matching callout earns a Good Call. Delivered only to the holder(s) of `role`.

| Field | Type | Required | Description |
|---|---|---|---|
| `alertId` | `AlertId` | yes | New alert id. |
| `role` | `RoleId` | yes | Console (routing key). |
| `calloutId` | `DataId` | yes | Callout that matches this alert. |
| `arg` | `int 0…99 \| null` | yes | Number that is part of the callout (e.g. engine 3); null when none. |
| `severity` | `AlertSeverity` | yes | Severity. |
| `endsAtMs` | `TimeMs` | yes | Server clock when the Good Call window closes. |

**Example**

```json
{"t":"console.alert","seq":1,"d":{"alertId":"m1.al.14","role":"STRUCT","calloutId":"throttle_down_max_q","arg":null,"severity":"CAUTION","endsAtMs":1794650525000}}
```

### `console.callout`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §9.5 (callout buttons), §17.4 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 2/s, burst 4 |

A role-holder pressed a callout button. The host shows the voice/text callout, and awards a Good Call when it matches an open alert inside its window. False or late callouts have no penalty.

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `RoleId` | yes | Console the callout comes from. |
| `calloutId` | `DataId` | yes | Which callout. |
| `arg` | `int 0…99 \| null` | yes | Number that is part of the callout (e.g. engine 3); null when none. |
| `alertId` | `AlertId \| null` | yes | Alert the player is answering, if the phone showed one; null otherwise. |
| `atMs` | `TimeMs` | yes | Sender's estimate of the server clock at the press; the host uses it, bounded to at most 300 ms before arrival, to judge the window (§17.7). |

**Server validation** (after the common checks):

- Phase is not COUNTDOWN or FLIGHT → WRONG_PHASE.
- Sender does not hold `role` → NOT_ROLE_HOLDER.

**Example**

```json
{"t":"console.callout","seq":1,"d":{"role":"STRUCT","calloutId":"throttle_down_max_q","arg":null,"alertId":"m1.al.14","atMs":1794650522100}}
```

### `console.request`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §9.5 ("Consoles also let roles request actions") |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 1/s, burst 2 |

A role-holder asks the pilot for an action (for example INCO: "point antenna"). The host shows it as a HUD prompt and includes it in `pilot.hud.prompts`.

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `RoleId` | yes | Console the request comes from. |
| `requestId` | `DataId` | yes | Which request. |

**Server validation** (after the common checks):

- Phase is not COUNTDOWN or FLIGHT → WRONG_PHASE.
- Sender does not hold `role` → NOT_ROLE_HOLDER.

**Example**

```json
{"t":"console.request","seq":1,"d":{"role":"INCO","requestId":"point_antenna"}}
```

### `console.goodcall`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §9.5 (Good Call), §11.2 (+3 Team Sync), §11.3 (20 points) |

Good Call acknowledgement: a callout matched an alert inside its window. Only good calls are announced; missed or false callouts produce nothing.

| Field | Type | Required | Description |
|---|---|---|---|
| `playerId` | `PlayerId` | yes | Player who made the call. |
| `role` | `RoleId` | yes | Console. |
| `calloutId` | `DataId` | yes | Which callout. |
| `arg` | `int 0…99 \| null` | yes | Number that is part of the callout; null when none. |
| `alertId` | `AlertId` | yes | Alert that was answered. |
| `syncDelta` | `int 0…100` | yes | Team Sync gained. 3 by design. |
| `points` | `int 0…100000` | yes | Teamwork score gained. 20 by design. |

**Example**

```json
{"t":"console.goodcall","seq":1,"d":{"playerId":"p2","role":"STRUCT","calloutId":"throttle_down_max_q","arg":null,"alertId":"m1.al.14","syncDelta":3,"points":20}}
```

### `blackout.set`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §9.1 F11 ("Phones show static"), MG-25, MG-26 |
| Flags | sticky (single) |

Starts or ends a communications blackout. While active, phones show static instead of consoles and HUD, the host sends no `console.telemetry`, `flight.hud` or `pilot.hud`, and the server discards any that arrive. Minigames (MG-25) still run.

| Field | Type | Required | Description |
|---|---|---|---|
| `active` | `boolean` | yes | True while the blackout lasts. |
| `cause` | `BlackoutCause \| null` | yes | Cause while active; null when not active. |
| `expectedEndAtMs` | `TimeMs \| null` | yes | Server clock when the host expects it to end, for the phone countdown; null when unknown or not active. The real end is the next `blackout.set`. |

**Example**

```json
{"t":"blackout.set","seq":1,"d":{"active":true,"cause":"PLASMA","expectedEndAtMs":1794650840000}}
```

### `haptic.cue`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | players listed in `d.to`; all players when `d.to` is null |
| Design | §15 Haptics, §10.4 (phone vibration pattern) |

Asks phones to vibrate with a named pattern. Phones ignore it when the device preference `haptics` is false or the device has no vibration.

| Field | Type | Required | Description |
|---|---|---|---|
| `cue` | `HapticCue` | yes | Which pattern. |
| `to` | `PlayerId[] (1–10, unique) \| null` | yes | Players to cue; null = every player (spectators never). |

**Server validation** (after the common checks):

- A `to` entry that is not a player → UNKNOWN_PLAYER.

**Example**

```json
{"t":"haptic.cue","seq":1,"d":{"cue":"STAGING","to":null}}
```

### `sync.meter`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §11.2 (Team Sync meter & Mission Control Moment) |
| Flags | sticky (single) |

Current Team Sync meter. Sent on every change. At 100 the host opens an MCM vote (5 s) and afterwards resets the meter with reason MOMENT_SPENT.

| Field | Type | Required | Description |
|---|---|---|---|
| `value` | `int 0…100` | yes | Meter value after the change. |
| `delta` | `int -100…100` | yes | Change that produced it. |
| `reason` | `SyncReason` | yes | Why it changed. |
| `momentReady` | `boolean` | yes | True when the meter is at 100 and a Mission Control Moment is waiting to be chosen. |

**Example**

```json
{"t":"sync.meter","seq":1,"d":{"value":100,"delta":25,"reason":"GOLD","momentReady":true}}
```

### `boost.applied`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §10.4, §11.1 ("Boosts apply immediately and visibly") |

A boost was applied outside a minigame summary (ability, Mission Control Moment, Lessons Learned, anomaly). Minigame boosts are carried by `mg.summary`.

| Field | Type | Required | Description |
|---|---|---|---|
| `grant` | `BoostGrant` | yes | The boost that was applied. |

**Example**

```json
{"t":"boost.applied","seq":1,"d":{"grant":{"boost":"LOAD_MARGIN","tier":"NONE","amount":10,"total":15,"unit":"PCT","capped":false,"source":"ABILITY","sourceId":"STRUCT"}}}
```

### `boost.state`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §11.1 (stacking, shields shown as icons), §9.6 (active boost icons) |
| Flags | sticky (single) |

All boosts currently in force, for the active-boost icons. Sent after every change, including a Reliability Shield being consumed.

| Field | Type | Required | Description |
|---|---|---|---|
| `boosts` | `object[] (0–11)` | yes | One entry per boost type in force. |
| `boosts[].boost` | `BoostId` | yes | Boost type. |
| `boosts[].total` | `number` | yes | Mission total in `unit` (for RELIABILITY_SHIELD: shields currently held). |
| `boosts[].unit` | `BoostUnit` | yes | Unit of `total`. |

**Example**

```json
{"t":"boost.state","seq":1,"d":{"boosts":[{"boost":"DV_BONUS","total":3,"unit":"PCT"},{"boost":"RELIABILITY_SHIELD","total":1,"unit":"SHIELDS"}]}}
```

<!-- group: Minigames -->

**Minigames**

### `mg.start`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players; also spectators when the run has `audience` = true |
| Design | §10.1, §10.2, §17.4, §17.7 |
| Flags | sticky (single, until mg.summary or mg.cancel); rejected with PAUSED while the game is paused |

The host starts a minigame run on every player phone. Phones load the minigame, answer `mg.ready`, show the one-sentence instruction and demo until `startAtMs`, then run it locally from `seed` and `params` and report one `mg.result`. The host is in bullet-time meanwhile. When `audience` is true spectators receive it too and may play for fun; they report nothing.

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | New run id, never used before in this room. |
| `minigameId` | `DataId` | yes | Minigame id (e.g. "MG-08"). |
| `type` | `MinigameType` | yes | Minigame type. |
| `seed` | `Uint32` | yes | Seed for the local random generator; the same on every phone. |
| `startAtMs` | `TimeMs` | yes | Server clock when play begins. Must be at least 3000 ms after sending, for the instruction and demo (§10.1 rule 4). |
| `durationMs` | `int 5000…60000` | yes | Length of play in milliseconds (15–45 s by design). |
| `assistLevel` | `AssistLevel` | yes | Difficulty the minigame scales with (§10.1 rule 6). |
| `flightPhase` | `FlightPhase \| null` | yes | Flight phase it belongs to; null for build-phase and debrief minigames. |
| `audience` | `boolean` | yes | True to deliver the run to spectators as well. |
| `params` | `MgMap` | yes | Parameters common to all players. |
| `assignments` | `object[] (0–10)` | yes | Per-player pieces for COOP_SPLIT, RELAY and TEAM_SYNC; empty for PARALLEL_SOLO. Players not listed play with `params` only. |
| `assignments[].playerId` | `PlayerId` | yes | Player. |
| `assignments[].index` | `int 0…9` | yes | Position of the player in the task split or relay order, 0-based. RELAY: the player's turn starts at `startAtMs + index × params.turnMs`. |
| `assignments[].params` | `MgMap` | yes | Parameters for this player only (their piece of the task). |

**Server validation** (after the common checks):

- A run is already active → ROUND_ACTIVE.
- `runId` used before → DUPLICATE_ID.
- An `assignments[].playerId` that is not a player → UNKNOWN_PLAYER.

**Example**

```json
{"t":"mg.start","seq":1,"d":{"runId":"m1.mg08","minigameId":"MG-08","type":"PARALLEL_SOLO","seed":771203455,"startAtMs":1794650500000,"durationMs":20000,"assistLevel":"ENGINEER","flightPhase":"F4","audience":false,"params":{"bandWidth":0.18,"peakQ":34.5},"assignments":[]}}
```

### `mg.ready`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §10.3 ("Active means connected and loaded") |
| Rate limit | 1/s, burst 2 |

The phone has loaded the minigame and will play. A player counts as active in the completion fraction only if this arrived and the player is still connected when the host closes the run.

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | Run id. |

**Server validation** (after the common checks):

- `runId` is not the active run → STALE_ID.

**Example**

```json
{"t":"mg.ready","seq":1,"d":{"runId":"m1.mg08"}}
```

### `mg.progress`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §14.1 screen 11 (team progress meter) |
| Flags | droppable; rejected with PAUSED while the game is paused |
| Rate limit | 2/s, burst 4 |

Optional coarse progress of one player for the team progress meter on the host. At most 2 Hz. It never affects the result.

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | Run id. |
| `p` | `number 0…1` | yes | Progress 0–1 as defined by the minigame. |

**Server validation** (after the common checks):

- `runId` is not the active run → STALE_ID.

**Example**

```json
{"t":"mg.progress","seq":1,"d":{"runId":"m1.mg08","p":0.45}}
```

### `mg.action`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §10.2 (cooperative split, relay, team-sync), MG-19, MG-28, MG-30 |
| Flags | rejected with PAUSED while the game is paused |
| Rate limit | 10/s, burst 20 |

A player's move in a minigame with shared state (placing a part in a slot, playing an evidence card, contributing a patch element, a synchronised tap). The host keeps the shared state and broadcasts it with `mg.state`. Not used by PARALLEL_SOLO minigames.

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | Run id. |
| `n` | `int 0…2147483647` | yes | Action counter per player, increasing. |
| `a` | `string /^[a-z][a-z0-9_]{0,23}$/` | yes | Action name defined by the minigame (e.g. "place", "tap"). |
| `x` | `number[] (0–8)` | yes | Numeric arguments defined by the minigame (slot index, local timestamp offset in ms, …). |

**Server validation** (after the common checks):

- `runId` is not the active run → STALE_ID.

**Example**

```json
{"t":"mg.action","seq":1,"d":{"runId":"m1.mg19","n":4,"a":"place","x":[2,5]}}
```

### `mg.state`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players; also spectators when the run has `audience` = true |
| Design | §10.2, §14.1 screen 11 |
| Flags | droppable |

Shared state of a running minigame, kept by the host: for cooperative minigames the common board, for all minigames the team progress. At most 10 Hz. Delivered to spectators only when the run has `audience` = true.

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | Run id. |
| `n` | `int 0…2147483647` | yes | State counter, increasing; phones ignore older states. |
| `shared` | `MgMap` | yes | Shared state defined by the minigame. |
| `progress` | `object[] (0–10)` | yes | Progress per active player. |
| `progress[].playerId` | `PlayerId` | yes | Player. |
| `progress[].p` | `number 0…1` | yes | Progress 0–1. |

**Server validation** (after the common checks):

- `runId` is not the active run → STALE_ID.

**Example**

```json
{"t":"mg.state","seq":1,"d":{"runId":"m1.mg19","n":17,"shared":{"slots":[1,0,1,0,0],"co2Pct":2.4},"progress":[{"playerId":"p1","p":1},{"playerId":"p2","p":0.5}]}}
```

### `mg.result`

| | |
|---|---|
| Direction | client → server → host (relayed inside `relay`) |
| Sent by | player |
| Delivered to | host only |
| Design | §10.1 rule 9, §10.3, §17.4, §17.7 (results timestamped locally, 300 ms tolerance) |
| Rate limit | 1/s, burst 2 |

The compact result of one player's local minigame run. Exactly one per player and run, sent when play ends on the phone. The host accepts results until `startAtMs + durationMs + 2000 ms` on the server clock, then computes fraction, tier and boosts. Accepted while paused so that a result finished just before a pause is not lost.

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | Run id. |
| `minigameId` | `DataId` | yes | Minigame id, as in `mg.start`. |
| `success` | `boolean` | yes | True when the player met the minigame's success condition. |
| `perfect` | `boolean` | yes | True when the player met the minigame's "perfect" condition (needed by everyone for Platinum). Implies `success`. |
| `score` | `number 0…1` | yes | Performance quality 0–1. Solo rooms: this is the completion fraction (§10.3 Solo). Otherwise it only adds individual score points. |
| `value` | `number \| null` | yes | Raw measurement for minigames whose team median or average steers the flight (MG-09, MG-16, MG-20, MG-22, MG-24), in the unit defined by the minigame; null otherwise. |
| `elapsedMs` | `int 0…120000` | yes | Local play time in milliseconds. |
| `finishedAtMs` | `TimeMs` | yes | Sender's estimate of the server clock when play ended. |
| `mode` | `MinigameMode` | yes | Input mode used. |

**Server validation** (after the common checks):

- `runId` is not the active run → STALE_ID.
- Sender already reported for this run → ALREADY_ANSWERED.
- `perfect` true with `success` false → BAD_PAYLOAD.

**Example**

```json
{"t":"mg.result","seq":1,"d":{"runId":"m1.mg08","minigameId":"MG-08","success":true,"perfect":false,"score":0.91,"value":null,"elapsedMs":19840,"finishedAtMs":1794650520000,"mode":"STANDARD"}}
```

### `mg.summary`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §10.3 (fraction and tiers), §10.4 (boosts), §11.2, §11.3, §17.4 |

The host closes the run: completion fraction, tier, boosts applied, Team Sync and score gained, and the fact for the result screen. Ends the run and clears the sticky `mg.start`. Individual failures are not listed (no shaming, §16).

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | Run id. |
| `minigameId` | `DataId` | yes | Minigame id. |
| `active` | `int 0…10` | yes | Active players (connected and loaded). |
| `succeeded` | `int 0…10` | yes | Active players who succeeded. |
| `fraction` | `number 0…1` | yes | Completion fraction f = succeeded / active; in solo rooms the player's `score`; 0 when nobody was active. |
| `tier` | `Tier` | yes | Tier reached. |
| `succeededIds` | `PlayerId[] (0–10, unique)` | yes | Players who succeeded. |
| `perfectIds` | `PlayerId[] (0–10, unique)` | yes | Players who were perfect. |
| `sparkle` | `boolean` | yes | True when the tier is NONE but at least one player succeeded (cosmetic sparkle only). |
| `boosts` | `BoostGrant[] (0–4)` | yes | Boosts applied for this run; empty for tier NONE. |
| `syncDelta` | `int 0…100` | yes | Team Sync gained: Gold/Platinum 25, Silver 15, Bronze 8, none 0. |
| `points` | `int 0…100000` | yes | Teamwork score gained: Platinum 250, Gold 200, Silver 120, Bronze 60, none 0. |
| `factId` | `DataId \| null` | yes | Fact shown on the result screen; null for none. |

**Server validation** (after the common checks):

- `runId` is not the active run → STALE_ID.

**Example**

```json
{"t":"mg.summary","seq":1,"d":{"runId":"m1.mg08","minigameId":"MG-08","active":4,"succeeded":4,"fraction":1,"tier":"GOLD","succeededIds":["p1","p2","p3","p4"],"perfectIds":["p2"],"sparkle":false,"boosts":[{"boost":"LOAD_MARGIN","tier":"GOLD","amount":15,"total":15,"unit":"PCT","capped":false,"source":"MINIGAME","sourceId":"MG-08"}],"syncDelta":25,"points":200,"factId":"F09"}}
```

### `mg.cancel`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §10.1 rule 3, §9.8 |

The host abandons the run without a summary (abort, phase jump). Phones leave the minigame screen; no boost, no penalty.

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | `RunId` | yes | Run id. |
| `reason` | `MgCancelReason` | yes | Why it was cancelled. |

**Server validation** (after the common checks):

- `runId` is not the active run → STALE_ID.

**Example**

```json
{"t":"mg.cancel","seq":1,"d":{"runId":"m1.mg08","reason":"ABORT"}}
```

<!-- group: Knowledge and debrief -->

**Knowledge and debrief**

### `kp.awarded`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §4.1 step 4, §11.3 Knowledge, §12.2 Knowledge Points |

Knowledge Points awarded by the host (correct predictions, trivia tiebreak, bonus rounds).

| Field | Type | Required | Description |
|---|---|---|---|
| `entries` | `object[] (1–10)` | yes | Awards. |
| `entries[].playerId` | `PlayerId` | yes | Player who earned them. |
| `entries[].kp` | `int 0…100000` | yes | Knowledge Points earned. |
| `entries[].reason` | `KpReason` | yes | Why. |
| `teamKp` | `int 0…10000000` | yes | Team Knowledge Points total after the awards. |

**Example**

```json
{"t":"kp.awarded","seq":1,"d":{"entries":[{"playerId":"p1","kp":50,"reason":"PREDICTION"},{"playerId":"p4","kp":50,"reason":"PREDICTION"}],"teamKp":250}}
```

### `codex.unlock`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | players listed in `d.to`; all players and spectators when `d.to` is null |
| Design | §4.1 step 7, §12.2 Mission Codex, §10.3 (Platinum badge) |

Codex entries unlocked by an event other than a vote commit. Each phone adds them to its personal collection (kept on the device).

| Field | Type | Required | Description |
|---|---|---|---|
| `codexIds` | `DataId[] (1–20, unique)` | yes | Codex entries unlocked. |
| `source` | `CodexSource` | yes | What unlocked them. |
| `badge` | `boolean` | yes | True when the unlock comes with a Codex badge (Platinum, Gold investigation). |
| `to` | `PlayerId[] (1–10, unique) \| null` | yes | Players who receive the unlock; null = every player and spectator. |

**Server validation** (after the common checks):

- A `to` entry that is not a player → UNKNOWN_PLAYER.

**Example**

```json
{"t":"codex.unlock","seq":1,"d":{"codexIds":["codex_mars_climate_orbiter"],"source":"MINIGAME","badge":false,"to":null}}
```

### `debrief.score`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §11.3, §11.4, §5.2, §8.5, §9.9 |
| Flags | sticky (single, cleared when the phase leaves DEBRIEF) |

Mission result for the debrief screens: outcome, score breakdown per the scoring formula, grade and objectives.

| Field | Type | Required | Description |
|---|---|---|---|
| `missionSeq` | `int 1…100000` | yes | Mission the score is for. |
| `contractId` | `DataId` | yes | Contract flown. |
| `outcome` | `MissionOutcome` | yes | Mission outcome. |
| `crewSafe` | `boolean \| null` | yes | Crewed contracts: whether the crew returned safely; null for uncrewed missions. |
| `total` | `int 0…1000000` | yes | Mission Score after multipliers. |
| `grade` | `Grade` | yes | Grade (S ≥ 9,000; A ≥ 7,500; B ≥ 6,000; C ≥ 4,000; D otherwise or crew lost). |
| `title` | `TextRef` | yes | Grade title text. |
| `breakdown` | `object` | yes | Terms of the scoring formula (§11.3). |
| `breakdown.objectives` | `number ≥ 0` | yes | Objective points. |
| `breakdown.efficiency` | `number ≥ 0` | yes | Efficiency points. |
| `breakdown.safetyRecovery` | `number ≥ 0` | yes | Safety & recovery points. |
| `breakdown.scienceData` | `number ≥ 0` | yes | Science / data points. |
| `breakdown.teamwork` | `number ≥ 0` | yes | Teamwork points. |
| `breakdown.knowledge` | `number ≥ 0` | yes | Knowledge points (score, not KP). |
| `breakdown.difficultyMult` | `number 0…10` | yes | Difficulty multiplier (0.8, 1.0 or 1.25). |
| `breakdown.boostMult` | `number 0…10` | yes | Score boost multiplier (1.0–1.5). |
| `objectives` | `object[] (0–8)` | yes | Contract objectives. |
| `objectives[].id` | `DataId` | yes | Objective id. |
| `objectives[].kind` | `ObjectiveKind` | yes | Objective kind. |
| `objectives[].met` | `boolean` | yes | Whether it was achieved. |
| `objectives[].points` | `int 0…100000` | yes | Points earned for it. |
| `retryAvailable` | `boolean` | yes | True when the host offers the retry option (§9.9). |

**Example**

```json
{"t":"debrief.score","seq":1,"d":{"missionSeq":1,"contractId":"C1","outcome":"SUCCESS","crewSafe":null,"total":7840,"grade":"A","title":{"key":"grade.A.title"},"breakdown":{"objectives":4000,"efficiency":330,"safetyRecovery":0,"scienceData":1200,"teamwork":1260,"knowledge":250,"difficultyMult":1,"boostMult":1.1},"objectives":[{"id":"c1_primary","kind":"PRIMARY","met":true,"points":3000},{"id":"c1_targets_10","kind":"SECONDARY","met":true,"points":500},{"id":"c1_all_targets","kind":"STRETCH","met":false,"points":0}],"retryAvailable":false}}
```

### `debrief.awards`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §11.5 (individual recognition, positive only), §14.2 screen 8 |
| Flags | sticky (single, cleared when the phase leaves DEBRIEF) |

Individual recognition. Every player appears and has at least one award. Only positive statistics are carried; there is no ranking.

| Field | Type | Required | Description |
|---|---|---|---|
| `players` | `object[] (1–10)` | yes | One entry per player. |
| `players[].playerId` | `PlayerId` | yes | Player. |
| `players[].awardIds` | `DataId[] (1–4, unique)` | yes | Awards (e.g. "best_callout", "budget_hawk", "fact_finder", "steady_hands", "team_player", "veto_visionary", "rocket_scientist", "calm_under_pressure"). |
| `players[].kp` | `int 0…1000000` | yes | Knowledge Points earned this mission. |
| `players[].goodCalls` | `int 0…10000` | yes | Good Calls made. |
| `players[].minigameSuccesses` | `int 0…10000` | yes | Minigames succeeded. |
| `players[].predictionsCorrect` | `int 0…10000` | yes | Correct predictions. |

**Example**

```json
{"t":"debrief.awards","seq":1,"d":{"players":[{"playerId":"p1","awardIds":["budget_hawk"],"kp":100,"goodCalls":1,"minigameSuccesses":7,"predictionsCorrect":2},{"playerId":"p2","awardIds":["best_callout"],"kp":50,"goodCalls":3,"minigameSuccesses":8,"predictionsCorrect":1}]}}
```

### `debrief.facts`

| | |
|---|---|
| Direction | host → server → client (relayed unchanged) |
| Sent by | host |
| Delivered to | all players and spectators |
| Design | §12.2 (debrief comparison), §9.9 (Lessons Learned), §2.2 (facts collected) |
| Flags | sticky (single, cleared when the phase leaves DEBRIEF) |

What the team learned: facts collected during the mission, Codex entries unlocked, the Lessons Learned card after a failure, and the "your rocket vs. a real one" comparison.

| Field | Type | Required | Description |
|---|---|---|---|
| `factIds` | `DataId[] (0–60, unique)` | yes | Facts shown during the mission. |
| `codexIds` | `DataId[] (0–60, unique)` | yes | Codex entries unlocked during the mission. |
| `lessonId` | `DataId \| null` | yes | Lessons Learned card earned; null when none. |
| `comparison` | `object \| null` | yes | Comparison with a real rocket; null when not available. |
| `comparison.twin` | `TextRef` | yes | Name of the real vehicle compared with. |
| `comparison.yourMassT` | `number ≥ 0` | yes | Lift-off mass of the team's rocket, t. |
| `comparison.twinMassT` | `number ≥ 0` | yes | Lift-off mass of the real vehicle, t (real-world approximate). |
| `comparison.yourDvMs` | `number ≥ 0` | yes | Total Δv of the team's rocket, m/s. |
| `comparison.twinDvMs` | `number ≥ 0` | yes | Total Δv of the real vehicle, m/s (real-world approximate). |

**Example**

```json
{"t":"debrief.facts","seq":1,"d":{"factIds":["F05","F09","F12"],"codexIds":["codex_gas_generator_cycle","codex_mars_climate_orbiter"],"lessonId":null,"comparison":{"twin":{"key":"twin.electron.name"},"yourMassT":14.2,"twinMassT":13,"yourDvMs":9890,"twinDvMs":9600}}}
```

## 14. Shared types

#### `RoomCode`

Room code: exactly 4 upper-case letters from A–Z without I and O (24-letter alphabet). Clients upper-case user input before sending.

Type: `string /^[A-HJ-NP-Z]{4}$/`

#### `Token`

Opaque reconnect token issued by the server (URL-safe, 16–64 characters). Stored in the browser sessionStorage (phones) or host persistent storage. Never shown on screen.

Type: `string /^[A-Za-z0-9_-]{16,64}$/`

#### `PlayerId`

Player identifier, unique within a room and never reused: "p" followed by a positive integer (p1, p2, …).

Type: `string /^p[1-9][0-9]{0,3}$/`

#### `SpectatorId`

Spectator identifier, unique within a room and never reused: "s" followed by a positive integer.

Type: `string /^s[1-9][0-9]{0,6}$/`

#### `Nickname`

Display nickname after server normalisation (NFC, trimmed, inner whitespace collapsed): 2–16 characters; Unicode letters, digits, space, underscore and hyphen; first and last character must be a letter or digit.

Type: `string /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,14}[\p{L}\p{N}]$/`

#### `DataId`

Identifier of an entry in the shared game data (`data/`): part, part category, contract, test, anomaly card, minigame, fact, codex entry, callout, console request, award, objective, validation rule, cosmetic. 1–48 characters.

Type: `string /^[A-Za-z0-9][A-Za-z0-9_.-]{0,47}$/`

#### `OptionId`

Identifier of one option inside a vote round. For PART votes it equals the part id; for CONTRACT votes the contract id; for PILOT votes a PlayerId; for quick votes an upper-case token defined in the vote-kind table (e.g. TEST, SKIP).

Type: `string /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,47}$/`

#### `RoundId`

Vote round identifier chosen by the host; unique within the room for its whole lifetime.

Type: `string /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$/`

#### `RunId`

Minigame run identifier chosen by the host; unique within the room.

Type: `string /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$/`

#### `PollId`

GO/NO-GO poll identifier chosen by the host; unique within the room.

Type: `string /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$/`

#### `AlertId`

Console alert identifier chosen by the host; unique within the room.

Type: `string /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$/`

#### `RequestId`

Ability request identifier chosen by the server; unique within the room.

Type: `string /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$/`

#### `LangTag`

BCP 47 language tag, lower-case primary subtag (e.g. "en", "ar", "pt-BR").

Type: `string /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/`

#### `TimeMs`

Absolute time on the server clock: integer milliseconds since the Unix epoch. Every `…AtMs` field in the protocol uses the server clock (see Clock).

Type: `int 0…9007199254740991`

#### `Uint32`

Unsigned 32-bit integer.

Type: `int 0…4294967295`

#### `OutcomeSeq`

Position of a server-resolved outcome in the room outcome log; starts at 1 and increases by 1 per outcome for the lifetime of the room.

Type: `int 1…2147483647`

#### `TextRef`

Reference to localised player-visible text. The protocol never carries free display text: `key` is a key of `data/strings/<lang>.json`, and `args` supplies substitution values. Receivers format numbers and units locally.

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | `string /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/` | yes | String-table key. |
| `args` | `map<string, string (0–64 chars) \| number> (≤ 8 keys)` | no | Substitution values by placeholder name. String values must themselves be data ids or string-table keys, never user text. |

#### `Avatar`

Player avatar (§3.1): astronaut suit colour and patch, both cosmetic ids.

| Field | Type | Required | Description |
|---|---|---|---|
| `suitId` | `DataId` | yes | Suit colour cosmetic id, e.g. "suit_orange". |
| `patchId` | `DataId` | yes | Patch cosmetic id, e.g. "patch_comet". |

#### `PlayerPrefs`

Per-device accessibility and language preferences (§16). Set by each phone, relayed to the host and all clients inside `room.state`.

| Field | Type | Required | Description |
|---|---|---|---|
| `lang` | `LangTag` | yes | UI language of this device. |
| `relaxed` | `boolean` | yes | Motor: Relaxed minigame mode (wider timing windows). |
| `oneButton` | `boolean` | yes | Motor: One-Button minigame alternative. |
| `holdToToggle` | `boolean` | yes | Motor: hold-to-press controls become toggles. |
| `reducedMotion` | `boolean` | yes | Motion: no shake, fewer particles, no flashing. |
| `highContrast` | `boolean` | yes | Visual: high-contrast mode. |
| `textScalePct` | `int 100…200` | yes | Visual: text scale in percent (100–200). |
| `screenReader` | `boolean` | yes | Visual: screen-reader labels requested. |
| `haptics` | `boolean` | yes | Whether the device wants `haptic.cue` vibrations. |

#### `RoomA11y`

Room-wide accessibility flags set by the host (§16). Phones apply each flag in addition to their own preferences.

| Field | Type | Required | Description |
|---|---|---|---|
| `slowTimers` | `boolean` | yes | Cognitive: every server-run vote and poll timer is multiplied by 1.5 (rounded up to a whole second). Default false. |
| `relaxedMinigames` | `boolean` | yes | Motor: every phone runs minigames in Relaxed mode. Default false. |
| `reducedMotion` | `boolean` | yes | Motion: reduced-motion on every device. Default false. |
| `highContrast` | `boolean` | yes | Visual: high contrast on every device. Default false. |
| `subtitles` | `boolean` | yes | Hearing: phones show subtitles for voice lines and callouts. Default true. |
| `explainTooltips` | `boolean` | yes | Cognitive: "Explain like I'm new" tooltips on every device. Default false. |

#### `RoomSettings`

Complete host settings of a room. Defaults apply at `room.create`.

| Field | Type | Required | Description |
|---|---|---|---|
| `roleAssignMode` | `RoleAssignMode` | yes | Role assignment mode (§3.3). Default RANDOM. Lobby-only. |
| `voteTimerS` | `int 10…60` | yes | Duration of the VOTE stage of PART and CHOICE votes, seconds (§4.1 step 5). Default 20. |
| `inspectTimerS` | `int 5…60` | yes | Duration of the INSPECT stage, seconds (§4.1 step 2). Default 20. |
| `tallyVisibility` | `TallyVisibility` | yes | Live tallies open or hidden (§4.1 step 5). Default OPEN. |
| `strictMajority` | `boolean` | yes | Strict-majority runoff on or off (§4.2). Default false. |
| `assistLevel` | `AssistLevel` | yes | Difficulty / assist level (§9.3). Default ENGINEER. Lobby-only. |
| `audienceVoteWeight` | `int 0…1` | yes | Audience vote weight (§13.7): 0 = advisory only (default), 1 = the audience counts as one extra player ballot (judging-day mode). |
| `pilotRotation` | `PilotRotation` | yes | Pilot rotation rule (§9.4). Default PER_SEGMENT. |
| `pilotSelect` | `PilotSelect` | yes | How the next pilot is chosen (§9.4). Default ROTATION. |
| `passTheControls` | `boolean` | yes | Phones may act as virtual gamepads (§9.4). Default false. |
| `lang` | `LangTag` | yes | Language of the host screen. Default "en". |
| `a11y` | `RoomA11y` | yes | Room-wide accessibility flags (§16). |

#### `SettingsPatch`

Partial host settings: only the listed fields change. `a11y`, when present, replaces all six flags.

| Field | Type | Required | Description |
|---|---|---|---|
| `roleAssignMode` | `RoleAssignMode` | no | Role assignment mode (§3.3). Default RANDOM. Lobby-only. |
| `voteTimerS` | `int 10…60` | no | Duration of the VOTE stage of PART and CHOICE votes, seconds (§4.1 step 5). Default 20. |
| `inspectTimerS` | `int 5…60` | no | Duration of the INSPECT stage, seconds (§4.1 step 2). Default 20. |
| `tallyVisibility` | `TallyVisibility` | no | Live tallies open or hidden (§4.1 step 5). Default OPEN. |
| `strictMajority` | `boolean` | no | Strict-majority runoff on or off (§4.2). Default false. |
| `assistLevel` | `AssistLevel` | no | Difficulty / assist level (§9.3). Default ENGINEER. Lobby-only. |
| `audienceVoteWeight` | `int 0…1` | no | Audience vote weight (§13.7): 0 = advisory only (default), 1 = the audience counts as one extra player ballot (judging-day mode). |
| `pilotRotation` | `PilotRotation` | no | Pilot rotation rule (§9.4). Default PER_SEGMENT. |
| `pilotSelect` | `PilotSelect` | no | How the next pilot is chosen (§9.4). Default ROTATION. |
| `passTheControls` | `boolean` | no | Phones may act as virtual gamepads (§9.4). Default false. |
| `lang` | `LangTag` | no | Language of the host screen. Default "en". |
| `a11y` | `RoomA11y` | no | Room-wide accessibility flags (§16). |

#### `PlayerInfo`

One player slot in `room.state`.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `PlayerId` | yes | Player id. |
| `slot` | `int 1…10` | yes | Seat number 1–10 (display order; the lowest free seat is assigned at join). |
| `nickname` | `Nickname` | yes | Display nickname. |
| `avatar` | `Avatar` | yes | Avatar. |
| `connected` | `boolean` | yes | False while the player is disconnected and the slot is being held. |
| `slotExpiresAtMs` | `TimeMs \| null` | yes | When the held slot is released (server clock); null while connected. Frozen while the game is paused. |
| `vetoAvailable` | `boolean` | yes | True until the player uses the one veto of this mission (§4.2). |
| `prefs` | `PlayerPrefs` | yes | Accessibility and language preferences of the device. |

#### `RoleGroup`

A set of roles held together by one player (§3.3 role merging).

| Field | Type | Required | Description |
|---|---|---|---|
| `lead` | `RoleId` | yes | First role of the group in canonical order; identifies the group in `roles.pick`. |
| `roles` | `RoleId[] (1–10, unique)` | yes | All roles of the group in canonical order. |
| `playerId` | `PlayerId \| null` | yes | Holder, or null while the group is unassigned (lobby, PICK/VOTE modes). |

#### `Delta`

One Readiness Dashboard metric after a hypothetical or applied change, computed by the host (§6.3, §14.3 "IF CHOSEN").

| Field | Type | Required | Description |
|---|---|---|---|
| `metric` | `MetricId` | yes | Metric (unit in the id). |
| `value` | `number` | yes | Value of the metric after the change. |
| `delta` | `number` | yes | Change against the current build (value after − value before). |
| `rating` | `Rating` | yes | Colour class of the change. |

#### `VoteOption`

One option of a vote round with host-computed preview numbers.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `OptionId` | yes | Option id, unique within the round. |
| `partId` | `DataId \| null` | yes | Catalog part id for PART votes (the phone renders the Part Card from its bundled catalog); null otherwise. |
| `label` | `TextRef \| null` | yes | Display text for options that are not catalog parts or contracts; null when the client derives the text from `kind` + `id`. |
| `costM` | `number ≥ 0` | yes | Cost in $M (game value) used by the all-abstain "cheapest option" rule. 0 for options without a cost. |
| `afford` | `Afford` | yes | Affordability (§4.2). |
| `overBudgetByM` | `number ≥ 0` | yes | Amount over the remaining budget in $M for the red banner; 0 when within budget. |
| `overScheduleByDays` | `number ≥ 0` | yes | Days over the remaining schedule; 0 when within schedule. |
| `willNotFly` | `boolean` | yes | True when choosing it makes the rocket unflyable now ("Will not fly" warning, §4.2). |
| `fixExists` | `boolean` | yes | Only meaningful when `willNotFly`: true when a later vote can still fix it. `willNotFly && !fixExists` makes the option unwinnable. |
| `warnings` | `TextRef[] (0–4)` | yes | Explanations for the warnings (e.g. the §6.11 rule text). |
| `deltas` | `Delta[] (0–16)` | yes | "If chosen" dashboard preview against the current build. |

#### `OptionCount`

Number of ballots for one option.

| Field | Type | Required | Description |
|---|---|---|---|
| `optionId` | `OptionId` | yes | Option id. |
| `n` | `int 0…100000` | yes | Ballot count. |

#### `Question`

A multiple-choice question with its answer (host → server only).

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `DataId` | yes | Question or fact id in the game data. |
| `prompt` | `TextRef` | yes | Question text. |
| `choices` | `TextRef[] (2–4)` | yes | Answer choices, in display order. |
| `correctIndex` | `int 0…3` | yes | Zero-based index of the correct choice. Never sent to phones before the answer window closes. |

#### `QuestionPublic`

A multiple-choice question without its answer (server → clients).

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `DataId` | yes | Question or fact id in the game data. |
| `prompt` | `TextRef` | yes | Question text. |
| `choices` | `TextRef[] (2–4)` | yes | Answer choices, in display order. |

#### `VoteTimers`

Host overrides of stage durations in milliseconds. A missing field uses the profile default. Overrides are used exactly as given (not scaled by `a11y.slowTimers`).

| Field | Type | Required | Description |
|---|---|---|---|
| `revealMs` | `int 0…10000` | no | REVEAL duration; 0 skips the stage. |
| `predictMs` | `int 3000…60000` | no | PREDICT duration. |
| `inspectMs` | `int 0…120000` | no | INSPECT duration; 0 skips the stage. |
| `voteMs` | `int 3000…120000` | no | VOTE duration. |
| `runoffMs` | `int 3000…60000` | no | RUNOFF duration. |
| `triviaMs` | `int 3000…60000` | no | TIEBREAK_TRIVIA duration. |
| `pickMs` | `int 3000…30000` | no | TIEBREAK_PICK duration. |
| `resultMs` | `int 0…15000` | no | RESULT duration; 0 skips the stage. |

#### `StagePlan`

One planned stage of a vote round.

| Field | Type | Required | Description |
|---|---|---|---|
| `stage` | `VoteStage` | yes | Stage. |
| `durationMs` | `int 0…120000 \| null` | yes | Planned duration; null for an untimed stage (solo VOTE). |

#### `BoostGrant`

One boost applied by the host (§10.4, §11.1).

| Field | Type | Required | Description |
|---|---|---|---|
| `boost` | `BoostId` | yes | Boost type. |
| `tier` | `Tier` | yes | Tier that produced it (NONE when the source is not a minigame). |
| `amount` | `number` | yes | Amount granted by this event, in `unit`. |
| `total` | `number` | yes | Mission total for this boost type after the grant and after the cap, in `unit`. |
| `unit` | `BoostUnit` | yes | Unit of `amount` and `total`. |
| `capped` | `boolean` | yes | True when the per-mission cap reduced the grant. |
| `source` | `BoostSource` | yes | What produced the boost. |
| `sourceId` | `DataId \| null` | yes | Id of the source (minigame id, role id, lesson id…) or null. |

#### `MgMap`

Open key/value bag for minigame parameters and shared state. Keys and meanings are defined per minigame in `data/minigames.json`; the server relays it without interpretation. At most 32 keys.

Type: `map<string, number \| string (0–64 chars) \| boolean \| number[] (0–64)> (≤ 32 keys)`

#### `TelemetryValues`

Telemetry values by channel id; only the channels of the addressed role are present.

| Field | Type | Required | Description |
|---|---|---|---|
| `met_s` | `number` | no | Channel met_s. |
| `altitude_km` | `number` | no | Channel altitude_km. |
| `velocity_ms` | `number` | no | Channel velocity_ms. |
| `countdown_s` | `number` | no | Channel countdown_s. |
| `hold` | `number` | no | Channel hold. |
| `consoles_red` | `number` | no | Channel consoles_red. |
| `consoles_amber` | `number` | no | Channel consoles_amber. |
| `chamber_pressure_pct` | `number` | no | Channel chamber_pressure_pct. |
| `engines_running` | `number` | no | Channel engines_running. |
| `engines_total` | `number` | no | Channel engines_total. |
| `engine_health_pct` | `number` | no | Channel engine_health_pct. |
| `prop_stage1_pct` | `number` | no | Channel prop_stage1_pct. |
| `prop_stage2_pct` | `number` | no | Channel prop_stage2_pct. |
| `throttle_pct` | `number` | no | Channel throttle_pct. |
| `q_kpa` | `number` | no | Channel q_kpa. |
| `load_pct` | `number` | no | Channel load_pct. |
| `g_load` | `number` | no | Channel g_load. |
| `vibration_pct` | `number` | no | Channel vibration_pct. |
| `traj_error_km` | `number` | no | Channel traj_error_km. |
| `pitch_error_deg` | `number` | no | Channel pitch_error_deg. |
| `heading_error_deg` | `number` | no | Channel heading_error_deg. |
| `apoapsis_km` | `number` | no | Channel apoapsis_km. |
| `periapsis_km` | `number` | no | Channel periapsis_km. |
| `inclination_deg` | `number` | no | Channel inclination_deg. |
| `window_remaining_s` | `number` | no | Channel window_remaining_s. |
| `dv_remaining_ms` | `number` | no | Channel dv_remaining_ms. |
| `battery_pct` | `number` | no | Channel battery_pct. |
| `power_balance_w` | `number` | no | Channel power_balance_w. |
| `temp_c` | `number` | no | Channel temp_c. |
| `cabin_pressure_kpa` | `number` | no | Channel cabin_pressure_kpa. |
| `cabin_co2_pct` | `number` | no | Channel cabin_co2_pct. |
| `signal_pct` | `number` | no | Channel signal_pct. |
| `data_downlinked_gb` | `number` | no | Channel data_downlinked_gb. |
| `next_pass_s` | `number` | no | Channel next_pass_s. |
| `in_pass` | `number` | no | Channel in_pass. |
| `targets_captured` | `number` | no | Channel targets_captured. |
| `targets_total` | `number` | no | Channel targets_total. |
| `payload_health_pct` | `number` | no | Channel payload_health_pct. |
| `data_stored_gb` | `number` | no | Channel data_stored_gb. |
| `entry_angle_deg` | `number` | no | Channel entry_angle_deg. |
| `heat_load_pct` | `number` | no | Channel heat_load_pct. |
| `landing_ellipse_km` | `number` | no | Channel landing_ellipse_km. |
| `descent_rate_ms` | `number` | no | Channel descent_rate_ms. |
| `chutes_deployed` | `number` | no | Channel chutes_deployed. |
| `budget_left_m` | `number` | no | Channel budget_left_m. |
| `schedule_margin_days` | `number` | no | Channel schedule_margin_days. |
| `score_pts` | `number` | no | Channel score_pts. |
| `sync_meter` | `number` | no | Channel sync_meter. |

#### `PollEntry`

One GO/NO-GO answer.

| Field | Type | Required | Description |
|---|---|---|---|
| `playerId` | `PlayerId` | yes | Player who was called. |
| `roles` | `RoleId[] (1–10, unique)` | yes | Roles (consoles) that player answered for. |
| `answer` | `PollAnswer` | yes | Recorded answer. |

#### `ReactionCounts`

Number of reactions per emoji.

| Field | Type | Required | Description |
|---|---|---|---|
| `ROCKET` | `int 0…100000` | yes | 🚀 count. |
| `THUMBS_UP` | `int 0…100000` | yes | 👍 count. |
| `GRIMACE` | `int 0…100000` | yes | 😬 count. |
| `FIRE` | `int 0…100000` | yes | 🔥 count. |
| `THINKING` | `int 0…100000` | yes | 🤔 count. |

## 15. Enumerations

#### `ClientKind`

Kind of application opening the connection.

| Value | Meaning |
|---|---|
| `HOST` | The Unity host application (big screen). |
| `PHONE` | The phone web client (player or spectator). |

#### `JoinAs`

Requested membership kind in `room.join`.

| Value | Meaning |
|---|---|
| `PLAYER` |  |
| `SPECTATOR` |  |

#### `MemberKind`

Membership kind of a phone connection.

| Value | Meaning |
|---|---|
| `PLAYER` |  |
| `SPECTATOR` |  |

#### `ConnKind`

Kind of a resumed connection.

| Value | Meaning |
|---|---|
| `HOST` |  |
| `PLAYER` |  |
| `SPECTATOR` |  |

#### `SpectatorReason`

Why a joiner was made a spectator.

| Value | Meaning |
|---|---|
| `REQUESTED` | The client asked for `as: "SPECTATOR"`. |
| `LATE_JOIN` | Asked to be a player but the Build phase had started (§3.1 rule 4). Promoted at the next vote round. |
| `ROOM_FULL` | Asked to be a player but all 10 slots are taken. Promoted when a slot frees and a vote round opens. |

#### `ByeReason`

Reason the server is about to close the connection. Each value has a fixed WebSocket close code.

| Value | Meaning |
|---|---|
| `ROOM_CLOSED` | Close code 4000. The host sent `room.close`. |
| `VERSION_MISMATCH` | Close code 4001. `hello.protocolVersion` is not the server version. |
| `KICKED` | Close code 4002. The host sent `room.kick` for this player. The token is revoked. |
| `REPLACED` | Close code 4003. The same token resumed on a newer connection. |
| `ROOM_EXPIRED` | Close code 4004. The host stayed away longer than the room hold time (10 min). |
| `HANDSHAKE_TIMEOUT` | Close code 4005. No `hello` within 5 s of connecting, or no `room.create` / `room.join` / `room.resume` within 30 s of `hello.ok`. |
| `FLOOD` | Close code 4006. Sustained rate-limit violation. |
| `PROTOCOL_VIOLATION` | Close code 4007. Fatal error (see error table). |
| `SERVER_SHUTDOWN` | Close code 4008. The server process is stopping. |
| `LEFT` | Close code 4009. Acknowledges `room.leave`. |
| `IDLE_TIMEOUT` | Close code 4010. No frame received for 15 s. |

#### `ErrorCode`

Error codes carried by `error`.

| Value | Meaning |
|---|---|
| `BAD_ENVELOPE` | FATAL. Frame is not a JSON object with exactly `t` (string), `seq` (integer) and `d` (object), is a binary frame, or `seq` is not greater than the previous `seq` on this connection. |
| `FRAME_TOO_LARGE` | FATAL. Frame larger than `hello.ok.maxFrameBytes` (before `hello.ok`: 1,024 bytes). |
| `HANDSHAKE_REQUIRED` | FATAL. First message was not `hello`, or `hello` was sent twice. |
| `VERSION_MISMATCH` | FATAL. `hello.protocolVersion` differs from the server version; `serverProtocolVersion` is set. |
| `FLOOD` | FATAL. More than 3× the overall message or byte budget for 2 consecutive seconds. |
| `UNKNOWN_TYPE` | `t` is not a message type the server accepts from any sender. |
| `BAD_PAYLOAD` | `d` fails the schema of `t` (missing or mistyped known field, value out of range). `field` names the first failing field. Unknown fields are ignored, never an error. |
| `FORBIDDEN` | This connection kind may not send `t` (e.g. a spectator sent `vote.veto`, a phone sent `vote.open`). |
| `NOT_IN_ROOM` | The message needs room membership but this connection has not joined, created or resumed a room. |
| `ALREADY_IN_ROOM` | `room.create`, `room.join` or `room.resume` on a connection that is already in a room. |
| `ROOM_NOT_FOUND` | No live room has this code. |
| `TOKEN_INVALID` | Unknown, revoked or expired token (slot hold of 3 min elapsed, player kicked, room gone). |
| `NICK_REJECTED` | Nickname blocked by the profanity filter; `suggestion` carries a safe nickname from the filtered list. |
| `NICK_TAKEN` | Another player in the room has the same nickname (case-insensitive); `suggestion` carries a free variant. |
| `RATE_LIMITED` | Per-type rate limit exceeded; the message was dropped. `retryAfterMs` is set. |
| `PAUSED` | Gameplay input while the game is paused (including while the host is disconnected). |
| `WRONG_PHASE` | Not allowed in the current phase (e.g. `player.profile` outside LOBBY). |
| `WRONG_STAGE` | Not allowed in the current vote stage (e.g. `vote.cast` during INSPECT). |
| `INVALID_TRANSITION` | `phase.set` asks for a transition that is not in the phase graph, or an inconsistent phase/sub/flightPhase combination. |
| `SETTING_LOCKED` | A lobby-only setting was changed outside LOBBY. |
| `UNKNOWN_PLAYER` | A referenced PlayerId is not a player of this room. |
| `STALE_ID` | The `roundId`, `pollId`, `runId`, `alertId` or `requestId` does not match the active one. |
| `DUPLICATE_ID` | The host reused a `roundId`, `pollId` or `runId` already used in this room. |
| `ROUND_ACTIVE` | The host opened a vote or poll while another vote or poll is active. |
| `NO_WINNABLE_OPTION` | `vote.open` has no winnable option. |
| `UNKNOWN_OPTION` | `optionId` is not an option of the round (or not a current candidate in RUNOFF / TIEBREAK stages). |
| `OPTION_VETOED` | The option has been vetoed. |
| `OPTION_NOT_WINNABLE` | The option is marked "Will not fly" with no fix available (§4.2 Invalid combos). |
| `OPTION_UNAFFORDABLE` | The option is over budget/schedule and Emergency Funding is spent or cannot cover it (§4.2 Affordability). |
| `NOT_A_VOTER` | The player is not in the round electorate (`vote.opened.voters`). |
| `VETO_NOT_ALLOWED` | This vote kind or stage does not allow vetoes. |
| `VETO_USED` | The player already used the one veto of this mission. |
| `VETO_MIN_OPTIONS` | The veto would leave fewer than two winnable options. |
| `NOT_ROLE_HOLDER` | The sender does not hold the role required for the action. |
| `ALREADY_ANSWERED` | A prediction, trivia answer, poll answer or minigame result was already recorded for this sender. |
| `NOT_YOUR_TURN` | The sender is not the player currently called (poll) or the trivia winner (pick). |
| `ABILITY_USED` | The once-per-mission ability of that role is already spent. |
| `ABILITY_REJECTED` | The host declined the ability (`ability.resolve.accepted = false`). The ability stays available. |
| `ROLE_TAKEN` | `roles.pick`: another player already holds that role group. |
| `INVALID_ASSIGNMENT` | `roles.set`: the assignment is not a partition of all ten roles over current players. |
| `NOT_PILOT` | Pilot or co-pilot input from a phone that is not assigned to that seat, or the seat input source is HOST_DEVICE. |
| `INTERNAL` | Unexpected server fault. The message may or may not have been applied. |

#### `RoleId`

Mission Control role (§3.3), in canonical order.

| Value | Meaning |
|---|---|
| `FLIGHT` | Flight Director. Ability: Decision Time. |
| `BOOSTER` | Launch vehicle propulsion. Ability: Hot-Fire Discount. |
| `STRUCT` | Structures & materials. Ability: Reinforce. |
| `GUIDO` | Guidance. Ability: Course Correct. |
| `FIDO` | Flight dynamics. Ability: Window Extension. |
| `EECOM` | Power, thermal & life support. Ability: Load Shed. |
| `INCO` | Communications. Ability: Priority Pass. |
| `PAYLOAD` | Payload & science. Ability: Golden Hour. |
| `RETRO` | Reentry & recovery. Ability: Recovery Fleet. |
| `PM` | Program manager. Ability: Emergency Funding. |

#### `RoleAssignMode`

How roles are assigned in the lobby (§3.3).

| Value | Meaning |
|---|---|
| `RANDOM` | Default. Role groups are dealt at random when roles lock. |
| `PICK` | Players claim a role group, first come first served (`roles.pick`). |
| `VOTE` | Players vote who is the Flight Director (`roles.vote`); other groups are dealt at random. |

#### `TallyVisibility`

Whether live vote tallies are shown before the result (§4.1 step 5).

| Value | Meaning |
|---|---|
| `OPEN` |  |
| `HIDDEN` |  |

#### `AssistLevel`

Difficulty / assist level (§9.3).

| Value | Meaning |
|---|---|
| `CADET` | Score ×0.8. |
| `ENGINEER` | Default. Score ×1.0. |
| `FLIGHT_DIRECTOR` | Score ×1.25. |

#### `PilotRotation`

Pilot rotation rule (§9.4).

| Value | Meaning |
|---|---|
| `PER_SEGMENT` | Default. A new pilot for each flight segment. |
| `SINGLE` | One pilot for the whole flight. |

#### `PilotSelect`

How the next pilot is chosen (§9.4).

| Value | Meaning |
|---|---|
| `ROTATION` | Default. Next player in slot order who has not flown yet. |
| `VOTE` | A `PILOT` vote before each segment. |

#### `GameMode`

Game mode (§13). Informational for clients; the server does not interpret it.

| Value | Meaning |
|---|---|
| `QUICK` |  |
| `CAMPAIGN` |  |
| `SANDBOX` |  |
| `DAILY` |  |
| `HERITAGE` |  |
| `CLASSROOM` |  |
| `SOLO` |  |
| `SPEEDRUN` |  |
| `BUDGET_CRUNCH` |  |

#### `Phase`

Top-level game phase (§17.3).

| Value | Meaning |
|---|---|
| `LOBBY` |  |
| `BRIEFING` |  |
| `CONTRACT_VOTE` |  |
| `BUILD` |  |
| `FRR` |  |
| `COUNTDOWN` |  |
| `FLIGHT` |  |
| `DEBRIEF` |  |
| `CAMPAIGN_HUB` |  |

#### `SubPhase`

Sub-state inside a phase (§17.3).

| Value | Meaning |
|---|---|
| `NONE` | Any phase. |
| `VOTE_ROUND` | BUILD only. |
| `TEST` | BUILD only. |
| `ANOMALY` | BUILD only. |
| `REVIEW` | BUILD only (PDR, CDR). |
| `FLYING` | FLIGHT only. |
| `ABORT` | FLIGHT only. |
| `SUMMARY` | DEBRIEF only. |
| `INVESTIGATION` | DEBRIEF only. |

#### `ReviewId`

Design review (§6.9).

| Value | Meaning |
|---|---|
| `PDR` |  |
| `CDR` |  |
| `FRR` |  |

#### `FlightPhase`

Flight phase (§9.1). F0–F1 belong to COUNTDOWN, F2–F13 to FLIGHT. The parallel booster-return track F7b is signalled by `boosterTrack`, not by a value here; F14 is the DEBRIEF phase.

| Value | Meaning |
|---|---|
| `F0` |  |
| `F1` |  |
| `F2` |  |
| `F3` |  |
| `F4` |  |
| `F5` |  |
| `F6` |  |
| `F7` |  |
| `F8` |  |
| `F9` |  |
| `F10` |  |
| `F11` |  |
| `F12` |  |
| `F13` |  |

#### `FlightSegment`

Flight segment used for pilot rotation (§9.4).

| Value | Meaning |
|---|---|
| `ASCENT` | F2–F7. |
| `ORBIT` | F8–F9. |
| `ENTRY` | F10–F11. |
| `LANDING` | F12–F13. |

#### `VoteKind`

Kind of vote round. The kind selects the stage profile (see Vote profiles).

| Value | Meaning |
|---|---|
| `PART` | Part selection round (§4.1). FULL profile. |
| `CONTRACT` | Contract selection (§4.3). CHOICE profile with INSPECT. |
| `REWORK_CATEGORY` | Which category to reopen after a Rework decision (§6.9). CHOICE profile. |
| `LIVERY` | Paint colour (§6.10). CHOICE profile. |
| `PATCH` | Final mission patch (MG-30, §13.4). CHOICE profile. |
| `PILOT` | Who flies the next segment (§9.4); option ids are PlayerIds. CHOICE profile. |
| `TEST` | Run an optional test or skip it (§6.6). QUICK profile. Option ids: TEST, SKIP. |
| `ANOMALY` | Response to an anomaly card (§6.8). QUICK profile. Option ids come from the anomaly data. |
| `REVIEW` | Design review outcome (§6.9). QUICK profile. Option ids: PASS, REWORK. |
| `ABORT` | Abort or continue (§9.8). QUICK profile, 5 s. Option ids: ABORT, CONTINUE. |
| `FLIGHT_DECISION` | Other in-flight two-way decisions: burn now or wait, skip entry or direct entry (§4.3). QUICK profile. |
| `MCM` | Mission Control Moment choice (§11.2). QUICK profile, 5 s. Option ids: PERFECT_PHASE, SAVE_THE_MISSION, GOLDEN_WINDOW. |

#### `VoteStage`

Stage of a vote round (§4.1).

| Value | Meaning |
|---|---|
| `REVEAL` |  |
| `PREDICT` |  |
| `INSPECT` |  |
| `VOTE` |  |
| `RUNOFF` |  |
| `TIEBREAK_TRIVIA` |  |
| `TIEBREAK_PICK` |  |
| `RESULT` |  |
| `CLOSED` |  |

#### `Afford`

Affordability of an option, computed by the host (§4.2 Affordability).

| Value | Meaning |
|---|---|
| `OK` | Within remaining budget and schedule. |
| `EMERGENCY_FUNDING` | Over budget or schedule, but allowed if PM's Emergency Funding is still available; winning triggers it. |
| `NEVER` | Cannot be afforded even with Emergency Funding. Cannot be voted for. |

#### `MetricId`

Readiness Dashboard metric (§6.3). The unit is part of the identifier.

| Value | Meaning |
|---|---|
| `TOTAL_DV_MS` | Total Δv, m/s. |
| `LIFTOFF_TWR` | Lift-off thrust-to-weight ratio, dimensionless. |
| `UPPER_TWR` | Upper stage thrust-to-weight ratio, dimensionless. |
| `TOTAL_MASS_T` | Total mass, tonnes. |
| `COST_M` | Cost spent, $M (game value). |
| `BUDGET_LEFT_M` | Budget left, $M (game value). |
| `SCHEDULE_DAYS` | Schedule used, days (game value). |
| `SCHEDULE_MARGIN_DAYS` | Days left before the deadline (game value). |
| `SUCCESS_PCT` | Estimated mission success, percent 0–100. |
| `SUCCESS_BAND_PCT` | Half-width of the uncertainty band, percentage points. |
| `POWER_BALANCE_W` | Payload power generation minus consumption, W. |
| `DATA_BUDGET_GB_DAY` | Downlink capacity minus data generated, GB/day. |
| `ENTRY_SPEED_RATING_KMS` | Heat shield maximum entry speed rating, km/s. |
| `STABILITY` | 1 = centre of pressure aft of centre of mass (stable), 0 = unstable. |

#### `Rating`

Colour class of a value or delta (§14.4).

| Value | Meaning |
|---|---|
| `GOOD` | Green. |
| `MARGINAL` | Amber. |
| `BAD` | Red. |
| `NEUTRAL` | No colour. |

#### `TagKind`

Role tag on an option (§3.4).

| Value | Meaning |
|---|---|
| `RECOMMENDED` |  |
| `CONCERN` |  |

#### `BallotChange`

Why the server reports a ballot to its owner.

| Value | Meaning |
|---|---|
| `CAST` | A `vote.cast` was accepted. |
| `OPTION_REMOVED` | The option voted for was vetoed, or stopped being winnable because Emergency Funding was spent; the ballot is now empty. |
| `RUNOFF_RESET` | A runoff started; all ballots are empty again. |
| `SNAPSHOT` | Sent during a reconnect snapshot. |

#### `ResolveMethod`

How the winner of a vote round was decided (§4.2).

| Value | Meaning |
|---|---|
| `PLURALITY` | Most votes in the first round. |
| `RUNOFF` | Most votes in the runoff. |
| `DECISION_TIME` | Tie broken by the option named in FLIGHT's Decision Time ability. |
| `FLIGHT_TIEBREAK` | Tie broken by FLIGHT's ballot (tie-breaker 1). |
| `TRIVIA` | Tie broken by the trivia sudden-death winner (tie-breaker 2). |
| `COIN_FLIP` | Tie broken by the seeded draw (tie-breaker 3). |
| `ABSTAIN_RECOMMENDED` | Nobody voted; the role-holder's Recommended option won. |
| `ABSTAIN_DEFAULT` | Nobody voted; the host-supplied default option won. |
| `ABSTAIN_CHEAPEST` | Nobody voted; the cheapest winnable option won. |

#### `CloseCause`

Why the voting stage ended.

| Value | Meaning |
|---|---|
| `TIMER` | The stage timer ran out. |
| `ALL_VOTED` | Every connected voter had voted (early close; not for PART). |
| `SOLO` | Single-player room: the first ballot closes the vote. |
| `DECISION_TIME` | FLIGHT used Decision Time. |
| `HOST` | The host sent `vote.close`. |

#### `CancelReason`

Why a vote round was cancelled without a result.

| Value | Meaning |
|---|---|
| `HOST` | The host sent `vote.cancel`. |
| `PHASE_CHANGE` | The host changed `phase` while the round was active. |

#### `PingId`

Quick ping (§3.4).

| Value | Meaning |
|---|---|
| `TOO_EXPENSIVE` | "Too expensive!" |
| `TOO_HEAVY` | "Too heavy!" |
| `LIKE_THIS` | "I like this one" |
| `CHECK_DRAWBACK` | "Check the drawback!" |
| `NEED_MORE_DV` | "Need more Δv" |
| `TEST_IT_FIRST` | "Test it first" |
| `TRUST_ME` | "Trust me" |
| `AGREED` | "Agreed" |

#### `ReactionId`

Emoji reaction (§3.4).

| Value | Meaning |
|---|---|
| `ROCKET` | 🚀 |
| `THUMBS_UP` | 👍 |
| `GRIMACE` | 😬 |
| `FIRE` | 🔥 |
| `THINKING` | 🤔 |

#### `GoNoGo`

A player's GO/NO-GO answer.

| Value | Meaning |
|---|---|
| `GO` |  |
| `NO_GO` |  |

#### `PollAnswer`

Recorded GO/NO-GO answer.

| Value | Meaning |
|---|---|
| `GO` | GO. |
| `NO_GO` | NO-GO. |
| `NO_ANSWER` | No answer in time, or the player was disconnected. Does not block (counts as GO for `allGo`). |

#### `PollContext`

Where the GO/NO-GO poll happens (§4.3, §6.9).

| Value | Meaning |
|---|---|
| `FRR` | Flight Readiness Review. |
| `LAUNCH` | Final poll before launch (countdown). |

#### `AbilityTrigger`

What spent a role ability.

| Value | Meaning |
|---|---|
| `PLAYER` | The role-holder used it (`ability.use`). |
| `OVER_BUDGET_WIN` | PM only: an option with `afford = EMERGENCY_FUNDING` won a vote (§4.2). |
| `HOST` | The host spent it through a game event (`ability.consume`), e.g. the "use Emergency Funding" anomaly response (§6.8). |

#### `AbilityRejectReason`

Why the host declined an ability.

| Value | Meaning |
|---|---|
| `NOT_APPLICABLE` | The ability has nothing to act on in this mission (e.g. Recovery Fleet on a mission with no recovery). |
| `WRONG_PHASE` | The ability cannot be used in the current phase. |
| `BAD_TARGET` | `stageIndex` missing or not a stage of this vehicle. |

#### `AbilityConsumeReason`

Why the host spent an ability without a player request.

| Value | Meaning |
|---|---|
| `ANOMALY_RESPONSE` |  |
| `GAME_EVENT` |  |

#### `PauseReason`

Why the game is paused (§17.7, §13.3 Classroom).

| Value | Meaning |
|---|---|
| `HOST_REQUEST` |  |
| `HOST_DISCONNECTED` |  |

#### `NoticeKind`

Kind of host notice shown on phones.

| Value | Meaning |
|---|---|
| `CAPCOM` | CAPCOM radio line / subtitle (§12.2, §16 Hearing). |
| `HINT` | AI Flight Director hint (§3.2 solo). |
| `SUMMARY` | "What just happened" summary after a phase (§16 Cognitive). |
| `DISCUSSION` | Classroom discussion prompt (§13.3). |
| `FACT` | Fact moment (§12); `factId` is set. |
| `WARNING` | Validation or risk warning. |

#### `Severity`

Design-review issue severity (§6.9, §6.11).

| Value | Meaning |
|---|---|
| `BLOCKER` |  |
| `MAJOR` |  |
| `MINOR` |  |

#### `BuildEventKind`

Kind of build-phase event shown in the phone feed.

| Value | Meaning |
|---|---|
| `TEST_RESULT` |  |
| `FLAW_FOUND` |  |
| `FLAW_FIXED` |  |
| `ANOMALY_DRAWN` |  |
| `ANOMALY_RESOLVED` |  |
| `REVIEW_OPENED` |  |
| `REVIEW_PASSED` |  |
| `REWORK_OPENED` |  |
| `DEADLINE_SLIP` |  |
| `LESSON_APPLIED` |  |

#### `EventSeverity`

Severity of a flight event.

| Value | Meaning |
|---|---|
| `INFO` |  |
| `CAUTION` |  |
| `WARNING` |  |
| `CRITICAL` |  |

#### `InputSource`

Where a pilot seat reads its input from (§9.4 Pass the controls).

| Value | Meaning |
|---|---|
| `HOST_DEVICE` | Keyboard, gamepad or touch on the host device. |
| `PHONE` | The assigned player's phone acts as a virtual gamepad. |

#### `Craft`

Which vehicle a pilot seat flies.

| Value | Meaning |
|---|---|
| `VEHICLE` | The main vehicle. |
| `BOOSTER` | The returning booster in split screen (F7b, §9.4). |

#### `PilotAction`

Discrete pilot action (§9.2). Hold-to-confirm gestures (STAGE 0.3 s, ABORT 1.5 s) are evaluated on the phone; the action is sent once when the hold completes.

| Value | Meaning |
|---|---|
| `STAGE` | Stage / separate / release. |
| `CUTOFF` | Cut engines. |
| `RCS_TOGGLE` | Toggle RCS. |
| `ATT_HOLD` | Set attitude hold; `attMode` required. |
| `DEPLOY` | Deploy; `deploy` required. |
| `WARP_UP` | Time warp +. |
| `WARP_DOWN` | Time warp −. |
| `MAP_TOGGLE` | Toggle map view on the host. |
| `CAMERA_CYCLE` | Next camera on the host. |
| `ABORT` | Request an abort; the host opens an ABORT vote (§9.8). |
| `COUNTDOWN_HOLD` | Call a countdown hold (F1). |
| `COUNTDOWN_RESUME` | Resume the countdown (F1). |

#### `AttMode`

Attitude hold mode (§9.2).

| Value | Meaning |
|---|---|
| `OFF` |  |
| `PROGRADE` |  |
| `RETROGRADE` |  |
| `HEAT_SHIELD_FWD` |  |

#### `DeployTarget`

What to deploy (§9.2).

| Value | Meaning |
|---|---|
| `CONTEXT` | Whatever the host currently offers as the context deploy. |
| `FAIRING` |  |
| `CHUTES` |  |
| `LEGS` |  |
| `ARRAYS` |  |

#### `CopilotAction`

Co-pilot action (§9.4).

| Value | Meaning |
|---|---|
| `STAGE` |  |
| `DEPLOY` |  |

#### `TelemetryChannel`

Console telemetry channel. The unit is part of the identifier. Each role has a fixed channel set (see Console channels).

| Value | Meaning |
|---|---|
| `met_s` |  |
| `altitude_km` |  |
| `velocity_ms` |  |
| `countdown_s` |  |
| `hold` |  |
| `consoles_red` |  |
| `consoles_amber` |  |
| `chamber_pressure_pct` |  |
| `engines_running` |  |
| `engines_total` |  |
| `engine_health_pct` |  |
| `prop_stage1_pct` |  |
| `prop_stage2_pct` |  |
| `throttle_pct` |  |
| `q_kpa` |  |
| `load_pct` |  |
| `g_load` |  |
| `vibration_pct` |  |
| `traj_error_km` |  |
| `pitch_error_deg` |  |
| `heading_error_deg` |  |
| `apoapsis_km` |  |
| `periapsis_km` |  |
| `inclination_deg` |  |
| `window_remaining_s` |  |
| `dv_remaining_ms` |  |
| `battery_pct` |  |
| `power_balance_w` |  |
| `temp_c` |  |
| `cabin_pressure_kpa` |  |
| `cabin_co2_pct` |  |
| `signal_pct` |  |
| `data_downlinked_gb` |  |
| `next_pass_s` |  |
| `in_pass` |  |
| `targets_captured` |  |
| `targets_total` |  |
| `payload_health_pct` |  |
| `data_stored_gb` |  |
| `entry_angle_deg` |  |
| `heat_load_pct` |  |
| `landing_ellipse_km` |  |
| `descent_rate_ms` |  |
| `chutes_deployed` |  |
| `budget_left_m` |  |
| `schedule_margin_days` |  |
| `score_pts` |  |
| `sync_meter` |  |

#### `AlertSeverity`

Severity of a console alert.

| Value | Meaning |
|---|---|
| `CAUTION` |  |
| `WARNING` |  |

#### `BlackoutCause`

Why phones are blacked out.

| Value | Meaning |
|---|---|
| `PLASMA` | Reentry plasma blackout (F11). |
| `SIGNAL_DELAY` | Light-time delay (C7 Mars EDL). |
| `OUT_OF_COVERAGE` | No ground station in view. |

#### `HapticCue`

Phone vibration cue (§15). The vibration pattern for each cue is defined in the client.

| Value | Meaning |
|---|---|
| `IGNITION` |  |
| `MAX_Q_RUMBLE` |  |
| `STAGING` |  |
| `CHUTE_OPEN` |  |
| `TOUCHDOWN` |  |
| `ALERT` |  |
| `GOOD_CALL` |  |
| `VETO` |  |
| `TIER_NONE` |  |
| `TIER_BRONZE` |  |
| `TIER_SILVER` |  |
| `TIER_GOLD` |  |
| `TIER_PLATINUM` |  |

#### `SyncReason`

Why the Team Sync meter changed (§11.2).

| Value | Meaning |
|---|---|
| `GOLD` | +25 (also used for Platinum). |
| `SILVER` | +15. |
| `BRONZE` | +8. |
| `GOOD_CALL` | +3. |
| `MOMENT_SPENT` | Back to 0 after a Mission Control Moment. |
| `RESET` | New mission. |

#### `BoostId`

Boost type (§10.4).

| Value | Meaning |
|---|---|
| `DV_BONUS` |  |
| `RELIABILITY_SHIELD` |  |
| `HEAT_MARGIN` |  |
| `PRECISION` |  |
| `LOAD_MARGIN` |  |
| `FUEL_SAVER` |  |
| `DATA_MULTIPLIER` |  |
| `BUDGET_REFUND` |  |
| `SCHEDULE_RECOVERY` |  |
| `CREW_MORALE` |  |
| `SCORE_MULTIPLIER` |  |

#### `BoostUnit`

Unit of a boost amount.

| Value | Meaning |
|---|---|
| `PCT` | Percent (signed; e.g. +3 for Δv, −25 for Precision error). |
| `MULT` | Multiplier (e.g. 1.25). |
| `M_USD` | $M (game value). |
| `DAYS` | Days (game value; negative = recovered). |
| `POINTS` | Points (Crew Morale). |
| `SHIELDS` | Number of Reliability Shields. |

#### `BoostSource`

What produced a boost.

| Value | Meaning |
|---|---|
| `MINIGAME` |  |
| `ABILITY` |  |
| `MOMENT` |  |
| `LESSON` |  |
| `ANOMALY` |  |

#### `Tier`

Minigame completion tier (§10.3).

| Value | Meaning |
|---|---|
| `NONE` | f < 0.33. |
| `BRONZE` | f ≥ 0.33. |
| `SILVER` | f ≥ 0.66. |
| `GOLD` | f = 1.00. |
| `PLATINUM` | Gold and every active player perfect. |

#### `MinigameType`

Minigame type (§10.2).

| Value | Meaning |
|---|---|
| `PARALLEL_SOLO` |  |
| `COOP_SPLIT` |  |
| `RELAY` |  |
| `TEAM_SYNC` |  |

#### `MinigameMode`

Input mode the player used (§16 Motor).

| Value | Meaning |
|---|---|
| `STANDARD` |  |
| `RELAXED` |  |
| `ONE_BUTTON` |  |

#### `MgCancelReason`

Why a minigame run was cancelled.

| Value | Meaning |
|---|---|
| `HOST` |  |
| `ABORT` |  |
| `PHASE_CHANGE` |  |

#### `KpReason`

Why Knowledge Points were awarded (§11.3, §12.2).

| Value | Meaning |
|---|---|
| `PREDICTION` |  |
| `TRIVIA` |  |
| `MINIGAME` |  |
| `BONUS` |  |

#### `CodexSource`

What unlocked a Codex entry (§12.2).

| Value | Meaning |
|---|---|
| `PART` |  |
| `EVENT` |  |
| `MINIGAME` |  |
| `DEBRIEF` |  |
| `MILESTONE` |  |

#### `MissionOutcome`

Mission outcome (§8.5).

| Value | Meaning |
|---|---|
| `SUCCESS` |  |
| `PARTIAL` |  |
| `FAILURE` |  |

#### `Grade`

Mission grade (§11.4).

| Value | Meaning |
|---|---|
| `S` |  |
| `A` |  |
| `B` |  |
| `C` |  |
| `D` |  |

#### `ObjectiveKind`

Objective kind (§5.2).

| Value | Meaning |
|---|---|
| `PRIMARY` |  |
| `SECONDARY` |  |
| `STRETCH` |  |
| `SAFETY` |  |

#### `RelayedType`

Message types a player may send that the server forwards to the host inside `relay`.

| Value | Meaning |
|---|---|
| `pilot.input` |  |
| `pilot.action` |  |
| `copilot.action` |  |
| `console.callout` |  |
| `console.request` |  |
| `mg.ready` |  |
| `mg.progress` |  |
| `mg.action` |  |
| `mg.result` |  |

## 16. Decisions

Choices made where the design left something open. Each can be overruled by changing this file.

1. **Unified vote mechanism.** Part votes, contract votes and all quick votes use the same `vote.*`
   messages; the kind selects a stage profile (7.1). The GO/NO-GO ritual is the separate `poll.*` family.
2. **Host supplies answers and seed up front.** `vote.open` carries the Predict answer, the trivia
   question with its answer and the coin seed, so the server can resolve a round with the host away. They
   are stripped from `vote.opened`.
3. **Predict runs before Inspect** (REVEAL → PREDICT → INSPECT → VOTE). §4.1 numbers Predict as step 4
   after Inspect, but §12.2 says "commit to a prediction, then see the stats"; asking after the stats are
   visible would make the question trivial.
4. **Plurality is the default**; `strictMajority` defaults to false (§22 question 4).
5. **Runoff condition.** A runoff is held only when no option has more than half of the counted ballots
   and at least three options received ballots; a two-way tie goes straight to the tie-breakers. Runoff
   candidates with equal counts are chosen by display order.
6. **Decision Time** closes the voting stage immediately and, when given an option, breaks a tie ahead of
   tie-breaker 1.
7. **All-abstain default.** Between the design's two rules (Recommended, then cheapest) the host may name
   a `defaultOptionId`; it must be null for PART votes so the design rule applies unchanged. Needed for
   quick votes, whose options have no cost.
8. **Unwinnable options cannot receive ballots** ("Will not fly" without a fix, unaffordable). They stay
   visible. A veto must leave two *winnable* options.
9. **Affordability has three states** (`OK`, `EMERGENCY_FUNDING`, `NEVER`), computed by the host. `NEVER`
   covers options that even +10 % budget cannot pay for, and schedule overruns that money cannot fix.
10. **Early close** for CHOICE and QUICK votes when all connected voters have voted; never for PART votes.
11. **Timer defaults:** Inspect 20 s (configurable 5–60 s), Vote 20 s (10–60 s), Reveal 3 s, Predict 8 s,
    Runoff 10 s, trivia 10 s, pick 5 s, Result 3 s (quick 2 s), quick vote 10 s, ABORT and MCM 5 s, poll
    call 5 s, slow-timers factor 1.5.
12. **Audience weight 1** adds one ballot for the audience's unique favourite; an audience tie adds nothing.
    Default weight 0 (§22 question 9).
13. **Role groups** for every player count are fixed by the table in 5.1; all ten roles are always
    staffed. Assignment mode VOTE elects the Flight Director; other groups are random.
14. **Rebalancing rules** for leavers and late joiners (5.3); abilities are tracked per role.
15. **Late joiners** are promoted when the next vote round of any kind opens, or at a new mission.
16. **Slot-hold countdown is frozen while paused**, so a phone that sleeps during a pause keeps its seat.
17. **After a host reconnect the game stays paused** until the host sends `game.resume`.
18. **Outcome log.** Server-resolved results carry `outcomeSeq` and are replayed to a resuming host from
    `lastOutcomeSeq`.
19. **Client → host messages travel inside `relay`**, which adds the sender's PlayerId; host → client
    messages are relayed unchanged. One type has one payload shape.
20. **All display text is by reference** (`TextRef`, data ids). Phones bundle the catalog and string
    tables; part cards are rendered from `partId` plus the host's deltas.
21. **Nickname** is the only free text: 2–16 characters, letters, digits, space, underscore, hyphen;
    duplicates are refused with a suggestion. Avatars are two cosmetic ids.
22. **Room code alphabet** has 24 letters (no I, no O). **URLs:** `?room=CODE` and `?room=CODE&watch=1`.
23. **Absolute times use the server clock**; every client, the host included, syncs with `clock.ping`.
    A pause shifts all outstanding deadlines by `pausedForMs`.
24. **Heartbeat 5 s, idle timeout 15 s, handshake timeout 5 s**, reconnect backoff 0.5–5 s.
25. **GO/NO-GO:** each connected player is called once and answers for all their consoles; no answer does
    not block; the host owns the discussion timer and the re-poll.
26. **Pilot input:** analogue state at up to 30 Hz (`pilot.input`), discrete actions as events
    (`pilot.action`); hold gestures are timed on the phone. Default `pilotRotation` PER_SEGMENT, selection
    by ROTATION (§22 question 5), `passTheControls` off.
27. **Minigame params and shared state** are an open key/value bag (`MgMap`) defined per minigame in the
    game data; it is the one place a schema allows arbitrary keys. Top-level payloads are always closed.
28. **Minigame close** at `startAtMs + durationMs + 2 s`; "active" requires `mg.ready`.
29. **`mg.summary` lists only successes**; `debrief.awards` carries only positive statistics (§11.5, §16).
30. **Awards, callouts, console requests, anomaly responses, objectives** are data ids, not protocol
    enums, so content can grow without a protocol change.
31. **Versioning.** `protocolVersion` is an integer; adding message types, optional fields or enum values
    keeps the version; receivers ignore what they do not know. Anything else increases it.
32. **Schemas are self-contained** (shared types are repeated in each file's `$defs`) so each consumer can
    load one file without a resolver.

## 17. Design conflicts

Points where `GAME_DESIGN.md` contradicts itself or cannot be expressed as written, and what this
protocol does.

1. **§3.2 role counts vs. ten roles.** "8–10 players: 1 each" cannot staff ten roles with 8 or 9 players,
   and "3–4 players: 2–3 each" cannot cover ten roles with 3 players. The table in 5.1 keeps every role
   staffed, follows the §3.3 merge order and reproduces the Appendix A example for 4 players.
2. **§4.1 vs. §12.2 on Predict order.** See Decision 3.
3. **§4.2 Affordability mixes budget and schedule.** Emergency Funding adds budget only, yet the rule
   lets it unlock options that exceed the *schedule*. The host decides per option through `afford`.
4. **§4.2 "at least two options must remain" vs. unwinnable options.** Counting unwinnable options would
   allow a veto to leave a single real choice; the protocol counts winnable options.
5. **§4.2 "Quick votes … 10 s two-option votes" vs. §6.8 and §11.2**, which have three options (anomaly
   responses, Mission Control Moment) and 5 s timers (§9.8 abort, §11.2). Quick votes accept 2–10 options
   and per-kind timers.
6. **§3.1 rule 4 "join as full voters" does not say what roles a late joiner gets.** Rule 5.3 gives them
   half of the roles of the most-loaded player.
7. **§11.5 lists eight awards but promises every one of up to ten players an award.** Award ids are data,
   and one award id may be given to several players.
8. **§17.4 lists `console.callout` and `mg.result` as "client → host"** although phones only connect to the
   server (§17.1). They are relayed through the server inside `relay`.
9. **§9.5 "voice/text callout" and §3.4 "no free-text chat".** Callouts are enumerated ids with an
   optional number; no text is typed.
