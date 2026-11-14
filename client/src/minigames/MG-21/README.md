# MG-21 Science Capture

Parallel solo, 20 s, flight phase F8 (C1 Earth Watch, several times). Design section 10.5, task
T021 step 4. Fact on the result screen: F16 (Landsat has imaged Earth continuously since 1972).

A ground track scrolls over a stylised top-down Earth (ocean navy, muted land, a clear day/night
terminator, no halo). Targets (hurricane, wildfire, glacier, city lights, algae bloom) pass
under it. Drag across to point the camera frame (cross-track pointing, the dashed lines are the
reach of the camera), then tap, press the shutter or Space / Enter while the target is inside
the frame. The frame turns solid green when a snap would be good, dashed amber when the target
is clouded or not fully inside. Each good capture becomes an image tile (the real crop of the
ground under the frame, greyscale for radar) in the strip under the view; a target that passed
without a good capture gets a crossed octagon.

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `good_captures_min` | captures | 3 | number | common | Success threshold (data/minigames.json), `≥` |
| `target_count` | targets | 6 | number | common | Targets offered, 3–10, `game_value` |
| `radar` | — | false | boolean | common | Imaging radar payload chosen: clouds never spoil a capture, works at night, **no city lights offered** |
| `speed_scale` | × | 1 | number | common | Ground-speed multiplier for tuning, 0.3–2 |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; unused (parallel solo) |

`hold_to_toggle` is ignored (the shutter is a press).

## Result

- **Success:** good captures ≥ `good_captures_min` (exactly 3 counts).
- **Perfect:** every offered target captured cleanly (each one good); implies success.
- **Score:** good captures / targets − 0.03 per wasted shot (empty, clouded, badly framed or a
  repeat), clamped to 0–1.
- **`value`:** omitted. One result when the pass ends (Standard 75 % of `durationMs`, Relaxed 97 %).

A capture is **good** when the target is the one nearest the frame centre, its centre is inside
the frame inset by half a target radius, it was not captured before, and (optical only) no
cloud covers it. The shutter needs 0.3 s between shots.

## Decisions (physically motivated, documented here as the principle)

- **Optical targets need daylight; city lights need night.** An optical camera records reflected
  sunlight, so wildfire, glacier, algae bloom and hurricane targets are placed on the day side;
  city lights are only visible at night, so they are placed on the night side. Every optical run
  crosses the terminator once.
- **Radar sees through clouds and in the dark but not city lights.** An imaging radar sends its
  own microwaves; it does not record visible light, so with `radar` city lights are never offered.
- **A hurricane is clouds**, so clouds never spoil a hurricane capture.
- Every clouded target keeps a clear moment of at least 0.4 s inside the frame (the cloud either
  clears from it as it enters or closes over it as it leaves), so "perfect" is always possible.

The only player-facing wording is the mode badge "OPTICAL · CLOUDS BLOCK" / "RADAR · CLOUDS DO
NOT BLOCK", which restates the design's own instruction ("avoiding clouds unless you chose radar").

## Modes and difficulty (all `game_value`)

Units: the camera's cross-track reach = 1 (half-width). Ground speed 0.55 half-widths/s; frame
half-size 0.32 across × 0.36 along; pointing ≤ 2.6 half-widths/s; keyboard 1.6/s.

| | Ground speed | Frame | Clouded share | Other |
|---|---|---|---|---|
| Standard | × 1 | × 1 | 55 % | Pass uses 75 % of the run |
| Relaxed | × 0.7 | × 1.35 | | Pass uses 97 % of the run |
| One-button | × 1 | × 1.15 | | The camera points itself at the next target; any press snaps |
| Cadet | | × 1.2 | 35 % | |
| Flight Director | × 1.1 | × 0.85 | 75 % | |

## Physics versus simplification

- **Physical (qualitative):** the principles under Decisions; the frame moves with the ground
  track at a steady speed and the camera points across it.
- **Game simplifications:** ground speed (real ≈ 7 km/s), frame size, number of targets, cloud
  size and drift, the shutter recovery and framing tolerance; one terminator crossing per run;
  the ground is drawn, not a map.

## Haptics, accessibility

Good capture: 18-30-18 ms; wasted shot: 45 ms (≤ 300 ms). Canvas `role="application"` with a
mode-specific label; a polite live region announces each shot result and "Target in frame, snap
now". Reduced motion: half the decorative clouds and an outline instead of the shutter flash.
The shutter button is 60–80 CSS px.
