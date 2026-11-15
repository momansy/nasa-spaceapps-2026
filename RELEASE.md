# MissionForge: release and judging-day guide

For the team. Part 1 is how to rebuild and publish; part 2 is the minute-by-minute runbook for the
judging-day demo. **Status on 2026-11-15:** the free Render deployment described in [`HOSTING.md`](HOSTING.md) is live at
`https://missionforge-spaceapps.onrender.com/play/` (health check and all pages returned HTTP 200, Unity files carry `Content-Encoding: gzip`; that was the earlier Gzip build, and after the T055 redeploy the Brotli files go out without an encoding header, `orchestration/evidence/T055/README.md` 2).
A complete session through that public URL (laptop host plus phones) has **not been verified by the documentation task**: rehearse it once.
T055 is merged (#255); once Render has redeployed, the big-screen host it serves is the WebGL build rebuilt from `main` by T055. T055 ran a room on a local copy of the hosted service
(lobby, briefing, contract vote, 22 Build Bay votes, countdown, flight; see `orchestration/evidence/T055/`), not on the public URL. **Operator workarounds in a live room:** press
**PageDown** at the Flight Readiness Review (its panel is empty), press **PageDown** again when the flight has ended (the host stays on the Flight screen), and say that the
big-screen debrief shows **sample data** (8,172 pts, grade A, sample crew names), not the session's result. The new pre-flight text is English only on the big screen.
The older Netlify site (`nasasc.netlify.app/play/`) returned HTTP 404 and is not used. The Netlify and general-host notes in section 3 are background only.

Deadline reminder: the NASA Space Apps submission closes **15 Nov 2026, 23:59 local**. The local demo
(section 1.1) needs only Node and works with no internet.

## 1. Quick reference

**Prerequisites.** Node 20 or newer (demo, server, client). To run the Core tests (`dotnet test core/dotnet~`) you also need the
**.NET 8 SDK/runtime** (the test project targets `net8.0`; with only .NET 9 or 10 installed the test host aborts with
`Framework 'Microsoft.NETCore.App', version '8.0.0' not found`). See [`core/README.md`](core/README.md) for the
`DOTNET_ROLL_FORWARD=Major` fallback. The demo itself does not need .NET.

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
**Before judging day, rebuild the phone client if it changed:** `node tools/demo/build-client.mjs` (the demo only builds `docs/play/client/` when
it is missing, so a stale committed build is served as it is; the build was stale on 2026-11-15 morning, see `orchestration/evidence/T044/REPORT.md`, and was rebuilt
afterwards; `docs/play/client/BUILD_INFO.json` names the commit it was built from, `7b440f7` on 2026-11-15, and `client/` should not have changed since unless that file is older than your last client change). Every flag is in [`tools/demo/README.md`](tools/demo/README.md). Needs Node 20 or newer on Windows
(PowerShell) or macOS; on a first run with no `server/dist` or `docs/play/client/` it runs `npm ci`
and the builds itself (about 2 minutes, needs internet once for `npm ci`).

## 2. Rebuild and publish

### 2.1 What is where

| Part | Source | Published to | Who builds it |
|---|---|---|---|
| Unity host (big screen) | `unity/MissionForge/` | `docs/play/host/` (Brotli `.unityweb` since T055) | The Unity settings-lock holder, in Unity 6000.6.9f1 (WebGL). Not rebuilt by these tools. **Rebuilt from `main` by T055 on 2026-11-15** (Brotli, see `orchestration/evidence/T055/README.md` 2; the Gzip notes elsewhere in this file describe the earlier build; the documented entry point is `-executeMethod MissionForge.Build.WebGL` in `Assets/MissionForge/Editor/Build.cs`), so it contains the pre-flight screens (T027), Countdown, Flight and Orbit Map (T016), the end screens (T024), the T034 environment pass, the T035 lobby controls and full fonts for ≈, ₂, ×, ±, °. The build it replaced dated from 06:32 (+03:00) and had only Title, Lobby and an earlier Build Bay. Rebuild again after any later host change. |
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
(see `orchestration/evidence/T008/webgl-build-summary.txt`). The committed build (T055) is **Brotli**-compressed; the Gzip notes below describe the earlier T040 build. Since T055, send the `.unityweb` files with no `Content-Encoding` header (or `br`): a host that sends `Content-Encoding: gzip` for them breaks the host. A long-running local server must be restarted after pulling the Brotli build (its gzip check is cached per file, T055 operational note).

## 3. Hosting

**The chosen free deployment (Render, one origin for the site and the room server) and its human steps are in [`HOSTING.md`](HOSTING.md).** The notes below are the general background.

### 3.1 Static site (`docs/`)

Any static host works for `docs/`. The catch is the Unity build:

> **Since T055 the `.unityweb` files are Brotli: send no `Content-Encoding` header (or `br`); the gzip advice in this note and in 6.1 applies to the earlier Gzip build only.**
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
- [ ] No file over 50 MB. T055's first (Gzip) rebuild made `host.data.unityweb` 50.31 MiB and was not committed; the committed Brotli build has `host.data.unityweb` at 41.91 MiB (43,950,134 B) and `host.wasm.unityweb` at 8.95 MiB (`orchestration/evidence/T055/README.md` 2). The earlier build was 31.6 and 12.1 MiB.
- [ ] Hosting headers verified with `curl -sI` (section 3.1). Done for the Render site on 2026-11-15: `curl -s -D - -o /dev/null -H "Accept-Encoding: gzip" https://missionforge-spaceapps.onrender.com/play/host/Build/host.wasm.unityweb` showed `content-encoding: gzip` and `content-type: application/wasm` (a bare `curl -sI` request did not show the gzip header; ask with `Accept-Encoding: gzip`). That check was on the earlier Gzip build; after the T055 redeploy expect no `content-encoding` header on the Brotli `.unityweb` files.
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

**Which build this describes.** The lobby below is the one on `main` (read from
`unity/MissionForge/Assets/MissionForge/App/Screens/LobbyScreen.cs`, lines 68–87; not clicked through by the documentation
task). The rebuilt WebGL host of T055 was built from `main`, so once T055 is merged and Render has redeployed, the hosted big
screen and the local demo (`tools/demo` serves the committed `docs/play/host/`) both offer it. The **earlier** committed WebGL
build (2026-11-15 06:32, before T055) offered only role assignment, assist level, **vote timer 20, 30, 45 or 60 s** (no 10 s,
no inspect timer, no audience switch) and tallies; if you are on that build, use its 20 s vote timer and expect the audience
to be advisory.

The lobby on `main` offers: role assignment (Random / Player pick / Vote), assist level (Cadet / Engineer / Flight Director),
**vote timer 10, 20, 30, 45 or 60 s** (default 20 s), **inspect timer 5, 10, 20, 30 or 60 s** (default 20 s),
**audience counts as one player: Off / One player** (`audienceVoteWeight` 0 or 1, default 0) and **tallies Open / Hidden**.
These are the protocol ranges (`voteTimerS` 10 to 60 s, `inspectTimerS` 5 to 60 s; `protocol/messages.md` 4.x, 7.4); the
preset values inside them are game values. Set:

| Setting | Value | Why |
|---|---|---|
| Vote timer | 10 s (the shortest the lobby on `main` offers; 20 s on the earlier build) | Keeps rounds short |
| Inspect timer | 5 or 10 s | Judges see the cards for a few seconds; 20 s is the default |
| Audience counts as one player | One player (or Off to keep the audience advisory) | The judging-day mode of design 13.7: the audience's combined favourite adds one ballot |
| Tallies | Open | The audience sees live bars: that is the demo |
| Assist level | Cadet or Engineer | Judges are new to the game |

With the audience switch Off, the audience is **advisory**: its favourite shows as the "Audience says" bar and does not add a
ballot. The switch has not been tried in a real hosted session yet (rehearse it once before promising it to judges).

### 5.3 The session, minute by minute

Length: a part-vote round is REVEAL 3 s + INSPECT + VOTE + RESULT 3 s (`server/src/votes/rules.ts`). A PREDICT step (8 s) is
in the rules but the Build Bay does not ask for it, so it is not part of a round today. That gives **46 s a round at the
default timers** (inspect 20 s, vote 20 s) and **21 s at the shortest timers on `main`** (inspect 5 s, vote 10 s); on the earlier
hosted build (shortest vote timer 20 s, no inspect control) a round is 46 s. C1 has **22 votes**, so the build alone takes about
**17 minutes** at the defaults or about **8 minutes** at the shortest timers, before animation and runoffs. The whole session is
planned at **25 to 40 minutes**: that is the design estimate (`GAME_DESIGN.md`), not measured in a live playtest. For a
**20-minute slot** do one of: (a) use the shortest timers and play the whole session live (about 24 minutes by the same plan, so shorten the flight talk or the debrief); (b) play the lobby, briefing and the
first 6 to 8 votes live, then show the flight from a recording; (c) agree a 40-minute slot with the organisers. Rehearse once and
pick; the minute column below is the plan at the default timers.

| Min | Segment | Who | What happens | Talking point (challenge emphasis, design 20.1) |
|---|---|---|---|---|
| 0-2 | **Audience QR moment** | Presenter | Show the lobby QR. The audience scans (it opens the phone page with the room code filled in) and joins as spectators; the 4-6 players (team or judges) join as players. | Phones are the controls: no app, no account. |
| 2-4 | **Briefing** | Presenter | C1 briefing: 550 km Sun-synchronous orbit, 150 kg observation satellite, 90 M budget, 180 days. | **Orbit** (altitude and inclination from the contract), **budget**. |
| 4-21 | **Build: 22 part votes** (early: payload bay, satellite power, attitude control; late: communications) | Players vote; audience watches the "Audience says" bar | Each round shows part cards with mass, power, cost and risk deltas. Run one deliberate trade-off aloud: a cheaper engine that misses the thrust-to-weight rule against a dearer one that flies. | **Mass** (delta-v and thrust-to-weight on the dashboard), **budget** (cost deltas, Emergency Funding), **instruments** (data multiplier) and **power** (payload power balance must stay positive) in the payload votes, **communication** (downlink GB) at the comms vote, **meaningful decisions** (stats plus drawbacks, Predict before vote). |
| 21-22 | **Flight Readiness Review** | Everyone | GO/NO-GO poll: each console calls GO or NO-GO. **In a live room the big-screen FRR panel is empty**, because the Build Bay does not hand over its build (the "Build Bay hook" was not added in T055). Run the poll from the phones and talk over it, then the host operator presses **PageDown** to move the big screen on to the countdown. | Systems-engineering review gates (Systems Engineering Handbook, design 20.2). |
| 22-29 | **Flight** | Pilot plus consoles | Countdown to orbit insertion, then orbital operations. Everyone plays the minigames in 5.4. The rebuilt WebGL host (T055) has the Countdown, Flight and Orbit Map screens (T016) and the big-screen Debrief (T024); T055's local run of the hosted service showed the countdown and the flight with live telemetry. **When the flight simulation ends, the big screen stays on the Flight screen**: the host operator presses **PageDown** to advance to the debrief. The big-screen debrief then shows **sample (fixture) data** (8,172 pts, grade A, sample crew names), not the session's result: say so to the room. On the earlier build the big screen has no flight view and the phones carry the flight. | **Orbit** (apogee/perigee), **power** (eclipse, solar wings), **instruments** (science capture). |
| 29-32 | **Debrief** | Presenter | Score, grade, timeline, facts collected, awards. Then open the **assumptions register** (`GAME_DESIGN.md` 19) and the Codex. | **Education**: which numbers are physical, which are real-world approximate, which are game values. |

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

## 6. Interface changes proposed (6.1, 6.2, 6.3 and 6.4 are done in the source)

### 6.1 Netlify headers for the Unity Gzip files (`netlify.toml`)

**Earlier Gzip build only.** Since T055 the `.unityweb` files are Brotli; these gzip headers would break the host (send no `Content-Encoding`, or `br`). The Netlify site is not used. **Done** (checked 2026-11-15, T044): these three blocks are already in the repository's `netlify.toml`. The text below is kept for reference and for the `docs/_headers` variant, which is not in the repository. The blocks are:

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

**Done** (checked 2026-11-15, T046): `serverOverride()` in `client/src/net/wsConnection.ts` (tests in `client/src/net/serverOverride.test.ts`) accepts `?server=ws://...` or `wss://...` only for
local-network addresses (10.x, 172.16 to 31.x, 192.168.x, `localhost`, `*.local`) and the page's own host, which is the allow-list the note below asked for. The text below is the original proposal.

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

**Done in the source** (T035, merged 2026-11-15; checked from `orchestration/evidence/T035/RUBRIC.md` and the code, not run in Unity by T046): the Lobby has "Inspect timer" (5, 10, 20, 30, 60 s), "Audience counts as one player" (Off / One player) and a 10 s vote-timer segment, sent as `settings.set`. They are in the WebGL host rebuilt from `main` by T055 (not yet tried in a real hosted session). The text below is the original proposal.

Add lobby controls for `audienceVoteWeight` (0 or 1, "Audience counts as one player"), `inspectTimerS` (5 to 60 s) and a
10 s option in the vote-timer segment. The protocol already accepts all three and `RoomClient` already sends `settings.set`.
Without them the judging-day mode of design 13.7 and a 20-minute session are not reachable from the UI.

### 6.4 Root `README.md`

**Done** (checked 2026-11-15, T044): the line is now at the top of `README.md`. It was: `Judges: see [JUDGES.md](JUDGES.md) for a one-page overview of MissionForge.`
