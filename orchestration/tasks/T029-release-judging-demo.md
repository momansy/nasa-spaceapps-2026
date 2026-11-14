# T029 — Release and judging-day demo: entry page, one-command start, demo script, credits (package J)

**Worker:** any coding worker with Node 20+; suggested `mohammed-alainieh` or `yahia-aglan`. No MCP
server needed. A browser (Playwright Chromium) for verification. If dispatched to a $20 Claude
worker, add `mesh-model: sonnet` and `mesh-effort: high`.

**Deadline-critical.** The NASA Space Apps submission closes **15 Nov 2026, 23:59 local**. Steps 1–4
(a working local demo) come first and must be usable on their own; the documents follow.

**Owns (create):** `docs/play/index.html`, `docs/play/credits.html`, `docs/play/client/` (built
output only), `tools/demo/`, `RELEASE.md`, `JUDGES.md` (both at the repository root),
`orchestration/evidence/T029/`.

**Build outputs only.** Do not edit `server/`, `client/`, `unity/`, `core/`, `protocol/`, `data/`,
`docs/play/host/`, `docs/index.html`, `docs/README.md`, the root `README.md`, `netlify.toml`,
`.github/` or any agent coordination file. You may run `npm ci`, `npm test` and `npm run build` in
`server/` and `client/` (they write git-ignored `node_modules/` and `dist/`) and copy the client's
`dist/` into `docs/play/client/`. If a source change is needed (for example the phone reading a
`?server=` parameter), write it under **Interface changes** with the exact proposed diff; do not
make it.

**No deployment.** Do not publish to any public host, create hosting accounts, buy domains or set
DNS. Prepare everything so the team owner can deploy, and document the steps.

Use at most one subagent, for the final review.

## Read first

`GAME_DESIGN.md` 1.1, 2.2, 12.1, 13.7 (audience and judging-day mode), 17.1, 17.7–17.9, 19
(assumptions register), 20 (challenge alignment, resources, **20.3 judging-day demo plan**);
`orchestration/ARCHITECTURE.md` sections 1, 5, 8; `server/README.md` (run, env vars `PORT`,
`PROTOCOL_SCHEMA_DIR`, `CLIENT_BASE_URL`, deployment notes); `client/README.md` (build, `?room=`,
`&watch=1`, `?mock=1`, `VITE_ROOM_SERVER_URL`); `client/vite.config.ts` (`base: './'`);
`client/src/net/wsConnection.ts` (phone connects to `VITE_ROOM_SERVER_URL`, else same-origin
`/ws`); `docs/play/host/index.html` (`?server=`, `?perf=1`) and
`unity/MissionForge/Assets/MissionForge/Net/ServerUrlResolver.cs` and `App/Config/ServerConfig.asset`
(default server `ws://localhost:8787`, default join template `{origin}/play/?room={code}`; a
server-provided `joinUrl` wins); `orchestration/evidence/T008/webgl-build-summary.txt` (the host
build is **Gzip**-compressed `.unityweb`); `assets/media/CREDITS.md` and
`assets/media/GENERATION_LOG.json`; `orchestration/evidence/T025/fact-sources.md` and
`data/facts.json`; `assets/media/style/STYLE_GUIDE.md` (palette and typography for the pages);
`orchestration/evidence/T028/RESULTS.md` and `DEFECTS.md` if they exist (known limitations).

## Steps (in order; each leaves something usable)

1. **Preflight.** Node version; `npm ci && npm test && npm run build` in `server/` and `client/`
   (record test counts); confirm `docs/play/host/` loads its `Build/host.loader.js`. If the server or
   client does not build, return `status=blocked` with the errors.
2. **Phone client build.** `tools/demo/build-client.mjs`: runs the client build and copies
   `client/dist/` to `docs/play/client/` (replacing the previous copy), writes
   `docs/play/client/BUILD_INFO.json` (commit, date, Node version, whether `VITE_ROOM_SERVER_URL` was
   set). With `MF_ROOM_SERVER_URL=wss://…` it builds the hosted variant with that value; without it
   the build uses same-origin `/ws`, which is what the local demo serves. Check the folder stays
   well under 50 MB per file and report its total size.
3. **One-command local demo.** `tools/demo/start.mjs`, with `tools/demo/package.json` exposing
   `npm --prefix tools/demo run demo` (dependencies limited to small MIT packages such as `ws` and
   `qrcode-terminal`; record their licences). It must work on Windows (PowerShell) and macOS with
   only Node installed:
   - builds `server/dist` and `docs/play/client/` if missing (skippable with `--no-build`);
   - starts the room server on `--server-port` (default 8787) with `PROTOCOL_SCHEMA_DIR` set and
     `CLIENT_BASE_URL=http://<LAN-IP>:<port>/play/client/` so the host's QR code points phones at
     this laptop; detects the LAN IPv4 (override with `--lan-ip`), warns when only loopback exists;
   - serves `docs/` on `--port` (default 8080) with correct MIME types, `Content-Encoding: gzip`
     for the `.unityweb` files, no caching, and **proxies WebSocket upgrades on `/ws`** to the room
     server (the phone build connects to same-origin `/ws`);
   - health-checks the server (`hello` → `hello.ok` within 5 s) and prints: the host URL
     (`http://localhost:<port>/play/host/?server=ws://localhost:<server-port>`), the phone URL, the
     audience URL, a terminal QR code for the phone URL, and the offline fallback
     (`/play/client/?mock=1`);
   - `--mock` serves only the static files for a no-server rehearsal; Ctrl+C stops everything.
   Document every flag in `tools/demo/README.md`.
4. **Entry page `docs/play/index.html`.** One self-contained page (inline CSS, no external fonts,
   CDNs or trackers; palette and type from the style guide; works at 390 px and 1920 px): "Host a
   mission (big screen)" → `host/`, "Join on your phone" → `client/`, "Watch as audience" →
   `client/?watch=1`, a short what-it-is paragraph, links to credits and `JUDGES.md`. It forwards
   `?room=…` (and any other query) to `client/` at once, so the host's default join template
   `{origin}/play/?room=CODE` also lands players in the client. Mark the host link "best on a laptop
   or desktop browser".
5. **Credits page `docs/play/credits.html`,** generated by `tools/demo/build-credits.mjs` so it can be
   rebuilt when its sources change:
   - **AI-assistance disclosure** from `assets/media/CREDITS.md` and `GENERATION_LOG.json`: which
     tools and models were used for what (code, text, images, video), and which planned media were
     not generated; state plainly that the code was written with AI coding agents under human
     direction;
   - **Data sources:** one row per fact from `fact-sources.md` / `data/facts.json` (id, topic,
     source title, URL, access date, status); facts with status `rejected` are omitted, `unverified`
     ones are labelled;
   - **Third-party licences:** production dependencies of `client/` and `server/` with name,
     version and licence read from their installed `package.json` files; the fonts in
     `unity/MissionForge/Assets/MissionForge/UI/Fonts/` (IBM Plex and Oxanium, SIL OFL, with the OFL
     text files); Unity packages from `unity/MissionForge/Packages/manifest.json` (read only) and
     the Unity runtime notice; three.js, React, ws, ajv;
   - the disclaimers: not affiliated with or endorsed by NASA; NASA names and logos are not used as
     branding; in-game hardware names are generic with a "real-world twin" line; numbers are
     tagged physical / real-world approximate / game value (design 19);
   - **Team:** a clearly marked block for the team owner to fill. Do not harvest names or e-mail
     addresses from git history or anywhere else.
6. **`RELEASE.md`** (for the team): how to rebuild and publish — Unity WebGL to `docs/play/host/`
   (done by the Unity settings-lock holder, not by this task), `build-client.mjs`, `build-credits.mjs`;
   static hosting options for `docs/` and their catch: the Gzip `.unityweb` files need a
   `Content-Encoding: gzip` header, which GitHub Pages cannot send — either rebuild with Unity's
   "Decompression Fallback" (a `ProjectSettings/` change for the lock holder) or host where headers
   can be set (a Netlify `_headers` file or `netlify.toml` change, proposed as an exact snippet under
   **Interface changes**); room server deployment from `server/README.md` (TLS / `wss://`,
   `CLIENT_BASE_URL`, `PROTOCOL_SCHEMA_DIR`, health check) and building the phone with
   `MF_ROOM_SERVER_URL`; a release checklist (tests green, data validator, WebGL fps note, credits
   rebuilt, no secrets, no `Library/` or `node_modules/` committed).
   Then the **judging-day runbook** from design 20.3, minute by minute for a ~20-minute C1 Earth
   Watch Quick Mission: T−60 min setup (laptop on power, own hotspot or venue Wi-Fi with client
   isolation checked, `npm --prefix tools/demo run demo`, host in full screen at 1920×1080, a test
   phone joins, sound check), lobby settings (shorter vote timers, audience vote weight 1 for
   judging-day mode, tallies open), the audience QR moment, who plays (4–6 team members or judges),
   the talking points per phase mapped to the challenge emphases of 20.1 (mass, power, budget,
   instruments, orbit, communication), the minigames everyone plays, the debrief with the
   assumptions register, and the fallbacks (venue network fails → phones on `?mock=1` and the
   recorded demo; WebGL fails → desktop build or recording; host crash → room survives 10 min,
   reload the host). Design 20.3 says the audience plays the Max Q and **Parachute** minigames, but
   C1 carries an uncrewed satellite with no parachute phase: propose MG-08 Max Q plus MG-15 Solar
   Wing Deploy (or MG-21 Science Capture), and list it under **Decisions**.
7. **`JUDGES.md`** (one page for judges): what MissionForge is in three sentences; how to try it
   (the hosted URL placeholder and the one-command local start); how a session flows; the
   challenge-alignment table (20.1); where physics versus game simplification is documented
   (design 8.3, the assumptions register 19, Codex); how facts were verified (T025) and the AI
   disclosure (credits page); repository map; honest known limitations (from T028 if present, else
   your own observations in step 8). The root `README.md` is the agent-mesh README and is not yours:
   propose a one-line link to `JUDGES.md` under **Interface changes**.
8. **Verify.** From a fresh clone or a copy of the repository in a temp folder: run the one command; open the host URL in Chromium at 1920×1080 and confirm a room
   is created; join with two Playwright phones (390×844) through the printed phone URL and one
   through the entry page with `?room=`; decode the terminal QR (render it to an image and decode it
   with a library such as `jsqr`) and confirm it equals the printed URL; check every local link on
   `index.html` and `credits.html` returns 200; run the `--mock` mode. Repeat the start on the other
   OS if you have it; state which you ran.
9. **Review.** One subagent follows `RELEASE.md` and the runbook literally from a fresh copy and
   reports every step that is unclear or fails before you report.

## Acceptance

- `npm --prefix tools/demo run demo` on a fresh checkout starts the server and the static site,
  prints host, phone and audience URLs and a QR code that decodes to the phone URL; the host loads;
  phones on the same network join through the QR URL and through `/play/?room=CODE`.
- `docs/play/index.html` and `docs/play/credits.html` are self-contained (no external requests),
  readable at 390 px and 1920 px, every local link resolves; credits list every production
  dependency with its licence, every non-rejected fact with its source URL, and the AI disclosure.
- `docs/play/client/` is the current client build with `BUILD_INFO.json`; no source file outside
  the owned paths changed; nothing was deployed.
- `RELEASE.md` contains the publish steps, the hosting header caveat, server deployment and the
  minute-by-minute judging-day runbook with fallbacks; `JUDGES.md` fits on about one printed page.
- Evidence in `orchestration/evidence/T029/`: terminal output of the one command, host and phone
  screenshots from the verification, the decoded QR value, the link-check output, the client build
  size, and the review notes. **Decisions** (including the minigame choice for 20.3) and
  **Interface changes** (client `?server=` support, hosting headers, root README link) are listed.
