# T013 — Core flight simulation, part 2: the mission (package B2)

**Worker:** `momansy` (Codex) · **Owns:** `core/Runtime/Flight/Mission/`, `core/dotnet~/Tests/Flight/Mission/`, `orchestration/evidence/T013/`, and `core/Runtime/Flight/README.md` (append only)

Needs the .NET 8 SDK. This task uses no MCP server. It is bounded: work in the order below, and
finish and test each step before starting the next. If the run ends early, stop at a step boundary;
the orchestrator queues the rest.

## Goal

Turn a finished build into a deterministic, flyable mission on top of the kernel you wrote in T007
(`core/Runtime/Flight/*.cs`, see its `README.md`). Namespace: `MissionForge.Core.Flight.Mission`. Keep
the T007 conventions: SI units with suffixes, `netstandard2.1`, C# 9 without records, no
`System.Random` / I/O / clock.

**Do not edit** the kernel files in `core/Runtime/Flight/`, except to fix a proven bug. Call any such
fix out under **Interface changes**, with a failing test. Do not edit `Build`, `Data`, `Scoring` or
`Session`. T010, T011 and T012 run in parallel; use only the public API of `Build` and `Data`:
`Vehicle`, `Dashboard.Compute`, `DashboardMetrics.Phases` (`StagePhase`), `ReliabilityModel.True`,
`ReliabilityModel.EngineOutCapable`, `BuildRandom.Uniform`, `PartDef.Stats`, `Slots`. Define every
input you need from scoring (boosts, shields) in your own types. The host bridges them.

## Interface (suggested names; report changes)

- `FlightVehicleSpec.FromBuild(BuildState, GameCatalog)`: stages with one `EngineModel` per stage
  (thrust × engine count), propellant, dry and jettison masses (fairing, boosters, escape tower),
  reference area, heat-shield rating, recovery kind, upper-stage restarts.
- `FlightModifiers`: the shield queue (reroll or negate), and the Δv bonus, heat margin, load margin,
  precision and fuel saver fractions, plus Save the Mission.
- `MissionSim.Create(spec, MissionSetup setup)`. `MissionSetup` holds the seed (the build seed), the
  contract, the assist-level ID and the modifiers.
- `IReadOnlyList<FlightEvent> MissionSim.Step(PilotInput input)` advances exactly one fixed step
  (1/120 s × warp). `PilotInput` holds throttle, pitch command, attitude mode and actions (stage,
  cutoff, deploy, abort, RCS), per craft (`main`, `booster`), plus the minigame-active flag.
- `FlightEvent`: tick, MET s, phase, kind and ID. Kinds: `phase_entered`, `minigame_cue`,
  `fact_moment`, `staging`, `jettison`, `failure`, `shield_consumed`, `abort_available`, `abort`,
  `blackout`, `mission_end`.
- `HudSnapshot` (9.6): the fields of `flight.hud` in `protocol/messages.md`, plus Δv remaining per
  stage, inclination, and the flight channels of protocol section 9.2 (BOOSTER, STRUCT, GUIDO, FIDO,
  RETRO). The snapshot is the UI boundary, so km and kPa are allowed there, with suffixes.
- `FlightResult`: outcome Success/Partial/Failure (8.5), failure info (mode, phase, slot), and
  `Metrics`, a dictionary keyed by the `contracts.json` metric names flight can measure.
  - Orbit and trajectory: `apogee_km`, `orbit_altitude_km`, `inclination_deg`.
  - Payload: `payload_recovered`, `payload_deployed`.
  - Capsule: `capsule_recovered`, `capsule_landing_error_km`.
  - Booster: `booster_landed`, `booster_recovered`, `booster_touchdown_speed_m_s`,
    `booster_landing_error_km`.
  - Destinations: `lander_landed_safely`, `lunar_flyby_completed`.
  - Crew: `crew_safe`.

## Steps, in order

1. **Vehicle spec.** Test that lift-off mass, stage masses and ideal Δv match `Dashboard.Compute` for
   the C1 build of Appendix A (copy the choices of `Tests/Build/C1WalkthroughTests.cs`) within 0.5%.
2. **Phase driver, HUD, events.** A `FlightPhaseCatalog` loaded from `data/flight_phases.json`
   supplies minigame cues and fact moments.
   - F0, F1 and the countdown are timed. In F2 the vehicle is held down until thrust exceeds weight.
   - F3 through F7: Max Q is entered and left around the q peak; staging, fairing jettison, insertion.
   - Then F8 (its duration is set by the host), and F14.
   - Contracts that do not return end after deployment.

   In the 2D plane, inclination comes from site latitude and the launch azimuth of
   `LaunchGeometry.LaunchAzimuthRad` (disclose it as a simplification).
3. **Assist levels (9.3)**, from the `aids` of `data/assist_levels.json`:
   - a Cadet autopilot pitch program for the gravity turn;
   - auto-circularise with a prompt;
   - auto attitude on entry;
   - the Engineer guidance cue (target pitch in the HUD).

   Also add a full autopilot for tests. Test: the C1 build under the full autopilot, with no input,
   reaches an orbit with periapsis above 150 km and simulates in under 5 s.
4. **Failure model (8.4).** Checkpoints: ignition, lift-off, Max Q, staging, fairing, each burn,
   deployment, entry, chutes, landing.
   - A slot exposed at n checkpoints succeeds at each with probability `R_true^(1/n)`, where `R_true`
     is `ReliabilityModel.True(vehicle, slot)` (**Decision**).
   - Engines roll per unit, and engine-out follows `EngineOutCapable`.
   - Draws are keyed: `BuildRandom.Uniform(seed, "failure", "<checkpoint>:<slot>", unit)`, so pilot
     input never changes them.
   - Condition failures, each against a `game_value` threshold:
     - structural failure: q × load above the limit × (1 + load margin);
     - burn-through: entry speed or heat above the shield rating × (1 + heat margin);
     - guidance drift: `nav_imu_only`;
     - pogo: unless `risk_cleared:pogo`;
     - parachute failure: no drop test;
     - range-safety termination: the vehicle leaves the corridor.
   - Each mode applies the in-flight effect of table 8.4. Shields reroll or negate, and emit
     `shield_consumed`.

   Test across 2,000 seeds that the failure frequency matches `R_true` within 3σ, and that two runs are
   bit-identical.
5. **Time warp (9.7).** Warp is 1 when powered, below 70 km, or during a minigame (0.1 bullet time
   while a minigame is active). It goes up to 1,000 in unpowered coasts, using
   `OrbitalMechanics.PropagateElliptic`. C5 transfer, the C6 lunar flyby and the C7 Mars cruise are a
   Δv check plus a scripted cinematic coast (a disclosed simplification); C7 then enters at Mars with
   `Body.Mars`.
6. **Deorbit, entry, descent, landing.**
   - Deorbit burn timing. Heating, heat load and g-load from `EntryPhysics`; heat load as % of shield
     capacity.
   - Blackout on and off events above a heat-flux threshold.
   - Drogue and main deploy windows; landing or splashdown speed limits.
   - C0 is a ballistic suborbital path with apogee ≥ 100 km, then parachutes.

   Test that peak heating and g of a C4 entry fall in stated sane ranges.
7. **Aborts (9.8)**, from `data/abort_modes.json`. `AvailableAborts()` checks phase and requirements:
   escape system, Δv for a lower orbit, a recoverable vehicle, deorbit Δv. `Abort(id)` carries it out.
   The escape system fires automatically on vehicle breakup when one is fitted.
8. **Booster return F7b.** After separation, a recovered booster (`brec_propulsive_rtls`,
   `brec_propulsive_drone_ship`, or splashdown) is a second state on the same fixed step. It flies
   boostback, entry and landing burns on its reserved propellant, under the autopilot or the second
   pilot. Landing succeeds at ≤ 2 m/s within a `game_value` error. Test that C8 lands under the
   autopilot.

## Acceptance

- `dotnet test core/dotnet~` passes; the output goes in `orchestration/evidence/T013/dotnet-test.txt`.
- **Determinism:** the same build, seed and input sequence gives a bit-identical hash of every
  `HudSnapshot` and event.
- Extend `core/Runtime/Flight/README.md` with a "Mission" section listing every simplification and
  every `game_value` threshold you chose (the Codex discloses them, 8.3). Its existing text may only be
  appended to.
- The summary lists the steps done and not done, **Decisions** and **Interface changes**.

## Design references

Sections 8.3, 8.4, 8.5, 9.1–9.3, 9.6–9.8, 7.3, 7.18, 7.19; `protocol/messages.md` section 9.2 and
`flight.hud`; `data/flight_phases.json`, `assist_levels.json`, `abort_modes.json`.
