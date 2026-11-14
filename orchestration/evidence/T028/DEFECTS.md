# T028 defects

## D-001 — Major — server — Pre-join `roles.state` violates its schema

**Repro:** `cd tools/e2e && npm ci && npm run e2e -- --players 1 --seed 2801`; open run
`2026-11-14T20-51-35-691Z-stub-p1-s2801/frames.ndjson`, connection `c1`, server-to-host sequence 5.

**Expected:** Every frame validates against `protocol/schema/envelope.schema.json` and its message
schema. `roles.state.groups` has `minItems: 1`.

**Actual:** The server sends the host `roles.state` with `groups: []` immediately after room creation,
before any player joins. The same single invalid frame appears in all four canonical counts.

**Evidence:** Each canonical `metrics.json` → `errors.schemaViolations`; exact frame in each
`frames.ndjson`. **Harness workaround:** none; the frame is recorded as invalid and the run continues.

## D-002 — Major — client — Six required C1 minigames are not bundled

**Repro:** `cd tools/e2e && npm run e2e -- --players 1 --seed 2801`; inspect the canonical run's
`phone-1-diagnostics.json` and `run-summary.json` at the MG-07, MG-09, MG-10a, MG-13, MG-15 and MG-21
milestones.

**Expected:** T028 and design §10 require the C1 script to play MG-07, MG-08, MG-09, MG-10a, MG-13,
MG-15 and MG-21 on phones, with relaxed/one-button behavior.

**Actual:** Only MG-08 loads. The other six starts show the client's sit-out UI because no matching
module is bundled, so they cannot produce phone results.

**Evidence:** Canonical `run-summary.json` segment values `not_bundled`, phone diagnostics, and frame
timestamps around each `mg.start`. **Harness workaround:** the stub records the sit-out, sends an
honest zero-active `mg.summary`, and proceeds; results mark each segment fail.

**Update (resolved in the product):** T019, T020, T021 and the polish pass were merged after these runs (PRs #111, #120 and the launch/orbit
minigame PR #101), and the built phone client now ships every C1 minigame (MG-01 to MG-21, MG-29, MG-30 chunks in `client/dist/assets`). The harness
had hardcoded `MG-08` as the only playable minigame; `tools/e2e/host/scripted-host.mjs` now reads the bundled minigames from the client build. Rerun
`2026-11-14T22-34-35-508Z-stub-p3-s2801` (3 phones, seed 2801): MG-07, MG-08, MG-09, MG-10a, MG-13, MG-15 and MG-21 all mounted and were played with generic touch input, 0 harness
failures. As before, the stub host writes the `mg.summary` (fixture values), so this shows the phone loads and plays each minigame, not that a
generic tap wins it.

## D-003 — Minor — server — Vote-to-next-tally p95 narrowly misses the local target

**Repro:** `cd tools/e2e && npm run e2e -- --players 3,6,10 --seed 2801`; inspect each canonical
`metrics.json` → `latencyMs.voteCastToTally`.

**Expected:** Design §17.8 sets vote round trip below 200 ms on a local network.

**Actual:** p95 is 208.830 ms (3 phones), 203.997 ms (6 phones), and 200.162 ms (10 phones). Direct
`vote.cast` → `vote.ack` p95 remains 6.737–9.124 ms, so the miss is specifically the debounced tally.

**Evidence:** Canonical `metrics.json` and correlated timestamps in `frames.ndjson`.
**Harness workaround:** none.

## D-004 — Major — unity — WebGL host does not reach the title/lobby in automated Chromium

**Repro:** `cd tools/e2e && npm run e2e -- --players 1 --host unity --seed 2801`; then retry with
`--headed`. Headless run id: `2026-11-14T20-34-13-289Z-unity-probe-s2801`; headed attempt:
`2026-11-14T21-01-59-386Z-unity-probe-s2801`.

**Expected:** The WebGL host starts, New Mission creates a room, a phone joins, the lobby shows the
phone, and `window.mfPerf` approaches the host performance target.

**Actual:** With SwiftShader/WebGL flags, headless Chromium stays on `LOADING MISSION CONTROL`, creates
no room, and records 0.812 average FPS. The headed fallback cannot spawn (`browserType.launch: spawn
UNKNOWN`) on this worker.

**Evidence:** `unity-loading.png`, `unity-host.png`, `unity-result.json` in both Unity probe folders,
plus their frame/server logs. **Harness workaround:** per the brief, all remaining segments use the
stub host; results do not claim Unity coverage.
