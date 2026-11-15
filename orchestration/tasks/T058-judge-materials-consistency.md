# T058 — Final consistency check of everything a judge will read or watch

**Worker:** a coding/QA worker (`ahmed-saeed-amek`) · **Owns:** text fixes in `submission/*.md`, `submission/presentation/*.md` and `deck.html` (then re-export the PDF with `submission/presentation/build-pdf.mjs`), `JUDGES.md`, `GUIDE.md`, `README.md`, `HOSTING.md`, `orchestration/evidence/T058/`. `docs/play/guide.html` and `docs/play/judges.html` only if merged before 11:30 UTC; after that list the fix instead. · **Deadline: PR open by 11:45 UTC**

Several workers wrote judge-facing material in parallel today: `GUIDE.md` + `docs/play/guide.html` (T051),
the presentation kit `submission/presentation/` (T052: deck, presenter script, live-demo run-sheet, Q&A),
`submission/PROJECT_DESCRIPTION.md`, `submission/CHECKLIST.md`, `JUDGES.md` (T046), `submission/video/README.md`
and subtitles (T049). Fresh eyes: make them agree with each other, with `data/`, and with the live game
<https://missionforge-spaceapps.onrender.com/play/>.

1. Build a fact table (`orchestration/evidence/T058/FACTS.md`): every number and claim that appears in more
   than one document (players 1–10, contracts and their numbers, minigame count, languages, console roles,
   vote count 22, session length, test counts, hosted URL, licence, what is built vs planned). Source of
   truth: `data/` files and current main; mark each document that disagrees.
2. Check claims against the live site: open the hosted URL, host a room, join with 2 phone-sized browser
   contexts, and confirm what the docs say a judge will see. Note: the big-screen host is being rebuilt
   (T055, about 12:15 UTC) with the real briefing, contract vote, FRR, flight and debrief screens: describe
   those as they are on main, not as placeholders, and do not claim anything that is not on main.
3. Fix every disagreement in the files you own (smallest edit, keep honest labels). Re-export the deck PDF if
   `deck.html` changed. Spell-check all of them.
4. PR titled "T058: judge-material consistency fixes" with the fact table and a list of every change.

Acceptance: fact table complete; every judge-facing document consistent with data and with main; PDF
re-exported if needed; PR open by 11:45 UTC.
