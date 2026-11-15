import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NameText, tName } from './NameText';

const t = ((key: string, p?: Record<string, string | number>) => `Answer ${p?.name ?? ''}.${key.length ? '' : ''}`) as never;

describe('NameText', () => {
  it('isolates direction and keeps hyphenated words unbreakable, plain spaces breakable', () => {
    const html = renderToStaticMarkup(createElement(NameText, { name: 'High-Efficiency Upper Stage' }));
    expect(html).toContain('<bdi class="namenb">');
    expect(html).toContain('<span class="namenb__word">High-Efficiency</span>');
    expect(html).not.toContain('namenb__word">Upper');
  });

  it('places the name in the sentence and glues the full stop to it outside the isolate', () => {
    const html = renderToStaticMarkup(createElement('p', null, tName(t, 'k', 'name', 'Kero-Lox')));
    expect(html).toMatch(/^<p>Answer <span class="namenb__unit"><bdi class="namenb">.*<\/bdi>\.<\/span><\/p>$/);
  });
});
