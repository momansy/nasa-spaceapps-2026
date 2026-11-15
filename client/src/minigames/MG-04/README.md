# MG-04 Orientation Check

Parallel solo, 20 s, build stage (avionics and sensor integration; software-in-the-loop and drop
tests). Design section 10.5, task T019 step 7. Fact on the result screen: F21 (Genesis: sensors
installed in the wrong orientation because of a design error).

A blueprint (white line drawing on drafting blue, with an "Up" reference) above the real part on
an anti-static bench mat. Turn the part in 90° steps until it matches, then press "Matches
drawing"; if no turn can match it, press "Drawing error". Parts: an IMU with its axis triad (X
single arrow, Y double arrow, Z out of the page), a g-switch with its sensing arrow and cable
gland, a keyed round connector with an asymmetric pin ring and a ringed pin 1, and a rectangular
connector with a marked pin 1. None of them has a mirror symmetry, so a **wrong drawing is the
mirror image** of the part: turning can never match it. After the last part the drawing panel
lists every part with its status shape and outcome.

| File | What |
|---|---|
| `model.ts` | Seeded parts, rotation, confirm / flag, Relaxed snap, one-button offer cycle, scoring, scripted player (pure) |
| `render.ts` | Part art (hardware and blueprint styles), drawing and bench panels, controls, feedback, summary |
| `index.ts` | Canvas, input (buttons, tap on the part, keys, one button), loop, haptics, ARIA |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `all_correct_required` | — | true | boolean | common | Data flag: every part right (false: at most one wrong part) |
| `drawing_error_catch_required` | — | true | boolean | common | Data flag: every wrong drawing must be caught (false: a missed one is not held against the player) |
| `parts` | parts | 4 (Cadet 3, Flight Director 5) | integer | common | `game_value` |
| `errors` | drawings | 1 (Flight Director 2) | integer | common | Wrong drawings per run (always ≥ 1), `game_value` |
| `hold_to_toggle` | — | — | boolean | common | No effect: one press decides |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; not used (parallel solo) |

## Rules

- Each part arrives one to three quarter turns away from its drawing (seeded); kinds never repeat
  twice in a row.
- Outcomes: **match** (confirmed at the drawing's orientation), **caught** (error flagged on a wrong
  drawing), **mismatch**, **missed error** (confirmed a wrong drawing), **false flag** (flagged a
  correct drawing), **unchecked** (time ran out).
- **Success:** with both data flags true, every part is a match or a catch. **Perfect:** that, with at
  least 25 % of the play time left (`game_value`). **Score:** right fraction × (0.8 + 0.2 × time left
  fraction).
- **Time:** Standard 75 % of `durationMs` (15 s of 20 s); Relaxed the full time ("the timer is
  longer"); One-button the full time (**Decision**: the offer cycle needs it). Play ends when the
  last part is decided.
- **One time on screen (T038):** the "Time left" readout shows the same time as the host timer bar,
  `max(0, durationMs − elapsed)` in whole seconds (`Mg04Sim.windowLeftS`), so the phone never shows
  two clocks. Standard play still ends at 75 % of the window (the reserve above), so the scan can
  end while the bar still shows about a quarter of the window; the readout turns Sunlight (the
  warning colour) in the last 4 s of actual play (`leftS`). Scoring and play length are unchanged.

## Modes and difficulty (all `game_value`)

| | Parts / wrong drawings | Other |
|---|---|---|
| Standard / Engineer | 4 / 1 | |
| Relaxed | as difficulty | a turn that lands one step from the drawing's orientation snaps onto it (every part, so a part that will not snap never gives a wrong drawing away; a mirrored drawing still cannot match); full time |
| One-button | as difficulty | the part shows each orientation for 0.75 s, then "Drawing error" for 1.0 s, in a loop; a press anywhere or Space / Enter takes what is offered |
| Cadet | 3 / 1 | one-button dwell ×1.25 |
| Flight Director | 5 / 2 | one-button dwell ×0.8 |

Keyboard: Left / Right arrows turn, Enter or M confirms, E / Backspace / Delete reports a drawing
error. A tap on the part turns it a quarter clockwise. ARIA: `role=application`; the live region
reads each part ("Part 2 of 4: IMU. Drawing at 90 degrees, part at 180 degrees."), every turn and
every outcome.

## Physics versus game simplification

Real-world basis: sensor axes and connector keying are specified by drawings, and a mirrored
drawing cannot be satisfied by rotating a part (handedness). Game: the parts, their art, 90° steps,
counts and timings. No player-facing claim beyond fact F21.
