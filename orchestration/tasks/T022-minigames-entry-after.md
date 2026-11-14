# T022 — Phone minigames: entry, landing and investigation (package E4)

**Worker:** any coding worker with Node 20 and Playwright Chromium (no MCP server needed) ·
**Starts after:** the phone client shell is merged to `main` (`client/src/minigames/types.ts`,
`client/src/screens/MinigameScreen.tsx`, the i18n loader and MG-08)

mesh-model: sonnet
mesh-effort: high

**Owns (create):** `client/src/minigames/MG-22/` … `MG-28/` (seven folders);
`client/src/i18n/strings/en.mg_entry.json`; `client/e2e/minigames/entry/`;
`client/e2e/screenshots/minigames/` files named `MG-22-*` … `MG-28-*`; `orchestration/evidence/T022/`.

**Read only:** everything else in `client/`, `data/`, `protocol/`. Do not edit `types.ts`,
`MinigameScreen.tsx`, `net/mock.ts`, the store, the theme, the i18n code, `vite.config.ts`,
`playwright.config.ts`, `package.json` or another minigame's folder. You may import `mulberry32`
and `FixedStepper` from `../MG-08/model` (read only) or copy them.

Bounded work for a small plan: **finish one minigame completely (model, tests, view, lab
screenshots, README) before starting the next**, in the order of the steps. A run that ends early
stops at a minigame boundary. Use at most one subagent, for the final review. **Split point** if
dispatched as two runs: steps 1–5, then 6–9.

## Read first

`GAME_DESIGN.md` 8.2 (entry heating), 9.1 (F7b, F10 to F14), 9.9 (fail forward), 10.1 to 10.3, the
10.5 entries of your minigames, 12.1 (respect for real tragedies), 14.4, 15 (chute and touchdown
haptics), 16; `orchestration/ARCHITECTURE.md` section 7; `assets/media/style/STYLE_GUIDE.md`
(palette; blunt capsule with the heat shield leading and plasma wrapping the shoulder);
`client/README.md` ("Add a minigame", "Accessibility"); `client/src/minigames/types.ts`; **MG-08,
the reference, if present** (`index.ts`, `model.ts`, `model.test.ts`, `render.ts`): copy its
structure, fixed-step loop, input handling, haptics and ARIA approach. `data/minigames.json` (your
entries and the top-level `design_notes`: `_min` ≥, `_max` ≤, `_below` <), the `minigame.<id>.*`
keys in `data/strings/en.content.json`, `data/schema/common.schema.json` `$defs.failure_mode`.
`protocol/messages.md` section 10, `mg.start`, `mg.action`, `mg.state`, `mg.result` (`value`),
`MgMap`.

## Rules for every minigame

- **Registration** is automatic: `types.ts` globs `./*/index.ts`. No shared file changes.
- **Structure** as MG-08: `model.ts` (pure: no DOM, no clock, no `Math.random`; fixed step 120 Hz or
  event-driven with input timestamps from `event.timeStamp`; `resolveConfig(params, mode,
  assistLevel)`), `render.ts`, `index.ts`, `model.test.ts`, `README.md`.
- **Deterministic from the seed**: same seed, params and input samples → same run and result on
  every phone and at any frame rate.
- **Success exactly per data**, thresholds from `params` with the data values as defaults. Where the
  data has no number (MG-23, MG-26, MG-27, MG-28), choose a `game_value`, document it, list it under
  **Decisions**. "Perfect" is a stricter `game_value` that implies success. `score` 0–1 rises with
  performance. One result, at the end of `durationMs` or when play ends, never after `destroy()`.
  Never exceed `durationMs`; where Relaxed has "more time", STANDARD uses an internal deadline of
  about 75 % of `durationMs`.
- **Modes:** STANDARD; RELAXED and ONE_BUTTON exactly as the data's `relaxed` / `one_button` lines
  say (the whole playfield is the button, plus Space/Enter; `params.hold_to_toggle` turns holds into
  toggles). **Difficulty** scales with `assistLevel` (about ±25 %, `game_value`), never with player
  count.
- **Demo:** `createDemo`, a non-interactive ~3 s loop with scripted input and a ghost finger,
  matching STANDARD; no haptics. The host shows the data's one-line instruction.
- **Look:** release quality with the tokens of `client/src/theme/tokens.css`; status = colour +
  shape + label + border; tabular numerals; units on every number; no emoji UI, no external assets;
  portrait 360–430 px, safe areas, 48 px targets, 200 % text, `dir=rtl`; DPR capped at 2.
- **Performance:** ≥ 30 fps at Chromium CPU throttle ×4; no per-frame allocation in hot loops; chunk
  ≤ 60 KB minified; no new dependencies.
- **Haptics** via `env.haptic` (≤ 300 ms; CHUTE_OPEN and TOUCHDOWN shapes from
  `client/src/lib/haptics.ts` where they fit). **Reduced motion:** no shake, no flashing, fewer
  particles. **Accessibility:** ARIA role/label/value; keyboard play in every mode. **Sound** is
  optional, off until the player turns it on, started only from a user gesture, and never needed
  to play (a visual cue exists for every audio cue).
- **Strings:** data keys for name, instruction, success, relaxed, one-button, fact; new UI text in
  `en.mg_entry.json` as `minigame.<id>.<area>.<name>`; never redefine a data key.
- **Accuracy:** tag every constant `physical`, `real_world_approximate` or `game_value`; g0 =
  9.80665 m/s². No new player-facing scientific claims beyond the data's fact lines unless the step
  allows it and the README gives the source. Failures are engineering events; crew are never shown
  harmed.
- **`value`** (protocol `mg.result`): MG-22 and MG-24 report one (units below); the others omit it.
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

Build a single-minigame page inside `client/e2e/minigames/entry/` (you must not change shared code):

- `lab.html` + `lab.ts`: query `mg`, `mode`, `assist`, `seed`, `dur` (ms, default from the data),
  `p` (URL-encoded JSON merged over the data `params`), `demo=1`, `rm=1`, `dir=rtl`, `scale=2`.
  Loads with `loadMinigame`, imports `client/src/theme/*.css` and the real `t` from
  `client/src/i18n`, mounts into a 390 × 844 frame, exposes `window.__lab = { ready, result,
  haptics, progress, frames }`. For cooperative minigames, an optional `coop=1` installs a fake
  `env.coop` that echoes actions into a local shared state, so the shared path is testable.
- `entry.spec.ts`: start Vite dev with its JavaScript API in `beforeAll` (`createServer` with the
  client root and `vite.config.ts`, host `127.0.0.1`, **port 5184**, `strictPort`), close it in
  `afterAll`; open `/e2e/minigames/entry/lab.html?...`; `page.clock` for deterministic shots; fail
  on console errors or `[i18n] missing string` warnings. Fps: CDP
  `Emulation.setCPUThrottlingRate { rate: 4 }`, real clock, 5 s, median ≥ 30.

## Steps, in order

1. **Preflight and lab.** `npm ci`, `npm test`, `npm run build` pass on `main` (otherwise
   `status=blocked`). Build the lab; smoke-test with MG-08 if present
   (`orchestration/evidence/T022/lab-smoke.png`).

Steps 2–8 each deliver one minigame, ending with its tests and `npm run build` passing, its
`README.md` (params contract: key, unit, default, value type, common or per-player; actions and
shared keys; success, perfect, `value` unit; physics versus simplification) and lab screenshots
`client/e2e/screenshots/minigames/<id>-demo.png`, `<id>-play.png`, `<id>-onebutton.png`, plus its
fps line.

2. **MG-22 Entry Corridor** (25 s, team average sets the real flight-path angle). The capsule's
   flight-path angle γ drifts under seeded density and lift perturbations; the player steers it
   (drag changes the rate of γ). Too steep fills the heat bar, too shallow skips back to space.
   Corridor bounds `corridor_steep_deg` / `corridor_shallow_deg`: if you use Apollo-era numbers,
   cite the source in the README as `real_world_approximate`, otherwise mark them `game_value`.
   `value` = mean γ in degrees (negative below the horizon; document). Success: inside ≥
   `in_corridor_fraction_min` (0.85); FLIGHT_DIRECTOR hides the corridor edges until approached
   (9.3). One-button: hold to steepen, release to shallow. Fact F17.
3. **MG-23 Parachute Sequence** (20 s, cooperative split). Stages in order: forward-bay-cover chutes,
   drogues, pilots, mains (11 canopies in Orion's sequence, consistent with F18); this player owns
   the stage `slot` mod 4, extra players are backups. The descent (altitude m, speed m/s) runs
   deterministically; each stage's gate lights at its altitude/speed window (`game_value`).
   Deploying early tears the chute (speed too high); late gives a hard landing. Success: this
   player's chute opens inside its gate; perfect: inside the middle 40 % of the gate. Teammates'
   deploys from `env.coop` or seeded crew. CHUTE_OPEN haptic.
4. **MG-25 Reacquire Signal** (15 s). Static fills the screen after blackout (fact F19); turn a
   circular tuning dial; a waveform and a signal-strength meter peak near the seeded beacon
   frequency; press LOCK inside the lock zone. Success: lock within `lock_time_max_s` (10 s); a
   LOCK outside the zone costs 1 s (`game_value`). Relaxed: stronger beacon, wider zone. One-button:
   the dial sweeps; press LOCK at the peak. Optional sound per the rules.
5. **MG-24 Hoverslam** (20 s, team median). The booster falls from a seeded altitude and speed; one
   tap of IGNITE gives constant deceleration a = T/m − g (`physical`, with T/m > g and a minimum
   throttle too high to hover, which is the point of fact MG-24). Touchdown speed follows exactly:
   igniting late hits at √(v² − 2ah); igniting early stops above the ground and falls again from
   that height. A ghost marks the ideal ignition altitude h* = v² / (2a) (STANDARD: fades; Relaxed:
   stays). `value` = touchdown speed in m/s. Success: < `touchdown_speed_below_m_s` (2, strict);
   perfect: < 1 m/s (Hoverslam Hero). Already one button. TOUCHDOWN haptic.
6. **MG-26 Seven Minutes of Terror** (45 s relay of programming, then watch; C7). Seven EDL cards:
   heat shield, parachute, separate heat shield, radar, descent engines, sky crane, cut cables.
   Cards are dealt by `slot` (with fewer than seven players, a player holds several). Programming:
   place each own card in its position and set its trigger (altitude or time, `game_value`
   windows). Watch: the sequence plays with a label for the one-way light time (fact F20: about 4 to
   24 minutes) and arrives as a result. Action `place` x = [card, position, trigger]; shared `seq`
   (number[], card per position or −1). Success: every own card in the right position with its
   trigger in window.
7. **MG-27 Recovery Team** (20 s, cooperative split). Units: swimmers by helicopter, flotation
   collar by boat, recovery ship; this player's unit from `params.unit` (or `slot` mod 3). Find the
   capsule by a beacon whose signal strength rises as you close in (seeded position), then arrive in
   order swimmers → collar → ship. Success: this player's unit arrives after the unit before it and
   before the unit after it (scheduled crew arrivals or `env.coop`). One-button: the unit steers
   itself; press to set off when it is your turn.
8. **MG-28 Root Cause Investigation** (45 s, cooperative, debrief). Players combine telemetry clue
   cards (pressure spike, temperature drop, vibration, software log, …) into a chain of evidence and
   name the root cause. **This contract is shared with T024**, whose host Investigation screen keeps
   the shared state; implement it exactly and write it in `MG-28/README.md`:
   - common params: `cause_options` (number[4], indices into the `failure_mode` enum of
     `data/schema/common.schema.json`, in that order), `cause_correct` (0–3, index into
     `cause_options`), `clues` (number[], clue-card ids indexing the clue table in `MG-28/clues.ts`),
     `chain_len` (int);
   - per-player params: `slot`, `cards` (number[], indices into `clues` dealt to this player);
   - actions: `place` x = [clueIndex, chainSlot], `clear` x = [chainSlot], `vote` x =
     [optionIndex];
   - shared state: `chain` (number[], clue index per chain slot or −1), `votes` (number[4]),
     `locked` (boolean).
   `clues.ts` defines, for each of the 14 failure modes, 3–5 clue cards (telemetry channel, pattern,
   flight phase, one-line text key) plus generic red-herring cards, and the correct chain order.
   Without `params.clues`, build a seeded investigation locally (root cause and 3 distractors).
   Without `env.coop`, the player sees all clues, own cards highlighted. Success: this player's
   final vote equals `cause_correct`; perfect: also every own card placed in a correct chain
   position. Relaxed marks the starting clue. Clue texts describe engineering evidence only.
9. **Group check and review.** Full `npm test`, `npm run build`, `npm run e2e` (the existing session
   spec must still pass). One screenshot with `dir=rtl&scale=2&rm=1`. One subagent reviews against
   the acceptance list.

## Acceptance

- `npm test`, `npm run build`, `npm run e2e` pass; outputs in `orchestration/evidence/T022/vitest.txt`
  and `playwright.txt`.
- Each delivered minigame has tests for: success exactly at and just past each data threshold
  (strict `_below` for MG-24), host-param overrides, Relaxed easier than STANDARD, CADET easier and
  FLIGHT_DIRECTOR harder, determinism, frame-rate independence, a scripted good player succeeding
  on ≥ 20 seeds in every mode, an idle player failing, one-button success, perfect implying
  success. Physics checks with hand-computed values for MG-24 (late, ideal and early ignition) and
  MG-22's mean γ. MG-28 tests the action/shared-state contract with the lab's fake `env.coop`.
- Screenshots exist for every delivered minigame (MG-28 also with `coop=1`), with copies in the
  evidence folder; `orchestration/evidence/T022/fps.md` lists median fps at ×4 throttle (all ≥ 30).
- `git status` shows no change outside the owned paths.
- The summary lists **Decisions**, **Interface changes** (`env.coop`, `slot`/`slots`, `unit`, the
  MG-26 and MG-28 contracts, `value` units) and any minigame not reached.

## Design references

Sections 8.2, 9.1, 9.3, 9.9, 10.1–10.5 (MG-22 to MG-28), 12.1, 14.4, 15, 16; protocol section 10;
`data/minigames.json`; brief T024 (host side of MG-28).
