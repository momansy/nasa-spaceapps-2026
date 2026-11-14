# T031 contrast, measured on the captured frames (WCAG 2.x)

Date: 2026-11-14 (run 3); table re-measured 2026-11-15 (run 4). Thresholds (VISUAL_TARGET 3.2): 4.5:1 for body and label text, 3:1 for text >= 24 px
semibold and for component boundaries.

## Method (replaces the run-2 table)

The run-2 table composited token colours in sRGB over an assumed glass that never rendered (the glass bug). This table
is measured on the final 1920 x 1080 captures in this folder with `measure_contrast.py` and the boxes in
`contrast_regions.json`:

- each box is cut into 24 x 24 px tiles (16 px in padding strips); the per-channel median of a tile is the background
  under any text in it; the **worst background** is the 90th-percentile brightest tile;
- whole-panel boxes are conservative: their brightest tiles can be UI fills (bar tracks, the Ocean role chip, segment
  tracks) that no Muted text sits on. Narrow boxes in the panel padding strip measure the glass itself;
- `python measure_contrast.py contrast_regions.json out.md` (Pillow) reproduces the table.

## What the measurement changed

- **UI Toolkit blends in linear colour space.** The glass tint "Console 80 %" therefore covered far less than 80 %
  perceptually: over the bright Build Bay sunset the readiness glass measured #856C59 and Muted text 2.8:1, Fails red
  2.2:1. The glass tint moved to **Console 92 %** (new token `console-92`; 92 % linear over white equals a 72 % sRGB
  tint, inside VISUAL_TARGET's 72-80 %). A 90 % pass still left Muted at 4.4:1 on the brightest vote-panel glass.
- Scrims (`.mf-scrim-text`, the Build Bay contract/phase/tool/rehearsal chips) moved from Space 80 % to **Space 92 %**:
  the Title imagery credit (Muted) measured 3.2:1 over clouds at 80 %.
- Tool shortcut keys moved from Muted to Ceramic (3.9:1 over the sky behind the chip).
- The winner option card lost its Sunlight 16 % fill (Ceramic on it measured 4.3:1 in WebGL); it keeps the 3 px
  Sunlight border and the award icon.

## Final table

Re-measured 2026-11-15 (run 4) on the recaptured set with the same boxes and script.

| Surface (capture, box) | Worst bg | Ceramic body and labels (needs 4.5:1) | Muted secondary text (needs 4.5:1) | Signal ghost delta (24 px bold) (needs 3.0:1) | Meets word (24 px bold) (needs 3.0:1) | Marginal word (24 px bold) (needs 3.0:1) | Fails word (24 px bold) (needs 3.0:1) |
|---|---|---|---|---|---|---|---|
| Build Bay readiness panel (glass) (`buildbay-after-1920x1080.png` [76, 210, 460, 1030]) | #535C66 | 5.8:1 pass | 3.9:1 **FAIL** | 3.3:1 pass | 3.9:1 pass | 4.7:1 pass | 3.1:1 pass |
| Build Bay vote panel (glass) (`buildbay-after-1920x1080.png` [1462, 140, 1842, 960]) | #55616C | 5.4:1 pass | 3.7:1 **FAIL** | 3.1:1 pass | 3.6:1 pass | 4.4:1 pass | 2.9:1 **FAIL** |
| Build Bay timeline strip (glass) (`buildbay-after-1920x1080.png` [536, 860, 1384, 1040]) | #414C59 | 7.5:1 pass | 5.0:1 pass | 4.3:1 pass | 5.0:1 pass | 6.1:1 pass | 4.0:1 pass |
| Build Bay contract chip (scrim over sky) (`buildbay-after-1920x1080.png` [516, 120, 880, 248]) | #222D3F | 11.8:1 pass | 8.0:1 pass | 6.8:1 pass | 7.9:1 pass | 9.6:1 pass | 6.3:1 pass |
| Build Bay rehearsal banner (scrim over sky) (`buildbay-after-1920x1080.png` [654, 270, 1038, 306]) | #3A383E | 9.9:1 pass | 6.7:1 pass | 5.6:1 pass | 6.6:1 pass | 8.0:1 pass | 5.3:1 pass |
| Build Bay tool chips (scrim over sky) (`buildbay-after-1920x1080.png` [1262, 274, 1362, 304]) | #463A30 | 9.4:1 pass | 6.3:1 pass | 5.4:1 pass | 6.2:1 pass | 7.6:1 pass | 5.0:1 pass |
| Build Bay vote panel, WebGL (glass over sunset) (`webgl-chrome-post-glass-on-1920x1080.png` [1462, 140, 1842, 960]) | #2C6887 | 5.2:1 pass | 3.5:1 **FAIL** | 3.0:1 **FAIL** | 3.5:1 pass | 4.2:1 pass | 2.8:1 **FAIL** |
| Build Bay readiness, high contrast (`buildbay-highcontrast-1920x1080.png` [76, 210, 460, 1030]) | #535D67 | 5.7:1 pass | 3.9:1 **FAIL** | 3.3:1 pass | 3.8:1 pass | 4.7:1 pass | 3.1:1 pass |
| Lobby crew panel (glass) (`lobby-after-1920x1080.png` [100, 140, 1236, 1020]) | #364251 | 8.7:1 pass | 5.9:1 pass | 5.0:1 pass | 5.8:1 pass | 7.1:1 pass | 4.7:1 pass |
| Lobby settings panel (glass) (`lobby-after-1920x1080.png` [1268, 430, 1820, 1020]) | #535960 | 6.0:1 pass | 4.1:1 **FAIL** | 3.5:1 pass | 4.0:1 pass | 4.9:1 pass | 3.2:1 pass |
| Title pitch text (over starfield) (`title-after-1920x1080.png` [90, 720, 780, 850]) | #001027 | 16.2:1 pass | 11.0:1 pass | 9.3:1 pass | 10.8:1 pass | 13.2:1 pass | 8.7:1 pass |
| Title imagery credit (scrim over Earth) (`title-after-1920x1080.png` [884, 1006, 1820, 1034]) | #42454A | 8.2:1 pass | 5.5:1 pass | 4.7:1 pass | 5.5:1 pass | 6.7:1 pass | 4.4:1 pass |
| Title, high contrast (opaque panel) (`title-highcontrast-1920x1080.png` [90, 720, 780, 850]) | #112B40 | 12.4:1 pass | 8.4:1 pass | 7.1:1 pass | 8.3:1 pass | 10.1:1 pass | 6.6:1 pass |
| Build Bay readiness glass, padding strip (`buildbay-after-1920x1080.png` [54, 220, 74, 1030]) | #4B4546 | 8.0:1 pass | 5.4:1 pass | 4.6:1 pass | 5.3:1 pass | 6.5:1 pass | 4.3:1 pass |
| Build Bay vote glass, padding strip (`buildbay-after-1920x1080.png` [1846, 140, 1866, 1030]) | #514D48 | 7.2:1 pass | 4.8:1 pass | 4.1:1 pass | 4.8:1 pass | 5.8:1 pass | 3.8:1 pass |
| Build Bay timeline glass, padding strip (`buildbay-after-1920x1080.png` [517, 830, 535, 1040]) | #102A3F | 12.6:1 pass | 8.5:1 pass | 7.2:1 pass | 8.4:1 pass | 10.2:1 pass | 6.7:1 pass |
| WebGL vote glass, padding strip (`webgl-chrome-post-glass-on-1920x1080.png` [1846, 140, 1866, 1030]) | #37303F | 10.8:1 pass | 7.3:1 pass | 6.2:1 pass | 7.2:1 pass | 8.8:1 pass | 5.8:1 pass |
| Lobby settings glass, padding strip (`lobby-after-1920x1080.png` [1796, 440, 1816, 1010]) | #10293F | 12.7:1 pass | 8.6:1 pass | 7.3:1 pass | 8.4:1 pass | 10.3:1 pass | 6.8:1 pass |

Failing cells: 8.

## Reading the failing cells

Every failing cell is a whole-panel box whose 90th-percentile tile is a UI fill, not a text background:

| Row | Verdict |
|---|---|
| Build Bay readiness panel (whole box), Muted 3.9:1 | **UI fill.** The high-contrast capture, whose panel is opaque Console, measures the same #535D67: it is the bar track. The readiness padding strip (the glass itself) passes every style. |
| Build Bay vote panel WebGL (whole box), #2C6887 | **UI fill**: the Ocean role chip, whose text is Ceramic (5.2:1, pass). The WebGL vote padding strip passes every style. |
| Lobby settings panel (whole box), Muted 4.1:1 | **UI fill**: the segmented-control track. The settings padding strip passes every style. |
| Build Bay vote panel (whole box, run 4), #55616C: Muted 3.7:1, Fails 2.9:1 | **UI fill**: the 90th-percentile tiles are the timer ring's Ceramic-10 % track (x 1806-1838, y 152-160), which is visible in the run-4 idle capture, and the drawback strip fill. No Muted or Fails text sits on them (the drawback text is Ceramic, 5.4:1). The vote padding strip, which is the glass itself, passes every style. |

Result: every text style passes over every measured glass and scrim background.

## Filled elements (unchanged, token colours)

| Element | Ratio |
|---|---|
| Primary button: Space on Ceramic | 15.7:1 |
| Selected segment: Space on Ceramic | 15.7:1 |
| LIVE tag, critical Gantt label: Space on Signal | 9.0:1 |
| Contract ID tag, letter key B: Space on Sunlight | 12.6:1 |
| Role chip: Ceramic on Ocean | 5.3:1 |
| Letter key C: Space on Periwinkle | 9.2:1 |
| Letter key D: Space on Rose | 9.8:1 |

Focus rings are 3 px Signal (7.1:1 on Console).
