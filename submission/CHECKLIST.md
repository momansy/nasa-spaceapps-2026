# Submission checklist

Deadline: **15 Nov 2026, 23:59 in the team's event local time** (`docs/index.html` section 12, `RELEASE.md`).
Check the live form and the official rules before relying on anything below.

## 0. Status on 2026-11-15 (T046 refresh): what is done and what only the owner can do

Done (checked on this date):

- **Repository is public** (`gh repo view momansy/nasa-spaceapps-2026` reported `PUBLIC`) and has an **MIT licence** (`LICENSE`, commit `e953569`).
  GitHub's licence badge shows "Other" because the file's first lines are customised; the text is the standard MIT licence. Still do the
  secrets grep from `RELEASE.md` section 4 before pressing Submit.
- **Hosting is prepared and live.** `https://missionforge-spaceapps.onrender.com/healthz` returned HTTP 200, and `/play/`, `/play/host/`,
  `/play/client/`, `/play/judges.html` and `/play/credits.html` returned 200 (`HOSTING.md`). **A full hosted session with a laptop and phones has
  not been run** (T048 not merged at the time of writing), so test it once yourself (`HOSTING.md` section 3) and wake the instance before judges look.
- **Two demo videos exist** in `submission/video/` (2:00 and 0:30, English and Arabic subtitles) and a cover image in `submission/media/`.
  They still have to be uploaded and linked by hand (section 4).

Still open, owner or team only:

1. **Netlify**: `https://nasasc.netlify.app/play/` still returned HTTP 404 on this date. Do not put it on the form; use the Render URL, or redeploy Netlify and re-check
   with `curl -sI` if you want it (`RELEASE.md` 3.1).
2. **The committed WebGL host is older than the flight view and the end screens.** The hosted big screen shows Title, Lobby and the earlier Build Bay; the Countdown, Flight,
   Orbit Map (T016), Debrief, Campaign Hub, Codex, Settings (T024) and the lobby judging-day controls (T035) are in the Unity source on `main` but need a Unity rebuild of
   `docs/play/host/` by the lock holder (`PROJECT_DESCRIPTION.md` section 8). The description text already says so; keep it unless the build is refreshed.
   A rebuild changes `docs/play/`, so Render redeploys and drops open rooms: do it when nobody is playing, then re-run the smoke test.
3. **Upload the demo video**, set it viewable by judges, and paste the link.
4. **Team members and team name** on the form (the repository does not list members).
5. Pull requests that were still open when this was written (T050 phone viewer fix, T048 hosted smoke test; T024 and T035 are merged): if they merge before you
   submit, re-read `PROJECT_DESCRIPTION.md` sections 2 and 8 and `JUDGES.md` "Known limitations" and update the sentences that name them.
6. **Translations of the new host end-screen strings** (`data/strings/en.host_end.json`, T024) are missing in the five other languages, so `node tools/validate-data.mjs --strict` and
   5 phone-client parity tests fail on `main` (fix queued as issue #206). Do not claim the strict validation passes until that merges.

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
| Team members | not in the repository (`tools/demo/team.json` has an empty `members` list); the judges and credits pages show the team name "Winton" | List every member exactly as registered; fill `tools/demo/team.json` and run `node tools/demo/build-credits.mjs` if the credits page should list them |
| Short summary / one-line description | `PROJECT_DESCRIPTION.md` section 1 (96 words); if the form limit is shorter, use its first sentence: "MissionForge is a cooperative party game for 1 to 10 players who run a space agency." | Paste, trim to the limit |
| Full project description | `PROJECT_DESCRIPTION.md` sections 2 to 9 | Paste (convert tables to lists if the form is plain text) |
| How the project addresses the challenge | `PROJECT_DESCRIPTION.md` section 3 (requirement-to-feature table) | Paste |
| What the project does / how it works / how to use it | `PROJECT_DESCRIPTION.md` sections 2 and 4 | Paste |
| Technology and tools used | `PROJECT_DESCRIPTION.md` section 5 | Paste |
| Real versus simplified | `PROJECT_DESCRIPTION.md` section 6 | Paste |
| NASA data, resources and references used | `NASA_RESOURCES.md` | Paste; confirm the nine challenge links against the official page |
| Use of AI / AI disclosure | `AI_DISCLOSURE.md` (short version at the top, 122 words) | Confirm the design-document sentence, check the wording against the official AI rules, paste |
| Link to the demo video | `submission/video/missionforge-demo-2min.mp4` (2:00) and `missionforge-demo-30s.mp4`; how they were made and what is scripted: `submission/video/README.md` | **Upload (YouTube or the platform the form names), set it viewable by judges, paste the link** |
| Link to the live project or demo | `https://missionforge-spaceapps.onrender.com/play/` (section 3) | Test once from a laptop and a phone; wake the instance before submitting |
| Link to source code | `https://github.com/momansy/nasa-spaceapps-2026` (public) | Confirm it is still public when you submit |
| Link to presentation / slides | none exist | Skip if optional, or build a short deck from `JUDGES.md` |
| Images / screenshots / logo | `submission/media/cover-16x9.png`, `submission/media/thumbnail-1280x720.jpg`, `assets/media/key-art/missionforge-16x9.png`, `missionforge-1x1.png`; screenshots under `orchestration/evidence/T015/` (host Build Bay), `T029/` (host title and lobby), `T030/` and `T036/` (phone) | Choose and upload; keep the AI-generated labels in `AI_DISCLOSURE.md` |
| Licence of the project | MIT (`LICENSE`) | Check it against third-party licences on `docs/play/credits.html` |
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
| `DEMO_VIDEO_SCRIPT.md` | Script behind the demo videos |
| `video/` | The two demo cuts, subtitles and stills (`video/README.md`) |
| `media/` | Cover image and thumbnail |
| `CHECKLIST.md` | This file |

Evidence for every claim: `orchestration/evidence/T042/README.md`; counts and changes of the final refresh: `orchestration/evidence/T046/README.md`.

## 3. The "hosted URL"

The game has three parts that must run together (Unity big screen, phones, room server). Option B below is now set up:

| Option | What to put in the form | Status |
|---|---|---|
| **B. Hosted room server plus site (chosen)** | `https://missionforge-spaceapps.onrender.com/play/` | Live on 2026-11-15 (HTTP 200 on all pages, gzip header on the Unity files). A full hosted session was **not** run by this task. Free instance: sleeps after 15 minutes idle, about 1 minute to wake, a redeploy drops all rooms (`HOSTING.md` 4) |
| A. Netlify static site | `https://nasasc.netlify.app/play/` | Returned HTTP 404 on 2026-11-15: do not use unless it is redeployed and re-checked |
| C. Video plus repository | Link the video and the repository; describe the launcher in the description | Fallback if the hosted site fails on the day |

Recommended: **B** as the live link with the video (**C**) next to it, and the local launcher (`JUDGES.md`) as the fallback. Say in the form that the hosted big screen is an earlier build than the source (section 0, item 2).

## 4. By-hand list before pressing Submit

- [ ] Team names and members entered on the form and (optionally) in `tools/demo/team.json`, credits page rebuilt
- [x] Repository public, licence added (MIT). Still to do: secrets grep clean (`RELEASE.md` section 4)
- [x] Hosting prepared: Render site live, pages return 200 (checked 2026-11-15). Still to do: one full session through the public URL, and wake the instance shortly before submitting
- [ ] Netlify (optional): redeploy from `main`; `curl -sI https://nasasc.netlify.app/play/` shows 200. Not needed if the form uses the Render URL
- [x] Demo videos recorded and subtitled (`submission/video/`). Still to do: upload, set viewable by judges, test the link while logged out
- [ ] Every number said or shown in the video matches `data/contracts.json` (C1: 150 kg, 550 km, 97.6 degrees, 90 M game-dollars, 180 days). `submission/video/README.md` lists the numbers used
- [ ] The video says which parts are scripted (it labels the `?mock=1` session and the rehearsal Build Bay stills); keep those labels. The debrief score in it is a scripted demo value, not a simulation result
- [ ] `AI_DISCLOSURE.md`: design-document sentence confirmed; wording checked against the official AI rules; images and video looked at by a person
- [ ] Music or voice used in the video added to `AI_DISCLOSURE.md` and `NASA_RESOURCES.md` if it needs a credit
- [ ] Form field list compared with the live form (this file's section 1 is a guess)
- [ ] Known limits (`PROJECT_DESCRIPTION.md` section 8) left in the text: do not remove the statements about the host screens that are not built, or about the WebGL build being older than the flight view
- [ ] Final read of the pasted text for anything not true on the day (hosted URL status, repository visibility, whether T048 and T050 have merged)
- [ ] Submitted before 23:59 local; screenshot of the confirmation saved
