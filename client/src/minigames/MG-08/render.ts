// MG-08 canvas renderer. Draws the dynamic-pressure chart, the safe band, the stress line,
// the readouts and the throttle lever. It only reads the simulation; all rules live in
// `model.ts`. Colours come from the theme's CSS variables so high-contrast mode applies, and
// every state is shown by a word, an icon shape and a pattern as well as by colour.
import { fmt } from '../../data/format';
import { paintGlass, paintStage, uiFont } from '../MG-09/shared/art';
import type { Mg08Config, Mg08Sim, Zone } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface ViewOptions {
  /** Demo slot: chart and lever only, no readouts. */
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface FrameExtras {
  /** Real time in ms, for animation only (never for the simulation). */
  timeMs: number;
  /** The player is touching the screen (dragging, or holding the one button). */
  active: boolean;
  /** Demo: draw a fingertip on the lever. */
  finger?: boolean;
  /** Freeze banner text when the game is paused; null otherwise. */
  pausedText?: string | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Palette {
  bg0: string;
  bg1: string;
  bg2: string;
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
  fontUi: string;
  fontMono: string;
}

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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Mg08View {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: ViewOptions;
  private config: Mg08Config;
  private sim: Mg08Sim;
  private pal!: Palette;
  private dpr = 1;
  private W = 0;
  private H = 0;
  /** Text scale from the page (1–2), so canvas text follows the accessibility setting. */
  private u = 1;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private chart: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private ribbon: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private slider: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hint: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private trackTop = 0;
  private trackBottom = 0;
  private thumbH = 52;
  private yMin = 10;
  private yMax = 55;
  private layer: HTMLCanvasElement | null = null;
  private hatch: CanvasPattern | null = null;
  private dots: CanvasPattern | null = null;

  constructor(canvas: HTMLCanvasElement, sim: Mg08Sim, opts: ViewOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.sim = sim;
    this.config = sim.config;
    this.opts = opts;
    this.resize();
  }

  /** Swaps in a new run (the demo loop restarts with a fresh simulation). */
  setSim(sim: Mg08Sim) {
    this.sim = sim;
    this.config = sim.config;
    this.computeScale();
    this.paintStatic();
  }

  /** Length of the lever travel in CSS pixels: a drag of this length is the full range. */
  get trackLengthPx(): number {
    return Math.max(40, this.trackBottom - this.trackTop);
  }

  /** Re-reads the element size, the device pixel ratio and the theme, then rebuilds the layout. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(120, Math.round(rect.width));
    const H = Math.max(100, Math.round(rect.height));
    // Capped at 2: a 3× canvas costs more than twice the fill rate for no visible gain here.
    this.dpr = Math.min(2, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);

    const rootStyle = getComputedStyle(document.documentElement);
    const rootPx = parseFloat(rootStyle.fontSize) || 16;
    this.u = clamp(rootPx / 16, 1, 2);
    this.pal = {
      bg0: cssVar(rootStyle, '--bg-0', '#05080f'),
      bg1: cssVar(rootStyle, '--bg-1', '#0a1020'),
      bg2: cssVar(rootStyle, '--bg-2', '#101a30'),
      line: cssVar(rootStyle, '--line', '#22314f'),
      lineStrong: cssVar(rootStyle, '--line-strong', '#3a4f7a'),
      text: cssVar(rootStyle, '--text', '#e8eef0'),
      dim: cssVar(rootStyle, '--text-dim', '#b6c7d3'),
      faint: cssVar(rootStyle, '--text-faint', '#8ea5b5'),
      accent: cssVar(rootStyle, '--accent', '#55c5cd'),
      accentStrong: cssVar(rootStyle, '--accent-strong', '#8fe0e6'),
      good: cssVar(rootStyle, '--good', '#77d6a1'),
      warn: cssVar(rootStyle, '--warn', '#ffd166'),
      bad: cssVar(rootStyle, '--bad', '#ff8f8f'),
      goodInk: cssVar(rootStyle, '--good-ink', '#02261d'),
      warnInk: cssVar(rootStyle, '--warn-ink', '#2e2000'),
      badInk: cssVar(rootStyle, '--bad-ink', '#2d0b02'),
      fontUi: cssVar(rootStyle, '--font-ui', 'system-ui, sans-serif'),
      fontMono: cssVar(rootStyle, '--font-mono', 'ui-monospace, monospace'),
    };

    const compact = this.opts.compact;
    const u = this.u;
    const pad = compact ? 8 : 12;
    const hudH = compact ? 0 : Math.round(60 * Math.min(u, 1.45));
    const stripH = compact ? 0 : Math.round(36 * Math.min(u, 1.5));
    const hintH = compact ? 0 : Math.round(26 * Math.min(u, 1.5));
    const axisH = compact ? 0 : Math.round(18 * Math.min(u, 1.4));
    const ribbonH = compact ? 4 : 7;
    const sliderW = compact ? 40 : clamp(Math.round(66 + 12 * (u - 1)), 66, 82);
    const gap = compact ? 6 : 10;

    this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
    this.strip = { x: pad, y: pad + hudH + (hudH ? 8 : 0), w: W - pad * 2, h: stripH };
    const top = this.strip.y + stripH + (stripH ? 10 : 0);
    const bottom = H - pad - hintH;
    this.chart = { x: pad, y: top, w: W - pad * 2 - sliderW - gap, h: Math.max(60, bottom - top - axisH - ribbonH - 3) };
    this.ribbon = { x: this.chart.x, y: this.chart.y + this.chart.h + 3, w: this.chart.w, h: ribbonH };
    this.slider = { x: this.chart.x + this.chart.w + gap, y: top, w: sliderW, h: Math.max(60, bottom - top) };
    this.hint = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };

    this.thumbH = compact ? 20 : clamp(Math.round(52 * Math.min(u, 1.25)), 48, 66);
    const labelH = compact ? 4 : Math.round(20 * Math.min(u, 1.4));
    this.trackTop = this.slider.y + labelH + this.thumbH / 2 + 2;
    this.trackBottom = this.slider.y + this.slider.h - labelH - this.thumbH / 2 - 2;

    this.buildPatterns();
    this.computeScale();
    this.paintStatic();
  }

  // ───────────── scales ─────────────

  private computeScale() {
    const c = this.config;
    // The axis does not start at zero: the band is what matters and gets the room.
    this.yMin = Math.max(0, Math.floor((c.bandLoKpa * 0.6) / 5) * 5);
    this.yMax = this.sim.curve.peakKpa * 1.13;
  }

  private xOf(tS: number): number {
    return this.chart.x + (tS / this.sim.curve.durationS) * this.chart.w;
  }

  private yOf(kpa: number): number {
    const f = (kpa - this.yMin) / (this.yMax - this.yMin);
    return this.chart.y + this.chart.h * (1 - clamp(f, 0, 1));
  }

  private thumbY(throttle: number): number {
    const f = (throttle - this.config.throttleMin) / (1 - this.config.throttleMin);
    return this.trackBottom - clamp(f, 0, 1) * (this.trackBottom - this.trackTop);
  }

  // ───────────── drawing helpers ─────────────

  /** The colours the shared art kit needs (sun and ocean are not in this view's palette). */
  private artPal() {
    return { ...this.pal, sun: '#ffce83', ocean: '#176887' };
  }

  /** Theme UI face (IBM Plex Sans, tabular figures); `mono` is kept for older call sites. */
  private font(px: number, weight: number, _mono: boolean): string {
    return uiFont(px < 12 ? px + (12 - px) * 0.6 : px, weight);
  }

  /** Sets the largest font up to `px` that fits `text` into `maxW`; returns the size used. */
  private fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, px: number, weight: number, mono: boolean): number {
    ctx.font = this.font(px, weight, mono);
    const w = ctx.measureText(text).width;
    if (w <= maxW || w === 0) return px;
    const size = Math.max(8, Math.floor((px * maxW) / w));
    ctx.font = this.font(size, weight, mono);
    return size;
  }

  /**
   * Draws a big number followed by its unit (unit at 55 % of the size, dimmed), shrinking both
   * together when they do not fit `maxW`.
   */
  private numberWithUnit(ctx: CanvasRenderingContext2D, num: string, unit: string, x: number, baseY: number, maxW: number, px: number, color: string) {
    const measure = (size: number) => {
      ctx.font = this.font(size, 600, false);
      const nw = ctx.measureText(num).width;
      ctx.font = this.font(size * 0.62, 500, false);
      return { nw, total: nw + size * 0.18 + ctx.measureText(unit).width };
    };
    let size = px;
    let m = measure(size);
    if (m.total > maxW && m.total > 0) {
      size = Math.max(10, Math.floor((size * maxW) / m.total));
      m = measure(size);
    }
    ctx.font = this.font(size, 600, false);
    ctx.fillStyle = color;
    ctx.fillText(num, x, baseY);
    ctx.font = this.font(size * 0.62, 500, false);
    ctx.fillStyle = this.pal.dim;
    ctx.fillText(unit, x + m.nw + size * 0.18, baseY);
  }

  private roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
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

  /** Status glyph: ✓ in band, ▲ overload, ▼ too slow. Shape carries the meaning without colour. */
  private glyph(ctx: CanvasRenderingContext2D, zone: Zone, cx: number, cy: number, size: number, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (zone === 0) {
      ctx.lineWidth = Math.max(2, size * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.5, cy + size * 0.02);
      ctx.lineTo(cx - size * 0.12, cy + size * 0.38);
      ctx.lineTo(cx + size * 0.52, cy - size * 0.36);
      ctx.stroke();
    } else {
      const dir = zone === 1 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + dir * size * 0.5);
      ctx.lineTo(cx - size * 0.55, cy - dir * size * 0.42);
      ctx.lineTo(cx + size * 0.55, cy - dir * size * 0.42);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private buildPatterns() {
    const make = (draw: (c: CanvasRenderingContext2D, s: number) => void, size: number): CanvasPattern | null => {
      const tile = document.createElement('canvas');
      const s = Math.round(size * this.dpr);
      tile.width = s;
      tile.height = s;
      const c = tile.getContext('2d');
      if (!c) return null;
      draw(c, s);
      return this.ctx.createPattern(tile, 'repeat');
    };
    // Overload = diagonal hatch, too slow = dots: the zones differ without colour.
    this.hatch = make((c, s) => {
      c.strokeStyle = withAlpha(this.pal.bad, 0.5);
      c.lineWidth = Math.max(1, s * 0.16);
      c.beginPath();
      c.moveTo(-s * 0.25, s * 0.75);
      c.lineTo(s * 0.75, -s * 0.25);
      c.moveTo(s * 0.25, s * 1.25);
      c.lineTo(s * 1.25, s * 0.25);
      c.stroke();
    }, 9);
    this.dots = make((c, s) => {
      c.fillStyle = withAlpha(this.pal.warn, 0.55);
      c.beginPath();
      c.arc(s * 0.5, s * 0.5, Math.max(0.8, s * 0.13), 0, Math.PI * 2);
      c.fill();
    }, 8);
  }

  private zoneColor(zone: Zone): string {
    return zone === 0 ? this.pal.good : zone === 1 ? this.pal.bad : this.pal.warn;
  }

  // ───────────── static layer (rebuilt on resize only) ─────────────

  private paintStatic() {
    const layer = this.layer ?? document.createElement('canvas');
    this.layer = layer;
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const { pal, chart, config, opts } = this;
    const t = opts.t;
    const u = this.u;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    // The shared stage (key-art backdrop) behind everything.
    paintStage(ctx, this.W, this.H, this.artPal());

    const yHi = this.yOf(config.bandHiKpa);
    const yLo = this.yOf(config.bandLoKpa);

    // Chart panel.
    ctx.save();
    this.roundRect(ctx, chart, 12);
    ctx.fillStyle = 'rgba(4, 13, 23, 0.82)';
    ctx.fill();
    ctx.clip();

    // Overload zone (hatched) above the band.
    ctx.fillStyle = withAlpha(pal.bad, 0.1);
    ctx.fillRect(chart.x, chart.y, chart.w, yHi - chart.y);
    if (this.hatch) {
      ctx.fillStyle = this.hatch;
      ctx.fillRect(chart.x, chart.y, chart.w, yHi - chart.y);
    }
    // Too-slow zone (dotted) below the band.
    ctx.fillStyle = withAlpha(pal.warn, 0.07);
    ctx.fillRect(chart.x, yLo, chart.w, chart.y + chart.h - yLo);
    if (this.dots) {
      ctx.fillStyle = this.dots;
      ctx.fillRect(chart.x, yLo, chart.w, chart.y + chart.h - yLo);
    }
    // Safe band.
    const band = ctx.createLinearGradient(0, yHi, 0, yLo);
    band.addColorStop(0, withAlpha(pal.good, 0.26));
    band.addColorStop(0.5, withAlpha(pal.good, 0.14));
    band.addColorStop(1, withAlpha(pal.good, 0.26));
    ctx.fillStyle = band;
    ctx.fillRect(chart.x, yHi, chart.w, yLo - yHi);

    // Grid: pressure every 10 kPa, time every 5 s.
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.45);
    ctx.beginPath();
    for (let k = Math.ceil(this.yMin / 10) * 10; k <= this.yMax; k += 10) {
      const y = Math.round(this.yOf(k)) + 0.5;
      ctx.moveTo(chart.x, y);
      ctx.lineTo(chart.x + chart.w, y);
    }
    const dur = this.sim.curve.durationS;
    for (let s = 5; s < dur - 0.5; s += 5) {
      const x = Math.round(this.xOf(s)) + 0.5;
      ctx.moveTo(x, chart.y);
      ctx.lineTo(x, chart.y + chart.h);
    }
    ctx.stroke();

    // Band edges.
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.good;
    ctx.beginPath();
    ctx.moveTo(chart.x, yHi);
    ctx.lineTo(chart.x + chart.w, yHi);
    ctx.moveTo(chart.x, yLo);
    ctx.lineTo(chart.x + chart.w, yLo);
    ctx.stroke();

    // Dynamic pressure at full throttle (the rising curve of the design), dashed.
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = withAlpha(pal.dim, 0.9);
    ctx.beginPath();
    const n = Math.max(24, Math.round(chart.w / 3));
    for (let i = 0; i <= n; i++) {
      const tt = (i / n) * dur;
      const x = this.xOf(tt);
      const y = this.yOf(this.sim.curve.qBaseKpa(tt));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (!opts.compact) {
      const small = 11 * Math.min(u, 1.5);
      ctx.textBaseline = 'middle';

      // Zone names with their glyphs.
      ctx.textAlign = 'left';
      const zoneFont = 12 * Math.min(u, 1.5);
      const overText = t('minigame.MG-08.zone.over');
      const underText = t('minigame.MG-08.zone.under');
      const maxZoneW = chart.w * 0.6;
      this.fit(ctx, overText, maxZoneW, zoneFont, 800, true);
      const overY = chart.y + Math.min((yHi - chart.y) / 2, zoneFont * 1.4);
      this.glyph(ctx, 1, chart.x + 14, overY, zoneFont * 0.9, pal.bad);
      ctx.fillStyle = pal.bad;
      ctx.fillText(overText, chart.x + 14 + zoneFont, overY);
      const overW = ctx.measureText(overText).width;
      this.fit(ctx, underText, maxZoneW, zoneFont, 800, true);
      const underY = chart.y + chart.h - Math.min((chart.y + chart.h - yLo) / 2, zoneFont * 1.4);
      this.glyph(ctx, -1, chart.x + 14, underY, zoneFont * 0.9, pal.warn);
      ctx.fillStyle = pal.warn;
      ctx.fillText(underText, chart.x + 14 + zoneFont, underY);

      // Axis values with their unit inside the left edge, clear of the zone names.
      ctx.fillStyle = pal.faint;
      ctx.font = this.font(small, 600, true);
      const clear = zoneFont * 0.9 + small * 0.7;
      for (let k = Math.ceil((this.yMin + 1) / 10) * 10; k < this.yMax; k += 10) {
        const y = this.yOf(k) - small * 0.75;
        if (Math.abs(y - overY) < clear || Math.abs(y - underY) < clear) continue;
        if (y < chart.y + small * 0.7) continue;
        ctx.fillText(`${fmt(k, 0)} kPa`, chart.x + 6, y);
      }

      // Band edge labels with their values and units.
      ctx.textAlign = 'right';
      const limitText = `${t('minigame.MG-08.edge.limit')} ${fmt(config.bandHiKpa, 1)} kPa`;
      const minText = `${t('minigame.MG-08.edge.min')} ${fmt(config.bandLoKpa, 1)} kPa`;
      this.fit(ctx, limitText, chart.w * 0.55, small, 700, true);
      ctx.fillStyle = pal.good;
      ctx.fillText(limitText, chart.x + chart.w - 8, yHi - small * 0.85);
      this.fit(ctx, minText, chart.w * 0.55, small, 700, true);
      ctx.fillText(minText, chart.x + chart.w - 8, yLo + small * 0.95);

      // Legend of the dashed curve, in the top right corner where nothing else is drawn.
      const fullText = t('minigame.MG-08.curve.full');
      ctx.textAlign = 'right';
      this.fit(ctx, fullText, chart.w * 0.5, small, 600, false);
      const tw = ctx.measureText(fullText).width;
      // Shown next to the zone name when both fit on one line. With very large text on a
      // narrow chart it is left out: the instruction and the demo already explain the curve.
      if (14 + zoneFont + overW + 14 + 30 + tw + 8 <= chart.w) {
        ctx.fillStyle = pal.dim;
        ctx.fillText(fullText, chart.x + chart.w - 8, overY);
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = withAlpha(pal.dim, 0.9);
        ctx.beginPath();
        ctx.moveTo(chart.x + chart.w - 8 - tw - 30, overY);
        ctx.lineTo(chart.x + chart.w - 8 - tw - 7, overY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();

    // Chart frame.
    this.roundRect(ctx, chart, 10);
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.lineStrong;
    ctx.stroke();

    // Time axis.
    if (!opts.compact) {
      const small = 11 * Math.min(u, 1.4);
      ctx.font = this.font(small, 600, true);
      ctx.fillStyle = pal.faint;
      ctx.textBaseline = 'top';
      const y = this.ribbon.y + this.ribbon.h + 3;
      for (let s = 0; s <= dur + 0.5; s += 5) {
        ctx.textAlign = s === 0 ? 'left' : s >= dur - 0.5 ? 'right' : 'center';
        ctx.fillText(`${fmt(s, 0)} s`, this.xOf(Math.min(s, dur)), y);
      }
    }

    // Lever column.
    const sl = this.slider;
    paintGlass(ctx, sl, 14, this.artPal());
    const cx = sl.x + sl.w / 2;
    // Groove.
    ctx.lineCap = 'round';
    ctx.lineWidth = opts.compact ? 5 : 8;
    ctx.strokeStyle = pal.bg0;
    ctx.beginPath();
    ctx.moveTo(cx, this.trackTop);
    ctx.lineTo(cx, this.trackBottom);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.line;
    // Scale ticks every 10 % of thrust.
    if (!opts.compact) {
      ctx.beginPath();
      for (let p = Math.ceil(config.throttleMin * 10) / 10; p <= 1.0001; p += 0.1) {
        const y = Math.round(this.thumbY(p)) + 0.5;
        ctx.moveTo(sl.x + 6, y);
        ctx.lineTo(sl.x + 13, y);
        ctx.moveTo(sl.x + sl.w - 13, y);
        ctx.lineTo(sl.x + sl.w - 6, y);
      }
      ctx.strokeStyle = pal.lineStrong;
      ctx.stroke();
      const small = 11 * Math.min(u, 1.4);
      ctx.fillStyle = pal.dim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.fit(ctx, '100 %', sl.w - 8, small, 700, true);
      ctx.fillText(`${fmt(100, 0)} %`, cx, sl.y + small * 0.95);
      ctx.fillText(`${fmt(config.throttleMin * 100, 0)} %`, cx, sl.y + sl.h - small * 0.9);
    }
    ctx.lineCap = 'butt';
  }

  // ───────────── per-frame ─────────────

  draw(extras: FrameExtras) {
    const { ctx, pal, sim, config, chart, opts } = this;
    const t = opts.t;
    const u = this.u;
    const time = extras.timeMs / 1000;
    const zone = sim.zone;
    const zc = this.zoneColor(zone);
    const calm = opts.reducedMotion;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.layer) ctx.drawImage(this.layer, 0, 0, this.W, this.H);

    // ── chart contents ──
    ctx.save();
    this.roundRect(ctx, chart, 10);
    ctx.clip();

    // Edge glow of the zone the line is in. Steady in reduced motion (no flashing).
    if (zone !== 0 && !opts.compact) {
      const pulse = calm ? 0.16 : 0.13 + 0.09 * (0.5 + 0.5 * Math.sin(time * 9));
      const g =
        zone === 1
          ? ctx.createLinearGradient(0, chart.y, 0, chart.y + chart.h * 0.45)
          : ctx.createLinearGradient(0, chart.y + chart.h, 0, chart.y + chart.h * 0.55);
      g.addColorStop(0, withAlpha(zc, pulse * 2));
      g.addColorStop(1, withAlpha(zc, 0));
      ctx.fillStyle = g;
      ctx.fillRect(chart.x, chart.y, chart.w, chart.h);
    }

    // The stress line trembles while overloaded (not in reduced motion).
    const shake = zone === 1 && !calm && !opts.compact;
    const sx = shake ? Math.sin(time * 61) * 1.6 : 0;
    const sy = shake ? Math.cos(time * 47) * 1.3 : 0;
    ctx.translate(sx, sy);

    const total = sim.totalSteps;
    const done = sim.step;
    const stride = Math.max(1, Math.floor(total / (chart.w * 1.5)));
    const stepX = (i: number) => chart.x + ((i + 1) / total) * chart.w;

    // What the wind really did to full-throttle q so far (thin).
    if (done > 0) {
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = withAlpha(pal.dim, 0.55);
      ctx.beginPath();
      for (let i = 0; i < done; i += stride) {
        const x = stepX(i);
        const y = this.yOf(sim.curve.qFullKpa((i + 1) * sim.dtS));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // The vehicle's stress line.
    const headX = done > 0 ? stepX(done - 1) : chart.x;
    const headY = this.yOf(sim.loadKpa);
    if (done > 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = opts.compact ? 2.5 : 3.5;
      ctx.strokeStyle = pal.text;
      ctx.beginPath();
      ctx.moveTo(stepX(0), this.yOf(sim.loadHistory[0]!));
      for (let i = stride; i < done; i += stride) ctx.lineTo(stepX(i), this.yOf(sim.loadHistory[i]!));
      ctx.lineTo(headX, headY);
      ctx.stroke();
      // Out-of-band stretches again, thicker, in the zone colour.
      for (const z of [1, -1] as const) {
        ctx.strokeStyle = this.zoneColor(z);
        ctx.lineWidth = opts.compact ? 3 : 4.5;
        ctx.beginPath();
        let open = false;
        for (let i = 0; i < done; i += stride) {
          if (sim.zoneHistory[i] === z) {
            const x = stepX(i);
            const y = this.yOf(sim.loadHistory[i]!);
            if (open) ctx.lineTo(x, y);
            else {
              ctx.moveTo(x, y);
              open = true;
            }
          } else open = false;
        }
        ctx.stroke();
      }
    }

    // "Now" cursor.
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(pal.accent, 0.55);
    ctx.beginPath();
    ctx.moveTo(Math.round(headX) + 0.5, chart.y);
    ctx.lineTo(Math.round(headX) + 0.5, chart.y + chart.h);
    ctx.stroke();

    // Comet tail behind the head (skipped in reduced motion).
    if (!calm && done > 12) {
      for (let k = 1; k <= 7; k++) {
        const i = done - 1 - k * 7;
        if (i < 0) break;
        ctx.fillStyle = withAlpha(zc, 0.34 - k * 0.04);
        ctx.beginPath();
        ctx.arc(stepX(i), this.yOf(sim.loadHistory[i]!), Math.max(1, 5 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Head: a disc in the band, a triangle pointing the wrong way out of it.
    const r = opts.compact ? 5 : 8;
    if (zone === 0) {
      const halo = calm ? r * 2 : r * (1.9 + 0.35 * Math.sin(time * 5));
      ctx.fillStyle = withAlpha(pal.good, 0.25);
      ctx.beginPath();
      ctx.arc(headX, headY, halo, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.text;
      ctx.strokeStyle = pal.good;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(headX, headY, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = withAlpha(zc, 0.28);
      ctx.beginPath();
      ctx.arc(headX, headY, r * 2, 0, Math.PI * 2);
      ctx.fill();
      this.glyph(ctx, zone, headX, headY, r * 2.3, pal.bg0);
      this.glyph(ctx, zone, headX, headY, r * 1.7, zc);
    }
    ctx.restore();

    // ── in-band ribbon under the chart: solid = in band, hatched = out ──
    {
      const rb = this.ribbon;
      ctx.fillStyle = withAlpha(pal.lineStrong, 0.35);
      ctx.fillRect(rb.x, rb.y, rb.w, rb.h);
      let runStart = 0;
      let runZone: number | null = null;
      const flush = (end: number) => {
        if (runZone === null) return;
        const x0 = rb.x + (runStart / total) * rb.w;
        const x1 = rb.x + (end / total) * rb.w;
        if (runZone === 0) {
          ctx.fillStyle = pal.good;
          ctx.fillRect(x0, rb.y, Math.max(1, x1 - x0), rb.h);
        } else {
          ctx.fillStyle = withAlpha(this.zoneColor(runZone as Zone), 0.35);
          ctx.fillRect(x0, rb.y, Math.max(1, x1 - x0), rb.h);
          ctx.fillStyle = this.zoneColor(runZone as Zone);
          ctx.fillRect(x0, rb.y + rb.h / 2 - 1, Math.max(1, x1 - x0), 2);
        }
      };
      for (let i = 0; i < done; i += stride) {
        const z = sim.zoneHistory[i]!;
        if (z !== runZone) {
          flush(i);
          runStart = i;
          runZone = z;
        }
      }
      flush(done);
    }

    // ── lever ──
    this.drawLever(extras);

    if (opts.compact) {
      if (extras.pausedText) this.drawPaused(extras.pausedText);
      return;
    }

    // ── readouts ──
    const tileGap = 8;
    const tileW = (this.hud.w - tileGap) / 2;
    const left: Rect = { x: this.hud.x, y: this.hud.y, w: tileW, h: this.hud.h };
    const right: Rect = { x: this.hud.x + tileW + tileGap, y: this.hud.y, w: tileW, h: this.hud.h };
    const labelPx = 10.5 * Math.min(u, 1.45);
    const valuePx = 27 * Math.min(u, 1.45);

    for (const tile of [left, right]) {
      paintGlass(ctx, tile, 14, this.artPal());
    }

    // Dynamic pressure now.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = pal.dim;
    this.fit(ctx, t('minigame.MG-08.hud.q'), left.w - 20, labelPx, 700, true);
    ctx.fillText(t('minigame.MG-08.hud.q'), left.x + 10, left.y + labelPx + 8);
    const qText = fmt(sim.loadKpa, 1, 1);
    const glyphSize = valuePx * 0.62;
    const baseY = left.y + left.h - 11;
    const glyphY = baseY - valuePx * 0.36;
    this.numberWithUnit(ctx, qText, 'kPa', left.x + 10, baseY, left.w - 30 - glyphSize, valuePx, zone === 0 ? pal.text : zc);
    this.glyph(ctx, zone, left.x + left.w - 10 - glyphSize / 2, glyphY, glyphSize, zc);

    // In-band share so far, against the share needed.
    const need = config.inBandFractionMin;
    const share = sim.inBandFraction;
    const ok = share >= need;
    const shareColor = ok ? pal.good : pal.warn;
    const needText = t('minigame.MG-08.hud.need', { pct: fmt(need * 100, 0) });
    const inBandLabel = `${t('minigame.MG-08.hud.in_band')} · ${needText}`;
    ctx.fillStyle = pal.dim;
    this.fit(ctx, inBandLabel, right.w - 20, labelPx, 700, true);
    ctx.fillText(inBandLabel, right.x + 10, right.y + labelPx + 8);
    const pctText = fmt(Math.floor(share * 100 + 1e-9), 0);
    this.numberWithUnit(ctx, pctText, '%', right.x + 10, baseY, right.w - 30 - glyphSize, valuePx, shareColor);
    // ✓ when on course for success, "!" triangle when not.
    if (ok) this.glyph(ctx, 0, right.x + right.w - 10 - glyphSize / 2, glyphY, glyphSize, pal.good);
    else {
      const gx = right.x + right.w - 10 - glyphSize / 2;
      const gy = glyphY;
      this.glyph(ctx, 1, gx, gy, glyphSize, pal.warn);
      ctx.fillStyle = pal.warnInk;
      ctx.font = this.font(glyphSize * 0.6, 900, false);
      ctx.textAlign = 'center';
      ctx.fillText('!', gx, gy + glyphSize * 0.36);
      ctx.textAlign = 'left';
    }
    // Share bar along the bottom of the tile with a notch at the share needed.
    const barY = right.y + right.h - 5;
    ctx.fillStyle = withAlpha(pal.lineStrong, 0.6);
    ctx.fillRect(right.x + 10, barY, right.w - 20, 3);
    ctx.fillStyle = shareColor;
    ctx.fillRect(right.x + 10, barY, (right.w - 20) * clamp(share, 0, 1), 3);
    ctx.fillStyle = pal.text;
    ctx.fillRect(right.x + 10 + (right.w - 20) * need - 1, barY - 3, 2, 8);

    // ── status strip: the one thing to read at arm's length ──
    const st = this.strip;
    this.roundRect(ctx, st, 10);
    ctx.fillStyle = withAlpha(zc, zone === 0 ? 0.16 : 0.2);
    ctx.fill();
    if (zone !== 0) {
      ctx.save();
      this.roundRect(ctx, st, 10);
      ctx.clip();
      const pattern = zone === 1 ? this.hatch : this.dots;
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(st.x, st.y, st.w, st.h);
      }
      ctx.restore();
    }
    this.roundRect(ctx, st, 10);
    ctx.lineWidth = 2;
    ctx.strokeStyle = zc;
    ctx.stroke();
    const statusText = t(zone === 0 ? 'minigame.MG-08.status.in_band' : zone === 1 ? 'minigame.MG-08.status.over' : 'minigame.MG-08.status.under');
    const stPx = this.fit(ctx, statusText, st.w - 64, 15 * Math.min(u, 1.5), 800, false);
    const stW = ctx.measureText(statusText).width;
    const gS = stPx * 1.05;
    const startX = st.x + (st.w - (stW + gS + 8)) / 2;
    ctx.textBaseline = 'middle';
    // A dark plate keeps the words readable on top of the pattern.
    if (zone !== 0) {
      ctx.fillStyle = withAlpha(pal.bg0, 0.78);
      this.roundRect(ctx, { x: startX - 10, y: st.y + 5, w: stW + gS + 28, h: st.h - 10 }, 7);
      ctx.fill();
    }
    this.glyph(ctx, zone, startX + gS / 2, st.y + st.h / 2, gS, zc);
    ctx.fillStyle = zone === 0 ? pal.good : pal.text;
    ctx.font = this.font(stPx, 800, false);
    ctx.textAlign = 'left';
    ctx.fillText(statusText, startX + gS + 8, st.y + st.h / 2 + 1);

    // ── how to control it ──
    const hintKey = config.oneButton
      ? config.holdToToggle
        ? 'minigame.MG-08.hint.toggle'
        : 'minigame.MG-08.hint.hold'
      : 'minigame.MG-08.hint.drag';
    const hintText = t(hintKey);
    ctx.textAlign = 'center';
    ctx.fillStyle = extras.active ? pal.accentStrong : pal.dim;
    this.fit(ctx, hintText, this.hint.w, 13 * Math.min(u, 1.5), 600, false);
    ctx.fillText(hintText, this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 2);

    if (extras.pausedText) this.drawPaused(extras.pausedText);
  }

  private drawLever(extras: FrameExtras) {
    const { ctx, pal, sim, config, opts } = this;
    const sl = this.slider;
    const cx = sl.x + sl.w / 2;
    const u = this.u;

    // Where the lever has to be to keep the line in the band (Relaxed mode and Cadet only).
    if (config.showGuide && !sim.done) {
      const g = sim.guideRange();
      const y0 = this.thumbY(g.hi);
      const y1 = this.thumbY(g.lo);
      const gw = opts.compact ? 14 : 26;
      ctx.fillStyle = withAlpha(pal.good, 0.3);
      ctx.fillRect(cx - gw / 2, y0, gw, Math.max(3, y1 - y0));
      ctx.strokeStyle = pal.good;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Brackets, so the guide is a shape and not only a tint.
      ctx.moveTo(cx - gw / 2 + 5, y0);
      ctx.lineTo(cx - gw / 2, y0);
      ctx.lineTo(cx - gw / 2, y1);
      ctx.lineTo(cx - gw / 2 + 5, y1);
      ctx.moveTo(cx + gw / 2 - 5, y0);
      ctx.lineTo(cx + gw / 2, y0);
      ctx.lineTo(cx + gw / 2, y1);
      ctx.lineTo(cx + gw / 2 - 5, y1);
      ctx.stroke();
    }

    // Thrust delivered (after the engine lag): the filled part of the groove.
    const yEngine = this.thumbY(sim.throttle);
    ctx.lineCap = 'round';
    ctx.lineWidth = opts.compact ? 5 : 8;
    ctx.strokeStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(cx, this.trackBottom);
    ctx.lineTo(cx, yEngine);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Thumb.
    const ty = this.thumbY(sim.target);
    const tw = sl.w - (opts.compact ? 8 : 10);
    const thumb: Rect = { x: cx - tw / 2, y: ty - this.thumbH / 2, w: tw, h: this.thumbH };
    ctx.save();
    if (extras.active && !opts.compact) {
      ctx.shadowColor = withAlpha(pal.accent, 0.8);
      ctx.shadowBlur = 16;
    }
    this.roundRect(ctx, thumb, opts.compact ? 6 : 12);
    const grad = ctx.createLinearGradient(0, thumb.y, 0, thumb.y + thumb.h);
    grad.addColorStop(0, extras.active ? pal.accentStrong : '#dfe8f8');
    grad.addColorStop(1, extras.active ? pal.accent : '#b6c7d3');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
    this.roundRect(ctx, thumb, opts.compact ? 6 : 12);
    ctx.lineWidth = 2;
    ctx.strokeStyle = extras.active ? '#ffffff' : pal.lineStrong;
    ctx.stroke();

    if (!opts.compact) {
      // Throttle setting, with its unit, on the thumb itself.
      const text = `${fmt(sim.target * 100, 0)} %`;
      ctx.fillStyle = '#04121f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.fit(ctx, text, tw - 10, 17 * Math.min(u, 1.3), 800, true);
      ctx.fillText(text, cx, ty + 1);
      // Grip lines.
      ctx.strokeStyle = 'rgba(4, 18, 31, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const dy of [-this.thumbH / 2 + 8, this.thumbH / 2 - 8]) {
        ctx.moveTo(cx - tw * 0.22, ty + dy);
        ctx.lineTo(cx + tw * 0.22, ty + dy);
      }
      ctx.stroke();
    }

    // Demo: a fingertip on the lever.
    if (extras.finger) {
      const fx = cx + (opts.compact ? 2 : 6);
      const fy = ty + this.thumbH * 0.15;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.arc(fx, fy, opts.compact ? 13 : 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx, fy, opts.compact ? 9 : 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawPaused(text: string) {
    const { ctx, pal } = this;
    ctx.fillStyle = withAlpha(pal.bg0, 0.72);
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = this.fit(ctx, text, this.W - 80, 22 * Math.min(this.u, 1.5), 800, false);
    const w = ctx.measureText(text).width;
    this.roundRect(ctx, { x: this.W / 2 - w / 2 - 22, y: this.H / 2 - px * 1.1, w: w + 44, h: px * 2.2 }, 14);
    ctx.fillStyle = pal.bg0;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.accent;
    ctx.stroke();
    ctx.fillStyle = pal.text;
    ctx.fillText(text, this.W / 2, this.H / 2 + 1);
  }
}
