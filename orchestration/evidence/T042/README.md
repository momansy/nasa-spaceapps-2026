# T042 evidence: NASA Space Apps submission package

Date: 2026-11-15. Worker: `momansy-claude` (Claude Sonnet 5.5). Output: `submission/` (five files).
Checked from the repository checkout at `24e2e7c` plus this branch. Nothing was deployed or submitted.

## Commands run in this task

| Check | Command | Result | Output |
|---|---|---|---|
| Core tests | `dotnet test` in `core/dotnet~` | Passed 567 of 567 | `core-test.txt` |
| Phone client tests | `npx vitest run` in `client/` | 46 files, 912 tests passed | `client-test.txt` |
| Room server tests | `npm test` in `server/` | 16 files, 240 tests passed | `server-test.txt` |
| Data validator | `node tools/validate-data.mjs` | PASS, 0 errors, 4 warnings (unreferenced `dashboard.stability.*` strings) | `validate-data-output.txt` |
| Fact bank | `node orchestration/evidence/T025/check-facts.mjs` | 40 facts, 40 verified, 0 errors | `check-facts-output.txt` |
| Repository visibility | `gh repo view momansy/nasa-spaceapps-2026 --json visibility,licenseInfo` | `PRIVATE`, no licence | not saved |
| Hosted site | `curl` on `https://nasasc.netlify.app/play/`, `/play/judges.html`, `/play/host/Build/host.wasm.unityweb` | HTTP 404 on all three | not saved |
| Official challenge page | fetch of `spaceappschallenge.org/2026/...` | failed (certificate error); the HackAthlone mirror was read instead | n/a |

Not run: Unity, a browser, the demo launcher, the balance search, any new playtest.

## Claims checked and where

| Claim in `submission/` | Checked against | Result |
|---|---|---|
| 1 to 10 players, spectators, join by code or QR, no app or account | `JUDGES.md`; `GAME_DESIGN.md` 3; `orchestration/ARCHITECTURE.md` 5, 7; T036 `RESULTS.md` runs at 1, 3, 6, 10 phones | Confirmed. Runs used a scripted stand-in host |
| C1 Earth Watch: 150 kg, 550 km, 97.6 deg, 90 M, 180 days, 22 votes | `data/contracts.json`; `orchestration/evidence/T015/README.md` ("All 22 C1 votes") | Confirmed |
| 9 contracts C0 to C8 | `data/contracts.json` (9 ids) | Confirmed |
| 102 part entries in 26 categories | Count over `data/parts/*.json` (26 files, 102 entries) | Confirmed by script |
| 10 roles | `data/roles.json` ids | Confirmed |
| 32 minigames defined and present on the phone client | `data/minigames.json` (32 ids); `client/src/minigames/` (32 folders) | Confirmed. T036 exercised 25 of them on the real client (table in `RESULTS.md` section 5); MG-22 to MG-28 landed in T022 (commit `4c05610`) after the T036 checkout, with screenshots in `orchestration/evidence/T022/` but no multi-phone run |
| Six languages, Arabic right-to-left | `data/strings/` prefixes `ar en es fr hi pt`; `client/src/i18n/strings`; T015 and T030 RTL screenshots | Confirmed that the files and screenshots exist; translation quality not reviewed |
| Text scale 200 %, high contrast, reduced motion, ARIA, Relaxed and One-Button modes | Greps in `client/src` (reduced-motion in `theme/base.css` and `state/store.ts`; high-contrast in `SettingsSheet.tsx`; `oneButton` in minigames); T015, T030 screenshots; `client/src/minigames/MG-22/README.md` | Present in code. No recorded screen-reader test |
| Part cards show stats and drawbacks, Veto, Vote | `orchestration/evidence/T036/runs/.../phone-part-vote-2.png` (viewed) | Confirmed |
| "Predict before vote" exists | `client/src/screens/vote/VoteScreen.tsx` mentions predict; debrief strings list "Correct predictions" | Present in code; not seen on a screenshot |
| GO/NO-GO Flight Readiness Review on phones | T036 `phone-frr-1.png` (viewed); segment matrix in `RESULTS.md` | Confirmed |
| Debrief screen on phone | T036 `phone-debrief.png` (viewed) | Exists. Its "A, 7,840 pts" is from the stand-in host (T036 header: "fixture, not Core"), so the video script says not to quote it |
| Unity host: Title, Lobby, Build Bay implemented | `unity/MissionForge/Assets/MissionForge/App/Screens/` (Title, Lobby, Region) and `Screens/BuildBay/`; T015 and T029 screenshots; T036 section 7 | Confirmed |
| Other host screens are placeholders | `Scenes/MF_Briefing.unity`, `MF_Flight.unity`, `MF_Debrief.unity` are about 8.6 KB each next to `MF_BuildBay.unity` at about 35 KB; no `*Screen.cs` for them; briefs T016, T024, T027 in `orchestration/tasks/`; none merged in `git log` | Confirmed by file inspection (the scenes were not opened in Unity) |
| Build Bay WebGL frame rate 59.9 fps | `orchestration/evidence/T015/webgl-fps.json` (macOS, Apple M4, Chrome, rehearsal build) | Confirmed for that machine only |
| Shipped host in software GL: 0.1 to 0.5 fps | T036 `RESULTS.md` section 7 | Confirmed |
| 149 GLB part models | `client/public/models/` count | Confirmed (149 `.glb` plus a README) |
| Balance: every contract has at least 3 architectures and none is dominant | `orchestration/evidence/T012/balance-report.md` summary table (all 9 PASS; search is capped and sampled, stated in the report) | Confirmed; the description says "at least three valid designs", not "all builds" |
| 40 facts, 25 confirmed, 15 corrected, none rejected, 10 re-checked independently | `orchestration/evidence/T025/fact-sources.md` sections 2, 5, 6 | Confirmed |
| Physics list and simplifications | `GAME_DESIGN.md` 8.1 to 8.3 and 19 | Quoted from the design; Core implementation is covered by the 567 passing tests but equations were not re-derived here |
| Core is deterministic from a seed | `orchestration/ARCHITECTURE.md` 3; `core/Runtime/Random` | Design statement; determinism tests exist in Core but were not individually reviewed |
| Image and video provenance | `assets/media/CREDITS.md`, `GENERATION_LOG.json`, `docs/play/credits.html` | Confirmed; 8 stills, 10 credits, one rejected and one lost job |
| Commit trailers: Fable 5.2 (15), Opus 5.5 (36), Sonnet 5.5 (7), plus Codex | `git log --format=%B` trailer count; `assets/media/CREDITS.md` for Codex | Confirmed at this checkout; the Codex model variant is not recorded |
| GMAT was not used | `grep -ri gmat` over the repository finds only the design document (plan) and the other hits are accidental letter matches (`DynamicPressureAndDragMatchHandCalculation` in a Core test, `sigmaT` in `client/src/minigames/MG-14/model.ts`) | Confirmed: no GMAT output exists |
| NASA imagery textures and licences | `unity/MissionForge/THIRD_PARTY.md` | Quoted |
| Challenge requirements and the nine resources | HackAthlone mirror (<https://hackathlone.com/challenges/space-mission-design-game>) read by a fetch subagent; `docs/index.html` section 01 and 11 | Mirror only; official page not readable |
| Submission form fields | none readable | **Unverified**; `CHECKLIST.md` says so |
| Team name Winton, no members | `JUDGES.md`; `tools/demo/team.json` | Confirmed |

## Discrepancies found in existing files (not edited: outside the owned paths)

1. `unity/MissionForge/THIRD_PARTY.md` ends "No AI-generated media is included in this project." The repository does hold
   AI-generated stills and a video under `assets/media/`. The sentence is true only of the Unity asset folders. `AI_DISCLOSURE.md`
   explains this; the team may want to reword the original.
2. `JUDGES.md` and `docs/play/index.html` imply the whole session including a debrief runs from the launcher; the host-side
   briefing, flight and debrief screens are still placeholders (see above). `JUDGES.md` limitations do not say so.
3. `JUDGES.md` says the 40 facts were checked and "each carries a source URL"; confirmed. It also says the Netlify `/play/`
   pages appear after redeploy; on 2026-11-15 they returned 404.
4. The T036 `RESULTS.md` says the 10-phone runs have harness stalls (D-102) and the vote-to-tally p95 is marginal (D-003/D-101).
   These are open defects and are not mentioned in the project description beyond "balance and playtesting are limited".

## Decisions

- The form's fields could not be read, so `CHECKLIST.md` lists the usual ones and labels the list unverified.
- Challenge resources that no work in the repository used (GMAT, Mission Viz, the VR challenge, CSA games) are listed as not used
  or inspiration only, not as used.
- The video script uses only the big-screen screens that exist (title, lobby, Build Bay) and shows flight and debrief on phones.
- The design document's authorship is stated as "not recorded" with a to-do for the team.
