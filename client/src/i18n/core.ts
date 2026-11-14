// Pure string-table logic: merging table fragments, placeholder substitution and lookup.
// No browser APIs and no Vite globs here, so everything is unit-testable in Node.

export type StringTable = Record<string, string>;

export interface MergeResult {
  table: StringTable;
  /** Keys defined by more than one fragment, with the fragments that define them. */
  duplicates: Array<{ key: string; files: string[] }>;
}

/** `en.json` → `en`, `en.parts_propulsion.json` → `en`, `pt-BR.codex.json` → `pt-BR`. */
export function langOfFile(path: string): string | null {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const m = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)(?:\.[A-Za-z0-9_-]+)*\.json$/.exec(name);
  return m ? m[1]! : null;
}

/**
 * Merges every fragment of one language into a single flat table (data/README: "The validator
 * merges every en*.json file; a key defined twice is an error. Loaders must do the same").
 * Fragments are merged in path order; a duplicated key keeps its first value and is reported.
 * Non-string values and keys starting with `$` (such as `$schema`) are ignored.
 */
export function mergeTables(fragments: Record<string, unknown>, lang: string): MergeResult {
  const table: StringTable = {};
  const owner: Record<string, string> = {};
  const dup = new Map<string, string[]>();
  for (const path of Object.keys(fragments).sort()) {
    if (langOfFile(path) !== lang) continue;
    const frag = fragments[path];
    if (!frag || typeof frag !== 'object') continue;
    for (const [key, value] of Object.entries(frag as Record<string, unknown>)) {
      if (key.startsWith('$') || typeof value !== 'string') continue;
      if (key in table) {
        const files = dup.get(key) ?? [owner[key]!];
        files.push(path);
        dup.set(key, files);
        continue;
      }
      table[key] = value;
      owner[key] = path;
    }
  }
  return { table, duplicates: [...dup].map(([key, files]) => ({ key, files })) };
}

/** Languages for which at least one fragment exists. */
export function languagesOf(paths: string[]): string[] {
  const set = new Set<string>();
  for (const p of paths) {
    const l = langOfFile(p);
    if (l) set.add(l);
  }
  return [...set].sort();
}

/**
 * Layers tables: later tables win. Used to put the shared game-data strings on top of the
 * client's own interface strings, and a language on top of the English fallback.
 */
export function layerTables(...tables: StringTable[]): StringTable {
  return Object.assign({}, ...tables) as StringTable;
}

export type Args = Record<string, string | number>;

/** Replaces `{name}` placeholders. Unknown placeholders are left as they are. */
export function format(template: string, args?: Args): string {
  if (!args) return template;
  return template.replace(/\{([a-z][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    name in args ? String(args[name]) : whole,
  );
}

export interface Translator {
  /** Looks up `key` and substitutes `args`. A missing key returns a readable fallback, never the raw key. */
  (key: string, args?: Args): string;
  has(key: string): boolean;
  /** Keys that were asked for but are in no table. */
  missing: Set<string>;
}

/** "part.eng_kerolox_giant.name" → "Eng kerolox giant": last resort for a missing key. */
export function humanise(key: string): string {
  const parts = key.split('.');
  const generic = new Set(['name', 'label', 'title', 'text', 'description', 'body']);
  let seg = parts[parts.length - 1] ?? key;
  if (generic.has(seg) && parts.length > 1) seg = parts[parts.length - 2]!;
  const words = seg.replace(/[_-]+/g, ' ').trim();
  if (!words) return key;
  if (words === words.toUpperCase()) return words;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function createTranslator(table: StringTable, onMissing?: (key: string) => void): Translator {
  const missing = new Set<string>();
  const t = ((key: string, args?: Args) => {
    const template = table[key];
    if (template === undefined) {
      if (!missing.has(key)) {
        missing.add(key);
        onMissing?.(key);
      }
      return humanise(key);
    }
    return format(template, args);
  }) as Translator;
  t.has = (key: string) => key in table;
  t.missing = missing;
  return t;
}

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'dv', 'yi', 'ckb', 'sd', 'ug']);

/** Text direction of a BCP 47 tag. */
export function dirOf(lang: string): 'ltr' | 'rtl' {
  return RTL_LANGS.has(lang.toLowerCase().split('-')[0]!) ? 'rtl' : 'ltr';
}
