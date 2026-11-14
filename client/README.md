# MissionForge phone client

The no-install web client players open from the room code or QR on the host screen. It joins a
room, shows the role card, runs every vote (Part Cards, Predict, veto, pings, tags, trivia
tie-breaks, quick votes), the GO/NO-GO poll, the role consoles during flight, the minigames,
personal results and awards, the personal Codex and settings.

Vite + React 18 + TypeScript. three.js is loaded only when a part model exists. No external
fonts, CDNs, accounts, trackers or chat.

## Run

```bash
cd client
npm install
npm run dev            # http://localhost:5173 (also on your LAN, for phones)
```

- Real room server: the client connects to `VITE_ROOM_SERVER_URL` (for example
  `wss://rooms.example.org/ws`), or to `/ws` on the page's own host when it is not set.
- `?room=KQXM` pre-fills the room code (the QR code URL); `&watch=1` joins as audience.
- **Mock session, no server needed:** `http://localhost:5173/?mock=1` (see below).
  `&speed=2` runs every timer twice as fast. `&dir=rtl` forces right-to-left layout.

## Test and build

```bash
npm test               # Vitest: reducers, string loader, stat bars, MG-08, full mock session
npm run build          # type-check (tsc) + production bundle in dist/
npm run e2e:install    # once: Playwright's Chromium
npm run e2e            # builds, serves dist/, plays the whole mock session at 390 × 844
```

`npm run e2e` saves a screenshot of every screen to `e2e/screenshots/` and fails if any string
key is missing (the page exposes `window.__mf.missing()` in mock mode) or the console logs an
error.

## Layout

| Path | What |
|---|---|
| `src/net/connection.ts` | The `Connection` interface both transports implement |
| `src/net/protocolClient.ts` | Envelope and `seq`, `hello`, join / resume, heartbeat with clock offset, reconnect backoff 0.5/1/2/4/5 s, resume token in sessionStorage |
| `src/net/wsConnection.ts` | Real WebSocket transport |
| `src/net/mock.ts` | In-page room server + host that plays the scripted session |
| `src/state/` | The single store: `reducer.ts` (pure, protocol messages → state), `selectors.ts` (which screen, who may vote / veto / tag), `store.ts` (actions the screens call, side effects) |
| `src/screens/` | One component per screen of design 14.2; `vote/` holds the vote screen and the Part Card |
| `src/viewer/` | 3D part viewer: `/models/<part_id>.glb` with three.js, else the built-in 2D wireframe |
| `src/minigames/` | Minigame host interface (`types.ts`) and one folder per minigame |
| `src/i18n/` | `t(key)` over all `data/strings/en*.json` plus the client's `strings/en*.json` |
| `src/theme/` | Tokens from `assets/media/style/STYLE_GUIDE.md`, high-contrast and reduced-motion |

Protocol types are imported from `protocol/ts/messages.ts` (`@protocol`), never redefined. The
game catalog (`data/parts/*.json`, roles, facts, minigames) and every `data/strings/en*.json`
file are bundled at build time.

## How the mock works

`?mock=1` replaces the WebSocket with `createMockConnection()`. The real `ProtocolClient` runs
over an in-memory socket to `MockRoom`, which plays both the room server (handshake, clock,
membership, roles, vote stages and resolution, vetoes, tags, trivia, GO/NO-GO calls, snapshots
on resume) and the Unity host (phases, build state, "if chosen" numbers, telemetry, alerts,
minigame summary, debrief). The script:

1. Lobby: four bot crew members join; roles lock (you get BOOSTER+STRUCT, a bot is FLIGHT).
2. Briefing for contract C1 Earth Watch.
3. Part vote "first-stage engine" with a Predict question (hydrolox option is over budget and
   will not fly yet, to show the banners). Vote and change your vote; the tally is live.
4. Quick vote "engine hot-fire test".
5. Part vote "upper-stage engine": a bot vetoes an option during Inspect; you can veto too.
6. Part vote "fairing": bots settle so the count ties and FLIGHT abstains → trivia
   sudden-death → the fastest correct answer picks.
7. Flight Readiness Review GO/NO-GO poll (a NO-GO triggers a second round).
8. Countdown and ascent with BOOSTER and STRUCT consoles; a Max Q alert opens a callout window
   (press the callout for a Good Call).
9. Minigame MG-08 Max Q Throttle Bucket, then the tier summary with boosts and a fact.
10. A short out-of-coverage blackout, orbit, and the debrief (score, awards, facts, Codex).

All numbers the mock host sends are game values invented for the demo. The mock keeps the room
only in memory: a page refresh in mock mode starts a new demo (the stale token is refused with
TOKEN_INVALID / ROOM_NOT_FOUND, as the real server would). `window.__mf.drop()` simulates a lost
connection to watch the reconnect and resume path. `src/net/mock.test.ts` plays the same session
headless and validates every frame in both directions against `protocol/schema/`.

## How to add a minigame

1. Create `src/minigames/<MG-id>/index.ts` that default-exports a `MinigameModule`
   (`src/minigames/types.ts`):
   - `create(root, env)` mounts the playfield and returns an instance with
     `start(params, seed)`, `onResult(cb)`, `pause()`, `resume()`, `destroy()`;
   - `createDemo(root, env)` mounts a non-interactive ~3 s loop for the intro;
   - read `env.mode` (`STANDARD`, `RELAXED`, `ONE_BUTTON`), `env.assistLevel`,
     `env.durationMs`, `env.reducedMotion`; vibrate with `env.haptic(...)`.
   - `params` always contains **`slot`** (this player's 0-based position: the host's
     `mg.start.assignments[].index`, else the player's rank by seat) and **`slots`** (active
     players: the number of assignments, else the room's players), merged after the common
     `mg.start.params` and the player's own `assignments[].params`
     (`src/minigames/slots.ts`);
   - **`env.coop`** (optional) is the shared-state channel for `COOP_SPLIT`, `RELAY` and
     `TEAM_SYNC` runs on a player's phone:
     `{ send(action: { a: string; x?: number[] }): void; onState(cb: (state) => void): () => void }`.
     `send` becomes protocol `mg.action` (`a` must match `^[a-z][a-z0-9_]{0,23}$`, at most 8
     numbers, keep it under 10 per second); `onState` delivers each newer host `mg.state` as
     `{ n, shared, progress }` (the latest one at once) and returns an unsubscribe function
     (`src/minigames/coop.ts`). It is `undefined` for `PARALLEL_SOLO` runs, spectators and the
     demo loop, and **every minigame must still work when it is undefined**. The mock host
     answers each move with an `mg.state` (`moves`, `last_a`, `last_x`, `by_<slot>`) plus a bot
     move, see `MockRoom.onMgAction` and `startRun()`.
2. Keep the simulation pure and deterministic from `seed` (no `Math.random`, fixed time step)
   and report exactly one `{ success, perfect, score }` (plus `value` when the design says the
   team value steers the flight).
3. Put the rules in a separate pure module with Vitest tests (see `MG-08/model.ts` and
   `model.test.ts`). Document which constants are physical, real-world approximate or game
   values.
4. The host screen (`screens/MinigameScreen.tsx`) does the rest: lazy-loads the folder,
   `mg.ready`, one-line instruction from `data/minigames.json`, demo, countdown to `startAtMs`,
   relaxed / one-button toggles, pause, `mg.result`, and the tier screen with its fact.

## Accessibility

Portrait layout for 360–430 px with safe-area insets, 48 px minimum targets, text scale up to
200 % (settings), high-contrast and reduced-motion modes (device preference or room flag),
status colours always with a shape (circle / triangle / octagon), a label and a border style,
right-to-left layout, screen-reader labels, haptics that can be switched off.
