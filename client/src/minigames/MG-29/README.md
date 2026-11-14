# MG-29 Predict the Physics (bonus round)

Parallel solo, 10 s, between phases. Design section 10.5, task T019 step 4. Fact on the result
screen: F32 (hammer and feather on the Moon).

A question card, a choosing-time bar with a "fast bonus" marker at half time, an animation
stage and two or three answer buttons. Tapping an answer locks the prediction and starts the
animation at once; if nothing is locked, the animation starts when the choosing time runs out.
The animation always shows the true outcome; then the verdict and a one-line principle appear.

| File | What |
|---|---|
| `model.ts` | Question bank, timeline (choose → animation), lock, one-button cycle, scoring, scripted player (pure) |
| `scenes.ts` | The nine answer animations (vector art, illustrative timing) |
| `render.ts` | Question card, time bar, stage, verdict panel, answer buttons |
| `index.ts` | Canvas, input (tap, keys, one button), loop, haptics, ARIA |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `question` | index | seeded | integer 0–8 | common | Picks the question (table below); otherwise the seed does |
| `hold_to_toggle` | — | — | boolean | common | No effect: one press locks |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; not used (parallel solo) |

The data has no numeric threshold for MG-29.

## Rules

- **Answer order:** shuffled from the seed (the bank's order is not the button order), and the
  one-button highlight starts on a seeded button, so "A" is not a safe guess.
- **Success:** the correct answer locked before the animation (during the choosing time; exactly at
  its end counts). **Perfect:** locked within the first half of the choosing time (exactly half
  counts). **Score:** 0 when wrong or nothing locked, otherwise 1 − 0.5 × lock time / choosing time
  (0.5–1). A locked prediction cannot be changed.
- **Timeline (`game_value`):** choosing time = 50 % of `durationMs` (5 s of 10 s), Relaxed 65 %
  ("more time to choose"), One-button 62 %; Cadet ×1.2, Flight Director ×0.8; always capped so
  that choosing + animation ≤ `durationMs`. Animation 3.6 s. Play ends when the animation ends.
- **One-button** (data line): the answers light up in turn (1.0 s each, Relaxed ×1.2, Cadet ×1.2,
  Flight Director ×0.8; at least two full turns at Engineer); a press anywhere or Space / Enter
  locks the lit answer.
- Keyboard: 1 / 2 / 3 (or A / B / C) lock directly; arrows move a focus ring and Enter locks it.

## The question bank (all player-facing physics)

| # | Id | Question (short) | Answer | Principle | Fact |
|---|---|---|---|---|---|
| 0 | `hammer_feather` | Hammer and feather dropped on the Moon | They land together | Without air, gravity gives every body the same acceleration (equivalence of gravitational and inertial mass) | F32 |
| 1 | `iss_float` | Why astronauts float in a station | Falling around Earth | Orbit is free fall; gravity at station altitude is about 90 % of surface gravity | F06 |
| 2 | `coast` | Spacecraft coasting with the engine off | Speed stays the same | Newton's first law (inertia) | F12 |
| 3 | `orbit_speed` | Low or high orbit faster | The low one | Circular orbital speed v = √(GM / r): smaller r, larger v; angular rate ∝ r^−1.5 (Kepler's third law) | F05 |
| 4 | `sideways_drop` | Ball dropped versus thrown sideways | Both together | Horizontal and vertical motion are independent (projectile motion, no drag) | — |
| 5 | `moon_pendulum` | Same pendulum on Earth and Moon | Slower on the Moon | Small-swing period T = 2π √(L / g); g_Moon ≈ 1.62 m/s², g_Earth ≈ 9.81 m/s² (`real_world_approximate`), so ≈ 2.5× longer | — |
| 6 | `rocket_vacuum` | Can a rocket push in empty space | Yes, on its own exhaust | Newton's third law / conservation of momentum | — |
| 7 | `spin_arms` | Spinning astronaut pulls arms in | Spin speeds up | Conservation of angular momentum, L = I ω | — |
| 8 | `push_off` | Astronaut pushes off a heavy module | The astronaut moves faster | Conservation of momentum: equal and opposite impulses, v ∝ 1 / m | — |

Animation values are illustrative (`game_value`): the coasting craft's "v = 2.0 m/s", the spin
rates in rev/s, the 1 : 5 astronaut-to-module mass ratio, the time compression of every scene.
The pendulum uses the real period ratio √(9.81 / 1.62).

## Physics versus game simplification

Every question's outcome is textbook mechanics (table). Game: the timing, the scene scale, the
illustrative numbers above and the vector art. The "why" lines restate the principle in plain
words; the only numeric claim is "about 90 %" from fact F06.
