# T050 — Fix defect D-102: the phone's 3D part viewer stalls the vote screen

**Worker:** a coding worker (`ahmed-saeed-amek`) · **Owns:** `client/src/viewer/` and its tests, `orchestration/evidence/T050/`. Touch `client/src/screens/vote/PartCard.tsx` / `VoteScreen.tsx` only if a prop must change, and say so.

D-102 (`orchestration/evidence/T036/DEFECTS.md`): at 10 phones the phone page stops responding for
4–19 s during part votes. T047 (`momansy`, issue #179; its report is
`orchestration/evidence/T047/REPORT.md` on main once merged, or on branch
`origin/agentmesh/momansy/issue-179` until then) profiled the vote screen at CPU ×4 and found 39 long
tasks, led by `ThreeScene.destroy → WebGLRenderer.forceContextLoss` (8.1 s self time), then
`ThreeScene.draw / WebGLRenderer.render`, then per-mount PMREM environment generation.

Cause visible in `client/src/viewer/threeScene.ts` and `PartViewer.tsx`: every `PartViewer` (each part
card, `size="card"`, plus the full-screen viewer) creates its own `WebGLRenderer`, runs
`PMREMGenerator` on a `RoomEnvironment`, and on unmount calls `renderer.dispose()` +
`forceContextLoss()`. A vote round mounts several cards and the next round destroys them all at once.
Browsers also cap live WebGL contexts (about 8–16), so many cards exceed it.

## Steps, in order

1. Reproduce in a unit or Playwright measurement: mount and unmount a vote round's cards in a loop and
   record the long tasks (PerformanceObserver), as the baseline. Save the numbers.
2. Share one renderer: a module-level viewer service owning **one** `WebGLRenderer` (one WebGL
   context) and **one** PMREM environment texture built once and reused. Each `PartViewer` keeps its own
   visible 2D `<canvas>` and gets frames from the shared renderer (render to the shared canvas at the card's
   size, then `drawImage` into the card's canvas), or uses the renderer's scissor/viewport over one
   overlay canvas, whichever is simpler and correct. No `forceContextLoss` on unmount; dispose only the
   card's own scene objects. Cache parsed GLBs by part id (small LRU) so revisiting a part does not re-parse.
3. Render only what is visible and active: inactive or off-screen cards (IntersectionObserver) show
   their last frame as a still and do not animate; at most one card animates at a time (the active one),
   capped at 30 fps on cards; respect `prefers-reduced-motion` as the current code does.
4. Keep behaviour and look identical otherwise: same lighting, framing, drag-to-rotate, expand to
   full screen, the static fallback when WebGL is unavailable, and the existing tests. Add tests for
   the service (one context for N viewers, no context loss on unmount, the cache, the fallback).
5. Measure again with the step 1 measurement and with the T047 harness option
   (`tools/e2e`, 10 phones, seed 2801, `--phone-processes shared`) at least twice; record phone-1 stall
   times and long tasks before vs after in `orchestration/evidence/T050/RESULTS.md`. Then
   `npx vitest run` and `npm run build` in `client/`, and rebuild the deployed client with
   `node tools/demo/build-client.mjs` only if that script exists on main and the build is clean.

## Acceptance

One WebGL context no matter how many cards; no `forceContextLoss` on the vote path; no long task over
200 ms from the viewer when a vote round changes (measured); D-102 scenario stalls at 10 phones gone or
cut by at least 80 %, with numbers; viewer looks and behaves as before (screenshots of a card and the
full-screen viewer before/after); client tests and build green.
