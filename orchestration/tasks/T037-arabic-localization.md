# T037 — Arabic localization (phone client and game data strings)

**Worker:** a coding worker (`mohammed-alainieh`) · **Owns:** `data/strings/ar*.json` (create), `client/src/i18n/strings/ar.*.json` (create), the language list and loader wiring in `client/src/i18n/`, the language option in the phone settings sheet, `orchestration/evidence/T037/`

Design section 16 requires localization-ready strings with right-to-left support and lists
Arabic among the planned languages. English is split across `data/strings/en*.json` (game
content: parts, contracts, minigames, facts, roles, pings, ...) and
`client/src/i18n/strings/en.*.json` (interface text). The client already supports a language
switch and RTL layout (screenshots at 200 % + RTL exist).

## Steps, in order

1. Read `data/README.md` (string conventions), `client/README.md` and `client/src/i18n/`.
   Inventory every English key (expect a few thousand). Note keys with placeholders
   (`{n}`, units) and keys that must not be translated (IDs, units, part model names that are
   proper nouns — keep "Kerolox Workhorse"-style part names in English with an Arabic
   descriptor only where the English is a common noun).
2. Translate the interface strings first (`client/src/i18n/strings/ar.*.json`, mirroring each
   `en.*` file), then wire Arabic into the language list and the settings sheet so it can be
   chosen; the document direction must switch to `rtl`.
3. Translate the game-content strings in batches by file (`data/strings/ar.json` for
   `en.json`, `ar.parts_a.json` for `en.parts_a.json`, and so on), keeping facts accurate and
   at most 25 words, respectful in tone (design 12.1). Use Modern Standard Arabic suitable for
   students aged 12–18; keep SI unit symbols (km/s, kN, t, $M) in Latin script with correct
   bidi isolation; use Western digits unless the existing number formatter localizes them.
4. The data validator treats non-English string files as translations: run
   `node tools/validate-data.mjs --strict` (npm install in `tools/` first) and resolve every
   missing-translation or unknown-key report for Arabic.
5. Client checks: `npm ci && npx vitest run && npm run build` in `client/`; add a unit test
   that every `en.*` key has an `ar.*` counterpart; run the session Playwright spec with
   Arabic selected and capture screenshots of join, role card, part card, console and debrief
   into `orchestration/evidence/T037/`. Look at them: no clipped text, correct mirroring,
   numbers and units reading correctly inside Arabic sentences.
6. Do not edit English strings, screens' layout code or minigame code; if a layout breaks in
   Arabic, report it as a defect with a screenshot.

## Acceptance

Arabic selectable on the phone; 100 % of interface and game-content keys translated
(validator clean); tests and build green; screenshots reviewed with no clipping or bidi
errors, or each issue listed as a defect.
