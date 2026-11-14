# MG-02 Rocket Equation Balance

Parallel solo, 30 s, build stage after the tank votes. Design section 10.5, task T019 step 2.
Fact on the result screen: F02 (rocket equation, returns shrink).

A brushed-silver balance with a geared Δv dial. The stage and payload sit on the left pan;
propellant blocks (ceramic tank segments with a Signal band) stack on the right. Every block
moves the needle less than the one before; the bar chart under the scale shows each block's
marginal Δv shrinking. The scale is read at the deadline: needle in the green band with the
fewest blocks.

| File | What |
|---|---|
| `model.ts` | Rocket equation, seeded plan (n*, band, start), moves with handling time, damped needle, scoring, scripted player (pure) |
| `render.ts` | Canvas drawing (dial, balance, pans, blocks, chart, readouts, buttons) |
| `index.ts` | Canvas, input, loop, haptics, ARIA (`MinigameModule`) |
| `kit.ts` | **Build package kit** shared by MG-01 … MG-06, MG-29, MG-30: seeded random, fixed step, parameter readers, loop and demo hosts, canvas helpers (glass cards, tabular numerals, status strip, bars, buttons, dusk backdrop) |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `extra_blocks_max` | blocks | 1 | integer | common | Success threshold (data), `≤` |
| `isp_s` | s | 320 | number | common | Specific impulse, `game_value` |
| `dry_mass_t` | t | 4 | number | common | Stage dry mass, `game_value` |
| `payload_t` | t | 1 | number | common | Payload, `game_value` |
| `block_t` | t | 2 | number | common | Propellant per block, `game_value` |
| `target_dv_ms` | m/s | seeded | number | common | Band centre; without `band_ms`, n* = first block count reaching it and the band is automatic |
| `band_ms` | m/s | automatic | number | common | Full band width around `target_dv_ms` (Relaxed ×1.3) |
| `max_blocks` | blocks | 14 | integer | common | Pan capacity |
| `start_below` | — | false | boolean | common | Always start below the band (used by the demo) |
| `hold_to_toggle` | — | — | boolean | common | No effect: every press is one block, nothing is held |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host (`slots.ts`); not used (parallel solo) |

## Rules

- **Δv = Isp · g0 · ln(m0 / mf)**, g0 = 9.80665 m/s² (`physical`), m0 = dry + payload + n · block,
  mf = dry + payload.
- **Plan (seeded):** n* from 4 to 8 blocks (`game_value`). The automatic band reaches 30 % into the
  gap below Δv(n*) and above Δv(n*+2), so it admits exactly n*, n*+1 and n*+2 blocks. The run starts
  outside the band: below (0 … n*−2 blocks) or, except one-button, above (n*+3 … n*+5, so blocks
  must be lifted).
- **Moves:** add or lift one block; each takes 0.45 s of handling (`game_value`), moves queue (up
  to 3). Lifting costs handling time only.
- **Needle:** damped pointer, 1.15 Hz, damping 0.32 (`game_value`). The result reads the settled
  value Δv(n), not the swinging needle.
- **Success:** at the deadline Δv(n) is in the band (edges inclusive) and n − n* ≤ `extra_blocks_max`.
  **Perfect:** n = n*. **Score** (read by the "Rocket Scientist" award): 1 at n*, −0.25 per extra
  block; outside the band ≤ 0.45, falling with distance in blocks.
- **Deadline:** Standard and One-button read the scale at 75 % of `durationMs` (22.5 s of 30 s);
  Relaxed uses the full time ("the timer is longer").

## Modes and difficulty (all `game_value`)

| | Band reach into gaps | Needle damping | Play time | Other |
|---|---|---|---|---|
| Standard / Engineer | 0.30 | 0.32 | 75 % | |
| Relaxed | ×1.5 (wider band) | as difficulty | 100 % | next block's Δv shown as a dashed ghost bar |
| One-button | as Standard | as difficulty | 75 % | whole playfield (and Space / Enter) drops one block; starts below the band; result read at the deadline |
| Cadet | ×1.25 | 0.45 (settles faster) | | next block's Δv shown |
| Flight Director | ×0.75 | 0.22 (swings longer) | | |

Keyboard: Up / Right / + / Space add, Down / Left / − / Backspace lift. ARIA: `role=application`,
a label with the controls, a description with the target band, and a polite live region that
reads "Delta-v 3.45 km/s with 5 blocks, in the target band" after every move.

## Physics versus game simplification

Physical: the rocket equation and g0. Game: one stage, propellant blocks without tank mass, no
gravity or drag losses, the balance and its geared pointer (a real balance would weigh mass,
not Δv), the band placement, handling time and needle dynamics. No player-facing claim beyond
fact F02.
