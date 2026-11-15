# MissionForge: presenter script

Three versions for the NASA Space Apps judging: a **3-minute pitch** (slides only), a **5-minute pitch** and a **7-minute pitch** (the actual judging slot, 7 slides) with a live demo of the
hosted game <https://missionforge-spaceapps.onrender.com/play/>. Slides are in `deck.html` (arrow keys, or click the right
three quarters of the screen; the left quarter goes back). The PDF copy is `MissionForge-deck.pdf`. Setup, fallbacks and the
step-by-step demo are in `LIVE_DEMO.md`; likely questions are in `QA.md`.

## How to use this script

- **Two presenters.** **A** tells the story and answers questions. **B** drives the laptop, the live game and the phones. With one
  presenter, say every line and do B's actions yourself; the 5-minute version then needs a helper to join phones.
- **Speak plainly.** The words below are plain spoken English with short sentences. Say numbers in words as written. Do not read
  slide text aloud; the slide supports the words.
- **How it was timed.** Each block shows its words and its speaking time at **150 words a minute** against the time slot it has. All
  blocks fit, but slides 1 and 7 of the 3-minute version and the phone-session slot of the 5-minute version have almost no slack: the 3-minute version has 338 words (about 135 s of speech in a 180 s slot) and the 5-minute version
  has 329 words (about 132 s of speech in a 300 s slot; the rest is the live game). **These are word-count timings, not a stopwatch read-aloud
  by a person.** The live parts were timed against the hosted site (see `LIVE_DEMO.md` section 6 and `orchestration/evidence/T052/`).
  Read it aloud once with a timer and trim any block that runs long.
- **Honesty rules** (the same as `QA.md`): say "game-dollars", say the debrief and flight are on the phones in the hosted game, say the audience bar is
  advisory, say the AI use, never say "NASA-validated", "GMAT" or "playtested with six people".

## Version 1: 3-minute pitch (slides only)

Start on slide 1. The deck has **7 slides**. Press the right arrow when the Do column says a new slide number.

| Time | Slide or step | Who | Words (spoken) | Say | Do |
|---|---|---|---|---|---|
| 0:00-0:20 | 1: Problem | A | 49 (20 s of 20 s)  | Space missions are chains of trade-offs. More instruments need more power. More power needs more mass, and more mass needs more fuel and more money. In a classroom that chain is a table of numbers, so nobody feels a decision. The challenge asks for a game that fixes that. |  |
| 0:20-0:34 | 1 (cont.): One line | A | 27 (11 s of 14 s)  | We built MissionForge. One to ten players run a space agency. They vote on every part of a rocket and a satellite, then fly the mission together. |  |
| 0:34-0:50 | 2: How it plays | B | 30 (12 s of 16 s)  | The big screen is the shared lobby and display. Every phone is a mission-control console. Scan the QR code, get a role, and vote. No app, no account, no chat. |  |
| 0:50-1:12 | 3: Trade-offs | B | 39 (16 s of 22 s)  | Six constraints decide everything: mass, power, budget, instruments, orbit and communications. Our first contract, Earth Watch, is a one hundred fifty kilogram satellite, to a five hundred fifty kilometre orbit, on ninety million game-dollars and one hundred eighty days. |  |
| 1:12-1:30 | 3 (cont.): Vote and part card | B | 29 (12 s of 18 s)  | Every vote shows each option's mass, power, cost and risk, and its drawbacks, before you choose. Twenty-two votes build the mission, and the audience watches a live, advisory bar. |  |
| 1:30-1:48 | 4: Flight and minigames | A | 33 (13 s of 18 s)  | Then you fly it, on the phones. Thirty-two short minigames turn the constraints into play. At Max Q, for example, you keep dynamic pressure inside a band, or the structure takes the load. |  |
| 1:48-2:06 | 4 (cont.): Debrief and facts | A | 33 (13 s of 18 s)  | The debrief explains why it worked, with a fact and its source for what you just did. We keep physics and game values apart in the data, and the Codex notes the simplifications. |  |
| 2:06-2:18 | 5: NASA data | A | 22 (9 s of 12 s)  | Forty facts, each checked against a NASA or agency source. We use NASA Earth imagery. We do not use live NASA data. |  |
| 2:18-2:30 | 6: Accessibility, languages | B | 16 (6 s of 12 s)  | It runs in six languages, including right-to-left Arabic, with high contrast, large text and one-button minigames. |  |
| 2:30-2:42 | 6 (cont.): How it was built | B | 22 (9 s of 12 s)  | A human team directed AI coding agents to build it, and we disclose that in full. About seventeen hundred automated tests pass. |  |
| 2:42-2:56 | 7: What is next | A | 29 (12 s of 14 s)  | Built: lobby, QR join, the full phone game, and the big-screen briefing, flight and debrief in our code. Next: put them on the hosted site, and a six-person playtest. |  |
| 2:56-3:00 | 7 (cont.): Play it now | A | 9 (4 s of 4 s)  | It is live now. Scan the code and play. |  |

**Cut order if you are running long:** slide 6, then slide 5. Keep slides 1, 2, 3, 4 and 7.

## Version 2: 5-minute pitch with a live demo

**Before you start:** the host tab is open on the **lobby with the QR code** (not the title screen), the phone-sized window is loaded
at `https://missionforge-spaceapps.onrender.com/play/client/?mock=1` but not started, and the deck tab is on slide 1. Set-up
takes about 15 minutes: `LIVE_DEMO.md` section 2.

| Time | Slide or step | Who | Words (spoken) | Say | Do |
|---|---|---|---|---|---|
| 0:00-0:20 | 1: Problem | A | 38 (15 s of 20 s)  | Space missions are chains of trade-offs. More instruments need more power, more power needs more mass, and more mass needs more fuel and money. In a classroom that is a table of numbers, so nobody feels a decision. | Slide 1. |
| 0:20-0:36 | 1 (cont.): One line | A | 25 (10 s of 16 s)  | We built MissionForge. One to ten players run a space agency, vote on every part of a rocket and satellite, then fly the mission together. | Stay on slide 1. |
| 0:36-0:52 | 2: How it plays | B | 26 (10 s of 16 s)  | The big screen is the shared display, and every phone is a console. Let me show you the real thing. Judges, please scan the code now. | Slide 2. **SWITCH TO LIVE on the words "Let me show you the real thing": B presses Ctrl+2 (Cmd+2) to the host tab, which is already on the lobby with the QR code.** |
| 0:52-2:05 | LIVE 1 Host lobby and briefing | B + A | 70 (28 s of 73 s)  | That is the hosted game, not a mock-up. The room code and QR are on the big screen. Phones join with no app. Here come three crew members. I start the briefing. This hosted build shows the briefing as a layout, so here are the numbers: a one hundred fifty kilogram satellite, a five hundred fifty kilometre orbit, ninety million game-dollars. Each phone now shows its mission-control role. Tap Ready. | B clicks Open lobby (if not already open), waits for 3 crew, clicks Start briefing, then Continue. A speaks. Helper checks that every judge's phone shows a role card. |
| 2:05-3:20 | LIVE 2 Phone session | A + B | 55 (22 s of 75 s)  | The rest of the flow runs on phones. This is our scripted demo session, with bots as crew. A vote: first we predict, then each option shows its mass, power, cost and drawbacks before anyone picks. The tally is live, and the result comes up. Every number in this session is an invented demo value. | B holds up the spare phone (best) or presses Ctrl+3 (Cmd+3) for the phone-mock tab, already loaded at ?mock=1, and taps Join. A talks over the role card and the first part vote, then B presses Ctrl+1 (Cmd+1) to return to the deck. |
| 3:20-3:35 | 4: Flight and minigames | A | 13 (5 s of 15 s)  | After the build comes the flight, with thirty-two short minigames, like Max Q. | Slide 4. Say the minigame sentence only; do not claim a live flight. |
| 3:35-3:58 | 4 (cont.): Debrief and facts | A | 24 (10 s of 23 s)  | The debrief gives the score and the facts you met, each with a NASA or agency source. The Codex notes what the game simplifies. | Stay on slide 4. |
| 3:58-4:18 | 5: NASA data | B | 26 (10 s of 20 s)  | Forty facts, each checked against a NASA or agency source. We use NASA Earth imagery, but no live NASA data, and we did not run GMAT. | Slide 5. |
| 4:18-4:40 | 6: How it was built | B | 22 (9 s of 22 s)  | A human team directed AI coding agents to build it, and we disclose that in full. About seventeen hundred automated tests pass. | Slide 6. |
| 4:40-4:54 | 7: What is next | A | 25 (10 s of 14 s)  | Honestly: the hosted big screen shows title and lobby. Briefing, flight and debrief screens are in our code, not yet hosted. Phones show it all. | Slide 7. |
| 4:54-5:00 | 7 (cont.): Play it now | A + B | 5 (2 s of 6 s)  | Scan the code and play. | Stay on slide 7. Leave it on screen for questions. |

### The exact moment to switch to the live game

- **Switch to live** at the end of slide 3, on the words **"Let me show you the real thing."** B presses **Ctrl+2** (Cmd+2 on
  a Mac) to the host tab. The lobby with the QR code is already on screen, so there is no loading time on stage.
- **Switch to the phone session** when the third judge phone shows its role card, or after 73 s of the live part, whichever comes first.
- **Return to the deck** when the first part vote shows its result (about 75 s into the phone session at normal speed), or at
  3:20 on the clock, whichever comes first. Press Ctrl+1 (Cmd+1) to the deck tab (which is still on slide 2), then press the right arrow twice to reach slide 4.
- If the host or the phones fail at any point, **do not debug on stage**: follow the fallback table in `LIVE_DEMO.md` section 7 and say
  one sentence: "The free host is slow today, so here is the same flow from our recorded demo."

### What to say while something loads

| Wait | Say |
|---|---|
| Host lobby after a restart (20 to 50 s in the rehearsal) | "The big screen is a Unity game running in the browser, so it takes a moment to load." |
| Judges scanning the QR (10 to 30 s) | "No app and no account: the page opens, you pick a call sign, and you are in the crew." |
| Briefing to role cards (5 to 40 s) | "Each phone becomes a real mission-control position: power, structure, flight dynamics and so on." |
| Phone session first screen | "This part is our scripted demo session, so the crew you see are bots." |

## Version 3: 7-minute pitch with a live demo (the actual judging slot)

The judging email gives each team **10 minutes in total: 7 minutes to present (slides or live demo) and 3 minutes of questions and answers**,
in a judging circle room from 4:00 to 6:00 p.m. Kuwait time; all teams then go to the AUK Theater with their laptops for the final round
(6:00 to 8:00 p.m.). **Use this version for the judging room.** The deck is **7 slides**, as the slot requires.

**Before you start:** the host tab is open on the **lobby with the QR code**, the phone-sized window is loaded
at `https://missionforge-spaceapps.onrender.com/play/client/?mock=1` but not started, and the deck tab is on slide 1. Set-up takes about 15
minutes (`LIVE_DEMO.md` section 2). The free host sleeps after 15 minutes: wake it before you walk into the room. Bring the laptop, a
charger, a phone hotspot as a network fallback, and the PDF and PPTX copies of the deck in case the browser tab fails.

| Time | Slide or step | Who | Words (spoken) | Say | Do |
|---|---|---|---|---|---|
| 0:00-0:45 | 1: Problem and one line | A | 76 (30 s of 45 s)  | Space missions are chains of trade-offs. More instruments need more power. More power needs more mass, and more mass needs more fuel and more money. In a classroom that chain is a table of numbers, so nobody feels a decision. The challenge asks for a game that fixes that. We built MissionForge. One to ten players run a space agency. They vote on every part of a rocket and a satellite, then fly the mission together. | Slide 1. |
| 0:45-1:05 | 2: How it plays | B | 26 (10 s of 20 s)  | The big screen is the shared display, and every phone is a console. Let me show you the real thing. Judges, please scan the code now. | Slide 2. **SWITCH TO LIVE on the words "Let me show you the real thing": B presses Ctrl+2 (Cmd+2) to the host tab, which is already on the lobby with the QR code.** |
| 1:05-2:40 | LIVE 1: Host lobby and briefing | B + A | 98 (39 s of 95 s)  | That is the hosted game, not a mock-up. The room code and the QR code are on the big screen, and the phones join with no app and no account. Here come the crew members. I start the briefing. This hosted build shows the briefing as a layout, so here are the numbers: a one hundred fifty kilogram observation satellite, a five hundred fifty kilometre orbit, ninety million game-dollars and one hundred eighty days. Now each phone shows its own mission-control role, like power, structure or flight dynamics, and each role sees something nobody else sees. Tap Ready. | B clicks Open lobby (if not already open), waits for 3 crew, clicks Start briefing, then Continue. A speaks. Helper checks that every judge's phone shows a role card. |
| 2:40-4:10 | LIVE 2: Phone session | A + B | 77 (31 s of 90 s)  | The rest of the flow runs on phones. This is our scripted demo session, with bots as crew. A vote comes up: first we predict, then each option shows its mass, power, cost and drawbacks before anyone picks. The tally is live, any player can use a veto, and the result comes up. The crew builds the whole rocket this way, twenty-two votes in this first contract. Every number in this session is an invented demo value. | B holds up the spare phone (best) or presses Ctrl+3 (Cmd+3) for the phone-mock tab, already loaded at ?mock=1, and taps Join. A talks over the role card, the part vote and the result, then B presses Ctrl+1 (Cmd+1) to return to the deck (still on slide 2) and presses the right arrow once to reach slide 3. |
| 4:10-4:50 | 3: Trade-offs and the vote | B | 68 (27 s of 40 s)  | Six constraints decide everything: mass, power, budget, instruments, orbit and communications. Our first contract, Earth Watch, is a one hundred fifty kilogram satellite, to a five hundred fifty kilometre orbit, on ninety million game-dollars and one hundred eighty days. Every vote shows each option's mass, power, cost and risk, and its drawbacks, before you choose. Twenty-two votes build the mission, and the audience watches a live, advisory bar. | Slide 3. |
| 4:50-5:30 | 4: Flight, minigames and debrief | A | 37 (15 s of 40 s)  | After the build comes the flight, with thirty-two short minigames, like Max Q. The debrief gives the score and the facts you met, each with a NASA or agency source. The Codex notes what the game simplifies. | Slide 4. Say the minigame sentence only; do not claim a live flight. |
| 5:30-6:00 | 5: Physics, game and NASA data | B | 42 (17 s of 30 s)  | We keep physics and game values apart in the data, and the Codex lists every simplification. Forty facts, each checked against a NASA or agency source. We use NASA Earth imagery, but no live NASA data, and we did not run GMAT. | Slide 5. |
| 6:00-6:40 | 6: Everyone, and how it was built | B | 38 (15 s of 40 s)  | It runs in six languages, including right-to-left Arabic, with high contrast, large text and one-button minigames. A human team directed AI coding agents to build it, and we disclose that in full. About seventeen hundred automated tests pass. | Slide 6. |
| 6:40-7:00 | 7: What is next, and play it now | A + B | 30 (12 s of 20 s)  | Honestly: the hosted big screen shows title and lobby. Briefing, flight and debrief screens are in our code, not yet hosted. Phones show it all. Scan the code and play. | Slide 7. Leave it on screen for questions. Stop at seven minutes. |

**Total spoken: about 492 words. This is word-count timing, not a stopwatch read-aloud.** Read it aloud once with a timer and trim any
block that runs long. The live parts (1:05 to 4:10) depend on the free server and on judges scanning the QR code; if they run past
4:10 on the clock, go straight to slide 3.

### The 3 minutes of questions

- **A answers, B keeps the game on screen.** Keep every answer to 20 to 30 seconds, so you can take 5 or 6 questions.
- The likely questions with short answers are in `QA.md`. The five to know cold: is the physics real, what did you simplify, what NASA data
  do you use, how did AI help, and what is built versus planned.
- If a question is about something you did not build, say so plainly, then say what the game does today.
- Leave slide 7 (or the lobby with the QR code) on screen, so judges can join while they ask.

### If the 7 minutes shrink or the game fails

- **Only 5 minutes left:** use version 2. **Only 3:** use version 1. Both use the same 7 slides.
- **The host or the phones fail:** do not debug on stage. Follow `LIVE_DEMO.md` section 7 and say one sentence: "The free host is slow today, so
  here is the same flow from our recorded demo." Then play the 2-minute video (`submission/video/`) while you speak the phone-session lines.

## Numbers you may say

All from `data/` and `submission/PROJECT_DESCRIPTION.md` (15 Nov 2026).

| Say | Source |
|---|---|
| 1 to 10 players | `GAME_DESIGN.md` 3; `data/roles.json` (10 roles) |
| 22 part votes in contract C1 | `data/contracts.json` (C1 `votes`: 22) |
| 150 kg, 550 km, 97.6 degrees, 90 M game-dollars, 180 days | `data/contracts.json` C1 |
| 32 minigames | `data/minigames.json` |
| 9 contracts | `data/contracts.json` |
| 40 facts, each with a source; 25 confirmed, 15 corrected | `data/facts.json`; `orchestration/evidence/T025/fact-sources.md` |
| 6 languages | `data/strings/` |
| Server 247 of 247, phone client 922 of 927, Core 568 tests passing | `orchestration/evidence/T058/tests/` (server, client, 15 Nov 2026); Core from T046, not re-run. About 1,700 passing in total. Do not say "all tests pass": 5 phone translation-parity tests fail until the pre-flight host strings are translated (T057) |
| 15 of 16 big-screen screens in the code | Unity host on main (T027 and earlier); the hosted build is older (title, lobby, early Build Bay) |
