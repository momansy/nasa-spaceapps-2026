import { describe, expect, it } from 'vitest';
import {
  checkNickname,
  containsProfanity,
  generateToken,
  isValidNickname,
  makeIdAllocator,
  normalizeNickname,
  PROFANITY_BLOCKLIST,
  SAFE_NICKNAMES,
  suggestNickname,
  suggestVariant,
} from './identity.js';

describe('normalizeNickname', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeNickname('  Nova Pilot  ')).toBe('Nova Pilot');
  });

  it('collapses inner whitespace runs to a single space', () => {
    expect(normalizeNickname('Nova    Pilot')).toBe('Nova Pilot');
    expect(normalizeNickname('Nova\t\tPilot')).toBe('Nova Pilot');
  });

  it('NFC-normalizes decomposed unicode to composed form', () => {
    // "é" as e + combining acute accent (NFD) should become the single
    // composed codepoint (NFC).
    const decomposed = 'élan';
    const composed = 'élan';
    expect(normalizeNickname(decomposed)).toBe(composed);
  });
});

describe('isValidNickname', () => {
  it('accepts the minimum length of 2 characters', () => {
    expect(isValidNickname('Al')).toBe(true);
    expect(isValidNickname('A1')).toBe(true);
  });

  it('accepts the maximum length of 16 characters', () => {
    const nick = 'A'.repeat(16);
    expect(nick.length).toBe(16);
    expect(isValidNickname(nick)).toBe(true);
  });

  it('rejects 1 character and 17+ characters', () => {
    expect(isValidNickname('A')).toBe(false);
    expect(isValidNickname('A'.repeat(17))).toBe(false);
  });

  it('rejects leading or trailing space', () => {
    expect(isValidNickname(' Nova')).toBe(false);
    expect(isValidNickname('Nova ')).toBe(false);
  });

  it('rejects leading or trailing hyphen or underscore', () => {
    expect(isValidNickname('-Nova')).toBe(false);
    expect(isValidNickname('Nova-')).toBe(false);
    expect(isValidNickname('_Nova')).toBe(false);
    expect(isValidNickname('Nova_')).toBe(false);
  });

  it('accepts inner space, underscore and hyphen', () => {
    expect(isValidNickname('Nova Pilot')).toBe(true);
    expect(isValidNickname('Nova_Pilot')).toBe(true);
    expect(isValidNickname('Nova-Pilot')).toBe(true);
  });

  it('accepts unicode letters', () => {
    expect(isValidNickname('Jörg')).toBe(true);
    expect(isValidNickname('火星人')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidNickname('')).toBe(false);
  });

  it('rejects disallowed punctuation', () => {
    expect(isValidNickname('Nova!')).toBe(false);
    expect(isValidNickname('No@va')).toBe(false);
  });
});

describe('containsProfanity', () => {
  it('flags an exact blocked word, case-insensitively', () => {
    expect(containsProfanity(PROFANITY_BLOCKLIST[0]!)).toBe(true);
    expect(containsProfanity(PROFANITY_BLOCKLIST[0]!.toUpperCase())).toBe(true);
  });

  it('flags a blocked word embedded in a longer nickname', () => {
    expect(containsProfanity(`Captain ${PROFANITY_BLOCKLIST[0]}face`)).toBe(true);
  });

  it('does not flag clean space-themed nicknames', () => {
    for (const nick of SAFE_NICKNAMES) {
      expect(containsProfanity(nick)).toBe(false);
    }
  });
});

describe('SAFE_NICKNAMES / suggestNickname', () => {
  it('has at least 20 entries, all independently valid nicknames', () => {
    expect(SAFE_NICKNAMES.length).toBeGreaterThanOrEqual(20);
    for (const nick of SAFE_NICKNAMES) {
      expect(isValidNickname(nick)).toBe(true);
    }
  });

  it('suggestNickname picks deterministically from the list given a fixed rng', () => {
    expect(suggestNickname(() => 0)).toBe(SAFE_NICKNAMES[0]);
  });

  it('suggestNickname defaults to Math.random and always returns a list member', () => {
    const picked = suggestNickname();
    expect(SAFE_NICKNAMES).toContain(picked);
  });
});

describe('suggestVariant', () => {
  it('appends " 2" when the base name is free of that suffix', () => {
    const taken = new Set(['Nova Pilot']);
    expect(suggestVariant('Nova Pilot', (c) => taken.has(c))).toBe('Nova Pilot 2');
  });

  it('skips to the next free number when earlier variants are taken', () => {
    const taken = new Set(['Nova Pilot', 'Nova Pilot 2', 'Nova Pilot 3']);
    expect(suggestVariant('Nova Pilot', (c) => taken.has(c))).toBe('Nova Pilot 4');
  });

  it('truncates a 16-character base name so the variant stays within 16 chars', () => {
    const base = 'A'.repeat(16);
    const variant = suggestVariant(base, () => false);
    expect(variant.length).toBeLessThanOrEqual(16);
    expect(variant).toBe(`${'A'.repeat(14)} 2`);
  });

  it('throws if no free variant is found within the attempt budget', () => {
    expect(() => suggestVariant('Nova Pilot', () => true)).toThrow();
  });
});

describe('makeIdAllocator', () => {
  it('produces monotonically increasing player ids', () => {
    const next = makeIdAllocator('p');
    expect(next()).toBe('p1');
    expect(next()).toBe('p2');
    expect(next()).toBe('p3');
  });

  it('produces monotonically increasing spectator ids', () => {
    const next = makeIdAllocator('s');
    expect(next()).toBe('s1');
    expect(next()).toBe('s2');
  });

  it('never reuses an id within the same closure, even across many calls', () => {
    const next = makeIdAllocator('p');
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(next());
    }
    expect(ids.size).toBe(50);
  });

  it('matches the PlayerId / SpectatorId patterns', () => {
    const nextP = makeIdAllocator('p');
    const nextS = makeIdAllocator('s');
    expect(/^p[1-9][0-9]{0,3}$/.test(nextP())).toBe(true);
    expect(/^s[1-9][0-9]{0,6}$/.test(nextS())).toBe(true);
  });

  it('keeps independent counters for separate allocator instances', () => {
    const nextA = makeIdAllocator('p');
    const nextB = makeIdAllocator('p');
    expect(nextA()).toBe('p1');
    expect(nextA()).toBe('p2');
    expect(nextB()).toBe('p1');
  });
});

describe('generateToken', () => {
  it('produces a 32-character token matching the Token pattern by default', () => {
    const token = generateToken();
    expect(token.length).toBe(32);
    expect(/^[A-Za-z0-9_-]{16,64}$/.test(token)).toBe(true);
  });

  it('produces unique tokens across 1000 calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateToken());
    }
    expect(tokens.size).toBe(1000);
  });

  it('supports an injectable rng for deterministic shape testing', () => {
    const token = generateToken(() => 0);
    expect(token.length).toBe(32);
    expect(/^[A-Za-z0-9_-]{16,64}$/.test(token)).toBe(true);
    // rng always 0 -> every character is the first alphabet character.
    expect(new Set(token.split(''))).toEqual(new Set(['A']));
  });
});

describe('checkNickname', () => {
  const noneTaken = () => false;

  it('accepts and normalizes a valid, clean, free nickname', () => {
    const result = checkNickname('  Nova   Pilot  ', noneTaken);
    expect(result).toEqual({ ok: true, nickname: 'Nova Pilot' });
  });

  it('rejects an invalid shape with NICK_REJECTED and a safe suggestion', () => {
    const result = checkNickname('A', noneTaken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NICK_REJECTED');
      expect(SAFE_NICKNAMES).toContain(result.suggestion);
    }
  });

  it('rejects a profane nickname with NICK_REJECTED and a safe suggestion', () => {
    const result = checkNickname(PROFANITY_BLOCKLIST[0]!, noneTaken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NICK_REJECTED');
      expect(SAFE_NICKNAMES).toContain(result.suggestion);
    }
  });

  it('rejects a case-insensitive duplicate with NICK_TAKEN and a variant suggestion', () => {
    const isTaken = (nick: string) => nick.toLowerCase() === 'nova pilot';
    const result = checkNickname('Nova Pilot', isTaken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NICK_TAKEN');
      expect(result.suggestion).toBe('Nova Pilot 2');
    }
  });

  it('detects duplicates regardless of the casing of the input', () => {
    const isTaken = (nick: string) => nick.toLowerCase() === 'nova pilot';
    const result = checkNickname('NOVA PILOT', isTaken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NICK_TAKEN');
    }
  });
});
