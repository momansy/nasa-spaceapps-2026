import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTranslator, dirOf, format, humanise, langOfFile, layerTables, mergeTables } from './core';
import { duplicateKeys, englishTable, t } from './index';

const dataDir = join(__dirname, '../../../data/strings');

describe('string table core', () => {
  it('recognises every fragment of a language', () => {
    expect(langOfFile('data/strings/en.json')).toBe('en');
    expect(langOfFile('en.parts_a.json')).toBe('en');
    expect(langOfFile('x/pt-BR.codex.json')).toBe('pt-BR');
    expect(langOfFile('README.md')).toBeNull();
  });

  it('merges fragments, keeps the first value of a duplicate and reports it', () => {
    const { table, duplicates } = mergeTables(
      {
        'a/en.json': { $schema: 'x', 'k.one': 'One', 'k.two': 'Two' },
        'a/en.extra.json': { 'k.three': 'Three', 'k.two': 'Again' },
        'a/fr.json': { 'k.one': 'Un' },
      },
      'en',
    );
    // Fragments merge in path order: en.extra.json sorts before en.json.
    expect(table).toEqual({ 'k.one': 'One', 'k.two': 'Again', 'k.three': 'Three' });
    expect(duplicates).toEqual([{ key: 'k.two', files: ['a/en.extra.json', 'a/en.json'] }]);
  });

  it('substitutes placeholders and leaves unknown ones', () => {
    expect(format('Over budget by {amount}', { amount: '$3 M' })).toBe('Over budget by $3 M');
    expect(format('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });

  it('never shows a raw key for a missing string and records it', () => {
    const tr = createTranslator({ 'ui.x': 'X' });
    expect(tr('ui.x')).toBe('X');
    expect(tr('part.eng_kerolox_giant.name')).toBe('Eng kerolox giant');
    expect(tr.missing.has('part.eng_kerolox_giant.name')).toBe(true);
    expect(humanise('ui.vote.option.SKIP')).toBe('SKIP');
  });

  it('layers later tables over earlier ones', () => {
    expect(layerTables({ a: '1', b: '1' }, { b: '2' })).toEqual({ a: '1', b: '2' });
  });

  it('knows right-to-left languages', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('he-IL')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });
});

describe('bundled English table', () => {
  it('contains every key of every data/strings/en*.json file', () => {
    const files = readdirSync(dataDir).filter((f) => /^en.*\.json$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(4);
    let n = 0;
    for (const f of files) {
      const frag = JSON.parse(readFileSync(join(dataDir, f), 'utf8')) as Record<string, unknown>;
      for (const [k, v] of Object.entries(frag)) {
        if (k.startsWith('$') || typeof v !== 'string') continue;
        expect(englishTable[k], `${f}: ${k}`).toBeDefined();
        n++;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('has no key defined twice inside the data or inside the client fragments', () => {
    expect(duplicateKeys).toEqual([]);
  });

  it('resolves part, role and interface strings', () => {
    expect(t('part.eng_kerolox_workhorse.name')).toBe('Kerolox Workhorse');
    expect(t('role.BOOSTER.ability.name')).toBe('Hot-Fire Discount');
    expect(t('ui.card.over_budget', { amount: '$8.4 M' })).toBe('Over budget by $8.4 M');
  });
});
