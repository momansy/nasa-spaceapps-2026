# MissionForge presentation kit (task T052)

| File | What it is |
|---|---|
| `deck.html` | 7-slide 16:9 deck (limited to 7 slides; the earlier 12-slide version is kept as `deck-12-slides.html`), one self-contained page (fonts in `fonts/`, images in `img/`, no scripts from the network). Arrow keys or click to move, F for full screen, P to print. `deck.html#6` opens slide 6 |
| `MissionForge-deck.pptx` | The same 7 slides as a PowerPoint file: each slide is a picture of the deck slide, with the spoken lines in the speaker notes (not editable text; edit `deck.html` and rebuild) |
| `MissionForge-deck.pdf` | The same deck as a PDF, 7 pages at 1920x1080, about 1.7 MB. This is the file for the submission form's slides field |
| `PRESENTER_SCRIPT.md` | 3-, 5- and 7-minute pitches with a live demo (7 minutes plus 3 of questions is the real judging slot): words, timing, who speaks, the moment to switch to the live game |
| `LIVE_DEMO.md` | Run-sheet for the hosted game: wake-up, laptop and projector, QR and joining, the demo path, fallbacks, reset between judges, rehearsal timings |
| `QA.md` | 15 likely judges' questions with short, honest answers |
| `build-qr.mjs`, `build-images.mjs`, `image-sources.json`, `build-pdf.mjs` | Rebuild the QR code, the deck images, the slide screenshots and the PDF (see `orchestration/evidence/T052/README.md`) |

Every number in the deck comes from `data/`, `submission/PROJECT_DESCRIPTION.md` or the test evidence named on slide 6. The deck says what is built and what is planned; it shows
real screenshots only (the Build Bay is a rehearsal build with simulated voters, and the phone part card, debrief and settings come from the
scripted demo session `?mock=1`; each slide says so). Not affiliated with or endorsed by NASA.
