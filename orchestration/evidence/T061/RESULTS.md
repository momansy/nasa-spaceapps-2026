# T061: real-host mode for the e2e harness (+ D-110, D-112)

Run on 2026-11-15 (Windows 11, headless Chromium, software GL). Command:
`node tools/e2e/run.mjs --real-host --room CODE --server ws://localhost:10000/ws --phones 3`, details in `tools/e2e/README.md`.

## 1. Against the committed WebGL host (`docs/play/host/`, via `npm --prefix server run start:hosted`)

`tools/e2e/open-webgl-host.mjs` stood in for the person at the host (control file for canvas clicks).
Run `real-host-runs/*VYTD*`, 3 phones:

| t (s) | what the phones saw | host action |
|---|---|---|
| 5 | all 3 phones in the lobby; host shows "3 crew joined" (`host-shots2/after-open-lobby.png`: E2E01–E2E03, "No role yet") | |
| 28 | `phase.set LOBBY` | Open lobby |
| 134 | `phase.set BRIEFING` (mission 1); phones show `screen-build` | Start briefing (`after-start-briefing.png`) |
| 213 | `phase.set CONTRACT_VOTE` | Continue |
| 334 | **verdict `stalled`**: last phase `CONTRACT_VOTE`, 121 s without a progress frame, no `vote.open` ever sent | none left |

Result: the committed (pre-T055) host build reaches the contract-vote phase and then sends no `vote.open`, so no real session can be played
to the debrief with it. 462 frames recorded, all schema-valid. Earlier run `*NFAJ*`: lobby only (lobby-wait timeout 90 s, verdict `stalled` in `LOBBY`).
Note: the host's briefing screen is the placeholder (empty CAPCOM line, "—" for budget/deadline/payload/orbit).

## 2. Answering logic, with the stub host as the "real host" (`tools/e2e/stub-host-room.mjs`)

`stub-as-host-runs/*EGBZ*`: the stub creates the room and plays the C1 script; the harness only joins and answers.
Verdict **completed**: LOBBY, BRIEFING, CONTRACT_VOTE, five part votes, TEST, PDR, FRR (2 polls, 6 GO calls answered), COUNTDOWN F0,
FLIGHT F2/F3/F4/F6/F8/F9 (minigames MG-07/08/09/10a/13/15/21 played on the real phone UI, summaries and continue), DEBRIEF in 234 s.
The first attempt found a defect in the harness (polls were keyed on `poll.open`, which phones never receive; they get `poll.call`); fixed and rerun.
This proves the answering code, not the Unity host. Phone input is generic, so minigame tiers are low (as in T036).

## 3. Full session against the T055 rebuild

**Not run**: at 11:17 UTC the rebuilt `docs/play/host/` (briefing, FRR, flight, debrief) was not on `origin/main` yet. When it lands:
start `start:hosted`, press New mission on the Unity machine (or `open-webgl-host.mjs`), run the one command above, and read `run-summary.json`.

## 4. D-110 (phones stuck on "Connection lost. Reconnecting…")

Fix: `client/src/App.tsx` `ReconnectBar` shows "This room has ended." plus a Rejoin button (back to the join screen) when the client has stopped
for good with `ROOM_NOT_FOUND` or `TOKEN_INVALID`; new strings `ui.conn.room_ended`, `ui.conn.rejoin` in all six languages.
Check: `node tools/e2e/room-ended.mjs` (kill and restart a hosted server under a phone). Old build: FAIL (banner stays "Connection lost. Reconnecting…").
New build: PASS 5/5, Rejoin returns to the join screen (`room-ended/*/phone-room-ended.png`).
**`docs/play/client/` is not rebuilt in this PR** (297 files, conflicts with other client PRs): run `node tools/demo/build-client.mjs` before the demo to ship it.

## 5. D-112 (two model files 404)

`client/src/viewer/models.ts` `MODEL_ALIAS`: `tank_s` → `tank_s1_s.glb` (the first model of that family in `assets/blender/data_part_map.json`, a game simplification),
`inst_wide_field_optical_camera` → no probe (no model exists yet, wireframe viewer is used). Unit test `models.test.ts`. Not re-measured in a browser network log.

## Verification

`npm --prefix client test`: 929 passed; `tsc --noEmit` clean; `node --test tools/e2e/test/*.test.mjs`: 9 passed.
