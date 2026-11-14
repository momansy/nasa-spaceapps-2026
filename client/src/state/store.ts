// The store: one state, one reducer, the connection bound to it, and the side effects that
// do not belong in a reducer (haptics, device storage, applying preferences to the page).
import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { AttMode, Avatar, Craft, DeployTarget, ErrorCode, GoNoGo, Message, OptionId, PilotAction, PingId, PlayerPrefs, ReactionId, RoleId, TagKind } from '@protocol';
import { setLanguage } from '../i18n';
import { setNumberLocale } from '../data/format';
import { playCue, setHapticsEnabled, tap } from '../lib/haptics';
import type { ClientSendType, Connection } from '../net/connection';
import type { PayloadMap } from '@protocol';
import { DEFAULT_PREFS, initialState, reducer } from './reducer';
import { InputSampler, type Axes } from '../screens/pilot/inputSampler';
import { currentHud, myRoles, mySeat, pilotInputOpen, seatActionOpen, seatPhaseOpen } from './selectors';
import type { Action, AppState, MinigameOutcome } from './types';

const PREFS_KEY = 'mf.prefs';
const CODEX_KEY = 'mf.codex';
const PROFILE_KEY = 'mf.profile';
/**
 * First counter of a session, so a reload mid-flight never restarts `n` below what the host already
 * applied (it ignores older `pilot.input` and duplicate action counters). 33 counts per second since
 * 2026-01-01 outgrows the fastest sender (30 inputs per second); it fits int32 until 2028 (game value).
 */
const N_EPOCH_MS = Date.UTC(2026, 0, 1);
export function counterBase(nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - N_EPOCH_MS) / 30));
}

/** Longest wait for the first `pilot.hud` of a seat before the phone starts sending, ms (game value). */
const HUD_WAIT_MS = 1200;

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

/** Outcome of `Store.setProfile`: what the server answered to `player.profile`. */
export type ProfileResult = { ok: true; nickname: string } | { ok: false; code: ErrorCode | 'NO_ANSWER'; suggestion: string | null };

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

  // ───────────── pilot, co-pilot, profile (T030) ─────────────

  private samplers = new Map<Craft, InputSampler>();
  private pilotActionN = counterBase();
  private copilotActionN = counterBase();

  /** Seats that just opened and wait for the host's first `pilot.hud` before the sampler starts. */
  /** Crafts whose throttle the player has moved since the seat opened (never overwrite that). */
  private userThrottle = new Set<Craft>();
  private waiting = new Map<Craft, { hud: AppState['pilotHud']; timedOut: boolean; timer: ReturnType<typeof setTimeout> }>();
  private starters = new Map<Craft, () => void>();

  private sampler(craft: Craft): InputSampler {
    let sampler = this.samplers.get(craft);
    if (sampler) return sampler;
    const made = new InputSampler({
      send: (frame) => {
        this.send('pilot.input', { craft, ...frame });
      },
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    }, counterBase());
    sampler = made;
    this.samplers.set(craft, sampler);
    // The host holds the throttle (also across a seat handover): the first frame of a seat must
    // carry what the host reports, never a closed throttle. Wait for a `pilot.hud` that arrived
    // after the seat opened (at most `HUD_WAIT_MS`), then seed the throttle from it and start.
    let needHud = true;
    const start = () => {
      needHud = false;
      const w = this.waiting.get(craft);
      if (w) clearTimeout(w.timer);
      this.waiting.delete(craft);
      const hud = currentHud(this.state);
      if (hud && hud.craft === craft && !this.userThrottle.has(craft)) made.set({ throttle: hud.throttlePct / 100 });
      made.setActive(true);
    };
    this.starters.set(craft, () => {
      // Waited long enough for a hud: start only for a player who is actually flying (touched an axis).
      const w = this.waiting.get(craft);
      if (w?.timedOut) start();
    });
    // Stop conditions: seat moved away, input source is the host device, paused, offline, page hidden.
    const sync = () => {
      const seat = mySeat(this.state);
      // A seat that is gone (handover, HOST_DEVICE, phase over) must be re-seeded next time; a pause,
      // a hidden page or a short offline spell only stops the frames: the host kept the throttle.
      if (!(seat?.craft === craft && seatPhaseOpen(this.state))) {
        needHud = true;
        this.userThrottle.delete(craft);
      }
      const open = pilotInputOpen(this.state, craft) && !(typeof document !== 'undefined' && document.hidden);
      if (!open) {
        const w = this.waiting.get(craft);
        if (w) clearTimeout(w.timer);
        this.waiting.delete(craft);
        made.setActive(false);
        return;
      }
      if (made.isActive) return;
      if (!needHud) {
        made.setActive(true);
        return;
      }
      let w = this.waiting.get(craft);
      if (!w) {
        const created = { hud: this.state.pilotHud, timedOut: false, timer: setTimeout(() => (created.timedOut = true), HUD_WAIT_MS) };
        w = created;
        this.waiting.set(craft, w);
      }
      const hud = this.state.pilotHud;
      if (hud && hud !== w.hud && hud.craft === craft) start();
    };
    this.subscribe(sync);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync);
    sync();
    return sampler;
  }

  /** Axes of the seat's virtual gamepad (throttle holds, the others centre when the finger lifts). */
  pilotInput(craft: Craft, patch: Partial<Axes>) {
    const sampler = this.sampler(craft);
    if (patch.throttle !== undefined) this.userThrottle.add(craft);
    sampler.set(patch);
    this.starters.get(craft)?.();
  }

  /** The commanded axes (what the sampler last took), for the controls to draw. */
  pilotAxes(craft: Craft): Axes {
    return this.sampler(craft).current();
  }

  /** One completed gesture of the pilot seat (`pilot.action`). Returns false when it was not sent. */
  pilotAction(craft: Craft, action: PilotAction, extra: { attMode?: AttMode; deploy?: DeployTarget } = {}): boolean {
    const seat = mySeat(this.state);
    if (!seat || seat.craft !== craft || !seatActionOpen(this.state)) return false;
    if (action === 'ATT_HOLD' && !extra.attMode) return false;
    if (action === 'DEPLOY' && !extra.deploy) return false;
    tap();
    this.pilotActionN += 1;
    return this.send('pilot.action', {
      craft,
      n: this.pilotActionN,
      action,
      ...(action === 'ATT_HOLD' ? { attMode: extra.attMode } : {}),
      ...(action === 'DEPLOY' ? { deploy: extra.deploy } : {}),
    });
  }

  /** One completed gesture of the co-pilot seat (`copilot.action`). */
  copilotAction(action: 'STAGE' | 'DEPLOY', deploy?: DeployTarget): boolean {
    const seat = mySeat(this.state);
    if (seat?.kind !== 'COPILOT' || !seatActionOpen(this.state)) return false;
    if (action === 'DEPLOY' && !deploy) return false;
    tap();
    this.copilotActionN += 1;
    return this.send('copilot.action', { n: this.copilotActionN, action, ...(action === 'DEPLOY' ? { deploy } : {}) });
  }

  /** Changes nickname and avatar in the lobby (`player.profile`); resolves with the server's answer. */
  setProfile(nickname: string, avatar: Avatar): Promise<ProfileResult> {
    return new Promise((resolve) => {
      let settled = false;
      const before = this.state.room?.players.find((p) => p.id === this.state.me?.id)?.nickname;
      const finish = (r: ProfileResult) => {
        if (settled) return;
        settled = true;
        off();
        clearTimeout(timer);
        if (r.ok) saveProfile({ nickname: r.nickname, avatar });
        resolve(r);
      };
      const off = this.conn.subscribe((msg) => {
        if (msg.t === 'error' && msg.d.reT === 'player.profile') finish({ ok: false, code: msg.d.code, suggestion: msg.d.suggestion ?? null });
        if (msg.t === 'room.state') {
          const me = msg.d.players.find((p) => p.id === this.state.me?.id);
          // Our change is in once the avatar matches and the nickname is the one asked for (or any new one,
          // when the server normalised it); a `room.state` about someone else must not count.
          const same = me && me.avatar.suitId === avatar.suitId && me.avatar.patchId === avatar.patchId;
          if (me && same && (me.nickname.toLowerCase() === nickname.toLowerCase() || me.nickname !== before)) finish({ ok: true, nickname: me.nickname });
        }
      });
      const timer = setTimeout(() => finish({ ok: false, code: 'NO_ANSWER', suggestion: null }), 4000);
      if (!this.send('player.profile', { nickname, avatar })) finish({ ok: false, code: 'NO_ANSWER', suggestion: null });
    });
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
