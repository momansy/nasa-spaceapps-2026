import { describe, expect, it } from 'vitest';
import { BURST_ON_SCREEN, BURST_PER_TYPE, burstsOf, totalsOf } from './AudienceDisplay';
import { audienceSays } from './AudienceSays';
import type { AudienceWindow } from '../../state/types';
import type { VoteRound } from '../../state/types';

const win = (id: number, counts: Partial<AudienceWindow['counts']>): AudienceWindow => ({
  id,
  atMs: id * 1000,
  windowMs: 1000,
  counts: { ROCKET: 0, THUMBS_UP: 0, GRIMACE: 0, FIRE: 0, THINKING: 0, ...counts },
});

describe('audience bursts', () => {
  it('caps the emoji per type so a big count stays readable', () => {
    const b = burstsOf(win(1, { ROCKET: 40, FIRE: 2 }));
    expect(b.filter((x) => x.emoji === 'ROCKET')).toHaveLength(BURST_PER_TYPE);
    expect(b.filter((x) => x.emoji === 'FIRE')).toHaveLength(2);
    expect(b.length).toBeLessThanOrEqual(BURST_PER_TYPE * 5);
    expect(BURST_PER_TYPE * 5).toBeLessThanOrEqual(BURST_ON_SCREEN + 6);
  });

  it('is deterministic, stays inside the stage and staggers the start', () => {
    const a = burstsOf(win(7, { ROCKET: 3, THUMBS_UP: 3 }));
    expect(burstsOf(win(7, { ROCKET: 3, THUMBS_UP: 3 }))).toEqual(a);
    for (const x of a) expect(x.left).toBeGreaterThanOrEqual(8);
    for (const x of a) expect(x.left).toBeLessThanOrEqual(92);
    expect(new Set(a.map((x) => x.key)).size).toBe(a.length);
    expect(a.map((x) => x.delayMs)).toEqual([...a.map((x) => x.delayMs)].sort((p, q) => p - q));
  });

  it('makes nothing from an empty window or odd counts', () => {
    expect(burstsOf(win(2, {}))).toEqual([]);
    expect(burstsOf(win(3, { ROCKET: -4, FIRE: 1.9 })).map((x) => x.emoji)).toEqual(['FIRE']);
  });

  it('totals the newest ten windows per reaction', () => {
    const windows = Array.from({ length: 14 }, (_, i) => win(i + 1, { ROCKET: 1, FIRE: i === 13 ? 5 : 0 }));
    const t = totalsOf(windows);
    expect(t.ROCKET).toBe(10);
    expect(t.FIRE).toBe(5);
    expect(t.THINKING).toBe(0);
  });
});

describe('audienceSays', () => {
  const round = (stage: string, tally: Partial<NonNullable<VoteRound['tally']>> | null): Pick<VoteRound, 'stage' | 'tally'> =>
    ({
      stage: { roundId: 'r', stage, startedAtMs: 0, endsAtMs: null, candidateIds: ['a', 'b'], pickerId: null },
      tally: tally && { roundId: 'r', stage, counts: [], votedIds: [], audienceCounts: [], audienceTotal: 0, leadingOptionId: null, ...tally },
    }) as Pick<VoteRound, 'stage' | 'tally'>;
  const counts = [
    { optionId: 'a', n: 3 },
    { optionId: 'b', n: 5 },
  ];

  it('shows the audience ballots with the leader during the voting stages', () => {
    const d = audienceSays(round('VOTE', { audienceCounts: counts, audienceTotal: 8 }));
    expect(d?.total).toBe(8);
    expect(d?.lead.optionId).toBe('b');
    expect(audienceSays(round('RUNOFF', { audienceCounts: counts, audienceTotal: 8 }))).not.toBeNull();
  });

  it('is hidden when tallies are hidden, before any audience vote, or outside voting', () => {
    expect(audienceSays(round('VOTE', { audienceCounts: null, audienceTotal: 8 }))).toBeNull();
    expect(audienceSays(round('VOTE', { audienceCounts: counts, audienceTotal: 0 }))).toBeNull();
    expect(audienceSays(round('INSPECT', { audienceCounts: counts, audienceTotal: 8 }))).toBeNull();
    expect(audienceSays(round('VOTE', null))).toBeNull();
  });
});
