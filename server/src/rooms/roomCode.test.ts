import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, buildJoinUrl, buildSpectateUrl, generateRoomCode, isValidRoomCode } from './roomCode.js';

describe('ROOM_CODE_ALPHABET', () => {
  it('has 24 letters, excluding I and O', () => {
    expect(ROOM_CODE_ALPHABET.length).toBe(24);
    expect(ROOM_CODE_ALPHABET).not.toContain('I');
    expect(ROOM_CODE_ALPHABET).not.toContain('O');
  });

  it('contains only upper-case A-Z letters', () => {
    expect(/^[A-Z]+$/.test(ROOM_CODE_ALPHABET)).toBe(true);
  });
});

describe('isValidRoomCode', () => {
  it('accepts 4 letters from the restricted alphabet', () => {
    expect(isValidRoomCode('KQXM')).toBe(true);
    expect(isValidRoomCode('ABCD')).toBe(true);
  });

  it('rejects codes containing I or O', () => {
    expect(isValidRoomCode('IABC')).toBe(false);
    expect(isValidRoomCode('OABC')).toBe(false);
    expect(isValidRoomCode('ABIO')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
  });

  it('rejects lower-case and non-letter characters', () => {
    expect(isValidRoomCode('abcd')).toBe(false);
    expect(isValidRoomCode('AB1D')).toBe(false);
    expect(isValidRoomCode('AB-D')).toBe(false);
  });
});

describe('generateRoomCode', () => {
  it('produces a code matching the valid pattern using Math.random by default', () => {
    const code = generateRoomCode(() => false);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it('is deterministic given a fixed rng', () => {
    // rng always returns 0 -> picks alphabet[0] for every letter.
    const code = generateRoomCode(() => false, () => 0);
    expect(code).toBe(ROOM_CODE_ALPHABET[0]!.repeat(4));
  });

  it('retries when isLive reports the drawn code is already live', () => {
    // First draw (rng=0 always -> "AAAA") is reported live; the code must
    // retry with a fresh draw. We simulate a second rng value by advancing
    // a counter-based rng so successive draws differ.
    const liveCodes = new Set(['AAAA']);
    let calls = 0;
    const rng = () => {
      // First 4 calls produce "AAAA" (rng=0), next 4 calls produce "ABCD"-ish via rng=0.05 etc.
      calls++;
      return calls <= 4 ? 0 : 0.5;
    };
    const isLive = (code: string) => liveCodes.has(code);
    const code = generateRoomCode(isLive, rng);
    expect(code).not.toBe('AAAA');
    expect(isValidRoomCode(code)).toBe(true);
  });

  it('calls isLive with each candidate until one is not live', () => {
    const seen: string[] = [];
    let attempt = 0;
    const isLive = (code: string) => {
      seen.push(code);
      attempt++;
      return attempt < 3; // live for first 2 attempts, free on the 3rd
    };
    const code = generateRoomCode(isLive, () => 0);
    expect(seen.length).toBe(3);
    expect(code).toBe(seen[2]);
  });

  it('throws after too many attempts if isLive always returns true', () => {
    expect(() => generateRoomCode(() => true, () => 0)).toThrow();
  });
});

describe('buildJoinUrl', () => {
  it('appends ?room=<CODE> to the base url', () => {
    expect(buildJoinUrl('https://play.example.org/', 'KQXM')).toBe('https://play.example.org/?room=KQXM');
  });
});

describe('buildSpectateUrl', () => {
  it('appends ?room=<CODE>&watch=1 to the base url', () => {
    expect(buildSpectateUrl('https://play.example.org/', 'KQXM')).toBe('https://play.example.org/?room=KQXM&watch=1');
  });
});
