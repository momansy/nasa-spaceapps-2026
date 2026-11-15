# Submission checklist

Deadline: **15 Nov 2026, 23:59 in the team's event local time** (`docs/index.html` section 12, `RELEASE.md`).
Check the live form and the official rules before relying on anything below.

## 0. Read this first: three things found on 2026-11-15 that block a clean submission

1. **The GitHub repository is private** (`gh repo view momansy/nasa-spaceapps-2026` reported `PRIVATE`) and has **no
   licence file**. Judges cannot open a private link. Before submitting, the owner must either make the repository
   public (and choose a licence) or give the form whatever access method it allows. Review for secrets first
   (`RELEASE.md` section 4 has the grep). Nothing in this package was changed to depend on either choice.
2. **`https://nasasc.netlify.app/play/` returned HTTP 404** (and so did `/play/judges.html` and
   `/play/host/Build/host.wasm.unityweb`) when checked on 2026-11-15. `JUDGES.md` says the pages appear after the Netlify
   site is redeployed from `main`. Redeploy, then re-check with `curl -sI` (RELEASE.md 3.1). Even when deployed, that URL
   serves static pages only; **the game needs the room server**, which is not hosted anywhere (see section 3, "hosted URL").
3. **No finished demo video exists.** `assets/media/cinematics/c1-earth-watch-briefing.mp4` is a 10-second briefing clip,
   not a demo. Record and upload the video from `DEMO_VIDEO_SCRIPT.md`.

## 1. The form: field by field

**The official submission form could not be read** by the agent that wrote this file (the spaceappschallenge.org pages
failed to load; the HackAthlone mirror and its FAQ list no submission fields). The rows below are the fields a Space Apps
project page normally asks for. **Treat the list as expected, not confirmed: compare it with the live form and add or
remove rows.** The source for each answer is the file or section named.

| Form field (expected) | Answer comes from | Team must do by hand |
|---|---|---|
| Challenge | Space Mission Design Game | Select it on the form |
| Project title | `MissionForge` | Paste |
| Team name | `Winton` (credits and judges pages) | Confirm this is the registered team name |
| Team members | not in the repository (`tools/demo/team.json` has an empty `members` list) | List every member exactly as registered; fill `tools/demo/team.json` and run `node tools/demo/build-credits.mjs` if the credits page should list them |
| Short summary / one-line description | `PROJECT_DESCRIPTION.md` section 1 (96 words); if the form limit is shorter, use its first sentence: "MissionForge is a cooperative party game for 1 to 10 players who run a space agency." | Paste, trim to the limit |
| Full project description | `PROJECT_DESCRIPTION.md` sections 2 to 9 | Paste (convert tables to lists if the form is plain text) |
| How the project addresses the challenge | `PROJECT_DESCRIPTION.md` section 3 (requirement-to-feature table) | Paste |
| What the project does / how it works / how to use it | `PROJECT_DESCRIPTION.md` sections 2 and 4 | Paste |
| Technology and tools used | `PROJECT_DESCRIPTION.md` section 5 | Paste |
| Real versus simplified | `PROJECT_DESCRIPTION.md` section 6 | Paste |
| NASA data, resources and references used | `NASA_RESOURCES.md` | Paste; confirm the nine challenge links against the official page |
| Use of AI / AI disclosure | `AI_DISCLOSURE.md` (short version at the top, 122 words) | Confirm the design-document sentence, check the wording against the official AI rules, paste |
| Link to the demo video | upload of the video made from `DEMO_VIDEO_SCRIPT.md` | **Record, edit, upload (YouTube or the platform the form names), set it viewable by judges, paste the link** |
| Link to the live project or demo | see section 3 | **Redeploy Netlify, decide what the link opens (section 3)** |
| Link to source code | `https://github.com/momansy/nasa-spaceapps-2026` | **Make public or provide access; add a licence** (section 0, item 1) |
| Link to presentation / slides | none exist | Skip if optional, or build a short deck from `JUDGES.md` |
| Images / screenshots / logo | `assets/media/key-art/missionforge-16x9.png`, `missionforge-1x1.png`; screenshots under `orchestration/evidence/T015/` (host Build Bay), `T029/` (host title and lobby), `T030/` and `T036/` (phone) | Choose and upload; keep the AI-generated labels in `AI_DISCLOSURE.md` |
| Licence of the project | none in the repository | **Choose a licence**; check it against third-party licences on `docs/play/credits.html` |
| Languages / accessibility (if asked) | `PROJECT_DESCRIPTION.md` section 7 | Paste |
| Anything about data privacy | no accounts, no stored data, no free-text chat, rooms in memory only (`GAME_DESIGN.md` 17.9, `RELEASE.md` 3.2) | Paste if asked |
| Acknowledgements / credits | `docs/play/credits.html`, `NASA_RESOURCES.md` section 6, `assets/media/CREDITS.md` | Paste a short version |
| Disclaimers | "Not affiliated with or endorsed by NASA." (already on the judges page) | Include |

## 2. Files in this folder

| File | Pasted where |
|---|---|
| `PROJECT_DESCRIPTION.md` | Project description fields |
| `NASA_RESOURCES.md` | Resources / data used |
| `AI_DISCLOSURE.md` | AI use statement |
| `DEMO_VIDEO_SCRIPT.md` | Script for the video the team records |
| `CHECKLIST.md` | This file |

Evidence for every claim: `orchestration/evidence/T042/README.md`.

## 3. Decide the "hosted URL"

The game has three parts that must run together (Unity big screen, phones, room server). Choose one honest option:

| Option | What to put in the form | Cost and risk |
|---|---|---|
| A. Static site only | `https://nasasc.netlify.app/play/` with the line "static pages (entry, credits, judges, mock phone demo); the full game runs from the one-command launcher in the repository" | Works once Netlify is redeployed. The phone mock `/play/client/?mock=1` works without a server; the Unity host page opens but cannot create a room |
| B. Host the room server | Stand up `server/` behind TLS (`RELEASE.md` 3.2), rebuild the phone client with `MF_ROOM_SERVER_URL=wss://...` (`RELEASE.md` 2.2) and open the host with `?server=wss://...` | Not done and **untested on a public host**. Needs a server account; do not start this late on deadline day without a rehearsal |
| C. Video plus repository | Link the video and the repository; describe the launcher in the description | Safest if time is short |

Recommended: **A or C** for the deadline; B afterwards.

## 4. By-hand list before pressing Submit

- [ ] Team names and members entered on the form and (optionally) in `tools/demo/team.json`, credits page rebuilt
- [ ] Repository public (or access arranged), licence added, secrets grep clean (`RELEASE.md` section 4)
- [ ] Netlify redeployed from `main`; `curl -sI https://nasasc.netlify.app/play/` shows 200; `/play/judges.html` and `/play/credits.html` open
- [ ] Demo video recorded (one real run, real phones), subtitles added, uploaded, link tested while logged out
- [ ] Every number said or shown in the video matches `data/contracts.json` (C1: 150 kg, 550 km, 97.6 degrees, 90 M game-dollars, 180 days)
- [ ] Debrief score in the video comes from a real session, not the test fixture (see `DEMO_VIDEO_SCRIPT.md`)
- [ ] `AI_DISCLOSURE.md`: design-document sentence confirmed; wording checked against the official AI rules; images and video looked at by a person
- [ ] Music or voice used in the video added to `AI_DISCLOSURE.md` and `NASA_RESOURCES.md` if it needs a credit
- [ ] Form field list compared with the live form (this file's section 1 is a guess)
- [ ] Known limits (`PROJECT_DESCRIPTION.md` section 8) left in the text: do not remove the statements about the host screens that are not built
- [ ] Final read of the pasted text for anything not true on the day (hosted URL status, repository visibility)
- [ ] Submitted before 23:59 local; screenshot of the confirmation saved
