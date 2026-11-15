# axe-core report, before and after (violating nodes by impact)

Nodes are counted per screen, so the same element on two screens counts twice. "n/a" = that run could not complete (see README).

| Configuration | Phase | Screens | critical | serious | moderate | minor | targets < 44 px |
|---|---|---|---|---|---|---|---|
| en-default | before | 33 | 4 | 47 | 19 | 0 | not measured |
| en-default | after | 33 | 0 | 0 | 0 | 0 | 0 |
| en-contrast | before | 33 | 4 | 48 | 19 | 0 | not measured |
| en-contrast | after | 33 | 0 | 0 | 0 | 0 | 0 |
| en-text200 | before | n/a | n/a | n/a | n/a | n/a | n/a |
| en-text200 | after | 33 | 0 | 0 | 0 | 0 | 0 |
| ar-default | before | 33 | 4 | 47 | 19 | 0 | not measured |
| ar-default | after | 33 | 0 | 0 | 0 | 0 | 0 |
| ar-contrast | before | 33 | 4 | 48 | 19 | 0 | not measured |
| ar-contrast | after | 33 | 0 | 0 | 0 | 0 | 0 |
| ar-text200 | before | n/a | n/a | n/a | n/a | n/a | n/a |
| ar-text200 | after | 33 | 0 | 0 | 0 | 0 | 0 |

## Distinct rules violated, before

- aria-allowed-attr (critical): console-countdown, console-alert
- aria-dialog-name (serious): part-viewer, pings, codex, codex-entry, settings
- aria-prohibited-attr (serious): lobby, role-card, briefing, vote-reveal, predict, predict-result, part-card, stat-explain, …
- heading-order (moderate): role-card
- landmark-complementary-is-top-level (moderate): predict-result, part-card, stat-explain, part-card-warnings, part-viewer, vote-cast
- landmark-unique (moderate): predict-result, part-card, stat-explain, part-card-warnings, part-viewer, vote-cast, veto-flash, veto-confirm, …
- page-has-heading-one (moderate): console-countdown, console-alert, minigame-play
- scrollable-region-focusable (serious): role-card, build, debrief, codex, codex-entry, settings, minigame-result

## Distinct rules violated, after

_none_

## Targets under 44 x 44 CSS px, after

_none outside the minigame play surface_
