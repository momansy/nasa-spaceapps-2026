# MissionForge: presenter script

Two versions for the NASA Space Apps judging: a **3-minute pitch** (slides only) and a **5-minute pitch with a live demo** of the
hosted game <https://missionforge-spaceapps.onrender.com/play/>. Slides are in `deck.html` (arrow keys, or click the right
three quarters of the screen; the left quarter goes back). The PDF copy is `MissionForge-deck.pdf`. Setup, fallbacks and the
step-by-step demo are in `LIVE_DEMO.md`; likely questions are in `QA.md`.

## How to use this script

- **Two presenters.** **A** tells the story and answers questions. **B** drives the laptop, the live game and the phones. With one
  presenter, say every line and do B's actions yourself; the 5-minute version then needs a helper to join phones.
- **Speak plainly.** The words below are plain spoken English with short sentences. Say numbers in words as written. Do not read
  slide text aloud; the slide supports the words.
- **How it was timed.** Each block shows its words and its speaking time at **150 words a minute** against the time slot it has. All
  blocks fit, but slides 1 and 12 of the 3-minute version and the phone-session slot of the 5-minute version have almost no slack: the 3-minute version has 334 words (about 134 s of speech in a 180 s slot) and the 5-minute version
  has 324 words (about 130 s of speech in a 300 s slot; the rest is the live game). **These are word-count timings, not a stopwatch read-aloud
  by a person.** The live parts were timed against the hosted site (see `LIVE_DEMO.md` section 6 and `orchestration/evidence/T052/`).
  Read it aloud once with a timer and trim any block that runs long.
- **Honesty rules** (the same as `QA.md`): say "game-dollars", say the debrief and flight are on the phones, say the audience bar is
  advisory, say the AI use, never say "NASA-validated", "GMAT" or "playtested with six people".

## Version 1: 3-minute pitch (slides only)

Start on slide 1. Press the right arrow once per row.

| Time | Slide or step | Who | Words (spoken) | Say | Do |
|---|---|---|---|---|---|
| 0:00-0:20 | 1 Problem | A | 49 (20 s of 20 s)  | Space missions are chains of trade-offs. More instruments need more power. More power needs more mass, and more mass needs more fuel and more money. In a classroom that chain is a table of numbers, so nobody feels a decision. The challenge asks for a game that fixes that. |  |
| 0:20-0:34 | 2 One line | A | 27 (11 s of 14 s)  | We built MissionForge. One to ten players run a space agency. They vote on every part of a rocket and a satellite, then fly the mission together. |  |
| 0:34-0:50 | 3 How it plays | B | 30 (12 s of 16 s)  | The big screen is the shared lobby and display. Every phone is a mission-control console. Scan the QR code, get a role, and vote. No app, no account, no chat. |  |
| 0:50-1:12 | 4 Trade-offs | B | 39 (16 s of 22 s)  | Six constraints decide everything: mass, power, budget, instruments, orbit and communications. Our first contract, Earth Watch, is a one hundred fifty kilogram satellite, to a five hundred fifty kilometre orbit, on ninety million game-dollars and one hundred eighty days. |  |
| 1:12-1:30 | 5 Vote and part card | B | 29 (12 s of 18 s)  | Every vote shows each option's mass, power, cost and risk, and its drawbacks, before you choose. Twenty-two votes build the mission, and the audience watches a live, advisory bar. |  |
| 1:30-1:48 | 6 Flight and minigames | A | 33 (13 s of 18 s)  | Then you fly it, on the phones. Thirty-two short minigames turn the constraints into play. At Max Q, for example, you keep dynamic pressure inside a band, or the structure takes the load. |  |
| 1:48-2:06 | 7 Debrief and facts | A | 33 (13 s of 18 s)  | The debrief explains why it worked, with a fact and its source for what you just did. We keep physics and game values apart in the data, and the Codex notes the simplifications. |  |
| 2:06-2:18 | 8 NASA data | A | 22 (9 s of 12 s)  | Forty facts, each checked against a NASA or agency source. We use NASA Earth imagery. We do not use live NASA data. |  |
| 2:18-2:30 | 9 Accessibility, languages | B | 16 (6 s of 12 s)  | It runs in six languages, including right-to-left Arabic, with high contrast, large text and one-button minigames. |  |
| 2:30-2:42 | 10 How it was built | B | 22 (9 s of 12 s)  | A human team directed AI coding agents to build it, and we disclose that in full. About seventeen hundred automated tests pass. |  |
| 2:42-2:56 | 11 What is next | A | 25 (10 s of 14 s)  | Built: lobby, QR join, and the full phone game. Next: contract numbers on the big screen, flight and debrief there too, and a six-person playtest. |  |
| 2:56-3:00 | 12 Play it now | A | 9 (4 s of 4 s)  | It is live now. Scan the code and play. |  |

**Cut order if you are running long:** slide 9, then slide 8, then slide 5. Keep slides 1, 2, 4, 10, 11, 12.

## Version 2: 5-minute pitch with a live demo

**Before you start:** the host tab is open on the **lobby with the QR code** (not the title screen), the phone-sized window is loaded
at `https://missionforge-spaceapps.onrender.com/play/client/?mock=1` but not started, and the deck tab is on slide 1. Set-up
takes about 15 minutes: `LIVE_DEMO.md` section 2.

| Time | Slide or step | Who | Words (spoken) | Say | Do |
|---|---|---|---|---|---|
| 0:00-0:20 | 1 Problem | A | 38 (15 s of 20 s)  | Space missions are chains of trade-offs. More instruments need more power, more power needs more mass, and more mass needs more fuel and money. In a classroom that is a table of numbers, so nobody feels a decision. | Slide 1. |
| 0:20-0:36 | 2 One line | A | 25 (10 s of 16 s)  | We built MissionForge. One to ten players run a space agency, vote on every part of a rocket and satellite, then fly the mission together. | Slide 2. |
| 0:36-0:52 | 3 How it plays | B | 26 (10 s of 16 s)  | The big screen is the shared display, and every phone is a console. Let me show you the real thing. Judges, please scan the code now. | Slide 3. **SWITCH TO LIVE on the words "Let me show you the real thing": B presses Ctrl+2 (Cmd+2) to the host tab, which is already on the lobby with the QR code.** |
| 0:52-2:05 | LIVE 1 Host lobby and briefing | B + A | 68 (27 s of 73 s)  | That is the hosted game, not a mock-up. The room code and QR are on the big screen. Phones join with no app. Here come three crew members. I start the briefing. The big-screen briefing is still a layout, so here are the numbers: a one hundred fifty kilogram satellite, a five hundred fifty kilometre orbit, ninety million game-dollars. Each phone now shows its mission-control role. Tap Ready. | B clicks Open lobby (if not already open), waits for 3 crew, clicks Start briefing, then Continue. A speaks. Helper checks that every judge's phone shows a role card. |
| 2:05-3:20 | LIVE 2 Phone session | A + B | 55 (22 s of 75 s)  | The rest of the flow runs on phones. This is our scripted demo session, with bots as crew. A vote: first we predict, then each option shows its mass, power, cost and drawbacks before anyone picks. The tally is live, and the result comes up. Every number in this session is an invented demo value. | B holds up the spare phone (best) or presses Ctrl+3 (Cmd+3) for the phone-mock tab, already loaded at ?mock=1, and taps Join. A talks over the role card and the first part vote, then B presses Ctrl+1 (Cmd+1) to return to the deck. |
| 3:20-3:35 | 6 Flight and minigames | A | 13 (5 s of 15 s)  | After the build comes the flight, with thirty-two short minigames, like Max Q. | Slide 6. Say the minigame sentence only; do not claim a live flight. |
| 3:35-3:58 | 7 Debrief and facts | A | 24 (10 s of 23 s)  | The debrief gives the score and the facts you met, each with a NASA or agency source. The Codex notes what the game simplifies. | Slide 7. |
| 3:58-4:18 | 8 NASA data | B | 26 (10 s of 20 s)  | Forty facts, each checked against a NASA or agency source. We use NASA Earth imagery, but no live NASA data, and we did not run GMAT. | Slide 8. |
| 4:18-4:40 | 10 How it was built | B | 22 (9 s of 22 s)  | A human team directed AI coding agents to build it, and we disclose that in full. About seventeen hundred automated tests pass. | Slide 10. |
| 4:40-4:54 | 11 What is next | A | 22 (9 s of 14 s)  | Honestly: today the big screen has title, lobby and briefing layout. Flight and debrief are on the phones. The rest is next. | Slide 11. |
| 4:54-5:00 | 12 Play it now | A + B | 5 (2 s of 6 s)  | Scan the code and play. | Slide 12. Leave it on screen for questions. |

### The exact moment to switch to the live game

- **Switch to live** at the end of slide 3, on the words **"Let me show you the real thing."** B presses **Ctrl+2** (Cmd+2 on
  a Mac) to the host tab. The lobby with the QR code is already on screen, so there is no loading time on stage.
- **Switch to the phone session** when the third judge phone shows its role card, or after 73 s of the live part, whichever comes first.
- **Return to the deck** when the first part vote shows its result (about 75 s into the phone session at normal speed), or at
  3:20 on the clock, whichever comes first. Press Ctrl+1 (Cmd+1) to the deck tab (which is still on slide 3), then press the right arrow three times to reach slide 6.
- If the host or the phones fail at any point, **do not debug on stage**: follow the fallback table in `LIVE_DEMO.md` section 7 and say
  one sentence: "The free host is slow today, so here is the same flow from our recorded demo."

### What to say while something loads

| Wait | Say |
|---|---|
| Host lobby after a restart (20 to 50 s in the rehearsal) | "The big screen is a Unity game running in the browser, so it takes a moment to load." |
| Judges scanning the QR (10 to 30 s) | "No app and no account: the page opens, you pick a call sign, and you are in the crew." |
| Briefing to role cards (5 to 40 s) | "Each phone becomes a real mission-control position: power, structure, flight dynamics and so on." |
| Phone session first screen | "This part is our scripted demo session, so the crew you see are bots." |

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
| Core 568, server 247, phone client 916 tests passing | `submission/PROJECT_DESCRIPTION.md` section 5 (T042, T044). About 1,700 in total |
