# MG-18 Eclipse Power Juggle

Parallel solo, 25 s, flight phase F8 (entering Earth's shadow). Design section 10.5, task T021
step 6. Fact on the result screen: F14 (about 35 min of each ~90 min orbit in Earth's shadow).

The run shows a 42-minute slice of the orbit: 4 min of sunlight, 35 min of eclipse, 3 min of
sunlight, compressed into the run. An orbit diagram shows Earth, its shadow, the spacecraft and
the contact window; a chart shows the battery charge over the slice with the hatched red-line
zone, the sunlight/eclipse band and the contact window. Four rows switch the loads: heaters
(critical), radio (critical during the contact window), instrument and reaction wheels. All loads
start on, so running everything through the eclipse crosses the red line.

## Parameters

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `red_line_fraction` | fraction of capacity | 0.25 | number | common | Battery must stay **above** it, `game_value` |
| `perfect_instrument_fraction` | fraction of the run | 0.6 | number | common | Perfect threshold, `game_value` |
| `slot`, `slots` | — | host | number | per-player / common | Added by the host; unused (parallel solo) |

`data/minigames.json` stores no number for MG-18 (the design's success line has none).
`hold_to_toggle` is ignored (every input is a press).

## Result

- **Success:** at every fixed step the battery stayed above the red line (reaching it fails),
  the heaters were on, and the radio was on throughout the contact window (a radio switched off
  in the window has 0.4 s of grace before it counts, `game_value`).
- **Perfect:** success and the instrument collected (instrument **and** wheels on) for at least
  60 % of the run; implies success.
- **Score:** 0.3 + 0.7 × instrument share for a success; half the instrument share otherwise.
- **`value`:** omitted. One result at the end of the slice (97 % of `durationMs` in every mode).

## Decisions

- **Critical loads include a seeded must-run radio contact window** (7–10 orbit minutes inside
  the eclipse), so switching everything off cannot win: heaters and the radio window are rules.
- **The instrument only collects while the reaction wheels point it** (both must be on).
- **One-button never offers the heaters**: radio, instrument and wheels are highlighted in turn
  (1.3 s each; Cadet 1.6 s, Flight Director 1.1 s) and a press switches the highlighted load. A
  single mistimed press on the heaters would otherwise fail the run at once.

## Modes and difficulty (all `game_value`)

Battery 60 Wh × (Relaxed 1.35 — "the battery drains more slowly" —, Cadet 1.2, Flight Director
0.88); the red line stays at the same fraction. Start charge 64–74 % (seeded). Solar input 110 W in
sunlight (1 min penumbra ramp), 0 W in eclipse. Loads: heaters 18 W, radio 14 W, instrument 32 W,
wheels 10 W. Keyboard: 1–4 switch a load; ↑ / ↓ choose and Space / Enter switch.

## Physics versus simplification

- **Physical:** the battery's energy balance dE/dt = P_solar − ΣP_load (Wh per orbit minute =
  W / 60); no solar input in the shadow.
- **Real-world approximate:** ~35 min of eclipse in a ~92 min low orbit (F14).
- **Game simplifications:** the time compression, battery size, red line, solar and load powers,
  the penumbra ramp, no charge efficiency or temperature effects.

## Haptics, accessibility

Critical status: 70-50-70 ms; low battery: 30 ms; switch: 12 ms; one-button highlight: 6 ms
(≤ 300 ms). Canvas `role="application"` with a mode-specific label; a polite live region reads
status changes (immediately for critical ones). Switches show ON/OFF words and knob position;
a violated critical row gets the double "fails" border; the red-line zone is hatched with a
double edge.
