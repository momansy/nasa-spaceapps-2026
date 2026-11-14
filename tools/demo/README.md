# MissionForge demo tools (T029)

Everything needed to run MissionForge on one laptop with only Node 20+ installed (Windows PowerShell or macOS).

```
npm --prefix tools/demo install     # once: installs ws and qrcode-terminal
npm --prefix tools/demo run demo    # start the room server + the static site
```

Pass flags after `--`: `npm --prefix tools/demo run demo -- --port 8081 --lan-ip 192.168.1.20`.

## What `demo` does (`start.mjs`)

1. Builds what is missing: `server/dist` (runs `npm ci` and `npm run build` in `server/`) and `docs/play/client/`
   (runs `build-client.mjs`). Nothing is rebuilt if it already exists.
2. Starts the room server with `PORT`, `PROTOCOL_SCHEMA_DIR=<repo>/protocol/schema` and
   `CLIENT_BASE_URL=http://<LAN-IP>:<port>/play/client/`, so the QR code in the host lobby points phones at this laptop.
3. Serves `docs/` on `--port` with correct MIME types, `Content-Encoding: gzip` for the Gzip `.unityweb` Unity files,
   no caching, and proxies WebSocket upgrades on `/ws` to the room server (the phone build connects to same-origin `/ws`,
   so phones only need port 8080).
4. Health-checks the server (`hello` then `hello.ok` within 5 s, directly and through `/ws`) and prints the host URL,
   phone URL, audience URL, a terminal QR code for the phone URL and the offline fallback.
5. Ctrl+C stops both processes.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--port <n>` | `8080` | Port of the static site and the `/ws` proxy. |
| `--server-port <n>` | `8787` | Port of the room server. The host opens `ws://localhost:<n>` directly. |
| `--lan-ip <ip>` | detected | Address phones use to reach this laptop. Detection prefers Wi-Fi, hotspot and wired adapters over virtual ones (VirtualBox, VMware, WSL, Docker) and warns when only loopback exists. The banner lists every other address it saw. |
| `--no-build` | off | Never build. Fails with the command to run when `server/dist`, `server/node_modules` or `docs/play/client/` is missing. |
| `--mock` | off | Static files only, no room server: rehearsal with `/play/client/?mock=1`. |
| `--open` | off | Open the host URL in the default browser. |
| `--help` | | Print the flags. |

## Other scripts

| Command | Does |
|---|---|
| `node tools/demo/build-client.mjs` | `npm run build` in `client/`, replaces `docs/play/client/`, writes `BUILD_INFO.json`. `MF_ROOM_SERVER_URL=wss://host/ws` builds the hosted variant; without it the build uses same-origin `/ws`. Fails if any file is 50 MB or larger. |
| `node tools/demo/build-credits.mjs` | Regenerates `docs/play/credits.html` and, from `JUDGES.md`, `docs/play/judges.html`. |
| `npm --prefix tools/demo test` | Unit tests for LAN-address choice, MIME types and path safety. |

## Dependencies and licences

Only `ws` and `qrcode-terminal`; both are installed from `package-lock.json` into the git-ignored `tools/demo/node_modules/`.

| Package | Version | Licence | Used for |
|---|---|---|---|
| `ws` | 8.23.0 | MIT | Health check (the room server uses the same library) |
| `qrcode-terminal` | 0.12.0 | Apache-2.0 (its vendored QRCode generator is MIT) | Terminal QR code |

## Troubleshooting

- **Phones cannot open the phone URL:** allow Node.js through the firewall for private networks; check the Wi-Fi or hotspot has no
  client isolation; check the banner chose the Wi-Fi address (use `--lan-ip`).
- **"Health check: FAILED":** read the `[room-server]` lines above the banner; usually the port is busy (`--server-port`).
- **Host does not load:** `docs/play/host/Build/host.loader.js` must exist (the Unity build); the page needs a modern Chromium-based browser.
- **Hosted client build left in `docs/play/client/`:** rerun `node tools/demo/build-client.mjs` without `MF_ROOM_SERVER_URL`.
- **Non-default `--server-port`:** the "Host a mission" button on `/play/` opens the host without `?server=`, which defaults to
  `ws://localhost:8787`. Use the host URL printed in the banner instead.
- **Terminal QR has no room code:** it opens the phone page; the player types the 4-letter code. The QR in the host lobby carries `?room=CODE`.
