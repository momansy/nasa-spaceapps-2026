# T051 — The full game explanation: "How MissionForge works" guide (Markdown + web page)

**Worker:** a coding/writing worker (`momansy`) · **Owns:** `GUIDE.md` (create, repository root), `docs/play/guide.html` (create), one "How to play" link added to `docs/play/index.html` and `docs/play/judges.html`, one line linking `GUIDE.md` in `README.md` and `JUDGES.md`, `orchestration/evidence/T051/`

Judges, teachers and new players have no single explanation of the game. `GAME_DESIGN.md` is a
1,700-line design spec (including planned features), `JUDGES.md` is one page, `RELEASE.md` section 5
is an operator runbook. Write the complete, accurate explanation of **the game as built on main
today**, readable by a 14-year-old and by a judge in 10 minutes.

**Deadline: merged before 11:30 UTC.** `docs/play/` changes redeploy the live site
(<https://missionforge-spaceapps.onrender.com/play/>); one merge only, so put the page and both links in the same PR.

## Steps, in order

1. Inventory what is built, from the code and data, not from the design doc: `data/contracts.json`
   (contracts), `data/` parts and roles/consoles, `data/strings/en*.json`, `client/src/minigames/`
   (all minigames with their names and what triggers each), `core/` scoring (`Scoring/`, `Session/`,
   `Campaign/`), the phone screens in `client/src/screens/`, the Unity host screens in
   `unity/MissionForge/Assets/MissionForge/Screens/` (which exist and work, which are placeholders),
   and the live site. Record the inventory in `orchestration/evidence/T051/INVENTORY.md`.
2. Write `GUIDE.md` with these sections, with every number taken from the data files:
   1. What MissionForge is (3 sentences) and what you need (one big screen, 1–10 phones, any network; hosted link and the local launcher).
   2. Start a game: host → room code/QR → join → lobby settings (what each setting does).
   3. The session flow, phase by phase (lobby, briefing, build votes, GO/NO-GO review, flight, debrief), with what the big screen and the phones show in each, and roughly how long each takes.
   4. Roles and consoles: every Mission Control console, its insight and its special ability; pilot/co-pilot; spectators and the audience bar.
   5. Voting: how a vote works, timers, ties, vetoes or boosts as implemented, what the stats and drawbacks on part cards mean.
   6. The engineering trade-offs that decide a mission: mass, power, budget, schedule, instruments, orbit, communications, reliability; for each, what the game models physically and what is a game simplification (link the assumptions register in `GAME_DESIGN.md` section 19 and the data files).
   7. Contracts: a table of every contract (goal, payload, orbit, budget, days, difficulty).
   8. Minigames: a table of all minigames (name, which flight moment or console triggers it, what you do, what success changes).
   9. Scoring and the debrief: how the score and grade are computed (from `core/` scoring), facts collected, awards, campaign progress.
   10. Accessibility and languages (the 6 languages, large text, reduced motion, colour-safe, screen reader support as built).
   11. Science sources: where the facts and numbers come from (`submission/NASA_RESOURCES.md`).
   12. Built vs planned: a short honest list of big-screen screens or features that are still placeholders on main.
   13. Glossary (reuse `GAME_DESIGN.md` 21 where it applies).
3. Build `docs/play/guide.html` from the same content: one static, self-contained page in the same style
   as `docs/play/judges.html` (reuse its CSS variables and fonts), a table of contents, real screenshots
   from `orchestration/evidence/` or `submission/video/stills/` (copy the few you use into
   `docs/play/guide/`, each under 300 KB), readable at phone width (no horizontal scroll at 375 px), dark
   background, accessible headings and alt text. No external scripts.
4. Add a "How to play" link to `docs/play/index.html` and `docs/play/judges.html`, and a `GUIDE.md` link
   to `README.md` and `JUDGES.md`. Change nothing else in those files.
5. Check: every number in the guide matches the data (write a small script or a table of checks in the
   evidence folder); open `guide.html` at 1280 and 375 px wide and screenshot both; run a link check over the page.

## Acceptance

`GUIDE.md` and `docs/play/guide.html` cover all 13 sections; numbers match the data files (checks
recorded); built vs planned stated honestly; links added; page readable on a phone; merged before 11:30 UTC.
