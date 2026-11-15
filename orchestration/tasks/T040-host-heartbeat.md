# T040 — Host stays connected when its tab is backgrounded (defect D-103)

**Worker:** a Unity worker (`cyrex04` or `yousuf-amek`) · **Owns:** `unity/MissionForge/Assets/MissionForge/Net/` (including `Plugins/MissionForgeWebSocket.jslib`), `unity/MissionForge/Assets/MissionForge/Tests/EditMode/Net/`, `docs/play/host/` (rebuild), `orchestration/evidence/T040/`

Playtest round 2 (T036, `orchestration/evidence/T036/DEFECTS.md` D-103) found that the Unity
host's banner turns to "ROOM SERVER: RECONNECTING" when its frame loop is very slow. The room
server closes a connection that sends no frame for 15 s (`server/src/wire/server.ts`,
`IDLE_TIMEOUT_MS = 15000`; hello.ok advertises `heartbeatMs: 5000`). If the host's heartbeat is
driven from the Unity frame loop, a backgrounded browser tab (timers throttled, no animation
frames) drops the host — a judge switching tabs on judging day would pause the room.

## Steps

1. Confirm where the WebGL host sends its heartbeat (`RoomClient`, `WebGLWebSocketTransport`,
   the `.jslib`). Reproduce: run the room server locally, open the WebGL host, create a room,
   background the tab for 30 s, return; record what happens (screenshot + server log).
2. Move the WebGL heartbeat into the browser-side JavaScript of the `.jslib`: a `setInterval`
   (or a Web Worker timer, which browsers throttle less) that sends the protocol heartbeat
   frame every `heartbeatMs` while the socket is open, independent of Unity frames. Keep the
   desktop/managed transport unchanged. Also make reconnect-on-return resume the room
   (`room.resume`) without the operator doing anything.
3. EditMode tests for the parts testable in C#; a manual WebGL test is the main proof.
4. Rebuild WebGL to `docs/play/host/` with the existing build method; verify a 60 s
   backgrounded tab no longer drops the host (screenshots before/after, server log excerpt).

## Acceptance

With the WebGL host tab backgrounded for 60 s, the room does not pause and the banner stays
"CONNECTED" on return; EditMode tests green; rebuilt WebGL committed.
