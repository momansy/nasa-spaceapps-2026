# MG-08b Propellant Loading

Countdown F1, parallel solo, 20 s (design 10.5). Tap the fill valve up and down to keep the
tank's net fill rate in the target band while boil-off vents continuously; the tank must be at
least 99 % full at T−0 without an overpressure.

Files: `model.ts` (pure rules, `model.test.ts`), `render.ts` (canvas), `index.ts` (glue). The
shared plumbing is in `../MG-09/shared/` (see the MG-09 README).

## Screen

Status strip (phase and band), read-outs (tank level against the 99 % needed; net fill rate in
%/s), the LOX tank cutaway zoomed on 60–101 % with the 90 % slow-fill mark, the 99 % target and
the double red RELIEF line at 100 %, boil-off vapour at the vent, the fill-rate gauge with the
three phase bands (the current one bright), the valve steps and CLOSE / OPEN buttons.

## Controls

| Mode | Input |
|---|---|
| Standard / Relaxed | CLOSE / OPEN buttons: one valve step per tap (0–6). Keys ↑ / → / + open a step, ↓ / ← / − close a step, Home closes. |
| One button | Hold the screen, Space or Enter to open the fill valve (like 4 steps), release to close. `hold_to_toggle`: each press toggles it. |

## Parameters

| Key | Unit | Default | Type | Scope | Meaning |
|---|---|---|---|---|---|
| `fill_fraction_min` | fraction | 0.99 (data) | number | common | Success: tank level at T−0 ≥ this; also where topping starts |
| `overpressure_allowed` | — | false (data) | boolean | common | When false, an overpressure fails |
| `perfect_in_band_min` | fraction | 0.7 | number | common | Perfect: success and net rate in band ≥ this fraction of the time (game value) |
| `hold_to_toggle` | — | false | boolean | per player (device setting) | One-button: presses toggle the valve |
| `slot`, `slots` | — | — | int | added by the host screen | Not used (parallel solo) |

`env.coop` is not used.

## Result

- `success`: level at the end of play (T−0) ≥ `fill_fraction_min`, and no overpressure unless
  `overpressure_allowed`.
- Overpressure: the level reaches the relief level (100 %) **while the fill valve is commanded
  open**. The relief valve vents the excess (the level stays at 100 %); the run is failed. Flow
  still draining from a valve that was just closed is vented without failing.
- `perfect`: success with the net rate in its band ≥ 70 % of the time.
- `score`: success → 0.5 + 0.5 × in-band fraction; otherwise up to 0.45 for the share of the
  fill reached (halved after an overpressure). No `value`.

## Model (game values unless noted)

| Item | Value |
|---|---|
| Start level | 70–76 % (seeded) |
| Valve | 6 steps × 0.6 %/s, first-order lag 0.5 s |
| Boil-off | 0.30–0.40 %/s (seeded), ±8 % seeded wobble |
| Fast fill (level < 90 %) | net 1.8–3.2 %/s |
| Slow fill (90–99 %) | net 0.8–1.8 %/s |
| Topping (≥ 99 %) | net −0.45–0.35 %/s (hold it full) |
| Band judged on | the net rate smoothed over 0.8 s |
| One button | open valve = 2.4 %/s |

Physical, qualitatively: cryogenic propellant boils continuously so the tank is topped off until
launch; loading goes fast fill, slow fill, topping; filling a full tank with the valve open
over-pressurises it. Simplifications: one tank, no pressure or temperature model, boil-off as a
rate, the last minutes of loading squeezed into 20 s.

## Modes and difficulty

| | Band width | Boil-off |
|---|---|---|
| Relaxed | × 1.5 | × 0.6 |
| Cadet | × 1.25 | × 0.8 |
| Flight Director | × 0.8 | × 1.25 |

## Haptics, motion, accessibility

- 8 ms per valve tap; 10 ms back in band, 20 ms every 0.6 s out of band; `[25, 40, 25]` at each
  phase change; ALERT `[60, 60, 60]` on overpressure.
- Reduced motion: no liquid wave, fewer bubbles and vapour puffs, steady fill-line dashes; the
  overpressure strip does not flash.
- Canvas `role=application`; value text: level, valve step and band state; `aria-valuenow` = level %.
- Status shapes: check in band, up / down triangles too fast / too slow, octagon on overpressure;
  borders solid / dashed / double.

## Decisions

- The design gives no band or boil-off numbers: the table above.
- Topping starts at `fill_fraction_min`, so holding the topping band keeps the tank at or above
  the success level.
- Perfect at 70 % in band: a scripted good player (taps every 250 ms, 150 ms late) scores about
  74 %; the valve lag and the phase changes make 100 % impossible.
