import { describe, expect, it } from 'vitest';
import { counterBase } from '../../state/store';
import { ABORT_COVER_MS, ABORT_HOLD_MS, holdMs, STAGE_HOLD_MS } from './controlsData';

describe('hold times from data/pilot_controls.json', () => {
  it('are the design 9.2 values: STAGE 0.3 s, ABORT 1.5 s', () => {
    expect(STAGE_HOLD_MS).toBe(300);
    expect(ABORT_HOLD_MS).toBe(1500);
    expect(holdMs('stage_separate')).toBe(300);
    expect(holdMs('abort')).toBe(1500);
  });
  it('close the abort cover after a few seconds, longer than the abort hold', () => {
    expect(ABORT_COVER_MS).toBeGreaterThan(ABORT_HOLD_MS);
  });
});

describe('counter base', () => {
  it('grows faster than the fastest sender and stays inside int32 for years', () => {
    const t = Date.UTC(2026, 10, 14);
    const a = counterBase(t);
    expect(counterBase(t + 1000) - a).toBeGreaterThanOrEqual(30); // 30 inputs per second at most
    expect(counterBase(Date.UTC(2027, 11, 31))).toBeLessThan(2_147_483_647);
    expect(a).toBeGreaterThan(0);
  });
});
