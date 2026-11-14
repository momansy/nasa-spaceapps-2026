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

## Mission

`Mission/FlightVehicleSpec.FromBuild` is the build-to-flight boundary. It consumes only
public Build/Data APIs and never reads files. The host supplies catalog data. Numeric
catalog values keep their existing physical / real_world_approximate / game_value
classification. Masses use kg, areas m², speeds m/s and angles rad internally.

The immutable spec represents Dashboard burn intervals, including the parallel
strap-on/core interval, and exposes separate dry, propellant and jettison masses.
`FinalMassKg` includes the entire surviving stack before jettison, not just dry stage
hardware. The jettison interval includes fairing and escape-tower masses according to
the Dashboard; flight must not drop them twice. `IdealDeltaVMs` uses Dashboard's
altitude-averaged Isp; `DashboardDeltaVMs` additionally includes its build bonuses,
rotation, recovery and inclination budget. Neither is a promise of flown Δv.

Mission simplifications / game_value defaults introduced in step 1:

- Missing fairing/capsule diameter uses 3.7 m (circular aerodynamic reference area).
- A simultaneous strap-on/core interval has one equivalent engine with Dashboard's
  mass-flow-weighted effective Isp at both sea level and vacuum. It conserves the
  Dashboard ideal Δv budget; independent booster throttle is not represented here.
- Missing upper-engine restart data means 0 restarts (initial ignition is separate).
- Unfueled builds are rejected; the host should run Build validation before flight.
- Upper engines without sea-level thrust data use 0 N at sea level, interpolating to
  catalog vacuum thrust with altitude. Missing sea-level Isp uses vacuum Isp. These
  are game_value fallbacks for engines intended to ignite above the atmosphere.
- In a combined booster interval, EngineCount counts core units only; strap-on unit
  failures must use the original Vehicle booster count and thrust contribution.

Step 2 mission driver decisions (all thresholds below are game_value):

- Host defaults: rollout 2 s, countdown 8 s, orbital operations 30 s, target altitude
  300,000 m. F2 holds the vehicle until thrust exceeds local weight.
- Max-Q interval starts at 20,000 Pa and ends below 85% of the observed peak.
  Propellant exhaustion uses a 0.000001 kg tolerance. Impact uses altitude below -1 m.
- Fairing and tower remain on the upper stack until an explicit deploy at ≥70,000 m;
  the stage-drop mass excludes them. Insertion gate requires periapsis >150,000 m
  and engine cutoff. Non-returning flight ends after the host's F8 duration and deploy.
- The planar atmosphere rotates at the launch-direction projection of site surface
  rotation. Direct azimuth uses LaunchGeometry; retrograde inclinations reflect the
  prograde solution. Below-latitude targets use the closest reachable plane; actual
  inclination is reported rather than claiming a free plane change.
- Snapshot flight.hud fields use the protocol units. Console load uses a provisional
  120,000 Pa × g structural reference. Channels not yet simulated (entry, failures)
  report their quiescent values until subsequent task steps implement those systems.
- Only catalog fact-bank IDs produce fact_moment events; unsourced localization
  fact-moment text is not promoted to a verified fact. Phase minigame events are cues
  for host scheduling, not automatic starts; engine-out, pogo, fairing-catch,
  blackout-end and investigation cues require separate triggers.
- Flight outcome covers the measured flight objective only. Host/scoring must combine
  these metrics with power, docking, science and other host-owned contract objectives.
