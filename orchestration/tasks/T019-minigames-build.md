# T019 — Phone minigames: build phase (package E1)

**Worker:** any coding worker with Node 20 and Playwright Chromium (no MCP server needed) ·
**Starts after:** the phone client shell is merged to `main` (`client/src/minigames/types.ts`,
`client/src/screens/MinigameScreen.tsx`, the i18n loader and MG-08)

mesh-model: sonnet
mesh-effort: high

**Owns (create):** `client/src/minigames/MG-01/`, `MG-02/`, `MG-03/`, `MG-04/`, `MG-05/`, `MG-06/`,
`MG-29/`, `MG-30/`; `client/src/i18n/strings/en.mg_build.json`; `client/e2e/minigames/build/`;
`client/e2e/screenshots/minigames/` files named `MG-01-*` … `MG-06-*`, `MG-29-*`, `MG-30-*`;
`orchestration/evidence/T019/`.

**Read only:** everything else in `client/`, `data/`, `protocol/`. Do not edit `types.ts`,
`MinigameScreen.tsx`, `net/mock.ts`, the store, the theme, the i18n code, `vite.config.ts`,
`playwright.config.ts`, `package.json` or another minigame's folder. You may import `mulberry32`
and `FixedStepper` from `../MG-08/model` (read only) or copy them into your folder.

Bounded work for a small plan: **finish one minigame completely (model, tests, view, lab
screenshots, README) before starting the next**, in the order of the steps. A run that ends early
stops at a minigame boundary; the orchestrator queues the rest. Use at most one subagent, for the
final review. **Split point** if dispatched as two runs: steps 1–5, then 6–10.

## Read first

`GAME_DESIGN.md` 10.1 to 10.3, the 10.5 entries of your minigames, 12.1, 14.4, 16;
`orchestration/ARCHITECTURE.md` section 7; `assets/media/style/STYLE_GUIDE.md` (palette, status
language, typography, reduced motion); `client/README.md` ("Add a minigame", "Accessibility");
`client/src/minigames/types.ts`; **MG-08, the reference, if present** (`index.ts`, `model.ts`,
`model.test.ts`, `render.ts`): copy its structure, fixed-step loop, input handling, haptics and
ARIA approach. `data/minigames.json` (your entries and the top-level `design_notes`, which define
the `_min` ≥, `_max` ≤, `_below` < suffixes) and the `minigame.<id>.*` keys in
`data/strings/en.content.json`. `protocol/messages.md` section 10, `mg.start`, `mg.action`,
`mg.state`, `mg.result`, `MgMap`.

## Rules for every minigame

- **Registration** is automatic: `types.ts` globs `./*/index.ts`, so a folder whose `index.ts`
  default-exports a `MinigameModule` is registered. No shared file changes.
- **Structure** as MG-08: `model.ts` (pure: no DOM, no clock, no `Math.random`; fixed step 120 Hz
  or event-driven with timestamps; `resolveConfig(params, mode, assistLevel)` with defaults),
  `render.ts` (canvas 2D or DOM), `index.ts` (glue: input, frame loop, haptics, ARIA),
  `model.test.ts`, `README.md`.
- **Deterministic from the seed.** Same `seed`, same `params`, same input samples give the same run
  and result on every phone and at any frame rate.
- **Success exactly per data.** Thresholds come from `params`, defaulting to the
  `data/minigames.json` values with the suffix semantics above. Where the data has no number,
  choose a `game_value`, document it and list it under **Decisions**. "Perfect" is a stricter
  `game_value` that implies success. `score` is 0–1 and rises with performance. Report exactly one
  result, at the end of `durationMs` or when play ends naturally, never after `destroy()`.
- **Never exceed `durationMs`.** Where the data says "the timer is longer" for Relaxed, standard
  play uses an internal deadline of about 75 % of `durationMs` (`game_value`) and Relaxed uses the
  full time.
- **Modes.** STANDARD; RELAXED exactly as the data's `relaxed` line says; ONE_BUTTON exactly as
  its `one_button` line says, with the whole playfield as the button plus Space/Enter, and
  `params.hold_to_toggle` turning holds into toggles. **Difficulty** scales with `assistLevel`
  (CADET easier, FLIGHT_DIRECTOR harder, about ±25 % on windows or speeds, `game_value`), never
  with player count.
- **Instruction and demo.** The host screen shows the data's one-line `how_to_play`; you provide
  `createDemo`: a non-interactive loop of about 3 s, auto-played by the model with scripted input
  and a ghost finger, matching STANDARD mode. No haptics in the demo.
- **Look.** Release quality, not debug drawing: tokens from `client/src/theme/tokens.css` (Space,
  Console, Ceramic, Signal, Sunlight); status always colour + shape + label + border; tabular
  numerals; every number has a unit; no emoji as UI, no external images, fonts or CDNs. Portrait
  360–430 px with safe areas, 48 px minimum targets, readable at 200 % text, sensible under
  `dir=rtl`. Device pixel ratio capped at 2.
- **Performance.** At least 30 fps with Chromium CPU throttling ×4; no per-frame allocation in hot
  loops; stop drawing when destroyed; each minigame chunk ≤ 60 KB minified; no new dependencies.
- **Haptics** through `env.haptic` (short patterns, ≤ 300 ms total) on hits, misses and threshold
  crossings. **Reduced motion:** no shake, no flashing, fewer particles.
- **Accessibility:** ARIA role, label and value text on the playfield; every mode playable from a
  keyboard.
- **Strings.** Name, instruction, success, relaxed, one-button and fact come from the data keys.
  New UI text goes in your fragment `en.mg_build.json` as `minigame.<id>.<area>.<name>` (MG-08's
  `minigame.MG-08.hud.*` is the pattern); never redefine a data key.
- **Accuracy.** Tag every constant `physical`, `real_world_approximate` or `game_value` in a
  comment and in the README. Add no player-facing scientific claim beyond the data's fact lines,
  except where a step below allows it and you document the source.
- **Teams.** `MinigameScreen` merges this player's `mg.start.assignments[].params` over `params`.
  Convention for the host (write it in each README): per-player params carry `slot` (0-based,
  equal to `assignments[].index`); common params carry `slots` (team size). Each phone decides its
  own player's success from the seed and params alone (protocol section 10). Teammates are
  decoration: use `env.coop` when it exists (below); otherwise simulate them deterministically
  from the seed and label them "crew", never as real players.

Proposed extension, **not yet in `types.ts`**: declare it in `<id>/coop.ts`, read it as
`(env as MinigameEnv & { coop?: CoopChannel }).coop`, work without it, and report it under
**Interface changes**:

```ts
export interface CoopChannel {
  index: number;                    // assignments[].index of this player, 0 if not listed
  count: number;                    // players in the split
  send(a: string, x: number[]): void; // mg.action; the screen adds runId and n; ≤ 10 Hz
  onShared(cb: (shared: MgMap) => void): () => void; // newer mg.state.shared; returns unsubscribe
}
```

## The minigame lab (step 1)

There is no page that mounts one minigame on its own, and you must not change shared code, so
build one inside `client/e2e/minigames/build/`:

- `lab.html` + `lab.ts`: query `mg`, `mode` (STANDARD | RELAXED | ONE_BUTTON), `assist` (CADET |
  ENGINEER | FLIGHT_DIRECTOR), `seed`, `dur` (ms; default `duration_s` × 1000 from the data),
  `p` (URL-encoded JSON merged over the data `params`), `demo=1` (mount `createDemo`), `rm=1`
  (reduced motion), `dir=rtl`, `scale=2` (200 % text). It loads the module with `loadMinigame`,
  imports `client/src/theme/*.css` and the real `t` from `client/src/i18n`, mounts into a
  390 × 844 frame, starts it, and exposes `window.__lab = { ready, result, haptics, progress,
  frames }` (a requestAnimationFrame counter).
- `build.spec.ts`: in `beforeAll` start Vite's dev server with the JavaScript API
  (`createServer({ root: <client dir>, configFile: <client>/vite.config.ts, server: { host:
  '127.0.0.1', port: 5181, strictPort: true } })`), close it in `afterAll`. Vite dev serves the lab
  at `/e2e/minigames/build/lab.html`. Use `page.clock` for deterministic screenshots. Fail on any
  console error or `[i18n] missing string` warning.
- Frame-rate check: CDP `Emulation.setCPUThrottlingRate { rate: 4 }`, real clock, 5 s of play,
  median fps from `__lab.frames` ≥ 30.

## Steps, in order

1. **Preflight and lab.** `npm ci`, `npm test`, `npm run build` pass on `main` (if the client
   shell is not on `main`, return `status=blocked`). Build the lab; smoke-test it with MG-08 if
   present (screenshot to `orchestration/evidence/T019/lab-smoke.png`, not to `client/e2e/`).

Steps 2–9 each deliver one minigame. Each ends with its Vitest file passing, `npm run build`
passing, `README.md` (params contract: key, unit, default, value type, common or per-player;
success and perfect; physics versus game simplification) and three lab screenshots in
`client/e2e/screenshots/minigames/`: `<id>-demo.png`, `<id>-play.png` (STANDARD mid-run with
scripted input), `<id>-onebutton.png`, plus its fps line.

2. **MG-02 Rocket Equation Balance** (30 s, parallel solo). Δv = Isp · g0 · ln(m0 / mf), g0 =
   9.80665 m/s² (`physical`). Each block adds the same propellant mass, so each adds less Δv than
   the last: show every block's marginal Δv shrinking. Params (`game_value` defaults):
   `isp_s`, `dry_mass_t`, `payload_t`, `block_t`, `target_dv_ms`, `band_ms`. The seeded target
   needs n* blocks; the band admits n*, n*+1 and n*+2, so "extra blocks" (n − n*) matters. Success:
   needle in band at the deadline with extra ≤ `extra_blocks_max` (1); perfect: n = n*. Blocks can
   be removed (each removal counts as handling time only). Needle in km/s. One-button: each press
   drops a block; the result is read at the deadline. `score` reflects closeness to n* (the
   "Rocket Scientist" award reads it).
3. **MG-01 Unit Converter Sprint** (25 s). Cards with values in lbf, ft or psi fly toward the
   upload line; swipe each into the lane with the matching SI value (N, m, kPa). Exact factors
   (`physical`, by definition): 1 lbf = 4.4482216152605 N, 1 ft = 0.3048 m, 1 psi = 6.894757293168
   kPa; display 3 significant figures. Distractor lanes include the unconverted number with the SI
   unit (the Mars Climate Orbiter mistake, fact F01) and a wrong factor. At least 12 seeded cards
   per run. Success: ≥ `correct_min` (8) correct and ≤ `wrong_max` (1) wrong; a card that reaches
   the line unsorted counts as wrong (**Decision**). Perfect: no wrong. One-button per the data.
4. **MG-29 Predict the Physics** (10 s, bonus). A bank of at least 8 two- or three-choice
   questions, each followed by a short animation that shows the answer (hammer and feather in a
   vacuum land together, F32; why astronauts float at about 90 % gravity, F06; a coasting
   spacecraft keeps moving, F12; a lower orbit is faster, F05; and other textbook mechanics).
   Every question is player-facing physics: in the README give the principle and, where the bank
   has one, the fact id. `params.question` (index) picks one, otherwise the seed does. Success:
   correct prediction locked before the animation; perfect: correct within the first half of the
   choosing time.
5. **MG-06 Shake Table** (30 s, cooperative split). Frequencies sweep upward; this player's slider
   sets the damping of one structural mode (`slot` picks the mode; seeded natural frequencies).
   Response = base-excitation amplification 1 / √((1 − r²)² + (2ζr)²), r = f / fn (`physical`);
   the sweep is time-compressed (`game_value`). A green band for the slider moves as the sweep
   passes resonances; the shared resonance meter sums every mode (teammates from `env.coop` or
   seeded crew). Success: slider in green ≥ `in_green_fraction_min` (0.8) of play time.
6. **MG-03 Weld Inspector** (25 s). Procedurally drawn X-ray film of tank weld seams; a finger
   sweep moves a scanning lens that reveals detail; tap porosity clusters and cracks. Success:
   found fraction ≥ `defects_found_fraction_min` (0.8) and false alarms ≤ `false_alarms_max` (1).
   Hit radius `game_value`; Relaxed enlarges defects and uses the full time. One-button: the
   scanner sweeps by itself; press while it is over a defect.
7. **MG-04 Orientation Check** (20 s). Sensors (an IMU with an axis arrow) and keyed connectors
   appear rotated next to their drawing; rotate each in 90° steps to match. Each run contains at
   least one wrong drawing (seeded); the player must press "drawing error" for it instead of
   matching it (fact F21, Genesis). Success: all correct, including that catch
   (`all_correct_required`, `drawing_error_catch_required`). Relaxed snaps when within one step.
8. **MG-05 Clean Room** (20 s). Particles drift onto a lens and a mirror; wipe them with strokes.
   "Too hard" is stroke speed (`game_value` px/s threshold scaled by screen size), or
   `PointerEvent.pressure` when the device reports real pressure; too hard leaves a scratch.
   Success: clean fraction ≥ `clean_fraction_min` (0.9) at the end and scratches ≤
   `scratches_max` (0). One-button: the swab moves by itself; hold to wipe gently.
9. **MG-30 Mission Patch Design** (30 s, cooperative, always succeeds). Phase 1: contribute one
   element whose category follows `slot` mod 4 (shape, symbol, colour, motto from a list of 8–12
   original short mottos). Phase 2: vote among 2–3 patches composed from the contributions.
   Actions `pick` x = [category, option], `vote` x = [candidate]; shared `elements` (number[],
   option per category, −1 for none) and `votes` (number[]). Without `env.coop`, compose the
   candidates locally from this player's pick and seeded crew picks. Vector patches in the style
   palette; no real mission patches, agency insignia or logos. `success` is always true; perfect =
   contributed and voted.
10. **Group check and review.** Full `npm test`, `npm run build`, `npm run e2e` (the existing session
    spec must still pass). One screenshot of any of your minigames with `dir=rtl&scale=2&rm=1`.
    One subagent reviews the work against this brief's acceptance list before you report.

## Acceptance

- `npm test`, `npm run build` and `npm run e2e` pass; outputs saved as
  `orchestration/evidence/T019/vitest.txt` and `playwright.txt`.
- Each delivered minigame has tests for: success exactly at and just past each data threshold,
  thresholds taken from host params, Relaxed easier than STANDARD, CADET easier and
  FLIGHT_DIRECTOR harder, determinism (same seed and inputs → identical result), frame-rate
  independence, a scripted good player succeeding on at least 20 seeds in every mode, an idle
  player failing (except MG-30), one-button play reaching success, perfect implying success.
- Screenshots exist for every delivered minigame; `orchestration/evidence/T019/fps.md` lists the
  median fps at ×4 throttle per minigame (all ≥ 30); copies of the screenshots in the evidence
  folder.
- `git status` shows no change outside the owned paths.
- The summary lists **Decisions** (every `game_value` you chose), **Interface changes** (use of
  `env.coop`, param conventions the host must follow) and any minigame not reached.

## Design references

Sections 10.1–10.5 (MG-01 to MG-06, MG-29, MG-30), 11.3 (knowledge points), 11.5 (Rocket
Scientist), 12.1, 13.4 (patches), 14.4, 16; protocol section 10; `data/minigames.json`.
