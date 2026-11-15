# T050 follow-up — prewarm the shared viewer before the first vote

Problem (from `orchestration/evidence/T050-confirm/README.md`, PR #242): after PR #229 the first part vote still
froze phone 1 for 17.6–18.5 s in the 10-phone run, because the shared renderer's one-time cost landed there. That cost
is the WebGL context, the PMREM environment, shader compilation and the first GLB parse/upload.

## Change

- `client/src/viewer/prewarm.ts`: `prewarmViewer()` runs **once per page** when the browser is idle
  (`requestIdleCallback`, timeout 2 s, with a `setTimeout` fallback). It does nothing without WebGL (`hasWebGL()`), and in
  that case three.js is never even downloaded. Steps:
  1. Dynamically import `threeScene`, then fetch the GLBs of the first category's first 2 parts (`loadModel`, which is
     cached per visit).
  2. `warmUp()` creates the shared renderer and PMREM environment.
  3. For each model it parses into the LRU cache and draws once off screen at 64 × 64. This compiles the programs for
     the real material setup, which all engine GLBs share (one 512 px texture set, see `public/models/README.txt`), and
     uploads geometry and textures.
  4. Each step runs in its own idle task. It is idempotent, and any error is swallowed, so the viewer simply pays the
     cost itself.
- `threeScene.ts`: new `warmUp(models, yieldFn)`. It skips drawing while a viewer owns the WebGL canvas.
- **Screen change: `client/src/screens/RoleCard.tsx`, one import plus one call** (`prewarmViewer()` in
  `RoleCardScreen`).
  - Every player passes the role card before the first vote. Spectators do not, so they never prewarm.
  - The call is idempotent, so calling it during render is safe.
- Game simplification: the parts prewarmed are "the first category's first two in catalog order". Any other first part
  still benefits from the renderer, environment and program warm-up, because its programs match.

## First part vote, CPU ×4

Script: [`perf-first-vote.mjs`](perf-first-vote.mjs). It runs one rendered phone on the `?mock=1&speed=1` session
(390 × 844, DPR 2, touch), with the CPU throttled ×4 from page load and 3 s on the role card. SwiftShader GL. Without
prewarm = the same branch built without the `RoleCard.tsx` call. Runs alternated. Raw data is in `runs-first-vote/`.

| Run | Part cards shown → first 3D frame | Long tasks during first vote (count / total / max / > 200 ms) | Long tasks role card → vote (count / total / max) |
|---|---:|---|---|
| without-1 | 766 ms | 24 / 3,040 ms / **1,117 ms** / 3 | 2 / 140 / 84 |
| without-2 | 759 ms | 28 / 3,286 ms / **908 ms** / 4 | 2 / 135 / 80 |
| **with-1** | **434 ms** | 28 / 2,085 ms / **255 ms** / 1 | 3 / 184 / 81 |
| **with-2** | **437 ms** | 26 / 2,061 ms / **270 ms** / 2 | 2 / 132 / 77 |

Means: first 3D frame after the cards appear goes from **763 → 436 ms**. Long-task total in the first vote goes from
**3.16 → 2.07 s**, and the longest task from **1,013 → 263 ms**. With the prewarm, no long task over 81 ms was seen between the
role card and the vote, the same as without it. I did not profile where the prewarm's GPU-side work went. On SwiftShader
it may run in the GPU process, which a main-thread long task does not show.

"Vote screen shown → first 3D frame" is ~12 s in all runs, because the first vote opens with the REVEAL and PREDICT
stages before the cards appear (12,057 / 12,045 without, 11,699 / 11,745 with).

## Tests / build

- 2 new unit tests in `client/src/viewer/threeScene.test.ts`. One checks that `warmUp` is idempotent (same promise),
  creates no second context or environment bake, and leaves the model cached so the first viewer does not re-parse it.
  The other checks that it rejects without WebGL and parses nothing.
- `npx vitest run`: **48 files, 929/929 passed**. `npm run build`: clean.

## Not verified

- The T047 10-phone harness (`tools/e2e`, seed 2801, `--phone-processes shared`) was **not** re-run (time box before the
  11:30 client freeze). The part-1 10-phone heartbeat gap after this change is therefore unmeasured.
- In the 10-phone run 13 pages share one machine and software GL. The prewarm then runs during the role card / build
  screens instead of the vote. Whether it finishes before part 1 there depends on how long players stay on those
  screens. If it has not finished, the first viewer waits for the same in-flight work (shared cache promise) and does
  not start it twice.
- Not run on a physical phone or a hardware GPU.
