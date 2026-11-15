# T045: fixes from the T044 verification

Machine: MacBook with Apple M5 (arm64), macOS 26.5 (Darwin 25.5.0). .NET SDK 8.0.428 installed into a temporary folder
with Microsoft's `dotnet-install.sh` (the machine only has the 9.0 and 10.0 runtimes, and a `~/global.json` pins SDK 9.0.318,
so the tests were run with the 8.0 runtime via `dotnet exec <sdk8>/vstest.console.dll <test dll>` after `dotnet build core/dotnet~`).

## D1 Determinism test

| | Result |
|---|---|
| Before (`before-test.txt`) | 566 passed, 1 failed: `Complete_C1_flight_has_a_repeatable_snapshot_and_event_hash` (golden SHA-256 recorded on Windows x64, got `5F3266F1...DF71` on arm64) |
| After (`after-test.txt`) | **568 passed, 0 failed** (the one test became two) on .NET 8.0.428, arm64 |
| Also | `DOTNET_ROLL_FORWARD=Major dotnet test core/dotnet~` with the system .NET 9 runtime: 568 of 568 passed |

`core/dotnet~/Tests/Flight/Mission/DeterminismTests.cs` now has:

1. `Complete_C1_flight_is_bit_identical_across_two_runs_on_this_machine`: two full C1 autopilot flights (seed 2026) must give the same
   SHA-256 over every step's events and HUD snapshot, the same tick count and the same final mission time. Exact, no tolerance.
2. `Complete_C1_flight_key_outputs_match_recorded_values_within_tolerance`: outcome `Success`, no failure mode, the phase order
   F0..F8, F14 and `payload_deployed = 1` must match exactly; tick count, final mission time, apogee, orbit altitude, final velocity,
   propellant % and remaining dv must be within **0.1 % relative** of values recorded below; inclination within 1e-6 deg.

Tolerance rationale: x64 and arm64 differ in fused multiply-add contraction and libm routines, so results differ in the last bits and the
difference is carried through 172 692 integration steps of a closed-loop autopilot. 0.1 % is far above that noise but below what a real
model or balance change moves (a second of burn time, a few m/s of dv).

Recorded on this arm64 machine: ticks 172692, final MET 1429.0833333378519 s, apogee_km 299.88798301859384, orbit_altitude_km 290.0222553572087,
velocity 7729.767742380211 m/s, propellant 0.6443553693026509 %, dv remaining 331.2429846829888 m/s.

**Not verified:** the new test has not been run on Windows x64, so the 0.1 % bound against x64 is a reasoned choice, not a measurement.
If the bound is too tight on x64 the failure message prints recorded, actual and allowed values. No Core runtime code was changed.

## D2 .NET 8 prerequisite

Added to `README.md` (top), `RELEASE.md` (section 1) and `core/README.md` (How to run the tests), with the exact error a .NET 9/10-only
machine shows and the `DOTNET_ROLL_FORWARD=Major` fallback (checked, see above).

## D4 Blue Marble link

Old: `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/` (directory, 404 today, re-checked).
New: `https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/`
("Blue Marble: Next Generation with Topography and Bathymetry", NASA Science; the old visibleearth.nasa.gov and earthobservatory.nasa.gov
pages redirect into science.nasa.gov).

Only one source file held the link: `unity/MissionForge/THIRD_PARTY.md`. `docs/play/credits.html` is generated, so it was rebuilt with
`node tools/demo/build-credits.mjs` (the changed line is the only difference besides CRLF line endings, which were kept as committed).
`submission/NASA_RESOURCES.md`, `assets/media/CREDITS.md` and the Title screen text mention Blue Marble without a URL; unchanged.

Link check (curl, `-L`, browser user agent, 2026-11-15):

```
200 https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/
200 https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg
200 https://dotnet.microsoft.com/download/dotnet/8.0
404 https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/   (old link)
```

The new page returned HTTP 200 and the expected title; it was fetched by script, not opened in a visual browser.
