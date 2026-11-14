# T020 — Phone minigames: launch and ascent (package E2)

**Worker:** any coding worker with Node 20 and Playwright Chromium (no MCP server needed) ·
**Starts after:** the phone client shell is merged to `main` (`client/src/minigames/types.ts`,
`client/src/screens/MinigameScreen.tsx`, the i18n loader and MG-08)

mesh-model: sonnet
mesh-effort: high

**Owns (create):** `client/src/minigames/MG-07/`, `MG-08b/`, `MG-09/`, `MG-10/`, `MG-10a/`, `MG-11/`,
`MG-12/`; `client/src/i18n/strings/en.mg_ascent.json`; `client/e2e/minigames/ascent/`;
`client/e2e/screenshots/minigames/` files named `MG-07-*`, `MG-08b-*`, `MG-09-*`, `MG-10-*`,
`MG-10a-*`, `MG-11-*`, `MG-12-*`; `orchestration/evidence/T020/`.

**MG-08 is the reference implementation** (already done or being done by the client task); it is
not yours. **Read only:** everything else in `client/`, `data/`, `protocol/`. Do not edit
`types.ts`, `MinigameScreen.tsx`, `net/mock.ts`, the store, the theme, the i18n code,
`vite.config.ts`, `playwright.config.ts`, `package.json` or another minigame's folder. You may
import `mulberry32` and `FixedStepper` from `../MG-08/model` (read only) or copy them.

Bounded work for a small plan: **finish one minigame completely (model, tests, view, lab
screenshots, README) before starting the next**, in the order of the steps. The first three are
in the vertical slice (C1 with MG-07, MG-08, MG-09, MG-10a), so they come first. A run that ends
early stops at a minigame boundary. Use at most one subagent, for the final review. **Split
point** if dispatched as two runs: steps 1–4, then 5–9.

## Read first

`GAME_DESIGN.md` 9.1 (phases F1 to F7), 10.1 to 10.3, the 10.5 entries of your minigames, 12.1,
14.4, 15 (haptics), 16; `orchestration/ARCHITECTURE.md` section 7;
`assets/media/style/STYLE_GUIDE.md`; `client/README.md` ("Add a minigame", "Accessibility");
`client/src/minigames/types.ts`; **MG-08, the reference, if present** (`index.ts`, `model.ts`,
`model.test.ts`, `render.ts`): copy its structure, fixed-step loop, input handling, haptics and
ARIA approach. `data/minigames.json` (your entries and the top-level `design_notes`: `_min` ≥,
`_max` ≤, `_below` <) and the `minigame.<id>.*` keys in `data/strings/en.content.json`.
`protocol/messages.md` section 10, `mg.start` (RELAY uses `params.turnMs`), `mg.action`,
`mg.state`, `mg.result` (`value`), `MgMap`.

## Rules for every minigame

- **Registration** is automatic: `types.ts` globs `./*/index.ts`. No shared file changes.
- **Structure** as MG-08: `model.ts` (pure: no DOM, no clock, no `Math.random`; fixed step 120 Hz,
  or event-driven with input timestamps taken from `event.timeStamp` for timing games;
  `resolveConfig(params, mode, assistLevel)`), `render.ts`, `index.ts`, `model.test.ts`,
  `README.md`.
- **Deterministic from the seed**: same seed, params and input samples → same run and result, on
  every phone and at any frame rate.
- **Success exactly per data**, thresholds from `params` with the data values as defaults. Where
  the data has no number, choose a `game_value`, document it, list it under **Decisions**.
  "Perfect" is a stricter `game_value` that implies success. `score` 0–1 rises with performance.
  Report exactly one result, at the end of `durationMs` or when play ends, never after
  `destroy()`. Never exceed `durationMs`; where Relaxed has "more time", STANDARD uses an internal
  deadline of about 75 % of `durationMs`.
- **Modes:** STANDARD; RELAXED and ONE_BUTTON exactly as the data's `relaxed` / `one_button`
  lines say (the whole playfield is the button, plus Space/Enter; `params.hold_to_toggle` turns
  holds into toggles). **Difficulty** scales with `assistLevel` (about ±25 % on windows or speeds,
  `game_value`), never with player count.
- **Demo:** `createDemo`, a non-interactive loop of about 3 s with scripted input and a ghost
  finger, matching STANDARD; no haptics. The host screen shows the data's one-line instruction.
- **Look:** release quality with the tokens of `client/src/theme/tokens.css`; status = colour +
  shape + label + border; tabular numerals; units on every number; no emoji UI, no external
  assets; portrait 360–430 px, safe areas, 48 px targets, 200 % text, `dir=rtl`; DPR capped at 2.
  Rocket and vehicle drawings follow the style guide's hardware continuity (unbranded, slender,
  serially staged; plumes start at the bells).
- **Performance:** ≥ 30 fps at Chromium CPU throttle ×4; no per-frame allocation in hot loops;
  chunk ≤ 60 KB minified; no new dependencies.
- **Haptics** via `env.haptic` (≤ 300 ms patterns; staging thunk, ignition, rumble while out of
  band, as in `client/src/lib/haptics.ts`). **Reduced motion:** no shake, no flashing, fewer
  particles. **Accessibility:** ARIA role/label/value; keyboard play in every mode.
- **Strings:** data keys for name, instruction, success, relaxed, one-button, fact; new UI text in
  `en.mg_ascent.json` as `minigame.<id>.<area>.<name>`; never redefine a data key.
- **Accuracy:** tag every constant `physical`, `real_world_approximate` or `game_value` (comment and
  README); no new player-facing scientific claims beyond the data's fact lines.
- **`value`** (protocol `mg.result`): only MG-09 here reports one; all others omit it.
- **Teams.** `MinigameScreen` merges this player's `assignments[].params` over `params`. Host
  convention (document in each README): per-player params carry `slot` (0-based, equal to
  `assignments[].index`); common params carry `slots`. Each phone decides its own success from the
  seed and params alone. Teammates are decoration: use `env.coop` when present, otherwise simulate
  them from the seed and label them "crew".

Proposed extension, **not yet in `types.ts`**: declare in `<id>/coop.ts`, read as
`(env as MinigameEnv & { coop?: CoopChannel }).coop`, work without it, report under **Interface
changes**:

```ts
export interface CoopChannel {
  index: number; count: number;
  send(a: string, x: number[]): void;                  // mg.action, ≤ 10 Hz
  onShared(cb: (shared: MgMap) => void): () => void;   // newer mg.state.shared
}
```

## The minigame lab (step 1)

Build a single-minigame page inside `client/e2e/minigames/ascent/` (you must not change shared
code):

- `lab.html` + `lab.ts`: query `mg`, `mode`, `assist`, `seed`, `dur` (ms, default from the data),
  `p` (URL-encoded JSON merged over the data `params`), `demo=1`, `rm=1`, `dir=rtl`, `scale=2`.
  Loads with `loadMinigame`, imports `client/src/theme/*.css` and the real `t` from
  `client/src/i18n`, mounts into a 390 × 844 frame, exposes `window.__lab = { ready, result,
  haptics, progress, frames }`.
- `ascent.spec.ts`: start Vite dev with its JavaScript API in `beforeAll` (`createServer` with the
  client root and `vite.config.ts`, host `127.0.0.1`, **port 5182**, `strictPort`), close it in
  `afterAll`; open `/e2e/minigames/ascent/lab.html?...`; `page.clock` for deterministic shots;
  fail on console errors or `[i18n] missing string` warnings. Fps: CDP
  `Emulation.setCPUThrottlingRate { rate: 4 }`, real clock, 5 s, median ≥ 30.

## Steps, in order

1. **Preflight and lab.** `npm ci`, `npm test`, `npm run build` pass on `main` (otherwise
   `status=blocked`). Build the lab; smoke-test with MG-08 if present
   (`orchestration/evidence/T020/lab-smoke.png`).

Steps 2–8 each deliver one minigame, ending with its tests and `npm run build` passing, its
`README.md` (params contract: key, unit, default, value type, common or per-player; success,
perfect, `value` unit; physics versus simplification) and lab screenshots
`client/e2e/screenshots/minigames/<id>-demo.png`, `<id>-play.png`, `<id>-onebutton.png`, plus its
fps line.

2. **MG-09 Gravity Turn Tracer** (25 s, team average steers the rocket). The ideal ascent curve
   (altitude against downrange: vertical rise, pitch-over, flight-path angle easing toward
   horizontal) scrolls; trace it with a finger. The curve's shape comes from a simple pitch program
   (qualitatively `physical`, numbers `game_value`, seeded variation). `value` = this player's mean
   flight-path-angle error in degrees (document the unit). Success: mean error below
   `deviation_max_deg` (`game_value`; the design gives none). CADET shows a longer guide ahead,
   FLIGHT_DIRECTOR a shorter one. One-button: the marker follows the curve but drifts; press at each
   pitch cue.
3. **MG-10a Staging Timing** (10 s, team sync). Engine-cutoff light at a seeded time, gauges drain;
   tap SEPARATE inside ± `tap_window_s` (0.3 s half-width, per `design_notes`) around the green
   moment just after cutoff, then IGNITE inside the same half-width after the propellant-settling
   gauge completes (fact F03: propellant must settle). Success: both taps in their windows; perfect:
   both within ± 0.1 s (`game_value`). Show teammates' taps from `env.coop` or seeded crew. One
   button: press once for SEPARATE, again for IGNITE. Haptic STAGING pattern on separation.
4. **MG-07 Go/No-Go Poll** (relay, 5 s per player). This player's turn starts `slot × turnMs`
   after start. Readings come from per-player params as parallel number arrays: `channels`
   (indices into a channel table in your model: winds aloft m/s, LOX temperature K, battery
   voltage V, and so on, each with a unit), `values`, `limits_lo`, `limits_hi`, length
   `readings_per_console` (3). Without them, generate seeded readings with
   `real_world_approximate` limits documented in the README. The right call is GO when all three
   are within limits, otherwise NO-GO. Success: correct call within `answer_window_s` (5 s;
   relaxed longer, but within the turn). Before the turn, show FLIGHT calling the other consoles.
   Report right after this player's answer or timeout.
5. **MG-08b Propellant Loading** (20 s, countdown). Tap valves to keep the fill rate in its target
   band while boil-off vents continuously; fill level must reach ≥ `fill_fraction_min` (0.99) at
   T−0 without overpressure (`overpressure_allowed` false: filling past the relief level with the
   valve open is an overpressure event and fails). Boil-off rate and band `game_value`. One-button:
   hold to open the fill valve (`hold_to_toggle` respected).
6. **MG-11 Pogo Damper** (15 s, team sync). The vehicle bounces lengthwise; tap in counter-phase
   (on each trough) within a beat window. Real pogo runs at several to tens of hertz; slow it to a
   tappable rate (about 1–1.5 Hz) and say so in the README (game simplification). Success: taps
   opposite in phase for ≥ `counter_phase_beats_fraction_min` (0.7) of beats. Damping speeds up
   with the number of in-sync players (`env.coop` or seeded crew). A visual metronome marks beats.
   Fact F07.
7. **MG-12 Engine-Out Rebalance** (20 s, cooperative split). Engine layout from params (`engines`,
   `failed` index, this player's engine from `slot`); the player sets throttle and gimbal of their
   engine. Net torque about the centre of mass τ = Σ rᵢ × Fᵢ (`physical`), with seeded disturbances;
   teammates' engines hold their correct settings (or come from `env.coop`). Success: |τ_net|
   within `torque_zone` for ≥ `in_zone_fraction_min` of the time (both `game_value`; the design
   says only "near zero"). Fact F08.
8. **MG-10 Fairing Catch** (20 s, cooperative split). Two fairing halves descend under parafoils
   with seeded wind drift; steer this player's boat (half by `slot` parity) to keep the net under
   its half. Success: under target ≥ `under_target_fraction_min` (0.7).
   `fairing_refund_fraction_max` is a host reward, not a success input. One-button: hold to steer
   toward the target, release to drift.
9. **Group check and review.** Full `npm test`, `npm run build`, `npm run e2e` (the existing
   session spec must still pass). One screenshot with `dir=rtl&scale=2&rm=1`. One subagent reviews
   against the acceptance list.

## Acceptance

- `npm test`, `npm run build`, `npm run e2e` pass; outputs in `orchestration/evidence/T020/vitest.txt`
  and `playwright.txt`.
- Each delivered minigame has tests for: success exactly at and just past each data threshold,
  host-param overrides, Relaxed easier than STANDARD, CADET easier and FLIGHT_DIRECTOR harder,
  determinism, frame-rate independence (timing games: identical result whatever the frame
  timestamps, given the same input timestamps), a scripted good player succeeding on ≥ 20 seeds in
  every mode, an idle player failing, one-button success, perfect implying success; MG-07 tests
  GO and NO-GO cases and the relay start offset.
- Screenshots exist for every delivered minigame, with copies in the evidence folder;
  `orchestration/evidence/T020/fps.md` lists median fps at ×4 throttle (all ≥ 30).
- `git status` shows no change outside the owned paths.
- The summary lists **Decisions**, **Interface changes** (`env.coop`, `slot`/`slots`, MG-07 reading
  arrays, MG-09 `value` unit) and any minigame not reached.

## Design references

Sections 9.1, 10.1–10.5 (MG-07, MG-08b, MG-09, MG-10a, MG-10, MG-11, MG-12), 12.1, 14.4, 15, 16;
protocol section 10; `data/minigames.json`.
