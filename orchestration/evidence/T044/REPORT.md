# T044: Pre-submission verification report

Date: 2026-11-15 (deadline 23:59 local). Machine: Apple-silicon Mac (arm64, macOS), Node 24.21.0, npm 11.19.0,
.NET SDK 9.0.318 installed system-wide, **.NET 8.0.428 SDK installed from Microsoft into a temporary folder** (the Core tests target net8.0 and need the 8.0 runtime).
Commit under test: `a23d580` (= `origin/main`).

**Method note (decision).** The brief asks for a fresh clone of `main`. A network clone of the 1.1 GB repository
was still downloading after ten minutes, so the sweep ran in a clone made from the local object store and checked out at
`origin/main` (`a23d580`, no working-tree changes, no `node_modules`, no `dist`). It is a clean checkout of the same
commit; it is not a test of GitHub's clone path. Everything below ran in that clone, not in the task checkout.
Logs are in `logs/`, screenshots next to this file, scripts in `scripts/`.

## Verdict

**NOT READY TO SUBMIT until blocker B1 is fixed** (about five minutes: one rebuild, one commit). Everything else either
passes or is a documented limit. The blockers and risks are listed after the tables.

## 1. Install and tests (README.md and RELEASE.md commands, clean state)

| Step | Command | Result |
|---|---|---|
| Server install | `npm --prefix server ci` | PASS |
| Server tests | `npm --prefix server test` | PASS: 240 of 240 (16 files) |
| Client install | `npm --prefix client ci` | PASS |
| Client tests | `npm --prefix client test` | PASS: **916** of 916 (47 files). The docs said 912 (fixed) |
| Demo tools install | `npm --prefix tools/demo ci` | PASS |
| Demo tools tests | `npm --prefix tools/demo test` | PASS: 7 of 7 |
| E2E tools install | `npm --prefix tools/e2e ci` | PASS |
| E2E tools tests | `npm --prefix tools/e2e test` | PASS: 3 of 3 |
| Tools install | `npm --prefix tools ci` | PASS |
| Data validation | `node tools/validate-data.mjs --strict` | PASS: 0 errors, 4 warnings (unreferenced `dashboard.stability.*` strings) |
| Protocol check | `node protocol/check.mjs` | PASS: 105 message types, 105 example frames, 19 object types, 66 enums agree |
| Core tests, .NET 9 runtime only | `dotnet test core/dotnet~` | **FAIL to start**: testhost needs .NET 8 runtime (`Framework 'Microsoft.NETCore.App' 8.0.0 not found`). Not a code defect; RELEASE.md and README do not say that the .NET 8 SDK is required for the Core tests |
| Core tests, .NET 8.0.428 | `dotnet test core/dotnet~` | **FAIL: 566 of 567** (see D1) |
| Server build (by the demo launcher) | `npm run build` in `server/` | PASS |
| Phone client build | `node tools/demo/build-client.mjs` | PASS: 292 files, 35.2 MB |

`npm ci` printed an `npm warn install-scripts` notice about skipped postinstall scripts (esbuild, fsevents); the builds and tests are
unaffected.

## 2. Judge path, `npm --prefix tools/demo run demo`

The demo started, built `server/dist` itself and passed its own health check (`hello` to `hello.ok` directly and through `/ws`).
Headless Chromium with software WebGL (SwiftShader), so frame rate is not measured.

| Page | Result | Screenshot |
|---|---|---|
| `/play/` entry page | PASS: HTTP 200, three cards, 6 links | `01-entry.png` |
| `/play/credits.html` | PASS: HTTP 200, 58 links, no console errors (page is 12,946 px tall, screenshot is the top viewport only) | `02-credits.png` |
| `/play/judges.html` | PASS: HTTP 200 (D3 fixed) | `03-judges.png` |
| `/play/host/?server=ws://localhost:8787` | PASS: Unity WebGL host loads in about 45 s, title screen shows "Room server: connected"; New mission creates room (4-letter code, QR) | `04a-host-loading.png`, `04b-host-title.png`, `05a-host-lobby-empty.png` |
| Phone join (390 x 844 window, touch) | PASS: typed the room code and a call sign, "Join crew", phone shows "You are in", host shows "1 crew joined" | `06a` to `06c`, `05b-host-lobby-with-phone.png` |
| `/play/client/?mock=1` | PASS: loads, no console errors | `07-phone-mock-mode.png` |
| Same host and phone path after rebuilding the phone client (B1 fix) | PASS | `rebuilt-*.png` |

Not done: a full lobby-to-debrief session. The Unity host has only Title, Lobby and Build Bay screens, as the project description says
(scenes for Briefing, Contract Vote, Test Stand, Reviews, Countdown, Flight, Orbit Map and Debrief are identical 8.3 kB placeholder files).

## 3. Links (README.md, JUDGES.md, RELEASE.md, submission/*.md, docs/play/*.html)

Script: `scripts/linkcheck.py`; output: `logs/link-check.txt`.

| Check | Result |
|---|---|
| Local links and anchors-to-files: 33 | PASS: 0 missing |
| External URLs: 63 unique | 58 return 200 |
| `https://nasasc.netlify.app/play/` | **404** (site root returns 200). Known and stated in JUDGES.md and the project description; needs a Netlify redeploy from `main` (B2) |
| `https://www.usgs.gov/landsat-missions` | 504 and read timeout on two tries from this network; likely a transient block, recheck |
| `https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_15_feather_drop.html` | timeout on two tries (curl code 000); recheck |
| `https://www.jpl.nasa.gov/news/the-launch-is-approaching-for-nasas-next-mars-rover-perseverance/` | 403 to scripted clients (bot filter); open in a browser to confirm |
| `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/` | 404 (a directory URL cited as the Blue Marble texture source on the credits page); the file itself was not checked (D4) |

The timeouts and the 403 were retried with a browser user agent; from this network none could be classified as a dead link, so they are listed, not fixed.

## 4. Numbers in `submission/PROJECT_DESCRIPTION.md`

| Claim | Repo | Status |
|---|---|---|
| 9 contracts (C0 to C8) | `data/contracts.json`: 9 | OK |
| C1: 150 kg, 550 km, 97.6 deg, 90 M budget, 180 days, 8 GB, 10 targets | `data/contracts.json` | OK |
| 32 minigames | `data/minigames.json`: 32 definitions; `client/src/minigames/`: 32 `MG-*` folders | OK in source; **not in the committed built client (B1)** |
| 10 roles | `data/roles.json`: 10 | OK |
| 26 part categories, 102 entries | `data/parts/`: 26 files, 102 entries | OK |
| 40 facts; 25 confirmed, 15 corrected | `data/facts.json`: 40; `fact-sources.md`: 25 and 15 | OK |
| 149 GLB files | `client/public` and `docs/play`: 149 each | OK |
| 6 languages | `data/strings/` and `client/src/i18n/strings/`: ar, en, es, fr, hi, pt | OK in source; **not in the committed built client (B1)** |
| 22 part votes | not recounted from data; matches RELEASE.md and JUDGES.md and the T036 runs | not independently re-derived |
| Test counts: dotnet 567, client 912, server 240, validator 0 errors / 4 warnings | 567 (566 on arm64), **916**, 240, 0 / 4 | **Corrected**: client 916; dotnet note added |
| "`main` at commit `24e2e7c`" | `main` is `a23d580` | **Corrected** |
| Known limits: host has only Title, Lobby, Build Bay; other scenes placeholders | scene files confirm | OK |

## Defects and blockers

### B1 (BLOCKER) Committed `docs/play/client/` is a stale build; the judges' demo serves it

- Repro: fresh checkout of `a23d580`, `cat docs/play/client/BUILD_INFO.json` shows `"commit": "2eb2d61..."`, built 2026-11-14 21:08 UTC,
  187 files. `ls docs/play/client/assets | grep -c '^MG-'` gives **17**; no `ar.*`, `es.*`, `fr.*`, `hi.*` or `pt.*` string bundles exist
  (`git ls-tree -r HEAD --name-only docs/play/client/assets | grep -E '/(ar|es|hi)\.'` prints nothing).
- A fresh `node tools/demo/build-client.mjs` gives 292 files, 32 `MG-*` bundles and 16 string bundles for each of ar, es, fr, hi and pt.
- `npm --prefix tools/demo run demo` builds the phone client only when `docs/play/client/` is missing (RELEASE.md 1.1 says so), so the demo, the
  QR code and the hosted site all serve the old client: minigames MG-22 to MG-30, the Arabic, Spanish, French, Portuguese and Hindi text, and the T038
  phone fixes (committed after that build) are all absent. The project description, JUDGES.md and the credits page all claim them.
- Fix (not made: `docs/play/client/` is outside this task's owned paths and it is a 35 MB generated change):
  `node tools/demo/build-client.mjs` on current `main` (no `MF_ROOM_SERVER_URL`, for the local demo), then commit `docs/play/client/`.
  Rebuild once more after the last change to `client/`. Judges who rebuild by hand get the same result; RELEASE.md 1.1 now says to rebuild first.
- Related: after the Netlify redeploy (B2) the hosted mock demo comes from the same folder, so it carries the same staleness.

### B2 (RISK, owner action) Hosted URL returns 404 for `/play/`

`https://nasasc.netlify.app/play/` returned 404 on 2026-11-15 (root 200). JUDGES.md, the project description and the credits page
link to it. Redeploy Netlify from `main` after B1 is fixed, then re-run `curl -sI https://nasasc.netlify.app/play/` and check the Unity
`.unityweb` files return `Content-Encoding: gzip` (`netlify.toml` has the headers; never tested on a real host).

### D1 Core determinism test fails on Apple silicon

- Repro: macOS arm64, .NET 8.0.428, `dotnet test core/dotnet~`: 566 passed, 1 failed:
  `DeterminismTests.Complete_C1_flight_has_a_repeatable_snapshot_and_event_hash` (`core/dotnet~/Tests/Flight/Mission/DeterminismTests.cs:23`).
  Expected the golden SHA-256 `C55B910B...154F` (recorded on Windows x64); actual `5F3266F1...DF71`, identical on three runs.
- The first assertion (two runs on the same machine give the same hash) passes, so the flight model is repeatable on one machine;
  only the pinned value is architecture-specific (floating-point differences between x64 and arm64). The T042 run (Windows x64) passed 567 of 567.
- Impact: a judge or teammate on a Mac gets a red test. Not fixed (code is outside this task). Suggested fix: compare against a per-architecture
  golden, or round the serialised doubles before hashing, or skip the golden assertion off x64.

### D2 README and RELEASE do not list the .NET 8 runtime as a prerequisite for Core tests

On a machine with only the .NET 9 SDK, `dotnet test core/dotnet~` aborts with "You must install or update .NET". The brief mentions it; the docs do not.
Not changed (suggest one line in RELEASE.md).

### D3 (fixed) Hosted URL shown as literal `<https://...>` on the judges page

`docs/play/judges.html` showed `<https://nasasc.netlify.app/play/>` as plain text because the page generator does not render angle-bracket autolinks.
Fixed by writing the link as a normal Markdown link in `JUDGES.md` and regenerating `docs/play/judges.html` with `tools/demo/build-credits.mjs`
(only that line changed). `README.md` and `submission/*.md` use the same autolink style, but they are read as Markdown on GitHub, where it works.

### D4 Credits page cites a directory URL for the Blue Marble texture

`docs/play/credits.html` links to `.../bmng-topography-bathymetry/december/` which returns 404. The source file name is in `assets/media/CREDITS.md`;
not changed because the credits page is generated from several files outside this task's paths.

### D5 (fixed, documentation) Stale statements

- `RELEASE.md` section 6.1 (Netlify headers) and 6.4 (root README line) were listed as "proposed, not made"; both are already in the repository.
  Marked done, heading updated. 6.2 and 6.3 are still not made.
- `RELEASE.md` 1.1 now tells the reader to rebuild the phone client before the demo.
- `submission/PROJECT_DESCRIPTION.md`: commit hash, client test count, arm64 note.

### Observations (no action required)

- `credits.html` regenerated in the clone differs from the committed file only by line endings (CRLF in the committed font licence text); `git diff --ignore-cr-at-eol` is empty.
- Host console shows only WebGL driver, audio-before-gesture and a FSR shader-stripped warning. No page errors.
- The Unity host is Gzip-compressed and was served with `Content-Encoding: gzip` by the demo launcher; fine locally.

## What I did not verify

- A full session from lobby to debrief with several phones (the Unity host has no screens after the Build Bay).
- Frame rate on a GPU laptop; the host ran on software rendering.
- The hosted Netlify site beyond the two HTTP status checks.
- GitHub clone path (a network clone did not finish in time).
- Windows behaviour; no Windows machine was available. The Core test result differs by CPU architecture, so a Windows ARM or x64 result was not reproduced here.
- The 22-part-vote count and the correctness of facts (T025 did that).
- Four external links (usgs.gov, nssdc.gsfc.nasa.gov, jpl.nasa.gov 403, the Blue Marble directory) could not be confirmed from this network.

## Files changed by this task

`orchestration/evidence/T044/` (new), `JUDGES.md`, `docs/play/judges.html` (regenerated, one line), `RELEASE.md`,
`submission/PROJECT_DESCRIPTION.md`.
