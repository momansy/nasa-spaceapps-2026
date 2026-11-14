import { describe, expect, it } from 'vitest';
import type { OptionId, PlayerId } from '../../../protocol/ts/messages.js';
import {
  applyTag,
  applyVeto,
  clearTagsForOption,
  earlyCloseEligible,
  isWinnable,
  profileForKind,
  runoffPossible,
  stageDurationMs,
  stageSequence,
  tagsAllowed,
  vetoAllowed,
  winnableOptions,
  type OptionState,
} from './rules.js';

function opt(id: OptionId, partial: Partial<OptionState> = {}): OptionState {
  return { id, costM: 1, afford: 'OK', willNotFly: false, fixExists: false, ...partial };
}

describe('profileForKind', () => {
  it('maps every kind to its profile', () => {
    expect(profileForKind('PART')).toBe('FULL');
    expect(profileForKind('CONTRACT')).toBe('CHOICE');
    expect(profileForKind('PILOT')).toBe('CHOICE');
    expect(profileForKind('TEST')).toBe('QUICK');
    expect(profileForKind('MCM')).toBe('QUICK');
  });

  it('only PART allows vetoes and tags', () => {
    expect(vetoAllowed('PART')).toBe(true);
    expect(tagsAllowed('PART')).toBe(true);
    expect(vetoAllowed('CONTRACT')).toBe(false);
    expect(tagsAllowed('TEST')).toBe(false);
  });

  it('runoff is never possible for QUICK, only when enabled otherwise', () => {
    expect(runoffPossible('ABORT', true)).toBe(false);
    expect(runoffPossible('PART', false)).toBe(false);
    expect(runoffPossible('PART', true)).toBe(true);
    expect(runoffPossible('CONTRACT', true)).toBe(true);
  });

  it('early close applies to CHOICE and QUICK, never FULL', () => {
    expect(earlyCloseEligible('PART')).toBe(false);
    expect(earlyCloseEligible('CONTRACT')).toBe(true);
    expect(earlyCloseEligible('TEST')).toBe(true);
  });
});

describe('stageSequence', () => {
  it('FULL includes PREDICT only when requested', () => {
    expect(stageSequence('PART', false)).toEqual(['REVEAL', 'INSPECT', 'VOTE', 'RESULT', 'CLOSED']);
    expect(stageSequence('PART', true)).toEqual(['REVEAL', 'PREDICT', 'INSPECT', 'VOTE', 'RESULT', 'CLOSED']);
  });

  it('CHOICE includes INSPECT only for CONTRACT', () => {
    expect(stageSequence('CONTRACT', false)).toEqual(['REVEAL', 'INSPECT', 'VOTE', 'RESULT', 'CLOSED']);
    expect(stageSequence('PILOT', false)).toEqual(['REVEAL', 'VOTE', 'RESULT', 'CLOSED']);
  });

  it('QUICK has no REVEAL or INSPECT', () => {
    expect(stageSequence('TEST', false)).toEqual(['VOTE', 'RESULT', 'CLOSED']);
  });
});

describe('stageDurationMs', () => {
  const settings = { voteTimerS: 20, inspectTimerS: 20, a11ySlowTimers: false };

  it('matches the §7.2 defaults', () => {
    expect(stageDurationMs('REVEAL', 'PART', settings, null)).toBe(3000);
    expect(stageDurationMs('PREDICT', 'PART', settings, null)).toBe(8000);
    expect(stageDurationMs('INSPECT', 'PART', settings, null)).toBe(20000);
    expect(stageDurationMs('VOTE', 'PART', settings, null)).toBe(20000);
    expect(stageDurationMs('RUNOFF', 'PART', settings, null)).toBe(10000);
    expect(stageDurationMs('TIEBREAK_TRIVIA', 'PART', settings, null)).toBe(10000);
    expect(stageDurationMs('TIEBREAK_PICK', 'PART', settings, null)).toBe(5000);
    expect(stageDurationMs('RESULT', 'PART', settings, null)).toBe(3000);
  });

  it('QUICK VOTE is 10s, except ABORT and MCM at 5s; RESULT is 2s', () => {
    expect(stageDurationMs('VOTE', 'TEST', settings, null)).toBe(10000);
    expect(stageDurationMs('VOTE', 'ABORT', settings, null)).toBe(5000);
    expect(stageDurationMs('VOTE', 'MCM', settings, null)).toBe(5000);
    expect(stageDurationMs('RESULT', 'TEST', settings, null)).toBe(2000);
  });

  it('CHOICE INSPECT only runs for CONTRACT', () => {
    expect(stageDurationMs('INSPECT', 'CONTRACT', settings, null)).toBe(20000);
    expect(stageDurationMs('INSPECT', 'PILOT', settings, null)).toBeNull();
  });

  it('REVEAL does not run for QUICK', () => {
    expect(stageDurationMs('REVEAL', 'TEST', settings, null)).toBeNull();
  });

  it('a11y.slowTimers multiplies defaults by 1.5, rounded up to a whole second', () => {
    const slow = { ...settings, a11ySlowTimers: true };
    expect(stageDurationMs('REVEAL', 'PART', slow, null)).toBe(5000); // 3000*1.5=4500 -> ceil to 5000
    expect(stageDurationMs('RESULT', 'TEST', slow, null)).toBe(3000); // 2000*1.5=3000
  });

  it('explicit overrides are used exactly, never scaled by a11y', () => {
    const slow = { ...settings, a11ySlowTimers: true };
    expect(stageDurationMs('VOTE', 'PART', slow, { voteMs: 15000 })).toBe(15000);
  });
});

describe('isWinnable / winnableOptions', () => {
  it('excludes vetoed options', () => {
    const o = opt('A');
    expect(isWinnable(o, new Set(['A']), false)).toBe(false);
  });

  it('excludes willNotFly without a fix, but allows willNotFly with a fix', () => {
    expect(isWinnable(opt('A', { willNotFly: true, fixExists: false }), new Set(), false)).toBe(false);
    expect(isWinnable(opt('A', { willNotFly: true, fixExists: true }), new Set(), false)).toBe(true);
  });

  it('excludes afford NEVER unconditionally', () => {
    expect(isWinnable(opt('A', { afford: 'NEVER' }), new Set(), false)).toBe(false);
  });

  it('EMERGENCY_FUNDING options are winnable only while PM ability is unspent', () => {
    expect(isWinnable(opt('A', { afford: 'EMERGENCY_FUNDING' }), new Set(), false)).toBe(true);
    expect(isWinnable(opt('A', { afford: 'EMERGENCY_FUNDING' }), new Set(), true)).toBe(false);
  });

  it('preserves display order', () => {
    const options = [opt('A', { afford: 'NEVER' }), opt('B'), opt('C')];
    expect(winnableOptions(options, new Set(), false).map((o) => o.id)).toEqual(['B', 'C']);
  });
});

describe('applyVeto', () => {
  const options = [opt('A'), opt('B'), opt('C')];

  it('removes the option when at least two winnable options remain', () => {
    const ballots = new Map<PlayerId, OptionId>([['p1', 'A']]);
    const result = applyVeto(options, new Set(), false, 'A', ballots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vetoedIds.has('A')).toBe(true);
      expect(result.remainingWinnableIds).toEqual(['B', 'C']);
      expect(result.clearedVoterIds).toEqual(['p1']);
    }
  });

  it('rejects when fewer than two winnable options would remain', () => {
    const result = applyVeto(options, new Set(['B']), false, 'A', new Map());
    expect(result).toEqual({ ok: false, code: 'VETO_MIN_OPTIONS' });
  });

  it('rejects an option already vetoed', () => {
    const result = applyVeto(options, new Set(['A']), false, 'A', new Map());
    expect(result).toEqual({ ok: false, code: 'OPTION_VETOED' });
  });
});

describe('applyTag', () => {
  it('sets, replaces and clears a tag for one holder and option', () => {
    let tags = applyTag([], 'p1', 'BOOSTER', 'A', 'RECOMMENDED');
    expect(tags).toEqual([{ optionId: 'A', playerId: 'p1', role: 'BOOSTER', tag: 'RECOMMENDED' }]);
    tags = applyTag(tags, 'p1', 'BOOSTER', 'A', 'CONCERN');
    expect(tags).toEqual([{ optionId: 'A', playerId: 'p1', role: 'BOOSTER', tag: 'CONCERN' }]);
    tags = applyTag(tags, 'p1', 'BOOSTER', 'A', null);
    expect(tags).toEqual([]);
  });

  it('moves the one RECOMMENDED per holder to the new option', () => {
    let tags = applyTag([], 'p1', 'BOOSTER', 'A', 'RECOMMENDED');
    tags = applyTag(tags, 'p1', 'BOOSTER', 'B', 'RECOMMENDED');
    expect(tags).toEqual([{ optionId: 'B', playerId: 'p1', role: 'BOOSTER', tag: 'RECOMMENDED' }]);
  });

  it('allows a CONCERN tag alongside a RECOMMENDED tag on a different option', () => {
    let tags = applyTag([], 'p1', 'BOOSTER', 'A', 'RECOMMENDED');
    tags = applyTag(tags, 'p1', 'BOOSTER', 'B', 'CONCERN');
    expect(tags).toHaveLength(2);
  });

  it('clearTagsForOption drops every tag on the removed option', () => {
    let tags = applyTag([], 'p1', 'BOOSTER', 'A', 'RECOMMENDED');
    tags = applyTag(tags, 'p2', 'STRUCT', 'A', 'CONCERN');
    tags = applyTag(tags, 'p3', 'GUIDO', 'B', 'CONCERN');
    expect(clearTagsForOption(tags, 'A')).toEqual([{ optionId: 'B', playerId: 'p3', role: 'GUIDO', tag: 'CONCERN' }]);
  });
});
