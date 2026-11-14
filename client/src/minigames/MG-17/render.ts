// MG-17 canvas renderer: the role cheat sheet, the stack of alarm cards (the front card can be
// dragged), the three bins and the readouts. Fictional codes carry a "SIMULATED" tag; the real
// 1201 / 1202 program alarms carry their own tag. Reads the simulation only.
import { fmt } from '../../data/format';
import { Canvas2D, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { BINS, type Alarm, type Bin, type Mg17Sim } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg17ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg17Frame {
  timeMs: number;
  active: boolean;
  /** Front card dragged by this offset, CSS px (null = resting). */
  drag?: { dx: number; dy: number } | null;
  /** Bin under the dragged card. */
  hover?: Bin | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

/** How long the feedback of the last sorted alarm stays in the strip, steps. */
const FEEDBACK_STEPS = 100;

function binIcon(ctx: CanvasRenderingContext2D, bin: Bin, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.lineCap = 'round';
  if (bin === 'ignore') {
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
    ctx.moveTo(cx - s * 0.28, cy + s * 0.28);
    ctx.lineTo(cx + s * 0.28, cy - s * 0.28);
    ctx.stroke();
  } else if (bin === 'monitor') {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.48, cy);
    ctx.quadraticCurveTo(cx, cy - s * 0.48, cx + s * 0.48, cy);
    ctx.quadraticCurveTo(cx, cy + s * 0.48, cx - s * 0.48, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A raised hand / action: lightning-like arrow.
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.08, cy - s * 0.45);
    ctx.lineTo(cx - s * 0.25, cy + s * 0.05);
    ctx.lineTo(cx + s * 0.02, cy + s * 0.05);
    ctx.lineTo(cx - s * 0.08, cy + s * 0.45);
    ctx.lineTo(cx + s * 0.26, cy - s * 0.08);
    ctx.lineTo(cx - s * 0.01, cy - s * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export class Mg17View {
  readonly c: Canvas2D;
  private sim: Mg17Sim;
  private readonly opts: Mg17ViewOptions;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private sheet: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Resting rectangle of the front card. */
  card: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private stackR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Bins (drop targets and buttons). */
  readonly bins: Array<{ bin: Bin; r: Rect }> = [];
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly topL: KeyedLayer;
  private readonly sheetL: KeyedLayer;
  private readonly binsL: KeyedLayer;
  private readonly waitList: Alarm[] = [];

  constructor(canvas: HTMLCanvasElement, sim: Mg17Sim, opts: Mg17ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.topL = new KeyedLayer(this.c);
    this.sheetL = new KeyedLayer(this.c);
    this.binsL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg17Sim) {
    this.sim = sim;
    this.layout();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  private layout() {
    const { c } = this;
    const { W, H } = c;
    for (const l of [this.topL, this.sheetL, this.binsL]) l.invalidate();
    this.bins.length = 0;
    const compact = this.opts.compact;
    const pad = compact ? 6 : 12;
    const u = Math.min(c.u, 1.4);
    let top = pad;
    if (!compact) {
      const hudH = Math.round(64 * u);
      const stripH = Math.round(40 * u);
      const hintH = Math.round(28 * Math.min(c.u, 1.5));
      this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
      this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
      this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
      top = this.strip.y + stripH + 10;
      const sheetH = Math.round(118 * Math.min(c.u, 1.3));
      this.sheet = { x: pad, y: top, w: W - pad * 2, h: sheetH };
      top += sheetH + 10;
    }
    const binH = compact ? Math.round(H * 0.32) : Math.max(64, Math.round(92 * Math.min(c.u, 1.3)));
    const bottom = compact ? H - pad : this.hintR.y - 8;
    const by = bottom - binH;
    const gap = compact ? 4 : 8;
    const bw = (W - pad * 2 - gap * 2) / 3;
    const order = c.rtl ? [...BINS].reverse() : [...BINS];
    order.forEach((bin, i) => this.bins.push({ bin, r: { x: pad + i * (bw + gap), y: by, w: bw, h: binH } }));
    this.stackR = { x: pad, y: top, w: W - pad * 2, h: by - 10 - top };
    const cw = Math.min(this.stackR.w - (compact ? 20 : 30), 360);
    const ch = Math.min(this.stackR.h - (compact ? 12 : 26), compact ? 70 : Math.round(150 * Math.min(c.u, 1.3)));
    // Centred in the free space, leaving room above for the cards waiting behind.
    const cy = compact ? this.stackR.y + this.stackR.h - ch - 2 : this.stackR.y + Math.max(36, (this.stackR.h - ch) / 2 + 16);
    this.card = { x: this.stackR.x + (this.stackR.w - cw) / 2, y: cy, w: cw, h: ch };
  }

  binAt(x: number, y: number): Bin | null {
    for (const b of this.bins) if (x >= b.r.x - 6 && x <= b.r.x + b.r.w + 6 && y >= b.r.y - 30 && y <= b.r.y + b.r.h + 6) return b.bin;
    return null;
  }

  private drawSheet() {
    const { c, sim, opts } = this;
    const sys = sim.config.systems;
    this.sheetL.blit({ x: this.sheet.x - 1, y: this.sheet.y - 1, w: this.sheet.w + 2, h: this.sheet.h + 2 }, sys.join(','), () => {
      const ctx = c.ctx;
      const { pal } = c;
      const t = opts.t;
      const s = this.sheet;
      c.panel(s, 12);
      const lp = c.px(10.5, 1.25);
      const title = sys.length ? t('minigame.MG-17.sheet.role', { systems: sys.join(', ') }) : t('minigame.MG-17.sheet.generic');
      c.text(title, c.rtl ? s.x + s.w - 10 : s.x + 10, s.y + 10 + lp * 0.5, s.w - 20, lp, 800, pal.dim, c.rtl ? 'right' : 'left');
      const rows: Array<[string, Bin, boolean]> = [
        [t('minigame.MG-17.sheet.program'), 'monitor', false],
        [t('minigame.MG-17.sheet.advisory'), 'ignore', false],
        [sys.length ? t('minigame.MG-17.sheet.caution_role', { systems: sys.join(', ') }) : t('minigame.MG-17.sheet.caution'), sys.length ? 'act' : 'monitor', sys.length > 0],
        [t('minigame.MG-17.sheet.warning'), 'act', false],
      ];
      const rh = (s.h - lp - 22) / rows.length;
      rows.forEach(([label, bin, hi], i) => {
        const y = s.y + lp + 16 + i * rh;
        if (hi) {
          pathRoundRect(ctx, { x: s.x + 6, y: y + 1, w: s.w - 12, h: rh - 2 }, 6);
          ctx.fillStyle = withAlpha(pal.accent, 0.16);
          ctx.fill();
        }
        const binW = c.px(78, 1.2);
        const tx = c.rtl ? s.x + s.w - 12 : s.x + 12;
        c.text(label, tx, y + rh / 2, s.w - binW - 36, c.px(12, 1.25), 700, pal.text, c.rtl ? 'right' : 'left');
        const bx = c.rtl ? s.x + 10 : s.x + s.w - 10 - binW;
        binIcon(ctx, bin, bx + 10, y + rh / 2, Math.min(18, rh * 0.8), pal.accentStrong);
        c.text(t(`minigame.MG-17.bin.${bin}`), bx + 22, y + rh / 2, binW - 22, c.px(11.5, 1.2), 900, pal.accentStrong, 'left');
      });
    });
  }

  private drawCard(a: Alarm, r: Rect, depth: number) {
    const { c, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    ctx.save();
    if (depth === 0 && !opts.compact) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
    }
    pathRoundRect(ctx, r, 12);
    ctx.fillStyle = depth === 0 ? pal.bg3 : pal.bg2;
    ctx.fill();
    ctx.restore();
    pathRoundRect(ctx, r, 12);
    ctx.lineWidth = depth === 0 ? 2 : 1;
    ctx.strokeStyle = depth === 0 ? pal.accent : pal.lineStrong;
    ctx.stroke();
    if (depth > 0 || opts.compact) {
      c.text(a.def.code, r.x + r.w / 2, r.y + Math.min(r.h / 2, 22), r.w - 20, c.px(opts.compact ? 16 : 14, 1.2), 900, depth === 0 ? pal.text : pal.dim, 'center', true);
      return;
    }
    // Front card: code, text, tag.
    const pad = 14;
    // Accent band on the leading edge.
    ctx.fillStyle = a.def.real ? pal.sun : pal.accent;
    ctx.fillRect(c.rtl ? r.x + r.w - 6 : r.x, r.y + 10, 6, r.h - 20);
    const codePx = c.px(30, 1.3);
    c.text(a.def.code, c.rtl ? r.x + r.w - pad - 4 : r.x + pad + 4, r.y + pad + codePx * 0.5, r.w * 0.55, codePx, 900, pal.text, c.rtl ? 'right' : 'left', true);
    const tag = t(a.def.real ? 'minigame.MG-17.tag.real' : 'minigame.MG-17.tag.sim');
    const tp = c.px(9.5, 1.2);
    ctx.font = c.font(tp, 800, true);
    const tw = Math.min(r.w * 0.42, ctx.measureText(tag).width + 14);
    const tx = c.rtl ? r.x + pad : r.x + r.w - pad - tw;
    pathRoundRect(ctx, { x: tx, y: r.y + pad, w: tw, h: tp + 10 }, 6);
    ctx.fillStyle = a.def.real ? withAlpha(pal.sun, 0.2) : withAlpha(pal.dim, 0.14);
    ctx.fill();
    ctx.strokeStyle = a.def.real ? pal.sun : pal.lineStrong;
    ctx.lineWidth = 1;
    ctx.stroke();
    c.text(tag, tx + tw / 2, r.y + pad + (tp + 10) / 2 + 1, tw - 8, tp, 800, a.def.real ? pal.sun : pal.dim, 'center', true);
    // Message, wrapped on up to three lines.
    const msg = t(`minigame.MG-17.alarm.${a.def.key}`);
    const mp = c.px(15, 1.3);
    ctx.font = c.font(mp, 650);
    const maxW = r.w - pad * 2 - 6;
    const words = msg.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    const y0 = r.y + pad + codePx + 12;
    lines.slice(0, 3).forEach((ln, i) => c.text(ln, c.rtl ? r.x + r.w - pad - 4 : r.x + pad + 4, y0 + i * mp * 1.3 + mp * 0.5, maxW, mp, 650, pal.dim, c.rtl ? 'right' : 'left'));
  }

  private drawBins(hover: Bin | null, active: boolean) {
    const { c, sim, opts } = this;
    const key = `${hover}|${sim.config.oneButton ? sim.highlight : -1}|${active}|${!!sim.front}`;
    const r0 = this.bins[0]!.r;
    this.binsL.blit({ x: 0, y: r0.y - 4, w: c.W, h: r0.h + 8 }, key, () => {
      const ctx = c.ctx;
      const { pal } = c;
      const t = opts.t;
      for (const { bin, r } of this.bins) {
        const hi = hover === bin || (sim.config.oneButton && BINS[sim.highlight] === bin && !!sim.front);
        pathRoundRect(ctx, r, 14);
        ctx.fillStyle = hi ? withAlpha(pal.accent, 0.28) : pal.bg2;
        ctx.fill();
        ctx.lineWidth = hi ? 3 : 1.5;
        ctx.setLineDash(hi ? [] : [6, 5]);
        ctx.strokeStyle = hi ? pal.accentStrong : pal.lineStrong;
        ctx.stroke();
        ctx.setLineDash([]);
        const s = Math.min(r.h * 0.38, 34);
        binIcon(ctx, bin, r.x + r.w / 2, r.y + r.h * (opts.compact ? 0.5 : 0.38), s, hi ? pal.accentStrong : pal.text);
        if (!opts.compact) c.text(t(`minigame.MG-17.bin.${bin}`), r.x + r.w / 2, r.y + r.h * 0.78, r.w - 10, c.px(14, 1.3), 900, pal.text, 'center');
      }
    });
  }

  draw(f: Mg17Frame) {
    const { c, sim, opts } = this;
    const { pal } = c;
    const t = opts.t;
    c.begin();
    if (!opts.compact) this.drawSheet();
    // Card stack: up to two waiting cards peek behind the front one.
    const waiting = sim.waiting(this.waitList);
    for (let i = Math.min(2, waiting.length - 1); i >= 1; i--) {
      const r = this.card;
      const lift = i * (opts.compact ? 10 : 16);
      this.drawCard(waiting[i]!, { x: r.x + i * 10, y: r.y - lift, w: r.w - i * 20, h: r.h }, i);
    }
    if (waiting.length > 0) {
      const r = this.card;
      const d = f.drag ?? { dx: 0, dy: 0 };
      this.drawCard(waiting[0]!, { x: r.x + d.dx, y: r.y + d.dy, w: r.w, h: r.h }, 0);
    } else if (!opts.compact) {
      c.text(t(sim.handled === sim.alarms.length ? 'minigame.MG-17.stack.done' : 'minigame.MG-17.stack.empty'), this.card.x + this.card.w / 2, this.card.y + this.card.h / 2, this.card.w, c.px(15, 1.3), 700, pal.faint, 'center');
    }
    this.drawBins(f.hover ?? null, f.active);
    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }
    const [st, key, args] = this.status();
    const need = Math.ceil(sim.config.correctMin * sim.alarms.length - 1e-9);
    const topKey = `${sim.correct}|${sim.handled}|${waiting.length}|${key}|${args ? args.bin : ''}|${st}`;
    this.topL.blit({ x: 0, y: 0, w: c.W, h: this.strip.y + this.strip.h + 2 }, topKey, () => {
      const gap = 8;
      const tw = (this.hud.w - gap) / 2;
      const A: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
      const B: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
      const [first, second] = c.rtl ? [B, A] : [A, B];
      const wrong = sim.handled - sim.correct;
      const stillPossible = sim.alarms.length - wrong >= need;
      c.readout(first, `${t('minigame.MG-17.hud.correct')} · ${t('minigame.MG-17.hud.need', { n: need, total: sim.alarms.length })}`, fmt(sim.correct, 0), t('minigame.MG-17.hud.of', { n: sim.handled }), stillPossible ? pal.text : pal.bad, stillPossible ? (sim.correct >= need ? 'good' : undefined) : 'bad');
      c.readout(second, t('minigame.MG-17.hud.waiting'), fmt(waiting.length, 0), t('minigame.MG-17.hud.alarms'), waiting.length >= 3 ? pal.warn : pal.text, waiting.length >= 3 ? 'warn' : undefined);
      if (st === 'info') {
        c.infoStrip(this.strip, t(key, args));
      } else c.statusStrip(this.strip, st, t(key, args));
    });
    c.hint(this.hintR, t(sim.config.oneButton ? 'minigame.MG-17.hint.press' : 'minigame.MG-17.hint.drag'), f.active);
    if (f.pausedText) c.overlay(f.pausedText);
  }

  status(): [Status | 'info', string, Record<string, string> | undefined] {
    const sim = this.sim;
    const t = this.opts.t;
    const last = sim.lastHandled;
    if (last && sim.step - last.givenStep < FEEDBACK_STEPS) {
      const bin = t(`minigame.MG-17.bin.${last.answer}`);
      return last.given === last.answer ? ['good', 'minigame.MG-17.status.right', { bin }] : ['bad', 'minigame.MG-17.status.wrong', { bin }];
    }
    if (!sim.front) return ['info', sim.handled === sim.alarms.length ? 'minigame.MG-17.stack.done' : 'minigame.MG-17.status.wait', undefined];
    return ['info', 'minigame.MG-17.status.sort', undefined];
  }
}
