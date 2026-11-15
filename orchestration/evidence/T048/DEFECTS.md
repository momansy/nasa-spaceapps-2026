# T048 defects (hosted build, run locally 2026-11-15)

Numbering continues the T036 list (D-101…D-103) from D-110, as the brief asks. **None blocks deployment** (verdict in `RESULTS.md`: safe to deploy).

| ID | Severity | Title |
|---|---|---|
| D-110 | Medium | Phones stay on a stale lobby saying "Connection lost. Reconnecting…" forever after the room is gone |
| D-111 | Medium | Host shows "Room server: reconnecting" forever and re-handshakes every ~32 s after the room is gone |
| D-112 | Low | Two part ids request model files that do not exist: 404 console errors on every phone |
| D-113 | Medium (verification gap) | Real Unity host not played to the debrief in this test |

## D-110 — Phones keep a stale lobby and a "Reconnecting…" banner after a server restart (Medium)

- **Repro:** run `PORT=10000 NODE_ENV=production RENDER_EXTERNAL_URL=http://localhost:10000 npm --prefix server run start:hosted`; open `/play/host/`, press New mission, join 2 phones with the `?room=CODE` link; kill the server process, start it again after 10 s; do not reload anything. Scripted: `E2E_EVIDENCE_TASK=T048 node tools/e2e/hosted-restart.mjs` (`runs/2026-11-15T08-17-14-685Z-hosted-restart`).
- **Expected:** the phone's `room.resume` is answered `ROOM_NOT_FOUND`; the client stops (messages.md 3.5) and shows that the room has ended with a clear way back (join screen / "enter a new code").
- **Actual:** the client does stop (only one `ROOM_NOT_FOUND` per phone in the log), but the screen stays on the old lobby (call sign, crew list, "Waiting for the host to start the mission") with the banner **"Connection lost. Reconnecting…"** at +5 s, +30 s and +90 s (`04-phone1-after-*.png`). The "No room with that code. Check the host screen." message appears only briefly. Nothing is reconnecting, and the player is not told to reload or rejoin.
- **Impact:** on judging day a Render restart leaves every phone looking alive but dead until someone reloads the page (the session token is cleared, so a reload shows the join screen).
- **Suspected files:** `client/src/net/protocolClient.ts` (≈ line 329, the `stop(code)` path) and the connection-status banner / app shell that maps a stopped connection with `closeReason: 'ROOM_NOT_FOUND'` back to "reconnecting" instead of the join screen.

## D-111 — Host stuck on "Room server: reconnecting", re-handshaking forever (Medium)

- **Repro:** as D-110, watching the host page (`05-host-after-30s.png`, `hosted-restart-run2-console.log`).
- **Expected:** after `room.resume` → `ROOM_NOT_FOUND` the host either returns to the title screen with a connected indicator, or says that the room was lost and offers New mission.
- **Actual:** the title screen shows "Room server: reconnecting" (amber) permanently, although the socket is open. The host sends `hello` (gets `hello.ok`) and then nothing; the server closes it with `bye HANDSHAKE_TIMEOUT` (4005, `canResume:false`) 30 s later; the host reconnects 2–3 s later and repeats (20+ cycles in 10 min). **New mission still works** (`room.created`, indicator turns green, `06-host-new-mission-after-restart.png`), so the judge can recover, but nothing tells them to.
- **Impact:** misleading status on the big screen; useless server load (one handshake per ~32 s, negligible); a judge may wait instead of pressing New mission.
- **Suspected files:** the Unity host's WebSocket client (`unity/` network layer; not inspected) that does not treat `ROOM_NOT_FOUND` on resume as terminal, and its status text; server side is correct (`server/src/wire/server.ts` ≈ lines 326/344 return `ROOM_NOT_FOUND` with `fatal:false`).

## D-112 — 404 for two model files on every phone (Low)

- **Repro:** `E2E_EVIDENCE_TASK=T048 node tools/e2e/run.mjs --hosted http://localhost:10000 --players 1` and read `runs/*/proxy-http-errors.log`; or open the client during the C1 session and watch the network tab.
- **Expected:** no failed requests.
- **Actual:** `404 GET /play/client/models/tank_s.glb` and `404 GET /play/client/models/inst_wide_field_optical_camera.glb` (two console errors per page, 24 across 12 pages). `docs/play/client/models/` holds 150 GLBs, but the data part id `tank_s` maps to kit parts `tank_s1_s`, `tank_s2_s`, … (`assets/blender/data_part_map.json`), and no model exists for `inst_wide_field_optical_camera`. The viewer falls back (`client/src/viewer/models.ts` treats a 404 as "no model"), so nothing breaks visibly.
- **Suspected files:** `client/src/viewer/PartViewer.tsx` / `models.ts` (should resolve a data part id through the kit map, or skip the probe) and `assets/blender/data_part_map.json` / the model export list.

## D-113 — Real Unity host not driven through a whole C1 session (Medium, verification gap, not a product defect)

- **Repro:** `node tools/e2e/hosted-judge-path.mjs` (headless, software GL). Headed Chromium cannot start on this worker (`browserType.launch: spawn UNKNOWN`), and a GPU was not available to the automation.
- **Expected (brief step 3):** host and 3 phones play C1 to the debrief.
- **Actual:** host loads (18 s), creates a room, shows the correct link/QR and "3 crew joined"; the later screens were not driven because the host renders at 0.1–0.5 fps in software GL (T036 D-103) and every host screen needs canvas clicks. The same hosted origin was played to the debrief with a scripted host (step 4).
- **Impact:** what the host does from BUILD to the debrief on the hosted origin is untested here. The protocol is the same as in step 4, so a defect would have to be in the Unity host itself, not in hosting.
- **Suggestion:** one person with a GPU laptop plays one full session on the real public URL after the first deploy.
