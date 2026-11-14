// Orbit minigame kit (T021: MG-13 … MG-21). Shared, framework-free plumbing the nine orbit
// minigames use so each `index.ts` only maps its own input:
//   • seeded random (`mulberry32`) and the fixed-step clock (`FixedStepper`), copied from MG-08;
//   • host-parameter readers that clamp bad values;
//   • `LoopHost`: frame loop, fixed steps, pause, exactly-one result, never past `durationMs`;
//   • `DemoHost`: the ~3 s non-interactive intro loop;
//   • `Canvas2D`: DPR-capped canvas with the theme palette and accessible status drawing
//     (colour + shape + label + border style, design 14.4 and the style guide).
// Pure helpers at the top have no DOM access and are covered by the minigames' Vitest tests.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameResult } from '../types';
import { applyStageBackground, artEpoch, ceramicGradient, drawGlass, FONT_DISPLAY, onArtChange, paintBarFill, paintBarTrack, paintGlass, revealWhenFontsReady, uiFont } from '../MG-09/shared/art';

// ───────────────────────── pure helpers ─────────────────────────

/** Fixed simulation rate shared by the orbit minigames, steps per second (game value). */
export const STEP_HZ = 120;
export const DT_S = 1 / STEP_HZ;

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

/** Whole steps needed to reach `fraction` of `total` (exactly 75 % of 1800 = 1350 counts). */
export function needSteps(fraction: number, total: number): number {
  return Math.ceil(fraction * total - 1e-9);
}

/** Difficulty factor (design 10.1 rule 6, about ±25 %, game value): Cadet, Engineer, Flight Director. */
export function assistFactor(assist: string, cadet: number, director: number): number {
  return assist === 'CADET' ? cadet : assist === 'FLIGHT_DIRECTOR' ? director : 1;
}

/** Number of fixed steps in `durationMs`. */
export function stepsFor(durationMs: number): number {
  return Math.max(1, Math.round((durationMs / 1000) * STEP_HZ));
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Wraps an angle to (−180°, 180°]. */
export function wrapDeg(a: number): number {
  let x = a % 360;
  if (x <= -180) x += 360;
  else if (x > 180) x -= 360;
  return x;
}

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
  // Fonts and stage art arriving count as a resize too: every cached layer is repainted.
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
export function liveRegion(root: HTMLElement, minGapMs = 1200): { say(text: string, now: number, force?: boolean): void; remove(): void } {
  const el = document.createElement('div');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
  root.appendChild(el);
  let last = '';
  let lastAt = -1e9;
  return {
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

/** Haptic pattern capped at 300 ms in total (T021 rule), so no minigame can buzz longer. */
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
  /** Called once per animation frame (and after steps), for drawing only. */
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

  constructor(private readonly restart: () => void, private readonly frame: (phase: number, nowMs: number) => void) {
    restart();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    if (this.destroyed) return;
    const now = performance.now();
    let elapsed = now - this.loopStart;
    if (elapsed > DEMO_LOOP_MS + DEMO_HOLD_MS) {
      this.loopStart = now;
      elapsed = 0;
      this.restart();
    }
    this.frame(Math.min(1, elapsed / DEMO_LOOP_MS), now);
    this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
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
  fontMono: string;
}

/** Status of a readout: meets (✓ circle, solid), marginal (! triangle, dashed), fails (× octagon, double). */
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

/** Builds a rounded-rectangle path on any 2D context (offscreen layers included). */
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

/**
 * A canvas that fills its element: device pixel ratio capped at 2, palette from the theme's
 * CSS variables (so high-contrast mode applies), text scale from the page (1–2).
 */
export class Canvas2D {
  readonly canvas: HTMLCanvasElement;
  /** Context the helpers draw into: the visible canvas, or a layer during `paintInto`. */
  ctx: CanvasRenderingContext2D;
  /** The visible canvas's own context. */
  readonly screen: CanvasRenderingContext2D;
  pal!: Palette;
  dpr = 1;
  W = 0;
  H = 0;
  /** Text scale 1–2 from the root font size. */
  u = 1;
  rtl = false;

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
    this.rtl = (document.documentElement.dir || getComputedStyle(this.canvas).direction) === 'rtl';
    // The shared stage (key-art backdrop) is the canvas's CSS background.
    applyStageBackground(this.canvas);
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
      fontMono: cssVar(rs, '--font-mono', 'ui-monospace, monospace'),
    };
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

  /**
   * Canvas font in the theme's UI face (IBM Plex Sans, tabular figures). `mono` is kept for
   * older call sites; read-outs no longer use a monospace face (VISUAL_TARGET section 4).
   */
  font(px: number, weight: number, _mono = false): string {
    return uiFont(px, weight);
  }

  /** Display face (Oxanium) for titles and hero numbers. */
  fontDisplay(px: number): string {
    return uiFont(px, 600, FONT_DISPLAY);
  }

  /** Sets the largest font up to `px` that fits `text` into `maxW`; returns the size used. */
  fit(text: string, maxW: number, px: number, weight: number, mono = false): number {
    const ctx = this.ctx;
    // Small captions were sized for a monospace face; Plex Sans reads smaller at the same size,
    // so captions under 12 px move part of the way up (label floor of the phone type scale).
    if (px < 12) px += (12 - px) * 0.6;
    ctx.font = this.font(px, weight, mono);
    const w = ctx.measureText(text).width;
    if (w <= maxW || w === 0) return px;
    const size = Math.max(8, Math.floor((px * maxW) / w));
    ctx.font = this.font(size, weight, mono);
    return size;
  }

  /** Draws text fitted into `maxW` with the given alignment. */
  text(text: string, x: number, y: number, maxW: number, px: number, weight: number, color: string, align: CanvasTextAlign = 'left', mono = false, baseline: CanvasTextBaseline = 'middle') {
    const ctx = this.ctx;
    this.fit(text, maxW, px, weight, mono);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text, x, y);
  }

  /** A number followed by its unit (smaller, dimmed); shrinks both to fit `maxW`. Returns the width drawn. */
  numberWithUnit(num: string, unit: string, x: number, baseY: number, maxW: number, px: number, color: string, align: 'left' | 'right' | 'center' = 'left'): number {
    const ctx = this.ctx;
    // Units smaller, in Muted, after a thin space (VISUAL_TARGET 3.1).
    const measure = (size: number) => {
      ctx.font = this.font(size, 600);
      const nw = ctx.measureText(num).width;
      ctx.font = this.font(size * 0.62, 500);
      const uw = unit ? ctx.measureText(unit).width : 0;
      return { nw, total: nw + (unit ? size * 0.14 + uw : 0) };
    };
    let size = px;
    let m = measure(size);
    if (m.total > maxW && m.total > 0) {
      size = Math.max(9, Math.floor((size * maxW) / m.total));
      m = measure(size);
    }
    const x0 = align === 'left' ? x : align === 'right' ? x - m.total : x - m.total / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const savedDir = ctx.direction;
    ctx.direction = 'ltr';
    ctx.font = this.font(size, 600);
    ctx.fillStyle = color;
    ctx.fillText(num, x0, baseY);
    if (unit) {
      ctx.font = this.font(size * 0.62, 500);
      ctx.fillStyle = this.pal.dim;
      ctx.fillText(unit, x0 + m.nw + size * 0.14, baseY);
    }
    ctx.direction = savedDir;
    return m.total;
  }

  roundRect(r: Rect, radius: number) {
    pathRoundRect(this.ctx, r, radius);
  }

  /**
   * Glass panel of the UI (theme --glass, --glass-edge, --glass-hi). A custom `fill` asks for the
   * deeper glass used under dense read-outs and scenes.
   */
  panel(r: Rect, radius = 14, fill?: string) {
    drawGlass(this.ctx, r, r.h > 40 && r.w > 40 ? Math.max(radius, 14) : radius, this.pal, { deep: fill !== undefined }, this.dpr);
  }

  statusColor(s: Status): string {
    return s === 'good' ? this.pal.good : s === 'warn' ? this.pal.warn : this.pal.bad;
  }

  /**
   * Status icon: ✓ in a circle (meets), ! in a triangle (marginal), × in an octagon (fails).
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

  /** The status strip: icon + label on glass tinted by the status, with the status border. */
  statusStrip(r: Rect, s: Status, label: string) {
    const ctx = this.ctx;
    const c = this.statusColor(s);
    drawGlass(ctx, r, 12, this.pal, { deep: true, tint: c, tintAlpha: 0.15, edge: 'rgba(0,0,0,0)' }, this.dpr);
    this.statusBorder(r, s, 12, 1.5);
    const px = this.fit(label, r.w - r.h - 30, this.px(15.5, 1.5), 600);
    const tw = ctx.measureText(label).width;
    const iconS = Math.min(r.h - 12, px * 1.25);
    const total = iconS + 9 + tw;
    const sx = r.x + (r.w - total) / 2;
    const cy = r.y + r.h / 2;
    if (this.rtl) {
      this.statusIcon(s, sx + total - iconS / 2, cy, iconS);
      ctx.fillStyle = this.pal.text;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = this.font(px, 600);
      ctx.fillText(label, sx + total - iconS - 9, cy + 1);
    } else {
      this.statusIcon(s, sx + iconS / 2, cy, iconS);
      ctx.fillStyle = this.pal.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = this.font(px, 600);
      ctx.fillText(label, sx + iconS + 9, cy + 1);
    }
  }

  /** The neutral information strip: glass with a signal edge, words centred (no status). */
  infoStrip(r: Rect, label: string) {
    drawGlass(this.ctx, r, 12, this.pal, { deep: true, tint: this.pal.accent, tintAlpha: 0.08, edge: withAlpha(this.pal.accent, 0.7), edgeWidth: 1.5 }, this.dpr);
    this.text(label, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 24, this.px(15.5, 1.5), 600, this.pal.text, 'center');
  }

  /** A labelled readout tile: small caps label on top, number + unit below, optional status icon. */
  readout(r: Rect, label: string, num: string, unit: string, color: string, status?: Status) {
    this.panel(r, 14);
    const labelPx = this.px(12, 1.3);
    const pad = 11;
    const iconS = status ? Math.min(r.h * 0.42, this.px(19)) : 0;
    const lx = this.rtl ? r.x + r.w - pad : r.x + pad;
    this.text(label, lx, r.y + pad + labelPx * 0.5, r.w - pad * 2, labelPx, 600, this.pal.dim, this.rtl ? 'right' : 'left');
    const valuePx = Math.min(this.px(24), r.h - labelPx - pad * 2 - 2);
    const baseY = r.y + r.h - pad + 1;
    const maxW = r.w - pad * 2 - (status ? iconS + 6 : 0);
    if (this.rtl) this.numberWithUnit(num, unit, r.x + r.w - pad, baseY, maxW, valuePx, color, 'right');
    else this.numberWithUnit(num, unit, r.x + pad, baseY, maxW, valuePx, color, 'left');
    if (status) {
      const ix = this.rtl ? r.x + pad + iconS / 2 : r.x + r.w - pad - iconS / 2;
      this.statusIcon(status, ix, baseY - valuePx * 0.36, iconS);
    }
  }

  /** Horizontal meter with a notch at `need` (0–1). Solid fill when met, hatched when not. */
  meter(r: Rect, frac: number, need: number | null, s: Status) {
    const ctx = this.ctx;
    const c = this.statusColor(s);
    paintBarTrack(ctx, r);
    const f = clamp(frac, 0, 1);
    if (f > 0) {
      const w = Math.max(r.h, r.w * f);
      const fx = this.rtl ? r.x + r.w - w : r.x;
      paintBarFill(ctx, { x: fx, y: r.y, w, h: r.h }, c);
      if (s !== 'good') {
        // Diagonal stripes: "not there yet" without relying on colour.
        ctx.save();
        this.roundRect({ x: fx, y: r.y, w, h: r.h }, r.h / 2);
        ctx.clip();
        ctx.strokeStyle = withAlpha(this.pal.ink, 0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = fx - r.h; x < fx + w + r.h; x += 7) {
          ctx.moveTo(x, r.y + r.h);
          ctx.lineTo(x + r.h, r.y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    if (need !== null) {
      const nx = this.rtl ? r.x + r.w * (1 - need) : r.x + r.w * need;
      ctx.fillStyle = this.pal.text;
      ctx.fillRect(Math.round(nx) - 1, r.y - 3, 2, r.h + 6);
    }
  }

  /** Demo fingertip. */
  finger(x: number, y: number, pressed: boolean, compact: boolean) {
    const ctx = this.ctx;
    const R = compact ? 13 : 20;
    ctx.fillStyle = pressed ? 'rgba(255, 255, 255, 0.36)' : 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, pressed ? R * 0.9 : R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, (pressed ? R * 0.9 : R) * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Dimmed overlay with a centred word (pause). */
  overlay(text: string) {
    const { ctx, pal } = this;
    ctx.fillStyle = withAlpha(pal.bg0, 0.72);
    ctx.fillRect(0, 0, this.W, this.H);
    const px = this.fit(text, this.W - 80, this.px(22, 1.5), 600);
    const w = ctx.measureText(text).width;
    paintGlass(ctx, { x: this.W / 2 - w / 2 - 24, y: this.H / 2 - px * 1.2, w: w + 48, h: px * 2.4 }, 18, pal, { deep: true, edge: withAlpha(pal.accent, 0.7) });
    ctx.font = this.fontDisplay(px);
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.W / 2, this.H / 2 + 1);
  }

  /** Hint line at the bottom of the playfield. */
  hint(r: Rect, text: string, active: boolean) {
    this.text(text, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w, this.px(13, 1.5), 600, active ? this.pal.accentStrong : this.pal.dim, 'center');
  }
}

/** A labelled offscreen layer the size of the main canvas (static art drawn once per resize). */
/**
 * An offscreen copy of one region of the canvas, repainted only when its `key` changes (or the
 * canvas is resized). Text-heavy panels that change a few times a second (readouts, status
 * strips, tiles) are drawn once and then blitted, so the per-frame cost stays low on slow phones.
 */
export class KeyedLayer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private key: string | null = null;
  private sizeKey = '';

  constructor(private readonly c: Canvas2D) {}

  /** Forces a repaint on the next `blit`. */
  invalidate() {
    this.key = null;
  }

  /** Repaints `r` with `paint` when `key` (or the size) changed, then copies it to the screen. */
  blit(r: Rect, key: string, paint: () => void) {
    const c = this.c;
    const w = Math.max(1, Math.ceil(r.w * c.dpr));
    const h = Math.max(1, Math.ceil(r.h * c.dpr));
    // The asset epoch is part of the size key: fonts arriving repaint the layer.
    const size = `${w}x${h}@${r.x},${r.y}/${c.dpr}#${artEpoch()}`;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
    const ctx = this.ctx;
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

export function makeLayer(c: Canvas2D): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = c.canvas.width;
  canvas.height = c.canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
  return { canvas, ctx };
}


/**
 * Draws the style guide's observation satellite (frame 04-orbit-operations) seen from the side,
 * centred at (0, 0), nadir down: a compact ceramic-panelled bus wrapped top and bottom in gold
 * insulation blanket, Signal-teal corner brackets, a dark nadir lens barrel, a separate dish
 * antenna on an arm, and two balanced solar wings on silver yokes with teal hinge blocks.
 * `panels` 0–1 per wing panel (0 = stowed against the previous hinge, 1 = flat; index order
 * alternates left, right from the root outwards), `cell` 0–1 sunlight on the cells.
 * Units: `s` = bus half-width in px. Radio and imaging are never drawn as beams.
 */
export function drawSatellite(ctx: CanvasRenderingContext2D, pal: Palette, s: number, panels: ArrayLike<number>, cell: number, hingeMarks?: Array<{ status: 'idle' | 'lit' | 'done' | 'bad' | 'crew' }>) {
  const busW = s * 2;
  const busH = s * 2.1;
  const top = -busH / 2;
  const bot = busH / 2;
  const teal = pal.accent;
  const silver = '#c3ccd3';
  const silverDark = '#7f8b95';
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ── antenna: dish on an arm, off the top corner (distinct from the bus) ──
  ctx.strokeStyle = silverDark;
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(s * 0.55, top);
  ctx.lineTo(s * 0.72, top - s * 0.45);
  ctx.lineTo(s * 0.95, top - s * 0.62);
  ctx.stroke();
  ctx.strokeStyle = silver;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
  ctx.save();
  ctx.translate(s * 1.02, top - s * 0.78);
  ctx.rotate(-0.55);
  const dg = ctx.createLinearGradient(-s * 0.55, 0, s * 0.55, 0);
  dg.addColorStop(0, '#9aa5ad');
  dg.addColorStop(0.55, '#f2f5f6');
  dg.addColorStop(1, '#c9d1d6');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.55, s * 0.2, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = silverDark;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = silverDark;
  ctx.fillRect(-s * 0.04, -s * 0.2, s * 0.08, s * 0.22); // feed
  ctx.restore();

  // ── bus ──
  // Gold blanket bands (top and bottom), ceramic panels between, silver edges.
  const band = busH * 0.22;
  const gold = ctx.createLinearGradient(-busW / 2, 0, busW / 2, 0);
  gold.addColorStop(0, '#7d5a1e');
  gold.addColorStop(0.35, '#e0b45a');
  gold.addColorStop(0.6, '#c99a3e');
  gold.addColorStop(1, '#8a6626');
  ctx.fillStyle = gold;
  ctx.fillRect(-busW / 2, top, busW, busH);
  // Blanket crinkle: dark folds and bright crests (fixed pattern, no noise).
  for (const [col, off] of [
    ['rgba(70, 45, 10, 0.35)', s * 0.035],
    ['rgba(255, 236, 170, 0.45)', 0],
  ] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    for (const yy of [top + band * 0.3, top + band * 0.62, top + band * 0.88, bot - band * 0.7, bot - band * 0.4, bot - band * 0.12]) {
      ctx.moveTo(-busW / 2 + s * 0.06, yy + off);
      ctx.quadraticCurveTo(-s * 0.25, yy - s * 0.07 + off, s * 0.25, yy + s * 0.03 + off);
      ctx.quadraticCurveTo(s * 0.6, yy + s * 0.08 + off, busW / 2 - s * 0.06, yy - s * 0.02 + off);
    }
    ctx.stroke();
  }
  // Ceramic panel block in the key-art light: Sun from the left, cool fill on the right.
  ctx.fillStyle = ceramicGradient(ctx, busW, -1);
  ctx.fillRect(-busW / 2, top + band, busW, busH - band * 2);
  // Occlusion under the blanket bands.
  const ao = ctx.createLinearGradient(0, top + band, 0, top + band + s * 0.25);
  ao.addColorStop(0, 'rgba(30, 40, 50, 0.35)');
  ao.addColorStop(1, 'rgba(30, 40, 50, 0)');
  ctx.fillStyle = ao;
  ctx.fillRect(-busW / 2, top + band, busW, s * 0.25);
  // Panel seams in raking light (dark groove, light lip) and rivets.
  ctx.lineWidth = 1;
  for (const [col, off] of [
    ['rgba(50, 70, 86, 0.4)', 0],
    ['rgba(255, 255, 255, 0.45)', 1],
  ] as const) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(-busW / 2, off);
    ctx.lineTo(busW / 2, off);
    ctx.moveTo(-s * 0.15 + off, top + band);
    ctx.lineTo(-s * 0.15 + off, bot - band);
    ctx.stroke();
  }
  if (s > 10) {
    ctx.fillStyle = 'rgba(70, 90, 105, 0.6)';
    for (const [rx, ry] of [
      [-0.85, -0.38],
      [0.85, -0.38],
      [-0.85, 0.38],
      [0.85, 0.38],
      [-0.3, -0.38],
      [0.3, 0.38],
    ] as const) {
      ctx.beginPath();
      ctx.arc(rx * s, ry * busH, Math.max(0.8, s * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Silver frame and teal corner brackets.
  ctx.strokeStyle = silver;
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.strokeRect(-busW / 2, top, busW, busH);
  ctx.fillStyle = teal;
  const cb = s * 0.26;
  for (const [x, y] of [
    [-busW / 2, top],
    [busW / 2 - cb, top],
    [-busW / 2, bot - cb * 0.5],
    [busW / 2 - cb, bot - cb * 0.5],
  ] as const) {
    ctx.fillRect(x, y, cb, cb * 0.5);
  }
  // Teal top rail like the reference.
  ctx.fillRect(-busW / 2 + cb, top - s * 0.05, busW - cb * 2, s * 0.1);

  // ── nadir lens barrel ──
  ctx.fillStyle = silverDark;
  ctx.fillRect(-s * 0.62, bot, s * 1.24, s * 0.12); // mounting plate
  ctx.fillStyle = teal;
  ctx.fillRect(-s * 0.62, bot, s * 0.14, s * 0.12);
  ctx.fillRect(s * 0.48, bot, s * 0.14, s * 0.12);
  const lens = ctx.createLinearGradient(-s * 0.45, 0, s * 0.45, 0);
  lens.addColorStop(0, '#05080c');
  lens.addColorStop(0.4, '#2a333b');
  lens.addColorStop(1, '#0a0f14');
  ctx.fillStyle = lens;
  ctx.fillRect(-s * 0.45, bot + s * 0.12, s * 0.9, s * 0.45);
  ctx.strokeStyle = 'rgba(160, 175, 185, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const yy of [0.24, 0.36, 0.48]) {
    ctx.moveTo(-s * 0.45, bot + s * yy);
    ctx.lineTo(s * 0.45, bot + s * yy);
  }
  ctx.stroke();
  ctx.fillStyle = withAlpha(pal.accent, 0.55); // coated glass glint at the aperture rim
  ctx.fillRect(-s * 0.3, bot + s * 0.56, s * 0.6, s * 0.04);

  // ── wings ──
  const perWing = Math.max(1, Math.floor(panels.length / 2));
  const panelW = s * 1.55;
  const panelH = s * 1.6;
  const yoke = s * 0.5;
  const lum = clamp(cell, 0, 1);
  for (const side of [-1, 1]) {
    // Silver yoke struts (a triangle) and the root hinge block.
    const x0 = (side * busW) / 2;
    const x1 = side * (busW / 2 + yoke);
    ctx.strokeStyle = silver;
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(x0, -panelH * 0.18);
    ctx.lineTo(x1, -panelH * 0.32);
    ctx.moveTo(x0, panelH * 0.18);
    ctx.lineTo(x1, panelH * 0.32);
    ctx.moveTo(x0, 0);
    ctx.lineTo(x1, 0);
    ctx.stroke();
    ctx.fillStyle = teal;
    ctx.fillRect(x0 - (side < 0 ? s * 0.16 : 0), -s * 0.22, s * 0.16, s * 0.44);
    let x = x1;
    for (let i = 0; i < perWing; i++) {
      const k = side < 0 ? i * 2 : i * 2 + 1;
      const d = clamp(panels[k] ?? 0, 0, 1);
      const w = panelW * (0.1 + 0.9 * d); // foreshortened while folding
      const px = side < 0 ? x - w : x;
      // Cells: deep blue-black; sunlight lifts them a little and adds a warm sheen (no emission).
      const l = 0.3 + 0.7 * lum * d;
      const cg = ctx.createLinearGradient(px, -panelH / 2, px + w, panelH / 2);
      cg.addColorStop(0, `rgb(${Math.round(18 + 30 * l)}, ${Math.round(34 + 50 * l)}, ${Math.round(70 + 80 * l)})`);
      cg.addColorStop(0.45, `rgb(${Math.round(12 + 18 * l)}, ${Math.round(24 + 30 * l)}, ${Math.round(52 + 52 * l)})`);
      cg.addColorStop(0.55, `rgb(${Math.round(20 + 34 * l)}, ${Math.round(38 + 52 * l)}, ${Math.round(78 + 78 * l)})`);
      cg.addColorStop(1, `rgb(${Math.round(10 + 22 * l)}, ${Math.round(20 + 32 * l)}, ${Math.round(46 + 56 * l)})`);
      ctx.fillStyle = cg;
      ctx.fillRect(px, -panelH / 2, w, panelH);
      if (d > 0.5 && s > 8) {
        // Fine cell grid only when the panel is open (style guide: close range only).
        ctx.strokeStyle = `rgba(150, 185, 220, ${0.12 + 0.1 * l})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const cols = 5;
        const rows = 6;
        for (let gx = 1; gx < cols; gx++) {
          ctx.moveTo(px + (w * gx) / cols, -panelH / 2);
          ctx.lineTo(px + (w * gx) / cols, panelH / 2);
        }
        for (let gy = 1; gy < rows; gy++) {
          ctx.moveTo(px, -panelH / 2 + (panelH * gy) / rows);
          ctx.lineTo(px + w, -panelH / 2 + (panelH * gy) / rows);
        }
        ctx.stroke();
        if (lum > 0.6) {
          // Warm sunlight sheen along the Sun-facing edge.
          const sh = ctx.createLinearGradient(px, 0, px + w, 0);
          sh.addColorStop(side < 0 ? 0 : 1, withAlpha(pal.sun, 0.18 * lum));
          sh.addColorStop(side < 0 ? 1 : 0, withAlpha(pal.sun, 0));
          ctx.fillStyle = sh;
          ctx.fillRect(px, -panelH / 2, w, panelH);
        }
      }
      // Silver frame with teal corner caps.
      ctx.strokeStyle = silver;
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.strokeRect(px, -panelH / 2, w, panelH);
      if (s > 7) {
        ctx.fillStyle = teal;
        const cc = Math.max(1.5, s * 0.1);
        for (const [cx, cy] of [
          [px, -panelH / 2],
          [px + w, -panelH / 2],
          [px, panelH / 2],
          [px + w, panelH / 2],
        ] as const) {
          ctx.beginPath();
          ctx.arc(cx, cy, cc, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Hinge at the inner edge of this panel: two silver knuckles.
      const hx = x;
      ctx.fillStyle = silver;
      ctx.fillRect(hx - s * 0.08, -panelH * 0.34, s * 0.16, panelH * 0.18);
      ctx.fillRect(hx - s * 0.08, panelH * 0.16, s * 0.16, panelH * 0.18);
      const mark = hingeMarks?.[k];
      if (mark && mark.status !== 'idle') {
        const col = mark.status === 'done' ? pal.good : mark.status === 'bad' ? pal.warn : mark.status === 'crew' ? pal.dim : pal.accentStrong;
        ctx.strokeStyle = pal.bg0;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(hx, 0, s * 0.36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        if (mark.status === 'bad') ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      x = side < 0 ? px : px + w;
    }
  }
  ctx.restore();
}
