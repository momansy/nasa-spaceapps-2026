# MG-12 Engine-Out Rebalance

Flight phases F5 / F7 when an engine of a cluster fails, cooperative split, 20 s (design 10.5).
Each player sets the throttle and gimbal of one remaining engine so that the net torque about
the centre of mass stays near zero. Fact F08.

Files: `model.ts` (pure rules, `model.test.ts`), `render.ts` (canvas), `index.ts` (glue). The
shared plumbing is in `../MG-09/shared/` (see the MG-09 README).

## Physics

- **Physical:** τ_net = Σ rᵢ × Fᵢ about the centre of mass. Engine i sits at (xᵢ, −L) and pushes
  `Tᵢ·Fmax` tilted by its gimbal δᵢ, so **τᵢ = Tᵢ·Fmax·(xᵢ·cos δᵢ + L·sin δᵢ)**. A failed engine
  pushes nothing; the cluster's thrust line moves off the centre of mass.
- **Real-world approximate:** Fmax ≈ 800 kN per engine, 1.6 m spacing, gimbal ±6°.
- **Game values:** L = 25 m, throttle 60–100 %, actuator lag 0.25 s, disturbance torques (wind,
  slosh) as three seeded sines of about 350 kN·m in total, zone ±150 kN·m, 70 % / 90 %.
- **Simplifications:** one plane (pitch), engines in a row, the drawn lean is decoration (the
  score uses the torque only), bells are drawn with 2.5× their gimbal angle so it can be seen.

## Teams

- The layout comes from params; this player's engine is `survivors[slot mod n]`, taking engines
  off the centre line first (a centre engine's throttle has no lever arm).
- **Teammates hold the correct settings** on this phone: every survivor at 100 % and the same
  team-share gimbal `δ* = atan(−Σxᵢ / (n·L))`, which zeroes the cluster torque. This player
  must find their own share and also cancel the disturbances. Each phone decides its own success.
- With `env.coop` the phone sends `mg.action { a: "eng", x: [throttle %, gimbal × 10] }` at most
  4 times a second when it changes; teammate i's throttle is drawn from `shared["eng_<i>"]` when
  present (decoration only). Without it, teammates are drawn holding their settings.

## Controls

| Mode | Input |
|---|---|
| Standard / Relaxed | Control pad: drag anywhere on it; across = gimbal −6…+6°, up = throttle 60…100 % (absolute). Arrow keys: ← / → gimbal ∓0.25°, ↑ / ↓ throttle ±2 %. |
| One button | The flight computer sets the gimbal for balance at 80 % throttle; the throttle sweeps 60↔100 % (3.2 s per sweep). Press the screen, Space or Enter to lock it when the needle is centred, again to unlock. |

## Parameters

| Key | Unit | Default | Type | Scope | Meaning |
|---|---|---|---|---|---|
| `engines` | count or m | 5 | int or number[] | common | Engines in a row (spaced 1.6 m), or their positions |
| `failed` | index | seeded outer engine | int | common | The engine that is out |
| `torque_zone_knm` | kN·m | 150 | number | common | Half-width of the zero-torque zone (game value) |
| `in_zone_fraction_min` | fraction | 0.7 | number | common | Success threshold (game value) |
| `perfect_in_zone_min` | fraction | 0.9 | number | common | Perfect threshold (game value) |
| `slot` | — | 0 | int | per player | Picks this player's engine |
| `slots` | — | 1 | int | common | Active players |

## Result

- `success`: |τ_net| ≤ zone for ≥ `in_zone_fraction_min` of the 1/120 s steps (exactly 70 % counts).
- `perfect`: ≥ 90 % (implies success). `score`: the in-zone fraction. No `value`.

## Modes and difficulty (game values)

| | Zone | Disturbance size | Disturbance speed |
|---|---|---|---|
| Relaxed | × 1.5 | × 1 | × 0.6 ("thrust changes more slowly") |
| One button | × 1.3 | × 0.3 | × 0.8 |
| Cadet | × 1.25 | × 0.8 | |
| Flight Director | × 0.8 | × 1.2 | |

## Haptics, motion, accessibility

- `[30, 30, 30]` when the torque leaves the zone, 20 ms every 0.5 s while out, 10 ms back in.
- Reduced motion: the vehicle does not lean; plumes do not flicker.
- Canvas `role=application`; value text: net torque (kN·m), the direction it turns the nose,
  throttle and gimbal. Torque left / right is a physical direction and is not mirrored in RTL.

## Decisions

- The design says only "near zero": zone ±150 kN·m (about 0.4° of one engine's gimbal), 70 % /
  90 % in zone.
- One-button gimbal preset so that the balance sits mid-sweep; the throttle then has authority
  both ways.
