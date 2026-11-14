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

### Mission steps 3–8: disclosed simplifications and thresholds

Assist and guidance values are **game_value** controls, not launch-vehicle guidance
certification. The gravity-turn controller targets vertical speed from altitude with an
80 s altitude-error scale, a 20 s velocity-error scale, and clamps desired vertical
speed to -50…500 m/s. Full-autopilot Max-Q throttle is 80%. Circularisation targets
10,000 m below the requested orbit, limits target radial speed to ±200 m/s and
tangential acceleration to ±20 m/s², with 12 s and 20 s feedback scales. These values
exist to make a complete C1 mission stable and fast in the deterministic game loop.

Reliability checkpoints use `R_true^(1/n)` and keyed draws. Engine units roll
separately. A second keyed draw uses unit index +10,000 for a reroll shield; a negate
shield simply accepts the checkpoint. Shields are consumed in queue order. The
condition limits are **game_value**: structural q×max(1,g) 85,000 Pa, entry heat
capacity 600,000,000 J/m², and range-corridor half-width 100,000 m, each with the
applicable host modifier. Heat-shield speed remains the build catalog rating. Ignition,
liftoff and Max-Q fatal failures automatically select an available pad/ascent escape
abort when an escape system is fitted. Guidance drift, pogo, parachute-test and range
conditions remain host/build flags around these deterministic flight checkpoints; this
package does not invent probabilities for conditions that the design does not supply.

Time warp is **game_value**: maximum 1,000×, forced to 1× while powered or below
70,000 m, and forced to 0.1× during a minigame. Bound vacuum coasts use deterministic
Kepler propagation. Bullet time linearly interpolates one 1/120 s RK4 result. C5–C7
transfer legs first check the Dashboard Δv budget (including the host Δv modifier), then
use the host-set F8 duration as a cinematic coast: C5 records 35,786 km GTO apogee, C6
records the lunar flyby, and C7 evaluates a representative 5,500 m/s Mars entry with
the kernel's Mars atmosphere before its scripted landing. Interplanetary targeting,
multi-body gravity and finite transfer burns are intentionally outside this package.

Entry is a fixed -6° ballistic path from 120,000 m with 0.05 s samples, a **game_value**
350 kg/m² ballistic coefficient and host/catalog entry speed; the mission uses a 1.5 m
nose radius. Blackout events use a **game_value** 500,000 W/m² peak-heat threshold.
The phase-driver cinematic durations are 10 s deorbit, 40 s entry, 10 s drogue, 20 s
main-chute descent and 5 s recovery. Nominal capsule landing error is 1.5 km. Drogue
and main deployment are phase gates rather than fabric/canopy dynamics. The standalone
entry profile stops at ground, 100 m/s, or 2,000 s. C0 full autopilot cuts off when the
constant-gravity ballistic apogee estimate reaches 105,000 m, requires a measured apogee
of at least 100,000 m, then uses the same ballistic-entry and parachute phase machinery.

Abort requirements are **game_value** gates: lower-orbit abort needs altitude ≥70,000 m
and remaining propellant; turn-back needs more than 10% of the current stage's
propellant; early return needs any deorbit propellant; RTLS requires non-expendable
recovery. Abort phases and escape-system requirements come from `abort_modes.json`.

Booster recovery is a second 1/120 s point-mass state. The mission reserves the greater
of 2,000 kg or 25% of the separated interval's final mass. Initial horizontal errors are
50,000 m for RTLS and 5,000 m for a drone ship. **Game_value** horizontal correction is
600 m/s in boostback and 100 m/s after the error falls below 1,000 m. Tail-first drag
uses a representative 500 kg/m² ballistic coefficient. The suicide-burn target is 55%
of the ideal stopping curve with a 2 m height margin and 0.5 s feedback scale. Landing
succeeds only at ≤2 m/s and ≤100 m error. Splashdown uses zero horizontal target error;
waves, winds, lift, rotation and landing-leg dynamics are omitted.
