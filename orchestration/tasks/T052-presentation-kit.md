# T052 — Presentation kit: slide deck, presenter script and live-demo run-sheet

**Worker:** a coding/writing worker (`momansy-claude`) · **Owns:** `submission/presentation/` (create), the "Link to presentation / slides" row in `submission/CHECKLIST.md`, `orchestration/evidence/T052/`

The submission form has a presentation/slides field and nothing exists (`submission/CHECKLIST.md`).
The team also needs to present and demo the game live to judges. `RELEASE.md` section 5 is a 35-minute
full-session runbook; there is no short pitch. Build a complete, rehearsable kit around the **hosted
game** <https://missionforge-spaceapps.onrender.com/play/>.

Inputs: `JUDGES.md`, `submission/PROJECT_DESCRIPTION.md`, `submission/NASA_RESOURCES.md`,
`submission/AI_DISCLOSURE.md`, `GUIDE.md` (T051, if merged; otherwise `GAME_DESIGN.md` sections 1–5, 10–12, 20),
`RELEASE.md` section 5, the stills in `submission/video/stills/`, key art in `assets/media/key-art/`,
evidence screenshots in `orchestration/evidence/`.

## Steps, in order

1. **Deck** `submission/presentation/deck.html`: a self-contained 16:9 HTML slide deck (arrow keys and
   click to advance, no external scripts, fonts and images local), 10–12 slides:
   the problem (the challenge: mission design trade-offs are invisible to students) → MissionForge in one
   line → how it plays (one big screen, phones as consoles) → the trade-offs that matter (mass, power,
   budget, instruments, orbit, comms) → the vote and the part card → flight and minigames → debrief and
   facts (physical model vs game simplification) → NASA data and sources → accessibility and 6 languages
   → how it was built (Unity host, phone web app, room server, tests; the AI-agent team, as disclosed in
   `AI_DISCLOSURE.md`) → what is next (honest built vs planned) → "Play it now" with the URL and a QR code.
   Use only real screenshots and key art; every number from the data files. Style matches the game
   (dark space background, the game's palette and fonts from `docs/play/judges.html`).
2. **PDF** `submission/presentation/MissionForge-deck.pdf`: export the deck with Playwright
   (`page.pdf`, 1920×1080 pages); under 15 MB. This is what goes in the form's slides field.
3. **Presenter script** `submission/presentation/PRESENTER_SCRIPT.md`: two versions, a 3-minute pitch
   and a 5-minute pitch with a live demo, one speaker block per slide with words to say (plain spoken
   English, timed), who speaks if two presenters, and the exact moment to switch to the live game.
4. **Live-demo run-sheet** `submission/presentation/LIVE_DEMO.md`: for the hosted URL:
   T-15 min wake the free Render instance and open a room; laptop + projector setup; how to put the QR on
   screen and get judges to join from their phones; a 4-minute demo path (lobby → briefing → two part votes
   → one minigame → debrief) using the host lobby's shortest timers or the phone `?mock=1` session where
   the big-screen screens are still placeholders; what to say while each step loads; fallbacks for no
   Wi-Fi, site asleep, Render down (local launcher from `RELEASE.md` 1.1, `?mock=1`, the demo video
   `submission/video/missionforge-demo-2min.mp4`); a reset procedure between judges.
5. **Judges' Q&A** `submission/presentation/QA.md`: 15 likely questions with short, honest answers
   (physics accuracy and simplifications, what NASA data is used, classroom use, scale, accessibility,
   AI use, what is not built yet).
6. Rehearse: run the 5-minute script against the live site once with 3 phone-sized browser contexts,
   time each part, fix the script to fit, and record times plus screenshots in `orchestration/evidence/T052/`.
   Screenshot every slide at 1920×1080 and look at each: no clipped text, readable at projector distance
   (body text ≥ 28 px). Update the checklist row to point at the PDF.

## Acceptance

Deck (HTML + PDF), presenter script (3 and 5 min), live-demo run-sheet with fallbacks, Q&A, all
consistent with the data and honest about what is built; rehearsal timed against the live site; slide
screenshots reviewed; checklist row updated.
