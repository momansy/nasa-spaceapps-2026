# T001 — Unity foundation (package F1)

**Worker:** `cyrex04` (Unity MCP, Blender MCP) · **Owns:** `unity/MissionForge/`, `docs/play/host/`, `orchestration/evidence/T001/`

## Goal

A Unity project that every later host task builds on: it opens clean, loads game data,
calls MissionForge.Core, talks to the room server, moves between screens, and ships a
WebGL build whose first screen already looks like a professional game.

## Timing note

`core/` (the Core package) and `protocol/` reach `main` shortly after this task starts.
If they are missing when you begin, do steps 1, 2, the `UI/` part of 4, and 5 first.
Then run `git fetch origin` and `git merge origin/main` (a merge, not a branch switch) and
continue with the Core, Data and Net parts. If they are still missing, put the Core call
and the message envelope behind interfaces and say so in your summary.

Task T006 is creating files under `Assets/Art/Models/` and `Assets/Art/Materials/` at the
same time; do not put anything in those two folders.

## Steps

1. **Environment report** (first progress note): OS, GPU, Unity Editor versions installed,
   Blender version, MCP server names available, .NET SDK version, Node version.
2. Create `unity/MissionForge/` with the newest installed Unity LTS, Universal Render
   Pipeline, linear colour space. Pin the version in `ProjectVersion.txt`.
3. Packages: Input System, Cinemachine, TextMeshPro, `com.unity.nuget.newtonsoft-json`,
   and the local Core package: `"com.missionforge.core": "file:../../../core"`.
4. Code under `Assets/MissionForge/` with asmdefs:
   - `App/` — `SceneFlow` following the state machine in design section 17.3
     (LOBBY → BRIEFING → CONTRACT_VOTE → BUILD → FRR → COUNTDOWN → FLIGHT → DEBRIEF),
     one additive scene per host screen in design section 14.1, with fade transitions.
   - `Data/` — editor script that copies repo `data/` to `Assets/StreamingAssets/data/`
     before play and build; runtime loader that hands JSON text to Core (works in WebGL).
   - `Net/` — WebSocket client behind one interface: managed client on desktop, `.jslib`
     browser bridge on WebGL; reconnect with backoff; envelope per `protocol/messages.md`;
     server URL from a config asset and from the `?server=` query parameter in WebGL.
   - `UI/` — the theme: fonts, colours (colour-blind safe, design section 14.4), panel,
     button and stat-bar styles, readable from across a room at 1080p.
5. **Title scene** at release quality: Earth from orbit with day/night terminator, city
   lights, moving cloud layer, atmospheric rim scattering, starfield, slow camera drift,
   bloom and tone mapping; MissionForge logo; **New Mission** button that asks the server
   for a room and shows the 4-letter code and a QR code of the join URL.
6. **Lobby scene:** player avatars appear as they join (driven by `room.state`), role
   chips, settings panel. Functional with real server messages.
7. Remaining screens of 14.1 exist as styled scenes with their title and layout regions,
   ready for later tasks. No default-skybox or unstyled screens.
8. Build pipeline: an editor method `MissionForge.Build.WebGL` that builds to
   `docs/play/host/` (Brotli off or decompression fallback on, so a static host serves
   it). Commit the build output.

## Acceptance

- Project opens with zero console errors; EditMode tests pass (at least: data loads, Core
  call returns the expected Δv for a known case, envelope round-trips).
- WebGL build in `docs/play/host/` loads in a desktop browser and holds 60 fps at 1080p on
  the title scene (state the measured figure and the machine).
- With `server/` not available yet, the Net layer is tested against a local stub you
  include under `unity/MissionForge/Tools~/`.
- Evidence: screenshots of the title and lobby scenes, Unity test results and the build
  log summary in `orchestration/evidence/T001/`.

## Design references

Sections 14.1, 14.4, 15, 17.1–17.4, 17.8. `orchestration/ARCHITECTURE.md` sections 1, 2, 6.
