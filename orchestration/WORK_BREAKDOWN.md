# Work breakdown

Every section of `GAME_DESIGN.md` belongs to a work package below. A package is finished
only when the orchestrator has verified it against the design. Status values: `not started`,
`in progress`, `in review`, `verified`.

Updated: 2026-11-14 (build start).

## Packages

| ID | Package | Design sections | Needs | Status |
|---|---|---|---|---|
| A | **Game data**: parts catalog, contracts, tests, anomalies, roles, boosts, minigame definitions, validation rules, achievements, strings | 3.3, 5, 6.6, 6.8, 6.11, 7, 10.4, 10.5, 13.5 | coding | not started |
| A2 | **Facts and Codex**: 40 facts verified with source URLs, codex entries, myth-or-fact, learning objectives | 12, 19, 21 | coding, web research | not started |
| B1 | **Core build rules**: dashboard metrics, budget and schedule (critical path), reliability and uncertainty, tests, redundancy, anomalies, design reviews, validation | 6.3 to 6.11, 8.1, 8.2 | coding, .NET SDK | not started |
| B2 | **Core flight simulation**: gravity, atmosphere, drag, thrust, RK4 and Kepler, orbital elements, heating, g-load, failure model, phases F0 to F14, assist levels, time warp, aborts | 8, 9.1, 9.3, 9.7, 9.8 | coding, .NET SDK | not started |
| B3 | **Core scoring and session**: boosts and caps, tiers, Team Sync, score, grades, awards, session state machine, replay log, investigation | 9.9, 10.3, 10.4, 11, 17.3, 17.6 | coding, .NET SDK | not started |
| B4 | **Core campaign and modes**: campaign, reputation, tech tree, inventory wear, other modes, leaderboards, spectators | 13 | coding, .NET SDK | not started |
| C | **Protocol and room server**: rooms, join by code and QR, roles and merging, votes (plurality, runoff, ties, veto, abstain), quick votes, pings, reconnect, spectators | 3, 4, 17.1, 17.4, 17.7 | coding | not started |
| D | **Phone client shell**: join, role card, vote screen and part card, 3D part viewer, predict, role consoles and callouts, results, codex, settings | 14.2, 14.3, 14.4, 9.5 | coding | not started |
| E1 | **Minigames, build phase**: MG-01 to MG-06, MG-29, MG-30 | 10 | coding | not started |
| E2 | **Minigames, launch and ascent**: MG-07, MG-08, MG-08b, MG-09, MG-10, MG-10a, MG-11, MG-12 | 10 | coding | not started |
| E3 | **Minigames, orbit**: MG-13 to MG-21 | 10 | coding | not started |
| E4 | **Minigames, entry and after**: MG-22 to MG-28 | 10 | coding | not started |
| F1 | **Unity foundation**: project, render pipeline, Core package wiring, data loading, network bridge, scene flow, WebGL build | 17, 14.1 | Unity | not started |
| F2 | **Unity build phase screens**: title, lobby, briefing, contract vote, Build Bay with live assembly, ghost preview, compare, exploded view, scale reference, test stand, design review, readiness review | 6.1, 6.10, 14.1 | Unity | not started |
| F3 | **Unity flight**: launch pad and countdown, flight view, cameras, HUD, orbit map, pilot controls (keyboard, gamepad, touch), split-screen booster return, minigame overlay | 9.2, 9.4, 9.6, 14.1 | Unity | not started |
| F4 | **Unity effects and audio**: plumes, Mach diamonds, staging, plasma, parachutes, splashdown, Mission Control room with avatars, boost payoffs, adaptive music, voice lines, vacuum silence | 15, 10.4, 11.2 | Unity | not started |
| F5 | **Unity end screens**: debrief, replay, investigation, codex, campaign hub, settings and accessibility | 9.9, 13, 14.1, 16 | Unity | not started |
| G1 | **3D models, vehicle**: every engine, tank size, material look, fairing, booster, separation system, escape system, capsule, heat shield, satellite, lander | 7 | Blender | not started |
| G2 | **3D models, world**: four launch sites, gantry and cranes, Earth, Moon, Mars, station, recovery ships, Mission Control room, avatars | 6.1, 7.1, 9.6, 15 | Blender | not started |
| H1 | **Visual media**: key art, mission briefing cinematics, codex illustrations, patch elements, part card art, milestone cinematics | 13.2, 13.4, 14, 15 | Higgsfield | not started |
| H2 | **Audio**: adaptive music per phase, CAPCOM and Flight Director lines, stings, effects, subtitles | 15, 16 | media tools | not started |
| I1 | **Tests and balance**: unit and regression tests, balance validator (at least 3 valid builds per contract, no dominant build), seeded flight regression | 17.10, 18 | coding | not started |
| I2 | **End-to-end and playtests**: multi-client browser tests with 1, 3, 6 and 10 players, performance, accessibility, localisation and right-to-left | 16, 17.8, 17.10 | coding, browser automation | not started |
| J | **Integration and release**: published builds, room server hosting, judging-day demo script, credits, assumptions register in game | 20, 19 | orchestrator | not started |

## Order of work

1. **Foundation (wave 1):** A, B1, C, F1, G1 (first parts), H1 (art direction). These fix
   the data, the rules interface, the protocol and the Unity project so everything else
   can attach.
2. **Vertical slice (wave 2):** contract C1 Earth Watch playable end to end with four
   phones: lobby to debrief, with MG-07, MG-08, MG-09, MG-10a, MG-13, MG-15, MG-21.
3. **Breadth (wave 3):** all nine contracts, all thirty minigames, all sixteen host screens,
   full parts catalog with models.
4. **Depth (wave 4):** campaign and other modes, accessibility, localisation, audio.
5. **Verification (wave 5):** balance, playtests at 1, 3, 6 and 10 players, performance,
   design coverage check section by section.

## Workers

| Worker | Model | Special tools | First assignment |
|---|---|---|---|
| `cyrex04` | Claude Fable 5.2 | Unity MCP, Blender MCP | F1 (T001), then F2 |
| `yousuf-amek` | Claude Fable 5.2 | Unity MCP, Blender MCP | G1 (T006), then Unity scenes in its own folders |
| `momansy` | Codex | Higgsfield MCP (whole balance approved) | H1 (T005) |
| `mohammed-alainieh` | Claude Opus 5.5, high | Higgsfield connector | C (T004) |
| `ahmed-saeed-amek` | Claude Opus 5.5, high | — | B1 (T002) |
| `kingrma` | orchestrator, local subagents | browser | protocol and data schemas, A (T003), review, merge, verification |

Two workers have Unity. To avoid scene merge conflicts, a Unity task owns specific scene
and prefab folders, and only one task at a time may change `ProjectSettings/` and
`Packages/`.
