# T063: host live-room fixes + WebGL rebuild

Worker: `yousuf-amek` · Unity 6000.6.9f1 · base `origin/main` 0e5f4b03 (T055, PR #255) · machine: Apple M4, macOS.

## 1. FRR Build Bay hook (Preflight README, "Build Bay hook")

| File | Change |
|---|---|
| `App/MissionContext.cs` | One new member: `StartInterlude` (`Func<BuildState, GameCatalog, string, bool>`). The Build Bay calls it after each committed vote. |
| `Screens/TestStand/BuildBayInterludes.cs` (new) | Registers `StartInterlude` at start-up. Loops `PreflightSchedule.After(build, catalog, slot)`: opens the Test Stand (`TestStandFlow.RunAsync`) or the Design Review (`ShowWithinPhase(DesignReview)`), returns true when a screen swap started. If a screen cannot open, it marks the offer/review done and carries on so the bay is never stuck. |
| `Screens/BuildBay/BuildBayScreen.Director.cs` | After each commit: `MissionContext.Build = build`, then the hook. At director start (the bay reloads after every interlude) it re-checks with `slot = null`. Rework re-votes (`build.ReopenedCategory == slot`) go through `DesignReview.CompleteRework`; `MissionContext.ReworkCategory` is cleared when that slot is voted. Before `GoToPhase(Frr)`: `MissionContext.Build = build`. Round ids carry a per-entry counter (`m1.b<entry>.<n>.<slot>`) so ids stay unique across bay reloads. |
| `Screens/BuildBay/BuildBayScreen.cs` | Boot resumes from `MissionContext.Build` when it is the same contract (the bay scene is unloaded during Test Stand / Design Review and FRR rework). The contract is now `-mfContract`, else `MissionContext.ContractId` (the contract the room chose), else C1. |

Why a delegate: `SceneFlow.ShowWithinPhase` unloads the Build Bay scene, so the README's inline `await` cannot live in the
bay's coroutine; and the TestStand / Review / Preflight assemblies all reference the Build Bay, so the bay cannot reference
them back. The TestStand assembly already references Preflight, App and the Build Bay, so the hook body lives there.

Interludes run in live rooms only (or with `-mfInterludes`), so the Build Bay's own rehearsal and evidence runs keep
their uninterrupted vote sequence.

## 2. Debrief honesty

| File | Change |
|---|---|
| `Screens/Flight/Runtime/Session/FlightSession.cs` | `LastFlight` (`FlightSummary`): build flown, Core `FlightResult`, rehearsal flag, MET at end, phases entered. Captured in `End()` (which runs when the phase leaves FLIGHT, before the debrief loads). The flight now flies `HandedOffBuild ?? MissionContext.Build`; `FlewVotedBuild` says whether the voted build flew or the rehearsal C1 stand-in. |
| `Screens/Debrief/Runtime/LiveDebrief.cs` (new) | Maps the last flight + room players (`room.state` nicknames, suit ids, roles) to a `DebriefRecord`; Core's `ScoreCalculator` / `AwardAssigner` do the rest through the existing `CoreDebriefAdapter`. |
| `Screens/Debrief/Runtime/DebriefScreen.cs` | Live room: `PendingDebrief`, else `LiveDebrief.FromLastFlight`; if neither, **"Session summary unavailable"**, no score, no grade, no fixture, only Continue / Codex / Settings. Rehearsal (no room): fixtures as before. |
| `Screens/Debrief/Runtime/DebriefPanels.cs` | The REHEARSAL tag now shows on fixture data in release builds too (it was editor/dev-build only). The fixture picker stays a dev tool. |

Score inputs and where they come from (Core computes every point):

| `ScoreInput` field | Source | Tag |
|---|---|---|
| `Metrics` | Core `FlightResult.Metrics` of the flight | physical (simulation) |
| `CrewLost` / `CrewSafe` / `BoosterRecovered` / `CapsuleRecovered` | contract `Crewed` + outcome; `crew_safe`, `booster_recovered`, `capsule_recovered` metrics | physical (simulation) |
| `BudgetRemainingFraction` | (contract budget − Core `Dashboard` cost) / budget, clamped 0–1 | game_value |
| `ScheduleMarginFraction` | (contract schedule − Core `Dashboard` days) / schedule, clamped 0–1 | game_value |
| `AssistLevelId` | room settings `assistLevel` | game_value |
| `ScienceFraction`, minigames, good calls, predictions, trivia, boosts, KP, facts, per-player award stats | **not measured by the live session yet: 0 / empty** | game simplification |

So a live debrief is honest but conservative: objectives, efficiency and safety come from the real flight and build;
science, teamwork and knowledge terms are 0 until the session records them.

## 3. Flight → Debrief

`Screens/Flight/Runtime/Screens/FlightScreen.cs`: the 12 s (game_value) hand-over after the mission ends now applies to
live rooms too, and also triggers on `feed.IsFinished` (a failure ends the feed). `-mfFlightHold` still holds.

## 4. host_preflight strings

`GameDataSync.SyncProject` copied `data/strings/{ar,es,fr,hi,pt}.host_preflight.json` (PR #239) into
`Assets/StreamingAssets/data/strings/` and listed them in `StreamingAssets/data/index.json` (the only tracked file there;
the rest of the mirror is git-ignored and re-synced by the build preprocessor).

## 5. WebGL build

`Unity -batchmode -quit -projectPath unity/MissionForge -buildTarget WebGL -executeMethod MissionForge.Build.WebGL`
(Brotli, unchanged `Editor/Build.cs`): **Build Finished, Result: Success**, about 4 min, 11:47–11:51 UTC.
Sizes are in `webgl-build-summary.txt`. The largest file, `host.data.unityweb`, is 41.91 MiB (43,949,412 B), under the
49 MiB publish limit.

## 6. Live-room runs (fresh `start:hosted`, scripted phones, no PageDown)

Server: `PORT=10000 RENDER_EXTERNAL_URL=http://localhost:10000 npm --prefix server run start:hosted`, started fresh for
each run. Host: headed Chrome (ANGLE Metal, Apple M4), `MF_HOST_QUERY='&mfFlightRate=3'`; three headless phones
(Ada, Yuri, Sally). `play.mjs` never presses PageDown. Vote timer 20 s, inspect 20 s (lobby defaults).

### Run 1 (room VXAC, 11:56–12:12 UTC): `run1/`

| Step | Seen |
|---|---|
| Lobby, briefing, contract vote | OK; the room chose **C0 First Light** (budget $25.0 M, deadline 60 days) |
| Build Bay | 9 part votes from the live director (`m1.b<entry>.<n>.<slot>` ids, unique across bay reloads) |
| Test Stand interludes (the new hook) | **4 TEST votes opened in the live room** (`TEST-…test.2` … `test.5`), each after a part commit; the bay resumed with the same build after each one (bay entries b1 → b5) |
| After the 4th test (t = 551 s) | **Stall.** The bay came back showing "Next vote opens soon", cost $27.9 M against $27.5 M (Emergency Funding already used: budget +10 %), "Left $−0.4 M". No vote opened for 6 min; stopped at t ≈ 950 s. FRR, flight and debrief **not reached** |

Most likely cause (not confirmed: the host's Unity console was not captured): with Emergency Funding spent and the build
over budget, Core's `VoteOptions.Commit` rejects every option for the next slot ("cannot win: over budget without
Emergency Funding"), so the director stops after 3 attempts (`BuildBayScreen.Director.RunRounds`, "could not be resolved
after 3 rounds"). The live hook made this reachable: the phones voted **Test** on most offers, and each test costs money
and days (game_value, Core `TestCampaign`), which a T055 run without tests never spent. Needs a rebuild to fix (for
example: a test offer is not made, or is Skip-only, when its cost would leave no winnable option; or the director
offers a forced cheapest pick). Not fixed in T063.

### Run 2 (phones vote SKIP on tests and PASS on reviews: `MF_PREFER_QUICK=SKIP,PASS,GO`): `run2/`

Room EUBY, 12:13–12:33 UTC, server restarted fresh. The room chose **C1 Earth Watch** ($90 M, 180 days).

| Step | Seen |
|---|---|
| Lobby, briefing, contract vote | OK |
| Build Bay | 22 of 22 part votes played by the phones (C1 "Vote 12 of 22" etc.), 10 bay entries, round ids unique |
| Test Stand interludes | 4 TEST votes (`test.8` … `test.10`, …), each SKIP, bay resumed 8–17 s later with the same build |
| Design Review interlude | **Live PDR opened** after the propulsion votes (t = 948 s, `phase.set BUILD sub=REVIEW`): real checklist from Core on the room's build (thrust/weight, Δv for the target orbit, restarts, boil-off, budget, launch window, no unfixed flaw; all PASS, 0 findings), phones voted PASS, the bay resumed (`run2/066-…REVIEW-a.jpg`) |
| Remaining | still in the Build Bay at the 12:33 cutoff (vote round #28 = later part votes after the review); **FRR, flight → debrief auto-advance and the live debrief were not reached in a live room** |

So in a live room the hook is verified to open the Test Stand and the Design Review on the voted build and hand back
to the bay. FRR on the real build, the flight → debrief auto-advance and what the live debrief shows are **not
verified in a live room**; they are covered only by the EditMode tests (`LiveDebriefTests`, 469 passed / 0 failed /
1 skipped) and by code reading.

## 7. Not verified / open findings

- Findings from an independent review, not fixed (each needs a WebGL rebuild):
  - HIGH: Test Stand and Design Review do not return to the Build Bay when a vote decides nothing or the offer/build is
    missing. The hook now makes these screens reachable in live rooms.
  - MEDIUM: a skipped interlude's done flag is not written back to the bay session; `MissionContext.Build` is cleared
    only at the Briefing.
  - LOW: `FlightSession.End()` is not idempotent; the Codex treats a live debrief as rehearsal.
