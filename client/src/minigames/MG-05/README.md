# MG-05 Clean Room

Parallel solo, 20 s, build stage (science payload integration, or the contamination anomaly).
Design section 10.5, task T019 step 8. Fact on the result screen: `minigame.MG-05.fact` (clean
rooms and bunny suits).

A clean-room bench under laminar-flow light: a coated camera lens in a silver mount (top) and a
gold-coated hexagonal mirror (bottom). Dust specks and fibres drift down and settle on the glass.
Drag the foam swab over them with slow strokes; a stroke that is too fast (or too hard, on a
device that reports real pressure) leaves a scratch. A stroke-speed bar under the bench shows
how close the stroke is to the limit.

| File | What |
|---|---|
| `model.ts` | Optics, seeded particles, stroke sweep and speed windows, scratches, one-button raster and dry-rub rule, scoring, scripted player (pure) |
| `render.ts` | Bench, lens and mirror (cached), particles, scratches, swab, speed bar, readouts |
| `index.ts` | Canvas, input (strokes with coalesced samples and real pressure, keys, one button), loop, haptics, ARIA |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `clean_fraction_min` | fraction 0–1 | 0.9 | number | common | Success, `≥` (data) |
| `scratches_max` | scratches | 0 | integer | common | Success, `≤` (data) |
| `speed_limit` | field widths / s | 2.0 | number | common | "Too hard" stroke speed, `game_value` (scales with screen size) |
| `particles` | particles | 24 (Cadet 20, Flight Director 28) | integer | common | `game_value` |
| `hold_to_toggle` | — | false | boolean | common | One-button: a tap toggles wiping on and off |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; not used (parallel solo) |

## Rules

- **Field (`game_value`):** width 1, height 1.45; lens centre (0.5, 0.36) radius 0.28; mirror centre
  (0.5, 1.07) radius 0.27; swab radius 0.07 (Relaxed 0.085).
- **Particles:** land uniformly on one optic each, 30 % fibres; drift 1.6 s from the air (Relaxed ×1.5,
  "drift more slowly"); none lands later than 2.5 s before the end, so each can be wiped.
- **Too hard:** stroke speed measured over windows of at least 1/30 s of **sample time** (each pointer
  sample, coalesced samples included, carries its `timeStamp`, so the speed does not depend on the
  frame rate or on how samples are batched) above `speed_limit` (field widths per second, so it
  scales with the screen; 2.0 ≈ 700 px/s on a 350 px field), or `PointerEvent.pressure` above 0.75
  (Relaxed 0.86) when the device reports real pressure (pens, force touch; the 0 / 0.5 / 1 defaults
  are ignored). One scratch at most per stroke, and only over glass.
- **Clean fraction** = 1 − (area of particles still on the glass / area of all landed particles), area ∝ size².
- **Success:** clean ≥ `clean_fraction_min` at the end and scratches ≤ `scratches_max`.
  **Perfect:** clean ≥ 0.98 (`game_value`) and no scratch. **Score:** clean − 0.25 per scratch (0–1).

## Modes and difficulty (all `game_value`)

| | Speed limit | Particles | Other |
|---|---|---|---|
| Standard / Engineer | 2.0 w/s | 24 | |
| Relaxed | ×1.5 ("more forgiving") | as difficulty | drift ×1.5, larger swab, pressure limit 0.86 |
| One-button | — | as difficulty | the swab follows a raster over both optics (rows 0.1 apart, 1.1 w/s, down and back up); holding wipes; holding over clean glass for more than 1.5 s in a row rubs it dry and scratches ("release over clean glass"); particles land at least two raster passes before the end |
| Cadet | ×1.25 | 20 | |
| Flight Director | ×0.8 | 28 | |

Keyboard: arrow keys move the swab gently (wiping while held); one-button: hold Space or Enter.
ARIA: `role=application`; the live region reads "Optics 85 % clean" and every scratch.

## Physics versus game simplification

Real-world basis: optics are cleaned with gentle, slow wiping because grit dragged under pressure
scratches coatings. Game: speed as a stand-in for force, the thresholds, particle counts, drift,
the dry-rub rule and the art. No player-facing claim beyond the data fact line.
