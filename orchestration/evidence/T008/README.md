# T008 evidence — Unity foundation finished

Date: 2026-11-14. Unity 6000.6.9f1, macOS 26 (Darwin 25.6), Apple M4 (10 cores, 24 GB), Chrome 157.

## Screenshots (1920 × 1080)

| File | What it shows | How it was taken |
|---|---|---|
| `title-1920x1080.png` | Title: Earth limb with terminator and city lights, sparse starfield, rocket-kit vehicle on the right, live logo upper-left, room server connected | WebGL build in desktop Chrome (Playwright, viewport 1920 × 1080, DPR 1) |
| `title-room-open-1920x1080.png` | After **New mission**: real `room.create` → `room.created`, 4-letter code, QR of the join URL, crew count from `room.state` | Same session, real click on the button |
| `lobby-1920x1080.png` | Lobby after **Open lobby**: four crew from `room.state` (stub server `--bots 4`), avatars, role chips, settings from `settings.state` | Same session, real click |
| `buildbay-kit-vehicle-1920x1080.png` | Build Bay with the assembled 62.55 m kit vehicle (9 kit parts, 18 placements) | macOS look-dev player (`MissionForge.Build.MacLookDev`, `-mfShot -mfPhase Build`) |

## Frame rate (WebGL, title scene)

`webgl-browser-run.json`: 60.1 fps average over 10 s on the title (worst frame 17.7 ms), 60.1 fps
with the room panel open, 60.1 fps on the lobby. Machine: Apple M4 MacBook, Chrome 157, ANGLE Metal,
1920 × 1080 CSS px at DPR 1. 60 fps is the display's vsync cap, so headroom was not measured.

## Tests

`editmode-results.xml`: EditMode **194 / 194 passed**, 0 failed, 0 skipped
(`Unity -batchmode -runTests -testPlatform EditMode`). Includes the Core rocket-equation call
(311 s, 100 t → 20 t = 4908.57 m/s), the 102-part catalog sync, the `en*.json` string merge, protocol
names checked against the `protocol/schema/*.schema.json` file names, and the C# client against the
stub server. `node unity/MissionForge/Tools~/stub-server/smoke.mjs` prints SMOKE PASS.

## Build

`webgl-build-summary.txt`: `MissionForge.Build.WebGL` → `docs/play/host/`, Succeeded, 0 errors,
0 warnings, gzip with decompression fallback (works on any static host), 24.6 MiB total, largest
file 12.5 MiB. Serve the folder and open `index.html?server=ws://<host>:8787`.

## Known gaps

- The browser logs one 404 (no `favicon.ico` in the build folder); harmless.
- The URP Edge Adaptive Spatial Upsampling shader is stripped (warning only; render scale is 1).
