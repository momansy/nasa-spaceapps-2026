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

## Hosted-mode additions (T048)

- `node run.mjs --hosted http://localhost:10000 --players 6 --spectators 5`: run the C1 session against an already running `npm --prefix server run start:hosted` process. A recording proxy forwards pages to `<origin>/play/client/` and WebSocket frames to `<origin>/ws`, so frames are still recorded and schema-checked (latency is measured on loopback, before the real network).
- `node hosted-judge-path.mjs [--origin …] [--phones 3]`: entry page → Host a mission → real Unity host → New mission → phones join from the `joinUrl` only.
- `node hosted-restart.mjs [--origin …] [--down-seconds 10]`: kill and restart the hosted process in a lobby and record how host and phones recover (needs PowerShell on Windows to find the listener).

## Real-host mode (T061): scripted phones against the real Unity host

The Unity host is the authority. This mode **never sends a host message and never drives a phase**: it joins N real
390 × 844 Chromium phones to a room that a real host already created, answers what the host asks, and tells you where the
session stops. Use it so the Unity machine only has to run the host.

**One command** (3 phones, server from `npm --prefix server run start:hosted`, which also serves the phone build):

```sh
node tools/e2e/run.mjs --real-host --room CODE --server ws://localhost:10000/ws --phones 3
```

`--room` is the 4-letter code on the host's lobby, `--server` the room server (`ws://…/ws`, `http://…` or `host:port`),
`--phones` is 1, 3 or 6. Start it **while the host is in its lobby**; phones that join later are pending spectators.
The phone page defaults to `<server origin>/play/client/` (the hosted layout). Any other layout needs `--phone-base URL`
(the phones then also get `?server=` when they cannot reach the room server on their own origin).

| Option | Default | Meaning |
|---|---|---|
| `--stall-seconds` | 180 | no progress frame for this long outside the lobby = verdict `stalled` |
| `--lobby-wait-minutes` | 30 | the lobby waits for a human, so it gets a long allowance |
| `--timeout-minutes` | 60 | hard stop = verdict `timeout` |
| `--debrief-linger-seconds` | 20 | how long to watch the debrief before verdict `completed` |
| `--headed` | off | show the phone browsers |
| `--out DIR` | `orchestration/evidence/T061/real-host-runs/` (`E2E_EVIDENCE_TASK` changes `T061`) | evidence folder |

What the phones answer, through the real phone UI (generic input, not tuned to win): every `vote.stage` VOTE / RUNOFF
(contract, parts, TEST, PDR), PREDICT, tie-break trivia and pick; every FRR poll call with GO (a phone holding several roles
answers each call); every minigame (`mg.start` → play → own result → `mg.summary` → continue); console alert call-outs; and
the "role ready" acknowledgement. Nothing else is pressed, so a host screen that waits for something else shows up as a stall.

Output, to stdout and to `run-summary.json`, `timeline.log` and `frames.ndjson` (every frame, schema-checked) in the run folder:

- a timestamped line for each phase the phones see (`phase.set`: phase, sub-state, review, flight phase, step), each vote stage,
  poll, minigame and summary, and each phone's visible screen when it changes; screenshots of phone 1 at each new screen;
- a verdict: `completed` (debrief reached), `stalled` (with the last phase, the seconds since it, the last progress frame and
  what each phone shows), `room_ended` (every phone shows the lost-connection / room-ended banner for over 30 s), or `timeout`.
  Exit code 0 only for `completed`; 1 for the others; 2 when the harness could not start or a phone could not join (bad code).

Helpers used to test it without a Unity machine:

- `node tools/e2e/open-webgl-host.mjs [--origin http://localhost:10000] [--control-file FILE]`: opens the committed WebGL host in
  headless software-GL Chromium, presses New mission, prints `ROOM=XXXX` and stays open. Lines appended to the control file
  (`click X Y` on the 1920 × 1080 canvas, `key Enter`, `shot NAME`) act as the person at the host. Software GL runs at about
  0.1–0.5 fps, so a click takes tens of seconds to show.
- `node tools/e2e/room-ended.mjs [--docs-dir DIR]` (D-110): kills and restarts a hosted server under a phone and checks that it
  shows "This room has ended." with a Rejoin button instead of an endless "Reconnecting…".
