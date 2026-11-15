# T045 — Fixes from the pre-submission verification (T044)

**Worker:** a coding worker (`mohammed-alainieh`) · **Owns:** `core/dotnet~/Tests/` (the determinism test only), `README.md`, `RELEASE.md`, `core/README.md`, the credit text files that hold the Blue Marble link (find them with `git grep -n "Blue Marble"`), `orchestration/evidence/T045/`

From `orchestration/evidence/T044/REPORT.md`:

1. **D1:** one Core determinism test fails on Apple Silicon because its golden hash was recorded on Windows x64 (floating-point differences across CPUs). Keep the determinism guarantee meaningful: replace the exact cross-platform hash with a check that two runs on the same machine are bit-identical, plus a tolerance-based comparison of key outputs against recorded values (state the tolerance and why). Do not change Core runtime code. `dotnet test core/dotnet~` must be green on your machine; say which OS/CPU.
2. **D2:** the docs do not say the Core tests need the .NET 8 SDK/runtime. Add it to the prerequisites in `README.md`, `RELEASE.md` and `core/README.md`.
3. **D4:** the Blue Marble credit links to a URL that returns 404. Find the current official NASA Visible Earth / Earth Observatory page for the Blue Marble imagery (open it to confirm it loads) and fix every occurrence, including the built credits page if it is generated (re-run the generator rather than editing generated HTML by hand, if one exists).

Evidence: before/after test output and the link check in `orchestration/evidence/T045/README.md`.
