# T050-confirm — did the shared WebGL renderer (PR #229) fix D-102?

Date: 2026-11-15 · Commit tested: `d6fc7ba` (origin/main, includes T050) · Local stack only (no hosted site touched)
Machine: Windows 11 `10.0.26300`, AMD Ryzen AI 9 HX 370, 33.4 GB RAM, Node 24, Playwright 1.65.1 Chromium, software GL
(`ANGLE (Vulkan 1.3.0, SwiftShader)`) — same machine and GL path as T047. Client, server and `tools/e2e` were rebuilt
(`npm ci` + `npm run build`) from this commit before measuring.

## Verdict

**Improved, not fixed.** The part 3 and part 4 vote stalls are essentially gone (screenshot 4.8 s / 1.0 s instead of
28–39 s / 15–37 s) and the harness no longer fails, but the **part 1 vote screen still freezes the phone main thread for
~18 s**, and the strict ×4 single-page profile is unchanged (max heartbeat gap 2,221 ms, 47 long tasks, longest 1,487 ms).

## What was run (from `tools/e2e`, `E2E_EVIDENCE_TASK=T050-confirm`)

- 2 × `node run.mjs --players 10 --seed 2801 --segment full --phone-processes shared --measure-vote-performance` with
  `E2E_NO_THROTTLE=1` (phone 10's old ×4 throttle off, exactly as T047's comparison). C1, 10 players + 2 spectators + 1 late joiner.
- 1 × `npm run profile:vote` (one rendered phone at CPU ×4 + nine protocol-only players, five part votes).
- `E2E_EVIDENCE_TASK=T050-confirm node summarize-d102.mjs` (T047's own summariser) to build the tables from the raw runs.
- 1 × `client/ node ../orchestration/evidence/T050/perf-viewer.mjs --dir dist --label confirm` for the WebGL context count
  (the e2e harness does not count contexts; T047's JSON has none either). Output moved to `webgl-context-check/`.

Runs were sequential; one earlier attempt accidentally ran two chains at once, was killed and **discarded** (not in these numbers).
Raw run folders (≈58 MB) are not committed. The stub host's shortened timers are test fixtures, not game values.

## Before / after (phone 1, shared browser, 10 players)

Before = T047 shared runs (n=3: `06-33-19`, `06-46-38`, `07-00-03`, commit `9a34fc9`). After = this task (n=2: `10-26-33`, `10-32-05`, `d6fc7ba`).
All times ms. "Gap" = longest main-thread heartbeat gap during the part vote (50 ms heartbeat); "Stall" = gap minus 50 ms.

| Metric | Part | Before (3 runs) | After (2 runs) |
|---|---|---|---|
| Max heartbeat gap | 1 | 16,678 / 28,223 / 24,573 | **18,457 / 17,644** |
| | 2 | 0 / 100 / 0 | 0 / 0 |
| | 3 | 31,685 / 31,942 / 28,164 | **2,283 / 2,375** |
| | 4 | 6,776 / 16,595 / 12,815 | **102 / 273** |
| | 5 | 0 / 0 / 0 | 0 / 0 |
| Long tasks > 50 ms (count; longest ms) | 1 | 2; 15,587 · 3; 13,842 · 3; 14,353 | 3; 17,222 · 3; 15,093 |
| | 3 | 7; 13,039 · 3; 14,940 · 3; 13,691 | 4; 2,240 · 4; 2,330 |
| | 4 | 2; 6,126 · 1; 16,160 · 1; 12,784 | 1; 101 · 1; 229 |
| Screenshot wall time per vote | 1 | 32,203 (failed) / 28,701 / 28,260 | 19,723 / 19,062 (both needed the viewport retry) |
| | 3 | 37,131 / 39,394 / 29,716 | **4,830 / 4,850** |
| | 4 | 15,030 / 15,013 / 36,586 | **1,013 / 1,045** |
| | 2, 5 | 412–601 | 653–734 |
| Harness pass/fail | | 1 of 3 failed (part-1 screenshot + retry timed out) | **0 of 2 failed** (exit 0, no failures) |
| Whole-machine CPU mean / p95 / max % | | 43.4/81.5/100 · 39.6/81.5/100 · 25.9/57.3/81.9 | 25.3/49.3/100 · 26.3/49.1/87.9 |

Server VOTE→RESULT timers are unaffected (not re-checked here; T047 showed ~3 s).

### Strict ×4 single-page profile (`npm run profile:vote`)

| Metric | Before (T047) | After |
|---|---|---|
| Max heartbeat gap, five part votes | 2,211.1 ms | 2,220.8 ms |
| Long tasks > 50 ms | 46 | 47 |
| Longest long task | 1,534 ms (part 3) | 1,487 ms (part 1) |
| Part 1 long tasks ≥ 700 ms | 765, 1,404, 1,228 | 718, 1,487 |
| Harness | pass, 10 room players | pass, 10 room players, `failures: []` |
| Top self time | `getBoundingClientRect` 519, `getPropertyValue` 470, `getProgramInfoLog` 388 | Three.js `R` (threeScene chunk) 1,838, `getBoundingClientRect` 1,257 |

`getPropertyValue` (the `readColors` cost) and `getProgramInfoLog` dropped out of the top list. Three.js render work and
layout reads (`getBoundingClientRect`) now dominate, and the part 1 first-frame cost is still there.

### WebGL context count

| | Before | After |
|---|---|---|
| Contexts created while measuring (T050 mock-session benchmark, ×4, 24 actions, 62.6 s) | 11.5 (T050 RESULTS.md, `before-1/2`: 13, 10) | **0** (`webglContextsCreatedWhileMeasuring`); page lifetime 3 (harness probe + `hasWebGL()` check + the one shared renderer) |
| `loseContext()` calls | 12.5 | **0** |

Contexts were not counted inside the 10-phone e2e runs (harness gap). In the same confirm run the benchmark's long tasks
were 133 totalling 13.5 s with a longest task of 1,453 ms at ~23 s (first render), versus 4.5 s / 187 ms in T050's own
after-runs, so that benchmark was noisier here than T050 reported. The context count (0, 0) is not affected by that.

## Interpretation

- The per-card-renderer path (D-102 as seen at parts 3 and 4, where the viewer was remounted after the first WebGL use)
  is fixed: ~30 s stalls are down to ≤ 2.4 s, and ≤ 0.3 s at part 4.
- Part 1 is the first time the page ever draws a part in 3D. A single ~15–17 s task (+ 2–3 s of smaller ones) remains,
  in the same range as before. That is consistent with first-use WebGL context, PMREM environment and shader compilation
  under SwiftShader, now shared but not removed. It looks like a one-time cost per page (parts 2, 5 never stall), but with
  10 pages in one Chromium on software GL it dominates. T047's report noted that the harness itself amplifies this, so a
  phone with a real GPU is expected to be better; that was not tested here.
- Part 3's remaining ~2.3 s task is most likely the first sight of a new part model (GLB parse + first draw).

## Not verified / limits

- Software GL (SwiftShader), not a phone GPU; no physical device. Absolute durations are not phone benchmarks.
- n = 2 after-runs vs n = 3 before-runs; machine CPU is whole-machine, not per-process.
- Part 1 stall not root-caused in this task (evidence only; no product code touched). Suggested follow-up: warm the shared
  renderer (create context, bake environment, precompile materials) during lobby/briefing instead of on the first vote.
- Hosted Render site not touched (human playtest in progress).

## Files

- `MEASUREMENTS.json` — trimmed summary of both comparison runs and the profile (same schema as T047's).
- `webgl-context-check/perf-viewer-confirm-1.json` — raw output of the T050 benchmark confirm run.
- `ENVIRONMENT.json`, `latest-results.json` — written by the harness for this evidence folder.
