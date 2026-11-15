# MissionForge end-to-end playtest

This harness starts the real room server, serves the built phone and Unity host assets, proxies
same-origin `/ws`, records and schema-checks every WebSocket frame, and drives real 390 × 844
Chromium phone pages. It writes run evidence to `orchestration/evidence/T028/runs/<runId>/` (set `E2E_EVIDENCE_TASK=T036` to write under another task's evidence folder).

## One-command run

From this directory:

```sh
npm ci
npx playwright install chromium
npm run e2e -- --players 1,3,6,10
```

The command is unattended and uses the stub host by default. It requires Node 20 or newer and the
already-built `server/dist/` and `client/dist/`; build those with `npm run build` in their respective
directories when missing. The run was verified on Windows 11. Paths, process spawning, HTTP serving,
and signal handling use Node APIs and are also intended for macOS.

Useful options:

```text
--host stub|unity|both   host mode (default: stub)
--spectators N          override spectator count (default: 2 for 6/10-player runs)
--seed N                deterministic scripted choices (default: 2801)
--segment smoke|full|minigames   lobby/briefing smoke, the full C1 script, or only the minigames
--minigames MG-01,MG-08 ids for --segment minigames (default: all 25 implemented minigames)
--phone-processes shared|separate   one Chromium for all phone pages (default), or one per page
--measure-vote-performance   record vote long tasks, timer gaps and machine CPU (off by default)
--profile-vote-phone N   keep phone N on one page and CPU-profile the five part votes
--profile-cpu-rate N     CPU throttle for the profiled phone (default: 4)
--headed                headed Chromium for a Unity fallback probe
```

`--phone-processes separate` launches every player, spectator and late joiner with its own
`chromium.launch()` call. This models separate phone browser processes while preserving the shared-browser
default used by earlier evidence. The run summary records the selected mode as `phoneProcessMode`.

`npm run profile:vote` runs the T047 isolation profile: one rendered phone page at CPU throttle
×4 plus nine protocol-only players in the room. It covers the five C1 part votes, records the
browser/WebGL renderer, long tasks, a V8 CPU profile and machine CPU, then stops before TEST.

The stub sends shortened server timers but does not change server or client code. Its C1 preview
numbers are explicitly labelled `fixture (not Core)`: they are game fixtures, not a physical model.
Units remain on every numeric metric (`m/s`, `t`, `$M`, `%`). Raw frames are in `frames.ndjson`,
calculated latency/rate/bandwidth data in `metrics.json`, browser diagnostics in
`phone-*-diagnostics.json`, and milestone screenshots alongside them.

## What the full run covers

The script traverses lobby, briefing, C1 contract selection, five part rounds, TEST, PDR, two-round
FRR, countdown, flight F2–F9, required minigame starts, blackout, and debrief. It also reloads a
phone from its session token, drops and resumes a phone during a vote, drops the host for 20 s during
BUILD and resumes the paused room, and joins a pending spectator after BUILD starts. The 10-phone run
uses Chromium CPU throttling ×4 on one phone.

Run `npm test` for the harness unit tests. A non-zero end-to-end exit means the harness itself failed;
product defects remain visible in evidence and do not get hidden by the harness.

## Round-2 additions (T036)

- Minigames are now played through the real phone client with generic seeded touch, key and button
  input (`PhoneDriver.handleMinigame`); the stub host starts each run with its data-file type and
  duration, collects the real `mg.result` relays and sends an honest `mg.summary`. The input is not
  tuned to win, so scores are low; the check is load, run, report and result screens.
- `node seats.mjs`: pilot / co-pilot / booster seats (mock and a real session with PHONE seats), the
  spectator with audience reactions, and the `?server=` override against a LAN address.
- `node judge-path.mjs [--phone-base http://<LAN-IP>:8080]`: judging-day path against a running
  `npm --prefix tools/demo run demo` (entry page, links, host page, phone join by code, QR link, wrong code).
- `node summarize.mjs <runDir>...` prints the measurement tables used in `RESULTS.md`.
- Fixed: spectators now press JOIN (T028 spectators never joined the room).
- `judge-path.mjs` also presses New mission on the real Unity host (software GL is slow, about 2 min total), reads the room code from the
  `room.created` frame, joins a phone through the `?room=CODE` link and screenshots the host (`host-with-phone.png`).
- `E2E_NO_THROTTLE=1` skips the CPU throttle on the 10th phone; a failing phone screenshot is now probed (is the page main thread alive?) and retried
  viewport-only, recorded as a `screenshot diagnostic` action in `phone-N-diagnostics.json`.
