# MG-10 Fairing Catch

Flight phase F6 (reusable fairing only), cooperative split, 20 s (design 10.5). Two fairing
halves drift down under parafoils; each player steers a recovery boat to keep its net under
their half.

Files: `model.ts` (pure rules, `model.test.ts`), `render.ts` (canvas), `index.ts` (glue). The
shared plumbing is in `../MG-09/shared/` (see the MG-09 README).

## Teams

- **This player's half is chosen by slot parity**: even slots catch the left half (gold
  parafoil on their screen), odd slots the right half.
- The other half and its boat are decoration: from `env.coop` when present (the phone sends
  `mg.action { a: "boat", x: [boat position in m] }` every 0.3 s; the first teammate of the other
  parity with `shared["boat_<slot>"]` is drawn), otherwise a seeded crew boat that follows its
  half a little late, labelled crew. Each phone judges only its own boat.

## Controls

| Mode | Input |
|---|---|
| Standard / Relaxed | Touch or drag on the scene: the boat steers to that spot (absolute, top speed 18 m/s). Keys: hold ← / → to steer. |
| One button | Hold the screen, Space or Enter: the boat is pulled towards your half like a spring (it swings past if you keep holding); release: it coasts to a stop (0.6 s) and drifts with a seeded sea current up to 1 m/s. The boat starts 36–46 m off. `hold_to_toggle`: presses toggle the pull. |

## Parameters

| Key | Unit | Default | Type | Scope | Meaning |
|---|---|---|---|---|---|
| `under_target_fraction_min` | fraction | 0.7 (data) | number | common | Success: under the target ≥ this fraction of the time |
| `fairing_refund_fraction_max` | fraction | 0.6 (data) | number | common | **Host reward only**; ignored here |
| `perfect_fraction_min` | fraction | 0.85 | number | common | Perfect (game value) |
| `net_half_width_m` | m | 15 | number | common | Net half-width (game value) |
| `hold_to_toggle` | — | false | boolean | per player | One-button toggle |
| `slot` | — | 0 | int | per player | Picks the half (parity) and the start side |
| `slots` | — | 1 | int | common | Active players |

## Result

- Under target: |boat − half| ≤ net half-width (horizontal distance, m), counted per 1/120 s step.
- `success`: under for ≥ 70 % of the steps (exactly 70 % counts). `perfect`: ≥ 85 %.
- `score`: the under-target fraction. No `value`.

## Model (game values)

The scene is ±110 m wide; the halves start 35–50 m either side of the centre and stay inside
±85 m (soft walls). Wind on each half: a seeded mean drift (2–3.5 m/s away from this player's
starting side for their half) plus three seeded sines, about 9 m/s at most. Altitude falls from
1,500 m to the sea over the play time (a real parafoil takes minutes: time is squeezed). The boat
starts 20–32 m from its half; steering: velocity command 2.5/s × distance, top speed 18 m/s,
acceleration 12 m/s², lag 0.25 s. Physical only qualitatively: a parafoil drifts with the
wind; a boat has a top speed and inertia. One horizontal axis; no waves under the boat.

## Modes and difficulty

| | Wind | Net |
|---|---|---|
| Relaxed | × 0.6 ("drift more slowly") | × 1.4 ("the net is larger") |
| One button | — | × 1.25 |
| Cadet | × 0.8 | × 1.25 |
| Flight Director | × 1.15 | × 0.8 |

## Haptics, motion, accessibility

- `[30, 30, 30]` when the net leaves the half, 18 ms every 0.6 s while out, 12 ms back under.
- Reduced motion: still sea lines, no parafoil sway.
- Canvas `role=application`; value text: under / how far left or right the half is (m), altitude.
- The scene is a map (left is left): it is not mirrored in right-to-left layouts.

## Decisions

- Net half-width 15 m, perfect 85 % (the boat needs 1–3 s to reach its half at the start).
- One button follows the data line (hold to steer, release to drift), with an undamped pull so
  that holding all the time swings past the half: it fails on most seeds (at most a third in the
  tests) and always scores below timed releases.
- The half's mean drift is set away from the boat's starting side so an idle boat cannot be
  "caught" by luck.
