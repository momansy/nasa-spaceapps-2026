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
import { groupsForCount, lockAssignment, onLeave, onRotate, toRoleGroups, type Assignment } from '../roles/roles.js';
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
  resolveAfterTrivia,
  resolveRunoffClose,
  resolveVoteClose,
  resolveTieSync,
  type VoteCloseContext,
} from '../votes/resolve.js';
import { systemClock, type Clock } from '../timers/clock.js';
import { freezeHold, holdExpiresAtMs, startHold, unfreezeHold, type SlotHold } from '../timers/reconnect.js';
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

  roleMode: RoleAssignMode = 'RANDOM';
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

  private abilityRequests = new Map<string, { playerId: PlayerId; role: RoleId; stageIndex: number | null }>();
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

  /** Generic broadcast: resolves recipients from MESSAGE_META, caches stickies, appends outcomes. */
  broadcast(sender: Connection, t: MessageType, d: Record<string, unknown>): void {
    this.broadcastExplicit(t, d, sender);
  }

  /** Broadcasts a server-constructed message (vote.*, poll.*, room.state, …) using the same
   *  MESSAGE_META-driven recipient resolution as the generic relay. `sender` matters only for
   *  the (rare, here unused by this method's callers) SENDER route. */
  broadcastExplicit(t: MessageType, d: Record<string, unknown>, sender: Connection | null = null): void {
    const meta = MESSAGE_META[t];
    const recipients = recipientsFor(t, d, (sender ?? this.hostConn) as Connection, this.routingCtx());
    this.sendTo(recipients, t, d);
    if (meta.sticky) {
      const key = typeof d.role === 'string' ? `${t}:${d.role}` : t;
      this.sticky.set(key, { t, d });
    }
    if (t === 'mg.summary' || t === 'mg.cancel') this.sticky.delete('mg.start');
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

  buildRolesState(): PayloadMap['roles.state'] {
    const flightVotes: Array<{ playerId: PlayerId; n: number }> = [];
    const tally = new Map<PlayerId, number>();
    for (const candidate of this.roleVotes.values()) tally.set(candidate, (tally.get(candidate) ?? 0) + 1);
    for (const [playerId, n] of tally) flightVotes.push({ playerId, n });
    return {
      mode: this.roleMode,
      locked: this.roleLocked,
      groups: toRoleGroups(this.assignment),
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
      const rec: SpectatorRecord = { id, prefs: prefs ?? { ...DEFAULT_PREFS }, token: generateToken(), conn, pendingPlayer: true, hold: null };
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
    const rec: SpectatorRecord = { id, prefs: prefs ?? { ...DEFAULT_PREFS }, token: generateToken(), conn, pendingPlayer: false, hold: null };
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

  resumeHost(conn: Connection): void {
    const wasConnected = this.hostConn !== null;
    this.hostConn = conn;
    conn.kind = 'HOST';
    if (!wasConnected) this.broadcastRoomState(conn);
  }

  resumePlayer(conn: Connection, rec: PlayerRecord): void {
    if (rec.conn) rec.conn.close(4003, 'REPLACED');
    rec.conn = conn;
    rec.hold = null;
    conn.kind = 'PLAYER';
    conn.playerId = rec.id;
    this.broadcastRoomState(conn);
  }

  resumeSpectator(conn: Connection, rec: SpectatorRecord): void {
    if (rec.conn) rec.conn.close(4003, 'REPLACED');
    rec.conn = conn;
    rec.hold = null;
    conn.kind = 'SPECTATOR';
    conn.spectatorId = rec.id;
    this.broadcastRoomState(conn);
  }

  disconnectPlayer(playerId: PlayerId): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.conn = null;
    p.hold = startHold(this.clock);
    if (this.pauseState.paused) p.hold = freezeHold(p.hold, this.clock);
    const dummy = this.hostConn ?? this.allPlayerConns()[0] ?? this.allSpectatorConns()[0];
    if (dummy) this.broadcastRoomState(dummy);
  }

  disconnectSpectator(id: SpectatorId): void {
    const s = this.spectators.get(id);
    if (!s) return;
    this.spectators.delete(id); // spectators are forgotten after the same 3 min; held id frees immediately for simplicity
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

  private freezeAllHolds(): void {
    for (const p of this.players.values()) if (p.hold) p.hold = freezeHold(p.hold, this.clock);
  }

  disconnectHost(): void {
    this.hostConn = null;
    if (!this.pauseState.paused) {
      this.pauseState = pauseState(this.clock, 'HOST_DISCONNECTED');
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

  // ───────────────────────────── settings ─────────────────────────────

  applySettingsPatch(patch: SettingsPatch): void {
    this.settings = { ...this.settings, ...patch, a11y: patch.a11y ? { ...patch.a11y } : this.settings.a11y };
  }

  // ───────────────────────────── roles ─────────────────────────────

  setRolePick(playerId: PlayerId, lead: RoleId | null): void {
    if (lead === null) this.rolePicks.delete(playerId);
    else {
      const n = this.players.size;
      const leads = groupsForCount(n).map((g) => g[0]);
      if (!leads.includes(lead)) return;
      for (const [p, l] of this.rolePicks) if (l === lead && p !== playerId) err('ROLE_TAKEN');
      this.rolePicks.set(playerId, lead);
    }
  }

  setRoleVote(voter: PlayerId, candidate: PlayerId): void {
    this.roleVotes.set(voter, candidate);
  }

  lockRoles(): void {
    const playersBySlot = [...this.players.values()].sort((a, b) => a.slot - b.slot).map((p) => p.id);
    this.assignment = lockAssignment({ mode: this.roleMode, playersBySlot, picks: this.rolePicks, votes: this.roleVotes, rng: this.rng });
    this.roleLocked = true;
  }

  setRolesExplicit(assignments: Array<{ playerId: PlayerId; roles: RoleId[] }>): void {
    const next: Assignment = new Map();
    for (const a of assignments) next.set(a.playerId, a.roles);
    this.assignment = next;
    this.roleLocked = true;
  }

  rotateRoles(): void {
    const playersBySlot = [...this.players.values()].sort((a, b) => a.slot - b.slot).map((p) => p.id);
    this.assignment = onRotate(this.assignment, playersBySlot);
    this.roleLocked = true;
  }

  // ───────────────────────────── votes ─────────────────────────────

  openVote(d: PayloadMap['vote.open']): PayloadMap['vote.opened'] {
    if (this.round) err('ROUND_ACTIVE');
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
    };
    const seq = stageSequence(d.kind, d.predict !== null);
    const plan: Array<{ stage: VoteStage; durationMs: number | null }> = seq
      .filter((s): s is VoteStage => s !== 'CLOSED')
      .map((s) => ({
        stage: s,
        durationMs: s === 'VOTE' && solo ? null : stageDurationMs(s, d.kind, this.durationSettings(), d.timers),
      }));
    return {
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

  private stageCandidateIds(stage: VoteStage): OptionId[] {
    if (!this.round) return [];
    if (stage === 'VOTE') return this.winnableOptionStates().map((o) => o.id);
    if (stage === 'RUNOFF') return this.round.runoffCandidates ?? [];
    if (stage === 'TIEBREAK_TRIVIA' || stage === 'TIEBREAK_PICK') return this.round.tiedOptionIds;
    return this.round.options.filter((o) => !this.round!.vetoedIds.has(o.id)).map((o) => o.id);
  }

  /** Cancels any pending real timer this Room holds; for tests and graceful shutdown. */
  stopAllTimers(): void {
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
  onStageEndHook: ((stage: VoteStage, reason: 'TIMER' | 'EARLY') => void) | null = null;

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
      err('OPTION_NOT_WINNABLE');
    }
    if (isSpectator) {
      this.round.audienceBallots.set(voterId, optionId);
      return;
    }
    if (!this.round.voters.includes(voterId)) err('NOT_A_VOTER');
    this.round.ballots.set(voterId, optionId);
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

  applyVetoToRound(playerId: PlayerId, optionId: OptionId): void {
    if (!this.round) err('STALE_ID');
    if (!vetoAllowed(this.round.kind)) err('VETO_NOT_ALLOWED');
    if (this.round.stage !== 'INSPECT' && this.round.stage !== 'VOTE') err('VETO_NOT_ALLOWED');
    const player = this.players.get(playerId);
    if (!player) err('UNKNOWN_PLAYER');
    if (!player.vetoAvailable) err('VETO_USED');
    const states = this.round.options.map((o) => ({ id: o.id, costM: o.costM, afford: o.afford, willNotFly: o.willNotFly, fixExists: o.fixExists }));
    const result = applyVeto(states, this.round.vetoedIds, this.abilitiesUsed.has('PM'), optionId, this.round.ballots);
    if (!result.ok) err(result.code);
    player.vetoAvailable = false;
    this.round.vetoedIds = result.vetoedIds;
    this.round.vetoes.push({ optionId, playerId });
    for (const voter of result.clearedVoterIds) this.round.ballots.delete(voter);
    this.round.tags = clearTagsForOption(this.round.tags, optionId);
  }

  tagOption(playerId: PlayerId, optionId: OptionId, tag: 'RECOMMENDED' | 'CONCERN' | null): void {
    if (!this.round) err('STALE_ID');
    if (!tagsAllowed(this.round.kind)) err('VETO_NOT_ALLOWED');
    const role = this.round.ownerRoles.find((r) => this.roleHolderId(r) === playerId);
    if (!role) err('NOT_ROLE_HOLDER');
    this.round.tags = applyTag(this.round.tags, playerId, role, optionId, tag);
  }

  recordPredictAnswer(voterId: PlayerId, choiceIndex: number, isSpectator: boolean): boolean {
    if (!this.round || !this.round.predict) err('STALE_ID');
    if (isSpectator) {
      this.round.predictAudienceCounts[choiceIndex] = (this.round.predictAudienceCounts[choiceIndex] ?? 0) + 1;
      return false;
    }
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
      audienceVoteWeight: this.settings.audienceVoteWeight as 0 | 1,
      strictMajorityEnabled: this.settings.strictMajority && runoffPossible(this.round.kind, true),
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
      audienceVoteWeight: this.settings.audienceVoteWeight as 0 | 1,
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

  private finalizeResult(method: ResolveMethod, winnerId: OptionId, counts: Map<OptionId, number>, tiedOptionIds: OptionId[]): PayloadMap['vote.result'] {
    if (!this.round) throw new Error('no active round');
    const optCounts = [...counts.entries()].map(([optionId, n]) => ({ optionId, n }));
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
    if (emergencyFunding) this.abilitiesUsed.add('PM');
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
      audienceBallot: null,
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
    this.round = null;
  }

  cancelRound(): PayloadMap['vote.cancelled'] | null {
    if (!this.round) return null;
    this.clearStageTimer();
    const roundId = this.round.roundId;
    this.round = null;
    return { roundId, reason: 'HOST' };
  }

  // ───────────────────────────── polls (GO/NO-GO) ─────────────────────────────

  openPoll(d: PayloadMap['poll.open']): void {
    if (this.poll) err('ROUND_ACTIVE');
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

  answerPoll(playerId: PlayerId, answer: PollAnswer): PayloadMap['poll.answered'] | null {
    if (!this.poll) err('STALE_ID');
    const call = this.poll.calls[this.poll.callIdx];
    if (!call || call.playerId !== playerId) err('NOT_YOUR_TURN');
    const entry: PollEntry = { playerId, roles: call.roles, answer };
    this.poll.entries.push(entry);
    this.poll.callIdx += 1;
    return { pollId: this.poll.pollId, entry };
  }

  timeoutCurrentPollCall(): PayloadMap['poll.answered'] | null {
    if (!this.poll) return null;
    const call = this.poll.calls[this.poll.callIdx];
    if (!call) return null;
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
    this.poll = null;
    return withSeq as unknown as PayloadMap['poll.result'];
  }

  cancelPoll(): void {
    this.poll = null;
  }

  // ───────────────────────────── abilities ─────────────────────────────

  useFlightDecisionTime(roundId: string, optionId: OptionId | undefined): void {
    if (!this.round || this.round.roundId !== roundId) err('STALE_ID');
    if (this.abilitiesUsed.has('FLIGHT')) err('ABILITY_USED');
    this.abilitiesUsed.add('FLIGHT');
    if (optionId) this.round.decisionTimeOptionId = optionId;
  }

  requestAbility(playerId: PlayerId, role: RoleId, stageIndex: number | null): string {
    if (this.abilitiesUsed.has(role)) err('ABILITY_USED');
    const requestId = this.nextRequestId();
    this.abilityRequests.set(requestId, { playerId, role, stageIndex });
    return requestId;
  }

  resolveAbilityRequest(requestId: string, accepted: boolean): { playerId: PlayerId; role: RoleId; stageIndex: number | null } {
    const req = this.abilityRequests.get(requestId);
    if (!req) err('STALE_ID');
    this.abilityRequests.delete(requestId);
    if (accepted) this.abilitiesUsed.add(req.role);
    return req;
  }

  consumeAbility(role: RoleId): void {
    this.abilitiesUsed.add(role);
  }

  newMissionReset(): void {
    this.abilitiesUsed.clear();
    for (const p of this.players.values()) p.vetoAvailable = true;
    const phaseEntry = this.sticky.get('phase.set');
    this.sticky.clear();
    if (phaseEntry) this.sticky.set('phase.set', phaseEntry);
    this.missionSeq += 1;
  }

  // ───────────────────────────── pause ─────────────────────────────

  hostPause(): PayloadMap['game.paused'] {
    this.pauseState = pauseState(this.clock, 'HOST_REQUEST');
    this.freezeAllHolds();
    return { reason: 'HOST_REQUEST', atMs: this.clock.nowMs(), roomExpiresAtMs: null };
  }

  hostResume(): PayloadMap['game.resumed'] {
    const { state, pausedForMs } = resumeState(this.pauseState, this.clock);
    this.pauseState = state;
    for (const p of this.players.values()) if (p.hold) p.hold = unfreezeHold(p.hold, this.clock);
    if (this.round?.stageEndsAtMs !== null && this.round) this.round.stageEndsAtMs = shift(this.round.stageEndsAtMs, pausedForMs);
    if (this.poll?.currentEndsAtMs !== null && this.poll) this.poll.currentEndsAtMs = shift(this.poll.currentEndsAtMs, pausedForMs);
    return { atMs: this.clock.nowMs(), pausedForMs };
  }
}
