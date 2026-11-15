# T051 built-game inventory

Inventory date: 2026-11-15. This describes the source and published build at commit `50216bb`, not the intended feature list in `GAME_DESIGN.md`.

## Live and local entry points

- `https://missionforge-spaceapps.onrender.com/play/`, `/play/host/`, `/play/client/` and `/play/judges.html` each returned HTTP 200 on 2026-11-15.
- `docs/play/index.html` links the big-screen Unity host, phone client, audience client and offline phone mock.
- `npm --prefix tools/demo install`, then `npm --prefix tools/demo run demo`, is the local launcher documented by `JUDGES.md` and `RELEASE.md`.
- The room server accepts 1–10 players plus spectators. A hosted room works across networks; local phones must reach the launcher's address, normally on the same LAN or hotspot.

## Data inventory

- `data/contracts.json`: 9 contracts (C0–C8). The ordinary Unity Build Bay currently opens C1; another contract can be selected only with the development `-mfContract` argument.
- `data/parts/*.json`: 26 categories and 102 part choices.
- `data/roles.json`: 10 Mission Control consoles.
- `data/minigames.json`: 32 games (MG-01–MG-30 plus MG-08b and MG-10a).
- `data/facts.json`: 40 facts, all marked verified and carrying source URLs.
- `data/awards.json`: 8 positive awards; `data/achievements.json`: 12 achievement definitions.
- Shared strings exist in English, Arabic, Spanish, French, Hindi and Portuguese. The phone also has six matching interface-string sets.
- There is no `data/codex.json` in this checkout. The phone Codex uses facts, part entries and unlock messages, with built-in fallback entries.

### Contracts

All money is in game-dollar millions (`M`); all schedules are compressed game days. “Difficulty” is not stored per contract. C0 is explicitly the tutorial; the other eight are not rated. Flight assist is selected separately.

| ID | Contract | Goal / destination | Payload | Required Δv | Budget | Schedule | Part votes | Stored difficulty |
|---|---|---|---:|---:|---:|---:|---:|---|
| C0 | First Light | Suborbital, at least 100 km apogee, then recover | 100 kg science package | 2.0 km/s | 25 M | 60 days | 19 | Tutorial |
| C1 | Earth Watch | 550 km Sun-synchronous orbit at 97.6°, power-positive | 150 kg observation satellite | 9.7 km/s | 90 M | 180 days | 22 | Not rated |
| C2 | Constellation Courier | 500 km LEO at 53° | 3 × 400 kg communications satellites | 9.5 km/s | 120 M | 200 days | 21 | Not rated |
| C3 | Station Resupply | Dock in a 420 km, 51.6° station orbit | 6 t cargo capsule | 9.6 km/s | 250 M | 240 days | 21 | Not rated |
| C4 | Crew Flight | 400 km LEO for 3 mission days | 8 t capsule, 4 crew | 9.5 km/s | 400 M | 300 days | 23 | Not rated |
| C5 | High Relay | Geostationary transfer orbit, 35,786 km apogee | 4 t communications satellite | 11.9 km/s | 220 M | 260 days | 21 | Not rated |
| C6 | Lunar Loop | Lunar flyby and safe return | 10 t crewed capsule | 12.6 km/s | 700 M | 360 days | 23 | Not rated |
| C7 | Red Landing | Safe Mars-surface touchdown | 1 t aeroshell lander | 13.0 km/s | 600 M | 400 days | 20 | Not rated |
| C8 | Comeback Kid | 300 km LEO and booster landing | 10 t delivered payload | 9.4 km/s | 150 M | 200 days | 19 | Not rated |

Sources: `data/contracts.json`, `data/strings/en.content.json`, `core/Runtime/Data/CatalogLoader.cs` (payload count is multiplied).

### Roles and abilities

The server can assign roles randomly, let players pick, or vote for them. With fewer than 10 players, a player may hold several roles.

| Console | Private insight | One-use special ability in data |
|---|---|---|
| FLIGHT — Flight Director | Full readiness and warnings first | Decision Time ends a stalled vote and breaks a tie |
| BOOSTER — Launch vehicle propulsion | Engine reliability and throttle ranges | Next engine test costs 50% less |
| STRUCT — Structures and materials | Dry-mass breakdown and load margins | Add 10% load margin to one stage |
| GUIDO — Guidance | Navigation accuracy and sensor drift | Halve insertion error once |
| FIDO — Flight dynamics | Δv requirement and orbit targets | Extend the launch window by 5 min |
| EECOM — Power, thermal and life support | Power, battery and thermal margins | Prevent one brownout |
| INCO — Communications | Data rates and ground coverage | Double data from one ground pass |
| PAYLOAD — Payload and science | Instrument performance and science value | Double one science capture |
| RETRO — Reentry and recovery | Heat-shield ratings and entry corridor | Shrink the landing ellipse and guarantee recovery |
| PM — Program manager | True cost/schedule critical path and forecasts | Add 10% budget once; campaign reputation cost |

The abilities are defined and tested in Core/data, but the current Unity host does not handle `ability.requested`, so the guide must label them as modeled rather than wired end to end.

### Minigames

All 32 have phone implementations with Standard, Relaxed and one-button behavior. The catalog says what should trigger them and what rewards should be granted; the live Unity flight currently sends tiers, Team Sync, points and facts, but sends an empty boost list. Build triggers and many conditional flight triggers are not wired end to end.

| ID | Name | Catalog trigger | Player action | Catalog result |
|---|---|---|---|---|
| MG-01 | Unit Converter Sprint | PDR after propulsion votes | Match mixed units to SI values | Reliability / uncertainty reward |
| MG-02 | Rocket Equation Balance | After tank votes | Add propellant blocks to hit a Δv band | Δv bonus |
| MG-03 | Weld Inspector | Material integration or static fire | Find defects in weld X-rays | Load margin / reliability |
| MG-04 | Orientation Check | Avionics/sensor integration | Rotate parts to match the drawing | Sensor and descent reliability |
| MG-05 | Clean Room | Payload integration or contamination | Wipe particles without scratching | Data multiplier |
| MG-06 | Shake Table | Vibration test | Tune a damper away from resonance | Payload reliability / schedule recovery |
| MG-07 | Go/No-Go Poll | F1 countdown and ignition | Check limits and answer GO or NO-GO | Avoid holds / save Δv |
| MG-08b | Propellant Loading | F1 | Control valves, fill and pressure | Fuel saver |
| MG-08 | Max Q Throttle Bucket | F4 | Keep stress in the safe band | Load margin / Δv |
| MG-09 | Gravity Turn Tracer | F3 | Trace the ideal ascent curve | Precision / Δv |
| MG-10a | Staging Timing | F5 at staging | Time separation and ignition | Δv / prevent recontact |
| MG-10 | Fairing Catch | F6 with reusable fairing | Steer a boat under the fairing | Budget refund |
| MG-11 | Pogo Damper | F5 if pogo occurs | Tap in counter-rhythm | Prevent shutdown / load margin |
| MG-12 | Engine-Out Rebalance | F5/F7 after engine loss | Balance thrust and gimbal | Recover Δv / trajectory |
| MG-13 | Ground Station Pass | F8 ground pass | Track a ground station | Data multiplier |
| MG-14 | Debris Dodge | F8 conjunction | Choose a minimal avoidance burn | Fuel saver / reliability shield |
| MG-15 | Solar Wing Deploy | F8 with deployable arrays | Release hinges, then point at Sun | Power margin / data multiplier |
| MG-16 | Station Docking | F8 on C3 | Align and control closing speed | Precision / score multiplier |
| MG-17 | Alarm Triage | F8 or descent | Sort alarms into actions | Reliability / precision |
| MG-18 | Eclipse Power Juggle | F8 eclipse | Switch loads while protecting battery | Power margin / data multiplier |
| MG-19 | Scrubber Fix | F8 crewed life-support event | Assemble a filter adapter | Morale / reliability shield |
| MG-20 | Deorbit Burn | F9 | Stop the burn at target periapsis | Precision / fuel saver |
| MG-21 | Science Capture | F8 observation mission | Frame targets and avoid clouds | Science credit / data multiplier |
| MG-22 | Entry Corridor | F10 | Keep entry angle in the corridor | Heat margin / precision |
| MG-23 | Parachute Sequence | F12 | Deploy inside altitude/speed gates | Softer recovery / score multiplier |
| MG-24 | Hoverslam | F7b or C8 landing | Ignite to reach 0 m/s at touchdown | Recovery / budget refund |
| MG-25 | Reacquire Signal | End of F11 blackout | Tune and lock the beacon | Recovery precision / morale |
| MG-26 | Seven Minutes of Terror | C7 Mars EDL | Order and time the landing sequence | Precision / reliability shield |
| MG-27 | Recovery Team | F13 splashdown | Follow beacon and arrive in order | Morale / recovery refund |
| MG-28 | Root Cause Investigation | Debrief after failure/anomaly | Combine clues and identify cause | Lessons Learned / Codex badge |
| MG-29 | Predict the Physics | Between phases | Predict before the animation | Knowledge / score multiplier |
| MG-30 | Mission Patch Design | After CDR | Contribute an element and vote | Cosmetic patch |

Sources: `data/minigames.json`, `data/strings/en.content.json`, `client/src/minigames/`.

## Phone screens as built

`client/src/App.tsx` routes working React views for Join, Lobby, Role card, Build status, part Vote, GO/NO-GO Poll, Console, Minigame, Debrief, Pilot, Co-pilot and Spectator/Watch. Codex and Settings are overlays. The phone handles room reconnect/pause state, role cards, votes, pings, audience preference, console telemetry, all minigame canvases and debrief messages.

The pilot/co-pilot UI, protocol and mock behavior exist, but Unity currently runs `CoreFlightFeed` with full autopilot and does not consume phone pilot input.

## Big-screen screens as built

Six source scenes have specialist controllers and working behavior:

- Title: create/open a mission room.
- Lobby: room code and QR, live seats, role/assist/timer/audience/tally settings.
- Build Bay: real C1 catalog votes, Core-computed preview deltas, dashboard, budget/schedule and vehicle assembly.
- Countdown: specialist visual screen, but catalog countdown minigames are not yet driven by the host.
- Flight: deterministic Core flight feed, 3D/HUD, autopilot, minigame cues and flight telemetry.
- Orbit Map: real telemetry-driven conic, trail and ground track.

The following scenes exist and can be navigated, but use `RegionScreen`, which only wires Continue/Back/Close around static designed layouts: Briefing, Contract Vote, Test Stand, Design Review, Flight Readiness Review, standalone Minigame Overlay, Debrief, Codex, Campaign Hub and Settings. `FlightFlowDirector` explicitly calls FRR a placeholder. The flight HUD has a working minigame banner even though the standalone overlay is a placeholder.

## Lobby settings and voting behavior

The current source lobby exposes:

- role assignment: Random, Player pick or Vote;
- assist: Cadet (score ×0.8), Engineer (×1.0) or Flight Director (×1.25);
- Vote: 10, 20, 30, 45 or 60 s;
- Inspect: 5, 10, 20, 30 or 60 s;
- audience weight: Off or one combined player ballot;
- tallies: Open or Hidden.

Defaults are Random roles, Engineer assist, 20 s Inspect, 20 s Vote, open tallies and advisory audience. A normal live part round has Reveal 3 s + Inspect + Vote + Result 3 s: 21 s at the shortest lobby settings and 46 s by default, before animation, a runoff or recovery. The optional 8 s Predict step is not sent by the current Build Bay.

Players get one veto each per mission on PART rounds. A veto may be used during Inspect or Vote and must leave at least two winnable choices. Tied leaders resolve by active Decision Time, then FLIGHT's ballot if it selects a tied option, then supplied trivia, then a seeded coin. A no-ballot round uses a Recommended tag, supplied default, or the cheapest displayed option. Strict-majority runoffs exist in the server but have no lobby control.

Audience phones show an “Audience says” preference. With audience weight on, the combined crowd counts as one ballot only when it has a unique favorite; a crowd tie adds no ballot.

## Rules, scoring and campaign code

Core contains deterministic, unit-tested rules for build validation, reliability, flight, objectives, boosts, scoring, awards, achievements, inventory, campaign modes and leaderboards. The scoring catalog awards:

- objectives: 3,000 primary + up to 1,500 secondary + 500 stretch;
- efficiency: up to 1,000 budget + 500 schedule;
- safety/recovery: 1,000 crew safe + 500 booster + 300 capsule;
- science/data: up to 1,500;
- teamwork: 60/120/200/250 points per Bronze/Silver/Gold/Platinum minigame + 20 per Good Call;
- knowledge: 50 per correct prediction + 30 per trivia tiebreak;
- then assist and score-boost multipliers.

Grades are S at 9,000+, A at 7,500+, B at 6,000+, C at 4,000+, otherwise D; crew loss forces D. Award code guarantees at least one positive award per player. Campaign code supports mission progress, unlocks, reusable inventory, achievements, modes and anonymous leaderboards.

However, the current Unity host does not call the Core score calculator, award assigner or campaign recorder. The Debrief and Campaign Hub are placeholders. These are implemented/tested rule modules and phone renderers, not a completed end-to-end results flow.

## Physical models versus game abstractions

- Physical or approximate models present in Core: SI units, Tsiolkovsky rocket equation, thrust-to-weight, a spherical Earth two-body model, fixed-step RK4 powered/atmospheric flight, analytic orbit propagation, aerodynamic drag, exponential atmosphere, staging, entry heating and deterministic flight phases.
- Deliberate simplifications: spherical Earth with no oblateness/J2, one exponential atmosphere, limited aerodynamic axes, compressed build time, abstract game dollars, static/aggregated power and communications budgets, catalog science/data multipliers, and seeded checkpoint reliability rolls rather than component-level lifetime physics.
- Values are tagged `physical`, `real_world_approximate` or `game_value` in data. `GAME_DESIGN.md` section 19 is the numeric assumptions register.

## Accessibility and localization as built

Phone settings provide 100%, 125%, 150%, 175% and 200% text, high contrast, reduced motion, Relaxed minigames, one-button play, hold/toggle controls, haptics and a screen-reader preference. Semantic headings, labels, live regions and timer announcements are present in React. CSS respects reduced motion and high contrast. The six languages are English, Arabic, Spanish, French, Hindi and Portuguese, with Arabic RTL handling and English key-by-key fallback.

The Unity layouts include accessibility controls, and Build Bay honors high contrast, reduced motion and RTL room flags. The host Settings scene itself is still a static placeholder, so not every room-wide accessibility flag is host-editable in the shipped source flow.

## Main accuracy cautions for the guide

1. Describe all nine contracts as data-backed options, but say the regular host currently runs C1 rather than promising a working contract-selection screen.
2. Separate phone minigame implementations and Core reward models from the smaller set of host-wired cues/effects.
3. Separate Core scoring/campaign rules from the placeholder big-screen Debrief/Campaign Hub.
4. Do not claim Predict is active in live part votes or that phone piloting controls the Unity flight.
5. Do not invent contract difficulty ratings; only C0 is marked tutorial.
6. Treat the project runbook's 25–40 min session length as a planning estimate, not a measured playtest.
