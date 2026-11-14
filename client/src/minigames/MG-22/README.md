# MG-22 Entry Corridor

Design 10.5 (F10, parallel solo, 25 s, aggregation `team_average`, fact F17). Package E4 of T022.
`kit.ts` in this folder is the shared plumbing of MG-22 … MG-25 (canvas, fixed-step runner, demo
runner, graphics helpers); the other folders import it as `../MG-22/kit`.

**Play.** The capsule's flight-path angle γ drifts under seeded density and lift perturbations.
Drag down to steepen, up to shallow (drag is relative to where the finger went down; a drag of 35 %
of the chart height is full stick). Too steep fills the heat bar, too shallow fills the skip-risk bar.
Keys: ↓ / → steepen, ↑ / ← shallow, PageDown / PageUp full stick. **One-button:** hold (Space, Enter,
↓ or any press) to steepen, release to shallow; `hold_to_toggle: true` turns the hold into a toggle.
**Relaxed:** corridor ×1.6, disturbances ×0.7, centre guide line. **One-button:** corridor ×1.5,
disturbances ×0.6. **CADET** corridor ×1.25 (+ guide), **FLIGHT_DIRECTOR** ×0.8 and the corridor edges are
drawn only when γ is within about 0.5° of them (design 9.3).

## Params (`mg.start.params`)

| key | unit | default | type | scope | meaning |
|---|---|---|---|---|---|
| `corridor_steep_deg` | ° | −7.4 | number | common | steep edge (negative = below the horizon). `real_world_approximate`: Apollo 13, fact F17 |
| `corridor_shallow_deg` | ° | −5.25 | number | common | shallow edge. `real_world_approximate`: Apollo 13, fact F17 |
| `in_corridor_fraction_min` | 0–1 | 0.85 | number | common | success: inside at least this fraction (data, design 10.5) |
| `perfect_fraction_min` | 0–1 | 0.97 | number | common | perfect (≥ success); `game_value` |
| `drift_deg_s` | °/s | seeded ±0.22…0.42 (× mode factor) | number | common | force a signed steady drift (density) instead of the seeded one |
| `wave_deg_s` | °/s | 0.25 | number | common | amplitude of the lift waves |
| `start_deg` | ° | seeded in the corridor | number | common | start angle |
| `hold_to_toggle` | – | false | boolean | common | one-button: tap toggles instead of hold |
| `slot`, `slots` | – | 0, 1 | int | host adds | ignored (solo minigame; each phone plays its own run) |

Actions / shared keys: none (`env.coop` is not used).

## Result

- `success`: inside the corridor in ≥ `in_corridor_fraction_min` of the 120 Hz steps (exactly 85 % counts).
- `perfect`: ≥ `perfect_fraction_min` (0.97, `game_value`); implies success.
- `score`: inside fraction 0–1.
- **`value`: mean γ over the whole run, in degrees** (negative = below the horizon, e.g. −6.5 °). The host
  averages it over the team ("the team average sets the real flight path angle").

## Physics versus simplification

- *Physical:* γ is the angle of the velocity vector below the local horizon; entering too steeply raises
  heat and g load, too shallowly lets the capsule skip back out.
- *Game simplification:* γ is the only state; the player steers its rate (a stand-in for rolling the lift
  vector, `STICK_RATE` 1.25 °/s, one-button 0.85 °/s, lift lag 0.09 s, all `game_value`); the density drift
  (≈ 0.22–0.42 °/s) and three lift sine waves (≈ 0.25 °/s) are seeded, not an atmosphere model. The heat and
  skip bars are visual feedback only and never change the result. Explicit Euler at 120 Hz.
- *Corridor edges (−7.4 °, −5.25 °; width 2.15 °):* `real_world_approximate`, the Apollo 13 entry corridor of fact
  F17, source NASA NTRS 20090026451 (<https://ntrs.nasa.gov/api/citations/20090026451/downloads/20090026451.pdf>,
  listed in `data/facts.json`). Real corridors depend on vehicle and entry speed. The path angle in the scene is
  exaggerated ×3 so it can be read; the number shown is the real γ.

## Accessibility, haptics, performance

Canvas `role="slider"` with `aria-valuenow` (γ, °), `aria-valuetext` ("−6.5 degrees, inside the corridor") and a
polite live region (at most every 1.5 s). Status is colour + glyph + word + border style / pattern. Haptics:
12 ms tick when re-entering the corridor, `[40, 30, 40]` when leaving, 20–35 ms rumble every 0.45 s while out.
Reduced motion: no plasma flicker, fewer streaks. DPR capped at 2, no per-frame allocation in the step loop,
chunk well under 60 KB. `dir=rtl` mirrors the cards and keeps numbers left to right.
