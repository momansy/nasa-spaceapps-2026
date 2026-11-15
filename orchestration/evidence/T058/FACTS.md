# T058 fact table: claims that appear in more than one judge-facing document

Checked 2026-11-15, 10:23 to 11:40 UTC, against `data/` and `main` at `001652e`. Sources of truth are named in each row.
"Disagrees" lists the documents that said something else **before** this task; the "Fixed" column says what T058 did.
Documents: J = `JUDGES.md`, G = `GUIDE.md`, R = `README.md`, H = `HOSTING.md`, PD = `submission/PROJECT_DESCRIPTION.md`,
CL = `submission/CHECKLIST.md`, AI = `submission/AI_DISCLOSURE.md`, NR = `submission/NASA_RESOURCES.md`,
DV = `submission/DEMO_VIDEO_SCRIPT.md`, VR = `submission/video/README.md`, deck = `submission/presentation/deck.html` (+ PDF),
PS = `PRESENTER_SCRIPT.md`, LD = `LIVE_DEMO.md`, QA = `QA.md` (all in `submission/presentation/`).
Not owned by T058 (fix listed in `CHANGES.md` instead): `RELEASE.md`, `docs/play/guide.html`, `docs/play/judges.html`.

## A. Game content (from `data/`)

| # | Fact | Value (source) | Tag | Disagrees before T058 |
|---|---|---|---|---|
| A1 | Players | 1 to 10 seated players, plus any number of spectators (`GAME_DESIGN.md` 3, `data/roles.json`) | design | none found |
| A2 | Console roles | 10: FLIGHT, BOOSTER, STRUCT, GUIDO, FIDO, EECOM, INCO, PAYLOAD, RETRO, PM; merged when fewer play (`data/roles.json`) | design | none found |
| A3 | Contracts | 9, C0 First Light to C8 Comeback Kid (`data/contracts.json`) | data | none found |
| A4 | C1 Earth Watch | 150 kg satellite, 550 km, 97.6° Sun-synchronous, Δv need 9.7 km/s, budget 90 M game-dollars, schedule 180 days (`data/contracts.json` C1) | payload/orbit: real_world_approximate; money/days: game_value | none found |
| A5 | C1 objectives | primary: 550 ± 25 km, 97.6 ± 0.2°, payload power balance > 0 W; secondary: ≥ 10 science targets, ≥ 8 GB downlinked, budget remaining ≥ 0 M; stretch: all 15 science targets (`data/contracts.json` C1) | game_value thresholds | none found |
| A6 | Part votes per contract | C0 19, **C1 22**, C2 21, C3 21, C4 23, C5 21, C6 23, C7 20, C8 19 (`votes` arrays) | data | none found |
| A7 | Part catalogue | 26 categories, 102 part entries (`data/parts/`) | data | none found |
| A8 | Minigames | 32 defined (`data/minigames.json`) and 32 implemented on the phone (`client/src/minigames/MG-*`) | data | none found |
| A9 | Facts | 40, each with a source URL (`data/facts.json`); T025: 25 confirmed, 15 corrected | data | none found |
| A10 | Tests / anomalies / boosts / achievements | 10 / 12 / 11 / 12 | data | none found |
| A11 | Assist levels | Cadet ×0.8, Engineer ×1 (default), Flight Director ×1.25 (`data/assist_levels.json`) | game_value | none found |
| A12 | Languages | 6: English, Arabic (right to left), Spanish, French, Portuguese, Hindi (`data/strings/`) | data | none found |

## B. Session length (from code)

| # | Fact | Value (source) | Disagrees before T058 |
|---|---|---|---|
| B1 | Lobby timers | vote 10–60 s (default 20), inspect 5–60 s (default 20) (`unity/.../App/Screens/LobbyScreen.cs` lines 76–80) | RELEASE.md 5 still says the UI's shortest timers are 20 s + 20 s |
| B2 | One part-vote round | Reveal 3 s + Inspect + Vote + Result 3 s (`server/src/votes/rules.ts`); Predict 8 s only if the host asks, and the Build Bay does not (G 5): **46 s at defaults, 21 s at the shortest** | J, PD, QA (and RELEASE.md) used "54 s a round, about 35 minutes with the shortest timers" |
| B3 | Session length | planned 25 to 40 minutes (`GAME_DESIGN.md` 59, 1345: design estimate, never measured in a playtest). C1's 22 votes take about 17 min at defaults and about 8 min at the shortest timers, before animation and runoffs | J, PD, QA (35-minute claim) |

## C. What is built on `main` versus hosted

| # | Fact | Value (source) | Disagrees before T058 |
|---|---|---|---|
| C1 | Big-screen host screens on `main` | 15 of the 16 screens in `App/ScreenCatalog.cs` have a controller: Title, Lobby, Mission Briefing, Contract Vote, Build Bay, Test Stand, Design Review (PDR/CDR), Flight Readiness Review (T027, merged `bd06ad0`), Countdown, Flight, Orbit Map (T016), Debrief, Campaign Hub, Codex, Settings (T024). The Minigame Overlay has no own screen (the flight screen shows a minigame banner and bullet-time) | J, R, PD, CL ("10 of 16", briefing/contract vote/test stand/reviews/FRR "placeholder"); G (also Debrief, Campaign Hub, Codex, Settings "placeholder") |
| C2 | Limits of the T027 screens | evidence from a Mac development build with a rehearsal driver, plus one run against the real room server with 4 scripted phones, where the evidence runner injected the build (`orchestration/evidence/T027/README.md`, `PreflightEvidence.cs` ≈ line 195); the Build Bay does not yet chain into Test Stand or Design Review (hook in `Screens/Preflight/README.md` not added); the Build Bay always builds C1 unless started with `-mfContract` (`BuildBayScreen.cs` line 79), whatever the contract vote chose | none (new) |
| C2b | Live room on `main` stops at the FRR | `BuildBayScreen.Director.cs` ≈ line 127 goes to `GamePhase.Frr` without setting `MissionContext.Build`; `FrrScreen.cs` ≈ lines 61–65 then logs "FRR: no build to review" and returns. So Countdown, Flight, Orbit Map and the end screens are reached only with rehearsal data, not from a live room | J, R, G, PD, QA described the host screens as working without this gap (found by the T058 review; fixed) |
| C3 | Committed WebGL host (`docs/play/host/`) = the hosted big screen | built 2026-11-15 06:32 +03:00 (commit `9cf9dfb`, T040): Title, Lobby, earlier Build Bay. Its briefing and contract vote are placeholder layouts (contract values shown as dashes; T058 live screenshot `live/09-host-briefing.png`), and in the T052 rehearsals "START VOTE" changed nothing, so a live room never reaches its Build Bay (`submission/presentation/LIVE_DEMO.md` 0). The T055 rebuild was not on `main` when checked | J, G, R, PD, CL, DV and deck said "title, lobby and Build Bay" or "3 hosted" without saying a live room stops at the briefing (fixed) |
| C3b | Hosted lobby timers | the hosted build's shortest vote timer is 20 s (LIVE_DEMO 11), so its shortest round is 46 s; the 10 s option is on `main` only | J, PD, QA quoted the `main` shortest (21 s) without saying so (fixed) |
| C3c | Predict before vote | in the rules and the phone client; the Build Bay does not send it (G 5 and 12) | J and PD listed it as a feature without the caveat (fixed) |
| C3d | Audience counts as one player | lobby switch in the Unity source (T035, `LobbyScreen.cs`); not in the hosted build, where the audience is advisory | none |
| C3e | Flight-view frame rate | median 59.9 fps in Chrome at 1920 × 1080 on an Apple M4 Mac in the flight view's own WebGL release build (`orchestration/evidence/T016/webgl-fps-run-a.json`); not measured on a Windows GPU laptop | none |
| C4 | Pilot seats | phone screens exist; the big-screen flight flies on Core's autopilot and ignores them | none |
| C5 | Phone part-viewer stall D-102 | fixed by T050, merged (`d6fc7ba`) | PD 8 ("not merged"), CL 0/5 ("open") |
| C6 | Hosted smoke test T048 | merged (`11214b6`): on a local copy of the hosted service, entry → Unity host → New mission → 3 phones join passed; a full C1 session reached the debrief with a scripted host, 6 phones and 5 spectators; the real Unity host was not played to the debrief (D-113); real Render, Node 22 and `wss://` not tested by T048 | J, PD, CL, H ("T048 not merged") |
| C7 | Host end-screen translations (issue #206) | merged (`8c7d504`, through issue #213 / PR #220) | J, R, PD, CL, AI (still "fails because of #206") |
| C8 | New translation gap | `data/strings/en.host_preflight.json` (T027) is English only, so `validate-data --strict` fails and 5 phone parity tests fail; fix queued as T057 | none (new) |

## D. Test counts (re-run by T058 on Windows 11, Node 24.15, `main` `001652e`; logs in `tests/`)

| # | Suite | Result today | Disagrees before T058 |
|---|---|---|---|
| D1 | Room server `npm test` | **247 of 247** (17 files) | none |
| D2 | Phone client `npx vitest run` | **922 of 927** (48 files, 47 pass); 5 failures = translation parity for `en.host_preflight.json` | J, R, PD, AI ("911 of 916", 47 files, #206) |
| D3 | `node tools/validate-data.mjs` | PASS, 0 errors, 994 warnings | PD (1789 warnings) |
| D4 | `node tools/validate-data.mjs --strict` | FAIL, 985 errors (missing `ui.host.*` pre-flight translations), 9 warnings | PD (1785 errors, host end-screen strings) |
| D5 | `node protocol/check.mjs` | OK, 105 message types | none |
| D6 | Core `dotnet test core/dotnet~` | 568 of 568 at T046 (`568ee98`); **not re-run** (no .NET on this machine) | none |
| D7 | Unity EditMode | 466 passed, 0 failed, 1 skipped (T027, Mac); not re-run | PD (436 of 437 from T024) |

## E. Other shared claims

| # | Fact | Value (source) | Disagrees before T058 |
|---|---|---|---|
| E1 | Hosted URL | <https://missionforge-spaceapps.onrender.com/play/>; free Render instance, sleeps after 15 min idle, about 1 min to wake, a restart drops every room (`HOSTING.md`, `render.yaml`) | none |
| E2 | Licence | MIT (`LICENSE`, `e953569`) | none |
| E3 | Repository visibility | public (CL 0) | H 2 ("the repository is private"; a record of the time of setup) |
| E4 | Team name | Winton | none |
| E5 | AI tools | AI coding agents under human direction: Anthropic Claude Code wrote most of the code, data and documents, OpenAI Codex the art direction and media prompts (`submission/AI_DISCLOSURE.md` 1); images Higgsfield (GPT Image 2.6); 10 s briefing video Google Gemini | none (J names both tools without the split; consistent) |
| E6 | Demo videos | 2:00 and 0:30 cuts, English and Arabic subtitles; phone footage is the real client in its scripted `?mock=1` session; big-screen images are stills | see `CHANGES.md` (presentation kit) |
| E7 | Deck | `submission/presentation/MissionForge-deck.pdf` | see `CHANGES.md` |

## F. Live site

Full write-up: `live/LIVE_CHECK.md` (2026-11-15, 10:25 to 10:49 UTC, headless Chromium with software WebGL; host 1920 × 1080, two phones 390 × 844).

| # | Docs claim | Seen on the public URL | Agrees |
|---|---|---|---|
| F1 | Host a mission → New mission → 4-letter code and QR; phones join from the link | Yes: room FPKJ, QR, code, join link `/play/client/?room=FPKJ`, code prefilled on the phone | yes |
| F2 | 1 to 10 players | Lobby "2 of 10 seats filled", 10 seat cards; Start briefing enabled with 2 (above 10 not tested) | yes |
| F3 | 10 console roles merged when fewer play | 2 phones got 5 consoles each, all 10 roles dealt | yes |
| F4 | 6 languages | phone and host settings list English, Arabic, Spanish, French, Hindi, Portuguese | yes |
| F5 | Hosted lobby timers | vote timer 20 / 30 / 45 / 60 s (no 10 s), assist Cadet / Engineer / Flight Director | yes (C3b) |
| F6 | Hosted big screen: title and lobby work, briefing and contract vote are placeholder layouts, a live room stops there | Briefing and Contract Vote reached with dashes and placeholder text; START VOTE sent nothing; nothing after Contract Vote reached | yes (C3) |
| F7 | Free instance drops rooms on restart | The server restarted at 10:46:42 UTC (same commit) and room FPKJ was lost; phones showed the join screen or "Reconnecting…" (D-110) | yes |
| F8 | Pages answer 200 | `/play/`, `/play/guide.html`, `/play/judges.html`, `/play/credits.html`, `/play/host/`, `/play/client/`, `/healthz` 200; `/` 302 → `/play/`; deployed commit `d6fc7ba` | yes |

Not seen live: contract names, part votes, FRR, flight, debrief and minigames (the hosted host does not get there), more than 2 phones, a real GPU.
Extra findings for the T055 rebuild, not doc problems: design-document section numbers as panel labels ("5.1 CONTRACT", "4.1 VOTE"), titles broken mid-word ("CONTR/ACT", "TIM/ER"), placeholder text in the hosted Settings.
