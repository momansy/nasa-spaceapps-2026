# T039 — Spanish, French, Portuguese (pt-BR)

Each language: 3,670 keys (same as English), 17 files (5 in `data/strings/`, 12 in `client/src/i18n/strings/`).

Checks (all run on this branch):
- `node tools/validate-data.mjs --strict`: PASS, 0 errors, 4 existing warnings (unreferenced `dashboard.stability.*` English keys).
- `npx vitest run` in `client/`: 906 passed (parity test now covers ar, es, fr, pt: same keys, same `{placeholders}`, no empty text, Western digits).
- `npm run build` in `client/`: OK.
- `LANGS=es|fr|pt npx playwright test session-lang`: scripted mock session at 390x844; no missing strings, no console errors, no horizontal overflow on join and role card. Screenshots (join, lobby, role card, briefing, part card, warnings, vote result, console countdown/alert, debrief, awards, settings) are in `es/`, `fr/`, `pt/`.

Conventions: tú (es), tu (fr), você (pt-BR). Bibliographic `fact.*.source` titles, part `twin` names, units and IDs stay in English. Decimals keep ".", as in English.

Known limits: English `fact.F02/F09/F13/F15/F25/F31.detail` already exceed 25 words, and the translations of F09 and F31 `.detail` do too (not trimmed, English untouched). Spanish mixes some Spain and Latin-American forms ("pulsa"/"presiona", "cuenta atrás"/"cuenta regresiva"). Portuguese uses "cartões" and "cartas" for cards. No native-speaker review has been done.
