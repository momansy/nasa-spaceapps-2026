import { describe, expect, it } from 'vitest';
import type { OptionId, PlayerId } from '../../../protocol/ts/messages.js';
import type { OptionState, TagEntry } from './rules.js';
import {
  appliesEmergencyFunding,
  coinFlip,
  computeAudienceBallot,
  findTiedTop,
  isAllAbstain,
  pickRunoffCandidates,
  resolveAfterTrivia,
  resolveAllAbstain,
  resolveRunoffClose,
  resolveTieSync,
  resolveVoteClose,
  shouldRunoff,
  tallyPlayerBallots,
  type VoteCloseContext,
} from './resolve.js';

function opt(id: OptionId, partial: Partial<OptionState> = {}): OptionState {
  return { id, costM: 1, afford: 'OK', willNotFly: false, fixExists: false, ...partial };
}

function baseCtx(partial: Partial<VoteCloseContext> = {}): VoteCloseContext {
  return {
    winnableOptions: [opt('A'), opt('B'), opt('C')],
    voters: ['p1', 'p2', 'p3'],
    ballots: new Map(),
    disconnected: new Set(),
    audienceBallots: new Map(),
    audienceVoteWeight: 0,
    strictMajorityEnabled: false,
    ownerRoles: [],
    roleHolder: () => null,
    tags: [],
    defaultOptionId: null,
    decisionTimeOptionId: null,
    flightHolderId: null,
    ...partial,
  };
}

describe('isAllAbstain', () => {
  it('is true when no connected voter has a ballot', () => {
    expect(isAllAbstain(['p1', 'p2'], new Map(), new Set())).toBe(true);
    expect(isAllAbstain(['p1', 'p2'], new Map([['p1', 'A']]), new Set(['p1']))).toBe(true); // ballot but disconnected
  });

  it('is false as soon as one connected voter has a ballot', () => {
    expect(isAllAbstain(['p1', 'p2'], new Map([['p1', 'A']]), new Set())).toBe(false);
  });
});

describe('resolveAllAbstain', () => {
  const winnable = [opt('A', { costM: 5 }), opt('B', { costM: 2 }), opt('C', { costM: 2 })];

  it('prefers the first owner role\'s RECOMMENDED tag, in ownerRoles order', () => {
    const tags: TagEntry[] = [{ optionId: 'B', playerId: 'pBooster', role: 'BOOSTER', tag: 'RECOMMENDED' }];
    const result = resolveAllAbstain(['BOOSTER', 'STRUCT'], (r) => (r === 'BOOSTER' ? 'pBooster' : null), tags, null, winnable);
    expect(result).toEqual({ method: 'ABSTAIN_RECOMMENDED', winnerId: 'B' });
  });

  it('falls back to defaultOptionId when no Recommended tag applies', () => {
    const result = resolveAllAbstain([], () => null, [], 'C', winnable);
    expect(result).toEqual({ method: 'ABSTAIN_DEFAULT', winnerId: 'C' });
  });

  it('falls back to the cheapest option, first in display order among equal costs', () => {
    const result = resolveAllAbstain([], () => null, [], null, winnable);
    expect(result).toEqual({ method: 'ABSTAIN_CHEAPEST', winnerId: 'B' });
  });

  it('ignores a Recommended tag on an unwinnable option', () => {
    const tags: TagEntry[] = [{ optionId: 'Z', playerId: 'pBooster', role: 'BOOSTER', tag: 'RECOMMENDED' }];
    const result = resolveAllAbstain(['BOOSTER'], () => 'pBooster', tags, null, winnable);
    expect(result.method).toBe('ABSTAIN_CHEAPEST');
  });
});

describe('resolveVoteClose: all-abstain end to end', () => {
  it('resolves to the cheapest option when the whole room abstains', () => {
    const ctx = baseCtx({ winnableOptions: [opt('A', { costM: 3 }), opt('B', { costM: 1 })] });
    const outcome = resolveVoteClose(ctx);
    expect(outcome).toMatchObject({ kind: 'ABSTAIN', method: 'ABSTAIN_CHEAPEST', winnerId: 'B' });
  });
});

describe('resolveVoteClose: plurality', () => {
  it('picks the single option with the most ballots', () => {
    const ctx = baseCtx({ ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'A'], ['p3', 'B']]) });
    const outcome = resolveVoteClose(ctx);
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'PLURALITY', winnerId: 'A' });
  });

  it('treats a disconnected voter\'s stale ballot as an abstention', () => {
    const ctx = baseCtx({
      voters: ['p1', 'p2', 'p3'],
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'B']]),
      disconnected: new Set(['p1']),
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'PLURALITY', winnerId: 'B' });
  });
});

describe('resolveVoteClose: ties', () => {
  it('a plain two-way tie with no Decision Time and no FLIGHT ballot needs an external tie-break', () => {
    const ctx = baseCtx({ ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'B']]) });
    const outcome = resolveVoteClose(ctx);
    expect(outcome.kind).toBe('TIE');
    if (outcome.kind === 'TIE') expect(outcome.tiedOptionIds.sort()).toEqual(['A', 'B']);
  });

  it('Decision Time breaks the tie immediately when FLIGHT used it on a tied option', () => {
    const ctx = baseCtx({
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'B']]),
      decisionTimeOptionId: 'B',
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'DECISION_TIME', winnerId: 'B' });
  });

  it("FLIGHT's own ballot breaks the tie when it is on a tied option and Decision Time was not used", () => {
    const ctx = baseCtx({
      voters: ['p1', 'p2', 'p3', 'pFlight'],
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'A'], ['p3', 'B'], ['pFlight', 'B']]),
      flightHolderId: 'pFlight',
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'FLIGHT_TIEBREAK', winnerId: 'B' });
  });

  it("does not use FLIGHT's ballot when FLIGHT voted for a non-tied option", () => {
    const ctx = baseCtx({
      winnableOptions: [opt('A'), opt('B'), opt('C')],
      voters: ['p1', 'p2', 'p3', 'p4', 'pFlight'],
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'A'], ['p3', 'B'], ['p4', 'B'], ['pFlight', 'C']]),
      flightHolderId: 'pFlight',
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome.kind).toBe('TIE');
  });

  it('Decision Time takes priority over FLIGHT\'s own ballot (tie-breaker 0 before 1)', () => {
    const ctx = baseCtx({
      voters: ['p1', 'p2', 'p3', 'pFlight'],
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'A'], ['p3', 'B'], ['pFlight', 'B']]),
      flightHolderId: 'pFlight',
      decisionTimeOptionId: 'A',
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome).toMatchObject({ method: 'DECISION_TIME', winnerId: 'A' });
  });
});

describe('trivia sudden-death and coin flip (tie-breakers 2 and 3)', () => {
  const tied: OptionId[] = ['A', 'B'];

  it('the trivia winner\'s pick wins', () => {
    const result = resolveAfterTrivia(tied, 'p3', 'B', new Map(), 0);
    expect(result).toEqual({ method: 'TRIVIA', winnerId: 'B', triviaWinnerId: 'p3' });
  });

  it("falls back to the trivia winner's own ballot when they do not pick in time", () => {
    const ballots = new Map<PlayerId, OptionId>([['p3', 'A']]);
    const result = resolveAfterTrivia(tied, 'p3', null, ballots, 0);
    expect(result).toEqual({ method: 'TRIVIA', winnerId: 'A', triviaWinnerId: 'p3' });
  });

  it('falls through to the coin flip when the trivia winner did not vote for a tied option and did not pick', () => {
    const ballots = new Map<PlayerId, OptionId>([['p3', 'Z']]);
    const result = resolveAfterTrivia(tied, 'p3', null, ballots, 1);
    expect(result).toEqual({ method: 'COIN_FLIP', winnerId: coinFlip(tied, 1), triviaWinnerId: null });
  });

  it('nobody answering correctly goes straight to the coin flip', () => {
    const result = resolveAfterTrivia(tied, null, null, new Map(), 3);
    expect(result.method).toBe('COIN_FLIP');
  });

  it('coin flip is deterministic from the seed and picks within the tied set', () => {
    expect(coinFlip(['A', 'B', 'C'], 0)).toBe('A');
    expect(coinFlip(['A', 'B', 'C'], 1)).toBe('B');
    expect(coinFlip(['A', 'B', 'C'], 4)).toBe('B'); // 4 mod 3 = 1
  });
});

describe('runoff', () => {
  it('triggers only when enabled, no option has a majority, and at least three options have a ballot', () => {
    const threeWay = new Map<OptionId, number>([['A', 2], ['B', 2], ['C', 1]]);
    expect(shouldRunoff(threeWay, true)).toBe(true);
    expect(shouldRunoff(threeWay, false)).toBe(false);

    const twoWay = new Map<OptionId, number>([['A', 2], ['B', 2]]);
    expect(shouldRunoff(twoWay, true)).toBe(false); // a two-way tie skips straight to tie-breakers

    const majority = new Map<OptionId, number>([['A', 3], ['B', 1], ['C', 1]]);
    expect(shouldRunoff(majority, true)).toBe(false); // A has > half of 5
  });

  it('resolveVoteClose opens a RUNOFF with the top two candidates when the condition holds', () => {
    const ctx = baseCtx({
      strictMajorityEnabled: true,
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'B'], ['p3', 'C']]),
      voters: ['p1', 'p2', 'p3', 'p4', 'p5'],
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome.kind).toBe('RUNOFF');
    if (outcome.kind === 'RUNOFF') expect(outcome.candidateIds.sort()).toEqual(['A', 'B']);
  });

  it('resolveRunoffClose: the higher runoff count wins, method RUNOFF', () => {
    const outcome = resolveRunoffClose({
      candidateIds: ['A', 'B'],
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'A'], ['p3', 'B']]),
      disconnected: new Set(),
      audienceBallots: new Map(),
      audienceVoteWeight: 0,
      firstRoundCounts: new Map([['A', 2], ['B', 2]]),
      decisionTimeOptionId: null,
      flightHolderId: null,
    });
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'RUNOFF', winnerId: 'A' });
  });

  it('resolveRunoffClose: nobody votes in the runoff, the higher first-round count wins', () => {
    const outcome = resolveRunoffClose({
      candidateIds: ['A', 'B'],
      ballots: new Map(),
      disconnected: new Set(),
      audienceBallots: new Map(),
      audienceVoteWeight: 0,
      firstRoundCounts: new Map([['A', 3], ['B', 1]]),
      decisionTimeOptionId: null,
      flightHolderId: null,
    });
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'RUNOFF', winnerId: 'A' });
  });

  it('resolveRunoffClose: equal first-round counts and nobody voting falls through to tie-breakers', () => {
    const outcome = resolveRunoffClose({
      candidateIds: ['A', 'B'],
      ballots: new Map(),
      disconnected: new Set(),
      audienceBallots: new Map(),
      audienceVoteWeight: 0,
      firstRoundCounts: new Map([['A', 2], ['B', 2]]),
      decisionTimeOptionId: null,
      flightHolderId: null,
    });
    expect(outcome.kind).toBe('TIE');
  });

  it('resolveRunoffClose: a tied runoff vote still honours Decision Time', () => {
    const outcome = resolveRunoffClose({
      candidateIds: ['A', 'B'],
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'B']]),
      disconnected: new Set(),
      audienceBallots: new Map(),
      audienceVoteWeight: 0,
      firstRoundCounts: new Map([['A', 1], ['B', 1]]),
      decisionTimeOptionId: 'B',
      flightHolderId: null,
    });
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'DECISION_TIME', winnerId: 'B' });
  });
});

describe('audience vote weight', () => {
  it('adds one ballot for a unique audience favourite when weight is 1', () => {
    const audience = new Map([
      ['s1', 'A'],
      ['s2', 'A'],
      ['s3', 'B'],
    ]);
    expect(computeAudienceBallot(['A', 'B', 'C'], audience, 1)).toBe('A');
  });

  it('adds nothing on an audience tie or with weight 0', () => {
    const tie = new Map([
      ['s1', 'A'],
      ['s2', 'B'],
    ]);
    expect(computeAudienceBallot(['A', 'B'], tie, 1)).toBeNull();
    expect(computeAudienceBallot(['A', 'B'], tie, 0)).toBeNull();
  });

  it('can turn a player plurality tie into a decisive win', () => {
    const ctx = baseCtx({
      audienceVoteWeight: 1,
      ballots: new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'B']]),
      audienceBallots: new Map([
        ['s1', 'A'],
        ['s2', 'A'],
      ]),
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome).toMatchObject({ kind: 'DECIDED', method: 'PLURALITY', winnerId: 'A' });
  });

  it('never prevents the all-abstain rule even with audience ballots', () => {
    const ctx = baseCtx({
      audienceVoteWeight: 1,
      audienceBallots: new Map([['s1', 'A']]),
    });
    const outcome = resolveVoteClose(ctx);
    expect(outcome.kind).toBe('ABSTAIN');
  });
});

describe('emergency funding', () => {
  it('flags only when the winning option is EMERGENCY_FUNDING', () => {
    expect(appliesEmergencyFunding(opt('A', { afford: 'EMERGENCY_FUNDING' }))).toBe(true);
    expect(appliesEmergencyFunding(opt('A', { afford: 'OK' }))).toBe(false);
  });
});

describe('tallyPlayerBallots and findTiedTop / pickRunoffCandidates helpers', () => {
  it('tallyPlayerBallots ignores ballots for non-candidate options', () => {
    const counts = tallyPlayerBallots(['A', 'B'], new Map<PlayerId, OptionId>([['p1', 'A'], ['p2', 'Z']]), new Set());
    expect(counts.get('A')).toBe(1);
    expect(counts.has('Z')).toBe(false);
  });

  it('findTiedTop breaks nothing when there is a single leader', () => {
    expect(findTiedTop(new Map([['A', 3], ['B', 1]]), ['A', 'B'])).toEqual(['A']);
  });

  it('pickRunoffCandidates breaks count ties by display order', () => {
    expect(pickRunoffCandidates(new Map([['A', 1], ['B', 1], ['C', 1]]), ['A', 'B', 'C'])).toEqual(['A', 'B']);
  });

  it('resolveTieSync returns null when neither Decision Time nor FLIGHT apply', () => {
    expect(resolveTieSync(['A', 'B'], null, null, new Map())).toBeNull();
  });
});
