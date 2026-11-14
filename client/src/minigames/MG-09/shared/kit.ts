// Browser glue shared by the T020 minigames: one canvas, the play clock (pause aware), input
// time stamps, pointer and keyboard wiring, ARIA read-back, the frame loop with a slow backup
// timer, exactly-once result reporting and the looping demo. The rules stay in each
// minigame's pure `model.ts`; the drawing in its `render.ts`.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameResult } from '../../types';
import { DPR_CAP, setDprCap } from './draw';

export type PointerKind = 'down' | 'move' | 'up';

export interface AriaState {
  valuetext: string;
  now?: number;
  min?: number;
  max?: number;
}

export interface FrameInfo {
  /** Real time, ms (animation only, never rules). */
  timeMs: number;
  /** Play time, ms. */
  playMs: number;
  started: boolean;
  paused: boolean;
  finished: boolean;
}

/** One running minigame as the kit sees it. */
export interface CanvasGame {
  /** Simulates up to play time `ms`. */
  advance(ms: number): void;
  /** Pointer input in CSS pixels inside the canvas, stamped with play time. */
  pointer(kind: PointerKind, x: number, y: number, ms: number, id: number): void;
  /** Keyboard input; returns true when the key was used (its default action is then prevented). */
  key(kind: 'down' | 'up', key: string, ms: number, repeat: boolean): boolean;
  /** Lets go of everything held (pause, focus lost). */
  release(ms: number): void;
  draw(frame: FrameInfo): void;
  resize(): void;
  /** Play ended before the time ran out. */
  done(): boolean;
  /** Final result (computed by replay of the input log). Called once. */
  result(): MinigameResult;
  /** Coarse progress 0–1 for the host's team meter. */
  progress(): number;
  aria(): AriaState;
  /** Optional per-frame work after `advance` (haptics, coop messages). */
  afterAdvance?(ms: number): void;
  dispose?(): void;
}

export interface GameSpec {
  /** ARIA role of the playfield (`slider`, `application`…). */
  role: string;
  /** String key of the playfield's accessible name. */
  labelKey: string;
  /** Builds a game. Called once at mount (preview, seed 0, default params) and once at start. */
  make(canvas: HTMLCanvasElement, params: MgMap, seed: number, preview: boolean): CanvasGame;
}

export function makeCanvas(root: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const s = canvas.style;
  s.display = 'block';
  s.width = '100%';
  s.height = '100%';
  s.touchAction = 'none';
  s.userSelect = 'none';
  s.setProperty('-webkit-user-select', 'none');
  s.setProperty('-webkit-touch-callout', 'none');
  s.setProperty('-webkit-tap-highlight-color', 'transparent');
  root.appendChild(canvas);
  return canvas;
}

export function watchSize(el: HTMLElement, cb: () => void): () => void {
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(cb);
    ro.observe(el);
    return () => ro.disconnect();
  }
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

/**
 * Time of an input event on the `performance.now()` clock. `event.timeStamp` is used when it is
 * plausible (old engines used the epoch, a fake test clock runs elsewhere); otherwise now.
 */
export function eventTime(e: Event): number {
  const now = performance.now();
  const ts = e.timeStamp;
  return typeof ts === 'number' && ts <= now + 20 && ts >= now - 500 ? Math.min(ts, now) : now;
}

/**
 * Dynamic resolution: watches frame intervals and lowers the canvas resolution one step (2 →
 * 1.5 → 1 device pixels per CSS pixel) when the median of the last 20 frames is slower than
 * about 36 fps (straight to 1 below 22 fps). Never raises it again during a run (no oscillation). Returns true on a change.
 */
export class FramePacer {
  private readonly dts = new Float32Array(20);
  private n = 0;
  private last = -1;
  private readonly sorted = new Float32Array(20);

  frame(now: number): boolean {
    if (this.last >= 0) {
      const dt = now - this.last;
      // Ignore stalls (tab hidden, pause): they say nothing about drawing cost.
      if (dt < 250) this.dts[this.n++ % 20] = dt;
    }
    this.last = now;
    if (this.n < 20 || this.n % 20 !== 0 || DPR_CAP <= 1) return false;
    this.sorted.set(this.dts);
    this.sorted.sort();
    const median = this.sorted[10]!;
    if (median <= 28) return false;
    setDprCap(median > 45 || DPR_CAP <= 1.5 ? 1 : 1.5);
    return true;
  }
}

/** Mounts a playable minigame and returns the host interface (types.ts). */
export function mountGame(root: HTMLElement, env: MinigameEnv, spec: GameSpec): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', spec.role);
  canvas.setAttribute('aria-label', env.t(spec.labelKey));

  // `aria-valuetext` is read only on value roles (slider): other playfields also get a polite
  // live region, updated with the same text at most every 2 s.
  const live = spec.role === 'slider' ? null : document.createElement('div');
  if (live) {
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('role', 'status');
    const ls = live.style;
    ls.position = 'absolute';
    ls.width = '1px';
    ls.height = '1px';
    ls.overflow = 'hidden';
    ls.clip = 'rect(0 0 0 0)';
    ls.whiteSpace = 'nowrap';
    root.appendChild(live);
  }
  let liveAt = -1e9;
  let liveText = '';

  let game = spec.make(canvas, {}, 0, true);
  let started = false;
  let paused = false;
  let destroyed = false;
  let finished = false;
  let resultCb: ((r: MinigameResult) => void) | null = null;
  let pending: MinigameResult | null = null;

  // Play clock: performance.now() minus the start and the paused time.
  let startPerf = 0;
  let pausedTotal = 0;
  let pauseAt = -1;
  const durationMs = Math.max(1, env.durationMs);
  const playAt = (perf: number) => {
    if (!started) return 0;
    const stopAt = pauseAt >= 0 ? Math.min(perf, pauseAt) : perf;
    return Math.min(durationMs, Math.max(0, stopAt - startPerf - pausedTotal));
  };

  let raf = 0;
  let lastAriaText = '';
  let lastAriaAt = -1;
  let lastProgressAt = -1;
  let rect = { left: 0, top: 0 };
  const readRect = () => {
    const r = canvas.getBoundingClientRect();
    rect = { left: r.left, top: r.top };
  };

  const updateAria = (force: boolean) => {
    const a = game.aria();
    if (!force && a.valuetext === lastAriaText) return;
    lastAriaText = a.valuetext;
    canvas.setAttribute('aria-valuetext', a.valuetext);
    if (live) {
      const now = performance.now();
      if (force || now - liveAt >= 2000) {
        if (a.valuetext !== liveText) {
          live.textContent = a.valuetext;
          liveText = a.valuetext;
        }
        liveAt = now;
      }
    }
    if (a.now !== undefined) canvas.setAttribute('aria-valuenow', String(Math.round(a.now)));
    if (a.min !== undefined) canvas.setAttribute('aria-valuemin', String(Math.round(a.min)));
    if (a.max !== undefined) canvas.setAttribute('aria-valuemax', String(Math.round(a.max)));
  };

  const finish = () => {
    if (finished || destroyed) return;
    finished = true;
    const r = game.result();
    const result: MinigameResult = { success: r.success, perfect: r.success && r.perfect, score: Math.min(1, Math.max(0, r.score)) };
    if (r.value !== undefined) result.value = r.value;
    if (resultCb) resultCb(result);
    else pending = result;
  };

  const step = (perf: number) => {
    if (!started || paused || finished || destroyed) return;
    const ms = playAt(perf);
    game.advance(ms);
    game.afterAdvance?.(ms);
    if (ms - lastProgressAt >= 500) {
      lastProgressAt = ms;
      env.reportProgress(Math.min(1, Math.max(0, game.progress())));
    }
    if (ms - lastAriaAt >= 100) {
      lastAriaAt = ms;
      updateAria(false);
    }
    if (game.done() || ms >= durationMs) {
      game.advance(durationMs);
      finish();
    }
  };

  const pacer = new FramePacer();
  const frame = () => {
    if (destroyed) return;
    const now = performance.now();
    if (pacer.frame(now)) game.resize();
    step(now);
    game.draw({ timeMs: now, playMs: playAt(now), started, paused, finished });
    raf = requestAnimationFrame(frame);
  };
  // Keeps the run on the clock when the browser stops animation frames (tab in background).
  const backup = window.setInterval(() => step(performance.now()), 250);

  const accepting = () => started && !paused && !finished && !destroyed;

  const onDown = (e: PointerEvent) => {
    if (!accepting()) return;
    e.preventDefault();
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      /* focus is a convenience for keyboard players only */
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: moves still arrive while over the canvas */
    }
    readRect();
    const ms = playAt(eventTime(e));
    game.advance(ms);
    game.pointer('down', e.clientX - rect.left, e.clientY - rect.top, ms, e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!accepting()) return;
    const ms = playAt(eventTime(e));
    game.pointer('move', e.clientX - rect.left, e.clientY - rect.top, ms, e.pointerId);
  };
  const onUp = (e: PointerEvent) => {
    if (!started || destroyed) return;
    const ms = playAt(eventTime(e));
    game.pointer('up', e.clientX - rect.left, e.clientY - rect.top, ms, e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!accepting()) return;
    const ms = playAt(eventTime(e));
    game.advance(ms);
    if (game.key('down', e.key, ms, e.repeat)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!started || destroyed) return;
    if (game.key('up', e.key, playAt(eventTime(e)), false)) e.preventDefault();
  };
  const onBlur = () => {
    if (started) game.release(playAt(performance.now()));
  };
  const noMenu = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('blur', onBlur);
  canvas.addEventListener('contextmenu', noMenu);
  const unwatch = watchSize(root, () => {
    if (destroyed) return;
    readRect();
    game.resize();
  });
  readRect();
  raf = requestAnimationFrame(frame);

  return {
    start(params: MgMap, seed: number) {
      if (started || destroyed) return;
      game.dispose?.();
      game = spec.make(canvas, params, seed >>> 0, false);
      started = true;
      startPerf = performance.now();
      if (paused) pauseAt = startPerf;
      updateAria(true);
      try {
        canvas.focus({ preventScroll: true });
      } catch {
        /* see above */
      }
    },
    onResult(cb) {
      resultCb = cb;
      if (pending && !destroyed) {
        const r = pending;
        pending = null;
        cb(r);
      }
    },
    pause() {
      if (paused || destroyed) return;
      const now = performance.now();
      step(now);
      paused = true;
      // Before the start the play clock is not running: nothing to subtract later.
      pauseAt = started ? now : -1;
      if (started) game.release(playAt(now));
    },
    resume() {
      if (!paused || destroyed) return;
      const now = performance.now();
      if (pauseAt >= 0 && started) pausedTotal += now - pauseAt;
      pauseAt = -1;
      paused = false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(backup);
      unwatch();
      game.dispose?.();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('blur', onBlur);
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.remove();
      live?.remove();
    },
  };
}

/** A non-interactive demo: `frame(loopMs)` draws the state `loopMs` into the loop. */
export interface DemoGame {
  /** Length of one loop, ms, and the rest on its last frame. */
  loopMs: number;
  holdMs: number;
  /** Starts a new loop. */
  reset(): void;
  frame(loopMs: number, timeMs: number): void;
  resize(): void;
}

export function mountDemo(root: HTMLElement, make: (canvas: HTMLCanvasElement) => DemoGame): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  const demo = make(canvas);
  let destroyed = false;
  let raf = 0;
  let loopStart = performance.now();
  const pacer = new FramePacer();
  const frame = () => {
    if (destroyed) return;
    const now = performance.now();
    if (pacer.frame(now)) demo.resize();
    let phase = now - loopStart;
    if (phase > demo.loopMs + demo.holdMs) {
      loopStart = now;
      phase = 0;
      demo.reset();
    }
    demo.frame(Math.min(demo.loopMs, phase), now);
    raf = requestAnimationFrame(frame);
  };
  const unwatch = watchSize(root, () => {
    if (!destroyed) demo.resize();
  });
  raf = requestAnimationFrame(frame);
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      unwatch();
      canvas.remove();
    },
  };
}
