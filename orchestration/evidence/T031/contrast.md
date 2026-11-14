# T031 contrast measurements (WCAG 2.x relative luminance)

Date: 2026-11-14. Computed by script from the token colours (`UI/Theme/tokens.json`) composited over the worst
background each surface can show. Glass is the blurred scene behind an e2 panel with the Console tint at **80 %**
(token `console-80`). The worst backgrounds are a sunlit white cloud filling the panel (Title and Lobby Earth) and the
brightest dusk sky near the sun (Build Bay); the blur only averages the scene, so a solid cloud is the upper bound.
Thresholds (VISUAL_TARGET 3.2): 4.5:1 for body and label text, 3:1 for text >= 24 px semibold and component boundaries.
First pass at the proposed 76 % tint: Muted over white cloud measured 4.1:1 (fail) and Fails red in a Ceramic-6 % card
2.8:1 (fail), so the tint moved to 80 % and the inner cards to Space 40 %. The table is the final state.

Composited backgrounds: Console (opaque, high contrast) = #112B40; Glass over dusk sky #F2B36B = #3E4649; Glass over white cloud #F0F4F8 (worst) = #3E5365; Flat card (Space 40 %) in glass over cloud = #283A4A; Scrim Space 80 % over cloud = #36424D.

| Foreground | Needs | Console (opaque, high contrast) | Glass over dusk sky #F2B36B | Glass over white cloud #F0F4F8 (worst) | Flat card (Space 40 %) in glass over cloud | Scrim Space 80 % over cloud |
|---|---|---|---|---|---|---|
| Ceramic body and labels | 4.5:1 | 12.4:1 pass | 8.2:1 pass | 6.8:1 pass | 10.0:1 pass | 8.8:1 pass |
| Muted secondary text (label 24 px) | 4.5:1 | 8.4:1 pass | 5.6:1 pass | 4.6:1 pass | 6.7:1 pass | 5.9:1 pass |
| Signal selection / ghost delta (24 px bold) | 3.0:1 | 7.1:1 pass | 4.7:1 pass | 3.9:1 pass | 5.7:1 pass | 5.0:1 pass |
| Sunlight accent | 3.0:1 | 10.0:1 pass | 6.6:1 pass | 5.5:1 pass | 8.0:1 pass | 7.1:1 pass |
| Meets status word (24 px bold) | 3.0:1 | 8.3:1 pass | 5.5:1 pass | 4.5:1 pass | 6.6:1 pass | 5.8:1 pass |
| Marginal status word (24 px bold) | 3.0:1 | 10.1:1 pass | 6.7:1 pass | 5.5:1 pass | 8.1:1 pass | 7.1:1 pass |
| Fails status word (24 px bold) | 3.0:1 | 6.6:1 pass | 4.4:1 pass | 3.6:1 pass | 5.3:1 pass | 4.7:1 pass |
| Periwinkle series 3 (proposal) | 3.0:1 | 7.3:1 pass | 4.8:1 pass | 4.0:1 pass | 5.9:1 pass | 5.2:1 pass |
| Rose series 4 (proposal) | 3.0:1 | 7.7:1 pass | 5.1:1 pass | 4.2:1 pass | 6.2:1 pass | 5.4:1 pass |

## Filled elements

| Element | Ratio |
|---|---|
| Primary button: Space on Ceramic | 15.7:1 |
| Selected segment: Space on Ceramic | 15.7:1 |
| LIVE tag, critical Gantt label: Space on Signal | 9.0:1 |
| Contract ID tag, letter key B: Space on Sunlight | 12.6:1 |
| Role chip: Ceramic on Ocean | 5.3:1 |
| Letter key C: Space on Periwinkle | 9.2:1 |
| Letter key D: Space on Rose | 9.8:1 |

Focus rings are 3 px Signal: 7.1:1 on Console and 3.9:1 on glass over cloud (>= 3:1 boundary rule).

Result: every row passes.
