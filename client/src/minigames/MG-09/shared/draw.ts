// Canvas drawing kit shared by the T020 minigames: theme colours from the CSS variables (so
// high-contrast mode applies), DPR capped at 2, the page text scale, right-to-left aware text,
// status glyphs (shape + colour + word), panels, tiles, buttons and the reference launch
// vehicle of the style guide (unbranded, slender, serially staged, plumes start at the bells).
import { fmt } from '../../../data/format';
import { applyStageBackground, artEpoch, ceramicGradient, engineBell, fairing, FONT_DISPLAY, graphiteGradient, jointShade, paintGlass, paintSky, plume, seam, silverGradient, tealBand, uiFont } from './art';

export type Translate = (key: string, args?: Record<string, string | number>) => string;
export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'accent';
/** Status shapes: check (meets), up / down triangles (too high / too low), stop octagon (fails), dot, warn triangle with "!". */
export type GlyphKind = 'ok' | 'up' | 'down' | 'stop' | 'dot' | 'warn' | 'ring';

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
  sun: string;
  ocean: string;
  fontUi: string;
  fontMono: string;
}

/**
 * Canvas resolution cap: device pixels per CSS pixel, at most 2. The kit lowers it (2 → 1.5 →
 * 1) when frames come too slowly (dynamic resolution), so slow phones keep ≥ 30 fps.
 */
export let DPR_CAP = 2;
export function setDprCap(v: number) {
  DPR_CAP = Math.min(2, Math.max(1, v));
}

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

export class View2D {
  readonly canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  readonly t: Translate;
  pal!: Palette;
  dpr = 1;
  W = 0;
  H = 0;
  /** Page text scale 1–2 (accessibility setting), for canvas text. */
  u = 1;
  /** Text scale for running text, capped so layouts still fit. */
  us = 1;
  rtl = false;
  reducedMotion: boolean;
  private epoch = -1;
  private toneCache: Record<Tone, string> = { good: '', warn: '', bad: '', neutral: '', accent: '' };

  constructor(canvas: HTMLCanvasElement, t: Translate, reducedMotion: boolean) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.t = t;
    this.reducedMotion = reducedMotion;
    this.measure();
  }

  /** Re-reads the element size, DPR (capped at 2), text scale, direction and theme. */
  measure() {
    this.layers?.clear();
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(120, Math.round(r.width));
    this.H = Math.max(100, Math.round(r.height));
    this.dpr = Math.min(DPR_CAP, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const root = document.documentElement;
    const st = getComputedStyle(root);
    this.u = clampN((parseFloat(st.fontSize) || 16) / 16, 1, 2);
    this.us = Math.min(this.u, 1.5);
    this.rtl = (root.getAttribute('dir') ?? st.direction) === 'rtl';
    this.pal = {
      bg0: cssVar(st, '--bg-0', '#071522'),
      bg1: cssVar(st, '--bg-1', '#0b1d2e'),
      bg2: cssVar(st, '--bg-2', '#112b40'),
      bg3: cssVar(st, '--bg-3', '#173a55'),
      line: cssVar(st, '--line', '#24435c'),
      lineStrong: cssVar(st, '--line-strong', '#3f6d8a'),
      text: cssVar(st, '--text', '#e8eef0'),
      dim: cssVar(st, '--text-dim', '#b6c7d3'),
      faint: cssVar(st, '--text-faint', '#8ea5b5'),
      accent: cssVar(st, '--accent', '#55c5cd'),
      accentStrong: cssVar(st, '--accent-strong', '#8fe0e6'),
      good: cssVar(st, '--good', '#77d6a1'),
      warn: cssVar(st, '--warn', '#ffd166'),
      bad: cssVar(st, '--bad', '#ff8f8f'),
      ink: cssVar(st, '--good-ink', '#071522'),
      sun: cssVar(st, '--sunlight', '#ffce83'),
      ocean: cssVar(st, '--ocean', '#176887'),
      fontUi: cssVar(st, '--font-ui', 'system-ui, sans-serif'),
      fontMono: cssVar(st, '--font-mono', 'ui-monospace, monospace'),
    };
    // The shared stage (key-art backdrop) is the canvas's CSS background.
    applyStageBackground(this.canvas);
    this.toneCache = { good: this.pal.good, warn: this.pal.warn, bad: this.pal.bad, neutral: this.pal.dim, accent: this.pal.accent };
  }

  tone(t: Tone): string {
    return this.toneCache[t];
  }

  /** Clears the frame and sets the DPR transform and the text direction. */
  begin() {
    const { ctx } = this;
    // Fonts or stage art arrived: cached layers hold the old faces, repaint them.
    const ep = artEpoch();
    if (ep !== this.epoch) {
      this.epoch = ep;
      this.layers.clear();
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.direction = this.rtl ? 'rtl' : 'ltr';
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ───────────── text ─────────────

  /**
   * Canvas font in the theme's UI face. `mono` is kept for call sites written before the
   * revamp: read-outs now use IBM Plex Sans too, whose figures are tabular (equal advances), so
   * numbers still line up without a monospace face (VISUAL_TARGET section 4: no mono labels).
   */
  font(px: number, weight: number, _mono = false): string {
    return uiFont(px, weight);
  }

  /** Display face (Oxanium) for titles and hero numbers. */
  fontDisplay(px: number): string {
    return uiFont(px, 600, FONT_DISPLAY);
  }

  /** Sets the largest font up to `px` that fits `text` into `maxW`; returns the size used. */
  fit(text: string, maxW: number, px: number, weight: number, mono: boolean): number {
    const { ctx } = this;
    // Small captions were sized for a monospace face; Plex Sans reads smaller at the same size,
    // so captions under 12 px move part of the way up (label floor of the phone type scale).
    if (px < 12) px += (12 - px) * 0.6;
    ctx.font = this.font(px, weight, mono);
    const w = ctx.measureText(text).width;
    if (w <= maxW || w === 0) return px;
    const size = Math.max(7, Math.floor((px * maxW) / w));
    ctx.font = this.font(size, weight, mono);
    return size;
  }

  /** Logical start / end x of a rectangle (mirrored in right-to-left). */
  sx(r: Rect, inset: number): number {
    return this.rtl ? r.x + r.w - inset : r.x + inset;
  }

  ex(r: Rect, inset: number): number {
    return this.rtl ? r.x + inset : r.x + r.w - inset;
  }

  /** Text at the logical start of `r` (left in LTR, right in RTL). */
  textStart(text: string, r: Rect, inset: number, y: number, px: number, weight: number, mono: boolean, color: string, maxW = r.w - inset * 2) {
    const { ctx } = this;
    this.fit(text, maxW, px, weight, mono);
    ctx.fillStyle = color;
    ctx.textAlign = 'start';
    ctx.fillText(text, this.sx(r, inset), y);
  }

  textEnd(text: string, r: Rect, inset: number, y: number, px: number, weight: number, mono: boolean, color: string, maxW = r.w - inset * 2) {
    const { ctx } = this;
    this.fit(text, maxW, px, weight, mono);
    ctx.fillStyle = color;
    ctx.textAlign = 'end';
    ctx.fillText(text, this.ex(r, inset), y);
  }

  textCenter(text: string, cx: number, y: number, maxW: number, px: number, weight: number, mono: boolean, color: string): number {
    const { ctx } = this;
    const size = this.fit(text, maxW, px, weight, mono);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, y);
    return size;
  }

  /**
   * A number followed by its unit (unit at 55 %, dimmed), shrunk together to fit `maxW`, placed
   * at the logical start of `r`. Returns the width used.
   */
  numberUnit(num: string, unit: string, r: Rect, inset: number, baseY: number, px: number, color: string, maxW = r.w - inset * 2): number {
    const { ctx } = this;
    // Units at 70 % in Muted after a thin space (VISUAL_TARGET 3.1).
    const measure = (size: number) => {
      ctx.font = this.font(size, 600, false);
      const nw = ctx.measureText(num).width;
      ctx.font = this.font(size * 0.62, 500, false);
      return { nw, uw: ctx.measureText(unit).width, total: nw + size * 0.14 + ctx.measureText(unit).width };
    };
    let size = px;
    let m = measure(size);
    if (m.total > maxW && m.total > 0) {
      size = Math.max(9, Math.floor((size * maxW) / m.total));
      m = measure(size);
    }
    ctx.textAlign = 'left';
    const left = this.rtl ? r.x + r.w - inset - m.total : r.x + inset;
    // Numbers read left to right in both directions; the unit follows the number.
    ctx.font = this.font(size, 600, false);
    ctx.fillStyle = color;
    ctx.direction = 'ltr';
    ctx.fillText(num, left, baseY);
    ctx.font = this.font(size * 0.62, 500, false);
    ctx.fillStyle = this.pal.dim;
    ctx.fillText(unit, left + m.nw + size * 0.14, baseY);
    ctx.direction = this.rtl ? 'rtl' : 'ltr';
    return m.total;
  }

  // ───────────── shapes ─────────────

  roundRect(r: Rect, radius: number) {
    const { ctx } = this;
    const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
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

  /** Console panel: opaque fill, 1 px outline (style guide: panels need an outline, not only a tint). */
  /**
   * Draws a static piece (panel, backdrop, button face) from an offscreen layer painted once per
   * key: a blit per frame instead of paths, gradients and blurs (the main cost of full-screen
   * canvases on slow phones). `pad` leaves room for glows. The layers are dropped on resize.
   */
  cached(key: string, r: Rect, pad: number, paint: () => void) {
    const k = `${key}|${r.x}|${r.y}|${r.w}|${r.h}`;
    let layer = this.layers.get(k);
    if (!layer) {
      layer = document.createElement('canvas');
      layer.width = Math.max(1, Math.ceil((r.w + pad * 2) * this.dpr));
      layer.height = Math.max(1, Math.ceil((r.h + pad * 2) * this.dpr));
      const lctx = layer.getContext('2d');
      if (lctx) {
        lctx.setTransform(this.dpr, 0, 0, this.dpr, (pad - r.x) * this.dpr, (pad - r.y) * this.dpr);
        lctx.direction = this.rtl ? 'rtl' : 'ltr';
        const main = this.ctx;
        this.ctx = lctx;
        try {
          paint();
        } finally {
          this.ctx = main;
        }
      }
      if (this.layers.size > 160) this.layers.clear();
      this.layers.set(k, layer);
    }
    this.ctx.drawImage(layer, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
  }

  private readonly layers = new Map<string, HTMLCanvasElement>();

  /**
   * Glass panel of the UI (theme --glass, --glass-edge, --glass-hi). The default call is the
   * standard e2 glass; a custom `fill` (e.g. bg1 / bg0 for a deep well) gives the deeper glass,
   * a custom `stroke` replaces the glass edge.
   */
  panel(r: Rect, radius = 14, fill = this.pal.bg2, stroke = '', alpha = 0.94) {
    this.cached(`panel|${radius}|${fill}|${stroke}|${alpha}`, r, 1, () => {
      const deep = fill !== this.pal.bg2;
      const edge = stroke && stroke !== this.pal.lineStrong && stroke !== this.pal.line ? stroke : undefined;
      paintGlass(this.ctx, r, r.h > 40 && r.w > 40 ? Math.max(radius, 14) : radius, this.pal, { deep, edge });
    });
  }

  /**
   * Cinematic backdrop of the style frames: deep space at the top fading to a dusk sky, a curved
   * Earth limb with a thin blue atmosphere rim and a warm horizon band, a few stars and a soft
   * sun glow. `horizon` is the limb height as a fraction of the rectangle (0 = top, 1 = bottom;
   * > 1 puts the limb below the frame, only its glow shows). Clipped to `r` with `radius`.
   */
  backdrop(r: Rect, radius: number, horizon = 0.8, sun: 'left' | 'right' | null = 'right') {
    this.cached(`backdrop|${radius}|${horizon.toFixed(3)}|${sun}`, r, 0, () => this.paintBackdrop(r, radius, horizon, sun));
  }

  private paintBackdrop(r: Rect, radius: number, horizon: number, sun: 'left' | 'right' | null) {
    const { ctx, pal } = this;
    ctx.save();
    this.roundRect(r, radius);
    ctx.clip();
    paintSky(ctx, r, pal, horizon, sun);
    ctx.restore();
    // Glass edge around the scene window.
    this.roundRect(r, radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.22)';
    ctx.stroke();
  }

  /** Dashed / double / solid border by status (tokens: good solid, warn dashed, bad double). */
  statusBorder(r: Rect, radius: number, tone: Tone, width = 2) {
    const { ctx } = this;
    const c = this.tone(tone);
    ctx.strokeStyle = c;
    ctx.lineWidth = width;
    if (tone === 'warn') ctx.setLineDash([7, 5]);
    this.roundRect(r, radius);
    ctx.stroke();
    ctx.setLineDash([]);
    if (tone === 'bad') {
      const inner = { x: r.x + width + 2, y: r.y + width + 2, w: r.w - 2 * (width + 2), h: r.h - 2 * (width + 2) };
      ctx.lineWidth = 1;
      this.roundRect(inner, Math.max(2, radius - width - 2));
      ctx.stroke();
    }
  }

  glyph(kind: GlyphKind, cx: number, cy: number, size: number, color: string, ink?: string) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const s = size;
    switch (kind) {
      case 'ok':
        ctx.lineWidth = Math.max(2, s * 0.22);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy + s * 0.02);
        ctx.lineTo(cx - s * 0.12, cy + s * 0.38);
        ctx.lineTo(cx + s * 0.52, cy - s * 0.36);
        ctx.stroke();
        break;
      case 'up':
      case 'down': {
        const dir = kind === 'up' ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy + dir * s * 0.5);
        ctx.lineTo(cx - s * 0.55, cy - dir * s * 0.42);
        ctx.lineTo(cx + s * 0.55, cy - dir * s * 0.42);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'warn': {
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.52);
        ctx.lineTo(cx - s * 0.58, cy + s * 0.45);
        ctx.lineTo(cx + s * 0.58, cy + s * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = ink ?? this.pal.ink;
        ctx.fillRect(cx - s * 0.055, cy - s * 0.2, s * 0.11, s * 0.36);
        ctx.fillRect(cx - s * 0.055, cy + s * 0.24, s * 0.11, s * 0.1);
        break;
      }
      case 'stop': {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = Math.PI / 8 + (i * Math.PI) / 4;
          const x = cx + Math.cos(a) * s * 0.55;
          const y = cy + Math.sin(a) * s * 0.55;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ink ?? this.pal.ink;
        ctx.lineWidth = Math.max(1.5, s * 0.13);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.2, cy - s * 0.2);
        ctx.lineTo(cx + s * 0.2, cy + s * 0.2);
        ctx.moveTo(cx + s * 0.2, cy - s * 0.2);
        ctx.lineTo(cx - s * 0.2, cy + s * 0.2);
        ctx.stroke();
        break;
      }
      case 'dot':
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        ctx.lineWidth = Math.max(1.5, s * 0.14);
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  /** Status strip: glass tinted by the status, status border, glyph and words centred. */
  statusStrip(r: Rect, tone: Tone, glyph: GlyphKind, text: string) {
    const { ctx, pal } = this;
    const c = this.tone(tone);
    this.cached(`strip|${tone}`, r, 2, () => {
      paintGlass(this.ctx, r, 12, pal, { deep: true, tint: c, tintAlpha: tone === 'neutral' ? 0.06 : 0.15, edge: 'rgba(0,0,0,0)' });
      this.statusBorder(r, 12, tone, tone === 'neutral' ? 1 : 1.5);
    });
    const px = this.fit(text, r.w - 64, 15.5 * this.us, 600, false);
    const tw = ctx.measureText(text).width;
    const gs = px * 1.1;
    const total = tw + gs + 9;
    const left = r.x + (r.w - total) / 2;
    ctx.textBaseline = 'middle';
    const gx = this.rtl ? left + total - gs / 2 : left + gs / 2;
    this.glyph(glyph, gx, r.y + r.h / 2, gs, c);
    ctx.fillStyle = pal.text;
    ctx.font = this.font(px, 600, false);
    ctx.textAlign = 'center';
    ctx.fillText(text, this.rtl ? left + tw / 2 : left + gs + 9 + tw / 2, r.y + r.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  /** Read-out tile: label on top, big number with unit, optional status glyph at the end. */
  tile(r: Rect, label: string, num: string, unit: string, color: string, glyph?: { kind: GlyphKind; color: string }) {
    const { ctx, pal } = this;
    this.panel(r, 14);
    const labelPx = 12.5 * Math.min(this.u, 1.3);
    const valuePx = Math.min(27 * Math.min(this.u, 1.4), r.h * 0.5);
    ctx.textBaseline = 'alphabetic';
    const gs = glyph ? valuePx * 0.6 : 0;
    this.textStart(label, r, 12, r.y + labelPx + 8, labelPx, 600, false, pal.dim);
    this.numberUnit(num, unit, r, 12, r.y + r.h - 10, valuePx, color, r.w - 24 - (glyph ? gs + 8 : 0));
    if (glyph) this.glyph(glyph.kind, this.ex(r, 12 + gs / 2), r.y + r.h - 10 - valuePx * 0.34, gs, glyph.color);
  }

  /**
   * A big touch button (≥ 48 px): label, optional sub-label, tone and state. `armed` glows (it is
   * the moment to press); `done` shows the status glyph instead of the press affordance.
   */
  button(r: Rect, label: string, o: { tone?: Tone; enabled?: boolean; armed?: boolean; pressed?: boolean; sub?: string; glyph?: GlyphKind; focus?: boolean }) {
    const { ctx, pal } = this;
    const tone = o.tone ?? 'accent';
    const c = this.tone(tone);
    const enabled = o.enabled !== false;
    this.cached(`button|${tone}|${enabled}|${!!o.armed}|${!!o.pressed}|${!!o.focus}`, r, 24, () => {
      const x = this.ctx;
      // Glass button: tinted glass, a lit top edge and a tone outline; armed adds a soft glow.
      if (o.armed && enabled) {
        x.save();
        x.shadowColor = withAlpha(c, 0.6);
        x.shadowBlur = 20;
        this.roundRect(r, 16);
        x.fillStyle = withAlpha(c, 0.25);
        x.fill();
        x.restore();
      }
      paintGlass(x, r, 16, pal, {
        deep: true,
        tint: enabled ? c : undefined,
        tintAlpha: !enabled ? 0 : o.pressed ? 0.42 : o.armed ? 0.3 : 0.14,
        edge: enabled ? withAlpha(c, o.armed ? 1 : 0.75) : pal.line,
        edgeWidth: o.armed && enabled ? 2 : 1.5,
      });
      if (enabled && !o.pressed) {
        // Light from above: a soft lift on the upper half.
        x.save();
        this.roundRect(r, 16);
        x.clip();
        const lift = x.createLinearGradient(0, r.y, 0, r.y + r.h);
        lift.addColorStop(0, withAlpha(c, 0.16));
        lift.addColorStop(0.5, withAlpha(c, 0));
        x.fillStyle = lift;
        x.fillRect(r.x, r.y, r.w, r.h);
        x.restore();
      }
      if (o.focus) {
        this.roundRect({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }, 19);
        x.lineWidth = 2;
        x.strokeStyle = pal.accentStrong;
        x.stroke();
      }
    });
    const px = 19 * Math.min(this.u, 1.35);
    const hasSub = !!o.sub;
    const cy = r.y + r.h / 2 - (hasSub ? px * 0.38 : 0);
    ctx.textBaseline = 'middle';
    const gs = o.glyph ? px * 0.95 : 0;
    const size = this.fit(label, r.w - 24 - (gs ? gs + 8 : 0), px, 600, false);
    const tw = ctx.measureText(label).width;
    const total = tw + (gs ? gs + 8 : 0);
    const left = r.x + (r.w - total) / 2;
    if (o.glyph) this.glyph(o.glyph, this.rtl ? left + total - gs / 2 : left + gs / 2, cy, gs, enabled ? c : pal.faint);
    ctx.font = this.font(size, 600, false);
    ctx.fillStyle = enabled ? pal.text : pal.faint;
    ctx.textAlign = 'center';
    ctx.fillText(label, this.rtl ? left + tw / 2 : left + (gs ? gs + 8 : 0) + tw / 2, cy + 1);
    if (o.sub) this.textCenter(o.sub, r.x + r.w / 2, cy + px * 0.95, r.w - 16, 12 * Math.min(this.u, 1.3), 500, false, enabled ? pal.dim : pal.faint);
    ctx.textBaseline = 'alphabetic';
  }

  /** Ghost finger for the demo loops. */
  finger(x: number, y: number, pressed: boolean, r = 18) {
    const { ctx } = this;
    ctx.fillStyle = pressed ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, pressed ? r * 1.15 : r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Freeze banner over everything while paused. */
  paused(text: string) {
    const { ctx, pal } = this;
    ctx.fillStyle = withAlpha(pal.bg0, 0.74);
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textBaseline = 'middle';
    const px = this.fit(text, this.W - 80, 22 * this.us, 600, false);
    const w = ctx.measureText(text).width;
    paintGlass(ctx, { x: this.W / 2 - w / 2 - 24, y: this.H / 2 - px * 1.2, w: w + 48, h: px * 2.4 }, 18, pal, { deep: true, edge: withAlpha(pal.accent, 0.7) });
    ctx.font = this.fontDisplay(px);
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'center';
    ctx.fillText(text, this.W / 2, this.H / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  /** "12.5 s" with the device's digits. */
  secs(ms: number, decimals = 1): string {
    return `${fmt(Math.max(0, ms) / 1000, decimals, decimals)} s`;
  }
}

// ───────────── the reference launch vehicle ─────────────

export interface RocketStyle {
  /** Centre x and the y of the engine-bell exit plane, CSS px. */
  x: number;
  y: number;
  /** Overall length (bells to fairing tip), px. */
  length: number;
  /** Rotation, radians, 0 = nose up, positive = clockwise (towards +x). */
  angle?: number;
  /** Which part is drawn: the whole stack, the upper stage with fairing only, or the spent first stage. */
  part?: 'stack' | 'upper' | 'lower';
  /** Plume of the lit engine(s), 0 = off … 1 = full. */
  plume?: number;
  /** Plume length as a multiple of the body width. */
  plumeLen?: number;
  /** Real time for plume flicker (s); flicker is off in reduced motion. */
  time?: number;
  calm?: boolean;
  /** Lengthwise squash (pogo): 1 = rest, < 1 compressed. */
  squash?: number;
  /** Separation gap between the stages (px) when part = 'stack'. */
  gap?: number;
  /** Number of first-stage engine bells drawn side by side. */
  bells?: number;
  /**
   * Per-engine control of the first-stage bells (overrides `bells`): gimbal tilt (radians, about
   * the throat) and plume power 0–1 for each engine, left to right.
   */
  engines?: ReadonlyArray<{ tilt: number; power: number }>;
  /** Highlight colour for the interstage seam (separation moment). */
  seam?: string;
}

/**
 * Draws the unbranded serial launch vehicle in the key-art finish (frame 03): satin ceramic
 * stages with one broad soft highlight, cool navy fill side and a warm rim light on the sun
 * side, panel seams in raking light, slim teal bands with a silver edge, a brushed-silver
 * interstage, a graphite thrust section, dark bells with a bronze inner rim and throat heat
 * tint, and layered plumes that start at the bell exits. Proportions are game values and are
 * unchanged from the first version (markers such as `engineOffset` still line up).
 */
export function drawRocket(v: View2D, s: RocketStyle) {
  const { ctx } = v;
  const L = s.length;
  const w = L / 11.5; // slender: length ≈ 11.5 diameters (game value)
  const part = s.part ?? 'stack';
  const squash = s.squash ?? 1;
  const gap = s.gap ?? 0;
  const bellH = w * 0.55;
  const s1 = L * 0.56; // first stage
  const inter = L * 0.07;
  const s2 = L * 0.17;
  const fair = L * 0.2;
  // The key light is the low sun of the backdrop: upper right, mirrored in right-to-left.
  const sun = v.rtl ? -1 : 1;
  const plumeLen = w * (s.plumeLen ?? 3.2);

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle ?? 0);
  ctx.scale(1, squash);

  const stage = (top: number, h: number, ww: number) => {
    ctx.fillStyle = ceramicGradient(ctx, ww, sun);
    ctx.fillRect(-ww / 2, top, ww, h);
  };

  if (part === 'stack' || part === 'lower') {
    const eng = s.engines;
    const n = Math.max(1, eng ? eng.length : s.bells ?? 3);
    const bw = Math.min(w * 0.62, (w * 0.96) / n);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const cx = ((i - (n - 1) / 2) * (w * 0.96)) / n;
        const tilt = eng ? eng[i]!.tilt : 0;
        const power = eng ? eng[i]!.power : s.plume ?? 0;
        ctx.save();
        // Gimbal about the throat.
        ctx.translate(cx, -bellH);
        ctx.rotate(tilt);
        ctx.translate(-cx, bellH);
        if (pass === 0) plume(ctx, cx, 0, bw, { power, length: plumeLen, time: s.time, calm: s.calm, seed: i * 3.1 });
        else engineBell(ctx, cx, 0, bw, bellH, power, sun);
        ctx.restore();
      }
    }
    const top1 = -bellH - s1;
    stage(top1, s1, w);
    // Tank domes and panel joints, grouped where real hardware has them.
    seam(ctx, top1 + s1 * 0.34, w, 0.8);
    seam(ctx, top1 + s1 * 0.62, w, 0.8);
    seam(ctx, top1 + s1 * 0.9, w, 0.6);
    // Generic teal bands (no livery), slim with a silver edge.
    tealBand(ctx, -bellH - s1 * 0.13, s1 * 0.045, w, sun);
    tealBand(ctx, -bellH - s1 * 0.79, s1 * 0.028, w, sun);
    // Raceway along the shadow side (umbilical run), very restrained.
    if (w > 10) {
      ctx.fillStyle = 'rgba(40, 58, 76, 0.22)';
      ctx.fillRect(-w * 0.36 * sun - w * 0.025, top1 + s1 * 0.05, w * 0.05, s1 * 0.8);
    }
    // Thrust section: graphite skirt with an occlusion band above the bells.
    const skirt = w * 0.14;
    ctx.fillStyle = graphiteGradient(ctx, w, sun);
    ctx.fillRect(-w / 2, -bellH - skirt, w, skirt);
    ctx.fillStyle = silverGradient(ctx, w, sun);
    ctx.fillRect(-w / 2, -bellH - skirt - Math.max(0.8, w * 0.03), w, Math.max(0.8, w * 0.03));
    jointShade(ctx, -bellH - skirt, w, Math.max(2, w * 0.18), false);
    // Interstage: brushed silver with a few stringers; it stays with the first stage.
    const itop = top1 - inter;
    ctx.fillStyle = silverGradient(ctx, w, sun);
    ctx.fillRect(-w / 2, itop, w, inter);
    if (w > 12) {
      ctx.strokeStyle = 'rgba(30, 40, 52, 0.22)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const f of [-0.32, -0.12, 0.08, 0.28]) {
        ctx.moveTo(f * w, itop + 1);
        ctx.lineTo(f * w, itop + inter - 1);
      }
      ctx.stroke();
    }
    jointShade(ctx, top1, w, Math.max(2, inter * 0.4), true);
    if (s.seam) {
      ctx.fillStyle = s.seam;
      ctx.fillRect(-w / 2 - 2, itop - 1.5, w + 4, 3);
    }
  }

  if (part === 'stack' || part === 'upper') {
    const base = part === 'upper' ? 0 : -bellH - s1 - inter - gap;
    const uw = w * 0.92;
    const ubell = w * 0.5;
    const ubellH = bellH * 0.9;
    const lit = s.plume ?? 0;
    if (part === 'upper' || gap > 0.5) plume(ctx, 0, base, ubell * 0.9, { power: lit, length: plumeLen, time: s.time, calm: s.calm, seed: 7, vacuum: true });
    engineBell(ctx, 0, base, ubell, ubellH, part === 'upper' || gap > 0.5 ? lit : 0, sun);
    const top2 = base - ubellH - s2;
    stage(top2, s2, uw);
    seam(ctx, top2 + s2 * 0.5, uw, 0.7);
    tealBand(ctx, base - ubellH - s2 * 0.58, s2 * 0.09, uw, sun);
    jointShade(ctx, base - ubellH, uw, Math.max(2, s2 * 0.12), false);
    fairing(ctx, top2, fair, w * 1.04, sun);
    jointShade(ctx, top2, uw, Math.max(1.5, s2 * 0.1), true);
  }
  ctx.restore();
}

/** Overall drawn height of a rocket of `length` including bells, px (for layout). */
export function rocketWidth(length: number): number {
  return length / 11.5;
}

/** x of first-stage engine `i` of `n` relative to the rocket's centre line, px (for markers). */
export function engineOffset(length: number, i: number, n: number): number {
  const w = length / 11.5;
  return ((i - (n - 1) / 2) * (w * 0.96)) / n;
}
