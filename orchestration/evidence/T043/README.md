# T043: phone accessibility audit and fixes (design section 16)

## What was measured, and how

| Item | How | Where |
|---|---|---|
| axe-core 4.10 (`@axe-core/playwright`, MIT), tags `wcag2a/2aa/21a/21aa/22aa/best-practice`, on 33 screens and sheets of the scripted mock session (`?mock=1`) | `client/e2e/a11y/axe-session.spec.ts`; 6 configurations: English and Arabic (RTL) × default, high contrast, 200 % text | `axe-before/`, `axe-after/` (one JSON per configuration), `axe-summary.md` |
| Touch targets under 44 × 44 CSS px | same spec, every visible button, tab, switch, link and input on every screen | `smallTargets` in each JSON |
| Contrast of the theme tokens (text 4.5:1, large text and UI 3:1), default and high-contrast | `contrast.mjs`, reads `client/src/theme/tokens.css`; 108 pairs | `contrast-before.md`, `contrast-after.md` |
| Contrast of rendered text that axe cannot resolve (gradient / image backgrounds, "incomplete") | same spec: text colour against the darkest and lightest surface it can sit on, ink text against its solid fill | `contrastSamples` in each JSON (about 250 to 550 elements per configuration) |

Re-run: `cd client && A11Y_PHASE=after npx playwright test e2e/a11y` (about 27 minutes for all six; the
spec fails on any serious or critical axe violation or any target under 44 px, except the minigame play
surface). `node orchestration/evidence/T043/summarize.mjs` rebuilds `axe-summary.md`.

## Result (violating nodes by impact, summed over the screens of one session)

| Configuration | Before (crit / serious / moderate) | After |
|---|---|---|
| English, default | 4 / 47 / 19 | 0 / 0 / 0 |
| English, high contrast | 4 / 48 / 19 | 0 / 0 / 0 |
| Arabic, default | 4 / 47 / 19 | 0 / 0 / 0 |
| Arabic, high contrast | 4 / 48 / 19 | 0 / 0 / 0 |
| English, 200 % text | could not be measured: the session could not be driven (see below) | 0 / 0 / 0 |
| Arabic, 200 % text | not run before (same blocker) | 0 / 0 / 0 |

Targets under 44 px: not measured before; the first "after" pass found six elements under 44 px (small buttons 40 px,
console tabs 40 px, card dots 36 px); none remain. Contrast: axe reported no `color-contrast`
violation before or after; the token table had 3 failures before, 0 after; sampled rendered text has
0 failures after.

## What was fixed (all inside `client/src/screens/`, `client/src/ui/`, `client/src/theme/`)

- **Dialog names (serious, `aria-dialog-name`)**: every bottom sheet (part viewer, pings, codex, codex
  entry, settings) now names itself from its title (`aria-labelledby`, `ui/kit.tsx`).
- **Invalid ARIA (critical `aria-allowed-attr`, serious `aria-prohibited-attr`)**: `aria-pressed` removed
  from console `role=tab` buttons (selection stays on `aria-selected`, which the CSS already used); the
  room code is a `role=group`; the debrief score uses a screen-reader-only label instead of `aria-label`
  on a paragraph.
- **Keyboard**: every `.screen__scroll` region is focusable (`tabIndex=0`, ring drawn inside the region)
  so overflowing screens can be scrolled without a pointer.
- **Structure**: role cards use `h2` (was `h3` under `h1`); the console and the minigame play view now have
  a level-one heading (console: screen-reader-only "Mission view"; minigame: its name); "Did you know" is
  a `role=note` instead of a nested `aside`; the tag bar is a `role=group` (it repeated a landmark label).
- **Announcements**: the vote result (winner and method) and the GO / NO-GO result are announced through a
  polite live region that is mounted empty and filled afterwards (`Announce` in `ui/kit.tsx`); every
  countdown now announces the time left once at 10 s and once at 5 s. Existing live regions (alerts,
  toasts, ballot line, connection, blackout, pings, pause) were already in place and are unchanged.
- **Contrast (tokens.css)**: `--line-strong` `#3f6d8a` → `#5f8fac` (control outlines were 2.1:1 to 2.6:1,
  now at least 3.4:1); `--text-faint` `#8ea5b5` → `#93aab9` (4.49:1 → 4.5:1 or more on glass over a bright
  cloud). The palette and look are otherwise unchanged.
- **Touch targets**: card-position dots 36 → 44 px; `.btn--sm` and segmented options 40 → 44 px.
- **200 % text, vote screen (real defect found by the new spec)**: at 150 % and above the header, hint,
  banners and action bar left the part card about 9 px tall, so its stats and viewer could not be reached
  (the spec could not click them). The stage now scrolls and the card keeps at least 420 px; the action
  bar wraps so "Veto" is no longer clipped (`vote.css`, scoped to `[data-text-scale='large']`).

## What remains

- **Not audited by axe**: only the screens the mock session reaches. Pilot, co-pilot, spectator and profile
  screens were audited for text, targets and RTL in T030 (`orchestration/evidence/T030/`) but are not part of
  this axe run. Real device screen readers (TalkBack, VoiceOver) were not available: live-region behaviour is
  verified by markup, not by listening.
- **Large text**: at 200 % the vote stage scrolls as a whole, so the Cast button is below the fold while
  reading a card. Acceptable, but a sticky action bar would need a layout redesign.
- Axe "incomplete" contrast on gradient backgrounds is covered by the sampling above, not by axe itself;
  the sampling ignores opacity animations and the 3D backdrop.
- `:has()` is used for the large-text vote layout (Chrome 105+, Safari 15.4+, Firefox 121+); older browsers
  keep the previous (collapsed) layout.

## Minigame issues (reported, not changed: minigame code is out of scope)

- Only MG-08 (throttle lever) is reached by the mock session, so it is the only minigame canvas covered by
  axe here. Its play view had `page-has-heading-one` and the shared room-code `aria-prohibited-attr`; both
  are fixed in the screen shell, not in the minigame. No axe violation remains on its play view.
- The other 30 minigames were **not** audited: their canvas labels, keyboard operation, one-button and
  relaxed modes are specified through each minigame's `aria()` / `role` / `labelKey` hooks (see
  `client/src/minigames/*/index.ts`) but nobody has measured them. Suggested follow-up: a per-minigame
  axe + keyboard pass with `?mock=1` and a forced minigame id.
