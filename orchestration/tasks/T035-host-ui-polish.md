# T035 — Host UI polish: the three open T031 rubric items

Every visual task must meet `orchestration/VISUAL_TARGET.md` (rubric 4/5 or better).

**Worker:** `yousuf-amek` after T034, or `cyrex04` (Sonnet) when free · **Owns:** `unity/MissionForge/Assets/MissionForge/UI/` and the UI documents of Title, Lobby and Build Bay; `orchestration/evidence/T035/`

T031 (merged, PR #93) built the host design system. Its own rubric (`orchestration/evidence/T031/RUBRIC.md`) left three pure-UI items at 3/5. Fix only these, then re-score with an independent subagent:

1. **U2 layout:** the vote-stage strip fits on one line; the side panels stay outside the middle 52 % of the screen (Readiness must end left of x≈461 at 1920 px, the vote panel must start right of x≈1459); the centre column no longer hides the pad base.
2. **U9 200 % text + right-to-left:** no collisions, sliced text or dropped content on the Build Bay (including Gantt labels); Lobby RTL alignment; Title body text kept off the Earth limb.
3. **U10 polish:** no text sliced by scroll masks, no line breaks between a number and its unit, no markers drawn over text, specimen labels current.

4. **Lobby controls for judging day** (from `RELEASE.md` section 6.3): add host lobby controls for
   `audienceVoteWeight` (0 or 1, "Audience counts as one player"), `inspectTimerS` (5 to 60 s) and a
   10 s option in the vote-timer segment, styled with the design system. The protocol and `RoomClient`
   already support `settings.set`; without these, judging-day mode (design 13.7) is unreachable.

Do not touch the 3D scene (T034) or models. Keep EditMode tests green. Evidence: before/after pairs at 1920×1080, 200 % + RTL captures, the re-scored rubric with every item at 4 or better.
