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

## Mission

Namespace `MissionForge.Core.Flight.Mission` (`core/Runtime/Flight/Mission/`), built on the kernel above without
changing it. `MissionSim.Create(FlightVehicleSpec, MissionSetup)` then `Step(PilotInput)` advances exactly one fixed
step (1/120 s of game time, or the warp interval below). Determinism: the same build, seed and input sequence gives a
bit-identical sequence of events and `HudSnapshot`s (tested with a hash over a whole C4 mission). Random draws are
`BuildRandom.Uniform(seed, "failure", "<checkpoint>:<slot>", unit)`, so pilot input never changes them.

Inputs the host bridges from scoring live in `FlightModifiers` (shield queue, Δv bonus, heat and load margins,
precision, fuel saver, Save the Mission). Δv bonus and fuel saver act as an Isp multiplier
`(1 + bonus) / (1 - saver)` (**game_value**). Phase order: F0, F1, F2, F3-F7, F7b (parallel booster track), F8, then
F9-F13 for returning contracts, F14. `FlightPhaseCatalog` supplies minigame cues and fact moments.

### Mission simplifications (disclosed, design 8.3)

- **2D plane.** Inclination comes from site latitude and `LaunchGeometry.LaunchAzimuthRad`; no ascent steering for plane
  change, winds or cross-range. Range safety is a flight-path-angle gate, not a corridor map.
- **Control.** Pitch, throttle and attitude are held over each step. The thrust direction of descent burns (landing,
  boostback, entry burn, deorbit) is always retrograde to the air-relative or inertial velocity; there is no lift.
- **Assist levels** are markers from `data/assist_levels.json` (`autopilot_gravity_turn`, `auto_circularize_with_prompt`,
  `auto_attitude`, `guidance_cue_on_hud`). `MissionSetup.FullAutopilot` is a test/demo controller, not a player level.
- **Time warp (9.7).** Warp is 1 when powered, below 70 km, in a non-coast phase or while a booster is aloft; 0.1 bullet
  time while `MinigameActive` (the integrator is held, not slowed); up to 1,000 in an unpowered bound coast with
  periapsis above 70 km, using `OrbitalMechanics.PropagateElliptic` (two-body, no drag above 70 km). Warp never
  overshoots the F8 deploy gate.
- **C5, C6, C7.** The transfer burn is one impulse (no finite-burn or gravity loss) sized by vis-viva: C5 to a
  35,786 km apogee (real orbit, warpable coast to apoapsis), C6 to the mean lunar distance 384,400 km, C7 to a Hohmann
  Earth-Mars v-infinity of 2.94 km/s (all **physical approximate**). C6 and C7 then use a scripted cinematic coast
  (6 days and 210 days, **game_value**) and enter at a fixed interface state: C6 at the contract entry speed, -6.5 deg;
  C7 at Mars (`Body.Mars`), 5,500 m/s, -15.5 deg. A Δv shortfall fails C6 and C7; C5 simply reaches a lower apogee.
- **Entry.** Ballistic, blunt body Cd 1.2 (the kernel table is rocket-like, so area is rescaled by Cd/Cd_table).
  Sutton-Graves with the Earth coefficient on both bodies, nose radius = body radius. Shield capacity is the heat load of
  a reference ballistic entry at the shield's rated speed times 1.15, so an under-rated shield burns through.
  Heat load is shown as a percent of that capacity. Shield held away from the flow multiplies heating by 3.
- **Chutes.** Drogue and main drag areas are sized for 75 m/s and 7 m/s sea-level sink speeds and inflate over 3 s and
  10 s (smoothstep). No parachute on Mars lander terminal descent except the main; propulsive recoveries use a
  constant-thrust engine (3 g of local gravity, Isp 250 s, no minimum throttle) on a reserve of 5-15% of entry mass.
- **Landing error** is a dispersion: 3 km plus 4 km per degree off the nominal corridor (C0: 10 km), reduced by
  `PrecisionFraction`.
- **Aborts (9.8).** Pad and ascent aborts are scripted safe splashdowns (crew safe, mission failed), not simulated
  descents. Abort to orbit circularises impulsively at apoapsis. Return to launch site ends the flight as a failure.
  Early return runs the normal deorbit and entry and finishes as a partial success.
- **Booster return (F7b).** The booster flies on the Δv the Dashboard reserved for recovery. Boostback burns a fixed
  25% of that reserve and does not retarget the landing site; the landing zone is the touchdown point of the nominal
  autopilot profile (a pad or drone ship is assumed to be placed there), so only a hand-flown booster can miss it.
  A keyed dispersion of up to 3 km (less precision) is added. Booster loss never ends the mission.
- **Failure model.** A part exposed at n checkpoints survives each with probability `R_true^(1/n)` (**Decision**); an
  engine cluster rolls per engine and survives one loss when `EngineOutCapable`; a redundant set survives while one
  unit lives. Reroll shields redraw with a distinct keyed index; Negate shields and Save the Mission cancel one fatal
  failure; only Negate-type cancellation applies to deterministic condition failures. Crewed vehicles fire the escape
  system by themselves on breakup inside its envelope. Parts with no listed exposure roll once at deployment.

### Mission game_value thresholds

| Value | Choice |
|---|---|
| Max Q entered / left | q >= 20 kPa / q < 85% of the peak |
| Fairing jettison allowed | altitude >= 70 km |
| F7 to F8 | periapsis > 150 km with the engine off; partial below 150 km down to 80 km at propellant exhaustion |
| Structural limit | q x max(1, g) above 120 kPa x max(0.75, material dry-mass multiplier) x (1 + load margin) |
| Pogo | first-stage propellant >= 250 t and no `risk_cleared:pogo`: 25% chance at staging |
| Untested parachute (no `drop_test`) | 15% chance the chutes never open |
| Guidance drift | `nav_imu_only`: +1.5 deg inclination, partial success |
| Range safety | altitude >= 1 km and flight-path angle below -5 deg during ascent |
| Recontact | upper-stage thrust halved |
| Burn-through | entry speed above rating x (1 + heat margin), or heat load above capacity x (1 + heat margin) |
| Entry interface | 120 km (Earth), 125 km (Mars); no-shield limit 3 km/s; Mars aeroshell rating 6 km/s |
| Blackout | heat flux >= 200 kW/m2 (on and off events) |
| Chute windows | drogue <= 12 km and <= 350 m/s; main <= 3.5 km and <= 150 m/s (burst above); Mars <= 15 km and <= 700 m/s |
| Landing limits | splashdown 12 m/s; soft rockets and propulsive 4 m/s; Mars airbag 25, legged 3, sky crane 1.5 m/s; booster 2 m/s |
| Crew g limit | 15 g |
| Deorbit | cut off at periapsis <= 30 km; deorbit complete at <= 60 km (<= 70 km when out of propellant) |
| Autopilot | 4 g acceleration cap, Max Q bucket at 80% of the limit, C0 target apogee 150 km, main chute below 100 m/s |
| Abort envelopes | ejection seats <= 5 km; tower while MET <= 150 s; pusher the whole ascent; ATO needs apoapsis >= 150 km |
| Booster | entry burn <= 60 km above 1.5 km/s (20% of reserve), landing burn <= 30 km below 500 m/s, zone radius 5 km |
