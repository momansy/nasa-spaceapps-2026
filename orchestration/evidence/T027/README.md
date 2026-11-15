# T027 evidence: pre-flight screens (briefing, contract vote, test stand, design reviews, FRR)

## How these were captured

- **Player:** macOS development player built from this branch with the rehearsal compiled in (`MF_REHEARSAL`):
  `Unity -batchmode -quit -buildTarget OSXUniversal -executeMethod MissionForge.Screens.Preflight.Editor.PreflightBuilds.MacEvidence`.
  Output goes to the git-ignored `unity/MissionForge/Builds/T027-mac/`.
- **Runner:** `Screens/Preflight/Evidence/PreflightEvidence.cs`. It does nothing unless the player is started with
  `-mfPreShots <dir> -mfPreScript <name>`, and it is never compiled for WebGL. It walks the legal phase path, lets the
  rehearsal driver (or the real room) feed the screens, writes 1920 × 1080 PNGs and logs, then quits.
- **Machine:** Apple M4 (Mac mini), macOS 26.6.2, Metal, Unity 6000.6.9f1.
- **Rehearsal shots** show the "Rehearsal" tag. The `server_*` shots come from a real room and have no tag.

## Screens

| File | What it shows | How |
|---|---|---|
| `briefing_frame1.png`, `briefing_frame2.png` | C1 Earth Watch briefing over the approved T005 cinematic (StreamingAssets URL, VideoPlayer). Contract card with Δv, budget (game-scaled) and schedule; objectives; constraints; one subtitled CAPCOM sentence | `-mfPreScript briefing -mfContract C1` |
| `briefing_reduced_motion.png` | Reduced motion: a still frame, all text at once | `+ -mfReducedMotion` |
| `contract_inspect.png`, `contract_vote.png`, `contract_award.png` | CONTRACT vote over Core's `ContractsBoard.Offer` (C2, C1, C0). INSPECT stage; VOTE with tallies, voters and timer ring; FLIGHT tiebreak; "Contract awarded" reveal with objectives and constraints | `contract` |
| `contract_*_rtl_200.png` | Same, right-to-left at 200 % text (stacked cards that scroll) | `+ -mfRtl -mfText200` |
| `test_hot_fire_vote/cell/results.png` | TEST vote, engine hot-fire test cell, results card | `test -mfTest engine_hot_fire -mfRehearsalLean TEST` |
| `test_shake_*.png` | Same flow for the vibration (shake) test | `test -mfTest vibration_test` |
| `test_thermal_vac_*.png` | Same flow for the thermal-vacuum test | `test -mfTest thermal_vacuum_test` |
| `test_flaw_results.png`, `test_flaw_failure_vote.png` | Core reveals a flaw (roll 0.249 against an 80 % chance), then the Test Failure vote (fix +1 $M +3 days, fly as-is, swap part). The board voted Fix | `test -mfTestFlaw` |
| `review_pdr*.png` | Clean PDR: Core's PDR checklist all passing, Pass / Rework vote, "Review passed" | `review -mfReview PDR` |
| `review_cdr*.png`, `review_rework_vote.png` | CDR with a Major finding (over budget by 11.9 $M after a test campaign), the vote, the rework category vote (Core fee and +2 days), "Rework ordered" | `review -mfReview CDR -mfReviewMajor -mfRehearsalLean REWORK` |
| `frr_mid_poll.png`, `frr_nogo_discussion.png`, `frr_go.png` | FRR: readiness summary from Core's `Dashboard` and `DesignReview.Run(Frr)`; console board in call order with the called console highlighted and its timer; NO-GO → 15 s discussion → re-poll → "GO for launch" → COUNTDOWN | `frr` |
| `frr_*_high_contrast.png` | FRR in high contrast (no imagery behind text) | `+ -mfHighContrast` |
| `frr_blocker_to_build.png` | Forced Blocker: one vote left undecided, so Core reports "No part chosen for …". The FRR sends the team back to BUILD to vote that category (no rework fee) | `frr_blocker -mfFrrBlocker` |
| `frr_rework_offered.png`, `frr_rework_vote.png` | Two NO-GO rounds: Core offers Rework, then the REVIEW vote, the rework category vote and BUILD | `frr_rework -mfNoGoRounds 2 -mfRehearsalLean REWORK` |
| `server_contract_vote.png`, `server_frr_*.png` | **Real room server** (`server/`, `npm run dev` on port 8790) with four scripted phones (`Screens/Preflight/Tools~/phones.mjs`): online contract vote and online FRR poll (NO-GO round, re-poll, GO) | `server -mfServerUrl ws://localhost:8790` |

## Logs

- `flow_log.txt`: C1 rehearsal from BRIEFING to COUNTDOWN with no timeouts. Contract vote (C1, FLIGHT tiebreak) →
  BUILD → PDR (pass) → CDR (pass) → FRR. FRR round 1 had 4 NO-GO consoles, so 15 s discussion; round 2 all GO; then
  COUNTDOWN.
  - The flow does not include a test. Tests are shown separately above. The Build Bay hook that would chain them is in
    `Screens/Preflight/README.md`.
- `evidence_log_rehearsal.txt`: every rehearsal capture with the poll outcomes, review results and test rolls.
- `server_host_log.txt`, `server_phones_log.txt`: the real-server run (room TNDR, 4 phones). Phones voted once each
  and answered two poll rounds each, with zero server errors.
  - One finding: the first contract round was opened a few ms before the app's `phase.set CONTRACT_VOTE`, and the
    server cancelled it with PHASE_CHANGE.
  - The screen reopened the round by itself and the vote completed.
  - A 0.75 s settle delay before the first round was then added (not re-run against the server).
- `tests.txt`: EditMode results, 466 passed, 0 failed, 1 skipped (the skip is pre-existing:
  `KitShaders_AreFound_AndSupported`). The 15 T027 tests are listed.
- `fps.txt`: frame rate notes.
