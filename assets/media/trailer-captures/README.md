# Trailer captures (T054)

Clean, continuous 1920×1080 60 fps shots of the **real Unity WebGL host** for the T053 marketing trailer.
Nothing was staged or composited: every clip is the host as the build on `main` renders it, during a real local
session with five phone clients (call signs Ada, Yuri, Sally, Neil, Mae) joining and voting.

## How they were recorded

- **No Unity Editor on the capture machine**, so the brief's Unity Recorder route was replaced by recording the
  shipped WebGL build (`docs/play/host/`) served locally by `server/` (`npm run start:hosted`, port 10000).
- Host: system Google Chrome, headed, fullscreen on a 1920×1080 display, `--use-angle=d3d11
  --enable-gpu-rasterization --ignore-gpu-blocklist`. WebGL renderer confirmed as
  `ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU, Direct3D11)`, not SwiftShader. The canvas is exactly
  1920×1080 (the page caps rendering at 1080 lines); the host ran at about 110 fps (rAF) while recording.
- Capture: ffmpeg `ddagrab` (Windows Desktop Duplication) at **60 fps** for the whole session into one
  near-lossless master (x264 crf 12), mouse cursor not drawn. Chosen after measuring the alternatives:
  CDP `Page.startScreencast` delivered ~40 fps with bursty 8–83 ms gaps, and Playwright `recordVideo` is 25 fps.
  `mpdecimate` finds 295 of 300 frames unique in a 5 s clip: real 60 fps motion, no duplicated-frame stutter.
- Each clip is cut from the master and encoded `libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 60`, no audio.
- Phase changes with no host button on `main` (Briefing → Contract → Build, FRR → Countdown → Flight →
  Debrief) used the host's own **PageDown** "next phase" shortcut (`HostNavigator.cs`).
- Script: [`capture.mjs`](capture.mjs) (launch, drive, record, `cut`). Contact sheet (one frame per clip):
  [`orchestration/evidence/T054/contact-sheet.jpg`](../../../orchestration/evidence/T054/contact-sheet.jpg).

## Clips

All clips: 1920×1080, source 60 fps (Desktop Duplication), output 60 fps H.264 High yuv420p crf 18, no audio.
Total ≈ 13 MB.

| File | Screen | What it shows | Duration |
| --- | --- | --- | --- |
| `01-title-rocket-over-earth.mp4` | Title | MissionForge title, rocket climbing over the Blue Marble Earth limb, stars drifting | 6.0 s |
| `02-room-open-qr-code.mp4` | Title → room open | "Mission room open" card with QR code and room code, "0 crew joined", rocket behind | 5.0 s |
| `03-room-to-lobby-transition.mp4` | Title → Lobby | Host presses Open lobby; the room card dissolves into the Lobby screen | 4.0 s |
| `04-lobby-crew-joining.mp4` | Lobby | Crew avatars pop into the seats one by one as phones join | 6.0 s |
| `05-build-bay-arrival.mp4` | Build Bay | Launch pad at dusk, first vote "Launch site" opening with its countdown ring | 5.0 s |
| `06-build-bay-vote-tally.mp4` | Build Bay | Vote 4 "Attitude control": Inspect ends, Vote opens and the tally fills 0 → 5 of 5 voted | 5.0 s |
| `07-build-bay-exploded-view.mp4` | Build Bay | Exploded view (X) of the full stack: parts fly apart with labels (engines, boosters, tanks, interstage, payload) | 6.0 s |
| `08-build-bay-boosters-attach.mp4` | Build Bay | "Strap-on boosters" vote result: two boosters rise into place on the core stage | 5.0 s |
| `09-build-bay-full-stack-on-pad.mp4` | Build Bay | Finished rocket on the pad at dusk with the readiness panel and vote 18 ring counting down | 4.9 s |

## Not captured (and why)

- **Briefing, Contract vote, FRR, Countdown, Flight, Debrief**: in the WebGL build on `main` these are still the
  T001 layout placeholders (dashes such as `— $M`, `— km`, `— pts`, "Minigame banner: name"). No flight/ascent,
  orbit or debrief-score footage exists to film yet; re-run `capture.mjs` once a host build with the real flight
  view (T016) and end screens (T024) is published to `docs/play/host/`.
- **Scale view (R)**: renders well (Saturn V and building silhouettes) but a label shows a missing glyph
  ("10-storey building � 30 m"), so it was left out. The vote 20 card "Fuel cells (H�/O�)" has the same font
  gap; no clip includes it.

## Re-recording

1. `cd server && npm ci && npm run build && PORT=10000 RENDER_EXTERNAL_URL=http://localhost:10000 npm run start:hosted`
2. In a scratch folder outside the repo: `npm i playwright ffmpeg-static`, copy `capture.mjs`, run `node capture.mjs`
   on a Windows machine with a 1920×1080 display and Google Chrome installed. Keep notifications and other windows
   off the screen (ddagrab records the display).
3. Find in/out points by looking at frames of `rec/session.mkv` (marks in `marks.log` are approximate), then
   `node capture.mjs cut rec/session.mkv <start> <seconds> NN-name`.
