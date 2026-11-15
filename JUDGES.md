# MissionForge: one page for judges

**Team Winton**, NASA Space Apps Challenge 2026.

MissionForge is a cooperative party game for 1 to 10 players who act as a space agency: they vote on every part of a rocket and spacecraft under a money and schedule budget, then fly the mission live. One big screen shows the mission; every phone is a mission-control console and a minigame controller. Mass, power, budget, instruments, orbit and communications each decide whether the mission works, and real spaceflight facts sit inside the mechanics.

## Try it

- **Hosted:** [https://nasasc.netlify.app/play/](https://nasasc.netlify.app/play/) (static pages only: entry, credits and judges). The game itself needs a room server, so use the one-command local run below for play. The `/play/` pages appear once the Netlify site is redeployed from `main`.
- **Locally, one command** (Node 20+, Windows or macOS): `npm --prefix tools/demo install`, then `npm --prefix tools/demo run demo`. It prints the big-screen URL, the phone URL and a QR code. Phones on the same Wi-Fi join with the code shown on the big screen; no app, account or chat.
- **No network:** `/play/client/?mock=1` runs a scripted phone session without a server.

## How a session flows (25 to 40 minutes)

Lobby and room code, briefing for contract C1 Earth Watch (a 150 kg observation satellite in a 550 km Sun-synchronous orbit, 90 M game-dollar budget), 22 part votes with stats and drawbacks, a GO/NO-GO review, the flight with minigames at critical moments, then a debrief with score, facts and the assumptions behind the numbers. The audience joins by QR and sees its own "Audience says" bar (making it count as one vote is a protocol setting that the host lobby does not expose yet).

## Challenge alignment

| Challenge emphasis | Where it lives |
|---|---|
| Mass | Dashboard delta-v and thrust-to-weight, tank sizing, materials |
| Power | Payload power balance, eclipse and solar-wing minigames (MG-18, MG-15) |
| Budget | Part costs, tests, anomalies, efficiency scoring |
| Instruments | Payload Bay choices, science capture (MG-21), data multiplier |
| Orbit | Launch site and inclination, contracts, flight-dynamics console |
| Communication | Comms parts, ground passes (MG-13), blackout, light-time delay |
| Meaningful decisions | Voting with stats and drawbacks, design reviews, Predict before vote |
| Education | Facts inside mechanics, Codex, debrief comparisons |

## Physics versus game simplification

Equations and constants are in `GAME_DESIGN.md` 8.1 and 8.2. Every simplification (2D orbital plane, one exponential atmosphere, no Earth oblateness, probability rolls for failures, game-scaled costs and schedules) is listed in 8.3 and shown in the in-game Codex. Every number is tagged **physical**, **real-world approximate** or **game value** in the assumptions register (`GAME_DESIGN.md` 19) and in the `value_types` of each data entry.

## Facts and AI use

The 40 facts shown to players were checked against their cited sources (task T025, `orchestration/evidence/T025/fact-sources.md`); each carries a source URL, listed with access dates on the [credits page](docs/play/credits.html). **The code, data and documents were written by AI coding agents (OpenAI Codex, Anthropic Claude Code) under human direction; the images were generated with Higgsfield (GPT Image 2.6) and the briefing video with Google Gemini.** Details, licences and third-party credits are on the credits page. Not affiliated with or endorsed by NASA.

## Repository map

| Path | What |
|---|---|
| `GAME_DESIGN.md` | The specification |
| `core/` | C# rules and simulation (deterministic from a seed), with tests |
| `unity/MissionForge/` | The big-screen host (Unity 6, WebGL build in `docs/play/host/`) |
| `server/`, `client/`, `protocol/` | Room server, phone web app, message definitions |
| `data/`, `tools/` | Game content as JSON, validators, balance search, demo tools |
| `RELEASE.md`, `orchestration/` | Release and judging-day runbook; task briefs and evidence |

## Known limitations

- The hosted URL and hosting are not set up; the Unity host needs a server that sends `Content-Encoding: gzip` for its `.unityweb` files (see `RELEASE.md`).
- The Unity host was loaded and connected in headless Chromium with software rendering; frame rate on a real laptop has not been measured by this task.
- A full session is about 35 minutes with the shortest timers the host lobby offers (22 part votes of about 54 s each); this is an estimate from the timers, not a measured playtest with six people.
- Costs, schedules, reliabilities and boost sizes are game values, not real figures; balance has been checked by a script, not by a large human playtest.
- The room server keeps rooms in memory only: restarting it loses every room (by design: no accounts, no stored data).
- Audio is limited: no recordings are bundled.
