// Payload validation against protocol/schema/<t>.schema.json (protocol/messages.md §12.1 step 8).
// Unknown fields are ignored, never an error, so every `additionalProperties: false` in the
// schemas is stripped before compilation. Schemas are located by walking up from this file to the
// nearest `protocol/schema` directory, or from the PROTOCOL_SCHEMA_DIR environment variable.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv/dist/2020.js';

// ajv ships CommonJS; load it through require so the constructor type is unambiguous under NodeNext.
const require = createRequire(import.meta.url);
const Ajv2020 = (require('ajv/dist/2020.js') as { default: new (opts: object) => { compile(schema: object): ValidateFunction } }).default;

export interface PayloadCheck {
  ok: boolean;
  /** Dotted path of the first failing field, at most 64 characters; empty when the root fails. */
  field: string;
}

export function findSchemaDir(startDir: string = path.dirname(fileURLToPath(import.meta.url))): string {
  const fromEnv = process.env.PROTOCOL_SCHEMA_DIR;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'protocol', 'schema');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('protocol/schema not found; set PROTOCOL_SCHEMA_DIR');
}

function relaxUnknownFields(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(relaxUnknownFields);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'additionalProperties' && v === false) continue;
      if (k === 'examples') continue;
      out[k] = relaxUnknownFields(v);
    }
    return out;
  }
  return node;
}

export class PayloadValidator {
  private readonly validators = new Map<string, ValidateFunction>();

  constructor(schemaDir: string = findSchemaDir()) {
    const ajv = new Ajv2020({ allErrors: false, strict: false });
    for (const file of readdirSync(schemaDir)) {
      if (!file.endsWith('.schema.json') || file === 'envelope.schema.json') continue;
      const type = file.slice(0, -'.schema.json'.length);
      const schema = relaxUnknownFields(JSON.parse(readFileSync(path.join(schemaDir, file), 'utf8'))) as object;
      this.validators.set(type, ajv.compile(schema));
    }
  }

  has(type: string): boolean {
    return this.validators.has(type);
  }

  check(type: string, d: unknown): PayloadCheck {
    const validate = this.validators.get(type);
    if (!validate) return { ok: true, field: '' };
    if (validate(d)) return { ok: true, field: '' };
    const err = validate.errors?.[0];
    let field = (err?.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
    if (!field && err?.keyword === 'required') field = String((err.params as { missingProperty?: string }).missingProperty ?? '');
    else if (err?.keyword === 'required') field += `.${String((err.params as { missingProperty?: string }).missingProperty ?? '')}`;
    return { ok: false, field: field.slice(0, 64) };
  }
}

let shared: PayloadValidator | null = null;
export function getPayloadValidator(): PayloadValidator {
  shared ??= new PayloadValidator();
  return shared;
}
