import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PayloadValidator } from './validate.js';

import { findSchemaDir } from './validate.js';

const v = new PayloadValidator();
const dir = findSchemaDir();

describe('PayloadValidator', () => {
  it('compiles a validator for every schema except the envelope', () => {
    expect(v.has('vote.cast')).toBe(true);
    expect(v.has('hello')).toBe(true);
    expect(v.has('envelope')).toBe(false);
  });
  it('rejects a missing required field and names it', () => {
    const r = v.check('vote.cast', {});
    expect(r.ok).toBe(false);
    expect(r.field).not.toBe('');
  });
  it('rejects a mistyped field', () => {
    const r = v.check('hello', { protocolVersion: 'one', client: 'HOST' });
    expect(r.ok).toBe(false);
  });
  it('ignores unknown fields', () => {
    const base = v.check('clock.ping', { clientTimeMs: 5 });
    expect(base.ok).toBe(true);
    expect(v.check('clock.ping', { clientTimeMs: 5, extraneous: 1 }).ok).toBe(true);
  });
  it('accepts every example of every schema (relaxation never rejects valid payloads)', () => {
    let n = 0;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.schema.json') || file.startsWith('envelope')) continue;
      const schema = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { examples?: unknown[] };
      for (const ex of schema.examples ?? []) {
        n += 1;
        expect(v.check(file.replace('.schema.json', ''), ex), file).toEqual({ ok: true, field: '' });
      }
    }
    expect(n).toBeGreaterThan(50);
  });
});
