# MissionForge: one page for judges

**Team Winton**, NASA Space Apps Challenge 2026.

**How to play:** the full explanation of the game is in `GUIDE.md` and on the [How MissionForge works](https://missionforge-spaceapps.onrender.com/play/guide.html) page. `GUIDE.md` section 12 was updated to `main` on 2026-11-15 (T058); the web page's "Built versus planned" table is older and still calls the big-screen pre-flight and end screens placeholders, so where they differ, this file, `GUIDE.md` and `submission/PROJECT_DESCRIPTION.md` section 8 are current.

MissionForge is a cooperative party game for 1 to 10 players who act as a space agency: they vote on every part of a rocket and spacecraft under a money and schedule budget, then fly the mission live. One big screen shows the mission; every phone is a mission-control console and a minigame controller. Mass, power, budget, instruments, orbit and communications each decide whether the mission works, and real spaceflight facts sit inside the mechanics.

## Try it

- **Hosted:** [https://missionforge-spaceapps.onrender.com/play/](https://missionforge-spaceapps.onrender.com/play/): press **Host a mission** on a laptop (desktop Chrome or Chromium), then **New mission**, and join from a phone by scanning the QR code. No install, account or shared Wi-Fi needed. The site runs on a free instance that **sleeps after 15 minutes without visitors; the first page can take about a minute to load**. The hosted big screen is an earlier build than the source: its title screen and lobby work, but its briefing and contract vote are placeholder layouts (contract values shown as dashes) that a live room does not get past, so the rest of a session cannot yet be played through the hosted big screen (see Known limitations). To see the whole phone game, open the scripted session below.
- **Locally, one command** (Node 20+, Windows or macOS): `npm --prefix tools/demo install`, then `npm --prefix tools/demo run demo`. It prints the big-screen URL, the phone URL and a QR code. Phones on the same Wi-Fi join with the code shown on the big screen; no app, account or chat.
- **No network:** `/play/client/?mock=1` runs a scripted phone session without a server.
- **Demo videos:** `submission/video/missionforge-demo-2min.mp4` (2:00) and `missionforge-demo-30s.mp4`, with English and Arabic subtitles. The phone footage is the real client in its scripted demo session; the big-screen images are stills (`submission/video/README.md` lists what is scripted).

## How a session flows (25 to 40 minutes)

Lobby and room code, briefing for contract C1 Earth Watch (a 150 kg observation satellite in a 550 km Sun-synchronous orbit, 90 M game-dollar budget), 22 part votes with stats and drawbacks, a GO/NO-GO review, the flight with minigames at critical moments, then a debrief with score, facts and the assumptions behind the numbers. The audience joins by QR and sees its own "Audience says" bar (the host lobby in the Unity source has an "Audience counts as one player" switch; the hosted build predates it, so there the audience is advisory). On the hosted build the big screen runs the title and the lobby only (see Try it); the votes, GO/NO-GO review, minigames, flight and debrief are on the phones, and the scripted `?mock=1` phone session shows them all. Big-screen pre-flight screens (briefing, contract vote, test stand, design review, flight readiness review), a flight view (countdown, ascent, orbit map) and end screens (debrief with replay and investigation, campaign hub, codex, settings) exist in the Unity source on `main` but not in the hosted build.

## Challenge alignment

| Challenge emphasis | Where it lives |
|---|---|
| Mass | Dashboard delta-v and thrust-to-weight, tank sizing, materials |
| Power | Payload power balance, eclipse and solar-wing minigames (MG-18, MG-15) |
| Budget | Part costs, tests, anomalies, efficiency scoring |
| Instruments | Payload Bay choices, science capture (MG-21), data multiplier |
| Orbit | Launch site and inclination, contracts, flight-dynamics console |
| Communication | Comms parts, ground passes (MG-13), blackout, light-time delay |
| Meaningful decisions | Voting with stats and drawbacks, design reviews, Predict before vote (in the rules; the Build Bay does not send it yet) |
| Education | Facts inside mechanics, Codex, debrief comparisons |

## Physics versus game simplification

Equations and constants are in `GAME_DESIGN.md` 8.1 and 8.2. Every simplification (2D orbital plane, one exponential atmosphere, no Earth oblateness, probability rolls for failures, game-scaled costs and schedules) is listed in 8.3 and shown in the in-game Codex. Every number is tagged **physical**, **real-world approximate** or **game value** in the assumptions register (`GAME_DESIGN.md` 19) and in the `value_types` of each data entry.

## Facts and AI use

The 40 facts shown to players were checked against their cited sources (task T025, `orchestration/evidence/T025/fact-sources.md`); each carries a source URL, listed with access dates on the [credits page](docs/play/credits.html). **The code, data and documents were written by AI coding agents (OpenAI Codex, Anthropic Claude Code) under human direction; the images were generated with Higgsfield (GPT Image 2.6) and the briefing video with Google Gemini.** Details, licences and third-party credits are on the credits page. The project is released under the MIT licence (`LICENSE`). Not affiliated with or endorsed by NASA.

## Repository map

| Path | What |
|---|---|
| `GAME_DESIGN.md` | The specification |
| `core/` | C# rules and simulation (deterministic from a seed), with tests |
| `unity/MissionForge/` | The big-screen host (Unity 6, WebGL build in `docs/play/host/`) |
| `server/`, `client/`, `protocol/` | Room server, phone web app, message definitions |
| `data/`, `tools/` | Game content as JSON, validators, balance search, demo tools |
| `RELEASE.md`, `HOSTING.md`, `orchestration/` | Release and judging-day runbook; hosting on Render; task briefs and evidence |

## Known limitations

- **Hosting:** the pages of the hosted site answered with HTTP 200 on 2026-11-15. The hosted smoke test (T048, run on a local copy of the hosted service) passed the judge path (entry page, Unity host, New mission, three phones join) and played a full C1 session to the debrief with a scripted stand-in host; the real Unity host was not played to the debrief, and real Render was not part of that test (`orchestration/evidence/T048/RESULTS.md`). What T058 saw on the public URL is in `orchestration/evidence/T058/live/LIVE_CHECK.md`. If the hosted site is slow or down, use the one-command local run above. The free instance drops every room when it restarts or redeploys.
- **Big screen:** the Unity host on `main` has 15 of its 16 screens: Title, Lobby, Mission Briefing, Contract Vote, Build Bay, Test Stand, Design Review, Flight Readiness Review, Countdown, Flight, Orbit Map, Debrief, Campaign Hub, Codex and Settings. The minigame overlay has no screen of its own (the flight view shows a minigame banner and slows time; the minigames run on the phones). The pre-flight screens (T027) and end screens (T024) were checked in development builds with rehearsal data and, for the contract vote and the review poll, one run against the real room server with scripted phones; no full room session has gone through all of them. The Build Bay does not yet open the Test Stand or Design Review by itself, it builds C1 Earth Watch whatever contract wins the vote, and it does not yet hand its build to the Flight Readiness Review, so a live room on `main` stops at the FRR (the countdown, flight and end screens were shown with rehearsal data). The committed WebGL build, and so the hosted site, was built before all of these except Title, Lobby and Build Bay were merged, so it has only those three, and a live room stops at its placeholder briefing and contract vote before reaching its Build Bay (`submission/presentation/LIVE_DEMO.md` section 0), until it is rebuilt in Unity. Test status: the phone client's translation-parity tests fail (5 of 927) and `node tools/validate-data.mjs --strict` fails, because the new pre-flight host strings (`data/strings/en.host_preflight.json`) are English only (fix queued as task T057; the end-screen translations of issue #206 are merged).
- The flight view ran at a median 59.9 fps in Chrome at 1920x1080 on an Apple M4 Mac in its own test build; the committed host was otherwise loaded in headless Chromium with software rendering. Frame rate on a typical Windows laptop has not been measured.
- A session is planned at 25 to 40 minutes; this is the design estimate, not a measured playtest with six people. The 22 C1 part votes alone take about 17 minutes at the lobby's default timers (46 s a round) or about 8 minutes at the shortest timers on `main` (21 s; the hosted lobby's shortest vote timer is 20 s, which gives 46 s a round), before animation and runoffs.
- Costs, schedules, reliabilities and boost sizes are game values, not real figures; balance has been checked by a script, not by a large human playtest.
- The room server keeps rooms in memory only: restarting it loses every room (by design: no accounts, no stored data).
- Audio is limited: no recordings are bundled.
