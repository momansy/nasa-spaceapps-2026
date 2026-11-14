# MG-20 Deorbit Burn

Parallel solo, 15 s, flight phase F9. Design section 10.5, task T021 step 7. The team median of
`value` sets the real burn. Fact on the result screen: the MG-20 line (slowing down lowers the
far side of the orbit into the atmosphere).

Hold anywhere (or Space / Enter) to fire the engine retrograde. Earth, its atmosphere up to the
Kármán line and the target band are drawn with altitudes exaggerated ("not to scale"); the orbit
after the burn is redrawn every frame with the periapsis marker at the bottom, and a vertical
gauge shows the periapsis altitude against the band. Release when the marker is in the band.

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `target_lo_km` | km | 40 | number | common | Bottom of the periapsis band, `game_value` |
| `target_hi_km` | km | 70 | number | common | Top of the band, `game_value` |
| `orbit_altitude_km` | km | 400 | number | common | Circular start orbit, `game_value` |
| `burn_rate_ms2` | m/s per s of hold | 25 | number | common | Time-compressed burn rate, `game_value` |
| `hold_to_toggle` | — | false | boolean | per player | Press to start, press to stop |
| `slot`, `slots` | — | host | number | per-player / common | Unused (parallel solo) |

The run uses no seed: every phone starts from the same orbit so the team median is meaningful.

## Result

- **Success:** periapsis altitude inside the band (inclusive).
- **Perfect:** inside the middle half of the band (47.5–62.5 km by default); implies success.
- **Score:** 1 at the middle, 0.5 at the band edges, falling to 0 one band-width outside.
- **`value`:** achieved periapsis altitude in **km**, rounded to 0.1 km (400 without a burn).
- One result 1.5 s after a release at or below the band top, else at the deadline (Standard and
  One-button 75 % of `durationMs`, Relaxed 97 %). Never after `durationMs`.

## Modes and difficulty (all `game_value`)

Relaxed: band × 1.5 around its middle and burn rate × 0.6 ("the marker drops more slowly").
Cadet: band × 1.25, rate × 0.8. Flight Director: band × 0.8, rate × 1.2. One-button is the same
hold button ("already one button"); `hold_to_toggle` switches to press-to-start / press-to-stop.

## Physics versus simplification

- **Physical:** μ⊕ = 3.986 × 10¹⁴ m³/s² (core `PhysicalConstants.cs`), R⊕ = 6 371 km. From a
  circular orbit at r, v_c = √(μ/r); after a retrograde Δv the speed is v_a = v_c − Δv at the
  same point, which becomes the apoapsis. Vis-viva: a = 1/(2/r − v_a²/μ), periapsis r_p = 2a − r
  (checked against h = r·v_a, r_p = h²/(μ(1 + e))). Example: 100 m/s from 400 km → 58 km.
- **Game simplifications:** the burn rate is time-compressed (a real deorbit burn of ~100 m/s
  takes minutes); the burn is instantaneous for the orbit shape; the target band; exaggerated
  altitudes in the picture.

## Haptics, accessibility

Engine on / off: 30 / 15 ms; a short 18 ms rumble every 0.4 s while burning (none in reduced
motion); entering the band: 20-30-20 ms (≤ 300 ms). The canvas is a `role="button"` with
`aria-pressed`; a polite live region reads status changes and the periapsis every 20 km. The
periapsis status uses colour + icon + label (warning triangle above the band, octagon below).
