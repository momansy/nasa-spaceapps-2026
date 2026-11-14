# T016 — Unity launch, flight view and orbit map (package F3)

**Worker:** `yousuf-amek` (Unity MCP, Blender MCP) · **Starts after:** T015 (queue behind it;
best after T015 is merged to `main`)
**Owns:** `unity/MissionForge/Assets/MissionForge/Screens/Flight/` (create),
`unity/MissionForge/Assets/MissionForge/Scenes/MF_Countdown.unity`, `MF_Flight.unity`,
`MF_OrbitMap.unity` (+ `.meta`), `unity/MissionForge/Assets/MissionForge/Art/VFX/` (create),
`orchestration/evidence/T016/`. The **settings lock** (`ProjectSettings/`, `Packages/`,
`Assets/Settings/`) passes to this task only once T015 is merged; use it only when a step
cannot be done otherwise (for example enabling the URP opaque texture for heat shimmer) and
list every change.

Read first: `GAME_DESIGN.md` 8.2, 8.3, 9.1 to 9.8, 10.3, 14.1, 15, 16; `orchestration/ARCHITECTURE.md`;
`assets/media/style/STYLE_GUIDE.md` (lighting, plume and Earth direction, reduced motion);
`protocol/messages.md` sections 9 and 10 plus the schemas `flight.hud`, `flight.event`,
`phase.set`, `pilot.assign`, `pilot.input`, `pilot.action`, `pilot.hud`, `mg.start`,
`mg.progress`, `mg.summary`, `game.pause`; `core/Runtime/Flight/` (the T007 kernel);
`Assets/MissionForge/Vehicle/` and `Screens/BuildBay/README.md` from T015.

Read only (do not edit): `core/`, `data/`, `protocol/`, `Assets/MissionForge/{App,Data,Net,UI,Vehicle}`,
`Screens/BuildBay/`, `Art/Environment/LaunchPad/`, `Art/Models/`. Reuse T015's
`VehicleAssembler`/`VehicleRig` and `MF_LaunchPad.prefab`, and the Earth shaders in
`App/Space/` (wrap or copy into your folder to extend; do not edit them in place). The
existing `MF_MinigameOverlay` scene is not yours: your minigame banner lives in the flight
scene.

## Goal

The flight is the payoff of the build: a launch that looks and feels real on a big screen,
driven entirely by Core physics, with a HUD a room of players can read and controls that
work from keyboard, gamepad and touch.

## Rules

- **Core owns the simulation** (fixed step 1/120 s, RK4, Kepler coasts). Unity interpolates
  for display and never integrates its own physics. Visual effects never feed back into the
  simulation.
- **Flight feed interface.** Define in `Screens/Flight/Runtime/` an `IFlightFeed`
  delivering a `FlightTelemetry` snapshot each simulation step: MET s, altitude m, surface
  and orbital speed m/s, vertical speed m/s, dynamic pressure Pa, Mach, g-load, throttle
  0–1, Δv remaining per stage m/s, propellant fraction per stage, apoapsis / periapsis m,
  inclination rad, heat load fraction, ambient pressure ratio, pitch rad, 2-D position and
  velocity in the Core frame, current flight phase (`phase` values F0–F14 and F7b from `data/flight_phases.json`),
  stage index and discrete events (ignition, lift-off, Max Q, booster sep, MECO, staging,
  fairing jettison, SECO, orbit). Plus `IFlightControlSink` for pilot commands.
  Implementations:
  - `CoreFlightFeed` adapting the Core flight session API (phases, staging, telemetry) if
    T013 has put one on `main`;
  - otherwise `KernelFlightFeed`: drives `Core.Flight.FlightDynamics.Step` with an
    `EngineModel` per stage built from the Core `Vehicle`, a simple pitch program plus
    pilot input, and staging when a stage's propellant is spent. Phase detection here is
    a labelled stub (`game_value`); keep it behind the interface so T013 replaces it;
  - `RecordedFlightFeed` replaying a JSON recording (record one from the kernel feed into
    `Screens/Flight/Recordings/`) for deterministic screenshots and tests.
- **Precision:** altitudes reach hundreds of km. Use a vehicle-centred floating origin and
  draw Earth, atmosphere and the orbit in a separate scaled-space layer with its own camera;
  no jitter at 400 km.
- **WebGL first:** no VFX Graph or compute; built-in Particle System, Shader Graph / URP
  HLSL that compiles for WebGL 2. Unity units: metres, +Y up.
- Every HUD number has a unit (km, m/s, kPa, g, %, s, °); text from `data/strings/en*.json`.
  Reduced motion: no shake, no shimmer, fewer particles, no flashes. Subtitles/visual cues
  for every audible event (audio itself is F4, out of scope).

## Steps (in order; each leaves the project compiling and a scene usable)

1. **Feed and HUD.** Interfaces, `KernelFlightFeed`, `RecordedFlightFeed` and one recording.
   `MF_Flight` with `FlightScreen : ScreenController` and the HUD of 9.6: altitude,
   velocity (surface/orbital toggle), vertical speed, q (kPa), g-load, throttle %, Δv
   remaining per stage, propellant %, apoapsis / periapsis, inclination, heat load, T+ time,
   mission phase strip, active-boost icon row (empty slots allowed until boosts exist).
   Send `flight.hud` at ≤ 5 Hz from the same snapshot. EditMode tests: unit conversion,
   recording round-trip, feed determinism from a seed. Evidence: HUD screenshot.
2. **Earth and sky.** Earth with day/night terminator, clouds, thin atmospheric rim, city
   lights only on the night side; sky gradient that goes from dusk blue at the pad to black
   above about 80 km (`game_value`), sparse stars only when exposure allows. Floating
   origin and scaled space working from the pad to orbit.
3. **Vehicle and plumes.** Assemble the voted vehicle with `VehicleAssembler` (rehearsal
   uses a seeded C1 build). In `Art/VFX/`: plumes attached at every `nozzle_exit`, whose
   width and length follow the ambient pressure ratio from the feed
   (`Body.PressureRatioUnitless`); Mach diamonds at low altitude; condensation collar
   around Mach 0.9–1.1 (`game_value` range); booster separation; stage separation with
   interstage drop and small debris; fairing halves rotating off their hinges; engine
   shutdown tail-off. Effects start exactly at the bells.
4. **Cameras.** Cinemachine rigs and a camera cycle: pad cam, tracking telescope (long lens
   85–120 mm equivalent with heat shimmer near the ground), onboard engine-bell and payload
   cams, chase, booster cam (follows the separated booster), map view. Smooth cuts on
   events (lift-off, Max Q, staging) unless the operator overrides.
5. **Pilot controls (9.2).** Your own `.inputactions` asset in `Screens/Flight/Input/`:
   every row of the 9.2 table for keyboard, gamepad and touch (throttle slider, pitch
   wheel, two-finger rotate, big STAGE, CUTOFF, mode chips, warp chips, map tab, camera
   swipe, guarded abort switch). Holds: stage 0.3 s, abort 1.5 s. Phones in pilot seats
   arrive as `pilot.input` / `pilot.action` per `pilot.assign`; host devices and phones go
   through one input merger. Send `pilot.hud` at ≤ 10 Hz. Time-warp requests are passed to
   the feed, which enforces 9.7. Abort requests raise an event for the abort vote (the vote
   flow itself is not in this task).
6. **Countdown scene.** `MF_Countdown` on `MF_LaunchPad.prefab`: rollout-complete vehicle,
   propellant-loading venting (cold vapour around the LOX vents), countdown clock with holds,
   ignition sequence, hold-down release, lift-off, and a seamless hand-off into `MF_Flight`.
   If T015's prefab is not on `main`, do every other step first and report this one blocked.
7. **Orbit map.** `MF_OrbitMap`: Earth, the current orbit ellipse from apoapsis /
   periapsis / inclination, vehicle marker, apsis labels with units, ground-track arc; map
   toggle (M) from the flight view.
8. **Minigame banner and bullet-time.** On `mg.start`: a banner over the flight view with
   the minigame name, one-line instruction, countdown to `startAtMs`, team progress meter
   from `mg.progress`, then the tier result from `mg.summary`. While a run is active the
   displayed simulation runs at ×0.1 (protocol section 10), with a clear visual treatment.
9. **Polish and performance.** Release-quality look per the style guide, reduced motion,
   high contrast HUD, 200 % text, RTL HUD layout. WebGL build to a git-ignored folder (do
   not commit to `docs/play/`); measure median frame rate at 1920×1080 during lift-off and
   during orbit; state the machine.
10. **Review and evidence.** One subagent reviews against this acceptance list before you
    report.

Out of scope (follow-ups): split-screen booster return, ground-station and Mission Control
room cameras, reentry plasma and parachutes, audio, console telemetry for role phones.

## Acceptance

- `MF_Countdown`, `MF_Flight` and `MF_OrbitMap` open with zero console errors; EditMode
  tests pass (existing and new). A recorded C1 ascent plays from T−10 s to orbit with no
  jitter, no visible pop at floating-origin shifts, and HUD values equal to the feed values.
- Each control in 9.2 works from keyboard, from a gamepad and from touch (verify with the
  Input System debugger or device simulator and say which devices were real).
- Plume expansion with altitude, Mach diamonds, condensation collar, staging and fairing
  jettison are visible in the recording. Nothing in the shipped view is placeholder art or
  debug text. Which feed you shipped (`CoreFlightFeed` or `KernelFlightFeed` stub) is stated.
- WebGL build succeeds; measured frame rates reported (target 60 fps at 1080p; below 45
  fps is listed as failing).
- Evidence in `orchestration/evidence/T016/`, all 1920×1080: countdown with venting;
  lift-off from the pad cam; tracking telescope with shimmer; condensation collar near Max Q;
  staging; fairing jettison; onboard cam; chase cam with the Earth limb in orbit; orbit map;
  minigame banner in bullet-time; HUD close-up; touch controls; plus the test summary and
  the frame-rate note.
