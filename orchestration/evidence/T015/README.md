# T015 evidence — Unity Build Bay

Date: 2026-11-14. Unity 6000.6.9f1, macOS (Darwin 25.6), Apple M4 (10 cores, 24 GB), Google Chrome (system install).

## Screenshots (all 1920 × 1080)

Taken by the macOS evidence player (`MissionForge ▸ Build Bay ▸ Build macOS Evidence Player`, `MF_REHEARSAL` build)
with `-mfBayShots <dir>`: the Build Bay runs the real director against the rehearsal driver (4 synthetic players) and
captures each state (`Screens/BuildBay/Evidence/`). The chrome reads RECONNECTING because no room server was running.

| File | State | Flags |
|---|---|---|
| `01-idle-bay-partial-vehicle` | Idle bay, partial C1 vehicle, live dashboard, timeline, phase tracker | `-mfBayVotes 9` |
| `02-beauty-no-ui` | Pad at dusk without UI | same run |
| `03-vote-in-progress-ghost-tallies` | Fairing vote: stages, timer, tallies, role tags, pings, "if chosen" deltas on the dashboard and budget bar, Signal-teal ghost in the slot | `-mfBayVotes 4 -mfRehearsalPace 0.6` |
| `04-assembly-crane-sparks` | Result of the fairing vote; the crane lowers the part (sparks and technicians appear in the weld phase; the small fairing is small at this zoom) | same run |
| `05-compare` | Compare tool: two candidate rigs + stat-difference table from `Preview.Of` | same run |
| `06-exploded` / `07-scale-reference` / `08-stability-markers` | Preview tools (6.10) | same run |
| `09-complete-vehicle-beauty` | All 22 C1 votes resolved, complete vehicle, no UI | same run |
| `10-rtl-200-percent-text` | Right-to-left layout + 200 % text | `-mfRtl -mfText200` |
| `11-high-contrast` | High-contrast mode | `-mfHighContrast` |
| `12-webgl-chrome` | WebGL build in Chrome at the end of the frame-rate run | see below |

## Tests

`editmode-results.xml`: **224 / 224 passed** (194 existing + 30 T015 tests in Screens/BuildBay/Tests) with
`Unity -batchmode -runTests -testPlatform EditMode`. T015 tests: kit resolution for every C1 option, all 97 kit empties
match the manifest through `KitToUnity`, three seeded builds (C1 small 20.5 m, mid three-engine 58.1 m, heavy with
strap-ons 100.2 m) assemble with every joint gap and ring mismatch ≤ 3 mm, dashboard values identical to
`Dashboard.Compute`, timeline equal to Core's, vote message → view-model mapping (open/hidden tallies, veto, runoff,
tiebreak, pings, cancel), timer arithmetic with clock offset, `vote.open`/`build.state` from Core, a rehearsal round, and
a full 22-round C1 build through the director's message path.

Protocol check: the full-build dump (`PayloadDumpTests`, 395 messages: vote.open, vote.opened, vote.stage, vote.tally,
vote.tags, vote.vetoed, ping.event, vote.result, vote.commit, build.state) validates against `protocol/schema` with
`validate-payloads.mjs` (ajv 8, draft 2020-12): **0 invalid**.

## WebGL frame rate

`webgl-fps.json`: `MissionForge ▸ Build Bay ▸ Build WebGL` → `unity/MissionForge/Builds/BayWebGL/` (git-ignored, not
`docs/play/`), served locally, opened in desktop Chrome through Playwright (`measure-webgl-fps.mjs`, viewport
1920 × 1080, DPR 1) with `?mfBayVotes=4&mfRehearsalPace=0.5` so the rehearsal assembles parts during the 80 s run.
Frame times from `requestAnimationFrame`; assembly windows from the build's start/end console markers.

- Median **59.9 fps during assembly** (6 assembly windows, 1 065 frames; p95 17.6 ms, worst 17.8 ms).
- Median 59.9 fps overall after the first 15 s.
- Machine: Apple M4 MacBook (integrated GPU), 60 Hz display; 60 fps is the vsync cap, so headroom was not measured.
- Console errors in the run: a favicon 404 and the room client's reconnect attempts to `ws://localhost:8787` (no server
  running); none from T015 code.
