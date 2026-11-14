# T028 end-to-end integration results

Seed `2801`; Windows 11; real room server and real Chromium phone client; scripted host unless noted.
All numeric preview values sent by the scripted host are **fixture (not Core)** game values. See
`ENVIRONMENT.md` for the exact toolchain and commit.

## Canonical runs

| Players | Spectators | Run id | Host | Harness failures |
|---:|---:|---|---|---:|
| 1 | 0 | `2026-11-14T20-51-35-691Z-stub-p1-s2801` | stub | 0 |
| 3 | 0 | `2026-11-14T20-54-03-636Z-stub-p3-s2801` | stub | 0 |
| 6 | 2 | `2026-11-14T20-54-03-636Z-stub-p6-s2801` | stub | 0 |
| 10 | 2 | `2026-11-14T20-54-03-636Z-stub-p10-s2801` | stub, audience weight 1 | 0 |

The one-phone full script was also stable on the immediately preceding same-seed run. The dedicated
lobby → briefing smoke is `2026-11-14T21-03-47-323Z-stub-p1-s2801`.

## Segment matrix

`Pass` means the segment completed over real sockets and the next segment was reached. `Fail` is a
product gap, not a hidden harness workaround.

| Segment / scenario | 1 | 3 | 6 | 10 | Note |
|---|---|---|---|---|---|
| Lobby | Pass | Pass | Pass | Pass | Screenshot in every canonical run |
| Briefing | Pass | Pass | Pass | Pass | Real phone screen |
| Contract vote (C1/C0/C2) | Pass | Pass | Pass | Pass | C1 won in all canonical runs |
| Part 1: launch site | Pass | Pass | Pass | Pass | First phone drops and resumes during this vote |
| Part 2: payload | Pass | Pass | Pass | Pass | — |
| Part 3: upper-stage engine | Pass | Pass | Pass | Pass | — |
| Part 4: first-stage engine | Pass | Pass | Pass | Pass | Includes one veto attempt |
| Part 5: tank size | Pass | Pass | Pass | Pass | Forced tie exercised where count permits |
| TEST quick vote | Pass | Pass | Pass | Pass | TEST/SKIP |
| PDR review vote | Pass | Pass | Pass | Pass | PASS/REWORK |
| FRR round 1 | Pass | Pass | Pass | Pass | One NO-GO |
| FRR round 2 | Pass | Pass | Pass | Pass | All GO |
| Countdown / MG-07 | Fail | Fail | Fail | Fail | Minigame module not bundled; start was schema-valid and phones sat out |
| F2 / MG-08 | Pass | Pass | Pass | Pass | Real minigame, generic touch input, result relayed |
| F3 / MG-09 | Fail | Fail | Fail | Fail | Minigame module not bundled |
| F4 / MG-10a | Fail | Fail | Fail | Fail | Minigame module not bundled |
| F6 / MG-13 | Fail | Fail | Fail | Fail | Minigame module not bundled |
| F8 / MG-15 | Fail | Fail | Fail | Fail | Minigame module not bundled |
| F9 / MG-21 | Fail | Fail | Fail | Fail | Minigame module not bundled |
| Blackout start/end | Pass | Pass | Pass | Pass | Phone screenshot captured |
| Debrief | Pass | Pass | Pass | Pass | Score, awards, facts and screenshot |
| Phone socket drop/resume | Pass | Pass | Pass | Pass | Token, slot and roles retained; phone abstained while away |
| Phone reload/resume | Not run | Pass | Pass | Pass | A second phone reloaded from its session token |
| Host drop 20 s / resume | Pass | Pass | Pass | Pass | `HOST_DISCONNECTED` pause then explicit resume |
| Late join after BUILD | Pass | Pass | Pass | Pass | Became pending spectator |
| Two audience spectators | N/A | N/A | Pass | Pass | Audience vote weight 1 in 10-phone run |

## Measurements

Latency values are milliseconds; bandwidth is maximum received KiB/s across clients. Phone FPS is
the requestAnimationFrame probe sampled during MG-08. The 10-phone FPS row is the CPU-throttled ×4
phone. Targets: vote round trip < 200 ms, HUD ≤ 5 Hz, console telemetry ≤ 10 Hz, vote tally ≤ 5 Hz,
received bandwidth < 50 KiB/s, and phone FPS ≥ 30.

| Players | Vote ack p50 / p95 / max ms | Next tally p50 / p95 / max ms | Poll p95 ms | MG relay p95 ms | HUD max Hz | Telemetry max Hz | Tally max Hz | Max KiB/s | Phone FPS avg / 1% low |
|---:|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | 2.107 / 11.106 / 11.106 | 170.651 / 175.367 / 175.367 | 3009.931 | 2.034 | 5 | 10 | 2 | 0.79 | 59.2 / 59.5 |
| 3 | 1.821 / 6.737 / 6.737 | 176.692 / 208.830 / 208.830 | 3206.603 | 1.940 | 5 | 10 | 3 | 4.86 | 59.5 / 59.5 |
| 6 | 2.525 / 9.124 / 12.917 | 132.715 / 203.997 / 209.893 | 3436.955 | 1.871 | 5 | 10 | 3 | 3.75 | 55.8 / 20.0 |
| 10 | 3.539 / 8.938 / 10.047 | 104.243 / 200.162 / 203.256 | 780.292 | 1.898 | 5 | 10 | 3 | 4.53 | 47.0 / 10.0 |

Vote acknowledgement passed comfortably. The next-tally p95 exceeded 200 ms by 0.162–8.830 ms at
3, 6 and 10 players (D-003). All message-rate and bandwidth limits passed. Average phone FPS passed,
including the CPU-throttled ×4 client. No `pilot.hud` frames were emitted in this scripted scenario.

## Frame validation and errors

| Players | Total frames | Valid | Invalid | Unknown types | Protocol `error` frames | Seq gaps | Console errors | Page errors | Server stderr bytes |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 886 | 885 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 3 | 1,590 | 1,589 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 6 | 2,827 | 2,826 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 10 | 4,416 | 4,415 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

Every recorded text frame was checked against the envelope and its type schema. The sole invalid
frame in each run is the same server root cause: pre-join `roles.state` contains `groups: []` even
though its schema requires at least one group (D-001).

## Unity host

Headless Chromium used `--use-angle=swiftshader --enable-unsafe-swiftshader --enable-webgl
--ignore-gpu-blocklist` at 1920 × 1080. Run
`2026-11-14T20-34-13-289Z-unity-probe-s2801` remained on `LOADING MISSION CONTROL`, created no room,
and the 10 s `window.mfPerf` sample was 0.812 average FPS / 0.330 1%-low FPS. The required headed
fallback was attempted in `2026-11-14T21-01-59-386Z-unity-probe-s2801`; Playwright could not launch
the headed process (`browserType.launch: spawn UNKNOWN`). No real Unity host screen was reached, so
placeholder-vs-real screen classification was not possible (D-004). Stub host evidence was used for
the remaining matrix as the brief directs.

## Verification notes

- All canonical frame logs are below 5 MB and every file is below 50 MB.
- Screenshots exist for lobby, briefing, part vote, both FRR rounds, MG-08 intro, blackout and debrief.
- `.NET` was present only as a runtime host with no installed SDK, so optional Core-generated fixtures
  were skipped. Fixture numbers remain explicitly labelled `fixture (not Core)`.
- macOS was not run.
