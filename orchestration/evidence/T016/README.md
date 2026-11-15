# T016 evidence: Unity launch, flight view and orbit map

Machine: Apple M4 (Mac16,13), macOS, Unity 6000.6.9f1. Feed shipped: **`CoreFlightFeed`** (Core `MissionSim`, T013;
rehearsal uses Core's full autopilot on the C1 Appendix A build, seed 2026). The flow ran unattended in rehearsal
(no room): MF_Countdown → MF_Flight → MF_OrbitMap, with four synthetic phones for the minigames.

## Frames (1920×1080 unless noted)

| File | What |
|---|---|
| 01-countdown-venting | MF_Countdown on MF_LaunchPad at dusk, T−5 s, voted vehicle, LOX vent (faint), countdown sequence |
| 02-liftoff-pad-cam | Lift-off at T+2 s from the pad cam, plumes from every nozzle exit, Mach diamonds |
| 03-minigame-banner-bullet-time | MG-08 Max Q Throttle Bucket banner during the run; simulation at ×0.1 |
| 04-tracking-telescope | Tracking telescope (long lens) at 5 km. Weak shot: small vehicle on a flat sky; no heat shimmer |
| 05-condensation-collar-near-max-q | Chase cam, Mach 0.97, q 20.8 kPa: condensation collar, minigame result (Gold) |
| 06-ascent-hud | HUD at 27 km (every value from the same Core snapshot, every number with a unit) |
| 07-staging-onboard / 08-staging-chase | Stage separation at MET 137 s: onboard view and chase with the dropped stage |
| 09-fairing-jettison | Fairing jettison at 70 km, vacuum-wide plume |
| 10-orbit-chase-earth-limb | Orbit (290 × 309 km, i = 97.6°), upper stage over the Earth limb, minigame banner (MG-17) |
| 11-orbit-map | MF_OrbitMap: Core conic, apsis labels in km, trail and ground track |
| 12/13-webgl-* | Release WebGL build in Chrome: telescope at 210 m, chase at Max Q (13.5 km) |
| 14-editor-render-check-27km (1280×720) | Batch-editor render of the flight at MET 105 s (`FlightRenderCheck`) |

## Tests

`editmode-results.xml`: **390 / 390 passed** (361 existing + 29 new in `MissionForge.Screens.Flight.Tests`: feed
determinism from a seed, recording round-trip, event steps kept, bullet-time ×0.1, ground frame, unit conversion,
minigame host protocol and tiers, orbit map math).

## Frame rate

- macOS player 1920×1080 (`macos-evidence-log.txt`): median **60.0 fps** during lift-off (MET 0–20 s) and **60.0 fps**
  in orbit (F8). Playback rate 3 (Core still takes every 1/120 s step).
- WebGL release build, Chrome 1920×1080 DPR 1 (`webgl-fps-run-a.json`, `webgl-fps-run-b.json`, script
  `measure-webgl-fps.mjs`): median **59.9 fps** in every 10 s window from countdown through orbit (run A 160 s, logs show
  Max Q, staging, fairing, orbit). The only console error is the missing `favicon.ico` (404).
- Both are vsync-capped at 60 Hz on an M4; a mid-range laptop was not measured.

## Not met / not verified

- Pilot controls (brief step 5): no `.inputactions`, no keyboard/gamepad/touch pilot input, no `pilot.hud`; touch
  controls frame missing. The phones' pilot seats are not wired.
- Camera rigs are a code director (pad, telescope, chase, onboard), not Cinemachine rigs; no booster cam, no heat
  shimmer, no map-view camera.
- Earth and sky (step 2): scaled-space Earth with clouds, terminator and an atmosphere shell above 9 km; the dusk sky
  dome below. No explicit dusk-to-black sky gradient or exposure-gated stars.
- The countdown has no holds; it hands off to MF_Flight at ignition, so ignition and hold-down release mostly play in
  MF_Flight.
- Polish (step 9): RTL, 200 % text and high-contrast rules exist in the HUD sheet but were not captured; reduced
  motion halves particles and drops the pad cloud (not captured).
- HUD close-up frame: not separately captured (06 is the HUD frame).
- Player builds on this machine twice came out without the URP/Lit variants the flight needs (no pad, ground or vehicle
  drawn; plumes and UI fine) until a development build had been made; the next release build was correct. Root cause
  not found; the engine-bay light (FlightVehicleView) removed the in-flight case on macOS. **Whoever builds the host
  should check the first frames of the flight after building.**
