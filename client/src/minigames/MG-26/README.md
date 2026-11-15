# MG-26 Seven Minutes of Terror

Design 10.5 (F10, contract C7, relay, 45 s, aggregation `none`, fact F20). Package E4 of T022. Uses the shared plumbing in
`../MG-22/kit.ts`.

**Play.** Seven EDL cards, in the order of the sequence: heat shield, parachute, separate heat shield, radar, descent
engines, sky crane, cut cables. The cards are dealt by team slot (card `c` goes to slot `c mod min(slots, 7)`; one player
holds all seven, seven players hold one each, players beyond seven hold copies). **Programming:** pick one of your cards
in the tray, tap a numbered board position to place it (tap a placed card twice to take it off), and drag the slider to set its
**trigger** (an altitude in km or a time in s; the plan value is marked on the slider and printed on the card). Press SEND PROGRAM
(or let the clock run out). **Watch:** the board replays the seven steps (6 s) with the label "ONE-WAY LIGHT TIME n min"; each own card is
marked ✓ or ✕. Keys: ← / → pick a card, ↑ / ↓ move the cursor, Enter places, Backspace takes off, `[` `]` trim the trigger by 1 %, Page Up / Page Down by 5 %, `S` sends.
**Relaxed:** programming may use the whole run minus the replay (Standard: 75 % of it, then the program is sent by itself),
the trigger window is ×1.6 and the right slot is marked. **One-button:** the positions light up in turn (0.7 s each); a press puts your
next card at the lit position and the triggers are preset to the plan (the whole playfield is the button, plus Space / Enter).
**CADET** window ×1.25 and the right slot is marked; **FLIGHT_DIRECTOR** window ×0.8.

## Params (`mg.start.params`)

| key | unit | default | type | scope | meaning |
|---|---|---|---|---|---|
| `slot` | – | 0 | int | per player | 0-based, equals `assignments[].index`; decides the cards held |
| `slots` | – | 1 | int | common | number of players |
| `window_fraction` | fraction of the slider span | 0.05 | number | common | half-width of the trigger window; `game_value` |
| `perfect_fraction` | 0–1 | 0.4 | number | common | perfect: inside this middle fraction of the window; `game_value` |
| `program_fraction` | 0–1 | 0.75 | number | common | share of `durationMs` for programming in Standard; `game_value` |
| `highlight_s` | s | 0.7 | number | common | one-button: seconds a position stays lit; `game_value` |

**Actions / shared keys** (optional, display only; the game works without `env.coop`):
action `place` x = `[card, position, trigger]` (card 0–6; position 0–6; trigger = `round(value × 100)` in the card's unit, km for cards 0, 1, 3, 4 and
s for 2, 5, 6), sent when a card is placed or a trigger is released, at most as often as the player acts. Shared `seq` (number[7]) = card per
position or −1; teammates' cards are drawn from it. Without `env.coop` a seeded crew places the other cards at their right places at seeded times
(labelled "crew"). Teammates never change this player's result.

## Result

- `success`: every own card in its right position (card `c` at position `c`) with its trigger inside the window (|trigger − plan| ≤ window, edges count).
- `perfect`: success with every trigger inside the middle 40 % of its window; implies success.
- `score`: mean over own cards (unplaced 0, wrong place 0.25, right place 0.3…0.49 outside the window, 0.6…1 inside); below 0.5 whenever the run fails.
- `value`: not reported. The run ends 6 s after SEND (or the deadline), never later than `durationMs`.

## Physics versus simplification

- *Real-world approximate:* the order of the seven steps of a Mars entry, descent and landing; one-way light time about 3 to 22 min (fact F20:
  the data line is followed, the brief says 4 to 24). The lander cannot be flown live, so it is programmed before entry.
- *Game simplification:* plan values (km: 125, 11, 7, 2; s: 24, 12, 6, each ±10 % seeded) are loosely patterned on the sequence, not mission data.
  The slider spans 1.2 × the plan value with the plan at a seeded place; the window is ±5 % of the span. Altitudes and times are an abstraction of
  "altitude or time" triggers; nothing in the replay changes the result. The light time shown (3…22 min) is seeded.

## Accessibility, haptics, performance

Canvas `role="application"` with a label and a polite live region ("3 of 7 cards placed, 20 seconds left", at most every 1.5 s). Status is
colour + glyph + word + border style. Haptics: 15 ms per card placed, `[40, 40, 40]` when the program is sent. Reduced motion: no animation to turn
off (the replay reveals steps in sequence). Layout switches to a tight form (no HUD cards, time and count in the status line) on short canvases such as
200 % text. DPR capped at 2, no per-frame allocation in the step loop, chunk about 20 kB.

## Decisions

Per-card trigger kind is fixed by the card (no kind toggle); one-button presets the triggers; the replay is 6 s; the light time is seeded 3…22 min.
