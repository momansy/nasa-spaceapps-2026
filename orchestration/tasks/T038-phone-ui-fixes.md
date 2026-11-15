# T038 — Phone UI fixes from the reviews

Every visual task must meet `orchestration/VISUAL_TARGET.md` (rubric 4/5 or better).

**Worker:** a client coding worker (`mohammed-alainieh`) · **Owns:** `client/src/screens/vote/`, `client/src/viewer/`, `client/src/ui/`, the minigame folders `client/src/minigames/MG-01/`, `MG-03/`, `MG-04/`, `MG-29/` (layout only), `client/e2e/screenshots/`, `orchestration/evidence/T038/`

Known defects from the UI revamp, minigame polish, localization and playtest reviews. Fix each, with a before/after screenshot at 390×844 (English and Arabic where text is involved):

1. **Part card:** with the prediction banner and a toast showing, only about two stat rows fit above the pinned drawbacks block. Make all stat rows reachable without hiding drawbacks (compact rows, collapsible banner, or a scrollable stats region with a visible affordance); drawbacks stay always visible (design 14.3).
2. **Crew ping bubble covers the 3D part model** on the part card: move pings to a lane that never overlaps the model.
3. **Prediction banner:** a long English part name wraps at its hyphen and the full stop lands in the wrong place in Arabic; use non-breaking handling for part names and bidi isolation.
4. **MG-01:** the lane is mostly empty; **MG-04, MG-29:** the result strip sits over the play area; bring all three to 4/5 without changing gameplay or scoring.
5. **MG-03, MG-04:** the in-game "Scan ends in" / "Time left" readouts disagree with the host timer bar; show one consistent time (document which).
6. **Entrance screenshots:** a few session screenshots are captured mid-fade; make the e2e capture wait for entrance animations to finish.

Checks: `npm ci && npx vitest run && npm run build` in `client/` (no test expectation changes except ones asserting the old layout), the session Playwright spec and the affected minigame lab specs, regenerated screenshots you inspect yourself. Evidence and a short RUBRIC.md in `orchestration/evidence/T038/`.
