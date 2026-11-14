// Derived views of the state: which screen to show, who I am, what I may do.
import type { OptionId, PlayerInfo, RoleId, VoteOption } from '@protocol';
import { rolesOf } from './reducer';
import type { AppState, Screen, VoteRound } from './types';

export function myPlayer(state: AppState): PlayerInfo | null {
  if (!state.me || !state.room) return null;
  return state.room.players.find((p) => p.id === state.me!.id) ?? null;
}

export function myRoles(state: AppState): RoleId[] {
  return rolesOf(state, state.me?.id);
}

export function rolesSignature(state: AppState): string {
  return state.roles?.locked ? myRoles(state).join('+') : '';
}

export function playerById(state: AppState, id: string | null | undefined): PlayerInfo | null {
  if (!id || !state.room) return null;
  return state.room.players.find((p) => p.id === id) ?? null;
}

export function isPlayer(state: AppState): boolean {
  return state.me?.kind === 'PLAYER';
}

/** The screen the phone shows now. Overlays (codex, settings, role card on demand) sit on top. */
export function currentScreen(state: AppState): Screen {
  if (!state.me) return 'join';
  if (state.mg && !state.mg.dismissed) return 'minigame';
  if (state.vote && state.vote.stage && state.vote.stage.stage !== 'CLOSED') return 'vote';
  if (state.poll) return 'poll';
  const phase = state.phase?.phase ?? 'LOBBY';
  if (isPlayer(state) && state.roles?.locked && myRoles(state).length > 0 && state.roleCardSeen !== rolesSignature(state)) return 'role';
  switch (phase) {
    case 'LOBBY':
      return 'lobby';
    case 'COUNTDOWN':
    case 'FLIGHT':
      return 'console';
    case 'DEBRIEF':
      return 'debrief';
    default:
      return 'build';
  }
}

/** Ballot to display: the optimistic one while the server has not answered yet. */
export function shownBallot(round: VoteRound): OptionId | null {
  return round.pendingBallot ?? round.myBallot;
}

export function isVetoed(round: VoteRound, optionId: OptionId): boolean {
  return round.vetoes.some((v) => v.optionId === optionId);
}

/** Winnable per messages.md 7.3, from what the phone knows. */
export function isWinnable(state: AppState, round: VoteRound, option: VoteOption): boolean {
  if (isVetoed(round, option.id)) return false;
  if (option.willNotFly && !option.fixExists) return false;
  if (option.afford === 'NEVER') return false;
  if (option.afford === 'EMERGENCY_FUNDING' && state.roles?.abilitiesUsed.includes('PM')) return false;
  return true;
}

/** Whether an option can be voted for in the current stage. */
export function isCandidate(round: VoteRound, optionId: OptionId): boolean {
  return !!round.stage && round.stage.candidateIds.includes(optionId);
}

export function amVoter(state: AppState, round: VoteRound): boolean {
  return !!state.me && round.opened.voters.includes(state.me.id);
}

/** May this player veto `optionId` now? (PART rounds, INSPECT and VOTE, one veto per mission.) */
export function canVeto(state: AppState, round: VoteRound, option: VoteOption): boolean {
  if (!round.opened.vetoAllowed || !amVoter(state, round)) return false;
  const stage = round.stage?.stage;
  if (stage !== 'INSPECT' && stage !== 'VOTE') return false;
  if (!myPlayer(state)?.vetoAvailable) return false;
  if (!isWinnable(state, round, option)) return false;
  const winnable = round.opened.options.filter((o) => isWinnable(state, round, o)).length;
  return winnable > 2;
}

/** The first owner role of the round that this player holds, or null. */
export function myOwnerRole(state: AppState, round: VoteRound): RoleId | null {
  const mine = myRoles(state);
  return round.opened.ownerRoles.find((r) => mine.includes(r)) ?? null;
}

export function canTag(state: AppState, round: VoteRound): boolean {
  if (!round.opened.tagsAllowed || !myOwnerRole(state, round)) return false;
  const stage = round.stage?.stage;
  return stage === 'PREDICT' || stage === 'INSPECT' || stage === 'VOTE';
}

export function isPaused(state: AppState): boolean {
  return !!state.paused || !!state.room?.paused;
}
