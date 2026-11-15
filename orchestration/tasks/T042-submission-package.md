# T042 — NASA Space Apps submission package

**Worker:** a coding/writing worker (`momansy-claude`) · **Owns:** `submission/` (create), `orchestration/evidence/T042/`

The project submits to the NASA Space Apps 2026 challenge "Space Mission Design Game" before
15 Nov 2026 23:59 local time. Prepare everything the team pastes into the official project page,
from what is actually in the repository. Do not invent features: check each claim against the
code, data and evidence folders, and mark anything not yet built as "planned".

Read: `GAME_DESIGN.md`, `JUDGES.md`, `RELEASE.md`, `docs/play/` (entry, credits, judges pages),
`assets/media/CREDITS.md` and `GENERATION_LOG.json` (AI-generated media), `orchestration/evidence/T025/fact-sources.md`
(fact sources), `orchestration/evidence/T012/balance-report.md`, `orchestration/evidence/T036/RESULTS.md`
(playtest numbers), `orchestration/WORK_BREAKDOWN.md`, and the official challenge page linked in the
team website (`docs/index.html`).

Write in `submission/`:
1. `PROJECT_DESCRIPTION.md` — the project-page text: summary (≤ 100 words), what it does, how it
   addresses the challenge (map each challenge requirement — mass, power, budget, instruments, orbit,
   communication, meaningful engineering decisions, education — to concrete features), how to play,
   technology (Unity host, phone web client, room server, Core rules), what is real physics versus game
   simplification, accessibility and languages (six), what is next.
2. `NASA_RESOURCES.md` — every NASA/space-agency resource and dataset used, with how it was used
   (fact sources, imagery credited in the game, design handbook concepts).
3. `AI_DISCLOSURE.md` — how AI was used, accurately: coding agents (Claude Code, Codex) building to a
   human-owned design, AI-generated images and video (from CREDITS.md), what humans decided and reviewed.
4. `DEMO_VIDEO_SCRIPT.md` — a 30-second and a 2-minute script with shot list (which screen, which
   capture or media file under `assets/media/`, on-screen text, narration), using only screens that exist.
5. `CHECKLIST.md` — every field of the official submission form with the file/section that answers it,
   and what the team must still do by hand (team names, hosted URL, uploading the video).

Keep it factual and specific, plain English, no marketing filler. Evidence: a short README in
`orchestration/evidence/T042/` listing every claim you checked and where.
