# MG-06 Shake Table

Cooperative split, 30 s, build stage vibration test. Design section 10.5, task T019 step 5.
Fact on the result screen: `minigame.MG-06.fact` (vibration tables).

An electrodynamic shaker with a slip table and the satellite on its adapter ring. A sine sweep
runs from 8 Hz to 60 Hz and back. Each player damps one structural mode with a vertical damper
slider. Next to the slider, a chart shows the green band over the last 3 s and the next 2 s (so
the player sees a resonance coming) with the player's own damper trace. The sweep axis marks
every mode ("You", "Crew" or "Team") with its resonance zone; the team meter shows the mean
amplification of all modes with its red line.

| File | What |
|---|---|
| `model.ts` | Amplification, sweep, seeded modes, green band, crew stand-ins, one-button damper, scoring, scripted player (pure) |
| `render.ts` | Shaker scene (payload flexes with the mode), team meter, sweep axis, band chart, slider |
| `index.ts` | Canvas, input (drag, keys, one button), loop, haptics, ARIA, `env.coop` |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `in_green_fraction_min` | fraction 0–1 | 0.8 | number | common | Success, `≥` (data) |
| `perfect_fraction_min` | fraction 0–1 | 0.95 | number | common | Perfect, `game_value` (raised to success if lower) |
| `band_zeta` | damping ratio | 0.12 | number | common | Green band width, `game_value` |
| `hold_to_toggle` | — | false | boolean | common | One-button: a tap toggles stop / go instead of holding |
| `slot` | index | 0 | integer | **per-player** | This player's mode is `slot mod modes` (= `assignments[].index`) |
| `slots` | players | 1 | integer | common | Team size; modes on the table = min(slots, 4) |

## Rules

- **Amplification (`physical`):** A(r, ζ) = 1 / √((1 − r²)² + (2 ζ r)²), r = f / fn.
- **Sweep (`game_value`):** log-frequency triangle 8 → 60 Hz, three legs (up, down, up) over the play
  time; Relaxed two legs ("the sweep is slower"). Real vibration tests sweep wider and far slower:
  the sweep is time-compressed.
- **Modes (`game_value`):** natural frequencies seeded from 14 Hz to 34 Hz, one band of the range per
  mode, so each leg crosses every resonance.
- **Green band:** lower edge = the least damping that keeps A ≤ 1.8 (the red line, `game_value`) at
  the current frequency, zero away from resonance; width 0.12 (`game_value`). Below the band the
  mode resonates (red, octagon); above it the damper is overworked (amber, triangle). The damper
  travels 0–50 % of critical damping (ζ 0–0.5) and starts at 36–46 %, above the resting band, so an
  idle player fails; a player who parks low also fails (about 30 % of the sweep is near a resonance).
- **Success:** in green ≥ `in_green_fraction_min` of the play steps (exactly counts). **Perfect:**
  ≥ `perfect_fraction_min`. **Score:** the in-green fraction. Teammates never change this result.

## Modes and difficulty (all `game_value`)

| | Band width | Sweep legs | Other |
|---|---|---|---|
| Standard / Engineer | 0.12 | 3 | |
| Relaxed | ×1.5 | 2 (slower) | |
| One-button | ×1.6 | 3 | the damper slides by itself at 0.7 / s between 0 and 50 %; holding (or a toggle with `hold_to_toggle`) stops it |
| Cadet | ×1.25 | | |
| Flight Director | ×0.8 | | |

Keyboard: Up / Down arrows (hold to keep moving), Home / End; one-button: hold Space or Enter.
ARIA: `role=slider` with value text "Damping 18 % of critical" and a live region for zone changes.

## Team play (interface for the host)

- Per-player params carry **`slot`** (0-based, equal to `assignments[].index`); common params carry
  **`slots`** (team size).
- With `env.coop` the phone sends `mg.action` **`damp`** with x = [slot, damping in ‰] at most five
  times a second when it changed by 5 ‰ or more.
- It reads teammates from `mg.state.shared.damp` (number[] indexed by slot, ‰, −1 for unknown).
  A host that does not keep that array still works: the phone reads the last move
  (`last_a` = "damp", `last_x` = [slot, ‰]) as the mock host echoes it.
- Teammate values only drive the team meter and the "Team" labels. Without `env.coop`, or for
  modes nobody reports, seeded crew stand-ins track their own band with a 0.3–0.55 s lag; they are
  labelled "Crew", never as players.

## Physics versus game simplification

Physical: the single-mode base-excitation amplification and r = f / fn. Game: the sweep range and
compression, one mode per player, the 1.8 red line, the band width and the "overworked damper"
upper edge (in a real structure more damping is never worse for this response), the payload
drawing and its shear-shaped deflection, the crew stand-ins.
