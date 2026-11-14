# T025 — Fact verification with sources (package A2, part 1)

**Worker:** a Claude worker with web search and page fetch (WebSearch / WebFetch, or a browser);
no MCP server, no paid service · **Starts after:** nothing (data is on `main`)

mesh-model: sonnet
mesh-effort: high

**Owns:** `data/facts.json`; in `data/strings/en.content.json` **only** the keys `fact.F01.*` to
`fact.F40.*` (`.topic`, `.text`, `.detail`, `.source`); `orchestration/evidence/T025/`.

Other tasks may edit `en.content.json` at the same time: change only the fact lines, in place, keeping
key order and formatting, so the diff is just those lines. Do not touch `minigame.*`, `part.*` or any
other key, `data/schema/`, `tools/`, `client/` or `unity/`. Use at most one subagent, for the final
review.

## Goal

Every fact a player can see needs a real, authoritative source and a verification status before
release (design 12.1, standing orders 4). The 40 facts in `data/facts.json` are all `unverified`
with no URL. Verify each one, correct wording that does not match its source, and leave a record
another person can check.

## Rules

- **Authoritative sources only** as the cited source: NASA (nasa.gov, history.nasa.gov,
  ntrs.nasa.gov, jpl.nasa.gov, science.nasa.gov, nssdc.gsfc.nasa.gov, gsfc.nasa.gov), ESA (esa.int),
  USGS (usgs.gov), NOAA, official mishap and inquiry board reports. Encyclopaedias, news sites and
  Wikipedia may help you *find* a primary source but are never the cited source.
- **No fabricated URLs.** Cite a URL only if you opened it in this run and read the passage that
  supports the fact. Never guess or construct a path. If a page fails (403, timeout), find another
  authoritative page or the report PDF; if none can be opened, the fact stays `unverified`.
- **Status** uses the schema enum (`unverified`, `verified`, `rejected`; the schema allows no other
  value and no extra fields):
  - *verified*: the source supports the text as written; set `status: "verified"` and `source_url`;
  - *corrected*: the text was changed to match the source, then `status: "verified"` with a
    `design_notes` entry `T025 <date>: corrected from "<old>" because the source says <…>`;
  - *rejected*: the source contradicts the claim and no faithful rewording keeps the fact's purpose;
    `status: "rejected"`, text left as is, a `design_notes` entry with the reason;
  - *unverified*: no openable authoritative source found; leave as is with a `design_notes` entry
    saying what was tried.
- **Access date** (UTC, `YYYY-MM-DD`) goes in the fact's `design_notes` (`T025: source accessed …`)
  and in the evidence table.
- **On-screen text** (`fact.<id>.text`) ≤ 25 words (count whitespace-separated tokens), keeping the
  idea the game's mechanic teaches; numbers as the source gives them, with "about" where the source
  rounds and SI units. `fact.<id>.detail` (Codex) may be longer but must also match the source.
  `fact.<id>.source` becomes a precise citation: publisher, page or report title, year (for example
  "NASA, Mars Climate Orbiter Mishap Investigation Board Phase I Report, 1999").
- **Respect (12.1.5):** where a fact touches a loss of a mission or a crew emergency, keep a factual,
  respectful tone focused on what engineers learned.
- **Copyright:** in the evidence, quote at most 25 words of supporting text per fact.

## Steps (in order; each batch is committed state)

1. **Inventory.** Create `orchestration/evidence/T025/fact-sources.md` with a row per fact (ID,
   topic, current text and word count, current source line, `used_in`). Run
   `node tools/validate-data.mjs` and save its output as `validate-before.txt`.
2. **Verify F01–F10**, then update `data/facts.json`, the fact strings and the evidence rows for that
   batch before moving on. Columns of the final table: ID · final on-screen text (word count) ·
   result (verified / corrected / rejected / unverified) · source title · publisher · URL · accessed
   (UTC) · supporting excerpt (≤ 25 words, quoted) · notes (what changed and why).
3. **Verify F11–F20**, same procedure.
4. **Verify F21–F30**, same procedure.
5. **Verify F31–F40**, same procedure. Known checks, as examples of the care needed: F14 (how much of
   a ~90-minute low orbit is in shadow), F05 (low-orbit speed), F18 (Orion's parachute count and
   final speed), F07 (which Apollo 13 engine shut down and why), F27 (the N1 needs an authoritative
   history source, not "historical sources").
6. **Minigame fact lines outside the bank (report only).** The fact lines of MG-03, MG-05, MG-06,
   MG-08b, MG-09, MG-10, MG-20, MG-24, MG-27, MG-28 (`minigame.<id>.fact` in `en.content.json`) are
   shown on result screens but are not yours to edit. In `fact-sources.md`, add a section with a
   proposed source (opened URL) or a proposed rewording for each, so the orchestrator can add them to
   the bank.
7. **Check and review.** Save `orchestration/evidence/T025/check-facts.mjs`, a script that reads
   `data/facts.json` and the English strings and fails if any on-screen fact text exceeds 25 words,
   any `verified` fact lacks `source_url`, or any `source_url` is not `https`. Run it and
   `node tools/validate-data.mjs` (`validate-after.txt`), and `npm test` in `client/` if Node modules
   are installed (string loader tests). One subagent spot-checks 10 random facts by reopening their
   URLs and comparing the excerpt.

## Acceptance

- All 40 facts have a final result in `fact-sources.md`; every `verified` fact has a `source_url`
  that was opened in this run, an access date and a supporting excerpt; no Wikipedia or news URL is a
  cited source.
- On-screen texts are ≤ 25 words and match their sources; corrections are explained in
  `design_notes` and in the evidence.
- `node tools/validate-data.mjs` and `check-facts.mjs` pass; outputs saved in the evidence folder.
- Only the owned files and keys changed.
- The summary lists counts (verified, corrected, rejected, unverified), every rejected or unverified
  fact with the minigames, contracts or channels that use it (from `used_in`) so the orchestrator can
  replace it, and under **Interface changes** any schema improvement you recommend (for example a
  `verified_on` date field or a `corrected` status), without making it.

## Design references

Sections 12.1, 12.4, 19; `data/README.md` (facts); `data/schema/fact.schema.json`.
