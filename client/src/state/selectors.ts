// Derived views of the state: which screen to show, who I am, what I may do.
import type { Craft, OptionId, PlayerInfo, RoleId, VoteOption } from '@protocol';
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

export type SeatKind = 'PILOT' | 'BOOSTER' | 'COPILOT';

/** A seat this phone holds as a virtual gamepad (design 9.4). `craft` is null for the co-pilot. */
export interface PilotSeat {
  kind: SeatKind;
  craft: Craft | null;
}

/**
 * The seat this player holds in `pilot.assign` and may drive from the phone: the pilot or the
 * booster pilot when that seat reads its input from PHONE, or the co-pilot (always the phone).
 * A seat whose input is HOST_DEVICE is not a phone seat: the player falls back to the console.
 */
export function mySeat(state: AppState): PilotSeat | null {
  const id = state.me?.kind === 'PLAYER' ? state.me.id : null;
  const a = state.flight.pilot;
  if (!id || !a) return null;
  if (a.pilotId === id && a.pilotInput === 'PHONE') return { kind: 'PILOT', craft: 'VEHICLE' };
  if (a.boosterPilotId === id && a.boosterInput === 'PHONE') return { kind: 'BOOSTER', craft: 'BOOSTER' };
  if (a.copilotId === id) return { kind: 'COPILOT', craft: null };
  return null;
}

export function sameSeat(a: PilotSeat | null, b: PilotSeat | null): boolean {
  return a === b || (!!a && !!b && a.kind === b.kind && a.craft === b.craft);
}

/**
 * The latest `pilot.hud` for this phone, unless a newer `pilot.assign` arrived after it: after a
 * seat handover the previous holder's `canStage`, prompts and warp are not shown as if current.
 */
export function currentHud(state: AppState) {
  return state.pilotHud && state.pilotHudFor === state.flight.pilot ? state.pilotHud : null;
}

/** Seats exist only from COUNTDOWN to FLIGHT (the server answers WRONG_PHASE otherwise). */
export function seatPhaseOpen(state: AppState): boolean {
  const phase = state.phase?.phase;
  return phase === 'COUNTDOWN' || phase === 'FLIGHT';
}

/** May this phone send `pilot.input` for `craft` right now? (seat, phase and pause) */
export function pilotInputOpen(state: AppState, craft: Craft): boolean {
  const seat = mySeat(state);
  return !!seat && seat.craft === craft && seatPhaseOpen(state) && !isPaused(state) && state.conn.phase === 'open';
}

/** May this phone send `pilot.action` / `copilot.action` now? (not while paused) */
export function seatActionOpen(state: AppState): boolean {
  return !!mySeat(state) && seatPhaseOpen(state) && !isPaused(state) && state.conn.phase === 'open';
}

/** The screen the phone shows now. Overlays (codex, settings, role card on demand) sit on top. */
export function currentScreen(state: AppState): Screen {
  if (!state.me) return 'join';
  if (state.mg && !state.mg.dismissed) return 'minigame';
  if (state.vote && state.vote.stage && state.vote.stage.stage !== 'CLOSED') return 'vote';
  if (state.poll) return 'poll';
  const phase = state.phase?.phase ?? 'LOBBY';
  if (isPlayer(state) && state.roles?.locked && myRoles(state).length > 0 && state.roleCardSeen !== rolesSignature(state)) return 'role';
  // Spectators outside the lobby watch the host's view (debrief keeps its own screen).
  if (state.me.kind === 'SPECTATOR' && phase !== 'LOBBY' && phase !== 'DEBRIEF') return 'watch';
  switch (phase) {
    case 'LOBBY':
      return 'lobby';
    case 'COUNTDOWN':
    case 'FLIGHT':
      return mySeat(state) ? 'pilot' : 'console';
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
