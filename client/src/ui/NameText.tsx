// A part (or any data) name placed inside a sentence. Two defects of plain string
// interpolation are fixed here (T038):
//  1. Hyphenated words such as "High-Efficiency" never break at the hyphen: each hyphenated
//     word is wrapped as one unbreakable unit; plain spaces stay breakable so a very long name
//     still wraps on a 390 px phone.
//  2. In Arabic the sentence is right-to-left and the name may be left-to-right (a Latin part
//     name): the name is a <bdi> so its direction is isolated, which keeps the sentence's full
//     stop at the logical end of the sentence instead of jumping inside the name.
import type { ReactNode } from 'react';
import type { Translator } from '../i18n/core';

/** Private-use marker used to find where the name goes in the translated sentence. */
const MARK = '';

/** The name alone, hyphenated words unbreakable, direction isolated. */
export function NameText({ name }: { name: string }) {
  const words = name.split(' ');
  return (
    <bdi className="namenb">
      {words.map((w, i) => (
        <span key={i}>
          {i > 0 ? ' ' : ''}
          {/[-‐‑]/.test(w) ? <span className="namenb__word">{w}</span> : w}
        </span>
      ))}
    </bdi>
  );
}

/**
 * Translate `key` and put `name` into its `{param}` slot as a <NameText>.
 * Other params are passed through to the translator as plain strings or numbers.
 */
export function tName(t: Translator, key: string, param: string, name: string, extra?: Record<string, string | number>): ReactNode {
  const text = t(key, { ...extra, [param]: MARK });
  const at = text.indexOf(MARK);
  if (at < 0) return text;
  // Sentence punctuation right after the name (the full stop, a question mark, an Arabic comma)
  // stays glued to it: a line break may never strand it alone on the next line.
  const tail = /^[.!?:;,\u060C\u061B\u061F\u2026]+/.exec(text.slice(at + 1))?.[0] ?? '';
  return (
    <>
      {text.slice(0, at)}
      <span className="namenb__unit">
        <NameText name={name} />
        {tail}
      </span>
      {text.slice(at + 1 + tail.length)}
    </>
  );
}
