**Verdict: safe to deploy** — no defect blocks the judge path (entry → Unity host → New mission → phones join from the link). Two medium defects (D-110, D-111) make a Render restart mid-session confusing, and the real Unity host could not be played to the debrief on this machine (D-113); read those three before judging day.

# T048 — Hosted (Render) build smoke test, run locally

Run 2026-11-15 on `main` @ `d6c7445` (worktree `agentmesh/momansy-claude/issue-185`), Windows 11, Node v24.16.0 (Render is pinned to `NODE_VERSION=22`; **Node 22 was not tested**), Playwright Chromium 1255 (headless, software GL; headed Chromium would not launch on this worker: `browserType.launch: spawn UNKNOWN`, so every browser step below is headless).
All evidence is in this folder. Times are wall clock on this PC, not on Render's 0.1 CPU free instance.

## Step 1 — Build and start exactly as `render.yaml` does — PASS

| Item | Result |
|---|---|
| Build command | `npm --prefix server ci && npm --prefix server run build` → exit 0, **15.8 s** total (`build.log`; `node_modules` was already warm, so a cold Render install will be slower) |
| Warnings | `npm ci`: "6 vulnerabilities (3 moderate, 1 high, 2 critical)". All are dev dependencies (vitest, esbuild, tinypool); `npm --prefix server audit --omit=dev` → **0 vulnerabilities**. Nothing at build time otherwise |
| Start | `PORT=10000 NODE_ENV=production RENDER_EXTERNAL_URL=http://localhost:10000 npm --prefix server run start:hosted` → starts in under 2 s; log line `clientBaseUrl=http://localhost:10000/play/client/` (`server.log`) |
| `/healthz` | `{"ok":true,"commit":null,"startedAt":"…"}`. `commit` is `null` locally because Render sets `RENDER_GIT_COMMIT`; expected |

## Step 2 — HTTP checks — PASS (`http-checks.txt`, `http-checks-extra.txt`)

| Path | Status | Content-Type | Content-Encoding | Cache-Control |
|---|---|---|---|---|
| `/healthz` | 200 | application/json | – | no-store |
| `/` | 302 → `/play/` | – | – | no-cache |
| `/play` | 301 → `/play/` | – | – | no-cache |
| `/play/` | 200 (8 430 B) | text/html | – | no-cache |
| `/play/judges.html` | 200 | text/html | – | no-cache |
| `/play/credits.html` | 200 | text/html | – | no-cache |
| `/play/client` → `/play/client/` | 301 → 200 | text/html | – | no-cache |
| `/play/host` → `/play/host/` | 301 → 200 | text/html | – | no-cache |
| `/play/host/Build/host.loader.js` | 200 | text/javascript | – | no-cache |
| `/play/host/Build/host.data.unityweb` (33 132 553 B) | 200 | application/octet-stream | **gzip** | no-cache |
| `/play/host/Build/host.framework.js.unityweb` | 200 | application/javascript | **gzip** | no-cache |
| `/play/host/Build/host.wasm.unityweb` (12 653 328 B) | 200 | application/wasm | **gzip** | no-cache |
| `/play/host/StreamingAssets/data/index.json` | 200 | application/json | – | – |
| `/nope`, `/play/nope.html`, `/play/host/StreamingAssets/`, `/ws` (plain HTTP) | **404** | text/plain | – | no-cache |

`host/Build/` holds exactly four files (the four above); all were checked. Further checks:

- **Path traversal**: `/play/..%2f..%2fserver/package.json`, `/play/%2e%2e/%2e%2e/server/package.json`, `/play/..%5c..%5cserver%5cpackage.json`, double-encoded `..%252f`, `%00`, `%zz`, and with `curl --path-as-is` `/play/../server/package.json`, `/../server/package.json`, `/play/host/Build/../../../../server/package.json` → all **404 `Not found`**; no file outside `docs/` was returned.
- Body integrity: `curl -H 'Accept-Encoding: gzip'` of the wasm is **byte-identical to the file on disk** (`cmp`), i.e. no double compression. Conditional GET (`If-Modified-Since`) → **304**. `POST`/`OPTIONS /play/` → 405. 9 000-character URL → 404. The server was still healthy after all of this.
- Observations, not defects: every file carries `Cache-Control: no-cache` (revalidated with `Last-Modified`, no `ETag`), so each judge visit makes a cheap 304 round-trip per Unity file; `Range` requests are ignored (full 200). An identity-only client still receives gzip for `.unityweb` (no browser does that).

## Step 3 — Judge path in a browser, `http://localhost:10000/play/` — PASS up to the lobby; debrief NOT reached with the real host (D-113)

Script: `tools/e2e/hosted-judge-path.mjs` (new). Run: `runs/2026-11-15T07-56-52-659Z-hosted-judge-path/` (`hosted-judge-path-result.json`, `hosted-judge-path-console.log`).

| Check | Result | Evidence |
|---|---|---|
| Entry page → "Host a mission" link is `host/?server=ws%3A%2F%2Flocalhost%3A10000%2Fws` (same-origin, no hard-coded host) | PASS | `01-entry.png` |
| Click lands on `/play/host/?server=…` | PASS | |
| Unity WebGL host finishes loading (loading overlay hidden) | PASS, 18 s (software GL, localhost) | `03-host-loaded.png` |
| WebSocket `ws://localhost:10000/ws`; no console errors, no failed HTTP requests on the host page | PASS | result json (`errors: []`, `failedRequests: []`) |
| New mission → `room.created` | PASS, room `EPKB` | `04-host-new-mission.png` |
| Host footer "Room server: connected" | PASS | `07-host-with-phones.png` |
| `room.created.joinUrl` = `http://localhost:10000/play/client/?room=EPKB` (= `RENDER_EXTERNAL_URL` + `/play/client/?room=CODE`); `spectateUrl` likewise | PASS | result json `roomCreatedPayload` |
| 3 phone-sized contexts (390×844, touch) open **only** the join link, no `?server=`, pick a call sign, JOIN → lobby | PASS ×3, no console errors | `05-phone1-join.png`, `06-phoneN-lobby.png` |
| Host shows "3 crew joined" | PASS | `07-host-with-phones.png` |
| Play the C1 session to the debrief **on the real Unity host** | **NOT DONE** — D-113 | |

Substitute for the last row (so the hosted origin itself is exercised end to end): step 4 plays the full C1 session to the debrief on the hosted process, with a scripted host.

## Step 4 — `tools/e2e` C1 session, 6 phones + 5 spectators, against the hosted origin — PASS

Command: `E2E_EVIDENCE_TASK=T048 node run.mjs --hosted http://localhost:10000 --players 6 --spectators 5` (new `--hosted` flag, below). Run `runs/2026-11-15T07-40-42-745Z-stub-p6-s2801/` (`c1-p6-s5-console.log`, `metrics.json`, `run-summary.json`, 40 screenshots).

- **Reached the debrief**: milestones lobby, briefing, 8 votes, 2 FRR polls, build, 7 minigame starts, alert, blackout, debrief. **0 harness failures.**
- Frames recorded: **7 502, all schema-valid; 0 invalid, 0 unknown types, 0 protocol error frames, 0 sequence gaps.**
- The scripted host dropped for 20 s mid-BUILD and resumed, a phone reloaded from its token, one dropped during a vote, and a late joiner became a pending spectator: all handled as in T036.
- Latency (ms, p50 / p95 / max), compared with T036 (6 phones, same scenario, `server/dist` on loopback, no spectators beyond 2):

| | Vote ack | Vote → next tally | MG relay p95 | HUD / telemetry / tally max Hz | Max KiB/s | Phone FPS avg / 1% low |
|---|---|---|---:|---|---:|---|
| **T048 hosted, 6 + 5 spectators** | 2.5 / 9.3 / 9.4 | 115.9 / 190.4 / 199.4 | 2.3 | 5 / 10 / 3 | 6.06 | 35.0 / 12.0 |
| T036, 6 + 2 spectators | 2.8 / 5.4 / 10.1 | 120.3 / 201.1 / 201.4 | 1.5 | 5 / 10 / 3 | 11.48 | 49.0 / 12.0 |

  Targets (design §17.8): vote round trip < 200 ms **met** (p95 9.3 ms); vote → tally p95 190.4 ms is under 200 ms this run (T036's 201.1 ms is the known marginal D-101, so no regression); HUD ≤ 5 Hz, telemetry ≤ 10 Hz, tally ≤ 5 Hz all **met**; bandwidth ≪ 50 KiB/s. Phone FPS 35 average is lower than T036 (49) because this run had 11 Chromium pages on one CPU; the harness-measured FPS is a load figure for this PC, not a phone result. "Poll p95 3 393 ms" is the known `NO_ANSWER` artefact of T036, not a latency.
- Latencies are measured at a recording proxy on loopback in front of the hosted process (see "Harness change"), so they exclude real network delay: they show the hosted process adds no regression, not what Render's free instance (0.1 CPU) will do.
- 24 browser console errors = 2 per page, both `404` for `models/tank_s.glb` and `models/inst_wide_field_optical_camera.glb` → **D-112** (cosmetic; the viewer falls back).
- `tools/e2e` single-phone C1 (`runs/…07-51-27-790Z-stub-p1-s2801`) also reached the debrief (same two 404s, logged in `proxy-http-errors.log`).

## Step 5 — Restart behaviour — PARTIAL: reconnects, rooms do not survive (as designed), recovery is manual and unclear (D-110, D-111)

Script: `tools/e2e/hosted-restart.mjs` (new). Real Unity host (headless) + 2 phones in a lobby, server process killed (`Stop-Process -Force`), restarted after 10 s with the same environment, nobody reloads anything. Run 2: `runs/2026-11-15T08-17-14-685Z-hosted-restart/` + `hosted-restart-run2-console.log`. Run 1 (45 s downtime, host screenshots delayed the restart) gave the same results: `runs/2026-11-15T08-05-47-812Z-hosted-restart/`, `hosted-restart-run1-console.log`.

Timeline of run 2 (seconds since script start): kill at 84.0, server back at 94.0 (down 10.0 s).

| Event | Time after server is back | Evidence |
|---|---|---|
| Both phones reconnect the WebSocket and get `hello.ok` | **3.5 s** (backoff) | `phone1/2: recv hello.ok` at 97.5 s |
| Phones send `room.resume`; server answers `ROOM_NOT_FOUND` | same instant | the room existed only in the old process's memory |
| Host reconnects, `hello.ok`, `room.resume` → `ROOM_NOT_FOUND` | 4.4 s | `05-host-after-5s.png` |
| Phones **resume the room without reload** | **NO** | rooms are memory-only (HOSTING.md section 4: "press New mission again") |
| Phone UI | stays on the old lobby (call signs, crew list) with the banner "Connection lost. Reconnecting…" **indefinitely** (still there at +90 s); "No room with that code. Check the host screen." only flashes at about +5 s | `04-phone1-after-5s/30s/90s.png` → **D-110** |
| Host UI | back on the title screen, "Room server: reconnecting" in amber, and it **stays "reconnecting"** although the socket is up: it sends `hello`, never a `room.*` request, and the server closes it with `HANDSHAKE_TIMEOUT` every ~32 s, 20+ times in 10 min | `05-host-after-30s.png`, run-2 log → **D-111** |
| Recovery: judge presses **New mission** on the same host page (no reload) | works: `room.created` (room `MKND`), footer back to "Room server: connected", 0 crew joined | `06-host-new-mission-after-restart.png` |
| A phone joins that new room after the restart | not verified in this run (a bug in my script's listener, fixed afterwards but not re-run, ~15 min per run); the join path is the same as step 3 against a freshly started process | |

Rooms lost on restart is documented, so it is a limitation, not a defect; the defects are about what the judges see when it happens.

## Harness change (`tools/e2e/`, called out as the brief asks)

- `lib/stack.mjs`: `launchStack({ …, hosted: { origin } })` starts no room server or static files; it runs a recording proxy that forwards `/…` to `<origin>/play/client/…`, `/host…` to `<origin>/play/host…` and WebSocket `/ws` to `<origin>/ws`, so phones load the committed `docs/play/client` build and every frame is still recorded and schema-checked. HTTP responses ≥ 400 go to `proxy-http-errors.log`. Default behaviour is unchanged.
- `run.mjs`: `--hosted http://localhost:10000` passes it through.
- New: `hosted-judge-path.mjs` (step 3), `hosted-restart.mjs` (step 5).
- Regression check of the default path: `npm test` in `tools/e2e` → 3/3 pass; `node run.mjs --players 1 --segment smoke` (private room server, no `--hosted`) → ok, run `runs/2026-11-15T08-35-35-631Z-stub-p1-s2801`.

## Not verified

- Node 22 (Render's runtime); only Node 24.16 here.
- Real Render: TLS/`wss://`, the free instance's CPU, sleep after 15 min idle and the ~1 min wake-up, `RENDER_GIT_COMMIT`, health-check behaviour.
- The real Unity host through BUILD → flight → debrief (D-113); GPU frame rate of the host.
- A cold build including a cold `npm ci` download.
- Phones on a real phone browser or real mobile network.
