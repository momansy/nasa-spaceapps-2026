# T019 — preflight and lab increment (blocked)

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
- Old `orchestration/evidence/T019/.npm-cache` remains from the preceding worker. Automatic approval review rejected its deletion as blocked by policy. The local evidence `.gitignore` excludes it so the worker will not stage its overlong paths. It is not evidence and must not be force-added.
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

Run this increment in a worker environment where esbuild can resolve the checkout's parent directories, Python progress execution is allowed, and Playwright Chromium is available. Remove the ignored stale cache through an authorized environment. Repeat unmodified preflight and the lab smoke, inspect its screenshot, then start MG-02. Install/test commands need `PLAYWRIGHT_BROWSERS_PATH` set consistently if a custom browser directory is used. No branch change, commit, push, PR or deployment was performed.
