# Pre-flight screens (T027)

Mission Briefing, Contract Vote, Test Stand, Design Review (PDR / CDR) and Flight Readiness Review for the host.
Core is the only source of numbers. The room server owns votes and polls. Unity only shows them and applies the results
through Core.

| Folder | Assembly | What it holds |
|---|---|---|
| `Screens/Preflight/Runtime/` | `MissionForge.Preflight` | Shared runtime: `PreflightSession` (room adapter), `PreflightScreen` (base controller), vote panels, `PollModel`, `PreflightSchedule`, `PreflightVotes`, `PreflightEvents`, contract views, rehearsal driver |
| `Screens/Preflight/UI/Preflight.uss` | — | One sheet for all five screens; tokens from the shared theme only |
| `Screens/Preflight/Evidence/` | `MissionForge.Preflight.Evidence` (not WebGL) | Desktop evidence runner (`-mfPreShots <dir> -mfPreScript <name>`), inert without the flag |
| `Screens/Preflight/Editor/` | `MissionForge.Preflight.Editor` | `PreflightBuilds.MacEvidence` (dev player with `MF_REHEARSAL`) and `PreflightBuilds.WebGL`, both into the git-ignored `Builds/` |
| `Screens/Briefing/` | `MissionForge.Screens.Briefing` | `BriefingScreen` → `MF_Briefing` |
| `Screens/ContractVote/` | `MissionForge.Screens.ContractVote` | `ContractVoteScreen` → `MF_ContractVote` |
| `Screens/TestStand/` | `MissionForge.Screens.TestStand` | `TestStandScreen`, `TestStandFlow` → `MF_TestStand` |
| `Screens/Review/` | `MissionForge.Screens.Review` | `DesignReviewScreen` → `MF_DesignReview`; `FrrScreen` → `MF_FlightReadinessReview`; `ReviewSlots` |

## Interface

- **`PreflightSchedule.After(BuildState, GameCatalog, string committedSlot) → Interlude`**. `Interlude` is one of
  `None`, `TestOffer(TestOffer)` or `Review(ReviewKind)`. Call it after each `vote.commit`. Run the interlude it names
  and mark it with `MarkTestOffered` or `MarkReviewDone`. Then call it again with `committedSlot = null` until it
  returns `None`.
- **`TestStandFlow.RunAsync(SceneFlow, BuildState, TestOffer) → Task<(BuildState build, TestOutcome outcome)>`**. Shows
  the Test Stand and runs the TEST vote, the test and the Test Failure vote. It completes when the screen hands back to
  the Build Bay. `outcome` is null when the team skipped. `TestStandFlow.MinigameTier` is where T026 puts the tier of
  the test's minigame; it stays 0 without T026.
- **Design Review.** Write the build to `MissionContext.Build`, then call `ShowWithinPhase(ScreenId.DesignReview)`. The
  kind is PDR until the build carries the PDR-done flag, then CDR. When it closes, `PreflightEvents.ReviewClosed(kind,
  passed)` fires. `MissionContext.Build` then holds the reviewed build, and `MissionContext.ReworkCategory` the reopened
  category (null on Pass).
- **FRR** is a phase (`GamePhase.Frr`). It reads `MissionContext.Build`. On all-GO it raises
  `PreflightEvents.FrrConcluded(PollOutcome.Go, PollResult)`; the console call order is `PollResult.Answers`. T026 fires
  MG-07 at countdown F1 from this event. After the hold it goes to COUNTDOWN. A Rework goes back to BUILD with
  `MissionContext.ReworkCategory` set.
- **Other `PreflightEvents`:** `BriefingFinished(locked)`, `ContractChosen(contractId)`, `TestCompleted(TestOutcome)`.
- **`MissionContext`** (in `App/`, see the interface changes below) carries `LockedContractId`, `OfferedContractIds`,
  `ContractId`, `Seed`, `Build` and `ReworkCategory` across scene swaps. It holds state only, no rules.

## Build Bay hook (T015's owner must add this; T027 does not edit `Screens/BuildBay/`)

After each committed vote in `BuildBayScreen.Director`:

```csharp
MissionContext.Build = build;
for (string slot = committedSlot; ; slot = null)
{
    Interlude next = PreflightSchedule.After(build, catalog, slot);
    if (next.Kind == InterludeKind.None) break;
    if (next.Kind == InterludeKind.TestOffer)
    {
        (build, _) = await TestStandFlow.RunAsync(App.Flow, build, next.Offer);   // marks the offer itself
    }
    else
    {
        App.Flow.ShowWithinPhase(ScreenId.DesignReview);                          // marks the review itself
        var closed = new TaskCompletionSource<bool>();
        void OnClosed(ReviewKind k, bool passed) => closed.TrySetResult(passed);
        PreflightEvents.ReviewClosed += OnClosed;
        await closed.Task;
        PreflightEvents.ReviewClosed -= OnClosed;
        build = MissionContext.Build;
    }
}
// When the bay reopens with MissionContext.ReworkCategory set: re-vote that category, then call
// DesignReview.CompleteRework(build, catalog, newPartId) and clear MissionContext.ReworkCategory.
// Before GoToPhase(GamePhase.Frr): MissionContext.Build = build.
```

Until this hook exists, the screens run from their rehearsal fixtures in the editor and in `MF_REHEARSAL` players. A
release build with a room has no build to review, so it logs an error.

## PreflightSchedule rules (all `game_value` decisions)

- At most one part test per committed vote. It is the first test, in `data/tests.json` order, that applies to the part
  just committed and has not been offered.
- Generic any-part tests (component qualification) are not scheduled automatically.
- Engine and stage tests are offered once per slot. Stage tests are offered at the stage's tank vote, when the stage is
  complete. Every other test is offered once per mission.
- PDR runs once the next vote is Avionics (design 6.2, step 16) or later, or when no votes remain. CDR runs when no
  votes remain.
- Whole-vehicle tests (wet dress rehearsal) are offered once, just before the CDR.

## Other decisions

- **Contract offer:** the host's lock (`MissionContext.LockedContractId`, or `-mfContract` for demos), else Core's
  `ContractsBoard.Offer` for a new agency with the session seed. Campaign mode should set `OfferedContractIds` from its
  own `CampaignState`.
- **Locked contract:** the phase machine allows only BRIEFING → CONTRACT_VOTE. The Contract Vote screen therefore shows
  the award for the locked contract, with no vote, and then moves on to BUILD.
- **Difficulty marker on contract cards:** a display-only level from the contract's own numbers (crewed, entry above
  10 km/s or Δv above 11 km/s → 3; Δv above 9.6 km/s or more than one upper-stage start → 2; otherwise 1). Core has
  no difficulty field.
- **Cancelled or rejected rounds:** never committed. Reopened up to 2 times; after that the safe default applies:
  - Review: Pass if Core allows it, otherwise Rework.
  - Test: Skip.
  - Test Failure: swap part.
  - Rework category: the first category listed.
- **Fewer than 2 options:** no vote is held (protocol minimum); the only option is the decision. Rework choices are
  capped at 10.
- **Rework choices** are the decided categories the issues name: the `category` argument, or Core's
  `ValidationRules.RequiredCategories` for the rule. When no issue names one (budget or schedule findings), the three
  decided categories with the highest re-integration fee are offered.
- **FRR Blocker "no part chosen" (`rev_incomplete`):** there is no rework vote. The screen goes back to BUILD with that
  category in `MissionContext.ReworkCategory`, so the bay votes it with no fee.
- **Timing (s):** briefing 60 maximum; award hold 6; FRR GO hold 4; rework notice 4; review reading time 5; review
  outcome hold 3; test cell 4; test results hold 5. The FRR discussion is Core's `FrrPoll.DiscussionSeconds` (15 s).

## Rehearsal (editor and `MF_REHEARSAL` players only, labelled "Rehearsal" on screen)

`PreflightRehearsalChannel` feeds seeded `vote.*` and `poll.*` envelopes through the same handlers the room uses.
Votes come from the Build Bay's `RehearsalVoteChannel`, with the stage plan from protocol section 7. Polls follow
protocol section 8.

Flags (command line, or the page URL in WebGL):

| Flag | Effect |
|---|---|
| `-mfPlayers 1\|4\|10` | Number of rehearsal players |
| `-mfNoGoRounds n` | FRR poll rounds that contain a NO-GO |
| `-mfHiddenTallies` | Hide vote tallies |
| `-mfRehearsalPace f` | Pace multiplier for the rehearsal timings |
| `-mfSeed n` | Session seed |
| `-mfContract Cn` | Lock the contract |
| `-mfReview PDR\|CDR` | Force the review kind |
| `-mfReviewMajor` | Run Core tests until a finding (Major) appears |
| `-mfFrrBlocker` | Leave the last vote undecided so the FRR has a Blocker |
| `-mfTest <id>` | Offer this test at the Test Stand |
| `-mfTestFlaw` | Pick an offer whose Core run reveals a flaw |
| `-mfRehearsalLean <optionId>` | List that option first for the synthetic voters |
| `-mfRtl -mfText200 -mfHighContrast -mfReducedMotion` | Accessibility modes |
