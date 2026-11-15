# MissionForge presentation kit (task T052)

| File | What it is |
|---|---|
| `deck.html` | 12-slide 16:9 deck, one self-contained page (fonts in `fonts/`, images in `img/`, no scripts from the network). Arrow keys or click to move, F for full screen, P to print. `deck.html#6` opens slide 6 |
| `MissionForge-deck.pdf` | The same deck as a PDF, 12 pages at 1920x1080, 2.3 MB. This is the file for the submission form's slides field |
| `PRESENTER_SCRIPT.md` | 3-minute pitch and 5-minute pitch with a live demo: words, timing, who speaks, the moment to switch to the live game |
| `LIVE_DEMO.md` | Run-sheet for the hosted game: wake-up, laptop and projector, QR and joining, the demo path, fallbacks, reset between judges, rehearsal timings |
| `QA.md` | 15 likely judges' questions with short, honest answers |
| `build-qr.mjs`, `build-images.mjs`, `image-sources.json`, `build-pdf.mjs` | Rebuild the QR code, the deck images, the slide screenshots and the PDF (see `orchestration/evidence/T052/README.md`) |

Every number in the deck comes from `data/`, `submission/PROJECT_DESCRIPTION.md` or the test evidence named on slide 10. The deck says what is built and what is planned; it shows
real screenshots only (the Build Bay is a rehearsal build with simulated voters, and the phone part card, debrief and settings come from the
scripted demo session `?mock=1`; each slide says so). Not affiliated with or endorsed by NASA.
