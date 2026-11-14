# MG-16 Station Docking

Parallel solo, 40 s, flight phase F8 (contract C3). Design section 10.5, task T021 step 8. The
team's best three average sets the result. Fact on the result screen: F12 (spacecraft dock at a
crawl because nothing stops on its own, Newton's first law).

A docking camera looks at a station port head-on: the ceramic module face, the docking ring with
teal guide petals, the target cross and the alignment target ring (the success limit at the port,
solid green inside, dashed amber outside). The port grows as the range closes and shifts with the
alignment error; the boresight crosshair stays in the centre. Readouts show range (cm), closing
speed (cm/s) and alignment error (cm); a gauge shows the closing speed against the 10 cm/s limit
and the 5 cm/s stretch mark. The thruster pad: four arrows (alignment) and CLOSER / BRAKE (range).
Several thrusters can be held at once (multi-touch).

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `alignment_error_below_cm` | cm | 10 | number | common | Success: alignment **strictly below** (data/minigames.json) |
| `contact_speed_below_cm_s` | cm/s | 10 | number | common | Success: contact speed **strictly below** (data/minigames.json) |
| `perfect_below` | cm and cm/s | 5 | number | common | Perfect: both strictly below (the C3 stretch is 5 cm/s), `game_value` |
| `start_range_cm` | cm | 150 | number | common | Start range, `game_value` |
| `slot`, `slots` | — | host | number | per-player / common | Unused (parallel solo) |

`hold_to_toggle` is ignored (one-button presses are pulses).

## Result

- **Success:** contact with alignment error < limit **and** contact speed < limit (strict).
- **Perfect:** both < 5; implies success.
- **Score:** 0 without contact; 0.5–1 for a success (better alignment and slower contact score
  higher); at most 0.25 for a failed contact.
- **`value`:** contact speed in **cm/s** (0.1 resolution), or **null without contact** (the host's
  best-three average should skip nulls).
- One result 1.2 s after contact, or at the deadline without contact (Standard and One-button
  75 % of `durationMs` = 30 s, Relaxed 97 %). Never after `durationMs`.

## Modes and difficulty (all `game_value`)

Start: range 150 cm, closing 3 cm/s, lateral offset 12–25 cm and a lateral drift of 0.4–1.0 cm/s
(seeded). Thrusters: 3 cm/s² per axis while held.

- **Relaxed:** alignment target × 1.5 (15 cm; "the alignment target is larger"), drift × 0.5; the
  speed limit stays at the data value.
- **One-button:** the alignment corrects itself (automatic controller) and the approach speeds up
  by 0.5 cm/s² (Cadet 0.4, Flight Director 0.6); each press (tap anywhere, Space, Enter) is a
  braking pulse of 2 cm/s over 0.25 s. An idle player hits the port too fast.
- **Cadet:** drift × 0.7; **Flight Director:** drift × 1.3.

Keyboard: arrow keys (alignment), W / Page Up (closer), S / Page Down (brake).

## Physics versus simplification

- **Physical:** Newton's first and second laws without friction: velocity changes only while a
  thruster fires, position integrates velocity.
- **Real-world approximate:** contact speeds of a few cm/s; the C3 stretch objective of 5 cm/s.
- **Game simplifications:** translation only (no attitude), a straight approach axis, constant
  seeded drift instead of orbital (Hill) relative motion, thrust levels, start conditions.

## Haptics, accessibility

Thruster tap: 8 ms (repeating every 0.25 s while held); critical status: 60-40-60 ms; contact:
40-30-120 ms (success) or 120-60-120 ms (≤ 300 ms). Canvas `role="application"` with a
mode-specific label; a polite live region reads status changes and the contact speed and
alignment. Readouts pair colour, icon and label; the alignment ring is solid or dashed. Reduced
motion removes the thruster puffs.
