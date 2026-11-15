# MissionForge: project description

Paste-ready text for the NASA Space Apps Challenge 2026 project page, challenge **Space Mission Design Game**.
Team name on the credits and judges pages: **Winton**. Every claim below was checked against the repository
(see `orchestration/evidence/T042/README.md`). Anything not built yet is marked **planned**.

Status date: 2026-11-15, repository `main` at commit `001652e` (consistency check T058, `orchestration/evidence/T058/FACTS.md`; earlier refresh T046 at `568ee98`).
Merged since T046: the big-screen pre-flight screens (T027), the end-screen translations (issue #206), the hosted smoke test (T048) and the phone viewer fix (T050). Merged after T058: the pre-flight translations (T057, #239). The WebGL host rebuild (T055) was merged (#255) before this text (T062/T062b update, checked against T055's final report on issue #215 and its evidence in `orchestration/evidence/T055/`); see section 8.

---

## 1. Summary (96 words)

MissionForge is a cooperative party game for 1 to 10 players who run a space agency. Phones are the
controls: players vote on each part of a rocket and satellite under a money and schedule budget, then fly the
mission with short minigames. Mass, power, budget, instruments, orbit and communications each decide whether
the mission works. The first contract, Earth Watch, is a 150 kg satellite for a 550 km Sun-synchronous orbit
with a 90 M game-dollar budget. A debrief explains what happened, and the Codex lists what the game simplifies.

## 2. What it does

- **Players join by room code or QR code on their own phones.** No app, account or chat. One big screen
  (the "host") shows the mission; every phone is a role console and a minigame controller.
- **The team designs the mission by voting.** For contract C1 Earth Watch there are 22 part votes
  (launch site, payload bay instruments, satellite power, attitude control, engines, tanks, material,
  fairing, separation, communications and more). Each option card shows its mass, power, cost and risk,
  and its drawbacks, before the vote.
- **The build is checked like a real program.** A live dashboard on the big screen shows delta-v and thrust-to-weight, budget and schedule, and a success estimate. Test campaigns, design reviews and a Flight Readiness Review (GO/NO-GO poll) sit between design and launch. Built today: the dashboard, the Build Bay, the phone GO/NO-GO poll and the Core rules for tests and reviews. The Unity source on `main` now also has big-screen **Mission Briefing, Contract Vote, Test Stand, Design Review and Flight Readiness Review** screens (T027) that run the room's votes and polls through Core; the Build Bay does not yet open the Test Stand or Design Review by itself, and in a live room it does not hand its build to the Flight Readiness Review, whose big-screen panel is then empty (the host operator skips it with PageDown; the GO/NO-GO poll runs on the phones). The screens are in the rebuilt WebGL host (T055; section 8).
- **The mission is flown.** Phones take pilot, co-pilot, booster and console seats. Short minigames
  (32 are implemented on the phone client) turn the real constraints into play: Max Q throttle,
  gravity turn, ground-station pass, solar-wing deploy, eclipse power juggling, science capture and more.
  On the big screen, the Unity project now has a **countdown, flight view and orbit map** (T016: pad at dusk, engine plumes, staging,
  Earth and atmosphere, flight HUD, orbit map) driven by the Core flight model and a minigame host with bullet-time. It is in the
  WebGL host rebuilt from `main` (T055, `docs/play/host/`), where a live room's countdown and flight showed real HUD data (section 8). When the flight simulation ends in a live room, the big screen stays on
  the Flight screen; the host operator advances to the debrief with PageDown.
- **A debrief explains the result.** The phone debrief shows score, grade, objectives, awards, facts, lessons and a comparison of your rocket with a real one (real figures are marked approximate). The Codex has a "What the game simplifies" section. A debrief that tags every number as physical, approximate or game value is **planned**; today that tagging is in the data files and `GAME_DESIGN.md` 19. The Unity source on `main` now also has **big-screen end screens** (T024): a Debrief (score formula count-up, grade, objectives, awards, cited facts, timeline, instant replay and a fail-forward investigation board), a Campaign Hub, a Codex and a Settings and Accessibility overlay, all calculated by Core. They are shown in the evidence builds in `orchestration/evidence/T024/` from rehearsal fixtures. They are in the rebuilt WebGL host (T055), but in a live room the big-screen Debrief **shows sample (fixture) data**, 8,172 pts, grade A and sample crew names, **not the session's result** (T055 run 2: a vehicle that never reached orbit got the same debrief); the Campaign Hub, Codex and Settings were not part of that run (section 8).
- **Nine contracts** are defined in `data/contracts.json`, from the tutorial C0 First Light to C7 Red Landing
  (Mars) and C8 Comeback Kid (booster landing). C1 Earth Watch is the one prepared end to end for demos.

## 3. How it addresses the challenge

The official challenge text (as mirrored by HackAthlone; the spaceappschallenge.org pages could not be
opened by the agent that wrote this file) asks for a game where participants design, manage and simulate a
space mission and manage mass, power, budget, data, communications and time, with a clear display of the
main resources, consequences for each major decision, no single perfect solution, beginner access, optional
team play for up to four, a scoring system, difficulty levels, feedback on why a mission succeeds or fails,
and explanations rather than right/wrong marks.

| Challenge requirement | MissionForge feature | Where to look |
|---|---|---|
| **Mass** | Dashboard shows delta-v (rocket equation) and lift-off thrust-to-weight; tank sizing, structural material and strap-on boosters trade mass against performance; payload overweight is a validation rule | `GAME_DESIGN.md` 6.3, 7.9, 7.10, 8.2; `data/parts/tank_size.json`, `structural_material.json`; `data/validation_rules.json` |
| **Power** | Payload power balance must stay above 0 W for the C1 primary objective; power-system parts; Solar Wing Deploy (MG-15) and Eclipse Power Juggle (MG-18) minigames | `data/contracts.json` (C1 `payload_power_balance_W`), `data/parts/satellite_power.json`, `client/src/minigames/MG-15`, `MG-18` |
| **Budget** | Every part and test has a cost; contract budgets (C1: 90 M game-dollars); anomalies and Emergency Funding; an efficiency component in the score | `data/contracts.json`, `data/tests.json`, `data/anomalies.json`, `data/scoring.json`, `GAME_DESIGN.md` 6.4, 11.3 |
| **Instruments** | Payload Bay instrument choices change science value, mass, power and data volume; Science Capture (MG-21); C1 secondary objective of 10 captured science targets | `data/parts/instrument.json`, `GAME_DESIGN.md` 7.2, `client/src/minigames/MG-21` |
| **Orbit** | Launch site and inclination, contract orbits (C1: 550 km, 97.6 degrees Sun-synchronous), delta-v margin, orbital elements from the flight model | `data/parts/launch_site.json`, `data/contracts.json`, `core/Runtime/Flight/` |
| **Communication** | Communications parts (including a laser link), downlink data volume (C1 secondary objective: 8 GB), Ground Station Pass (MG-13), reentry blackout, Mars light-time delay for C7 | `data/parts/communications.json`, `client/src/minigames/MG-13`, `GAME_DESIGN.md` 7.17 |
| **Data and time** | Data multiplier from instruments, downlink GB, schedule in days with lead times and a deadline (C1: 180 days) | `GAME_DESIGN.md` 6.4, `data/contracts.json` |
| **Meaningful decisions, no perfect build** | Each vote shows stats and drawbacks; "Predict before vote" quick prediction (in the rules and the phone client; the Build Bay does not send it yet); design reviews; a balance search (sampled, not exhaustive: up to 300,000 builds per contract) found at least 3 different valid architectures and no dominant one for every contract | `orchestration/evidence/T012/balance-report.md` |
| **Clear display of resources** | Readiness dashboard and budget bar on the big screen, "if chosen" deltas on every option | `GAME_DESIGN.md` 6.3, 14.3; `orchestration/evidence/T015/` screenshots |
| **Team play** | 10 mission-control roles (FLIGHT, BOOSTER, STRUCT, GUIDO, FIDO, EECOM, INCO, PAYLOAD, RETRO, PM), merged automatically when fewer people play; 1 to 10 players plus any number of spectators. This exceeds the challenge's "up to four" | `data/roles.json`, `GAME_DESIGN.md` 3 |
| **Scoring, difficulty, feedback** | Score and grade; assist levels (Cadet, Engineer, Flight Director); debrief timeline and "what happened" feedback; Relaxed and One-Button minigame modes | `data/scoring.json`, `data/assist_levels.json`, `GAME_DESIGN.md` 9.3, 11 |
| **Education** | 40 facts, each with a source URL, shown inside mechanics; a Codex; Predict before vote (not yet sent by the Build Bay); debrief comparison of your rocket with a real one, Codex section on simplifications | `data/facts.json`, `orchestration/evidence/T025/fact-sources.md` |

## 4. How to play (judge and demo version)

Full runbook: `RELEASE.md` section 5 and `JUDGES.md`.

1. On a laptop with Node 20 or newer: `npm --prefix tools/demo install`, then `npm --prefix tools/demo run demo`.
   It prints the big-screen URL, the phone URL and a QR code, and starts the room server.
2. Open the big-screen URL in a desktop Chromium or Chrome browser and press **New mission**.
   A 4-letter room code and QR code appear.
3. Phones on the same Wi-Fi scan the QR code (or open the phone URL and type the code). Pick a nickname.
4. Play: lobby, briefing and contract vote, vote on each part, GO/NO-GO review, countdown and flight with minigames on the phones, debrief on the big screen and the phones. (The committed WebGL host was rebuilt from `main` by T055; in its live run on a local copy of the hosted service a room went from the lobby through the flight. On the hosted big screen the host operator must press **PageDown** at the Flight Readiness Review, whose panel is empty, and again after the flight ends to reach the debrief; that big-screen debrief shows sample data, not the session's result. See section 8.)
   A session is planned at 25 to 40 minutes (design estimate, not a measured six-person playtest); the 22 C1
   part votes take about 17 minutes at the lobby's default timers (46 s a round) or about 8 minutes at the shortest timers (inspect 5 s, vote 10 s: 21 s a round; the earlier hosted build's shortest vote timer was 20 s).
5. **No network or no server:** open `/play/client/?mock=1` on a phone or laptop for a scripted phone session.

**Hosted:** <https://missionforge-spaceapps.onrender.com/play/> serves the entry page, the Unity host, the phone client and the room
server from one free Render service, so a judge can press **Host a mission** on a laptop and join from a phone with no install
(`HOSTING.md`). On 2026-11-15 `/healthz`, `/play/`, `/play/host/`, `/play/client/`, `/play/judges.html` and `/play/credits.html` all
returned HTTP 200 and the Unity `.wasm.unityweb` file came with `Content-Encoding: gzip`. The hosted smoke test (T048, merged) ran the same service on a local machine: the judge path (entry page, Unity host,
New mission, three phones join) passed, and a full C1 session reached the debrief with a scripted stand-in host, 6 phones and
5 spectators; the real Unity host was not played to the debrief (`orchestration/evidence/T048/RESULTS.md`). What T058 saw on
the public URL (with the earlier host build) is in `orchestration/evidence/T058/live/LIVE_CHECK.md`. The rebuilt Unity host (T055) was then played
with three phones on a local copy of the hosted service from the lobby through the flight, with the FRR and the end of the flight advanced by PageDown
(`orchestration/evidence/T055/`); it has not been played through on the public URL. The free instance
sleeps after 15 minutes without traffic and takes about a minute to wake. The older static site `nasasc.netlify.app/play/` still returned HTTP 404 and is not
used. The local launcher above remains the fallback.

## 5. Technology

| Part | Technology | Role |
|---|---|---|
| Big-screen host | Unity 6000.6.9f1, Universal Render Pipeline, UI Toolkit, Cinemachine; WebGL build in `docs/play/host/` | 3D Build Bay with live vehicle assembly from Blender-scripted 3D part models (149 GLB files for the phone viewer; 11 remade engines and a PBR material library), dashboard, timeline, lobby (with inspect-timer and audience-as-one-player controls) and room QR; briefing, contract vote, test stand, design review, flight readiness review, countdown, flight view, orbit map, debrief, campaign hub, codex and settings screens (all in the WebGL build rebuilt by T055). Calls Core for rules |
| Phone client | TypeScript, React 18, Vite, three.js (part viewer) | Join, role cards, part votes, consoles, pilot seats, 32 minigames, codex, debrief, settings. Runs minigames locally and reports compact results |
| Room server | Node 20+, TypeScript, `ws` | Rooms, roles, vote collection and resolution, timers, reconnect (10 min host hold, 3 min phone hold), spectators; also serves the static site on one port for hosting. No accounts, no stored data |
| Core rules | C# (`netstandard2.1`, tested on .NET 8), Newtonsoft.Json | Dashboard, budget and schedule, reliability, tests, anomalies, validation, flight model (RK4 and Kepler), scoring, session state machine, campaign. Deterministic from a seed, no Unity dependency |
| Data | JSON with JSON Schemas; `tools/validate-data.mjs` | 26 part categories (102 part entries), 9 contracts, 10 tests, 12 anomalies, 10 roles, 11 boosts, 32 minigame definitions, 40 facts, 12 achievements, strings in 6 languages |
| Protocol | JSON over WebSocket, JSON Schemas in `protocol/schema/` | One contract for host, server and phones |
| Tools | Node scripts, Playwright | Balance search (`tools/balance~`), end-to-end phone harness (`tools/e2e`), demo launcher (`tools/demo`) |

Verification re-run for this check (2026-11-15, T058, Windows 11, Node 24, `main` `001652e`; logs in `orchestration/evidence/T058/tests/`):
`npx vitest run` in `client/` **922 of 927** passed (48 files, 47 passing files); the 5 failures are the translation-parity tests, which report the new
pre-flight host strings (`data/strings/en.host_preflight.json`, T027) missing from ar, es, fr, pt and hi (T057, #239, has since added these translations; not re-run; the end-screen
translations of issue #206 are merged); `npm test` in `server/` **247 of 247** (17 files); `node protocol/check.mjs` agrees on 105 message types;
`node tools/validate-data.mjs` passes (0 errors, 994 warnings) but `--strict` **fails** (985 errors, 9 warnings): the errors are the missing
translations of the same pre-flight strings (`ui.host.*`). From the T046 run (Apple-silicon Mac, `568ee98`), not re-run by T058 (no .NET on that machine):
`DOTNET_ROLL_FORWARD=Major dotnet test core/dotnet~` **568 of 568** (the test project targets `net8.0`, see `core/README.md`);
`npm --prefix tools/demo test` 7 of 7; `npm --prefix tools/e2e test` 5 of 5. Unity EditMode: 466 passed, 0 failed, 1 skipped in the T027 run
(`orchestration/evidence/T027/tests.txt`); no Unity editor was used by T046 or T058.
Earlier runs and logs: `orchestration/evidence/T042/`, `T044/`, `T045/`, `T046/README.md`.

## 6. Real physics versus game simplification

The assumptions register is `GAME_DESIGN.md` 19 and every number in the data files carries a `value_types`
tag: **physical**, **real_world_approximate** or **game_value**. The phone Codex lists the game's simplifications; showing the three-way tag next to each number in the debrief is planned.

**Real physics (physical):**
- Standard gravity 9.80665 m/s2, Earth GM 3.986e14 m3/s2, Earth mean radius 6,371 km.
- Inverse-square gravity, drag D = 0.5 x density x v2 x Cd x A, dynamic pressure and Max Q.
- Rocket equation, delta-v = Isp x g0 x ln(m0 / mf), used on the dashboard.
- Thrust and Isp change with altitude (interpolated between sea-level and vacuum values).
- Vis-viva orbital elements, analytic Kepler coasts, RK4 integration at a fixed 1/120 s step for powered and
  atmospheric flight.
- Reentry heating with the Sutton-Graves relation; g-load as non-gravitational acceleration divided by g0.

**Real-world approximate:** engine thrust and Isp (rounded from named hardware classes), propellant densities,
delta-v needs per destination (for example about 9.7 km/s to a 550 km Sun-synchronous orbit including losses),
entry speeds.

**Game simplifications (disclosed in `GAME_DESIGN.md` 8.3 and in the Codex):**
- Flight is in a 2D orbital plane with 3D visuals; inclination is a launch-azimuth choice plus a delta-v penalty.
- One exponential atmosphere (density 1.225 kg/m3 at sea level, scale height about 8.5 km), spherical Earth, no J2.
- Failures are probability rolls at checkpoints, seeded so replays match, not simulated failure physics.
- **All costs, lead times, test durations, reliabilities, boost sizes, tier thresholds and score weights are game values**,
  not real prices or schedules. The build phase compresses years into days.
- Lunar and Mars transfers are simplified to a burn, a coast and an arrival.

## 7. Accessibility and languages

- **Six languages** in the phone client and game data: English, Arabic (right-to-left layout), Spanish, French,
  Portuguese and Hindi (`data/strings/`, `client/src/i18n/strings/`). The facts and part text are translated by
  AI coding agents; a native-speaker review has not been done (see AI_DISCLOSURE.md).
- Text scales to 200 percent, high-contrast mode, reduced motion, screen-reader labels (ARIA) on the phone UI. An automated audit
  (axe-core on 33 phone screens, English and Arabic, default, high contrast and 200 percent text, T043) ended with no critical, serious or moderate
  violations and no touch target under 44 px; contrast of the theme colours was checked (`orchestration/evidence/T043/`). It is an
  automated check, not a test with people.
- Every timing minigame has a Relaxed mode and a One-Button mode (hold can become toggle).
- No free-text chat, no accounts, no trackers. Minigame tiers use fractions so small groups are not punished.
- Screenshots of right-to-left at 200 percent text and high contrast: `orchestration/evidence/T015/10-rtl-200-percent-text-1920x1080.png`,
  `11-high-contrast-1920x1080.png`, `orchestration/evidence/T030/10-*`.
- The two demo videos have English and Arabic subtitles (`submission/video/subtitles/`).
- Not done: subtitles for in-game voice lines (no audio is bundled yet) and a recorded screen-reader test.

## 8. Known limits (what is not finished)

- **The Unity host has not yet run a whole session end to end.** On `main` the host has **Title, Lobby**
  (room creation, QR, joined players, inspect-timer and audience controls), **Mission Briefing, Contract Vote, Build Bay, Test Stand,
  Design Review and Flight Readiness Review** (T027), **Countdown, Flight and Orbit Map** (T016), and **Debrief, Campaign Hub, Codex and
  Settings** (T024): 15 of the 16 host screens. The minigame overlay has no screen of its own (the flight view shows a minigame banner and
  bullet-time). Gaps: the Build Bay does not yet open the Test Stand or Design Review by itself, it builds C1 Earth Watch whatever contract
  wins the Contract Vote. On `main` at `001652e` it did not hand its build to the Flight Readiness Review (`MissionContext.Build` not set; the FRR
  logs "no build to review"). The fix (the "Build Bay hook" of `unity/MissionForge/Assets/MissionForge/Screens/Preflight/README.md`) was
  **not** added in T055, so in a live room on the hosted big screen the FRR shows an empty panel and the host operator skips it with PageDown.
  The pre-flight screens were captured in a Mac development build with a rehearsal driver, plus one run against the real
  room server with four scripted phones (`orchestration/evidence/T027/`, Unity EditMode 466 passed, 1 pre-existing skip); the end screens
  from rehearsal fixtures (`orchestration/evidence/T024/`). The first real room session through the big screen was T055's run of the rebuilt
  WebGL host on a local copy of the hosted service with three phones: briefing and contract vote with real data, 22 Build Bay votes, countdown,
  flight with real HUD data, no host disconnects (EditMode 467 of 467 with the new fonts, as reported on issue #215). Three limitations it
  found remain in the hosted build: (1) the FRR panel is empty (PageDown to skip); (2) when the flight simulation ends, the host stays on the
  Flight screen and does not advance to the debrief by itself (PageDown to advance); (3) the big-screen Debrief shows sample (fixture) data,
  8,172 pts, grade A, sample crew names, not the flown mission. The Test Stand, Design Review, Campaign Hub, Codex and Settings were not part
  of that run.
  The earlier full lobby-to-debrief runs in `orchestration/evidence/T036/` and `T048/` used a **scripted stand-in host** with the real room server and the real phone client.
- **Host UI polish is partial.** The T035 review (`orchestration/evidence/T035/RUBRIC.md`) scored the Lobby controls 4 of 5 and the Build Bay
  layout 4 of 5, but accessibility modes and polish 3 of 5: at 200 % text with right-to-left layout the Build Bay still drops or splits some text.
- **The committed WebGL host (`docs/play/host/`, and so the hosted site) was rebuilt from `main` by T055 on 2026-11-15.** The build it replaced
  (about 06:32 +03:00, T040) had only Title, Lobby and an earlier Build Bay, and a live room stopped at its placeholder briefing. The rebuild adds
  the pre-flight screens (T027), Countdown, Flight and Orbit Map (T016), the end screens (T024), the T034 environment pass and the T035 lobby
  controls, and fixes missing characters (≈, ₂, ×, ±, ° showed as boxes; full IBM Plex Sans font files, used as fallback for glyphs missing from the Oxanium heading font). It is Brotli-compressed
  (`host.data.unityweb` 41.91 MiB). It has not yet been played through on the public URL, and its frame rate has not been measured. In a live
  room the FRR is empty, the host stays on Flight after the flight ends, and the big-screen Debrief shows sample data (see the big-screen bullet above).
  The flight view was measured in its own WebGL release build: median 59.9 fps in Chrome at 1920x1080 on an Apple M4 Mac
  (`orchestration/evidence/T016/webgl-fps-run-a.json`). In the flight rehearsal the phones' pilot seats are not wired to the flight; rehearsal phones are simulated.
- The earlier WebGL host was otherwise observed in headless Chromium with software rendering (0.1 to 0.5 fps there); the Build Bay rehearsal build ran at a median
  59.9 fps in Chrome on an Apple M4 Mac (`orchestration/evidence/T015/webgl-fps.json`). A frame rate on a
  typical Windows laptop with a GPU has not been measured.
- **Hosting is set up but only partly tested.** The Render site answers on every page above. T048 tested the hosted service on a local machine (section 4);
  its open defects are about a server restart mid-session (the phones keep showing "Reconnecting…", D-110; the host stays "reconnecting" until New mission
  is pressed, D-111) and two missing 3D models that fall back (D-112) (`orchestration/evidence/T048/DEFECTS.md`). The free instance sleeps after 15 minutes idle
  (about 1 minute to wake) and a redeploy drops every room.
- **Pre-flight host translations are new.** When T058 checked, the strings of the T027 screens were English only, so `validate-data --strict` and five phone
  translation-parity tests failed (section 5). T057 (#239) has since added Arabic, Spanish, French, Hindi and Portuguese; the two checks were not re-run
  after that. The hosted WebGL build (T055) contains only the English pre-flight strings (`en.host_preflight.json`), so on the big screen these
  screens fall back to English in the other five languages.
- The audience "counts as one vote" mode is a lobby control (T035: "Audience counts as one player", plus an inspect timer of 5 to 60 s and a 10 s vote timer) and is in the rebuilt WebGL host; it is off by default (audience advisory) and has not been tried in a real hosted session.
- A phone-side performance defect (D-102: the 3D part viewer could stall the vote screen on a slow CPU with many phones) was isolated by T047 and fixed by T050 (one shared WebGL renderer for the part viewer, merged).
- Balance is checked by a search script and by scripted phones, not by a large human playtest. Minigame
  difficulty for human players is unmeasured.
- No audio recordings are bundled.
- The Higgsfield-generated images and the Gemini video are used under the providers' terms, which the team has not reviewed.

## 9. What is next (planned)

1. Play the rebuilt host (T055) through on the public URL; connect the Build Bay to the Test Stand,
   Design Review, the Flight Readiness Review (the "Build Bay hook") and the voted contract; advance the host to the debrief when the flight ends and
   show the flown mission's result on the big-screen Debrief instead of sample data; ship the pre-flight translations (T057) in the WebGL build; accessibility polish at 200 % text (T035 follow-up), effects and audio (T023).
2. Measure a full hosted session and a full session on a GPU laptop; run a playtest with six people.
3. Run the audience-as-one-vote and inspect-timer lobby controls in a real hosted session (they are in the rebuilt host, T035 and T055).
4. Native-speaker review of the Arabic, Spanish, French, Portuguese and Hindi text.
5. Recorded voice lines with subtitles, and adaptive audio.
6. More contracts played end to end (C2 to C8 are defined and balance-checked; only C1 is rehearsed).
