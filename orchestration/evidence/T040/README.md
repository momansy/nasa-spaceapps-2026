# T040 evidence: host stays connected when its tab is backgrounded (D-103)

| File | What it shows |
|---|---|
| `keepalive-harness.mjs` + `harness-*.log` | The real jslib keepalive against the real room server while the C# side is silent. Without keepalive the server closes at ~16 s (`bye IDLE_TIMEOUT`, 4010). With it, 60 s of silence is survived and the next C# frame (shifted seq) is accepted. |
| `background-tab-cdp.mjs` | Real Google Chrome over raw CDP (no Playwright visibility emulation) with the real Unity WebGL host; the host tab is truly hidden (`visibilityState = hidden`). |
| `before-330s-old-build/` | Old build, tab hidden 330 s: Chrome throttles the frame loop, server `bye IDLE_TIMEOUT` 4010, 3 closes, host back on the title screen with no room. |
| `after-330s-new-build/` | New build, same run: 0 closes, 1 WebSocket, 36 keepalive pings, room `VTVM` still open, banner "Room server: connected" (`2-after-return.png`). |
| `editmode-results.xml` | EditMode run: 336 tests, 335 passed, 0 failed, 1 skipped (needs a GPU). |

Note: a hidden tab with Unity "run in background" still ticks about once a second for the first
~5 min; Chrome's intensive throttling after 5 min hidden is what made the old build drop (hence 330 s).
Run: `node orchestration/evidence/T040/background-tab-cdp.mjs --seconds 330 [--host-dir <old build>]`
(needs `server/` built: `npm ci && npm run build`, and `tools/e2e` deps for nothing else; uses system Chrome on macOS).
