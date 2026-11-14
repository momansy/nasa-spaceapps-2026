# MG-09 Gravity Turn Tracer

Flight phase F3, parallel solo, 25 s (design 10.5). The ideal ascent curve scrolls past a
marker; the player traces it with a finger. The team's average error steers the real rocket,
so this minigame reports a `value`.

| File | What |
|---|---|
| `model.ts` | Pure rules: the gravity-turn curve from the seed, the trace, scoring (Vitest: `model.test.ts`) |
| `render.ts` | Canvas: read-outs, status strip, ascent-path inset, scrolling trace lane |
| `index.ts` | Glue: input, haptics, ARIA, demo loop |
| `shared/` | Code shared by every T020 minigame (MG-07, MG-08b, MG-09, MG-10, MG-10a, MG-11, MG-12): `core.ts` (seeded RNG, params, the fixed-step `StepSim` with time-stamped inputs and `replay`), `kit.ts` (canvas, play clock, input, ARIA plus a polite live region, exactly-once result, demo loop, dynamic resolution: the canvas starts at 2 device pixels per CSS pixel and steps down to 1.5, then 1, when the median frame is slower than about 36 fps), `draw.ts` (theme colours, cinematic backdrop of the style frames, glyphs, panels, buttons cached as offscreen layers, the reference launch vehicle) |

## Screen

- Two read-outs: your flight-path angle (°) and the mean error so far against the maximum (°),
  each with a status shape (check / triangle).
- Status strip: ON THE LINE (check, solid border), TOO STEEP · PITCH DOWN (up triangle), TOO
  SHALLOW · PITCH UP (down triangle); dashed amber border, double red border when far off.
- Ascent path inset: altitude against downrange in km on equal scales, the ideal path (dashed
  ahead, solid behind), your path flown at your angles, the rocket at your angle; altitude,
  downrange (km) and speed (km/s) of the ideal ascent.
- Trace lane: flight-path angle (°, 10° grid) against time, scrolling; the line and its
  ±threshold corridor are shown `guideAheadS` ahead of the marker and fade out after that.

## Controls

| Mode | Input |
|---|---|
| Standard / Relaxed | Drag up or down anywhere: the marker takes the finger's height on the angle scale (absolute). Keyboard: ↑ / → +1°, ↓ / ← −1°, Page Up / Down ±5°. |
| One button | The marker follows the line by itself but drifts away from it (1.2 °/s, at most 20°). Press the screen, Space or Enter while a PITCH cue (diamond, every ~2.4 s) is inside its window at the marker: the drift is cancelled and turns the other way. A press outside every window jolts the marker (+3° of drift), so pressing all the time does not work. |

## Parameters (`mg.start.params`)

All common to every player (parallel solo). None are in `data/minigames.json` (the design gives
no threshold), so the defaults are game values.

| Key | Unit | Default | Type | Scope | Meaning |
|---|---|---|---|---|---|
| `deviation_max_deg` | ° | 4 | number | common | Success: mean flight-path-angle error ≤ this (`_max` = at most, data convention) |
| `perfect_deviation_max_deg` | ° | 1.5 | number | common | Perfect: mean error ≤ this (lowered to the success threshold if larger) |
| `slot`, `slots` | — | 0, 1 | int | added by the host screen | Not used (parallel solo) |

`env.coop` is not used (PARALLEL_SOLO runs never get one).

## Result

- `success`: mean |γ_player − γ_ideal| over every 1/120 s step of the run ≤ `deviation_max_deg`.
- `perfect`: mean error ≤ `perfect_deviation_max_deg` (implies success).
- `score`: `1 − mean / (2 × deviation_max_deg)`, clamped to 0–1.
- **`value`: this player's mean flight-path-angle error in degrees (°), two decimals.** The host
  averages it over the team (`aggregation: team_average`).
- Exactly one result at the end of `durationMs`; it is computed by replaying the input log, so it
  does not depend on the frame rate.

## Modes and difficulty (all game values)

| | Threshold | Lane span | Corrections | Guide ahead | Cue window |
|---|---|---|---|---|---|
| Standard, Engineer | 4° | 7 s | ×1 | 3 s | ±0.45 s |
| Relaxed | ×1.5 (6°) | 9.5 s (scrolls more slowly) | ×0.7 | — | ×1.5 |
| Cadet | — | — | ×0.8 | 4 s | ×1.25 |
| Flight Director | — | — | ×1.2 | 1.8 s | ×0.8 |

## Physics and simplifications

- **Physical (equations):** point-mass ascent, `dv/dt = a(t) − g sin γ`, gravity turn
  `dγ/dt = −g cos γ / v`, `dx/dt = v cos γ`, `dh/dt = v sin γ`, thrust acceleration growing as
  propellant burns `a = a0 / (1 − t/τ)`, `g = 9.81 m/s²`.
- **Game values:** thrust-to-weight 1.40–1.60, vertical rise 6–10 s, pitch-over over 4 s,
  τ = 260 s, 4 g cap, 150 s of flight squeezed into the play time, end angle 18–28° (the kick
  angle is solved by bisection to reach it), three seeded guidance corrections of 4–8° (2–3.5 s
  wide) on the ideal angle, all thresholds, windows and the drift rate.
- **Simplifications:** flat Earth, no drag, no staging, no Earth rotation; the player sets the
  flight-path angle directly, while a real vehicle steers its attitude and the path follows. The
  corrections stand for wind and guidance updates; they are not computed.
- No new player-facing claim beyond the data's fact line.

## Haptics, motion, accessibility

- A short double pulse when the marker leaves the corridor, then 20 ms every 0.5 s while out; a
  10 ms tick when back on the line; 15 ms per hit pitch cue. All ≤ 300 ms.
- Reduced motion: the marker halo does not pulse, the plume does not flicker.
- Canvas `role=slider` (one button: `application`) with label, `aria-valuenow` (°), min 0, max 90
  and a value text (angle, line angle, state), updated at most ten times a second.
- Text follows the page text scale (to 200 %); right-to-left mirrors read-outs and labels (the
  charts keep time and downrange running left to right).

## Decisions

- Threshold 4° (perfect 1.5°) as game values: scripted tracers 0.2 s late score about 0.6°, 1.2 s
  late about 3.4°; an idle player (finger never moves) about 35°.
- `deviation_max_deg` uses ≤ (data suffix convention), although the design line says "below".
- The lane plots flight-path angle against time (that is what the player's finger sets and what
  `value` measures); the altitude-against-downrange curve is the inset.
