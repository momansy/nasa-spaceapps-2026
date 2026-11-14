# T019 review rubric (independent reviewer)

Scope: MG-01 … MG-06, MG-29, MG-30, shared `MG-02/kit.ts`, `en.mg_build.json`, the build lab,
screenshots in `client/e2e/screenshots/minigames/`, evidence `vitest.txt` and `fps.md`.
Compared with `assets/media/style/frames/02-build-bay.png`. VISUAL_TARGET section 6: nothing ships below 4.

| # | Item | Score | Reason | Evidence |
|---|---|---|---|---|
| U1 | Typography | 4 | Plex Sans with tabular digits drawn one by one, sentence-case labels, no monospace all-caps. `fit()` squeezes some labels to about 12 px ("False alarms · max 1", "4/6 defects") | MG-03-play.png, MG-06-play.png |
| U2 | Layout and rhythm | 3 | Gutters and the three-up HUD are consistent, but there is a lot of empty space: wide bands above and below the film (MG-03), an empty vote panel (MG-30) and an empty lane (MG-01) | MG-03-play.png, MG-30-play.png, MG-01-play.png |
| U3 | Colour and contrast | 3 | The palette comes from CSS tokens, but the glass and ceramic gradients are hard-coded rgba/hex (kit.ts:672-673, 1068-1085). No AA contrast measurement in the evidence | kit.ts, evidence folder |
| U4 | Surfaces | 4 | Glass cards with the same radii, an edge highlight and a cheap shadow. The MG-29 result card sits on top of the scene panel (card on card) | MG-02-play.png, MG-29-play.png |
| U5 | Icons | 4 | One hand-drawn family. Status shapes are a circle (good), a triangle (warning) and an octagon (bad), used the same way everywhere | MG-01-play.png, MG-06-play.png |
| U6 | Data visualisation | 4 | Every readout has a unit. Bars that are not good are hatched, not just recoloured. The marginal-Δv bar chart is strong. MG-30 vote dots have no count | MG-02-play.png, MG-06-play.png, MG-30-play.png |
| U7 | Motion | 3 | Reduced motion is handled in code (MG-06 shake set to 0), but only frozen frames exist as evidence. MG-06 runs at 37.5 fps, close to the 30 fps floor | fps.md, *-rtl-200.png |
| U8 | Room readability | 3 | At a 33 % downscale the MG-05 particles (2–5 px radius, render.ts:277) disappear, and the MG-30 thumbnail mottos (about 8 px) can't be read | MG-05-play.png, MG-05-demo.png, MG-30-play.png |
| U9 | Accessibility modes | 3 | There is no `rtl-200` screenshot for MG-01 or MG-02, and no high-contrast evidence. RTL at 200 % is sensible for the other 6 | MG-04-rtl-200.png, folder listing |
| U10 | Polish | 3 | No debug text. But two timers disagree (the bar says 19 s, the HUD says "Scan ends in 13 s"), and the status strip covers the part on the bench (MG-04) and the scene labels (MG-29) | MG-03-play.png, MG-04-play.png, MG-29-play.png |
| U11 | Reference match | 3 | Same navy and teal family as frame 02, but the warm dusk glow barely shows and the screens read as flat dark UI. MG-02 (ceramic rocket) and MG-30 come closest | MG-02-play.png vs 02-build-bay.png |

**Result:** 7 of 11 items are below 4, so the visuals are **Not verified / failing**.

## Findings (most important first)

1. **MG-30 team ballot doesn't match across phones.** `candidates()` builds B and C by varying
   categories other than this phone's own (MG-30/model.ts:138-150), and ties go to the local vote
   (model.ts:166). So `vote x=[1]` means a different patch on each phone, and the winner can differ
   too. The README admits it (README.md:71-73). Fix: build B and C from the seed and the shared
   `elements` only, and break ties by lowest index.
2. **MG-05 stroke speed depends on frame rate.** Pointer samples are applied between ticks
   (MG-05/index.ts:122-136), but speed is measured over 1/30 s windows of simulation time
   (model.ts:342-351). Under jank or below 30 fps, a gentle stroke reads as too hard, scratches and
   fails, because `scratches_max` is 0. The frame-rate test only moves the swab inside ticks, so it
   misses this. Fix: compute speed from `e.timeStamp` per sample, or queue samples and apply them in
   time order per tick, and add a test with batched input.
3. **MG-05 Relaxed pressure isn't more forgiving.** `PRESSURE_LIMIT` is a fixed 0.75
   (MG-05/index.ts:18). Fix: move it into `resolveConfig` and scale it like `speedLimit`.
4. **Playfield has no ARIA value text in 7 of 8.** The canvas has `role="application"` and the
   value goes only to a live region (MG-01/index.ts:20 and the same line in MG-02, 03, 04, 05, 29
   and 30). Fix: point `aria-describedby` at a hidden status node holding the current value text.
5. **Acceptance evidence missing.** There is no `playwright.txt`, no `npm run build` output and no
   proof of the ≤ 60 KB chunk size in `orchestration/evidence/T019/`. MG-01 and MG-02 also have no
   `rtl-200` screenshot. Fix: rerun `npm run build`, `npm run e2e` and the lab spec, and save the
   outputs.
6. **MG-04 Relaxed snap gives away the wrong drawing.** It snaps only when `!p.wrong`
   (MG-04/model.ts:173), so a part that never snaps must be the error. Fix: snap every part to its
   nearest drawn orientation.
7. **MG-29 answers are not shuffled.** 4 of 9 correct answers are "A" (model.ts:24-34), and the
   one-button highlight always starts at A (model.ts:136). Fix: shuffle the answer order from the
   seed and start the highlight at a seeded offset.
8. **MG-29 physics wording.** "Spin is conserved" (en.mg_build.json:83) is wrong: angular momentum
   is conserved, while the spin rate rises. Fix the line to say so.
9. **Constants without accuracy tags.** MG-03/model.ts:24-25 (X0, X1), MG-05/model.ts:19 and 108,
   MG-06/model.ts:26 (ZETA_MAX), MG-30/model.ts:15-16. Fix: add `game_value` comments.
10. **Visual polish.** Hide or align the internal deadline with the host bar (MG-03/04/05 HUD
    "left" readouts). Move result strips off the playfield content (MG-04/render.ts:629,
    MG-29/render.ts:254). Draw MG-05 particles at least 4 px with a contrasting rim
    (render.ts:277). Fill the dead space in MG-03 and MG-30.
11. **Minor: MG-06 one-button.** The data says "press the button to stop it", but the code stops the
    damper only while the button is held (MG-06/model.ts:269). Either make a tap latch the stop or
    list it as a Decision.

What checked out:
- Thresholds use `_min` ≥ and `_max` ≤, read from params with clamped fallbacks.
- One result only, never after `destroy()`, capped at `durationMs` (`kit.ts` LoopHost).
- No Math.random, Date or clock in any `model.ts`; fixed 120 Hz steps.
- Tests cover at and just past each threshold, host params, Relaxed, Cadet and Flight Director,
  determinism, frame rates of 30, 60 and 144, 24 seeds × 3 modes × 3 assist levels, idle play
  (MG-30 exempt), one-button success and perfect ⇒ success. 565 Vitest tests pass.
- Every `env.t` key resolves, and no data key is redefined.
- Each README has the params table and the physics versus game section. The MG-29 bank lists the
  principle and fact id per question. MG-06 and MG-30 document the coop interface.
- Every minigame is at or above 30 fps at ×4 throttle.

## Post-review changes (implementer; the reviewer's scores above are unchanged)

Fixed after this review: findings 1 (MG-30 candidates now depend only on seed + shared elements,
ties to the lowest letter), 2 (MG-05 stroke speed from sample timestamps, with a batched-input
test), 3 (Relaxed pressure limit 0.86), 4 (`aria-describedby` on every playfield pointing at its
status line), 5 (build, Vitest and Playwright outputs saved here; MG-01/MG-02 `rtl-200`
screenshots exist), 6 (MG-04 Relaxed snaps every part), 7 (MG-29 seeded answer order and
highlight start), 8 (angular-momentum wording), 9 (missing `game_value` tags), part of 10 (MG-04
feedback moved to the top of the bench; MG-05 particles enlarged with a glow / rim; MG-30 layouts
rebalanced). Not changed: the Standard-mode internal deadline shown as "Scan ends in" next to the
host's longer time bar (a consequence of the brief's 75 % rule, listed as a Decision), MG-06
one-button stop-while-held (listed as a Decision; `hold_to_toggle` latches), contrast not measured.
No re-review was run, so the visual items stay as scored: **visuals not verified to the 4/5 bar**.
