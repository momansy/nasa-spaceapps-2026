# T036 defects (round 2)

Round-1 defects D-001 to D-004: status in `RESULTS.md` section 4 (D-001 and D-002 fixed, D-003 still present,
D-004 changed). New and carried-over numbering starts at D-101. Paths are relative to
`orchestration/evidence/T036/`. Severity: Major = blocks or badly degrades a session; Minor = degrades but
the session completes. "Suspected" means the cause is a reading of the code, not something I proved.

## D-101 — Minor — server — Vote-to-next-tally p95 sits at the 200 ms limit (carry-over of D-003)

**Repro:** `cd tools/e2e && E2E_EVIDENCE_TASK=T036 npm run e2e -- --players 3,6,10 --seed 2801`; run
`node summarize.mjs <runDir>` and read the "Next tally" column (`metrics.json` → `latencyMs.voteCastToTally`).

**Expected:** Design §17.8: vote round trip below 200 ms on a local network (acknowledgement and tally).

**Actual:** Acknowledgement passes (p95 5.4–26.6 ms). The next `vote.tally` after a cast has p50 93–174 ms and p95
203.7 ms (3 phones), 201.1 ms (6), 205.5 ms (10, diagnostic run); other runs 182–196 ms. It passes or fails by a few
milliseconds from run to run.

**Evidence:** `runs/2026-11-14T23-32-00-790Z-stub-p3-s2801/metrics.json`, `…p6…`, `runs/2026-11-15T00-06-13-679Z-stub-p10-s2801/metrics.json`.

**Suspected file:** `server/src/rooms/room.ts:102` (`TALLY_MIN_GAP_MS = 200`) and the trailing-edge send at
about line 1135 ("at most one `vote.tally` per 200 ms after a change; a change inside the window is sent when it ends").
A 200 ms minimum gap makes a p95 below 200 ms unreachable when votes arrive in a burst. Either send the first tally of a burst at once and
then rate-limit (still ≤ 5 Hz), or state the target as "tally within 250 ms" in design §17.8. The tally rate (≤ 3 Hz observed) meets its own limit.

**Acceptance for a fix:** next-tally p95 below 200 ms in the 3, 6 and 10 phone runs and tally rate still ≤ 5 Hz.

## D-102 — Minor (unresolved cause) — client or test environment — A phone page stops responding for 4–19 s during part votes at 10 phones

**Repro:** `cd tools/e2e && E2E_EVIDENCE_TASK=T036 npm run e2e -- --players 10 --seed 2801` (13 Chromium pages in one
browser: 10 phones, 2 audience spectators, 1 late joiner). Open `runs/<runId>/phone-1-diagnostics.json` → `actions`.

**Expected:** `page.screenshot` and `page.evaluate` on phone 1 complete in well under a second when the vote screen opens, as they do at 1, 3 and 6 phones.

**Actual:** At the first part-vote milestones (rounds `m1.part.1` and `m1.part.3`, sometimes `m1.part.4`), a screenshot of phone 1 does not
complete in 15–30 s and a trivial `page.evaluate(() => performance.now())` took 12.6 s and 18.7 s (diagnostic run), 16.0 s, 19.1 s and
3.9 s (no-throttle run). `document.visibilityState` was `visible`. A viewport-only retry succeeded in most cases (it also timed out once, for round 4 of the diagnostic run). In the first two runs the harness waited
30 s for the full-page screenshot, so the round lasted 31 s with no phone votes and the harness recorded 2 failures each (the session still reached
debrief). It repeated in 4 of 4 runs and is not caused by the CPU-throttled ×4 phone (it also happens with the throttle off). It did not occur at 6 phones or fewer.

**Evidence:** `runs/2026-11-14T23-32-00-790Z-stub-p10-s2801/run-summary.json` (failures), `runs/2026-11-15T00-06-13-679Z-stub-p10-s2801/phone-1-diagnostics.json`
and `runs/2026-11-15T00-14-19-123Z-stub-p10-s2801/phone-1-diagnostics.json` ("screenshot diagnostic" entries).

**Suspected cause (unproven):** either the client's vote screen re-renders heavily at 10 players while all pages share one software-rendered browser, or the
test machine is saturated by 13 pages (the audience pages also dropped from 59.5 to 28–29 fps between the 6 and 10 phone runs). To separate the two, run
the same scenario with each phone in its own browser process or on real phones, and profile the client vote screen at 10 players (long tasks).
Real phones are separate devices, so the user impact may be nil; the harness limit for 10 phones on one machine is the practical finding.

## D-103 — Minor — unity or server — Host shows "ROOM SERVER: RECONNECTING" when its frame loop is extremely slow

**Repro:** `npm --prefix tools/demo run demo`, then `cd tools/e2e && E2E_EVIDENCE_TASK=T036 node judge-path.mjs --phone-base http://<LAN-IP>:8080`
(real Unity host in headless Chromium with software GL, 0.1–0.5 fps). The run creates a room with New mission, joins a phone, waits 60 s, and
takes `host-with-phone.png`.

**Expected:** The host stays connected ("ROOM SERVER: CONNECTED") and shows the joined crew.

**Actual:** Right after New mission the banner is "CONNECTED" (`host-after-new-mission.png`). One minute after the phone joined, the lobby card
correctly shows "1 crew joined" but the banner is "ROOM SERVER: RECONNECTING" (`host-with-phone.png`).

**Suspected file:** `server/src/wire/server.ts:35` (`IDLE_TIMEOUT_MS = 15000`: a connection that sends no frame for 15 s is closed; the
hello.ok advertises `heartbeatMs: 5000`, `server.ts:277`). If the host's heartbeat is sent from the Unity frame loop, a frame time above ~15 s at 0.1 fps would trip
it. I did not confirm where the host sends its heartbeat or read the server log of the drop (the launcher logged nothing).
This is probably a software-GL artefact, but the same would happen to a real host if its tab is backgrounded (browsers throttle timers and stop
animation frames), which a judge could do by switching tabs. Not verified on a GPU machine.

**Check for the assignee:** background the host tab for 20 s during a lobby and see whether the room pauses with `HOST_DISCONNECTED`; if so, have the
host's JavaScript wrapper (not the Unity frame loop) send the heartbeat.
