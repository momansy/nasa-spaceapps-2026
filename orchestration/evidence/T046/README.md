# T046 evidence: final docs refresh before submission

Date: 2026-11-15. Machine: Apple-silicon Mac (macOS, arm64). Repository `main` at `568ee98` (after T042 to T045, T047, T049, T051, the
T016 flight view, the T034 environment pass, T035 host UI polish #195 and T024 end screens #204 were merged). A first run of this task on `fe5a724` was lost in a worker restart; this is the redo on current `main`. The brief asked for a recount of everything the docs state, then edits.

## 1. What was measured, and how

| Item | Result | How |
|---|---|---|
| Core tests | **568 of 568 passed** | `DOTNET_ROLL_FORWARD=Major dotnet test core/dotnet~` (only .NET 9 and 10 runtimes are installed; the project targets `net8.0`, see `core/README.md`) |
| Server tests | **247 of 247** (17 files) | `npm test` in `server/` |
| Phone client tests | **911 of 916** (47 files, 46 passing). The 5 failures are `src/i18n/parity.test.ts` for ar, es, fr, pt, hi: 357 keys of `data/strings/en.host_end.json` (T024) have no translation. Fix queued as #206 | `npx vitest run` in `client/` |
| Demo tools tests | 7 of 7 | `npm --prefix tools/demo test` |
| E2E tool tests | 5 of 5 (T044 reported 3) | `npm --prefix tools/e2e test` |
| Protocol check | 105 message types, 107 valid examples, 528 mutated examples rejected | `node protocol/check.mjs` |
| Data validation | `node tools/validate-data.mjs`: PASS, 0 errors, 1789 warnings. `--strict`: **FAIL**, 1785 errors (the missing `ui.host.*` translations) and 4 warnings | `node tools/validate-data.mjs [--strict]` |
| Contracts | 9 (C0 to C8) | `data/contracts.json` |
| Roles | 10 | `data/roles.json` |
| Minigames | 32 defined in `data/minigames.json`; 32 folders in `client/src/minigames/` (includes MG-08b and MG-10a) | file counts |
| Facts | 40 | `data/facts.json` |
| Part categories and part entries | 26 categories, **102** parts (summing each file's `parts` array) | `data/parts/*.json` |
| Tests / anomalies / boosts / achievements | 10 / 12 / 11 / 12 | `data/*.json` |
| Languages | 6: en, ar, es, fr, hi, pt (`data/strings/`, `client/src/i18n/strings/`) | file listing |
| 3D part models for the phone viewer | 149 `.glb` files | `client/public/models/` |
| Host scenes with working content (10 of 16) | `MF_Title`, `MF_Lobby`, `MF_BuildBay`, `MF_Countdown`, `MF_Flight`, `MF_OrbitMap`, `MF_Debrief`, `MF_CampaignHub`, `MF_Codex`, `MF_Settings`. Each scene file references its controller script (`TitleScreen`, `LobbyScreen`, `BuildBayScreen`, `CountdownScreen`, `FlightScreen`, `OrbitMapScreen`, `DebriefScreen`, `CampaignHubScreen`, `CodexScreen`, `SettingsScreen`); the last four were matched by the script GUID in the `.unity` file | scene and script listing, `.meta` GUIDs |
| Host scenes that are layout placeholders (`RegionScreen`) | `MF_Briefing`, `MF_ContractVote`, `MF_TestStand`, `MF_DesignReview`, `MF_FlightReadinessReview`, `MF_MinigameOverlay` (6 to 9 kB each, only navigation buttons) | scene sizes, `RegionScreen.cs` |
| Lobby judging-day controls (T035) | Inspect timer, audience-as-one-player, 10 s vote timer in `LobbyScreen.cs` / `Lobby.uxml`; T035 rubric scores: Lobby controls 4, Build Bay layout 4, accessibility modes 3, polish 3 | `orchestration/evidence/T035/RUBRIC.md` and code. Unity was not run by this task |
| Unity EditMode (reported by T024, not re-run) | 436 of 437 passed, 1 pre-existing skip | `orchestration/evidence/T024/tests.txt` |
| Age of the committed WebGL host | last commit touching `docs/play/host/Build` is `9cf9dfb` (2026-11-15 06:32 +03:00, T040); T034 rework 2 (`4efbe75`, 08:57) and T016 (`68d1483`, 10:14), T035 (`f4a4fda`, 11:08) and T024 (`8744725`) were merged after it | `git log` |
| Hosted site | `/healthz` 200; `/` 302 to `/play/`; `/play/`, `/play/host/`, `/play/client/`, `/play/client/?mock=1`, `/play/judges.html`, `/play/credits.html` all 200; `host.wasm.unityweb` `content-encoding: gzip`, `content-type: application/wasm` (with `Accept-Encoding: gzip`); WebSocket `hello` returned `hello.ok` | `curl`, a Node `WebSocket` one-liner |
| Netlify site | `https://nasasc.netlify.app/play/` and `/play/judges.html` still HTTP 404 | `curl` |
| Repository | `PUBLIC`; `LICENSE` is MIT (GitHub shows the licence as "Other") | `gh repo view`, `LICENSE` |

**Not run:** the Unity EditMode tests and any Unity build (no Unity editor was used); the Playwright suites; a full hosted play test (host plus phones through the public URL).
The first Core test run without `DOTNET_ROLL_FORWARD` aborted with the known ".NET 8 runtime not found" error, as documented.

## 2. What changed

| File | Change |
|---|---|
| `submission/PROJECT_DESCRIPTION.md` | Status line and commit; flight view, countdown and orbit map now described as in the source but not in the committed WebGL build; hosted URL (Render) replaces the Netlify paragraph; technology table (engines and materials, hosting, entity counts); verification block replaced with this run's numbers; accessibility (T043 axe results, subtitled videos); section 8 limits rewritten (10 of 16 host screens, end screens from rehearsal fixtures, T035 polish scores, old WebGL build, partly tested hosting, D-102); sections 2, 4, 5 and 9 updated for T024 and T035; the verification block states the 5 client failures and the strict-validation failure |
| `submission/CHECKLIST.md` | Section 0 now lists what is done (repository public, MIT licence, hosting live, videos made) and what remains owner-only; form rows for video, live link, source, licence, images; section 3 hosted-URL table (Render chosen); section 4 ticks the done items and keeps the owner-only steps |
| `submission/AI_DISCLOSURE.md` | Test counts: Core 568, client 911 of 916 (5 parity failures stated), server 247 |
| `submission/NASA_RESOURCES.md` | Mission Viz row: orbit map screen exists in the source (T016) but not in the committed build |
| `submission/DEMO_VIDEO_SCRIPT.md` | Status note: the two cuts exist; "not built" list corrected for the flight view |
| `JUDGES.md` | Hosted URL is the Render site (sleep warning, earlier-build warning); demo videos line; MIT licence; known limitations rewritten (10 of 16 host screens, audience control now in the source, failing strict validation and parity tests) |
| `README.md` | New "MissionForge at a glance" block with the counts above, play links and the host-screen status; Agent Mesh text unchanged |
| `RELEASE.md` | Status paragraph (hosting live, not fully verified), WebGL host age, phone client rebuild note, file size (33 MB data file), gzip check, flight-view and debrief note in the runbook, sections 6.2 and 6.3 marked done (6.3 = T035 lobby controls, in the source only) |
| `HOSTING.md` | Status paragraph (deployed, what was and was not verified, committed host predates flight view and end screens); section 2 retitled as the record of human steps |
| `docs/play/judges.html` | Regenerated from `JUDGES.md` with `node tools/demo/build-credits.mjs` (outside the brief's owned paths; see Decisions). `docs/play/credits.html` was regenerated too but reverted, because the regeneration changed only line endings and a few lines this task does not own |

## 3. Planned versus built

Moved from "planned" to "built (in the source on main)": countdown, flight view and orbit map host screens (T016); big-screen Debrief (with replay and investigation),
Campaign Hub, Codex and Settings screens (T024); host UI polish and the Lobby inspect-timer and audience-as-one-player controls (T035); phone accessibility audit (T043);
host keepalive (T040); hosting (deployed); MIT licence; demo videos with subtitles; 11 remade engines and PBR materials (T032); Build Bay environment pass (T034).
Kept as "planned" or "placeholder": big-screen briefing, contract vote, test stand, design review, flight readiness review and minigame overlay (T027), the 200 % text plus right-to-left
polish the T035 rubric still scores 3, debrief tagging of physical/approximate/game values, native-speaker language review, recorded audio,
a measured human playtest, a rebuilt WebGL host containing the flight view and end screens, a full hosted play test, and the five non-English translations of `en.host_end.json` (#206).

## 4. Decisions

- `docs/play/judges.html` was regenerated although it is outside the owned paths, because the hosted site serves it and it carried the old "hosting is not set up" text. Merging a change under `docs/play/` makes Render redeploy and drop rooms (`HOSTING.md` 2): merge when nobody is playing.
- The Core tests were run with `DOTNET_ROLL_FORWARD=Major` (no files changed).
- The committed WebGL host is described as older than the flight view and end screens because of the git history above; the build itself was not opened to confirm which screens it contains.
- The branch held a commit from the lost first run, based on an older `main`. Rather than switch branches, `origin/main` was merged into it; for the five files that conflicted (`HOSTING.md`, `JUDGES.md`, `docs/play/judges.html`, `submission/CHECKLIST.md`, `submission/PROJECT_DESCRIPTION.md`) `main`'s text was taken and the first run's edits were re-applied on top, then updated for T024 and T035.
- The failing parity tests and `--strict` validation are reported as failing, not worked around; translating `en.host_end.json` is outside this task's paths (#206).
- `GUIDE.md` (T051, not owned here) is linked from `README.md` and `JUDGES.md`; its own content was not audited by this task.

## 5. Statements that depend on pull requests still open

T050 (D-102 phone viewer fix) and T048 (hosted smoke evidence), plus #206 (translations). If they merge before submission, update:
`submission/PROJECT_DESCRIPTION.md` sections 2 (verification block), 8; `submission/CHECKLIST.md` section 0 items 5 and 6; `JUDGES.md` "Known limitations"; the client-test row of `README.md`; `submission/AI_DISCLOSURE.md` (test counts); `RELEASE.md` 5.3 (flight row).
Also if the WebGL host is rebuilt: `README.md`, `JUDGES.md`, `HOSTING.md` status, `RELEASE.md` section 1 table, `PROJECT_DESCRIPTION.md` sections 2, 4, 8.
