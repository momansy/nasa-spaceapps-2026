# T057 — Translate the host pre-flight strings (T027) into ar, es, fr, pt, hi

**Worker:** a coding worker (`mohammed-alainieh`) · **Owns:** `data/strings/{ar,es,fr,pt,hi}.host_preflight.json` (create), `orchestration/evidence/T057/` · **Deadline: PR open by 11:30 UTC**

T027 (PR #231) added `data/strings/en.host_preflight.json` (about 197 keys: briefing, contract vote, test
stand, design reviews, FRR, countdown). Do exactly what you did for the end screens in #213 / PR #220
(`*.host_end.json`): same conventions, placeholders untouched, SI units in Latin script, Modern Standard
Arabic for students aged 12–18, reuse the game's existing terms from the other `data/strings/<lang>*.json`
files so the big screen and phones say the same thing. Run `node tools/validate-data.mjs --strict` and the
i18n parity tests; fix every report. Evidence: validator output and a short note on any key left in English
on purpose. PR title "T057: host pre-flight strings in 5 languages".
