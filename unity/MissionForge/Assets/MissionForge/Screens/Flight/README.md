# Flight (T016): countdown, flight view, orbit map

The big-screen flight from the pad to orbit. **Core owns the simulation** (`MissionForge.Core.Flight.Mission.MissionSim`,
T013: fixed 1/120 s RK4 steps, Kepler coasts, phases F0–F14, staging, failures, time warp). Unity only copies Core's
numbers into a snapshot, interpolates between two snapshots for display and converts units at the HUD. Visual effects
never feed back into the simulation.

## Feed interface (`Runtime/Feed/`)

| Type | Role |
|---|---|
| `FlightTelemetry` | One Core step in SI: MET s, altitude m, surface / orbital / vertical speed m/s, q Pa, Mach, g, throttle 0–1, Δv per stage m/s, propellant per stage 0–1, apoapsis / periapsis m (NaN when undefined), inclination rad, heat load 0–1, ambient pressure ratio p/p0, display pitch rad, Core 2-D inertial position / velocity, ground-relative downrange angle rad, phase id, stage index, fairing state, warp, events. |
| `IFlightFeed` / `IFlightControlSink` | `Current`, `Previous`, `Step()`, `BulletTime` (×0.1 during a minigame); pilot commands (`FlightControlCommand`). |
| `CoreFlightFeed` | **Shipped feed.** Adapts `MissionSim` (Core flight session API from T013 is on main, so no `KernelFlightFeed` stub was written). Rehearsal uses Core's full autopilot (`MissionSetup.FullAutopilot`, a Core game_value controller). |
| `RecordedFlightFeed` + `FlightRecording` | JSON replay. `Recordings/c1_ascent.json` = rehearsal C1 flight (2 Hz + every event step; T−10 s → 290 × 309 km orbit → mission end, Core outcome Success). Play it with `-mfFlightRecording <path>`. Re-record: **MissionForge ▸ Flight ▸ Record C1 Ascent**. |

Event mapping (Core → view): `phase_entered` F2 = ignition, F3 = lift-off, F4 = Max Q, first F8 = orbit; `staging` =
MECO + stage separation; `jettison fairing`; `minigame_cue`; `fact_moment`; `failure`; `abort`; `mission_end`; throttle
dropping to 0 in F7/F8 = SECO (view-side label only).

## Session and host flow (`Runtime/Session/`)

- `FlightSession` (static) holds the one flight of the mission across MF_Countdown → MF_Flight ⇄ MF_OrbitMap and steps
  it at 120 Core steps per real second × playback rate.
- `FlightFlowDirector` (installed at start-up, no App/ change): captures the voted build from the Build Bay while its
  scene is still loaded; in rehearsal (no room) the FRR placeholder (T027 not on main) advances to COUNTDOWN after 4 s;
  a `phase.set` received for COUNTDOWN / FLIGHT walks SceneFlow there through the allowed transitions; leaving
  COUNTDOWN/FLIGHT ends the session. The countdown screen moves to FLIGHT at ignition (Core F2); the host's own
  `phase.set` is sent by `AppRoot` on every phase change, as before.
- Build that flies: the Build Bay's voted build when Core accepts it (`FlightVehicleSpec.FromBuild`), else the rehearsal
  C1 build (Appendix A choices, seed 2026 — the same build Core's autopilot test flies to orbit).

## Screens

- **MF_Countdown** (`CountdownScreen`): MF_LaunchPad at dusk (the Build Bay environment copied into
  `Prefabs/MF_FlightWorld.prefab` by `FlightSceneBuilder`), the voted vehicle, LOX vapour venting during F1, the
  countdown clock from Core's F1 timer, the sequence (rollout complete, loading, ignition, hold-down release).
- **MF_Flight** (`FlightScreen`): HUD of design 9.6 (`FlightHudView`), event callouts (visual cues for audible events),
  minigame banner, cameras, `flight.hud` at ≤ 5 Hz (`FlightHudMessage`, protocol units) when a room is open.
  Keys: **V** surface / orbital velocity (automatic switch at 70 km otherwise), **M** orbit map, **C** camera cycle.
- **MF_OrbitMap** (`OrbitMapScreen`, `OrbitMapView`, `OrbitMapMath`): Earth, the current conic from Core's orbital
  elements, apsis labels in km, the trail flown and the ground-track arc; **M** / **Esc** back.

## View (`Runtime/View/`)

- `FlightWorld`: vehicle-centred floating origin. The vehicle anchor stays at the pad mount; the pad environment moves by
  the vehicle's displacement (altitude, ground-relative downrange) and switches off above 9 km (game_value; its fog has
  hidden it by then). A key light (`FlightSun`) replaces the dusk rig above that.
- `FlightSpace`: Earth and atmosphere in **scaled space** (1/1000 of distance and radius, true angular size). Shaders are
  T016 copies of `App/Space` (`Art/VFX/Shaders/MF_FlightEarth.shader` writes far-plane depth so the vehicle always draws
  over it; `MF_FlightAtmosphere.shader` takes per-flight centre/radius globals).
- `FlightVehicleView`: `VehicleAssembler` rig; plumes at every `NozzleExit`; stage and fairing debris are display-only
  and drift with the vehicle's felt g-load; condensation collar at Mach 0.9–1.1 below 18 km; LOX venting; pad exhaust.
- `EnginePlume` (`FlightVfx.cs`): Particle System (WebGL safe). Length 6 → 18 bell diameters and cone 3° → 32° as
  p/p0 goes 1 → 0; Mach diamonds while p/p0 > 0.25. Reduced motion halves emission and drops the pad cloud.
- `FlightCameraDirector`: pad cam, tracking telescope (2.4 km off the pad, ≤ 13.7° vertical FOV ≈ 100 mm lens), chase,
  onboard; cuts on lift-off (+9 s), Max Q, staging, orbit.

## Minigames (`Runtime/Minigames/`)

`FlightMinigameHost` starts a run on a Core `minigame_cue` after lift-off (one run at a time): `mg.start` (≥ 3.5 s lead,
duration from `data/minigames.json`), collects `mg.ready` / `mg.progress` / `mg.result` from `relay`, closes at
`startAtMs + durationMs + 2000 ms` or when every ready player reported, computes the tier with Core `Tiers`, sends
`mg.summary` (Team Sync 25/15/8, points 250/200/120/60; boosts empty — applying boosts to the flight is not in this
task). `RehearsalMinigameChannel` stands in for four phones when no room is open. The simulation runs at ×0.1 while a run
is active; the HUD shows a "Bullet-time ×0.1" chip and the banner tints the frame.

## Game values (presentation, not physics)

Playback fast-forward ×12 after the first 20 s of F7 and ×3 in F8 (Core's C1 upper-stage burn is powered for about
20 minutes, so Core holds time warp at 1×; only the playback speed changes, every 1/120 s step is still integrated;
`-mfNoFastForward` disables it). Core durations set here: rollout 0 s, countdown 10 s, orbital operations 90 s.
Every VFX size, rate, colour, camera offset and the 9 km environment switch are art choices.

## Flags

`-mfRehearsal`, `-mfFlightRate <x>` (playback speed), `-mfNoFastForward`, `-mfFlightRecording <path>`,
`-mfFlightHold` (stay in flight after mission end), `-mfFlightShots <dir>` (evidence pass, desktop rehearsal builds),
`-mfDev` (development build from the batch build methods). WebGL takes the same names as `?name=value`.

## Builds and tools

**MissionForge ▸ Flight ▸ Build Flight Scenes** (`FlightSceneBuilder.BuildAll`, idempotent) · **Build macOS Evidence
Player** / **Build WebGL** (`FlightBuilds`, into the git-ignored `unity/MissionForge/Builds/`) · `FlightRenderCheck.Run`
(batch render of the pad shot without play mode). Evidence: `orchestration/evidence/T016/`.

## Strings

`ui.flight.*` labels are in `Resources/FlightStrings/en.json` because `data/` is read-only for this task;
`FlightText` looks in `data/strings` first. Moving them into `data/strings/en*.json` is a follow-up.
