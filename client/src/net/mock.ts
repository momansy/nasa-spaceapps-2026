// In-browser mock of the room server *and* the Unity host (`?mock=1`). It speaks the real
// protocol (protocol/messages.md) over an in-memory socket, so the whole client (ProtocolClient,
// store, screens) runs exactly as against the real server. It plays one scripted session:
//
//   lobby (four bot crew members join) → roles lock (you get BOOSTER+STRUCT) → briefing →
//   part vote 1 "first-stage engine" with a Predict question →
//   quick vote "engine hot-fire test?" →
//   part vote 2 "upper-stage engine" in which a bot vetoes an option (and you may veto too) →
//   part vote 3 "fairing" scripted to tie → trivia sudden-death → pick →
//   Flight Readiness Review GO/NO-GO poll → countdown → flight with role consoles, a Max Q
//   alert whose callout window earns a Good Call → minigame MG-08 Max Q Throttle Bucket →
//   a short coverage blackout → orbit → debrief with score, awards and facts.
//
// Every number the mock "host" sends is a game value invented for the demo; none is computed
// by a simulation. `?speed=2` (or any factor) runs every timer faster. Every frame in both
// directions can be observed with `onFrame` (the test suite validates each against
// protocol/schema/).
import { PROTOCOL_VERSION } from '@protocol';
import type {
  Avatar,
  ConsoleConfigPayload,
  Delta,
  Envelope,
  Message,
  MessageType,
  OptionCount,
  PayloadMap,
  PhaseSetPayload,
  PlayerId,
  PlayerInfo,
  PlayerPrefs,
  PollEntry,
  Question,
  ResolveMethod,
  RoleGroup,
  RoleId,
  RolesStatePayload,
  RoomSettings,
  StagePlan,
  TagKind,
  TelemetryValues,
  VoteKind,
  VoteOpenedPayload,
  VoteOption,
  VoteStage,
  VoteStagePayload,
} from '@protocol';
import type { Connection, SessionStore, SocketLike } from './connection';
import { ProtocolClient } from './protocolClient';
import { APP_VERSION, browserSession } from './wsConnection';

export type FrameDirection = 'in' | 'out';
export type FrameObserver = (dir: FrameDirection, env: Envelope) => void;

export interface MockOptions {
  /** Timer speed factor: 2 runs every scripted delay and stage twice as fast. */
  speed?: number;
  /** Observer of every frame: 'in' = client → server, 'out' = server → client. */
  onFrame?: FrameObserver;
  /** Server clock minus local clock, to exercise the client's offset estimate. */
  serverOffsetMs?: number;
}

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

const BOT_PREFS: PlayerPrefs = {
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

/** Bot crew, in join order. Nicknames are fixed demo call signs. */
const BOTS: Array<{ nickname: string; avatar: Avatar }> = [
  { nickname: 'Vega', avatar: { suitId: 'suit_teal', patchId: 'patch_star' } },
  { nickname: 'Kepler', avatar: { suitId: 'suit_white', patchId: 'patch_orbit' } },
  { nickname: 'Nova', avatar: { suitId: 'suit_violet', patchId: 'patch_comet' } },
  { nickname: 'Rio', avatar: { suitId: 'suit_yellow', patchId: 'patch_planet' } },
];

/** Role groups for 1–5 players (messages.md 5.1). The mock never has more than five. */
const GROUPS: Record<number, RoleId[][]> = {
  1: [['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM']],
  2: [['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'PM'], ['FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
  3: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT', 'GUIDO', 'FIDO'], ['EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
  4: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO', 'FIDO'], ['EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
  5: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO', 'FIDO'], ['EECOM', 'INCO'], ['PAYLOAD', 'RETRO']],
};

const STICKY = new Set<MessageType>(['phase.set', 'build.state', 'boost.state', 'sync.meter', 'pilot.assign', 'blackout.set', 'debrief.score', 'debrief.awards', 'debrief.facts']);

const BYE_CODES = { LEFT: 4009 } as const;

/** Ascent time compression of the demo host after lift-off (game value). */
const MET_COMPRESSION = 11;

function randomToken(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let s = '';
  for (let i = 0; i < 24; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function normaliseNickname(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

const NICK_RE = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,14}[\p{L}\p{N}]$/u;

// ───────────────────────────── vote spec ─────────────────────────────

interface BotBallot {
  bot: number;
  optionId: OptionIdOrFn;
  atMs: number;
}
type OptionIdOrFn = string | ((room: MockRoom) => string | null);

interface VoteSpec {
  roundId: string;
  kind: VoteKind;
  subjectId: string | null;
  titleKey: string;
  whyKey: string | null;
  ownerRoles: RoleId[];
  options: VoteOption[];
  predict: Question | null;
  trivia: Question | null;
  coinSeed: number;
  ballots: BotBallot[];
  /** Bot predict / trivia answers: [bot index, choice, after ms]. */
  predictAnswers?: Array<[number, number, number]>;
  triviaAnswers?: Array<[number, number, number]>;
  vetoes?: Array<{ bot: number; optionId: string; atMs: number; stage: VoteStage }>;
  pings?: Array<{ bot: number; pingId: PayloadMap['ping.send']['pingId'] | null; emoji?: PayloadMap['react.send']['emoji']; optionId: string | null; atMs: number; stage: VoteStage }>;
  insight?: Array<{ role: RoleId; lines: Array<{ optionId: string; key: string; args: Record<string, string | number> }> }>;
  codex?: (winner: string) => string[];
  commitDeltas?: (winner: string) => Delta[];
}

interface ActiveVote {
  spec: VoteSpec;
  opened: VoteOpenedPayload;
  stage: VoteStagePayload;
  ballots: Map<PlayerId, string>;
  predicts: Map<PlayerId, number>;
  trivia: Array<{ playerId: PlayerId; choiceIndex: number; correct: boolean }>;
  tags: Array<{ optionId: string; playerId: PlayerId; role: RoleId; tag: TagKind }>;
  vetoes: Array<{ optionId: string; playerId: PlayerId }>;
  tied: string[];
  triviaWinner: PlayerId | null;
  pick: string | null;
  /** Resolves the wait of the current stage early. */
  endStage: (() => void) | null;
}

const opt = (id: string, extra: Partial<VoteOption> = {}): VoteOption => ({
  id,
  partId: id,
  label: null,
  costM: 0,
  afford: 'OK',
  overBudgetByM: 0,
  overScheduleByDays: 0,
  willNotFly: false,
  fixExists: false,
  warnings: [],
  deltas: [],
  ...extra,
});

const d = (metric: Delta['metric'], value: number, delta: number, rating: Delta['rating']): Delta => ({ metric, value, delta, rating });

// ───────────────────────────── socket ─────────────────────────────

class MockSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: ((code: number) => void) | null = null;
  closed = false;
  constructor(private readonly room: MockRoom) {}
  send(data: string) {
    if (this.closed) throw new Error('closed');
    // Deliver asynchronously, like a network.
    setTimeout(() => this.room.receive(this, data), 4);
  }
  close() {
    this.shutdown(1000);
  }
  shutdown(code: number) {
    if (this.closed) return;
    this.closed = true;
    this.room.detach(this);
    setTimeout(() => this.onclose?.(code), 0);
  }
}

// ───────────────────────────── room ─────────────────────────────

export class MockRoom {
  readonly speed: number;
  private readonly onFrame: FrameObserver | null;
  private readonly offsetMs: number;
  private socket: MockSocket | null = null;
  private outSeq = 0;
  private inSeq = 0;
  private handshaken = false;

  code = 'KQXM';
  private token: string | null = null;
  meId: PlayerId | null = null;
  players: PlayerInfo[] = [];
  private nextPlayer = 1;
  settings: RoomSettings = DEFAULT_SETTINGS;
  roles: RolesStatePayload = { mode: 'RANDOM', locked: false, groups: [], flightVotes: [], abilitiesUsed: [] };
  private sticky = new Map<string, Message>();
  vote: ActiveVote | null = null;
  private poll: { pollId: string; call: PayloadMap['poll.call']; entries: PollEntry[]; answer: ((a: 'GO' | 'NO_GO') => void) | null } | null = null;
  private mg: { start: PayloadMap['mg.start']; result: PayloadMap['mg.result'] | null; ready: boolean; onResult: (() => void) | null; shared: Record<string, number | string | boolean | number[]>; stateN: number } | null = null;
  private alerts = new Map<string, PayloadMap['console.alert']>();
  private outcomeSeq = 0;
  private started = false;
  private stopped = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private sync = 0;
  private teamKp = 0;
  private stats = { goodCalls: 0, predictionsCorrect: 0, kp: 0, minigame: false };
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private flightT0 = 0;

  constructor(opts: MockOptions = {}) {
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
    this.onFrame = opts.onFrame ?? null;
    this.offsetMs = opts.serverOffsetMs ?? 1500;
  }

  // ───────── clock and timers ─────────

  now(): number {
    return Math.round(Date.now() + this.offsetMs);
  }

  /** Scripted delay in game milliseconds (scaled by speed). */
  ms(gameMs: number): number {
    return Math.max(1, Math.round(gameMs / this.speed));
  }

  private later(gameMs: number, fn: () => void) {
    const h = setTimeout(() => {
      this.timers.delete(h);
      if (!this.stopped) fn();
    }, this.ms(gameMs));
    this.timers.add(h);
    return h;
  }

  sleep(gameMs: number): Promise<void> {
    return new Promise((resolve) => this.later(gameMs, resolve));
  }

  /** Waits for `gameMs`, or less when `register` hands out an early-finish callback that is called. */
  private wait(gameMs: number, register?: (finish: () => void) => void): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(h);
        this.timers.delete(h);
        resolve();
      };
      const h = this.later(gameMs, finish);
      register?.(finish);
    });
  }

  stop() {
    this.stopped = true;
    this.timers.forEach((h) => clearTimeout(h));
    this.timers.clear();
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
  }

  // ───────── connections ─────────

  connect(): SocketLike {
    const s = new MockSocket(this);
    setTimeout(() => {
      if (!s.closed) s.onopen?.();
    }, 15);
    return s;
  }

  /** Drops the current connection as a network failure would (reconnect test hook). */
  dropConnection() {
    const s = this.socket;
    if (s) s.shutdown(1006);
  }

  detach(s: MockSocket) {
    if (this.socket === s) {
      this.socket = null;
      this.setConnected(false);
    }
  }

  private setConnected(on: boolean) {
    const me = this.players.find((p) => p.id === this.meId);
    if (!me || me.connected === on) return;
    me.connected = on;
    me.slotExpiresAtMs = on ? null : this.now() + 180000;
  }

  private emitTo(sock: MockSocket | null, t: MessageType, d: unknown) {
    if (!sock || sock.closed) return;
    const env = { t, seq: ++this.outSeq, d } as Envelope;
    this.onFrame?.('out', env);
    const text = JSON.stringify(env);
    setTimeout(() => {
      if (!sock.closed) sock.onmessage?.(text);
    }, 3);
  }

  /** Sends one message to the phone (the only real client of this room). */
  send<T extends MessageType>(t: T, d: PayloadMap[T]) {
    if (STICKY.has(t)) this.sticky.set(t, { t, seq: 0, d } as Message);
    if (t === 'console.config') this.sticky.set(`console.config:${(d as PayloadMap['console.config']).role}`, { t, seq: 0, d } as Message);
    this.emitTo(this.socket, t, d);
  }

  private error(sock: MockSocket, code: PayloadMap['error']['code'], re: number | null, reT: string | null, extra: Partial<PayloadMap['error']> = {}) {
    this.emitTo(sock, 'error', { code, fatal: false, re, reT, ...extra });
  }

  receive(sock: MockSocket, data: string) {
    if (sock.closed) return;
    let env: Envelope;
    try {
      env = JSON.parse(data) as Envelope;
    } catch {
      this.error(sock, 'BAD_ENVELOPE', null, null);
      return;
    }
    this.onFrame?.('in', env);
    if (sock !== this.socket) {
      // A new connection: per-connection sequence numbers restart.
      if (env.t !== 'hello') {
        this.error(sock, 'HANDSHAKE_REQUIRED', env.seq, env.t);
        return;
      }
      this.socket?.shutdown(4003);
      this.socket = sock;
      this.outSeq = 0;
      this.inSeq = 0;
      this.handshaken = false;
    }
    if (typeof env.seq !== 'number' || env.seq <= this.inSeq) {
      this.error(sock, 'BAD_ENVELOPE', env.seq ?? null, env.t ?? null);
      return;
    }
    this.inSeq = env.seq;
    this.handle(sock, env as Message);
  }

  private handle(sock: MockSocket, m: Message) {
    switch (m.t) {
      case 'hello':
        if (m.d.protocolVersion !== PROTOCOL_VERSION) {
          this.emitTo(sock, 'error', { code: 'VERSION_MISMATCH', fatal: true, re: m.seq, reT: m.t, serverProtocolVersion: PROTOCOL_VERSION });
          this.emitTo(sock, 'bye', { reason: 'VERSION_MISMATCH', closeCode: 4001, canResume: false });
          sock.shutdown(4001);
          return;
        }
        this.handshaken = true;
        this.emitTo(sock, 'hello.ok', { protocolVersion: PROTOCOL_VERSION, serverTimeMs: this.now(), heartbeatMs: 5000, idleTimeoutMs: 15000, maxFrameBytes: 2048, maxMsgsPerSec: 60, maxBytesPerSec: 8192 });
        return;
      case 'clock.ping':
        this.emitTo(sock, 'clock.pong', { clientTimeMs: m.d.clientTimeMs, serverTimeMs: this.now() });
        return;
      default:
        break;
    }
    if (!this.handshaken) {
      this.error(sock, 'HANDSHAKE_REQUIRED', m.seq, m.t);
      return;
    }
    switch (m.t) {
      case 'room.join':
        this.onJoin(sock, m.seq, m.d);
        return;
      case 'room.resume':
        this.onResume(sock, m.seq, m.d);
        return;
      default:
        break;
    }
    if (!this.meId || !this.token) {
      this.error(sock, 'NOT_IN_ROOM', m.seq, m.t);
      return;
    }
    this.onPlayerMessage(sock, m);
  }

  // ───────── membership ─────────

  private onJoin(sock: MockSocket, seq: number, d: PayloadMap['room.join']) {
    if (this.meId) {
      this.error(sock, 'ALREADY_IN_ROOM', seq, 'room.join');
      return;
    }
    if (!/^[A-HJ-NP-Z]{4}$/.test(d.room)) {
      this.error(sock, 'ROOM_NOT_FOUND', seq, 'room.join');
      return;
    }
    if (d.as === 'SPECTATOR') {
      this.error(sock, 'FORBIDDEN', seq, 'room.join');
      return;
    }
    const nick = normaliseNickname(d.nickname ?? '');
    if (!NICK_RE.test(nick)) {
      this.error(sock, 'NICK_REJECTED', seq, 'room.join', { suggestion: 'Comet' });
      return;
    }
    if (BOTS.some((b) => b.nickname.toLowerCase() === nick.toLowerCase())) {
      this.error(sock, 'NICK_TAKEN', seq, 'room.join', { suggestion: `${nick.slice(0, 13)}-2` });
      return;
    }
    this.code = d.room;
    this.token = randomToken();
    const id = `p${this.nextPlayer++}`;
    this.meId = id;
    this.players.push({
      id,
      slot: 1,
      nickname: nick,
      avatar: d.avatar ?? { suitId: 'suit_orange', patchId: 'patch_rocket' },
      connected: true,
      slotExpiresAtMs: null,
      vetoAvailable: true,
      prefs: d.prefs ?? BOT_PREFS,
    });
    this.regroup();
    this.emitTo(sock, 'room.joined', { room: this.code, kind: 'PLAYER', id, slot: 1, nickname: nick, token: this.token, spectatorReason: null, pendingPlayer: false });
    this.snapshot(sock);
    if (!this.started) {
      this.started = true;
      void this.script().catch(() => {
        /* the room was stopped */
      });
    }
  }

  private onResume(sock: MockSocket, seq: number, d: PayloadMap['room.resume']) {
    if (!this.token || d.token !== this.token || d.room !== this.code) {
      this.error(sock, this.token ? 'TOKEN_INVALID' : 'ROOM_NOT_FOUND', seq, 'room.resume');
      return;
    }
    this.setConnected(true);
    this.emitTo(sock, 'room.resumed', { room: this.code, kind: 'PLAYER', id: this.meId!, slot: 1, pendingPlayer: false, paused: false });
    this.snapshot(sock);
    this.send('room.state', this.roomState());
  }

  /** messages.md 4.5, phone side. */
  private snapshot(sock: MockSocket) {
    this.emitTo(sock, 'settings.state', { settings: this.settings });
    this.emitTo(sock, 'room.state', this.roomState());
    this.emitTo(sock, 'roles.state', this.roles);
    for (const [key, m] of this.sticky) {
      if (key.startsWith('console.config:')) {
        const role = (m.d as PayloadMap['console.config']).role;
        if (!this.rolesOf(this.meId).includes(role)) continue;
      }
      this.emitTo(sock, m.t, m.d);
    }
    const v = this.vote;
    if (v) {
      this.emitTo(sock, 'vote.opened', v.opened);
      for (const ins of v.spec.insight ?? []) if (this.rolesOf(this.meId).includes(ins.role)) this.emitTo(sock, 'vote.insight', this.insightPayload(v, ins));
      for (const ve of v.vetoes) this.emitTo(sock, 'vote.vetoed', { roundId: v.opened.roundId, optionId: ve.optionId, playerId: ve.playerId, clearedVoterIds: [], remainingOptionIds: this.remaining(v) });
      this.emitTo(sock, 'vote.tags', { roundId: v.opened.roundId, tags: v.tags });
      if (v.stage.stage === 'TIEBREAK_TRIVIA' && v.spec.trivia) this.emitTo(sock, 'vote.trivia.open', { roundId: v.opened.roundId, question: this.publicQ(v.spec.trivia), tiedOptionIds: v.tied });
      this.emitTo(sock, 'vote.stage', v.stage);
      if (v.stage.stage === 'VOTE' || v.stage.stage === 'RUNOFF') this.emitTo(sock, 'vote.tally', this.tally(v));
      this.emitTo(sock, 'vote.ack', { roundId: v.opened.roundId, optionId: v.ballots.get(this.meId!) ?? null, reason: 'SNAPSHOT' });
    }
    if (this.poll) this.emitTo(sock, 'poll.call', this.poll.call);
    if (this.mg && !this.mg.result) this.emitTo(sock, 'mg.start', this.mg.start);
    this.emitTo(sock, 'snapshot.end', { serverTimeMs: this.now(), lastOutcomeSeq: this.outcomeSeq });
  }

  roomState(): PayloadMap['room.state'] {
    return { room: this.code, hostConnected: true, paused: false, players: [...this.players].sort((a, b) => a.slot - b.slot), spectatorCount: 0, pendingPlayerCount: 0 };
  }

  rolesOf(playerId: PlayerId | null): RoleId[] {
    return this.roles.groups.filter((g) => g.playerId === playerId).flatMap((g) => g.roles);
  }

  holderOf(role: RoleId): PlayerId | null {
    return this.roles.groups.find((g) => g.roles.includes(role))?.playerId ?? null;
  }

  botId(i: number): PlayerId {
    return this.players.filter((p) => p.id !== this.meId)[i]!.id;
  }

  private regroup() {
    const n = Math.max(1, Math.min(5, this.players.length));
    const groups: RoleGroup[] = GROUPS[n]!.map((roles) => ({ lead: roles[0]!, roles, playerId: null }));
    this.roles = { ...this.roles, groups };
  }

  private addBot(i: number) {
    const b = BOTS[i]!;
    const id = `p${this.nextPlayer++}`;
    this.players.push({ id, slot: this.players.length + 1, nickname: b.nickname, avatar: b.avatar, connected: true, slotExpiresAtMs: null, vetoAvailable: true, prefs: BOT_PREFS });
    this.regroup();
    this.send('room.state', this.roomState());
    this.send('roles.state', this.roles);
  }

  /** Locks roles: the phone's player gets BOOSTER+STRUCT, bot 0 is FLIGHT (deterministic demo). */
  private lockRoles() {
    const me = this.meId!;
    const bots = this.players.filter((p) => p.id !== me).map((p) => p.id);
    const order: PlayerId[] = [bots[0]!, me, bots[1]!, bots[2]!, bots[3]!];
    this.roles = { ...this.roles, locked: true, groups: this.roles.groups.map((g, i) => ({ ...g, playerId: order[i] ?? null })) };
    this.send('roles.state', this.roles);
  }

  private phase(p: Partial<PhaseSetPayload> & Pick<PhaseSetPayload, 'phase'>) {
    const prev = this.sticky.get('phase.set')?.d as PhaseSetPayload | undefined;
    const next: PhaseSetPayload = {
      missionSeq: 1,
      mode: 'QUICK',
      sub: 'NONE',
      review: null,
      flightPhase: null,
      segment: null,
      boosterTrack: false,
      contractId: prev?.contractId ?? null,
      step: null,
      ...p,
    };
    this.send('phase.set', next);
  }

  private notice(kind: PayloadMap['notice.show']['kind'], key: string, durationMs = 5000, factId: string | null = null) {
    this.send('notice.show', { kind, text: { key }, factId, durationMs, to: null });
  }

  // ───────── messages from the phone ─────────

  private onPlayerMessage(sock: MockSocket, m: Message) {
    const me = this.meId!;
    switch (m.t) {
      case 'room.leave':
        this.emitTo(sock, 'bye', { reason: 'LEFT', closeCode: BYE_CODES.LEFT, canResume: false });
        this.players = this.players.filter((p) => p.id !== me);
        this.meId = null;
        this.token = null;
        sock.shutdown(BYE_CODES.LEFT);
        this.stop();
        return;
      case 'player.prefs': {
        const p = this.players.find((x) => x.id === me);
        if (p) p.prefs = m.d.prefs;
        this.send('room.state', this.roomState());
        return;
      }
      case 'player.profile':
        this.error(sock, 'WRONG_PHASE', m.seq, m.t);
        return;
      case 'ping.send':
        this.send('ping.event', { playerId: me, pingId: m.d.pingId, roundId: this.vote?.opened.roundId ?? null, optionId: m.d.optionId });
        return;
      case 'react.send':
        this.send('react.event', { playerId: me, emoji: m.d.emoji });
        return;
      case 'vote.cast':
        this.onCast(sock, m.seq, me, m.d.roundId, m.d.optionId);
        return;
      case 'vote.predict': {
        const v = this.vote;
        if (!v || v.opened.roundId !== m.d.roundId || v.stage.stage !== 'PREDICT') return this.error(sock, 'WRONG_STAGE', m.seq, m.t);
        if (v.predicts.has(me)) return this.error(sock, 'ALREADY_ANSWERED', m.seq, m.t);
        v.predicts.set(me, m.d.choiceIndex);
        this.checkPredictDone(v);
        return;
      }
      case 'vote.veto':
        this.onVeto(sock, m.seq, me, m.d.roundId, m.d.optionId);
        return;
      case 'vote.tag': {
        const v = this.vote;
        if (!v || v.opened.roundId !== m.d.roundId || !['PREDICT', 'INSPECT', 'VOTE'].includes(v.stage.stage)) return this.error(sock, 'WRONG_STAGE', m.seq, m.t);
        const role = v.opened.ownerRoles.find((r) => this.rolesOf(me).includes(r));
        if (!role) return this.error(sock, 'NOT_ROLE_HOLDER', m.seq, m.t);
        v.tags = v.tags.filter((tg) => !(tg.playerId === me && (tg.optionId === m.d.optionId || (m.d.tag === 'RECOMMENDED' && tg.tag === 'RECOMMENDED'))));
        if (m.d.tag) v.tags.push({ optionId: m.d.optionId, playerId: me, role, tag: m.d.tag });
        this.send('vote.tags', { roundId: v.opened.roundId, tags: v.tags });
        return;
      }
      case 'vote.trivia.answer': {
        const v = this.vote;
        if (!v || v.opened.roundId !== m.d.roundId || v.stage.stage !== 'TIEBREAK_TRIVIA' || !v.spec.trivia) return this.error(sock, 'WRONG_STAGE', m.seq, m.t);
        if (v.trivia.some((a) => a.playerId === me)) return this.error(sock, 'ALREADY_ANSWERED', m.seq, m.t);
        this.triviaAnswer(v, me, m.d.choiceIndex);
        return;
      }
      case 'vote.trivia.pick': {
        const v = this.vote;
        if (!v || v.opened.roundId !== m.d.roundId || v.stage.stage !== 'TIEBREAK_PICK') return this.error(sock, 'WRONG_STAGE', m.seq, m.t);
        if (v.triviaWinner !== me) return this.error(sock, 'NOT_YOUR_TURN', m.seq, m.t);
        if (!v.tied.includes(m.d.optionId)) return this.error(sock, 'UNKNOWN_OPTION', m.seq, m.t);
        v.pick = m.d.optionId;
        v.endStage?.();
        return;
      }
      case 'poll.answer': {
        const p = this.poll;
        if (!p || p.pollId !== m.d.pollId) return this.error(sock, 'WRONG_PHASE', m.seq, m.t);
        if (p.call.playerId !== me || !p.answer) return this.error(sock, 'NOT_YOUR_TURN', m.seq, m.t);
        p.answer(m.d.answer);
        return;
      }
      case 'ability.use':
        this.onAbility(sock, m.seq, me, m.d);
        return;
      case 'console.callout': {
        if (!this.rolesOf(me).includes(m.d.role)) return this.error(sock, 'NOT_ROLE_HOLDER', m.seq, m.t);
        // Host side: a matching callout inside the alert window (atMs at most 300 ms before arrival) is a Good Call.
        const arrival = this.now();
        const at = Math.max(m.d.atMs, arrival - 300);
        const alert = [...this.alerts.values()].find((a) => a.role === m.d.role && a.calloutId === m.d.calloutId && (a.arg ?? null) === (m.d.arg ?? null) && at <= a.endsAtMs);
        if (alert) {
          this.alerts.delete(alert.alertId);
          this.stats.goodCalls++;
          this.send('console.goodcall', { playerId: me, role: alert.role, calloutId: alert.calloutId, arg: alert.arg, alertId: alert.alertId, syncDelta: 3, points: 20 });
          this.bumpSync(3, 'GOOD_CALL');
          this.send('haptic.cue', { cue: 'GOOD_CALL', to: [me] });
        }
        return;
      }
      case 'console.request':
        if (!this.rolesOf(me).includes(m.d.role)) return this.error(sock, 'NOT_ROLE_HOLDER', m.seq, m.t);
        return;
      case 'mg.ready':
        if (this.mg && this.mg.start.runId === m.d.runId) this.mg.ready = true;
        return;
      case 'mg.progress':
        return;
      case 'mg.action':
        this.onMgAction(sock, m.seq, me, m.d);
        return;
      case 'mg.result':
        if (this.mg && this.mg.start.runId === m.d.runId && !this.mg.result) {
          this.mg.result = m.d;
          this.mg.onResult?.();
        }
        return;
      case 'roles.pick':
      case 'roles.vote':
        return this.error(sock, 'WRONG_PHASE', m.seq, m.t);
      case 'pilot.input':
      case 'pilot.action':
      case 'copilot.action':
        return this.error(sock, 'NOT_PILOT', m.seq, m.t);
      default:
        return this.error(sock, 'UNKNOWN_TYPE', m.seq, (m as Envelope).t);
    }
  }

  /**
   * Host side of shared-state minigames: every move is applied to a simple shared board
   * (`moves` total, `last_a`, `last_x`, `by_<slot>` move count per seat) and the new state is
   * broadcast with `mg.state`. Bots add a move of their own a moment later.
   */
  private onMgAction(sock: MockSocket, seq: number, me: PlayerId, d: PayloadMap['mg.action']) {
    const run = this.mg;
    if (!run || run.start.runId !== d.runId || run.result) return this.error(sock, 'STALE_ID', seq, 'mg.action');
    if (run.start.type === 'PARALLEL_SOLO') return this.error(sock, 'WRONG_STAGE', seq, 'mg.action');
    const apply = (playerId: PlayerId, a: string, x: number[]) => {
      const seat = this.players.findIndex((p) => p.id === playerId);
      const shared = run.shared;
      shared.moves = (typeof shared.moves === 'number' ? shared.moves : 0) + 1;
      shared.last_a = a;
      shared.last_x = x.slice(0, 8);
      shared[`by_${seat}`] = (typeof shared[`by_${seat}`] === 'number' ? (shared[`by_${seat}`] as number) : 0) + 1;
      run.stateN++;
      this.send('mg.state', {
        runId: run.start.runId,
        n: run.stateN,
        shared: { ...shared },
        progress: this.players.map((p, i) => ({ playerId: p.id, p: Math.min(1, ((shared[`by_${i}`] as number) ?? 0) / 10) })),
      });
    };
    apply(me, d.a, d.x);
    const bot = this.players.find((p) => p.id !== me);
    if (bot) this.later(400, () => this.mg === run && !run.result && apply(bot.id, d.a, []));
  }

  /** Starts a minigame run outside the script (tests, debugging). */
  startRun(start: PayloadMap['mg.start']) {
    this.mg = { start, result: null, ready: false, onResult: null, shared: {}, stateN: 0 };
    this.send('mg.start', start);
  }

  private onAbility(sock: MockSocket, seq: number, me: PlayerId, d: PayloadMap['ability.use']) {
    if (!this.rolesOf(me).includes(d.role)) return this.error(sock, 'NOT_ROLE_HOLDER', seq, 'ability.use');
    if (this.roles.abilitiesUsed.includes(d.role)) return this.error(sock, 'ABILITY_USED', seq, 'ability.use');
    if (d.role === 'STRUCT' && !d.stageIndex) return this.error(sock, 'BAD_PAYLOAD', seq, 'ability.use', { field: 'stageIndex' });
    this.roles = { ...this.roles, abilitiesUsed: [...this.roles.abilitiesUsed, d.role] };
    this.send('ability.used', { outcomeSeq: ++this.outcomeSeq, role: d.role, playerId: me, trigger: 'PLAYER', roundId: null, stageIndex: d.role === 'STRUCT' ? d.stageIndex ?? null : null });
    this.send('roles.state', this.roles);
  }

  // ───────── votes (server rules of messages.md section 7) ─────────

  private publicQ(q: Question) {
    return { id: q.id, prompt: q.prompt, choices: q.choices };
  }

  private isWinnable(v: ActiveVote, o: VoteOption): boolean {
    if (v.vetoes.some((x) => x.optionId === o.id)) return false;
    if (o.willNotFly && !o.fixExists) return false;
    if (o.afford === 'NEVER') return false;
    if (o.afford === 'EMERGENCY_FUNDING' && this.roles.abilitiesUsed.includes('PM')) return false;
    return true;
  }

  private remaining(v: ActiveVote): string[] {
    return v.opened.options.filter((o) => !v.vetoes.some((x) => x.optionId === o.id)).map((o) => o.id);
  }

  private candidates(v: ActiveVote, stage: VoteStage): string[] {
    if (stage === 'VOTE') return v.opened.options.filter((o) => this.isWinnable(v, o)).map((o) => o.id);
    if (stage === 'TIEBREAK_TRIVIA' || stage === 'TIEBREAK_PICK') return v.tied;
    return this.remaining(v);
  }

  private tally(v: ActiveVote): PayloadMap['vote.tally'] {
    const cands = v.stage.candidateIds;
    const counts: OptionCount[] = cands.map((id) => ({ optionId: id, n: [...v.ballots.values()].filter((b) => b === id).length }));
    let leading: string | null = null;
    let best = 0;
    for (const c of counts) if (c.n > best) {
      best = c.n;
      leading = c.optionId;
    }
    return { roundId: v.opened.roundId, stage: v.stage.stage, counts, votedIds: [...v.ballots.keys()], audienceCounts: cands.map((id) => ({ optionId: id, n: 0 })), audienceTotal: 0, leadingOptionId: leading };
  }

  private setStage(v: ActiveVote, stage: VoteStage, durationMs: number | null, pickerId: PlayerId | null = null) {
    const now = this.now();
    v.stage = { roundId: v.opened.roundId, stage, startedAtMs: now, endsAtMs: durationMs == null ? null : now + this.ms(durationMs), candidateIds: this.candidates(v, stage), pickerId };
    this.send('vote.stage', v.stage);
  }

  private cast(v: ActiveVote, playerId: PlayerId, optionId: string) {
    v.ballots.set(playerId, optionId);
    if (playerId === this.meId) this.send('vote.ack', { roundId: v.opened.roundId, optionId, reason: 'CAST' });
    this.send('vote.tally', this.tally(v));
  }

  private onCast(sock: MockSocket, seq: number, me: PlayerId, roundId: string, optionId: string) {
    const v = this.vote;
    if (!v || v.opened.roundId !== roundId) return this.error(sock, 'STALE_ID', seq, 'vote.cast');
    if (v.stage.stage !== 'VOTE') return this.error(sock, 'WRONG_STAGE', seq, 'vote.cast');
    if (!v.opened.voters.includes(me)) return this.error(sock, 'NOT_A_VOTER', seq, 'vote.cast');
    const o = v.opened.options.find((x) => x.id === optionId);
    if (!o) return this.error(sock, 'UNKNOWN_OPTION', seq, 'vote.cast');
    if (v.vetoes.some((x) => x.optionId === optionId)) return this.error(sock, 'OPTION_VETOED', seq, 'vote.cast');
    if (!this.isWinnable(v, o)) return this.error(sock, o.afford !== 'OK' ? 'OPTION_UNAFFORDABLE' : 'OPTION_NOT_WINNABLE', seq, 'vote.cast');
    this.cast(v, me, optionId);
    this.checkAllVoted(v);
  }

  private onVeto(sock: MockSocket, seq: number, playerId: PlayerId, roundId: string, optionId: string) {
    const v = this.vote;
    if (!v || v.opened.roundId !== roundId) return this.error(sock, 'STALE_ID', seq, 'vote.veto');
    const err = this.vetoError(v, playerId, optionId);
    if (err) return this.error(sock, err, seq, 'vote.veto');
    this.applyVeto(v, playerId, optionId);
  }

  private vetoError(v: ActiveVote, playerId: PlayerId, optionId: string): PayloadMap['error']['code'] | null {
    if (!v.opened.vetoAllowed) return 'VETO_NOT_ALLOWED';
    if (v.stage.stage !== 'INSPECT' && v.stage.stage !== 'VOTE') return 'WRONG_STAGE';
    if (!v.opened.voters.includes(playerId)) return 'NOT_A_VOTER';
    const p = this.players.find((x) => x.id === playerId);
    if (!p?.vetoAvailable) return 'VETO_USED';
    const o = v.opened.options.find((x) => x.id === optionId);
    if (!o) return 'UNKNOWN_OPTION';
    if (v.vetoes.some((x) => x.optionId === optionId)) return 'OPTION_VETOED';
    if (!this.isWinnable(v, o)) return 'OPTION_NOT_WINNABLE';
    const winnable = v.opened.options.filter((x) => this.isWinnable(v, x)).length;
    if (winnable <= 2) return 'VETO_MIN_OPTIONS';
    return null;
  }

  private applyVeto(v: ActiveVote, playerId: PlayerId, optionId: string) {
    const p = this.players.find((x) => x.id === playerId)!;
    p.vetoAvailable = false;
    v.vetoes.push({ optionId, playerId });
    const cleared = [...v.ballots].filter(([, b]) => b === optionId).map(([pid]) => pid);
    cleared.forEach((pid) => v.ballots.delete(pid));
    v.tags = v.tags.filter((tg) => tg.optionId !== optionId);
    this.send('vote.vetoed', { roundId: v.opened.roundId, optionId, playerId, clearedVoterIds: cleared, remainingOptionIds: this.remaining(v) });
    if (cleared.includes(this.meId!)) this.send('vote.ack', { roundId: v.opened.roundId, optionId: null, reason: 'OPTION_REMOVED' });
    this.send('room.state', this.roomState());
    this.send('vote.tags', { roundId: v.opened.roundId, tags: v.tags });
    // The candidate list of the running stage changes.
    v.stage = { ...v.stage, candidateIds: this.candidates(v, v.stage.stage) };
    this.send('vote.stage', v.stage);
    if (v.stage.stage === 'VOTE') this.send('vote.tally', this.tally(v));
  }

  private checkPredictDone(v: ActiveVote) {
    const connected = v.opened.voters.filter((id) => this.players.find((p) => p.id === id)?.connected);
    if (connected.every((id) => v.predicts.has(id))) v.endStage?.();
  }

  private checkAllVoted(v: ActiveVote) {
    // Early close only for CHOICE and QUICK profiles (PART runs the full timer, messages.md 7.1).
    if (v.opened.kind === 'PART') return;
    const connected = v.opened.voters.filter((id) => this.players.find((p) => p.id === id)?.connected);
    if (v.ballots.size > 0 && connected.every((id) => v.ballots.has(id))) v.endStage?.();
  }

  private triviaAnswer(v: ActiveVote, playerId: PlayerId, choiceIndex: number) {
    const correct = choiceIndex === v.spec.trivia!.correctIndex;
    v.trivia.push({ playerId, choiceIndex, correct });
    if (correct && !v.triviaWinner) {
      v.triviaWinner = playerId;
      v.endStage?.();
    } else if (v.opened.voters.every((id) => v.trivia.some((a) => a.playerId === id))) v.endStage?.();
  }

  private insightPayload(v: ActiveVote, ins: NonNullable<VoteSpec['insight']>[number]): PayloadMap['vote.insight'] {
    return { roundId: v.opened.roundId, role: ins.role, lines: ins.lines.map((l) => ({ optionId: l.optionId, text: { key: l.key, args: l.args } })) };
  }

  /** Runs one vote round from `vote.opened` to `vote.stage` CLOSED and returns the winner. */
  async runVote(spec: VoteSpec): Promise<string> {
    const profile = spec.kind === 'PART' ? 'FULL' : ['TEST', 'ANOMALY', 'REVIEW', 'ABORT', 'FLIGHT_DECISION', 'MCM'].includes(spec.kind) ? 'QUICK' : 'CHOICE';
    const t = {
      reveal: 3000,
      predict: 8000,
      inspect: this.settings.inspectTimerS * 1000,
      vote: profile === 'QUICK' ? (spec.kind === 'ABORT' || spec.kind === 'MCM' ? 5000 : 10000) : this.settings.voteTimerS * 1000,
      trivia: 10000,
      pick: 5000,
      result: profile === 'QUICK' ? 2000 : 3000,
    };
    const plan: StagePlan[] = [];
    if (profile !== 'QUICK') plan.push({ stage: 'REVEAL', durationMs: this.ms(t.reveal) });
    if (spec.predict) plan.push({ stage: 'PREDICT', durationMs: this.ms(t.predict) });
    if (profile === 'FULL' || spec.kind === 'CONTRACT') plan.push({ stage: 'INSPECT', durationMs: this.ms(t.inspect) });
    plan.push({ stage: 'VOTE', durationMs: this.ms(t.vote) });
    plan.push({ stage: 'RESULT', durationMs: this.ms(t.result) });
    const voters = this.players.map((p) => p.id);
    const opened: VoteOpenedPayload = {
      roundId: spec.roundId,
      kind: spec.kind,
      subjectId: spec.subjectId,
      title: { key: spec.titleKey },
      why: spec.whyKey ? { key: spec.whyKey } : null,
      ownerRoles: spec.ownerRoles,
      options: spec.options,
      hint: null,
      predict: spec.predict ? this.publicQ(spec.predict) : null,
      voters,
      solo: voters.length === 1,
      vetoAllowed: spec.kind === 'PART',
      tagsAllowed: spec.kind === 'PART',
      strictMajority: false,
      tallyVisibility: this.settings.tallyVisibility,
      audienceVoteWeight: this.settings.audienceVoteWeight,
      plan,
    };
    const v: ActiveVote = {
      spec,
      opened,
      stage: { roundId: spec.roundId, stage: 'REVEAL', startedAtMs: this.now(), endsAtMs: null, candidateIds: [], pickerId: null },
      ballots: new Map(),
      predicts: new Map(),
      trivia: [],
      tags: [],
      vetoes: [],
      tied: [],
      triviaWinner: null,
      pick: null,
      endStage: null,
    };
    this.vote = v;
    this.send('vote.opened', opened);
    for (const ins of spec.insight ?? []) if (this.rolesOf(this.meId).includes(ins.role)) this.send('vote.insight', this.insightPayload(v, ins));
    const register = (f: () => void) => {
      v.endStage = f;
    };
    const stageEvents = (stage: VoteStage) => {
      for (const ve of spec.vetoes ?? []) {
        if (ve.stage !== stage) continue;
        this.later(ve.atMs, () => {
          if (this.vote === v && v.stage.stage === stage && !this.vetoError(v, this.botId(ve.bot), ve.optionId)) this.applyVeto(v, this.botId(ve.bot), ve.optionId);
        });
      }
      for (const pg of spec.pings ?? []) {
        if (pg.stage !== stage) continue;
        this.later(pg.atMs, () => {
          if (this.vote !== v) return;
          if (pg.pingId) this.send('ping.event', { playerId: this.botId(pg.bot), pingId: pg.pingId, roundId: v.opened.roundId, optionId: pg.optionId });
          if (pg.emoji) this.send('react.event', { playerId: this.botId(pg.bot), emoji: pg.emoji });
        });
      }
    };

    for (const st of plan) {
      if (st.stage === 'REVEAL') {
        this.setStage(v, 'REVEAL', t.reveal);
        await this.wait(t.reveal, register);
      } else if (st.stage === 'PREDICT') {
        this.setStage(v, 'PREDICT', t.predict);
        stageEvents('PREDICT');
        for (const [bot, choice, at] of spec.predictAnswers ?? []) {
          this.later(at, () => {
            if (this.vote === v && v.stage.stage === 'PREDICT' && !v.predicts.has(this.botId(bot))) {
              v.predicts.set(this.botId(bot), choice);
              this.checkPredictDone(v);
            }
          });
        }
        await this.wait(t.predict, register);
        const q = spec.predict!;
        const results = voters.map((id) => {
          const c = v.predicts.get(id);
          return { playerId: id, choiceIndex: c ?? null, correct: c === q.correctIndex };
        });
        this.send('vote.predict.result', { outcomeSeq: ++this.outcomeSeq, roundId: v.opened.roundId, correctIndex: q.correctIndex, results, audienceCounts: q.choices.map(() => 0) });
        const winners = results.filter((r) => r.correct);
        if (winners.length) {
          this.teamKp += winners.length * 50;
          if (winners.some((w) => w.playerId === this.meId)) {
            this.stats.predictionsCorrect++;
            this.stats.kp += 50;
          }
          this.later(500, () => this.send('kp.awarded', { entries: winners.map((w) => ({ playerId: w.playerId, kp: 50, reason: 'PREDICTION' })), teamKp: this.teamKp }));
        }
      } else if (st.stage === 'INSPECT') {
        this.setStage(v, 'INSPECT', t.inspect);
        stageEvents('INSPECT');
        await this.wait(t.inspect, register);
      } else if (st.stage === 'VOTE') {
        this.setStage(v, 'VOTE', t.vote);
        this.send('vote.tally', this.tally(v));
        stageEvents('VOTE');
        for (const b of spec.ballots) {
          this.later(b.atMs, () => {
            if (this.vote !== v || v.stage.stage !== 'VOTE') return;
            const id = typeof b.optionId === 'function' ? b.optionId(this) : b.optionId;
            const o = id ? v.opened.options.find((x) => x.id === id) : null;
            if (o && this.isWinnable(v, o)) {
              this.cast(v, this.botId(b.bot), o.id);
              this.checkAllVoted(v);
            }
          });
        }
        await this.wait(t.vote, register);
      }
    }

    // Resolution (messages.md 7.6).
    const cands = v.opened.options.filter((o) => this.isWinnable(v, o)).map((o) => o.id);
    const counts: OptionCount[] = cands.map((id) => ({ optionId: id, n: [...v.ballots.values()].filter((b) => b === id).length }));
    let winner: string;
    let method: ResolveMethod;
    const total = counts.reduce((a, c) => a + c.n, 0);
    if (total === 0) {
      const rec = v.tags.find((tg) => tg.tag === 'RECOMMENDED' && cands.includes(tg.optionId));
      if (rec) {
        winner = rec.optionId;
        method = 'ABSTAIN_RECOMMENDED';
      } else {
        winner = [...cands].sort((a, b) => (v.opened.options.find((o) => o.id === a)!.costM - v.opened.options.find((o) => o.id === b)!.costM))[0]!;
        method = 'ABSTAIN_CHEAPEST';
      }
    } else {
      const max = Math.max(...counts.map((c) => c.n));
      const top = counts.filter((c) => c.n === max).map((c) => c.optionId);
      if (top.length === 1) {
        winner = top[0]!;
        method = 'PLURALITY';
      } else {
        v.tied = top;
        const flight = this.holderOf('FLIGHT');
        const fb = flight ? v.ballots.get(flight) : undefined;
        if (fb && top.includes(fb)) {
          winner = fb;
          method = 'FLIGHT_TIEBREAK';
        } else if (spec.trivia) {
          this.setStage(v, 'TIEBREAK_TRIVIA', t.trivia);
          this.send('vote.trivia.open', { roundId: v.opened.roundId, question: this.publicQ(spec.trivia), tiedOptionIds: top });
          for (const [bot, choice, at] of spec.triviaAnswers ?? []) {
            this.later(at, () => {
              if (this.vote === v && v.stage.stage === 'TIEBREAK_TRIVIA' && !v.triviaWinner && !v.trivia.some((a) => a.playerId === this.botId(bot))) this.triviaAnswer(v, this.botId(bot), choice);
            });
          }
          await this.wait(t.trivia, register);
          this.send('vote.trivia.result', { outcomeSeq: ++this.outcomeSeq, roundId: v.opened.roundId, factId: spec.trivia.id, correctIndex: spec.trivia.correctIndex, winnerId: v.triviaWinner, answers: v.trivia });
          if (v.triviaWinner) {
            if (v.triviaWinner === this.meId) this.stats.kp += 30;
            this.teamKp += 30;
            this.later(400, () => this.send('kp.awarded', { entries: [{ playerId: v.triviaWinner!, kp: 30, reason: 'TRIVIA' }], teamKp: this.teamKp }));
            this.setStage(v, 'TIEBREAK_PICK', t.pick, v.triviaWinner);
            if (v.triviaWinner !== this.meId) this.later(1600, () => {
              if (this.vote === v && v.stage.stage === 'TIEBREAK_PICK') {
                v.pick = v.ballots.get(v.triviaWinner!) ?? top[0]!;
                v.endStage?.();
              }
            });
            await this.wait(t.pick, register);
          }
          const own = v.triviaWinner ? v.ballots.get(v.triviaWinner) : undefined;
          if (v.pick) {
            winner = v.pick;
            method = 'TRIVIA';
          } else if (own && top.includes(own)) {
            winner = own;
            method = 'TRIVIA';
          } else {
            winner = top[spec.coinSeed % top.length]!;
            method = 'COIN_FLIP';
          }
        } else {
          winner = top[spec.coinSeed % top.length]!;
          method = 'COIN_FLIP';
        }
      }
    }
    const result: PayloadMap['vote.result'] = {
      outcomeSeq: ++this.outcomeSeq,
      roundId: v.opened.roundId,
      kind: v.opened.kind,
      subjectId: v.opened.subjectId,
      winnerId: winner,
      method,
      closedBy: v.opened.kind !== 'PART' && voters.every((id) => v.ballots.has(id)) ? 'ALL_VOTED' : 'TIMER',
      counts,
      ballots: voters.map((id) => ({ playerId: id, optionId: v.ballots.get(id) ?? null })),
      audienceCounts: counts.map((c) => ({ optionId: c.optionId, n: 0 })),
      audienceBallot: null,
      firstRoundCounts: null,
      tiedOptionIds: v.tied,
      triviaWinnerId: method === 'TRIVIA' ? v.triviaWinner : null,
      vetoes: v.vetoes,
      emergencyFunding: v.opened.options.find((o) => o.id === winner)?.afford === 'EMERGENCY_FUNDING',
    };
    this.send('vote.result', result);
    this.setStage(v, 'RESULT', t.result);
    if (result.emergencyFunding) {
      this.roles = { ...this.roles, abilitiesUsed: [...this.roles.abilitiesUsed, 'PM'] };
      this.send('ability.used', { outcomeSeq: ++this.outcomeSeq, role: 'PM', playerId: this.holderOf('PM'), trigger: 'OVER_BUDGET_WIN', roundId: v.opened.roundId, stageIndex: null });
      this.send('roles.state', this.roles);
    }
    this.later(450, () => {
      const deltas = spec.commitDeltas ? spec.commitDeltas(winner) : v.opened.options.find((o) => o.id === winner)?.deltas ?? [];
      this.send('vote.commit', { roundId: v.opened.roundId, winnerId: winner, deltas, codexIds: spec.codex ? spec.codex(winner) : [] });
    });
    await this.wait(t.result);
    this.setStage(v, 'CLOSED', null);
    this.vote = null;
    return winner;
  }

  // ───────── GO / NO-GO poll (messages.md section 8) ─────────

  async runPoll(pollId: string, round: number): Promise<PayloadMap['poll.result']> {
    const order: RoleId[] = ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'];
    const calls: Array<{ playerId: PlayerId; roles: RoleId[] }> = [];
    for (const r of order) {
      const holder = this.holderOf(r);
      if (!holder) continue;
      const existing = calls.find((c) => c.playerId === holder);
      if (existing) existing.roles.push(r);
      else calls.push({ playerId: holder, roles: [r] });
    }
    const entries: PollEntry[] = [];
    const perCallMs = 5000;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i]!;
      const call: PayloadMap['poll.call'] = { pollId, context: 'FRR', round, index: i + 1, total: calls.length, playerId: c.playerId, roles: c.roles, endsAtMs: this.now() + this.ms(perCallMs) };
      let answer: 'GO' | 'NO_GO' | null = null;
      this.poll = { pollId, call, entries, answer: null };
      this.send('poll.call', call);
      await this.wait(perCallMs, (finish) => {
        this.poll!.answer = (a) => {
          answer = a;
          finish();
        };
        if (c.playerId !== this.meId) this.later(900 + i * 150, () => this.poll?.answer?.('GO'));
      });
      const entry: PollEntry = { playerId: c.playerId, roles: c.roles, answer: answer ?? 'NO_ANSWER' };
      entries.push(entry);
      this.poll.answer = null;
      this.send('poll.answered', { pollId, entry });
      await this.sleep(350);
    }
    const noGo = entries.filter((e) => e.answer === 'NO_GO').length;
    const result: PayloadMap['poll.result'] = { outcomeSeq: ++this.outcomeSeq, pollId, context: 'FRR', round, answers: entries, allGo: noGo === 0, noGoCount: noGo };
    this.send('poll.result', result);
    await this.sleep(2500);
    this.poll = null;
    return result;
  }

  // ───────── flight ─────────

  private bumpSync(delta: number, reason: PayloadMap['sync.meter']['reason']) {
    this.sync = Math.min(100, this.sync + delta);
    this.send('sync.meter', { value: this.sync, delta, reason, momentReady: this.sync >= 100 });
  }

  /** Console layouts. Before ignition the engine limits are not armed (no false LOW alarms). */
  private consoles(armed = true): ConsoleConfigPayload[] {
    return [
      {
        role: 'BOOSTER',
        channels: [
          { id: 'chamber_pressure_pct', min: 0, max: 120, warnLow: armed ? 85 : null, warnHigh: 110 },
          { id: 'engine_health_pct', min: 0, max: 100, warnLow: 70, warnHigh: null },
          { id: 'throttle_pct', min: 0, max: 110, warnLow: null, warnHigh: null },
          { id: 'prop_stage1_pct', min: 0, max: 100, warnLow: 10, warnHigh: null },
          { id: 'prop_stage2_pct', min: 0, max: 100, warnLow: 10, warnHigh: null },
          { id: 'engines_running', min: 0, max: 9, warnLow: armed ? 8 : null, warnHigh: null },
        ],
        calloutIds: ['engine_out', 'chamber_pressure_low', 'propellant_low'],
        requestIds: ['throttle_down', 'save_propellant'],
      },
      {
        role: 'STRUCT',
        channels: [
          { id: 'q_kpa', min: 0, max: 45, warnLow: null, warnHigh: 32 },
          { id: 'load_pct', min: 0, max: 120, warnLow: null, warnHigh: 90 },
          { id: 'g_load', min: 0, max: 6, warnLow: null, warnHigh: 4.5 },
          { id: 'vibration_pct', min: 0, max: 100, warnLow: null, warnHigh: 75 },
        ],
        calloutIds: ['throttle_down_max_q', 'high_g', 'vibration_high'],
        requestIds: ['throttle_down', 'reduce_load'],
      },
    ];
  }

  /** Telemetry of the two consoles the phone holds, as a function of mission time (game values). */
  private telemetry(metS: number): Array<{ role: RoleId; v: TelemetryValues }> {
    const t = Math.max(0, metS);
    const throttle = t > 48 && t < 72 ? 72 : t < 150 ? 100 : 0;
    const q = t <= 0 ? 0 : Math.max(0, 34 * Math.exp(-((t - 62) ** 2) / (2 * 22 ** 2)) * (throttle === 72 ? 0.9 : 1));
    const prop1 = Math.max(0, 100 - t * 0.62);
    const prop2 = t < 155 ? 100 : Math.max(0, 100 - (t - 155) * 0.25);
    const g = t <= 0 ? 1 : Math.min(4.6, 1.25 + t * 0.022);
    const wobble = Math.sin(t * 1.7) * 1.2;
    return [
      {
        role: 'BOOSTER',
        // Engine count and chamber pressure are reported from ignition on.
        v: metS <= 0
          ? { engine_health_pct: 97, throttle_pct: throttle, prop_stage1_pct: 100, prop_stage2_pct: 100 }
          : { chamber_pressure_pct: 98 + wobble, engine_health_pct: 97, throttle_pct: throttle, prop_stage1_pct: Math.round(prop1 * 10) / 10, prop_stage2_pct: prop2, engines_running: t < 160 ? 9 : 0, engines_total: 9 },
      },
      { role: 'STRUCT', v: { q_kpa: Math.round(q * 10) / 10, load_pct: Math.round((q / 34) * 92), g_load: Math.round(g * 100) / 100, vibration_pct: Math.round(18 + q * 1.1 + wobble * 3) } },
    ];
  }

  /** Mission elapsed time, s. The demo host compresses the ascent 11× after lift-off (game value). */
  private met(): number {
    const t = ((this.now() - this.flightT0) / 1000) * this.speed;
    return t <= 0 ? t : t * MET_COMPRESSION;
  }

  private startTelemetry() {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    const tick = () => {
      if (this.stopped || this.sticky.get('blackout.set') && (this.sticky.get('blackout.set')!.d as PayloadMap['blackout.set']).active) return;
      const metS = this.met();
      for (const s of this.telemetry(metS)) this.send('console.telemetry', { role: s.role, metS: Math.round(metS * 10) / 10, v: s.v });
      const alt = metS <= 0 ? 0 : Math.min(550, 0.0045 * metS ** 2);
      const vel = metS <= 0 ? 0 : Math.min(7590, 3.6 * metS ** 1.45);
      this.send('flight.hud', {
        metS: Math.round(metS * 10) / 10,
        altitudeKm: Math.round(alt * 10) / 10,
        velocityMs: Math.round(vel),
        verticalSpeedMs: metS <= 0 ? 0 : Math.round(Math.min(900, 9 * metS)),
        qKpa: this.telemetry(metS)[1]!.v.q_kpa ?? 0,
        gLoad: this.telemetry(metS)[1]!.v.g_load ?? 1,
        throttlePct: this.telemetry(metS)[0]!.v.throttle_pct ?? 0,
        propellantPct: this.telemetry(metS)[0]!.v.prop_stage1_pct ?? 100,
        dvRemainingMs: Math.max(0, Math.round(9700 - vel * 1.05)),
        apoapsisKm: metS > 60 ? Math.round(Math.min(553, alt * 1.6)) : null,
        periapsisKm: metS > 300 ? 548 : null,
        heatLoadPct: 0,
        warp: this.mg && !this.mg.result ? 0.1 : metS > 0 ? MET_COMPRESSION : 1,
      });
    };
    this.telemetryTimer = setInterval(tick, 250);
  }

  // ───────── the scripted session ─────────

  private engineVote(): VoteSpec {
    const R = (low: number, high: number, maturity: string) => ({ low, high, maturity });
    const ins = (id: string, r: ReturnType<typeof R>) => ({ optionId: id, key: 'demo.insight.reliability', args: { low: r.low, high: r.high, maturity: `ui.maturity.${r.maturity}` } });
    return {
      roundId: 'm1.r01',
      kind: 'PART',
      subjectId: 'first_stage_engine',
      titleKey: 'vote.first_stage_engine.name',
      whyKey: 'demo.why.first_stage_engine',
      ownerRoles: ['BOOSTER', 'STRUCT'],
      options: [
        opt('eng_kerolox_workhorse', { costM: 10.8, deltas: [d('TOTAL_DV_MS', 9420, 420, 'GOOD'), d('LIFTOFF_TWR', 1.31, 0.31, 'GOOD'), d('BUDGET_LEFT_M', 79.2, -10.8, 'GOOD'), d('SCHEDULE_DAYS', 32, 2, 'GOOD')] }),
        opt('eng_kerolox_staged_combustion', { costM: 30, deltas: [d('TOTAL_DV_MS', 9580, 580, 'GOOD'), d('LIFTOFF_TWR', 1.45, 0.45, 'GOOD'), d('BUDGET_LEFT_M', 60, -30, 'MARGINAL'), d('SCHEDULE_DAYS', 125, 5, 'MARGINAL')] }),
        opt('eng_hydrolox_high_efficiency', {
          costM: 80,
          afford: 'EMERGENCY_FUNDING',
          overBudgetByM: 8.4,
          willNotFly: true,
          fixExists: true,
          warnings: [{ key: 'demo.warning.twr' }],
          deltas: [d('TOTAL_DV_MS', 10150, 1150, 'GOOD'), d('LIFTOFF_TWR', 0.96, -0.04, 'BAD'), d('BUDGET_LEFT_M', -8.4, -98.4, 'BAD'), d('SCHEDULE_DAYS', 156, 6, 'MARGINAL')],
        }),
        opt('eng_methalox_full_flow', { costM: 22.5, deltas: [d('TOTAL_DV_MS', 9610, 610, 'GOOD'), d('LIFTOFF_TWR', 1.42, 0.42, 'GOOD'), d('BUDGET_LEFT_M', 67.5, -22.5, 'GOOD'), d('SUCCESS_PCT', 95.5, -3, 'MARGINAL')] }),
      ],
      predict: {
        id: 'F05',
        prompt: { key: 'demo.predict.vac_isp' },
        choices: [{ key: 'part.eng_kerolox_workhorse.name' }, { key: 'part.eng_kerolox_staged_combustion.name' }, { key: 'part.eng_hydrolox_high_efficiency.name' }, { key: 'part.eng_methalox_full_flow.name' }],
        correctIndex: 2,
      },
      trivia: null,
      coinSeed: 7,
      predictAnswers: [[0, 2, 2200], [1, 3, 3000], [2, 2, 3600], [3, 0, 4100]],
      ballots: [
        { bot: 0, optionId: 'eng_kerolox_workhorse', atMs: 3000 },
        { bot: 1, optionId: 'eng_methalox_full_flow', atMs: 4500 },
        { bot: 2, optionId: 'eng_kerolox_workhorse', atMs: 6000 },
        { bot: 3, optionId: 'eng_kerolox_staged_combustion', atMs: 8000 },
        { bot: 3, optionId: 'eng_methalox_full_flow', atMs: 13000 },
      ],
      pings: [
        { bot: 1, pingId: 'TOO_EXPENSIVE', optionId: 'eng_hydrolox_high_efficiency', atMs: 4000, stage: 'INSPECT' },
        { bot: 0, pingId: 'LIKE_THIS', optionId: 'eng_kerolox_workhorse', atMs: 7500, stage: 'INSPECT' },
        { bot: 2, pingId: null, emoji: 'ROCKET', optionId: null, atMs: 2500, stage: 'VOTE' },
      ],
      insight: [
        { role: 'BOOSTER', lines: [ins('eng_kerolox_workhorse', R(97.5, 99.5, 'proven')), ins('eng_kerolox_staged_combustion', R(97.8, 99.8, 'proven')), ins('eng_hydrolox_high_efficiency', R(98, 100, 'proven')), ins('eng_methalox_full_flow', R(89.5, 100, 'new'))] },
      ],
      codex: (w) => [w],
    };
  }

  private testVote(): VoteSpec {
    return {
      roundId: 'm1.r02',
      kind: 'TEST',
      subjectId: 'engine_hot_fire',
      titleKey: 'test.engine_hot_fire.name',
      whyKey: 'demo.why.engine_hot_fire',
      ownerRoles: [],
      options: [
        { id: 'TEST', partId: null, label: null, costM: 2, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [d('BUDGET_LEFT_M', 77.2, -2, 'GOOD'), d('SCHEDULE_DAYS', 39, 7, 'MARGINAL'), d('SUCCESS_PCT', 97.5, 1, 'GOOD')] },
        { id: 'SKIP', partId: null, label: null, costM: 0, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [] },
      ],
      predict: null,
      trivia: null,
      coinSeed: 3,
      ballots: [
        { bot: 0, optionId: 'TEST', atMs: 1500 },
        { bot: 1, optionId: 'TEST', atMs: 2400 },
        { bot: 2, optionId: 'SKIP', atMs: 3100 },
        { bot: 3, optionId: 'TEST', atMs: 3800 },
      ],
    };
  }

  private upperVote(): VoteSpec {
    return {
      roundId: 'm1.r03',
      kind: 'PART',
      subjectId: 'upper_stage_engine',
      titleKey: 'vote.upper_stage_engine.name',
      whyKey: 'demo.why.upper_stage_engine',
      ownerRoles: ['BOOSTER'],
      options: [
        opt('eng_hydrolox_vacuum', { costM: 10, deltas: [d('TOTAL_DV_MS', 9870, 450, 'GOOD'), d('UPPER_TWR', 0.62, 0.62, 'MARGINAL'), d('BUDGET_LEFT_M', 65.2, -10, 'GOOD')] }),
        opt('eng_kerolox_vacuum', { costM: 3, deltas: [d('TOTAL_DV_MS', 9690, 270, 'GOOD'), d('UPPER_TWR', 1.18, 1.18, 'GOOD'), d('BUDGET_LEFT_M', 72.2, -3, 'GOOD')] }),
        opt('eng_methalox_vacuum', { costM: 4, deltas: [d('TOTAL_DV_MS', 9760, 340, 'GOOD'), d('UPPER_TWR', 1.4, 1.4, 'GOOD'), d('BUDGET_LEFT_M', 71.2, -4, 'GOOD'), d('SUCCESS_PCT', 94, -3.5, 'MARGINAL')] }),
        opt('eng_solid_kick_motor', { costM: 2, deltas: [d('TOTAL_DV_MS', 9540, 120, 'MARGINAL'), d('UPPER_TWR', 0.71, 0.71, 'MARGINAL'), d('BUDGET_LEFT_M', 73.2, -2, 'GOOD')] }),
      ],
      predict: null,
      trivia: null,
      coinSeed: 11,
      vetoes: [{ bot: 2, optionId: 'eng_solid_kick_motor', atMs: 4500, stage: 'INSPECT' }],
      ballots: [
        { bot: 0, optionId: 'eng_kerolox_vacuum', atMs: 2500 },
        { bot: 1, optionId: 'eng_kerolox_vacuum', atMs: 3500 },
        { bot: 2, optionId: 'eng_hydrolox_vacuum', atMs: 5000 },
        { bot: 3, optionId: 'eng_methalox_vacuum', atMs: 7000 },
      ],
      pings: [
        { bot: 2, pingId: 'CHECK_DRAWBACK', optionId: 'eng_solid_kick_motor', atMs: 2000, stage: 'INSPECT' },
        { bot: 0, pingId: 'AGREED', optionId: null, atMs: 6500, stage: 'VOTE' },
      ],
      insight: [
        { role: 'BOOSTER', lines: [
          { optionId: 'eng_hydrolox_vacuum', key: 'demo.insight.reliability', args: { low: 98.3, high: 100, maturity: 'ui.maturity.proven' } },
          { optionId: 'eng_methalox_vacuum', key: 'demo.insight.reliability', args: { low: 89.5, high: 100, maturity: 'ui.maturity.new' } },
        ] },
      ],
      codex: (w) => [w],
    };
  }

  private fairingVote(): VoteSpec {
    // Scripted tie: one bot backs the phone player's ballot, two bots back another option, and
    // FLIGHT abstains, so the round goes to trivia sudden-death.
    const mine = (room: MockRoom) => (room.vote ? room.vote.ballots.get(room.meId!) ?? 'fairing_standard' : null);
    const other = (room: MockRoom) => (mine(room) === 'fairing_large' ? 'fairing_standard' : 'fairing_large');
    return {
      roundId: 'm1.r04',
      kind: 'PART',
      subjectId: 'fairing',
      titleKey: 'vote.fairing.name',
      whyKey: 'demo.why.fairing',
      ownerRoles: ['STRUCT'],
      options: [
        opt('fairing_small', { costM: 2, deltas: [d('TOTAL_MASS_T', 0.4, 0.4, 'GOOD'), d('BUDGET_LEFT_M', 63.2, -2, 'GOOD')] }),
        opt('fairing_standard', { costM: 5, deltas: [d('TOTAL_MASS_T', 1.5, 1.5, 'GOOD'), d('BUDGET_LEFT_M', 60.2, -5, 'GOOD')] }),
        opt('fairing_large', { costM: 9, deltas: [d('TOTAL_MASS_T', 2.4, 2.4, 'MARGINAL'), d('BUDGET_LEFT_M', 56.2, -9, 'GOOD')] }),
        opt('fairing_reusable_large', { costM: 14, deltas: [d('TOTAL_MASS_T', 2.6, 2.6, 'MARGINAL'), d('BUDGET_LEFT_M', 51.2, -14, 'MARGINAL')] }),
      ],
      predict: null,
      trivia: {
        id: 'F23',
        prompt: { key: 'demo.trivia.fairing.prompt' },
        choices: [{ key: 'demo.trivia.fairing.b' }, { key: 'demo.trivia.fairing.a' }, { key: 'demo.trivia.fairing.c' }, { key: 'demo.trivia.fairing.d' }],
        correctIndex: 1,
      },
      coinSeed: 5,
      triviaAnswers: [[1, 2, 2500], [3, 1, 6500]],
      ballots: [
        { bot: 1, optionId: other, atMs: 3000 },
        { bot: 2, optionId: 'fairing_small', atMs: 4000 },
        { bot: 3, optionId: other, atMs: 5000 },
        // Shortly before the close the bots settle so that the count ends in a tie.
        { bot: 2, optionId: (room) => mine(room), atMs: 17500 },
        { bot: 1, optionId: other, atMs: 17800 },
        { bot: 3, optionId: other, atMs: 18000 },
      ],
      pings: [{ bot: 3, pingId: 'TOO_HEAVY', optionId: 'fairing_reusable_large', atMs: 3000, stage: 'INSPECT' }],
      insight: [{ role: 'STRUCT', lines: [{ optionId: 'fairing_small', key: 'demo.insight.load', args: { margin: 14 } }, { optionId: 'fairing_large', key: 'demo.insight.load', args: { margin: 22 } }] }],
      codex: (w) => [w],
    };
  }

  private build(step: number, parts: Array<{ category: string; partId: string }>, spent: number, days: number) {
    this.send('build.state', {
      contractId: 'C1',
      parts: parts.map((p) => ({ ...p, count: p.category === 'first_stage_engine' ? 9 : 1 })),
      metrics: [
        { metric: 'TOTAL_DV_MS', value: 9000 + parts.length * 240, required: 9700, rating: parts.length >= 3 ? 'GOOD' : 'MARGINAL' },
        { metric: 'LIFTOFF_TWR', value: parts.length ? 1.31 : 0, required: 1.2, rating: parts.length ? 'GOOD' : 'BAD' },
        { metric: 'BUDGET_LEFT_M', value: 90 - spent, required: 0, rating: 90 - spent > 15 ? 'GOOD' : 'MARGINAL' },
        { metric: 'SUCCESS_PCT', value: 96.5, required: 90, rating: 'GOOD' },
      ],
      budgetTotalM: 90,
      budgetSpentM: spent,
      scheduleLimitDays: 180,
      scheduleUsedDays: days,
      issues: parts.length ? [] : [{ ruleId: 'liftoff_twr_low', severity: 'MAJOR', text: { key: 'demo.issue.twr_low' } }],
    });
    this.phase({ phase: 'BUILD', sub: 'NONE', contractId: 'C1', step: { index: step, total: 12 } });
  }

  private async script() {
    const me = () => this.meId!;
    this.send('phase.set', { missionSeq: 0, mode: 'QUICK', phase: 'LOBBY', sub: 'NONE', review: null, flightPhase: null, segment: null, boosterTrack: false, contractId: null, step: null });
    for (let i = 0; i < BOTS.length; i++) {
      await this.sleep(700);
      this.addBot(i);
    }
    await this.sleep(2200);
    this.lockRoles();
    await this.sleep(600);
    this.phase({ phase: 'BRIEFING', contractId: 'C1' });
    this.notice('CAPCOM', 'demo.notice.briefing', 6000);
    await this.sleep(4500);

    const parts: Array<{ category: string; partId: string }> = [];
    this.build(1, parts, 0, 30);
    this.notice('HINT', 'demo.notice.build', 4000);
    await this.sleep(1500);
    this.phase({ phase: 'BUILD', sub: 'VOTE_ROUND', contractId: 'C1', step: { index: 1, total: 12 } });
    const engine = await this.runVote(this.engineVote());
    parts.push({ category: 'first_stage_engine', partId: engine });
    this.build(2, parts, 10.8, 32);
    await this.sleep(2500);

    this.phase({ phase: 'BUILD', sub: 'TEST', contractId: 'C1', step: { index: 2, total: 12 } });
    const test = await this.runVote(this.testVote());
    this.send('build.event', { kind: 'TEST_RESULT', subjectId: 'engine_hot_fire', text: { key: test === 'TEST' ? 'demo.build.test_pass' : 'demo.build.test_skipped' }, deltas: test === 'TEST' ? [d('SUCCESS_PCT', 97.5, 1, 'GOOD')] : [], factId: 'F26' });
    this.build(3, parts, test === 'TEST' ? 12.8 : 10.8, test === 'TEST' ? 39 : 32);
    await this.sleep(2500);

    this.phase({ phase: 'BUILD', sub: 'VOTE_ROUND', contractId: 'C1', step: { index: 3, total: 12 } });
    const upper = await this.runVote(this.upperVote());
    parts.push({ category: 'upper_stage_engine', partId: upper });
    this.build(4, parts, 22.8, 45);
    await this.sleep(2500);

    this.phase({ phase: 'BUILD', sub: 'VOTE_ROUND', contractId: 'C1', step: { index: 4, total: 12 } });
    const fairing = await this.runVote(this.fairingVote());
    parts.push({ category: 'fairing', partId: fairing });
    this.build(5, parts, 30.8, 52);
    await this.sleep(2500);

    // Flight Readiness Review: GO / NO-GO.
    this.phase({ phase: 'FRR', review: 'FRR', contractId: 'C1' });
    this.notice('CAPCOM', 'demo.notice.frr', 4000);
    await this.sleep(1800);
    const poll = await this.runPoll('m1.frr1', 1);
    if (!poll.allGo) {
      this.notice('DISCUSSION', 'demo.notice.nogo', 6000);
      await this.sleep(5000);
      await this.runPoll('m1.frr2', 2);
    }

    // Countdown and flight.
    this.flightT0 = this.now() + this.ms(10000);
    this.phase({ phase: 'COUNTDOWN', flightPhase: 'F1', contractId: 'C1' });
    for (const c of this.consoles(false)) this.send('console.config', c);
    this.send('pilot.assign', { segment: 'ASCENT', pilotId: this.botId(0), pilotInput: 'HOST_DEVICE', copilotId: null, boosterPilotId: null, boosterInput: null });
    this.startTelemetry();
    await this.sleep(10000);
    this.phase({ phase: 'FLIGHT', sub: 'FLYING', flightPhase: 'F2', segment: 'ASCENT', contractId: 'C1' });
    this.send('haptic.cue', { cue: 'IGNITION', to: null });
    for (const c of this.consoles(true)) this.send('console.config', c);
    this.send('flight.event', { eventId: 'liftoff', flightPhase: 'F2', metS: 0, severity: 'INFO', text: { key: 'demo.event.liftoff' }, factId: null });
    await this.sleep(3000);
    this.phase({ phase: 'FLIGHT', sub: 'FLYING', flightPhase: 'F3', segment: 'ASCENT', contractId: 'C1' });
    await this.sleep(2500);
    this.phase({ phase: 'FLIGHT', sub: 'FLYING', flightPhase: 'F4', segment: 'ASCENT', contractId: 'C1' });
    this.notice('CAPCOM', 'demo.notice.maxq', 4000);
    this.send('haptic.cue', { cue: 'MAX_Q_RUMBLE', to: null });
    this.send('flight.event', { eventId: 'max_q', flightPhase: 'F4', metS: Math.round(this.met()), severity: 'CAUTION', text: { key: 'demo.event.maxq' }, factId: 'F04' });
    // Max Q alert on STRUCT: the callout window.
    const alert: PayloadMap['console.alert'] = { alertId: 'm1.a01', role: 'STRUCT', calloutId: 'throttle_down_max_q', arg: null, severity: 'WARNING', endsAtMs: this.now() + Math.max(this.ms(8000), 3000) };
    this.alerts.set(alert.alertId, alert);
    this.send('console.alert', alert);
    this.send('console.alert', { alertId: 'm1.a02', role: 'BOOSTER', calloutId: 'engine_out', arg: 3, severity: 'CAUTION', endsAtMs: this.now() + Math.max(this.ms(8000), 3000) });
    this.alerts.set('m1.a02', { alertId: 'm1.a02', role: 'BOOSTER', calloutId: 'engine_out', arg: 3, severity: 'CAUTION', endsAtMs: this.now() + Math.max(this.ms(8000), 3000) });
    await this.sleep(8500);

    // Minigame MG-08 at Max Q.
    const durationMs = Math.max(5000, Math.round(20000 / Math.max(1, this.speed / 2)));
    const start: PayloadMap['mg.start'] = {
      runId: 'm1.mg08',
      minigameId: 'MG-08',
      type: 'PARALLEL_SOLO',
      seed: 424242,
      startAtMs: this.now() + 4500,
      durationMs,
      assistLevel: this.settings.assistLevel,
      flightPhase: 'F4',
      audience: false,
      params: { in_band_fraction_min: 0.85 },
      assignments: [],
    };
    this.mg = { start, result: null, ready: false, onResult: null, shared: {}, stateN: 0 };
    this.send('mg.start', start);
    await new Promise<void>((resolve) => {
      const close = start.startAtMs + durationMs + 2000 - this.now();
      const h = setTimeout(resolve, Math.max(0, close));
      this.timers.add(h);
      this.mg!.onResult = () => {
        clearTimeout(h);
        setTimeout(resolve, 600);
      };
    });
    const mine = this.mg.result;
    const succeeded = 3 + (mine?.success ? 1 : 0);
    const active = 4 + (mine ? 1 : 0);
    const f = succeeded / active;
    const tier = f >= 1 ? 'GOLD' : f >= 0.66 ? 'SILVER' : f >= 0.33 ? 'BRONZE' : 'NONE';
    const syncDelta = tier === 'GOLD' ? 25 : tier === 'SILVER' ? 15 : tier === 'BRONZE' ? 8 : 0;
    const points = tier === 'GOLD' ? 200 : tier === 'SILVER' ? 120 : tier === 'BRONZE' ? 60 : 0;
    this.stats.minigame = !!mine?.success;
    const bots = this.players.filter((p) => p.id !== me()).map((p) => p.id);
    this.send('mg.summary', {
      runId: start.runId,
      minigameId: 'MG-08',
      active,
      succeeded,
      fraction: Math.round(f * 1000) / 1000,
      tier,
      succeededIds: [...bots.slice(0, 3), ...(mine?.success ? [me()] : [])],
      perfectIds: mine?.perfect ? [me()] : [],
      sparkle: false,
      boosts:
        tier === 'NONE'
          ? []
          : [
              { boost: 'LOAD_MARGIN', tier, amount: tier === 'GOLD' ? 10 : 6, total: tier === 'GOLD' ? 10 : 6, unit: 'PCT', capped: false, source: 'MINIGAME', sourceId: 'MG-08' },
              { boost: 'DV_BONUS', tier, amount: 1, total: 1, unit: 'PCT', capped: false, source: 'MINIGAME', sourceId: 'MG-08' },
            ],
      syncDelta,
      points,
      factId: 'F04',
    });
    this.send('haptic.cue', { cue: `TIER_${tier}` as PayloadMap['haptic.cue']['cue'], to: null });
    if (tier !== 'NONE') {
      this.send('boost.state', { boosts: [{ boost: 'LOAD_MARGIN', total: tier === 'GOLD' ? 10 : 6, unit: 'PCT' }, { boost: 'DV_BONUS', total: 1, unit: 'PCT' }] });
      this.bumpSync(syncDelta, tier === 'GOLD' ? 'GOLD' : tier === 'SILVER' ? 'SILVER' : 'BRONZE');
    }
    this.mg = null;
    await this.sleep(5000);

    this.phase({ phase: 'FLIGHT', sub: 'FLYING', flightPhase: 'F5', segment: 'ASCENT', contractId: 'C1' });
    this.send('haptic.cue', { cue: 'STAGING', to: null });
    this.send('flight.event', { eventId: 'meco', flightPhase: 'F5', metS: Math.round(this.met()), severity: 'INFO', text: { key: 'demo.event.meco' }, factId: null });
    await this.sleep(2500);
    this.phase({ phase: 'FLIGHT', sub: 'FLYING', flightPhase: 'F6', segment: 'ASCENT', contractId: 'C1' });
    this.send('flight.event', { eventId: 'fairing_sep', flightPhase: 'F6', metS: Math.round(this.met()), severity: 'INFO', text: { key: 'demo.event.fairing' }, factId: 'F23' });
    await this.sleep(2500);
    this.phase({ phase: 'FLIGHT', sub: 'FLYING', flightPhase: 'F8', segment: 'ORBIT', contractId: 'C1' });
    this.send('blackout.set', { active: true, cause: 'OUT_OF_COVERAGE', expectedEndAtMs: this.now() + this.ms(5000) });
    this.notice('CAPCOM', 'demo.notice.coverage', 4000);
    await this.sleep(5000);
    this.send('blackout.set', { active: false, cause: null, expectedEndAtMs: null });
    this.send('flight.event', { eventId: 'orbit_insertion', flightPhase: 'F8', metS: Math.round(this.met()), severity: 'INFO', text: { key: 'demo.event.orbit' }, factId: 'F05' });
    await this.sleep(3500);
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);

    // Debrief.
    this.phase({ phase: 'DEBRIEF', sub: 'SUMMARY', contractId: 'C1' });
    await this.sleep(1500);
    const teamwork = 300 + points + this.stats.goodCalls * 20;
    const knowledge = Math.min(500, this.teamKp);
    const base = 4000 + 1450 + 1200 + 900 + teamwork + knowledge;
    this.send('debrief.score', {
      missionSeq: 1,
      contractId: 'C1',
      outcome: 'SUCCESS',
      crewSafe: null,
      total: Math.round(base * 1.0 * 1.05),
      grade: base * 1.05 >= 9000 ? 'S' : base * 1.05 >= 7500 ? 'A' : 'B',
      title: { key: base * 1.05 >= 9000 ? 'grade.S.title' : base * 1.05 >= 7500 ? 'grade.A.title' : 'grade.B.title' },
      breakdown: { objectives: 4000, efficiency: 1450, safetyRecovery: 1200, scienceData: 900, teamwork, knowledge, difficultyMult: 1, boostMult: 1.05 },
      objectives: [
        { id: 'reach_sso_power_positive', kind: 'PRIMARY', met: true, points: 3000 },
        { id: 'science_targets_10', kind: 'SECONDARY', met: true, points: 500 },
        { id: 'under_budget', kind: 'SECONDARY', met: true, points: 500 },
        { id: 'science_targets_all', kind: 'STRETCH', met: false, points: 0 },
      ],
      retryAvailable: false,
    });
    await this.sleep(700);
    const award = this.stats.goodCalls > 0 ? 'best_callout' : this.stats.minigame ? 'steady_hands' : 'team_player';
    this.send('debrief.awards', {
      players: [
        { playerId: me(), awardIds: this.stats.predictionsCorrect ? [award, 'fact_finder'] : [award], kp: this.stats.kp, goodCalls: this.stats.goodCalls, minigameSuccesses: this.stats.minigame ? 1 : 0, predictionsCorrect: this.stats.predictionsCorrect },
        { playerId: bots[0]!, awardIds: ['calm_under_pressure'], kp: 50, goodCalls: 1, minigameSuccesses: 1, predictionsCorrect: 1 },
        { playerId: bots[1]!, awardIds: ['budget_hawk'], kp: 30, goodCalls: 0, minigameSuccesses: 1, predictionsCorrect: 0 },
        { playerId: bots[2]!, awardIds: ['veto_visionary'], kp: 50, goodCalls: 0, minigameSuccesses: 1, predictionsCorrect: 1 },
        { playerId: bots[3]!, awardIds: ['rocket_scientist'], kp: 0, goodCalls: 2, minigameSuccesses: 0, predictionsCorrect: 0 },
      ],
    });
    await this.sleep(700);
    this.send('debrief.facts', { factIds: ['F04', 'F05', 'F23', 'F26'], codexIds: ['F04', 'F23'], lessonId: null, comparison: null });
    this.send('codex.unlock', { codexIds: ['F05'], source: 'DEBRIEF', badge: false, to: null });
  }
}

export interface MockConnection extends Connection {
  readonly room: MockRoom;
}

/** The `?mock=1` connection: the real protocol client over an in-page room. */
export function createMockConnection(lang: string, opts: MockOptions = {}, session?: SessionStore): MockConnection {
  const room = new MockRoom(opts);
  const client = new ProtocolClient({
    kind: 'mock',
    socketFactory: () => room.connect(),
    // A separate key: a refresh in mock mode starts a fresh demo room, so a stale token is
    // answered with TOKEN_INVALID / ROOM_NOT_FOUND exactly like the real server would.
    session: session ?? browserSession('mf.mock.session'),
    appVersion: APP_VERSION,
    lang,
  }) as ProtocolClient & { room: MockRoom };
  Object.defineProperty(client, 'room', { value: room });
  return client;
}
