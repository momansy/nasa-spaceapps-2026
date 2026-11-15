# T046 evidence: final docs refresh before submission

Date: 2026-11-15. Machine: Apple-silicon Mac (macOS, arm64). Repository `main` at `fe5a724` (after T042 to T045, T047, T049 and the
T016 flight view and T034 environment pass were merged). The brief asked for a recount of everything the docs state, then edits.

## 1. What was measured, and how

| Item | Result | How |
|---|---|---|
| Core tests | **568 of 568 passed** | `DOTNET_ROLL_FORWARD=Major dotnet test core/dotnet~` (only .NET 9 and 10 runtimes are installed; the project targets `net8.0`, see `core/README.md`) |
| Server tests | **247 of 247** (17 files) | `npm test` in `server/` |
| Phone client tests | **916 of 916** (47 files) | `npx vitest run` in `client/` |
| Demo tools tests | 7 of 7 | `npm --prefix tools/demo test` |
| E2E tool tests | 5 of 5 (T044 reported 3) | `npm --prefix tools/e2e test` |
| Protocol check | 105 message types, 107 valid examples, 528 mutated examples rejected | `node protocol/check.mjs` |
| Data validation | 0 errors, 4 warnings (unreferenced `dashboard.stability.*` strings) | `node tools/validate-data.mjs` |
| Contracts | 9 (C0 to C8) | `data/contracts.json` |
| Roles | 10 | `data/roles.json` |
| Minigames | 32 defined in `data/minigames.json`; 32 folders in `client/src/minigames/` (includes MG-08b and MG-10a) | file counts |
| Facts | 40 | `data/facts.json` |
| Part categories and part entries | 26 categories, **102** parts (summing each file's `parts` array) | `data/parts/*.json` |
| Tests / anomalies / boosts / achievements | 10 / 12 / 11 / 12 | `data/*.json` |
| Languages | 6: en, ar, es, fr, hi, pt (`data/strings/`, `client/src/i18n/strings/`) | file listing |
| 3D part models for the phone viewer | 149 `.glb` files | `client/public/models/` |
| Host scenes with working content | `MF_Title`, `MF_Lobby`, `MF_BuildBay`, `MF_Countdown`, `MF_Flight`, `MF_OrbitMap` (controllers `TitleScreen`, `LobbyScreen`, `BuildBayScreen`, `CountdownScreen`, `FlightScreen`, `OrbitMapScreen`) | scene and script listing |
| Host scenes that are layout placeholders (`RegionScreen`) | `MF_Briefing`, `MF_ContractVote`, `MF_TestStand`, `MF_DesignReview`, `MF_FlightReadinessReview`, `MF_Debrief`, `MF_CampaignHub`, `MF_Codex`, `MF_Settings`, `MF_MinigameOverlay` (6 to 9 kB each, only navigation buttons) | scene sizes, `RegionScreen.cs` |
| Age of the committed WebGL host | last commit touching `docs/play/host/Build` is `9cf9dfb` (2026-11-15 06:32 +03:00, T040); T034 rework 2 (`4efbe75`, 08:57) and T016 (`68d1483`, 10:14) were merged after it | `git log` |
| Hosted site | `/healthz` 200; `/` 302 to `/play/`; `/play/`, `/play/host/`, `/play/client/`, `/play/client/?mock=1`, `/play/judges.html`, `/play/credits.html` all 200; `host.wasm.unityweb` `content-encoding: gzip`, `content-type: application/wasm` (with `Accept-Encoding: gzip`); WebSocket `hello` returned `hello.ok` | `curl`, a Node `WebSocket` one-liner |
| Netlify site | `https://nasasc.netlify.app/play/` and `/play/judges.html` still HTTP 404 | `curl` |
| Repository | `PUBLIC`; `LICENSE` is MIT (GitHub shows the licence as "Other") | `gh repo view`, `LICENSE` |

**Not run:** the Unity EditMode tests and any Unity build (no Unity editor was used); the Playwright suites; a full hosted play test (host plus phones through the public URL).
The first Core test run without `DOTNET_ROLL_FORWARD` aborted with the known ".NET 8 runtime not found" error, as documented.

## 2. What changed

| File | Change |
|---|---|
| `submission/PROJECT_DESCRIPTION.md` | Status line and commit; flight view, countdown and orbit map now described as in the source but not in the committed WebGL build; hosted URL (Render) replaces the Netlify paragraph; technology table (engines and materials, hosting, entity counts); verification block replaced with this run's numbers; accessibility (T043 axe results, subtitled videos); section 8 limits rewritten (host screens, old WebGL build, partly tested hosting, D-102); section 9 next steps |
| `submission/CHECKLIST.md` | Section 0 now lists what is done (repository public, MIT licence, hosting live, videos made) and what remains owner-only; form rows for video, live link, source, licence, images; section 3 hosted-URL table (Render chosen); section 4 ticks the done items and keeps the owner-only steps |
| `submission/AI_DISCLOSURE.md` | Test counts 567/912/240 to 568/916/247 |
| `submission/NASA_RESOURCES.md` | Mission Viz row: orbit map screen exists in the source (T016) but not in the committed build |
| `submission/DEMO_VIDEO_SCRIPT.md` | Status note: the two cuts exist; "not built" list corrected for the flight view |
| `JUDGES.md` | Hosted URL is the Render site (sleep warning, earlier-build warning); demo videos line; MIT licence; known limitations rewritten |
| `README.md` | New "MissionForge at a glance" block with the counts above, play links and the host-screen status; Agent Mesh text unchanged |
| `RELEASE.md` | Status paragraph (hosting live, not fully verified), WebGL host age, phone client rebuild note, file size (33 MB data file), gzip check, flight-view note in the runbook, section 6.2 marked done |
| `HOSTING.md` | Status paragraph (deployed, what was and was not verified); section 2 retitled as the record of human steps |
| `docs/play/judges.html` | Regenerated from `JUDGES.md` with `node tools/demo/build-credits.mjs` (outside the brief's owned paths; see Decisions). `docs/play/credits.html` was regenerated too but reverted, because only its line endings changed |

## 3. Planned versus built

Moved from "planned" to "built (in the source on main)": countdown, flight view and orbit map host screens (T016); phone accessibility audit (T043);
host keepalive (T040); hosting (deployed); MIT licence; demo videos with subtitles; 11 remade engines and PBR materials (T032); Build Bay environment pass (T034).
Kept as "planned" or "placeholder": big-screen briefing, contract vote, test stand, design review, flight readiness review, debrief and end screens (T024, T027),
host UI polish (T035), debrief tagging of physical/approximate/game values, audience-as-one-vote lobby control, native-speaker language review, recorded audio,
a measured human playtest, a rebuilt WebGL host containing the flight view, a full hosted play test.

## 4. Decisions

- `docs/play/judges.html` was regenerated although it is outside the owned paths, because the hosted site serves it and it carried the old "hosting is not set up" text. Merging a change under `docs/play/` makes Render redeploy and drop rooms (`HOSTING.md` 2): merge when nobody is playing.
- The Core tests were run with `DOTNET_ROLL_FORWARD=Major` (no files changed).
- The committed WebGL host is described as older than the flight view because of the git history above; the build itself was not opened to confirm which screens it contains.

## 5. Statements that depend on pull requests still open

T024 (end screens), T035 (host UI polish), T050 (D-102 viewer fix) and T048 (hosted smoke evidence). If they merge before submission, update:
`submission/PROJECT_DESCRIPTION.md` sections 2, 4, 8, 9; `submission/CHECKLIST.md` section 0, item 5; `JUDGES.md` "Known limitations"; the host-screen row of `README.md`; `RELEASE.md` 5.3 (flight row).
