#!/usr/bin/env node
// MissionForge data validator.
//
//   node tools/validate-data.mjs [--strict] [--data <dir>] [--schema <dir>] [--quiet]
//
// 1. Lints the JSON Schemas in data/schema/ (closed objects, a description on every field).
// 2. Validates every JSON file under data/ against the schema that claims it ("x-data-files").
// 3. Cross-checks IDs, string keys, references, value_types tags and contract vote lists.
//
// Exit code: 0 = no errors, 1 = errors found, 2 = the validator could not run.
// See tools/README.md.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ───────────────────────── arguments ─────────────────────────
const args = process.argv.slice(2);
const opts = { strict: false, quiet: false, data: resolve(HERE, '..', 'data'), schema: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--strict') opts.strict = true;
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '--data' && args[i + 1]) opts.data = resolve(args[++i]);
  else if (a === '--schema' && args[i + 1]) opts.schema = resolve(args[++i]);
  else if (a === '--help' || a === '-h') {
    console.log('Usage: node tools/validate-data.mjs [--strict] [--data <dir>] [--schema <dir>] [--quiet]\n' +
      '  --strict       unknown references, unmapped files and incomplete translations become errors\n' +
      '  --data <dir>   data directory to validate (default: ../data next to this script)\n' +
      '  --schema <dir> schema directory (default: <data>/schema, else ../data/schema)\n' +
      '  --quiet        print only warnings, errors and the result line');
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${a} (try --help)`);
    process.exit(2);
  }
}
if (!opts.schema) {
  const own = join(opts.data, 'schema');
  opts.schema = existsSync(own) ? own : resolve(HERE, '..', 'data', 'schema');
}

let Ajv2020, addFormats;
try {
  ({ default: Ajv2020 } = await import('ajv/dist/2020.js'));
  ({ default: addFormats } = await import('ajv-formats'));
} catch {
  console.error('Missing dependencies. Run "npm install" in the tools/ directory first.');
  process.exit(2);
}

// ───────────────────────── reporting ─────────────────────────
const errors = [];
const warnings = [];
const error = (where, message) => errors.push({ where, message });
const warning = (where, message) => warnings.push({ where, message });
/** Problems that are tolerated while the catalog is incomplete: warnings by default, errors with --strict. */
const soft = (where, message) => (opts.strict ? error : warning)(where, message);
const info = (line = '') => { if (!opts.quiet) console.log(line); };
const posix = (p) => p.split('\\').join('/');
const at = (file, path) => (path ? `${file} ${path}` : file);

// ───────────────────────── helpers ─────────────────────────
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function hasNumber(v) {
  if (typeof v === 'number') return true;
  if (Array.isArray(v)) return v.some(hasNumber);
  if (isObject(v)) return Object.values(v).some(hasNumber);
  return false;
}
function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    error(label, `cannot read file: ${e.message}`);
    return { ok: false };
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return { ok: true, value: JSON.parse(text), text };
  } catch (e) {
    error(label, `invalid JSON: ${e.message}`);
    return { ok: false };
  }
}
function walkJsonFiles(dir, skipDirs) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!skipDirs.includes(resolve(full))) out.push(...walkJsonFiles(full, skipDirs));
    } else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}
/** Glob with "*" matching inside one path segment. */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

// ───────────────────────── 1. schemas ─────────────────────────
if (!existsSync(opts.schema)) {
  console.error(`Schema directory not found: ${opts.schema}`);
  process.exit(2);
}
if (!existsSync(opts.data)) {
  console.error(`Data directory not found: ${opts.data}`);
  process.exit(2);
}

const schemas = new Map(); // file name -> schema object
for (const entry of readdirSync(opts.schema).sort()) {
  if (!entry.endsWith('.schema.json')) continue;
  const r = readJson(join(opts.schema, entry), `schema/${entry}`);
  if (r.ok) schemas.set(entry, r.value);
}

/** Enforces the house rules on the schemas themselves. */
function lintSchema(file, node, path, refinement) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => lintSchema(file, n, `${path}/${i}`, refinement));
    return;
  }
  if (!isObject(node)) return;
  const where = at(`schema/${file}`, path || '/');
  if (!refinement) {
    if (node.type === 'object' && node.additionalProperties !== false) {
      error(where, 'object schema must set "additionalProperties": false');
    }
    for (const kw of ['properties', 'patternProperties', '$defs']) {
      if (!isObject(node[kw])) continue;
      for (const [name, sub] of Object.entries(node[kw])) {
        if (isObject(sub) && (typeof sub.description !== 'string' || sub.description.trim() === '')) {
          error(at(`schema/${file}`, `${path}/${kw}/${name}`), 'field has no "description"');
        }
      }
    }
  }
  for (const kw of ['properties', 'patternProperties', '$defs']) {
    if (isObject(node[kw])) {
      for (const [name, sub] of Object.entries(node[kw])) lintSchema(file, sub, `${path}/${kw}/${name}`, refinement);
    }
  }
  for (const kw of ['items', 'contains', 'propertyNames', 'additionalProperties', 'unevaluatedProperties']) {
    if (isObject(node[kw])) lintSchema(file, node[kw], `${path}/${kw}`, refinement);
  }
  for (const kw of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    if (Array.isArray(node[kw])) lintSchema(file, node[kw], `${path}/${kw}`, refinement);
  }
  for (const kw of ['if', 'then', 'else', 'not']) {
    if (isObject(node[kw])) lintSchema(file, node[kw], `${path}/${kw}`, true);
  }
}
for (const [file, schema] of schemas) {
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    error(`schema/${file}`, '"$schema" must be https://json-schema.org/draft/2020-12/schema');
  }
  if (schema.$id !== file) error(`schema/${file}`, `"$id" must equal the file name ("${file}")`);
  lintSchema(file, schema, '', false);
}

// Every part category needs its own stats definition and if/then branch.
{
  const common = schemas.get('common.schema.json');
  const part = schemas.get('part.schema.json');
  const categories = common?.$defs?.part_category?.enum;
  const branches = part?.$defs?.part?.allOf;
  if (Array.isArray(categories) && Array.isArray(branches)) {
    const covered = new Set(branches.map((b) => b?.if?.properties?.category?.const));
    for (const c of categories) {
      if (!covered.has(c)) error('schema/part.schema.json', `no if/then branch for category "${c}"`);
      if (!part.$defs[`stats_${c}`]) error('schema/part.schema.json', `no $defs/stats_${c} for category "${c}"`);
    }
  }
}

// Collectors filled by the custom keywords while Ajv validates a file.
let currentFile = '';
const declaredIds = new Map(); // kind -> Map(id -> [{file, path}])
const references = new Map(); // "file path kind" -> {kind, value, file, path}
const valueGroupChecks = new Map(); // "file path" -> {file, path, data, groups}

// strictRequired is off because if/then refinements require properties that the enclosing schema defines.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword({ keyword: 'x-data-files', schemaType: 'array' });
ajv.addKeyword({
  keyword: 'x-id',
  schemaType: 'string',
  errors: false,
  validate(kind, data, _parent, cxt) {
    if (typeof data === 'string') {
      if (!declaredIds.has(kind)) declaredIds.set(kind, new Map());
      const byId = declaredIds.get(kind);
      if (!byId.has(data)) byId.set(data, []);
      const seen = byId.get(data);
      if (!seen.some((s) => s.file === currentFile && s.path === cxt.instancePath)) {
        seen.push({ file: currentFile, path: cxt.instancePath });
      }
    }
    return true;
  },
});
ajv.addKeyword({
  keyword: 'x-ref',
  schemaType: 'string',
  errors: false,
  validate(kind, data, _parent, cxt) {
    if (typeof data === 'string') {
      references.set(`${currentFile} ${cxt.instancePath} ${kind}`, { kind, value: data, file: currentFile, path: cxt.instancePath });
    }
    return true;
  },
});
ajv.addKeyword({
  keyword: 'x-value-groups',
  schemaType: 'array',
  errors: false,
  validate(groups, data, _parent, cxt) {
    if (isObject(data)) {
      valueGroupChecks.set(`${currentFile} ${cxt.instancePath}`, { file: currentFile, path: cxt.instancePath, data, groups });
    }
    return true;
  },
});

const validators = new Map(); // schema file -> compiled validator
const fileRules = []; // {regex, schemaFile}
if (errors.length === 0) {
  try {
    for (const [file, schema] of schemas) ajv.addSchema(schema, file);
    for (const [file, schema] of schemas) {
      if (!Array.isArray(schema['x-data-files'])) continue;
      validators.set(file, ajv.getSchema(file));
      for (const glob of schema['x-data-files']) fileRules.push({ regex: globToRegExp(glob), schemaFile: file });
    }
  } catch (e) {
    error('schema', `schemas do not compile: ${e.message}`);
  }
}

info('MissionForge data validation');
info(`  data:   ${opts.data}`);
info(`  schema: ${opts.schema}`);
info(`  mode:   ${opts.strict ? 'strict (unknown references are errors)' : 'default (unknown references are warnings; --strict makes them errors)'}`);
info();
info(`Schemas: ${schemas.size} loaded${errors.length ? '' : ', lint OK'}`);

// ───────────────────────── 2. files ─────────────────────────
const documents = new Map(); // relative path -> {value, text, schemaFile}
if (errors.length === 0) {
  info('Files:');
  const files = walkJsonFiles(opts.data, [resolve(opts.schema)]);
  for (const full of files) {
    const rel = posix(relative(opts.data, full));
    const rule = fileRules.find((r) => r.regex.test(rel));
    if (!rule) {
      soft(rel, 'no schema claims this file (add its path to "x-data-files" of a schema in data/schema/)');
      info(`  ----  ${rel.padEnd(34)} (no schema)`);
      continue;
    }
    const r = readJson(full, rel);
    if (!r.ok) {
      info(`  FAIL  ${rel.padEnd(34)} (${rule.schemaFile})`);
      continue;
    }
    currentFile = rel;
    const validate = validators.get(rule.schemaFile);
    const ok = validate(r.value);
    if (!ok) {
      for (const e of validate.errors) {
        const extra = e.params && e.params.additionalProperty ? ` ("${e.params.additionalProperty}")`
          : e.params && e.params.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : '';
        error(at(rel, e.instancePath || '/'), `schema: ${e.message}${extra}`);
      }
    }
    documents.set(rel, { value: r.value, text: r.text, schemaFile: rule.schemaFile });
    info(`  ${ok ? 'OK  ' : 'FAIL'}  ${rel.padEnd(34)} (${rule.schemaFile})`);
  }
  if (files.length === 0) error('data', 'no JSON files found');
}

// ───────────────────────── 3. cross-checks ─────────────────────────
const docsOf = (schemaFile) => [...documents].filter(([, d]) => d.schemaFile === schemaFile);

// 3a. Unique IDs.
for (const [kind, byId] of declaredIds) {
  for (const [id, seen] of byId) {
    if (seen.length > 1) {
      error(at(seen[1].file, seen[1].path), `duplicate ${kind} ID "${id}" (first declared in ${at(seen[0].file, seen[0].path)})`);
    }
  }
}

// 3b. Strings: reference language, duplicates, translations.
const stringDocs = docsOf('strings.schema.json');
const en = documents.get('strings/en.json');
// English may be split by area: strings/en.json plus strings/en.<area>.json fragments.
const isEnglish = (rel) => /^strings\/en(\.[a-z0-9_]+)?\.json$/.test(rel);
const enKeys = new Set();
for (const [rel, doc] of stringDocs) {
  if (!isEnglish(rel)) continue;
  for (const key of Object.keys(doc.value)) {
    if (enKeys.has(key)) error(rel, `string key "${key}" is already defined in another English strings file`);
    enKeys.add(key);
  }
}
if (documents.size > 0 && !en) error('strings/en.json', 'reference language file is missing');
for (const [rel, doc] of stringDocs) {
  const seen = new Set();
  for (const m of doc.text.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) {
    if (seen.has(m[1])) error(rel, `duplicate string key "${m[1]}"`);
    seen.add(m[1]);
  }
  for (const [key, text] of Object.entries(doc.value)) {
    if (typeof text === 'string' && text !== text.trim()) warning(rel, `string "${key}" has leading or trailing whitespace`);
  }
  if (!isEnglish(rel) && en) {
    for (const key of Object.keys(doc.value)) if (!enKeys.has(key)) warning(rel, `key "${key}" does not exist in strings/en.json`);
  }
}
// A translation may be split into fragments like English (strings/ar.json, strings/ar.parts_a.json):
// the fragments of one language are merged before they are compared with the English keys.
const translations = new Map();
for (const [rel, doc] of stringDocs) {
  if (isEnglish(rel) || !en) continue;
  const lang = /^strings\/([A-Za-z-]+)(?:\.[a-z0-9_]+)?\.json$/.exec(rel)?.[1];
  if (!lang) continue;
  if (!translations.has(lang)) translations.set(lang, { keys: new Set(), files: [] });
  const entry = translations.get(lang);
  entry.files.push(rel);
  for (const key of Object.keys(doc.value)) entry.keys.add(key);
}
for (const [lang, { keys, files }] of translations) {
  const rel = files.includes(`strings/${lang}.json`) ? `strings/${lang}.json` : files[0];
  for (const key of enKeys) if (!keys.has(key)) soft(rel, `missing translation for "${key}"`);
}

// 3c. References.
const usedStringKeys = new Set();
const unknownByKind = new Map();
for (const r of references.values()) {
  if (r.kind === 'string') {
    usedStringKeys.add(r.value);
    if (en && !enKeys.has(r.value)) error(at(r.file, r.path), `string key "${r.value}" is not in strings/en.json`);
    continue;
  }
  const known = declaredIds.get(r.kind);
  if (!known || !known.has(r.value)) {
    soft(at(r.file, r.path), `unknown ${r.kind} reference "${r.value}"`);
    unknownByKind.set(r.kind, (unknownByKind.get(r.kind) || 0) + 1);
  }
}
if (en) {
  for (const key of enKeys) {
    // Keys under "ui." are reserved for interface text referenced from code, not from data.
    if (!usedStringKeys.has(key) && !key.startsWith('ui.')) warning('strings/en.json', `string "${key}" is not referenced by any data file`);
  }
}

// 3d. value_types: every numeric group is tagged.
for (const c of valueGroupChecks.values()) {
  const tags = isObject(c.data.value_types) ? c.data.value_types : {};
  for (const g of c.groups) {
    if (c.data[g] !== undefined && hasNumber(c.data[g]) && tags[g] === undefined) {
      error(at(c.file, c.path || '/'), `numeric group "${g}" has no value_types tag`);
    }
    if (tags[g] !== undefined && c.data[g] === undefined) {
      warning(at(c.file, `${c.path}/value_types`), `tag "${g}" refers to a group that is not present`);
    }
  }
  for (const key of Object.keys(tags)) {
    if (!key.includes('.')) continue;
    const [group, field] = key.split('.');
    if (!isObject(c.data[group]) || typeof c.data[group][field] !== 'number') {
      error(at(c.file, `${c.path}/value_types`), `override "${key}" does not name a numeric field`);
    }
  }
}

// 3e. Parts: file name, category and per-part consistency.
const partsById = new Map();
for (const [rel, doc] of docsOf('part.schema.json')) {
  const file = isObject(doc.value) ? doc.value : {};
  const expected = basename(rel, '.json');
  if (file.category !== expected) error(at(rel, '/category'), `category "${file.category}" must equal the file name "${expected}"`);
  (Array.isArray(file.parts) ? file.parts : []).forEach((p, i) => {
    if (!isObject(p)) return;
    if (p.category !== file.category) error(at(rel, `/parts/${i}/category`), `part category "${p.category}" differs from the file category "${file.category}"`);
    if (typeof p.model === 'string' && typeof p.id === 'string' && p.model !== `models/${p.id}.glb`) {
      warning(at(rel, `/parts/${i}/model`), `model path is expected to be models/${p.id}.glb`);
    }
    if (typeof p.id === 'string') partsById.set(p.id, { part: p, file: rel });
  });
}

// 3f. Contracts: vote lists.
for (const [rel, doc] of docsOf('contract.schema.json')) {
  const contracts = isObject(doc.value) && Array.isArray(doc.value.contracts) ? doc.value.contracts : [];
  contracts.forEach((c, ci) => {
    if (!isObject(c)) return;
    const base = `/contracts/${ci}`;
    const objectiveIds = new Set();
    const o = isObject(c.objectives) ? c.objectives : {};
    for (const obj of [o.primary, ...(Array.isArray(o.secondary) ? o.secondary : []), o.stretch, o.safety]) {
      if (!isObject(obj) || typeof obj.id !== 'string') continue;
      if (objectiveIds.has(obj.id)) error(at(rel, `${base}/objectives`), `duplicate objective ID "${obj.id}" in ${c.id}`);
      objectiveIds.add(obj.id);
    }
    const voteIds = new Set();
    const explicitByCategory = new Map(); // category -> Set of offered part IDs (only when every vote of the category lists options)
    let lastStep = 0;
    (Array.isArray(c.votes) ? c.votes : []).forEach((v, vi) => {
      if (!isObject(v)) return;
      const vp = `${base}/votes/${vi}`;
      if (voteIds.has(v.id)) error(at(rel, `${vp}/id`), `duplicate vote ID "${v.id}" in ${c.id}`);
      voteIds.add(v.id);
      if (typeof v.step === 'number') {
        if (v.step < lastStep) error(at(rel, `${vp}/step`), `votes must be listed in vote order (step ${v.step} after step ${lastStep})`);
        lastStep = v.step;
      }
      if (!Array.isArray(v.options)) {
        explicitByCategory.set(v.category, null);
        return;
      }
      if (explicitByCategory.get(v.category) !== null) {
        const set = explicitByCategory.get(v.category) || new Set();
        v.options.forEach((id) => set.add(id));
        explicitByCategory.set(v.category, set);
      }
      v.options.forEach((id, oi) => {
        const known = partsById.get(id);
        if (!known) return; // already reported as an unknown reference
        const op = `${vp}/options/${oi}`;
        if (known.part.category !== v.category) {
          error(at(rel, op), `part "${id}" is in category "${known.part.category}", but the vote is for "${v.category}"`);
        }
        if (v.category === 'engine_count' && isObject(known.part.stats) && known.part.stats.stage !== v.stage) {
          error(at(rel, op), `part "${id}" is for the ${known.part.stats.stage} stage, but the vote is for the ${v.stage} stage`);
        }
        if (Array.isArray(known.part.contracts) && !known.part.contracts.includes(c.id)) {
          error(at(rel, op), `part "${id}" does not list ${c.id} in its contracts`);
        }
      });
    });
    for (const [id, known] of partsById) {
      const offered = explicitByCategory.get(known.part.category);
      if (offered && Array.isArray(known.part.contracts) && known.part.contracts.includes(c.id) && !offered.has(id)) {
        warning(at(known.file, ''), `part "${id}" lists ${c.id} in its contracts, but no ${known.part.category} vote of ${c.id} offers it`);
      }
    }
  });
}

// 3g. Roles: a role merges at most once.
for (const [rel, doc] of docsOf('role.schema.json')) {
  const seen = new Set();
  for (const group of Array.isArray(doc.value?.merge_order) ? doc.value.merge_order : []) {
    for (const id of Array.isArray(group) ? group : []) {
      if (seen.has(id)) error(at(rel, '/merge_order'), `role "${id}" appears in more than one merge group`);
      seen.add(id);
    }
  }
}

// 3h. Boosts: tier order and tier value kind.
for (const [rel, doc] of docsOf('boost.schema.json')) {
  const tiers = Array.isArray(doc.value?.tiers) ? doc.value.tiers : [];
  const tierIds = new Set();
  let last = -1;
  tiers.forEach((t, i) => {
    if (!isObject(t)) return;
    if (tierIds.has(t.id)) error(at(rel, `/tiers/${i}/id`), `duplicate tier "${t.id}"`);
    tierIds.add(t.id);
    if (typeof t.min_fraction === 'number') {
      if (t.min_fraction < last) error(at(rel, `/tiers/${i}/min_fraction`), 'tiers must be ordered from lowest to highest threshold');
      last = t.min_fraction;
    }
  });
  (Array.isArray(doc.value?.boosts) ? doc.value.boosts : []).forEach((b, i) => {
    if (!isObject(b) || !isObject(b.tiers)) return;
    for (const [tier, v] of Object.entries(b.tiers)) {
      if (!isObject(v)) continue;
      if (b.kind === 'shield' && v.shield === undefined) error(at(rel, `/boosts/${i}/tiers/${tier}`), 'a shield boost tier needs "shield"');
      if (b.kind === 'effect' && typeof v.value !== 'number') error(at(rel, `/boosts/${i}/tiers/${tier}`), 'an effect boost tier needs a numeric "value"');
    }
  });
}

// ───────────────────────── report ─────────────────────────
if (documents.size > 0) {
  info();
  info('Cross-checks:');
  const counts = [...declaredIds].map(([kind, byId]) => `${byId.size} ${kind}`).join(', ');
  info(`  IDs declared:  ${counts || 'none'}`);
  info(`  String keys:   ${enKeys.size} in strings/en.json, ${usedStringKeys.size} referenced by data`);
  const refCount = [...references.values()].filter((r) => r.kind !== 'string').length;
  const unknown = [...unknownByKind].map(([kind, n]) => `${n} ${kind}`).join(', ');
  info(`  References:    ${refCount} checked${unknown ? `, unknown: ${unknown}` : ', all resolved'}`);
  info(`  value_types:   ${valueGroupChecks.size} tagged objects checked`);
}

const print = (title, list) => {
  if (list.length === 0) return;
  console.log();
  console.log(`${title} (${list.length}):`);
  for (const item of list) console.log(`  ${item.where}: ${item.message}`);
};
print('Warnings', warnings);
print('Errors', errors);
console.log();
console.log(`RESULT: ${errors.length === 0 ? 'PASS' : 'FAIL'} (${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'})`);
process.exit(errors.length === 0 ? 0 : 1);
