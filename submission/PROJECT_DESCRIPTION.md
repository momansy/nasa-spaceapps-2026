# MissionForge: project description

Paste-ready text for the NASA Space Apps Challenge 2026 project page, challenge **Space Mission Design Game**.
Team name on the credits and judges pages: **Winton**. Every claim below was checked against the repository
(see `orchestration/evidence/T042/README.md`). Anything not built yet is marked **planned**.

Status date: 2026-11-15, repository `main` at commit `fe5a724` (docs refresh T046; counts re-measured, `orchestration/evidence/T046/README.md`).
The statements about the big-screen host screens and the hosted site depend on pull requests that were still open when this was written (T024 end screens, T035 host UI polish, T050 phone viewer fix, T048 hosted smoke test); see section 8.

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
- **The build is checked like a real program.** A live dashboard on the big screen shows delta-v and thrust-to-weight, budget and schedule, and a success estimate. Test campaigns, design reviews and a Flight Readiness Review (GO/NO-GO poll) sit between design and launch. Built today: the dashboard, the Build Bay, the phone GO/NO-GO poll and the Core rules for tests and reviews. The matching big-screen Test Stand and Review screens are still placeholder scenes, so they are **planned** (section 8).
- **The mission is flown.** Phones take pilot, co-pilot, booster and console seats. Short minigames
  (32 are implemented on the phone client) turn the real constraints into play: Max Q throttle,
  gravity turn, ground-station pass, solar-wing deploy, eclipse power juggling, science capture and more.
  On the big screen, the Unity project now has a **countdown, flight view and orbit map** (T016: pad at dusk, engine plumes, staging,
  Earth and atmosphere, flight HUD, orbit map) driven by the Core flight model and a minigame host with bullet-time. This is in the source on `main`;
  the committed WebGL build in `docs/play/host/` was made earlier and does not contain it (section 8).
- **A debrief explains the result.** The phone debrief shows score, grade, objectives, awards, facts, lessons and a comparison of your rocket with a real one (real figures are marked approximate). The Codex has a "What the game simplifies" section. A debrief that tags every number as physical, approximate or game value is **planned**; today that tagging is in the data files and `GAME_DESIGN.md` 19. The big-screen debrief is a placeholder scene on `main`, so it is **planned** too.
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
| **Meaningful decisions, no perfect build** | Each vote shows stats and drawbacks; "Predict before vote" quick prediction; design reviews; a balance search (sampled, not exhaustive: up to 300,000 builds per contract) found at least 3 different valid architectures and no dominant one for every contract | `orchestration/evidence/T012/balance-report.md` |
| **Clear display of resources** | Readiness dashboard and budget bar on the big screen, "if chosen" deltas on every option | `GAME_DESIGN.md` 6.3, 14.3; `orchestration/evidence/T015/` screenshots |
| **Team play** | 10 mission-control roles (FLIGHT, BOOSTER, STRUCT, GUIDO, FIDO, EECOM, INCO, PAYLOAD, RETRO, PM), merged automatically when fewer people play; 1 to 10 players plus any number of spectators. This exceeds the challenge's "up to four" | `data/roles.json`, `GAME_DESIGN.md` 3 |
| **Scoring, difficulty, feedback** | Score and grade; assist levels (Cadet, Engineer, Flight Director); debrief timeline and "what happened" feedback; Relaxed and One-Button minigame modes | `data/scoring.json`, `data/assist_levels.json`, `GAME_DESIGN.md` 9.3, 11 |
| **Education** | 40 facts, each with a source URL, shown inside mechanics; a Codex; Predict before vote; debrief comparison of your rocket with a real one, Codex section on simplifications | `data/facts.json`, `orchestration/evidence/T025/fact-sources.md` |

## 4. How to play (judge and demo version)

Full runbook: `RELEASE.md` section 5 and `JUDGES.md`.

1. On a laptop with Node 20 or newer: `npm --prefix tools/demo install`, then `npm --prefix tools/demo run demo`.
   It prints the big-screen URL, the phone URL and a QR code, and starts the room server.
2. Open the big-screen URL in a desktop Chromium or Chrome browser and press **New mission**.
   A 4-letter room code and QR code appear.
3. Phones on the same Wi-Fi scan the QR code (or open the phone URL and type the code). Pick a nickname.
4. Play: lobby, vote on each part, GO/NO-GO review, flight minigames on the phones, phone debrief. (In the committed WebGL host only the title, lobby and Build Bay screens work; the big-screen briefing and debrief are planned, and the countdown, flight and orbit map are in the Unity source but not in that build, see section 8. The 10-second briefing film exists as a video file.)
   A full session is about 35 minutes with the shortest timers (estimate from the timers, not a measured
   six-person playtest).
5. **No network or no server:** open `/play/client/?mock=1` on a phone or laptop for a scripted phone session.

**Hosted:** <https://missionforge-spaceapps.onrender.com/play/> serves the entry page, the Unity host, the phone client and the room
server from one free Render service, so a judge can press **Host a mission** on a laptop and join from a phone with no install
(`HOSTING.md`). On 2026-11-15 `/healthz`, `/play/`, `/play/host/`, `/play/client/`, `/play/judges.html` and `/play/credits.html` all
returned HTTP 200 and the Unity `.wasm.unityweb` file came with `Content-Encoding: gzip`. **A full hosted session (host plus phones
through the public URL) was not run by this task**; that smoke test is T048 and was not merged when this was written. The free instance
sleeps after 15 minutes without traffic and takes about a minute to wake. The older static site `nasasc.netlify.app/play/` still returned HTTP 404 and is not
used. The local launcher above remains the fallback.

## 5. Technology

| Part | Technology | Role |
|---|---|---|
| Big-screen host | Unity 6000.6.9f1, Universal Render Pipeline, UI Toolkit, Cinemachine; WebGL build in `docs/play/host/` | 3D Build Bay with live vehicle assembly from Blender-scripted 3D part models (149 GLB files for the phone viewer; 11 remade engines and a PBR material library), dashboard, timeline, lobby and room QR; countdown, flight view and orbit map (in the source, not in the committed WebGL build). Calls Core for rules |
| Phone client | TypeScript, React 18, Vite, three.js (part viewer) | Join, role cards, part votes, consoles, pilot seats, 32 minigames, codex, debrief, settings. Runs minigames locally and reports compact results |
| Room server | Node 20+, TypeScript, `ws` | Rooms, roles, vote collection and resolution, timers, reconnect (10 min host hold, 3 min phone hold), spectators; also serves the static site on one port for hosting. No accounts, no stored data |
| Core rules | C# (`netstandard2.1`, tested on .NET 8), Newtonsoft.Json | Dashboard, budget and schedule, reliability, tests, anomalies, validation, flight model (RK4 and Kepler), scoring, session state machine, campaign. Deterministic from a seed, no Unity dependency |
| Data | JSON with JSON Schemas; `tools/validate-data.mjs` | 26 part categories (102 part entries), 9 contracts, 10 tests, 12 anomalies, 10 roles, 11 boosts, 32 minigame definitions, 40 facts, 12 achievements, strings in 6 languages |
| Protocol | JSON over WebSocket, JSON Schemas in `protocol/schema/` | One contract for host, server and phones |
| Tools | Node scripts, Playwright | Balance search (`tools/balance~`), end-to-end phone harness (`tools/e2e`), demo launcher (`tools/demo`) |

Verification run for this refresh (2026-11-15, T046, Apple-silicon Mac, `main` `fe5a724`): `DOTNET_ROLL_FORWARD=Major dotnet test core/dotnet~` **568 of 568** passed
(the machine has only the .NET 9 and 10 runtimes; the test project targets `net8.0`, see `core/README.md`);
`npx vitest run` in `client/` **916 of 916** (47 files); `npm test` in `server/` **247 of 247** (17 files);
`npm --prefix tools/demo test` 7 of 7; `npm --prefix tools/e2e test` 5 of 5; `node protocol/check.mjs` agrees on 105 message types;
`node tools/validate-data.mjs` passed with 0 errors and 4 warnings. **Not run here:** the Unity EditMode tests and a Unity build (no Unity
editor was used by this task; the Unity test results are in the evidence folders of the tasks that wrote them) and the Playwright suites.
Earlier runs and logs: `orchestration/evidence/T042/`, `T044/`, `T045/`; counts and commands: `orchestration/evidence/T046/README.md`.

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

- **The Unity host does not yet run the whole session.** On `main` the host has working **Title, Lobby**
  (room creation, QR, joined players), **Build Bay**, **Countdown, Flight and Orbit Map** screens. The briefing, contract vote,
  test stand, design review, flight readiness review and debrief host scenes (and the campaign hub, codex, settings and minigame overlay)
  are still placeholder scenes (briefs T024 end screens and T027 preflight screens are written, not merged). The full
  lobby-to-debrief runs in `orchestration/evidence/T036/` used a **scripted stand-in host** with the real room server and the real phone client.
- **The committed WebGL host (`docs/play/host/`, and so the hosted site) is older than the flight view.** It was built on 2026-11-15
  at about 06:32 (+03:00, T040); the Countdown, Flight and Orbit Map screens (T016) and the last Build Bay environment pass (T034)
  were merged after that. Until the lock holder rebuilds it in Unity, the hosted host shows Title, Lobby and the earlier Build Bay only.
  The flight view was measured in its own WebGL release build: median 59.9 fps in Chrome at 1920x1080 on an Apple M4 Mac
  (`orchestration/evidence/T016/webgl-fps-run-a.json`). In the flight rehearsal the phones' pilot seats are not wired to the flight; rehearsal phones are simulated.
- The WebGL host was otherwise observed in headless Chromium with software rendering (0.1 to 0.5 fps there); the Build Bay rehearsal build ran at a median
  59.9 fps in Chrome on an Apple M4 Mac (`orchestration/evidence/T015/webgl-fps.json`). A frame rate on a
  typical Windows laptop with a GPU has not been measured.
- **Hosting is set up but only partly tested.** The Render site answers on every page above, but a full hosted session with a judge's laptop and phones
  was not run by this task (T048). The free instance sleeps after 15 minutes idle (about 1 minute to wake) and a redeploy drops every room.
- The audience "counts as one vote" mode is in the protocol but the host lobby has no control for it, so
  the audience is advisory.
- A phone-side performance defect (D-102: the 3D part viewer can stall the vote screen on a slow CPU with many phones) was isolated by T047; the fix (T050) was not merged when this was written.
- Balance is checked by a search script and by scripted phones, not by a large human playtest. Minigame
  difficulty for human players is unmeasured.
- No audio recordings are bundled.
- The Higgsfield-generated images and the Gemini video are used under the providers' terms, which the team has not reviewed.

## 9. What is next (planned)

1. Rebuild the WebGL host so the hosted site contains the flight view; finish the remaining Unity host screens: briefing, contract vote,
   test stand, design and flight reviews (T027), debrief and end screens (T024), polish (T035), effects and audio (T023).
2. Measure a full hosted session and a full session on a GPU laptop; run a playtest with six people.
3. Add the lobby controls for audience-as-one-vote and inspect timer.
4. Native-speaker review of the Arabic, Spanish, French, Portuguese and Hindi text.
5. Recorded voice lines with subtitles, and adaptive audio.
6. More contracts played end to end (C2 to C8 are defined and balance-checked; only C1 is rehearsed).
