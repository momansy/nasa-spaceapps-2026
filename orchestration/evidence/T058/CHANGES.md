# T058: list of every change

Base: `main` at `001652e`, 2026-11-15. Fact table: `FACTS.md`. Test logs: `tests/`. Live-site check: `live/LIVE_CHECK.md`.
Slide renders of the re-exported deck: `slides/` (the build script writes them to `orchestration/evidence/T052/slides/`; they were copied
here and T052's files were restored so this task stays in its lane).

## Themes (why most edits were needed)

1. **T027 merged** (`bd06ad0`): the big-screen Mission Briefing, Contract Vote, Test Stand, Design Review and Flight Readiness Review are real
   screens on `main` now, so "10 of 16 screens" and "placeholder scenes" were wrong. Now: 15 of 16 (no separate Minigame Overlay screen), with the
   honest gaps: the Build Bay does not open the Test Stand or Design Review by itself, it builds C1 whatever contract wins, and no full room session
   has gone through the new screens. The hosted WebGL build is still the 06:32 one (Title, Lobby, earlier Build Bay).
2. **T048, T050 and issue #206 merged**: sentences that called them open were updated.
3. **Test counts changed**: phone client 922 of 927 (was 911 of 916); the 5 failures are now the pre-flight translation gap (T057), not #206.
   Strict data validation still fails, for that new reason (985 errors).
4. **Session length**: "about 35 minutes with the shortest timers (22 votes × 54 s)" predates the T035 lobby timers. Replaced everywhere by the design
   estimate (25 to 40 min, not measured) plus what the timers give: 46 s a round at defaults (≈ 17 min for C1's 22 votes), 21 s at the shortest (≈ 8 min).

5. **Found by the independent review (second pass):** (a) on `main` a live room stops at the Flight Readiness Review, because the Build Bay never
   hands its build over (`MissionContext.Build` unset; `FrrScreen` logs "no build to review"): added to J, R, G, PD, QA and FACTS C2b.
   (b) The hosted build was described as "title, lobby and Build Bay"; in a live room it stops at its placeholder briefing and contract vote
   (LIVE_DEMO 0, T058 live screenshot), so J, G, R, PD, CL, DV, QA and deck slide 10 now say that. (c) The "8 minutes at the shortest" figure is
   `main` only (hosted shortest vote timer 20 s): caveat added in J, PD, QA. (d) "Predict before vote" got its caveat (not sent by the Build Bay)
   in J and PD. (e) Local user paths were replaced by `<repo>` in the test logs. (f) Wording: GUIDE "No screen of its own"; PRESENTER_SCRIPT
   "pre-flight host strings". The PDF was re-exported again (12 pages, 2,345,377 bytes, 0 clipped, 0 broken images).

6. **Live site (step 2, `live/LIVE_CHECK.md`, summary in `FACTS.md` F):** everything the edited documents say a judge will see on the hosted
   site was confirmed: the QR and room code, 10 seats, all 10 roles dealt to 2 phones, 6 languages, the hosted vote timers of 20–60 s, and a live
   room stopping at the placeholder briefing and contract vote. The only document change it caused: GUIDE says the hosted build has an earlier,
   placeholder Settings screen. The server also restarted during the check (10:46:42 UTC), which matches the documented "a restart drops every room".

## Files owned by T058

| File | Change |
|---|---|
| `JUDGES.md` | Guide note: GUIDE.md now current, web page older. Hosted big screen: also lacks briefing, contract vote, reviews, end screens. Session flow: lists the pre-flight screens on `main`. Known limitations: hosting bullet adds the T048 result and the T058 live check; big-screen bullet rewritten (15 of 16, gaps, test status 5 of 927, T057 instead of #206); session-length bullet rewritten |
| `README.md` | Count base `001652e`; phone client 922 of 927 (48 files), T057; big-screen row 15 of 16 with gaps; WebGL row names pre-flight screens; dropped the "guide predates T024" note |
| `GUIDE.md` | Hosted note (earlier build, three screens); Briefing row mentions film and contract vote; Debrief row no longer "placeholder"; contract note (vote exists, Build Bay builds C1); scoring note (Debrief/Campaign Hub calculated by Core, not hosted); accessibility bullet (Settings overlay exists, 200 % RTL limit); fixed broken link `credits.html` → `docs/play/credits.html`; typo "reduced motion ." ; section 12 table rewritten (hosted build row, pre-flight row, end-screen row, minigame overlay row, contract selection, translation row replacing the stale "Settings placeholder" row); "working end to end" sentence separates hosted from `main` |
| `HOSTING.md` | Status: hosted build also predates pre-flight screens; T048 result and defects; pointer to the live check. Section 2: repository "was private at the time (it is public now)". Section 4: what to do after a restart (phones reload and rejoin; D-110, D-111) |
| `submission/PROJECT_DESCRIPTION.md` | Status line to `001652e` and the merged/not-merged list; section 2 build bullet (T027 screens exist, gaps); section 4 step 4 (screens not in the WebGL build; session length); hosted paragraph (T048 result, live check); section 5 host row (pre-flight screens); verification paragraph (T058 re-run numbers, older numbers labelled T046/T027); section 8 first bullet (15 of 16, gaps, T027 evidence, EditMode 466), WebGL bullet (T027 merged after the build; T055), hosting bullet (T048 defects), new bullet on English-only pre-flight text, D-102 fixed by T050; section 9 item 1 (T055, Build Bay wiring, T057) |
| `submission/CHECKLIST.md` | Section 0 heading (re-checked by T058); hosting bullet (T048 merged; what is still untested); item 2 (T027 screens in the list of what needs the rebuild; T055); item 5 (open work is now T055 and T057); item 6 (translation gap is now `en.host_preflight.json`, 985 errors, T057); section 4 final-read line (T055, T057) |
| `submission/AI_DISCLOSURE.md` | Test counts (922 of 927, Core count labelled T046, T058 logs); open defects also in T048 |
| `submission/DEMO_VIDEO_SCRIPT.md` | "Big-screen briefing is a placeholder" → the screens are in the Unity source on `main` (T027), not in the committed WebGL build |
| `submission/video/README.md` | Same correction for the big-screen screens; no capture of them was used in the videos |
| `submission/presentation/deck.html` + `MissionForge-deck.pdf` | Slide 6: flight screen is in the main code, not yet hosted. Slide 10: big screen "Unity 6 host. 15 of 16 screens in code, 3 hosted"; test line (server 247 of 247; phone 922 of 927, 5 parity failures; Core 568 (T046); Unity EditMode 466 (T027)); evidence footer T027, T046, T058. Slide 11: Built/Planned lists and bottom card (hosted build is older). PDF re-exported: 12 pages, 2,345,377 bytes (final export), 0 clipped text, 0 broken images, 0 failed requests, smallest font 28 px. Slide 10 big-screen box finally reads "Unity 6 host. 15 of 16 screens in code; title and lobby hosted" |
| `submission/presentation/QA.md` | Q6 and Q8 session length; Q8 audience weight is on `main`, not hosted; Q13 screens (hosted vs `main`, gaps); "answers to avoid" qualified to the hosted build |
| `submission/presentation/PRESENTER_SCRIPT.md` | Honesty rule and the slide-11 lines of both scripts (hosted vs code); numbers table (test counts, do not say "all tests pass"; 15 of 16 row); word and time totals updated (338 words / 135 s; 329 words / 132 s) |
| `submission/presentation/LIVE_DEMO.md` | Dropped "35-minute"; status table and "do not say" lines qualified to the hosted build; new paragraph: the run-sheet describes the hosted build (T040), newer screens are on `main` only |
| `submission/presentation/README.md` | Numbers also come from the test evidence on slide 10 |
| `orchestration/evidence/T058/` | New: `FACTS.md`, `CHANGES.md`, `tests/` (logs), `slides/`, `live/` |

Spell check: `npx cspell@8.17.5` (en, en-GB) over every owned Markdown file; the only unknown words are names and terms (Higgsfield, EECOM,
periapsis, Hoverslam, onrender, …). The presentation files were also read in full by a subagent: no typos; British spelling consistent.

## Fixes for files T058 does not own (apply in a follow-up)

`docs/play/judges.html` and `docs/play/guide.html` were not edited: the brief allows it only if merged before 11:30 UTC, which this task cannot
guarantee, and any `docs/play/` change redeploys Render and drops open rooms.

| File | Stale text | Fix |
|---|---|---|
| `docs/play/judges.html` | Mirrors the old `JUDGES.md`: "still calls the Debrief, Campaign Hub, Codex and Settings screens placeholders"; "the flight view is not in it yet"; "(10 of 16) … placeholder scenes"; "5 of 916 … issue #206"; "about 35 minutes … 54 s each"; hosting "a complete session … was not run" | Copy the five changed paragraphs of `JUDGES.md` (guide note, hosted bullet, session-flow paragraph, Known limitations: hosting, big screen, session length) |
| `docs/play/guide.html` | Same text as the old `GUIDE.md`: Debrief "a placeholder", scoring note "placeholders and do not yet call them", Settings "static placeholder", "reduced motion ." , section 12 table | Apply the `GUIDE.md` changes above (the page's `credits.html` link is correct there, it is relative to `docs/play/`). The page is generated by `orchestration/evidence/T051/build_guide.py`; its section 12 text is hard-coded there too |
| `RELEASE.md` 5 (lines ~160 and 172–173) | "Vote timer 20 s (the shortest the UI offers)"; "a round is REVEAL 3 s + PREDICT 8 s + INSPECT 20 s + VOTE 20 s + RESULT 3 s, about 54 s with the UI's shortest timers … whole session about 35 minutes" | Lobby on `main` offers vote 10–60 s and inspect 5–60 s; the Build Bay sends no PREDICT; a round is 46 s at defaults, 21 s at the shortest; keep "25 to 40 minutes" as the design estimate. (The hosted build's lobby still offers 20 s as its shortest vote timer; say which build is meant) |
