// The store: one state, one reducer, the connection bound to it, and the side effects that
// do not belong in a reducer (haptics, device storage, applying preferences to the page).
import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { Avatar, GoNoGo, Message, OptionId, PingId, PlayerPrefs, ReactionId, RoleId, TagKind } from '@protocol';
import { setLanguage } from '../i18n';
import { setNumberLocale } from '../data/format';
import { playCue, setHapticsEnabled, tap } from '../lib/haptics';
import type { ClientSendType, Connection } from '../net/connection';
import type { PayloadMap } from '@protocol';
import { DEFAULT_PREFS, initialState, reducer } from './reducer';
import { myRoles } from './selectors';
import type { Action, AppState, MinigameOutcome } from './types';

const PREFS_KEY = 'mf.prefs';
const CODEX_KEY = 'mf.codex';
const PROFILE_KEY = 'mf.profile';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: preferences last for this visit only */
  }
}

/** Preferences saved on the device, with the system's motion and contrast wishes as defaults. */
export function loadPrefs(): PlayerPrefs {
  const saved = readJson<Partial<PlayerPrefs>>(PREFS_KEY) ?? {};
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const prefs: PlayerPrefs = {
    ...DEFAULT_PREFS,
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    highContrast: mq('(prefers-contrast: more)'),
    ...saved,
  };
  prefs.textScalePct = Math.min(200, Math.max(100, Math.round(prefs.textScalePct)));
  return prefs;
}

export interface SavedProfile {
  nickname: string;
  avatar: Avatar;
}

export function loadProfile(): SavedProfile | null {
  return readJson<SavedProfile>(PROFILE_KEY);
}

export function saveProfile(p: SavedProfile) {
  writeJson(PROFILE_KEY, p);
}

/** Applies device preferences plus the room-wide accessibility flags to the page. */
export function applyPrefsToDocument(state: Pick<AppState, 'prefs' | 'settings'>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const a11y = state.settings?.a11y;
  const reduced = state.prefs.reducedMotion || !!a11y?.reducedMotion;
  const contrast = state.prefs.highContrast || !!a11y?.highContrast;
  root.style.setProperty('--text-scale', String(state.prefs.textScalePct / 100));
  root.dataset.textScale = state.prefs.textScalePct >= 150 ? 'large' : 'normal';
  root.dataset.motion = reduced ? 'reduced' : 'full';
  root.dataset.contrast = contrast ? 'high' : 'normal';
  setHapticsEnabled(state.prefs.haptics);
}

export function isReducedMotion(state: Pick<AppState, 'prefs' | 'settings'>): boolean {
  return state.prefs.reducedMotion || !!state.settings?.a11y.reducedMotion;
}

export class Store {
  private state: AppState;
  private listeners = new Set<() => void>();
  readonly conn: Connection;

  constructor(conn: Connection, prefs: PlayerPrefs = DEFAULT_PREFS) {
    this.conn = conn;
    this.state = initialState(prefs, conn.kind);
    this.state = { ...this.state, conn: { ...conn.getStatus(), kind: conn.kind } };
    const saved = readJson<{ unlocked?: string[]; badges?: string[] }>(CODEX_KEY);
    if (saved) this.state = reducer(this.state, { type: 'local.codexLoad', unlocked: saved.unlocked ?? [], badges: saved.badges ?? [] });
    conn.subscribe((msg) => this.onMessage(msg));
    conn.subscribeStatus((status) => this.dispatch({ type: 'conn', status, kind: conn.kind }));
  }

  getState = (): AppState => this.state;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  dispatch(action: Action) {
    const prev = this.state;
    const next = reducer(prev, action);
    if (next === prev) return;
    this.state = next;
    if (next.codex !== prev.codex) writeJson(CODEX_KEY, { unlocked: next.codex.unlocked, badges: next.codex.badges });
    if (next.prefs !== prev.prefs || next.settings !== prev.settings) applyPrefsToDocument(next);
    this.listeners.forEach((l) => l());
  }

  /** Server clock now (ms). */
  now(): number {
    return this.conn.now();
  }

  private onMessage(msg: Message) {
    const before = this.state;
    this.dispatch({ type: 'msg', msg, nowMs: this.conn.now() });
    // Effects are skipped while a snapshot is replayed (messages.md `snapshot.end`).
    if (before.snapshotting || this.state.snapshotting) return;
    const me = this.state.me;
    switch (msg.t) {
      case 'haptic.cue':
        if (me?.kind === 'PLAYER' && (!msg.d.to || msg.d.to.includes(me.id))) playCue(msg.d.cue);
        break;
      case 'console.alert':
        if (myRoles(this.state).includes(msg.d.role)) playCue('ALERT');
        break;
      case 'vote.vetoed':
        playCue('VETO');
        break;
      case 'poll.call':
        if (me && msg.d.playerId === me.id) playCue('ALERT');
        break;
      default:
        break;
    }
  }

  private send<T extends ClientSendType>(t: T, d: PayloadMap[T]): boolean {
    return this.conn.send(t, d);
  }

  // ───────────── actions (what screens call) ─────────────

  join(room: string, nickname: string, avatar: Avatar, asSpectator = false) {
    this.dispatch({ type: 'local.dismissJoinError' });
    saveProfile({ nickname, avatar });
    this.conn.join(
      asSpectator
        ? { room, as: 'SPECTATOR', prefs: this.state.prefs }
        : { room, as: 'PLAYER', nickname, avatar, prefs: this.state.prefs },
    );
  }

  leave() {
    this.conn.leave();
    this.dispatch({ type: 'local.leave' });
  }

  setPrefs(patch: Partial<PlayerPrefs>) {
    const prefs = { ...this.state.prefs, ...patch };
    writeJson(PREFS_KEY, prefs);
    this.dispatch({ type: 'local.prefs', prefs });
    if (patch.lang) {
      setNumberLocale(prefs.lang);
      void setLanguage(prefs.lang);
    }
    this.send('player.prefs', { prefs });
  }

  castVote(optionId: OptionId) {
    const round = this.state.vote;
    if (!round) return;
    tap();
    this.dispatch({ type: 'local.cast', roundId: round.opened.roundId, optionId });
    this.send('vote.cast', { roundId: round.opened.roundId, optionId });
  }

  veto(optionId: OptionId) {
    const round = this.state.vote;
    if (round) this.send('vote.veto', { roundId: round.opened.roundId, optionId });
  }

  tag(optionId: OptionId, tag: TagKind | null) {
    const round = this.state.vote;
    if (round) this.send('vote.tag', { roundId: round.opened.roundId, optionId, tag });
  }

  predict(choiceIndex: number) {
    const round = this.state.vote;
    if (!round || round.predict.myChoice != null) return;
    tap();
    this.dispatch({ type: 'local.predict', roundId: round.opened.roundId, choiceIndex });
    this.send('vote.predict', { roundId: round.opened.roundId, choiceIndex });
  }

  answerTrivia(choiceIndex: number) {
    const round = this.state.vote;
    if (!round || round.trivia.myChoice != null) return;
    tap();
    this.dispatch({ type: 'local.trivia', roundId: round.opened.roundId, choiceIndex });
    this.send('vote.trivia.answer', { roundId: round.opened.roundId, choiceIndex });
  }

  pickTiebreak(optionId: OptionId) {
    const round = this.state.vote;
    if (!round) return;
    tap();
    this.dispatch({ type: 'local.triviaPick', roundId: round.opened.roundId, optionId });
    this.send('vote.trivia.pick', { roundId: round.opened.roundId, optionId });
  }

  ping(pingId: PingId, optionId: OptionId | null) {
    this.send('ping.send', { pingId, optionId });
  }

  react(emoji: ReactionId) {
    this.send('react.send', { emoji });
  }

  answerPoll(answer: GoNoGo) {
    const poll = this.state.poll;
    if (!poll || poll.myAnswer) return;
    tap();
    this.dispatch({ type: 'local.pollAnswer', pollId: poll.pollId, answer });
    this.send('poll.answer', { pollId: poll.pollId, answer });
  }

  spendAbility(role: RoleId, extra: { optionId?: OptionId; stageIndex?: number } = {}) {
    const round = this.state.vote;
    this.send('ability.use', {
      role,
      ...(role === 'FLIGHT' && round ? { roundId: round.opened.roundId } : {}),
      ...(extra.optionId ? { optionId: extra.optionId } : {}),
      ...(extra.stageIndex ? { stageIndex: extra.stageIndex } : {}),
    });
  }

  callout(role: RoleId, calloutId: string) {
    const atMs = Math.round(this.now());
    // Answer the open alert of this console that asks for this callout, if there is one.
    const alert = this.state.flight.alerts.find((a) => a.role === role && a.calloutId === calloutId && a.calledAtMs == null && a.endsAtMs >= atMs);
    tap();
    if (alert) this.dispatch({ type: 'local.callout', alertId: alert.alertId, atMs });
    this.send('console.callout', { role, calloutId, arg: alert ? alert.arg : null, alertId: alert ? alert.alertId : null, atMs });
  }

  request(role: RoleId, requestId: string) {
    tap();
    this.dispatch({ type: 'local.request', role, requestId, atMs: Math.round(this.now()) });
    this.send('console.request', { role, requestId });
  }

  minigameReady(runId: string) {
    this.send('mg.ready', { runId });
  }

  private mgActionN = new Map<string, number>();

  /** One move of a shared-state minigame (`mg.action`), numbered per run. */
  minigameAction(runId: string, a: string, x: number[] = []) {
    const mg = this.state.mg;
    if (!mg || mg.start.runId !== runId || this.state.me?.kind !== 'PLAYER') return;
    // Protocol limits (mg.action schema): name ^[a-z][a-z0-9_]{0,23}$, at most 8 numbers.
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(a)) return;
    const n = (this.mgActionN.get(runId) ?? 0) + 1;
    this.mgActionN.set(runId, n);
    this.send('mg.action', { runId, n, a, x: x.filter((v) => Number.isFinite(v)).slice(0, 8) });
  }

  minigameProgress(runId: string, p: number) {
    this.send('mg.progress', { runId, p: Math.min(1, Math.max(0, p)) });
  }

  /** Reports the local result of a minigame run: exactly one `mg.result` per run. */
  minigameResult(runId: string, outcome: MinigameOutcome) {
    const mg = this.state.mg;
    if (!mg || mg.start.runId !== runId || mg.outcome) return;
    this.dispatch({ type: 'local.mgOutcome', runId, outcome });
    this.send('mg.result', {
      runId,
      minigameId: mg.start.minigameId,
      success: outcome.success,
      perfect: outcome.perfect && outcome.success,
      score: Math.min(1, Math.max(0, outcome.score)),
      value: outcome.value,
      elapsedMs: Math.max(0, Math.round(outcome.elapsedMs)),
      finishedAtMs: Math.round(this.now()),
      mode: outcome.mode,
    });
  }

  dismissMinigame(runId: string) {
    this.dispatch({ type: 'local.mgDismiss', runId });
  }

  ackRoleCard(signature: string) {
    this.dispatch({ type: 'local.roleCardSeen', signature });
  }
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext is missing');
  return store;
}

/** Shallow equality for primitives, arrays and plain objects. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/**
 * Subscribes to a slice of the state. The selector runs once per state change; the component
 * re-renders only when the selected value changes (shallow comparison by default, so selectors
 * may return fresh arrays or small objects).
 */
export function useSel<T>(selector: (s: AppState) => T, isEqual: (a: T, b: T) => boolean = shallowEqual): T {
  const store = useStore();
  const cache = useRef<{ state: AppState; value: T } | null>(null);
  const get = () => {
    const state = store.getState();
    const prev = cache.current;
    if (prev && prev.state === state) return prev.value;
    const value = selector(state);
    if (prev && isEqual(prev.value, value)) {
      cache.current = { state, value: prev.value };
      return prev.value;
    }
    cache.current = { state, value };
    return value;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}
