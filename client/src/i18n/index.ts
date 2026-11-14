// Runtime string tables. The shared game text comes from `data/strings/<lang>*.json` (every
// fragment of a language is merged); the client's own interface text lives in
// `./strings/<lang>*.json`. Data strings win over client strings, and any language falls back
// to English key by key.
import { useSyncExternalStore } from 'react';
import {
  createTranslator,
  dirOf,
  languagesOf,
  layerTables,
  mergeTables,
  type Args,
  type StringTable,
  type Translator,
} from './core';

type Loader = () => Promise<unknown>;

// English is bundled eagerly: it is the fallback for every other language.
const dataEn = import.meta.glob('../../../data/strings/en*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const clientEn = import.meta.glob('./strings/en*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
// Other languages are separate chunks, fetched when the player switches.
const dataLazy = import.meta.glob(['../../../data/strings/*.json', '!../../../data/strings/en*.json'], { import: 'default' }) as Record<string, Loader>;
const clientLazy = import.meta.glob(['./strings/*.json', '!./strings/en*.json'], { import: 'default' }) as Record<string, Loader>;

const FALLBACK = 'en';

const mergedDataEn = mergeTables(dataEn, FALLBACK);
const mergedClientEn = mergeTables(clientEn, FALLBACK);
const english: StringTable = layerTables(mergedClientEn.table, mergedDataEn.table);

/** Keys defined twice inside the shared data or inside the client fragments (a content bug). */
export const duplicateKeys = [...mergedDataEn.duplicates, ...mergedClientEn.duplicates];

/** The merged English table (client interface strings under the shared data strings). */
export const englishTable: Readonly<StringTable> = english;

const tables = new Map<string, StringTable>([[FALLBACK, english]]);

function warnMissing(key: string) {
  if (import.meta.env.DEV) console.warn(`[i18n] missing string: ${key}`);
}

let lang = FALLBACK;
let translator: Translator = createTranslator(english, warnMissing);
const listeners = new Set<() => void>();

/** Languages with at least one string file. English first. */
export function availableLanguages(): string[] {
  const all = new Set([FALLBACK, ...languagesOf([...Object.keys(dataLazy), ...Object.keys(clientLazy)])]);
  return [FALLBACK, ...[...all].filter((l) => l !== FALLBACK).sort()];
}

async function loadTable(next: string): Promise<StringTable> {
  const cached = tables.get(next);
  if (cached) return cached;
  const load = async (globbed: Record<string, Loader>) => {
    const out: Record<string, unknown> = {};
    await Promise.all(
      Object.entries(globbed).map(async ([path, loader]) => {
        out[path] = await loader();
      }),
    );
    return mergeTables(out, next).table;
  };
  const [client, data] = await Promise.all([load(clientLazy), load(dataLazy)]);
  const table = layerTables(english, client, data);
  tables.set(next, table);
  return table;
}

function apply(next: string, table: StringTable) {
  lang = next;
  translator = createTranslator(table, warnMissing);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    // `?dir=rtl` forces the direction so the right-to-left layout can be checked before a
    // right-to-left language ships.
    const forced = new URLSearchParams(location.search).get('dir');
    document.documentElement.dir = forced === 'rtl' || forced === 'ltr' ? forced : dirOf(next);
  }
  listeners.forEach((l) => l());
}

/** Switches the interface language. Unknown languages fall back to English. */
export async function setLanguage(next: string): Promise<void> {
  const target = availableLanguages().includes(next) ? next : FALLBACK;
  apply(target, await loadTable(target));
}

export function getLanguage(): string {
  return lang;
}

/** Translate outside React (canvas minigames, document title). */
export function t(key: string, args?: Args): string {
  return translator(key, args);
}

/** Keys looked up since start-up that exist in no table (shown humanised): a content bug. */
export function missingKeys(): string[] {
  return [...translator.missing];
}

export function hasString(key: string): boolean {
  return translator.has(key);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React hook: re-renders when the language changes. */
export function useT(): Translator {
  return useSyncExternalStore(subscribe, () => translator, () => translator);
}

export function useLanguage(): string {
  return useSyncExternalStore(subscribe, () => lang, () => lang);
}

/** Name of a language in that language ("English", "العربية"), for the language switch. */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    /* older engines: fall through */
  }
  return code.toUpperCase();
}

export { dirOf, type Args, type Translator };
