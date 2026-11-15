# MG-03 Weld Inspector

Parallel solo, 25 s, build stage (structural material integration or static fire). Design
section 10.5, task T019 step 6. Fact on the result screen: `minigame.MG-03.fact` (friction stir
welding).

A radiograph of three tank weld seams (A, B, C) on a light box: film grain, weld beads with
ripples, lead seam letters, a millimetre ruler and a wire penetrameter. Porosity clusters and
cracks are almost invisible on the film. Sweeping a finger moves a scanning lens (it rides above
the finger) that shows a contrast-enhanced false-colour view where voids and cracks stand out;
a tap marks a defect where it is. Found defects stay revealed with a Meets ring; false alarms
show a Fails octagon; when time runs out the missed ones are shown with a dashed Marginal ring.

| File | What |
|---|---|
| `model.ts` | Film geometry, seeded defects, marks and hit test, one-button scanner, scoring, scripted player (pure) |
| `render.ts` | Film and enhanced film (painted once into offscreen canvases), light box, lens, marks, readouts |
| `index.ts` | Canvas, input (sweep, tap, keys, one button), loop, haptics, ARIA |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `defects_found_fraction_min` | fraction 0–1 | 0.8 | number | common | Success, `≥` (data); whole defects (5 of 6) |
| `false_alarms_max` | marks | 1 | integer | common | Success, `≤` (data) |
| `defects` | defects | 6 (Cadet 5, Flight Director 7) | integer | common | `game_value` |
| `hit_radius` | film widths | 0.055 | number | common | `game_value`, before mode and difficulty factors |
| `hold_to_toggle` | — | — | boolean | common | No effect: one press marks |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; not used (parallel solo) |

## Rules

- **Film (`game_value`):** width 1, height 1.25 film widths; seams at 0.26, 0.64 and 1.02 with a bead
  half-height of 0.045; ruler labelled for a 400 mm wide film.
- **Defects:** spread at least 0.17 apart, every seam used, alternating porosity clusters (4–7 voids)
  and cracks (jagged lines, half-length 0.035–0.06). On a radiograph voids and cracks read darker
  (less metal, more exposure); beads read lighter.
- **Marks:** within the hit radius of a defect (the crack line, or the cluster centre) finds it; a
  mark near an already found defect is ignored; anything else is a false alarm.
- **Success:** found ≥ ⌈`defects_found_fraction_min` × defects⌉ and false alarms ≤ `false_alarms_max`.
  **Perfect:** all found, no false alarm. **Score:** found fraction − 0.1 per false alarm (0–1).
- **Time:** Standard and One-button scan for 75 % of `durationMs` (18.75 s of 25 s); Relaxed the full
  time ("the scan time is longer"). Play also ends when every defect is found.
- **One time on screen (T038):** the "Time left" readout shows the same time as the host timer bar,
  `max(0, durationMs − elapsed)` in whole seconds (`Mg03Sim.windowLeftS`), so the phone never shows
  two clocks. Standard play still ends at 75 % of the window (the reserve above), so the scan can
  end while the bar still shows about a quarter of the window; the readout turns Sunlight (the
  warning colour) in the last 5 s of actual play (`leftS`). Scoring and play length are unchanged.
- **Decision:** the lens only enhances contrast and does not magnify, so a defect is tapped where it
  is seen. A tap is a press under 350 ms that moves less than 12 px; anything else is a sweep.

## Modes and difficulty (all `game_value`)

| | Hit radius | Defects | Other |
|---|---|---|---|
| Standard / Engineer | 0.055 | 6 | lens radius 0.115 |
| Relaxed | ×1.4 | drawn ×1.5 larger | lens 0.14, full time |
| One-button | ×1.3 | | the scanner moves along A, B, C by itself (whole path in 90 % of the play time); a press anywhere or Space / Enter marks under it |
| Cadet | ×1.25 | 5 | |
| Flight Director | ×0.8 | 7 | |

Keyboard: arrows move the lens, Space / Enter marks under it. ARIA: `role=application` with
instructions; the live region says "Defect found: 3 of 6" or "False alarm: 1 so far".

## Physics versus game simplification

Real-world basis (no new player-facing claim): radiographic weld inspection shows porosity and
cracks as darker features; image quality indicators and lead letters appear bright. Game: film
layout, sizes, the enhancement lens, the hit radius and timings. The only fact shown is the data
fact line about friction stir welding.
