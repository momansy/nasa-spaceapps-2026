# T023 — Unity Mission Control room, boost payoffs, entry effects and audio hooks (package F4)

**Worker:** suggested `yousuf-amek` (Unity MCP, Blender MCP) · **Starts after:** the Unity
foundation on `main` (merged). Steps 2–6 need nothing else; step 7 is best after T016 (flight
feed) is merged. Queue behind T015/T016 on the same worker, or give it to the second Unity worker.

**Owns (create):** `unity/MissionForge/Assets/MissionForge/Screens/MissionControl/`,
`unity/MissionForge/Assets/MissionForge/Art/VFX/Entry/`,
`unity/MissionForge/Assets/MissionForge/Audio/`,
`unity/MissionForge/Assets/MissionForge/Scenes/MF_MissionControl.unity` (+ `.meta`, a showcase
scene), `data/strings/en.host_fx.json` (new string fragment; every key starts with `ui.host.fx.`,
`ui.host.audio.` or `ui.host.voice.`), `orchestration/evidence/T023/`.

**Overlap note:** T016 owns `Art/VFX/`. The subfolder `Art/VFX/Entry/` is carved out for this task;
do not touch any other file under `Art/VFX/`, and if T016 has already created `Art/VFX/Entry/`,
stop and report instead of editing it.

**No settings lock.** T015 (running) holds the only right to change `ProjectSettings/`, `Packages/`
and `Assets/Settings/`, and it passes to T016. Do not change them, including
`EditorBuildSettings` (the scene list) and the package manifest. If a step truly needs such a
change (for example adding `MF_MissionControl` to the build list or the Timeline package), do the
step without it, and list the exact change under **Interface changes** for the lock holder.

**Read only (do not edit):** `core/`, `data/` (except your new fragment), `protocol/`, and
`Assets/MissionForge/{App,Data,Net,UI,Editor,Tests,Vehicle,Screens/BuildBay,Screens/Flight}`,
`Art/Models/`, `Art/Environment/`. If you truly need a hook in those folders, make the smallest
change and list it under **Interface changes**.

## Read first

`GAME_DESIGN.md` 9.1 (phases), 9.6, 10.3, 10.4 (visual payoffs), 11.2 (Mission Control Moment),
14.1, 15 (audio, visual and haptic direction, sound in space), 16; `orchestration/ARCHITECTURE.md`
section 6; `assets/media/style/STYLE_GUIDE.md` (Mission Control lighting, reentry shot direction,
gold celebration versus amber warning, reduced motion); `protocol/messages.md` `mg.summary`,
`sync.meter`, `boost.applied`, `boost.state`, `phase.set`, `flight.event`, `room.state`
(players, `slot`, `avatar.suitId` / `patchId`), `settings.state` (`a11y`); the T015 and T016 briefs
(their interfaces: `VehicleRig`, `IFlightFeed`, `FlightTelemetry`, HUD boost row);
`Assets/MissionForge/Net/RoomClient.cs` (`MessageReceived`, `RoomStateChanged`).

## Goal

The moments that make a room cheer: when the team earns a tier, the host screen answers with a
golden HUD sweep, a slow-motion camera move, a tier sting and a cut to a Mission Control room
where every player's avatar stands up at its console. Entry gets plasma, parachutes and
splashdown. Music follows the phase, and space is silent. Everything degrades gracefully under
reduced motion and works in WebGL.

## Rules

- **Effects never feed the simulation.** Payoffs are display only; bullet-time and Core time are
  not yours to change. A payoff never blocks input or the game flow, lasts ≤ 4 s
  (`game_value`) and is skippable.
- **Event bus, not message snooping.** The host *sends* `mg.summary`, `sync.meter` and friends; it
  does not receive them back. Provide `FxBus` (static, in your `MissionForge.Fx` asmdef) with typed
  events: `TierReached(minigameId, tier, boostGrants, succeededPlayerIds)`, `MomentChosen(momentId)`,
  `BoostApplied(grant)`, `PhaseChanged(phase, flightPhase)`, `FlightEvent(kind)`,
  `RoomPlayersChanged(players)`. Host code that sends those messages publishes to `FxBus` (a later
  integration line, listed under **Interface changes**); you also subscribe to
  `RoomClient.RoomStateChanged` for players and avatars. A bootstrap via
  `[RuntimeInitializeOnLoadMethod]` creates your persistent `FxRoot`, so no App edits are needed.
- **No shaming (16).** Celebrations are whole-room: every avatar celebrates; tier sets the scale.
  Players who missed are never singled out.
- **WebGL first:** built-in Particle System, Shader Graph or URP HLSL that compiles for WebGL 2, no
  VFX Graph or compute. Audio: do not rely on `AudioMixer` effects or DSP; implement buses as
  volume groups in code; browsers start audio only after a user gesture, so show a small "sound on"
  chip until the first gesture.
- **Strings** come from `data/strings/en*.json`; your new keys live only in `en.host_fx.json`
  (must pass `node tools/validate-data.mjs` without warnings).
- **Assets:** placeholders are acceptable for audio only (final audio is package H2). Visuals are
  release quality: no default materials, no debug text. Every generated or authored asset is listed
  with its origin in `Audio/README.md` or `Screens/MissionControl/README.md`.

## Interfaces this task provides

- `MissionForge.Fx` (`Screens/MissionControl/Runtime/`): `FxBus`, `PayoffDirector`,
  `MissionControlStage` (loads `Screens/MissionControl/Resources/MF_MissionControlRoom.prefab`
  with `Resources.Load` into a far-off layer with its own camera, shows it full-screen or as a
  picture-in-picture render texture), `GoldenHudFlash` (its own `UIDocument` with a sort order above
  screens), and the hooks other screens implement: `ISlowMoCameraHost` (target, duration, display
  time scale), `IBoostRowAnchor` (screen point where boost icons fly to). Defaults exist when no
  host implements them.
- `MissionForge.Audio` (`Audio/Runtime/`): `AudioDirector` with `SetMusicState`, `PlayCue(cueId,
  position?)`, `SetAmbientPressureRatio(float)`, `SetEngineBurning(bool)`; `AudioCueLibrary`
  (ScriptableObject: cue id → clips, bus, volume, subtitle key); buses music, exterior, onboard, UI,
  voice.
- `MissionForge.Vfx.Entry` (`Art/VFX/Entry/Runtime/`): `EntryVfxRig` with inputs
  `PlasmaIntensity01`, velocity direction, `ChuteStage` (None, CoverChutes, Drogues, Pilots, Mains,
  Landed) and `Splashdown()`; drivers `FeedEntryDriver` (from T016's `IFlightFeed` when present)
  and `ScriptedEntryDriver` (a seeded curve for the demo and tests).
- **Preferences:** read reduced motion, flashes, subtitles and volumes through `IFxPreferences`.
  Default implementation: room `a11y` flags from `settings.state` plus local defaults. If T024's
  `MissionForge.Settings` (`HostPreferences`) is on `main`, adapt to it; otherwise list the hook.

Document all of it in `Screens/MissionControl/README.md`, `Audio/README.md` and
`Art/VFX/Entry/README.md`.

## Steps (in order; each leaves the project compiling and something showable)

1. **Preflight.** Open the project (Unity 6000.6.9f1); zero compile errors; EditMode tests pass.
   Note which of T015/T016 are on `main` and which of their interfaces exist. If the project does
   not compile on `main`, return `status=blocked` with the errors.
2. **Audio foundation and music state machine.** `Audio/` asmdef, `AudioDirector`, buses, gesture
   unlock, `AudioCueLibrary`. Placeholder clips generated by an editor script into
   `Audio/Placeholders/` (22.05 kHz mono WAV, each < 300 KB): six music loops (calm build lo-fi,
   countdown pulse, soaring ascent, ambient orbit, percussive reentry, triumphant landing), tier
   stings (Bronze, Silver, Gold, Platinum), and cues for ignition, Max Q rumble, staging thunk,
   fairing, chute open, touchdown, splashdown, alert, good call, UI tick. Music states BUILD,
   COUNTDOWN, ASCENT, ORBIT, REENTRY, LANDING, DEBRIEF with 2 s crossfades (`game_value`); a
   mapping table from session phase and flight phase (F0–F14, F7b) to state, in code and README.
   EditMode tests: the mapping table, crossfade gain arithmetic, cue lookup.
3. **Vacuum silence and subtitles (15, 16).** Exterior bus gain follows the ambient pressure ratio:
   full above 0.05, silent below 0.001, smooth between (`game_value`, documented as a game reading
   of "no air, no sound"); the onboard bus keeps a low structural rumble while an engine burns;
   music is unaffected. At the crossing show a caption from your strings (descriptive UI text, not a
   new fact; propose a sourced fact for `data/facts.json` under **Interface changes**). Every
   audible cue has a subtitle or visual cue through a small `SubtitleOverlay` `UIDocument` when
   subtitles are on. EditMode test: gain curve values.
4. **Mission Control room.** `MF_MissionControlRoom.prefab` (and the showcase scene): two rows of
   five consoles (10 seats), a large front wall showing a render texture of the live view (or the
   approved style frame when none), ceiling practicals, small warm work lights, cool screen bounce,
   abstract nonverbal displays (no fake text), style-guide materials. Author geometry with Blender
   MCP (sources in `Screens/MissionControl/Art/Source/`, FBX beside them). Avatars: stylised, diverse
   and gender-neutral simple silhouettes, segmented (head, torso, arms) for procedural animation;
   suit colour from `avatar.suitId`, patch decal from `patchId`; seats by `room.state` `slot`; empty
   seats dimmed. Idle loop: typing, glancing up. Evidence: wide shot with 4 and with 10 avatars.
5. **Celebrations.** Procedural animation sets by tier: Bronze (nods, small claps), Silver (stand
   and clap), Gold ("everyone made it": all stand, arms up, cheer, Sunlight-gold practical lights
   swell), Platinum (Gold plus a restrained flourish: falling paper or light sweep, never confetti
   that hides faces), Mission Control Moment (11.2: the room erupts, avatars stand and cheer, a
   longer cut). Reduced motion: a single held pose with a gentle light change, no camera move.
6. **Boost payoffs.** `PayoffDirector` on `FxBus.TierReached` (tier ≥ Bronze) and `MomentChosen`:
   tier sting; `GoldenHudFlash` (a gold border sweep and boost icons flying to `IBoostRowAnchor`,
   placed and shaped so it cannot be mistaken for an amber warning); a slow-motion camera move via
   `ISlowMoCameraHost` (default: a gentle push-in on the current camera); a Mission Control cut
   (picture-in-picture for Bronze and Silver, full cut for Gold, Platinum and the Moment); a CAPCOM
   praise subtitle (placeholder lines, voice to come). A **rehearsal driver** (editor and
   development builds only, labelled "REHEARSAL") publishes seeded `FxBus` events so every payoff
   can be shown without phones. Reduced motion: no flash (a static gold border fades in and out
   over 1 s), no camera move, sting kept; never more than 3 flashes per second in any mode.
   EditMode tests: tier → payoff plan mapping, reduced-motion plan, skip.
7. **Entry effects (not covered by T016).** In `Art/VFX/Entry/`: plasma sheath with the blunt heat
   shield leading and the glow wrapping the shoulder into the wake (intensity and colour ramp from
   `PlasmaIntensity01`, which `FeedEntryDriver` derives from the feed's heat load fraction), an
   ionised wake trail, heat shimmer; a blackout visual cue for the HUD; parachute sequence matching
   the design's stages (cover chutes, drogues reefed then disreefed, pilots, three mains blooming
   with reefing stages) with animated canopy meshes, not cloth simulation; splashdown spray, ring
   waves and flotation bob. Showcase in `Art/VFX/Entry/Demo/MF_EntryVfxDemo.unity` driven by
   `ScriptedEntryDriver`, using the capsule from `Art/Models/` if T017's capsule is imported, else a
   clean blunt-capsule stand-in authored in your folder (note the swap point). Reduced motion: fewer
   particles, no shimmer, no flicker.
8. **WebGL and performance.** Editor WebGL build to a git-ignored folder (do not commit to
   `docs/play/`; your new scenes are not in the build list, so test the prefab path through an
   existing scene at runtime and the showcase scenes in the editor). Measure median fps at
   1920×1080 during a Gold payoff with 10 avatars and during peak plasma; confirm audio starts after
   the first click in Chrome and Firefox. State the machine.
9. **Review and evidence.** One subagent reviews against this acceptance list and the style guide.

## Acceptance

- Zero console errors from your code; all EditMode tests pass (existing and new), including the
  music mapping, vacuum gain curve, payoff plans and reduced-motion plans.
- In rehearsal, Bronze, Silver, Gold, Platinum and the Mission Control Moment each play end to end
  with sting, HUD treatment, camera move and room cut, with 1, 4 and 10 players, and can be skipped.
- Music changes state through a full phase sequence; exterior sound falls silent above the
  atmosphere while onboard rumble remains during burns; every cue has a subtitle or visual cue.
- No file outside the owned paths changed; no `ProjectSettings/`, `Packages/` or `Assets/Settings/`
  change. `node tools/validate-data.mjs` passes with no new warnings.
- WebGL build succeeds; fps reported (target 60 at 1080p; below 45 is listed as failing).
- Evidence in `orchestration/evidence/T023/`, 1920×1080: room wide with 4 and with 10 avatars;
  Bronze picture-in-picture; Gold full cut; Platinum; Mission Control Moment; golden HUD sweep over
  a flight frame; reduced-motion versions of Gold and of plasma; plasma at peak; drogues; mains
  bloom; splashdown; plus the test summary, a log of a full music state sequence, the WebGL audio
  note and the fps note. The summary lists **Decisions** and **Interface changes** (the `FxBus`
  publish lines host code must add, `ISlowMoCameraHost` / `IBoostRowAnchor` for T016, build-list
  entries for the lock holder).

## Design references

Sections 9.1, 9.6, 10.3, 10.4, 11.2, 14.1, 15, 16; `STYLE_GUIDE.md` (Mission Control, reentry,
reduced motion); protocol `mg.summary`, `sync.meter`, `boost.*`, `phase.set`, `flight.event`,
`room.state`, `settings.state`.
