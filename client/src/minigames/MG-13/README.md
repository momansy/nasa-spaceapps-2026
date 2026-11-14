# MG-13 Ground Station Pass

Parallel solo, 20 s, flight phase F8 (each ground-station pass). Design section 10.5, task T021
step 2. Fact on the result screen: F09 (Deep Space Network, three sites about 120° apart).

A ground station rises, culminates at a seeded maximum elevation and sets across an antenna sky
view (a polar azimuth/elevation plot: centre = zenith, outer ring = horizon). Drag anywhere to
steer the antenna reticle and keep the station inside the lock circle. Data fills the data bar
only while locked. An elevation profile under the plot shows the predicted pass, the station's
elevation so far and a lock ribbon (solid green = locked, pale amber with a line = no lock).

| File | What |
|---|---|
| `model.ts` | Pass geometry, antenna, lock, scoring, scripted player (pure, deterministic) |
| `render.ts` | Canvas drawing (theme tokens, DPR ≤ 2, status = colour + shape + label + border) |
| `index.ts` | Canvas, input, loop, haptics, ARIA (`MinigameModule`) |
| `kit.ts` | **Orbit package kit** shared by MG-13 … MG-21: seeded random, fixed step, parameter readers, loop and demo hosts, canvas helpers, satellite drawing |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `lock_fraction_min` | fraction 0–1 | 0.75 | number | common | Success threshold (data/minigames.json), `≥` |
| `perfect_fraction_min` | fraction 0–1 | 0.95 | number | common | Perfect threshold, `game_value`; raised to the success threshold if lower |
| `lock_radius` | sky-plot radii (horizon = 1) | 0.13 | number | common | Lock circle, Standard / Engineer, `game_value` |
| `max_elevation_deg` | ° | seeded | number | common | Fixes the culmination elevation (10–85°) instead of the seed |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host (`slots.ts`); not used: parallel solo |

`hold_to_toggle` is ignored: the one button is already a press, never a hold.

## Result

- **Success:** locked for at least `lock_fraction_min` of the pass's fixed steps (exactly 75 % counts).
- **Perfect:** locked for at least `perfect_fraction_min` (95 %); implies success.
- **Score:** the locked fraction, 0–1.
- **`value`:** omitted.
- One result when the pass ends: Standard and One-button after 75 % of `durationMs` (15 s of
  20 s), Relaxed after 97 % ("the station moves more slowly"). Never after `durationMs`.

## Modes and difficulty (all `game_value`)

| | Lock circle | Pass length | Other |
|---|---|---|---|
| Standard | × 1 | 75 % of the run | Antenna slews at most 2.4 plot radii/s |
| Relaxed | × 1.45 | 97 % of the run | |
| One-button | × 1.15 | 75 % of the run | Antenna tracks by itself but drifts 0.075–0.11 plot radii/s in a direction that changes every 1.4–2.6 s (within ±60° of the current error); a press (tap anywhere, Space, Enter) re-centres it in about 0.25 s |
| Cadet | × 1.25 | | Culmination 25–55°, drift × 0.8 |
| Engineer | × 1 | | Culmination 30–70° |
| Flight Director | × 0.8 | | Culmination 40–78° (faster sweep), drift × 1.2 |

Keyboard: arrow keys move the antenna at 0.9 plot radii/s (Standard, Relaxed); Space / Enter
re-centre (One-button).

## Physics versus simplification

- **Physical (qualitative):** a pass rises, culminates and sets; the station moves slowly near
  the horizon and fastest near culmination; a higher pass sweeps the azimuth faster. A link is
  possible only while the station is in view (fact F09).
- **Game simplifications:** the pass is a straight-line overflight at constant speed above a flat
  ground plane at height 1 (closest ground distance cot E_max), between 5° elevation mask
  crossings; a real pass follows a curved Earth and lasts minutes, here 15–20 s. Plot radius is
  linear in (90° − elevation). Antenna slew limit, lock circle, the 8 Mbit/s data rate of the data
  bar and the 95 % perfect threshold are game values. No radio beam is drawn.

## Teams

Parallel solo: every phone plays its own pass from the shared seed. `slot` / `slots` (host
convention: `slot` = `assignments[].index`, per player; `slots` = number of assignments, common)
are accepted and ignored. `env.coop` is not used.

## Haptics, accessibility

Lock acquired: 14 ms; lock lost: 30-40-30 ms; one-button press: 10 ms (all ≤ 300 ms, capped by
the kit). Canvas `role="application"` with a label for the mode; a polite live region reads
"Locked / No lock, lock time N %" at most every 1.2 s. Reduced motion removes the re-centre ring
animation. Colours from the theme tokens; the lock circle is solid when locked and dashed when
not, and the status strip pairs icon shape, label and border style.
