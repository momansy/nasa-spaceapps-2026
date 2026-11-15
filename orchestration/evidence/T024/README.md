# T024 evidence: Unity end screens (debrief, replay, investigation, Codex, campaign hub, settings)

All screenshots are 1920 × 1080 captures of the full frame (3D shell scene, post-processing and UI) from a macOS
**development** player built from this branch (`MissionForge ▸ T024 ▸ Build macOS evidence player`, output in the
git-ignored `unity/MissionForge/Builds/T024-mac/`). The evidence runner `Screens/Debrief/Evidence/EndScreensEvidence*.cs`
is inert unless the player starts with `-mfEndShots <folder>`. It is never compiled into WebGL. It opens the host on the
Debrief and steps through the states below:

```
MissionForge.app/Contents/MacOS/MissionForge -screen-width 1920 -screen-height 1080 -screen-fullscreen 0 -mfEndShots <dir>
MissionForge.app/Contents/MacOS/MissionForge -screen-width 1920 -screen-height 1080 -screen-fullscreen 0 -mfEndShots <dir> -mfEndRetryPass
```

The data comes from rehearsal fixtures, so every screen shows the REHEARSAL tag. Core computes every number: score,
grade, awards, tiers, contract offers, tech prices, wear and refurbishment, and lessons.

Machine: Apple M4 (Mac mini, macOS 26.6.2), Metal, Unity 6000.6.9f1.

## Screens

| File | What it shows |
|---|---|
| `debrief_success.png` | C1 success: grade A (gold plate and crown), the 11.3 formula after its count-up (4,500 + 280 + 0 + 1,200 + 650 + 180 = 6,810 pts × 1.00 × 1.20 = 8,172 pts), objectives met/not met, timeline strip, awards, facts with citations, KP chip |
| `debrief_failure.png` | C1 pogo failure: grade D, Mission lost, failure card (T+74.2 s, Max Q), failure point on the timeline, Replay / Investigate / Retry |
| `debrief_10_players.png` | Ten players. Every player has at least one positive award, from Core `AwardAssigner` |
| `debrief_c3_crewed_partial.png` | C3 crewed partial: crew-safe and capsule-recovered chips, Flight Director × 1.25, boosts × 1.10, grade B |
| `debrief_reduced_motion.png` | Reduced motion: captured 0.3 s after binding, the values are already final (no count-up) |
| `debrief_200_rtl.png`, `debrief_high_contrast.png` | 200 % text with Arabic right-to-left mirroring; high contrast |
| `debrief_keyboard_focus.png` | Keyboard and gamepad: the Signal focus ring moved with navigation events (path in `evidence_log.txt`) |
| `replay_frame.png` | Instant replay: 2-D telemetry (altitude, q, g-load from T016's recorded C1 ascent, plus the failing pogo channel), playhead at × 0.25 and the failure marker |
| `investigation_mid_vote.png` | MG-28 host board mid-vote: clue cards with owners, partly built chain of evidence, live votes |
| `investigation_200_rtl.png` | The same board at 200 % with RTL |
| `investigation_reveal_lesson.png` | Reveal: root cause, real-world parallel (fact F07 with its source), Lessons Learned card from Core, Open in the Codex, Retry |
| `flow_retry_build_bay.png` | Retry hand-off: the host walked Debrief → Lobby → Briefing → Contract → Build with the lesson flags (see log) |
| `codex_list_physics.png` | Codex list: the ten simplifications from design 8.3, each with "what the game simplifies" |
| `codex_entry_part_imperial.png` | Part entry (Merlin 1D twin) with the imperial toggle on: kN with lbf, t with lb, and the Mars Climate Orbiter lesson (F01, verified) |
| `codex_entry_lesson.png`, `codex_entry_locked.png` | Lesson entry with its parallel, and a locked entry with its unlock hint |
| `codex_200_rtl.png`, `codex_high_contrast.png` | Codex at 200 % with RTL, and in high contrast |
| `campaign_hub.png` | Campaign hub: agency, reputation, KP, carry-over, insurance, contracts board (Core `ContractsBoard.Offer`), tech tree, inventory with wear, milestones, agency hall |
| `campaign_hub_after_research.png` | After buying Methalox through Core `TechTree.Purchase` (15 → 5 KP) |
| `campaign_hub_200_rtl.png`, `campaign_hub_high_contrast.png` | Hub at 200 % with RTL, and in high contrast |
| `webgl_debrief.png`, `webgl_campaign_hub.png` | The WebGL build in Chromium at 1920 × 1080, reached by pressing Page Down through the phases; release build, so there is no REHEARSAL tag |
| `settings_100.png`, `settings_200_rtl.png`, `settings_high_contrast.png` | Settings and accessibility overlay at 100 %, at 200 % with Arabic RTL, and in high contrast (no room is open, so the room flags are disabled and say why) |

`evidence_log.txt` and `evidence_log_failforward.txt` are the runner logs. They hold the machine, the frame times, the
keyboard focus path, the `mg.summary` sent, the message counts and the retry hand-off flags.

## Tests

See `tests.txt`.

## Frame rate

See `fps.txt`.
