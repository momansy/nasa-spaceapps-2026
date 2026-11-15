# T036 end-to-end playtest, round 2: results

Checkout: `main` at commit `10be4f4` (branch `agentmesh/momansy-claude/issue-125`), Windows 11 on an
AMD Ryzen AI 9 HX 370, 32 GB RAM, Node 24.16, Playwright 1.65.1 (`ENVIRONMENT.json`). Real room server,
real built phone client, 390 × 844 Chromium phones (touch, DPR 2), seed `2801`, scripted ("stub") host.
Numeric preview values the stub host sends are **fixture (not Core)** game values, not a physical model.
Unity host: reached in the judge-path run only, in headless software GL (see section 6).
All paths below are relative to `orchestration/evidence/T036/`.

**Headline.** C1 Earth Watch runs from lobby to debrief at 1, 3, 6 and 10 phones (every segment reaches the next one, with the two exceptions in section 2 for the canonical 10-phone run;
0 invalid frames, 0 protocol errors, 0 sequence gaps, 0 browser console or page errors). All 25 implemented
minigames load and run on the real phone client, report `mg.result`, and show the own result and the shared
result screen. D-001 and D-002 are fixed; D-003 is still present (marginal); D-004 has changed (the Unity
host now loads and creates a room). Three open defects are in `DEFECTS.md` (D-101 to D-103).
The 10-phone run has harness failures (screenshot timeouts, D-102) but still reaches debrief.

## 1. Runs

| Players | Spectators | Run id | Harness failures | Notes |
|---:|---:|---|---:|---|
| 1 | 0 | `2026-11-14T23-32-00-790Z-stub-p1-s2801` | 0 | + 1 pending late joiner |
| 3 | 0 | `2026-11-14T23-32-00-790Z-stub-p3-s2801` | 0 | |
| 6 | 2 | `2026-11-14T23-32-00-790Z-stub-p6-s2801` | 0 | |
| 10 | 2 | `2026-11-14T23-32-00-790Z-stub-p10-s2801` | 2 | phone 1 screenshot timeouts at part votes 1 and 3 (D-102); CPU throttle ×4 on phone 10 |
| 10 (repeat) | 2 | `2026-11-14T23-58-33-123Z-stub-p10-s2801` | 2 | same two timeouts (summary, metrics, diagnostics only) |
| 10 (diagnostic) | 2 | `2026-11-15T00-06-13-679Z-stub-p10-s2801` | 1 | probe added; page `evaluate` took 12.6 s, 18.7 s, 0.6 s; the viewport-only retry worked for rounds 1 and 3 and also timed out for round 4 |
| 10 (no throttle) | 2 | `2026-11-15T00-14-19-123Z-stub-p10-s2801` | 0 | `E2E_NO_THROTTLE=1`; stalls 16.0 s, 19.1 s, 3.9 s still measured |

Host drop and late join are evidenced in each canonical run's `frames.ndjson` (`HOST_DISCONNECTED` frames, `game.resumed`, a pending player in `room.state`); reload and socket drop in the phone diagnostics `actions`. Every run also covered: the first phone dropping its socket and resuming during a part vote, a second phone
reloading from its session token, a 20 s host drop with explicit resume during BUILD, a late joiner after
BUILD becoming a pending spectator, and (6 and 10 phones) two audience spectators. Aggregate metrics for the
four canonical runs: `c1-1-3-6-10-latest-results.json`; console: `c1-1-3-6-10-console.log`. Screenshots are
kept for the 1-phone and 10-phone canonical runs; the 3-phone, 6-phone and repeat runs keep `run-summary.json`,
`metrics.json` and diagnostics only, to keep the folder small.

## 2. Segment matrix (canonical runs)

| Segment / scenario | 1 | 3 | 6 | 10 | Note |
|---|---|---|---|---|---|
| Lobby, briefing | Pass | Pass | Pass | Pass | |
| Contract vote (C1/C0/C2) | Pass | Pass | Pass | Pass | C1 chosen |
| Part rounds 1–5 | Pass | Pass | Pass | Pass† | veto in round 4, forced tie in round 5 where the count allows |
| TEST, PDR | Pass | Pass | Pass | Pass | |
| FRR round 1 (one NO-GO), round 2 (all GO) | Pass | Pass | Pass | Pass§ | |
| Countdown / MG-07 | Pass | Pass | Pass | Pass | real minigame, results returned |
| F2 / MG-08 | Pass | Pass | Pass | Pass | |
| F3 / MG-09 | Pass | Pass | Pass | Pass | |
| F4 / MG-10a | Pass | Pass | Pass | Pass | |
| F6 / MG-13 | Pass | Pass | Pass | Pass | |
| F8 / MG-15 | Pass | Pass | Pass | Pass | |
| F9 / MG-21 | Pass | Pass | Pass | Pass | |
| Blackout, debrief | Pass | Pass | Pass | Pass | |
| Phone socket drop / resume | Pass | Pass | Pass | Not run‡ | held token, slot and roles retained |
| Phone reload / resume | n/a | Pass | Pass | Pass | |
| Host drop 20 s / resume | Pass | Pass | Pass | Pass | |
| Late join after BUILD | Pass | Pass | Pass | Pass | pending spectator |
| Two audience spectators | n/a | n/a | Pass | Pass | spectators now press JOIN (harness fix) |

§ In the canonical 10-phone run the stalled vote handler also skipped the NO-GO answer, so round 1 was all GO; the NO-GO case ran in the three other 10-phone runs (`poll:1:no_go`).
† In the 10-phone runs with the screenshot stall the votes for rounds 1 and 3 were not cast by phones for up to
30 s because the harness waited on the stalled screenshot; the server still closed the rounds and the session continued.
‡ In the first two 10-phone runs (`…23-32…`, `…23-58…`) the stalled screenshot aborted the vote handler, so the scripted socket
drop did not run (cell: Not run). It ran and passed in the diagnostic (`…00-06…`) and no-throttle (`…00-14…`) 10-phone runs, and in the 1, 3 and 6 phone runs.

Each C1 minigame result count equalled the expected count in every run: MG-07, MG-08, MG-09, MG-10a, MG-13,
MG-15 and MG-21 returned 2/2 (1 phone), 4/4 (3), 7/7 (6) and 10/10 (10). The extra result in the 1, 3 and 6 phone
runs is the pending late joiner, which the stub host counts as a player (harness note H-1).

## 3. Measurements and comparison with T028

Latencies are ms (p50 / p95 / max). Targets (design §17.8): vote round trip < 200 ms, HUD ≤ 5 Hz, console telemetry
≤ 10 Hz, vote tally ≤ 5 Hz, received bandwidth < 50 KiB/s, phone FPS ≥ 30. FPS is the requestAnimationFrame probe
sampled during the minigames (new in round 2: it now measures real minigames, T028 sampled only MG-08);
the 10-phone FPS column averages all 13 pages, including the CPU-throttled phone.

| Players | Vote ack | Next tally | Poll p95 | MG relay p95 | HUD / telemetry / tally max Hz | Max KiB/s | Phone FPS avg / worst 1% low |
|---:|---|---|---:|---:|---|---:|---|
| 1 | 1.7 / 6.9 / 6.9 | 174.3 / 183.5 / 183.5 | 3013.4 | 2.0 | 5 / 10 / 2 | 0.82 | 59.0 / 59.5 |
| 3 | 1.9 / 5.8 / 5.8 | 169.8 / **203.7** / 203.7 | 3200.0 | 1.9 | 5 / 10 / 3 | 4.86 | 50.9 / 20.0 |
| 6 | 2.8 / 5.4 / 10.1 | 120.3 / **201.1** / 201.4 | 3371.9 | 1.5 | 5 / 10 / 3 | 11.48 | 49.0 / 12.0 |
| 10 | 3.8 / 21.1 / 26.2 | 95.1 / 182.1 / 182.1 | 718.1 | 1.4 | 5 / 10 / 3 | 8.70 | 32.7 / 8.6 |
| 10 (repeat) | 3.3 / 11.0 / 14.9 | 96.7 / 196.1 / 196.4 | 746.4 | 1.9 | 5 / 10 / 3 | 8.57 | 40.6 / 8.6 |
| 10 (diagnostic) | 3.3 / 11.4 / 22.3 | 93.4 / **205.5** / 209.6 | 841.9 | 3.4 | 5 / 10 / 2 | 9.47 | 40.8 / 10.0 |
| 10 (no throttle) | 3.9 / 26.6 / 37.1 | 156.4 / 187.9 / 187.9 | 760.2 | 2.2 | 5 / 10 / 2 | 8.37 | 36.8 / 10.0 |

T028 for comparison (older checkout; same harness scenario, no real minigames except MG-08):

| Players | Vote ack | Next tally | Poll p95 | MG relay p95 | Max KiB/s | Phone FPS avg / 1% low |
|---:|---|---|---:|---:|---:|---|
| 1 | 2.1 / 11.1 / 11.1 | 170.7 / 175.4 / 175.4 | 3009.9 | 2.0 | 0.79 | 59.2 / 59.5 |
| 3 | 1.8 / 6.7 / 6.7 | 176.7 / 208.8 / 208.8 | 3206.6 | 1.9 | 4.86 | 59.5 / 59.5 |
| 6 | 2.5 / 9.1 / 12.9 | 132.7 / 204.0 / 209.9 | 3437.0 | 1.9 | 3.75 | 55.8 / 20.0 |
| 10 | 3.5 / 8.9 / 10.0 | 104.2 / 200.2 / 203.3 | 780.3 | 1.9 | 4.53 | 47.0 / 10.0 |

What changed:

- **Vote acknowledgement** still passes with a wide margin (p95 5.4–26.6 ms against 200 ms). The 10-phone p95 is
  higher than in T028 (up to 26.6 ms against 8.9 ms) because 13 pages now run real minigame UIs in one browser.
- **Vote to next tally** is unchanged and marginal: p95 hovers around the 200 ms limit and exceeds it in some runs
  (D-003 still present, see section 4 and D-101). p50 is 93–174 ms.
- **HUD, telemetry and tally rates** meet their limits in every run (5 Hz, 10 Hz, ≤ 3 Hz).
- **Bandwidth** is far below the 50 KiB/s limit. Maximum rose from 3.75–4.86 KiB/s in T028 to 8.4–11.5 KiB/s at 6 and
  10 phones probably because of per-player minigame result and relay traffic (not isolated).
- **Poll p95 (3.0–3.4 s at 1, 3 and 6 phones) is not a latency.** The metric matches the next `poll.answered` after each
  `poll.answer`, and the stub host's pending late joiner is assigned roles but never answers, so the server records a
  `NO_ANSWER` entry after its poll timeout (about 3 s). The answered entries for real players follow within about 0.1 s in the frame log. T028 shows the same
  3.0 s (H-1).
- **Phone FPS**: 59 fps at 1 phone, 49–51 at 3 and 6 phones, 33–41 at 10 phones. The 1% low is 8.6–20 fps at 3 and
  more phones; every individual minigame averaged ≥ 55 fps in the dedicated 3-phone 25-minigame run (section 5).
  The 10-phone average falls with browser contention: the two audience pages ran at 59.5 fps with 9 pages open (6 phones)
  and 28–29 fps with 13 pages open (10 phones), so the drop tracks the number of pages on this one machine, not the screen.

## 4. D-001 to D-004 re-check

| ID | Round 1 | Status now | Evidence |
|---|---|---|---|
| D-001 pre-join `roles.state` violates its schema | Major, server | **Fixed** | `metrics.json` → `errors.schemaViolations` is empty and `frames.invalid` is 0 in all four canonical runs (1,527 / 2,878 / 6,256 / 8,939 frames, all valid) |
| D-002 six C1 minigames not bundled | Major, client | **Fixed** | MG-07, MG-09, MG-10a, MG-13, MG-15 and MG-21 now load and return results (section 2). No sit-outs in any run |
| D-003 vote-to-tally p95 slightly above 200 ms | Minor, server | **Still present (marginal)** | p95 203.7 ms (3 phones), 201.1 ms (6), 205.5 ms (10 diagnostic run); 182.1–196.1 ms in other runs. Registered again as D-101 with the likely cause |
| D-004 WebGL host stuck on `LOADING MISSION CONTROL` | Major, unity | **Changed: no longer reproduced as written** | In headless Chromium with software GL the host reaches the title screen (`runs/2026-11-15T00-35-27-619Z-judge-path/host-45s.png`), "ROOM SERVER: CONNECTED", New mission creates a room with QR and join URL, and a phone joins it (same folder: `host-after-new-mission.png`, `host-with-phone.png`). Speed is 0.1–0.5 fps, so there is still **no GPU or frame-rate result**; see D-103 |

## 5. Minigames through the real phone client (step 4)

Run `2026-11-14T22-44-41-339Z-stub-p3-s2801` (`--segment minigames`, 3 phones, all 25 implemented minigames, in
catalogue order, ids as in `data/`). Each row: the intro screen appeared, the game ran, each phone produced a
`mg.result` and the server relayed it, the phone showed its own result screen, and the shared summary screen
appeared. Input is generic seeded touch, key and button input and is **not** tuned to win, so most scores are low
("Not this time"); the check is load, run, report and show. Screenshots `phone-mg-<id>-{intro,play,own-result,result}.png`
for all 25 are in that run folder; I reviewed all `play` and `own-result` screenshots by eye and found no clipped,
overlapping or unstyled screen.

| Minigame | Title | Type | Duration s | Results / expected | Sit-outs | Intro / play / own result / shared result | Console errors | Phone FPS avg |
|---|---|---|---:|---|---:|---|---:|---:|
| MG-01 | Unit Converter Sprint | PARALLEL_SOLO | 25 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 59 |
| MG-02 | Rocket Equation Balance | PARALLEL_SOLO | 30 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 59 |
| MG-03 | Weld Inspector | PARALLEL_SOLO | 25 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 60 |
| MG-04 | Orientation Check | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 60 |
| MG-05 | Clean Room | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 60 |
| MG-06 | Shake Table | COOP_SPLIT | 30 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 59 |
| MG-07 | Go/No-Go Poll | RELAY | 15 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 58 |
| MG-08b | Propellant Loading | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 57 |
| MG-08 | Max Q Throttle Bucket | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 60 |
| MG-09 | Gravity Turn Tracer | PARALLEL_SOLO | 25 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 58 |
| MG-10a | Staging Timing | TEAM_SYNC | 10 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 58 |
| MG-10 | Fairing Catch | COOP_SPLIT | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 60 |
| MG-11 | Pogo Damper | TEAM_SYNC | 15 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 57 |
| MG-12 | Engine-Out Rebalance | COOP_SPLIT | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 55 |
| MG-13 | Ground Station Pass | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 58 |
| MG-14 | Debris Dodge | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 59 |
| MG-15 | Solar Wing Deploy | COOP_SPLIT | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 57 |
| MG-16 | Station Docking | PARALLEL_SOLO | 40 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 58 |
| MG-17 | Alarm Triage | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 59 |
| MG-18 | Eclipse Power Juggle | PARALLEL_SOLO | 25 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 59 |
| MG-19 | Scrubber Fix | COOP_SPLIT | 35 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 57 |
| MG-20 | Deorbit Burn | PARALLEL_SOLO | 15 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 58 |
| MG-21 | Science Capture | PARALLEL_SOLO | 20 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 59 |
| MG-29 | Predict the Physics (bonus) | PARALLEL_SOLO | 10 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 58 |
| MG-30 | Mission Patch Design (cosmetic) | COOP_SPLIT | 30 | 3 / 3 | 0 | 3/3/3/3 of 3 | 0 | 57 |

All 25 rows: 3/3 phones reached every stage, 0 sit-outs, 0 console or page errors, results 3/3 relayed.

Notes from the 25-minigame run (observations, not defects):

- Untuned generic input still scored a Gold or Platinum tier in some games: MG-20 Deorbit Burn returned "perfect" for all three
  phones (78 %, 77 %, 99 %), MG-30 Mission Patch Design 100 % for all (cosmetic by design), MG-19 Gold, MG-14 Debris Dodge 100 %
  for the phone that did nothing (a safe miss is the right answer there, collision probability 7.9 × 10⁻⁶ against a 1 × 10⁻⁴ threshold).
  MG-20 may be easy for a player who just holds the button once; a balance question for the designer, not a fault.
- C1 minigames also pass inside the full run at all four sizes (section 2).

## 6. New screens (step 5): `seats.mjs`, run `2026-11-14T23-07-41-540Z-seats`

Real phone client, 0 failures, 0 console or page errors.

| Check | Result |
|---|---|
| Pilot seat in the mock (`?mock=1&seat=pilot`) | Pass. Screen shown; throttle drag set 80 %, read back 72 %; altitude HUD updated (240.9 km); stage button present |
| Co-pilot seat in the mock | Pass. Read-only mirror shows pilot throttle and attitude hold; stage button enabled |
| Booster seat in the mock | Pass. Throttle drag set 80 %, read back 72 %; altitude 218.9 km |
| Spectator in the mock | Pass. Watch screen, 5 reaction buttons, "1 in the audience" chip, 16 reaction bursts |
| Pilot and co-pilot in a real session (stub host assigns PHONE seats) | Pass. 13 `pilot.input` relays from the pilot phone (53 `pilot.input` and 54 `pilot.hud` frames in the log); throttle 80 % commanded, 71 % read back; HUD altitude 12.8 km; co-pilot action relayed once; all frames schema-valid |
| Spectator with audience reactions in a real session | Pass. Watch screen, 5 buttons; `react.send` 1, `react.audience` 4; no `react.event` was triggered (stub host does not emit one) |
| `?server=` override | Pass. A LAN address (`ws://172.27.32.1:<port>`, the first non-loopback adapter on this machine, which is the WSL virtual adapter rather than the Wi-Fi LAN) and a loopback address connect and reach the lobby; a public host (`ws://example.com:9`) and a garbage value (`not-a-url`) are ignored and the phone falls back to the default server and still joins. Screenshots `server-override-*.png` |

Not covered: the pilot, co-pilot and booster seats against the real Unity host (the Unity host reached only its room lobby, see section 7),
and an override pointing at a second physical device on the Wi-Fi. T028 spectators never joined; that was a harness bug and is fixed.

## 7. Judging-day path (step 6): `npm --prefix tools/demo run demo` and `judge-path.mjs`, run `2026-11-15T00-35-27-619Z-judge-path`

The launcher started the room server and the static host on this machine, health check "hello → hello.ok" passed directly on port
8787 and through the `/ws` proxy on port 8080, and it printed the host URL, the phone URL, the audience URL, the offline mock URL and a QR code
(`demo-launcher.log`). It picked the correct LAN address (10.239.122.192) from five candidates and says how to override it
(`--lan-ip`). All 14 judge-path checks passed:

| Check | Result |
|---|---|
| `GET /play/`, `/play/credits.html`, `/play/judges.html`, `/play/client/`, `?mock=1`, `?watch=1`, `/play/host/` | 200, HTML |
| Entry page renders, links: host, phone, audience, credits, judges, offline demo | Pass, no console errors |
| Entry page on a 390 px phone | Pass, no horizontal scroll |
| Real Unity host page (`/play/host/?server=ws://localhost:8787`), headless Chromium, software GL | Title screen with "ROOM SERVER: CONNECTED" by 45 s at 0.1–0.5 fps. New mission creates a room (code, QR, `http://10.239.122.192:8080/play/client/?room=CODE`). A phone joined through the QR link and the host showed "1 crew joined" |
| Phone joins by typed room code (lower case accepted) | Pass, lobby shown |
| QR link `?room=CODE` | Pass. The code is pre-filled and locked, no typing needed; second phone reaches the lobby |
| Wrong room code | Pass. "No room with that code. Check the host screen." appears under the code tiles; the phone stays on the join screen |

Things a judge could trip over:

1. The host needs a GPU browser. In software GL the host runs at 0.1–0.5 fps and about a minute after the phone joined the host's
   banner changed to "ROOM SERVER: RECONNECTING" (`host-with-phone.png`, D-103). I could not test a GPU host on this machine.
2. The launcher chooses the LAN address itself and lists virtual adapters (VMware, WSL) as alternatives. It chose correctly here; on a laptop with a
   VPN the choice may differ and the QR would then point at an address the phones cannot reach.
3. The hosted Netlify site serves only the static pages (entry, credits, judges), as `JUDGES.md` states; the game needs the local launcher.
4. The audience link has no room code and expects the viewer to type one.

## 8. Harness notes (not product defects)

- **H-1** The stub host treats the pending late joiner as a player: it assigns it roles in `roles.state` and counts it in `mg.start`
  assignments. That adds a `NO_ANSWER` after about 3 s to each FRR poll (hence "Poll p95" ≈ 3 s) and one extra, zero-score result per minigame. A server
  or client defect is not implied, but whether the pending joiner should be a role holder is a host decision.
- **H-2** The judge-path host check read the text of `#mf-status`, which stays "LOADING MISSION CONTROL" in the DOM after the overlay fades out. It
  now also records whether the overlay is visible (`loaderVisible45`).
- **H-3** The late-joiner screenshot is not taken (only phone index 0 takes screenshots); the late joiner's arrival on the watch screen is checked.

Harness changes made in `tools/e2e/` (called out per the brief): real-minigame play (`PhoneDriver.handleMinigame`), spectators now press JOIN,
`--segment minigames` and `--minigames`, `seats.mjs`, `judge-path.mjs` (with the real-host room and phone join), `summarize.mjs`, screenshot diagnostic with a
viewport-only retry, `E2E_NO_THROTTLE=1`, `E2E_EVIDENCE_TASK`. `npm test` in `tools/e2e` passes (3 tests). Code outside `tools/e2e/` is unchanged.

## 9. Not verified

- Unity host performance (fps) and the host's full session: no GPU run was possible; macOS not run.
- Pilot, co-pilot and booster seats against the real Unity host.
- Whether the 10-phone stall (D-102) comes from the client or from 13 pages sharing one browser. Real phones are separate devices.
- Audience reactions reaching the host display (the stub host does not emit `react.event`).
- Real-phone Wi-Fi tests. All phones were emulated Chromium pages on one machine.
- The minigames' difficulty and balance for human players: the input was generic, so scores are not meaningful.

## 10. Reproduce

```sh
cd tools/e2e && npm ci && npx playwright install chromium
E2E_EVIDENCE_TASK=T036 npm run e2e -- --players 1,3,6,10 --seed 2801   # roughly 8-13 min per size, run sequentially
E2E_EVIDENCE_TASK=T036 npm run e2e -- --players 3 --segment minigames --seed 2801
E2E_EVIDENCE_TASK=T036 node seats.mjs
npm --prefix ../demo run demo &                                      # then:
E2E_EVIDENCE_TASK=T036 node judge-path.mjs --phone-base http://<LAN-IP>:8080
node summarize.mjs ../../orchestration/evidence/T036/runs/<runId>...
```
