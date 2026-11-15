// Every English key has an Arabic counterpart with the same placeholders (T037), and the
// Arabic text keeps Western digits.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { langOfFile, mergeTables } from './core';

const roots = [join(__dirname, '../../../data/strings'), join(__dirname, 'strings')];

function table(dir: string, lang: string) {
  const frags: Record<string, unknown> = {};
  for (const f of readdirSync(dir)) {
    if (langOfFile(f) === lang) frags[join(dir, f)] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  }
  return mergeTables(frags, lang);
}

const placeholders = (s: string) => (s.match(/\{[a-z][A-Za-z0-9_]*\}/g) ?? []).sort().join(',');

describe.each(roots)('Arabic strings in %s', (dir) => {
  const en = table(dir, 'en');
  const ar = table(dir, 'ar');

  it('has an ar.* key for every en.* key and no extras', () => {
    expect(Object.keys(en.table).length).toBeGreaterThan(100);
    const missing = Object.keys(en.table).filter((k) => !(k in ar.table));
    const extra = Object.keys(ar.table).filter((k) => !(k in en.table));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(ar.duplicates).toEqual([]);
  });

  it('keeps the placeholders of the English text', () => {
    const bad = Object.keys(en.table).filter((k) => k in ar.table && placeholders(en.table[k]!) !== placeholders(ar.table[k]!));
    expect(bad).toEqual([]);
  });

  it('has no empty text and no Arabic-Indic digits', () => {
    const bad = Object.entries(ar.table).filter(([, v]) => !v.trim() || /[٠-٩۰-۹]/.test(v));
    expect(bad.map(([k]) => k)).toEqual([]);
  });
});

describe('bidi isolation of substituted values', () => {
  it('wraps values only for right-to-left languages', async () => {
    const { format, createTranslator } = await import('./core');
    expect(format('تجاوز {amount}', { amount: '$3 M' })).toBe('تجاوز $3 M');
    expect(format('تجاوز {amount}', { amount: '$3 M' }, true)).toBe('تجاوز ⁨$3 M⁩');
    expect(createTranslator({ 'ui.x': '{n} x' }, undefined, true)('ui.x', { n: 5 })).toBe('⁨5⁩ x');
    expect(createTranslator({ 'ui.x': '{n} x' })('ui.x', { n: 5 })).toBe('5 x');
  });
});
