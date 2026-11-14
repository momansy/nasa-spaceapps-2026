# T030 — Phone pilot and co-pilot controls, spectator view, profile edit (package D, follow-up)

**Worker:** any coding worker with Node 20 and Playwright Chromium; suggested `mohammed-alainieh`
or `ahmed-saeed-amek`. No MCP server needed. **Starts after:** the phone client shell is on `main`
(it is: `client/` with `?mock=1`).

mesh-model: sonnet
mesh-effort: high

**Owns (create):** `client/src/screens/pilot/`, `client/src/screens/spectator/`,
`client/src/screens/profile/`, `client/src/i18n/strings/en.pilot.json` (every key starts with
`ui.pilot.`, `ui.copilot.`, `ui.watch.` or `ui.profile.`), `client/e2e/pilot/`,
`client/e2e/screenshots/pilot/`, `orchestration/evidence/T030/`.

**Narrow additive edits allowed** (other agents are working in `client/` now: change only these
lines, keep each diff small and additive, never reformat or reorder existing code):

- `client/src/App.tsx`: the imports and one `case` per new screen in `ScreenView`.
- `client/src/state/types.ts`: add `'pilot' | 'watch'` to `Screen`; add `pilotHud`
  (`PilotHudPayload | null`) and `audience` (recent `react.audience` windows) to the state.
- `client/src/state/reducer.ts`: new cases `pilot.hud` and `react.audience` only.
- `client/src/state/selectors.ts`: in `currentScreen`, after the minigame / vote / poll / role
  checks: COUNTDOWN or FLIGHT and this player holds a seat in `pilot.assign` whose input is PHONE
  (pilot or booster pilot) or is `copilotId` → `'pilot'`; a spectator outside LOBBY → `'watch'`.
  Plus new selectors for the seat.
- `client/src/state/store.ts`: new methods `pilotInput`, `pilotAction`, `copilotAction`,
  `setProfile`; nothing else changes.
- `client/src/net/mock.ts` and `client/src/main.tsx` (to pass the option): a `&seat=pilot`,
  `&seat=copilot` or `&seat=booster` mock option that assigns the player to that seat with PHONE
  input at COUNTDOWN, accepts `pilot.input` / `pilot.action` / `copilot.action` from that seat
  (others keep getting NOT_PILOT), and answers with `pilot.hud` at ≤ 10 Hz reflecting the inputs
  (throttle read-back, attitude mode, RCS, `canStage`, `deployTarget`, warp, one console request
  prompt, a guidance cue); `player.profile` accepted in LOBBY (WRONG_PHASE elsewhere, NICK_TAKEN for
  a bot's name); `react.audience` windows with seeded counts when the player watches (`&watch=1`).
- `client/src/screens/LobbyScreen.tsx`: one button that opens the profile sheet.
- `client/src/screens/vote/VoteScreen.tsx`: mount the `AudienceSays` bar from your spectator folder
  (one line plus its import).

Do not edit anything else in `client/` (minigame folders belong to T019–T022; `types.ts`,
`MinigameScreen.tsx`, the theme, the i18n loader, `vite.config.ts`, `playwright.config.ts` and
`package.json` stay as they are), nor `protocol/`, `server/`, `data/` or `unity/`. If the protocol
needs a change, describe it under **Interface changes**; do not make it.

Usage limits can cut a run off: finish and verify one step before the next; each step leaves the
client building with all tests green. Use at most one subagent, for the final review. **Split
point:** steps 1–5, then 6–9.

## Read first

`GAME_DESIGN.md` 3.1 (nickname and avatar), 3.4 (reactions), 9.1 (phases), **9.2** (the touch
column of the controls table), 9.3 (assist levels), **9.4** (pilot rotation, co-pilot, booster pilot,
"pass the controls": phones become virtual gamepads), 9.7 (warp rules), 9.8 (aborts), **13.7**
(spectators: host view on the phone, audience votes, emoji reactions), 14.2, 16 (accessibility),
17.8 (30 fps on four-year-old phones), 17.9; `protocol/messages.md` section 9.1 and the references
for `pilot.assign`, `pilot.input`, `pilot.action`, `copilot.action`, `pilot.hud`, `player.profile`,
`react.send`, `react.event`, `react.audience`, `vote.tally` (`audienceCounts`, `audienceTotal`),
`flight.hud`, `game.paused`, and the shared types `Craft`, `PilotAction`, `AttMode`, `DeployTarget`,
`CopilotAction`, `InputSource`, `ReactionId`, `ReactionCounts`, `Avatar`; `data/pilot_controls.json`
(the 9.2 table with hold times) and `data/assist_levels.json`; `client/README.md` (layout, mock,
accessibility rules) and `client/src/{App.tsx,state/,net/mock.ts,ui/kit.tsx,data/cosmetics.ts,lib/haptics.ts}`;
`client/e2e/session.spec.ts` (how the e2e test drives the mock); `assets/media/style/STYLE_GUIDE.md`
(palette, status language, phone type sizes, reduced motion, high contrast).

## Rules

- **The host owns the simulation.** The phone sends inputs and shows what `pilot.hud` and
  `flight.hud` say; it never predicts the flight. Throttle shows the commanded position and the
  host's read-back (`throttlePct`) side by side.
- **`pilot.input`:** on change at up to 30 Hz, and at 5 Hz while unchanged as a keep-alive; `n`
  strictly increasing; pitch, yaw and roll return to 0 when the finger lifts; throttle holds. Stop
  sending while paused, while the seat is not yours or its input is HOST_DEVICE, and when the page is
  hidden. **`pilot.action` / `copilot.action`:** sent once per completed gesture with an increasing
  `n`; holds are timed on the phone (STAGE 0.3 s, ABORT 1.5 s, from `data/pilot_controls.json`).
- **Layout:** portrait 360–430 px and landscape (the gamepad is better in landscape: say so with a
  gentle rotate hint, never force it); 48 px minimum targets, 64 px for STAGE and ABORT; thumbs
  zones per hand; text scale to 200 %; right-to-left mirrors the layout but keeps the throttle on
  the side the player chose (setting stored in prefs); high contrast; reduced motion (no pulsing,
  no shake); haptics through `lib/haptics.ts` and the existing setting. Status always colour +
  shape + label.
- **Safety and fairness:** ABORT sits under a cover that must be flipped before the 1.5 s hold
  (9.2 "guarded abort switch"); a hold can be cancelled by sliding off; no accidental STAGE from a
  swipe. All text from `en.pilot.json` or existing keys; no free text anywhere except the nickname
  field (server filters it).
- Performance: 30 fps or better with CPU throttling ×4 in Chromium; no layout thrash on input.

## Steps (in order)

1. **Preflight.** `npm ci`, `npm test`, `npm run build`, `npm run e2e:install`, `npm run e2e` in
   `client/`; record the baseline counts. If the baseline fails, record it and carry on unless
   nothing builds (then `status=blocked`).
2. **State plumbing.** The types, reducer cases, selectors and store methods above. Pure modules in
   `screens/pilot/`: `inputSampler` (rate limit, keep-alive, `n`, dead zone, centring, stop
   conditions) and `holdGesture` (progress, cancel, completion once). Vitest: reducer cases,
   routing for every seat / input source / phase combination (including seat changes between
   segments and HOST_DEVICE fallback to the console), sampler timing with fake timers, hold
   gestures. The app looks unchanged at this step.
3. **Mock seats.** The `&seat=` option, `pilot.hud` answers, `player.profile` in LOBBY and
   `react.audience` for watchers. Add a Vitest suite in `screens/pilot/` (same approach as
   `net/mock.test.ts`, which you do not edit) that plays each seat headless and validates every new
   frame in both directions against `protocol/schema/`.
4. **Pilot screen, core controls.** `screens/pilot/PilotScreen.tsx`: throttle slider with read-back,
   pitch wheel (or a vertical-axis stick), big STAGE with a 0.3 s hold ring (disabled with a reason
   when `canStage` is false), CUTOFF, the guarded ABORT switch, the T+ / phase strip and three HUD
   numbers from `flight.hud` (altitude km, speed m/s, q kPa) with units. Playwright: with
   `?mock=1&seat=pilot` the throttle, a STAGE hold and an ABORT (cover + hold) reach the mock, which
   reflects them in `pilot.hud`. Screenshot portrait and landscape.
5. **Pilot screen, full 9.2 touch column.** Two-finger rotate for yaw / roll when RCS is on, RCS
   toggle, attitude mode chips (OFF, PROGRADE, RETROGRADE, HEAT_SHIELD_FWD), the context DEPLOY
   button labelled from `deployTarget`, warp chips (WARP_DOWN / WARP_UP with the host's current
   factor; the host enforces 9.7, the phone only shows "not now" when it answers with no change),
   MAP_TOGGLE tab, camera swipe → CAMERA_CYCLE, countdown HOLD / RESUME during COUNTDOWN (F1),
   console request prompts from `pilot.hud.prompts` (role call sign and request), the guidance cue
   text. Assist-level layouts: Cadet shows throttle, STAGE, DEPLOY and ABORT only; Engineer and
   Flight Director show everything. Booster seat: same screen with `craft` BOOSTER and its own
   title. Seat handover mid-flight (new `pilot.assign`) swaps screens without a reload.
6. **Co-pilot screen.** `screens/pilot/CopilotScreen.tsx`: STAGE (hold 0.3 s) and DEPLOY with target
   chips (CONTEXT, FAIRING, CHUTES, LEGS, ARRAYS) sending `copilot.action`; the pilot's throttle and
   mode read-back from `pilot.hud`; the same HUD strip. Playwright with `&seat=copilot`.
7. **Spectator view.** `screens/spectator/WatchScreen.tsx` for spectators outside LOBBY when no
   vote, poll or minigame is showing: the phase strip, what is happening now (build phase: the
   latest `build.state` headline; flight: the `flight.hud` numbers with units; blackout state), the
   reaction pad (five `ReactionId` buttons, client-side 1 per second to match the server limit), and
   the **audience reaction display**: `react.audience` counts rendered as rising emoji bursts capped
   at a readable number (reduced motion: animated counters only), the audience size, the pending
   spectator note for late joiners. `AudienceSays.tsx`: during votes, the "Audience says" bar from
   `vote.tally.audienceCounts` / `audienceTotal` (hidden when tallies are hidden), mounted in the
   vote screen for players and spectators. Playwright with `&watch=1`.
8. **Profile edit.** `screens/profile/ProfileSheet.tsx`: nickname and avatar (suit and patch from
   `data/cosmetics.ts`) in LOBBY, sends `player.profile`, shows NICK_REJECTED / NICK_TAKEN (with the
   server's suggestion if present) and WRONG_PHASE, saves to the existing local profile key. Opened
   from the lobby button.
9. **Accessibility, performance, review.** 200 % text, RTL, high contrast, reduced motion on every
   new screen; touch targets measured; fps with CPU ×4 during continuous throttle and pitch input;
   `npm test`, `npm run build` and the full `npm run e2e` (the existing session spec must stay
   green). One subagent reviews against this acceptance list before you report.

## Acceptance

- `npm test`, `npm run build` and `npm run e2e` pass in `client/` (counts before and after
  recorded); new Vitest suites cover the sampler, holds, routing and reducer cases; every frame the
  new code and the mock send validates against `protocol/schema/`.
- In `?mock=1&seat=pilot`, every row of the 9.2 touch column produces the right `pilot.input` or
  `pilot.action` (Playwright asserts the frames) and the screen reflects `pilot.hud`; input rate stays
  ≤ 30 Hz with 5 Hz keep-alive; nothing is sent while paused or after the seat moves away.
- In `&seat=copilot` STAGE and each DEPLOY target send `copilot.action`; in `&watch=1` reactions are
  sent at ≤ 1/s and audience bursts and the "Audience says" bar render; the profile sheet changes
  nickname and avatar in the lobby and shows the server errors.
- Only the owned paths and the listed additive lines changed (list them with line counts in the
  summary under **Interface changes**).
- Evidence: `client/e2e/screenshots/pilot/` and copies in `orchestration/evidence/T030/` at 390×844
  and 844×390: pilot (Engineer and Cadet layouts), abort cover open and hold in progress, co-pilot,
  booster seat, spectator watch screen with a reaction burst, "Audience says" bar, profile sheet,
  pilot at 200 % RTL, high contrast; the test outputs and the fps note.
