# T030 evidence: phone pilot, co-pilot, spectator view, profile edit

Screenshots are copies of `client/e2e/screenshots/pilot/` (Playwright, Chromium, mock session).
Every screen exists at 390 × 844 (`-portrait`) and 844 × 390 (`-landscape`) where it makes sense.

| File | What it shows |
|---|---|
| `01-pilot-portrait-engineer.png`, `01-pilot-landscape-engineer.png`, `04-pilot-engineer-*` | Pilot, Engineer layout (full 9.2 touch column) |
| `04-pilot-cadet-*` | Pilot, Cadet layout (throttle, STAGE, DEPLOY, ABORT only) |
| `02-abort-cover-open-portrait.png` | ABORT cover flipped, hold panel open |
| `03-abort-hold-in-progress.png` | ABORT 1.5 s hold, ring filling |
| `05-copilot-*` | Co-pilot: STAGE ring, DEPLOY targets, pilot read-back |
| `06-booster-seat-*` | Booster pilot seat |
| `07-watch-burst-*` | Spectator watch screen with a reaction burst and counters |
| `07-watch-flight-*` | Spectator watch screen in flight (numbers with units) |
| `08-audience-says-*` | "Audience says" bar inside the vote screen |
| `09-profile-sheet-error-*`, `09-profile-lobby-updated-*` | Profile sheet (NICK_TAKEN with suggestion) and the lobby after the change |
| `10-pilot-200-rtl-*`, `10-copilot-200-rtl-*`, `10-watch-200-rtl-*` | 200 % text, right-to-left |
| `10-pilot-high-contrast-*`, `10-copilot-high-contrast-*`, `10-watch-high-contrast-*` | High contrast |
| `touch-targets.txt` | Every interactive element measured on the new screens (CSS px) |
| `fps-note.txt` | Frame rate with CPU throttling ×4 |
| `test-output.txt` | `npm test`, `npm run build`, `npm run e2e` outputs |

## Mock options added (`?mock=1`)

| Option | Effect |
|---|---|
| `&seat=pilot` / `copilot` / `booster` | The player sits in that seat with PHONE input from COUNTDOWN; the script skips the votes and holds the ascent. `pilot.input`, `pilot.action`, `copilot.action` are accepted from that seat only; `pilot.hud` is sent at ≤ 10 Hz. |
| `&watch=1` | The phone joins as a spectator (the mock now accepts it); seeded `react.audience` windows; the vote tally carries audience counts. |
| `&lobby=N` | Keeps the lobby open N s (profile sheet). |
| `&brief=N` | Keeps the briefing open N s (spectator screen). |

Test hooks on `window.__mf.room`: `received` (every frame the phone sent), `seat` (state, `force`, `log`),
`setPaused(bool)`, `reassign({...})` (seat handover), `setAssist(level)`, `pendingSpectator`, `profileFault`.

All numbers the mock host sends are game values invented for the demo.
