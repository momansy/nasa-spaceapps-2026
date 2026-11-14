# MissionForge build architecture

Decided by the team owner on 2026-11-14: **Unity host + web phones**. The host screen is a
Unity application (WebGL build for the browser, desktop build for demos). Phones are a web
app joined by room code or QR. A small Node room server relays between them.

`GAME_DESIGN.md` is the specification. This file fixes the layout and interfaces so that
agents can work in parallel without colliding.

## 1. Repository layout

| Path | What | Built / tested with | Who touches it |
|---|---|---|---|
| `data/` | Game content as JSON: parts, contracts, tests, anomalies, roles, boosts, minigames, facts, codex, achievements, strings. `data/schema/` holds JSON Schemas. | `node tools/validate-data.mjs` | data tasks |
| `core/` | **MissionForge.Core**: pure C# rules and simulation, no `UnityEngine`. A Unity package (`package.json`, `Runtime/`, asmdef) that also builds with the .NET SDK from `core/dotnet~/`. | `dotnet test core/dotnet~` | core tasks |
| `unity/MissionForge/` | Unity project: host screens, 3D scenes, cameras, HUD, VFX, audio. References `core/` as a local package. | Unity Test Runner, WebGL build | Unity tasks only |
| `server/` | Room server: Node 20+, TypeScript, `ws`. Rooms, players, roles, votes, timers, relay. | `npm test` in `server/` | server tasks |
| `client/` | Phone web app: Vite + TypeScript + React. Join, vote, part cards, consoles, minigames, codex. | `npm test`, Playwright in `client/` | client and minigame tasks |
| `protocol/` | Message definitions shared by host, server and client: `messages.md`, JSON Schemas, generated TS types. C# mirrors live in `core/Runtime/Protocol/`. | schema tests | protocol owner; others propose changes |
| `assets/blender/` | Source `.blend` files. Exports go to `unity/MissionForge/Assets/Art/Models/` (FBX) and `client/public/models/` (GLB, under 2 MB each). | Blender | 3D art tasks |
| `assets/media/` | Generated images, video and audio, plus `CREDITS.md` (tool, prompt, date for each file). | — | media tasks |
| `tools/` | Validators and the balance search. | Node | QA tasks |
| `docs/play/` | Published builds: `docs/play/host/` (Unity WebGL), `docs/play/` (phone client). | — | orchestrator |
| `orchestration/` | Standing orders, this file, work breakdown, task briefs, evidence. | — | orchestrator |

## 2. Who is the authority for what (design section 17.1)

- **Host (Unity + Core)** owns the simulation: build state, dashboard metrics, validation,
  physics, failure rolls, boosts, score. Seeded and deterministic.
- **Room server** owns membership, roles, vote collection and vote resolution, timers,
  reconnect tokens. It keeps room state for 10 minutes if the host drops.
- **Phones** own input and run minigames locally. They report compact results.
- Phones never recompute simulation numbers. The host computes each option's "if chosen"
  deltas and sends them inside `vote.open`.

## 3. Core (C#)

- Target `netstandard2.1`, C# 9, nullable enabled. No `UnityEngine`, no file or network
  I/O, no wall-clock time, no `System.Random`. Callers pass JSON text and a seed.
- JSON through Newtonsoft.Json (Unity package `com.unity.nuget.newtonsoft-json`; NuGet
  `Newtonsoft.Json` 13.x in the .NET projects).
- SI units inside the code (kg, m, s, N, W). Unit suffixes on every public numeric name
  (`thrustVacN`, `massKg`). Convert only at the data and UI boundaries.
- One seeded PRNG type in `Core.Random`; every random draw names its stream
  (`anomaly`, `failure`, `tiebreak`) so replays match (design section 17.6).
- Flight integrator: fixed step 1/120 s, RK4 for powered and atmospheric flight, analytic
  Kepler propagation for unpowered vacuum coasts (design section 8.2).
- Namespaces: `Core.Data` (catalog loading), `Core.Build` (dashboard, budget, schedule,
  reliability, tests, anomalies, reviews, validation), `Core.Flight` (physics, phases,
  failures, aborts), `Core.Scoring` (boosts, tiers, score, awards), `Core.Session` (state
  machine, replay log), `Core.Campaign`, `Core.Protocol`.
- Every public calculation has unit tests with hand-checked or textbook values.

## 4. Data

- File names: `data/parts/<category>.json`, `data/contracts.json`, `data/tests.json`,
  `data/anomalies.json`, `data/roles.json`, `data/boosts.json`, `data/minigames.json`,
  `data/facts.json`, `data/codex.json`, `data/achievements.json`, `data/strings/en.json`.
- Part entries follow the schema in design section 17.5. Numeric field names carry units
  (`thrust_sl_kN`, `mass_t`, `cost_M`, `lead_days`). Every entry has `value_types`.
- IDs are lowercase snake case and never change once merged (`eng_kerolox_workhorse`,
  `C1`, `MG-08`, `F04`).
- Player-visible text lives in `data/strings/<lang>.json`, keyed by ID, so the game can be
  localised and laid out right-to-left (design section 16).
- Unity reads data from `StreamingAssets/data/`, copied from `data/` by an editor script.

## 5. Protocol

- JSON text frames over WebSocket. Envelope: `{"t": "<type>", "seq": <int>, "d": {...}}`.
- Message types and payloads start from design section 17.4. `protocol/messages.md` is the
  source of truth; change it in the same pull request as the code that needs the change.
- Roles in a room: `host` (one), `player` (1 to 10), `spectator` (any number).
- Limits: telemetry at most 10 Hz per console, under 50 KB/s per client, vote round trip
  under 200 ms on a local network.

## 6. Unity host

- Unity version: the LTS installed on the Unity worker, pinned by the first Unity task in
  `unity/MissionForge/ProjectSettings/ProjectVersion.txt`. Universal Render Pipeline.
- Targets: WebGL (primary, 60 fps at 1080p on a mid-range laptop) and Windows desktop.
- Scenes map to the host screens in design section 14.1. UI is resolution-independent and
  readable from across a room.
- Unity code lives in `Assets/MissionForge/` with its own asmdefs. It calls Core; it does
  not reimplement rules.
- WebSocket in WebGL goes through a browser bridge (`.jslib`); desktop uses a managed client.
- Art direction: stylised realism, accurate proportions, readable silhouettes (design
  section 15). Earth with day/night and clouds, altitude-dependent plumes, plasma on entry.

## 7. Phone client

- Works on four-year-old phones at 30 fps; 2D fallback for the 3D part viewer.
- Minigames live in `client/src/minigames/<MG-id>/`, one folder each, behind one
  interface: `start(params, seed)`, reports `{success, perfect, score}`. Each has a relaxed
  mode and a one-button mode (design section 16).
- No free-text chat, no accounts, no trackers (design section 17.9).

## 8. Working agreement

- One task, one branch, one pull request into `main`. The orchestrator reviews, tests and
  merges. Start every task from the current `main`.
- A task lists the paths it owns. Two tasks never own the same path at the same time.
- Tests that must pass before merge: `dotnet test core/dotnet~`, `npm test` in `server/`
  and `client/`, `node tools/validate-data.mjs`, and for Unity tasks the Unity test run and
  a WebGL build.
- AI-generated media is recorded in `assets/media/CREDITS.md`. NASA names and logos are not
  used as branding; in-game part names are generic with a "real-world twin" line.
