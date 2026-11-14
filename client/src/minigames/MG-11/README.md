# MG-11 Pogo Damper

Flight phase F5 (if pogo is triggered), team sync, 15 s (design 10.5). The vehicle bounces
lengthwise; the player taps in counter-phase, on each low point (trough) of the bounce. The more
players in sync, the faster the drawn bounce dies away. Fact F07.

Files: `model.ts` (pure rules, `model.test.ts`), `render.ts` (canvas), `index.ts` (glue). The
shared plumbing is in `../MG-09/shared/` (see the MG-09 README).

## Game simplification: the frequency

Real pogo runs at several to tens of hertz, far too fast to tap. **The game slows it to 1.25 Hz
(Relaxed 1.0 Hz)** and says so on screen ("Pogo slowed to 1.25 Hz"). This is a game value, not a
physical one.

## Beats and judging

- Beats are the troughs, every 0.8 s from about 1.6–1.85 s (seeded phase); the bounce builds up
  over the period before the first beat. Beats whose window would not close inside the play
  time are not used (about 16 beats in 15 s).
- Each beat owns a cell of half a period either side of its trough. The beat counts as
  counter-phase when **the first tap in its cell** is within ± window of the trough (by its time
  stamp). Mashing fails (the first tap of a cell lands at its edge); tapping on the crests fails.
- A visual metronome marks every beat: a ring closes on the TAP disc and reaches it on the
  trough; the green ring shows the window. The bounce trace below shows past and coming low
  points (diamonds), the windows and the counted taps.

## Controls

The whole playfield is the button in every mode (the data's one-button line: "already one
button"), plus Space / Enter.

## Parameters

| Key | Unit | Default | Type | Scope | Meaning |
|---|---|---|---|---|---|
| `counter_phase_beats_fraction_min` | fraction | 0.7 (data) | number | common | Success: counter-phase on ≥ this fraction of beats |
| `perfect_beats_fraction_min` | fraction | 0.95 | number | common | Perfect (game value) |
| `pogo_hz` | Hz | 1.25 | number | common | Drawn bounce frequency (game value) |
| `beat_window_s` | s | 0.12 | number | common | Half-width of the beat window (game value) |
| `slot` | — | 0 | int | per player | Picks the seeded crew |
| `slots` | — | 1 | int | common | Active players (damping share, crew count) |

## Result

- `success`: counter-phase beats ≥ 70 % of all beats (exactly 70 % counts).
- `perfect`: ≥ 95 % (implies success). `score`: the counter-phase fraction. No `value`.
- Exactly one result at the end of `durationMs`, from the replayed time-stamped taps.

## Teammates and damping (decoration only)

- After each settled beat the bounce amplitude is multiplied by `1 − 0.16 × f` when the share
  `f` of the team in counter-phase is at least 0.3, else it grows by 5 % (clamped 0.08–1.2).
  Teammates come from `env.coop` when present (`mg.action { a: "beat", x: [beat index] }` is sent
  for each counter-phase beat; teammate `i` counts as in sync on beat `k` when the shared state
  holds `beat_<i>` = k), otherwise from a seeded crew (72–92 % in sync, improving), labelled crew.
- Each phone judges only its own taps.

## Modes and difficulty (game values)

| | Frequency | Window half-width |
|---|---|---|
| Standard, Engineer | 1.25 Hz | 0.12 s |
| Relaxed | × 0.8 (1.0 Hz) | × 1.6 |
| Cadet | — | × 1.25 |
| Flight Director | — | × 0.8 |
| One button | as Standard | as Standard |

## Haptics, motion, accessibility

- A 20–60 ms pulse at each crest while the bounce amplitude is above 35 % (the rumble), 12 ms for
  each beat in counter-phase.
- Reduced motion: the vehicle does not heave or squash and the TAP disc does not flash; load
  arrows beside the body and the trace still show the bounce.
- Canvas `role=application`; value text: beats in counter-phase so far and seconds to the next
  low point.

## Decisions

- Counter-phase = a tap on the trough; the first tap per cell is judged (anti-mash).
- Perfect 95 %, window ±0.12 s, 1.25 Hz, damping and growth rates.
