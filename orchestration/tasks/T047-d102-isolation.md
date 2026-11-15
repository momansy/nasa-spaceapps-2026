# T047 — Isolate playtest defect D-102 (phone page stalls at 10 phones)

**Worker:** a coding worker (`momansy`, Codex) · **Owns:** `tools/e2e/` (an option for per-phone browser processes only), `orchestration/evidence/T047/`

`orchestration/evidence/T036/DEFECTS.md` D-102: with 10 phones, 2 spectators and a late joiner as 13 pages
in one Chromium, phone 1's page stops responding for 4–19 s during the first part votes (4 of 4 runs; never
at 6 phones or fewer). Unknown whether the client or the single test machine is the cause.

1. Add an option to the harness (`tools/e2e/`) that launches each phone in its own browser process
   (separate `chromium.launch()` per phone), without changing default behaviour.
2. Re-run the 10-phone C1 scenario (seed 2801) three times with separate processes and three times with the
   old single-browser mode; record phone-1 stall durations, long tasks (use the Performance API or CDP
   tracing for the vote screen), CPU load of the machine.
3. Profile the phone client's vote screen at 10 players in a single page with CPU throttle ×4: list long
   tasks over 50 ms and the functions responsible.
4. Write `orchestration/evidence/T047/REPORT.md`: verdict (test environment vs client), numbers, and if it is
   the client, the exact functions and a suggested fix. Do not change client code.
