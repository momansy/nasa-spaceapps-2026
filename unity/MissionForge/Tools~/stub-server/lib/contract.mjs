// Loads the wire contract from the repository's protocol/ folder so the stub never drifts from it:
//   - protocol/schema/<type>.schema.json  -> payload validation (both directions)
//   - protocol/ts/messages.ts MESSAGE_META -> list of types, allowed senders and routing
// The validator is the same minimal draft 2020-12 subset as protocol/check.mjs (copied, because
// check.mjs is a script without exports), plus a `lenient` mode that ignores unknown properties,
// which is how a receiver must treat payloads (messages.md section 2, "Unknown data").

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SUFFIX = '.schema.json';
const ENVELOPE = 'envelope';

/** protocol/ at the repository root: lib -> stub-server -> Tools~ -> MissionForge -> unity -> root. */
export function defaultProtocolDir() {
  return process.env.MISSIONFORGE_PROTOCOL_DIR ?? path.resolve(HERE, '..', '..', '..', '..', '..', 'protocol');
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

/**
 * Validates `value` against `schema`. Returns a list of { path, message } (empty = valid).
 * `path` is a dotted path without the leading "$" ("" for the root), as used by error.field.
 */
export function validate(schema, value, root, { lenient = false } = {}, at = '') {
  const out = [];
  const fail = (message) => out.push({ path: at, message });
  if (schema === true) return out;
  if (schema === false) return [{ path: at, message: 'not allowed' }];
  if (schema.$ref) {
    const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(schema.$ref);
    const target = m && root.$defs && root.$defs[m[1]];
    if (!target) return [{ path: at, message: `unresolved $ref ${schema.$ref}` }];
    out.push(...validate(target, value, root, { lenient }, at));
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      fail(`expected ${types.join('|')}, got ${typeOf(value)}`);
      return out;
    }
  }
  if (schema.enum && !schema.enum.some((e) => isDeepStrictEqual(e, value))) fail('not in enum');
  if ('const' in schema && !isDeepStrictEqual(schema.const, value)) fail('not the constant');
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`above maximum ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    const len = [...value].length;
    if (schema.minLength !== undefined && len < schema.minLength) fail(`shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && len > schema.maxLength) fail(`longer than ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) fail(`does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`more than ${schema.maxItems} items`);
    if (schema.uniqueItems) {
      for (let i = 0; i < value.length; i++) {
        for (let j = i + 1; j < value.length; j++) if (isDeepStrictEqual(value[i], value[j])) fail(`items ${i} and ${j} are equal`);
      }
    }
    if (schema.items !== undefined) {
      value.forEach((v, i) => out.push(...validate(schema.items, v, root, { lenient }, `${at}[${i}]`)));
    }
  }
  if (typeOf(value) === 'object') {
    const keys = Object.keys(value);
    const props = schema.properties ?? {};
    const child = (k) => (at ? `${at}.${k}` : k);
    for (const r of schema.required ?? []) if (!Object.hasOwn(value, r)) out.push({ path: child(r), message: 'missing required field' });
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) fail(`fewer than ${schema.minProperties} properties`);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) fail(`more than ${schema.maxProperties} properties`);
    for (const k of keys) {
      if (schema.propertyNames) out.push(...validate(schema.propertyNames, k, root, { lenient }, child(k)));
      if (Object.hasOwn(props, k)) out.push(...validate(props[k], value[k], root, { lenient }, child(k)));
      else if (schema.additionalProperties === false) {
        if (!lenient) out.push({ path: child(k), message: 'unexpected property' });
      } else if (typeof schema.additionalProperties === 'object') {
        out.push(...validate(schema.additionalProperties, value[k], root, { lenient }, child(k)));
      }
    }
  }
  for (const kw of ['anyOf', 'oneOf']) {
    if (!schema[kw]) continue;
    const passing = schema[kw].filter((s) => validate(s, value, root, { lenient }, at).length === 0).length;
    if (kw === 'anyOf' && passing === 0) fail('matches none of anyOf');
    if (kw === 'oneOf' && passing !== 1) fail(`matches ${passing} of oneOf (need exactly 1)`);
  }
  return out;
}

/** Parses MESSAGE_META out of protocol/ts/messages.ts (one entry per line). */
function loadMessageMeta(tsPath) {
  const src = readFileSync(tsPath, 'utf8');
  const re =
    /^ {2}'([a-z0-9.]+)': \{ dir: '([A-Z0-9_]+)', from: \[([^\]]*)\], to: '([A-Z_]+)', sticky: (true|false), droppable: (true|false), pauseBlocked: (true|false), outcome: (true|false) \}/gm;
  const meta = new Map();
  for (let m; (m = re.exec(src)); ) {
    meta.set(m[1], {
      dir: m[2],
      from: m[3].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean),
      to: m[4],
      sticky: m[5] === 'true',
      droppable: m[6] === 'true',
      pauseBlocked: m[7] === 'true',
      outcome: m[8] === 'true',
    });
  }
  return meta;
}

/**
 * Loads the contract. Throws with a helpful message when protocol/ cannot be found or when the
 * schema folder and MESSAGE_META disagree.
 */
export function loadContract(protocolDir = defaultProtocolDir()) {
  const schemaDir = path.join(protocolDir, 'schema');
  const tsPath = path.join(protocolDir, 'ts', 'messages.ts');
  if (!existsSync(schemaDir) || !existsSync(tsPath)) {
    throw new Error(
      `protocol contract not found at ${protocolDir} (expected schema/ and ts/messages.ts); ` +
        'set MISSIONFORGE_PROTOCOL_DIR or pass --protocol-dir',
    );
  }
  const schemas = new Map();
  let envelope = null;
  for (const file of readdirSync(schemaDir).sort()) {
    if (!file.endsWith(SCHEMA_SUFFIX)) continue;
    const type = file.slice(0, -SCHEMA_SUFFIX.length);
    const schema = JSON.parse(readFileSync(path.join(schemaDir, file), 'utf8'));
    if (type === ENVELOPE) envelope = schema;
    else schemas.set(type, schema);
  }
  const meta = loadMessageMeta(tsPath);
  const missing = [...schemas.keys()].filter((t) => !meta.has(t));
  const extra = [...meta.keys()].filter((t) => !schemas.has(t));
  if (!envelope || missing.length || extra.length) {
    throw new Error(
      `protocol contract is inconsistent: envelope ${envelope ? 'ok' : 'missing'}, ` +
        `no MESSAGE_META for [${missing}], no schema for [${extra}]`,
    );
  }

  /** Checks a whole frame object. Returns { ok: true } or { ok: false, field, message }. */
  const check = (frame, { lenient = false } = {}) => {
    const envErrors = validate(envelope, frame, envelope, { lenient: false });
    if (envErrors.length) return { ok: false, field: envErrors[0].path, message: `envelope: ${envErrors[0].path} ${envErrors[0].message}` };
    const schema = schemas.get(frame.t);
    if (!schema) return { ok: false, field: 't', message: `unknown type "${frame.t}"` };
    const errors = validate(schema, frame.d, schema, { lenient });
    if (errors.length) return { ok: false, field: errors[0].path, message: `${frame.t}: ${errors[0].path || 'd'} ${errors[0].message}` };
    return { ok: true };
  };

  /** Checks one payload `d` of type `t`. */
  const checkPayload = (t, d, { lenient = false } = {}) => {
    const schema = schemas.get(t);
    if (!schema) return { ok: false, field: '', message: `unknown type "${t}"` };
    const errors = validate(schema, d, schema, { lenient });
    if (errors.length) return { ok: false, field: errors[0].path, message: `${t}: ${errors[0].path || 'd'} ${errors[0].message}` };
    return { ok: true };
  };

  return { protocolDir, schemas, envelope, meta, check, checkPayload };
}
