# T004 — Room server (package C)

**Worker:** coding · **Owns:** `server/`

## Goal

The room server of design section 17.1: Node 20+, TypeScript, `ws`. It implements
`protocol/messages.md` exactly and is the authority for membership, roles, votes and timers.

## Scope

1. Rooms: create with a 4-letter code (no confusable letters, no words on a block list),
   join by code, QR join URL, 1 to 10 players plus unlimited spectators, late joiners as
   spectators until the next vote round (design section 3.1).
2. Identity: nickname from a filtered list or free text through a profanity filter,
   avatar; no accounts and no personal data stored (17.9).
3. Reconnect: token per player, slot and role kept 3 minutes, votes count as abstentions
   while away; room kept 10 minutes if the host drops, game paused (3.1, 17.7).
4. Roles: the ten roles, assignment modes random / pick / vote, merge order for fewer
   players, rotation between missions, once-per-mission abilities (3.2, 3.3).
5. Voting, every rule of section 4: vote rounds with timers and vote changes, open or
   hidden tallies, plurality, optional strict-majority runoff, tie-breakers in order
   (FLIGHT's vote, trivia sudden death, seeded coin flip), abstain rules, veto tokens,
   affordability and Emergency Funding, invalid-combination flag from the host, quick
   votes, GO/NO-GO poll, audience vote as advisory or as one extra vote (13.7).
6. Relay: pings and reactions, role tags, telemetry fan-out by role at 10 Hz or less,
   callouts, minigame start/result/summary, pilot input from a phone.
7. Limits: per-client rate limiting, payload validation against `protocol/schema/`,
   under 50 KB/s per client.
8. `server/README.md`: run locally, environment variables, how to deploy to a small host.

## Acceptance

- `npm test` in `server/` passes: unit tests for every voting rule (ties, vetoes,
  abstains, runoff, all-abstain, at-least-two-options-remain), role merging for 1 to 10
  players, reconnect timing with a fake clock.
- A load script `server/tools/simulate.mjs` runs a full scripted session with one fake
  host and 10 fake players plus 50 spectators and prints vote round-trip times; state the
  measured numbers.
- Every message in `protocol/messages.md` is either handled or listed as host-only.

## Design references

Sections 3, 4, 9.4, 9.5, 13.7, 17. `orchestration/ARCHITECTURE.md` sections 2 and 5.
