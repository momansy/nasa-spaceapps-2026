# T038 — Phone UI fixes: rubric and evidence

Viewport 390 × 844 (Pixel 7 profile, 2× scale). `before/` is the state at the start of the task
(committed screenshots of `main`; `before/ar-05-part-card.png` is from T037). `after/` is the
final state. Scores follow `orchestration/VISUAL_TARGET.md` (target 4/5 or better).

| # | Defect | Fix | Evidence | Score |
|---|--------|-----|----------|-------|
| 1 | Part card: with banner + toast only ~2 stat rows fit above the drawbacks | The face is a scrolling region (model, name, stats, strengths, deltas) above a **pinned** drawbacks block (`.pcard__pin`, always visible, design 14.3). A "More" pill with a bobbing chevron shows while rows are hidden below the fold and scrolls on tap (only the pill is tappable, the fade lets taps through to the rows). Stat rows are 40 px high (were 44), the 3D thumbnail is 84–104 px (was 96–124 px), and the prediction strip replaces the plain hint line. | `before/09-part-card.png` → `after/09-part-card.png`, `after/11-part-card-warnings.png`, `after/ar-05-part-card.png` | 4 |
| 2 | Crew ping bubble covers the 3D model | The ping feed is its own lane in normal flow between the hint strip and the card (never over the model or card text). One item at a time (latest), height eases in and out. | `before/21-pings.png`/`before/09-part-card.png` → `after/09-part-card.png`, `after/11-part-card-warnings.png` | 4 |
| 3 | Prediction banner: long name breaks at its hyphen, Arabic full stop misplaced | New `client/src/ui/NameText.tsx`: the name is a `<bdi>` (direction isolated), hyphenated words are unbreakable, the whole name moves to the next line as a unit, and the trailing full stop is glued to it. Also used for the veto dialog title. Unit-tested. | `before/ar-05-part-card.png` → `after/ar-05-part-card.png` (name and stop on one line, stop at the logical sentence end) | 4 |
| 4a | MG-01: lane mostly empty | Bigger cards (92–128 px high, 74 % of the belt), belt chevrons scroll toward the upload line, a dashed landing slot and a Sunlight glow at the destination, a trail behind the front card, the next two cards waiting as a pile (fade out as the front card covers them), opaque backing under the front card. Gameplay, timing, scoring and the swipe thresholds are unchanged (the drag-down threshold keeps its old pixel value). | `before/MG-01-play.png` → `after/MG-01-play.png` | 4 |
| 4b | MG-04: result strip over the play area | The strip has its own 38 px slot between the bench and the controls (an idle track shows when there is no result); the two panels are 19 px shorter each. | `before/MG-04-play.png` → `after/MG-04-play.png` | 4 |
| 4c | MG-29: verdict over the pendulum stage | After the reveal the verdict card (status strip + explanation, 16 px text, centred) takes the place of the question and the "fast bonus" bar; the stage is never covered (if a long explanation needs more room, the stage starts lower). | `before/MG-29-play.png` → `after/MG-29-play.png`, `after/MG-29-reveal.png` | 4 |
| 5 | MG-03/MG-04 "Scan ends in" / "Time left" disagree with the host bar | **Documented decision:** the readout shows the **host timer bar's time** (the whole `durationMs` window, `max(0, durationMs − elapsed)`, whole seconds: `windowLeftS` in both models). The MG-03 label is now "Time left" (en/ar) because Standard play ends at 75 % of the window. The warning colour still follows the real end of play (last 5 s MG-03, 4 s MG-04). Play length and scoring unchanged. In `before/MG-03-play.png` the readout says 13 s while the bar says 19 s; `after/MG-03-play.png` and `after/MG-04-play.png` agree with the bar. | `before/MG-03-play.png`, `before/MG-04-play.png` → `after/MG-03-play.png`, `after/MG-04-play.png` (header 19 s / 15 s equals readout) | 4 |
| 6 | Session screenshots captured mid-fade | `client/e2e/lib/settle.ts`: every session screenshot (English and Arabic) first waits for running CSS animations and opacity/transform transitions that end within 1.2 s (cap 1.5 s; infinite loops and long countdown bars are ignored). `18-veto-flash` is captured mid-animation on purpose (`shot(page, name, true)`). | all of `client/e2e/screenshots/*.png` regenerated | 4 |

Known limits (stated plainly): with the prediction strip and a ping both showing, the part card
shows about three stat rows before the "More" pill (the rest is one scroll away; drawbacks stay
visible). Standard-mode MG-03/MG-04 end at 75 % of the window, so the readout can still show
about a quarter of the window when play ends. Not run: the other lab specs (ascent, orbit,
entry) and T037's committed Arabic evidence (the Arabic spec now writes to `AR_SHOTS_DIR` when
set; T038 used `orchestration/evidence/T038/after/`).

## Rework 1 (issue #161): i18n parity after merging `main`

`origin/main` (with the es/fr/pt/hi string files from T039/T041) was merged into the T038
work (the rework branch `agentmesh/mohammed-alainieh/issue-161` starts at `main` `9cf9dfb` and
merges the T038 branch `issue-136`; no conflicts). `src/i18n/parity.test.ts` then failed for
es, fr, pt and hi (4 failures, 912 passed) because `ui.card.more` and `ui.card.more_stats` existed
only in en/ar. Fixed by adding both keys to `{es,fr,pt,hi}.vote.json` and changing
`minigame.MG-03.hud.left` in `{es,fr,pt,hi}.mg_build.json` to the "Time left" meaning:

| Lang | `ui.card.more` | `minigame.MG-03.hud.left` |
|------|----------------|---------------------------|
| es | Más | Tiempo restante |
| fr | Plus | Temps restant |
| pt | Mais | Tempo restante |
| hi | और | बचा हुआ समय |

Counts (in `client/`): `npm ci` ok; `npx vitest run` 47 files, **916 passed, 0 failed**
(was 912 passed + 4 failed); `npm run build` ok. `session.spec.ts` not rerun: no code, CSS or
English/Arabic string changed in this rework.
