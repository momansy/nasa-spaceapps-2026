# AI use disclosure

For the AI-assistance statement of the NASA Space Apps Challenge 2026 submission. Written from the repository
record (commit trailers, `assets/media/CREDITS.md`, `assets/media/GENERATION_LOG.json`, `orchestration/`,
`docs/play/credits.html`). Where the record is silent, this file says so instead of guessing.

## Short version (paste-ready, 122 words)

MissionForge was built by a small human team directing AI coding agents. Anthropic's Claude Code (Claude Fable 5.2,
Opus 5.5 and Sonnet 5.5) wrote and tested most of the code, game data, documents and 3D-model scripts in separate
branches, working from a game design and task briefs set by the team; OpenAI's Codex did the art direction and media prompts. Eight still images were
generated with Higgsfield (GPT Image 2.6) and one 10-second briefing video with Google Gemini. No audio is
AI-generated or bundled. The team assigned tasks, reviewed and merged the work, and chose the concept and architecture. All 40 facts
shown to players were checked against NASA or agency sources, and every AI-generated media file is logged with tool,
model and date.

## 1. Coding agents

| Who | What | Record |
|---|---|---|
| Claude Code agents (Claude Fable 5.2, Claude Opus 5.5, Claude Sonnet 5.5) | Core rules in C#, Unity host screens and scenes, Node room server, phone web client and minigames, data files, tools, tests, documents, this submission package | `Co-Authored-By` trailers in the git history name these models (Fable 5.2: 15, Opus 5.5: 36, Sonnet 5.5: 7 commit trailers at the time of writing); each task's brief and evidence are in `orchestration/tasks/` and `orchestration/evidence/` |
| Codex agents (OpenAI) | Art direction and style guide, media prompt pack and the T005 verification script | `assets/media/CREDITS.md` ("Codex text authoring"); the exact Codex model variant is **not recorded**. The repository does not record which tool wrote other work planned for Codex workers (`orchestration/WORK_BREAKDOWN.md`); the balance validator and playtest harness commits carry Claude trailers |
| Orchestrator agent | Planned and split the work, wrote task briefs, reviewed and merged pull requests, ran integration checks; used local subagents | `orchestration/` and `Co-authored-by: kingrma-orchestrator` trailers. The model behind it is **not recorded** in the repository |

How the work ran: each task was one branch and one pull request into `main`, written to a brief that names the
files the agent may change, the tests to run and the evidence to leave. Agents run in a mesh coordinated through
GitHub issues (`CLAUDE.md`, `AGENTS.md`, `orchestration/STANDING_ORDERS.md`). They did not push to `main` themselves;
a worker process committed their branch and opened the pull request, and the orchestrator and team owner reviewed
and merged.

What the code claims are backed by: `dotnet test core/dotnet~` (568 tests), `npx vitest run` in `client/` (911 of 916 pass; the 5 failures are translation-parity checks for new host strings),
`npm test` in `server/` (247), `node tools/validate-data.mjs` and the fact check, re-run on 2026-11-15
(`orchestration/evidence/T046/README.md`; earlier runs in `T042/` and `T044/`). Passing tests show the code does what the tests say; they are not a human playtest.

## 2. AI-written content that is not code

- **Game text, data tables, Codex and facts** were written by coding agents, then every fact was checked against its
  cited page by a separate verification task (T025): 40 facts, 25 confirmed and 15 corrected, none rejected; an
  independent reviewer re-opened 10 of them. See `orchestration/evidence/T025/fact-sources.md`.
- **Translations** (Arabic, Spanish, French, Portuguese, Hindi) were produced under tasks T037, T039 and T041 by AI coding agents (those commits carry no AI trailer, so the tool is not recorded), with automated parity and layout tests. **No native-speaker review has been recorded.** Treat them as
  machine-assisted drafts.
- **3D models** are generic parts built by Blender scripts (`assets/blender/scripts/`) that AI agents wrote; the
  source `.blend` files and exports are in the repository. They are not copies of real spacecraft.
- **The game design document** (`GAME_DESIGN.md`) was committed to the repository from the team owner's account on
  2026-11-14. The repository does not record whether AI tools helped to draft it. **Team to confirm this sentence
  before submitting** (listed in `CHECKLIST.md`).
- **Documents in this folder** were written by a Claude Sonnet 5.5 agent (task T042) from the repository contents.

## 3. AI-generated images and video

All of it is logged in `assets/media/CREDITS.md` and `assets/media/GENERATION_LOG.json`, with the job id and a file hash for each still.

| File | Tool and model | Date (UTC) | Note |
|---|---|---|---|
| `assets/media/style/frames/01-title.png`, `02-build-bay.png`, `03-ascent.png`, `04-orbit-operations.png`, `05-reentry.png`, `06-mission-control.png` | Higgsfield `generate_image`, model `gpt_image_2_6`, 2K | 2026-11-14 | Prompts in `assets/media/style/PROMPT_PACK.json`. The orbit frame is the design anchor for the satellite |
| `assets/media/key-art/missionforge-16x9.png`, `missionforge-1x1.png` | same | 2026-11-14 | The square image has visible banding around the sun halo (noted in the log) |
| `assets/media/cinematics/c1-earth-watch-briefing.mp4` (10 s, 1280x720, 24 fps) | Google Gemini video export supplied by the project owner; **exact Gemini model, original prompt and job id were not provided** | 2026-11-14 | Audio track removed with a lossless FFmpeg stream copy; video not re-encoded |

- The 10 Higgsfield credits were the whole paid generation budget: 8 approved stills, 1 rejected attempt
  (job `d747694a-f33a-42ac-b4e7-721e3efca9ce`, file not kept) and 1 timed-out submission that was charged but not recoverable.
- Each approved still was inspected for text, logos and watermarks; none was found. No real mission patch, NASA logo or
  corporate livery is imitated.
- The providers' licence terms for generated media have **not been reviewed by the team**.
- No other AI-generated imagery is in the game's gameplay screens: the Unity host renders its own 3D scene, and the Earth
  textures are NASA imagery (see `NASA_RESOURCES.md`). Note: `unity/MissionForge/THIRD_PARTY.md` ends with the sentence "No
  AI-generated media is included in this project." That sentence refers to the Unity project's own asset folders and
  predates the key art and video in `assets/media/`; it should not be read as a statement about the whole repository.
- **No audio is AI-generated.** No audio recordings are bundled.
- **Trailer music (T053).** The soundtrack of `submission/trailer/` does not come from an AI audio model or from samples. It is
  synthesized sample by sample by a script, `submission/trailer/scripts/music.mjs`. An AI coding agent (Claude Code) wrote
  that script, including the chords, drum patterns and sound design. The trailers reuse only the AI images and video listed
  in the table above, each labelled "AI-generated" on screen.

## 4. What humans decided and reviewed

- The team chose the challenge, the MissionForge concept and the engine architecture ("Unity host plus web phones",
  decided by the team owner on 2026-11-14, `orchestration/ARCHITECTURE.md`).
- The team owner assigned every task, set the usage budgets for each agent, reviewed and merged each pull request, and
  approved the paid media budget (`orchestration/WORK_BREAKDOWN.md`).
- The project owner supplied the briefing video (Gemini export). The approval gate for each still (no text, logos or watermarks; design consistency) is recorded in `CREDITS.md`, written by the agent that ran the generation; whether a person looked at each image is not recorded, so the team should look at them before submitting.
- A person must still do these by hand before submission (see `CHECKLIST.md`): confirm the team list, confirm the design
  document sentence above, and check the AI statement matches the current official rules.

## 5. Where AI output was found wrong (examples, honestly)

- 15 of 40 draft facts needed correction against their sources (for example the speed of low Earth orbit became a range
  and the Mars signal delay range was changed), found by the verification task.
- A generated mission-control image showed the wrong object on its big screen and was rejected and regenerated.
- The first end-to-end playtest (`orchestration/evidence/T028`) found defects; two major ones (D-001, D-002) were fixed by agents and confirmed fixed in the second round (`T036`), while a marginal vote-latency defect (D-003) is still present.
- Open defects are listed in `orchestration/evidence/T036/DEFECTS.md`.
