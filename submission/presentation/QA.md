# MissionForge: judges' Q&A

Fifteen questions judges are likely to ask, with short answers that match the repository. Say the **short answer**
first; use the **if they push** line only if they ask a follow-up. Sources are named so a presenter can point to them.
Numbers are from `data/` and `submission/PROJECT_DESCRIPTION.md` (status of 15 Nov 2026).

---

### 1. Is the physics real?
**Short answer:** The core relations are real: gravity, drag, dynamic pressure (Max Q), the rocket equation, orbital
speed from vis-viva, and entry heating. Many other things are game values, and the game labels which is which.
**If they push:** Every number in the data files carries a tag, `physical`, `real_world_approximate` or `game_value`
(`GAME_DESIGN.md` 19). Constants: standard gravity 9.80665 m/s², Earth GM 3.986e14 m³/s², Earth radius 6,371 km.

### 2. What did you simplify?
**Short answer:** Flight is in a 2D orbital plane with 3D visuals, one exponential atmosphere (1.225 kg/m³ at sea level,
scale height about 8.5 km), a spherical Earth with no J2, and failures are seeded probability rolls, not simulated
failure physics. Lunar and Mars transfers are a burn, a coast and an arrival.
**If they push:** The full list is `GAME_DESIGN.md` 8.3 and the in-game Codex section "What the game simplifies".
A debrief that tags every number on screen as physical, approximate or game value is **planned**, not built.

### 3. What NASA data do you use?
**Short answer:** No live NASA feed or API. We use public NASA imagery as Earth textures (Visible Earth: Blue Marble
and Black Marble), and NASA and agency documents to check 40 facts and to round engineering values. The NASA Systems
Engineering project phases shape the game's flow: design, review, launch, debrief.
**If they push:** Each fact has a source URL; 25 were confirmed as written and 15 corrected, none rejected
(`orchestration/evidence/T025/fact-sources.md`). We did not run GMAT: contract delta-v values are rounded published figures
(`submission/NASA_RESOURCES.md`).

### 4. Where do the costs and schedules come from?
**Short answer:** They are game values, not real prices. A real program takes years and hundreds of millions of dollars;
the game compresses that into 90 M game-dollars and 180 days for contract C1, so that the trade-offs are felt.
**If they push:** We call them "game-dollars" on screen for that reason.

### 5. How do you know there is no single best rocket?
**Short answer:** We ran a balance search over sampled builds (up to 300,000 per contract) and found at least three
different valid architectures and no one build that dominates every contract.
**If they push:** The search is a script, sampled and not exhaustive, and it is not a human playtest
(`orchestration/evidence/T012/balance-report.md`).

### 6. Has anyone actually played it?
**Short answer:** Not a full session with six humans yet. The phone client has been driven by scripted players through full
sessions, and the lobby and phone join were checked on the hosted site. A human playtest is the first item on our "next" list.
**If they push:** A session is planned at 25 to 40 minutes; that is a design estimate, not a measured playtest. A scripted
host with 6 phones and 5 spectators has played a full C1 session to the debrief (T048), but the real big-screen host has not
yet been played to the debrief.

### 7. Can it be used in a classroom?
**Short answer:** That is the target audience (ages 12 to 18, classrooms, clubs). One teacher screen and phones, no app,
no account, no chat. The design document maps the build phase to NGSS standards HS-ETS1-3 and MS-ETS1-2, marked "to confirm
with an educator".
**If they push:** A teacher dashboard (pause, lock votes, discussion prompts) is in the design document and is **not built**.

### 8. How many players, and how long is a session?
**Short answer:** 1 to 10 players, with 10 mission-control roles that merge when fewer people play, plus any number of
spectators who see an "Audience says" bar. A session is planned at 25 to 40 minutes (a design estimate, not a measured
playtest); C1's 22 part votes take about 17 minutes at the lobby's default timers (46 s a round) or about 8 minutes at the
shortest timers on main (21 s; the hosted lobby's shortest is 20 s, so 46 s a round). A 20-minute slot plays the first votes live.
**If they push:** Making the audience count as one vote is in the protocol and is a lobby setting in the host on main, but the
hosted build does not have that control yet.

### 9. Does it scale?
**Short answer:** Not to a classroom district, and we do not claim it. Rooms live in memory on one free Render instance
(about a minute to wake after 15 idle minutes; a restart ends open rooms). It is designed for a handful of rooms. We have
not load-tested it.
**If they push:** The same code runs locally with one command (`npm --prefix tools/demo run demo`), so a school can host its own.

### 10. How accessible is it?
**Short answer:** Text scales to 200 percent, there is a high-contrast mode, reduced motion, screen-reader labels, and every
timing minigame has a Relaxed mode and a One-Button mode. No free-text chat, no accounts.
**If they push:** Not done: subtitles for voice lines (no audio is bundled) and a recorded screen-reader test with a real user.

### 11. How good are the translations?
**Short answer:** Six languages: English, Arabic (right-to-left), Spanish, French, Portuguese and Hindi. The translations
were written by AI agents with automated checks. **No native-speaker review has been done**, and we say so in `submission/AI_DISCLOSURE.md`.
**If they push:** Native-speaker review is item 4 on our "next" list.

### 12. How did you use AI?
**Short answer:** A small human team directed AI coding agents: Claude Code wrote and tested most of the code, data and
documents; OpenAI Codex did art direction and prompts. Eight images were generated with Higgsfield, one 10-second briefing
video with Google Gemini. Humans chose the concept and the architecture, assigned tasks, and reviewed and merged the work.
**If they push:** The disclosure is `submission/AI_DISCLOSURE.md`. Passing tests show the code does what the tests say; they
are not a playtest. The 40 facts were checked against sources by a separate task, with an independent re-check of 10.

### 13. What is not built yet?
**Short answer:** The hosted big screen is an older build: title and lobby work, a live room stops at its placeholder
briefing, and votes, flight and debrief run on the phones there. On the main branch the Unity host has 15 of its 16 screens, from briefing, contract vote, test stand and
design reviews to flight, orbit map and debrief (only the minigame overlay has no screen of its own), but that is **not yet
in the hosted build**, the Build Bay does not yet chain into the test stand and reviews or hand its build to the Flight
Readiness Review (a live room on main stops there), and the real host has not been played
to the debrief. Frame rate has not been measured on a typical GPU laptop. Only contract C1 is rehearsed end to end.
**If they push:** The honest list is `submission/PROJECT_DESCRIPTION.md` section 8.

### 14. Do you handle real tragedies, like Challenger?
**Short answer:** Carefully. Real tragedies are never a gameplay failure or a joke. They appear only in the Codex and the
lessons section, in a respectful tone about what engineers learned (`GAME_DESIGN.md` 12.1). Crewed contracts cap the grade
if a crew is lost, and the debrief is written respectfully.
**If they push:** Contract C1, the demo contract, is an uncrewed satellite.

### 15. What about privacy?
**Short answer:** No accounts, no stored data, no free-text chat, no trackers. Rooms exist in server memory only and are
gone when the server restarts. A player enters a nickname and nothing else.
**If they push:** The room server keeps a room for 10 minutes if the host drops, and a phone slot for 3 minutes
(`RELEASE.md` 5.5).

---

## Answers to avoid

- Do not say "NASA-validated" or "GMAT-checked". Neither is true.
- Do not say "tested with six players" or "playtested".
- Do not say the audience "votes" as a ballot: it is advisory in the hosted game today.
- Do not call game-dollars real money.
- Do not say the whole session runs on the hosted big screen. Flight and debrief are on the phones there today.
