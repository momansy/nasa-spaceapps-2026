# MG-28 Root Cause Investigation

Design 10.5 (F14 debrief, cooperative, 45 s, aggregation `none`). Package E4 of T022. Uses the shared plumbing in `../MG-22/kit.ts`.
**This README is the contract shared with T024** (the host's Investigation screen keeps the shared state). The clue table is
`clues.ts` (14 failure modes, 66 cards).

**Play.** Telemetry clue cards (channel · pattern · flight phase · one line of engineering evidence) are dealt to the players. Together
they assemble the **chain of evidence** (ordered places) and vote for the **root cause** among four failure modes. Pick a card (tap, or ← / →),
place it on a chain place (tap the place, or ↑ / ↓ then Enter; tap a placed card twice, or Backspace, to take it off), tap a cause (or keys 1–4),
then LOCK MY VOTE (or `L`). All clue cards are visible; your own cards have an accent border. **Relaxed:** more time (the whole run minus a 1.5 s
hold, Standard: 75 %) and the starting clue (place 0 of the true chain) is marked "START HERE". **One-button:** the places of the chain light up in turn
(0.6 s each, plus a "set aside, not evidence" position); a press puts your next card at the lit position; then the four causes light up and a press votes
and locks. **CADET** deadline ×1.25 (at most the run), **FLIGHT_DIRECTOR** ×0.8.

## The shared contract (exact)

Common params (`mg.start.params`):

| key | type | meaning |
|---|---|---|
| `cause_options` | number[4] | indices into the `failure_mode` enum of `data/schema/common.schema.json` (same order as `FAILURE_MODES` in `clues.ts`), in the order shown; distinct |
| `cause_correct` | int 0–3 | index into `cause_options` of the root cause |
| `clues` | number[] | clue-card ids, indices into `CLUES` in `clues.ts` (2–40, distinct) |
| `chain_len` | int 1–8 | number of places in the chain of evidence |

Per-player params (`assignments[].params`): `slot` (0-based, equals `assignments[].index`) and `cards` (number[], **indices into `clues`** dealt to this player).
Common param `slots`. Optional common params (`game_value`s): `deadline_fraction` (0–1, default 0.75, number: Standard deadline as a share of `durationMs`) and `highlight_s` (s, default 0.6, number: one-button highlight time). Without `cards`, card `i` of `clues` goes to slot `i mod slots`. Without valid
`cause_*`/`clues`/`chain_len`, the phone builds a seeded investigation (root cause, 3 other failure modes, the root cause's whole chain, two cards of
each other mode, two generic red herrings; `chain_len` = the length of the chain).

Actions (`mg.action`, `a` and `x`): `place` x = `[clueIndex, chainSlot]` (index into `clues`, 0-based place); `clear` x = `[chainSlot]`; `vote` x = `[optionIndex]` (0–3, index into `cause_options`).
Sent when the player acts (taps and key presses, far below 10 Hz). There is no `lock` action: the host decides `locked`.

Shared state (`mg.state.shared`, read, display only): `chain` (number[chain_len]: index into `clues` per place, or −1), `votes` (number[4], votes per option), `locked`
(boolean). A `chain` of the wrong length is ignored. The shared state only changes what is drawn; **the result of a phone never depends on it**.

The true chain: the clue cards of the root cause's failure mode, place `i` holds the card with `order` `i` (`CLUES[id].order`), places beyond the mode's card count have no right card.
The table has 3 to 5 clue cards per failure mode (orders 0…n−1) and 8 generic red-herring cards (`mode` −1).

## Result

- `success`: this player's final vote (at LOCK, or at the deadline) equals `cause_correct`. No vote fails.
- `perfect`: success **and** every own card in a correct chain position: own true-chain cards on their place, all other own cards (other modes, red herrings) not on the chain.
- `score`: success 0.6…1 by the share of own cards right; failure below 0.5. `value`: not reported.
- The run ends 1.5 s after the vote is locked, at most at `durationMs`.

## Physics versus simplification

- *Real-world approximate:* after a real failure an investigation board assembles a chain of evidence from telemetry to find the root cause; the 14 failure modes are those of
  design 8.4. The clues are written for the game (engineering evidence only, no people harmed); frequencies and numbers in them are illustrative, not from a real board. The Ariane 5
  Flight 501 and Genesis capsule clues follow the design's teaching points (a number too big for its variable; a sensor installed backwards).
- *Game simplification:* four options, seeded; cards are dealt round-robin; the vote of this player decides this player's result.

## Accessibility, haptics, performance

Canvas `role="application"`; a polite live region speaks cards used, vote and time (at most every 1.5 s). Status is colour + glyph + word + border style; the reveal marks the right cause
with ✓ (and a wrong vote with ✕). Haptics: 15 ms per card placed, `[25, 40, 25]` when a right vote locks, `[60, 60, 60]` otherwise. Tight layout (no HUD cards) on short canvases such as 200 % text.
DPR capped at 2, chunk about 30 kB (the clue table is 66 short records).

## Decisions

Chain places and clue ids are indices (not names) so host and phone share one table; `clues.ts` is also the proposed source for T024 (`data/investigation_clues.json` can be generated from it).
A solo player in one-button mode holds every card (about 12) and may run out of time; with two or more players the scripted player always finishes (tests use 2, 3, 5).
