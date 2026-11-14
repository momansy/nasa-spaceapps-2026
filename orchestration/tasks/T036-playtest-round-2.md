# T036 — End-to-end playtest, round 2 (current main)

**Worker:** a coding worker with Node 20+ and Playwright (`momansy-claude` first) · **Owns:** `orchestration/evidence/T036/` only (plus fixes to `tools/e2e/` itself if the harness is broken, called out separately)

T028 built the harness in `tools/e2e/` and recorded four defects (D-001 to D-004) on an older
checkout. Since then main gained: the phone UI revamp, 25 of 32 minigames (MG-01 to MG-21 incl.
MG-08b and MG-10a, MG-29, MG-30), the pilot/co-pilot/spectator screens, the server fix for D-001,
the T011 scoring and session code, the balance data fixes and the `?server=` client option.

Do not fix code outside `tools/e2e/`. Report defects precisely so the orchestrator can assign them.

## Steps

1. Fresh clone or worktree of current `main`; follow `tools/e2e/README.md` exactly; build server and client.
2. Re-run the C1 Earth Watch session with 1, 3, 6 and 10 phones plus 5 spectators and the reconnect scenario. Record round-trip times, message rates, bytes/s, fps and errors as T028 did.
3. Re-check each of D-001 to D-004 and mark it fixed / still present / not reproducible, with evidence.
4. Play every minigame that C1 triggers through the real phone client (not the lab page) at least once; confirm each loads, runs, reports a result and that the result shows on the phone.
5. Exercise the new screens: pilot seat (`&seat=` in the mock and in a real session if the host stub supports it), co-pilot, spectator with audience reactions, the `?server=` override against a LAN address.
6. Run `npm --prefix tools/demo run demo` (the judging-day launcher) and walk the entry page → phone join → host lobby path; note anything a judge would trip over.
7. Write `orchestration/evidence/T036/RESULTS.md` (numbers, comparison with T028) and `DEFECTS.md` (numbered D-101 upward: severity, exact repro, expected vs actual, suspected file). Screenshots of anything broken.

## Acceptance

All four session sizes run to debrief or each failure has a numbered defect with a repro; every
C1 minigame is confirmed working or has a defect; the demo launcher path is checked.
