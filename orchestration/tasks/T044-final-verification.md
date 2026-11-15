# T044 — Pre-submission verification sweep

**Worker:** a coding worker (`mohammed-alainieh`) · **Owns:** `orchestration/evidence/T044/` only; may fix broken links or factual errors in `README.md`, `JUDGES.md`, `RELEASE.md` (report other problems, do not fix code)

The project is submitted today. Check, from a fresh clone of current `main`, that everything a judge
or teammate would touch works and is accurate:

1. Fresh clone; follow `README.md` and `RELEASE.md` exactly on a clean machine state: `npm ci` and tests in
   `server/`, `client/`, `tools/demo/`, `tools/e2e/`; `node tools/validate-data.mjs --strict`;
   `node protocol/check.mjs`; `dotnet test core/dotnet~` (install the .NET 8 SDK from Microsoft if missing).
   Record every command and result.
2. Run `npm --prefix tools/demo run demo` and walk the judge path in a browser: entry page, credits page,
   judges page, host page, phone join (a second browser window at a phone size). Screenshot each.
3. Check every link in `README.md`, `JUDGES.md`, `RELEASE.md`, `submission/*.md` and `docs/play/*.html`
   resolves (files exist in the repo; external URLs return 200).
4. Check `submission/PROJECT_DESCRIPTION.md` numbers against the repo once more (contracts, minigames, roles,
   languages, test counts) and correct the docs where they are stale.
5. Write `orchestration/evidence/T044/REPORT.md`: pass/fail table, every defect with exact repro, and a
   "ready to submit" verdict with blockers listed.
