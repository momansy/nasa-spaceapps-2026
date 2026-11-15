# T041 — Language polish and Hindi

## 1. French typography
- `fr*.json` (data and client, 17 files): non-breaking space **U+00A0** before `:`; narrow non-breaking space **U+202F** before `;` `!` `?`, and inside `« »`. 300 values changed (script: `fr-typography.mjs`, idempotent).
- English source titles (`fact.*.source`) are left untouched, as they are English citations.
- Checked in the browser (390×844, `fr/*.png`): `Jumeau réel : RS-25`, `…dense :` and `Bon appel !` stay on one line with their punctuation; no odd breaks, no tofu boxes for U+202F.

## 2. Spanish register (decision)
- **Neutral Latin-American Spanish**, `tú` for a single student (imperatives `Elige`, `Toca`), `ustedes` for plurals; no `vosotros`, `vos` or `usted` forms exist (scan: `scan.mjs`).
- Peninsular wording replaced (92 values, `es-register.mjs`): `fiabilidad`→`confiabilidad`, `fallo`→`falla` (with gender agreement), `pulsar`→`presionar` (matches the existing `mantén presionado`).

## 3. Portuguese
- Already **Brazilian** (`você`, `aperte`, `toque`, `equipe`, `rachaduras`, `confiabilidade`/`falha`); no European forms found.
- The 18 keys that exist in both `data/strings` and the client fragments (the data copy wins at runtime) are now identical in `es`, `fr`, `pt` (`sync-overlap.mjs`), so one wording per key.

## 4. Hindi (`hi`)
- 17 files, 3,688 keys (`data/strings/hi*.json`, `client/src/i18n/strings/hi.*.json`), Devanagari, respectful `आप` with polite `-ें` imperatives. Rules and term list: `hi-glossary.md`.
- Latin script kept for part/mission proper names, role IDs (FLIGHT, BOOSTER…), unit symbols, acronyms, key names and IDs. **Western digits** only (the parity test now also rejects Devanagari digits).
- `fact.*.text`: all ≤ 25 words, no numbers changed (`check-numbers.mjs hi`: 0 real differences; the only hit is "1st-stage" → "पहले चरण").
- Language selector: `availableLanguages()` discovers `hi*` files automatically; it shows **हिन्दी**. No code change was needed.
- **Fonts:** the client bundles no Devanagari font; the font stacks fall back to `system-ui`/`Noto Sans`, and the page sets `lang="hi"`, so the browser picks the system Devanagari face (Nirmala UI on Windows, Noto Sans Devanagari on Android, Devanagari Sangam MN on iOS/macOS). The screenshots in `hi/` were taken on Windows (Nirmala UI) and show correct conjuncts and matras. No tofu boxes.

## 5. Checks
| Check | Result |
|---|---|
| `node tools/validate-data.mjs --strict` | PASS (0 errors, 4 pre-existing "unreferenced" warnings) |
| `npx vitest run` (client) | 46 files, 912 tests pass, incl. every-key parity for `hi` (`vitest-output.txt`) |
| `npm run build` | OK (`hi.content` chunk 103 kB, 22 kB gzip) |
| `LANGS=fr,hi EVIDENCE=T041 npx playwright test session-lang` | 2 passed; no missing strings, no console errors, no horizontal overflow (`e2e-output.txt`) |
| `check-lang.mjs hi` | structural check (keys, placeholders, digits, empty text); 3 "untranslated?" hints are Latin-only names (`Saturn V 110.6 m`, `IMU + GNSS`, `CAPCOM`) kept on purpose |

Screenshots (390×844, device scale 2): `fr/` and `hi/` — 01 join, 02 lobby, 03 role card, 04 briefing, 05 part card, 06 stat explanation, 07 part card warnings, 08 vote result, 09 console countdown, 10 console alert, 11 debrief, 12 debrief awards, 13 settings. Reviewed for clipping and broken glyphs: none found.

## Observations / defects (not fixed: layout code is out of scope)
- Number-plus-unit pairs wrap between the number and the unit in every language (e.g. `$1.2` / `M` in the settings sample). The sample string now uses non-breaking spaces; other strings still use normal spaces.
- The e2e spec's evidence folder is now selectable (`EVIDENCE=T041`, default `T039`) and `hi` is in its default language list.
