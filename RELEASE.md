# MissionForge: release and judging-day guide

For the team. Part 1 is how to rebuild and publish; part 2 is the minute-by-minute runbook for the
judging-day demo. Nothing here has been deployed: no hosting account, domain or DNS exists yet, and
every hosted step below is **prepared but untested on a public host**.

Deadline reminder: the NASA Space Apps submission closes **15 Nov 2026, 23:59 local**. The local demo
(section 1.1) needs only Node and works with no internet.

## 1. Quick reference

| I want to | Run (from the repository root) |
|---|---|
| Run the whole demo on this laptop | `npm --prefix tools/demo install` once, then `npm --prefix tools/demo run demo` |
| Rehearse with no server | `npm --prefix tools/demo run demo -- --mock` |
| Rebuild the phone client into `docs/play/client/` | `node tools/demo/build-client.mjs` |
| Rebuild credits and the judges page | `node tools/demo/build-credits.mjs` |
| Check the data | `npm --prefix tools ci` once, then `node tools/validate-data.mjs` |

### 1.1 Local demo (judging day, no hosting needed)

```
npm --prefix tools/demo install          # once; installs ws and qrcode-terminal
npm --prefix tools/demo run demo         # builds anything missing, then starts everything
```

It prints the host URL, phone URL, audience URL, a QR code for the phone URL and the offline fallback.
**Before judging day, rebuild the phone client:** `node tools/demo/build-client.mjs` (the demo only builds `docs/play/client/` when
it is missing, so a stale committed build is served as it is; on 2026-11-15 the committed build predated the languages and
minigames MG-22 to MG-30, see `orchestration/evidence/T044/REPORT.md`). Every flag is in [`tools/demo/README.md`](tools/demo/README.md). Needs Node 20 or newer on Windows
(PowerShell) or macOS; on a first run with no `server/dist` or `docs/play/client/` it runs `npm ci`
and the builds itself (about 2 minutes, needs internet once for `npm ci`).

## 2. Rebuild and publish

### 2.1 What is where

| Part | Source | Published to | Who builds it |
|---|---|---|---|
| Unity host (big screen) | `unity/MissionForge/` | `docs/play/host/` (Gzip `.unityweb`) | The Unity settings-lock holder, in Unity 6000.6.9f1 (WebGL). Not rebuilt by these tools. |
| Phone client | `client/` | `docs/play/client/` | `node tools/demo/build-client.mjs` |
| Entry page | written by hand | `docs/play/index.html` | not generated |
| Credits, judges page | generated | `docs/play/credits.html`, `docs/play/judges.html` | `node tools/demo/build-credits.mjs` |
| Room server | `server/` | a Node host (section 3) | `npm --prefix server run build` |

### 2.2 Phone client

```
node tools/demo/build-client.mjs                                   # same-origin /ws: for the local demo
MF_ROOM_SERVER_URL=wss://rooms.example.org/ws node tools/demo/build-client.mjs   # hosted variant
```

(PowerShell: `$env:MF_ROOM_SERVER_URL = "wss://rooms.example.org/ws"; node tools/demo/build-client.mjs`.)

The script runs `npm run build` in `client/`, replaces `docs/play/client/` and writes
`docs/play/client/BUILD_INFO.json` (commit, date, Node version, whether a server URL was baked in).
**Use the hosted variant for anything you publish**; a same-origin build served from a static host has
no `/ws` to talk to. Do not commit a hosted build and then run the local demo from it: the phone would
try to reach the hosted server. Rebuild without the variable before a local demo.

### 2.3 Credits

`node tools/demo/build-credits.mjs` re-reads `assets/media/CREDITS.md`, `GENERATION_LOG.json`,
`data/facts.json`, the installed `package.json` files of `client/` and `server/` (run `npm ci` in both
first), the Unity manifest and the font licences. It also renders `JUDGES.md` to `docs/play/judges.html`.
Fill in the **Team** block before publishing: copy `tools/demo/team.example.json` to `tools/demo/team.json`, list the people you want credited and rebuild. Until `team.json` exists the page shows a marked placeholder; the script never lists anyone on its own.

### 2.4 Unity host

Built by the lock holder with File > Build Settings > WebGL, output folder `docs/play/host/`
(see `orchestration/evidence/T008/webgl-build-summary.txt`). The current build is **Gzip**-compressed.

## 3. Hosting

**The chosen free deployment (Render, one origin for the site and the room server) and its human steps are in [`HOSTING.md`](HOSTING.md).** The notes below are the general background.

### 3.1 Static site (`docs/`)

Any static host works for `docs/`. The catch is the Unity build:

> **Gzip `.unityweb` files must be sent with `Content-Encoding: gzip`.** GitHub Pages cannot set
> response headers, so with the current build the host will fail to load there ("Unable to parse
> Build/host.framework.js.unityweb"). Two ways out:
> 1. Rebuild the host with Unity's **Decompression Fallback** enabled (a `ProjectSettings/` change for
>    the lock holder). The files then carry a loader that decompresses in JavaScript: it works on
>    GitHub Pages but loads more slowly.
> 2. Host where headers can be set, for example Netlify (the repository already has a `netlify.toml` with
>    `publish = "docs"`). The exact snippet is under **Interface changes** below.

Whatever you choose, an `https://` page can only open `wss://` sockets, so the hosted host page needs a
TLS room server and `?server=wss://rooms.example.org` (the host's default is `ws://localhost:8787`).

Check headers after deploying: `curl -sI https://<site>/play/host/Build/host.wasm.unityweb` must show
`Content-Encoding: gzip` and `Content-Type: application/wasm`.

### 3.2 Room server

From `server/README.md`:

1. `npm --prefix server ci && npm --prefix server run build`.
2. Copy `server/dist/`, `server/package.json`, `server/package-lock.json` and `protocol/schema/` to the host and
   run `npm ci --omit=dev` there.
3. Start: `PORT=8787 PROTOCOL_SCHEMA_DIR=/path/to/protocol/schema CLIENT_BASE_URL=https://<site>/play/client/ node dist/server/src/index.js`.
   `CLIENT_BASE_URL` is what the host's QR code and join link point at (`<CLIENT_BASE_URL>?room=CODE`).
4. Put a reverse proxy in front that terminates TLS and forwards the WebSocket (nginx: `proxy_pass http://127.0.0.1:8787;`
   with `Upgrade` and `Connection` headers). The server accepts the upgrade on any path, so `/ws` works.
5. Keep it running with `systemd` or `pm2`. A restart loses every room (by design: no storage).
6. Health check: open a WebSocket, send `{"t":"hello","seq":1,"d":{"protocolVersion":1,"client":"PHONE","appVersion":"check","lang":"en"}}`
   and expect `hello.ok` within 5 s. `tools/demo/start.mjs` does exactly this at start-up.

## 4. Release checklist

- [ ] `npm --prefix server test` and `npm --prefix client test` green; `dotnet test core/dotnet~` green.
- [ ] `npm --prefix tools ci` once, then `node tools/validate-data.mjs` passes (and the balance report, `orchestration/evidence/T012/balance-report.md`, is acceptable).
- [ ] Unity host rebuilt from the release commit; note the frame rate: open
      `/play/host/?server=ws://localhost:8787&perf=1` in Chromium at 1920x1080 and read the overlay (target 60 fps, `GAME_DESIGN.md` 17.8).
- [ ] `node tools/demo/build-client.mjs` (hosted variant if publishing); `BUILD_INFO.json` shows the release commit.
- [ ] `node tools/demo/build-credits.mjs` run after the last dependency, media or fact change; Team block filled.
- [ ] No secrets in the diff (`git grep -n -i "api_key\|secret\|token=" -- . ':!*.lock'` finds only documentation text).
- [ ] No `Library/`, `node_modules/`, `dist/`, `bin/` or `obj/` committed (they are git-ignored; `git status` is clean of them).
- [ ] No file over 50 MB (`docs/play/host/Build/host.data.unityweb` is about 13 MB).
- [ ] Hosting headers verified with `curl -sI` (section 3.1).
- [ ] Rehearsed the runbook below once end to end, including one fallback.

## 5. Judging-day runbook (C1 Earth Watch Quick Mission)

Design reference: `GAME_DESIGN.md` 20.3, with the session timeline of 2.2 and audience mode of 13.7.
The timings in 5.3 are a **plan**, not measured in a full live playtest, so rehearse once and adjust.

### 5.1 T-60 min: set up

| T- | Do |
|---|---|
| 60 | Laptop on mains power, battery saver off, display scaling so the browser viewport is 1920x1080. Close other heavy apps. Download nothing new. |
| 55 | Network: use **your own phone hotspot** or the venue Wi-Fi. Venue Wi-Fi often isolates clients (devices cannot see each other): test with a phone before relying on it. |
| 50 | In a terminal at the repository root: `npm --prefix tools/demo run demo`. Read the banner: "Health check: OK", and the LAN address. If the wrong address was chosen, restart with `--lan-ip <address>`. |
| 45 | Allow Node.js through the firewall for **private** networks if the OS asks. |
| 40 | Open the **host URL** from the banner in Chromium or Chrome, full screen (F11). Wait for the title screen. Create a room: a 4-letter code and QR appear. |
| 35 | A **test phone** joins by scanning the **lobby** QR on the big screen (it carries `?room=CODE`); the **terminal** QR is the bare phone URL, so a phone using it must type the 4-letter code. Confirm both appear in the lobby. Test one more through `http://<LAN-IP>:<port>/play/?room=CODE`. |
| 30 | Sound check on the big screen's speakers. Mute the laptop's notifications. |
| 25 | Lobby settings (section 5.2). Then restart the demo command (rooms are in memory) and press **New mission** again, so the code on the projector is new. |
| 15 | Print or open [`JUDGES.md`](JUDGES.md). Put the recorded demo video and `?mock=1` URL on a second device as fallback. |
| 5 | Stand at the screen; a person at the phones to help joiners. |

### 5.2 Lobby settings (what the host UI offers, and what it does not)

The host lobby (read from `unity/MissionForge/Assets/MissionForge/App/Screens/LobbyScreen.cs`; the shipped WebGL build was
not clicked through by this task) offers: role assignment (Random / Player pick / Vote), assist level, **vote timer 20, 30,
45 or 60 s**, and **tallies Open / Hidden**. Set:

| Setting | Value | Why |
|---|---|---|
| Vote timer | 20 s (the shortest the UI offers) | Keeps rounds short |
| Tallies | Open | The audience sees live bars: that is the demo |
| Assist level | Cadet or Engineer | Judges are new to the game |

The protocol allows more (`voteTimerS` 10 to 60 s, `inspectTimerS` 5 to 60 s, `audienceVoteWeight` 0 or 1;
`protocol/messages.md` 4.x, 7.4) but **the lobby has no control for `inspectTimerS` (default 20 s) or
`audienceVoteWeight` (default 0)**. So with the current host UI the audience stays **advisory**: its favourite shows as
the "Audience says" bar and does not add a ballot. The "audience counts as one voice" judging-day mode of design 13.7
needs the lobby change proposed in section 6.4. Do not promise it to judges until then.

### 5.3 The session, minute by minute

Length: a round is REVEAL 3 s + PREDICT 8 s + INSPECT 20 s + VOTE 20 s + RESULT 3 s, about **54 s** with the UI's shortest
timers. C1 has **22 votes**, so the build alone is about **20 minutes**, and the whole session about **35 minutes**
(a plan from the protocol timers and the design's segment lengths; not measured in a live playtest). For a **20-minute
slot** do one of: (a) play the lobby, briefing and the first 6 to 8 votes live, then show the flight from a recording;
(b) agree a 35-minute slot with the organisers. Rehearse once and pick; the table below is the full session.

| Min | Segment | Who | What happens | Talking point (challenge emphasis, design 20.1) |
|---|---|---|---|---|
| 0-2 | **Audience QR moment** | Presenter | Show the lobby QR. The audience scans (it opens the phone page with the room code filled in) and joins as spectators; the 4-6 players (team or judges) join as players. | Phones are the controls: no app, no account. |
| 2-4 | **Briefing** | Presenter | C1 briefing: 550 km Sun-synchronous orbit, 150 kg observation satellite, 90 M budget, 180 days. | **Orbit** (altitude and inclination from the contract), **budget**. |
| 4-24 | **Build: 22 part votes** (early: payload bay, satellite power, attitude control; late: communications) | Players vote; audience watches the "Audience says" bar | Each round shows part cards with mass, power, cost and risk deltas. Run one deliberate trade-off aloud: a cheaper engine that misses the thrust-to-weight rule against a dearer one that flies. | **Mass** (delta-v and thrust-to-weight on the dashboard), **budget** (cost deltas, Emergency Funding), **instruments** (data multiplier) and **power** (payload power balance must stay positive) in the payload votes, **communication** (downlink GB) at the comms vote, **meaningful decisions** (stats plus drawbacks, Predict before vote). |
| 24-25 | **Flight Readiness Review** | Everyone | GO/NO-GO poll: each console calls GO or NO-GO. | Systems-engineering review gates (Systems Engineering Handbook, design 20.2). |
| 25-32 | **Flight** | Pilot plus consoles | Countdown to orbit insertion, then orbital operations. Everyone plays the minigames in 5.4. | **Orbit** (apogee/perigee), **power** (eclipse, solar wings), **instruments** (science capture). |
| 32-35 | **Debrief** | Presenter | Score, grade, timeline, facts collected, awards. Then open the **assumptions register** (`GAME_DESIGN.md` 19) and the Codex. | **Education**: which numbers are physical, which are real-world approximate, which are game values. |

### 5.4 Minigames everyone plays

Design 20.3 says the audience plays Max Q and **Parachute**. C1 is an uncrewed satellite with no
parachute phase, so the parachute minigame (MG-23) never appears. The demo uses:

- **MG-08 Max Q Throttle Bucket** (phase F4, 20 s): keep the stress line in the band; the fact is the
  Max Q throttle-down. Mass and structural load.
- **MG-15 Solar Wing Deploy** (phase F8, 20 s, cooperative): release hinges in order, then point the
  wing at the Sun. Power. (Substitute **MG-21 Science Capture** if the satellite has no deployable wings;
  it covers instruments and is an F8 minigame for C1.)

### 5.5 Fallbacks

| Problem | Do |
|---|---|
| Venue network fails or blocks devices | Switch to your **hotspot** and restart `demo` with the new address. If still no phones: every phone opens `http://<LAN-IP>:<port>/play/client/?mock=1` (scripted session, no server) or the audience watches the host screen. Play the **recorded demo video** (`assets/media/cinematics/c1-earth-watch-briefing.mp4` is the briefing only; record a full run in advance and keep it on a second device). |
| WebGL host fails or is slow | Try the other browser (Chromium vs Firefox), lower the render scale with `?dpr=1`, close tabs. Otherwise use the Windows desktop build of the Unity host if the lock holder prepared one, or the recording. |
| Host browser crashes or is reloaded | The room server keeps the room for **10 minutes** when the host drops (design 17.7). Reload the host URL; it resumes the room. Phones show a pause while it is away. |
| A phone drops | The slot and role are held for **3 minutes**; reloading the phone page reconnects (token in `sessionStorage`). Its votes count as abstentions meanwhile. |
| Room server crashes | The `demo` command stops with a message. Restart it; **all rooms are lost** (memory only): make a new room and re-join. |
| Host sits on the title screen for more than 30 s | The room server closes a connection that has not created a room after 30 s (`bye HANDSHAKE_TIMEOUT`); the host reconnects by itself (seen in the T029 run, see `orchestration/evidence/T029/host-frames.txt`: `bye`, then a second `hello.ok`). Just press **New mission**. |
| Default port 8080 or 8787 busy | `--port 8081` and/or `--server-port 8788`. |
| Terminal QR unreadable | Use the lobby QR on the big screen, or type the URL printed under it. |

## 6. Interface changes proposed (6.1 and 6.4 are done; 6.2 and 6.3 are not made, outside the owning task's paths)

### 6.1 Netlify headers for the Unity Gzip files (`netlify.toml`)

**Done** (checked 2026-11-15, T044): these three blocks are already in the repository's `netlify.toml`. The text below is kept for reference and for the `docs/_headers` variant, which is not in the repository. The blocks are:

```toml
[[headers]]
  for = "/play/host/Build/*.wasm.unityweb"
  [headers.values]
    Content-Encoding = "gzip"
    Content-Type = "application/wasm"

[[headers]]
  for = "/play/host/Build/*.js.unityweb"
  [headers.values]
    Content-Encoding = "gzip"
    Content-Type = "application/javascript"

[[headers]]
  for = "/play/host/Build/*.data.unityweb"
  [headers.values]
    Content-Encoding = "gzip"
    Content-Type = "application/octet-stream"
```

Equivalent `docs/_headers` file for Netlify or Cloudflare Pages:

```
/play/host/Build/*.wasm.unityweb
  Content-Encoding: gzip
  Content-Type: application/wasm
/play/host/Build/*.js.unityweb
  Content-Encoding: gzip
  Content-Type: application/javascript
/play/host/Build/*.data.unityweb
  Content-Encoding: gzip
  Content-Type: application/octet-stream
```

Not tested on a real host (no deployment was allowed). Verify with `curl -sI` as in 3.1.

### 6.2 Phone client `?server=` parameter (`client/src/net/wsConnection.ts`)

The hosted phone build bakes in `VITE_ROOM_SERVER_URL`; a `?server=` override would let one build
rehearse against any server (for example a hotspot laptop) without a rebuild:

```diff
 export function roomServerUrl(): string {
+  const override = new URLSearchParams(location.search).get('server');
+  if (override && /^wss?:\/\//.test(override)) return override;
   const configured = import.meta.env.VITE_ROOM_SERVER_URL as string | undefined;
   if (configured) return configured;
```

Security note: an attacker-controlled link could point a phone at a hostile server; the client sends
only a nickname and votes, but consider an allow-list before enabling it on a public build.

### 6.3 Host lobby controls (Unity `LobbyScreen.cs`, for the settings-lock holder)

Add lobby controls for `audienceVoteWeight` (0 or 1, "Audience counts as one player"), `inspectTimerS` (5 to 60 s) and a
10 s option in the vote-timer segment. The protocol already accepts all three and `RoomClient` already sends `settings.set`.
Without them the judging-day mode of design 13.7 and a 20-minute session are not reachable from the UI.

### 6.4 Root `README.md`

**Done** (checked 2026-11-15, T044): the line is now at the top of `README.md`. It was: `Judges: see [JUDGES.md](JUDGES.md) for a one-page overview of MissionForge.`
