# Demo videos

Two cuts for the NASA Space Apps submission. Both follow `submission/DEMO_VIDEO_SCRIPT.md`, adapted to the footage that could be
recorded on 2026-11-15 without a GPU machine or real phones.

| File | Length | Format | Size |
|---|---|---|---|
| `missionforge-demo-2min.mp4` | 2:00.0 | H.264 High, 1920x1080, 30 fps; AAC 48 kHz stereo | about 37.6 MB |
| `missionforge-demo-30s.mp4` | 0:30.0 | H.264 High, 1920x1080, 30 fps; AAC 48 kHz stereo | about 11.8 MB |

Review stills (full 1920x1080 frames taken from the finished files) are in `stills/`: `2min-01-9s.png` to `2min-04-116s.png`
and `30s-01-2_5s.png` to `30s-04-27_5s.png` (the number in the name is the time in the video).

## What is real and what is scripted

- **Phone footage is the real phone client** (`client/`, production build served by `vite preview`), recorded at 390x844 CSS px,
  device pixel ratio 2, by a Chrome DevTools screencast driven from Playwright. Nothing on the phone screens is mocked up or edited.
- **The phone session is the scripted demo session** (`?mock=1`, `client/src/net/mock.ts`). An in-page stand-in for the room server
  and host plays four bot crew members. Every number it sends (budget, delta-v on the phone dashboard, tallies, debrief score
  8,579, grade A, "Mission success") is an invented demo value, not a simulation result. The video says so on every phone shot
  from that session ("scripted demo session (?mock=1)") and on the debrief shot. My inputs (join, prediction, votes, veto, ping,
  GO call, Max Q callout) were sent by a Playwright script; the Max Q Throttle Bucket throttle was moved by a small script that
  reads the minigame's own status (over / under / in band) and presses the arrow keys.
- **Three minigames come from the minigame lab** (`client/e2e/minigames/orbit/lab.html?mg=...&auto=1&seed=7`): Solar Wing Deploy
  (MG-15), Ground Station Pass (MG-13) and Science Capture (MG-21), played by each minigame's built-in scripted test player.
  The lab runs the same minigame code as the phone, without the session around it. The shots are labelled as such.
- **Big-screen (Unity host) images are stills**, not live video: the headless WebGL host renders at under 1 fps, and no GPU machine
  was available. They are existing captures in `orchestration/evidence/`. The Build Bay stills are a rehearsal build with simulated
  voters (the chrome says REHEARSAL and Reconnecting), and the video says "rehearsal build with simulated voters" on each.
  The lobby still ran against the stub room server with 5 test players. Slow push-ins (Ken Burns) were added in editing.
- **Not shown as working:** the big-screen briefing, flight, orbit map and debrief screens. They are in the Unity source on main
  (the briefing since T027, merged after these videos were made) but not in the hosted WebGL build, and no capture of them was used
  (see `PROJECT_DESCRIPTION.md` section 8). Flight and debrief are shown on the phone only, and the 2-minute end card says
  "Big-screen briefing, flight and debrief views are in development."
- Numbers in captions come from the data: C1 Earth Watch is 150 kg, 550 km Sun-synchronous orbit, 97.6 degrees, 90 M
  game-dollars, 180 days (`data/contracts.json`); 22 part votes; 10 roles; 32 minigames; 6 languages. Costs are called game-dollars.

## Shot list: 2-minute cut

Times are in the finished file; neighbouring shots overlap by a 0.5 s crossfade.

| # | Time (s) | Shot | Source |
|---|---|---|---|
| 1 | 0.0-5.5 | Title over key art | `assets/media/key-art/missionforge-16x9.png` (AI-generated) |
| 2 | 5.0-13.0 | The challenge: mass, power, budget, instruments, orbit, communications; C1 contract numbers | `assets/media/cinematics/c1-earth-watch-briefing.mp4` seconds 0-8 (AI-generated, labelled on screen) |
| 3 | 12.5-16.0 | Host title screen | `orchestration/evidence/T031/after/title-after-1920x1080.png` (cropped to the logo) |
| 4 | 15.5-20.0 | Host lobby: room code and QR | `orchestration/evidence/T031/after/lobby-after-1920x1080.png` |
| 5 | 19.5-26.0 | Phone: join with a call sign, lobby | session recording 0.3-6.8 s |
| 6 | 25.5-31.0 | Phone: role card (BOOSTER + STRUCT) | session 8.4-13.9 s |
| 7 | 30.5-39.0 | Build Bay dashboard: delta-v 9,718 m/s against 9,700 needed, TWR, cost, schedule, power, data | `orchestration/evidence/T031/after/buildbay-after-1920x1080.png` |
| 8 | 38.5-47.5 | Phone part cards: stats, explain sheet, drawbacks, "Over budget by $8.4 M" | session 24.4-33.4 s |
| 9 | 47.0-53.5 | Build Bay "If chosen" deltas on the fairing vote | `orchestration/evidence/T031/after/buildbay-assembly-1920x1080.png` |
| 10 | 53.0-61.5 | Phone: vote cast, live tally, result, readiness dashboard | session 45.7-49.7, 63.4-64.9, 65.3-68.3 s |
| 11 | 61.0-64.0 | Build Bay compare tool | `orchestration/evidence/T015/05-compare-1920x1080.png` |
| 12 | 63.5-67.0 | Finished vehicle on the pad | `orchestration/evidence/T031/after/buildbay-complete-vehicle-beauty-1920x1080.png` |
| 13 | 66.5-74.0 | Phone: Flight Readiness Review, GO / NO-GO | session 179.8-187.3 s |
| 14 | 73.5-79.5 | Phone flight console: Max Q alert, Good Call | session 204.9-210.9 s |
| 15 | 79.0-85.0 | Minigame MG-08 Max Q Throttle Bucket | session 223.6-229.6 s |
| 16 | 84.5-89.0 | Minigame MG-15 Solar Wing Deploy | lab recording `MG-15` 1.5-6.0 s |
| 17 | 88.5-93.0 | Minigame MG-13 Ground Station Pass | lab recording `MG-13` 3.5-8.0 s |
| 18 | 92.5-97.0 | Minigame MG-21 Science Capture | lab recording `MG-21` 4.0-8.5 s |
| 19 | 96.5-105.0 | Phone debrief: score count-up, awards, then 4 facts with their sources | session 260.8-265.0, 271.2-275.5 s |
| 20 | 104.5-112.5 | Two phones: Arabic (right to left) role card and part card; settings to 200 % text and high contrast | Arabic session recording 9-12, 25.4-30.3 s; session 290.5-298.5 s |
| 21 | 112.0-120.0 | End card with disclosures | key art |

## Shot list: 30-second cut

| # | Time (s) | Shot | Source |
|---|---|---|---|
| 1 | 0.0-5.0 | "Every space mission is a set of trade-offs." over key art | key art 16:9 |
| 2 | 4.5-9.0 | Host lobby: "Scan a code. Your phone becomes mission control." | T031 lobby still |
| 3 | 8.5-13.5 | Build Bay fairing vote: "Vote on every part" | T031 Build Bay assembly still |
| 4 | 13.0-17.0 | Phone part card with drawbacks and over-budget warning | session 29.6-33.6 s |
| 5 | 16.5-19.5 | MG-08 Max Q Throttle Bucket | session 225-228 s |
| 6 | 19.0-22.0 | MG-15 Solar Wing Deploy | lab recording |
| 7 | 21.5-24.5 | MG-21 Science Capture | lab recording |
| 8 | 24.0-30.0 | End card with disclosures | key art |

## Narration, music and licensing

- **No voice.** No voice tool was available, so all narration is on-screen captions (sentence case, 58-70 px headlines and
  34-38 px body text on a 1080p frame). A team member can record the narration from `DEMO_VIDEO_SCRIPT.md` later and mix it in.
- **No music.** The soundtrack is a quiet ambient pad (low sine chord with slow swells plus low-passed brown noise, about
  -30 dB mean level) generated by ffmpeg's `aevalsrc` and `anoisesrc` filters in the build script. It contains no third-party
  or copyrighted audio and needs no licence. Replace or mute it freely.
- The key art and the briefing film are AI-generated (Higgsfield, Google Gemini; see `AI_DISCLOSURE.md` and
  `assets/media/CREDITS.md`). The host title and lobby stills show the Earth imagery credit line of the game
  (NASA Visible Earth; clouds Solar System Scope, CC BY 4.0) only partly or not at all because of cropping; the full credits are
  on the credits page. No NASA logo or insignia is used.

## How it was made

Tools: Node 24, Playwright (Chromium, from `client/node_modules`), ffmpeg 6.1.1 (gyan.dev essentials build via the free
`ffmpeg-static` npm package), all run on Windows 11. The scripts are in `scripts/`:

| Script | What it does |
|---|---|
| `cast.mjs` | Chrome DevTools screencast recorder: saves each painted frame with its timestamp and converts the frames into a constant 30 fps H.264 file, plus a marker file |
| `record-session.mjs` | Plays the whole `?mock=1` session at speed 1 with human pacing (about 5 minutes) |
| `record-labs.mjs` | Records minigame labs with `auto=1`, and the Arabic session (`localStorage mf.prefs = {lang:"ar"}`) |
| `overlay.html`, `scenes.mjs`, `build.mjs` | Captions, phone frames and the scene lists; renders the overlays with Chromium, each scene with ffmpeg (zoompan on stills, phone clips composited in a phone frame), then joins scenes with 0.5 s crossfades and the generated pad. Encode: libx264 CRF 18, preset slow, `+faststart` |

To rebuild: `npm run build` and `npx vite preview --port 4173` in `client/` (and `npx vite --port 5199` for the labs), then
`node record-session.mjs`, `node record-labs.mjs MG-15 MG-13 MG-21 ar`, and `node build.mjs 2min` / `node build.mjs 30s`.
The scripts use absolute paths under `%TEMP%\demo-video\`; adjust `W`, `REC` and `FFMPEG` at the top of each file.

## Subtitles

Four SubRip files in `subtitles/`, one per cut and language:

| File | Cues | Language |
|---|---|---|
| `missionforge-demo-2min.en.srt` | 54 | English |
| `missionforge-demo-2min.ar.srt` | 54 | Modern Standard Arabic |
| `missionforge-demo-30s.en.srt` | 14 | English |
| `missionforge-demo-30s.ar.srt` | 14 | Modern Standard Arabic |

- **What they say.** The headline and body text of each on-screen caption, in the same words. Left out: the small source and
  disclosure labels ("Big screen - Unity Build Bay, rehearsal build...", "Phone client, scripted demo session..."), the kicker lines,
  and the small print on the end cards except the two sentences that say the key art is AI-generated and that the project is not
  affiliated with NASA. Those labels stay readable on screen. Each cue is at most two lines of about 42 characters and 1 to 7 s long;
  a long caption is split into several cues, so reading speed is high on the short scenes (it mirrors the captions on screen).
- **Timing.** Scene `i` starts at the sum of the earlier scene lengths minus 0.5 s per crossfade (`XF` in `scripts/build.mjs`); a cue
  window runs from one crossfade midpoint to the next. The timeline was checked against the finished MP4 files: the position of
  all 27 crossfades (20 in the 2-minute cut, 7 in the 30-second cut) was measured from the pixels and is within 0.05 s of the
  computed one (`orchestration/evidence/T049/timeline-check.txt`). Both files are exactly 120.0 s and 30.0 s long.
- **Arabic.** Same cue times as English. Game terms follow `data/strings/ar*.json` and `client/src/i18n/strings/ar.*.json`
  (Build Bay = ورشة البناء, call sign = الاسم الرمزي, role card = بطاقة الدور, control console = وحدة التحكم, crew = الطاقم,
  "If chosen" = إن تم اختياره, minigame names as in `ar.minigame.json`). MissionForge, NASA, Unity, Team Winton, the role names
  (FLIGHT, BOOSTER, ...), GO / NO-GO, Max Q, Isp, Δv and the units (km, kg, M, °, %) stay in Latin script. A left-to-right mark
  is placed around every number with a unit so that "550 km" is not shown as "km 550" in right-to-left text. Translated by an AI
  coding agent, not reviewed by a native speaker.
- **Regenerate and check:** `node submission/video/subtitles/build-srt.mjs` (text in `cues.mjs`, durations imported from
  `scripts/scenes.mjs`), then `node submission/video/subtitles/validate-srt.mjs` (numbering, time format, no overlaps, 1-7 s cues,
  two lines of at most 44 characters, same cue times in both languages).
- **Upload to YouTube:** YouTube Studio, Content, open the video, Subtitles, Add language, English (or Arabic), Upload file,
  With timing, choose the matching `.srt`, Publish. Use the `2min` files for the 2-minute video and the `30s` files for the
  30-second video. The files are UTF-8 and use `\n` line ends.
- **Known limitation.** The videos already carry on-screen captions and no narration, so the subtitles repeat them. On the
  big-screen stills the caption sits in the bottom band, which is also where subtitles appear, so the two overlap while the subtitle
  track is on (see `orchestration/evidence/T049/30s-en-11s.png`). On the phone scenes the captions are in the left column and do not
  collide. Viewers can drag the caption on YouTube; the subtitles are there for accessibility and for the Arabic translation, not as
  the primary reading layer.
- **Proof.** Burned-in 20 s low-resolution previews (not committed): `ffmpeg -ss <t> -t 20 ... -vf scale=960:540,subtitles=<file>.srt`
  of the 30-second cut (0 to 20 s) and the 2-minute cut (60 to 80 s), three frames each, in `orchestration/evidence/T049/`
  (`30s-en-*.png`, `2min-en-*.png`). The cue changes line up with the on-screen scene changes. Arabic frames
  (`2min-ar-11s.png`, `2min-ar-50s.png`, `30s-ar-11s.png`) were drawn with `orchestration/evidence/T049/render-ar-frame.mjs`
  (Chromium over the real video frame), because the ffmpeg-static build used for the previews has no complex text shaping and draws a
  box inside words with the lam-alef letter pair; a browser, YouTube and VLC shape them correctly.

## Cover image

`submission/media/cover-16x9.png` (1920x1080 PNG) and `submission/media/thumbnail-1280x720.jpg` (1280x720 JPEG, about 0.2 MB,
for the YouTube thumbnail and the submission form). Built only from material in the repository:

- the key art `assets/media/key-art/missionforge-16x9.png` (AI-generated, already listed in `AI_DISCLOSURE.md` and
  `assets/media/CREDITS.md`),
- a real Unity host capture, `orchestration/evidence/T031/after/buildbay-assembly-1920x1080.png` (Build Bay, rehearsal build with
  simulated voters, labelled as such on the cover),
- a real phone-client screenshot, `orchestration/evidence/T038/after/09-part-card.png`,
- the title "MissionForge" and the line "Design a satellite mission together. Phones in hand, one big screen."

No new AI-generated element was added, so `AI_DISCLOSURE.md` is unchanged. To rebuild: `cd client && npm ci` once, then
`npx playwright install chromium` if Chromium is missing, then `node submission/media/build-cover.mjs` (layout in
`submission/media/cover.html`; the script writes both files and lowers the JPEG quality if it ever exceeds 1.8 MB).

## Not included, and what would improve it

- **No live big-screen video.** The Unity host appears only as stills; a 1920x1080 screen recording of the host on a GPU laptop
  (title, New mission, lobby filling, a Build Bay vote with the crane) would replace shots 3, 4, 7, 9, 11 and 12.
- **No real-room phone footage.** All phone shots come from the scripted session or the lab; a recording with real phones
  joining the real room server would replace them, and would give a real, computed debrief score.
- **No pilot seat** (`&seat=pilot`) shot: the quick recording stopped at the role card, and there was no time to redo it.
- **No QR scan shown on a physical phone.**
- The Arabic text was translated by AI coding agents and has not been reviewed by a native speaker (see `AI_DISCLOSURE.md`).
