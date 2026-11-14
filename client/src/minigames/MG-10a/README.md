# MG-10a Staging Timing

Flight phase F5 (each staging event), team sync, 10 s (design 10.5). The engine-cutoff light
comes on and the first-stage propellant gauge runs empty; everyone taps SEPARATE in the green
window just after cutoff, then IGNITE when the propellant-settling gauge is full. Fact F03:
propellant must settle before the next engine lights.

Files: `model.ts` (pure rules, `model.test.ts`), `render.ts` (canvas), `index.ts` (glue). The
shared plumbing is in `../MG-09/shared/` (see the MG-09 README).

## Sequence (play time)

| Moment | When | Value type |
|---|---|---|
| Engine cutoff light | seeded 2.6–3.8 s (earlier if a short host run needs it) | game value |
| SEPARATE moment (green) | cutoff + 0.5 s | game value |
| Propellant settling | seeded 1.8–2.6 s from the SEPARATE moment | game value |
| IGNITE moment (green) | SEPARATE moment + settling | game value |
| End of play | 1.2 s after the ignition (tap or backup), at most `durationMs` | game value |

All phones share the sequence (it depends only on the seed). A tap is judged by its own time
stamp (`event.timeStamp`), never by the frame that saw it.

- SEPARATE taps before cutoff are ignored (nothing to separate yet); IGNITE taps before the
  separation are ignored. The first counted tap of each step is judged; later ones do nothing,
  so mashing after cutoff gives an early SEPARATE and fails.
- When a window passes without a tap, the backup sequencer acts 0.2 s later (the step is missed);
  the player can still ignite after a missed separation.

## Controls

| Mode | Input |
|---|---|
| Standard / Relaxed | Two buttons, SEPARATE and IGNITE (84 px tall). Keys S or 1, I or 2; Space / Enter press the next step. |
| One button | The whole playfield (and Space / Enter): the first press separates, the second ignites. |

## Parameters

| Key | Unit | Default | Type | Scope | Meaning |
|---|---|---|---|---|---|
| `tap_window_s` | s | 0.3 (data) | number | common | Half-width of each window: a tap counts within ± this |
| `perfect_window_s` | s | 0.1 | number | common | Perfect: both taps within ± this (game value) |
| `slot` | — | 0 | int | per player (added by the host screen) | This player's index (only picks the seeded crew) |
| `slots` | — | 1 | int | common (added by the host screen) | Active players; `slots − 1` teammates are shown |

## Result

- `success`: both taps within ± `tap_window_s` of their moments (edges count).
- `perfect`: both within ± `perfect_window_s` (implies success).
- `score`: mean over the two taps of `1 − |Δt| / (2 × window)`, clamped; a missed step scores 0.
- No `value`.
- Exactly one result, when play ends (about 1.2 s after ignition) or at `durationMs`, computed by
  replaying the time-stamped inputs.

## Teammates and `env.coop`

- With `env.coop`, after each judged tap the phone sends `mg.action` `{ a: "sep" | "ign",
  x: [Δt in ms] }`. It shows a teammate's dot when the host's shared state holds
  `sep_<slot>` / `ign_<slot>` (Δt in ms) for that slot. **Host convention (proposed):** the host
  copies each player's last `x[0]` into `shared["<a>_<slot>"]`.
- Without `env.coop` (solo, demo), `slots − 1` crew members are simulated from the seed and the
  slot (mostly within ±0.12 s, sometimes late or missing) and labelled "crew".
- Each phone decides its own success from its own taps only.

## Modes and difficulty (game values)

| | Window half-width |
|---|---|
| Standard, Engineer | 0.3 s (data) |
| Relaxed | × 5/3 → 0.5 s ("the green window is wider") |
| Cadet | × 1.25 |
| Flight Director | × 0.8 |
| One button | as Standard (only the input changes) |

## Physics and simplifications

- Physical, qualitatively: staging after cutoff; an upper-stage engine needs settled propellant
  (fact F03), so the IGNITE moment comes after a settling time.
- Game values: every time, delay and window above; the drawn ullage puffs; the gauge levels.
- Simplification: real separation and settling sequences are automated and vary by vehicle; the
  game hands them to the players.

## Haptics, motion, accessibility

- Cutoff 60 ms; separation: the STAGING pattern `[90, 60, 30]`; ignition: a shortened IGNITION
  ramp `[40, 30, 60, 30, 120]` (280 ms). Never in the demo.
- Reduced motion: the cutoff light and status strip do not flash; puffs and plume are steady.
- Canvas `role=application` with a label naming the keys and a value text for each phase.
- Status = colour + shape + word + border: green check (solid) in the windows, amber dashed
  with a dot while settling, the cutoff octagon; tap results with a check or octagon and the
  signed offset in seconds.

## Decisions

- SEPARATE moment = cutoff + 0.5 s ("just after cutoff"), settling 1.8–2.6 s.
- Taps too early to apply (before cutoff, IGNITE before separation) are ignored rather than
  failing, so a nervous early tap is not punished; the first applicable tap is judged.
- Perfect = both within ±0.1 s.
- The 0.2 s grace of the backup sequencer only keeps the live display equal to the replay when
  a frame is slow; it does not widen the window.
