# MissionForge tools

## validate-data.mjs

Validates everything under `data/`. Needs Node 20 or newer.

```
cd tools
npm install          # once: installs ajv and ajv-formats
cd ..
node tools/validate-data.mjs            # day-to-day check
node tools/validate-data.mjs --strict   # release check: the catalog must be complete
```

| Option | Effect |
|---|---|
| `--strict` | Unknown references, files no schema claims and missing translations become errors instead of warnings. |
| `--data <dir>` | Validate another data directory (default `data/` next to `tools/`). |
| `--schema <dir>` | Use another schema directory (default `<data>/schema`, else `data/schema`). |
| `--quiet` | Print only warnings, errors and the result line. |

Exit code: `0` no errors, `1` errors found, `2` the validator could not run (bad arguments,
missing dependencies, missing directory). Warnings never change the exit code.

### What it checks

1. **The schemas themselves** (`data/schema/*.schema.json`): draft 2020-12, `$id` equal to the
   file name, `additionalProperties: false` on every object, a `description` on every field,
   an if/then branch and a stats definition for every part category.
2. **Every JSON file under `data/`** against the schema that claims it. A schema claims files
   through its `x-data-files` list (`["parts/*.json"]`), so a new file type needs a new schema
   and no change here.
3. **Cross-checks**
   - IDs are unique per kind (part, contract, role, boost, test, anomaly, minigame, fact, …).
   - Every string key used by data exists in `data/strings/en.json`; no duplicate keys in a
     strings file. Unused keys are warnings (keys under `ui.` are exempt). Other languages
     are compared with `en.json`.
   - Every referenced part, contract, minigame, fact, role, boost, test and anomaly ID exists.
     While the catalog is incomplete these are warnings; `--strict` makes them errors.
   - Every numeric group has a `value_types` tag; an override such as
     `stats.eastward_boost_m_s` must name a numeric field.
   - Part files: the file name, the file `category` and every part `category` agree; `model`
     is `models/<id>.glb` (warning).
   - Contracts: votes are in step order with unique IDs; objective IDs are unique; every
     listed option belongs to the vote's category and stage and does not exclude the contract
     through its own `contracts` list.
   - Roles: a role appears in at most one merge group.
   - Boosts: tiers are ordered by threshold; shield boosts use `shield`, effect boosts `value`.

### Reading the output

```
parts/launch_site.json /parts/1/rules/0/anomaly: unknown anomaly reference "weather_front"
```

File, JSON pointer inside the file, then the problem. `schema:` prefixes come from JSON Schema
validation; everything else is a cross-check.

### Adding a file type

Add `data/schema/<name>.schema.json` with `"$id": "<name>.schema.json"`, an `x-data-files`
list, `additionalProperties: false` on every object and a `description` on every field.
Reference shared definitions as `common.schema.json#/$defs/<name>`. Mark the ID field with
`"x-id": "<kind>"` and references with the `*_ref` definitions of `common.schema.json`, so the
uniqueness and reference checks apply automatically.
