// Resolving protocol text references (`TextRef`): a string-table key plus arguments. String
// arguments are themselves data ids or string keys (never user text), so they are translated
// too: a part id becomes the part name, a role id the role name, and so on.
import type { TextRef } from '@protocol';
import { getPart } from '../data/catalog';
import type { Translator } from './core';

function resolveArg(t: Translator, value: string | number): string | number {
  if (typeof value === 'number') return value;
  if (t.has(value)) return t(value);
  const part = getPart(value);
  if (part) return t(part.name_key);
  for (const key of [`role.${value}.name`, `category.${value}.name`, `contract.${value}.name`, `test.${value}.name`, `anomaly.${value}.name`]) {
    if (t.has(key)) return t(key);
  }
  return value;
}

export function resolveText(t: Translator, ref: TextRef | null | undefined): string {
  if (!ref) return '';
  if (!ref.args) return t(ref.key);
  const args: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(ref.args)) args[k] = resolveArg(t, v);
  return t(ref.key, args);
}
