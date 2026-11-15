# T055 — Rebuild the WebGL host from current main (live site is several merges behind) + missing glyphs

**Worker:** a Unity worker (`yousuf-amek`, right after T027) · **Owns:** `docs/play/host/` (rebuild output), `unity/MissionForge/Assets/MissionForge/UI/Fonts/` (font files and font assets only), `orchestration/evidence/T055/`

**Deadline: PR merged by 12:15 UTC** (this rebuild is the one exception to the 11:30 `docs/play/` freeze).

The deployed host `docs/play/host/` was last rebuilt by T040 (PR #159). Since then main gained the flight
view (T016, #182), the Build Bay beauty pass (#165), host UI polish (T035, #195), the end screens (T024,
#204) and T027 (pre-flight screens, your current task). The live site
<https://missionforge-spaceapps.onrender.com/play/host/> still shows placeholder dashes ("— $M", "— km",
"— pts") on Briefing, Contract, FRR, Countdown, Flight and Debrief, because none of that is in the build.

Glyph defect (found by T054 captures): the host font is missing characters: the Scale view shows
"10-storey building � 30 m" (×) and vote 20 shows "Fuel cells (H�/O�)" (₂). Strings use `×`, `₂`, and
probably `°`, `±`, `≈`, `→`, `–`, `—`, `·`.

## Steps, in order

1. Glyphs: list every non-ASCII character used in `data/strings/en*.json` and the host's C# strings; make
   sure the UI Toolkit font assets render all of them: use the full (non-subset) OFL font files or add a
   fallback font asset (for example Noto Sans Math/Symbols, OFL) in the panel/text settings. Record the
   character list and before/after screenshots in `orchestration/evidence/T055/`.
2. With T027 merged (or on its final branch merged into main), rebuild WebGL with the existing method:
   `Unity -batchmode -quit -projectPath unity/MissionForge -buildTarget WebGL -executeMethod MissionForge.Build.WebGL`
   (see `Assets/MissionForge/Editor/Build.cs`); same compression settings as the current build (Gzip
   `.unityweb`), output to `docs/play/host/`.
3. Verify locally with the hosted server (`npm --prefix server ci && npm --prefix server run build`, then
   `PORT=10000 RENDER_EXTERNAL_URL=http://localhost:10000 npm --prefix server run start:hosted`): open
   `http://localhost:10000/play/`, Host a mission, join 3 phones, play lobby → briefing → contract vote →
   build votes → FRR → countdown → flight → debrief using the shortest timers (PageDown skips phases).
   Screenshot every screen; none may show placeholder dashes where real data exists; no "Reconnecting";
   the Scale view and vote 20 render × and ₂.
4. Commit only `docs/play/host/` output, font changes and evidence; open the PR titled
   "T055: WebGL host rebuild from main (flight, end screens, glyphs)". Report the build size vs before.

## Acceptance

Live-equivalent local run shows the real briefing, flight and debrief screens with data; all glyphs render;
WebGL build committed; screenshots reviewed; merged by 12:15 UTC.
