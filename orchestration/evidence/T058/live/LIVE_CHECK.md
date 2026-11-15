# T058 live check: hosted MissionForge (2026-11-15, about 10:25 to 10:49 UTC)

Target: https://missionforge-spaceapps.onrender.com. `/healthz` reported commit `d6fc7ba` (T050). That is one commit behind the local HEAD `001652e`, which changed docs only.
Method: headless Chromium with SwiftShader WebGL. The host ran in a 1920x1080 context. Two phones ran as 390x844 mobile contexts in a separate browser process. Driver: `live-driver.mjs` (this folder). Logs: `driver-run1.log`, `driver-run2.log`. Host WebSocket frames, without clock pings and with tokens redacted: `host-ws-frames-run2.jsonl`.
Run 1 (room NZAY) was abandoned at the lobby because phone screenshots timed out while sharing a browser with Unity. Run 2 (room FPKJ) is the main evidence.

## 1. URLs, room code, QR
- `GET /` returns 302 to `/play/`. The entry page has the title "MissionForge | Play" (`01-entry-desktop.png`).
- The "Host a mission" link goes to `/play/host/?server=wss%3A%2F%2Fmissionforge-spaceapps.onrender.com%2Fws` (title "MissionForge | Host screen").
- The phone join URL from `room.created` is `/play/client/?room=FPKJ` (run 1: `?room=NZAY`).
- The host title screen loads with "Room server: connected" (`03-host-title.png`). It shows New mission, Codex and Settings.
- After **New mission**, a "Mission room open" card shows a **QR code**, "Room code" **FPKJ/NZAY** in large letters, the text "Scan to join, or open the join page and type the code.", the host name `missionforge-spaceapps.onrender.com`, "0 crew joined" and an **Open lobby** button (`04-host-lobby-empty.png`).
- In the lobby the QR, the code and the host name are repeated under "Join this mission" (`08-host-lobby.png`).
- On the phone, the join screen opened from the link shows the code as 4 locked tiles labelled "Room code from your link", with a **Change** button, a Call sign field and **Join crew** (`05-phone1-join.png`).

## 2. Lobby
- Players: the host lobby says "**2 of 10 seats filled**" and shows 10 seat cards. The hint reads "Ready when you are. Three or more crew gives the full party feel." **Start briefing** was enabled with 2 players. Neither a maximum above 10 nor a minimum was tested. The entry page says "up to ten players".
- Roles: the lobby cards show "No role yet". The phone says "Consoles are dealt at random when the host locks roles." Host Mission settings offer Role assignment (Random / Player pick / Vote), Assist level (Cadet / Engineer / Flight Director), Vote timer (20 / 30 / 45 / 60 s) and Vote tallies (Open / Hidden).
- After Start briefing, each of the 2 players was dealt **5 consoles**. Phone 1 got FLIGHT (Flight Director), BOOSTER, STRUCT, GUIDO and PM. Phone 2 got FIDO, EECOM, INCO, PAYLOAD and RETRO. That is 10 console roles in total. Each card shows a real-world origin, an insight, a flight console and a once-per-mission ability, for example "Decision Time", "Hot-Fire Discount", "Reinforce", "Course Correct", "Emergency Funding" and "Window Extension" (`p1-snap02-screen-role.png`, `p2-snap02-screen-role.png`).
- Languages: the phone Settings offer **English, العربية (Arabic), Español, Français, हिन्दी (Hindi) and Português**, which is 6 languages, followed by the note "More languages are on the way." (`06b-phone1-settings.png`). The host "Settings & Accessibility" screen offers the same 6: English, Arabic, Spanish, French, Hindi and Portuguese (`03b-host-settings.png`; "Spanish" looks highlighted only because the mouse was hovering over it).
- Version labels: the phone Settings footer reads "MissionForge phone client 0.1.0 · protocol 1". The host sends `appVersion "0.1.0"` over the WebSocket, but no version label was seen on the host screens.

## 3. Session flow (how far it got)
- The host top-bar stepper reads: Lobby, Briefing, Contract, Build, FRR, Countdown, Flight, Debrief. All steps after the current one are locked.
- **Lobby**: the screen title is "LOBBY" (`08-host-lobby.png`).
- **Mission Briefing**: reached. The screen title is "MISSION BRIEFING" and the subtitle is "PRE-PHASE A · CONCEPT STUDIES / CAPCOM BRIEFS THE CREW ON THE CONTRACT". It has an Earth render and Objectives (Primary / Secondary / Stretch / Safety "Crewed only"). The Contract and Constraints panels were empty (see section 4) (`09-host-briefing.png`).
- **Contract Vote**: reached. The screen title is "CONTRACT VOTE" and the subtitle is "PRE-PHASE A · MISSION CONCEPT REVIEW / THE CREW PICKS ONE CONTRACT". It shows three cards, **Option A, Option B and Option C**, with no contract names or numbers filled in. It also has a Vote Tally panel ("— votes", "Not voted — players"), a Timer ("— s"), **START VOTE** and **LOCK CONTRACT** (`10-host-after-briefing.png`). During this phase the phones showed "Contract vote · Contract not chosen yet · Watch the big screen" (`p1-snap06-screen-build.png`).
- START VOTE was clicked at (1643, 842). No vote frame was seen leaving the host afterwards, and the phones never got a vote screen. The cause was not determined.
- **No contract names were seen**, and nothing past Contract Vote was reached: no Build, FRR, Countdown, Flight, Debrief, minigames or session timer. At 10:46:42 UTC the hosted server **restarted**: `/healthz` `startedAt` changed from 10:11:57 to 10:46:42 with the same commit. Room FPKJ was lost. Phone 1 fell back to the join screen (`p1-snap08-screen-join.png`), phone 2 showed "Connection lost. Reconnecting…" (`p2-snap08-screen-build.png`), and the host kept getting `HANDSHAKE_TIMEOUT` on reconnect. I stopped there because of the time box.

## 4. Errors, placeholders, debug text
- **Placeholder text appears on judge-facing host screens:**
  - Settings: "One-line explanation of the highlighted option · changes apply at once on the host and on every phone". The Audio sliders read "— %".
  - Briefing: "CONTRACT ANIMATION · LIVE 3D", "CAPCOM briefing line, one sentence at a time · always subtitled" under grey skeleton bars, Contract "Mission —", "Destination —", and Budget/Deadline/Payload/Orbit "— $M / — days / — t / — km".
  - Contract Vote: on all three cards, "Destination art · orbit sketch", "Destination · key requirement · special rule", "Contract —", "Difficulty —" and "—" values.
- Design-document section numbers show up as panel labels: "16 ACCESSIBILITY", "15 AUDIO", "5.2 OBJECTIVES", "5.1 CONTRACT", "2.2 BRIEFING", "5.1 LIMITS", "4.1 LIVE TALLY" and "4.1 VOTE". Some titles wrap inside a word: "CONTR / ACT" on Briefing and "TIM / ER" on Contract Vote.
- Host console: no `pageerror` or console `error` lines in either run, and no HTTP 4xx/5xx responses on the host page.
- Host console warnings:
  - `[UnityCache] Response is served without Content-Length header`, repeated many times.
  - "Shader 'Hidden/Universal Render Pipeline/Edge Adaptive Spatial Upsampling' is not supported or has been stripped … PostProcessing render passes will not execute."
  - "Additional Lights Cookie Format (GrayscaleHigh) is not supported".
  - SwiftShader GL performance messages.
- Phone console: no errors recorded.
- No broken images were seen in the screenshots. I did not check this programmatically.
- Host reconnects: the host disconnected repeatedly with `IDLE_TIMEOUT` and resumed, and the phone showed "Host screen disconnected. Game paused. 9:59" (`p2-snap05`). Most likely my own 1–3-minute host screenshots stalled the Unity main thread under software GL and blocked its pings, so treat this as a harness artifact, not a confirmed production bug. The host's "Reconnecting" badge is visible in `10-host-after-briefing.png`.

## 5. Static pages (curl)
| Path | HTTP | Title |
|---|---|---|
| `/` | 302 → `/play/` | n/a |
| `/play/` | 200 | MissionForge \| Play |
| `/play/guide.html` | 200 | How MissionForge works \| MissionForge |
| `/play/judges.html` | 200 | For judges \| MissionForge |
| `/play/credits.html` | 200 | Credits \| MissionForge |
| `/play/host/` | 200 | MissionForge \| Host screen |
| `/play/client/` | 200 | MissionForge |
| `/healthz` | 200 | `{"ok":true,"commit":"d6fc7ba…"}` |
The server was already warm, so there was no cold start (the first response took under 1 s). The entry page also links an Audience view (`client/?watch=1`) and an "Offline demo (no server)" (`client/?mock=1`). Neither was opened.

## NOT verified
- Contract names/numbers, voting mechanics and counts, Build, FRR/review, Countdown, Flight, Debrief, the phone minigames (names), the session timer and total session length.
- Behaviour with more than 2 or exactly 10 phones, and whether an 11th player is refused.
- Audience view, offline demo and the Codex. guide.html and judges.html were checked for status and title only, not their content.
- Why the server restarted at 10:46:42 (Render logs were not available to me), and whether the START VOTE click failed because of the harness or because of the app.
- How it renders on a real GPU. All host screenshots came from SwiftShader in headless mode.
