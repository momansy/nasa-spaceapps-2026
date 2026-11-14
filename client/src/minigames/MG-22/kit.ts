// Shared plumbing of the T022 minigames (MG-22 … MG-25, MG-24 included). Lives in MG-22/ because
// that folder is owned by the same task; the other folders import it as `../MG-22/kit`.
//
// What it gives a minigame (so that each one is only model + view + controller):
//   • `Gfx`: canvas sizing (DPR capped at 2), theme palette from the CSS variables, fonts,
//     number-with-unit text, rounded rectangles, patterns. Draws nothing by itself.
//   • `runMinigame`: the MinigameModule `create()` glue: fixed 120 Hz steps whatever the frame
//     rate, pointer and keyboard plumbing, haptics hook, progress, ARIA, one result, pause,
//     destroy. Input is turned into a game input by the game's `Controller`.
//   • `runDemo`: the non-interactive ~3 s loop (a whole run squeezed into the loop).
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameResult } from '../types';
import { FixedStepper, STEP_HZ } from '../MG-08/model';

export { FixedStepper, STEP_HZ };
export { mulberry32 } from '../MG-08/model';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Numeric host parameter with a default and limits. */
export function numParam(params: MgMap, key: string, fallback: number, min: number, max: number): number {
  const v = params[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return clamp(v, min, max);
}

/** `#rrggbb` + alpha → rgba(). Other colour syntaxes are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

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
  goodInk: string;
  warnInk: string;
  badInk: string;
  sun: string;
  fontUi: string;
  fontMono: string;
}

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = style.getPropertyValue(name).trim();
  return v || fallback;
}

/** Canvas helper shared by the views: size, DPR, palette, text and shape primitives. */
export class Gfx {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  W = 0;
  H = 0;
  /** Text scale from the page (1–2), so canvas text follows the accessibility setting. */
  u = 1;
  /** Right-to-left layout (`dir=rtl`): panel text and HUD cards mirror. Charts keep time left to right. */
  rtl = false;
  pal!: Palette;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.measure();
  }

  /** Re-reads the element size, the device pixel ratio and the theme. */
  measure() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(120, Math.round(rect.width));
    this.H = Math.max(100, Math.round(rect.height));
    // Capped at 2: a 3× canvas costs more than twice the fill rate for no visible gain here.
    this.dpr = Math.min(2, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const s = getComputedStyle(document.documentElement);
    const rootPx = parseFloat(s.fontSize) || 16;
    this.u = clamp(rootPx / 16, 1, 2);
    this.rtl = getComputedStyle(this.canvas).direction === 'rtl';
    this.pal = {
      bg0: cssVar(s, '--bg-0', '#071522'),
      bg1: cssVar(s, '--bg-1', '#0b1d2e'),
      bg2: cssVar(s, '--bg-2', '#112b40'),
      bg3: cssVar(s, '--bg-3', '#173a55'),
      line: cssVar(s, '--line', '#24435c'),
      lineStrong: cssVar(s, '--line-strong', '#3f6d8a'),
      text: cssVar(s, '--text', '#e8eef0'),
      dim: cssVar(s, '--text-dim', '#b6c7d3'),
      faint: cssVar(s, '--text-faint', '#8ea5b5'),
      accent: cssVar(s, '--accent', '#55c5cd'),
      accentStrong: cssVar(s, '--accent-strong', '#8fe0e6'),
      good: cssVar(s, '--good', '#77d6a1'),
      warn: cssVar(s, '--warn', '#ffd166'),
      bad: cssVar(s, '--bad', '#ff8f8f'),
      goodInk: cssVar(s, '--good-ink', '#071522'),
      warnInk: cssVar(s, '--warn-ink', '#071522'),
      badInk: cssVar(s, '--bad-ink', '#071522'),
      sun: cssVar(s, '--sunlight', '#ffce83'),
      fontUi: cssVar(s, '--font-ui', 'system-ui, sans-serif'),
      fontMono: cssVar(s, '--font-mono', 'ui-monospace, monospace'),
    };
  }

  /** Wraps a number (or a number with its unit) so that it keeps its left-to-right order inside right-to-left text. */
  ltr(text: string): string {
    return `\u2066${text}\u2069`;
  }

  /** x and text alignment of the START of a line inside `r` (left in LTR, right in RTL). */
  startX(r: Rect, pad: number): { x: number; align: CanvasTextAlign } {
    return this.rtl ? { x: r.x + r.w - pad, align: 'right' } : { x: r.x + pad, align: 'left' };
  }
  /** x and alignment of the END of a line inside `r`. */
  endX(r: Rect, pad: number): { x: number; align: CanvasTextAlign } {
    return this.rtl ? { x: r.x + pad, align: 'left' } : { x: r.x + r.w - pad, align: 'right' };
  }

  /** Starts a frame in CSS pixels and clears it. */
  begin() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
  }

  font(px: number, weight: number, mono: boolean): string {
    return `${weight} ${Math.round(px * 10) / 10}px ${mono ? this.pal.fontMono : this.pal.fontUi}`;
  }

  /** Sets the largest font up to `px` that fits `text` into `maxW`; returns the size used. */
  fit(text: string, maxW: number, px: number, weight: number, mono: boolean): number {
    const { ctx } = this;
    ctx.font = this.font(px, weight, mono);
    const w = ctx.measureText(text).width;
    if (w <= maxW || w === 0) return px;
    const size = Math.max(8, Math.floor((px * maxW) / w));
    ctx.font = this.font(size, weight, mono);
    return size;
  }

  /** A big number followed by its unit (55 % size, dimmed), shrunk together to fit `maxW`. */
  numberWithUnit(num: string, unit: string, x: number, baseY: number, maxW: number, px: number, color: string) {
    const { ctx } = this;
    const measure = (size: number) => {
      ctx.font = this.font(size, 800, true);
      const nw = ctx.measureText(num).width;
      ctx.font = this.font(size * 0.55, 700, true);
      return { nw, total: nw + size * 0.18 + ctx.measureText(unit).width };
    };
    let size = px;
    let m = measure(size);
    if (m.total > maxW && m.total > 0) {
      size = Math.max(10, Math.floor((size * maxW) / m.total));
      m = measure(size);
    }
    // `x` is the start edge of the run (the right edge in RTL, where the unit stays after the number).
    const x0 = this.rtl ? x - m.total : x;
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = this.font(size, 800, true);
    ctx.fillStyle = color;
    ctx.fillText(num, x0, baseY);
    ctx.font = this.font(size * 0.55, 700, true);
    ctx.fillStyle = this.pal.dim;
    ctx.fillText(unit, x0 + m.nw + size * 0.18, baseY);
    ctx.direction = 'inherit';
  }

  roundRect(r: Rect, radius: number) {
    const { ctx } = this;
    const rad = Math.min(radius, r.w / 2, r.h / 2);
    ctx.beginPath();
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

  /** A dark card with a border and an optional state colour (border style also differs). */
  panel(r: Rect, border: string | null = null, style: 'solid' | 'dashed' | 'double' = 'solid') {
    const { ctx, pal } = this;
    this.roundRect(r, 10);
    ctx.fillStyle = pal.bg1;
    ctx.fill();
    ctx.lineWidth = border ? 1.5 : 1;
    ctx.strokeStyle = border ?? pal.line;
    ctx.setLineDash(style === 'dashed' ? [5, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (style === 'double') {
      this.roundRect({ x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 }, 8);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** Small text with a leading label line; returns nothing. Used by the HUD cards. */
  label(text: string, x: number, y: number, px: number, color: string, maxW: number, align: CanvasTextAlign = 'left') {
    const { ctx } = this;
    ctx.textAlign = align;
    this.fit(text, maxW, px, 700, false);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /** Status glyph: ✓ (good), ▲ (warn/high), ▼ (low), ✕ (bad). Shape carries the meaning without colour. */
  glyph(kind: 'ok' | 'up' | 'down' | 'x' | 'dot', cx: number, cy: number, size: number, color: string) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (kind === 'ok') {
      ctx.lineWidth = Math.max(2, size * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.5, cy + size * 0.02);
      ctx.lineTo(cx - size * 0.12, cy + size * 0.38);
      ctx.lineTo(cx + size * 0.52, cy - size * 0.36);
      ctx.stroke();
    } else if (kind === 'x') {
      ctx.lineWidth = Math.max(2, size * 0.2);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.4, cy - size * 0.4);
      ctx.lineTo(cx + size * 0.4, cy + size * 0.4);
      ctx.moveTo(cx + size * 0.4, cy - size * 0.4);
      ctx.lineTo(cx - size * 0.4, cy + size * 0.4);
      ctx.stroke();
    } else if (kind === 'dot') {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const dir = kind === 'up' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + dir * size * 0.5);
      ctx.lineTo(cx - size * 0.55, cy - dir * size * 0.42);
      ctx.lineTo(cx + size * 0.55, cy - dir * size * 0.42);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** A repeating pattern tile drawn by `draw` (size in CSS px). */
  pattern(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): CanvasPattern | null {
    const tile = document.createElement('canvas');
    const s = Math.round(size * this.dpr);
    tile.width = s;
    tile.height = s;
    const c = tile.getContext('2d');
    if (!c) return null;
    draw(c, s);
    return this.ctx.createPattern(tile, 'repeat');
  }

  /** Diagonal hatch (bad/over) and dots (warn/under): the zones differ without colour. */
  hatch(color: string): CanvasPattern | null {
    return this.pattern(9, (c, s) => {
      c.strokeStyle = withAlpha(color, 0.5);
      c.lineWidth = Math.max(1, s * 0.16);
      c.beginPath();
      c.moveTo(-s * 0.25, s * 0.75);
      c.lineTo(s * 0.75, -s * 0.25);
      c.moveTo(s * 0.25, s * 1.25);
      c.lineTo(s * 1.25, s * 0.25);
      c.stroke();
    });
  }

  dots(color: string): CanvasPattern | null {
    return this.pattern(8, (c, s) => {
      c.fillStyle = withAlpha(color, 0.55);
      c.beginPath();
      c.arc(s * 0.5, s * 0.5, Math.max(0.8, s * 0.13), 0, Math.PI * 2);
      c.fill();
    });
  }

  /** Draws a finger (demo ghost finger) at (x, y), radius `r`. */
  finger(x: number, y: number, r: number, down: boolean) {
    const { ctx, pal } = this;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = withAlpha(pal.text, down ? 0.35 : 0.2);
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, down ? r * 0.85 : r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ───────────────────────────── the runner ─────────────────────────────

/** What every simulation offers to the runner. Steps are 1/120 s. */
export interface SimLike<I> {
  readonly done: boolean;
  readonly step: number;
  readonly totalSteps: number;
  readonly timeS: number;
  advance(input: I): void;
  result(): MinigameResult;
  /** Coarse progress 0–1 for the host's team meter. */
  progress(): number;
}

export interface Frame {
  /** Real time in ms, for animation only (never for the simulation). */
  timeMs: number;
  /** The player is touching the screen or holding a key. */
  active: boolean;
  /** Demo only: ghost finger position in canvas CSS px, null when it is lifted. */
  finger?: { x: number; y: number; down: boolean } | null;
  /** Freeze banner text when the game is paused; null otherwise. */
  pausedText?: string | null;
}

export interface ViewLike<S> {
  resize(): void;
  setSim(sim: S): void;
  draw(f: Frame): void;
  /** Canvas position of the ghost finger for the demo, from the sim state. */
  demoFinger?(sim: S): { x: number; y: number; down: boolean } | null;
}

export interface Clock {
  /** Simulation step that "now" falls into: for stamping input events with real timing. */
  stepNow(): number;
}

/** Turns raw pointer and keyboard events of one game into the game's step input. */
export interface Controller<I> {
  /** Input for step number `step` (called once per simulation step). */
  sample(step: number): I;
  down(e: PointerEvent, x: number, y: number, clock: Clock): void;
  move(e: PointerEvent, x: number, y: number): void;
  up(e: PointerEvent): void;
  /** Returns true when the key was used. */
  key(e: KeyboardEvent, down: boolean, clock: Clock): boolean;
  /** Let go of everything (pause, blur). */
  release(): void;
  /** Something is held (for the "active" glow). */
  active(): boolean;
}

export interface Runtime<S, V> {
  sim: S;
  view: V;
  env: MinigameEnv;
}

export interface AriaState {
  /** aria-valuenow and range for slider-like canvases. */
  now?: number;
  min?: number;
  max?: number;
  /** Spoken value text; also copied to the polite live region when it changes. */
  text: string;
}

export interface GameSpec<I, S extends SimLike<I>, V extends ViewLike<S>> {
  id: string;
  /** i18n key of the canvas ARIA label. */
  ariaLabelKey: string;
  role: 'slider' | 'button' | 'application';
  /** Builds the simulation of one run. */
  makeSim(params: MgMap, seed: number, env: MinigameEnv): S;
  makeView(canvas: HTMLCanvasElement, sim: S, env: MinigameEnv, compact: boolean): V;
  makeController(rt: Runtime<S, V>): Controller<I>;
  /** Haptic and sound cues after each batch of steps; called with the live simulation. */
  makeCues(env: MinigameEnv): (sim: S) => void;
  aria(sim: S, env: MinigameEnv): AriaState;
  /** Optional: called when play starts (the live sim exists); returns a detach function run on destroy. For `env.coop` subscriptions. */
  attach?(rt: Runtime<S, V>): () => void;
  /** Scripted STANDARD player of the demo: the input for the sim's next step. */
  demoInput(sim: S): I;
  demoSeed: number;
}

const DEMO_LOOP_MS = 3000;
const DEMO_HOLD_MS = 500;

function hiddenLive(root: HTMLElement): HTMLElement {
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
  root.appendChild(live);
  return live;
}

export function runMinigame<I, S extends SimLike<I>, V extends ViewLike<S>>(root: HTMLElement, env: MinigameEnv, spec: GameSpec<I, S, V>): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', spec.role);
  canvas.setAttribute('aria-label', env.t(spec.ariaLabelKey));
  const live = hiddenLive(root);

  const initial = spec.makeSim({}, 0, env);
  const view = spec.makeView(canvas, initial, env, false);
  const rt: Runtime<S, V> = { sim: initial, view, env };
  const stepper = new FixedStepper();
  const cues = spec.makeCues(env);

  let started = false;
  let paused = false;
  let destroyed = false;
  let finished = false;
  let resultCb: ((r: MinigameResult) => void) | null = null;
  let pending: MinigameResult | null = null;
  let lastFrame = performance.now();
  /** Play time in ms that the stepper has been given (excludes pauses). */
  let playMs = 0;
  let raf = 0;
  let lastProgressS = 0;
  let lastAriaS = -1;
  let lastAriaText = '';
  let lastLiveS = -9;

  const clock: Clock = {
    stepNow() {
      if (!started || paused) return rt.sim.step;
      const ms = playMs + Math.max(0, performance.now() - lastFrame);
      return Math.floor((ms * STEP_HZ) / 1000 + 1e-6);
    },
  };
  const ctl = spec.makeController(rt);
  let detach: (() => void) | null = null;

  const finish = () => {
    if (finished || destroyed) return;
    finished = true;
    const r = rt.sim.result();
    if (resultCb) resultCb(r);
    else pending = r;
  };

  const updateAria = (force = false) => {
    const a = spec.aria(rt.sim, env);
    if (a.now !== undefined) canvas.setAttribute('aria-valuenow', String(a.now));
    if (a.min !== undefined) canvas.setAttribute('aria-valuemin', String(a.min));
    if (a.max !== undefined) canvas.setAttribute('aria-valuemax', String(a.max));
    if (spec.role === 'slider') canvas.setAttribute('aria-valuetext', a.text);
    if (force || a.text !== lastAriaText) {
      lastAriaText = a.text;
      // The live region speaks a change at most every 1.5 s, so a screen reader is not flooded.
      if (rt.sim.timeS - lastLiveS >= 1.5 || force) {
        lastLiveS = rt.sim.timeS;
        live.textContent = a.text;
      }
    }
  };

  const advance = (now: number) => {
    if (!started || paused || finished) {
      lastFrame = now;
      return;
    }
    const dt = now - lastFrame;
    lastFrame = now;
    if (dt > 0) playMs += dt;
    const sim = rt.sim;
    for (let n = stepper.advance(dt); n > 0 && !sim.done; n--) sim.advance(ctl.sample(sim.step));
    cues(sim);
    const t = sim.timeS;
    if (t - lastProgressS >= 0.5) {
      lastProgressS = t;
      env.reportProgress(sim.progress());
    }
    if (t - lastAriaS >= 0.1) {
      lastAriaS = t;
      updateAria();
    }
    if (sim.done) finish();
  };

  const frame = () => {
    if (destroyed) return;
    const now = performance.now();
    advance(now);
    view.draw({ timeMs: now, active: ctl.active(), pausedText: paused ? env.t('ui.mg.paused') : null });
    raf = requestAnimationFrame(frame);
  };
  // Keeps the run on the clock when the browser stops animation frames (tab in background).
  const backup = window.setInterval(() => advance(performance.now()), 250);

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let pointerId: number | null = null;
  const onDown = (e: PointerEvent) => {
    if (finished || !started || paused) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (pointerId !== null) return; // one finger plays; others are ignored
    pointerId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: moves still arrive while over the canvas */
    }
    const p = local(e);
    ctl.down(e, p.x, p.y, clock);
  };
  const onMove = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    e.preventDefault();
    const p = local(e);
    ctl.move(e, p.x, p.y);
  };
  const onUp = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    ctl.up(e);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (finished || !started || paused || e.repeat) return;
    if (ctl.key(e, true, clock)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (ctl.key(e, false, clock)) e.preventDefault();
  };
  const onBlur = () => {
    pointerId = null;
    ctl.release();
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
    if (!destroyed) view.resize();
  });
  raf = requestAnimationFrame(frame);

  return {
    start(params: MgMap, seed: number) {
      if (started || destroyed) return;
      rt.sim = spec.makeSim(params, seed >>> 0, env);
      view.setSim(rt.sim);
      detach = spec.attach ? spec.attach(rt) : null;
      started = true;
      lastFrame = performance.now();
      updateAria(true);
      try {
        canvas.focus({ preventScroll: true });
      } catch {
        /* focus is a convenience for keyboard players only */
      }
    },
    onResult(cb) {
      resultCb = cb;
      if (pending) {
        const r = pending;
        pending = null;
        cb(r);
      }
    },
    pause() {
      paused = true;
      pointerId = null;
      ctl.release();
    },
    resume() {
      paused = false;
      lastFrame = performance.now();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(backup);
      detach?.();
      detach = null;
      unwatch();
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
      live.remove();
    },
  };
}

export function runDemo<I, S extends SimLike<I>, V extends ViewLike<S>>(root: HTMLElement, env: MinigameEnv, spec: GameSpec<I, S, V>): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // The demo always shows STANDARD play so that the picture matches the instruction line.
  const demoEnv: MinigameEnv = { ...env, mode: 'STANDARD', haptic: () => undefined, reportProgress: () => undefined };
  const newSim = () => spec.makeSim({}, spec.demoSeed, demoEnv);
  let sim = newSim();
  const view = spec.makeView(canvas, sim, demoEnv, true);
  let destroyed = false;
  let raf = 0;
  let loopStart = performance.now();

  const frame = () => {
    if (destroyed) return;
    const now = performance.now();
    let phase = now - loopStart;
    if (phase > DEMO_LOOP_MS + DEMO_HOLD_MS) {
      loopStart = now;
      phase = 0;
      sim = newSim();
      view.setSim(sim);
    }
    const wanted = Math.min(sim.totalSteps, Math.round((phase / DEMO_LOOP_MS) * sim.totalSteps));
    while (sim.step < wanted && !sim.done) sim.advance(spec.demoInput(sim));
    view.draw({ timeMs: now, active: true, finger: view.demoFinger ? view.demoFinger(sim) : null });
    raf = requestAnimationFrame(frame);
  };
  const unwatch = watchSize(root, () => {
    if (!destroyed) view.resize();
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

/** Index of the largest element ≤ `v` in a sorted array, or −1. Handy for scripted players. */
export function lowerBound(sorted: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m]! <= v) {
      ans = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return ans;
}
