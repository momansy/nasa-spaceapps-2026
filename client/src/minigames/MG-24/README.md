# MG-24 Hoverslam

Design 10.5 (F7b, parallel solo, 20 s, aggregation `team_median`, fact MG-24). Package E4 of T022. Uses the shared
plumbing in `../MG-22/kit.ts`.

**Play.** The booster falls from a seeded altitude and speed. Tap IGNITE **once** (button, Space or Enter; in
one-button mode the whole playfield). One ignition gives a constant net deceleration `a = T/m − g0`. The ghost line marks
the ideal ignition altitude h*. **Standard:** the ghost stays 1 s, then fades over 3 s. **Relaxed:** the ghost stays and
the ignition window is wider. **One-button:** "already one button", so unchanged. **CADET:** ghost stays, window ×1.25.
**FLIGHT_DIRECTOR:** window ×0.8, the ghost fades in half the time. "Window" is the span of real time in which a tap lands
softly (see *bullet time* below).

## Params (`mg.start.params`)

| key | unit | default | type | scope | meaning |
|---|---|---|---|---|---|
| `touchdown_speed_below_m_s` | m/s | 2 | number | common | success: touchdown speed **strictly below** this (data, design 10.5) |
| `perfect_below_m_s` | m/s | 1 | number | common | perfect "Hoverslam Hero": strictly below this; `game_value` |
| `thrust_to_weight` | – | 2.5 | number (> 1) | common | T/(m·g0) of the engine at its lowest throttle; always > 1 so the booster cannot hover; `game_value` |
| `start_altitude_m` | m | seeded 450…650 | number | common | override the start altitude; `game_value` |
| `start_speed_m_s` | m/s | seeded 15…30 | number | common | override the downward start speed; `game_value` |
| `slow_zone_m` | m | 20 | number | common | bullet-time zone around h*; `game_value` |
| `slow_factor` | – | 1/60 | number | common | lowest clock rate near h* (before the mode/difficulty factor); `game_value` |
| `ghost_fade_s` | s | 3 | number | common | fade time of the ghost in Standard; `game_value` |
| `slot`, `slots` | – | 0, 1 | int | host adds | ignored (solo minigame, the host takes the team median) |

Actions / shared keys: none (`env.coop` is not used).

## Result

- `success`: touchdown speed `< 2 m/s` (strict: exactly 2.000 m/s fails).
- `perfect`: touchdown speed `< 1 m/s`; implies success.
- `score`: success 0.6…1 (softer is higher); failure below 0.5 (a crash at the no-ignition speed scores 0).
- **`value`: touchdown speed in m/s** (the speed at the ground, or the exact projection of the ignition made if the clock ends first; the no-ignition crash speed `√(v0² + 2·g0·H0)` if nobody ignites). The host takes the median over the team.
- The run ends 1.2 s after touchdown, at most at `durationMs`.

## Physics versus simplification

- *Physical (exact):* free fall `h = H0 − v0·τ − g0·τ²/2` with g0 = 9.80665 m/s² and no drag. After the ignition at
  altitude h and speed v: **late** (v² > 2ah): touchdown speed `√(v² − 2ah)`. **Ideal** (v² = 2ah): zero, i.e.
  `h* = v²/(2a) = (v0² + 2·g0·H0)/(2·T/m)`. **Early** (v² < 2ah): the burn stops the booster `h − v²/(2a)` above the
  ground and the engine cuts; it falls again and lands at `√(2·g0·h_stop)`. Near h* the touchdown speed is
  `√(2·(T/m)·(h* − h))` late and `√(2·g0·(T/m / a)·(h − h*))` early: a window of about ±0.1 m around h*.
  Hand-computed checks (H0 = 500 m, v0 = 0, T/m = 2.5 g0, h* = 200 m; 190 m → 22.14 m/s, 210 m → 18.08 m/s) are in `model.test.ts`.
- *Game simplification (bullet time):* a window of ±0.1 m is 2 ms of falling at 90 m/s, which no tap can hit. So **before the ignition the game
  clock slows near h***: `dτ/dt = clamp(|h − h*| / 20 m, 1/60, 1)` (1/150 Relaxed, ×1.25 / ×0.8 for Cadet / Flight Director). The physics
  stays exact in game time; only the speed of the clock is a `game_value`. A tap then has about 0.14 s (Standard), 0.36 s (Relaxed) of real time.
  The screen says "SLOW MOTION · 1/60 SPEED". After the ignition time runs at normal speed.
- Other `game_value`s: T/m = 2.5·g0 (a = 14.7 m/s²), seeded start 450…650 m at 15…30 m/s, no wind, one burn.

## Accessibility, haptics, performance

Canvas `role="button"`, label and a polite live region (altitude m, speed m/s, state; at most every 1.5 s). Status is colour + glyph +
word + border style; numbers have units. Haptics: 30 ms at ignition, 20 ms rumble every 0.5 s while burning, TOUCHDOWN
`[160, 80, 60]` on a soft landing, ALERT `[60, 60, 60]` on a hard one. Reduced motion: no flame flicker, no dust ring.
DPR capped at 2, no per-frame allocation in the step loop, chunk about 13 kB. The scene zooms as the booster falls
(the view reaches 1.7 × the altitude).

## Decisions

Bullet time (above) is the decision that makes "tap once" playable while keeping the touchdown formulas exact. The
thresholds, T/m, ranges and ghost timing are `game_value`s; the data stores only `touchdown_speed_below_m_s`.
