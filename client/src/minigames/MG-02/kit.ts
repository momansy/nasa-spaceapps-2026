// Build minigame kit (T019: MG-01 … MG-06, MG-29, MG-30). Shared, framework-free plumbing so
// each `index.ts` only maps its own input. Adapted from the orbit kit (`MG-13/kit.ts`, read
// only) with the T019 look: IBM Plex Sans with tabular numerals drawn digit by digit, glass
// cards (Console gradient, edge highlight, soft shadow), sentence-case labels and a dusk
// backdrop that echoes the Build Bay frame (navy with a low warm glow).
//   • seeded random (`mulberry32`) and the fixed-step clock (`FixedStepper`), copied from MG-08;
//   • host-parameter readers that clamp bad values;
//   • `LoopHost`: frame loop, fixed steps, pause, exactly-one result, never past `durationMs`;
//   • `DemoHost`: the ~3 s non-interactive intro loop;
//   • `Canvas2D`: DPR-capped canvas with the theme palette and accessible status drawing
//     (colour + shape + label + border style, design 14.4 and the style guide).
// The pure helpers at the top have no DOM access and are covered by the minigames' tests.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameResult } from '../types';
import { applyStageBackground, artEpoch, onArtChange, revealWhenFontsReady } from '../MG-09/shared/art';

// ───────────────────────── pure helpers ─────────────────────────

/** Fixed simulation rate, steps per second (game value, as MG-08). */
export const STEP_HZ = 120;
export const DT_S = 1 / STEP_HZ;
/** Standard play ends at this fraction of `durationMs` where Relaxed gets "a longer timer" (game value, T019 rule). */
export const STANDARD_TIME_FRACTION = 0.75;

/** Seeded generator (mulberry32, copied from MG-08). Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Real elapsed time → whole simulation steps, independent of the frame rate (copied from MG-08). */
export class FixedStepper {
  private elapsedMs = 0;
  private emitted = 0;

  advance(dtMs: number): number {
    if (dtMs > 0) this.elapsedMs += dtMs;
    const due = Math.floor((this.elapsedMs * STEP_HZ) / 1000 + 1e-6);
    const n = due - this.emitted;
    this.emitted = due;
    return n;
  }
}

/** A finite number from `params`, clamped, else the fallback. */
export function numParam(params: MgMap, key: string, fallback: number, min: number, max: number): number {
  const v = params[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/** A whole number from `params`, clamped, else the fallback. */
export function intParam(params: MgMap, key: string, fallback: number, min: number, max: number): number {
  return Math.round(numParam(params, key, fallback, min, max));
}

export function boolParam(params: MgMap, key: string, fallback = false): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}

/** Whole steps needed to reach `fraction` of `total` (exactly 80 % of 3600 = 2880 counts). */
export function needSteps(fraction: number, total: number): number {
  return Math.ceil(fraction * total - 1e-9);
}

/** Difficulty factor (design 10.1 rule 6, about ±25 %, game value): Cadet, Engineer, Flight Director. */
export function assistFactor(assist: string, cadet: number, director: number): number {
  return assist === 'CADET' ? cadet : assist === 'FLIGHT_DIRECTOR' ? director : 1;
}

/** Number of fixed steps in `seconds`. */
export function stepsForS(seconds: number): number {
  return Math.max(1, Math.round(seconds * STEP_HZ));
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Formats to `sig` significant figures with thin-space thousands (no exponent), e.g. 5,560 → "5 560". */
export function formatSig(v: number, sig = 3): string {
  if (!Number.isFinite(v)) return '0';
  if (v === 0) return '0';
  const neg = v < 0;
  const a = Math.abs(v);
  const mag = Math.floor(Math.log10(a));
  const decimals = Math.max(0, sig - 1 - mag);
  const factor = Math.pow(10, mag - sig + 1);
  const rounded = Math.round(a / factor) * factor;
  let s = rounded.toFixed(decimals);
  const [int, frac] = s.split('.');
  const grouped = int!.length > 4 ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : int!;
  s = frac ? `${grouped}.${frac}` : grouped;
  return neg ? `−${s}` : s;
}

/** Fixed decimals with a true minus sign (U+2212). */
export function fmt(v: number, decimals: number): string {
  const s = Math.abs(v).toFixed(decimals);
  return v < 0 && Number(s) !== 0 ? `−${s}` : s;
}

/** Rounded-to-integer percent of a 0–1 fraction. */
export const pct = (f: number) => Math.round(f * 100);

// ───────────────────────── DOM plumbing ─────────────────────────

export function makeCanvas(root: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.setProperty('-webkit-user-select', 'none');
  canvas.style.setProperty('-webkit-touch-callout', 'none');
  root.appendChild(canvas);
  // Theme fonts first: the canvas fades in once they are loaded (no fallback-face frame).
  revealWhenFontsReady(canvas);
  return canvas;
}

export function watchSize(el: HTMLElement, cb: () => void): () => void {
  // Fonts arriving count as a resize too: cached plates and layers are repainted.
  const offArt = onArtChange(cb);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(cb);
    ro.observe(el);
    return () => {
      ro.disconnect();
      offArt();
    };
  }
  window.addEventListener('resize', cb);
  return () => {
    window.removeEventListener('resize', cb);
    offArt();
  };
}

/**
 * Visually hidden polite live region next to the canvas, for screen-reader status lines.
 * `say` ignores repeats and speaks at most once per `minGapMs` (game value 1200 ms).
 */
let liveSeq = 0;

export function liveRegion(root: HTMLElement, minGapMs = 1200): { id: string; say(text: string, now: number, force?: boolean): void; remove(): void } {
  const el = document.createElement('div');
  el.id = `mg-live-${++liveSeq}`;
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
  root.appendChild(el);
  let last = '';
  let lastAt = -1e9;
  return {
    id: el.id,
    say(text, now, force = false) {
      if (!force && (text === last || now - lastAt < minGapMs)) return;
      last = text;
      lastAt = now;
      el.textContent = text;
    },
    remove() {
      el.remove();
    },
  };
}

/** True for the keys that act as the one button (Space, Enter). */
export function isButtonKey(e: KeyboardEvent): boolean {
  return e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar';
}

/** Haptic pattern capped at 300 ms in total (T019 rule). */
export function hapticCap(pattern: number | number[]): number | number[] {
  if (typeof pattern === 'number') return Math.min(300, Math.max(0, pattern));
  let left = 300;
  const out: number[] = [];
  for (const p of pattern) {
    if (left <= 0) break;
    const v = Math.min(left, Math.max(0, p));
    out.push(v);
    left -= v;
  }
  return out;
}

/** What a hosted run must provide. The simulation advances only through `tick()`. */
export interface HostedRun {
  readonly done: boolean;
  /** Advances one fixed step of 1/120 s. */
  tick(): void;
  result(): MinigameResult;
}

export interface LoopHooks<R extends HostedRun> {
  /** Called by `start(params, seed)`: builds the run. */
  begin(params: MgMap, seed: number): R;
  /** Called once per animation frame, for drawing only. */
  draw(nowMs: number, paused: boolean): void;
  /** Called after each batch of steps: haptics, ARIA read-back, progress. */
  afterSteps?(run: R): void;
  /** Called on pause so inputs are released. */
  onPause?(): void;
}

/**
 * Frame loop of one run: fixed steps from real time, pause, exactly one result (at the end of
 * play or `durationMs`, never after `destroy()`), and a slow timer that keeps the clock going
 * when the tab stops animation frames.
 */
export class LoopHost<R extends HostedRun> {
  run: R | null = null;
  started = false;
  paused = false;
  destroyed = false;
  finished = false;
  private resultCb: ((r: MinigameResult) => void) | null = null;
  private pending: MinigameResult | null = null;
  private stepper = new FixedStepper();
  private lastFrame = 0;
  private activeMs = 0;
  private raf = 0;
  private backup = 0;
  private readonly env: MinigameEnv;
  private readonly hooks: LoopHooks<R>;
  /** Called once when the run ends (before the result goes out). */
  onFinish: (() => void) | null = null;

  constructor(env: MinigameEnv, hooks: LoopHooks<R>) {
    this.env = env;
    this.hooks = hooks;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.backup = window.setInterval(() => this.advance(performance.now()), 250);
  }

  private frame = () => {
    if (this.destroyed) return;
    const now = performance.now();
    this.advance(now);
    this.hooks.draw(now, this.paused);
    this.raf = requestAnimationFrame(this.frame);
  };

  private advance(now: number) {
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    const run = this.run;
    if (!run || !this.started || this.paused || this.finished || this.destroyed) return;
    this.activeMs += Math.max(0, dt);
    for (let n = this.stepper.advance(dt); n > 0 && !run.done; n--) run.tick();
    this.hooks.afterSteps?.(run);
    // `durationMs` is a hard ceiling whatever the run thinks.
    if (run.done || this.activeMs >= this.env.durationMs) this.finish();
  }

  start(params: MgMap, seed: number) {
    if (this.started || this.destroyed) return;
    this.run = this.hooks.begin(params, seed >>> 0);
    this.started = true;
    this.lastFrame = performance.now();
  }

  private finish() {
    if (this.finished || this.destroyed || !this.run) return;
    this.finished = true;
    this.onFinish?.();
    const r = this.run.result();
    if (this.resultCb) this.resultCb(r);
    else this.pending = r;
  }

  onResult(cb: (r: MinigameResult) => void) {
    this.resultCb = cb;
    if (this.pending && !this.destroyed) {
      const r = this.pending;
      this.pending = null;
      cb(r);
    }
  }

  pause() {
    this.paused = true;
    this.hooks.onPause?.();
  }

  resume() {
    this.paused = false;
    this.lastFrame = performance.now();
  }

  /** True while input should act on the run. */
  get playing(): boolean {
    return this.started && !this.finished && !this.paused && !this.destroyed;
  }

  /** Haptic through the environment, capped at 300 ms. */
  haptic(pattern: number | number[]) {
    if (!this.destroyed) this.env.haptic(hapticCap(pattern));
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resultCb = null;
    this.pending = null;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.backup);
  }
}

/** Length of one demo loop and the rest on its last frame, ms (design 10.1 rule 4). */
export const DEMO_LOOP_MS = 3000;
export const DEMO_HOLD_MS = 600;

/**
 * Intro loop: calls `frame(phase, nowMs)` with phase 0–1 over `DEMO_LOOP_MS` (held at 1 for
 * `DEMO_HOLD_MS`), and `restart()` at the start of every loop.
 */
export class DemoHost {
  private raf = 0;
  private destroyed = false;
  private loopStart = performance.now();

  constructor(
    private readonly restart: () => void,
    private readonly frame: (phase: number, nowMs: number) => void,
    private readonly loopMs = DEMO_LOOP_MS,
  ) {
    restart();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    if (this.destroyed) return;
    const now = performance.now();
    let elapsed = now - this.loopStart;
    if (elapsed > this.loopMs + DEMO_HOLD_MS) {
      this.loopStart = now;
      elapsed = 0;
      this.restart();
    }
    this.frame(Math.min(1, elapsed / this.loopMs), now);
    this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
  }
}

/** Standard pointer + keyboard wiring for a canvas; returns the remover. */
export function listen(target: HTMLElement, handlers: Partial<Record<keyof HTMLElementEventMap, (e: never) => void>>): () => void {
  const entries = Object.entries(handlers) as Array<[string, EventListener]>;
  for (const [type, fn] of entries) target.addEventListener(type, fn, type.startsWith('touch') ? { passive: false } : undefined);
  return () => {
    for (const [type, fn] of entries) target.removeEventListener(type, fn);
  };
}

/** Focus without scrolling; ignored where focus is not possible. */
export function focusQuietly(el: HTMLElement) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    /* keyboard convenience only */
  }
}

// ───────────────────────── canvas drawing ─────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Palette {
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  line: string;
  lineStrong: string;
  text: string;
  dim: string;
  faint: string;
  accent: string;
  accentStrong: string;
  good: string;
  warn: string;
  bad: string;
  ink: string;
  ocean: string;
  sun: string;
  ceramic: string;
  fontUi: string;
  fontDisplay: string;
  highContrast: boolean;
}

/** Status of a readout: meets (check in a circle, solid), marginal (! in a triangle, dashed), fails (× in an octagon, double). */
export type Status = 'good' | 'warn' | 'bad';

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = style.getPropertyValue(name).trim();
  return v || fallback;
}

/** `#rrggbb` + alpha → rgba(). Other colour syntaxes are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Builds a rounded-rectangle path on any 2D context. */
export function pathRoundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number, newPath = true) {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  if (newPath) ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.lineTo(r.x + r.w - rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + rad, rad);
  ctx.lineTo(r.x + r.w, r.y + r.h - rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h, rad);
  ctx.lineTo(r.x + rad, r.y + r.h);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - rad, rad);
  ctx.lineTo(r.x, r.y + rad);
  ctx.arcTo(r.x, r.y, r.x + rad, r.y, rad);
  ctx.closePath();
}

const DIGITS = /[0-9]/;

/**
 * A canvas that fills its element: device pixel ratio capped at 2, palette from the theme's
 * CSS variables (so high-contrast mode and the UI theme apply), text scale from the page (1–2).
 */
export class Canvas2D {
  readonly canvas: HTMLCanvasElement;
  /** Context the helpers draw into: the visible canvas, or a layer during `KeyedLayer.blit`. */
  ctx: CanvasRenderingContext2D;
  readonly screen: CanvasRenderingContext2D;
  pal!: Palette;
  dpr = 1;
  W = 0;
  H = 0;
  /** Text scale 1–2 from the root font size. */
  u = 1;
  rtl = false;
  /** Advance of one digit per font string, for tabular numerals. */
  private digitW = new Map<string, number>();
  /** Cached glass plates by size. */
  private plates = new Map<string, HTMLCanvasElement>();
  private backdropKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.screen = ctx;
    this.measure();
  }

  /** Re-reads size, DPR, palette and text scale. Returns true when the size changed. */
  measure(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(120, Math.round(rect.width));
    const H = Math.max(100, Math.round(rect.height));
    const dpr = Math.min(2, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    const changed = W !== this.W || H !== this.H || dpr !== this.dpr;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    const rs = getComputedStyle(document.documentElement);
    this.u = clamp((parseFloat(rs.fontSize) || 16) / 16, 1, 2);
    const scale = parseFloat(rs.getPropertyValue('--text-scale'));
    if (Number.isFinite(scale) && scale > 0) this.u = clamp(Math.max(this.u, scale), 1, 2);
    this.rtl = (document.documentElement.dir || getComputedStyle(this.canvas).direction) === 'rtl';
    const de = document.documentElement;
    this.pal = {
      bg0: cssVar(rs, '--bg-0', '#071522'),
      bg1: cssVar(rs, '--bg-1', '#0b1d2e'),
      bg2: cssVar(rs, '--bg-2', '#112b40'),
      bg3: cssVar(rs, '--bg-3', '#173a55'),
      line: cssVar(rs, '--line', '#24435c'),
      lineStrong: cssVar(rs, '--line-strong', '#3f6d8a'),
      text: cssVar(rs, '--text', '#e8eef0'),
      dim: cssVar(rs, '--text-dim', '#b6c7d3'),
      faint: cssVar(rs, '--text-faint', '#8ea5b5'),
      accent: cssVar(rs, '--accent', '#55c5cd'),
      accentStrong: cssVar(rs, '--accent-strong', '#8fe0e6'),
      good: cssVar(rs, '--good', '#77d6a1'),
      warn: cssVar(rs, '--warn', '#ffd166'),
      bad: cssVar(rs, '--bad', '#ff8f8f'),
      ink: cssVar(rs, '--good-ink', '#071522'),
      ocean: cssVar(rs, '--ocean', '#176887'),
      sun: cssVar(rs, '--sunlight', '#ffce83'),
      ceramic: cssVar(rs, '--ceramic', '#e8eef0'),
      fontUi: cssVar(rs, '--font-ui', 'system-ui, sans-serif'),
      fontDisplay: cssVar(rs, '--font-display', cssVar(rs, '--font-ui', 'system-ui, sans-serif')),
      highContrast: de.dataset.contrast === 'high' || de.classList.contains('hc'),
    };
    this.digitW.clear();
    this.plates.clear();
    this.backdropKey = '';
    return changed;
  }

  /** Starts a frame: identity transform at CSS pixels, cleared. */
  begin() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.direction = this.rtl ? 'rtl' : 'ltr';
  }

  /** Text size scaled by the accessibility setting (capped so layouts survive 200 %). */
  px(base: number, cap = 1.45): number {
    return base * Math.min(this.u, cap);
  }

  font(px: number, weight: number, display = false): string {
    return `${weight} ${Math.round(px * 10) / 10}px ${display ? this.pal.fontDisplay : this.pal.fontUi}`;
  }

  /** Sets the largest font up to `px` that fits `text` into `maxW`; returns the size used. */
  fit(text: string, maxW: number, px: number, weight: number, display = false): number {
    const ctx = this.ctx;
    ctx.font = this.font(px, weight, display);
    const w = ctx.measureText(text).width;
    if (w <= maxW || w === 0) return px;
    const size = Math.max(8, Math.floor((px * maxW) / w));
    ctx.font = this.font(size, weight, display);
    return size;
  }

  /** Draws text fitted into `maxW` with the given alignment. */
  text(text: string, x: number, y: number, maxW: number, px: number, weight: number, color: string, align: CanvasTextAlign = 'left', baseline: CanvasTextBaseline = 'middle', display = false) {
    const ctx = this.ctx;
    this.fit(text, maxW, px, weight, display);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text, x, y);
  }

  /** Text start-aligned for the reading direction inside `r` (left in LTR, right in RTL). */
  textStart(text: string, r: Rect, y: number, px: number, weight: number, color: string) {
    this.text(text, this.rtl ? r.x + r.w : r.x, y, r.w, px, weight, color, this.rtl ? 'right' : 'left');
  }

  private digitAdvance(): number {
    const f = this.ctx.font;
    let w = this.digitW.get(f);
    if (w === undefined) {
      w = this.ctx.measureText('0').width;
      this.digitW.set(f, w);
    }
    return w;
  }

  /** Width of `s` in the current font with tabular digits. */
  tabWidth(s: string): number {
    const ctx = this.ctx;
    const dw = this.digitAdvance();
    let w = 0;
    let run = '';
    for (const ch of s) {
      if (DIGITS.test(ch)) {
        if (run) {
          w += ctx.measureText(run).width;
          run = '';
        }
        w += dw;
      } else run += ch;
    }
    if (run) w += ctx.measureText(run).width;
    return w;
  }

  /** Draws `s` left-aligned at x with every digit on the same advance (tabular numerals). */
  tabText(s: string, x: number, y: number) {
    const ctx = this.ctx;
    const dw = this.digitAdvance();
    const savedAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    let cx = x;
    let run = '';
    for (const ch of s) {
      if (DIGITS.test(ch)) {
        if (run) {
          ctx.fillText(run, cx, y);
          cx += ctx.measureText(run).width;
          run = '';
        }
        const cw = ctx.measureText(ch).width;
        ctx.fillText(ch, cx + (dw - cw) / 2, y);
        cx += dw;
      } else run += ch;
    }
    if (run) ctx.fillText(run, cx, y);
    ctx.textAlign = savedAlign;
  }

  /**
   * A number with its unit: tabular Plex Sans numerals, the unit at 70 % size in Muted after a
   * thin gap (VISUAL_TARGET 3.1). Shrinks to fit `maxW`. Returns the width drawn.
   */
  numberWithUnit(num: string, unit: string, x: number, baseY: number, maxW: number, px: number, color: string, align: 'left' | 'right' | 'center' = 'left', weight = 650, unitColor?: string): number {
    const ctx = this.ctx;
    const measure = (size: number) => {
      ctx.font = this.font(size, weight);
      const nw = this.tabWidth(num);
      ctx.font = this.font(size * 0.7, 500);
      const uw = unit ? ctx.measureText(unit).width : 0;
      return { nw, total: nw + (unit ? size * 0.16 + uw : 0) };
    };
    let size = px;
    let m = measure(size);
    if (m.total > maxW && m.total > 0) {
      size = Math.max(9, Math.floor((size * maxW) / m.total));
      m = measure(size);
    }
    const x0 = align === 'left' ? x : align === 'right' ? x - m.total : x - m.total / 2;
    ctx.textBaseline = 'alphabetic';
    const savedDir = ctx.direction;
    ctx.direction = 'ltr';
    ctx.font = this.font(size, weight);
    ctx.fillStyle = color;
    this.tabText(num, x0, baseY);
    if (unit) {
      ctx.font = this.font(size * 0.7, 500);
      ctx.fillStyle = unitColor ?? this.pal.dim;
      ctx.textAlign = 'left';
      ctx.fillText(unit, x0 + m.nw + size * 0.16, baseY);
    }
    ctx.direction = savedDir;
    return m.total;
  }

  roundRect(r: Rect, radius: number) {
    pathRoundRect(this.ctx, r, radius);
  }

  /**
   * Glass card (VISUAL_TARGET elevation e1/e2 on the phone): soft shadow, Console gradient,
   * 1 px Ceramic edge and a top highlight. High contrast: opaque Console with a strong edge.
   */
  glass(r: Rect, radius = 16, strong = false) {
    // Each plate (soft shadow, gradient, edge, highlight) is painted once per size and reused,
    // so panels that repaint often stay cheap on slow phones.
    const pad = 28;
    const w = Math.max(1, Math.round(r.w));
    const h = Math.max(1, Math.round(r.h));
    const key = `${w}x${h}|${radius}|${strong}|${this.pal.highContrast}|${this.dpr}`;
    let plate = this.plates.get(key);
    if (!plate) {
      if (this.plates.size > 80) this.plates.clear();
      plate = document.createElement('canvas');
      plate.width = Math.ceil((w + pad * 2) * this.dpr);
      plate.height = Math.ceil((h + pad * 2) * this.dpr);
      const g = plate.getContext('2d');
      if (g) {
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.paintGlass(g, { x: pad, y: pad, w, h }, radius, strong);
      }
      this.plates.set(key, plate);
    }
    this.ctx.drawImage(plate, r.x - pad, r.y - pad, w + pad * 2, h + pad * 2);
  }

  private paintGlass(ctx: CanvasRenderingContext2D, r: Rect, radius: number, strong: boolean) {
    const pal = this.pal;
    ctx.save();
    if (!pal.highContrast) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
    }
    pathRoundRect(ctx, r, radius);
    if (pal.highContrast) ctx.fillStyle = pal.bg2;
    else {
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, strong ? 'rgba(28, 64, 92, 0.92)' : 'rgba(24, 56, 82, 0.8)');
      g.addColorStop(1, strong ? 'rgba(12, 32, 50, 0.94)' : 'rgba(11, 30, 47, 0.88)');
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.highContrast ? pal.text : 'rgba(150, 205, 228, 0.18)';
    pathRoundRect(ctx, { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 }, radius);
    ctx.stroke();
    if (!pal.highContrast) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(r.x + radius, r.y + 1.5);
      ctx.lineTo(r.x + r.w - radius, r.y + 1.5);
      ctx.stroke();
    }
  }

  /**
   * The dusk backdrop of the build minigames: Space navy, a cool upper fill and a low warm
   * glow (the Build Bay frame's sun) with a soft vignette. Cached per size.
   */
  backdrop(warmth = 1) {
    // The Build Bay key art at dusk, given to the canvas as its CSS background (no per-frame
    // full-screen blit, which was the largest cost on slow phones). Set once per size / mode.
    const key = `${this.W}x${this.H}@${this.dpr}/${warmth}/${this.pal.highContrast}`;
    if (key !== this.backdropKey) {
      applyStageBackground(this.canvas, 'bay', warmth);
      this.backdropKey = key;
    }
  }

  statusColor(s: Status): string {
    return s === 'good' ? this.pal.good : s === 'warn' ? this.pal.warn : this.pal.bad;
  }

  /**
   * Status icon: check in a circle (meets), ! in a triangle (marginal), × in an octagon (fails).
   * The shape carries the meaning without colour.
   */
  statusIcon(s: Status, cx: number, cy: number, size: number) {
    const ctx = this.ctx;
    const c = this.statusColor(s);
    const r = size / 2;
    ctx.save();
    ctx.fillStyle = c;
    ctx.beginPath();
    if (s === 'good') ctx.arc(cx, cy, r, 0, Math.PI * 2);
    else if (s === 'warn') {
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 1.05, cy + r * 0.85);
      ctx.lineTo(cx - r * 1.05, cy + r * 0.85);
      ctx.closePath();
    } else {
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.strokeStyle = this.pal.ink;
    ctx.fillStyle = this.pal.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.6, size * 0.13);
    ctx.beginPath();
    if (s === 'good') {
      ctx.moveTo(cx - r * 0.45, cy + r * 0.02);
      ctx.lineTo(cx - r * 0.1, cy + r * 0.36);
      ctx.lineTo(cx + r * 0.48, cy - r * 0.32);
      ctx.stroke();
    } else if (s === 'warn') {
      ctx.moveTo(cx, cy - r * 0.32);
      ctx.lineTo(cx, cy + r * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.56, Math.max(1, size * 0.07), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(cx - r * 0.33, cy - r * 0.33);
      ctx.lineTo(cx + r * 0.33, cy + r * 0.33);
      ctx.moveTo(cx + r * 0.33, cy - r * 0.33);
      ctx.lineTo(cx - r * 0.33, cy + r * 0.33);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Border in the status style: solid (meets), dashed (marginal), double (fails). */
  statusBorder(r: Rect, s: Status, radius: number, width = 2) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.statusColor(s);
    ctx.lineWidth = width;
    if (s === 'warn') ctx.setLineDash([7, 5]);
    this.roundRect(r, radius);
    ctx.stroke();
    if (s === 'bad') {
      const inset = width + 2;
      this.roundRect({ x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: r.h - inset * 2 }, Math.max(2, radius - inset));
      ctx.lineWidth = Math.max(1, width * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The status strip: icon + sentence-case label in a tinted box with the status border. */
  statusStrip(r: Rect, s: Status, label: string) {
    const ctx = this.ctx;
    const c = this.statusColor(s);
    this.roundRect(r, 12);
    ctx.fillStyle = this.pal.bg1;
    ctx.fill();
    this.roundRect(r, 12);
    ctx.fillStyle = withAlpha(c, 0.13);
    ctx.fill();
    this.statusBorder(r, s, 12, 2);
    const px = this.fit(label, r.w - r.h - 34, this.px(15, 1.5), 600);
    const tw = ctx.measureText(label).width;
    const iconS = Math.min(r.h - 14, px * 1.3);
    const total = iconS + 10 + tw;
    const sx = r.x + (r.w - total) / 2;
    const cy = r.y + r.h / 2;
    ctx.fillStyle = this.pal.text;
    ctx.textBaseline = 'middle';
    ctx.font = this.font(px, 600);
    if (this.rtl) {
      this.statusIcon(s, sx + total - iconS / 2, cy, iconS);
      ctx.fillStyle = this.pal.text;
      ctx.textAlign = 'right';
      ctx.fillText(label, sx + total - iconS - 10, cy + 1);
    } else {
      this.statusIcon(s, sx + iconS / 2, cy, iconS);
      ctx.fillStyle = this.pal.text;
      ctx.textAlign = 'left';
      ctx.fillText(label, sx + iconS + 10, cy + 1);
    }
  }

  /** A labelled readout card: 14 px semibold Muted label, number + unit below, optional status icon. */
  readout(r: Rect, label: string, num: string, unit: string, color: string, status?: Status) {
    this.glass(r, 14);
    const labelPx = this.px(12.5, 1.3);
    const pad = 11;
    const iconS = status ? Math.min(r.h * 0.36, this.px(20)) : 0;
    this.textStart(label, { x: r.x + pad, y: r.y, w: r.w - pad * 2, h: r.h }, r.y + pad + labelPx * 0.6, labelPx, 600, this.pal.dim);
    const valuePx = Math.min(this.px(25), r.h - labelPx - pad * 2 - 2);
    const baseY = r.y + r.h - pad;
    const maxW = r.w - pad * 2 - (status ? iconS + 6 : 0);
    if (this.rtl) this.numberWithUnit(num, unit, r.x + r.w - pad, baseY, maxW, valuePx, color, 'right');
    else this.numberWithUnit(num, unit, r.x + pad, baseY, maxW, valuePx, color, 'left');
    if (status) {
      const ix = this.rtl ? r.x + pad + iconS / 2 : r.x + r.w - pad - iconS / 2;
      this.statusIcon(status, ix, baseY - valuePx * 0.36, iconS);
    }
  }

  /**
   * Horizontal bar (VISUAL_TARGET data-vis): 12 px track at Ceramic 10 %, fill by status —
   * solid (meets), 45° hatch (marginal), cross-hatch (fails) — and a requirement marker.
   */
  bar(r: Rect, frac: number, need: number | null, s: Status) {
    const ctx = this.ctx;
    const c = this.statusColor(s);
    this.roundRect(r, r.h / 2);
    ctx.fillStyle = 'rgba(232, 238, 240, 0.1)';
    ctx.fill();
    const f = clamp(frac, 0, 1);
    if (f > 0) {
      const w = Math.max(r.h, r.w * f);
      const fx = this.rtl ? r.x + r.w - w : r.x;
      const fr = { x: fx, y: r.y, w, h: r.h };
      this.roundRect(fr, r.h / 2);
      ctx.fillStyle = c;
      ctx.fill();
      if (s !== 'good') {
        ctx.save();
        this.roundRect(fr, r.h / 2);
        ctx.clip();
        ctx.strokeStyle = withAlpha(this.pal.ink, 0.42);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = fx - r.h; x < fx + w + r.h; x += 6) {
          ctx.moveTo(x, r.y + r.h);
          ctx.lineTo(x + r.h, r.y);
          if (s === 'bad') {
            ctx.moveTo(x, r.y);
            ctx.lineTo(x + r.h, r.y + r.h);
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    if (need !== null) {
      const nx = Math.round(this.rtl ? r.x + r.w * (1 - need) : r.x + r.w * need);
      ctx.fillStyle = this.pal.text;
      ctx.fillRect(nx - 1, r.y - 4, 2, r.h + 8);
      ctx.beginPath();
      ctx.moveTo(nx - 4, r.y - 8);
      ctx.lineTo(nx + 4, r.y - 8);
      ctx.lineTo(nx, r.y - 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Canvas push button (48 px or taller): glass, Signal edge when focused or held. */
  button(r: Rect, label: string, opts: { primary?: boolean; active?: boolean; disabled?: boolean; icon?: (cx: number, cy: number, s: number) => void } = {}) {
    const { ctx, pal } = this;
    ctx.save();
    if (opts.disabled) ctx.globalAlpha = 0.45;
    if (opts.primary) {
      this.roundRect(r, 12);
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, opts.active ? pal.accentStrong : withAlpha(pal.accent, 0.95));
      g.addColorStop(1, opts.active ? pal.accent : withAlpha(pal.accent, 0.78));
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      this.glass(r, 12, true);
      if (opts.active) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = pal.accent;
        this.roundRect({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 11);
        ctx.stroke();
      }
    }
    const color = opts.primary ? pal.ink : pal.text;
    const iconS = opts.icon ? Math.min(r.h * 0.42, 22) : 0;
    const px = this.fit(label, r.w - 24 - (iconS ? iconS + 8 : 0), this.px(15, 1.4), 600);
    const tw = ctx.measureText(label).width;
    const total = tw + (iconS ? iconS + 8 : 0);
    let x = r.x + (r.w - total) / 2;
    const cy = r.y + r.h / 2;
    if (opts.icon) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      const ix = this.rtl ? x + total - iconS / 2 : x + iconS / 2;
      opts.icon(ix, cy, iconS);
      if (!this.rtl) x += iconS + 8;
    }
    ctx.font = this.font(px, 600);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, cy + 1);
    ctx.restore();
  }

  /** Demo fingertip (ghost finger). */
  finger(x: number, y: number, pressed: boolean, compact: boolean) {
    const ctx = this.ctx;
    const R = compact ? 14 : 20;
    const r = pressed ? R * 0.88 : R;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = pressed ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Dimmed overlay with a centred word (pause). */
  overlay(text: string) {
    const { ctx, pal } = this;
    ctx.fillStyle = withAlpha(pal.bg0, 0.74);
    ctx.fillRect(0, 0, this.W, this.H);
    const px = this.fit(text, this.W - 80, this.px(22, 1.5), 600, true);
    const w = ctx.measureText(text).width;
    const r = { x: this.W / 2 - w / 2 - 24, y: this.H / 2 - px * 1.15, w: w + 48, h: px * 2.3 };
    this.glass(r, 16, true);
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.accent;
    this.roundRect(r, 16);
    ctx.stroke();
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = this.font(px, 600, true);
    ctx.fillText(text, this.W / 2, this.H / 2 + 1);
  }

  /** Hint line at the bottom of the playfield. */
  hint(r: Rect, text: string, active: boolean) {
    this.text(text, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 8, this.px(14, 1.4), 500, active ? this.pal.accentStrong : this.pal.dim, 'center');
  }
}

/**
 * An offscreen copy of one region of the canvas, repainted only when its `key` changes (or the
 * canvas is resized). Text-heavy panels that change a few times a second are drawn once and
 * then blitted, so the per-frame cost stays low on slow phones.
 */
export class KeyedLayer {
  private canvas: HTMLCanvasElement | null = null;
  private lctx: CanvasRenderingContext2D | null = null;
  private key: string | null = null;
  private sizeKey = '';

  constructor(private readonly c: Canvas2D) {}

  invalidate() {
    this.key = null;
  }

  blit(r: Rect, key: string, paint: () => void) {
    const c = this.c;
    const w = Math.max(1, Math.ceil(r.w * c.dpr));
    const h = Math.max(1, Math.ceil(r.h * c.dpr));
    // The asset epoch is part of the size key: fonts arriving repaint the layer.
    const size = `${w}x${h}@${r.x},${r.y}/${c.dpr}#${artEpoch()}`;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.lctx = this.canvas.getContext('2d');
    }
    const ctx = this.lctx;
    if (!ctx) {
      paint();
      return;
    }
    if (size !== this.sizeKey || key !== this.key) {
      if (size !== this.sizeKey) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.sizeKey = size;
      }
      this.key = key;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(c.dpr, 0, 0, c.dpr, -r.x * c.dpr, -r.y * c.dpr);
      ctx.direction = c.rtl ? 'rtl' : 'ltr';
      const saved = c.ctx;
      c.ctx = ctx;
      try {
        paint();
      } finally {
        c.ctx = saved;
      }
    }
    c.ctx.drawImage(this.canvas, 0, 0, w, h, r.x, r.y, r.w, r.h);
  }
}

/** An offscreen layer the size of the main canvas, already scaled to CSS pixels. */
export function makeLayer(c: Canvas2D): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = c.canvas.width;
  canvas.height = c.canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
  return { canvas, ctx };
}

/** Satin ceramic cylinder shading (style guide: one broad soft highlight, cool shadow side). */
export function ceramicGradient(ctx: CanvasRenderingContext2D, x0: number, x1: number, pal: Palette): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#9fb0bc');
  g.addColorStop(0.18, '#dfe7eb');
  g.addColorStop(0.42, pal.ceramic);
  g.addColorStop(0.55, '#f6f9fa');
  g.addColorStop(0.85, '#b9c6cf');
  g.addColorStop(1, '#7f909c');
  return g;
}

/** Brushed silver shading for rings, pivots and rails. */
export function silverGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#6f7c86');
  g.addColorStop(0.3, '#d9e0e4');
  g.addColorStop(0.5, '#a9b5bd');
  g.addColorStop(0.72, '#e8edf0');
  g.addColorStop(1, '#788691');
  return g;
}
