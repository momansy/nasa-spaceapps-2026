# T041 — Language polish and Hindi

**Worker:** a coding worker (`momansy-claude`) · **Owns:** `data/strings/es*.json`, `fr*.json`, `pt*.json`, `hi*.json` (create), `client/src/i18n/strings/es.*`, `fr.*`, `pt.*`, `hi.*` (create), the language list in `client/src/i18n/`, `orchestration/evidence/T041/`

Follow the structure of T037 (Arabic) and T039 (Spanish, French, Portuguese, PR #145).

1. **French typography:** non-breaking spaces (U+202F narrow or U+00A0) before `:`, `;`, `!`, `?`, `»` and after `«`, per French convention; check that the client renders them without odd breaks.
2. **Spanish consistency:** pick one register (neutral Latin-American Spanish for students; use "ustedes", avoid "vosotros") and make every string consistent; note the choice in `orchestration/evidence/T041/README.md`.
3. **Portuguese:** check consistency (Brazilian Portuguese) the same way.
4. **Hindi** (design 16): translate all interface and game-content strings (about 3,700 keys) in Devanagari, audience students aged 12–18, keep part proper names, unit symbols and IDs in Latin script, facts accurate and at most 25 words, respectful tone; add Hindi to the language selector; make sure the bundled fonts (or a system fallback) render Devanagari and note which.
5. Checks: `node tools/validate-data.mjs --strict`, `npx vitest run` (every-key test covers Hindi), `npm run build`, the language e2e spec (`client/e2e/session-lang.spec.ts`) for French and Hindi with screenshots of join, part card, console and debrief at 390×844 in `orchestration/evidence/T041/`; look at them for clipping and broken glyphs.

Do not edit English or Arabic strings or layout code; report layout breakage as a defect with a screenshot.
