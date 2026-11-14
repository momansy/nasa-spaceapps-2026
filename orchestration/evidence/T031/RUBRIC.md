# T031 rubric: host UI revamp (U1 to U11, M8)

- **Reviewer:** independent subagent. It did not build this UI and had not seen it before this review.
- **Date:** 2026-11-14 (re-score of the run 3 captures; supersedes the earlier RUBRIC.md). Re-verified 2026-11-15 against the recaptured set. That set has three changes: Signal ghost "If chosen" chips, a Console 92 % glass tint, and connector-free vote-stage chips. U2, U3, U6 and U10 were re-checked, along with glass sampling (U4) and 200 % plus RTL (U9). Every other row is unchanged because the new images do not contradict it.
- **Bar:** `orchestration/VISUAL_TARGET.md` section 6. A score of 4 means shippable: it holds up side by side with the reference frame, and an outsider would not pick out the difference in quality. Nothing ships below 4. Section 3 (UI spec) and section 2.5 (rendering) were used as the checklists.
- **Method:**
  - Scored from scratch against the current images. The old RUBRIC.md was used only to check whether each listed defect is fixed.
  - Visual inspection of every 1920 × 1080 capture: `after/*`, `before/*`, `accessibility/*`, `buildbay_vote_in_progress.png`, `design-system-specimen-1920x1080.png`, `webgl-chrome-post-glass-on-1920x1080.png` and `-off`.
  - Side by side: `title_vs_frame01.png`, `lobby_vs_frame06.png` and `buildbay_vs_frame02.png`, plus the full-size reference frames `assets/media/style/frames/01-title.png`, `02-build-bay.png` and `06-mission-control.png`.
  - Room readability: the 640 × 360 inset of `buildbay_downscale_33pct.png`, cropped and viewed at 1:1.
  - Zoomed crops (Pillow, 1.2–2×) of every panel edge, stepper, chart and scroll mask, at 100 %, at 200 % text plus RTL, and in high contrast.
  - Pixel sampling (5 × 5 median) at the same panel points across normal, high-contrast, reduced-motion and WebGL on/off captures. Whole-image diffs of the reduced-motion and high-contrast captures against the normal ones.
  - Files read: `README.md`, `contrast.md` and `webgl-fps-*.json`.
  - Code review for U7: `UI/Motion/MfMotion.cs`, `Motion.uss` and `MfAccessibility.cs`, plus a grep of `App/Screens/*.cs` and `Screens/BuildBay/**` for `MfMotion`, `CountUp`, `Celebrate`, `Enter` and USS transitions.

| Item | Score (1-5) | One-line reason | Evidence file(s) |
|---|---|---|---|
| U1 Typography | 4 | Oxanium titles, Plex Sans UI, tabular numerals, units at reduced size in Muted, and mono only for room codes. Small misses remain: the screen titles are all caps, the Readiness KPI numbers are about 32 px instead of the 56/72 kpi token, and "30 / days" splits a number from its unit across a line break. | `after/*.png`, `design-system-specimen-1920x1080.png` |
| U2 Layout and rhythm | 3 | The Readiness overflow is fixed (it now scrolls). The centre column is still crowded by 7 floating elements and a 890 × 245 timeline that covers the pad base. The vote-stage chips lost their connectors but still wrap "Result" onto a second line in every capture. | `after/buildbay-after-1920x1080.png`, `buildbay_vote_in_progress.png`, `buildbay_vs_frame02.png` |
| U3 Colour and contrast | 4 | Contrast is measured on the real frames: with the 92 % glass every text style passes on every glass and scrim box, and the remaining failing cells are UI-fill tiles, which the high-contrast capture confirms. Status colours now mean status only: deltas are Signal, red only for Fails and the deadline. One small miss: the pending-hourglass colour is inconsistent. | `contrast.md`, `after/buildbay-after-1920x1080.png`, `buildbay_vote_in_progress.png`, `webgl-chrome-post-glass-on-*` |
| U4 Surfaces | 4 | Glass now renders: Build Bay panel pixels are warm-tinted and vary with the sky, against flat #112B40 in high contrast and with glass off. Radii are consistent, cards sit inside the glass and the e1 edges are visible. On the Lobby the glass is visually indistinguishable from opaque over black space. | `after/buildbay-after-*`, `webgl-chrome-post-glass-on-*` vs `-off`, `accessibility/buildbay-highcontrast-*` |
| U5 Icons | 4 | One Lucide family, no letter, dash or underscore stand-ins, and the circle-check, triangle and octagon status shapes are used consistently. Icons do not scale in 200 % mode (scored under U9). | `after/*`, specimen "Icons" |
| U6 Data visualisation | 3 | Requirement markers, hatch and cross-hatch, ghost deltas (bar segments and now Signal outline chips with arrow, sign and unit), tallies with letters and dots, critical-path chevrons, dotted slack and a single deadline label all work. Still wrong: the Marginal Data budget bar has no fill and its marker overprints the text, the timer ring has no threshold tick, and the idle Gantt has an unlabelled stub, ticks and "now" marker. | `after/buildbay-after-*`, `buildbay_vote_in_progress.png`, `webgl-chrome-post-glass-on-*` |
| U7 Motion | 3 | Code review only; there is no video. The tokens, the reduced-motion path and the C# quart count-up and 6 % celebrate curves are correct. The Build Bay uses only the timer pulse and hover/state transitions: no panel enter, no card stagger, no KPI count-up, and `Celebrate` is never called. | `UI/Motion/MfMotion.cs`, `Motion.uss`, grep of `App/Screens`, `Screens/BuildBay` |
| U8 Room readability | 4 | At 640 × 360 the screen title, every Readiness KPI number (all rows are now on screen) and the Meets and Marginal words are legible. The status words are about 8 px, which is at the floor. | `buildbay_downscale_33pct.png` |
| U9 Accessibility modes | 3 | High contrast is now correct on all three screens: opaque panels with no imagery behind text. 200 % text plus RTL still has collisions, sliced text and dropped content on the Build Bay, misaligned RTL on the Lobby, and Title body text over the bright Earth limb. | `accessibility/*-text200-rtl-*`, `accessibility/*-highcontrast-*` |
| U10 Polish | 3 | The localhost URL, overflowing chips, ellipsised meta lines, "Room Not open", the missing Reveal label and the dangling stage connector are fixed. Remaining: the stage strip still wraps "Result", text sliced by scroll masks, truncated feed and meta lines, a marker over text, a number/unit wrap and stale specimen labels. | `after/buildbay-after-*`, `webgl-chrome-post-glass-on-*`, `after/lobby-after-*`, specimen |
| U11 Reference match | 2 | The Title follows frame 01's layout, but the rocket is about a quarter of the frame height and flat-lit. The Lobby has none of frame 06's warm interior mood. In the Build Bay a primitive pad and a rocket about 13 % of the frame height sit under panels covering about 70 % of it; an outsider would pick out the gap at once. | `title_vs_frame01.png`, `lobby_vs_frame06.png`, `buildbay_vs_frame02.png` |
| M8 Lighting and render | 3 | Big step up: HDRI dusk sky with a sun disc and clouds, navy shadows that are not crushed, unclipped whites, small light pools on the pad deck and a sun glint on the ground. But the ground reads as rippling liquid, not wet concrete, there is no visible warm rim on either vehicle, and the horizon is a hard flat band. | `after/buildbay-beauty-no-ui-after-*`, `after/buildbay-complete-vehicle-beauty-*`, `before/buildbay-beauty-no-ui-before-*`, `after/title-after-*` |

## Below 4

**U2 Layout and rhythm (3)**
- **Centre column (x 512–1408):**
  - These elements float over the scene:
    - the C1 contract card (512–880, 118–250);
    - the rehearsal banner (512–1040, 266–308);
    - the review-phase pills (884–1406, 118–162);
    - the 4 tool chips (1215–1405, 266–480);
    - the timeline strip (515–1405, 810–1055).
  - The rocket occupies about 45 × 250 px (940–985, 470–720). The timeline hides the pad base and the near ground, so the middle 52 % does not read as "lit hardware first" (VISUAL_TARGET 3.2).
- **Side panels intrude about 26 px into the middle 52 %:**
  - Readiness ends at x ≈ 487 (the 24 % line is 461).
  - The vote panel starts at x ≈ 1433 (the line is 1459).
- **Vote-stage strip, recaptured set (1462–1760, 280–350):**
  - The connectors are gone, but the strip still does not fit on one line.
  - "Reveal", "Inspect" and "Vote" sit on the first line (1462–1750, 280–312), and "Result" wraps alone onto a second line (1465–1545, 322–350).
  - This is true in every capture: `after/buildbay-after`, `-highcontrast`, `-reducedmotion`, `buildbay_vote_in_progress.png` and both WebGL captures.
  - The wrap pushes "0 of 4 voted" and the option list down by about 40 px.

**U6 Data visualisation (3)**
- **Data budget row, `after/buildbay-after` (78–458, 870–940):**
  - The status is Marginal, but the bar is an empty grey track with no hatched fill (78–458, 905–915). It reads as the banned grey stand-in bar.
  - The requirement marker line (≈ 267, 897–925) runs down through "GB/day made" in the meta line.
- **Fixed in the recaptured set:** the "If chosen" chips are now Signal (#55C5CD text, #4A9CA2 border) outline ghosts with an arrow, a signed value and a unit, at 1566–1725, 643–672 and 1475–1686, 678–708.
- **Timer ring (1730–1845, 135–235):**
  - It has no threshold tick and no label, which section 3.1 requires.
  - At 3 s the status glyph overlaps the arc stroke (1795–1825, 135–160 in `buildbay_vote_in_progress.png`).
- **Gantt, idle state (`after/buildbay-after`, 737–1383, 890–975):**
  - The Lead time bar is a 16 px stub (737–753, 897–925) with no label and no chevron.
  - The axis ticks (830, 920, 1013, 1105, 1198 at y ≈ 972) have no day labels.
  - The "now" marker (737, 890) is an unlabelled triangle.
- **Gantt, WebGL capture:** the "Kerolox Giant" label in the critical bar (745–875, 900–922) runs straight into the chevron pattern with no gap.
- **Mission success "info with band":** the bar ends in a hollow box (433–458, 752–770 in WebGL; 452–460, 735–752 in `after/`) that reads as a glitch rather than a range cap.

**U7 Motion (3; code review plus stills, no video)**
- **What passes:**
  - `MfMotion.cs` and `Motion.uss` carry the 3.1 tokens.
  - Reduced motion turns movement into a 150 ms opacity transition and cancels translate and scale. `Pulse` is a no-op and `CountUp` jumps to the value.
  - The C# count-up uses ease-out-quart.
  - `EaseOutBack` with back 1.28 peaks at 5.98 %, inside the 6 % limit.
- **Gaps:**
  - The only helper calls in screens are:
    - Title (`TitleScreen.cs:51–52`, Enter);
    - Lobby (`LobbyScreen.cs:209`, seat Enter; `:245`, crew-count CountUp);
    - the Build Bay timer pulse (`VotePanelView.cs:58/78/92`).
  - In the Build Bay, the Readiness KPIs, budget and tallies do not count up, the vote cards and panels have no enter or stagger, and the result moment has no celebrate.
  - `MfMotion.Celebrate` has no caller anywhere.
  - The USS `.mf-motion-count` is still ease-out-cubic (`Motion.uss:9`).
  - The 600 ms screen transition is unevidenced.
  - The reduced-motion stills are pixel-identical (Title, Build Bay) or near-identical (Lobby, 1.3 mean diff) to the normal captures, so they prove nothing about motion.
  - A short capture of a Lobby join, a Build Bay vote and a result is needed before this can score 4.

**U9 Accessibility modes (3)**
- **Build Bay, 200 % text plus RTL (`accessibility/buildbay-text200-rtl`):**
  - The Gantt labels "Lead time" and "Integration" touch and overprint each other (1055–1300, 800–878).
  - "Deadline 180 days" sits on top of the Lead time track (690–1030, 780–815).
  - "×g" collides with "stage TWR" (1505–1560, 895–920).
  - "Earth Watch" butts against the C1 tag with no gap (1230–1245, 250).
  - Every scroll panel slices a line of text through the middle at the bottom edge:
    - "$1.2 M · 30 days · 98.5" (95–525, 990–1012);
    - "warning below" (1380–1640, 995–1015).
  - Content is dropped:
    - the contract objective text and the rehearsal explanation disappear;
    - the tool chips lose their labels and show only key plus icon (690–1235, 575–630);
    - only one vote option card is visible.
  - The Budget bar fill runs into the "Budget" label with no gap (1075–1130, 950).
- **Lobby, 200 % text plus RTL (`accessibility/lobby-text200-rtl`):**
  - The overlaps are fixed, but RTL alignment is inconsistent:
    - "Mission control crew" (910–1550, 240–400), "Mission settings" (130–470, 840–1010) and the room code "ZAEE" (165–400, 555–625) stay left-aligned;
    - "Join this mission" and its body are right-aligned.
  - The Mission settings controls are entirely off-screen below y = 1025 (only the heading shows).
  - The crew grid's second row is cut at y ≈ 1000.
  - The two grey scrollbars (845–860, 235–1000 and 1787–1800, 260–975) are unstyled.
- **Title, 200 % text plus RTL (`accessibility/title-text200-rtl`):**
  - The pitch text lies directly over the bright atmospheric limb with no scrim: "fly the rocket your team built." (360–1195, 720–785).
- **All screens:**
  - Status icons do not scale with 200 % text. The check in "LIVE" (1232–1250, 60) and in "Room server: connected" (1785–1800, 985) is about 14 px next to about 48 px text.

**U10 Polish (3)**
- **Build Bay:**
  - The vote-stage strip still wraps "Result" onto a second line (1465–1545, 322–350; see U2). The dangling connector is gone.
  - The scroll mask slices option C's "Uncertain: testing" chip through its text (1475–1825, 930–950 in `after/buildbay-after`; the same in `-highcontrast` and `-reducedmotion`).
  - "No return to Earth" is sliced (260–460, 1003–1015 in both WebGL captures).
  - The Data budget meta line is truncated as "0.0 GB/…" (365–452, 927).
  - The activity feed is truncated: "Kofi (BOOSTER): Recommended › Ker…" (1489–1840, 1028); "Standard fai…" and "Small…" (1489–1840, 972–1028 in `buildbay_vote_in_progress.png`).
  - The marker line overprints "GB/day" (≈ 267, 915).
  - A number is split from its unit across lines: "· 30 / days" (1775–1800, 470 → 1475–1510, 497) and "· 90 / days" (1800, 800 → 1475, 826).
- **Lobby:** the nav connector after the current "Lobby" pill touches the pill edge (515–530, 56).
- **Specimen:**
  - The "Glass panel e2" caption says "Blur + Console 76 %" (1535–1755, 165), but the shipped token is Console 90 % (`contrast.md`).
  - "Tabular 1111 / 8888 / −42.5" wraps (410–720, 598–655).
  - The "Engines" Gantt label sits under the chevrons (1290–1385, 630).
  - The requirement labels "need 9,700 m/s" and "need 1.20" overlap their marker caps (1265–1425, 145 and 250).

**U11 Reference match (2)**
- **Title vs frame 01:**
  - The layout matches.
  - The vehicle is small: about 290–830 px tall and tilted, against frame 01's full-height hero.
  - Its shell is grey-white with navy bands, against frame 01's ceramic white with teal strakes, and it has no warm rim.
- **Lobby vs frame 06:**
  - Frame 06 is a warm, lit control-room interior.
  - The Lobby is near-opaque navy panels over a black starfield, covering about 90 % of the frame. The glass is imperceptible there.
- **Build Bay vs frame 02:**
  - The sky now carries the sunset mood.
  - The hardware is still a primitive lattice tower, a box hangar and a table-top launch mount on an octagonal slab, with the rocket at about 13 % of frame height. Frame 02 has a full-height detailed vehicle and gantry.
  - The panels cover about 70 % of the frame.

**M8 Lighting and render (3)**
- **Build Bay beauty shots (`after/buildbay-beauty-no-ui-after`, `-complete-vehicle-beauty`):**
  - The wet ground is a high-contrast blotchy ripple pattern over the entire lower half (0–1920, 680–1080). It reads as a lake or an oil slick, with the pad floating on it, not as wet concrete with puddles and practical reflections.
  - The horizon is a hard flat navy hill silhouette against the bright band (0–1920, 600–670). VISUAL_TARGET 2.5 asks for no hard horizon line.
  - The vehicle shell (940–985, 470–720) is evenly front-lit white with no visible 4500 K rim on the sun side. The gantry and launch table are flat navy with no rim either.
  - There is no navy vignette at the frame edges (frame 02 has one).
- **Title (`after/title-after`):**
  - The rocket (1460–1600, 290–830) is flat, uniformly lit grey-white with no warm rim and no broad soft highlight.

## Notes

- **Previously listed defects now fixed:**
  - Glass renders: the shader reference was missing in run 2, and is fixed per README. Build Bay panel pixels vary with the scene (for example #554C45 against opaque #112B40) and differ between WebGL on and off.
  - High contrast now makes every panel and chip opaque Console on all three screens. This includes the Title, which before was identical to normal.
  - The grey stand-in tally bar is gone ("0 of 4 voted" is text only).
  - There is no empty "If chosen" row.
  - "Deadline 180 days" is printed once.
  - The budget figures now have a "·" separator.
  - The stray tick on the timer ring is gone.
  - The Reveal step has its label.
  - The Readiness list no longer clips rows: it scrolls, and every row is on screen at 100 % and at 33 %.
  - The vote-card chips no longer overflow, and the option meta lines are no longer ellipsised.
  - The red overuse on vote cards is gone. The 2026-11-15 recapture also replaced the interim Marginal-yellow chips with Signal ghosts.
  - The localhost URL and "Room Not open" are gone.
  - Lobby 200 % text no longer overlaps: the panels scroll.
  - `CountUp` is used, but only for the Lobby crew count.
  - The celebrate curve is clamped to 6 % in C#.
  - `contrast.md` is now measured on the captured frames.
  - The Build Bay has an HDRI sky with a sun, wet-ground reflections and pad light pools.
  - The Title vehicle no longer renders blue-grey.
- **Fixed in the 2026-11-15 recapture:**
  - The "If chosen" chips are Signal ghosts, no longer Marginal yellow.
  - The glass is Console 92 %. `contrast.md` now passes every text style on every glass and scrim box, including Muted on the vote glass padding strip at 4.8:1, previously 4.4:1.
  - Glass still renders after the tint change. Sampled Build Bay panel points are #4D4744, #423E44 and #484346, against opaque #112B40 in high contrast. The mean difference between WebGL on and off over the panels is 8–9 in the red channel.
  - The dangling stage connector is gone.
- **Minor colour note (not blocking U3):** the pending hourglass for "Entry speed rating" is Signal teal (89, 962), while the other pending hourglasses (for example "Lift-off TWR", 89, 311) are Ceramic.
- **Not fixed by the recapture, contrary to the change note:** the vote-stage strip still wraps "Result" onto a second line in every capture (U2, U10).
- **Previously listed defects still open:**
  - The screen titles are all caps and the KPI numbers do not use the kpi token (U1, kept at 4).
  - The centre-column crowding (U2).
  - The blur cost is still not isolated: both fps runs sit at the 60 fps vsync cap, a p95 difference of 0 ms.
  - Build Bay motion is missing (U7).
  - The Lobby mood against frame 06 (U11).
  - The missing vehicle rim light (M8).
- **Outside T031's scope (T032 and T033 models and materials):**
  - The primitive pad, gantry, hangar and vehicle geometry.
  - The navy-banded vehicle livery instead of teal strakes.
  - Engine and bell fidelity.
  - These account for most of the U11 gap and part of the M8 gap.
- **Inside T031's scope:**
  - The ground shader and its ripple strength (`Art/Shaders`, WetSheen).
  - The rim light, the horizon treatment and the vignette (`Art/Lighting` rigs and volumes).
  - The panel density and the timeline height (Build Bay UXML/USS).
  - The 200 % and RTL rules (`UI/`, Build Bay USS).
  - Build Bay motion needs calls in Build Bay view controllers. The brief limits controller C# changes to renames, so that part needs an agreed exception or a follow-up task.
- **Performance:** WebGL median 59.9 fps during assembly with post and glass on and off. The README confirms that glass rendered in the "on" run, so the measurement now includes the blur pass. The run passes the 45 fps line.
- **Report this task under "Not verified / failing":**
  - Per VISUAL_TARGET section 6, any item below 4 blocks a claim of done.
  - Below 4: U2, U6, U7, U9, U10, U11 and M8.
