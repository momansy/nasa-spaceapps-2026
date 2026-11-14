# MG-25 Reacquire Signal

Design 10.5 (F11, parallel solo, 15 s, aggregation `none`, fact F19). Package E4 of T022. Uses the shared plumbing
in `../MG-22/kit.ts`.

**Play.** After the blackout, static fills the screen. Turn the circular tuning dial (drag around it, or ← / →
fine, Page Up / Page Down coarse); a waveform and a signal meter peak near the seeded beacon frequency. Press LOCK
(button, Space or Enter) inside the lock zone. **Success:** lock within `lock_time_max_s` (10 s). A LOCK outside the
zone costs 1 s of lock time and the button is dead for 0.5 s (so mashing does not work). The lock zone is drawn on the
dial in Relaxed and Cadet; otherwise it appears only when the dial is near it (Flight Director: nearer, design 9.3).
**Relaxed:** the beacon is stronger (peak 100 % instead of 80 %), the peak is broader, there is less static, the lock
zone is ×1.6 wider. **One-button:** the dial sweeps 0 → 1 by itself (0.18 per s, then starts over); the whole playfield
is the LOCK button (plus Space / Enter); zone ×1.5. **CADET** zone ×1.25, less static; **FLIGHT_DIRECTOR** zone ×0.8,
more static.
**Sound (optional):** the SOUND switch (or key S) turns on a tone whose pitch rises with the signal. It is off until
the player turns it on, started only from that tap or key press, and every cue also exists visually (waveform, meter).

## Params (`mg.start.params`)

| key | unit | default | type | scope | meaning |
|---|---|---|---|---|---|
| `lock_time_max_s` | s | 10 | number | common | success: lock time (clock + penalties) ≤ this (data, design 10.5) |
| `miss_penalty_s` | s | 1 | number | common | cost of a LOCK outside the zone; `game_value` |
| `zone_half` | dial units (0.01 = 1 kHz) | 0.03 (±3 kHz) | number | common | half-width of the lock zone; `game_value` |
| `beacon_strength` | 0–1 | 0.8 | number | common | peak signal at the beacon; `game_value` |
| `peak_sigma` | dial units | 0.045 (4.5 kHz) | number | common | width of the signal peak; `game_value` |
| `perfect_time_fraction` | 0–1 | 0.5 | number | common | perfect: no miss and lock within this fraction of the limit; `game_value` |
| `sweep_per_s` | dial units/s | 0.18 | number | common | one-button sweep speed; `game_value` |
| `slot`, `slots` | – | 0, 1 | int | host adds | ignored (solo minigame) |

Actions / shared keys: none (`env.coop` is not used). `hold_to_toggle` does not apply (nothing is held).

## Result

- `success`: LOCK pressed inside the zone with lock time = press time + 1 s × misses ≤ `lock_time_max_s`, exact in
  120 Hz steps (a press at exactly 10.000 s counts; one step later the signal is declared lost).
- `perfect`: success with no missed LOCK and lock time ≤ 50 % of the limit (5 s); implies success.
- `score`: success 0.6…1 (faster is higher); otherwise below 0.5 by the closest the dial got to the peak.
- `value`: not reported. The run ends 1.2 s after the lock or after the loss of the signal, never later than `durationMs`.

## Physics versus simplification

- *Physical (qualitative):* plasma around the capsule blocks radio during reentry (fact F19); once it clears, the
  receiver must find the beacon, whose signal is strongest when tuned to its frequency.
- *Game simplification:* the dial spans a 100 kHz window (dial 0…1 = −50…+50 kHz) around the carrier; signal strength
  is a Gaussian peak plus seeded static; the beacon position is seeded in 0.15…0.85 of the window. These are not a
  real link budget; the number of kilohertz is a `game_value`. The static never changes the result.

## Accessibility, haptics, performance

Canvas `role="slider"` (dial offset in kHz, −50…50) with `aria-valuetext` ("−12.4 kilohertz, signal 61 percent,
strong signal, fine tune") and a polite live region (at most every 1.5 s). Status is colour + glyph + word + border style.
Haptics: 12 ms tick when the signal gets strong, 40 ms on a missed LOCK, `[30, 40, 120]` on a successful lock,
`[60, 60, 60]` when the signal is lost. Reduced motion: static refreshes every 450 ms with fewer flecks, the waveform
does not scroll. DPR capped at 2, no per-frame allocation in the step loop, chunk about 14 kB.

## Decisions

Dial scale (100 kHz), zone ±3 kHz, 0.5 s button cooldown, perfect = no miss within 5 s, and the One-button zone ×1.5
are `game_value`s (the data stores only `lock_time_max_s`). One-button gets the wider zone because timing a press
replaces steering the dial; the data line ("the dial sweeps by itself") says nothing about the zone.
