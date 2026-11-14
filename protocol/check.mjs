#!/usr/bin/env node
// MissionForge protocol consistency check. Node 20+, no dependencies.
//
//   node protocol/check.mjs
//
// Verifies that
//   1. every schema in protocol/schema is a well-formed draft 2020-12 schema using only the keywords
//      this script understands, has descriptions, closes every object (additionalProperties: false)
//      and carries at least one example;
//   2. every example validates against its own schema, and mutated examples (extra field, missing
//      required field) are rejected;
//   3. messages.md, protocol/schema and ts/messages.ts list exactly the same message types;
//   4. for every message the top-level fields and their required flags agree in all three places,
//      and the direction in messages.md agrees with MESSAGE_META in the TypeScript file;
//   5. shared types and enumerations agree in all three places;
//   6. every example frame printed in messages.md validates against the envelope and payload schemas.
// Exit code 0 on success, 1 on any failure.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(ROOT, 'schema');
const MD_PATH = join(ROOT, 'messages.md');
const TS_PATH = join(ROOT, 'ts', 'messages.ts');

const errors = [];
const fail = (msg) => errors.push(msg);

// ───────────────────────── minimal JSON Schema validator ─────────────────────────
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', '$defs', 'examples']);
const KEYWORDS = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'propertyNames', 'minProperties', 'maxProperties',
  'items', 'minItems', 'maxItems', 'uniqueItems', 'enum', 'const', 'minimum', 'maximum',
  'minLength', 'maxLength', 'pattern', 'anyOf', 'oneOf', '$ref',
]);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v; // string, boolean, object
}
function typeMatches(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

/** Returns a list of error strings (empty = valid). */
function validate(schema, value, root, path = '$') {
  const out = [];
  if (schema === true) return out;
  if (schema === false) return [`${path}: not allowed`];
  if (schema.$ref) {
    const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(schema.$ref);
    const target = m && root.$defs && root.$defs[m[1]];
    if (!target) return [`${path}: unresolved $ref ${schema.$ref}`];
    out.push(...validate(target, value, root, path));
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) { out.push(`${path}: expected ${types.join('|')}, got ${typeOf(value)}`); return out; }
  }
  if (schema.enum && !schema.enum.some((e) => isDeepStrictEqual(e, value))) out.push(`${path}: not in enum`);
  if ('const' in schema && !isDeepStrictEqual(schema.const, value)) out.push(`${path}: not the constant`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    const len = [...value].length;
    if (schema.minLength !== undefined && len < schema.minLength) out.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && len > schema.maxLength) out.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) out.push(`${path}: does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems) for (let i = 0; i < value.length; i++) for (let j = i + 1; j < value.length; j++) if (isDeepStrictEqual(value[i], value[j])) out.push(`${path}: items ${i} and ${j} are equal`);
    if (schema.items !== undefined) value.forEach((v, i) => out.push(...validate(schema.items, v, root, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    const keys = Object.keys(value);
    const props = schema.properties ?? {};
    for (const r of schema.required ?? []) if (!Object.hasOwn(value, r)) out.push(`${path}: missing required "${r}"`);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) out.push(`${path}: fewer than ${schema.minProperties} properties`);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) out.push(`${path}: more than ${schema.maxProperties} properties`);
    for (const k of keys) {
      if (schema.propertyNames) out.push(...validate(schema.propertyNames, k, root, `${path}{${k}}`));
      if (Object.hasOwn(props, k)) out.push(...validate(props[k], value[k], root, `${path}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${path}: unexpected property "${k}"`);
      else if (typeof schema.additionalProperties === 'object') out.push(...validate(schema.additionalProperties, value[k], root, `${path}.${k}`));
    }
  }
  for (const kw of ['anyOf', 'oneOf']) {
    if (!schema[kw]) continue;
    const passing = schema[kw].filter((s) => validate(s, value, root, path).length === 0).length;
    if (kw === 'anyOf' && passing === 0) out.push(`${path}: matches none of anyOf`);
    if (kw === 'oneOf' && passing !== 1) out.push(`${path}: matches ${passing} of oneOf (need exactly 1)`);
  }
  return out;
}

/** Structural lint of a schema node: known keywords, closed objects, descriptions. */
function lint(node, where, file, isProperty) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) { fail(`${file}: ${where} is not a schema object`); return; }
  for (const k of Object.keys(node)) if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) fail(`${file}: ${where} uses unsupported keyword "${k}"`);
  if (isProperty && (typeof node.description !== 'string' || node.description.trim() === '')) fail(`${file}: ${where} has no description`);
  if (node.pattern !== undefined) { try { new RegExp(node.pattern, 'u'); } catch (e) { fail(`${file}: ${where} has an invalid pattern: ${e.message}`); } }
  if (node.properties) {
    if (node.additionalProperties !== false) fail(`${file}: ${where} has properties but not additionalProperties: false`);
    for (const r of node.required ?? []) if (!Object.hasOwn(node.properties, r)) fail(`${file}: ${where} requires undeclared property "${r}"`);
    for (const [k, v] of Object.entries(node.properties)) lint(v, `${where}.${k}`, file, true);
  }
  if (typeof node.additionalProperties === 'object') lint(node.additionalProperties, `${where}{*}`, file, false);
  if (node.propertyNames) lint(node.propertyNames, `${where}{names}`, file, false);
  if (node.items) lint(node.items, `${where}[]`, file, false);
  for (const kw of ['anyOf', 'oneOf']) (node[kw] ?? []).forEach((s, i) => lint(s, `${where}/${kw}/${i}`, file, false));
  if (node.$ref !== undefined && !/^#\/\$defs\/[A-Za-z0-9_]+$/.test(node.$ref)) fail(`${file}: ${where} has a non-local $ref ${node.$ref}`);
}

// ───────────────────────── 1–2. schemas and examples ─────────────────────────
const schemas = new Map(); // type → schema
const allDefs = new Map(); // def name → { schema, file }
let exampleCount = 0;
let mutationCount = 0;
for (const file of readdirSync(SCHEMA_DIR).sort()) {
  if (!file.endsWith('.schema.json')) { fail(`schema/${file}: unexpected file (expected *.schema.json)`); continue; }
  const type = file.slice(0, -'.schema.json'.length);
  let schema;
  try { schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')); } catch (e) { fail(`schema/${file}: invalid JSON: ${e.message}`); continue; }
  schemas.set(type, schema);
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') fail(`schema/${file}: $schema must be the draft 2020-12 URI`);
  if (schema.title !== type) fail(`schema/${file}: title must be "${type}"`);
  if (typeof schema.description !== 'string' || !schema.description.trim()) fail(`schema/${file}: missing description`);
  if (schema.type !== 'object') fail(`schema/${file}: top-level type must be "object"`);
  if (schema.additionalProperties !== false) fail(`schema/${file}: top level must set additionalProperties: false`);
  lint(schema, '$', file, false);
  for (const [name, def] of Object.entries(schema.$defs ?? {})) {
    lint(def, `$defs.${name}`, file, true);
    const seen = allDefs.get(name);
    if (!seen) allDefs.set(name, { schema: def, file });
    else if (!isDeepStrictEqual(seen.schema, def)) fail(`schema/${file}: $defs.${name} differs from the definition in schema/${seen.file}`);
  }
  if (!Array.isArray(schema.examples) || schema.examples.length === 0) { fail(`schema/${file}: needs a non-empty "examples" array`); continue; }
  schema.examples.forEach((ex, i) => {
    exampleCount++;
    const errs = validate(schema, ex, schema);
    if (errs.length) fail(`schema/${file}: example ${i} is invalid:\n      ${errs.join('\n      ')}`);
    // The validator must not be vacuous: mutated examples have to fail.
    if (typeOf(ex) === 'object') {
      mutationCount++;
      if (validate(schema, { ...ex, __undeclared__: 1 }, schema).length === 0) fail(`schema/${file}: example ${i} with an undeclared field was accepted`);
      for (const r of schema.required ?? []) {
        mutationCount++;
        const copy = { ...ex }; delete copy[r];
        if (validate(schema, copy, schema).length === 0) fail(`schema/${file}: example ${i} without required "${r}" was accepted`);
      }
    }
  });
}
const envelopeSchema = schemas.get('envelope');
if (!envelopeSchema) fail('schema/envelope.schema.json is missing');
const schemaTypes = new Set([...schemas.keys()].filter((t) => t !== 'envelope'));

// ───────────────────────── messages.md ─────────────────────────
const DIRECTION_CODES = {
  'any → server': 'A2S', 'client → server': 'C2S', 'host → server': 'H2S', 'server → client': 'S2C', 'server → host': 'S2H',
  'server → host and clients': 'S2A', 'host → server → client (relayed unchanged)': 'RELAY_H2C',
  'client → server → host (relayed inside `relay`)': 'RELAY_C2H',
};
const md = readFileSync(MD_PATH, 'utf8').split(/\r?\n/);
const FIELD_ROW = /^\| `([^`]+)` \| `([^`]*)` \| (yes|no) \| (.*) \|$/;
function mdSection(startRe, endRe) {
  const start = md.findIndex((l) => startRe.test(l));
  if (start < 0) { fail(`messages.md: section ${startRe} not found`); return []; }
  let end = md.findIndex((l, i) => i > start && endRe.test(l));
  if (end < 0) end = md.length;
  return md.slice(start + 1, end);
}
/** Splits a section into blocks keyed by the name in a heading such as ### `name`. */
function blocks(lines, headingRe) {
  const out = new Map(); let cur = null;
  for (const l of lines) {
    const m = headingRe.exec(l);
    if (m) { if (out.has(m[1])) fail(`messages.md: duplicate section for ${m[1]}`); cur = []; out.set(m[1], cur); } else if (cur) cur.push(l);
  }
  return out;
}
function topLevelFields(lines) {
  const fields = new Map();
  for (const l of lines) {
    const m = FIELD_ROW.exec(l);
    if (m && !/[.\[]/.test(m[1])) fields.set(m[1], m[3] === 'yes');
  }
  return fields;
}
const mdMessages = new Map();
for (const [type, lines] of blocks(mdSection(/^## 13\. Message reference/, /^## 14\. /), /^### `([^`]+)`$/)) {
  const dirLine = lines.find((l) => l.startsWith('| Direction | '));
  const dirText = dirLine ? dirLine.slice('| Direction | '.length, -2) : '';
  const dir = DIRECTION_CODES[dirText];
  if (!dir) fail(`messages.md: ${type} has an unknown direction "${dirText}"`);
  for (const label of ['Sent by', 'Delivered to', 'Design']) if (!lines.some((l) => l.startsWith(`| ${label} | `))) fail(`messages.md: ${type} has no "${label}" row`);
  const exStart = lines.indexOf('```json');
  let example = null;
  if (exStart < 0) fail(`messages.md: ${type} has no example`);
  else { try { example = JSON.parse(lines[exStart + 1]); } catch (e) { fail(`messages.md: ${type} example is not valid JSON: ${e.message}`); } }
  mdMessages.set(type, { dir, fields: topLevelFields(lines), example });
}
const mdTypes = new Map();
for (const [name, lines] of blocks(mdSection(/^## 14\. Shared types/, /^## 15\. /), /^#### `([^`]+)`$/)) mdTypes.set(name, topLevelFields(lines));
const mdEnums = new Map();
for (const [name, lines] of blocks(mdSection(/^## 15\. Enumerations/, /^## 16\. /), /^#### `([^`]+)`$/)) {
  mdEnums.set(name, lines.map((l) => /^\| `([^`]+)` \|/.exec(l)).filter(Boolean).map((m) => m[1]));
}

// ───────────────────────── ts/messages.ts ─────────────────────────
const ts = readFileSync(TS_PATH, 'utf8').split(/\r?\n/);
const tsInterfaces = new Map(); // name → Map(field → required)
const tsEnums = new Map();      // type name → values
const tsPayloadMap = new Map(); // message type → interface name
const tsMeta = new Map();       // message type → dir
{
  let cur = null; let curName = null; const constValues = new Map();
  for (const l of ts) {
    let m;
    if ((m = /^export interface (\w+)(?:<[^>]*>)? \{$/.exec(l))) { curName = m[1]; cur = new Map(); tsInterfaces.set(curName, cur); continue; }
    if (l === '}' || l === '};') { cur = null; curName = null; continue; }
    if ((m = /^export const (\w+) = \[(.*)\] as const;$/.exec(l))) { constValues.set(m[1], [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1])); continue; }
    if ((m = /^export type (\w+) = \(typeof (\w+)\)\[number\];$/.exec(l))) { tsEnums.set(m[1], constValues.get(m[2]) ?? []); continue; }
    if ((m = /^  '([^']+)': \{ dir: '(\w+)'/.exec(l))) { tsMeta.set(m[1], m[2]); continue; }
    if (cur && curName === 'PayloadMap' && (m = /^  '([^']+)': (\w+);$/.exec(l))) { tsPayloadMap.set(m[1], m[2]); continue; }
    if (cur && (m = /^  (\w+)(\?)?: /.exec(l))) cur.set(m[1], !m[2]);
  }
}
if (!/^export type Message = /m.test(ts.join('\n'))) fail('ts/messages.ts: the discriminated union `Message` is missing');
if (!/^export interface Envelope</m.test(ts.join('\n'))) fail('ts/messages.ts: the `Envelope` type is missing');

// ───────────────────────── 3. same message set everywhere ─────────────────────────
const mdTypeSet = new Set(mdMessages.keys());
const tsTypeSet = new Set(tsPayloadMap.keys());
function sameSet(a, aName, b, bName) {
  for (const x of a) if (!b.has(x)) fail(`${x}: listed in ${aName} but missing from ${bName}`);
  for (const x of b) if (!a.has(x)) fail(`${x}: listed in ${bName} but missing from ${aName}`);
}
sameSet(mdTypeSet, 'messages.md', schemaTypes, 'schema/');
sameSet(mdTypeSet, 'messages.md', tsTypeSet, 'ts/messages.ts PayloadMap');
sameSet(tsTypeSet, 'ts/messages.ts PayloadMap', new Set(tsMeta.keys()), 'ts/messages.ts MESSAGE_META');

// ───────────────────────── 4. fields per message ─────────────────────────
function compareFields(label, schemaNode, mdFields, tsFields) {
  const want = new Map(Object.keys(schemaNode.properties ?? {}).map((k) => [k, (schemaNode.required ?? []).includes(k)]));
  for (const [where, got] of [['messages.md', mdFields], ['ts/messages.ts', tsFields]]) {
    if (!got) { fail(`${label}: not found in ${where}`); continue; }
    for (const [k, req] of want) {
      if (!got.has(k)) fail(`${label}: field "${k}" is in the schema but not in ${where}`);
      else if (got.get(k) !== req) fail(`${label}: field "${k}" is ${req ? 'required' : 'optional'} in the schema but ${got.get(k) ? 'required' : 'optional'} in ${where}`);
    }
    for (const k of got.keys()) if (!want.has(k)) fail(`${label}: field "${k}" is in ${where} but not in the schema`);
  }
}
for (const type of schemaTypes) {
  const m = mdMessages.get(type); const iface = tsPayloadMap.get(type);
  if (!m || !iface) continue;
  compareFields(type, schemas.get(type), m.fields, tsInterfaces.get(iface));
  if (m.dir && tsMeta.get(type) !== m.dir) fail(`${type}: direction ${m.dir} in messages.md but ${tsMeta.get(type)} in MESSAGE_META`);
}

// ───────────────────────── 5. shared types and enums ─────────────────────────
let sharedObjects = 0; let enumCount = 0;
for (const [name, { schema: def }] of allDefs) {
  if (def.enum) {
    enumCount++;
    for (const [where, got] of [['messages.md', mdEnums.get(name)], ['ts/messages.ts', tsEnums.get(name)]]) {
      if (!got) fail(`enum ${name}: not found in ${where}`);
      else if (!isDeepStrictEqual(got, def.enum)) fail(`enum ${name}: values in ${where} differ from the schema`);
    }
  } else if (def.properties) {
    sharedObjects++;
    compareFields(`type ${name}`, def, mdTypes.get(name), tsInterfaces.get(name));
  } else {
    if (!mdTypes.has(name)) fail(`type ${name}: not found in messages.md`);
    if (!new RegExp(`^export type ${name} = `, 'm').test(ts.join('\n'))) fail(`type ${name}: not found in ts/messages.ts`);
  }
}
for (const name of mdEnums.keys()) if (!allDefs.has(name)) fail(`enum ${name}: documented in messages.md but used by no schema`);
for (const name of tsEnums.keys()) if (!allDefs.has(name)) fail(`enum ${name}: declared in ts/messages.ts but used by no schema`);
for (const name of mdTypes.keys()) if (!allDefs.has(name)) fail(`type ${name}: documented in messages.md but used by no schema`);

// ───────────────────────── 6. example frames in messages.md ─────────────────────────
let frameCount = 0;
for (const [type, m] of mdMessages) {
  if (!m.example || !envelopeSchema || !schemas.has(type)) continue;
  frameCount++;
  const envErrs = validate(envelopeSchema, m.example, envelopeSchema);
  if (envErrs.length) fail(`messages.md: ${type} example frame breaks the envelope: ${envErrs.join('; ')}`);
  if (m.example.t !== type) fail(`messages.md: ${type} example frame has t = "${m.example.t}"`);
  const errs = validate(schemas.get(type), m.example.d, schemas.get(type));
  if (errs.length) fail(`messages.md: ${type} example payload is invalid: ${errs.join('; ')}`);
}
// `relay` carries another message: its example's inner payload must be valid too.
for (const ex of schemas.get('relay')?.examples ?? []) {
  const inner = schemas.get(ex.t);
  if (!inner) fail(`schema/relay.schema.json: example relays unknown type "${ex.t}"`);
  else { const errs = validate(inner, ex.d, inner); if (errs.length) fail(`schema/relay.schema.json: inner ${ex.t} payload is invalid: ${errs.join('; ')}`); }
}
const relayed = allDefs.get('RelayedType')?.schema.enum ?? [];
for (const t of relayed) if (tsMeta.get(t) !== 'RELAY_C2H') fail(`RelayedType lists ${t}, which is not a client → host relayed message`);
for (const [t, dir] of tsMeta) if (dir === 'RELAY_C2H' && !relayed.includes(t)) fail(`${t} is relayed client → host but missing from RelayedType`);

// ───────────────────────── report ─────────────────────────
console.log(`schemas:            ${schemas.size} files (${schemaTypes.size} message payloads + envelope)`);
console.log(`examples validated: ${exampleCount} valid, ${mutationCount} mutated examples rejected`);
console.log(`messages.md:        ${mdTypeSet.size} message types, ${frameCount} example frames validated`);
console.log(`ts/messages.ts:     ${tsTypeSet.size} payload types, ${tsEnums.size} enums`);
console.log(`shared:             ${sharedObjects} object types and ${enumCount} enums compared across md, schema and ts`);
if (errors.length) {
  console.error(`\nFAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nOK: messages.md, schema/ and ts/messages.ts agree.');
