# MissionForge: public hosting for the judges

Goal: judges open one link, click **Host a mission** on a laptop and **join from a phone**, at no cost.
Researched on 15 Nov 2026. **Status (T046 check, 2026-11-15): deployed.** The service is live at
`https://missionforge-spaceapps.onrender.com/play/`. On that date `/healthz` returned `{"ok":true,"commit":"4a15662...",...}` (HTTP 200),
`/` redirected to `/play/`, and `/play/`, `/play/host/`, `/play/client/`, `/play/client/?mock=1`, `/play/judges.html` and `/play/credits.html` returned 200;
the Unity `.wasm.unityweb` and `.js.unityweb` files came with `content-encoding: gzip` when the request sent `Accept-Encoding: gzip`.
The section 3 WebSocket handshake (`hello` then `hello.ok` over `wss://.../ws`) also worked.
**Not verified:** a full play test through the public URL (host a mission, phones join, votes; section 3, "Play test") was not run by that check; the hosted
Unity host is the build committed in `docs/play/host/`, which predates the pre-flight screens, the flight view and the end screens (`submission/PROJECT_DESCRIPTION.md` section 8).
The hosted smoke test T048 (merged, run on a local copy of this service, `orchestration/evidence/T048/RESULTS.md`) passed the judge path to the lobby with three phones
and a full C1 session with a scripted host; its open defects D-110 and D-111 are about what phones and host show after a server restart (section 4).
T058's check of the public URL: `orchestration/evidence/T058/live/LIVE_CHECK.md`.
Section 2 below is the record of the human steps that were needed.

## 1. What was chosen and why

**Render, one free web service, everything on one origin.** `render.yaml` (a Render Blueprint) builds
`server/` and runs `npm --prefix server run start:hosted` (`server/src/hosted.ts`). That single Node process:

- serves the repository's `docs/` folder: the entry page `/play/`, the phone client `/play/client/` and
  the Unity WebGL host `/play/host/`, with `Content-Encoding: gzip` on the Gzip `.unityweb` files;
- accepts the room server's WebSocket on the same port (`wss://<site>/ws`);
- answers `GET /healthz` for Render's health check;
- sets the lobby QR / join link to `<RENDER_EXTERNAL_URL>/play/client/?room=CODE` automatically.

Because the phone client is a **same-origin build** (it connects to `wss://<page host>/ws`) and the entry
page builds the host link as `host/?server=wss://<page host>/ws`, **no server URL is baked into any build**.
Whatever URL Render assigns, it works, and the same files still work for the local demo.

| Option (checked Nov 2026) | Long-running Node + WebSocket | Card needed | Verdict |
|---|---|---|---|
| **Render free web service** | Yes; no maximum WebSocket duration | Not for free instances (Render's docs say so; a few forum users were asked for one as extra verification) | **Chosen.** Blueprint file, GitHub sign-in, sleeps after 15 min idle, about 1 min wake-up |
| Koyeb | Yes | Yes (card verification) | Rejected: card |
| Fly.io | Yes | Yes after a short trial | Rejected: card, trial only |
| Railway | Yes | Trial credit only; card terms unclear | Rejected: not reliably free |
| Cloudflare Workers / Durable Objects, Deno Deploy | Only with a rewrite of the server | No | Rejected: rewrite the day of submission |
| Netlify (functions) | No long-lived WebSocket | No | Static only; the existing `nasasc.netlify.app` cannot run the room server |
| GitHub Pages | Static only, no custom headers | No | Rejected: no WebSocket; the Gzip Unity build needs `Content-Encoding` headers; Pages on a **private** repository needs a paid plan and an admin |
| Cloudflare quick tunnel from a laptop | Yes, WebSockets pass through | **No account at all** | **Fallback** (section 5): only works while that laptop is on |

Render facts relied on (render.com/docs/free, /docs/websocket, /docs/environment-variables):
750 free instance hours per month per workspace (one service running all month uses about 720);
spins down after **15 minutes without inbound traffic** (HTTP requests *and* WebSocket messages count);
wake-up takes **about 1 minute**, during which browsers see Render's loading page; free services can be
restarted by Render at any time; public traffic arrives on `PORT` (default 10000), `wss://` only.

## 2. Human steps (done once; kept for a redeploy or a second copy)

**Who:** the repository was **private** at the time (it is public now) and is owned by `momansy`, so Render can only read it once the Render
GitHub App is installed on that account. That needs the **owner, `momansy`** (a collaborator with write
access cannot do it). No credit card, no API key.

0. Merge the hosting pull request into `main` (or pick the branch `feat/hosting` in step 4).
1. Open <https://dashboard.render.com/register> and choose **GitHub**; sign in as `momansy` and authorise Render.
2. In the Render dashboard: **New** (top right) → **Blueprint**.
3. Click **Connect GitHub** (or **Configure account**) → install the Render app on `momansy` →
   **Only select repositories** → `nasa-spaceapps-2026` → **Install**.
4. Back in Render, pick `momansy/nasa-spaceapps-2026`, branch `main` → give the Blueprint any name →
   **Deploy Blueprint** (Render reads `render.yaml`: one service, `missionforge-spaceapps`, plan Free).
   If it asks for a card, that is Render's extra verification; either add one (the Free plan is not
   charged) or skip Render and use section 5.
5. Wait until the service shows **Live** (first build about 3 to 5 minutes). Copy the URL at the top of
   the service page and post it to the team. That is all.

**URL:** `https://missionforge-spaceapps.onrender.com/play/` (Render would have appended a random suffix if
the name had been taken; nothing depends on the exact name).

After that, every merge to `main` that touches `server/`, `protocol/`, `docs/play/` or `render.yaml`
redeploys automatically (`buildFilter` in `render.yaml`). **A redeploy restarts the server and drops every
room, so do not merge such changes while judges are playing.**

### If `momansy` is not available

- **Make the repository public** (owner action, Settings → General → Danger zone). Then anyone with any
  Render account can do: **New** → **Web Service** → **Public Git Repository** →
  `https://github.com/momansy/nasa-spaceapps-2026` → Language **Node**, Region **Frankfurt**,
  Build command `npm --prefix server ci && npm --prefix server run build`, Start command
  `npm --prefix server run start:hosted`, Instance type **Free**, Advanced → Health check path `/healthz`,
  Environment variable `NODE_VERSION` = `22` → **Deploy**. (No auto-deploy from a public URL: use
  **Manual Deploy** after changes.)
- Or a collaborator forks the repository to their own account (if the owner allows forks of private
  repositories) and runs steps 1 to 5 against the fork.
- Or use the no-account fallback in section 5.

## 3. Verify (anyone, about 2 minutes)

Replace `SITE` with the URL from step 5, for example `missionforge-spaceapps.onrender.com`.
The first request after an idle period can take about a minute.

```
curl -s https://SITE/healthz
#   {"ok":true,"commit":"<sha>","startedAt":"..."}
curl -sI https://SITE/play/host/Build/host.wasm.unityweb
#   content-encoding: gzip   and   content-type: application/wasm
curl -s -o /dev/null -w "%{http_code}\n" https://SITE/play/client/
#   200
```

WebSocket handshake (Node 22+ has `WebSocket` built in):

```
node -e "const w=new WebSocket('wss://SITE/ws');w.onopen=()=>w.send(JSON.stringify({t:'hello',seq:1,d:{protocolVersion:1,client:'PHONE',appVersion:'check',lang:'en'}}));w.onmessage=e=>{console.log(String(e.data).slice(0,60));process.exit(0)};setTimeout(()=>{console.log('timeout');process.exit(1)},90000)"
#   {"t":"hello.ok",...
```

Play test:

1. On a laptop, open `https://SITE/play/` → **Host a mission**. The host's address bar shows
   `host/?server=wss%3A%2F%2FSITE%2Fws`. Press **New mission**: a 4-letter code and a QR appear and the
   footer says **Room server: connected**. The link under the QR is `https://SITE/play/client/?room=CODE`.
2. On a phone (mobile data is fine, no shared Wi-Fi needed), scan the QR → pick a call sign →
   **Join crew**. The host shows **1 crew joined**.

## 4. Judging day with the hosted site

- **Wake it first.** Open `https://SITE/play/` about 2 minutes before a judge looks, or set a free
  uptime monitor (for example UptimeRobot, needs its own account) on `https://SITE/healthz` every 10
  minutes. A running session keeps it awake by itself (WebSocket messages count as traffic).
- The free instance is small (0.1 CPU, 512 MB). Measured load locally: 10 players + 50 spectators is fine
  for the room server (`server/README.md`); static files are streamed from disk.
- Each judge's laptop downloads the Unity host (about 46 MB on disk, Gzip) and each phone the client
  (about 36 MB including 3D models, fetched as needed). Watch the bandwidth meter on Render's billing page.
- If Render restarts the service, all rooms are lost (memory only, by design): press **New mission** again, and have the phones reload and rejoin
  with the new code (they keep showing "Reconnecting…" otherwise, and the host footer stays on "reconnecting" until New mission is pressed: T048 defects D-110, D-111).

## 5. Fallback: this laptop + a Cloudflare quick tunnel (no account)

Works when Render is down, asleep at a bad moment, or never got set up. Cloudflare's quick tunnels need no
account and pass WebSockets; limits: no uptime guarantee, 200 requests in flight, the
`https://<random>.trycloudflare.com` URL changes every time, and the laptop must stay on and online.

1. Install `cloudflared` once: Windows `winget install --id Cloudflare.cloudflared`, macOS `brew install cloudflared`.
2. Terminal A: `cloudflared tunnel --url http://localhost:8080` and copy the `https://<random>.trycloudflare.com` it prints.
3. Terminal B, at the repository root (Node 20+):

   ```
   npm --prefix server ci
   npm --prefix server run build
   # PowerShell
   $env:PORT = "8080"; $env:PUBLIC_URL = "https://<random>.trycloudflare.com"; npm --prefix server run start:hosted
   # macOS / Linux
   PORT=8080 PUBLIC_URL=https://<random>.trycloudflare.com npm --prefix server run start:hosted
   ```

   `PUBLIC_URL` only sets the link under the lobby QR; leave it out and the QR points at `localhost`.
4. Share `https://<random>.trycloudflare.com/play/`. Verify with section 3 using that host.

Without internet at all: the LAN demo, `npm --prefix tools/demo run demo` (`RELEASE.md` 1.1), still works
on venue Wi-Fi or a phone hotspot, and `/play/client/?mock=1` runs a scripted session with no server.

## 6. What changed for this

| File | Change |
|---|---|
| `render.yaml` | Blueprint: one free Node web service, health check, build filter. |
| `server/src/hosted.ts`, `server/src/hosting/staticSite.ts` (+ test) | Hosted entry: static `docs/` + `/healthz` + room server on one port. `PORT`, `PUBLIC_URL` (or Render's `RENDER_EXTERNAL_URL`), `CLIENT_BASE_URL`, `DOCS_DIR` optional. |
| `server/src/wire/server.ts` | `startServer` accepts an optional `httpServer` to share its port (the default `PORT`-only path is unchanged). |
| `server/package.json` | `start:hosted` script. |
| `docs/play/index.html` | **Host a mission** opens `host/?server=<ws or wss>://<this host>/ws`. Works hosted, through a tunnel and with the local demo's `/ws` proxy. |
| `docs/play/client/` | Rebuilt from the current `client/` (same-origin `/ws`; the previous build predated the T038 phone UI fixes). |
| `tools/demo/README.md` | The troubleshooting note about the host button now matches the new link. |

Not changed: `.github/`, `netlify.toml`, the Unity project. The existing team site
`https://nasasc.netlify.app/` stays as is; once the Render URL is live, whoever manages that Netlify site
can link to it (or add a `/play/*` redirect to `https://SITE/play/:splat`). Netlify cannot proxy the
WebSocket itself.
