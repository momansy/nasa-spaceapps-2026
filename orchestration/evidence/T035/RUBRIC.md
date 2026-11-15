# T035 rubric: host UI polish (U2, U9, U10, item 4)

- **Reviewer:** independent subagent. It did not build this UI and scored it from the captures and the staged diff, without the builder's notes.
- **Date:** 2026-11-15. This re-scores only the items T035 was asked to fix: U2, U9, U10 and item 4 (Lobby judging-day controls). The other T031 rows (U1, U3 to U8, U11, M8) are not re-scored here.
- **Bar:** `orchestration/VISUAL_TARGET.md` section 6. A score of 4 means shippable: an outsider would not pick out the difference in quality. Nothing ships below 4. The T031 `RUBRIC.md` "Below 4" lists for U2, U9 and U10 were used as the defect checklist.
- **Method:**
  - Viewed every PNG in `before/`, `after/` and `accessibility/` at 1920 × 1080 and compared each before/after pair.
  - Zoomed crops (ImageMagick, 3-5x) of the vote-panel scroll mask, the Readiness scroll mask, the Lobby nav connector and the Mission success band cap.
  - Pixel positions are read from the images and are approximate (about ±5 px).
  - Code review of `git diff --cached`: `LobbyScreen.cs`, `Lobby.uxml`, `Lobby.uss`, `Tests/EditMode/LobbySettingsPatchTests.cs`, and the protocol field ranges in `protocol/messages.md` (`inspectTimerS` 5 to 60, `audienceVoteWeight` 0 to 1) and `RoomModels.cs` (`SettingsPatchDto`).
  - Unity was not run and the EditMode tests were not executed. The test file was read only.

| Item | Score (1-5) | One-line reason | Evidence file(s) |
|---|---|---|---|
| U2 Layout and rhythm | 4 | Vote-stage strip is on one line. Readiness ends at x about 459 and the vote panel starts at about 1461 (both outside the 461 / 1459 lines). The timeline is shorter and starts at y 845, so the pad base is visible. | `after/buildbay-after-1920x1080.png`, `after/buildbay-assembly-after-1920x1080.png`, `after/buildbay-vote-after-1920x1080.png` (vs `before/*`) |
| U9 Accessibility modes | 3 | Real gains (Lobby RTL, Title scrim and button scaling, Gantt labels, LIVE chip gap), but at 200 % + RTL the Build Bay still drops content, splits "need 9,700 / m/s", slices text, and the Lobby settings stay off-screen. | `accessibility/buildbay-text200-rtl-*`, `accessibility/buildbay-vote-text200-rtl-*`, `accessibility/lobby-text200-*`, `accessibility/title-text200-*` |
| U10 Polish | 3 | Fixed: chip slice, "If chosen" on the winner, specimen labels, "5 s" threshold label. Still open: one half-cut meta line under the vote scroll fade, the hollow Mission success band cap, the "GB/ day" unit split and the Lobby nav connector touching the pill. | `after/buildbay-assembly-after-*`, `after/buildbay-after-*`, `after/lobby-after-*`, `after/design-system-specimen-*` |
| Item 4 Lobby judging-day controls | 4 | "Inspect timer" (5, 10, 20, 30, 60 s), "Audience counts as one player" (Off / One player = 0 / 1) and a 10 s vote-timer segment are present, styled with the design system and wired to `settings.set` with range-checked patches and unit tests. | `after/lobby-after-1920x1080.png`, `accessibility/lobby-highcontrast-1920x1080.png`, `LobbyScreen.cs`, `Lobby.uxml`, `LobbySettingsPatchTests.cs` |

## Below 4

**U9 Accessibility modes (3)**
- **Build Bay, 200 % text plus RTL (`accessibility/buildbay-text200-rtl-1920x1080.png`):**
  - **Content still dropped:**
    - the contract objective text ("Primary: Reach sun-synchronous orbit...") is hidden: the card shows only "Earth Watch C1" (585-1335, 212-292);
    - the "REHEARSAL" banner is gone;
    - the four tool chips show only the key and the icon, with no "Compare / Exploded / Scale / Stability" labels (685-1235, 483-543);
    - the Gantt shows only two tick labels ("210 days", "120") (610-830, 875-905), so 30, 60, 90, 150 and 180 are not readable. The ticks themselves are drawn.
  - **Number split from its unit:** "need 9,700" / "m/s · +0.2 %" (1385-1615, 585-675). This is the same defect T031 listed.
  - **Text sliced by scroll masks:** "Upper stage TWR": the "TWR" line is half cut (1580-1685, 990-1008). In `accessibility/buildbay-text200-rtl`, "$1.2 M · 30 days ·" is half cut (95-520, 985-1010). In `accessibility/buildbay-vote-text200-rtl`, "Drawbacks: Only small" is cut at the panel foot (90-520, 940-1005).
  - **Overlap:** in `accessibility/buildbay-vote-text200-rtl`, the tool chips (685-1235, 420-478) overlap the bottom edge of the phase strip (584-1336, 300-432). The timer ring's error badge touches the digit "3" (160-185, 232-252).
  - **Touching:** "connected" and its check mark in the Title RTL status chip have a gap of about 3 px (1765-1805, 970-1005 in `accessibility/title-text200-rtl`).
- **Lobby, 200 % text (`accessibility/lobby-text200-1920x1080.png` and `-rtl-`):**
  - **Controls off-screen.** The Mission settings controls are still not visible: the capture shows only "Mission settings", "Host only" and "Role assignment" (1065-1795, 697-1025; RTL 97-830, 697-1025). They are scrollable, but nothing in the capture shows that. The side column now has six settings rows, so it needs even more scrolling.
  - **Wordmark collision.** "Room" touches the "LOBBY" wordmark (LTR 482-490, 40-85; RTL 1435-1443, 40-85), a gap of about 5-7 px.
  - **"No role yet" overruns its chip.** The text runs into the chip's left border in RTL (915-925, 830-880 and 1209-1215, 830-880 and 1503-1509, 830-880).
  - **Scrollbars are unstyled grey** (845-868, 235-1000; 1787-1800, 260-975; LTR 1812-1835, 235-1000).
- **Title, 200 % text plus RTL (`accessibility/title-text200-rtl-1920x1080.png`):** passes the body-text-off-the-limb check (the scrim at 72-972 x 270-925 ends where the limb starts) and the buttons now scale. One alignment miss: the logo and tagline end at x about 870 while the body text ends at 940.
- **Not captured:** there is no Build Bay 200 % capture in left-to-right, so LTR is unverified.
- **Fixed since T031:**
  - Lobby RTL alignment (headings, room code, setting labels, "5" KPI) is right-aligned.
  - The Title buttons scale (cap height now about 34 px against 20 px).
  - The Title body text sits on a scrim, off the Earth limb.
  - The Gantt labels no longer collide.
  - The "LIVE" chip no longer butts against the "BUILD BAY" wordmark.
  - The Lobby join card no longer takes half the side column.

**U10 Polish (3)**
- **Half-cut line under the scroll fade (`after/buildbay-assembly-after-1920x1080.png`):** option C's meta line "2.40 t · $9.0 M" is visible only as its top half (1498-1632, 853-866). `after/buildbay-vote-after`: a faint sliver of the next card's top edge shows under option B's Concern chip (1520-1750, 855-862). The Readiness fade on "Entry speed rating" (78-300, 980-1005 in `after/buildbay-after`) and "likely" (1510-1555, 890-912) are drawn in full and fade out, which is acceptable.
- **Mission success band cap still reads as a hollow box** (428-437, 738-758 in `after/buildbay-after`; 1470-1486, 425-445 in the specimen).
- **Unit split across lines:** "0.0 GB/" / "day down" (300-422, 935-972 in `after/buildbay-after` and `-assembly-after`). The number and its unit stay together, but the unit "GB/day" breaks at the slash.
- **Lobby nav connector** still touches the right edge of the current "Lobby" pill (514-530, 56 in `after/lobby-after`).
- **Trailing separator:** the vote-card meta wraps after the "·" and leaves it at the end of the line (1780-1795, 427 in `after/buildbay-after`).
- **Specimen (dev scene):** the requirement-marker caps sit directly against their labels ("need 9,700 m/s" 1410-1424, 134-150; "need 1.20" 1380-1392, 245-262). "Development Build" watermark (1805-1915, 1058-1072).
- **Fixed since T031:**
  - The chip sliced through its icon (option B's chip is now whole, with a border).
  - "If chosen" no longer shows on the decided winner.
  - The Readiness bottom row is no longer cut mid-glyph.
  - The specimen "5 s" threshold label is clear of the neighbouring gauge.
  - The specimen labels are current ("Blur + Console 92 %", "1111 / 8888 / −42.5" on one line, "Now" marker).

## Notes

- **U2 detail.**
  - Vote-stage strip: "Reveal · Inspect · Vote · Result" on one line at 1485-1850 x 275-305 (`after/buildbay-after`) and 1485-1850 x 225-255 (`after/buildbay-assembly-after`).
  - Side panels: Readiness 41-459 and vote panel 1461-1879. The gutter to the centre column is about 25 px on each side.
  - Pad base: the launch pad (590-1430, 760-845) is fully visible now. The timeline panel sits directly below it at 845-1063. In `before/buildbay-before` the timeline started at y 798 and covered the pad.
  - Left as a limit for T034, not this task: the rocket is still about 48 × 250 px and the contract card, phase pills, rehearsal banner and tool chips still sit in the middle 52 % at the top. They do not hide hardware, so this is not scored down.
- **Item 4 detail.**
  - Vote timer: 10, 20, 30, 45, 60 s. Inspect timer: 5, 10, 20, 30, 60 s. Audience: "Off" (0) / "One player" (1) under the label "Audience counts as one player". Vote tallies: Open / Hidden.
  - `LobbyScreen.BuildPatch` returns null for out-of-range or unknown values, so an invalid `settings.set` is never sent. Ranges match `protocol/messages.md` (`voteTimerS` 10 to 60, `inspectTimerS` 5 to 60, `audienceVoteWeight` 0 or 1). The server state is read back into the segments (`SelectSegment` for both new fields).
  - The six rows fit the 1080 p side column at 100 % text without scrolling (Mission settings panel 1265-1823 x 377-1025). The join card was compacted to make room (144 px QR, 64 px room code). The row spacing is tight but the labels and segment text stay legible.
  - It scores 4, not 5: the inspect presets are five fixed values, not the whole 5-60 range. That is a game_value choice documented in the code and is fine for judging day. The labels read "Audience counts as one player: Off / One player", which is slightly redundant.
  - The 200 % text layout leaves the new rows off-screen (see U9).
- **Not verified:** the EditMode tests were not run (read only). There is no Build Bay 200 % LTR capture, no motion capture, and no WebGL recapture.
- **Per VISUAL_TARGET section 6, any item below 4 blocks a claim of done.** U9 and U10 are below 4. U2 and item 4 pass.
