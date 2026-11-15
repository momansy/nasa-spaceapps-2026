# Demo video script

Two cuts for the NASA Space Apps submission: **30 seconds** (teaser, for the project page) and **2 minutes**
(walkthrough). Every shot uses a screen or media file that exists in this repository. A shot marked **RECORD**
needs a live screen capture by the team (the repository has no recorded full run); the still listed beside it is a
stand-in that shows the same screen, and is what to match.

## Before recording

- Run `npm --prefix tools/demo install`, then `npm --prefix tools/demo run demo` (see `RELEASE.md` 5.1). Open the
  big-screen URL in desktop Chrome on a computer with a GPU, 1920x1080, full screen. Join with 2 to 3 real phones.
- For phone captures that need no network, `/play/client/?mock=1` runs a scripted session; add `&seat=pilot` for the pilot seat.
- Record the phone screen with the phone's own screen recorder. Hold the phone upright, 390 x 844 style framing.
- **Status note (2026-11-15, T046):** the two cuts described below were produced; see `submission/video/README.md` for the finished files
  and what is real versus scripted. This file stays as the script they follow.
- **Do not show or say anything that is not built.** The big-screen briefing and debrief screens are placeholders in this repository, and the
  countdown, flight view and orbit map are in the Unity source but not in the committed WebGL build (see `PROJECT_DESCRIPTION.md` section 8). The cuts below therefore show the
  big screen only at title, lobby and Build Bay, and show flight and debrief **on the phones**.
- No audio is bundled. Use the narration below (voice recorded by a team member) and, if wanted, royalty-free music you
  have the licence for; add it to `NASA_RESOURCES.md` and `AI_DISCLOSURE.md` if you do. Burn in subtitles; the
  game itself has no voice lines.
- Nothing here uses a NASA logo or insignia. Keep it that way in titles and lower thirds.

Frame sizes: host captures 1920x1080; phone captures portrait. Put the phone capture in a phone frame on the right
third of the screen when it shares a shot with the host.

---

## Cut A: 30 seconds (about 50 words of narration)

| # | Time (s) | On screen | Source file or capture | On-screen text | Narration |
|---|---|---|---|---|---|
| A1 | 0-4 | Key art: satellite above Earth, small rocket | `assets/media/key-art/missionforge-16x9.png` (slow push-in) | MISSIONFORGE | "Every space mission is a set of trade-offs." |
| A2 | 4-9 | Big-screen lobby with a room code and QR; phones join | RECORD host lobby. Match `orchestration/evidence/T029/host-lobby-3-players-1920x1080.png` | Scan. Join. No app. | "Scan a code, and your phone becomes mission control." |
| A3 | 9-16 | Build Bay: a part vote with tallies and a ghost part, then the crane places it | RECORD Build Bay. Match `orchestration/evidence/T015/03-vote-in-progress-ghost-tallies-1920x1080.png` and `04-assembly-crane-sparks-1920x1080.png` | 22 votes. Mass, power, cost, risk. | "Vote on every part. Each choice changes mass, power, cost and risk." |
| A4 | 16-23 | Phone minigames, three quick cuts: Max Q Throttle, Solar Wing Deploy, Science Capture | RECORD phones. Match `orchestration/evidence/T036/runs/2026-11-14T22-44-41-339Z-stub-p3-s2801/phone-mg-MG-08-play.png`, `phone-mg-MG-15-play.png`, `phone-mg-MG-21-play.png` | Then fly it together. | "Then fly the mission together, with minigames built on real constraints." |
| A5 | 23-30 | Briefing clip, then end card with the hosted URL | `assets/media/cinematics/c1-earth-watch-briefing.mp4` (last 4 s), then a title card | MissionForge. Team Winton. NASA Space Apps 2026. *Not affiliated with NASA.* | "MissionForge. Design it. Launch it. Learn why it worked." |

---

## Cut B: 2 minutes (about 250 words of narration)

| # | Time (s) | On screen | Source file or capture | On-screen text | Narration |
|---|---|---|---|---|---|
| B1 | 0-8 | Title frame, then key art | `assets/media/style/frames/01-title.png`, then `assets/media/key-art/missionforge-16x9.png` | NASA Space Apps 2026: Space Mission Design Game | "The challenge: design a space mission and see how your choices decide the result. MissionForge turns that into a party game for one to ten players." |
| B2 | 8-18 | Host title screen with ROOM SERVER: CONNECTED, then New mission, lobby with QR | RECORD host. Match `orchestration/evidence/T029/host-title-1920x1080.png` and `host-lobby-1920x1080.png` | New mission. Room code + QR. | "One big screen shows the mission. Everyone else joins on their own phone with a room code or QR code. No app, no account." |
| B3 | 18-28 | Phone join screen, nickname, then the role card ("Console assignment", Flight Director) | RECORD phone. Match `orchestration/evidence/T036/runs/2026-11-14T23-32-00-790Z-stub-p1-s2801/phone-part-vote-1.png` (despite its name it shows the role card) | Roles: Flight, Guidance, Power, Comms, Payload and more | "Each phone gets a mission-control role. With fewer people, roles merge automatically." |
| B4 | 28-38 | Briefing clip with a lower third | `assets/media/cinematics/c1-earth-watch-briefing.mp4` (full 10 s). The phone file `phone-briefing.png` in the T036 run is a role card, not a briefing, so do not use it for this shot | Contract C1 Earth Watch. 150 kg. 550 km Sun-synchronous orbit. 90 M game-dollars. 180 days. | "Contract one, Earth Watch: put a 150 kilogram observation satellite into a 550 kilometre Sun-synchronous orbit, on a 90 million game-dollar budget." |
| B5 | 38-56 | Build Bay vote in progress: stage, timer, tallies, dashboard deltas, ghost part; then the crane assembly | RECORD Build Bay. Match `orchestration/evidence/T015/03-vote-in-progress-ghost-tallies-1920x1080.png`, `04-assembly-crane-sparks-1920x1080.png` | Delta-v. Thrust-to-weight. Budget. Schedule. | "Twenty-two votes build the rocket and satellite. Every option shows its mass, power, cost and drawbacks, and the dashboard shows delta-v, thrust-to-weight, budget and schedule before the team commits." |
| B6 | 56-64 | Phone vote screen: Instrument vote, "Wide-field optical camera", mass 8 kg, power 15 W, data 4 GB/day, red Drawbacks box, Vote and Veto buttons | RECORD phone. Match `.../stub-p1-s2801/phone-part-vote-2.png` | Stats and drawbacks, then vote | "On the phone, each part card shows its numbers and its drawbacks, then the team votes. There is no perfect build." |
| B7 | 64-72 | Build Bay compare and exploded view, then the finished vehicle | RECORD Build Bay tools. Match `orchestration/evidence/T015/05-compare-1920x1080.png`, `06-exploded-1920x1080.png`, `09-complete-vehicle-beauty-1920x1080.png` | Compare. Exploded view. Scale. | "The bay lets you compare designs, explode the vehicle and check its scale." |
| B8 | 72-80 | Phones: Flight Readiness Review, "FLIGHT is polling the consoles", one NO-GO shown | RECORD phones. Match `.../stub-p1-s2801/phone-frr-1.png` | Flight Readiness Review: GO or NO-GO? | "Before launch, every console calls GO or NO-GO, the way real programs hold a readiness review." |
| B9 | 80-100 | Phones: Max Q Throttle, Solar Wing Deploy, Ground Station Pass, Science Capture, 2 s each, then a pilot seat | RECORD phones. Match `.../2026-11-14T22-44-41-339Z-stub-p3-s2801/phone-mg-MG-08-play.png`, `phone-mg-MG-15-play.png`, `phone-mg-MG-13-play.png`, `phone-mg-MG-21-play.png`; pilot seat `orchestration/evidence/T030/01-pilot-portrait-engineer.png` | Mass. Power. Communications. Instruments. | "Flying is done on the phones. Keep Max Q in the band to protect the structure. Deploy the solar wings to stay power-positive. Catch the ground-station pass to send data home. Capture science targets with the instruments you chose." |
| B10 | 100-108 | Phone debrief: Earth Watch, grade, team score, awards, Knowledge Points | RECORD phone from a real session. `.../stub-p1-s2801/phone-debrief.png` shows the layout, but its "A, 7,840 pts" comes from the stand-in host's fixture, not from the Core scoring, so do not reuse that number | Score. Grade. Facts learned. | "The debrief gives the score, the facts met along the way, and how your rocket compares with a real one." |
| B11 | 108-114 | Phone in Arabic (right to left) and large text; accessibility settings | RECORD phone. Match `orchestration/evidence/T030/10-pilot-200-rtl-portrait.png` and `10-pilot-high-contrast-portrait.png` | 6 languages. 200% text. High contrast. One-button mode. | "It works in six languages, including right-to-left Arabic, with large text, high contrast and one-button minigames." |
| B12 | 114-120 | End card | Key art square `assets/media/key-art/missionforge-1x1.png` or the 16:9 key art; hosted URL | MissionForge. Team Winton. Code and credits at the project page. Built with AI coding agents. AI-generated art. Not affiliated with NASA. | "MissionForge: design it, launch it, learn why it worked." |

Narration is about 230 words after the trims in the table. Slots B1, B2, B6 and B10 are tight (150 to 190 words per minute): when recording, shorten those lines or let the shot run a few seconds longer; the cut may then run to about 2 minutes 10 seconds, so check it against any length limit on the form.

## Notes for the editor

- **Honest framing.** If a viewer could think the big screen already plays the flight and debrief, add the end-card line
  "Big-screen flight view in development" to Cut B. The phone flight minigames, GO/NO-GO poll and debrief shown are real
  phone-client screens.
- **Do not quote fixture numbers.** The T036 phone screenshots were made against a scripted stand-in host. Its debrief score, grade and the "Mission success" label are fixture values. Record a real session before showing or saying any score.
- **Stand-in stills are not the video.** The T036 phone screenshots come from scripted test runs with a stand-in host; they
  are real phone-client screens, but a live recording with real phones and the real Unity host is better. The Build Bay
  stills come from a rehearsal build with simulated voters (chrome reads RECONNECTING); a live recording will show the real
  room instead.
- **Numbers on screen** must match the data: C1 is 150 kg, 550 km, 97.6 degrees, 90 M game-dollars (not real money), 180 days
  (`data/contracts.json`). Say "game-dollars", not dollars.
- **Disclosure.** The key art, title frame and briefing clip are AI-generated; the end card says so (see `AI_DISCLOSURE.md`).
- **Uploading.** The team uploads the finished video by hand to the platform the form asks for (see `CHECKLIST.md`).
