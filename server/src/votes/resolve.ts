// Vote resolution — protocol/messages.md §7.6 (design GAME_DESIGN.md §4.2).
import type { OptionId, PlayerId, ResolveMethod, RoleId, SpectatorId } from '../../../protocol/ts/messages.js';
import type { OptionState, TagEntry } from './rules.js';

export function tallyPlayerBallots(
  candidateIds: readonly OptionId[],
  ballots: ReadonlyMap<PlayerId, OptionId>,
  disconnected: ReadonlySet<PlayerId>,
): Map<OptionId, number> {
  const counts = new Map<OptionId, number>(candidateIds.map((id) => [id, 0]));
  for (const [playerId, optionId] of ballots) {
    if (disconnected.has(playerId)) continue;
    if (!counts.has(optionId)) continue;
    counts.set(optionId, counts.get(optionId)! + 1);
  }
  return counts;
}

/**
 * The audience's unique favourite winnable option, weighted as one extra ballot (messages.md §7.4);
 * null when weight is 0, there are no audience ballots on a candidate, or there is an audience tie.
 */
export function computeAudienceBallot(
  candidateIds: readonly OptionId[],
  audienceBallots: ReadonlyMap<SpectatorId, OptionId>,
  weight: 0 | 1,
): OptionId | null {
  if (weight === 0) return null;
  const counts = new Map<OptionId, number>(candidateIds.map((id) => [id, 0]));
  for (const optionId of audienceBallots.values()) {
    if (counts.has(optionId)) counts.set(optionId, counts.get(optionId)! + 1);
  }
  const max = Math.max(0, ...counts.values());
  if (max <= 0) return null;
  const favourites = candidateIds.filter((id) => counts.get(id) === max);
  return favourites.length === 1 ? favourites[0]! : null;
}

export function combinedCounts(playerCounts: ReadonlyMap<OptionId, number>, audienceBallot: OptionId | null): Map<OptionId, number> {
  const counts = new Map(playerCounts);
  if (audienceBallot !== null) counts.set(audienceBallot, (counts.get(audienceBallot) ?? 0) + 1);
  return counts;
}

/** All-abstain = no *player* ballot among connected voters (audience never prevents this rule, §7.4). */
export function isAllAbstain(voters: readonly PlayerId[], ballots: ReadonlyMap<PlayerId, OptionId>, disconnected: ReadonlySet<PlayerId>): boolean {
  return !voters.some((v) => !disconnected.has(v) && ballots.has(v));
}

export type AbstainMethod = 'ABSTAIN_RECOMMENDED' | 'ABSTAIN_DEFAULT' | 'ABSTAIN_CHEAPEST';

/** All-abstain winner (messages.md §7.6 step 1): Recommended tag, then `defaultOptionId`, then cheapest. */
export function resolveAllAbstain(
  ownerRoles: readonly RoleId[],
  roleHolder: (role: RoleId) => PlayerId | null,
  tags: readonly TagEntry[],
  defaultOptionId: OptionId | null,
  winnableInDisplayOrder: readonly OptionState[],
): { method: AbstainMethod; winnerId: OptionId } {
  const winnableIds = new Set(winnableInDisplayOrder.map((o) => o.id));
  for (const role of ownerRoles) {
    const holder = roleHolder(role);
    if (holder === null) continue;
    const rec = tags.find((t) => t.playerId === holder && t.tag === 'RECOMMENDED' && winnableIds.has(t.optionId));
    if (rec) return { method: 'ABSTAIN_RECOMMENDED', winnerId: rec.optionId };
  }
  if (defaultOptionId !== null && winnableIds.has(defaultOptionId)) {
    return { method: 'ABSTAIN_DEFAULT', winnerId: defaultOptionId };
  }
  const first = winnableInDisplayOrder[0];
  if (!first) throw new Error('resolveAllAbstain: no winnable option');
  let cheapest = first;
  for (const o of winnableInDisplayOrder) {
    if (o.costM < cheapest.costM) cheapest = o;
  }
  return { method: 'ABSTAIN_CHEAPEST', winnerId: cheapest.id };
}

/**
 * Runoff condition (messages.md §7.6 step 2, Decision 5): enabled, the leading count is not more
 * than half of all counted ballots, and at least three options received a ballot.
 */
export function shouldRunoff(counts: ReadonlyMap<OptionId, number>, strictMajorityEnabled: boolean): boolean {
  if (!strictMajorityEnabled) return false;
  const values = [...counts.values()];
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return false;
  const max = Math.max(...values);
  const optionsWithBallot = values.filter((v) => v > 0).length;
  return max <= total / 2 && optionsWithBallot >= 3;
}

/** The two options with the highest counts; ties broken by (stable) display order. */
export function pickRunoffCandidates(counts: ReadonlyMap<OptionId, number>, displayOrder: readonly OptionId[]): [OptionId, OptionId] {
  const ranked = [...displayOrder].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const a = ranked[0];
  const b = ranked[1];
  if (a === undefined || b === undefined) throw new Error('pickRunoffCandidates: fewer than two candidates');
  return [a, b];
}

/** Options sharing the highest count, in display order. */
export function findTiedTop(counts: ReadonlyMap<OptionId, number>, displayOrder: readonly OptionId[]): OptionId[] {
  const max = Math.max(...displayOrder.map((id) => counts.get(id) ?? 0));
  return displayOrder.filter((id) => (counts.get(id) ?? 0) === max);
}

export interface TieBreakSyncResult {
  method: 'DECISION_TIME' | 'FLIGHT_TIEBREAK';
  winnerId: OptionId;
}

/** Tie-breakers 0 (Decision Time) and 1 (FLIGHT's vote), both synchronous (messages.md §7.6 step 4). */
export function resolveTieSync(
  tied: readonly OptionId[],
  decisionTimeOptionId: OptionId | null,
  flightHolderId: PlayerId | null,
  ballots: ReadonlyMap<PlayerId, OptionId>,
): TieBreakSyncResult | null {
  if (decisionTimeOptionId !== null && tied.includes(decisionTimeOptionId)) {
    return { method: 'DECISION_TIME', winnerId: decisionTimeOptionId };
  }
  if (flightHolderId !== null) {
    const flightBallot = ballots.get(flightHolderId);
    if (flightBallot !== undefined && tied.includes(flightBallot)) {
      return { method: 'FLIGHT_TIEBREAK', winnerId: flightBallot };
    }
  }
  return null;
}

/** Seeded coin flip (messages.md §7.6 step 4.3): tied options in display order, index `coinSeed mod |T|`. */
export function coinFlip(tied: readonly OptionId[], coinSeed: number): OptionId {
  if (tied.length === 0) throw new Error('coinFlip: no tied options');
  const idx = ((coinSeed % tied.length) + tied.length) % tied.length;
  return tied[idx]!;
}

export type AfterTriviaResult =
  | { method: 'TRIVIA'; winnerId: OptionId; triviaWinnerId: PlayerId }
  | { method: 'COIN_FLIP'; winnerId: OptionId; triviaWinnerId: null };

/**
 * Resolution after the trivia sudden-death stage (messages.md §7.6 step 4.2): the winner's pick,
 * else their own ballot if it is tied, else the coin flip; straight to the coin flip if nobody
 * answered correctly.
 */
export function resolveAfterTrivia(
  tied: readonly OptionId[],
  triviaWinnerId: PlayerId | null,
  triviaPickOptionId: OptionId | null,
  ballots: ReadonlyMap<PlayerId, OptionId>,
  coinSeed: number,
): AfterTriviaResult {
  if (triviaWinnerId !== null) {
    if (triviaPickOptionId !== null && tied.includes(triviaPickOptionId)) {
      return { method: 'TRIVIA', winnerId: triviaPickOptionId, triviaWinnerId };
    }
    const ownBallot = ballots.get(triviaWinnerId);
    if (ownBallot !== undefined && tied.includes(ownBallot)) {
      return { method: 'TRIVIA', winnerId: ownBallot, triviaWinnerId };
    }
  }
  return { method: 'COIN_FLIP', winnerId: coinFlip(tied, coinSeed), triviaWinnerId: null };
}

export function appliesEmergencyFunding(winnerOption: OptionState): boolean {
  return winnerOption.afford === 'EMERGENCY_FUNDING';
}

// ───────────────────────────── Orchestration (VOTE / RUNOFF close) ─────────────────────────────

export interface VoteCloseContext {
  /** Winnable options, in display order. */
  winnableOptions: readonly OptionState[];
  voters: readonly PlayerId[];
  ballots: ReadonlyMap<PlayerId, OptionId>;
  disconnected: ReadonlySet<PlayerId>;
  audienceBallots: ReadonlyMap<SpectatorId, OptionId>;
  audienceVoteWeight: 0 | 1;
  strictMajorityEnabled: boolean;
  ownerRoles: readonly RoleId[];
  roleHolder: (role: RoleId) => PlayerId | null;
  tags: readonly TagEntry[];
  defaultOptionId: OptionId | null;
  decisionTimeOptionId: OptionId | null;
  flightHolderId: PlayerId | null;
}

export type VoteCloseOutcome =
  | { kind: 'ABSTAIN'; method: AbstainMethod; winnerId: OptionId; counts: Map<OptionId, number> }
  | { kind: 'RUNOFF'; candidateIds: [OptionId, OptionId]; firstRoundCounts: Map<OptionId, number> }
  | { kind: 'DECIDED'; method: ResolveMethod; winnerId: OptionId; counts: Map<OptionId, number>; tiedOptionIds: OptionId[] }
  | { kind: 'TIE'; tiedOptionIds: OptionId[]; counts: Map<OptionId, number> };

/** Resolves the close of the (first) VOTE stage. */
export function resolveVoteClose(ctx: VoteCloseContext): VoteCloseOutcome {
  if (isAllAbstain(ctx.voters, ctx.ballots, ctx.disconnected)) {
    const { method, winnerId } = resolveAllAbstain(ctx.ownerRoles, ctx.roleHolder, ctx.tags, ctx.defaultOptionId, ctx.winnableOptions);
    return { kind: 'ABSTAIN', method, winnerId, counts: new Map() };
  }
  const winnableIds = ctx.winnableOptions.map((o) => o.id);
  const playerCounts = tallyPlayerBallots(winnableIds, ctx.ballots, ctx.disconnected);
  const audienceBallot = computeAudienceBallot(winnableIds, ctx.audienceBallots, ctx.audienceVoteWeight);
  const counts = combinedCounts(playerCounts, audienceBallot);

  if (shouldRunoff(counts, ctx.strictMajorityEnabled)) {
    const candidateIds = pickRunoffCandidates(counts, winnableIds);
    return { kind: 'RUNOFF', candidateIds, firstRoundCounts: counts };
  }

  const tied = findTiedTop(counts, winnableIds);
  if (tied.length === 1) {
    return { kind: 'DECIDED', method: 'PLURALITY', winnerId: tied[0]!, counts, tiedOptionIds: [] };
  }
  const sync = resolveTieSync(tied, ctx.decisionTimeOptionId, ctx.flightHolderId, ctx.ballots);
  if (sync) return { kind: 'DECIDED', method: sync.method, winnerId: sync.winnerId, counts, tiedOptionIds: tied };
  return { kind: 'TIE', tiedOptionIds: tied, counts };
}

export interface RunoffCloseContext {
  candidateIds: [OptionId, OptionId];
  ballots: ReadonlyMap<PlayerId, OptionId>;
  disconnected: ReadonlySet<PlayerId>;
  audienceBallots: ReadonlyMap<SpectatorId, OptionId>;
  audienceVoteWeight: 0 | 1;
  firstRoundCounts: ReadonlyMap<OptionId, number>;
  decisionTimeOptionId: OptionId | null;
  flightHolderId: PlayerId | null;
}

export type RunoffCloseOutcome =
  | { kind: 'DECIDED'; method: 'RUNOFF' | 'DECISION_TIME' | 'FLIGHT_TIEBREAK'; winnerId: OptionId; counts: Map<OptionId, number> }
  | { kind: 'TIE'; tiedOptionIds: [OptionId, OptionId]; counts: Map<OptionId, number> };

/**
 * Resolves the close of the RUNOFF stage (messages.md §7.6 step 2): if nobody voted, the
 * higher first-round count wins outright, equal first-round counts fall through to the
 * tie-breakers; otherwise the higher runoff count wins, ties fall through to the tie-breakers.
 */
export function resolveRunoffClose(ctx: RunoffCloseContext): RunoffCloseOutcome {
  const [a, b] = ctx.candidateIds;
  const playerCounts = tallyPlayerBallots(ctx.candidateIds, ctx.ballots, ctx.disconnected);
  const audienceBallot = computeAudienceBallot(ctx.candidateIds, ctx.audienceBallots, ctx.audienceVoteWeight);
  const counts = combinedCounts(playerCounts, audienceBallot);
  const totalRunoffBallots = [...playerCounts.values()].reduce((x, y) => x + y, 0);

  if (totalRunoffBallots === 0) {
    const fa = ctx.firstRoundCounts.get(a) ?? 0;
    const fb = ctx.firstRoundCounts.get(b) ?? 0;
    if (fa > fb) return { kind: 'DECIDED', method: 'RUNOFF', winnerId: a, counts };
    if (fb > fa) return { kind: 'DECIDED', method: 'RUNOFF', winnerId: b, counts };
    return runoffTieBreak([a, b], ctx, counts);
  }

  const ca = counts.get(a) ?? 0;
  const cb = counts.get(b) ?? 0;
  if (ca > cb) return { kind: 'DECIDED', method: 'RUNOFF', winnerId: a, counts };
  if (cb > ca) return { kind: 'DECIDED', method: 'RUNOFF', winnerId: b, counts };
  return runoffTieBreak([a, b], ctx, counts);
}

function runoffTieBreak(tied: [OptionId, OptionId], ctx: RunoffCloseContext, counts: Map<OptionId, number>): RunoffCloseOutcome {
  const sync = resolveTieSync(tied, ctx.decisionTimeOptionId, ctx.flightHolderId, ctx.ballots);
  if (sync) return { kind: 'DECIDED', method: sync.method, winnerId: sync.winnerId, counts };
  return { kind: 'TIE', tiedOptionIds: tied, counts };
}
