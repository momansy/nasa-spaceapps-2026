# T031 rubric: host UI revamp (U1 to U11, M8)

- **Reviewer:** independent subagent. It did not build this UI and scored it without reference to the builder's notes.
- **Date:** 2026-11-15, run 4 re-score. This supersedes the 2026-11-14/15 run 3 RUBRIC.md. Every row was scored again from scratch against the run 4 captures.
- **Bar:** `orchestration/VISUAL_TARGET.md` section 6. A score of 4 means shippable: it holds up side by side with the reference frame, and an outsider would not pick out the difference in quality. Nothing ships below 4. Section 3.1/3.2 (UI spec) and section 2.5 (rendering) were used as the checklists.
- **Method:**
  - Scored from scratch against the current images. The run 3 RUBRIC.md was used only to check whether each listed defect is fixed.
  - Looked at every 1920 × 1080 capture: `after/*`, `before/*`, `accessibility/*`, `buildbay_vote_in_progress.png`, `design-system-specimen-1920x1080.png`, and `webgl-chrome-post-glass-on-1920x1080.png` and `-off`.
  - Side by side: `title_vs_frame01.png`, `lobby_vs_frame06.png` and `buildbay_vs_frame02.png`, plus the full-size frames `assets/media/style/frames/01-title.png`, `02-build-bay.png` and `06-mission-control.png`.
  - Room readability: the 640 × 360 inset of `buildbay_downscale_33pct.png` (at x 640–1279, y 359–719), cropped and viewed at 1:1.
  - Zoomed crops (Pillow, 1.2–6×) of every panel, the timer rings, the Gantt, the specimen gauges, both steppers, and the 200 % plus RTL and high-contrast captures.
  - Pixel work:
    - 5 × 5 medians and quartile background samples under text in the vote and readiness panels;
    - hourglass icon colours;
    - corner, edge and vehicle samples on the beauty shots, plus channel-clipping statistics;
    - whole-image diffs of the reduced-motion captures against the normal ones;
    - cap-height measurement of the Title button labels at 100 % and 200 %.
  - Re-ran `measure_contrast.py` with `contrast_regions.json` on the run 4 captures. A patched copy was written to /tmp, because the local Pillow lacks `get_flattened_data`.
  - Files read: `README.md`, `contrast.md`, `webgl-fps-*.json` and the run 4 diff (`git diff HEAD`).
  - Code review for U7: `UI/Motion/MfMotion.cs`, `Motion.uss` and `MissionForgeTheme.uss` (`.mf-screen`, `.mf-motion`, `.mf-enter`), plus a grep of `App/Screens/*.cs` and `Screens/BuildBay/**` for `MfMotion.` calls.

| Item | Score (1-5) | One-line reason | Evidence file(s) |
|---|---|---|---|
| U1 Typography | 4 | Oxanium titles, Plex Sans UI, tabular numerals, units at reduced size in Muted, mono only for room codes, and no number/unit wraps any more (no-break spaces). Small misses: the screen titles are all caps, the Readiness KPI numbers are about 28 px instead of the 56/72 kpi token, and the new Gantt tick and gauge threshold labels are 16 px, below the 20 px meta floor. | `after/*.png`, `design-system-specimen-1920x1080.png` |
| U2 Layout and rhythm | 3 | The vote-stage strip now fits on one line in every Mac capture. The centre 52 % is still crowded: the contract card, phase pills, rehearsal banner, 4 tool chips and an 896 × 257 timeline sit over a rocket about 48 × 250 px, and both side panels cross the 24 % lines. | `after/buildbay-after-1920x1080.png`, `buildbay_vote_in_progress.png`, `buildbay_vs_frame02.png` |
| U3 Colour and contrast | 4 | Every text background sampled on the run 4 frames passes. Muted text is 5.8–7.6:1 and Fails red is 4.6:1 or better on the vote and readiness glass. Status colour means status. Misses: one pending hourglass is still Signal, and `contrast.md` is stale (run 3; a re-run now gives 8 failing whole-box cells, all on UI fills). | `contrast.md` (re-run), `after/buildbay-after-*`, `buildbay_vote_in_progress.png` |
| U4 Surfaces | 4 | Glass renders and varies with the scene, radii are consistent, cards sit inside the glass, and high contrast makes everything opaque Console. On the Lobby the glass is barely perceptible over black space. | `after/buildbay-after-*`, `after/lobby-after-*`, `accessibility/*-highcontrast-*` |
| U5 Icons | 4 | One Lucide family, no letter or dash stand-ins, and circle-check, triangle and octagon status shapes throughout. The specimen's octagon now sits on a Space disc. Icon scaling at 200 % is scored under U9. | `after/*`, specimen "Icons" |
| U6 Data visualisation | 4 | The run 3 blockers are fixed. The Marginal Data budget row has a hatched zero stub, the compact marker stays inside its box, and the idle Gantt is labelled (lane bar label, day ticks, "Today" marker, deadline). Ghost deltas, tallies and the critical/slack patterns are correct. Minor: the timer threshold tick is not visible in any Build Bay capture, and the Mission success band cap still reads as a hollow box. | `after/buildbay-after-*`, `buildbay_vote_in_progress.png`, specimen "Data" |
| U7 Motion | 3 | The code now covers the token set. Build Bay regions enter with a 40 ms stagger, vote cards enter once per round, KPIs count up with ease-out-quart, the winning card celebrates (6 % clamp), plus the urgent pulse and the 600 ms screen transition, with reduced-motion paths. But there is still no motion capture, and `Show()` rebuilds every card on each update, which can cut the enter and celebrate animations short. | `UI/Motion/MfMotion.cs`, `BuildBayScreen.cs:126–137`, `VotePanelView.cs:182–199`, `DashboardView.cs:122–147` |
| U8 Room readability | 4 | At 640 × 360 the screen title, every Readiness KPI number and the Meets and Marginal words are legible. The status words are about 8 px, at the floor. | `buildbay_downscale_33pct.png` |
| U9 Accessibility modes | 3 | High contrast is correct on all three screens. Fixed: Lobby RTL alignment, the Title scrim and the Gantt label overlaps. At 200 % plus RTL, though, the Build Bay still drops content, slices text, splits "9,700 / m/s" and leaves elements touching. The Lobby settings controls are off-screen. The Title buttons do not scale at all. | `accessibility/*-text200-rtl-*`, `accessibility/*-highcontrast-*` |
| U10 Polish | 3 | Many fixes: the stage-strip wrap, the marker overprint, number/unit wraps, ellipsised feed and meta lines, and the specimen captions and wraps. Remaining: the scroll masks slice a chip through its icon and cut rows mid-glyph, the Lobby nav connector touches the current pill, "If chosen" still shows on the decided winner, and the WebGL captures are stale run 3 frames that still show the old truncations. | `after/buildbay-after-*`, `after/buildbay-assembly-*`, `buildbay_vote_in_progress.png`, `after/lobby-after-*`, `webgl-chrome-post-glass-*` |
| U11 Reference match | 2 | The Title follows frame 01's layout, but its rocket is small and flat-lit. The Lobby has none of frame 06's warm interior. In the Build Bay a primitive pad and a rocket about 23 % of frame height sit under panels covering about 70 % of the frame; an outsider would pick out the gap at once. | `title_vs_frame01.png`, `lobby_vs_frame06.png`, `buildbay_vs_frame02.png` |
| M8 Lighting and render | 3 | Better: the ground now reads as a dark apron with sparse puddle glints, a vignette is present, and the vehicle has a warm-right, cool-left split (#EFE6DC against #A3A2AE). Still failing: the horizon is a hard flat band, there is no rim on the vehicle or gantry, and the grade pushes the red channel to 0 over 31 % of the top sky and 16 % of the ground (frame 02 has none). | `after/buildbay-beauty-no-ui-after-*`, `after/buildbay-complete-vehicle-beauty-*`, `before/*`, `02-build-bay.png` |

## Below 4

**U2 Layout and rhythm (3), `after/buildbay-after-1920x1080.png`**
- **Centre column (x 512–1408):**
  - Seven elements float over the scene:
    - the contract card (512–880, 118–250);
    - the review-phase pills (884–1406, 118–162);
    - the rehearsal banner (512–1040, 266–308);
    - the 4 tool chips (1215–1407, 266–480);
    - the timeline panel (512–1408, 798–1055).
  - The rocket occupies about 48 × 250 px (937–985, 470–720).
  - The timeline hides the pad base and the near ground (512–1408, 798–1055).
  - So the middle 52 % does not read as "lit hardware first" (VISUAL_TARGET 3.2).
- **Side panels cross into the middle 52 %:**
  - Readiness ends at x ≈ 487; the 24 % line is at 461, so it overshoots by 26 px.
  - The vote panel starts at x ≈ 1433; the line is at 1459, so it overshoots by 26 px.
- **Fixed this run:** the vote-stage strip is on one line: "Reveal · Inspect · Vote · Result" at 1462–1820, 278–310 in `after/buildbay-after`, at 1462–1817 in `buildbay_vote_in_progress.png`, and at 1462–1825, 228–260 in `after/buildbay-assembly`.

**U7 Motion (3; code review plus stills, no video)**
- **What passes:**
  - `MfMotion.cs` and `Motion.uss` carry the 3.1 tokens.
  - `.mf-screen` animates at 600 ms with ease-in-out-cubic (`MissionForgeTheme.uss:35–45`).
  - Reduced motion turns movement into an opacity fade of 150 ms or less and cancels translate and scale. `Pulse` is a no-op and `CountUp` jumps to the value.
  - `EaseOutBack` with back 1.28 peaks at 5.98 %.
  - New this run:
    - `BuildBayScreen.EnterPanels` (`:126–137`) enters the four regions on a 40 ms stagger;
    - `VotePanelView.Options` (`:182–199`) enters cards once per round and calls `MfMotion.Celebrate` on the winner;
    - `DashboardView.ShowValue` (`:122–147`) counts KPIs up on the count token with ease-out-quart.
- **Still failing:**
  - **No motion evidence.** There is no video or frame sequence. The reduced-motion stills are pixel-identical to the normal ones (mean difference 0.00–0.01 for Title and Build Bay, 1.2 for Lobby), so they prove nothing about motion. Smoothness, stagger timing and the reduced-motion fade are unverified.
  - **Animations can be cut short.**
    - `VotePanelView.Show` (`:100–110`) calls `Options()`, which runs `_options.Clear()` and recreates every card on every model update: each vote, tag or stage change.
    - A vote that lands within 320 ms of a round start replaces the entering cards with static ones.
    - An update within 480 ms of the result destroys the celebrating card.
  - **Bars and numbers are out of step.**
    - The Readiness bar fills (`MfMetricBar`, drawn in `generateVisualContent`) snap to the new value while the number beside them counts up for 1 s.
    - The tally appears with no enter (`display` None → Flex, `VotePanelView.Tally`).
  - The USS `.mf-motion-count` is ease-out-cubic (`Motion.uss:9`). This is an accepted UI Toolkit limit, because the C# path uses quart.
- **To reach 4:** a short capture of a Lobby join, a Build Bay round (enter, count-up, vote, result) and the same round in reduced motion, plus card reuse in `Options()` so that updates do not restart or kill the animations.

**U9 Accessibility modes (3)**
- **Build Bay, 200 % text plus RTL (`accessibility/buildbay-text200-rtl-1920x1080.png`):**
  - **Content dropped:**
    - the contract objective text and the rehearsal banner are hidden;
    - the tool chips show only key plus icon, with no labels (690–1235, 428–487);
    - only one vote option card is visible, and its meta line is sliced.
  - **Text sliced by scroll masks:**
    - "$1.2 M · 30 days ·" (95–525, 985–1015);
    - "warning below … Meets" (1380–1840, 1000–1020).
  - **Number split from its unit:** "need 9,700" / "m/s · +0.2 %" (1380–1610, 590–680).
  - **Collisions and touching elements:**
    - "×g" butts against "Upper / stage TWR" (1505–1560, 880–925);
    - the Budget bar fill runs into the "Budget" label with no gap (1120–1132, 945–955);
    - the "⚠" in "Reconnecting" touches the "g" (1213–1222, 45–80), and the chip butts against the "BUILD BAY" wordmark (1272–1282, 20–100);
    - the "Kerolox / Workhorse" title touches the "A" key badge (450–458, 820–880).
  - **Metric status icons do not scale:** the ⚠, hourglass and check are about 22 px next to about 48 px text (1818–1842, 487–509; 1818–1842, 688–712; 1818–1842, 895–919).
  - **Dangling connector** before "C · CDR" (598–620, 336).
- **Lobby, 200 % text plus RTL (`accessibility/lobby-text200-rtl-1920x1080.png`):**
  - The Mission settings controls are entirely off-screen. Only the heading shows (96–830, 815–1025).
  - The crew grid's second row is cut at y ≈ 1000 (905–1770, 920–1000).
  - "No role yet" overruns each chip's left border in RTL (915–925, 1209–1215 and 1503–1509, all at y 830–880).
  - The scrollbars are unstyled grey (845–860, 235–1000; 1787–1800, 260–975).
  - "Room" touches the "LOBBY" wordmark with about 6 px gap (1433–1442, 40–85).
- **Title, 200 % text plus RTL (`accessibility/title-text200-rtl-1920x1080.png`):**
  - The action buttons do not scale. The cap height of "New mission" and "Settings" is 20 px at both 100 % (166–183, 903–922 in `after/title-after`) and 200 % (884–899, 819–838). The button row is at 437–1140, 800–857.
- **Fixed this run:**
  - Lobby RTL headings, the room code and setting labels are now right-aligned.
  - The Title pitch now sits on a Space-80 % scrim instead of over the Earth limb.
  - The Gantt lane labels no longer overprint each other, and "Deadline 180 days" no longer sits on the track.
  - `.mf-status` icons now scale: the "Room server: connected" check is about 30 px next to 44 px text.

**U10 Polish (3)**
- **Build Bay (Mac captures):**
  - The scroll mask slices option B's "Uncertain: testing" chip through its warning icon and loses the chip's bottom border (1475–1825, 888–925). This happens in `after/buildbay-after`, `-highcontrast` and `-reducedmotion`.
  - Half-rendered rows under the fade:
    - "Entry speed rating" (78–320, 1000–1015 in `after/buildbay-after`);
    - "No return to Earth" (260–460, 995–1015 in `buildbay_vote_in_progress.png` and `after/buildbay-assembly`).
  - "If chosen ↑ Cost +2.0 $M" still shows on the decided winner after Result (1474–1725, 562–590 in `after/buildbay-assembly`), and the same row shows on the loser (1474–1725, 815–843).
  - The Mission success "info with band" cap is a hollow box that reads as a glitch (450–460, 755–772 in `after/buildbay-after`).
- **Lobby:** the nav connector after the current "Lobby" pill touches the pill edge (515–530, 56 in `after/lobby-after`).
- **WebGL (`webgl-chrome-post-glass-on-1920x1080.png`, run 3, not recaptured):**
  - It still shows:
    - the wrapped "Result" pill (1462–1557, 320–352);
    - "0.0 GB/..." (365–452, 944);
    - "1 e..." (1489–1840, 1028);
    - "Kerolox Giant" running into the chevrons (745–1010, 900–922);
    - the unlabelled Gantt ticks (830–1380, 972);
    - the Lift-off TWR marker through "ideal 1.2–1.5" (300–310, 330–370).
  - The run 4 fixes are therefore unverified on the WebGL target.
- **Specimen (dev scene, not a shipped view):**
  - The "5 s" threshold label sits on the neighbouring TWR gauge's track, and its tick runs into the "s" (1348–1380, 503–520).
  - The "60 %" threshold tick touches its label (1212–1250, 470–500).
  - A "Development Build" watermark (1805–1915, 1058–1072).
- **Fixed this run:**
  - The stage strip wrap.
  - The marker over "GB/day".
  - The "0.0 GB/…" truncation (it now wraps to "0.0 GB/ day down").
  - The ellipsised feed (three full wrapped lines).
  - The "30 / days" and "90 / days" splits.
  - The specimen "Console 76 %" caption (now 92 %).
  - The specimen tabular wrap.
  - The specimen requirement labels touching their caps.
  - The specimen Gantt label under the chevrons.

**U11 Reference match (2)**
- **Title vs frame 01 (`title_vs_frame01.png`):**
  - The layout matches.
  - The vehicle is small and tilted (1460–1600, 290–830), against frame 01's full-height hero.
  - It is grey-white with navy bands, against ceramic white with teal strakes, and has no warm rim or broad soft highlight.
- **Lobby vs frame 06 (`lobby_vs_frame06.png`):**
  - Frame 06 is a warm, lit control-room interior.
  - The Lobby is navy panels over a black starfield, covering about 90 % of the frame (96–1824, 136–1025).
  - Only a sliver of Earth shows through the glass (1238–1270, 760–1000 and 800–1000, 760–860).
- **Build Bay vs frame 02 (`buildbay_vs_frame02.png`, `after/buildbay-complete-vehicle-beauty`):**
  - The sunset sky carries the mood.
  - The hardware is a primitive lattice tower, a box hangar (633–830, 535–680) and a table-top launch mount on an octagonal slab (688–1220, 735–845).
  - The rocket is about 250 px, roughly 23 % of the frame height (937–985, 445–735).
  - Frame 02 has a full-height detailed vehicle and gantry.
  - The UI panels cover about 70 % of the frame.

**M8 Lighting and render (3)**
- **Build Bay beauty shots (`after/buildbay-beauty-no-ui-after-1920x1080.png`, `after/buildbay-complete-vehicle-beauty-1920x1080.png`):**
  - **Hard horizon.** The horizon is still a hard, flat navy hill silhouette against the bright band (0–1920, 600–680). VISUAL_TARGET 2.5 asks for no hard horizon line.
  - **No rim light.** The vehicle (937–985, 470–720) has a warm-right, cool-left split (#EFE6DC at x 975, #A3A2AE at x 945, y 560) but no rim on the sun side. The gantry (815–915, 300–790) and the launch table (845–1065, 715–810) are flat navy with no rim.
  - **Ground glints.**
    - The ground no longer reads as open water, but the puddle glints are uniformly scattered at the same density and size to the horizon (0–1920, 690–1080), with no falloff.
    - The glints do not cluster around the pad lights, so there are no practical reflections at the pad.
    - The pad light pools are small (650–700 and 1110–1170, 800–830).
  - **Over-saturated grade.**
    - The red channel is 0 over 30.7 % of the top 200 rows (for example #0045A2 at 10, 10 and #0065BE at 960, 10).
    - It is also 0 over 16 % of the ground below y 700 (ground median #0B2039).
    - Frame 02's sky is a muted navy (#134061) with no zero channel.
  - **Edges.** Edge darkening is present now (TL #0045A2 against top-centre #0065BE).
- **Title (`after/title-after-1920x1080.png`):** the rocket (1460–1600, 290–830) is flat, uniformly lit grey-white with no warm rim.

## Notes

- **Previously listed defects now fixed (run 4):**
  - **U2 and U10:** the vote-stage strip fits on one line in every Mac capture (tighter pills, `BuildBay.uss:122–129`).
  - **U6:**
    - The Data budget Marginal row has a hatched zero stub (78–95, 929–941).
    - The compact requirement marker stays inside its 16 px box and no longer runs through the detail line.
    - The idle Gantt shows the lane bar label "Subtropical Coast", tick labels 30–180 plus "210 days", and a bold "Today" now-marker.
    - The gauge threshold label exists in code (`MfRadialGauge.cs`, `VotePanelView.cs:93–95`).
  - **U10:**
    - Number/unit pairs use no-break spaces.
    - Feed lines wrap in full, limited to the newest three.
    - Metric detail lines wrap instead of ellipsising.
    - The specimen caption reads "Blur + Console 92 %", "1111 / 8888 / −42.5" is on one line, and the requirement labels clear their caps.
  - **U7:** the Build Bay now calls `Enter` (regions and cards), `CountUp` (KPIs) and `Celebrate` (the winner). `Celebrate` previously had no caller.
  - **U9:**
    - Lobby RTL alignment.
    - The Title 200 % scrim.
    - The Build Bay Gantt overlaps at 200 %.
    - The `.mf-status` icon size at 200 %.
  - **M8:**
    - The ground ripple "lake" is gone: puddle coverage is 0.2 and scale 11 (`LightingFoundation.Rigs.cs`, `MF_WetSheen.mat`).
    - An edge vignette is visible.
- **Previously listed defects still open:**
  - **U1:** caps screen titles, and the KPI numbers do not use the kpi token.
  - **U2:** centre-column crowding.
  - **U3:** the inconsistent pending hourglass. "Entry speed rating" is Signal #55C5CD at (89, 972) in `buildbay_vote_in_progress.png`, while "Total delta-v" and "Lift-off TWR" are Muted #B6C7D3.
  - **U6:**
    - The timer threshold tick is not visible on the Build Bay. At the rehearsal timer lengths the threshold (5 s) falls outside the drawable range, so it is never shown in context: ring at 1730–1845, 135–235 in `after/buildbay-after` and `buildbay_vote_in_progress.png`.
    - The Info-state ring in `after/buildbay-after` has no end glyph.
    - The Mission success band cap.
    - The Budget bar requirement marker has no label (1010–1015, 1018–1036).
  - **U7:** no motion evidence.
  - **U9:** most of the Build Bay 200 % issues, the Lobby settings off-screen, unstyled scrollbars.
  - **U10:** scroll-mask slicing, the Lobby connector.
  - **U11:** the Lobby mood.
  - **M8:** the hard horizon and the missing rim.
- **New this run:**
  - The Title buttons do not scale at 200 % (U9).
  - The 16 px tick and threshold labels are below the meta size (U1).
  - The over-saturated grade with the red channel at zero (M8).
  - "No role yet" overruns its chip in Lobby RTL (U9).
- **Stale evidence:** these were not updated for run 4:
  - `README.md` (still says run 3);
  - `contrast.md` (run 3 table; a re-run on the current frames gives 8 failing whole-box cells instead of 6, newly including the Build Bay vote panel's whole box at Muted 3.7:1 and Fails 2.9:1, whose 90th-percentile tile is UI fill. Sampled text backgrounds all pass);
  - `webgl-chrome-post-glass-*.png` and `webgl-fps-*.json` (run 3 builds).

  The WebGL frame rate (median 59.9 fps with post and glass on and off, at the vsync cap) is therefore from the run 3 build. The blur cost is still not isolated.
- **Outside T031's scope (T032 and T033 models and materials):**
  - The primitive pad, gantry, hangar and vehicle geometry.
  - The navy-banded livery instead of teal strakes.
  - Engine fidelity.
  - These account for most of the U11 gap and part of the M8 gap.
- **Inside T031's scope:**
  - The horizon treatment, the rim light, and the colour grade's saturation and red floor (`Art/Lighting` rigs and volumes). The horizon terrain mesh itself is in `Art/Environment/`, which is read-only here, so the softening has to come from fog or haze.
  - Panel density and timeline height (Build Bay UXML/USS).
  - The 200 % and RTL rules (`UI/`, Build Bay USS, `Title.uss` buttons).
  - Card reuse in `VotePanelView.Options()`.
  - The motion capture.
  - Recapturing WebGL and updating `contrast.md` and `README.md`.
- **Report this task under "Not verified / failing":**
  - Per VISUAL_TARGET section 6, any item below 4 blocks a claim of done.
  - Below 4: U2, U7, U9, U10, U11 and M8.
  - U6 moved from 3 to 4 this run. No item went down.

## Builder's note (added after the review; scores above are unchanged)

The reviewer read `contrast.md` and `README.md` while the builder was still updating them. Both now carry run 4
content: `contrast.md` holds the re-measured table (8 failing whole-box cells, all on UI fills) with a verdict row for
the new vote-panel cell, and `README.md` has a "Run 4" section. The WebGL captures and fps numbers are still run 3,
as stated there.
