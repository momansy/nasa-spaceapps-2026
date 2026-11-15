# T046 — Final docs refresh before submission

**Worker:** a coding worker (`mohammed-alainieh`), dispatched about 11:00 UTC · **Owns:** `submission/*.md` (not `submission/video/`), `JUDGES.md`, `README.md`, `RELEASE.md`, `HOSTING.md`, `orchestration/evidence/T046/`

Make every number and claim in the submission and judge-facing docs match current `main`, a final time.

1. Re-count from the repository: contracts, minigames implemented, roles, languages, part options, facts, test counts per suite (run them: Core `dotnet test core/dotnet~`, server `npm test`, client `npx vitest run`), host screens that exist in `unity/MissionForge/Assets/MissionForge/Scenes/` with working content, merged features since `submission/PROJECT_DESCRIPTION.md` was written (flight view, Build Bay environment, engines, accessibility, host keepalive, hosting).
2. Update `submission/PROJECT_DESCRIPTION.md`, `submission/CHECKLIST.md` (mark done items: licence added, hosting prepared; keep the owner-only steps), `JUDGES.md` (hosted URL if `https://missionforge-spaceapps.onrender.com/healthz` returns 200 — otherwise keep the local launcher instructions and say the hosted link is pending), `README.md`.
3. Planned vs built: move features from "planned" to "built" only if you can see them on main; keep honest labels.
4. Evidence: a short changelog of what you changed and the counts you measured.
