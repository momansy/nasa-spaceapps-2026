# MG-17 Alarm Triage

Parallel solo, 20 s, flight phase F8 or descent (guaranteed after "Software Bug Found"). Design
section 10.5, task T021 step 9. Fact on the result screen: F13 (Apollo 11's 1202 alarms: the
computer was overloaded but kept the important tasks running and the landing continued).

Alarm cards arrive in a stack. Drag the top card into IGNORE, MONITOR or ACT (or tap a bin, or
keys 1–3 / ← ↓ →) using the cheat sheet above the stack. Each card shows a code, a short text and
a tag: **APOLLO PROGRAM ALARM** for the real 1201 / 1202, **SIMULATED** for every other code.

## Cheat sheet (game value rules)

| Alarm | Bin |
|---|---|
| 1201 / 1202 program alarm (real: computer busy, still working) | MONITOR (safe to continue, keep watching) |
| Code ending 1–2 (advisory) | IGNORE |
| Code ending 4–5 (caution) | MONITOR — **ACT** when it is in a subsystem your role owns |
| Code ending 7–9 (warning) | ACT |

Role subsystems (`params.role` as an index into `data/roles.json` or a role id): BOOSTER and
RETRO own PRP (propulsion), GUIDO and FIDO own GNC (guidance), EECOM owns PWR and THM, INCO owns
COM. Other roles, or no role, get the generic sheet.

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `correct_fraction_min` | fraction 0–1 | 0.85 | number | common | Success threshold (data/minigames.json), `≥` |
| `alarm_count` | alarms | 12 (One-button 8) | number | common | Alarms per run, 4–20, `game_value` |
| `role` | index or id | none | number / string | **per player** | Picks the cheat sheet |
| `slot`, `slots` | — | host | number | per-player / common | Unused (parallel solo) |

## Result

- **Success:** correct ≥ `correct_fraction_min` × alarms (whole alarms, exactly 85 % counts; 11 of
  12, 17 of 20). Alarms not sorted by the end count as wrong.
- **Perfect:** every alarm correct; implies success. **Score:** the correct fraction.
- **`value`:** omitted. One result 0.8 s after the last alarm is sorted, else at the deadline
  (Standard 75 % of `durationMs`; Relaxed and One-button 97 %).

## Decisions

- **1201 / 1202 → MONITOR**: the design says such program alarms "can be safely continued"; of the
  three bins, MONITOR (continue, keep watching) matches; IGNORE would be wrong.
- Every run includes both real alarms and, for a role with subsystems, a caution in its own
  subsystem. All other codes and texts are fictional, generic and tagged SIMULATED. The real
  alarms' text only restates fact F13.

## Modes and difficulty (all `game_value`)

Arrivals every 1.0 s (Cadet × 1.2, Flight Director × 0.85); Relaxed × 1.45 ("alarm codes arrive
more slowly"). One-button: IGNORE, MONITOR, ACT highlighted in turn every 1.1 s (Cadet 1.4 s,
Flight Director 0.9 s), restarting with each new alarm; a press anywhere picks the highlighted
bin; alarms come × 1.5 slower and there are 8 of them (waiting for the highlight takes longer).

## Haptics, accessibility

New alarm: 10 ms; correct: 14 ms; wrong: 50-40-50 ms (≤ 300 ms). Canvas `role="application"`
with a mode-specific label; a polite live region reads each new alarm ("Alarm PWR-07: Main bus
undervoltage") and, in one-button mode, each highlighted bin. Bins carry an icon and a word; the
feedback strip pairs colour, icon, label and border.
