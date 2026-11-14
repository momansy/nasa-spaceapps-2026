# MG-14 Debris Dodge

Parallel solo, 20 s, flight phase F8 (conjunction warning event). Design section 10.5, task T021
step 5. Fact on the result screen: F10 (the ISS performs debris-avoidance manoeuvres; tens of
thousands of objects are tracked).

An encounter plot shows the predicted position of the spacecraft at the time of closest approach
(TCA) relative to a tracked debris object: the debris uncertainty ellipses (1σ, 2σ, 3σ, longer
along the track), a hatched keep-out zone with a double red edge where the collision probability
is above the threshold, the position without a burn (hollow ring) and with the selected burn
(filled dot). A gauge shows the probability on a log scale with the threshold. Choose a direction
(prograde, retrograde, radial out, radial in) and a duration, then burn. After the burn the
outcome stays for 1.6 s: Δv used, the smallest Δv that clears, wasted fuel and the miss distance.

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `delta_v_ratio_max` | ratio | 1.2 | number | common | Success: Δv ≤ this × Δv_min (data/minigames.json), `≤` |
| `pc_threshold` | probability | 1 × 10⁻⁴ | number | common | Clear = Pc **<** threshold, clamped to 10⁻⁵…10⁻³, `real_world_approximate` order of magnitude |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; unused (parallel solo) |

## Result

- **Success:** the burn's Pc is below the threshold **and** Δv ≤ `delta_v_ratio_max` × Δv_min
  (exactly 1.2 × counts; a tolerance of 10⁻⁹ m/s absorbs rounding).
- **Perfect:** a clearing burn with Δv = Δv_min; implies success.
- **Score:** Δv_min / Δv for a clearing burn, else 0.
- **Δv_min:** the smallest Δv on the menu (any direction) whose Pc is below the threshold. The
  menu is 0.5–8 s of burn in 0.5 s steps at 0.04 m/s², so Δv 0.02–0.32 m/s.
- **`value`:** omitted. One result 1.6 s after the burn, or at the choosing deadline without a
  burn (fail). Never after `durationMs`.

## Modes and difficulty (all `game_value`)

| | Choosing time | Options |
|---|---|---|
| Standard | 75 % of the run (15 s of 20 s) | Full menu: 4 directions × 16 durations, with a live preview |
| Relaxed | 97 % of the run | Short list of six burns (one just too small, the minimum, the next step up, the opposite direction, a radial burn, an overburn), sorted by Δv |
| One-button | 75 % of the run | The short list, highlighted in turn every 1.3 s (Cadet 1.6 s, Flight Director 1.1 s); a press anywhere burns the highlighted row |

Difficulty scales the time to choose (Standard and One-button: Cadet × 1.15, Flight Director × 0.85 of the 75 % deadline) and the position uncertainty: Cadet σ × 0.8, Flight Director σ × 1.2 (σr = 100 m,
σt = 500 m for Engineer; hard-body radius 20 m). The seed picks a lead time of 0.4–0.9 orbit and a
nominal miss inside the uncertainty, re-drawn until Δv_min lies between 1 s and 5 s of burn.

Keyboard (Standard): ↑ / ↓ direction, 1–4 direction, ← / → duration, Space / Enter burn.
Relaxed: ↑ / ↓ row, Space / Enter burn. One-button: Space / Enter.

## Physics versus simplification

- **Physical:** μ⊕ = 3.986 × 10¹⁴ m³/s² (core `PhysicalConstants.cs`, which wins over the
  3.986004418 × 10¹⁴ of the brief), R⊕ = 6 371 km, mean motion n = √(μ/r³) of a 400 km circular
  orbit (≈ 1.133 × 10⁻³ rad/s, 92.4 min). Miss change from the Clohessy–Wiltshire linearisation
  for an impulse (Δvx radial, Δvy along-track) a time T before TCA:
  x = (Δvx/n) sin nT + (2Δvy/n)(1 − cos nT), y = (2Δvx/n)(cos nT − 1) + (Δvy/n)(4 sin nT − 3nT).
  A tangential burn drifts along-track like 3 Δv T (a prograde burn raises the orbit and falls
  behind); a radial burn only oscillates and moves the spacecraft much less.
- **Real-world approximate:** small-object collision probability
  Pc ≈ R² / (2 σr σt) · exp(−½ (x²/σr² + y²/σt²)), larger uncertainty along the track, and a
  manoeuvre threshold of the order of 10⁻⁴.
- **Game simplifications:** the miss is measured in the radial / along-track plane at TCA (the real
  encounter plane depends on the relative velocity); a burn of seconds is an impulse; σ, R, the
  orbit, the thruster acceleration, the menu, lead time and nominal miss are game values.

## Haptics, accessibility

Control tap: 6 ms; one-button highlight change: 8 ms; burn: 20 ms; safe and economical:
60-40-30 ms; not a success: 90-60-90 ms (≤ 300 ms). All controls are ≥ 48 CSS px. Canvas
`role="application"` with a mode-specific label; a polite live region reads each option as it is
selected ("Retrograde, 2.5 seconds, delta-v 0.10 m/s, probability 3.2 × 10⁻⁵, below the
threshold"). Status uses colour + icon + label + border, the keep-out zone is hatched with a
double edge, the gauge's danger side is hatched.
