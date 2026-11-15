# Trailer captures (T054)

Clean, continuous 1920×1080 shots of the **real Unity WebGL host** for the T053 marketing trailer. Nothing was
staged or composited: every clip is the host as the game renders it on `main`, during one real session with five
phone clients (call signs Ada, Yuri, Sally, Neil, Mae) voting.

## How they were recorded

- **No Unity Editor on the capture machine**, so the brief's Unity Recorder route was replaced by recording the
  shipped WebGL build (`docs/play/host/`) served locally by `server/` (`npm run start:hosted`, port 10000).
- Host: system Google Chrome, headed, fullscreen on a 1920×1080 display, `--use-angle=d3d11
  --enable-gpu-rasterization --ignore-gpu-blocklist`. WebGL renderer confirmed as
  `ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU, Direct3D11)`, not SwiftShader. The page's own render cap
  (1080 lines) means the canvas is exactly 1920×1080; the host ran at about 110 fps (rAF) while recording.
- Capture: ffmpeg `ddagrab` (Windows Desktop Duplication) at **60 fps** for the whole session into one
  near-lossless master (x264 crf 12), mouse cursor not drawn. This was chosen after measuring the alternatives:
  CDP `Page.startScreencast` delivered ~40 fps with bursty 8–83 ms gaps, and Playwright `recordVideo` is 25 fps.
  Clips were checked with `mpdecimate`: 295 of 300 frames unique in a 5 s clip, i.e. real 60 fps motion, no
  duplicated-frame stutter.
- Each clip is cut from the master and encoded `libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 60`, no audio.
- Phase changes the host has no button for on `main` (Briefing → Contract → Build) used the host's own
  **PageDown** "next phase" shortcut (`HostNavigator.cs`). The briefing and contract-vote screens still show
  placeholder dashes (`— $M`, `— days`), so they were skipped.
- Script: [`capture.mjs`](capture.mjs) (launch, drive, record, `cut`). Contact sheet:
  [`orchestration/evidence/T054/contact-sheet.jpg`](../../../orchestration/evidence/T054/contact-sheet.jpg).

## Clips

All clips: 1920×1080, 60 fps source and output, H.264 High, yuv420p, no audio.

| File | Screen | What it shows | Duration |
| --- | --- | --- | --- |
| `02-room-open-qr-code.mp4` | Title → room open | "Mission room open" card with QR code and room code SJLZ, "0 crew joined", rocket climbing over Earth behind | 5.0 s |
| `03-room-to-lobby-transition.mp4` | Title → Lobby | Host presses Open lobby; the room card dissolves into the Lobby screen | 4.0 s |
| `04-lobby-crew-joining.mp4` | Lobby | Crew avatars pop into the seats one by one as phones join (Ada, Yuri, Sally, Neil) | 6.0 s |
| `05-build-bay-arrival.mp4` | Build Bay | Launch pad at dusk, first vote "Launch site" opening with its countdown ring | 5.0 s |
| `06-build-bay-vote-tally.mp4` | Build Bay | Vote 4 "Attitude control": Inspect ends, Vote opens and the tally bar fills 0 → 5 of 5 voted | 5.0 s |
| `07-build-bay-exploded-view.mp4` | Build Bay | Exploded view (X) on the half-built rocket: parts separate with labels (engines, interstage, upper stage, payload) | 6.0 s |

## Re-recording

1. `cd server && npm ci && npm run build && PORT=10000 RENDER_EXTERNAL_URL=http://localhost:10000 npm run start:hosted`
2. In a scratch folder outside the repo: `npm i playwright ffmpeg-static`, copy `capture.mjs`, run `node capture.mjs`
   on a Windows machine with a 1920×1080 display. Keep notifications and other windows off the screen.
3. Find in/out points by looking at frames of `rec/session.mkv` (marks in `marks.log` are approximate), then
   `node capture.mjs cut rec/session.mkv <start> <seconds> NN-name`.
