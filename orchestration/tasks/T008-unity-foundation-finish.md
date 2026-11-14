# T008 — Finish the Unity foundation (package F1, continuation of T001)

**Worker:** `yousuf-amek` (Unity MCP, Blender MCP) · **Owns:** `unity/MissionForge/`, `docs/play/host/`, `orchestration/evidence/T008/`

Task T001 was cut off by a usage limit after 53 minutes. Its work is merged to `main`
unreviewed and **has never been confirmed to compile**: a Unity 6000.6.9f1 project at
`unity/MissionForge/` with scene flow, one scene per host screen, data loading, a
WebSocket layer, UI theme, Earth shaders and EditMode tests. Read
`orchestration/tasks/T001-unity-foundation.md` for the original goal and acceptance; this
task finishes it. Do not start a new project and do not rewrite what works.

Work in this order and keep the project compiling after each step.

1. **Open and repair.** Open the project in Unity 6000.6.9f1. Fix every compile error and
   console error. Run the EditMode tests and fix failures. Report what was broken.
2. **Attach the real contracts** (they did not exist when T001 was written):
   - `core/` is now on `main`: the local package reference
     `"com.missionforge.core": "file:../../../core"` must resolve and a Core call must work
     from an EditMode test (rocket equation with a known value).
   - `data/` now holds the full catalog (102 parts, contracts, tests, anomalies, roles,
     boosts, strings split across `data/strings/en*.json`). The data sync must copy it to
     `StreamingAssets/data/` and the loader must merge all `en*.json` string files.
   - `protocol/messages.md`, `protocol/schema/` and `protocol/ts/messages.ts` are the wire
     contract. Reconcile `Net/ProtocolNames.cs`, `Net/RoomModels.cs` and the envelope code
     with them exactly (message type names, field names, handshake, resume). Replace
     anything T001 guessed.
3. **Style.** `assets/media/style/STYLE_GUIDE.md` is now the art direction: apply its
   palette, typography guidance, material and lighting recipes to the UI theme and the
   title scene.
4. **Title scene at release quality** (T001 step 5) and a **working lobby** (step 6)
   driven by real `room.*` messages against the stub server in `Tools~/`.
5. **Models.** If the rocket kit from task T006 is in the repository, move or reference it
   under one art root (`Assets/MissionForge/Art/Models/`), fix import scale and
   orientation, and show one assembled vehicle on the Build Bay scene's pad as proof.
6. **WebGL build** to `docs/play/host/` through the editor build method, committed, with
   compression set so a static host serves it. Check it loads in a desktop browser and
   state the measured frame rate and the machine.
7. **Housekeeping.** Remove files that should not be tracked (`.vscode/`, `*.slnx`); keep
   `THIRD_PARTY.md` accurate, with source and licence for every texture and font.
8. **Evidence** in `orchestration/evidence/T008/`: screenshots of the title and lobby
   scenes at 1920×1080, the Unity test result summary, the build log summary.

## Acceptance

The acceptance list of T001, plus: zero console errors on open, EditMode tests green,
protocol names verified against `protocol/messages.md` by a test that reads the schema
file names, and the WebGL build present in `docs/play/host/`.

This is a professional 3D game: the title scene is the first thing a judge sees.
