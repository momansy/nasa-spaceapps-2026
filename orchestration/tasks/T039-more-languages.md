# T039 — Spanish, French and Portuguese localization

**Worker:** a coding worker (`momansy-claude`) · **Owns:** `data/strings/es*.json`, `fr*.json`, `pt*.json` (create), `client/src/i18n/strings/es.*`, `fr.*`, `pt.*` (create), the language list in `client/src/i18n/`, `orchestration/evidence/T039/`

Design section 16 lists Spanish, French and Portuguese among the planned languages; Arabic is done (T037, PR #134), and its structure is the model: follow `client/src/i18n/` and the Arabic files exactly, and the validator's translation handling in `tools/validate-data.mjs`.

Steps per language, in the order Spanish, French, Portuguese (finish and check one before the next): translate all interface strings and all game-content strings (about 3,700 keys), keep part proper names, unit symbols and IDs untranslated, keep facts accurate and at most 25 words in a respectful tone (design 12.1), audience students aged 12–18; add the language to the selector; then `node tools/validate-data.mjs --strict`, `npx vitest run` (the every-key test must cover the new languages) and `npm run build`; capture join, part card, console and debrief at 390×844 into `orchestration/evidence/T039/<lang>/` and check for clipping (these languages run longer than English).

Do not edit English or Arabic strings or layout code; report layout breakage as a defect with a screenshot.
