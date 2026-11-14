# T024 — Unity end screens: debrief, replay, investigation, Codex, campaign hub, settings (package F5)

**Worker:** suggested `cyrex04` (Unity MCP) after T017, or the next free Unity worker ·
**Starts after:** the Unity foundation on `main` (merged). Best after T011 (Core scoring and
session) is merged; until then every screen runs on fixtures behind the interfaces below.

mesh-model: sonnet
mesh-effort: high

**Owns (create):** `unity/MissionForge/Assets/MissionForge/Screens/Debrief/`, `Screens/Codex/`,
`Screens/Campaign/`, `Screens/Settings/`; the scenes
`unity/MissionForge/Assets/MissionForge/Scenes/MF_Debrief.unity`, `MF_Codex.unity`,
`MF_CampaignHub.unity`, `MF_Settings.unity` (+ `.meta`); `data/strings/en.host_end.json` (new string
fragment; every key starts with `ui.host.debrief.`, `ui.host.codex.`, `ui.host.campaign.` or
`ui.host.settings.`); `orchestration/evidence/T024/`.

**No settings lock.** T015 (running) holds the only right to change `ProjectSettings/`, `Packages/`
and `Assets/Settings/`, then T016. Do not change them. If a step truly needs such a change, do the
step without it and list the exact change under **Interface changes**.

**Read only (do not edit):** `core/`, `data/` (except your new fragment), `protocol/`,
`Assets/MissionForge/{App,Data,Net,UI,Editor,Tests,Vehicle}`, every other `Screens/` folder, `Art/`,
`Audio/`. The existing `UI/Layouts/{Debrief,Codex,CampaignHub,Settings}.uxml` are T001 drafts:
build your own layouts in your folders and point each scene's `UIDocument` at them; do not delete
the old files. Apply text scale and high contrast at runtime on each document's root or on a
runtime clone of the panel settings; never edit `UI/MissionForgePanelSettings.asset` or the shared
theme files. Copies of the scenes under `Assets/MissionForge/Editor/MF_*.unity` are not yours; if
they are stale duplicates, report it.

This is a long package for a small plan. **Finish and verify one screen before the next**, in the
order below; each step leaves the project compiling and the screen showable in rehearsal. Use at
most one subagent, for the final review. **Split points:** steps 1–4, then 5–6, then 7–10.

## Read first

`GAME_DESIGN.md` 2.2, 9.9, 11.3 to 11.5, 12 (12.1 respect, 12.2 channels), 13.2 to 13.6, 14.1
(screens 13–16), 14.4, 15, 16; `orchestration/ARCHITECTURE.md` section 6;
`assets/media/style/STYLE_GUIDE.md` (palette, status language, typography at 1920×1080: 32 / 24 /
64 px, high contrast); `protocol/messages.md` `debrief.score`, `debrief.awards`, `debrief.facts`,
`codex.unlock`, `settings.set`, `settings.state` (`RoomA11y`), `room.state`, `mg.start`,
`mg.action`, `mg.state`, `mg.summary`; `data/facts.json`, `data/achievements.json`,
`data/awards.json`, `data/scoring.json`, `data/schema/codex.schema.json`; briefs T011 (Scoring,
Session, Investigation, LessonsLearned, Retry), T014 (CampaignState), T016 (`IFlightFeed`,
`RecordedFlightFeed`) and T022 (the MG-28 contract, step 8);
`Assets/MissionForge/App/ScreenController.cs`, `SceneFlow.cs` (overlays: Codex and Settings).

## Rules

- **Core is the only source of numbers;** Unity formats them. Score, grade, awards, investigation,
  lessons, retry and campaign values come from Core types when they are on `main` and otherwise from
  fixtures. Never reimplement a rule; a fixture is data, not logic.
- **Interfaces** in `Screens/Debrief/Runtime/Sources/` (asmdef `MissionForge.EndScreens.Sources`,
  referenced by the other three folders): `IDebriefSource` (score breakdown, objectives, grade and
  title, awards per player, KP, facts collected, timeline events, players with avatars,
  `retryAvailable`), `IReplaySource`, `IInvestigationSource`, `ICodexSource`, `ICampaignSource`.
  Each has a `Fixture…` implementation reading JSON from `<folder>/Fixtures/` and, where the Core
  type exists on `main`, a `Core…` adapter. Fixtures: C1 success, C1 failure by pogo, C3 crewed
  partial with a capsule recovery, a 10-player award spread, a mid-campaign agency.
- **Rehearsal:** editor and development builds show a "REHEARSAL" label when a fixture is in use.
- **Facts:** show only facts whose status is not `rejected`; show the citation from
  `fact.<id>.source` and a small "source being checked" badge while `unverified`. Real tragedies
  appear only with a respectful tone (12.1.5); crewed-failure replays never depict crew harm.
- **Look:** release quality (no default UI, no debug text), 32 px body / 24 px labels / 64 px titles
  at 1920×1080, every number with its unit, status as colour + shape + label + border, gold
  celebration distinct from amber warning. Keyboard and gamepad navigation with a visible Signal
  focus outline. Text from `data/strings/en*.json`; existing keys first (`score.*`, `grade.*`,
  `award.*`, `achievement.*`, `fact.*`, `contract.*`), new ones only in `en.host_end.json`.
- **WebGL first:** UI Toolkit, no packages you would have to add.

## Steps (in order)

1. **Preflight.** Open the project (Unity 6000.6.9f1), zero compile errors, EditMode tests pass;
   note which of T011, T014, T016, T023 are on `main`. If the project does not compile, return
   `status=blocked` with the errors.
2. **Sources and fixtures.** The interfaces, fixture JSONs, fixture readers and any Core adapters
   available now. EditMode tests: each fixture maps to view models with the expected values; the
   Core adapter (if present) gives the same breakdown as `ScoreCalculator.Compute` for the same input.
3. **Settings and accessibility overlay (16).** `Screens/Settings/Runtime/` (asmdef
   `MissionForge.Settings`, no dependencies on other screens) with `HostPreferences`: master, music,
   effects and voice volume 0–1, subtitles, text scale 100–200 %, high contrast, reduced motion,
   language (right-to-left mirrors the layout), persisted with `PlayerPrefs` (no personal data) and
   raising a change event. Room-wide flags (`a11y`: slow timers, relaxed minigames, reduced motion,
   high contrast, subtitles, explain tooltips) and lobby settings (assist level, vote timers, tally
   visibility) are sent with `settings.set` through the existing room client and reflect
   `settings.state`. `HostPreferences` is the hook T023's audio reads. Applying text scale and high
   contrast to every open screen works without editing other screens (runtime root classes).
   Evidence: settings at 100 %, at 200 % with RTL, and high contrast.
4. **Debrief (screen 13).** Grade and title; score breakdown as the 11.3 formula with each term
   counting up (reduced motion: no count-up) and the multipliers; objectives met / not met; a mission
   timeline strip (phases, minigame tiers, boosts, Good Calls, anomalies, failure point); awards per
   player with avatars (positive only, every player at least one); facts collected with citations;
   KP earned; "your rocket vs. a real one" comparison (12.2) if the data is available, otherwise
   hidden; buttons Retry (when `retryAvailable`), Codex, Continue. Evidence: success, failure and 10
   players.
5. **Codex (screen 14, overlay).** Categories: physics and what the game simplifies (8.3), parts
   with real-world twins, facts, lessons learned, milestones, minigames. `ICodexSource` reads
   `data/codex.json` when it exists (`codex.schema.json`) and otherwise synthesises entries from
   facts, parts, minigames, achievements and the Core lesson table. Locked and unlocked states (from
   `codex.unlock` and campaign state), entry view with an illustration slot (approved T018 art copied
   into `Screens/Codex/Art/` only if it exists), citation and verification badge, and the optional
   imperial-units toggle with the Mars Climate Orbiter lesson (14.4, fact F01).
6. **Campaign hub (screen 15).** Agency name and patch, reputation meter, contracts board (2–3
   offers with difficulty and reward), tech tree (nodes bought with KP, each naming the real
   technology it represents), hardware inventory with wear and refurbish cost, budget carry-over,
   insurance, milestones and the agency hall of mission patches; from `ICampaignSource` (T014's
   `CampaignState` when on `main`).
7. **Instant replay of a failure (9.9.1).** From `IReplaySource`: if T016's `IFlightFeed` /
   `RecordedFlightFeed` and T015's `VehicleAssembler` are on `main`, replay the last seconds before
   the failure from the best camera at ×0.25 (`game_value`) inside `MF_Debrief`, reusing those types
   read only; otherwise a 2-D telemetry replay (altitude, q, g-load and the failing channel traced to
   the failure marker). Skip and pause controls; reduced motion: no camera move.
8. **Root-cause investigation, lessons learned, retry (9.9.2–4).** The host view of MG-28: clue
   cards, the chain of evidence, cause options and team votes, then the reveal with the real-world
   parallel and a Codex link, the Lessons Learned card (`LessonsLearned.For`) and Retry
   (`Retry.Prefill` → back to the Build Bay through the app navigator). The host keeps MG-28's shared
   state with exactly T022's contract: common params `cause_options` (4 indices into the
   `failure_mode` enum of `data/schema/common.schema.json`), `cause_correct`, `clues`, `chain_len`;
   per-player `slot`, `cards`; actions `place` [clueIndex, chainSlot], `clear` [chainSlot], `vote`
   [optionIndex]; shared `chain`, `votes`, `locked`. Write the reducer as pure C# in
   `Screens/Debrief/Investigation/` with EditMode tests, send `mg.start` (from
   `Investigation.Open` when T011 is on `main`, else a fixture), broadcast `mg.state` at ≤ 10 Hz,
   and close with `mg.summary` (tier per protocol section 10, through Core `Tiers` when available).
   Mirror the clue table from `client/src/minigames/MG-28/README.md` if present; otherwise define it
   in your folder with the same shape and list it under **Interface changes** (proposed
   `data/investigation_clues.json` so phone and host share one table).
9. **Polish, accessibility, performance.** RTL, 200 % text and high contrast on all four screens,
   reduced motion, keyboard and gamepad navigation. Editor WebGL build to a git-ignored folder (do
   not commit to `docs/play/`); median fps at 1920×1080 on the debrief with the count-up and on the
   campaign hub; state the machine.
10. **Review and evidence.** One subagent reviews against this acceptance list and the style guide.

## Acceptance

- The four scenes open with zero console errors from your code; all EditMode tests pass (existing and
  new): fixture mapping, Core adapter parity where present, settings persistence and the
  `settings.set` patch shape, the MG-28 reducer (place, clear, vote, lock, stale action counters).
- In rehearsal: a C1 failure runs debrief → replay → investigation → lessons → retry hand-off, and a
  C1 success runs debrief → campaign hub; Codex and Settings open as overlays from both.
- No rejected fact is shown; unverified facts carry the badge; awards are positive only.
- No file outside the owned paths changed; no `ProjectSettings/`, `Packages/` or `Assets/Settings/`
  change; `node tools/validate-data.mjs` passes with no new warnings.
- WebGL build succeeds; fps reported (target 60 at 1080p; below 45 is listed as failing).
- Evidence in `orchestration/evidence/T024/`, 1920×1080: debrief success, failure and 10 players;
  replay frame; investigation board mid-vote; reveal with lesson card; Codex list and entry; campaign
  hub (board, tech tree, inventory, agency hall); settings at 100 %, 200 % RTL and high contrast;
  reduced-motion debrief; plus the test summary and the fps note. Steps not reached are listed as not
  done. The summary lists **Decisions** and **Interface changes**.

## Design references

Sections 2.2, 9.9, 11.3–11.5, 12.1, 12.2, 13.2–13.6, 14.1, 14.4, 16; protocol `debrief.*`,
`codex.unlock`, `settings.*`, `mg.*`; briefs T011, T014, T016, T022.
