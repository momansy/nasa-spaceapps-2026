# MG-19 Scrubber Fix

Cooperative split, 35 s, flight phase F8 on crewed flights (life-support event). Design section
10.5, task T021 step 10. Fact on the result screen: F15 (Apollo 13: ground engineers invented a
way to fit square CO₂ filters into round sockets with items aboard, and the crew built it).

A workbench shows a square filter, a round socket and the adapter between them with five slots,
each named by what it does: cover the filter face, seal the joints, stiffen the opening, the
square-to-round funnel, and reach the round socket. This player holds one spare part (hose, tape,
card, bag or sock) and drags it onto its slot (or taps the slot, or keys 1–5). A wrong slot locks
the part out for 3 s. Teammates' parts appear in their slots as they are placed ("crew"); the
adapter fills and turns green when complete. A CO₂ gauge on a labelled **game scale** rises to the
deadline and falls once the adapter is complete. The tone is calm and cooperative.

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `part` | index 0–4 | `slot mod 5` | number | **per player** | 0 hose, 1 tape, 2 card, 3 bag, 4 sock |
| `slot` | index | 0 | number | per player | Host convention (`assignments[].index`) |
| `slots` | count | host | number | common | Players in the split (display only) |

`data/minigames.json` stores no number for MG-19. `hold_to_toggle` is ignored (presses only).

## Result

- **Success:** this player's part placed in its correct slot before the CO₂ deadline.
- **Perfect:** placed at the first try within the first half of the time; implies success.
- **Score:** 1 − 0.4 × share of time used − 0.15 per wrong try (at least 0.3) for a success; 0
  otherwise. **`value`:** omitted.
- One result 1.2 s after both this player's part and the whole adapter are in, else at the
  deadline (Standard and One-button 75 % of `durationMs`, Relaxed 97 %).

## Decisions

- **The adapter's completion is shown but is not a local success input.** Each phone decides its
  own success from its own placement ("each player who placed a correct part succeeds").
- Slot functions, the part-to-slot matches (hose → reach the socket, tape → seal, card → stiffen,
  bag → funnel, sock → cover), the CO₂ game scale (1.0 % → 4.0 %) and all timings are game values;
  they are not a reconstruction of the historical adapter and make no claim about real CO₂ levels.

## Teams and `env.coop` (interface)

- **Sent:** one `mg.action` `{ a: "place", x: [part, slot] }` when this player's part is placed
  correctly.
- **Read:** `mg.state.shared.slots` (number[], part index per slot or −1) and `shared.co2_pct`
  (number, shown on the gauge instead of the local value); hosts that only echo the last move
  (the mock room) are read from `last_a == "place"` with `last_x = [part, slot]`. Only correct
  placements are shown.
- **Without `env.coop`** (solo, spectators, demo) a simulated crew places the other four parts
  between 2 s and 55 % of the time, labelled "crew".

## Modes and difficulty (all `game_value`)

Relaxed: the deadline moves from 75 % to 97 % of the run ("CO₂ rises more slowly"). One-button:
the slots are highlighted in turn every 1.3 s (Cadet 1.6 s, Flight Director 1.1 s); a press
anywhere puts the part into the highlighted slot. Wrong-slot lock-out 3 s (Cadet 2 s, Flight
Director 4 s).

## Haptics, accessibility

Placed: 30-40-60 ms; wrong slot: 60-40-60 ms; one-button highlight: 6 ms (≤ 300 ms). Canvas
`role="application"` with a mode-specific label; a polite live region names the player's part at
the start, reads status changes, adapter completion and, in one-button mode, each highlighted
slot. Slots show icon, function label and who filled them; a wrong slot gets the double "fails"
border during the lock-out.
