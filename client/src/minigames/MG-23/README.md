# MG-23 Parachute Sequence

Design 10.5 (F12, cooperative split, 20 s, aggregation `none`, fact F18). Package E4 of T022. Uses the shared
plumbing in `../MG-22/kit.ts`.

**Play.** Four stages fire in Orion's order: forward-bay-cover chutes, drogues, pilots, mains (11 canopies:
3 + 2 + 3 + 3, fact F18). This player owns stage `slot` mod 4 (`params.stage` overrides it); extra players
(slot ≥ 4) are *backups* for the same stage and are labelled BACKUP. The descent (altitude m, speed m/s) runs
the same for everyone from the seed; each stage's **gate** lights at a window of altitude and speed. Press DEPLOY
(or Space / Enter) while your gate is lit. Early = chute torn (speed too high); late = hard landing; no press =
missed. **Relaxed:** the gate is ×1.6 wider ("the gate stays lit longer"), the gate window is drawn from the start.
**One-button:** the data says "already one button", so the gate is unchanged; the whole playfield is the button
(plus Space / Enter). **CADET** gate ×1.25 (+ guide), **FLIGHT_DIRECTOR** ×0.8.

## Params (`mg.start.params`)

| key | unit | default | type | scope | meaning |
|---|---|---|---|---|---|
| `slot` | – | 0 | int | per player | 0-based, equals `assignments[].index`; the stage is `slot` mod 4, backup rank `floor(slot / 4)` |
| `slots` | – | 1 | int | common | number of players |
| `stage` | – | `slot` mod 4 | int 0–3 | per player | force the owned stage (0 cover, 1 drogue, 2 pilot, 3 main) |
| `gate_half_s` | s | 0.9 | number | common | half-width of a gate in play time (gate is 1.8 s wide); `game_value` |
| `perfect_fraction` | 0–1 | 0.4 | number | common | perfect: inside the middle fraction of the gate; `game_value` |
| `start_altitude_m` | m | 9000 | number | common | altitude shown at the start; `game_value` |
| `start_speed_m_s` | m/s | 240 | number | common | speed shown at the start; `game_value` |

**Actions / shared keys** (optional, display only; the game works without `env.coop`):
action `deploy` x = `[stage, playTimeMs]` (once, when this player presses); shared `deployed` (number[4]) =
play time in ms of each stage's deployment, −1 until it happens. Without `env.coop` the other three stages are
deployed by a seeded crew labelled "crew". Teammates never change this player's result.

## Result

- `success`: the own chute opens inside its gate, boundaries included (|offset| ≤ half-width).
- `perfect`: inside the middle 40 % of the gate (|offset| ≤ 0.4 × half-width); implies success.
- `score`: inside the gate 0.6…1 by how central; outside < 0.5 by how far; no deploy 0.
- `value`: not reported.
- One result at the end of `durationMs`; never after `destroy()`.

## Physics versus simplification

- *Physical:* a canopy stage multiplies the drag area, so the speed relaxes towards a lower terminal speed,
  `v(s) = v_k + (v_prev − v_k)·e^(−(s − s_k)/τ_k)`; altitude falls by the integral of the speed.
- *Real-world approximate:* 11 canopies in four stages and the final speed of about 30 km/h (8.3 m/s), fact F18.
- *Game values:* the profile is scripted and not an Orion flight profile (start 9,000 m and 240 m/s, stage
  speeds 200 / 112 / 92 / 8.3 m/s, τ 1.1–1.5 s, gate centres about 3.2 / 7.0 / 10.6 / 14.6 s with a seeded shift,
  gate width). Play time is compressed; the displayed altitude ends at 25 m. The player's own deploy does not
  change the descent. The gate is a window in play time, equivalent to a window in altitude and speed because both
  fall monotonically.

## Accessibility, haptics, performance

Canvas `role="button"` with a label; the stage, state and altitude go to a polite live region (at most every 1.5 s). Status is colour +
glyph + word + border. Haptics: CHUTE_OPEN shape `[20, 40, 140]` when the own chute opens in its gate, a 14 ms
tick when the gate lights, `[60, 60, 60]` for torn / late / missed. Reduced motion: no flash or shake. DPR capped
at 2; no per-frame allocation in the step loop; chunk well under 60 KB (≈ 12 kB).

## Decisions

Gate half-width 0.9 s, perfect 40 % of the gate (from the brief), Relaxed ×1.6, and all descent numbers are
`game_value`s: `data/minigames.json` stores no number for MG-23.
