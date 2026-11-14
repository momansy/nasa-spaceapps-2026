# MG-15 Solar Wing Deploy

Cooperative split, 20 s, flight phase F8 when a deployable array was chosen. Design section 10.5,
task T021 step 3. Fact on the result screen: F11 (about 1,361 W/m² near Earth, cells convert
roughly 30 %).

**Phase 1, release order.** The style-guide satellite (insulated bus, two balanced solar wings
on hinges, nadir aperture, separate antenna) waits with its wings stowed. The release-order
diagram shows one window per hinge; this player's hinge (`slot`) is marked YOU and lights up at
its turn. Tap anywhere (or Space / Enter) inside the window. A press before the window opens is
**early**, no press before it closes is **late** (a backup timer then releases it): both are out
of order. Panels swing open root-first on their hinges as the team releases them.
**Phase 2, Sun-pointing.** A dial seen along the wing axis shows the Sun, the tolerance wedge,
the turning bus and the wing's cell side with its normal arrow. Drag around the dial (or hold the
arrow keys) to turn the wing drive so the cells face the Sun while the spacecraft turns.

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `sun_pointing_fraction_min` | fraction 0–1 | 0.8 | number | common | Success threshold (data/minigames.json), `≥` |
| `perfect_fraction_min` | fraction 0–1 | 0.95 | number | common | Perfect threshold, `game_value` |
| `pointing_tolerance_deg` | ° | 15 | number | common | Sun-pointing means \|θ\| ≤ this (Standard, Engineer), `game_value` |
| `peak_power_w` | W | 150 | number | common | Wing power at θ = 0, `real_world_approximate` (the part's 150 W) |
| `slot` | index | 0 | number | **per player** | This player's hinge = `slot mod hinges` (host: `assignments[].index`) |
| `slots` | count | 1 | number | common | Players in the split; hinges = clamp(`slots`, 2, 6) |

`hold_to_toggle` is ignored (every input is a press).

## Result

- **Success:** own hinge released inside its window **and** Sun-pointing for at least
  `sun_pointing_fraction_min` of the phase 2 steps (exactly 80 % counts).
- **Perfect:** in order and ≥ `perfect_fraction_min` (95 %); implies success.
- **Score:** 0.25 for the hinge in order + 0.75 × Sun-pointing fraction.
- **`value`:** omitted. One result at the end of phase 2.

## Timing, modes and difficulty (all `game_value`)

1.0 s to read the diagram, then one window per hinge (Standard: every 1.0 s, open 0.8 s;
Relaxed: every 1.6 s, open 1.3 s; Cadet × 1.15, Flight Director × 0.9), 0.6 s for the last panel
to open, then phase 2 (7 s Standard, 7.5 s Relaxed). Standard fits 75 % of `durationMs`, Relaxed
97 %; longer plans are scaled down to fit. Body turn: two seeded sines, peak 20 °/s (Relaxed
× 0.7; Cadet × 0.8, Flight Director × 1.25). Wing drive ≤ 120 °/s; keyboard 70 °/s.
Tolerance: Relaxed × 1.6, One-button × 1.4; Cadet × 1.25, Flight Director × 0.8.

**One-button:** press when your hinge is lit; in phase 2 the drive tracks the Sun by itself but
builds up an error drifting 5–8 °/s (Cadet × 0.8, Flight Director × 1.2) away from the Sun; each
press nudges it back by up to 12°.

## Physics versus simplification

- **Physical:** power of a flat panel ∝ cos θ (θ between the panel normal and the Sun), zero with
  the Sun behind the panel; the readout shows θ, cos θ and the power in W.
- **Real-world approximate:** 150 W peak, from the "Deployable solar wings" part (design 7.2.1).
- **Game simplifications:** hand-timed hinge releases (real deployments are commanded by the
  spacecraft), the release order (root hinges first, alternating left and right wing), the
  seeded body turn, one-plane pointing about the wing's long axis, windows, tolerance and
  thresholds.

## Teams and `env.coop` (interface)

Each phone decides its own result from the seed and its own params. Host convention: per-player
`slot` (= `assignments[].index`), common `slots`. With `slots` > 6, players share hinges
(`slot mod 6`). Teammates are decoration:

- **Sent:** one `mg.action` `{ a: "hinge", x: [hingeIndex, playTimeMs] }` when this hinge releases.
- **Read:** `mg.state.shared` keys `hinge_<k>` (number ≥ 0 = released) from a host that keeps
  them, and, for hosts that only echo the last move (the mock room), `last_a == "hinge"` with
  `last_x[0]` = hinge index. A teammate's hinge then shows as released at that moment.
- **Without `env.coop`** (solo, spectators, demo) teammates are simulated from the seed: each
  "crew" hinge releases inside its window.

## Haptics, accessibility

Window opens: 20-40-20 ms; released in order: 30 ms; out of order: 60-50-60 ms; facing the Sun
gained / lost: 12 / 25 ms; press: 10 ms (all ≤ 300 ms). Canvas `role="application"` with a
mode-specific label and an `aria-description` of the current status; a polite live region
reads the status and, in phase 2, "Facing the Sun, N % so far" or "Turn the wing, N degrees off
the Sun". Reduced motion: panels snap open, no pulse or nudge ring.
