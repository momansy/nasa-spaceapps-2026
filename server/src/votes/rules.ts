// Vote profiles, stage durations, winnability, vetoes and tags — protocol/messages.md §7.1-§7.5.
import type { Afford, OptionId, PlayerId, RoleId, TagKind, VoteKind, VoteStage, VoteTimers } from '../../../protocol/ts/messages.js';

export type VoteProfile = 'FULL' | 'CHOICE' | 'QUICK';

const KIND_PROFILE: Readonly<Record<VoteKind, VoteProfile>> = {
  PART: 'FULL',
  CONTRACT: 'CHOICE',
  REWORK_CATEGORY: 'CHOICE',
  LIVERY: 'CHOICE',
  PATCH: 'CHOICE',
  PILOT: 'CHOICE',
  TEST: 'QUICK',
  ANOMALY: 'QUICK',
  REVIEW: 'QUICK',
  ABORT: 'QUICK',
  FLIGHT_DECISION: 'QUICK',
  MCM: 'QUICK',
};

export function profileForKind(kind: VoteKind): VoteProfile {
  return KIND_PROFILE[kind];
}

/** PART rounds allow vetoes and role tags; CHOICE and QUICK rounds do not (messages.md §7.1). */
export function vetoAllowed(kind: VoteKind): boolean {
  return profileForKind(kind) === 'FULL';
}

export function tagsAllowed(kind: VoteKind): boolean {
  return profileForKind(kind) === 'FULL';
}

/** A runoff is only possible for FULL and CHOICE profiles (never QUICK), and only when enabled. */
export function runoffPossible(kind: VoteKind, strictMajorityEnabled: boolean): boolean {
  return strictMajorityEnabled && profileForKind(kind) !== 'QUICK';
}

/**
 * Early close: CHOICE and QUICK VOTE/RUNOFF stages end as soon as every connected voter has a
 * ballot (and at least one exists). PART (FULL) rounds always run the full timer unless Decision
 * Time or a host `vote.close` ends them early (messages.md §7.1, Decision 10).
 */
export function earlyCloseEligible(kind: VoteKind): boolean {
  return profileForKind(kind) !== 'FULL';
}

/** Stages that run, in order, for a profile/kind (unconditional ones only; §7.1). */
export function stageSequence(kind: VoteKind, hasPredict: boolean): VoteStage[] {
  const profile = profileForKind(kind);
  if (profile === 'FULL') {
    const seq: VoteStage[] = ['REVEAL'];
    if (hasPredict) seq.push('PREDICT');
    seq.push('INSPECT', 'VOTE', 'RESULT', 'CLOSED');
    return seq;
  }
  if (profile === 'CHOICE') {
    const seq: VoteStage[] = ['REVEAL'];
    if (kind === 'CONTRACT') seq.push('INSPECT');
    seq.push('VOTE', 'RESULT', 'CLOSED');
    return seq;
  }
  return ['VOTE', 'RESULT', 'CLOSED'];
}

const DEFAULT_MS: Record<string, number> = {
  REVEAL: 3000,
  PREDICT: 8000,
  RUNOFF: 10000,
  TIEBREAK_TRIVIA: 10000,
  TIEBREAK_PICK: 5000,
};

const OVERRIDE_FIELD: Partial<Record<VoteStage, keyof VoteTimers>> = {
  REVEAL: 'revealMs',
  PREDICT: 'predictMs',
  INSPECT: 'inspectMs',
  VOTE: 'voteMs',
  RUNOFF: 'runoffMs',
  TIEBREAK_TRIVIA: 'triviaMs',
  TIEBREAK_PICK: 'pickMs',
  RESULT: 'resultMs',
};

export interface DurationSettings {
  voteTimerS: number;
  inspectTimerS: number;
  a11ySlowTimers: boolean;
}

/** Default stage duration in ms before any override or a11y scaling, or null if the stage does not run. */
function baseDurationMs(stage: VoteStage, kind: VoteKind, settings: DurationSettings): number | null {
  const profile = profileForKind(kind);
  switch (stage) {
    case 'REVEAL':
      return profile === 'QUICK' ? null : DEFAULT_MS.REVEAL!;
    case 'PREDICT':
      return profile === 'FULL' ? DEFAULT_MS.PREDICT! : null;
    case 'INSPECT':
      if (profile === 'FULL') return settings.inspectTimerS * 1000;
      if (profile === 'CHOICE') return kind === 'CONTRACT' ? settings.inspectTimerS * 1000 : null;
      return null;
    case 'VOTE':
      if (profile === 'QUICK') return kind === 'ABORT' || kind === 'MCM' ? 5000 : 10000;
      return settings.voteTimerS * 1000;
    case 'RUNOFF':
      return profile === 'QUICK' ? null : DEFAULT_MS.RUNOFF!;
    case 'TIEBREAK_TRIVIA':
      return DEFAULT_MS.TIEBREAK_TRIVIA!;
    case 'TIEBREAK_PICK':
      return DEFAULT_MS.TIEBREAK_PICK!;
    case 'RESULT':
      return profile === 'QUICK' ? 2000 : 3000;
    case 'CLOSED':
      return null;
    default:
      return null;
  }
}

/** Scales a default duration by the a11y slow-timers factor (×1.5, rounded up to a whole second). */
function scaleSlow(ms: number): number {
  return Math.ceil((ms * 1.5) / 1000) * 1000;
}

/**
 * Resolves the actual duration of a stage: an explicit `vote.open.timers` override is used exactly
 * (never scaled); otherwise the profile/kind default is used, scaled by a11y.slowTimers when set.
 * Returns null when the stage does not run at all for this kind/profile.
 */
export function stageDurationMs(stage: VoteStage, kind: VoteKind, settings: DurationSettings, overrides: VoteTimers | null): number | null {
  const field = OVERRIDE_FIELD[stage];
  if (field && overrides && overrides[field] !== undefined) {
    return overrides[field] as number;
  }
  const base = baseDurationMs(stage, kind, settings);
  if (base === null) return null;
  return settings.a11ySlowTimers ? scaleSlow(base) : base;
}

// ───────────────────────────── Winnable options (§7.3) ─────────────────────────────

export interface OptionState {
  id: OptionId;
  costM: number;
  afford: Afford;
  willNotFly: boolean;
  fixExists: boolean;
}

export function isWinnable(option: OptionState, vetoedIds: ReadonlySet<OptionId>, pmAbilitySpent: boolean): boolean {
  if (vetoedIds.has(option.id)) return false;
  if (option.willNotFly && !option.fixExists) return false;
  if (option.afford === 'NEVER') return false;
  if (option.afford === 'EMERGENCY_FUNDING' && pmAbilitySpent) return false;
  return true;
}

/** Winnable options, preserving the input (display) order. */
export function winnableOptions(options: readonly OptionState[], vetoedIds: ReadonlySet<OptionId>, pmAbilitySpent: boolean): OptionState[] {
  return options.filter((o) => isWinnable(o, vetoedIds, pmAbilitySpent));
}

// ───────────────────────────── Vetoes (§7.5) ─────────────────────────────

export type VetoOutcome =
  | { ok: true; vetoedIds: Set<OptionId>; clearedVoterIds: PlayerId[]; remainingWinnableIds: OptionId[] }
  | { ok: false; code: 'OPTION_VETOED' | 'VETO_MIN_OPTIONS' };

/**
 * Applies a veto (messages.md §7.5): the option is removed once at most, and at least two winnable
 * options must remain afterwards. Does not check the per-player one-veto-per-mission rule or stage
 * eligibility — those are the caller's responsibility (room/player state, not round state).
 */
export function applyVeto(
  options: readonly OptionState[],
  alreadyVetoed: ReadonlySet<OptionId>,
  pmAbilitySpent: boolean,
  targetId: OptionId,
  ballots: ReadonlyMap<PlayerId, OptionId>,
): VetoOutcome {
  if (alreadyVetoed.has(targetId)) return { ok: false, code: 'OPTION_VETOED' };
  const nextVetoed = new Set(alreadyVetoed);
  nextVetoed.add(targetId);
  const remaining = winnableOptions(options, nextVetoed, pmAbilitySpent);
  if (remaining.length < 2) return { ok: false, code: 'VETO_MIN_OPTIONS' };
  const clearedVoterIds: PlayerId[] = [];
  for (const [playerId, optionId] of ballots) {
    if (optionId === targetId) clearedVoterIds.push(playerId);
  }
  return { ok: true, vetoedIds: nextVetoed, clearedVoterIds, remainingWinnableIds: remaining.map((o) => o.id) };
}

// ───────────────────────────── Tags (§7.5) ─────────────────────────────

export interface TagEntry {
  optionId: OptionId;
  playerId: PlayerId;
  role: RoleId;
  tag: TagKind;
}

/**
 * Applies a tag change: one tag per holder and option; one RECOMMENDED per holder per round (setting
 * a new RECOMMENDED moves it away from any other option the same holder had recommended).
 */
export function applyTag(existing: readonly TagEntry[], playerId: PlayerId, role: RoleId, optionId: OptionId, tag: TagKind | null): TagEntry[] {
  let next = existing.filter((t) => !(t.playerId === playerId && t.optionId === optionId));
  if (tag === null) return next;
  if (tag === 'RECOMMENDED') {
    next = next.filter((t) => !(t.playerId === playerId && t.tag === 'RECOMMENDED'));
  }
  next.push({ optionId, playerId, role, tag });
  return next;
}

/** Tags remaining after an option is removed (veto): every tag on that option is dropped. */
export function clearTagsForOption(existing: readonly TagEntry[], optionId: OptionId): TagEntry[] {
  return existing.filter((t) => t.optionId !== optionId);
}
