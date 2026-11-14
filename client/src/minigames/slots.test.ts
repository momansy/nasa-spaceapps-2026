import { describe, expect, it } from 'vitest';
import { runParams, slotInfo } from './slots';

const players = [
  { id: 'p3', slot: 3 },
  { id: 'p1', slot: 1 },
  { id: 'p2', slot: 2 },
];

describe('minigame team slots', () => {
  it('uses the host assignment index and count when present', () => {
    const start = { assignments: [{ playerId: 'p2', index: 0, params: {} }, { playerId: 'p1', index: 1, params: {} }] };
    expect(slotInfo(start, 'p1', players)).toEqual({ slot: 1, slots: 2 });
  });

  it('falls back to the seat order of the room players', () => {
    expect(slotInfo({ assignments: [] }, 'p3', players)).toEqual({ slot: 2, slots: 3 });
    expect(slotInfo({ assignments: [] }, null, players)).toEqual({ slot: 0, slots: 3 });
  });

  it('merges common params, own params, extras, then slot and slots', () => {
    const start = { params: { a: 1, b: 1 }, assignments: [{ playerId: 'p1', index: 0, params: { b: 2, piece: 'left' } }] };
    expect(runParams(start, 'p1', players, { hold_to_toggle: true })).toEqual({ a: 1, b: 2, piece: 'left', hold_to_toggle: true, slot: 0, slots: 1 });
  });
});
