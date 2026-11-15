# MissionForge: live-demo run-sheet (hosted game)

For demoing <https://missionforge-spaceapps.onrender.com/play/> to judges. It is the short, rehearsable companion to the
35-minute full-session runbook in `RELEASE.md` section 5. Words to say are in `PRESENTER_SCRIPT.md`; questions are in `QA.md`.
Every time below was measured on 15 Nov 2026 against the live site unless it says **derived** or **not measured**
(rehearsal logs and screenshots: `orchestration/evidence/T052/`).

## 0. Read this first: what the live game does today

| Part | On the hosted game today | Use in the demo |
|---|---|---|
| Big-screen title, **New mission**, room code and QR | Works. The QR opens the phone page with the room code filled in (decoded from two live captures: `https://missionforge-spaceapps.onrender.com/play/client/?room=<CODE>`) | **Live** |
| Big-screen lobby: crew seats, settings, **Start briefing** | Works. Phones appear as seats within a few seconds | **Live** |
| Big-screen briefing (`BRIEFING`) and contract vote (`CONTRACT_VOTE`) | **Layout only**: the contract fields show dashes and placeholder text ("CAPCOM briefing line ..."), and "START VOTE" changed nothing on the big screen in 6 minutes of watching. The phones do move on (role card, then a build screen) | Show the briefing for 10 seconds, **do not press START VOTE** |
| Big-screen Build Bay with live votes | Not reached in a live room. The Build Bay exists as a scene (screenshots with simulated voters in `orchestration/evidence/T015/`) | Slide 5 only |
| Part votes, minigames, flight, debrief | On the **phones**. With the real host they need the big-screen host to drive them, which it does not do yet | Use the **phone mock session** `/play/client/?mock=1` (scripted bots, invented numbers) |

So the demo has two honest halves: **live** (big-screen lobby, QR, real phones joining, briefing) and **scripted** (the phone session
with bots). Say which is which, every time.

## 1. Kit

| Item | Why |
|---|---|
| Laptop, mains power, Chrome or Edge (desktop), a second window for the phone mock | The Unity host needs WebGL in a desktop browser |
| Projector or screen at 1920x1080 | The host UI is designed for 1920x1080 |
| Phone hotspot (own SIM) | Venue Wi-Fi often isolates clients or blocks WebSockets (`RELEASE.md` 5.1) |
| One spare phone, loaded at `.../play/client/?mock=1` | Phone session for the demo, and the fallback when nobody can join |
| The 2-minute video on the laptop and the phone: `submission/video/missionforge-demo-2min.mp4` (1920x1080, 2:00) | Fallback |
| The deck open in a tab: `submission/presentation/deck.html`, and the PDF `MissionForge-deck.pdf` on a stick | Slides |
| A second person to walk the room and help judges join | Joining is the slowest human step |

## 2. T-15 min: wake the free instance and open the room

The free Render instance sleeps after 15 minutes without visitors and takes about a minute to wake (`HOSTING.md`). Rooms live in memory,
so a room made earlier is gone if the instance restarted.

| T- | Do | Check |
|---|---|---|
| 15 | On the hotspot, run: `curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://missionforge-spaceapps.onrender.com/healthz` (or open the URL in a browser). Repeat every 20 s until it prints `200`. | Awake: `200` in about 1 s (measured 0.8 s). Asleep: a long wait, then `200` |
| 13 | Open `https://missionforge-spaceapps.onrender.com/play/`, click **Host a mission** (opens the big-screen host). Full screen with F11, browser zoom 100 %. | The Unity host loads: about 20 to 50 s in the rehearsal (software rendering; a GPU laptop is not measured) |
| 12 | When the title screen shows **Room server: connected**, click **New mission** **within 30 s**. | A 4-letter room code and a QR appear within about 1 s. If nothing happens, wait 5 s and click again (it happened once in six rehearsal runs, after a long idle on the title screen; the server drops a host that has not created a room after 30 s and the host reconnects by itself, `RELEASE.md` 5.5) |
| 11 | Click **Open lobby**. Check the settings: **Vote timer 20 s** (the shortest the host offers), **Vote tallies Open**, **Assist Engineer**. These were the defaults in every rehearsal run. | The lobby shows "Join this mission", the code, the QR and 10 empty seats |
| 10 | Helper joins with one test phone: scan the lobby QR. | The seat fills within a few seconds; the phone shows "You are in" |
| 8 | Load the phone mock in tab 3 or on the spare phone: `https://missionforge-spaceapps.onrender.com/play/client/?mock=1`. Do **not** start it yet. | The Join screen shows |
| 6 | Put the deck on slide 1. Use **one browser window with three tabs in this order: 1 deck, 2 host, 3 phone mock** (switch with Ctrl+1/2/3, Cmd+1/2/3 on a Mac). Mute notifications. | |
| 2 | Keep the room alive: any open host page and phone count as traffic. Do not close the host tab. | The lobby still shows the test phone |

## 3. Laptop and projector

- Mirror (duplicate) the display. Set resolution to 1920x1080. If the picture is cropped, lower the browser zoom, do not change the
  resolution again.
- Keep the host tab full screen (F11). Do not resize it while the game runs.
- Switch with **Ctrl+1 / Ctrl+2 / Ctrl+3** (Cmd on a Mac) between the deck, host and phone-mock tabs of one window. Do not use Alt+Tab: it only toggles between the last two windows. Practise it once.
- The phone mock is a phone-width page. Best: hold the spare phone up to the audience. Otherwise use tab 3 on the projected screen (it will look wide; say so).

## 4. Getting judges onto their phones

1. Return the host to the lobby view that shows the **QR code and the 4-letter code** (the "Join this mission" panel). Leave it on screen.
2. Say: "Open your camera and point it at the code." The QR opens the phone page with the room code already filled in. They type a call
   sign and press **Join crew**. Nothing else to install or sign into.
3. No camera? Say the address: "missionforge-spaceapps dot onrender dot com slash play", open **Join on your phone**, type the 4 letters.
4. The helper checks every phone shows "You are in". Up to 10 players take seats; more people join as spectators.
5. Judges on their own mobile data should work too (**not measured**): the phone page connects out to the same `wss://` server.
6. Slide 12 also has a QR code for the main page (`/play/`), decoded to `https://missionforge-spaceapps.onrender.com/play/`
   (`orchestration/evidence/T052/qr-decoded.txt`). It is a link to the game, not to a room.

## 5. The 4-minute demo path

The brief for this path is: lobby, briefing, two part votes, one minigame, debrief. Steps 1 to 3 are **live**; steps 4 to 8 are the
**scripted phone session** (`?mock=1`).

| # | Clock | Screen | Do | Say while it loads |
|---|---|---|---|---|
| 1 | 0:00 | Host lobby with QR | Judges scan. Wait for 3 or more seats (10 to 30 s). | "This is the real hosted game. The big screen is a Unity game in the browser; your phone is the controller. No app." |
| 2 | 0:40 | Host: **Start briefing** | Click it. The briefing screen appears in about 5 s. | "The big-screen briefing is still a layout. The contract is a 150 kilogram satellite to a 550 kilometre orbit, on 90 million game-dollars." |
| 3 | 0:55 | Judges' phones | Each shows its console card ("Your 4 consoles"). Ask them to tap **Ready**. Then click **Continue** on the host (about 4 s to the contract-vote layout). **Do not press START VOTE.** | "Each phone is a real mission-control position, from Apollo: power, structure, flight dynamics." |
| 4 | 1:10 | Ctrl+3 to the phone mock (or the spare phone): **Join** | Type a call sign, join. The role card appears in about 6 s; press **Ready**. | "From here it is our scripted demo session: bots are the crew, and every number is an invented demo value." |
| 5 | 1:30 | Part vote 1 | Predict, then Inspect (open the stats explain sheet), then cast. | "Before anyone votes you see mass, power, cost and the drawbacks, and a live tally. Predict first: that is how you learn." |
| 6 | 2:30 | Part vote 2 (hot-fire test, then the upper stage) | Open the card with the **Over budget** warning. | "This card spends the Emergency Funding: there is a price for every choice." |
| 7 | 3:15 | Max Q Throttle Bucket (phone, 20 s) | Drag the throttle to keep the line in the band. | "At Max Q, dynamic pressure peaks. Keep it in the band or the structure takes the load." |
| 8 | 3:40 | Debrief | Scroll to **facts collected**. | "Each fact carries a NASA or agency source, and the Codex notes what the game simplifies." |

**Time budget.** At normal speed the scripted session took **270 s from join to debrief** in the rehearsal (driven at human pace by a
script), which is longer than steps 4 to 8 above allow. Two ways to fit:

- **Path A (4 min total): add `&speed=2` to the mock URL** (`.../play/client/?mock=1&speed=2`). The mock documents a speed factor for
  every scripted timer (`client/src/net/mock.ts`). Expected: about 135 s from join to debrief (**derived** by halving 270 s, **not
  measured**: my scripted driver failed at `speed` 1.5, 2 and 4 because it waits for stage panels that go by faster, so a human
  try-out is needed). **Try it by hand once during set-up. If any screen goes by too fast to read, use Path B.**
- **Path B (measured, about 5:45 total): normal speed.** Steps 4 to 8 then take about 4:30: role card at 0:08, vote 1 result at 1:15,
  second vote result near 2:20, third vote (a tie, settled by a trivia question) until 3:05, Flight Readiness Review poll at 3:10,
  Max Q minigame at 3:51 to 4:11, debrief at 4:30. For a hard 4-minute limit, run steps 1 to 6 live, then **play the video from
  1:06 to 1:45** (Flight Readiness Review, flight console, Max Q, minigames, debrief) instead of waiting for the session to reach them.

If your slot is 5 minutes, use the cut-down in `PRESENTER_SCRIPT.md` (live lobby and briefing 73 s, one scripted part vote 75 s).

## 6. What was measured in the rehearsal

Run on 15 Nov 2026 on a Windows laptop, headless Chromium with **software** WebGL (the Unity host drew 0.1 to 0.5 frames a second),
against the live Render site. Three phone-sized contexts (390 x 844, touch) joined. The host and the phones shared one CPU, so
anything involving the host is slower than it would be on a laptop with a GPU and phones on their own CPUs.
Logs: `orchestration/evidence/T052/rehearsal/log-*.txt`; screenshots next to them.

| What | Measured |
|---|---|
| Health check, awake | HTTP 200 in 0.8 s |
| Host page start to title screen | 20 to 50 s |
| **New mission** click to room code | about 1 s |
| Phone joins (page load, nickname, join) | 2.6 s each with no host rendering on the same CPU; 5 to 20 s each while the Unity host was rendering |
| **Open lobby** to lobby phase | 3 to 5 s |
| **Start briefing** to briefing phase | 4.7 s (twice) |
| **Continue** to contract-vote phase | 4 s (twice) |
| Judge phone shows a role card after **Continue** | 30 to 50 s here (CPU-starved); **not measured** on separate devices |
| Scripted host plus 3 real phone pages, lobby to debrief (shortest timers, 5 part rounds, 7 minigames, 2 polls) | 234 s |
| Scripted phone session (`?mock=1`, speed 1), join to debrief | 270 s: briefing 25 s, vote 1 result 75 s, vote 2 result 140 s, poll 190 s, Max Q play 231 to 251 s, debrief 270 s |
| Real host reaching the **Build** phase | Not reached in 10 minutes of trying; stays on the contract-vote layout |

Not measured: a full 22-vote live session, frame rate on a GPU laptop, joining from phones on mobile data, more than 3 phones.

## 7. Fallbacks

| Problem | Do (do not debug on stage) |
|---|---|
| **No Wi-Fi or hotspot fails** | The hosted game needs internet. Switch to the hotspot; if that fails, start the local launcher (`RELEASE.md` 1.1: `npm --prefix tools/demo run demo`; install and build it **before** the day because the first run needs internet for `npm ci`). It prints a host URL and a phone URL; phones on the same hotspot or Wi-Fi join with the code. Still nothing: `/play/client/?mock=1` needs no server (open it from the local launcher at `http://<LAN-IP>:8080/play/client/?mock=1`, or from a copy of the build). Last resort: play the video. |
| **Site asleep** (Render loading page, first visit takes about a minute) | You should have woken it at T-15. If it is still waking: stay on slide 3 and tell the pitch from the deck; refresh the host every 20 s; start the phone mock meanwhile (it is a static page and loads once the instance is up). After 90 s, use the video. |
| **Render down or restarted** (room gone, host shows "Reconnecting", 5xx page) | A restart ends every open room (rooms are in memory). Create a new room if the site is back within a minute. Otherwise: the phone mock if the page still loads, and the video `submission/video/missionforge-demo-2min.mp4` (2:00, subtitles in `submission/video/subtitles/`). Say: "The free host restarted; here is the same flow from our recording." |
| Host will not load or is too slow | Try a second desktop browser (Chrome vs Edge/Firefox), close other tabs, add `?dpr=1` to the host URL (`RELEASE.md` 5.5). Then the deck plus the phone mock. |
| **New mission** does nothing | Wait 5 s and click again; if the title says the room server is not connected, reload the host page. |
| A judge's phone will not join | Check the code (4 letters), try the lobby QR again, or let them watch another judge's phone. Late joiners become spectators. |
| A phone drops | Its seat is held for 3 minutes; reload the page to return (`RELEASE.md` 5.5). |
| Host tab closed by mistake | The room is held for 10 minutes if the host drops; reopen the host URL and it resumes (`RELEASE.md` 5.5). Not tried in this rehearsal. |

## 8. Reset between judges

The room lives only in server memory, so a reset is a new room.

1. On the host tab, reload the page (F5) and wait for the title screen (20 to 50 s). Click **New mission** within 30 s. A new code and QR appear;
   tell the previous judges their code is finished.
2. Click **Open lobby**.
3. Phone mock: reload the mock page; it starts again from the Join screen (the session state is in the page, nothing is saved).
4. Deck: press Home, then the right arrow to the slide you need.
5. Faster option, **untried**: keep a second host tab with a second room already in its lobby and switch to it for the next judge. It
   uses a second Unity page of memory; try it once before relying on it.
6. For a judge who wants to try the game alone: give them the link `https://missionforge-spaceapps.onrender.com/play/client/?mock=1` (works on
   any phone, needs no room).

## 9. Do not say

- That the big screen runs the whole session. Votes, flight and debrief run on the phones today.
- That the briefing numbers are on the big screen. They are not.
- That the phone session is a live game with real crew. It is a scripted session with bots and invented demo numbers.
- That the audience "votes". Today it is an advisory bar (`RELEASE.md` 5.2).
