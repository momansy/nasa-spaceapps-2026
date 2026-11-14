# MG-01 Unit Converter Sprint

Parallel solo, 25 s, build stage after the propulsion votes (PDR). Design section 10.5, task
T019 step 3. Fact on the result screen: F01 (Mars Climate Orbiter, pound-force seconds versus
newton-seconds).

Value cards (force in lbf, length in ft, pressure in psi) travel down a data conveyor toward a
Sunlight "upload" line. Under it, three lanes show SI values. Swipe the front card toward its
lane (left, down, right), drop it on a lane, or tap a lane. Lanes carry letter badges A / B / C.

| File | What |
|---|---|
| `model.ts` | Factors, seeded deck, conveyor timing, one-button highlight cycle, scoring, scripted player (pure) |
| `render.ts` | Canvas drawing (readouts, conveyor, cached card faces, lanes, feedback strip) |
| `index.ts` | Canvas, input (swipe, lane tap, keys, one button), loop, haptics, ARIA |
| `model.test.ts` | Vitest |

Shared plumbing comes from the build kit in `../MG-02/kit.ts`.

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `correct_min` | cards | 8 | integer | common | Success, `≥` (data) |
| `wrong_max` | cards | 1 | integer | common | Success, `≤` (data) |
| `cards` | cards | 13 | integer | common | Deck size, `game_value` (brief: at least 12) |
| `hold_to_toggle` | — | — | boolean | common | No effect: one-button choices are single presses |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; not used (parallel solo) |

## Rules

- **Factors (`physical`, exact by definition):** 1 lbf = 4.4482216152605 N, 1 ft = 0.3048 m,
  1 psi = 6.894757293168 kPa. Every number is shown to 3 significant figures.
- **Lanes per card (seeded order):** the correct conversion; the **unconverted** number with the SI
  unit (the Mars Climate Orbiter mistake, F01); a **wrong factor**: pound-mass to kilogram
  (0.45359237) for lbf, the inverted factor (3.2808) for ft, bar instead of kPa (0.0689476) for psi.
  The three texts are always distinct.
- **Values (`game_value` ranges):** 100–40 000 lbf, 20–25 000 ft, 6–2 500 psi, 3 significant figures.
  The kind never repeats twice in a row.
- **Conveyor:** card *i* goes live at 0.4 s + *i* × interval, interval = (play − fall − 0.6 s) / 12,
  so the last card still reaches the line before the end. Several cards can be on the conveyor;
  the player sorts the front one.
- **Decision:** a card that reaches the upload line unsorted counts as **wrong** ("Missed").
- **Success:** correct ≥ `correct_min` and wrong ≤ `wrong_max`. **Perfect:** success with no wrong.
  **Score:** correct / cards − 0.08 per wrong, clamped to 0–1. Play ends when every card is
  resolved or at `durationMs`.

## Modes and difficulty (all `game_value`)

| | Fall time to the line | One-button dwell per lane |
|---|---|---|
| Standard / Engineer | 4.6 s | 0.85 s |
| Relaxed ("values move more slowly") | ×1.4 | ×1.25 |
| Cadet | ×1.25 | ×1.25 |
| Flight Director | ×0.8 | ×0.8 |

**One-button** (data line): cards come one at a time and stop half-way; the lanes light up in
turn from a seeded start lane; a press anywhere (or Space / Enter) chooses the lit lane. After two
full cycles without a press the card counts as missed. Next card 0.35 s after the previous one.

Keyboard: 1 / 2 / 3, A / B / C or Left / Down / Right pick a lane. ARIA: `role=application`; the
live region reads each new card with its three lanes ("2290 ft. Lanes: A 7510 m, B 2290 m, C 698 m"),
the lit lane in one-button mode, and the outcome of every card.

## Physics versus game simplification

Physical: the three exact factors. Game: the deck, the ranges, the distractor factors (common
real mistakes, not claims), the conveyor and its timing. No player-facing claim beyond fact F01;
the feedback lines only describe the player's choice ("the number was not converted").
