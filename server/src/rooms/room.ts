// The Room aggregate: membership, roles, votes, polls, timers, relay — protocol/messages.md.
// Ties together server/src/{roles,votes,timers,limits}/* and the generic MESSAGE_META router.
import {
  ROLE_IDS,
  type Avatar,
  type DataId,
  type ErrorCode,
  type MessageType,
  type OptionId,
  type OutcomeSeq,
  type PayloadMap,
  type PlayerId,
  type PlayerInfo,
  type PlayerPrefs,
  type PollAnswer,
  type PollEntry,
  type QuestionPublic,
  type ResolveMethod,
  type ReactionId,
  type RoleAssignMode,
  type RoleId,
  type RoomSettings,
  type SettingsPatch,
  type SpectatorId,
  type Token,
  type VoteKind,
  type VoteOption,
  type VoteStage,
  type VoteTimers,
  MESSAGE_META,
} from '../../../protocol/ts/messages.js';
import { checkNickname, generateToken, makeIdAllocator } from './identity.js';
import { buildJoinUrl, buildSpectateUrl } from './roomCode.js';
import { groupsForCount, lockAssignment, onArrive, onLeave, onRotate, toRoleGroups, type Assignment } from '../roles/roles.js';
import {
  applyTag,
  applyVeto,
  clearTagsForOption,
  earlyCloseEligible,
  profileForKind,
  runoffPossible,
  stageDurationMs,
  stageSequence,
  tagsAllowed,
  vetoAllowed,
  winnableOptions,
  type OptionState,
  type TagEntry,
} from '../votes/rules.js';
import {
  appliesEmergencyFunding,
  coinFlip,
  computeAudienceBallot,
  resolveAfterTrivia,
  resolveRunoffClose,
  resolveVoteClose,
  resolveTieSync,
  type VoteCloseContext,
} from '../votes/resolve.js';
import { systemClock, type Clock } from '../timers/clock.js';
import { freezeHold, holdExpiresAtMs, isHoldExpired, startHold, unfreezeHold, type SlotHold } from '../timers/reconnect.js';
import { isRoomExpired as computePauseExpired, notPaused, pause as pauseState, resume as resumeState, type PauseState } from '../timers/pause.js';
import type { Connection } from '../wire/connection.js';
import { recipientsFor, type RoutingContext } from '../wire/routing.js';

export type { Clock };

const DEFAULT_SETTINGS: RoomSettings = {
  roleAssignMode: 'RANDOM',
  voteTimerS: 20,
  inspectTimerS: 20,
  tallyVisibility: 'OPEN',
  strictMajority: false,
  assistLevel: 'ENGINEER',
  audienceVoteWeight: 0,
  pilotRotation: 'PER_SEGMENT',
  pilotSelect: 'ROTATION',
  passTheControls: false,
  lang: 'en',
  a11y: { slowTimers: false, relaxedMinigames: false, reducedMotion: false, highContrast: false, subtitles: true, explainTooltips: false },
};

const DEFAULT_PREFS: PlayerPrefs = {
  lang: 'en',
  relaxed: false,
  oneButton: false,
  holdToToggle: false,
  reducedMotion: false,
  highContrast: false,
  textScalePct: 100,
  screenReader: false,
  haptics: true,
};

function err(code: ErrorCode, re: number | null = null, reT: string | null = null, extra: Partial<Record<string, unknown>> = {}): never {
  throw new RoomError(code, re, reT, extra);
}

/** Host must answer `ability.resolve` within 5 s, else the request counts as declined (messages.md ability.use). */
export const ABILITY_ANSWER_TIMEOUT_MS = 5000;
/** Minimum gap between `vote.tally` messages (messages.md). */
export const TALLY_MIN_GAP_MS = 200;

export type StageEndReason = 'TIMER' | 'EARLY' | 'HOST' | 'DECISION_TIME';

export class RoomError extends Error {
  constructor(
    public code: ErrorCode,
    public re: number | null = null,
    public reT: string | null = null,
    public extra: Partial<{ retryAfterMs: number; field: string; suggestion: string }> = {},
  ) {
    super(code);
  }
}

interface PlayerRecord {
  id: PlayerId;
  slot: number;
  nickname: string;
  avatar: Avatar;
  prefs: PlayerPrefs;
  token: Token;
  conn: Connection | null;
  hold: SlotHold | null;
  vetoAvailable: boolean;
}

interface SpectatorRecord {
  id: SpectatorId;
  prefs: PlayerPrefs;
  token: Token;
  conn: Connection | null;
  pendingPlayer: boolean;
  /** Profile the pending player submitted with room.join; null for plain spectators. */
  pendingProfile: { nickname: string; avatar: Avatar } | null;
  hold: SlotHold | null;
}

interface VoteRoundState {
  roundId: string;
  kind: VoteKind;
  subjectId: DataId | null;
  title: PayloadMap['vote.open']['title'];
  why: PayloadMap['vote.open']['why'];
  ownerRoles: RoleId[];
  options: VoteOption[];
  defaultOptionId: OptionId | null;
  hint: PayloadMap['vote.open']['hint'];
  predict: PayloadMap['vote.open']['predict'];
  trivia: PayloadMap['vote.open']['trivia'];
  coinSeed: number;
  timers: VoteTimers | null;
  voters: PlayerId[];
  solo: boolean;
  vetoedIds: Set<OptionId>;
  tags: TagEntry[];
  vetoes: Array<{ optionId: OptionId; playerId: PlayerId }>;
  ballots: Map<PlayerId, OptionId>;
  audienceBallots: Map<SpectatorId, OptionId>;
  predictAnswers: Map<PlayerId, number>;
  predictAudienceCounts: number[];
  predictAudienceAnswered: Set<SpectatorId>;
  stage: VoteStage;
  stageEndsAtMs: number | null;
  stageTimer: (() => void) | null;
  runoffCandidates: [OptionId, OptionId] | null;
  firstRoundCounts: Map<OptionId, number> | null;
  tiedOptionIds: OptionId[];
  tieCounts: Map<OptionId, number> | null;
  decisionTimeOptionId: OptionId | null;
  triviaWinnerId: PlayerId | null;
  triviaAnswers: Array<{ playerId: PlayerId; choiceIndex: number; correct: boolean }>;
  closedBy: PayloadMap['vote.result']['closedBy'] | null;
  /** Tally / audience / runoff settings frozen at vote.open (a later settings.set does not change an open round). */
  frozen: { strictMajority: boolean; audienceVoteWeight: 0 | 1; tallyVisibility: 'OPEN' | 'HIDDEN' };
  /** The `vote.opened` payload, kept for snapshots. */
  opened: PayloadMap['vote.opened'] | null;
}

interface PollState {
  pollId: string;
  context: PayloadMap['poll.open']['context'];
  round: number;
  order: RoleId[];
  perCallMs: number;
  calls: Array<{ playerId: PlayerId; roles: RoleId[] }>;
  disconnectedEntries: PollEntry[];
  callIdx: number;
  entries: PollEntry[];
  callTimer: (() => void) | null;
  currentEndsAtMs: number | null;
}

export interface RoomOptions {
  code: string;
  clientBaseUrl: string;
  clock?: Clock;
  rng?: () => number;
}

/** Tiny deadline-moved-forward helper: shifts an outstanding `…AtMs` value by `pausedForMs`. */
function shift(ms: number | null, by: number): number | null {
  return ms === null ? null : ms + by;
}

export class Room {
  readonly code: string;
  private readonly clientBaseUrl: string;
  private readonly clock: Clock;
  private readonly rng: () => number;

  private hostConn: Connection | null = null;
  private hostToken: Token | null = null;

  private players = new Map<PlayerId, PlayerRecord>();
  private spectators = new Map<SpectatorId, SpectatorRecord>();
  private nextPlayerId = makeIdAllocator('p');
  private nextSpectatorId = makeIdAllocator('s');

  settings: RoomSettings = { ...DEFAULT_SETTINGS, a11y: { ...DEFAULT_SETTINGS.a11y } };

  /** Assignment mode always follows `settings.roleAssignMode` (changed only in LOBBY). */
  get roleMode(): RoleAssignMode {
    return this.settings.roleAssignMode as RoleAssignMode;
  }
  roleLocked = false;
  assignment: Assignment = new Map();
  rolePicks = new Map<PlayerId, RoleId>();
  roleVotes = new Map<PlayerId, PlayerId>();
  abilitiesUsed = new Set<RoleId>();

  pauseState: PauseState = notPaused();
  phase: PayloadMap['phase.set'] | null = null;
  missionSeq = 0;

  private outcomeSeq = 0;
  outcomeLog: Array<{ outcomeSeq: OutcomeSeq; t: MessageType; d: unknown }> = [];

  private sticky = new Map<string, { t: MessageType; d: unknown }>();
  private activeMg: { runId: string; audience: boolean } | null = null;

  round: VoteRoundState | null = null;
  poll: PollState | null = null;

  private abilityRequests = new Map<string, { playerId: PlayerId; role: RoleId; stageIndex: number | null; seq: number | null; timer: ReturnType<typeof setTimeout> }>();
  private nextRequestId = makeIdAllocator('p'); // reuse monotonic allocator shape; prefix irrelevant to the protocol pattern for RequestId

  constructor(opts: RoomOptions) {
    this.code = opts.code;
    this.clientBaseUrl = opts.clientBaseUrl;
    this.clock = opts.clock ?? systemClock;
    this.rng = opts.rng ?? Math.random;
  }

  // ───────────────────────────── connection bookkeeping ─────────────────────────────

  private allPlayerConns(): Connection[] {
    return [...this.players.values()].map((p) => p.conn).filter((c): c is Connection => c !== null);
  }

  private allSpectatorConns(): Connection[] {
    return [...this.spectators.values()].map((s) => s.conn).filter((c): c is Connection => c !== null);
  }

  private connectedPlayerIds(): Set<PlayerId> {
    return new Set([...this.players.values()].filter((p) => p.conn !== null).map((p) => p.id));
  }

  private disconnectedPlayerIds(): Set<PlayerId> {
    return new Set([...this.players.values()].filter((p) => p.conn === null).map((p) => p.id));
  }

  private roleHolderConn(role: RoleId): Connection | null {
    for (const [playerId, roles] of this.assignment) {
      if (roles.includes(role)) {
        return this.players.get(playerId)?.conn ?? null;
      }
    }
    return null;
  }

  roleHolderId(role: RoleId): PlayerId | null {
    for (const [playerId, roles] of this.assignment) {
      if (roles.includes(role)) return playerId;
    }
    return null;
  }

  private routingCtx(): RoutingContext {
    return {
      host: this.hostConn,
      players: () => this.allPlayerConns(),
      spectators: () => this.allSpectatorConns(),
      playerById: (id) => this.players.get(id)?.conn ?? null,
      roleHolderConn: (role) => this.roleHolderConn(role),
      mgAudienceActive: () => this.activeMg?.audience ?? false,
    };
  }

  private sendTo(conns: Connection[], t: MessageType, d: unknown): void {
    for (const c of conns) c.send(t as never, d as never);
  }

  private blackout = false;
  private streamLastAtMs = new Map<string, number>();

  /**
   * Host stream limits (messages.md §11): console.telemetry ≤ 10 Hz per role, flight.hud ≤ 5 Hz,
   * pilot.hud ≤ 10 Hz, mg.state ≤ 10 Hz; the excess is dropped silently (droppable types). During a
   * communications blackout console.telemetry, flight.hud and pilot.hud are discarded.
   */
  private admitStream(t: MessageType, d: Record<string, unknown>): boolean {
    if (t === 'blackout.set') this.blackout = d.active === true;
    if (this.blackout && (t === 'console.telemetry' || t === 'flight.hud' || t === 'pilot.hud')) return false;
    const minGapMs = t === 'console.telemetry' || t === 'pilot.hud' || t === 'mg.state' ? 100 : t === 'flight.hud' ? 200 : 0;
    if (minGapMs === 0) return true;
    const key = t === 'console.telemetry' && typeof d.role === 'string' ? `${t}:${d.role}` : t;
    const now = this.clock.nowMs();
    const last = this.streamLastAtMs.get(key);
    if (last !== undefined && now - last < minGapMs) return false;
    this.streamLastAtMs.set(key, now);
    return true;
  }

  /** Generic broadcast: resolves recipients from MESSAGE_META, caches stickies, appends outcomes. */
  broadcast(sender: Connection, t: MessageType, d: Record<string, unknown>): void {
    if (MESSAGE_META[t].dir === 'RELAY_C2H' && sender.kind === 'PLAYER') {
      this.relayToHost(sender, t, d);
      return;
    }
    this.broadcastExplicit(t, d, sender);
  }

  /**
   * Player messages for the host travel inside a `relay` wrapper that adds the sender (messages.md
   * `relay`). With the host away the inner message is refused with PAUSED and not queued.
   */
  private relayToHost(sender: Connection, t: MessageType, d: Record<string, unknown>): void {
    if (!this.hostConn) err('PAUSED');
    this.validateSeatMessage(sender.playerId!, t, d);
    this.hostConn.send('relay' as never, { from: sender.playerId, t, d } as never);
  }

  /** pilot.input / pilot.action / copilot.action: phase, seat and shape checks (messages.md). */
  private validateSeatMessage(playerId: PlayerId, t: MessageType, d: Record<string, unknown>): void {
    if (t !== 'pilot.input' && t !== 'pilot.action' && t !== 'copilot.action') return;
    const phase = this.phase?.phase;
    if (phase !== 'COUNTDOWN' && phase !== 'FLIGHT') err('WRONG_PHASE');
    const assign = (this.sticky.get('pilot.assign')?.d ?? {}) as { pilotId?: string | null; pilotInput?: string; copilotId?: string | null; boosterPilotId?: string | null; boosterInput?: string | null };
    if (t === 'copilot.action') {
      if (assign.copilotId !== playerId) err('NOT_PILOT');
    } else {
      const booster = d.craft === 'BOOSTER';
      const seatHolder = booster ? assign.boosterPilotId : assign.pilotId;
      const source = booster ? assign.boosterInput : assign.pilotInput;
      if (seatHolder !== playerId || source === 'HOST_DEVICE') err('NOT_PILOT');
    }
    if (t === 'pilot.action' && ((d.action === 'ATT_HOLD' && d.attMode === undefined) || (d.action === 'DEPLOY' && d.deploy === undefined))) err('BAD_PAYLOAD', null, t, { field: d.action === 'DEPLOY' ? 'deploy' : 'attMode' });
    if (t === 'copilot.action' && d.action === 'DEPLOY' && d.deploy === undefined) err('BAD_PAYLOAD', null, t, { field: 'deploy' });
  }

  /** Broadcasts a server-constructed message (vote.*, poll.*, room.state, …) using the same
   *  MESSAGE_META-driven recipient resolution as the generic relay. `sender` matters only for
   *  the (rare, here unused by this method's callers) SENDER route. */
  broadcastExplicit(t: MessageType, d: Record<string, unknown>, sender: Connection | null = null): void {
    if (!this.admitStream(t, d)) return;
    const meta = MESSAGE_META[t];
    if (t === 'mg.start') this.activeMg = { runId: String(d.runId), audience: d.audience === true };
    const recipients = recipientsFor(t, d, (sender ?? this.hostConn) as Connection, this.routingCtx());
    this.sendTo(recipients, t, d);
    if (meta.sticky) {
      const key = typeof d.role === 'string' ? `${t}:${d.role}` : t;
      this.sticky.set(key, { t, d });
    }
    if (t === 'mg.summary' || t === 'mg.cancel') {
      this.sticky.delete('mg.start');
      this.activeMg = null;
    }
    if (t === 'vote.stage' && (d.stage === 'VOTE' || d.stage === 'RUNOFF')) this.sendTallyNow();
  }

  private appendOutcome(t: MessageType, dWithoutSeq: Record<string, unknown>): Record<string, unknown> {
    this.outcomeSeq += 1;
    const d = { ...dWithoutSeq, outcomeSeq: this.outcomeSeq };
    this.outcomeLog.push({ outcomeSeq: this.outcomeSeq, t, d });
    return d;
  }

  // ───────────────────────────── room.state / roles.state / settings.state ─────────────────────────────

  buildRoomState(): PayloadMap['room.state'] {
    const players: PlayerInfo[] = [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        id: p.id,
        slot: p.slot,
        nickname: p.nickname,
        avatar: p.avatar,
        connected: p.conn !== null,
        slotExpiresAtMs: p.hold ? this.holdExpiryFor(p.hold) : null,
        vetoAvailable: p.vetoAvailable,
        prefs: p.prefs,
      }));
    const spectators = [...this.spectators.values()];
    return {
      room: this.code,
      hostConnected: this.hostConn !== null,
      paused: this.pauseState.paused,
      players,
      spectatorCount: spectators.filter((s) => s.conn !== null).length,
      pendingPlayerCount: spectators.filter((s) => s.pendingPlayer).length,
    };
  }

  private holdExpiryFor(hold: SlotHold): number {
    return holdExpiresAtMs(hold, this.clock);
  }

  /** Unlocked lobby: the group table for the current player count; in PICK mode a claimed group shows its claimer. */
  private previewGroups(): PayloadMap['roles.state']['groups'] {
    const n = this.players.size;
    if (n === 0) return [];
    return groupsForCount(n).map((roles) => {
      const lead = roles[0]!;
      const claimer = this.roleMode === 'PICK' ? ([...this.rolePicks].find(([, l]) => l === lead)?.[0] ?? null) : null;
      return { lead, roles: [...roles], playerId: claimer };
    });
  }

  buildRolesState(): PayloadMap['roles.state'] {
    const flightVotes: Array<{ playerId: PlayerId; n: number }> = [];
    const tally = new Map<PlayerId, number>();
    for (const candidate of this.roleVotes.values()) tally.set(candidate, (tally.get(candidate) ?? 0) + 1);
    for (const [playerId, n] of tally) flightVotes.push({ playerId, n });
    return {
      mode: this.roleMode,
      locked: this.roleLocked,
      groups: this.roleLocked || this.assignment.size > 0 ? toRoleGroups(this.assignment) : this.previewGroups(),
      flightVotes: this.roleLocked ? [] : flightVotes,
      abilitiesUsed: [...this.abilitiesUsed],
    };
  }

  private broadcastRoomState(sender: Connection): void {
    this.broadcast(sender, 'room.state', this.buildRoomState() as unknown as Record<string, unknown>);
  }

  private broadcastRolesState(sender: Connection): void {
    this.broadcast(sender, 'roles.state', this.buildRolesState() as unknown as Record<string, unknown>);
  }

  // ───────────────────────────── room lifecycle ─────────────────────────────

  createByHost(conn: Connection, settings?: SettingsPatch): PayloadMap['room.created'] {
    this.hostConn = conn;
    this.hostToken = generateToken();
    conn.kind = 'HOST';
    if (settings) this.applySettingsPatch(settings);
    return {
      room: this.code,
      hostToken: this.hostToken,
      joinUrl: buildJoinUrl(this.clientBaseUrl, this.code as never),
      spectateUrl: buildSpectateUrl(this.clientBaseUrl, this.code as never),
      maxPlayers: 10,
      slotHoldMs: 180000,
      roomHoldMs: 600000,
    };
  }

  private freeSlot(): number {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    for (let s = 1; s <= 10; s++) if (!used.has(s)) return s;
    throw new Error('freeSlot: room is full');
  }

  joinPlayer(conn: Connection, nickname: string, avatar: Avatar, prefs: PlayerPrefs | undefined, buildStarted: boolean): PayloadMap['room.joined'] {
    const taken = (nick: string) => [...this.players.values()].some((p) => p.nickname.toLowerCase() === nick.toLowerCase());
    const check = checkNickname(nickname, taken);
    if (!check.ok) err(check.code, null, 'room.join', { suggestion: check.suggestion });

    const roomFull = this.players.size >= 10;
    const becomesSpectator = buildStarted || roomFull;
    if (becomesSpectator) {
      const id = this.nextSpectatorId();
      const rec: SpectatorRecord = { id, prefs: prefs ?? { ...DEFAULT_PREFS }, token: generateToken(), conn, pendingPlayer: true, pendingProfile: { nickname: check.nickname, avatar }, hold: null };
      this.spectators.set(id, rec);
      conn.kind = 'SPECTATOR';
      conn.spectatorId = id;
      this.broadcastRoomState(conn);
      return {
        room: this.code,
        kind: 'SPECTATOR',
        id,
        slot: null,
        nickname: null,
        token: rec.token,
        spectatorReason: buildStarted ? 'LATE_JOIN' : 'ROOM_FULL',
        pendingPlayer: true,
      };
    }

    const id = this.nextPlayerId();
    const slot = this.freeSlot();
    const rec: PlayerRecord = {
      id,
      slot,
      nickname: check.nickname,
      avatar,
      prefs: prefs ?? { ...DEFAULT_PREFS },
      token: generateToken(),
      conn,
      hold: null,
      vetoAvailable: true,
    };
    this.players.set(id, rec);
    conn.kind = 'PLAYER';
    conn.playerId = id;
    if (!this.roleLocked) this.recomputeLobbyGroupsOnCountChange();
    else {
      const bySlotDesc = [...this.players.values()].filter((p) => p.id !== id).sort((a, b) => b.slot - a.slot).map((p) => p.id);
      this.assignment = onArrive(this.assignment, id, bySlotDesc);
    }
    this.broadcastRoomState(conn);
    this.broadcastRolesState(conn);
    return {
      room: this.code,
      kind: 'PLAYER',
      id,
      slot,
      nickname: rec.nickname,
      token: rec.token,
      spectatorReason: null,
      pendingPlayer: false,
    };
  }

  joinSpectator(conn: Connection, prefs: PlayerPrefs | undefined): PayloadMap['room.joined'] {
    const id = this.nextSpectatorId();
    const rec: SpectatorRecord = { id, prefs: prefs ?? { ...DEFAULT_PREFS }, token: generateToken(), conn, pendingPlayer: false, pendingProfile: null, hold: null };
    this.spectators.set(id, rec);
    conn.kind = 'SPECTATOR';
    conn.spectatorId = id;
    this.broadcastRoomState(conn);
    return { room: this.code, kind: 'SPECTATOR', id, slot: null, nickname: null, token: rec.token, spectatorReason: null, pendingPlayer: false };
  }

  /** Re-deals unlocked lobby role groups whenever the player count changes (messages.md §5.2). */
  private recomputeLobbyGroupsOnCountChange(): void {
    const presentIds = new Set(this.players.keys());
    for (const playerId of [...this.rolePicks.keys()]) if (!presentIds.has(playerId)) this.rolePicks.delete(playerId);
    for (const voter of [...this.roleVotes.keys()]) if (!presentIds.has(voter)) this.roleVotes.delete(voter);
    this.assignment = new Map();
  }

  findPlayerByToken(token: Token): PlayerRecord | null {
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  findSpectatorByToken(token: Token): SpectatorRecord | null {
    for (const s of this.spectators.values()) if (s.token === token) return s;
    return null;
  }

  isHostToken(token: Token): boolean {
    return this.hostToken === token;
  }

  /** A second connection resumed the same token: the first gets `bye` REPLACED (close 4003), §4.3. */
  private replaceConn(old: Connection | null): void {
    if (!old) return;
    old.send('bye' as never, { reason: 'REPLACED', closeCode: 4003, canResume: false } as never);
    old.close(4003, 'REPLACED');
  }

  resumeHost(conn: Connection): void {
    const wasConnected = this.hostConn !== null;
    if (this.hostConn && this.hostConn !== conn) this.replaceConn(this.hostConn);
    this.hostConn = conn;
    // The host is back: the room no longer expires, but it stays paused until `game.resume` (§4.4).
    if (this.pauseState.paused && this.pauseState.reason === 'HOST_DISCONNECTED') this.pauseState = { ...this.pauseState, roomExpiresAtMs: null };
    conn.kind = 'HOST';
    if (!wasConnected) this.broadcastRoomState(conn);
  }

  resumePlayer(conn: Connection, rec: PlayerRecord): void {
    this.replaceConn(rec.conn);
    rec.conn = conn;
    rec.hold = null;
    conn.kind = 'PLAYER';
    conn.playerId = rec.id;
    this.broadcastRoomState(conn);
  }

  resumeSpectator(conn: Connection, rec: SpectatorRecord): void {
    this.replaceConn(rec.conn);
    rec.conn = conn;
    rec.hold = null;
    conn.kind = 'SPECTATOR';
    conn.spectatorId = rec.id;
    this.broadcastRoomState(conn);
  }

  /** `conn` (when given) must still be the player's live connection; a replaced socket closing late is ignored. */
  disconnectPlayer(playerId: PlayerId, conn?: Connection): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (conn && p.conn !== conn) return;
    p.conn = null;
    p.hold = startHold(this.clock);
    if (this.pauseState.paused) p.hold = freezeHold(p.hold, this.clock);
    const dummy = this.hostConn ?? this.allPlayerConns()[0] ?? this.allSpectatorConns()[0];
    if (dummy) this.broadcastRoomState(dummy);
  }

  /** Spectator records are kept for the same 3-minute hold as players (§4.3) so the token can resume. */
  disconnectSpectator(id: SpectatorId, conn?: Connection): void {
    const s = this.spectators.get(id);
    if (!s) return;
    if (conn && s.conn !== conn) return;
    s.conn = null;
    s.hold = startHold(this.clock);
    if (this.pauseState.paused) s.hold = freezeHold(s.hold, this.clock);
  }

  leaveSpectator(id: SpectatorId): void {
    this.spectators.delete(id);
  }

  updateProfile(playerId: PlayerId, nickname: string, avatar: Avatar): void {
    const p = this.players.get(playerId);
    if (!p) err('UNKNOWN_PLAYER');
    const taken = (nick: string) => [...this.players.values()].some((other) => other.id !== playerId && other.nickname.toLowerCase() === nick.toLowerCase());
    const check = checkNickname(nickname, taken);
    if (!check.ok) err(check.code, null, 'player.profile', { suggestion: check.suggestion });
    p.nickname = check.nickname;
    p.avatar = avatar;
    const dummy = this.hostConn ?? this.allPlayerConns()[0] ?? this.allSpectatorConns()[0];
    if (dummy) this.broadcastRoomState(dummy);
  }

  updatePlayerPrefs(playerId: PlayerId, prefs: PlayerPrefs): void {
    const p = this.players.get(playerId);
    if (!p) err('UNKNOWN_PLAYER');
    p.prefs = prefs;
    const dummy = this.hostConn ?? this.allPlayerConns()[0] ?? this.allSpectatorConns()[0];
    if (dummy) this.broadcastRoomState(dummy);
  }

  updateSpectatorPrefs(id: SpectatorId, prefs: PlayerPrefs): void {
    const s = this.spectators.get(id);
    if (!s) return;
    s.prefs = prefs;
  }

  private frozenStageRemainingMs: number | null = null;
  private frozenPollRemainingMs: number | null = null;

  /** While paused every server timer is frozen (§4.4): stop the stage and poll timers, keep what is left. */
  private freezeStageAndPollTimers(): void {
    const now = this.clock.nowMs();
    if (this.round && this.round.stageEndsAtMs !== null && this.round.stageTimer) {
      this.frozenStageRemainingMs = Math.max(0, this.round.stageEndsAtMs - now);
      this.clearStageTimer();
    }
    if (this.poll && this.poll.currentEndsAtMs !== null && this.poll.callTimer) {
      this.frozenPollRemainingMs = Math.max(0, this.poll.currentEndsAtMs - now);
      this.poll.callTimer();
      this.poll.callTimer = null;
    }
  }

  private thawStageAndPollTimers(): void {
    if (this.round && this.frozenStageRemainingMs !== null && this.round.stageEndsAtMs !== null) {
      const stage = this.round.stage;
      const timer = setTimeout(() => this.onStageTimeout(stage), this.frozenStageRemainingMs);
      this.round.stageTimer = () => clearTimeout(timer);
    }
    this.frozenStageRemainingMs = null;
    if (this.poll && this.frozenPollRemainingMs !== null) this.armPollTimer(this.frozenPollRemainingMs);
    this.frozenPollRemainingMs = null;
  }

  private freezeAllHolds(): void {
    this.freezeStageAndPollTimers();
    for (const p of this.players.values()) if (p.hold) p.hold = freezeHold(p.hold, this.clock);
    for (const sp of this.spectators.values()) if (sp.hold) sp.hold = freezeHold(sp.hold, this.clock);
  }

  disconnectHost(conn?: Connection): void {
    if (conn && this.hostConn !== conn) return;
    this.hostConn = null;
    this.declineAllAbilityRequests();
    if (!this.pauseState.paused || this.pauseState.reason !== 'HOST_DISCONNECTED') {
      // A host-requested pause becomes HOST_DISCONNECTED too, so the 10-minute room hold starts (§4.4).
      const wasPausedAtMs = this.pauseState.paused ? this.pauseState.pausedAtMs : null;
      this.pauseState = pauseState(this.clock, 'HOST_DISCONNECTED');
      if (wasPausedAtMs !== null) this.pauseState = { ...this.pauseState, pausedAtMs: wasPausedAtMs };
      this.freezeAllHolds();
      const dummy = this.allPlayerConns()[0] ?? this.allSpectatorConns()[0];
      if (dummy) {
        this.broadcast(dummy, 'game.paused', {
          reason: 'HOST_DISCONNECTED',
          atMs: this.clock.nowMs(),
          roomExpiresAtMs: this.pauseState.roomExpiresAtMs,
        });
        this.broadcastRoomState(dummy);
      }
    }
  }

  isRoomExpired(): boolean {
    return computePauseExpired(this.pauseState, this.clock);
  }

  /** Host removes a player: `bye` KICKED (close 4002) to that phone, token revoked, roles redistributed. */
  kickPlayer(playerId: PlayerId): void {
    const p = this.players.get(playerId);
    if (!p) err('UNKNOWN_PLAYER');
    const conn = p.conn;
    this.leavePlayer(playerId);
    if (conn) {
      conn.send('bye' as never, { reason: 'KICKED', closeCode: 4002, canResume: false } as never);
      conn.close(4002, 'KICKED');
    }
  }

  leavePlayer(playerId: PlayerId): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    if (this.roleLocked) {
      const remaining = [...this.players.values()].sort((a, b) => a.slot - b.slot).map((x) => x.id);
      const connected = new Set([...this.players.values()].filter((x) => x.conn).map((x) => x.id));
      this.assignment = onLeave(this.assignment, playerId, remaining, connected);
    } else {
      this.recomputeLobbyGroupsOnCountChange();
    }
    const dummy = this.hostConn ?? this.allPlayerConns()[0] ?? this.allSpectatorConns()[0];
    if (dummy) {
      this.broadcastRoomState(dummy);
      this.broadcastRolesState(dummy);
    }
  }

  // ───────────────────────────── snapshot (messages.md §4.5) ─────────────────────────────

  /** Drops cached sticky messages whose type is `prefix` or starts with `prefix.`; keys are `type` or `type:role`. */
  clearSticky(prefix: string): void {
    for (const key of [...this.sticky.keys()]) if (key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}:`)) this.sticky.delete(key);
  }

  /**
   * Steps 5 to 9 of the snapshot a connection receives after joining or resuming, in order, ready to
   * send before `snapshot.end`. Phones get the sticky host messages, the active vote round, the active
   * poll call and the active minigame (players, and spectators if audience); the host gets the outcome
   * log after `lastOutcomeSeq`.
   */
  snapshotMessages(conn: Connection, lastOutcomeSeq: number): Array<{ t: MessageType; d: unknown }> {
    const out: Array<{ t: MessageType; d: unknown }> = [];
    if (conn.kind === 'HOST') {
      for (const o of this.outcomeLog) if (o.outcomeSeq > lastOutcomeSeq) out.push({ t: o.t, d: o.d });
      return out;
    }
    const heldRoles = new Set<RoleId>(conn.kind === 'PLAYER' && conn.playerId ? (this.assignment.get(conn.playerId) ?? []) : []);
    const order: MessageType[] = ['phase.set', 'build.state', 'boost.state', 'sync.meter', 'pilot.assign', 'blackout.set', 'console.config', 'debrief.score', 'debrief.awards', 'debrief.facts'];
    for (const t of order) {
      for (const [key, entry] of this.sticky) {
        if (entry.t !== t) continue;
        const role = (entry.d as { role?: RoleId }).role;
        if (t === 'console.config' && !(key.includes(':') && role && heldRoles.has(role))) continue;
        out.push({ t: entry.t, d: entry.d });
      }
    }
    const r = this.round;
    if (r && r.opened) {
      out.push({ t: 'vote.opened', d: r.opened });
      for (const [key, entry] of this.sticky) {
        const role = (entry.d as { role?: RoleId }).role;
        if (entry.t === 'vote.insight' && key.includes(':') && role && heldRoles.has(role)) out.push({ t: entry.t, d: entry.d });
      }
      for (const v of r.vetoes) {
        out.push({
          t: 'vote.vetoed',
          d: { roundId: r.roundId, optionId: v.optionId, playerId: v.playerId, clearedVoterIds: [], remainingOptionIds: r.options.filter((o) => !r.vetoedIds.has(o.id)).map((o) => o.id) },
        });
      }
      out.push({ t: 'vote.tags', d: { roundId: r.roundId, tags: r.tags } });
      if (r.stage === 'TIEBREAK_TRIVIA' || r.stage === 'TIEBREAK_PICK') out.push({ t: 'vote.trivia.open', d: this.buildTriviaOpenPayload() });
      out.push({
        t: 'vote.stage',
        d: { roundId: r.roundId, stage: r.stage, startedAtMs: this.clock.nowMs(), endsAtMs: r.stageEndsAtMs, candidateIds: this.stageCandidateIds(r.stage), pickerId: r.stage === 'TIEBREAK_PICK' ? r.triviaWinnerId : null },
      });
      const tally = this.buildTally();
      if (tally) out.push({ t: 'vote.tally', d: tally });
      const ownBallot = conn.kind === 'PLAYER' && conn.playerId ? r.ballots.get(conn.playerId) : conn.kind === 'SPECTATOR' && conn.spectatorId ? r.audienceBallots.get(conn.spectatorId) : undefined;
      out.push({ t: 'vote.ack', d: { roundId: r.roundId, optionId: ownBallot ?? null, reason: 'SNAPSHOT' } });
    }
    if (this.poll && this.poll.calls[this.poll.callIdx]) {
      const call = this.poll.calls[this.poll.callIdx]!;
      out.push({
        t: 'poll.call',
        d: {
          pollId: this.poll.pollId,
          context: this.poll.context,
          round: this.poll.round,
          index: this.poll.callIdx + 1,
          total: this.poll.calls.length,
          playerId: call.playerId,
          roles: call.roles,
          endsAtMs: this.poll.currentEndsAtMs ?? this.clock.nowMs() + this.poll.perCallMs,
        },
      });
    }
    const mg = this.sticky.get('mg.start');
    if (mg && (conn.kind === 'PLAYER' || (conn.kind === 'SPECTATOR' && this.activeMg?.audience))) out.push({ t: mg.t, d: mg.d });
    return out;
  }

  // ───────────────────────────── expiry, close, audience reactions ─────────────────────────────

  /** Set by the connection manager: called once when the room is destroyed (close or expiry). */
  onDestroyed: (() => void) | null = null;
  private destroyed = false;

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Housekeeping, called about once a second by the connection manager (and directly in tests with
   * a fake clock): frees player seats whose 3-minute hold elapsed (token revoked, roles
   * redistributed, §4.3), forgets spectators likewise, and expires the room when the host has been
   * away for 10 minutes (§4.4). Hold countdowns are frozen while paused, by `SlotHold` itself.
   */
  sweep(): 'EXPIRED' | null {
    if (this.destroyed) return null;
    if (this.hostConn === null && this.isRoomExpired()) {
      this.destroyWith('ROOM_EXPIRED');
      return 'EXPIRED';
    }
    if (this.pauseState.paused) return null;
    for (const p of [...this.players.values()]) {
      if (p.conn === null && p.hold && isHoldExpired(p.hold, this.clock)) this.leavePlayer(p.id);
    }
    for (const sp of [...this.spectators.values()]) {
      if (sp.conn === null && sp.hold && isHoldExpired(sp.hold, this.clock)) this.spectators.delete(sp.id);
    }
    return null;
  }

  /** Host ended the session (`room.close`) or the room expired: bye to everyone, tokens revoked. */
  destroyWith(reason: 'ROOM_CLOSED' | 'ROOM_EXPIRED' | 'SERVER_SHUTDOWN'): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const closeCode = reason === 'ROOM_CLOSED' ? 4000 : reason === 'ROOM_EXPIRED' ? 4004 : 4008;
    const conns = [this.hostConn, ...this.allPlayerConns(), ...this.allSpectatorConns()].filter((c): c is Connection => c !== null);
    for (const c of conns) {
      c.send('bye' as never, { reason, closeCode, canResume: false } as never);
      c.close(closeCode, reason);
    }
    this.hostConn = null;
    this.hostToken = null;
    this.players.clear();
    this.spectators.clear();
    this.stopAllTimers();
    this.onDestroyed?.();
  }

  /** Spectator reactions are aggregated into one `react.audience` per second (§13.7). */
  private audienceCounts: Record<ReactionId, number> | null = null;
  private audienceTimer: ReturnType<typeof setTimeout> | null = null;

  recordAudienceReaction(emoji: ReactionId): void {
    this.audienceCounts ??= { ROCKET: 0, THUMBS_UP: 0, GRIMACE: 0, FIRE: 0, THINKING: 0 };
    this.audienceCounts[emoji] = (this.audienceCounts[emoji] ?? 0) + 1;
    if (this.audienceTimer) return;
    this.audienceTimer = setTimeout(() => this.flushAudienceReactions(), 1000);
  }

  flushAudienceReactions(): void {
    if (this.audienceTimer) clearTimeout(this.audienceTimer);
    this.audienceTimer = null;
    const counts = this.audienceCounts;
    this.audienceCounts = null;
    if (!counts || this.destroyed) return;
    this.broadcastExplicit('react.audience', { windowMs: 1000, counts } as unknown as Record<string, unknown>, null);
  }

  // ───────────────────────────── settings ─────────────────────────────

  applySettingsPatch(patch: SettingsPatch): void {
    const lobbyOnly = patch.roleAssignMode !== undefined || patch.assistLevel !== undefined;
    if (lobbyOnly && this.phase !== null && this.phase.phase !== 'LOBBY') err('SETTING_LOCKED');
    if (patch.roleAssignMode !== undefined && patch.roleAssignMode !== this.settings.roleAssignMode) {
      this.rolePicks.clear();
      this.roleVotes.clear();
    }
    this.settings = { ...this.settings, ...patch, a11y: patch.a11y ? { ...patch.a11y } : this.settings.a11y };
  }

  // ───────────────────────────── roles ─────────────────────────────

  setRolePick(playerId: PlayerId, lead: RoleId | null): void {
    if (this.roleMode !== 'PICK' || this.roleLocked) err('WRONG_PHASE');
    if (lead === null) this.rolePicks.delete(playerId);
    else {
      const n = this.players.size;
      const leads = groupsForCount(n).map((g) => g[0]);
      if (!leads.includes(lead)) err('BAD_PAYLOAD', null, 'roles.pick', { field: 'lead' });
      for (const [p, l] of this.rolePicks) if (l === lead && p !== playerId) err('ROLE_TAKEN');
      this.rolePicks.set(playerId, lead);
    }
  }

  setRoleVote(voter: PlayerId, candidate: PlayerId): void {
    if (this.roleMode !== 'VOTE' || this.roleLocked) err('WRONG_PHASE');
    if (!this.players.has(candidate)) err('UNKNOWN_PLAYER');
    this.roleVotes.set(voter, candidate);
  }

  lockRoles(): void {
    if (this.players.size === 0 || (this.phase !== null && this.phase.phase !== 'LOBBY')) err('WRONG_PHASE');
    this.lockRolesNow();
  }

  /** Locks without the phase check: used by `lockRoles` and when the phase leaves LOBBY (§5.2). */
  /** Entering LOBBY again unlocks roles and keeps the current assignment (§5.2). */
  unlockRoles(): void {
    this.roleLocked = false;
  }

  lockRolesNow(): void {
    const playersBySlot = [...this.players.values()].sort((a, b) => a.slot - b.slot).map((p) => p.id);
    this.assignment = lockAssignment({ mode: this.roleMode, playersBySlot, picks: this.rolePicks, votes: this.roleVotes, rng: this.rng });
    this.roleLocked = true;
  }

  setRolesExplicit(assignments: Array<{ playerId: PlayerId; roles: RoleId[] }>): void {
    const next: Assignment = new Map();
    for (const a of assignments) {
      if (!this.players.has(a.playerId)) err('UNKNOWN_PLAYER');
      if (next.has(a.playerId)) err('INVALID_ASSIGNMENT');
      next.set(a.playerId, a.roles);
    }
    const all = [...next.values()].flat();
    if (all.length !== 10 || new Set(all).size !== 10) err('INVALID_ASSIGNMENT');
    this.assignment = next;
    this.roleLocked = true;
  }

  rotateRoles(): void {
    const playersBySlot = [...this.players.values()].sort((a, b) => a.slot - b.slot).map((p) => p.id);
    this.assignment = onRotate(this.assignment, playersBySlot);
    this.roleLocked = true;
  }

  // ───────────────────────────── votes ─────────────────────────────

  /** `roundId` must be the active round, else STALE_ID (every vote.* validation list starts with it). */
  assertActiveRound(roundId: string): void {
    if (!this.round || this.round.roundId !== roundId) err('STALE_ID');
  }

  private usedRoundIds = new Set<string>();
  private usedPollIds = new Set<string>();

  /** vote.open validation list (messages.md `vote.open`), in the order written. */
  private validateVoteOpen(d: PayloadMap['vote.open']): void {
    if (this.phase?.phase === 'LOBBY') err('WRONG_PHASE');
    if (this.round || this.poll) err('ROUND_ACTIVE');
    if (this.usedRoundIds.has(d.roundId)) err('DUPLICATE_ID');
    const ids = d.options.map((o) => o.id);
    const bad = (field: string): never => err('BAD_PAYLOAD', null, 'vote.open', { field });
    if (new Set(ids).size !== ids.length) bad('options');
    if (d.defaultOptionId !== null && !ids.includes(d.defaultOptionId)) bad('defaultOptionId');
    if (d.hint && !ids.includes(d.hint.optionId)) bad('hint.optionId');
    if (d.predict && (d.predict.correctIndex >= d.predict.choices.length || d.kind !== 'PART')) bad('predict');
    if (d.trivia && d.trivia.correctIndex >= d.trivia.choices.length) bad('trivia');
    if (d.kind === 'PILOT' && ids.some((id) => !this.players.has(id))) bad('options');
    const states = d.options.map((o) => ({ id: o.id, costM: o.costM, afford: o.afford, willNotFly: o.willNotFly, fixExists: o.fixExists }));
    if (winnableOptions(states, new Set(), this.abilitiesUsed.has('PM')).length === 0) err('NO_WINNABLE_OPTION');
  }

  openVote(d: PayloadMap['vote.open']): PayloadMap['vote.opened'] {
    this.validateVoteOpen(d);
    this.usedRoundIds.add(d.roundId);
    this.promotePending();
    const voters = [...this.players.values()].sort((a, b) => a.slot - b.slot).map((p) => p.id);
    const solo = voters.length === 1;
    this.round = {
      roundId: d.roundId,
      kind: d.kind,
      subjectId: d.subjectId,
      title: d.title,
      why: d.why,
      ownerRoles: d.ownerRoles,
      options: d.options,
      defaultOptionId: d.defaultOptionId,
      hint: d.hint,
      predict: d.predict,
      trivia: d.trivia,
      coinSeed: d.coinSeed,
      timers: d.timers,
      voters,
      solo,
      vetoedIds: new Set(),
      tags: [],
      vetoes: [],
      ballots: new Map(),
      audienceBallots: new Map(),
      predictAnswers: new Map(),
      predictAudienceAnswered: new Set(),
      predictAudienceCounts: d.predict ? d.predict.choices.map(() => 0) : [],
      stage: 'REVEAL',
      stageEndsAtMs: null,
      stageTimer: null,
      runoffCandidates: null,
      firstRoundCounts: null,
      tiedOptionIds: [],
      tieCounts: null,
      decisionTimeOptionId: null,
      triviaWinnerId: null,
      triviaAnswers: [],
      closedBy: null,
      frozen: { strictMajority: this.settings.strictMajority, audienceVoteWeight: this.settings.audienceVoteWeight as 0 | 1, tallyVisibility: this.settings.tallyVisibility as 'OPEN' | 'HIDDEN' },
      opened: null,
    };
    const seq = stageSequence(d.kind, d.predict !== null);
    const plan: Array<{ stage: VoteStage; durationMs: number | null }> = seq
      .filter((s): s is VoteStage => s !== 'CLOSED')
      .map((s) => ({
        stage: s,
        durationMs: s === 'VOTE' && solo ? null : stageDurationMs(s, d.kind, this.durationSettings(), d.timers),
      }));
    const opened: PayloadMap['vote.opened'] = {
      roundId: d.roundId,
      kind: d.kind,
      subjectId: d.subjectId,
      title: d.title,
      why: d.why,
      ownerRoles: d.ownerRoles,
      options: d.options,
      hint: d.hint,
      predict: d.predict ? { id: d.predict.id, prompt: d.predict.prompt, choices: d.predict.choices } : null,
      voters,
      solo,
      vetoAllowed: vetoAllowed(d.kind),
      tagsAllowed: tagsAllowed(d.kind),
      strictMajority: runoffPossible(d.kind, this.settings.strictMajority),
      tallyVisibility: this.settings.tallyVisibility,
      audienceVoteWeight: this.settings.audienceVoteWeight as 0 | 1,
      plan,
    };
    this.round.opened = opened;
    return opened;
  }

  private durationSettings() {
    return { voteTimerS: this.settings.voteTimerS, inspectTimerS: this.settings.inspectTimerS, a11ySlowTimers: this.settings.a11y.slowTimers };
  }

  private winnableOptionStates(): OptionState[] {
    if (!this.round) return [];
    const states = this.round.options.map((o) => ({ id: o.id, costM: o.costM, afford: o.afford, willNotFly: o.willNotFly, fixExists: o.fixExists }));
    return winnableOptions(states, this.round.vetoedIds, this.abilitiesUsed.has('PM'));
  }

  private optionState(id: OptionId): OptionState | null {
    if (!this.round) return null;
    const o = this.round.options.find((x) => x.id === id);
    if (!o) return null;
    return { id: o.id, costM: o.costM, afford: o.afford, willNotFly: o.willNotFly, fixExists: o.fixExists };
  }

  /** Advances to the given stage: records it, arms its timer (if any), returns the payload to broadcast. */
  armStage(stage: VoteStage): PayloadMap['vote.stage'] {
    if (!this.round) throw new Error('armStage: no active round');
    this.clearStageTimer();
    this.round.stage = stage;
    const durationMs = this.round.solo && stage === 'VOTE' ? null : stageDurationMs(stage, this.round.kind, this.durationSettings(), this.round.timers);
    const startedAtMs = this.clock.nowMs();
    const endsAtMs = durationMs === null ? null : startedAtMs + durationMs;
    this.round.stageEndsAtMs = endsAtMs;
    const candidateIds = this.stageCandidateIds(stage);
    if (durationMs !== null) {
      const timer = setTimeout(() => this.onStageTimeout(stage), durationMs);
      this.round.stageTimer = () => clearTimeout(timer);
    }
    return {
      roundId: this.round.roundId,
      stage,
      startedAtMs,
      endsAtMs,
      candidateIds,
      pickerId: stage === 'TIEBREAK_PICK' ? this.round.triviaWinnerId : null,
    };
  }

  /** `vote.tally` for the current VOTE / RUNOFF stage (messages.md `vote.tally`); null otherwise. */
  buildTally(): PayloadMap['vote.tally'] | null {
    const r = this.round;
    if (!r || (r.stage !== 'VOTE' && r.stage !== 'RUNOFF')) return null;
    const hidden = r.frozen.tallyVisibility === 'HIDDEN';
    const candidates = this.stageCandidateIds(r.stage);
    const countsFor = (ballots: Map<string, OptionId>) => candidates.map((optionId) => ({ optionId, n: [...ballots.values()].filter((o) => o === optionId).length }));
    const playerCounts = countsFor(r.ballots);
    const lead = playerCounts.reduce<{ optionId: OptionId; n: number } | null>((best, c) => (c.n > 0 && (best === null || c.n > best.n) ? c : best), null);
    return {
      roundId: r.roundId,
      stage: r.stage,
      counts: hidden ? null : playerCounts,
      votedIds: [...r.ballots.keys()],
      audienceCounts: hidden ? null : countsFor(r.audienceBallots),
      audienceTotal: r.audienceBallots.size,
      leadingOptionId: hidden ? null : (lead?.optionId ?? null),
    };
  }

  private tallyLastAtMs = -Infinity;
  private tallyTimer: ReturnType<typeof setTimeout> | null = null;

  /** Sends the tally now (start of a VOTE / RUNOFF stage). */
  sendTallyNow(): void {
    if (this.tallyTimer) clearTimeout(this.tallyTimer);
    this.tallyTimer = null;
    const tally = this.buildTally();
    if (!tally) return;
    this.tallyLastAtMs = this.clock.nowMs();
    this.broadcastExplicit('vote.tally', tally as unknown as Record<string, unknown>);
  }

  /** At most one `vote.tally` per 200 ms after a change; a change inside the window is sent when it ends. */
  scheduleTally(): void {
    if (this.tallyTimer || !this.buildTally()) return;
    const wait = Math.max(0, TALLY_MIN_GAP_MS - (this.clock.nowMs() - this.tallyLastAtMs));
    if (wait === 0) {
      this.sendTallyNow();
      return;
    }
    this.tallyTimer = setTimeout(() => this.sendTallyNow(), wait);
  }

  private stageCandidateIds(stage: VoteStage): OptionId[] {
    if (!this.round) return [];
    if (stage === 'VOTE') return this.winnableOptionStates().map((o) => o.id);
    if (stage === 'RUNOFF') return this.round.runoffCandidates ?? [];
    if (stage === 'TIEBREAK_TRIVIA' || stage === 'TIEBREAK_PICK') return this.round.tiedOptionIds;
    return this.round.options.filter((o) => !this.round!.vetoedIds.has(o.id)).map((o) => o.id);
  }

  /** Cancels any pending real timer this Room holds; for tests and graceful shutdown. */
  stopAllTimers(): void {
    if (this.tallyTimer) clearTimeout(this.tallyTimer);
    this.tallyTimer = null;
    this.poll?.callTimer?.();
    for (const r of this.abilityRequests.values()) clearTimeout(r.timer);
    this.abilityRequests.clear();
    if (this.audienceTimer) clearTimeout(this.audienceTimer);
    this.audienceTimer = null;
    this.clearStageTimer();
    this.poll?.callTimer?.();
  }

  private clearStageTimer(): void {
    this.round?.stageTimer?.();
    if (this.round) this.round.stageTimer = null;
  }

  private onStageTimeout(stage: VoteStage): void {
    if (!this.round || this.round.stage !== stage) return;
    this.onStageEndHook?.(stage, 'TIMER');
  }

  /** Set by the wire layer to react to stage ends (broadcast + advance); kept as a hook so Room has no direct dependency on a specific transport. */
  onStageEndHook: ((stage: VoteStage, reason: StageEndReason) => void) | null = null;

  /** Next linear stage (REVEAL→PREDICT/INSPECT→INSPECT→VOTE, RESULT→CLOSED) from the static sequence. */
  nextLinearStage(from: VoteStage): VoteStage | null {
    if (!this.round) return null;
    const seq = stageSequence(this.round.kind, this.round.predict !== null);
    const idx = seq.indexOf(from);
    return seq[idx + 1] ?? null;
  }

  recordVetoAbility(): void {
    this.abilitiesUsed.add('PM');
  }

  castBallot(voterId: string, optionId: OptionId, isSpectator: boolean): void {
    if (!this.round) err('STALE_ID');
    const stage = this.round.stage;
    if (stage !== 'VOTE' && stage !== 'RUNOFF') err('WRONG_STAGE');
    const candidates = this.stageCandidateIds(stage);
    if (!candidates.includes(optionId)) {
      const opt = this.optionState(optionId);
      if (!opt) err('UNKNOWN_OPTION');
      if (this.round.vetoedIds.has(optionId)) err('OPTION_VETOED');
      if (stage === 'RUNOFF') err('UNKNOWN_OPTION');
      if (opt.afford === 'NEVER' || (opt.afford === 'EMERGENCY_FUNDING' && this.abilitiesUsed.has('PM'))) err('OPTION_UNAFFORDABLE');
      err('OPTION_NOT_WINNABLE');
    }
    if (isSpectator) {
      this.round.audienceBallots.set(voterId, optionId);
      this.scheduleTally();
      return;
    }
    if (!this.round.voters.includes(voterId)) err('NOT_A_VOTER');
    this.round.ballots.set(voterId, optionId);
    this.scheduleTally();
    if (this.round.solo) {
      this.onStageEndHook?.(stage, 'EARLY');
      return;
    }
    if (earlyCloseEligible(this.round.kind)) {
      const connected = this.connectedPlayerIds();
      const relevantVoters = this.round.voters.filter((v) => connected.has(v));
      const allVoted = relevantVoters.length > 0 && relevantVoters.every((v) => this.round!.ballots.has(v));
      if (allVoted) this.onStageEndHook?.(stage, 'EARLY');
    }
  }

  /** Applies the sender's veto; returns the voters whose ballots were cleared. */
  applyVetoToRound(playerId: PlayerId, optionId: OptionId): PlayerId[] {
    if (!this.round) err('STALE_ID');
    if (!vetoAllowed(this.round.kind)) err('VETO_NOT_ALLOWED');
    if (this.round.stage !== 'INSPECT' && this.round.stage !== 'VOTE') err('VETO_NOT_ALLOWED');
    const player = this.players.get(playerId);
    if (!player) err('UNKNOWN_PLAYER');
    if (!this.round.voters.includes(playerId)) err('NOT_A_VOTER');
    if (!this.round.options.some((o) => o.id === optionId)) err('UNKNOWN_OPTION');
    if (!player.vetoAvailable) err('VETO_USED');
    const states = this.round.options.map((o) => ({ id: o.id, costM: o.costM, afford: o.afford, willNotFly: o.willNotFly, fixExists: o.fixExists }));
    const result = applyVeto(states, this.round.vetoedIds, this.abilitiesUsed.has('PM'), optionId, this.round.ballots);
    if (!result.ok) err(result.code);
    player.vetoAvailable = false;
    this.round.vetoedIds = result.vetoedIds;
    this.round.vetoes.push({ optionId, playerId });
    for (const voter of result.clearedVoterIds) this.round.ballots.delete(voter);
    this.round.tags = clearTagsForOption(this.round.tags, optionId);
    for (const [specId, ballot] of [...this.round.audienceBallots]) {
      if (ballot === optionId) {
        this.round.audienceBallots.delete(specId);
        this.spectators.get(specId)?.conn?.send('vote.ack', { roundId: this.round.roundId, optionId: null, reason: 'OPTION_REMOVED' });
      }
    }
    for (const voter of result.clearedVoterIds) {
      this.players.get(voter)?.conn?.send('vote.ack', { roundId: this.round.roundId, optionId: null, reason: 'OPTION_REMOVED' });
    }
    this.scheduleTally();
    return [...result.clearedVoterIds];
  }

  tagOption(playerId: PlayerId, optionId: OptionId, tag: 'RECOMMENDED' | 'CONCERN' | null): void {
    if (!this.round) err('STALE_ID');
    const st = this.round.stage;
    if (!tagsAllowed(this.round.kind) || (st !== 'PREDICT' && st !== 'INSPECT' && st !== 'VOTE')) err('WRONG_STAGE');
    const role = this.round.ownerRoles.find((r) => this.roleHolderId(r) === playerId);
    if (!role) err('NOT_ROLE_HOLDER');
    if (!this.round.options.some((o) => o.id === optionId)) err('UNKNOWN_OPTION');
    if (this.round.vetoedIds.has(optionId)) err('OPTION_VETOED');
    this.round.tags = applyTag(this.round.tags, playerId, role, optionId, tag);
  }

  recordPredictAnswer(voterId: PlayerId, choiceIndex: number, isSpectator: boolean): boolean {
    if (!this.round || !this.round.predict) err('STALE_ID');
    if (this.round.stage !== 'PREDICT') err('WRONG_STAGE');
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= this.round.predict.choices.length) err('BAD_PAYLOAD', null, 'vote.predict', { field: 'choiceIndex' });
    if (isSpectator) {
      if (this.round.predictAudienceAnswered.has(voterId)) err('ALREADY_ANSWERED');
      this.round.predictAudienceAnswered.add(voterId);
      this.round.predictAudienceCounts[choiceIndex] = (this.round.predictAudienceCounts[choiceIndex] ?? 0) + 1;
      return false;
    }
    if (!this.round.voters.includes(voterId)) err('NOT_A_VOTER');
    if (this.round.predictAnswers.has(voterId)) err('ALREADY_ANSWERED');
    this.round.predictAnswers.set(voterId, choiceIndex);
    const connected = this.connectedPlayerIds();
    const relevant = this.round.voters.filter((v) => connected.has(v));
    return relevant.length > 0 && relevant.every((v) => this.round!.predictAnswers.has(v));
  }

  finishPredictOutcome(): PayloadMap['vote.predict.result'] {
    if (!this.round || !this.round.predict) throw new Error('no predict configured');
    const results = this.round.voters.map((playerId) => {
      const choiceIndex = this.round!.predictAnswers.get(playerId) ?? null;
      return { playerId, choiceIndex, correct: choiceIndex === this.round!.predict!.correctIndex };
    });
    const base = {
      roundId: this.round.roundId,
      correctIndex: this.round.predict.correctIndex,
      results,
      audienceCounts: this.round.predictAudienceCounts,
    };
    return this.appendOutcome('vote.predict.result', base as unknown as Record<string, unknown>) as unknown as PayloadMap['vote.predict.result'];
  }

  nowMs(): number {
    return this.clock.nowMs();
  }

  recordTriviaAnswer(playerId: PlayerId, choiceIndex: number): boolean {
    if (!this.round || !this.round.trivia) err('STALE_ID');
    if (this.round.stage !== 'TIEBREAK_TRIVIA') err('WRONG_STAGE');
    if (!this.round.voters.includes(playerId)) err('NOT_A_VOTER');
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= this.round.trivia.choices.length) err('BAD_PAYLOAD', null, 'vote.trivia.answer', { field: 'choiceIndex' });
    if (this.round.triviaAnswers.some((a) => a.playerId === playerId)) err('ALREADY_ANSWERED');
    const correct = choiceIndex === this.round.trivia.correctIndex;
    this.round.triviaAnswers.push({ playerId, choiceIndex, correct });
    if (correct && this.round.triviaWinnerId === null) {
      this.round.triviaWinnerId = playerId;
      return true; // ends the stage now
    }
    return false;
  }

  closeVoteAndResolve(closedBy: PayloadMap['vote.result']['closedBy']): PayloadMap['vote.result'] | { runoff: PayloadMap['vote.stage'] } | { tie: true } {
    if (!this.round) throw new Error('no active round');
    const winnable = this.winnableOptionStates();
    const ctx: VoteCloseContext = {
      winnableOptions: winnable,
      voters: this.round.voters,
      ballots: this.round.ballots,
      disconnected: this.disconnectedPlayerIds(),
      audienceBallots: this.round.audienceBallots,
      audienceVoteWeight: this.round.frozen.audienceVoteWeight,
      strictMajorityEnabled: this.round.frozen.strictMajority && runoffPossible(this.round.kind, true),
      ownerRoles: this.round.ownerRoles,
      roleHolder: (r) => this.roleHolderId(r),
      tags: this.round.tags,
      defaultOptionId: this.round.defaultOptionId,
      decisionTimeOptionId: this.round.decisionTimeOptionId,
      flightHolderId: this.roleHolderId('FLIGHT'),
    };
    const outcome = resolveVoteClose(ctx);
    this.round.closedBy = closedBy;
    if (outcome.kind === 'RUNOFF') {
      this.round.runoffCandidates = outcome.candidateIds;
      this.round.firstRoundCounts = outcome.firstRoundCounts;
      for (const voter of this.round.ballots.keys()) {
        this.players.get(voter)?.conn?.send('vote.ack', { roundId: this.round.roundId, optionId: null, reason: 'RUNOFF_RESET' });
      }
      for (const specId of this.round.audienceBallots.keys()) {
        this.spectators.get(specId)?.conn?.send('vote.ack', { roundId: this.round.roundId, optionId: null, reason: 'RUNOFF_RESET' });
      }
      this.round.ballots = new Map();
      this.round.audienceBallots = new Map();
      const stagePayload = this.armStage('RUNOFF');
      return { runoff: stagePayload };
    }
    if (outcome.kind === 'TIE') {
      this.round.tiedOptionIds = outcome.tiedOptionIds;
      this.round.tieCounts = outcome.counts;
      return { tie: true };
    }
    return this.finalizeResult(outcome.method, outcome.winnerId, outcome.counts, outcome.kind === 'DECIDED' ? outcome.tiedOptionIds : []);
  }

  closeRunoffAndResolve(): PayloadMap['vote.result'] | { tie: true } {
    if (!this.round || !this.round.runoffCandidates || !this.round.firstRoundCounts) throw new Error('no active runoff');
    const outcome = resolveRunoffClose({
      candidateIds: this.round.runoffCandidates,
      ballots: this.round.ballots,
      disconnected: this.disconnectedPlayerIds(),
      audienceBallots: this.round.audienceBallots,
      audienceVoteWeight: this.round.frozen.audienceVoteWeight,
      firstRoundCounts: this.round.firstRoundCounts,
      decisionTimeOptionId: this.round.decisionTimeOptionId,
      flightHolderId: this.roleHolderId('FLIGHT'),
    });
    if (outcome.kind === 'TIE') {
      this.round.tiedOptionIds = outcome.tiedOptionIds;
      this.round.tieCounts = outcome.counts;
      return { tie: true };
    }
    return this.finalizeResult(outcome.method, outcome.winnerId, outcome.counts, []);
  }

  triviaTied(): OptionId[] {
    return this.round?.tiedOptionIds ?? [];
  }

  /** Try the synchronous tie-breakers (0 Decision Time, 1 FLIGHT) before falling back to trivia/coin flip. */
  trySyncTieBreak(): PayloadMap['vote.result'] | null {
    if (!this.round) return null;
    const sync = resolveTieSync(this.round.tiedOptionIds, this.round.decisionTimeOptionId, this.roleHolderId('FLIGHT'), this.round.ballots);
    if (!sync) return null;
    return this.finalizeResult(sync.method, sync.winnerId, this.round.tieCounts ?? new Map(), this.round.tiedOptionIds);
  }

  buildTriviaOpenPayload(): PayloadMap['vote.trivia.open'] {
    if (!this.round || !this.round.trivia) throw new Error('no trivia configured');
    const q: QuestionPublic = { id: this.round.trivia.id, prompt: this.round.trivia.prompt, choices: this.round.trivia.choices };
    return { roundId: this.round.roundId, question: q, tiedOptionIds: this.round.tiedOptionIds };
  }

  finishTriviaOutcome(): PayloadMap['vote.trivia.result'] {
    if (!this.round || !this.round.trivia) throw new Error('no trivia configured');
    const base = {
      roundId: this.round.roundId,
      factId: this.round.trivia.id,
      correctIndex: this.round.trivia.correctIndex,
      winnerId: this.round.triviaWinnerId,
      answers: this.round.triviaAnswers,
    };
    return this.appendOutcome('vote.trivia.result', base as unknown as Record<string, unknown>) as unknown as PayloadMap['vote.trivia.result'];
  }

  hasTriviaWinner(): boolean {
    return this.round?.triviaWinnerId !== null && this.round?.triviaWinnerId !== undefined;
  }

  /** vote.trivia.pick validation list; returns nothing, throws RoomError. */
  assertCanPick(playerId: PlayerId, optionId: OptionId): void {
    if (!this.round) err('STALE_ID');
    if (this.round.stage !== 'TIEBREAK_PICK') err('WRONG_STAGE');
    if (this.round.triviaWinnerId !== playerId) err('NOT_YOUR_TURN');
    if (!this.round.tiedOptionIds.includes(optionId)) err('UNKNOWN_OPTION');
  }

  resolveAfterTriviaStage(pickOptionId: OptionId | null): PayloadMap['vote.result'] {
    if (!this.round) throw new Error('no active round');
    const result = resolveAfterTrivia(this.round.tiedOptionIds, this.round.triviaWinnerId, pickOptionId, this.round.ballots, this.round.coinSeed);
    return this.finalizeResult(result.method, result.winnerId, this.round.tieCounts ?? new Map(), this.round.tiedOptionIds);
  }

  resolveCoinFlipDirect(): PayloadMap['vote.result'] {
    if (!this.round) throw new Error('no active round');
    const winnerId = coinFlip(this.round.tiedOptionIds, this.round.coinSeed);
    return this.finalizeResult('COIN_FLIP', winnerId, this.round.tieCounts ?? new Map(), this.round.tiedOptionIds);
  }

  private pendingAbilityAnnouncements: Array<{ role: RoleId; trigger: PayloadMap['ability.used']['trigger']; roundId: string | null; stageIndex: number | null }> = [];

  /** Spends nothing itself: logs and broadcasts `ability.used` (an outcome-log message) plus `roles.state`. */
  announceAbilityUsed(role: RoleId, trigger: PayloadMap['ability.used']['trigger'], roundId: string | null, stageIndex: number | null, playerId?: PlayerId | null): void {
    const d = this.appendOutcome('ability.used', { role, playerId: playerId === undefined ? this.roleHolderId(role) : playerId, trigger, roundId, stageIndex });
    this.broadcastExplicit('ability.used', d);
    this.broadcastExplicit('roles.state', this.buildRolesState() as unknown as Record<string, unknown>);
    if (role === 'PM') this.reconcileRoundAfterPmSpent();
  }

  /**
   * PM spent mid-round (§7.3): Emergency Funding options stop being winnable. Ballots on them are
   * emptied (`vote.ack` OPTION_REMOVED) and `vote.stage` is re-sent with the new candidate list.
   */
  private reconcileRoundAfterPmSpent(): void {
    const r = this.round;
    if (!r || (r.stage !== 'VOTE' && r.stage !== 'RUNOFF')) return;
    const candidates = new Set(this.stageCandidateIds(r.stage));
    let removed = false;
    for (const [voter, optionId] of [...r.ballots]) {
      if (candidates.has(optionId)) continue;
      r.ballots.delete(voter);
      removed = true;
      this.players.get(voter)?.conn?.send('vote.ack', { roundId: r.roundId, optionId: null, reason: 'OPTION_REMOVED' });
    }
    for (const [spec, optionId] of [...r.audienceBallots]) {
      if (candidates.has(optionId)) continue;
      r.audienceBallots.delete(spec);
      removed = true;
      this.spectators.get(spec)?.conn?.send('vote.ack', { roundId: r.roundId, optionId: null, reason: 'OPTION_REMOVED' });
    }
    this.broadcastExplicit('vote.stage', {
      roundId: r.roundId,
      stage: r.stage,
      startedAtMs: this.clock.nowMs(),
      endsAtMs: r.stageEndsAtMs,
      candidateIds: [...candidates],
      pickerId: null,
    });
    void removed;
  }

  /** Called right after a `vote.result` is broadcast: emits the `ability.used` it caused (Emergency Funding). */
  flushAbilityAnnouncements(): void {
    for (const a of this.pendingAbilityAnnouncements.splice(0)) this.announceAbilityUsed(a.role, a.trigger, a.roundId, a.stageIndex);
  }

  private finalizeResult(method: ResolveMethod, winnerId: OptionId, counts: Map<OptionId, number>, tiedOptionIds: OptionId[]): PayloadMap['vote.result'] {
    if (!this.round) throw new Error('no active round');
    const candidatesNow = this.round.runoffCandidates ? [...this.round.runoffCandidates] : this.winnableOptionStates().map((o) => o.id);
    const optCounts = counts.size > 0 ? [...counts.entries()].map(([optionId, n]) => ({ optionId, n })) : candidatesNow.map((optionId) => ({ optionId, n: 0 }));
    const audienceBallot = computeAudienceBallot(candidatesNow, this.round.audienceBallots, this.round.frozen.audienceVoteWeight);
    const ballots = this.round.voters.map((playerId) => ({
      playerId,
      optionId: this.disconnectedPlayerIds().has(playerId) ? null : this.round!.ballots.get(playerId) ?? null,
    }));
    const audienceCounts: Array<{ optionId: OptionId; n: number }> = [];
    const audTally = new Map<OptionId, number>();
    for (const optionId of this.round.audienceBallots.values()) audTally.set(optionId, (audTally.get(optionId) ?? 0) + 1);
    for (const [optionId, n] of audTally) audienceCounts.push({ optionId, n });
    const winnerOption = this.optionState(winnerId);
    const emergencyFunding = winnerOption ? appliesEmergencyFunding(winnerOption) : false;
    if (emergencyFunding) {
      this.abilitiesUsed.add('PM');
      this.pendingAbilityAnnouncements.push({ role: 'PM', trigger: 'OVER_BUDGET_WIN', roundId: this.round.roundId, stageIndex: null });
    }
    const base: Omit<PayloadMap['vote.result'], 'outcomeSeq'> = {
      roundId: this.round.roundId,
      kind: this.round.kind,
      subjectId: this.round.subjectId,
      winnerId,
      method,
      closedBy: this.round.closedBy ?? 'TIMER',
      counts: optCounts,
      ballots,
      audienceCounts,
      audienceBallot,
      firstRoundCounts: this.round.firstRoundCounts ? [...this.round.firstRoundCounts.entries()].map(([optionId, n]) => ({ optionId, n })) : null,
      tiedOptionIds,
      triviaWinnerId: method === 'TRIVIA' ? this.round.triviaWinnerId : null,
      vetoes: this.round.vetoes,
      emergencyFunding,
    };
    const withSeq = this.appendOutcome('vote.result', base as unknown as Record<string, unknown>);
    return withSeq as unknown as PayloadMap['vote.result'];
  }

  endRound(): void {
    this.clearSticky('vote.insight');
    this.round = null;
  }

  get playerCount(): number {
    return this.players.size;
  }

  cancelRound(reason: PayloadMap['vote.cancelled']['reason'] = 'HOST'): PayloadMap['vote.cancelled'] | null {
    if (!this.round) return null;
    this.clearStageTimer();
    const roundId = this.round.roundId;
    this.clearSticky('vote.insight');
    this.round = null;
    return { roundId, reason };
  }

  // ───────────────────────────── polls (GO/NO-GO) ─────────────────────────────

  openPoll(d: PayloadMap['poll.open']): void {
    const phase = this.phase?.phase;
    if (phase !== undefined && phase !== 'FRR' && phase !== 'COUNTDOWN') err('WRONG_PHASE');
    if (this.poll || this.round) err('ROUND_ACTIVE');
    if (this.usedPollIds.has(d.pollId)) err('DUPLICATE_ID');
    this.usedPollIds.add(d.pollId);
    const seen = new Set<PlayerId>();
    const calls: Array<{ playerId: PlayerId; roles: RoleId[] }> = [];
    const disconnectedEntries: PollEntry[] = [];
    for (const role of d.order) {
      const holder = this.roleHolderId(role);
      if (!holder || seen.has(holder)) continue;
      seen.add(holder);
      const roles = d.order.filter((r) => this.roleHolderId(r) === holder);
      const connected = this.players.get(holder)?.conn !== null;
      if (connected) calls.push({ playerId: holder, roles });
      else disconnectedEntries.push({ playerId: holder, roles, answer: 'NO_ANSWER' });
    }
    this.poll = {
      pollId: d.pollId,
      context: d.context,
      round: d.round,
      order: d.order,
      perCallMs: d.perCallMs,
      calls,
      disconnectedEntries,
      callIdx: 0,
      entries: [],
      callTimer: null,
      currentEndsAtMs: null,
    };
  }

  currentPollCall(): PayloadMap['poll.call'] | null {
    if (!this.poll) return null;
    const call = this.poll.calls[this.poll.callIdx];
    if (!call) return null;
    const endsAtMs = this.clock.nowMs() + this.poll.perCallMs;
    this.poll.currentEndsAtMs = endsAtMs;
    this.armPollTimer(this.poll.perCallMs);
    return {
      pollId: this.poll.pollId,
      context: this.poll.context,
      round: this.poll.round,
      index: this.poll.callIdx + 1,
      total: this.poll.calls.length,
      playerId: call.playerId,
      roles: call.roles,
      endsAtMs,
    };
  }

  /** Set by the wire layer: the per-call time ran out (the call is recorded as NO_ANSWER there). */
  onPollTimeoutHook: (() => void) | null = null;

  private armPollTimer(ms: number): void {
    if (!this.poll) return;
    this.poll.callTimer?.();
    const idx = this.poll.callIdx;
    const timer = setTimeout(() => {
      if (this.poll && this.poll.callIdx === idx) this.onPollTimeoutHook?.();
    }, ms);
    this.poll.callTimer = () => clearTimeout(timer);
  }

  answerPoll(playerId: PlayerId, answer: PollAnswer): PayloadMap['poll.answered'] | null {
    if (!this.poll) err('STALE_ID');
    const call = this.poll.calls[this.poll.callIdx];
    if (!call || call.playerId !== playerId) err('NOT_YOUR_TURN');
    this.poll.callTimer?.();
    this.poll.callTimer = null;
    const entry: PollEntry = { playerId, roles: call.roles, answer };
    this.poll.entries.push(entry);
    this.poll.callIdx += 1;
    return { pollId: this.poll.pollId, entry };
  }

  timeoutCurrentPollCall(): PayloadMap['poll.answered'] | null {
    if (!this.poll) return null;
    const call = this.poll.calls[this.poll.callIdx];
    if (!call) return null;
    this.poll.callTimer?.();
    this.poll.callTimer = null;
    const entry: PollEntry = { playerId: call.playerId, roles: call.roles, answer: 'NO_ANSWER' };
    this.poll.entries.push(entry);
    this.poll.callIdx += 1;
    return { pollId: this.poll.pollId, entry };
  }

  isPollDone(): boolean {
    return this.poll !== null && this.poll.callIdx >= this.poll.calls.length;
  }

  finishPoll(): PayloadMap['poll.result'] {
    if (!this.poll) throw new Error('no active poll');
    const answers = [...this.poll.entries, ...this.poll.disconnectedEntries];
    const noGoCount = answers.filter((a) => a.answer === 'NO_GO').length;
    const allGo = answers.every((a) => a.answer !== 'NO_GO');
    const base = { pollId: this.poll.pollId, context: this.poll.context, round: this.poll.round, answers, allGo, noGoCount };
    const withSeq = this.appendOutcome('poll.result', base as unknown as Record<string, unknown>);
    this.poll.callTimer?.();
    this.poll = null;
    return withSeq as unknown as PayloadMap['poll.result'];
  }

  cancelPoll(): void {
    this.poll?.callTimer?.();
    this.poll = null;
  }

  // ───────────────────────────── abilities ─────────────────────────────

  /**
   * FLIGHT's Decision Time (messages.md `ability.use`): valid only in VOTE, RUNOFF or a tie-break
   * stage of the active round. In a tie-break `optionId` is required and must be a tied option; in
   * VOTE / RUNOFF it is optional and must be a candidate. The caller ends the stage afterwards.
   */
  useFlightDecisionTime(roundId: string | undefined, optionId: OptionId | undefined): void {
    if (!roundId) err('BAD_PAYLOAD', null, 'ability.use', { field: 'roundId' });
    if (!this.round || this.round.roundId !== roundId) err('STALE_ID');
    if (this.abilitiesUsed.has('FLIGHT')) err('ABILITY_USED');
    const stage = this.round.stage;
    if (stage !== 'VOTE' && stage !== 'RUNOFF' && stage !== 'TIEBREAK_TRIVIA' && stage !== 'TIEBREAK_PICK') err('WRONG_STAGE');
    const tiebreak = stage === 'TIEBREAK_TRIVIA' || stage === 'TIEBREAK_PICK';
    if (tiebreak && !optionId) err('BAD_PAYLOAD', null, 'ability.use', { field: 'optionId' });
    if (optionId) {
      const candidates: readonly OptionId[] = tiebreak
        ? this.round.tiedOptionIds
        : stage === 'RUNOFF'
          ? (this.round.runoffCandidates ?? [])
          : this.round.options.map((o) => o.id);
      if (!candidates.includes(optionId)) err('UNKNOWN_OPTION');
    }
    this.abilitiesUsed.add('FLIGHT');
    if (optionId) this.round.decisionTimeOptionId = optionId;
  }

  /** Tie-break stages ended by Decision Time: the chosen option wins outright. */
  resolveDecisionTimeTiebreak(): PayloadMap['vote.result'] | null {
    const r = this.round;
    if (!r || r.decisionTimeOptionId === null || !r.tiedOptionIds.includes(r.decisionTimeOptionId)) return null;
    return this.finalizeResult('DECISION_TIME', r.decisionTimeOptionId, r.tieCounts ?? new Map(), r.tiedOptionIds);
  }

  /**
   * A non-FLIGHT ability request (messages.md `ability.use`): spent only if the host accepts within
   * 5 s. A pending request for the same role counts as ABILITY_USED. `seq` is the player's
   * `ability.use` seq, used as `re` of an ABILITY_REJECTED error.
   */
  requestAbility(playerId: PlayerId, role: RoleId, stageIndex: number | null, seq: number | null = null): string {
    if (this.abilitiesUsed.has(role)) err('ABILITY_USED');
    for (const r of this.abilityRequests.values()) if (r.role === role) err('ABILITY_USED');
    const phase = this.phase?.phase;
    if (role !== 'PM' && (phase === undefined || phase === 'LOBBY' || phase === 'DEBRIEF' || phase === 'CAMPAIGN_HUB')) err('WRONG_PHASE');
    const requestId = this.nextRequestId();
    const timer = setTimeout(() => this.declineAbility(requestId), ABILITY_ANSWER_TIMEOUT_MS);
    this.abilityRequests.set(requestId, { playerId, role, stageIndex, seq, timer });
    return requestId;
  }

  /** Declines a pending request (host said no, 5 s elapsed, or the host dropped): ABILITY_REJECTED to the player. */
  declineAbility(requestId: string): void {
    const req = this.abilityRequests.get(requestId);
    if (!req) return;
    clearTimeout(req.timer);
    this.abilityRequests.delete(requestId);
    this.players.get(req.playerId)?.conn?.sendError({ code: 'ABILITY_REJECTED', fatal: false, re: req.seq, reT: 'ability.use' });
  }

  declineAllAbilityRequests(): void {
    for (const id of [...this.abilityRequests.keys()]) this.declineAbility(id);
  }

  resolveAbilityRequest(requestId: string, accepted: boolean): { playerId: PlayerId; role: RoleId; stageIndex: number | null } {
    const req = this.abilityRequests.get(requestId);
    if (!req) err('STALE_ID');
    clearTimeout(req.timer);
    this.abilityRequests.delete(requestId);
    if (accepted) this.abilitiesUsed.add(req.role);
    else this.players.get(req.playerId)?.conn?.sendError({ code: 'ABILITY_REJECTED', fatal: false, re: req.seq, reT: 'ability.use' });
    return req;
  }

  consumeAbility(role: RoleId): void {
    if (this.abilitiesUsed.has(role)) err('ABILITY_USED');
    this.abilitiesUsed.add(role);
  }

  newMissionReset(): void {
    this.abilitiesUsed.clear();
    for (const p of this.players.values()) p.vetoAvailable = true;
    const phaseEntry = this.sticky.get('phase.set');
    this.sticky.clear();
    if (phaseEntry) this.sticky.set('phase.set', phaseEntry);
    this.missionSeq += 1;
    this.promotePending();
  }

  /**
   * Promotes connected pending spectators to players, in join order, while seats are free
   * (messages.md §4.2). The token stays valid, the SpectatorId is retired, roles are rebalanced with
   * the arrival rule when roles are locked. Pending spectators that are currently disconnected wait
   * for a later round (simplification: they have no live socket to receive `room.promoted`).
   * Returns the promoted player ids.
   */
  promotePending(): PlayerId[] {
    const promoted: PlayerId[] = [];
    const pending = [...this.spectators.values()].filter((sp) => sp.pendingPlayer && sp.conn !== null && sp.pendingProfile !== null);
    let lastConn: Connection | null = null;
    for (const sp of pending) {
      if (this.players.size >= 10) break;
      const profile = sp.pendingProfile!;
      const taken = (nick: string) => [...this.players.values()].some((p) => p.nickname.toLowerCase() === nick.toLowerCase());
      const check = checkNickname(profile.nickname, taken);
      const nickname = check.ok ? check.nickname : (check.suggestion ?? `${profile.nickname}2`);
      const id = this.nextPlayerId();
      const slot = this.freeSlot();
      const conn = sp.conn!;
      const rec: PlayerRecord = { id, slot, nickname, avatar: profile.avatar, prefs: sp.prefs, token: sp.token, conn, hold: null, vetoAvailable: true };
      this.spectators.delete(sp.id);
      this.players.set(id, rec);
      conn.kind = 'PLAYER';
      conn.playerId = id;
      conn.spectatorId = null;
      if (this.roleLocked) {
        const bySlotDesc = [...this.players.values()].filter((p) => p.id !== id).sort((a, b) => b.slot - a.slot).map((p) => p.id);
        this.assignment = onArrive(this.assignment, id, bySlotDesc);
      } else {
        this.recomputeLobbyGroupsOnCountChange();
      }
      const roles = [...(this.assignment.get(id) ?? [])];
      conn.send('room.promoted' as never, { id, slot, roles } as never);
      promoted.push(id);
      lastConn = conn;
    }
    if (lastConn) {
      this.broadcastRoomState(lastConn);
      this.broadcastRolesState(lastConn);
    }
    return promoted;
  }

  // ───────────────────────────── pause ─────────────────────────────

  hostPause(): PayloadMap['game.paused'] | null {
    if (this.pauseState.paused) return null;
    this.pauseState = pauseState(this.clock, 'HOST_REQUEST');
    this.freezeAllHolds();
    return { reason: 'HOST_REQUEST', atMs: this.clock.nowMs(), roomExpiresAtMs: null };
  }

  hostResume(): PayloadMap['game.resumed'] | null {
    if (!this.pauseState.paused) return null;
    const { state, pausedForMs } = resumeState(this.pauseState, this.clock);
    this.pauseState = state;
    for (const p of this.players.values()) if (p.hold) p.hold = unfreezeHold(p.hold, this.clock);
    for (const sp of this.spectators.values()) if (sp.hold) sp.hold = unfreezeHold(sp.hold, this.clock);
    this.thawStageAndPollTimers();
    if (this.round?.stageEndsAtMs !== null && this.round) this.round.stageEndsAtMs = shift(this.round.stageEndsAtMs, pausedForMs);
    if (this.poll?.currentEndsAtMs !== null && this.poll) this.poll.currentEndsAtMs = shift(this.poll.currentEndsAtMs, pausedForMs);
    return { atMs: this.clock.nowMs(), pausedForMs };
  }
}
