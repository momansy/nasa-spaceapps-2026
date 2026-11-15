# T043 — Phone accessibility audit and fixes (design section 16)

**Worker:** a client coding worker (`momansy-claude`) · **Owns:** `client/src/screens/`, `client/src/ui/`, `client/src/theme/` (accessibility fixes only), `client/e2e/a11y/` (create), `orchestration/evidence/T043/`

Design section 16 requires: colour-blind-safe palette with icons and patterns, scalable text to 200 %,
high-contrast mode, screen-reader labels on the phone UI, reduced motion, one-button and relaxed
minigame modes, subtitles and visual cues for audio, and RTL support. Most exist; nobody has measured them.

1. Add `@axe-core/playwright` (free, MIT) to the client dev dependencies and an e2e spec in
   `client/e2e/a11y/` that runs axe on every screen of the mock session (`?mock=1`) in English and
   Arabic, default and high-contrast, and at 200 % text.
2. Measure contrast of text and essential UI against WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI
   components), in default and high-contrast modes; list every failure.
3. Fix the failures inside the owned paths: missing accessible names and roles, focus order and visible
   focus, live-region announcements for vote results, timers and alerts, contrast, touch-target size
   (at least 44×44 CSS px), anything axe reports as serious or critical. Do not change minigame code
   (report minigame issues instead) and keep the visual design (VISUAL_TARGET.md) intact.
4. `npm ci && npx vitest run && npm run build`, the session spec and the new a11y spec green.
5. Evidence: the axe report before and after (counts by impact), the contrast table, and a short
   README of what was fixed and what remains (with the minigame issues listed separately).
