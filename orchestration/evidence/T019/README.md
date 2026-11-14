# T019 — preflight and lab increment (blocked)

## Latest retry — 2026-11-14, run 183ba5a5-48f

- Resumed the existing scaffold from commit `539c7ff`; initial working tree was clean. Did not switch branches, fetch, commit, push, or open a PR. The required shell files exist on the locally available `origin/main` ref.
- Retried unmodified `npm test`: failed before collecting tests because esbuild cannot read `../../../../../../..` (Access is denied) or resolve `client/vite.config.ts`. Current output: `preflight-vitest.txt`.
- Retried unmodified `npm run build`: TypeScript completed, then Vite failed at the same config-loading directory-access error. Current output: `preflight-build.txt`.
- Standalone `npm run typecheck` passed. Current output: `lab-typecheck.txt`.
- Direct Playwright Chromium launch failed because the installed Playwright version's browser executable is absent. Current output: `browser-preflight.txt`. No browser installation was retried because fixing that alone cannot satisfy the independent standard-build gate.
- Retried the exact progress command: Windows denied execution of the specified Python executable before `mesh.py` ran. No progress comment was posted.
- `Test-Path orchestration/evidence/T019/.npm-cache` is now false. The old cache is absent; no deletion was needed or attempted in this retry. The historical cache-removal rejection below describes the previous run only.
- Preserved the ordered step-1 gate. No minigame implementation started and no screenshots, FPS results, full e2e pass, or successful standard test/build are claimed. Previous runner-loader diagnostics below are historical, not new results.
- Decisions: retain the existing dependencies and scaffold; do not repeat `npm ci` without a dependency change, modify read-only shared configuration, or treat alternative-loader diagnostics as the required standard command passes. No new game values or interface changes.
- Needed to resume: a worker execution environment that permits esbuild to resolve this checkout, permits the specified Python progress executable, and has the matching Playwright Chromium installed. Then repeat `npm ci`, standard tests/build, and MG-08 lab smoke before MG-02.
- Independent review confirmed the blocking gate and identified nondeterministic screenshot timing. The lab spec now freezes a fixed clock before navigation and polls readiness from the test runner, so only explicit `runFor` calls advance play. This source fix still requires browser verification. The fixed 2026-01-01 UTC epoch and 1 s pre-navigation pause offset are tooling `game_value` choices, not game physics.
- Current changes are confined to the owned lab spec and evidence paths. The initial inherited-context review launch failed with a thread-store error; the single fresh-context reviewer completed its read-only review.

The sections below record the preceding run; see this retry section for current cache and verification status.

## Done

- Read the task, standing orders, architecture, design sections, style guide, client interfaces, MG-08 reference, catalog and protocol.
- Confirmed the shell interface exists on `origin/main`; no task commits were ahead of `origin/HEAD`.
- Added `client/e2e/minigames/build/lab.html`, `lab.ts` and `build.spec.ts` without modifying shared client code.
- Lab implements catalog defaults, query parameters, real strings/theme, module loading, demo/play mounting and `window.__lab` instrumentation. Spec includes MG-08 smoke coverage and a scaffold for later minigame screenshots/lifecycle/fps checks. No delivered ids are enabled yet.

## Verified

- `npm ci --no-audit --no-fund`: passed, 123 packages; cache redirected to `%TEMP%/missionforge-t019-npm`.
- `npm run typecheck`: passed, including the lab sources.
- `npm test -- --configLoader runner`: 67 tests passed across 6 files. This is an alternative-loader diagnostic, not a passing unmodified `npm test`.
- `npx vite build --configLoader runner`: production bundle passed. This is an alternative-loader diagnostic, not a passing unmodified `npm run build`.
- `git status --short`: only owned lab/evidence directories are untracked. No shared source or policy changed.

## Failing / not verified

- Unmodified `npm test` and `npm run build` fail while esbuild loads `vite.config.ts`: `Cannot read directory "../../../../../../..": Access is denied`. Logs preserved separately.
- The supported `runner` config loader gets tests/build past config loading, but the lab dev server's dependency optimizer also emits access-denied/unresolved React CommonJS errors.
- MG-08 Playwright smoke failed before browser launch: the required Chromium executable is missing. An installation into `%TEMP%/missionforge-t019-browsers` remained at 0% of a 207.3 MiB download and was canceled. No screenshot or fps measurement was produced. No visual approval is claimed.
- Full `npm run e2e` was not run; only the failed targeted lab smoke was attempted.
- The specified progress command was attempted; Windows denied execution of `C:/Users/moham/AppData/Local/Programs/Python/Python315/python.exe`. A final attempt with output capture also failed, reporting `StandardOutputEncoding is only supported when standard output is redirected` (see `progress-command.txt`). No progress comment was posted.
- At the time of the preceding run, `orchestration/evidence/T019/.npm-cache` remained from the preceding worker. Automatic approval review rejected its deletion as blocked by policy. It is absent in the latest retry. The local evidence `.gitignore` still excludes caches to prevent publication.
- Steps 2–10 were not started: MG-02, MG-01, MG-29, MG-06, MG-03, MG-04, MG-05 and MG-30 remain undelivered. Required step-1 verification has not passed.

## Decisions

- Respect the ordered preflight gate; preserve a small lab increment instead of claiming any minigame complete.
- `T019_CONFIG_RUNNER=1` selects Vite's supported runner loader for lab diagnostics; normal environments retain the default bundle loader. No shared config changed.
- Lab layout defaults are `game_value`: 390 CSS px frame width, 844 CSS px bounded height with internal scrolling, 360 CSS px minimum flex play area, seed 42, ENGINEER/STANDARD. Duration is the catalog duration in ms. These are tooling values, not physical assumptions.
- No game constants, physics models, content facts or interface extensions were introduced.
- Checked-in `MinigameEnv.coop` already uses `send(action)` / `onState(cb)`, unlike the old proposed interface in the brief. Future cooperative games should use the current authoritative types.

## Independent review

The final-review subagent confirmed that step 1 and T019 are incomplete. Its two source findings were fixed: the lab frame now has a bounded 844 CSS px height with internal scrolling, and FPS is normalized using browser elapsed milliseconds rather than assuming each Playwright wait takes exactly one second. TypeScript checking was repeated after these fixes. Browser verification remains blocked, so these are source fixes only. The initial subagent launch failed with a thread-store error; a fresh-context retry completed the read-only review.

## Next

Run this increment in a worker environment where esbuild can resolve the checkout's parent directories, Python progress execution is allowed, and Playwright Chromium is available. Repeat unmodified preflight and the lab smoke, inspect its screenshot, then start MG-02. Install/test commands need `PLAYWRIGHT_BROWSERS_PATH` set consistently if a custom browser directory is used. No branch change, commit, push, PR or deployment was performed.
