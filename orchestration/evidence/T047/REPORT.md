# T047 — D-102 isolation report

Date: 2026-11-15  
Commit tested: `9a34fc961c3f04a97c17285a4d3be791588250b5`  
Scenario: C1, seed `2801`, 10 player phones, 2 spectators and 1 pending late joiner  
Machine: Windows 11 (`10.0.26300`), AMD Ryzen AI 9 HX 370, 33.4 GB RAM, Node 24.16.0, Playwright 1.65.1

## Verdict

**The seconds-long D-102 symptom primarily tracks the multi-page screenshot harness, not the room server.**
The phone client still has a smaller, real vote-screen performance hotspot under a slow CPU. This evidence
does not fully apportion the harness effect between screenshot overhead, renderer contention and the extra
spectator/late-joiner pages.

With 13 rendered pages, separate Chromium processes shortened but did not remove phone-1 stalls while
machine CPU repeatedly reached 100%. With exactly one rendered phone page plus nine protocol-only players,
CPU throttle ×4, and the same five part votes, the longest task was 1,534 ms and machine CPU stayed below
73% (mean 26.1%, p95 62.5%). Its longest heartbeat gap was 2,211.1 ms (2,161.1 ms above the expected 50 ms
interval), far below the 6–32 s comparison gaps. Room vote results
continued on their normal ~3 s timers during the stalled comparison runs.

The isolated profile attributes the remaining client work to synchronous layout/style reads in the part
viewer and to first-frame Three.js shader/program work below `ThreeScene.draw -> WebGLRenderer.render`.
Those are worth fixing for four-year-old phones, but they do not explain the full D-102 duration without the
many-page CPU/software-GPU contention of the harness.

## Method

The harness now accepts `--phone-processes shared|separate`. The default remains `shared`. In
`separate` mode every player, spectator and late joiner is created by its own
`chromium.launch()`.

For the comparison, the complete C1 scenario ran three times per mode, alternating modes. Phone 10's old
×4 throttle was disabled in both groups so browser topology was the only intentional difference. Phone 1
recorded:

- every screenshot's wall duration and outcome;
- a 50 ms in-page heartbeat, reported as the longest main-thread gap and gap minus 50 ms
  (`estimatedStallMs`);
- every Long Tasks API entry over 50 ms;
- machine-wide CPU load every 250 ms, in percent of total logical CPU capacity.

The screenshot remains before the phone votes, matching the D-102 reproduction. The first-round intentional
phone-1 reconnect ran in five comparisons; shared run `06-33-19` timed out before `handleVote`, so no
reconnect occurred there. Prior documents are flushed before intentional closes and are not counted as
stalls. That failed run's part-1 CPU is reported from the screenshot window (51.9% mean, 78.5% p95,
86.7% max; 124 samples) because no wider milestone window completed.

The dedicated profile uses exactly one rendered page at CPU throttle ×4 and nine protocol-only WebSocket
players. It records V8 samples from immediately before part 1 through the end of part 5. No screenshots,
spectators, late joiner or other renderer pages run in that profile. The measurement observer is opt-in
(`--measure-vote-performance`) so normal harness behaviour remains unchanged.

Raw and derived data are in `runs/` and `MEASUREMENTS.json`.

## Six-run comparison

All durations are milliseconds. Each cell is part votes 1 / 2 / 3 / 4 / 5. CPU is whole-machine load.

| Mode | Run suffix | Phone-1 estimated stall ms | Screenshot wall ms | Run CPU mean / p95 / max % | Harness failures |
|---|---|---|---|---|---:|
| shared | `06-33-19` | 16,628 / 0 / 31,635 / 6,726 / 0 | 32,203 / 601 / 37,131 / 15,030 / 565 | 43.4 / 81.5 / 100 | 1 |
| separate | `06-40-07` | 11,315 / 51 / 10,535 / 6,162 / 0 | 12,727 / 445 / 17,380 / 18,466 / 463 | 60.9 / 100 / 100 | 0 |
| shared | `06-46-38` | 28,173 / 50 / 31,892 / 16,545 / 0 | 28,701 / 508 / 39,394 / 15,013 / 447 | 39.6 / 81.5 / 100 | 0 |
| separate | `06-53-59` | 11,955 / 0 / 11,556 / 6,233 / 0 | 12,515 / 457 / 15,135 / 15,007 / 472 | 49.2 / 100 / 100 | 0 |
| shared | `07-00-03` | 24,523 / 0 / 28,114 / 12,765 / 0 | 28,260 / 494 / 29,716 / 36,586 / 412 | 25.9 / 57.3 / 81.9 | 0 |
| separate | `07-07-21` | 10,113 / 0 / 10,995 / 6,593 / 0 | 13,488 / 497 / 13,594 / 15,934 / 486 | 55.6 / 100 / 100 | 0 |

Process isolation reduced the median phone-1 stall from 24,523 to 11,315 ms in part 1 (54%), from
31,635 to 10,995 ms in part 3 (65%), and from 12,765 to 6,233 ms in part 4 (51%). It did not eliminate
the stalls. Parts 2 and 5 remained responsive in all runs (screenshots 412–601 ms).

The in-page heartbeat and Long Tasks API directly confirm renderer main-thread blocking. This is stronger
than T036's post-timeout `page.evaluate` probe. Raw frames show the server's VOTE → RESULT intervals for
affected parts 1, 3 and 4 remained 2,976–3,014 ms across the six runs. Only browser work was delayed.

## ×4 single-page vote profile

Run: `2026-11-15T07-37-18-126Z-single-page-profile-p10-s2801`  
Mode: one rendered phone page at CPU throttle ×4 plus nine protocol-only players. The room server confirmed
10 players. Chromium reported WebGL renderer
`ANGLE (Vulkan 1.3.0, SwiftShader Device (Subzero), SwiftShader driver)`.

The Long Tasks API recorded 46 tasks strictly over 50 ms during the five part votes:

| Vote | Long-task durations ms |
|---|---|
| `m1.part.1` | 369, 161, 174, 148, 112, 58, 765, 1,404, 62, 253, 1,228, 213 |
| `m1.part.2` | 166, 64, 136, 77, 82, 81 |
| `m1.part.3` | 182, 134, 157, 101, 112, 247, 1,534, 53, 275, 1,173 |
| `m1.part.4` | 162, 124, 131, 87, 113, 227, 1,368, 62, 74, 57, 216, 1,475 |
| `m1.part.5` | 125, 85, 97, 121, 90, 64 |

Function attribution from the V8 profile and its call tree:

| Named work | Self time ms | Client call path |
|---|---:|---|
| `getBoundingClientRect` | 518.9 | `PartViewer.resize` and card measurement during React effects |
| `getPropertyValue` | 469.5 | `PartViewer.readColors` during React effects |
| `getProgramInfoLog` | 387.6 | `ThreeScene.draw` → `WebGLRenderer.render` → program/uniform setup |
| viewer/React work around `PartViewer` draw and resize | 197.9 | `PartViewer` frame/effect path |
| `WebGLRenderer.setSize` | 123.7 | `ThreeScene.resize` → `renderer.setPixelRatio/setSize` |
| WebGL context setup | 101.5 | `getContext` below viewer mount |

The relevant source is:

- `client/src/viewer/PartViewer.tsx`: the effect depends on `partId`, `model`, `active` and `size`;
  cleanup calls `scene.destroy()`. Every part card is mounted, and the active card gets WebGL.
- `client/src/viewer/threeScene.ts`: `createThreeScene` constructs a new `WebGLRenderer`, generates an
  environment map and compiles/render programs on first draw; `resize` changes pixel ratio and size.
- `client/src/screens/vote/VoteScreen.tsx`: `<div className="vote__stage" key={stage}>` forces an
  unmount/remount on INSPECT → VOTE → RESULT, repeatedly exercising the viewer cleanup/setup path.

Long Tasks API attribution itself reports only the window container. Function names come from the V8 CPU
profile over the same profile interval. Approximate wall/CDP clock alignment found candidate functions for
18 of 46 tasks; 28 shorter tasks remain browser/native/unresolved. All eight tasks at least 765 ms had a
sampled candidate. Whole-profile self-times and call trees above are direct, but no single function is
claimed as the sole cause of an individual task. `MEASUREMENTS.json` retains every long task, top self-time
frame and call chain.

## Suggested client fix

1. Do not create a WebGL renderer for compact carousel cards. Use the existing 2D wireframe there and
   instantiate Three.js only for the explicit expanded viewer. This is the safest fix for four-year-old
   phones and removes the expensive path from time-critical voting.
2. Keep `PartStage` and its active `PartViewer` mounted across INSPECT and VOTE. Remove the stage key or
   key the part-viewer subtree by round/part instead of vote stage. Batch `readColors`, resize and card
   geometry reads before writes to avoid repeated synchronous layout/style work.
3. If 3D cards remain, reuse one renderer and one precomputed environment target per page. Do not run
   `PMREMGenerator.fromScene` for every mount.
4. Retain resource cleanup, but do not synchronously call `forceContextLoss` on normal stage changes.
   Defer final disposal until the round leaves the vote screen or an idle period, and verify that contexts
   and GPU memory remain bounded.
5. Add a client performance test: under CPU throttle ×4, opening and advancing a three-option part vote
   must create no task over 50 ms and no heartbeat gap over 100 ms.

No client code was changed by T047.

## Verification and limitations

- Harness unit tests: 5/5 passed.
- Client tests: 47 files, 916/916 tests passed; production build passed.
- Server tests: 17 files, 247/247 tests passed; build passed.
- All six comparison runs reached debrief. The strict profile completed all five part votes with 10 room
  players and then stopped before TEST by design. One comparison returned non-zero because a part-1
  screenshot and its viewport retry both timed out; this is retained as defect evidence.
- Long Tasks API support was confirmed in Chromium. CPU numbers are machine-wide samples, not per-process.
- The strict profile intentionally replaces nine rendered peers with protocol peers and removes screenshot,
  spectator and late-joiner work. It isolates the profiled renderer but cannot individually quantify which
  removed harness load caused the comparison-run difference.
- Not verified on physical phones or a hardware-GPU Chromium session. The retained strict profile records
  SwiftShader explicitly; screenshot capture adds load only to the six reproduction runs. Absolute
  durations must not be treated as phone-hardware benchmarks.
- T047 rebuilt the current client before measuring. T036 ran an older commit, so this report compares modes
  within T047 and does not use cross-revision timing as proof.

All numbers above are operational test metrics, not physical-model or game-balance values.
