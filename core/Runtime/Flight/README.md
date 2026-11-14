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

## Forces and engine interpolation

Dynamic pressure and drag use the design equations directly. The drag coefficient is a
linearly interpolated **game_value** table, endpoint-clamped: Mach/Cd = 0/0.20,
0.8/0.25, 1.0/0.50, 1.2/0.40, 2.0/0.30, 5.0/0.22. The broad Mach-one peak makes the
transonic Max-Q decision visible without claiming a vehicle-specific CFD result.

Engine thrust and Isp interpolate linearly from their sea-level values to vacuum using
the body's exponential pressure ratio. Pressure ratios outside 0–1 are clamped, and
mass flow follows thrust / (Isp × g0).

## State and fixed-step integration

`FlightState` is planet-centered inertial position, velocity and mass in a 2D orbital
plane. `Rk4Integrator` always advances exactly 1/120 s using classical RK4. Controls are
held constant during a step. Gravity is inverse-square; atmosphere co-rotates as a rigid
body at the body's rotation rate, and drag opposes velocity relative to that atmosphere.
The rigid co-rotation and fixed control over one step are **game_value** simplifications.

## Orbital mechanics and coast switching

`OrbitalMechanics` derives planar two-body elements with vis-viva and the eccentricity
vector. Bound vacuum coasts solve Kepler's equation with 15 deterministic Newton steps.
The model is spherical two-body motion only: no J2, third bodies or perturbations, as
disclosed in design 8.3. The RK4/Kepler switch acceptance tolerance is 0.1 m position and
1e-10 relative specific-energy drift over one circular 400 km Earth orbit.

## Entry quantities

Sutton–Graves heating uses the design's empirical Earth coefficient 1.74e-4 in SI.
Heat load is trapezoid-integrated in J/m², g-load excludes gravity, and flight-path angle
is measured from local horizontal with outward radial velocity positive. A reference
7.8 km/s ballistic sample produces about 1.85 MW/m², used only as a sanity range rather
than a TPS certification model.

## Launch geometry

Eastward launch boost is equatorial rotation speed × cos(latitude). Direct prograde
azimuth follows cos(inclination) = cos(latitude) × sin(azimuth). The disclosed
**game_value** inclination penalty is the eastward rotation benefit lost relative to a
due-east launch. A target below the site's absolute latitude cannot be reached directly;
for that exceptional dogleg the model adds the ideal plane-change term
2 × parking speed × sin(delta-inclination / 2). This intentionally omits ascent steering,
range safety, winds, oblateness and finite-burn losses.
