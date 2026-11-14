# T029 evidence: release and judging-day demo

Date: 2026-11-14/15. Machine: Windows 11, Node v24.16.0, Chromium from Playwright (headless, software GL for the Unity host).
Only Windows was run; macOS was **not** tested.

| File | What it shows |
|---|---|
| `demo-terminal-output.txt` | Terminal output of `node tools/demo/start.mjs` from a fresh copy: banner, health check OK, URLs, QR |
| `mock-terminal-output.txt`, `verify-mock-results.txt`, `mock-phone-lobby.png` | `--mock` mode: static site only; a phone joins the scripted lobby, 0 page errors |
| `terminal-qr.png`, `qr-decoded.txt` | The terminal QR rendered to an image and decoded with `jsqr`: equals the printed phone URL |
| `verify.mjs`, `verify-results.txt` | The verification script and its result: **38/38 checks passed** |
| `host-title-1920x1080.png`, `host-lobby-1920x1080.png`, `host-lobby-3-players-1920x1080.png` | Unity host at 1920x1080: connected, room created (code + QR), then "3 crew joined" |
| `phone-*-join.png`, `phone-*-lobby.png` | Three phones at 390x844: Ada and Grace via the printed phone URL + typed code, Katherine via `/play/?room=CODE` (entry page forward) |
| `_play_*-390.png`, `_play_*-1920.png` | Entry page, credits and judges page at 390 and 1920 px |
| `link-check.txt` | Every local link of the three pages returns 200 |
| `host-frames.txt` | Frames the host received (room.created with `joinUrl` on the LAN address; `HANDSHAKE_TIMEOUT` then reconnect) |
| `BUILD_INFO-*.json` | Phone build info. Checkout build: commit 2eb2d61. Fresh-copy build has `commit: unknown` because the copy was made with `git archive` (no `.git`). |
| `tools-demo-tests.txt` | `node --test` in `tools/demo`: 7 pass |

## Preflight (step 1), commit 2eb2d61

- `server/`: `npm ci`, `npm test` **236 tests passed** (16 files), `npm run build` OK.
- `client/`: `npm ci`, `npm test` **550 tests passed** (29 files), `npm run build` OK.
- `docs/play/host/Build/host.loader.js` present; the host loaded in Chromium and connected to the room server.

## Client build size (step 2)

`docs/play/client/`: 187 files, **25.79 MB** total (27,038,581 bytes), largest file 0.58 MB (`assets/index-*.js`); nothing near 50 MB.

## Verification (step 8)

Run from a copy of branch `agentmesh/momansy-claude/issue-105` made with `git archive` plus the new files, in `C:\Users\moham\AppData\Local\Temp\mf29b`
(short path: a first copy in a very long temp path failed `npm ci` with EBUSY on `esbuild`, an environmental Windows path-length/lock problem).
In that copy `docs/play/client` and `server/dist` were deleted first, so the one command built both.

- Host at 1920x1080 reached "ROOM SERVER: CONNECTED", **New mission** created room (code and QR shown).
- Two phones joined through the printed phone URL (typing the code) and one through `/play/?room=CODE`; the host showed "3 crew joined".
- The terminal QR decodes to `http://10.239.122.192:8080/play/client/`, equal to the printed phone URL.
- `index.html`, `credits.html`, `judges.html`: no external requests at 390 and 1920 px, no horizontal page scroll, all local links 200.
- `.unityweb` served with `Content-Encoding: gzip`; `/` redirects to `/play/`; path traversal returns 404.
- Unit tests of the launcher helpers: 7 pass.

## Not verified

- macOS; real phones and real Wi-Fi (firewall, client isolation); the `--open` flag; Ctrl+C shutdown (processes were stopped by PID).
- Host frame rate on a real GPU (software GL here); a full session of 4-6 players through build and flight (the host was only taken to the lobby; T028 evidence did not exist).
- Anything on a public host: nothing was deployed, the Netlify headers are untested.
- The Unity lobby's controls were read from `LobbyScreen.cs`, not clicked in the shipped build.

## Independent review (step 9)

One subagent followed `RELEASE.md` and `tools/demo/README.md` literally from a fresh copy. It confirmed the demo, flags, builds and the protocol claims, and found:
missing `npm --prefix tools ci` for the data validator; a `TEAM_BLOCK` that did not exist; runbook settings the host lobby cannot set (10 s timers, inspect timer, audience weight) and a timeline
that did not match 22 C1 votes at 54 s per round; terminal QR carries no room code; busy `--server-port`, bad `--lan-ip` and `--mock` banner handled badly; unclear references and a misleading
"not generated" heading on the credits page. **All of these were fixed** (team now read from `tools/demo/team.json`; runbook 5.2/5.3 rewritten; launcher validates flags and probes the port; mock banner;
heading renamed) and the full verification was re-run afterwards (38/38). Not fixed: the entry page's "Host a mission" link goes to `host/` without `?server=`, so with a non-default `--server-port` use the host URL from the banner (documented in `tools/demo/README.md`).
The reviewer also reported briefly using ports 8082, 8787, 8789 and 1 for its own tests (stopped).

## Process note

Midway, another session switched this worktree to branch `claude/t028-continue` for a while (the checkout later returned to `agentmesh/momansy-claude/issue-105`). No git state was changed by this task; all T029 files are untracked additions and were unaffected.
Once, `taskkill /IM node.exe` was run by mistake while stopping the first demo; it only affects local node processes.
