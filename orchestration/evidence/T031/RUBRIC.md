# T031 rubric: host UI revamp (U1 to U11, M8)

- **Reviewer:** independent subagent. It did not build this UI.
- **Date:** 2026-11-14
- **Bar:** `orchestration/VISUAL_TARGET.md` section 6. A score of 4 means shippable: it holds up side by side with the reference frame, and an outsider would not pick out the difference in quality. Nothing ships below 4.
- **Method:**
  - Visual inspection of every 1920 × 1080 capture listed below.
  - Reference frames: `assets/media/style/frames/01-title.png`, `02-build-bay.png` and `06-mission-control.png`.
  - Side-by-side images: `title_vs_frame01.png`, `lobby_vs_frame06.png` and `buildbay_vs_frame02.png`.
  - Other captures: `before/*`, `after/*`, `buildbay_vote_in_progress.png`, `buildbay_downscale_33pct.png`, `design-system-specimen-1920x1080.png`, `accessibility/*`, `webgl-chrome-post-glass-on-1920x1080.png` and `-off`.
  - Files: `webgl-fps-*.json`, `contrast.md` and `README.md`.
  - Code review of `UI/Motion/MfMotion.cs`, `Motion.uss` and `MfAccessibility.cs`, plus a grep of the screens for glass and motion usage.
  - Pixel sampling. The captures were converted to BMP with `sips`, then read by a throwaway script that sampled panel interiors and diffed each accessibility capture against its normal capture.

| Item | Score (1-5) | One-line reason | Evidence file(s) |
|---|---|---|---|
| U1 Typography | 4 | Oxanium titles, Plex Sans body, tabular numerals and units at reduced size in Muted; mono is used only for the room code. Two misses: the screen titles "LOBBY" and "BUILD BAY" are all caps, and the KPI numbers are body size, not the 56/72 kpi token. | `after/*.png`, `design-system-specimen-1920x1080.png` |
| U2 Layout and rhythm | 3 | The Lobby and Title are well spaced. The Build Bay is overfull: panels clip at the bottom, and the centre cards and the timeline cover the middle 52 %, which should show the hardware. | `after/buildbay-after-1920x1080.png`, `buildbay_vs_frame02.png` |
| U3 Colour and contrast | 3 | Palette tokens are used. The contrast table is computed from tokens composited over a glass that never renders; it was not measured on the captured frames. Fails-red is overused: every "If chosen" delta and drawback row is red, so the vote panel reads as an alarm. | `contrast.md`, `after/buildbay-after-1920x1080.png` |
| U4 Surfaces | 2 | No glass renders anywhere. Every panel interior samples exactly opaque Console #112B40, even in the WebGL post + glass ON capture, so these are still flat boxes with thin borders. The e1–e4 shadows are not visible. | `webgl-chrome-post-glass-on-1920x1080.png`, `after/*`, specimen "Surfaces" column |
| U5 Icons | 4 | One Lucide family throughout, no letter or dash placeholders, status shapes wired to circle-check, triangle-alert and octagon-x. At 24 px the octagon reads close to a circle. | `after/*`, specimen "Icons" |
| U6 Data visualisation | 3 | Requirement markers, Marginal hatch, Fails cross-hatch, the 270° timer ring and the letter-and-dot tallies are good. The Build Bay still shows a grey stand-in tally bar reading "0 of 4 voted", an empty "If chosen" row, a near-empty Gantt and the deadline labelled twice. | `after/buildbay-after-1920x1080.png`, `webgl-chrome-post-glass-on-1920x1080.png`, `buildbay_vote_in_progress.png` |
| U7 Motion | 3 | Scored from code review plus stills only; there is no video. The tokens and the reduced-motion USS and C# paths match 3.1. However, `CountUp` is never called by any screen, the USS count curve is cubic rather than quart, and the celebrate overshoot (≤ 6 %) and the 600 ms screen transition are unverified. | `UI/Motion/MfMotion.cs`, `Motion.uss`, `MfAccessibility.cs`, `accessibility/*-reducedmotion-*.png` |
| U8 Room readability | 3 | At 33 % the title and the visible KPI numbers are legible, and the status words are barely legible at about 8 px. The bottom Readiness rows (Data budget, Entry speed rating) are clipped off, so not every KPI number is on screen. | `buildbay_downscale_33pct.png` |
| U9 Accessibility modes | 2 | 200 % text plus RTL is broken on the Lobby and Build Bay, with heavy overlap and clipping. Title high contrast is unchanged from normal (0.2 mean pixel diff), so text still sits on stars and Earth with no scrim. | `accessibility/lobby-text200-rtl-*.png`, `accessibility/buildbay-text200-rtl-*.png`, `accessibility/title-highcontrast-*.png` |
| U10 Polish | 2 | The Build Bay shows clipped cards, chips overflowing their borders, many ellipses, duplicated "0 of 4 voted" text, a stray tick on the timer ring and an unlabelled first step. The Lobby shows a `localhost` dev URL. | `after/buildbay-after-1920x1080.png`, `after/lobby-after-1920x1080.png` |
| U11 Reference match | 2 | **Title:** a clear improvement, but the rocket is small and reads dark slate rather than ceramic white. **Lobby:** a UI over orbit, nothing like frame 06's mood. **Build Bay:** a programmer-art pad under dense panels; an outsider would pick out the gap against frame 02 at once. | `title_vs_frame01.png`, `lobby_vs_frame06.png`, `buildbay_vs_frame02.png` |
| M8 Lighting and render | 2 | Navy shadows are no longer crushed, which is better than before. Still missing: an HDRI sky (no sun, no clouds), a visible warm rim on the vehicle, wet reflective ground and practical light pools. The Title vehicle's white shell renders blue-grey. | `after/buildbay-beauty-no-ui-after-*.png`, `after/buildbay-complete-vehicle-beauty-*.png`, `before/buildbay-beauty-no-ui-before-*.png`, `after/title-after-*.png` |

## Below 4

**U2 Layout and rhythm (3)**
- **Build Bay, Readiness panel, bottom (y ≈ 1020–1035):**
  - The list overflows the panel.
  - The "Data budget" and "Entry speed rating" rows are cut off.
  - Only glyph fragments are visible at the bottom edge in `after/buildbay-after`, `-highcontrast` and `-reducedmotion`.
- **Build Bay, vote panel, third option card (y ≈ 940–965):**
  - "Kerolox Staged-Comb…" is sliced horizontally through the text.
  - In the payload-fairing captures, the "Drawbacks" row of option C is sliced the same way.
- **Build Bay, centre column:**
  - The C1 contract card, the rehearsal banner, the phase pills and the 4 tool buttons sit over the scene and crowd the hardware.
  - The 900 × 245 timeline strip covers the bottom of the pad.
  - The middle 52 % does not read as "lit hardware first" (VISUAL_TARGET 3.2).

**U3 Colour and contrast (3)**
- **`contrast.md`:** values are computed from token colours composited over an assumed glass. Rule 3.2 says "measure over the worst background frame". Sampling the real captures shows opaque Console under every side panel, so the glass column describes a state that never ships.
- **No measurement of the translucent centre chips:**
  - These are the C1 card, the rehearsal banner, the phase pills and the tool buttons.
  - In the captures they are the only surfaces that are not Console (sample at 860,250 = #1F2031 over the sky).
  - No row covers them.
- **Vote cards (x 1460–1840):**
  - Every "If chosen" delta and every "Drawbacks" row uses Fails-red fill or border, whatever the status.
  - Red loses its meaning as "Fails", and the panel reads as an error list.

**U4 Surfaces (2)**
- **Glass is never rendered:**
  - Pixel samples inside the Readiness, vote, timeline, Lobby crew, join and settings panels are all exactly #112B40 in `after/*`.
  - They are the same in `webgl-chrome-post-glass-on-1920x1080.png` (on vs off identical at all panel points).
  - `MfGlassPanel` is in the UXML, but the opaque fallback is always active: blurred copy missing or stale, or the Mobile tier.
  - The "flat boxes with thin borders" item on the before/after checklist is therefore still open.
- **Specimen "Surfaces" column:**
  - The "Glass panel e2" panel looks like an opaque card.
  - Its label wraps a lone "%" onto a third line.
  - The four "e1–e4" elevation swatches (Tokens column) show no visible difference in shadow.
- **Blur cost:** stated as not verified in README (accepted as honest, but the step 5 budget is unproven).

**U6 Data visualisation (3)**
- **Build Bay vote panel, y ≈ 380–420:**
  - The "0 of 4 voted" label is followed by a grey full-width bar that repeats "0 of 4 voted".
  - This is a grey stand-in bar, which 3.1 bans. Use the skeleton plus "Waiting for the first vote" from the specimen.
- **WebGL capture, option A card (y ≈ 585):**
  - "If chosen" has nothing after it: an empty row.
- **Timer ring, all Build Bay captures (≈ 1820,245):**
  - A detached diagonal tick sits outside the ring at the bottom right and reads as a glitch.
  - The status glyph is supposed to sit at the arc end.
- **Integration timeline:**
  - The Lead time row is a 16 px stub with no label.
  - The critical path has no solid chevron fill in the idle state.
  - "Deadline 180 days" is printed twice: in the legend and as a red label.
  - No "now" marker is visible on the Build Bay.
  - Budget reads "Spent $52.5 M Left $37.5 M" with no separator between the two figures.
- **Specimen, gauges:**
  - The status glyph overlaps the number in the "1.1 TWR" and "4 s" gauges.
  - "Deadline 170 d" collides with the dotted slack region and the "Now" marker.
  - The Gantt labels truncate to "Lead ti…" and "Integr…".

**U7 Motion (3; code review plus stills, no video available)**
- **What passes:**
  - The tokens in `MfMotion.cs` and `Motion.uss` match 3.1.
  - Reduced motion turns movement into a 150 ms opacity transition, cancels translate and scale, `Pulse` is a no-op, and `CountUp` jumps to the value.
- **Gaps:**
  - `MfMotion.CountUp` is not called by any screen, so KPI numbers do not count up.
  - Only Title, Lobby seats and the timer pulse use the helpers.
  - The `.mf-motion-count` USS uses ease-out-cubic, not ease-out-quart.
  - `.mf-motion-celebrate` uses Unity's `ease-out-back`, whose stock overshoot is about 10 %, above the ≤ 6 % in the token. It is unverified.
  - The screen transition (600 ms) has no evidence.
  - Capture a short video of the Lobby join, a Build Bay vote and a count-up before re-scoring.

**U8 Room readability (3)**
- `buildbay_downscale_33pct.png`:
  - The screen title and the visible KPI numbers pass.
  - The "Meets" and "Marginal" words are about 8 px tall and only just readable.
  - Data budget and Entry speed rating are clipped off-panel, so "every KPI number" fails.
  - The vote option meta lines and the If-chosen chips are unreadable.

**U9 Accessibility modes (2)**
- **Lobby, 200 % text plus RTL:**
  - The Mission settings panel collapses into overlapping text: "Role assignment", "Assist level", "Vote timer" and segment labels are drawn on top of each other.
  - "of 10 seats filled 5" overlaps the seat avatars.
  - The footer "Crew is assembling…" runs over the second seat row.
  - "Waiting for crew" breaks as "Waitin / g for".
  - The Start briefing button overflows the panel bottom.
  - The nav stepper loses every label except "Lobby".
- **Build Bay, 200 % text plus RTL:**
  - The tool buttons collapse to clipped stubs ("X", "R").
  - The rehearsal banner is clipped ("es from 4 rehearsal players").
  - "Inspect" is clipped by its pill.
  - The vote options are reduced to one card.
  - The Gantt labels show "Lead ti…" and "Integr…".
  - The nav stepper loses its labels.
- **Title, 200 % text plus RTL:**
  - The body text sits directly over the rocket model.
- **Title, high contrast:**
  - Identical to the normal capture (0.2 mean diff, only star twinkle).
  - The body text, buttons and credit still sit on starfield and Earth imagery with no opaque surface. That breaks "no imagery behind text".
- **Lobby and Build Bay, high contrast:**
  - Barely distinguishable from normal, because the panels were already opaque.
  - High contrast does not raise boundary or text contrast noticeably beyond the normal mode.

**U10 Polish (2)**
- **Build Bay:**
  - The chips "Launch vehicle propulsion · Recomm…" and "Structures & materials · Recommen…" run past the card's right border (x ≈ 1840).
  - The meta lines are truncated with "…" ("30 d…", "Soot buildu…", "$15.0 M · …", "Ker…").
  - The first vote-phase step shows a bare check circle with no label ("Reveal" missing).
  - The top bar reads "Room  Not open" while a session is live.
- **Lobby join panel:**
  - Shows the dev URL `http://localhost:5173/?room=VVMJ` in a shipped view.
  - "Flight Director" touches the segmented control's right edge.
- **Specimen:**
  - "periwink / le" breaks mid-word.
  - The Nova seat card's role chip is clipped at the bottom.
  - The phase stepper's last item is cut off ("(").
  - Stray orange particle sprites float over the Data column.

**U11 Reference match (2)**
- **Title vs frame 01:**
  - The layout follows the frame.
  - The vehicle occupies about 6 % of the frame against frame 01's hero rocket, and its shell reads dark slate blue rather than ceramic white.
- **Lobby vs frame 06:**
  - Frame 06 is a warm, lit interior. The Lobby is opaque panels over a dark starfield.
  - The mood ("optimistic, calm and expensive") is not carried.
- **Build Bay vs frame 02:**
  - Flat-shaded pad, tower and box building on a featureless navy plane, against frame 02's lit gantry, wet pad and sunset.
  - Panels cover about 75 % of the frame.

**M8 Lighting and render (2)**
- **Build Bay beauty, after:**
  - The sky is a smooth purple-to-orange gradient, with no sun disc, clouds or HDRI detail.
  - The ground is a uniform navy plane with no wet reflection.
  - The pad lamps cast no pools.
  - The vehicle shows no visible 4500 K rim; it is lit flat from the front.
  - Shadows are navy rather than black, a real improvement on `before/`, and whites are not clipped.
- **Title:**
  - The rocket's white shell renders blue-grey; the before shot was lit warm tan, and neither reads as ceramic white.
  - Either the orbit rig's key is too weak or the grade pushes too cool.
  - Frame 01 has a bright ceramic body with a warm rim.

## Notes

- **3D-art scope (T032 and T033, not T031):**
  - The pad, gantry, building and vehicle are still primitive, flat-material programmer art.
  - Much of the U11 and M8 gap is model and material fidelity that this task cannot close alone.
  - Even so, the T031-owned parts (HDRI sky, wet ground material and probe, rim light, grade) are visibly missing, so M8 stays at 2 on T031's own scope.
- **Performance passes:** WebGL median 59.9 fps during assembly with post and glass on and off, vsync-capped. But the glass did not visibly render in the "on" capture, so the "on" number may not include a working glass pass. Re-measure once glass is confirmed on screen.
- **Before → after is a large improvement:**
  - Typography, iconography, the phase stepper, the status component, the seat cards and the specimen system are genuinely good.
  - The Title and Lobby are the closest to shippable.
  - The remaining blockers are concentrated in the Build Bay overflow, the missing glass and the accessibility layouts.
- **Report this task under "Not verified / failing":**
  - Per VISUAL_TARGET section 6, any item below 4 blocks a claim of done.
  - Below 4: U2, U3, U4, U6, U7, U8, U9, U10, U11 and M8.
