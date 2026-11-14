# MG-30 Mission Patch Design (cosmetic)

Cooperative, 30 s, after CDR. Design section 10.5 and 13.4, task T019 step 9. Always succeeds
(participation). Fact on the result screen: F36 (crews design their own patches).

A three-step stepper (Contribute, Vote, Team patch). **Contribute:** the patch preview shows
the current design and, in a 2 × 2 legend, where each element comes from ("you", "team" or
"crew"); this player picks one element of their category from the option tiles. **Vote:** three
patches composed from the contributions, each with its letter and voter dots, and a large preview
of the current choice. **Team patch:** the winner on a warm halo, with "Element contributed" and
"Vote cast" chips. Patches are original vector designs with an embroidered look (merrowed border
with stitch marks, satin-stitch field texture, motto ribbon) in the style palette; no real mission
patches, agency insignia or logos.

| File | What |
|---|---|
| `model.ts` | Categories, timeline, picks and votes, team / crew composition, candidates, tally and winner, one-button cycle, scoring, scripted player (pure) |
| `patch.ts` | Patch art: 8 shapes, 8 symbols, 8 colourways, motto ribbon |
| `render.ts` | Stepper, preview and legend, option tiles, candidates and tallies, reveal (patches cached per design and size) |
| `index.ts` | Canvas, input (tap, keys, one button), loop, haptics, ARIA, `env.coop` |
| `model.test.ts` | Vitest |

## Parameters (`mg.start.params`)

| Key | Unit | Default | Type | Scope | Notes |
|---|---|---|---|---|---|
| `slot` | index | 0 | integer | **per-player** | Category = `slot mod 4`: 0 shape, 1 symbol, 2 colour, 3 motto (= `assignments[].index`) |
| `slots` | players | 1 | integer | common | Team size (crew stand-in voters = max(2, slots − 1)) |
| `hold_to_toggle` | — | false | boolean | common | No effect: every press is one choice |

The data has no thresholds (always succeeds).

## Rules

- **Options (`game_value`):** shapes (circle, shield, hexagon, triangle, oval, pentagon, rounded
  square, diamond), symbols (rocket, satellite, orbit ring, star, Earth, Moon, dish antenna, comet),
  colourways (Space and Signal, Ocean and Ceramic, Console and Sunlight, Navy and gold, Deep teal and
  white, Dusk, Periwinkle, Rose and navy) and 10 original mottos ("Built together", "Every gram
  counts", "Margin is our mission", "Eyes on Earth", "Calm hands, high orbits", "Small team, big sky",
  "One team, one orbit", "Steady through Max Q", "Clear signal, clear skies", "Ready for the long
  view").
- **Composition:** each category uses this player's pick (own category), else the team's element
  from the host, else a seeded crew pick. Candidate A uses everything; B and C swap in seeded
  alternates for seeded categories. Candidates depend only on the seed and the elements, so every
  phone with the same shared elements shows the same three patches under the same letters.
- **Winner:** most votes (host counts, else this player's vote plus seeded crew votes); a tie goes to
  the lowest letter, so every phone shows the same winner.
- **Result:** `success` always true; **perfect** = contributed and voted; **score** = 0.5 for
  contributing + 0.5 for voting. Picks and votes can be changed until their phase ends.
- **Timeline (`game_value`):** Standard plays 75 % of `durationMs` (22.5 s of 30 s); Relaxed ("the timer is
  longer") and One-button the full time. Phases: pick 42 %, vote 42 %, reveal 16 % of that.

## Modes and difficulty

Relaxed: the full time, one-button dwell ×1.2. One-button: options (then candidates) light up in
turn, 1.0 s each (candidates 1.2 s); a press anywhere or Space / Enter takes the lit one.
Difficulty does not change anything (cosmetic, always succeeds; T019 allows it as the one
minigame without a skill element). Keyboard: arrows move the focus ring, Enter / Space chooses.

## Team play (interface for the host)

- Per-player params carry **`slot`** (0-based, equal to `assignments[].index`); common params carry
  **`slots`**.
- With `env.coop`: `mg.action` **`pick`** x = [category, option] when the player picks, **`vote`**
  x = [candidate] when the player votes.
- Shared state read from `mg.state.shared`: **`elements`** (number[4], option per category, −1 none)
  and **`votes`** (number[3], counts per candidate). A host without them still works: the phone
  reads teammates' picks from the last move (`last_a` = "pick", `last_x`) as the mock host echoes it.
  The host's copy of this player's own category is ignored (the local pick wins).
- Without `env.coop`, missing categories and voters are seeded crew stand-ins, labelled "crew".
- For one shared ballot the host should send `elements` with every category filled: then all phones
  compose identical candidates (same seed, same elements) and `votes` mean the same patch everywhere.

## Physics versus game simplification

None: cosmetic. The only player-facing claim is fact F36 on the result screen.
