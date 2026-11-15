# MissionForge: one page for judges

**Team Winton**, NASA Space Apps Challenge 2026.

**How to play:** the full explanation of the game is in `GUIDE.md` and on the [How MissionForge works](https://missionforge-spaceapps.onrender.com/play/guide.html) page. The web page was regenerated from `GUIDE.md` on 2026-11-15 (T062), so both carry the same text, including the "Built versus planned" table.

MissionForge is a cooperative party game for 1 to 10 players who act as a space agency: they vote on every part of a rocket and spacecraft under a money and schedule budget, then fly the mission live. One big screen shows the mission; every phone is a mission-control console and a minigame controller. Mass, power, budget, instruments, orbit and communications each decide whether the mission works, and real spaceflight facts sit inside the mechanics.

## Try it

- **Hosted:** [https://missionforge-spaceapps.onrender.com/play/](https://missionforge-spaceapps.onrender.com/play/): press **Host a mission** on a laptop (desktop Chrome or Chromium), then **New mission**, and join from a phone by scanning the QR code. No install, account or shared Wi-Fi needed. The site runs on a free instance that **sleeps after 15 minutes without visitors; the first page can take about a minute to load**. The hosted big screen is the Unity host rebuilt from `main` on 2026-11-15 (task T055): lobby, mission briefing and contract vote with the real contract data, the Build Bay, countdown, flight view with live telemetry and the big-screen debrief (the Flight Readiness Review panel was empty in T055's first run, and the orbit map was not reported from it). In T055's run of the hosted service on a local machine with three phones, a room went from the lobby through the briefing, contract vote, all 22 part votes, countdown and flight to the debrief with the real score; the public URL itself has not yet been played through with the rebuilt host (see Known limitations). To see the whole phone game without a server, open the scripted session below.
- **Locally, one command** (Node 20+, Windows or macOS): `npm --prefix tools/demo install`, then `npm --prefix tools/demo run demo`. It prints the big-screen URL, the phone URL and a QR code. Phones on the same Wi-Fi join with the code shown on the big screen; no app, account or chat.
- **No network:** `/play/client/?mock=1` runs a scripted phone session without a server.
- **Demo videos:** `submission/video/missionforge-demo-2min.mp4` (2:00) and `missionforge-demo-30s.mp4`, with English and Arabic subtitles. The phone footage is the real client in its scripted demo session; the big-screen images are stills (`submission/video/README.md` lists what is scripted).

## How a session flows (25 to 40 minutes)

Lobby and room code, briefing for contract C1 Earth Watch (a 150 kg observation satellite in a 550 km Sun-synchronous orbit, 90 M game-dollar budget), 22 part votes with stats and drawbacks, a GO/NO-GO review, the flight with minigames at critical moments, then a debrief with score, facts and the assumptions behind the numbers. The audience joins by QR and sees its own "Audience says" bar; the host lobby has an "Audience counts as one player" switch (off by default, so the audience is advisory unless the host turns it on). The big screen shows the briefing, contract vote, Build Bay with the readiness dashboard, Flight Readiness Review, countdown, flight view (ascent and orbit map) and debrief (T055's live run covered all of these except a working FRR panel and the orbit map), while the votes, GO/NO-GO poll and minigames are played on the phones; the scripted `?mock=1` phone session shows the phone side without a server. The big-screen test stand and design review, and the campaign hub, codex and settings screens, are also in the host, but the Build Bay does not open the test stand or design review by itself.

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

- **Hosting:** the pages of the hosted site answered with HTTP 200 on 2026-11-15. The hosted smoke test (T048, run on a local copy of the hosted service) passed the judge path (entry page, Unity host, New mission, three phones join) and played a full C1 session to the debrief with a scripted stand-in host; the real Unity host was not played to the debrief, and real Render was not part of that test (`orchestration/evidence/T048/RESULTS.md`). What T058 saw on the public URL (with the earlier host build) is in `orchestration/evidence/T058/live/LIVE_CHECK.md`. The rebuilt host (T055) was played from the lobby to the debrief with three phones on a local copy of the hosted service (`orchestration/evidence/T055/`); it has not been played through on the public URL. If the hosted site is slow or down, use the one-command local run above. The free instance drops every room when it restarts or redeploys.
- **Big screen:** the Unity host on `main` has 15 of its 16 screens: Title, Lobby, Mission Briefing, Contract Vote, Build Bay, Test Stand, Design Review, Flight Readiness Review, Countdown, Flight, Orbit Map, Debrief, Campaign Hub, Codex and Settings. The minigame overlay has no screen of its own (the flight view shows a minigame banner and slows time; the minigames run on the phones). The committed WebGL build, and so the hosted site, was rebuilt from `main` by T055, so it should contain all fifteen; its live run covered the screens below. In T055's live run (local copy of the hosted service, three phones) the briefing, contract vote, 22 Build Bay votes, countdown, flight and debrief showed real data and the characters ≈, ₂, ×, ±, ° rendered (they were missing boxes before); in that first run the Flight Readiness Review showed an empty panel, because the Build Bay did not yet hand its build to it (a fix, the "Build Bay hook", was added to T055 afterwards; whether the merged build has it is recorded in `orchestration/evidence/T055/`). The test stand, design review, campaign hub, codex and settings screens were checked in development builds with rehearsal data (T027, T024), not in that run. The Build Bay does not yet open the Test Stand or Design Review by itself, and it builds C1 Earth Watch whatever contract wins the vote. Test status (T058, before the pre-flight translations of T057 were merged): the phone client's translation-parity tests failed (5 of 927) and `node tools/validate-data.mjs --strict` failed, because `data/strings/en.host_preflight.json` was English only; T057 (#239) added the five translations, and these two checks have not been re-run since.
- The flight view ran at a median 59.9 fps in Chrome at 1920x1080 on an Apple M4 Mac in its own test build; the earlier committed host was otherwise loaded in headless Chromium with software rendering. The frame rate of the rebuilt host, and on a typical Windows laptop, has not been measured.
- A session is planned at 25 to 40 minutes; this is the design estimate, not a measured playtest with six people. The 22 C1 part votes alone take about 17 minutes at the lobby's default timers (46 s a round) or about 8 minutes at the shortest timers (inspect 5 s, vote 10 s: 21 s a round; the rebuilt hosted lobby offers them, the earlier hosted build's shortest vote timer was 20 s), before animation and runoffs.
- Costs, schedules, reliabilities and boost sizes are game values, not real figures; balance has been checked by a script, not by a large human playtest.
- The room server keeps rooms in memory only: restarting it loses every room (by design: no accounts, no stored data).
- Audio is limited: no recordings are bundled.
