# MissionForge trailer (T053)

| File | Length | Format | Size |
|---|---|---|---|
| `missionforge-trailer-16x9.mp4` | 56.0 s | H.264 High, 1920x1080, 30 fps; AAC 48 kHz stereo 192 kb/s | 25.8 MB |
| `missionforge-trailer-9x16.mp4` | 26.0 s | H.264 High, 1080x1920, 30 fps; AAC 48 kHz stereo 192 kb/s | 13.6 MB |

A fast, music-driven trailer for social media, the submission page and the start of the pitch. It cuts on the beat of an
original 120 BPM track (1 beat = 0.5 s), so every shot is 0.5 to 2 s long (the end card is longer). Review contact sheets
(one frame every 2 s) are in `orchestration/evidence/T053/`.

## Decisions (made without asking, as instructed)

- **No new AI shots.** Higgsfield was not available on this machine. Mood shots reuse the AI material that is already
  in the repository and already disclosed: the 16:9 key art, style frames `03-ascent.png`, `04-orbit-operations.png` and
  `06-mission-control.png`, and the C1 briefing cinematic. Each has a small **"AI-generated"** label in the bottom-right
  corner while it is on screen. They are never presented as gameplay.
- **Big-screen footage comes only from the current WebGL host.** Most of it is the T054 1080p60 GPU captures
  (`assets/media/trailer-captures/`, merged in #211): the title with the rocket over Earth, room open with its QR code, crew joining the lobby,
  Build Bay arrival, a vote tally, the first 0.6 s of the exploded-view clip (before the parts separate, because their labels overlap), boosters
  attaching and the full stack on the pad. Close-ups of the stack stay clear of the vote panel, where "Aerodynamic control" wraps
  mid-word. Two T027 pre-flight screens (the
  mission briefing and "GO for launch" from the Flight Readiness Review) are shown as stills with a slow push-in, labelled
  **"Big screen"**. They are real 1080p host renders from `orchestration/evidence/T027/` (rehearsal room, merged on main, not yet in
  the published WebGL build). One T031 Build Bay
  still (no UI) is also used. The host's flight, orbit and debrief screens are still placeholders in the published build, so
  the trailer shows **no host flight footage**. Earlier flight-view stills in `orchestration/evidence/T016` were left out for
  that reason. Launch and orbit beats use the phone flight console (countdown, Max Q alert, Max Q minigame), the
  minigames, the title-screen rocket over Earth, and labelled AI mood shots. The Scale view and the "Fuel cells" vote card
  are avoided because the host font has missing glyphs there. The 60 fps captures are resampled to 30 fps.
- **Phone footage is the real phone client.** It is recorded by Chrome DevTools screencast at 390x844 CSS px (x2), and shown in a
  drawn device frame, with 1 to 3 phones on screen. Part cards, votes, GO/NO-GO, the role card, debrief and accessibility come from the
  scripted demo session (`?mock=1`). Every shot from that session carries the corner label **"Scripted demo session"**.
  Its numbers are invented demo values, so no number from it is used as a claim. The debrief appears for 1 s only.
  The minigames come from the minigame labs, played by each minigame's built-in scripted good player (`auto=1`).
  These are the same minigame components the phone runs. MG-14, MG-16, MG-20, MG-06, MG-03 and MG-02 were recorded for this
  task (`scripts/record-minigames.mjs`), and the rest reuse the recordings of the demo video (`submission/video/`).
- **Music.** I could not download a licensed royalty-free track: Pixabay returned HTTP 403 to the command-line client and the
  public-domain fallback page returned 404. So the soundtrack is **original and synthesized from scratch** by
  `scripts/music.mjs`. It is 120 BPM in A minor (Am-F-C-G), with kick, clap, hats, bass, arpeggio, pad, risers and impacts, and
  uses no samples, no third-party audio, no voices and no AI audio model. It is credited in `assets/media/CREDITS.md`, and
  the AI-written script is noted in `submission/AI_DISCLOSURE.md`. Integrated loudness of the final mix is about -14 LUFS, with a 2.5 s fade-out.
- **On-screen numbers.** These are only "32 minigames" (`data/minigames.json` has 32 entries) and "6 languages" (en, ar, es, fr, pt, hi
  in `data/strings/` and `client/src/i18n/strings/`). The numbers inside the host captures (readiness panel, costs, vote tallies)
  are what the game computed during T054's real five-phone session. The numbers on phone shots come from the scripted session. No
  caption points at them, and no phone shot is longer than 2 s. The debrief score is visible for about 1 s, with the "Scripted demo session" label.
- **Style.** The palette and fonts are the game's: space `#071522`, signal teal `#55C5CD`, sunlight `#FFCE83`, Oxanium 700 for
  kinetic type and IBM Plex Sans for small text. The grade adds teal shadows and warm highlights, a soft screen-blend glow, a vignette and light
  temporal grain. Transitions are hard cuts on the beat, plus short `xfade` whips (smoothleft, 0.2 s), zoom (zoomin), white
  flashes on the musical impacts, and fades. Each shot also gets an eased push-in or pull-out, and many get a 0.06 to 0.08 "punch" zoom on the beat.
  The punch moves the picture only; type, labels and device frames stay still. Speed ramps run the host clips
  at up to x2.5 and the minigames at x1.3 to x1.6. The 9:16 cut shows host screens at full width over a blurred copy of themselves,
  so that no UI is cropped.

## Beat sheet: 16:9 (56 s, 112 beats)

| # | Time (s) | In | Kind | Source | Text on screen | Corner label |
|---|---|---|---|---|---|---|
| 1 | 0.0-1.0 | cut | Host | T054 capture 01-title-rocket-over-earth.mp4 @ 0.5s |  |  |
| 2 | 1.0-1.5 | cut | Host | T054 capture 09-build-bay-full-stack-on-pad.mp4 @ 1s |  |  |
| 3 | 1.5-2.0 | cut | Host | T054 capture 08-build-bay-boosters-attach.mp4 @ 2s |  |  |
| 4 | 2.0-4.0 | flash | AI | assets/media/cinematics/c1-earth-watch-briefing.mp4 @ 1s | DESIGN IT. / BUILD IT. / FLY IT. | AI-generated |
| 5 | 4.0-5.0 | whip | Host | T054 capture 02-room-open-qr-code.mp4 @ 0.4s | ONE BIG SCREEN. |  |
| 6 | 5.0-6.0 | cut | Host | T054 capture 04-lobby-crew-joining.mp4 @ 1.2s ramp x2.5→x1 |  |  |
| 7 | 6.0-8.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 0.8s; %TEMP%/demo-video/rec/session.mp4 @ 5s; %TEMP%/demo-video/rec/session.mp4 @ 10s | EVERY PHONE A CONSOLE. | Scripted demo session |
| 8 | 8.0-9.5 | zoom | Host | evidence/T031/after/buildbay-beauty-no-ui-after-1920x1080.png | PICK EVERY PART. |  |
| 9 | 9.5-11.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 28s x1.2 | REAL ENGINES. / REAL TRADE-OFFS. | Scripted demo session |
| 10 | 11.0-12.0 | cut | Host | T054 capture 05-build-bay-arrival.mp4 @ 3s |  |  |
| 11 | 12.0-13.0 | whip | Phone | %TEMP%/demo-video/rec/session.mp4 @ 54.5s x0.8 | MASS. | Scripted demo session |
| 12 | 13.0-14.0 | cut | Host | T054 capture 08-build-bay-boosters-attach.mp4 @ 0.3s x1.3 |  |  |
| 13 | 14.0-15.0 | cut | AI | assets/media/style/frames/04-orbit-operations.png | POWER. | AI-generated |
| 14 | 15.0-16.0 | cut | Phone | %TEMP%/demo-video/rec/MG-18.mp4 @ 3s x1.2 (Eclipse Power Juggle) |  |  |
| 15 | 16.0-17.0 | whip | Phone | %TEMP%/demo-video/rec/session.mp4 @ 31s | BUDGET. | Scripted demo session |
| 16 | 17.0-18.0 | cut | Host | T054 capture 07-build-bay-exploded-view.mp4 @ 0s x0.6 |  |  |
| 17 | 18.0-19.0 | whip | Phone | %TEMP%/demo-video/rec/MG-14.mp4 @ 0.6s x1.3 (Debris Dodge) | ORBIT. |  |
| 18 | 19.0-20.0 | cut | Host | T054 capture 01-title-rocket-over-earth.mp4 @ 2.5s |  |  |
| 19 | 20.0-21.0 | whip | Phone | %TEMP%/demo-video/rec/MG-13.mp4 @ 6s x1.4 (Ground Station Pass) | COMMS. |  |
| 20 | 21.0-22.0 | cut | Host | evidence/T027/briefing_frame1.png |  | AI-generated |
| 21 | 22.0-24.0 | zoom | Phone | %TEMP%/demo-video/rec/session.mp4 @ 45.5s; %TEMP%/demo-video/rec/session.mp4 @ 49s; %TEMP%/demo-video/rec/session.mp4 @ 63.5s | VOTE TOGETHER. | Scripted demo session |
| 22 | 24.0-25.0 | cut | Host | T054 capture 06-build-bay-vote-tally.mp4 @ 1s x2 |  |  |
| 23 | 25.0-26.0 | whip | Phone | %TEMP%/demo-video/rec/session.mp4 @ 180.5s; %TEMP%/demo-video/rec/session.mp4 @ 188s | GO / NO-GO? | Scripted demo session |
| 24 | 26.0-27.0 | cut | Host | evidence/T027/frr_go.png |  |  |
| 25 | 27.0-28.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 191.5s |  | Scripted demo session |
| 26 | 28.0-29.0 | flash | AI | assets/media/style/frames/03-ascent.png | LAUNCH. | AI-generated |
| 27 | 29.0-30.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 205.6s |  | Scripted demo session |
| 28 | 30.0-31.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 221s x1.5 (Max Q Throttle Bucket) |  | Scripted demo session |
| 29 | 31.0-32.0 | cut | Host | T054 capture 01-title-rocket-over-earth.mp4 @ 4s |  |  |
| 30 | 32.0-32.5 | whip | Phone | %TEMP%/demo-video/rec/MG-15.mp4 @ 1s x1.6 (Solar Wing Deploy) |  |  |
| 31 | 32.5-33.0 | cut | Phone | %TEMP%/demo-video/rec/MG-16.mp4 @ 13s x1.6 (Station Docking) |  |  |
| 32 | 33.0-33.5 | cut | Phone | %TEMP%/demo-video/rec/MG-14.mp4 @ 0.6s x1.6 (Debris Dodge) |  |  |
| 33 | 33.5-34.0 | cut | Phone | %TEMP%/demo-video/rec/MG-21.mp4 @ 5s x1.6 (Science Capture) |  |  |
| 34 | 34.0-34.5 | whip | Phone | %TEMP%/demo-video/rec/MG-06.mp4 @ 3s x1.6 (Shake Table) |  |  |
| 35 | 34.5-35.0 | cut | Phone | %TEMP%/demo-video/rec/MG-03.mp4 @ 1.5s x1.6 (Weld Inspector) |  |  |
| 36 | 35.0-35.5 | cut | Phone | %TEMP%/demo-video/rec/MG-20.mp4 @ 3s x1.6 (Deorbit Burn) |  |  |
| 37 | 35.5-36.0 | cut | Phone | %TEMP%/demo-video/rec/MG-13.mp4 @ 8s x1.6 (Ground Station Pass) |  |  |
| 38 | 36.0-36.5 | whip | Phone | %TEMP%/demo-video/rec/MG-02.mp4 @ 4s x1.6 (Rocket Equation Balance) |  |  |
| 39 | 36.5-37.0 | cut | Phone | %TEMP%/demo-video/rec/MG-18.mp4 @ 6s x1.6 (Eclipse Power Juggle) |  |  |
| 40 | 37.0-37.5 | cut | Phone | %TEMP%/demo-video/rec/MG-16.mp4 @ 19s x1.6 (Station Docking) |  |  |
| 41 | 37.5-38.0 | cut | Phone | %TEMP%/demo-video/rec/MG-21.mp4 @ 9s x1.6 (Science Capture) |  |  |
| 42 | 38.0-40.0 | cut | Phone | %TEMP%/demo-video/rec/MG-16.mp4 @ 21s; %TEMP%/demo-video/rec/MG-21.mp4 @ 11s; %TEMP%/demo-video/rec/MG-06.mp4 @ 6s | 32 MINIGAMES. |  |
| 43 | 40.0-42.0 | fade | AI | assets/media/cinematics/c1-earth-watch-briefing.mp4 @ 4s | REACH ORBIT. | AI-generated |
| 44 | 42.0-44.0 | cut | Phone | %TEMP%/demo-video/rec/MG-15.mp4 @ 2.6s (Solar Wing Deploy) |  |  |
| 45 | 44.0-45.0 | whip | Phone | %TEMP%/demo-video/rec/session.mp4 @ 261s |  | Scripted demo session |
| 46 | 45.0-46.0 | cut | Phone | %TEMP%/demo-video/rec/ar.mp4 @ 26s; %TEMP%/demo-video/rec/session.mp4 @ 296s | 6 LANGUAGES. | Scripted demo session |
| 47 | 46.0-48.0 | cut | Host | T054 capture 08-build-bay-boosters-attach.mp4 @ 3s | YOUR MISSION. / YOUR CALL. |  |
| 48 | 48.0-50.0 | flash | AI | assets/media/key-art/missionforge-16x9.png | MissionForge title | AI-generated |
| 49 | 50.0-56.0 | cut | End card | assets/media/key-art/missionforge-16x9.png | URL, QR, credits line |  |

16:9: 49 shots: 15 host + 28 phone = 43 real gameplay (88 %), 5 AI mood shots, 1 end card.

## Beat sheet: 9:16 (26 s, 52 beats)

| # | Time (s) | In | Kind | Source | Text on screen | Corner label |
|---|---|---|---|---|---|---|
| 1 | 0.0-1.0 | cut | Host | T054 capture 01-title-rocket-over-earth.mp4 @ 0.5s |  |  |
| 2 | 1.0-2.0 | flash | AI | assets/media/cinematics/c1-earth-watch-briefing.mp4 @ 1s | BUILD IT. / FLY IT. | AI-generated |
| 3 | 2.0-3.0 | whip | Host | T054 capture 02-room-open-qr-code.mp4 @ 0.4s | ONE BIG / SCREEN. |  |
| 4 | 3.0-4.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 1s | EVERY PHONE / A CONSOLE. | Scripted demo session |
| 5 | 4.0-5.0 | whip | Phone | %TEMP%/demo-video/rec/session.mp4 @ 54.5s x0.8 | MASS. | Scripted demo session |
| 6 | 5.0-6.0 | cut | Host | T054 capture 08-build-bay-boosters-attach.mp4 @ 0.3s x1.3 | BUILD IT / TOGETHER. |  |
| 7 | 6.0-7.0 | cut | Phone | %TEMP%/demo-video/rec/MG-15.mp4 @ 3.2s x1.3 (Solar Wing Deploy) | POWER. |  |
| 8 | 7.0-8.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 31s | BUDGET. | Scripted demo session |
| 9 | 8.0-9.0 | whip | Phone | %TEMP%/demo-video/rec/MG-14.mp4 @ 0.6s x1.3 (Debris Dodge) | ORBIT. |  |
| 10 | 9.0-10.0 | cut | Phone | %TEMP%/demo-video/rec/MG-13.mp4 @ 6s x1.4 (Ground Station Pass) | COMMS. |  |
| 11 | 10.0-11.0 | zoom | Phone | %TEMP%/demo-video/rec/session.mp4 @ 45.5s; %TEMP%/demo-video/rec/session.mp4 @ 63.5s | VOTE TOGETHER. | Scripted demo session |
| 12 | 11.0-12.0 | cut | Host | T054 capture 06-build-bay-vote-tally.mp4 @ 1s x2 | ON THE / BIG SCREEN. |  |
| 13 | 12.0-13.0 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 180.5s | GO / NO-GO? | Scripted demo session |
| 14 | 13.0-14.0 | cut | Host | evidence/T027/frr_go.png | GO FOR / LAUNCH. |  |
| 15 | 14.0-15.0 | flash | AI | assets/media/style/frames/03-ascent.png | LAUNCH. | AI-generated |
| 16 | 15.0-15.5 | cut | Phone | %TEMP%/demo-video/rec/session.mp4 @ 221s x1.5 (Max Q Throttle Bucket) |  | Scripted demo session |
| 17 | 15.5-16.0 | whip | Phone | %TEMP%/demo-video/rec/MG-16.mp4 @ 13s x1.6 (Station Docking) |  |  |
| 18 | 16.0-16.5 | cut | Phone | %TEMP%/demo-video/rec/MG-20.mp4 @ 3s x1.6 (Deorbit Burn) |  |  |
| 19 | 16.5-17.0 | cut | Phone | %TEMP%/demo-video/rec/MG-21.mp4 @ 5s x1.6 (Science Capture) |  |  |
| 20 | 17.0-17.5 | whip | Phone | %TEMP%/demo-video/rec/MG-06.mp4 @ 3s x1.6 (Shake Table) |  |  |
| 21 | 17.5-18.0 | cut | Phone | %TEMP%/demo-video/rec/MG-03.mp4 @ 1.5s x1.6 (Weld Inspector) |  |  |
| 22 | 18.0-18.5 | cut | Phone | %TEMP%/demo-video/rec/MG-16.mp4 @ 19s x1.6 (Station Docking) |  |  |
| 23 | 18.5-20.0 | cut | Host | T054 capture 01-title-rocket-over-earth.mp4 @ 2.5s | REACH / ORBIT. |  |
| 24 | 20.0-22.0 | flash | AI | assets/media/key-art/missionforge-16x9.png | MissionForge title | AI-generated |
| 25 | 22.0-26.0 | cut | End card | assets/media/key-art/missionforge-16x9.png | URL, QR, credits line |  |

9:16: 25 shots: 6 host + 15 phone = 21 real gameplay (84 %), 3 AI mood shots, 1 end card.

Host = Unity big-screen capture; Phone = real phone client; AI = AI-generated mood shot (labelled).

## Sources

| Key | File |
|---|---|
| Host video | `assets/media/trailer-captures/01`-`09` (T054; all except `03-room-to-lobby-transition.mp4`) |
| Host stills | `orchestration/evidence/T031/after/buildbay-beauty-no-ui-after-1920x1080.png`; `orchestration/evidence/T027/briefing_frame1.png` and `frr_go.png` (labelled "Big screen") |
| Phone session | `%TEMP%/demo-video/rec/session.mp4` and `ar.mp4` (recorded by `submission/video/scripts/record-session.mjs`, `record-labs.mjs ar`) |
| Minigames | `%TEMP%/demo-video/rec/MG-xx.mp4` (`submission/video/scripts/record-labs.mjs`, `scripts/record-minigames.mjs`) |
| AI mood shots | `assets/media/key-art/missionforge-16x9.png`, `assets/media/style/frames/03-ascent.png`, `04-orbit-operations.png`, `06-mission-control.png`, `assets/media/cinematics/c1-earth-watch-briefing.mp4` |
| Blurred backgrounds behind phones | host captures `01-title-rocket-over-earth.mp4` and `09-build-bay-full-stack-on-pad.mp4`, plus the T031 Build Bay still, blurred and darkened |

## Review

- **Contact sheets.** `orchestration/evidence/T053/contact-16x9.png` and `contact-9x16.png` show one frame every 2 s of the final
  files. I looked at every frame at full size (2x2 tiles at 1920 px).
- **Independent review.** A separate review agent extracted a frame every 0.5 s from both cuts and checked the brief's acceptance list.
  It found these problems in the first cut, and each one is fixed:
  - the "BUDGET." card sat over overlapping exploded-view labels;
  - the title and end card dissolved into a double logo (now a hard cut on the beat);
  - the drawn camera notch hid a letter of the app header (removed);
  - a "Tallying the mission" loading screen appeared in the debrief shot (starts later now);
  - two shots' words showed at once during whips (words now end where the transition starts);
  - large type sat over busy host UI (darker backing now);
  - the 9:16 cut had a text fragment "EVERY PHONE" and off-beat 0.33 s word changes;
  - "ORBIT." sat over the Deorbit Burn minigame (now Debris Dodge).
- **Confirmed by the review.** The review confirmed the format and size limits and the loudness. Every hard cut is within one frame of the
  0.5 s grid. Every AI shot is labelled, and every scripted-session phone shot is labelled. There is no "Reconnecting" text, no debug
  UI, no placeholder dashes, no missing-glyph boxes, no host flight screen and no Scale view. The QR code matches a QR freshly
  generated for the play URL module for module.

## How to rebuild

Tools: Node 22+, Playwright Chromium from `client/node_modules`, and ffmpeg 6.1.1 (the `ffmpeg-static` npm package, copied to
`%TEMP%/t053/tools/ffmpeg.exe`). You also need the `qrcode` npm package in `%TEMP%/t053/tools` (`npm i qrcode@1.5.4`). Set
`T053_TOOLS`, `T053_REC` or `FFMPEG` to use other locations.

1. `cd client && npm ci && npx playwright install chromium`
2. Phone recordings, in two steps. First, for the session: `npm run build && npx vite preview --port 4173`, then
   `node submission/video/scripts/record-session.mjs` and `node submission/video/scripts/record-labs.mjs MG-13 MG-15 MG-18 MG-21 ar`.
   Second, for the extra minigames: `npx vite --port 5199`, then `node submission/trailer/scripts/record-minigames.mjs MG-14 MG-16 MG-20 MG-06 MG-03 MG-02`.
   Recordings go to `%TEMP%/demo-video/rec/`.
   If you record new ones, check the in-points in `scripts/timeline.mjs`, because the session timing can shift by a second or two.
3. `node submission/trailer/scripts/build.mjs 16x9` and `node submission/trailer/scripts/build.mjs 9x16`. The script
   synthesizes the music, renders the overlays (`overlay.html`) frame by frame in Chromium, renders each shot with ffmpeg,
   then joins, grades and muxes. Each cut takes about 5 minutes. Use `--only=3,5` to re-render single shots and `--join-only` to rejoin.
4. Review: `node submission/trailer/scripts/contact-sheet.mjs submission/trailer/missionforge-trailer-16x9.mp4 orchestration/evidence/T053/contact-16x9.png`.

| Script | What it does |
|---|---|
| `music.mjs` | Synthesizes the soundtrack (two arrangements: `long` 28 bars, `short` 13 bars) |
| `timeline.mjs` | Both edit decision lists: shot sources, in-points, speed, camera moves, transitions, text |
| `overlay.html` | Kinetic type, device frames, labels, title and end card (with QR code), drawn for time *t* |
| `build.mjs` | The renderer described above |
| `record-minigames.mjs` | Records minigame labs with the scripted player |
| `contact-sheet.mjs` | One frame every 2 s into a labelled contact sheet |

## Known weaknesses

- **No host flight footage.** The biggest gap. Launch and orbit are carried by the phone flight console, the minigames, the title-screen rocket over Earth and AI mood shots, because the host flight, orbit and debrief screens are placeholders in the published WebGL build. When a host build with the real flight view (T016) is published and captured, it should replace the AI ascent frame (`03-ascent.png`, the "LAUNCH." beat) and the AI cinematic under "REACH ORBIT.".
- **Share of AI imagery by time.** AI shots are 5 of 49 shots, but about 8 s of the 50 s before the end card (16 %) in 16:9, and about 4 s of 22 s in 9:16. All of them are labelled.
- **Phone footage is the scripted demo session**, not a real room. Every shot from it is labelled, but a recording of real phones in a real room would be stronger.
- **Host close-ups are upscaled.** The 0.5 s close-ups of the rocket in the hook are crops of the 1080p capture zoomed 2.6x, so they are slightly soft. Elsewhere the host UI is shown nearly full frame, so that no UI text is cut.
- **The music is synthesized by a script**, with no mixing engineer. It was checked by its waveform, spectrum and loudness (-14.4 LUFS integrated, peak -3.7 dBFS in 16:9; -14.5 LUFS and -4.1 dBFS in 9:16), not by ear. Replace it with a licensed track if a person who listens to it does not like it. The cut points are on a 120 BPM grid, so any 120 BPM track lines up.
- **The phone and minigame recordings are not in the repository.** They are in `%TEMP%/demo-video/rec/`, and the scripts listed above re-record them. Re-recording can shift the in-points by a second or so.
