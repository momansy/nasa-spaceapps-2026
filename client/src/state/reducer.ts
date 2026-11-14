// The one reducer: every screen is a pure function of the state built here from protocol
// messages. No side effects (haptics, storage, network) happen in this file.
import type { Message, PlayerPrefs, RoleId, TelemetryChannel, VoteOpenedPayload } from '@protocol';
import type { Action, AppState, ConsoleState, FeedItem, FlightState, Me, PollState, VoteRound } from './types';

export const DEFAULT_PREFS: PlayerPrefs = {
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

const FEED_MAX = 30;
const SOCIAL_MAX = 12;
const HISTORY_MAX = 48;
const EVENTS_MAX = 20;
const AUDIENCE_MAX = 6;

const emptyFlight = (): FlightState => ({
  hud: null,
  events: [],
  consoles: {},
  alerts: [],
  goodCalls: [],
  blackout: null,
  pilot: null,
  requests: [],
});

export function initialState(prefs: PlayerPrefs = DEFAULT_PREFS, kind: 'ws' | 'mock' = 'ws'): AppState {
  return {
    conn: { kind, phase: 'idle', attempt: 0, offsetMs: 0, rttMs: null, closeReason: null },
    snapshotting: false,
    me: null,
    joinError: null,
    error: null,
    settings: null,
    room: null,
    roles: null,
    phase: null,
    paused: null,
    build: null,
    feed: [],
    notice: null,
    vote: null,
    lastVote: null,
    poll: null,
    flight: emptyFlight(),
    mg: null,
    boosts: [],
    sync: null,
    kp: { mine: 0, team: 0, last: null },
    codex: { unlocked: [], fresh: [], badges: [] },
    debrief: { score: null, awards: null, facts: null },
    social: [],
    pilotHud: null,
    pilotHudFor: null,
    audience: [],
    prefs,
    roleCardSeen: '',
    nextId: 1,
  };
}

function newRound(opened: VoteOpenedPayload, prev: VoteRound | null): VoteRound {
  const same = prev && prev.opened.roundId === opened.roundId ? prev : null;
  return {
    opened,
    stage: null,
    vetoes: [],
    tags: [],
    insight: same ? same.insight : [],
    tally: null,
    myBallot: null,
    ballotNote: null,
    pendingBallot: null,
    // What this device already answered is not replayed by the server; keep it across a resume.
    predict: { myChoice: same ? same.predict.myChoice : null, result: same ? same.predict.result : null },
    trivia: { open: null, myChoice: same ? same.trivia.myChoice : null, myPick: same ? same.trivia.myPick : null, result: same ? same.trivia.result : null },
    result: same ? same.result : null,
    commit: same ? same.commit : null,
    pings: same ? same.pings : [],
    stale: false,
  };
}

function withRound(state: AppState, roundId: string, fn: (r: VoteRound) => VoteRound): AppState {
  if (!state.vote || state.vote.opened.roundId !== roundId) return state;
  return { ...state, vote: fn(state.vote) };
}

function pushFeed(state: AppState, item: FeedItem): AppState {
  const feed = [...state.feed, item];
  return { ...state, feed: feed.length > FEED_MAX ? feed.slice(feed.length - FEED_MAX) : feed, nextId: state.nextId + 1 };
}

function addCodex(state: AppState, ids: string[], badge: boolean): AppState {
  if (ids.length === 0) return state;
  const unlocked = [...state.codex.unlocked];
  const fresh = [...state.codex.fresh];
  const badges = [...state.codex.badges];
  for (const id of ids) {
    if (!unlocked.includes(id)) {
      unlocked.push(id);
      // During a snapshot nothing is "new": it was unlocked before the reconnect.
      if (!state.snapshotting) fresh.push(id);
    }
    if (badge && !badges.includes(id)) badges.push(id);
  }
  return { ...state, codex: { unlocked, fresh, badges } };
}

/** Roles held by a player according to `roles.state`. */
export function rolesOf(state: Pick<AppState, 'roles'>, playerId: string | null | undefined): RoleId[] {
  if (!state.roles || !playerId) return [];
  const out: RoleId[] = [];
  for (const g of state.roles.groups) if (g.playerId === playerId) out.push(...g.roles);
  return out;
}

function shift(t: number | null, by: number): number | null {
  return t == null ? null : t + by;
}

function reduceMessage(state: AppState, msg: Message, nowMs: number): AppState {
  switch (msg.t) {
    // ───────────── membership ─────────────
    case 'room.joined': {
      const me: Me = {
        room: msg.d.room,
        kind: msg.d.kind,
        id: msg.d.id,
        slot: msg.d.slot,
        pendingPlayer: msg.d.pendingPlayer,
        spectatorReason: msg.d.spectatorReason,
      };
      // A fresh join starts from a clean slate; only device-local things survive.
      const base = initialState(state.prefs, state.conn.kind);
      return { ...base, conn: state.conn, codex: state.codex, me, snapshotting: true, nextId: state.nextId };
    }
    case 'room.resumed': {
      if (msg.d.kind === 'HOST') return state;
      const me: Me = {
        room: msg.d.room,
        kind: msg.d.kind,
        id: msg.d.id,
        slot: msg.d.slot,
        pendingPlayer: msg.d.pendingPlayer,
        spectatorReason: state.me?.spectatorReason ?? null,
      };
      // The snapshot that follows replays whatever is still active. Mark what we hold as
      // stale; anything not replayed by snapshot.end has ended while we were away.
      return {
        ...state,
        me,
        snapshotting: true,
        joinError: null,
        paused: null,
        vote: state.vote ? { ...state.vote, stale: true } : null,
        poll: state.poll ? { ...state.poll, stale: true } : null,
        mg: state.mg ? { ...state.mg, stale: true } : null,
        flight: { ...state.flight, alerts: [], blackout: null },
      };
    }
    case 'snapshot.end': {
      let next: AppState = { ...state, snapshotting: false };
      if (next.vote?.stale) next = { ...next, vote: null };
      if (next.poll?.stale) next = { ...next, poll: null };
      if (next.mg?.stale) {
        // The run ended while we were away. Keep a result screen that is already showing.
        next = next.mg.summary ? { ...next, mg: { ...next.mg, stale: false } } : { ...next, mg: null };
      }
      return next;
    }
    case 'room.promoted': {
      if (!state.me) return state;
      return { ...state, me: { ...state.me, kind: 'PLAYER', id: msg.d.id, slot: msg.d.slot, pendingPlayer: false, spectatorReason: null } };
    }
    case 'room.state':
      return { ...state, room: msg.d, paused: msg.d.paused ? state.paused : null };
    case 'settings.state':
      return { ...state, settings: msg.d.settings };
    case 'roles.state':
      return { ...state, roles: msg.d };
    case 'bye': {
      if (msg.d.canResume) return state;
      if (msg.d.reason === 'REPLACED') return state;
      // The membership is gone: back to the Join screen (the reason stays in `conn`).
      const base = initialState(state.prefs, state.conn.kind);
      return { ...base, conn: state.conn, codex: state.codex, nextId: state.nextId };
    }
    case 'error': {
      const { code } = msg.d;
      if (!state.me) {
        if (code === 'TOKEN_INVALID') return state;
        return { ...state, joinError: { code, suggestion: msg.d.suggestion ?? null } };
      }
      let next: AppState = {
        ...state,
        error: { id: state.nextId, code, reT: msg.d.reT, retryAfterMs: msg.d.retryAfterMs ?? null },
        nextId: state.nextId + 1,
      };
      // Roll back the optimistic ballot when the cast was refused.
      if (msg.d.reT === 'vote.cast' && next.vote) next = { ...next, vote: { ...next.vote, pendingBallot: null } };
      if (msg.d.reT === 'vote.predict' && next.vote && code !== 'ALREADY_ANSWERED') {
        next = { ...next, vote: { ...next.vote, predict: { ...next.vote.predict, myChoice: null } } };
      }
      if (msg.d.reT === 'poll.answer' && next.poll && code !== 'ALREADY_ANSWERED') next = { ...next, poll: { ...next.poll, myAnswer: null } };
      return next;
    }

    // ───────────── phase, pause, notices ─────────────
    case 'phase.set': {
      const prev = state.phase;
      let next: AppState = { ...state, phase: msg.d };
      const phaseChanged = !prev || prev.phase !== msg.d.phase;
      const newMission = !!prev && msg.d.missionSeq > prev.missionSeq;
      if (phaseChanged) {
        // A change of phase cancels the active vote round and poll (messages.md section 6).
        if (next.poll) next = { ...next, poll: null };
        if (next.mg && (next.mg.summary || next.mg.cancelled)) next = { ...next, mg: { ...next.mg, dismissed: true } };
        if (msg.d.phase !== 'DEBRIEF' && prev?.phase === 'DEBRIEF') next = { ...next, debrief: { score: null, awards: null, facts: null } };
        // A new countdown clears the flight state, but keeps console layouts and seats the host
        // may already have sent for this flight (they are replaced by the next console.config).
        if (msg.d.phase === 'COUNTDOWN' && prev?.phase !== 'FLIGHT') next = { ...next, flight: { ...emptyFlight(), consoles: next.flight.consoles, pilot: next.flight.pilot } };
      }
      if (newMission) {
        next = {
          ...next,
          build: null,
          boosts: [],
          sync: null,
          lastVote: null,
          flight: emptyFlight(),
          debrief: { score: null, awards: null, facts: null },
          kp: { ...next.kp, mine: 0, last: null },
        };
      }
      return next;
    }
    case 'game.paused':
      return { ...state, paused: msg.d };
    case 'game.resumed': {
      const by = msg.d.pausedForMs;
      let next: AppState = { ...state, paused: null };
      if (next.vote?.stage) {
        next = { ...next, vote: { ...next.vote, stage: { ...next.vote.stage!, endsAtMs: shift(next.vote.stage!.endsAtMs, by) } } };
      }
      if (next.poll && !next.poll.result) next = { ...next, poll: { ...next.poll, call: { ...next.poll.call, endsAtMs: next.poll.call.endsAtMs + by } } };
      if (next.mg && !next.mg.summary) next = { ...next, mg: { ...next.mg, start: { ...next.mg.start, startAtMs: next.mg.start.startAtMs + by } } };
      next = {
        ...next,
        flight: {
          ...next.flight,
          alerts: next.flight.alerts.map((a) => ({ ...a, endsAtMs: a.endsAtMs + by })),
          blackout: next.flight.blackout ? { ...next.flight.blackout, expectedEndAtMs: shift(next.flight.blackout.expectedEndAtMs, by) } : null,
        },
      };
      if (next.room) {
        next = { ...next, room: { ...next.room, paused: false, players: next.room.players.map((p) => ({ ...p, slotExpiresAtMs: shift(p.slotExpiresAtMs, by) })) } };
      }
      return next;
    }
    case 'notice.show': {
      if (msg.d.to && state.me && !msg.d.to.includes(state.me.id)) return state;
      const item = { id: state.nextId, atMs: nowMs, notice: msg.d };
      const next = pushFeed(state, { kind: 'notice', ...item });
      return state.snapshotting ? next : { ...next, notice: item };
    }

    // ───────────── build ─────────────
    case 'build.state':
      return { ...state, build: msg.d };
    case 'build.event':
      return pushFeed(state, { kind: 'build', id: state.nextId, atMs: nowMs, event: msg.d });

    // ───────────── votes ─────────────
    case 'vote.opened': {
      const round = newRound(msg.d, state.vote);
      let next: AppState = { ...state, vote: round, poll: null };
      if (next.mg && !next.mg.dismissed && (next.mg.summary || next.mg.cancelled)) next = { ...next, mg: { ...next.mg, dismissed: true } };
      return next;
    }
    case 'vote.stage': {
      const next = withRound(state, msg.d.roundId, (r) => ({
        ...r,
        stage: msg.d,
        // A ballot is per voting stage: a runoff starts empty (the server also sends vote.ack).
        pendingBallot: r.stage && r.stage.stage !== msg.d.stage ? null : r.pendingBallot,
      }));
      if (msg.d.stage === 'CLOSED' && next.vote && next.vote.opened.roundId === msg.d.roundId) {
        return { ...next, lastVote: next.vote, vote: null };
      }
      return next;
    }
    case 'vote.insight': {
      const mine = rolesOf(state, state.me?.id);
      if (mine.length > 0 && !mine.includes(msg.d.role)) return state;
      return withRound(state, msg.d.roundId, (r) => ({ ...r, insight: msg.d.lines }));
    }
    case 'vote.tags':
      return withRound(state, msg.d.roundId, (r) => ({ ...r, tags: msg.d.tags }));
    case 'vote.tally':
      return withRound(state, msg.d.roundId, (r) => ({ ...r, tally: msg.d }));
    case 'vote.ack':
      return withRound(state, msg.d.roundId, (r) => ({ ...r, myBallot: msg.d.optionId, ballotNote: msg.d.reason, pendingBallot: null }));
    case 'vote.vetoed':
      return withRound(state, msg.d.roundId, (r) => ({
        ...r,
        vetoes: r.vetoes.some((v) => v.optionId === msg.d.optionId) ? r.vetoes : [...r.vetoes, msg.d],
        pendingBallot: r.pendingBallot === msg.d.optionId ? null : r.pendingBallot,
      }));
    case 'vote.predict.result':
      return withRound(state, msg.d.roundId, (r) => ({ ...r, predict: { ...r.predict, result: msg.d } }));
    case 'vote.trivia.open':
      return withRound(state, msg.d.roundId, (r) => ({ ...r, trivia: { ...r.trivia, open: msg.d } }));
    case 'vote.trivia.result':
      return withRound(state, msg.d.roundId, (r) => ({ ...r, trivia: { ...r.trivia, result: msg.d } }));
    case 'vote.result':
      return withRound(state, msg.d.roundId, (r) => ({ ...r, result: msg.d, pendingBallot: null }));
    case 'vote.commit': {
      let next = withRound(state, msg.d.roundId, (r) => ({ ...r, commit: msg.d }));
      if (next.lastVote && next.lastVote.opened.roundId === msg.d.roundId) next = { ...next, lastVote: { ...next.lastVote, commit: msg.d } };
      return addCodex(next, msg.d.codexIds, false);
    }
    case 'vote.cancelled':
      return state.vote && state.vote.opened.roundId === msg.d.roundId ? { ...state, vote: null } : state;

    // ───────────── pings and reactions ─────────────
    case 'ping.event': {
      const item = { id: state.nextId, atMs: nowMs, playerId: msg.d.playerId, ping: msg.d, emoji: null };
      let next: AppState = { ...state, social: [...state.social, item].slice(-SOCIAL_MAX), nextId: state.nextId + 1 };
      if (msg.d.roundId) next = withRound(next, msg.d.roundId, (r) => ({ ...r, pings: [...r.pings, msg.d].slice(-24) }));
      return next;
    }
    case 'react.event': {
      const item = { id: state.nextId, atMs: nowMs, playerId: msg.d.playerId, ping: null, emoji: msg.d.emoji };
      return { ...state, social: [...state.social, item].slice(-SOCIAL_MAX), nextId: state.nextId + 1 };
    }

    // ───────────── GO / NO-GO poll ─────────────
    case 'poll.call': {
      const same = state.poll && state.poll.pollId === msg.d.pollId ? state.poll : null;
      const poll: PollState = {
        pollId: msg.d.pollId,
        call: msg.d,
        callAtMs: Math.min(nowMs, msg.d.endsAtMs),
        answered: same ? same.answered : [],
        myAnswer: same ? same.myAnswer : null,
        result: null,
        stale: false,
      };
      return { ...state, poll };
    }
    case 'poll.answered': {
      if (!state.poll || state.poll.pollId !== msg.d.pollId) return state;
      const answered = state.poll.answered.filter((e) => e.playerId !== msg.d.entry.playerId);
      return { ...state, poll: { ...state.poll, answered: [...answered, msg.d.entry] } };
    }
    case 'poll.result': {
      if (!state.poll || state.poll.pollId !== msg.d.pollId) return state;
      return { ...state, poll: { ...state.poll, answered: msg.d.answers, result: msg.d } };
    }

    // ───────────── flight ─────────────
    case 'flight.hud':
      return { ...state, flight: { ...state.flight, hud: msg.d } };
    case 'flight.event': {
      const events = [...state.flight.events, msg.d].slice(-EVENTS_MAX);
      return pushFeed({ ...state, flight: { ...state.flight, events } }, { kind: 'flight', id: state.nextId, atMs: nowMs, event: msg.d });
    }
    case 'pilot.assign':
      return { ...state, flight: { ...state.flight, pilot: msg.d } };
    case 'pilot.hud':
      return state.me && msg.d.to.includes(state.me.id) ? { ...state, pilotHud: msg.d, pilotHudFor: state.flight.pilot } : state;
    case 'react.audience':
      return { ...state, audience: [...state.audience, { id: state.nextId, atMs: nowMs, windowMs: msg.d.windowMs, counts: msg.d.counts }].slice(-AUDIENCE_MAX), nextId: state.nextId + 1 };
    case 'console.config': {
      const prev = state.flight.consoles[msg.d.role];
      const consoleState: ConsoleState = { config: msg.d, values: prev?.values ?? {}, metS: prev?.metS ?? null, history: prev?.history ?? {} };
      return { ...state, flight: { ...state.flight, consoles: { ...state.flight.consoles, [msg.d.role]: consoleState } } };
    }
    case 'console.telemetry': {
      const prev = state.flight.consoles[msg.d.role];
      if (!prev) return state; // no layout yet: nothing to draw the values on
      const history = { ...prev.history };
      for (const [ch, v] of Object.entries(msg.d.v) as Array<[TelemetryChannel, number]>) {
        const h = history[ch] ? [...history[ch]!, v] : [v];
        history[ch] = h.length > HISTORY_MAX ? h.slice(h.length - HISTORY_MAX) : h;
      }
      const next: ConsoleState = { ...prev, values: { ...prev.values, ...msg.d.v }, metS: msg.d.metS, history };
      return { ...state, flight: { ...state.flight, consoles: { ...state.flight.consoles, [msg.d.role]: next } } };
    }
    case 'console.alert': {
      const alerts = state.flight.alerts.filter((a) => a.alertId !== msg.d.alertId && a.endsAtMs > nowMs - 4000);
      return { ...state, flight: { ...state.flight, alerts: [...alerts, { ...msg.d, calledAtMs: null, good: false }] } };
    }
    case 'console.goodcall': {
      const alerts = state.flight.alerts.map((a) => (a.alertId === msg.d.alertId ? { ...a, good: true } : a));
      return { ...state, flight: { ...state.flight, alerts, goodCalls: [...state.flight.goodCalls, msg.d].slice(-10) } };
    }
    case 'blackout.set':
      return { ...state, flight: { ...state.flight, blackout: msg.d.active ? msg.d : null } };

    // ───────────── boosts, sync, knowledge, codex ─────────────
    case 'sync.meter':
      return { ...state, sync: msg.d };
    case 'boost.state':
      return { ...state, boosts: msg.d.boosts };
    case 'kp.awarded': {
      const mine = msg.d.entries.filter((e) => e.playerId === state.me?.id);
      const gained = mine.reduce((sum, e) => sum + e.kp, 0);
      return {
        ...state,
        kp: {
          mine: state.kp.mine + gained,
          team: msg.d.teamKp,
          last: gained > 0 && !state.snapshotting ? { id: state.nextId, kp: gained, reason: mine[0]!.reason } : state.kp.last,
        },
        nextId: state.nextId + 1,
      };
    }
    case 'codex.unlock': {
      if (msg.d.to && state.me && !msg.d.to.includes(state.me.id)) return state;
      return addCodex(state, msg.d.codexIds, msg.d.badge);
    }

    // ───────────── minigames ─────────────
    case 'mg.start': {
      if (state.mg && state.mg.start.runId === msg.d.runId) {
        // Replayed by a reconnect snapshot: keep the local run going.
        return { ...state, mg: { ...state.mg, stale: false } };
      }
      return { ...state, mg: { start: msg.d, shared: null, outcome: null, summary: null, cancelled: null, dismissed: false, stale: false } };
    }
    case 'mg.state': {
      if (!state.mg || state.mg.start.runId !== msg.d.runId) return state;
      if (state.mg.shared && state.mg.shared.n >= msg.d.n) return state;
      return { ...state, mg: { ...state.mg, shared: msg.d } };
    }
    case 'mg.summary': {
      if (!state.mg || state.mg.start.runId !== msg.d.runId) return state;
      return { ...state, mg: { ...state.mg, summary: msg.d, stale: false } };
    }
    case 'mg.cancel': {
      if (!state.mg || state.mg.start.runId !== msg.d.runId) return state;
      return { ...state, mg: null };
    }

    // ───────────── debrief ─────────────
    case 'debrief.score':
      return { ...state, debrief: { ...state.debrief, score: msg.d } };
    case 'debrief.awards':
      return { ...state, debrief: { ...state.debrief, awards: msg.d } };
    case 'debrief.facts':
      return addCodex({ ...state, debrief: { ...state.debrief, facts: msg.d } }, msg.d.codexIds, false);

    default:
      // Unknown or irrelevant types are ignored (messages.md section 2, "Unknown data").
      return state;
  }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'msg':
      return reduceMessage(state, action.msg, action.nowMs);
    case 'conn':
      return { ...state, conn: { ...action.status, kind: action.kind } };
    case 'local.cast':
      return withRound(state, action.roundId, (r) => ({ ...r, pendingBallot: action.optionId, ballotNote: null }));
    case 'local.predict':
      return withRound(state, action.roundId, (r) => (r.predict.myChoice != null ? r : { ...r, predict: { ...r.predict, myChoice: action.choiceIndex } }));
    case 'local.trivia':
      return withRound(state, action.roundId, (r) => (r.trivia.myChoice != null ? r : { ...r, trivia: { ...r.trivia, myChoice: action.choiceIndex } }));
    case 'local.triviaPick':
      return withRound(state, action.roundId, (r) => ({ ...r, trivia: { ...r.trivia, myPick: action.optionId } }));
    case 'local.pollAnswer':
      return state.poll && state.poll.pollId === action.pollId ? { ...state, poll: { ...state.poll, myAnswer: action.answer } } : state;
    case 'local.callout':
      return {
        ...state,
        flight: { ...state.flight, alerts: state.flight.alerts.map((a) => (a.alertId === action.alertId && a.calledAtMs == null ? { ...a, calledAtMs: action.atMs } : a)) },
      };
    case 'local.request':
      return { ...state, flight: { ...state.flight, requests: [...state.flight.requests, { role: action.role, requestId: action.requestId, atMs: action.atMs }].slice(-6) } };
    case 'local.roleCardSeen':
      return { ...state, roleCardSeen: action.signature };
    case 'local.prefs':
      return { ...state, prefs: action.prefs };
    case 'local.mgOutcome':
      return state.mg && state.mg.start.runId === action.runId && !state.mg.outcome ? { ...state, mg: { ...state.mg, outcome: action.outcome } } : state;
    case 'local.mgDismiss':
      return state.mg && state.mg.start.runId === action.runId ? { ...state, mg: { ...state.mg, dismissed: true } } : state;
    case 'local.dismissError':
      return { ...state, error: null };
    case 'local.dismissNotice':
      return { ...state, notice: null };
    case 'local.dismissJoinError':
      return { ...state, joinError: null };
    case 'local.codexSeen':
      return state.codex.fresh.length ? { ...state, codex: { ...state.codex, fresh: [] } } : state;
    case 'local.codexLoad': {
      const unlocked = [...new Set([...action.unlocked, ...state.codex.unlocked])];
      const badges = [...new Set([...action.badges, ...state.codex.badges])];
      return { ...state, codex: { ...state.codex, unlocked, badges } };
    }
    case 'local.leave': {
      const base = initialState(state.prefs, state.conn.kind);
      return { ...base, conn: state.conn, codex: state.codex, nextId: state.nextId };
    }
    default:
      return state;
  }
}
