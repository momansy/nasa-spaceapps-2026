# MG-27 Recovery Team

Design 10.5 (F13, cooperative split, 20 s, aggregation `none`). Package E4 of T022. Uses the shared plumbing in `../MG-22/kit.ts`
(and `hash01` from `../MG-25/model`).

**Play.** Three units reach the capsule in a fixed order: **swimmers by helicopter, flotation collar by boat, recovery ship**. This player's
unit is `params.unit` (0 swimmers, 1 collar, 2 ship) or else `slot` mod 3; extra players share the same three units. The capsule is
hidden: a **beacon signal** (0–100 %, meter and rings) rises as your unit closes in. Drag anywhere on the sea to steer (the first touch is the stick centre; a
70 px drag is full speed) or use the arrow keys. The row of three chips shows who has arrived and when ("YOUR TURN" lights when the unit before yours is in).
**Success:** your unit arrives (comes within the arrival radius) **after** the unit before it and **before** the unit after it, and by the deadline
(swimmers: before the collar; ship: after the collar). **Relaxed:** easier beacon (falloff exponent 1.5 instead of 2, less static, a faint arrow
towards the capsule) and the deadline is the whole run (Standard: 75 % of it, 15 s). **One-button:** the unit stays until the whole playfield is
pressed (or Space / Enter), then steers itself to the capsule; press when it is your turn. **CADET** arrival radius ×1.25 and less static;
**FLIGHT_DIRECTOR** ×0.8 and more static.

## Params (`mg.start.params`)

| key | unit | default | type | scope | meaning |
|---|---|---|---|---|---|
| `unit` | – | `slot` mod 3 | int 0–2 | per player | 0 swimmers, 1 collar boat, 2 ship |
| `slot` | – | 0 | int | per player | 0-based, equals `assignments[].index` |
| `slots` | – | 1 | int | common | number of players |
| `arrive_km` | km | 0.35 | number | common | arrival radius; `game_value` |
| `deadline_fraction` | 0–1 | 0.75 | number | common | Standard deadline as a share of `durationMs`; `game_value` |
| `perfect_fraction` | 0–1 | 0.4 | number | common | perfect: arrival in the middle fraction of the allowed window; `game_value` |

**Actions / shared keys** (optional, display only): action `arrive` x = `[unit, playTimeMs]` once, when this unit arrives; shared `arrived`
(number[3]) = play time in ms of each unit's arrival, −1 until it happens (the host may share it). The game works without `env.coop`.
The other two units arrive on a **seeded schedule** (about 6.5 s, 10.5 s and 14 s for swimmers, collar and ship, ±0.7 s) and are shown only as chips.

## Result

- `success`: `t_arrive` in the open window between the scheduled arrival of the unit before and of the unit after (swimmers: from 0 s; ship: up to the
  deadline), strict at both ends, measured in 120 Hz steps.
- `perfect`: success with `t_arrive` in the middle 40 % of the window; implies success.
- `score`: success 0.6…1 (closer to the middle is higher); arrived in the wrong order 0.3; not arrived below 0.3 by how close the signal got.
- `value`: not reported. The run ends 1.2 s after arrival, or at the deadline.

## Physics versus simplification

- *Real-world approximate:* after splashdown the swimmers (by helicopter), the flotation collar (boat) and the recovery ship reach the capsule in that
  order; a beacon helps to find it.
- *Game simplification:* a 12 km × 12 km sea; unit speeds 2.4 / 0.9 / 0.6 km/s of play (time compressed, about 1 s of play = 1 min); units start 3 to 9 km
  away; beacon signal `(1 − d / 14.4 km)^p` plus seeded static; velocity follows the stick with a 0.3 s time constant. All `game_value`s.

## Accessibility, haptics, performance

Canvas `role="application"`; a polite live region speaks unit, signal and state (at most every 1.5 s). Status is colour + glyph + word + border style; the
chips and the status line say who is where. Haptics: 10 ms pulses that get closer together as the signal grows, `[20, 40, 140]` on an arrival in order,
`[60, 60, 60]` out of order or too late. Reduced motion: static beacon rings. DPR capped at 2, the wake is a preallocated ring buffer, no per-frame allocation
in the step loop, chunk about 20 kB.

## Decisions

The result is decided by the seeded schedule only, so `env.coop` cannot change any phone's result (rule of the brief); the capsule stays hidden until arrival.
Success is strict at both ends of the window. The one-button autopilot uses the true bearing (the data line says the unit "steers toward the beacon by itself").
