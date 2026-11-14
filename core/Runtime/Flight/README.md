# Flight kernel

Pure C# 9 / netstandard2.1, namespace `MissionForge.Core.Flight`. Positions are
planet-centered inertial coordinates in a 2D plane; all inputs and outputs use SI.
Physical constants come from `PhysicalConstants` (design 8.1). No I/O, clock or RNG.

## Bodies and atmosphere

`Body.Earth` and `Body.Mars` reference the existing physical μ, radius, surface
density and scale height. Gravity is μ/r² and density is ρ₀ exp(-h/H).
The isothermal simplification uses the same exponential for pressure ratio.
There is no implicit atmosphere cutoff. A zero-density custom body has zero
pressure ratio. Negative altitude is clamped to surface conditions, not used
to model the interior. Impact detection belongs to the flight-phase caller.

Chosen numbers (all **game_value**, not new physical constants):

| Choice | Value | Purpose |
|---|---|---|
| Earth sound speed | 340 m/s | Constant sound speed for Mach; no temperature layers |
| Mars sound speed | 240 m/s | Same approximation |
| Mars equatorial rotation | 240 m/s | Rounded rotation model; ω = v/R |
| Below-ground atmosphere boundary | 0 m | Clamp altitude before evaluating exponential |

Earth rotation uses the existing physical approximation 465 m/s. Custom bodies
can supply other sound/rotation values. Validation rejects nonfinite values and
nonpositive radius, μ, scale height and sound speed.
