# T021 — Phone minigames: orbit (package E3)

**Worker:** any coding worker with Node 20 and Playwright Chromium (no MCP server needed) ·
**Starts after:** the phone client shell is merged to `main` (`client/src/minigames/types.ts`,
`client/src/screens/MinigameScreen.tsx`, the i18n loader and MG-08)

mesh-model: sonnet
mesh-effort: high

**Owns (create):** `client/src/minigames/MG-13/` … `MG-21/` (nine folders);
`client/src/i18n/strings/en.mg_orbit.json`; `client/e2e/minigames/orbit/`;
`client/e2e/screenshots/minigames/` files named `MG-13-*` … `MG-21-*`; `orchestration/evidence/T021/`.

**Read only:** everything else in `client/`, `data/`, `protocol/`. Do not edit `types.ts`,
`MinigameScreen.tsx`, `net/mock.ts`, the store, the theme, the i18n code, `vite.config.ts`,
`playwright.config.ts`, `package.json` or another minigame's folder. You may import `mulberry32`
and `FixedStepper` from `../MG-08/model` (read only) or copy them.

Bounded work for a small plan: **finish one minigame completely (model, tests, view, lab
screenshots, README) before starting the next**, in the order of the steps. The first three are in
the vertical slice (C1 with MG-13, MG-15, MG-21). A run that ends early stops at a minigame
boundary. Use at most one subagent, for the final review. Nine minigames will not fit one small
run: **split point** steps 1–5 (lab, MG-13, MG-15, MG-21, MG-14), then 6–11.

## Read first

`GAME_DESIGN.md` 8.1 to 8.3 (constants, equations, simplifications), 9.1 (F8, F9), 10.1 to 10.3,
the 10.5 entries of your minigames, 12.1, 14.4, 16; `orchestration/ARCHITECTURE.md` section 7;
`assets/media/style/STYLE_GUIDE.md` (palette, the observation satellite design, Earth direction,
"no visible radio beams"); `client/README.md` ("Add a minigame", "Accessibility");
`client/src/minigames/types.ts`; **MG-08, the reference, if present** (`index.ts`, `model.ts`,
`model.test.ts`, `render.ts`): copy its structure, fixed-step loop, input handling, haptics and ARIA
approach. `data/minigames.json` (your entries and the top-level `design_notes`: `_min` ≥, `_max` ≤,
`_below` <) and the `minigame.<id>.*` keys in `data/strings/en.content.json`.
`protocol/messages.md` section 10, `mg.start`, `mg.action`, `mg.state`, `mg.result` (`value`),
`MgMap`.

## Rules for every minigame

- **Registration** is automatic: `types.ts` globs `./*/index.ts`. No shared file changes.
- **Structure** as MG-08: `model.ts` (pure: no DOM, no clock, no `Math.random`; fixed step 120 Hz or
  event-driven with input timestamps; `resolveConfig(params, mode, assistLevel)`), `render.ts`,
  `index.ts`, `model.test.ts`, `README.md`.
- **Deterministic from the seed**: same seed, params and input samples → same run and result on
  every phone and at any frame rate.
- **Success exactly per data**, thresholds from `params` with the data values as defaults. Where the
  data has no number, choose a `game_value`, document it, list it under **Decisions**. "Perfect" is
  a stricter `game_value` that implies success. `score` 0–1 rises with performance. One result, at
  the end of `durationMs` or when play ends, never after `destroy()`. Never exceed `durationMs`;
  where Relaxed has "more time", STANDARD uses an internal deadline of about 75 % of `durationMs`.
- **Modes:** STANDARD; RELAXED and ONE_BUTTON exactly as the data's `relaxed` / `one_button` lines
  say (the whole playfield is the button, plus Space/Enter; `params.hold_to_toggle` turns holds into
  toggles). **Difficulty** scales with `assistLevel` (about ±25 %, `game_value`), never with player
  count.
- **Demo:** `createDemo`, a non-interactive ~3 s loop with scripted input and a ghost finger,
  matching STANDARD; no haptics. The host shows the data's one-line instruction.
- **Look:** release quality with the tokens of `client/src/theme/tokens.css`; status = colour +
  shape + label + border; tabular numerals; units on every number; no emoji UI, no external assets;
  portrait 360–430 px, safe areas, 48 px targets, 200 % text, `dir=rtl`; DPR capped at 2. Earth:
  ocean navy, thin rim, clear day/night, no luminous halo. Spacecraft: the style guide's compact
  bus with two balanced solar wings, nadir aperture and separate antenna. Radio and imaging are
  never drawn as visible beams.
- **Performance:** ≥ 30 fps at Chromium CPU throttle ×4; no per-frame allocation in hot loops; chunk
  ≤ 60 KB minified; no new dependencies.
- **Haptics** via `env.haptic` (≤ 300 ms). **Reduced motion:** no shake, no flashing, fewer
  particles. **Accessibility:** ARIA role/label/value; keyboard play in every mode.
- **Strings:** data keys for name, instruction, success, relaxed, one-button, fact; new UI text in
  `en.mg_orbit.json` as `minigame.<id>.<area>.<name>`; never redefine a data key.
- **Accuracy:** tag every constant `physical`, `real_world_approximate` or `game_value`. Use μ⊕ =
  3.986004418 × 10¹⁴ m³/s² and R⊕ = 6 371 km (or the values of `core/Runtime/Constants/
  PhysicalConstants.cs`, which win if they differ). No new player-facing scientific claims beyond
  the data's fact lines unless the step allows it and the README gives the principle.
- **`value`** (protocol `mg.result`): MG-16 and MG-20 report one (units below); the others omit it.
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

Build a single-minigame page inside `client/e2e/minigames/orbit/` (you must not change shared code):

- `lab.html` + `lab.ts`: query `mg`, `mode`, `assist`, `seed`, `dur` (ms, default from the data),
  `p` (URL-encoded JSON merged over the data `params`), `demo=1`, `rm=1`, `dir=rtl`, `scale=2`.
  Loads with `loadMinigame`, imports `client/src/theme/*.css` and the real `t` from
  `client/src/i18n`, mounts into a 390 × 844 frame, exposes `window.__lab = { ready, result,
  haptics, progress, frames }`.
- `orbit.spec.ts`: start Vite dev with its JavaScript API in `beforeAll` (`createServer` with the
  client root and `vite.config.ts`, host `127.0.0.1`, **port 5183**, `strictPort`), close it in
  `afterAll`; open `/e2e/minigames/orbit/lab.html?...`; `page.clock` for deterministic shots; fail
  on console errors or `[i18n] missing string` warnings. Fps: CDP
  `Emulation.setCPUThrottlingRate { rate: 4 }`, real clock, 5 s, median ≥ 30.

## Steps, in order

1. **Preflight and lab.** `npm ci`, `npm test`, `npm run build` pass on `main` (otherwise
   `status=blocked`). Build the lab; smoke-test with MG-08 if present
   (`orchestration/evidence/T021/lab-smoke.png`).

Steps 2–10 each deliver one minigame, ending with its tests and `npm run build` passing, its
`README.md` (params contract: key, unit, default, value type, common or per-player; success,
perfect, `value` unit; physics versus simplification) and lab screenshots
`client/e2e/screenshots/minigames/<id>-demo.png`, `<id>-play.png`, `<id>-onebutton.png`, plus its
fps line.

2. **MG-13 Ground Station Pass** (20 s). A station rises, culminates at a seeded maximum elevation
   and sets across a sky dome (simplified pass geometry, time-compressed, `game_value`); drag the
   antenna reticle to keep it inside the lock circle; packets fill a data bar while locked. Success:
   lock ≥ `lock_fraction_min` (0.75). Relaxed: slower station, larger circle. One-button: the
   antenna tracks but drifts; press to re-centre. Fact F09.
3. **MG-15 Solar Wing Deploy** (20 s, cooperative split). Phase 1: a diagram shows the hinge release
   order; this player's hinge (`slot`) lights at its turn and must be released inside its window
   (early or late = out of order); teammates' hinges from `env.coop` or seeded crew. Phase 2: rotate
   the wing to face the Sun while the spacecraft turns; generated power ∝ cos θ (`physical`).
   Success: hinge released in order **and** Sun-pointing (|θ| ≤ `pointing_tolerance_deg`,
   `game_value`) ≥ `sun_pointing_fraction_min` (0.8) of phase 2. Draw the style guide satellite
   (wings stowed, then deployed on credible hinges). Fact F11.
4. **MG-21 Science Capture** (20 s, C1). A ground track scrolls over a stylised top-down Earth;
   targets (hurricane, wildfire, glacier, city lights, algae bloom) pass under it; snap while a
   target is inside the frame. Clouds spoil optical captures unless `params.radar` is true. Radar
   cannot image city lights, so with radar that target type is not offered, and city lights appear
   only on the night side (**Decision**, physically motivated). Success: ≥ `good_captures_min` (3)
   good captures; perfect: every passing target captured cleanly. Each good capture adds a small
   image tile to a strip. Fact F16.
5. **MG-14 Debris Dodge** (20 s). A radar plot shows a debris track and time to closest approach;
   choose a burn direction (prograde, retrograde, radial in, radial out) and duration. Miss distance
   from the Clohessy–Wiltshire linearisation (along-track drift ≈ 3 Δv t for a tangential impulse,
   much less for radial; `physical` approximation); collision probability is a `game_value`
   function of miss distance against a covariance size, shown as a gauge with the threshold.
   Δv_min = the smallest option on the menu that clears the threshold. Success: safe miss with Δv ≤
   `delta_v_ratio_max` (1.2) × Δv_min; perfect: Δv = Δv_min. Overburning shows wasted fuel. Fact F10.
6. **MG-18 Eclipse Power Juggle** (25 s). Battery energy (Wh) and loads (W): heaters (critical),
   radio, instrument, reaction wheels; solar input drops to zero in eclipse (a ~35 min eclipse
   compressed into the run, game simplification; fact F14). Critical loads include the heaters and
   a seeded must-run radio contact window, so switching everything off cannot win (**Decision**).
   Success: battery above the red line throughout and critical loads always on; `score` rewards
   time the instrument stays on. One-button: loads highlighted in turn; press to toggle.
7. **MG-20 Deorbit Burn** (15 s, team median sets the real burn). Hold to burn retrograde; the
   periapsis marker drops as Δv accumulates: from a circular orbit at r, v_a = √(μ/r) − Δv and the
   new periapsis follows from vis-viva and angular momentum (`physical`); the burn rate is
   time-compressed (`game_value`). Target band `target_lo_km`–`target_hi_km` (`game_value`
   defaults, documented). `value` = achieved periapsis altitude in km. Success: periapsis inside the
   band; perfect: inside its middle half. Already one button; `hold_to_toggle` switches to
   press-to-start / press-to-stop. Fact: the MG-20 line.
8. **MG-16 Station Docking** (40 s, team best-three average). Translation thrusters (up, down, left,
   right, forward, back) on a 2-D cross-section plus range; inertia is real (Newton's first law,
   F12); closing speed displayed in cm/s, alignment error in cm. Success: contact with alignment <
   `alignment_error_below_cm` (10) **and** speed < `contact_speed_below_cm_s` (10), strict;
   perfect: both under 5 (the C3 stretch is 5 cm/s). `value` = contact speed in cm/s (null without
   contact; document). One-button: alignment self-corrects; press for a braking pulse.
9. **MG-17 Alarm Triage** (20 s). Alarm codes arrive; drag each to IGNORE, MONITOR or ACT using a
   cheat sheet for the player's role (`params.role` index, else a generic sheet). Include the real
   program alarms 1201 and 1202 (computer busy, still working: safe to continue, fact F13); every
   other code is fictional and generic (for example `PWR-03 bus undervoltage`) and must not be
   presented as real. Success: ≥ `correct_fraction_min` (0.85) correct.
10. **MG-19 Scrubber Fix** (35 s, cooperative split, crewed). This player holds one spare part
    (`params.part` index: hose, tape, card, bag, sock) with a correct slot in an adapter that joins a
    square filter to a round socket; CO₂ rises on a gauge (`game_value` scale). Drag the part into
    its slot; a wrong slot costs time. Action `place` x = [part, slot]; shared `slots` (number[],
    part per slot or −1) and `co2_pct`. Success: this player's part placed correctly (the adapter's
    completion is shown when `env.coop` exists; it is not a local success input, **Decision**).
    Respectful tone (fact F15).
11. **Group check and review.** Full `npm test`, `npm run build`, `npm run e2e` (the existing session
    spec must still pass). One screenshot with `dir=rtl&scale=2&rm=1`. One subagent reviews against
    the acceptance list.

## Acceptance

- `npm test`, `npm run build`, `npm run e2e` pass; outputs in `orchestration/evidence/T021/vitest.txt`
  and `playwright.txt`.
- Each delivered minigame has tests for: success exactly at and just past each data threshold
  (strict `_below` checks for MG-16), host-param overrides, Relaxed easier than STANDARD, CADET
  easier and FLIGHT_DIRECTOR harder, determinism, frame-rate independence, a scripted good player
  succeeding on ≥ 20 seeds in every mode, an idle player failing, one-button success, perfect
  implying success. Physics checks with hand-computed values: MG-20 periapsis for a known Δv from a
  400 km circular orbit, MG-14 drift for a known impulse, MG-15 cos θ power.
- Screenshots exist for every delivered minigame, with copies in the evidence folder;
  `orchestration/evidence/T021/fps.md` lists median fps at ×4 throttle (all ≥ 30).
- `git status` shows no change outside the owned paths.
- The summary lists **Decisions**, **Interface changes** (`env.coop`, `slot`/`slots`, `radar`,
  `role`, `part`, `value` units) and any minigame not reached.

## Design references

Sections 8.1–8.3, 9.1, 10.1–10.5 (MG-13 to MG-21), 12.1, 14.4, 16; protocol section 10;
`data/minigames.json`.
