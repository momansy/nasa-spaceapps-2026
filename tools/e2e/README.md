# MissionForge end-to-end playtest

This harness starts the real room server, serves the built phone and Unity host assets, proxies
same-origin `/ws`, records and schema-checks every WebSocket frame, and drives real 390 × 844
Chromium phone pages. It writes run evidence to `orchestration/evidence/T028/runs/<runId>/`.

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
--segment smoke|full    lobby/briefing smoke or the full C1 script
--headed                headed Chromium for a Unity fallback probe
```

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
