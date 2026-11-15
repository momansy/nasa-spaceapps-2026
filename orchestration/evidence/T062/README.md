# T062: docs for the rebuilt hosted host

Date: 2026-11-15 (about 11:00 to 11:45 UTC). Base: `main` at `6197eae` (T058 merged as #245; T057 translations merged as #239; no later commit
on `origin/main` when checked at about 11:05 UTC). Brief: the "Fixes for files T058 does not own" table in
`orchestration/evidence/T058/CHANGES.md` plus the hosted-build update in issue #248.

## Source for the hosted-build statements

T055's branch (`agentmesh/yousuf-amek/issue-215`) was **not on the remote** and `orchestration/evidence/T055/` did not exist when this was
written (checked with `git ls-remote origin` at about 10:58 and 11:25 UTC). The statements were written from T055's progress comments on
issue #215, latest relevant ones at 10:31, 10:35 and 10:54 UTC:

- WebGL build from `main` including the T027 pre-flight screens, 17 scenes; first build `host.data` 50.3 MiB and wasm 12.3 MiB (was 31.6 and 12.1 MiB).
- Glyph fix (full IBM Plex Sans files, Oxanium fallback): ≈, ₂, ≥, ±, ×, ° render (Scale view "≈ 30 m"); briefing and contract vote show real data.
- EditMode tests 467 of 467 with the new fonts.
- "Full local hosted run done (3 phones): briefing, contract, 22 Build Bay votes, countdown, flight (real HUD data), debrief (real score) all
  with data; no host socket drops." Defect: "FRR shows an empty panel in a live room."
- 10:54 UTC, orchestrator: the "Build Bay hook" (Build Bay hands its build to the FRR) was added to T055's scope. **Not yet reported done.**

### Claims that depend on T055 (for the orchestrator to check against T055's final evidence)

| # | Claim as written | Where |
|---|---|---|
| D1 | The committed/hosted WebGL host is rebuilt from `main` (T055) and contains all 15 host screens (T027, T016, T024, T034 pass, T035 lobby) | J (Try it, Big screen), R (status, 2.1, 5.2, 6.3), RM (WebGL row), G (1, 12), PD (status, 2, 5, 8), both html pages |
| D2 | **Corrected in T062b.** A live room on a **local copy of the hosted service** with 3 phones went lobby → briefing → contract vote → 22 Build Bay votes → (FRR skipped with PageDown) → countdown → flight (real HUD data), no host disconnects. When the flight ends the host stays on Flight and the operator advances with PageDown; the big-screen debrief shows **sample (fixture) data** (8,172 pts, grade A, sample crew), not the session's result. No "real score" claim remains | J, R (status, 5.3 FRR and flight rows), RM, G (1, scoring note, 12), PD (2, 4, 8, 9) |
| D3 | Briefing and contract vote show real contract data on the rebuilt host | J, G 12, PD 8 |
| D4 | ≈, ₂, ×, ±, ° render (full fonts) | J, RM, R 2.1, G 12, PD 8 |
| D5 | **Corrected in T062b.** The Build Bay hook was **not** added in T055: in a live room the FRR shows an empty panel and the operator skips it with PageDown (GO/NO-GO poll on the phones). Also: the hosted build contains only `en.host_preflight.json`, so the pre-flight text is English on the big screen in every language | J, R (status, 5.3 FRR row), RM, G (1, 12), PD 2/4/8/9 |
| D6 | The rebuilt host's lobby is `main`'s lobby (vote 10–60 s, inspect 5–60 s, audience switch), because it was built from `main` (derived from the build source, not reported as clicked by T055) | R 5.2/5.3/6.3, J (session flow, session length), PD 4/8 |
| D7 | EditMode 467 of 467 with the new fonts | PD 8 |
| D8 | **Corrected in T062b:** committed Brotli build, `host.data.unityweb` 41.91 MiB (the 50.3 MiB file was the uncommitted Gzip build) | R 4 checklist |
| D9 | Not claimed: a run on the public Render URL, the frame rate of the rebuilt host, Test Stand / Design Review / Campaign Hub / Codex / Settings / Orbit Map seen in the live run, pre-flight translations on the big screen | stated as not verified in J, G, PD, R |

If T055's final report differs (for example the hook landed and the FRR shows the build, or the final run was not repeated after the hook), update
D2 and D5 in: `JUDGES.md` (Big screen bullet), `README.md` (host row), `GUIDE.md` 12 (pre-flight row), `RELEASE.md` 5.3 (FRR row),
`submission/PROJECT_DESCRIPTION.md` 4 and 8, then rerun the two generators below.

## T062b correction (issue #257, 2026-11-15 about 11:45 to 12:00 UTC)

Branch `agentmesh/ahmed-saeed-amek/issue-257`: merged `origin/agentmesh/ahmed-saeed-amek/issue-248` (T062, PR #249) and then `origin/main`
(at `0e5f4b0`, T055 merged as #255; already contained, no conflicts). Source: `orchestration/evidence/T055/README.md` sections 2 to 5 and its
follow-ups 3 to 5, plus the T062b brief. D8 corrected as well: the committed build is Brotli, `host.data.unityweb` 41.91 MiB (the 50.31 MiB file was
the uncommitted Gzip build).

| File | T062b change |
|---|---|
| `JUDGES.md` | Try it, hosted bullet: three limitations with the workaround (PageDown at FRR; PageDown after the flight ends; big-screen debrief is sample data 8,172 pts / grade A / sample crew) and English-only pre-flight text; run described as lobby through flight. Session flow: FRR and debrief caveat. Known limitations: hosting bullet (lobby through flight, FRR by PageDown); big-screen bullet replaces the "hook added afterwards" text with the four numbered limitations and workarounds |
| `README.md` | Big-screen host row: FRR empty in a live room (no "fix added"). WebGL row: run lobby through flight; the four limitations with workarounds |
| `GUIDE.md` | 1 hosted bullet: PageDown at FRR and after the flight, sample debrief. 9 scoring note: big-screen Debrief shows sample data in a live room. 12: hosted row lists the three limitations; pre-flight row (FRR empty, PageDown); end-screen row (sample data, reached by PageDown); translation row (hosted build is English only); "Working end to end" no longer lists "the debrief with the real score" |
| `submission/PROJECT_DESCRIPTION.md` | Status line (T055 merged as #255, checked against its final evidence). 2: build-check bullet (FRR empty, PageDown), flight bullet (stays on Flight, PageDown), debrief bullet (sample data, not the session's result; removed "read the live mission record when a flight ends"). 4 step 4 and hosted paragraph. 8: big-screen bullet (hook **not** added; three limitations), WebGL bullet (Brotli 41.91 MiB; Plex Sans fallback for Oxanium; limitations), pre-flight translations bullet (English only in the hosted build). 9 item 1 lists the three fixes and shipping T057's text |
| `RELEASE.md` | Status paragraph: T055 merged, run lobby through flight, operator workarounds. 2.1 host row: Brotli (Gzip notes describe the earlier build). 4 file-size line: committed sizes 41.91 / 8.95 MiB. 5.3 FRR row: empty in a live room, PageDown. 5.3 Flight row: stays on Flight, PageDown, debrief sample data. After the review: status line, 2 build note, 3.1 note, 4 header check and 6.1 now say the committed build is Brotli and that the gzip headers apply to the earlier build only (T055 follow-up 1; HOSTING.md and `staticSite.ts` are not owned and were not changed) |
| `docs/play/judges.html`, `docs/play/guide.html` | Regenerated as in T062 (`node tools/demo/build-credits.mjs`, then `git checkout -- docs/play/credits.html`; `python orchestration/evidence/T062/build_guide_html.py`). Diff: 3 and 4 changed lines, matching the Markdown edits |

Verification: `python orchestration/evidence/T062/check_links.py` (0 broken relative links, no conflict markers); `git diff --check` clean; grep of
the 5 Markdown files and 2 pages for "real score", "hook", "first run", "to the debrief"; the new text found in both HTML pages; an independent
subagent review against T055's evidence found no contradiction of the four limitations and no unsupported claim, and flagged stale Gzip text in
RELEASE.md (fixed). Not claimed: any fix by T063. Not re-verified in Unity or on the public URL; all hosted-build facts come from T055's evidence.
Not shown in a browser this time (T062's screenshots predate T062b).

## Every edit (T062)

Abbreviations: J `JUDGES.md`, R `RELEASE.md`, RM `README.md`, G `GUIDE.md`, PD `submission/PROJECT_DESCRIPTION.md`.

| File | Change |
|---|---|
| `RELEASE.md` | Status paragraph: the hosted host is T055's rebuild; T055's local run (not the public URL). 2.1 table: Unity host row says rebuilt from `main` by T055 (contents, fonts), the replaced 06:32 build had three screens. 4 checklist: file-size line uses T055's first-build sizes and flags the 50.3 MiB data file against the 50 MB rule. **5.2 rewritten** (T058 CHANGES fix): says which build is meant (the lobby on `main`, which the T055 rebuild and the local demo offer; the earlier hosted build offered vote 20/30/45/60 s only, no inspect timer, no audience switch); lists the `main` lobby (vote 10/20/30/45/60 s, inspect 5/10/20/30/60 s, audience Off/One player, tallies, assist), protocol ranges and that the presets are game values; settings table: vote 10 s, inspect 5 or 10 s, audience One player; audience switch not yet tried in a hosted session; removed the stale "lobby has no control" text and the wrong pointer to 6.4. **5.3 length rewritten**: round = REVEAL 3 s + INSPECT + VOTE + RESULT 3 s (`server/src/votes/rules.ts`), no PREDICT (Build Bay does not send it); 46 s at defaults, 21 s at the shortest on `main`, 46 s at the earlier build's shortest; C1 22 votes ≈ 17 min / ≈ 8 min before animation and runoffs; session 25 to 40 min as the design estimate (dropped "about 35 minutes"); 20-minute-slot options now include "shortest timers, play it all live". FRR row: T055's empty-panel note and what to do. Flight row: rebuilt host has countdown, flight, orbit map, debrief; T055's run showed countdown, flight and debrief. 6.3: lobby controls are in the T055 rebuild, untried in a hosted session |
| `JUDGES.md` | Guide note: the web page is regenerated from `GUIDE.md` (T062), same text. Try it, hosted bullet: describes the rebuilt big screen and T055's local run; public URL not played through. Session flow: big screen shows briefing to debrief; audience switch off by default; test stand, design review, hub, codex, settings in the host, Build Bay does not open the first two. Known limitations: hosting bullet adds T055's local run and that T058's live check used the earlier build; big-screen bullet replaces the "committed build has three screens / live room stops at FRR" text with the T055 rebuild, the run, the glyph fix, the FRR empty-panel note (D5) and what was not in the run; test-status sentence says T057 (#239) added the translations and the checks were not re-run; fps bullet says the rebuilt host's frame rate is unmeasured; session-length bullet: shortest timers are offered by the rebuilt hosted lobby (earlier build: 20 s) |
| `README.md` | Big-screen host row: FRR empty-panel note replaces "a live room stops there". Committed WebGL host row: rebuilt by T055, fonts, the local live run, not on the public URL. Phone client row: the 5 failures were the pre-flight parity checks, T057 has since added the translations (not re-run). Line under the table: the big screen shows the mission around the phone votes, the phones also have a debrief |
| `GUIDE.md` | Section 1 hosted bullet: the hosted big screen was rebuilt from `main` and shows the screens the guide describes. Section 9 scoring note: the Debrief was reached at the end of a live room session (T055, local copy of the hosted service); Campaign Hub rehearsal data only. Section 10 accessibility bullet: Settings overlay is in the hosted build since the rebuild (and fixed a doubled "the big screen"). **Section 12**: hosted-big-screen row rewritten (T055 rebuild, fonts, local live run, not on the public site); pre-flight row (real data in the run, Build Bay does not open Test Stand/Design Review, FRR empty panel in the first run and the fix added afterwards); end-screen row (Debrief seen in the run, others rehearsal data); translation row (T057 added the five languages, not checked on the big screen); "Working end to end" paragraph now includes briefing, contract vote, countdown, flight and debrief, shown in one local live run |
| `submission/PROJECT_DESCRIPTION.md` | Status lines: T057 merged after T058; T055 merged just before this text, written from #215 and T055 evidence. Section 2: flight-view bullet, build-check bullet and debrief bullet say the screens are in the T055 rebuild and what its live run showed (Campaign Hub, Codex, Settings not in the run). Section 4 step 4: play order now includes briefing, contract vote, countdown, big-screen debrief; T055 run with the FRR note; shortest timers stated as inspect 5 s + vote 10 s (earlier hosted build 20 s). Hosted paragraph: T058's live check used the earlier build; T055's local run; not played on the public URL. Section 5 host row: all screens in the T055 build. Section 8: big-screen bullet (FRR hand-over status at `001652e`, T055's first run, the hook, the first real room session through the big screen, EditMode 467 of 467, what was not in the run); WebGL bullet rewritten (rebuilt by T055, what the replaced build had, what the rebuild adds incl. glyph fix, not played on the public URL, fps unmeasured); "earlier WebGL host" in the headless-Chromium bullet; pre-flight translation bullet (T057 merged, checks not re-run); audience bullet (in the rebuilt host, off by default, untried in a hosted session). Section 9 items 1 and 3 updated (play the rebuild on the public URL; Build Bay connections; check T057 text on the big screen) |
| `docs/play/judges.html` | Regenerated from `JUDGES.md` with `node tools/demo/build-credits.mjs` (the T046 method). The script also rewrites `docs/play/credits.html`; that file was restored with `git checkout -- docs/play/credits.html` (not owned). The page now carries T058's and T062's `JUDGES.md` text, which resolves every stale line in T058's pending table (placeholders, "flight view not in it", "10 of 16", "5 of 916 … #206", "35 minutes … 54 s", hosting) |
| `docs/play/guide.html` | Regenerated from the current `GUIDE.md` by the new `orchestration/evidence/T062/build_guide_html.py` (see Decisions). The diff against the previous page is only the `GUIDE.md` changes of T058 and T062 (word diff checked): Debrief row, contract note, scoring note, "reduced motion." typo, accessibility bullet, section 12 table and paragraph, the hosted bullet, footer. Its `credits.html` link stays relative to `docs/play/` |
| `orchestration/evidence/T062/` | New: this file; `build_guide_html.py`; `check_links.py`; screenshots `guide-1280.png` (section 12), `guide-390.png`, `judges-1280.png` (full page) |

## Verification

| Check | Result | How |
|---|---|---|
| Relative links and images in both pages resolve inside `docs/play/` | judges.html 5 relative links, 0 broken; guide.html 8 relative links/images and 13 in-page anchors, 0 broken | `python orchestration/evidence/T062/check_links.py` (external links not fetched) |
| Conflict markers in the owned files | none | same script |
| Pages open locally | both load from `file://` in headless Chromium (Playwright from `tools/e2e/node_modules`) with 0 page errors, 0 failed requests, 0 broken images (lazy images forced to load), no horizontal scroll at 1280 px and 390 px | screenshots in this folder |
| guide.html renderer fidelity | regenerating changes only the lines that hold `GUIDE.md` edits (8 lines of the page) | `git diff --word-diff` |
| Timer facts in RELEASE 5 | `LobbyScreen.cs` lines 76–81 (vote 10/20/30/45/60 s, inspect 5/10/20/30/60 s); round composition from `orchestration/evidence/T058/FACTS.md` B1–B3, C3b, F5 | read |
| Independent review | a subagent checked the diff against the brief and the code. It confirmed the 5.2/5.3 numbers (`LobbyScreen.cs` 68–87; `rules.ts`: REVEAL 3000 ms, RESULT 3000 ms, PREDICT only when a vote asks for it; 22 × 46 s ≈ 16.9 min, 22 × 21 s ≈ 7.7 min; 25–40 min at `GAME_DESIGN.md:59`), found no conflict markers and no broken links, and found that the HTML text matches the Markdown. Fixed after the review: the RELEASE 5.3 minute column (build 4–21, FRR 21–22, flight 22–29, debrief 29–32, at the defaults); option (a) now says about 24 minutes; RELEASE status line made conditional on the merge and the Render redeploy; the build command is described as the documented entry point; GUIDE 1 hosted bullet and the GUIDE 10 Settings bullet no longer claim more than the run showed; JUDGES "Try it" and "session flow" now qualify the FRR (empty panel) and the orbit map (not reported); "contains all fifteen" became "should contain"; PD names the Oxanium fallback; PD 5's "fix queued as T057" corrected; README test-row tense; GUIDE.md footer names the T062 renderer. Not changed: the reviewer's main point, that T055 is not merged in this checkout (old 31.6 MiB build, no T055 evidence). That is expected, because the brief merges this PR after T055 (see Decisions) | subagent |

**Not verified:** any claim about the rebuilt host itself (table D1 to D9 above: taken from T055's progress comments, T055's evidence was not
available); the public Render URL with the rebuilt host; the client parity tests and `validate-data --strict` after T057 (not re-run, stated as such);
spelling by a tool (read by eye and by the reviewer only).

## Decisions

- **guide.html renderer.** `orchestration/evidence/T051/build_guide.py` writes `GUIDE.md` **and** `guide.html` from hard-coded text, so running it
  would have overwritten T058's and this task's `GUIDE.md` edits (and T051's folder is not owned here). Instead `T062/build_guide_html.py` parses the
  current `GUIDE.md` into T051's block model and renders it with T051's HTML template, copied unchanged except: repository-relative links become
  `docs/play/`-relative (credits) or GitHub links, note styles follow T051's page, and the footer names both scripts. `GUIDE.md` is now the source of
  the page; T051's script should not be rerun.
- **Hosted statements before T055's evidence exists.** Written from #215's progress comments (brief step 3 allows this), conservatively: the FRR is
  never claimed to work, the run is always called a local copy of the hosted service, and the screens not reported in the run are listed as
  rehearsal-only. Dependent claims are tabulated above (D1 to D9).
- **Present tense for the rebuild.** The brief says this PR merges right after T055, so the documents describe the rebuilt host as the hosted one.
- **RELEASE.md beyond section 5.** Sections 2.1, 4 (file size), 6.3 and the status paragraph also described the old build; they are hosted-build
  statements in an owned file, so they were updated too.
- **T057.** Merged as #239 after T058; the owned documents that still called the translations "queued" were corrected, without re-running the tests.
- `docs/play/credits.html` was regenerated by `build-credits.mjs` as a side effect and restored (not owned; its content had no change besides line endings).
