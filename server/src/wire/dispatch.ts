// Per-type handlers for the message families that need room business logic beyond the generic
// MESSAGE_META relay (protocol/messages.md §12.3 message index). Everything not listed here is
// either a pre-room handshake type (hello / room.create / room.join / room.resume — handled by the
// connection manager in wire/server.ts before a connection is attached to a Room) or falls through
// to `room.broadcast`, which resolves recipients generically from MESSAGE_META and is correct for
// every "relayed unchanged" / "relayed inside relay" type (build.*, flight.*, pilot.*, console.*,
// mg.*, boost.*, debrief.*, codex.unlock, notice.show, haptic.cue, sync.meter, kp.awarded,
// blackout.set, ping.event, react.event, room.promoted's siblings, etc).
import { MESSAGE_TYPES, type MessageType, type PayloadMap, type PollAnswer, type RoleId } from '../../../protocol/ts/messages.js';
import { wireVoteOrchestration } from '../rooms/orchestrate.js';
import { Room, RoomError } from '../rooms/room.js';
import type { Connection } from './connection.js';

export type Handler = (room: Room, conn: Connection, d: Record<string, unknown>, seq: number | null) => void;

function asPlayerId(conn: Connection): string {
  if (!conn.playerId) throw new RoomError('NOT_ROLE_HOLDER');
  return conn.playerId;
}

export const EXPLICIT_HANDLERS: Partial<Record<MessageType, Handler>> = {
  'room.leave': (room, conn) => {
    if (conn.kind === 'PLAYER' && conn.playerId) room.leavePlayer(conn.playerId);
    if (conn.kind === 'SPECTATOR' && conn.spectatorId) room.leaveSpectator(conn.spectatorId);
    conn.send('bye', { reason: 'LEFT', closeCode: 4009, canResume: false });
    conn.close(4009, 'LEFT');
  },
  'room.kick': (room, conn, d) => {
    const target = (d as unknown as PayloadMap['room.kick']).playerId;
    room.kickPlayer(target);
  },
  'room.close': (room) => {
    room.destroyWith('ROOM_CLOSED');
  },

  'player.profile': (room, conn, d) => {
    const p = d as unknown as PayloadMap['player.profile'];
    room.updateProfile(asPlayerId(conn), p.nickname, p.avatar);
  },
  'player.prefs': (room, conn, d) => {
    const p = d as unknown as PayloadMap['player.prefs'];
    if (conn.kind === 'PLAYER' && conn.playerId) room.updatePlayerPrefs(conn.playerId, p.prefs);
    else if (conn.kind === 'SPECTATOR' && conn.spectatorId) room.updateSpectatorPrefs(conn.spectatorId, p.prefs);
  },

  'settings.set': (room, conn, d) => {
    const p = d as unknown as PayloadMap['settings.set'];
    room.applySettingsPatch(p.settings);
    room.broadcastExplicit('settings.state', { settings: room.settings } as unknown as Record<string, unknown>, conn);
  },

  'roles.pick': (room, conn, d) => {
    const p = d as unknown as PayloadMap['roles.pick'];
    room.setRolePick(asPlayerId(conn), p.lead);
    room.broadcastExplicit('roles.state', room.buildRolesState() as unknown as Record<string, unknown>, conn);
  },
  'roles.vote': (room, conn, d) => {
    const p = d as unknown as PayloadMap['roles.vote'];
    room.setRoleVote(asPlayerId(conn), p.playerId);
    room.broadcastExplicit('roles.state', room.buildRolesState() as unknown as Record<string, unknown>, conn);
  },
  'roles.lock': (room, conn) => {
    room.lockRoles();
    room.broadcastExplicit('roles.state', room.buildRolesState() as unknown as Record<string, unknown>, conn);
  },
  'roles.set': (room, conn, d) => {
    const p = d as unknown as PayloadMap['roles.set'];
    room.setRolesExplicit(p.assignments);
    room.broadcastExplicit('roles.state', room.buildRolesState() as unknown as Record<string, unknown>, conn);
  },
  'roles.rotate': (room, conn) => {
    room.rotateRoles();
    room.broadcastExplicit('roles.state', room.buildRolesState() as unknown as Record<string, unknown>, conn);
  },

  'ability.use': (room, conn, d, seq) => {
    const p = d as unknown as PayloadMap['ability.use'];
    const playerId = asPlayerId(conn);
    if (room.roleHolderId(p.role) !== playerId) throw new RoomError('NOT_ROLE_HOLDER');
    if (p.role === 'FLIGHT') {
      room.useFlightDecisionTime(p.roundId, p.optionId);
      if (room.round) room.onStageEndHook?.(room.round.stage, 'DECISION_TIME');
      room.announceAbilityUsed('FLIGHT', 'PLAYER', p.roundId ?? null, null, playerId);
      return;
    }
    if (p.role === 'STRUCT' && p.stageIndex === undefined) throw new RoomError('BAD_PAYLOAD', null, 'ability.use', { field: 'stageIndex' });
    const requestId = room.requestAbility(playerId, p.role, p.stageIndex ?? null, seq);
    room.broadcastExplicit(
      'ability.requested',
      { requestId, playerId, role: p.role, stageIndex: p.stageIndex ?? null } as unknown as Record<string, unknown>,
      conn,
    );
  },
  'ability.resolve': (room, conn, d) => {
    const p = d as unknown as PayloadMap['ability.resolve'];
    const req = room.resolveAbilityRequest(p.requestId, p.accepted);
    if (p.accepted) room.announceAbilityUsed(req.role, 'PLAYER', null, req.stageIndex, req.playerId);
  },
  'ability.consume': (room, conn, d) => {
    const p = d as unknown as PayloadMap['ability.consume'];
    room.consumeAbility(p.role);
    room.announceAbilityUsed(p.role, 'HOST', null, null);
  },

  'phase.set': (room, conn, d) => {
    const p = d as unknown as PayloadMap['phase.set'];
    const prev = room.phase?.phase ?? 'LOBBY';
    const phaseChanged = prev !== p.phase;
    if (p.missionSeq > room.missionSeq) room.newMissionReset();
    if (prev === 'DEBRIEF' && p.phase !== 'DEBRIEF') room.clearSticky('debrief');
    room.phase = p;
    // Roles lock automatically when the phase leaves LOBBY and unlock when it returns (§5.2).
    let rolesChanged = false;
    if (prev === 'LOBBY' && p.phase !== 'LOBBY' && !room.roleLocked && room.playerCount > 0) {
      room.lockRolesNow();
      rolesChanged = true;
    } else if (prev !== 'LOBBY' && p.phase === 'LOBBY' && room.roleLocked) {
      room.unlockRoles();
      rolesChanged = true;
    }
    room.broadcast(conn, 'phase.set', d);
    if (rolesChanged) room.broadcastExplicit('roles.state', room.buildRolesState() as unknown as Record<string, unknown>, conn);
    // Only a change of `phase` ends an open round or poll; a sub-phase update does not (§6).
    if (phaseChanged) {
      if (room.round) {
        const cancelled = room.cancelRound('PHASE_CHANGE');
        if (cancelled) room.broadcastExplicit('vote.cancelled', cancelled as unknown as Record<string, unknown>, conn);
      }
      room.cancelPoll();
    }
  },

  'game.pause': (room, conn) => {
    const payload = room.hostPause();
    if (payload) room.broadcastExplicit('game.paused', payload as unknown as Record<string, unknown>, conn);
  },
  'game.resume': (room, conn) => {
    const payload = room.hostResume();
    if (payload) room.broadcastExplicit('game.resumed', payload as unknown as Record<string, unknown>, conn);
  },

  'vote.open': (room, conn, d) => {
    const opened = room.openVote(d as unknown as PayloadMap['vote.open']);
    room.broadcastExplicit('vote.opened', opened as unknown as Record<string, unknown>, conn);
    const first = opened.plan[0];
    if (first) {
      const stagePayload = room.armStage(first.stage);
      room.broadcastExplicit('vote.stage', stagePayload as unknown as Record<string, unknown>, conn);
    }
  },
  'vote.cast': (room, conn, d) => {
    const p = d as unknown as PayloadMap['vote.cast'];
    room.assertActiveRound(p.roundId);
    const voterId = conn.kind === 'SPECTATOR' ? conn.spectatorId! : asPlayerId(conn);
    room.castBallot(voterId, p.optionId, conn.kind === 'SPECTATOR');
    conn.send('vote.ack', { roundId: p.roundId, optionId: p.optionId, reason: 'CAST' });
  },
  'vote.veto': (room, conn, d) => {
    const p = d as unknown as PayloadMap['vote.veto'];
    room.assertActiveRound(p.roundId);
    const playerId = asPlayerId(conn);
    const clearedVoterIds = room.applyVetoToRound(playerId, p.optionId);
    room.broadcastExplicit('room.state', room.buildRoomState() as unknown as Record<string, unknown>, conn);
    if (room.round) {
      room.broadcastExplicit(
        'vote.vetoed',
        {
          roundId: room.round.roundId,
          optionId: p.optionId,
          playerId,
          clearedVoterIds,
          remainingOptionIds: room.round.options.filter((o) => !room.round!.vetoedIds.has(o.id)).map((o) => o.id),
        } as unknown as Record<string, unknown>,
        conn,
      );
      room.broadcastExplicit('vote.tags', { roundId: room.round.roundId, tags: room.round.tags } as unknown as Record<string, unknown>, conn);
    }
  },
  'vote.tag': (room, conn, d) => {
    const p = d as unknown as PayloadMap['vote.tag'];
    room.assertActiveRound(p.roundId);
    room.tagOption(asPlayerId(conn), p.optionId, p.tag);
    if (room.round) room.broadcastExplicit('vote.tags', { roundId: room.round.roundId, tags: room.round.tags } as unknown as Record<string, unknown>, conn);
  },
  'vote.predict': (room, conn, d) => {
    const p = d as unknown as PayloadMap['vote.predict'];
    room.assertActiveRound(p.roundId);
    const voterId = conn.kind === 'SPECTATOR' ? conn.spectatorId! : asPlayerId(conn);
    const allAnswered = room.recordPredictAnswer(voterId, p.choiceIndex, conn.kind === 'SPECTATOR');
    if (allAnswered && room.round) room.onStageEndHook?.(room.round.stage, 'EARLY');
  },
  'vote.trivia.answer': (room, conn, d) => {
    const p = d as unknown as PayloadMap['vote.trivia.answer'];
    room.assertActiveRound(p.roundId);
    const playerId = asPlayerId(conn);
    const endsNow = room.recordTriviaAnswer(playerId, p.choiceIndex);
    if (endsNow && room.round) room.onStageEndHook?.(room.round.stage, 'EARLY');
  },
  'vote.trivia.pick': (room, conn, d) => {
    const p = d as unknown as PayloadMap['vote.trivia.pick'];
    room.assertActiveRound(p.roundId);
    room.assertCanPick(asPlayerId(conn), p.optionId);
    const result = room.resolveAfterTriviaStage(p.optionId);
    room.broadcastExplicit('vote.result', result as unknown as Record<string, unknown>, conn);
    room.flushAbilityAnnouncements();
    const stagePayload = room.armStage('RESULT');
    room.broadcastExplicit('vote.stage', stagePayload as unknown as Record<string, unknown>, conn);
  },
  'vote.close': (room, conn, d) => {
    room.assertActiveRound((d as unknown as PayloadMap['vote.close']).roundId);
    if (room.round) room.onStageEndHook?.(room.round.stage, 'HOST');
  },
  'vote.cancel': (room, conn, d) => {
    room.assertActiveRound((d as unknown as PayloadMap['vote.cancel']).roundId);
    const cancelled = room.cancelRound();
    if (cancelled) room.broadcastExplicit('vote.cancelled', cancelled as unknown as Record<string, unknown>, conn);
  },

  'poll.open': (room, conn, d) => {
    room.openPoll(d as unknown as PayloadMap['poll.open']);
    const call = room.currentPollCall();
    if (call) room.broadcastExplicit('poll.call', call as unknown as Record<string, unknown>, conn);
    else finishAndBroadcastPoll(room, conn);
  },
  'poll.answer': (room, conn, d) => {
    const p = d as unknown as PayloadMap['poll.answer'];
    if (!room.poll || room.poll.pollId !== p.pollId) throw new RoomError('STALE_ID');
    const answered = room.answerPoll(asPlayerId(conn), p.answer as PollAnswer);
    if (answered) room.broadcastExplicit('poll.answered', answered as unknown as Record<string, unknown>, conn);
    if (room.isPollDone()) finishAndBroadcastPoll(room, conn);
    else {
      const call = room.currentPollCall();
      if (call) room.broadcastExplicit('poll.call', call as unknown as Record<string, unknown>, conn);
    }
  },

  'ping.send': (room, conn, d) => {
    const p = d as unknown as PayloadMap['ping.send'];
    room.broadcast(conn, 'ping.event', { playerId: conn.playerId, pingId: p.pingId, roundId: room.round?.roundId ?? null, optionId: p.optionId });
  },
  'react.send': (room, conn, d) => {
    const p = d as unknown as PayloadMap['react.send'];
    if (conn.kind === 'PLAYER') room.broadcast(conn, 'react.event', { playerId: conn.playerId, emoji: p.emoji });
    else if (conn.kind === 'SPECTATOR') room.recordAudienceReaction(p.emoji);
  },
};

function finishAndBroadcastPoll(room: Room, conn: Connection): void {
  const result = room.finishPoll();
  room.broadcastExplicit('poll.result', result as unknown as Record<string, unknown>, conn);
}

export function dispatch(room: Room, conn: Connection, t: MessageType, d: Record<string, unknown>, seq: number | null = null): void {
  const handler = EXPLICIT_HANDLERS[t];
  if (handler) {
    handler(room, conn, d, seq);
    return;
  }
  room.broadcast(conn, t, d);
}

/** Pre-room handshake types: handled by the connection manager (wire/server.ts) before a
 *  connection is attached to a Room, so they never reach `dispatch()`. */
export const PRE_ROOM_TYPES: readonly MessageType[] = ['hello', 'clock.ping', 'room.create', 'room.join', 'room.resume'];

/**
 * Categorises every protocol message type for the T004 acceptance check "every message … is
 * either handled or listed as host-only": each type is either a pre-room handshake type, has an
 * explicit handler here, or is correctly delivered by the generic MESSAGE_META-driven relay
 * (`room.broadcast`) — which is itself the "host-only, no server business logic" path for every
 * `RELAY_H2C` / `RELAY_C2H` type (build.*, flight.*, pilot.*, console.*, mg.*, boost.*, debrief.*,
 * codex.unlock, notice.show, haptic.cue, sync.meter, kp.awarded, blackout.set, pilot.assign, …).
 */
export function categorize(t: MessageType): 'pre-room' | 'explicit' | 'generic-relay' {
  if (PRE_ROOM_TYPES.includes(t)) return 'pre-room';
  if (EXPLICIT_HANDLERS[t]) return 'explicit';
  return 'generic-relay';
}

export function allMessageTypes(): readonly MessageType[] {
  return MESSAGE_TYPES;
}

export function attachOrchestration(room: Room): void {
  wireVoteOrchestration(room);
}
