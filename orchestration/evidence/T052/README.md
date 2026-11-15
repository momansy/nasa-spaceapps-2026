# T052 evidence: presentation kit

Deliverables are in `submission/presentation/` (`deck.html`, `MissionForge-deck.pdf`, `PRESENTER_SCRIPT.md`, `LIVE_DEMO.md`, `QA.md`).
This folder holds what shows they were checked. Date: 2026-11-15. Machine: Windows 11, Node 24, Playwright Chromium.

## Slides (step 6)

- `slides/slide-01.png` to `slide-12.png`: every slide at 1920x1080, rendered from `deck.html` by `submission/presentation/build-pdf.mjs`. All 12 were looked at.
- `slides/layout-check.json`: per-slide automatic check. No clipped text, no missing images, no failed requests. **Smallest body text 28 px**
  (captions, table tags and the diagram labels); footers (page number, source line) are 24 px and are not counted as body text. Text inside the
  embedded screenshots is small because the screenshots are real captures; the words on the slide carry the message.
- The PDF has 12 pages at 1920x1080 (1440x810 pt), 2.3 MB.
- `qr-decoded.txt`: the QR on slide 7 decoded with jsQR to `https://missionforge-spaceapps.onrender.com/play/`.
- `host-lobby-qr-decoded.txt`: the QR on the real host lobby (live capture) decodes to `https://missionforge-spaceapps.onrender.com/play/client/?room=<CODE>`.

## Rehearsal against the live site (step 6)

Live site: <https://missionforge-spaceapps.onrender.com>. Headless Chromium with **software WebGL** (the Unity host drew 0.1 to 0.5 frames a second), host
and phones on one CPU. Phone contexts were 390x844, device pixel ratio 2, touch.

| Run | Script | What it did | Log |
|---|---|---|---|
| Real host, 3 phones | `explore-host.mjs`, `rehearse.mjs` (run twice: `r1`, `r2`) | Loaded the hosted Unity host, created a room, joined 3 phones with the lobby QR URL, opened the lobby, started the briefing, pressed Continue, pressed START VOTE | `rehearsal/log-r1.txt`, `log-r2.txt`, `timings-r*.json` |
| Scripted host, 3 real phone pages | `rehearse2.mjs` | The repository's scripted stand-in host (`tools/e2e/host/scripted-host.mjs`) on the live room server, 3 phone pages driven through lobby, contract vote, 5 part rounds, test, PDR, 2 FRR polls, 7 minigames, debrief | `rehearsal/log-part2.txt`, `part2/timings.json` |
| Phone mock session | `rehearsal/mock-capture.mjs` (copy of the demo video's `record-session.mjs` pointed at the hosted client) | `?mock=1` at speed 1, join to debrief | `rehearsal/log-mock.txt` |
| Mock at speed 1.5, 2 and 4 | same script | **The driver script failed** (it timed out waiting for `PREDICT` or `role-ready`): not evidence that the page is broken, but speeds other than 1 are **not verified** | `rehearsal/log-mock15.txt`, `log-mock2x.txt` |

Key results (also in `LIVE_DEMO.md` section 6):

- Awake health check: HTTP 200 in 0.8 s. Host load to title 20 to 50 s. New mission to room code about 1 s.
- Real host: Open lobby, Start briefing (4.7 s to `BRIEFING`, twice) and Continue (4 s to `CONTRACT_VOTE`, twice) all worked, and the phones moved to the role card.
  **The briefing and contract-vote screens show layout only (dashes and placeholder text), and START VOTE did not change the big screen in 6 minutes**
  (`r2-host-04-t391.png`, `r2-host-07-t621.png`, `r1-host-02-t347.png`). The phone changed to a build screen 9 s after START VOTE.
  The real host never reached the Build phase.
- One of six real-host attempts did not create a room on the first New mission click (title screen had been idle for longer than 30 s); a second click worked.
- Scripted host plus 3 phone pages: lobby to debrief in 234 s with the shortest timers.
- Phone mock at speed 1: join to debrief in 270 s.

## What was not verified

- Timing on a laptop with a GPU, phones on separate devices and mobile data, more than 3 phones, a 22-vote session.
- The mock at speeds other than 1 with a human (the driver script failed at 1.5, 2 and 4).
- The two-host-tabs reset idea in `LIVE_DEMO.md` section 8 (marked untried there).
- The speaking times in `PRESENTER_SCRIPT.md` are word counts at 150 words a minute, not a person reading aloud with a stopwatch.

## Re-running

From the repository root (Node 20+; `npm --prefix tools/e2e ci` once):

```
node submission/presentation/build-qr.mjs          # img/qr-play.svg
node submission/presentation/build-images.mjs      # img/*.jpg from image-sources.json
node submission/presentation/build-pdf.mjs         # slides/*.png, layout-check.json, MissionForge-deck.pdf
RUN_S=420 TAG=r1 node orchestration/evidence/T052/rehearse.mjs        # real host + 3 phones (slow, 8 minutes)
node orchestration/evidence/T052/rehearse2.mjs                          # scripted host + 3 phones (4 minutes)
```

The rehearsal scripts take the base URL from `BASE` (default the Render site).
`build-images.mjs` reads source screenshots from this folder (`rehearsal/x-host-title.png`, `x-host-after-open.png`, `x-phone-after-open.png`, `part2/phone-mg-MG-08-play.png`, `mock/card2-warnings.png`, `mock/debrief-facts.png`, `mock/contrast-200.png`) and from `orchestration/evidence/T015` and `T037`.

## Independent review

A separate reviewer agent checked the kit against the brief. It found no wrong numbers and no hard overclaims. It found a broken window-switching
instruction (Alt+Tab cannot cycle three things; now one window with tabs and Ctrl+1/2/3), a script line pointing at a slide the 5-minute version skips,
and several wordings that said more than the deck ("NASA source" for every fact, "every simplification", an unqualified audience bar, "credits page" for the
translation caveat, a video cue 7 s late). All were fixed and the PDF rebuilt. Not fixed (outside T052's paths): `submission/AI_DISCLOSURE.md` still says client
912 tests where the verified count is 916.
