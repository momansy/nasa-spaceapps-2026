# T026 — Unity minigame host: start, run, score, boost (packages E and F3 glue)

**Worker:** a Unity worker (`yousuf-amek` or `cyrex04`) · **Owns:** `unity/MissionForge/Assets/MissionForge/Screens/Minigames/` (create), `unity/MissionForge/Assets/MissionForge/Scenes/MF_MinigameOverlay.unity`, `unity/MissionForge/Assets/MissionForge/Tests/EditMode/Minigames/` (create), `orchestration/evidence/T026/`

Does not change `ProjectSettings/`, `Packages/` or `Assets/Settings/`. Does not edit the
phone client (`client/`), the room server (`server/`) or `core/`; if one of them needs a
change, describe it under **Interface changes**.

## Goal

The phones already run minigames locally (`client/src/minigames/<MG-id>/`, tasks T019 to
T022) and report a result. Nothing on the host yet decides when a minigame happens,
starts it on every phone, collects the results, computes the tier and applies the boost.
This task builds that loop on the Unity host, following design sections 10.1 to 10.4 and
11.1 to 11.2, `data/minigames.json`, `data/boosts.json`, and the `mg.*` messages in
`protocol/messages.md`.

## Steps, in order

1. **Read the contract.** `protocol/messages.md` sections for `mg.start`, `mg.ready`,
   `mg.progress`, `mg.action`, `mg.state`, `mg.result`, `mg.cancel`, `mg.summary`,
   `boost.applied`, `boost.state`, `sync.meter`; `client/README.md` "How to add a
   minigame" (per-player `params`, `slot` / `slots`, optional `env.coop`).
2. **Minigame director** (`MinigameDirector`): given a trigger (build event or flight
   phase from `data/minigames.json` `when`), decides whether that minigame runs (contract,
   parts chosen, crewed-only, once-per-mission rules), builds per-player `params` from the
   data definition plus `slot`/`slots` for cooperative types, picks a seed from the
   session seed, and sends `mg.start` with the deadline. Unit-test the trigger rules for
   at least ten minigames across build and flight.
3. **Run and collect:** track `mg.ready` and `mg.result` per active player; disconnected
   players are excluded from the fraction (design 10.3); apply the latency allowance; time
   out at the deadline. For cooperative types relay `mg.action` into shared `mg.state`
   (MG-06, MG-10, MG-12, MG-15, MG-19, MG-23, MG-26, MG-27, MG-30); MG-28 belongs to T024
   and only needs to be started here.
4. **Tier and boost:** completion fraction to tier (Bronze 0.33, Silver 0.66, Gold 1.0,
   Platinum), solo scoring, then the boost from `data/boosts.json` with stacking and caps
   (11.1), Reliability Shields, Team Sync gains (11.2). If Core's scoring types from task
   T011 are on `main`, call them; otherwise put this behind an `IBoostLedger` interface
   with a small local implementation and say so. Send `mg.summary`, `boost.applied`,
   `sync.meter`. Unit-test tiers for 1 to 10 players and every cap.
5. **Overlay** (`MF_MinigameOverlay`): host banner with the minigame name, one-line
   instruction, team progress meter filling as results arrive, countdown, then the result
   card with tier, boost and the fact line; bullet-time hook (sim at x0.1) that the flight
   scene can subscribe to; reduced-motion version. Style per
   `assets/media/style/STYLE_GUIDE.md`.
6. **Rehearsal mode:** a menu/editor action that runs any minigame with 1, 4 or 10
   simulated players and random results, so the overlay and boosts can be shown and
   captured without phones.
7. **Evidence:** screenshots at 1920x1080 of the overlay running and the result card for
   Bronze, Silver and Gold; EditMode test results.

## Acceptance

- EditMode tests green (trigger rules, fraction and tiers for 1 to 10 players incl.
  disconnects, every boost cap, shield consumption, Team Sync thresholds).
- Against the stub server in `unity/MissionForge/Tools~/stub-server/` (extend it only
  inside a new file if needed) a full round works: `mg.start` out, simulated results in,
  `mg.summary` and `boost.applied` out, overlay shows the right tier.
- Every one of the 32 minigames in `data/minigames.json` has a trigger the director can
  fire (list them in the evidence README with their trigger).
- Professional look: the overlay is part of the game's visual language, not a debug panel.
