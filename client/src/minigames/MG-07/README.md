# MG-07 Go/No-Go Poll

Countdown F1, relay, about 5 s per player (design 10.5). FLIGHT calls each console in turn;
when it is this player's turn their three readings appear with the launch-commit limits and
they answer GO or NO-GO. Fact F31 (lightning rules).

Files: `model.ts` (pure rules, `model.test.ts`), `render.ts` (canvas), `index.ts` (glue). The
shared plumbing is in `../MG-09/shared/` (see the MG-09 README).

## Relay timing

- This player's turn starts at **`slot × turnMs`** ms of play (protocol: RELAY turn =
  `startAtMs + index × params.turnMs`), kept inside `durationMs`. The host sends
  `durationMs` for the whole relay (`slots × turnMs`).
- Before the turn the screen shows FLIGHT's loop: every console, "standing by", "polling", then
  its call (GO check / NO-GO octagon / no call), from `env.coop` or the seeded crew.
- The answer window opens with the turn. Answers before the turn are ignored; the first answer
  in the window is final. **The result is reported right after the answer, or when the window
  closes without one** (the host then moves on).

## Controls

| Mode | Input |
|---|---|
| Standard / Relaxed | GO and NO-GO buttons (80 px). Keys G or 1 = GO, N or 2 = NO-GO. |
| One button | GO and NO-GO light up in turn (1.1 s each, starting with GO); press the screen, Space or Enter while your answer is lit. |

## Parameters

| Key | Unit | Default | Type | Scope | Meaning |
|---|---|---|---|---|---|
| `turnMs` | ms | `durationMs / slots` | number | common | Relay turn length (protocol). Without it the run is shared equally (7500 ms when the run length is unknown, game value) |
| `answer_window_s` | s | 5 (data) | number | common | Standard answer window |
| `readings_per_console` | — | 3 (data) | int | common | Readings shown when generated (1–6) |
| `perfect_fraction` | — | 0.5 | number | common | Perfect: right call within this fraction of the window (game value) |
| `channels` | index | — | number[] | per player | Channel of each reading, index into the table below |
| `values` | channel unit | — | number[] | per player | Reading values |
| `limits_lo` | channel unit | — | number[] | per player | Lower limits (use a very negative number for none) |
| `limits_hi` | channel unit | — | number[] | per player | Upper limits (use a very large number for none) |
| `slot` | — | 0 | int | per player | Relay position (= `assignments[].index`) |
| `slots` | — | 1 | int | common | Number of consoles polled |

The four arrays are parallel and are used only when all four are present with at least as many
`values` / limits as `channels`; otherwise the readings are generated from the seed and the
slot: three different channels, about 40 % of consoles NO-GO (one reading, sometimes two, out by
6–25 % of the span), in-limit values half the time within 3–15 % of an edge, never exactly on
a limit, rounded to the channel's display precision before judging.

### Channel table (`channels` index)

Limits are **real-world approximate** orders of magnitude chosen for the game, not the commit
criteria of a particular vehicle.

| Index | Channel | Unit | Limits |
|---|---|---|---|
| 0 | Winds aloft | m/s | ≤ 34 |
| 1 | Ground wind | m/s | ≤ 15 |
| 2 | LOX temperature | K | 66–92 (LOX boils near 90 K at sea-level pressure) |
| 3 | Battery voltage (28 V bus) | V | 26–32 |
| 4 | Nearest lightning | km | ≥ 18.5 (about 10 nautical miles) |
| 5 | Fuel tank pressure | kPa | 230–290 |
| 6 | Hydraulic pressure | MPa | 19–23 |
| 7 | Avionics temperature | °C | 5–40 |

## Result

- Right call: GO when every reading is within its limits (limits inclusive), otherwise NO-GO.
- `success`: the right call within the window (an answer exactly at the end counts).
- `perfect`: success within `perfect_fraction` of the window (2.5 s by default).
- `score`: 0.6 + 0.4 × (time left / window) on success, 0 otherwise. No `value`.

## Teammates and `env.coop`

- With `env.coop` the phone sends `mg.action` `{ a: "call", x: [1 GO / 0 NO-GO, answer ms] }`
  and shows teammate `i`'s call when the host's shared state holds `call_<i>` (1 or 0).
  **Host convention (proposed):** copy each player's last `x[0]` into `shared["<a>_<slot>"]`.
- Without it, the other consoles are seeded "crew" (answer 1.2–3.8 s into their turn, 72 % GO,
  5 % no answer). Their calls are decoration: each phone judges only its own answer.

## Modes and difficulty (game values)

| | Window | Other |
|---|---|---|
| Standard, Engineer | 5 s (data) | gauges with the limit band |
| Relaxed | × 1.5, never longer than the turn | |
| One button | × 1.5 (time for the highlight to come round), within the turn | highlight 1.1 s |
| Cadet | × 1.25 | highlight 1.4 s |
| Flight Director | × 0.8 | numbers and limits only, no gauge; highlight 0.9 s |

## Haptics, motion, accessibility

- `[25, 40, 25]` when FLIGHT calls this console; an 8 ms tick when the one-button highlight
  moves. No flashing; nothing moves except the timer bar.
- Canvas `role=application`; the value text reads every reading with its unit and limits when
  the turn starts, and the lit answer in one-button mode.
- The reading needle is drawn in text colour: the game never colours a reading by its status
  before the call (that would give the answer away). After the call each reading gets a check or
  an octagon.

## Decisions

- Without `turnMs` the turn is `durationMs / slots`, so turns never overlap. Relaxed gets "more
  time" only when the turn is longer than 5 s (the host can send e.g. `turnMs` = 7500); with
  5 s turns the Relaxed window is capped at 5 s.
- Standard keeps the data's 5 s window (the 75 % internal deadline rule is not applied, because
  the extra Relaxed time fits in the turn instead).
- Perfect = right call in the first half of the window.
- Readings are hidden until the turn starts, so every console gets the same time to read.
