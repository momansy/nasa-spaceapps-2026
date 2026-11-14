// MG-19 canvas renderer: the adapter between a square filter and a round socket with its five
// slots (function, the part that filled it and who placed it), the CO₂ gauge on a game scale,
// and this player's part card. Reads the simulation only. Calm, respectful presentation.
import { fmt } from '../../data/format';
import { Canvas2D, clamp, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { CO2_DEADLINE, CO2_START, CORRECT_SLOT, PARTS, SLOTS, type Mg19Sim } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg19ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg19Frame {
  timeMs: number;
  active: boolean;
  drag?: { dx: number; dy: number } | null;
  hover?: number | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

/** Procedural part icons (no external assets). */
export function partIcon(ctx: CanvasRenderingContext2D, part: number, cx: number, cy: number, s: number, ink: string) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  switch (PARTS[part]) {
    case 'hose': {
      ctx.strokeStyle = '#8fa6b4';
      ctx.lineWidth = s * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.45, cy + s * 0.25);
      ctx.bezierCurveTo(cx - s * 0.2, cy - s * 0.5, cx + s * 0.2, cy + s * 0.5, cx + s * 0.45, cy - s * 0.25);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30, 45, 55, 0.5)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const tt = i / 8;
        const x = cx - s * 0.45 + s * 0.9 * tt;
        ctx.beginPath();
        ctx.moveTo(x, cy - s * 0.12);
        ctx.lineTo(x, cy + s * 0.12);
        ctx.stroke();
      }
      break;
    }
    case 'tape': {
      ctx.fillStyle = '#b9c0c4';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a646b';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9aa3a8';
      ctx.fillRect(cx + s * 0.25, cy + s * 0.1, s * 0.3, s * 0.14);
      break;
    }
    case 'card': {
      ctx.fillStyle = '#d9cfb3';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.2, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.35, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.35, cy + s * 0.45);
      ctx.lineTo(cx - s * 0.35, cy + s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 70, 50, 0.6)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.25, cy - s * 0.2 + i * s * 0.16);
        ctx.lineTo(cx + s * 0.25, cy - s * 0.2 + i * s * 0.16);
        ctx.stroke();
      }
      break;
    }
    case 'bag': {
      ctx.fillStyle = 'rgba(200, 225, 235, 0.75)';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.3, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.42, cy + s * 0.42);
      ctx.lineTo(cx - s * 0.42, cy + s * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8eef0';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.3, cy - s * 0.3);
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = '#c7b8d8';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.16, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.16, cy + s * 0.12);
      ctx.quadraticCurveTo(cx + s * 0.45, cy + s * 0.18, cx + s * 0.42, cy + s * 0.38);
      ctx.lineTo(cx - s * 0.05, cy + s * 0.42);
      ctx.quadraticCurveTo(cx - s * 0.2, cy + s * 0.4, cx - s * 0.12, cy + s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#9e8fb3';
      ctx.fillRect(cx - s * 0.12, cy - s * 0.45, s * 0.28, s * 0.1);
    }
  }
  ctx.restore();
}

export class Mg19View {
  readonly c: Canvas2D;
  private sim: Mg19Sim;
  private readonly opts: Mg19ViewOptions;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private diagram: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Slot drop zones (CSS px), by slot index. */
  readonly slotRects: Rect[] = [];
  /** Resting rectangle of this player's part card. */
  card: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly topL: KeyedLayer;
  private readonly diagL: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg19Sim, opts: Mg19ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.topL = new KeyedLayer(this.c);
    this.diagL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg19Sim) {
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
    this.topL.invalidate();
    this.diagL.invalidate();
    this.slotRects.length = 0;
    const compact = this.opts.compact;
    const pad = compact ? 6 : 12;
    let top = pad;
    let bottom = H - pad;
    if (!compact) {
      const u = Math.min(c.u, 1.4);
      const hudH = Math.round(64 * u);
      const stripH = Math.round(40 * u);
      const hintH = Math.round(28 * Math.min(c.u, 1.5));
      this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
      this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
      this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
      top = this.strip.y + stripH + 10;
      bottom = this.hintR.y - 8;
    }
    const cardH = compact ? Math.round(H * 0.28) : Math.max(84, Math.round(96 * Math.min(c.u, 1.3)));
    const cardW = Math.min(W - pad * 2, compact ? W * 0.4 : 260);
    this.card = { x: (W - cardW) / 2, y: bottom - cardH, w: cardW, h: cardH };
    this.diagram = { x: pad, y: top, w: W - pad * 2, h: this.card.y - 12 - top };
    // Slots: cover at the filter face, then seal, stiffener, funnel, connector towards the socket,
    // in two staggered rows so labels have room on a narrow phone.
    const d = this.diagram;
    const head = compact ? d.h * 0.08 : Math.min(d.h * 0.3, c.px(96, 1.3));
    const innerTop = d.y + head;
    const rowH = (d.y + d.h - 10 - innerTop) / 2 - 6;
    const sw = (d.w - 24) / 3;
    const pos: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [2, 0],
      [0.5, 1],
      [1.5, 1],
    ];
    for (let i = 0; i < SLOTS.length; i++) {
      const [col, row] = pos[i]!;
      const x = c.rtl ? d.x + d.w - 12 - (col + 1) * sw + 4 : d.x + 12 + col * sw + 4;
      this.slotRects.push({ x, y: innerTop + row * (rowH + 12), w: sw - 8, h: rowH });
    }
  }

  slotAt(x: number, y: number): number | null {
    for (let i = 0; i < this.slotRects.length; i++) {
      const r = this.slotRects[i]!;
      if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4) return i;
    }
    return null;
  }

  private drawDiagram(hover: number | null) {
    const { c, sim, opts } = this;
    const key = `${sim.filled.join()}|${sim.filledBy.join()}|${hover}|${sim.config.oneButton ? sim.highlight : -1}|${sim.lockout > 0 ? sim.lastWrongSlot : -1}|${sim.complete}`;
    const d = this.diagram;
    this.diagL.blit({ x: d.x - 2, y: d.y - 2, w: d.w + 4, h: d.h + 4 }, key, () => {
      const ctx = c.ctx;
      const { pal } = c;
      const t = opts.t;
      c.panel(d, 12);
      if (!opts.compact) {
        // Square filter on one side, round socket on the other, the adapter body between.
        const midY = d.y + c.px(42, 1.3);
        const fx = c.rtl ? d.x + d.w - 46 : d.x + 16;
        const sx = c.rtl ? d.x + 46 : d.x + d.w - 16;
        ctx.fillStyle = '#c3ccd3';
        ctx.fillRect(Math.min(fx, fx + (c.rtl ? 0 : 30)) - (c.rtl ? 0 : 0), midY - 15, 30, 30);
        ctx.strokeStyle = '#7f8b95';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(fx + i * 7.5, midY - 15);
          ctx.lineTo(fx + i * 7.5, midY + 15);
          ctx.stroke();
        }
        ctx.fillStyle = '#7f8b95';
        ctx.beginPath();
        ctx.arc(sx - (c.rtl ? -15 : 15), midY, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a2530';
        ctx.beginPath();
        ctx.arc(sx - (c.rtl ? -15 : 15), midY, 8, 0, Math.PI * 2);
        ctx.fill();
        // Adapter body (fills with the crew's colour as slots fill).
        const n = sim.filled.filter((p) => p >= 0).length;
        const ax0 = Math.min(fx + 36, sx - 36);
        const ax1 = Math.max(fx + 36, sx - 36);
        const grad = ctx.createLinearGradient(ax0, 0, ax1, 0);
        grad.addColorStop(0, withAlpha(pal.accent, 0.15 + 0.1 * n));
        grad.addColorStop(1, withAlpha(pal.accent, 0.08 + 0.08 * n));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(ax0, midY - 14);
        ctx.lineTo(ax1, midY - 8);
        ctx.lineTo(ax1, midY + 8);
        ctx.lineTo(ax0, midY + 14);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sim.complete ? pal.good : pal.lineStrong;
        ctx.lineWidth = sim.complete ? 2 : 1;
        ctx.setLineDash(sim.complete ? [] : [5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        c.text(t(sim.complete ? 'minigame.MG-19.diagram.complete' : 'minigame.MG-19.diagram.title', { n, total: SLOTS.length }), d.x + d.w / 2, midY + c.px(26, 1.3), d.w - 40, c.px(11.5, 1.25), 800, sim.complete ? pal.good : pal.dim, 'center');
        c.text(t('minigame.MG-19.diagram.square'), fx + (c.rtl ? 15 : 15), midY - 24, 80, c.px(9.5, 1.2), 700, pal.faint, 'center');
        c.text(t('minigame.MG-19.diagram.round'), sx - (c.rtl ? -15 : 15), midY - 24, 80, c.px(9.5, 1.2), 700, pal.faint, 'center');
      }
      for (let i = 0; i < SLOTS.length; i++) {
        const r = this.slotRects[i]!;
        const p = sim.filled[i]!;
        const by = sim.filledBy[i];
        const hi = hover === i || (sim.config.oneButton && sim.highlight === i && !sim.placed);
        const wrongNow = sim.lockout > 0 && sim.lastWrongSlot === i;
        pathRoundRect(ctx, r, 10);
        ctx.fillStyle = p >= 0 ? withAlpha(by === 'you' ? pal.good : pal.accent, 0.16) : hi ? withAlpha(pal.accent, 0.24) : pal.bg1;
        ctx.fill();
        if (wrongNow) c.statusBorder(r, 'bad', 10, 2);
        else if (p >= 0 && by === 'you') c.statusBorder(r, 'good', 10, 2);
        else {
          pathRoundRect(ctx, r, 10);
          ctx.lineWidth = hi ? 3 : 1.5;
          ctx.setLineDash(p >= 0 ? [] : [6, 4]);
          ctx.strokeStyle = hi ? pal.accentStrong : p >= 0 ? pal.accent : pal.lineStrong;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const iconS = Math.min(r.h * 0.42, r.w * 0.4, 40);
        if (p >= 0) partIcon(ctx, p, r.x + r.w / 2, r.y + r.h * 0.4, iconS, pal.text);
        else {
          ctx.strokeStyle = withAlpha(pal.dim, 0.5);
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(r.x + r.w / 2 - iconS / 2, r.y + r.h * 0.4 - iconS / 2, iconS, iconS);
          ctx.setLineDash([]);
        }
        if (!opts.compact) {
          c.text(t(`minigame.MG-19.slot.${SLOTS[i]}`), r.x + r.w / 2, r.y + r.h * 0.8, r.w - 8, c.px(11, 1.2), 800, pal.text, 'center');
          if (p >= 0) c.text(t(by === 'you' ? 'minigame.MG-19.tag.you' : 'minigame.MG-19.tag.crew'), r.x + r.w / 2, r.y + 10, r.w - 8, c.px(9, 1.2), 800, by === 'you' ? pal.good : pal.dim, 'center');
        }
      }
    });
  }

  draw(f: Mg19Frame) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    c.begin();
    this.drawDiagram(f.hover ?? null);
    // Part card (or its empty place once placed).
    const part = sim.config.part;
    if (!sim.placed) {
      const d = f.drag ?? { dx: 0, dy: 0 };
      const r = { x: this.card.x + d.dx, y: this.card.y + d.dy, w: this.card.w, h: this.card.h };
      ctx.save();
      if (!opts.compact) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;
      }
      pathRoundRect(ctx, r, 14);
      ctx.fillStyle = pal.bg3;
      ctx.fill();
      ctx.restore();
      pathRoundRect(ctx, r, 14);
      ctx.lineWidth = 2;
      ctx.strokeStyle = sim.lockout > 0 ? pal.warn : pal.accent;
      if (sim.lockout > 0) ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      const iconS = Math.min(r.h * 0.6, 56);
      const ix = c.rtl ? r.x + r.w - 16 - iconS / 2 : r.x + 16 + iconS / 2;
      partIcon(ctx, part, ix, r.y + r.h / 2, iconS, pal.text);
      if (!opts.compact) {
        const tx = c.rtl ? r.x + r.w - 28 - iconS : r.x + 28 + iconS;
        const tw = r.w - iconS - 40;
        c.text(t('minigame.MG-19.card.your'), tx, r.y + r.h * 0.3, tw, c.px(10.5, 1.2), 700, pal.dim, c.rtl ? 'right' : 'left');
        c.text(t(`minigame.MG-19.part.${PARTS[part]}`), tx, r.y + r.h * 0.58, tw, c.px(19, 1.3), 900, pal.text, c.rtl ? 'right' : 'left');
        if (sim.lockout > 0) c.text(t('minigame.MG-19.card.locked', { s: fmt(sim.lockout / 120, 1, 1) }), tx, r.y + r.h * 0.82, tw, c.px(11, 1.2), 700, pal.warn, c.rtl ? 'right' : 'left');
      }
    }
    else if (!opts.compact) {
      // Placed: the tray keeps a calm confirmation instead of an empty hole.
      const r = this.card;
      pathRoundRect(ctx, r, 14);
      ctx.fillStyle = pal.bg1;
      ctx.fill();
      c.statusBorder(r, 'good', 14, 2);
      c.statusIcon('good', c.rtl ? r.x + r.w - 30 : r.x + 30, r.y + r.h / 2, 26);
      c.text(t('minigame.MG-19.card.placed', { part: t(`minigame.MG-19.part.${PARTS[part]}`) }), c.rtl ? r.x + r.w - 54 : r.x + 54, r.y + r.h / 2, r.w - 66, c.px(14, 1.3), 800, pal.text, c.rtl ? 'right' : 'left');
    }
    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }
    const co2 = sim.hostCo2 ?? sim.co2;
    const [st, key] = this.status();
    const topKey = `${fmt(co2, 1)}|${key}|${st}|${sim.placed}`;
    this.topL.blit({ x: 0, y: 0, w: c.W, h: this.strip.y + this.strip.h + 2 }, topKey, () => {
      const gap = 8;
      const tw = (this.hud.w - gap) / 2;
      const A: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
      const B: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
      const [first, second] = c.rtl ? [B, A] : [A, B];
      c.readout(first, t('minigame.MG-19.hud.part'), t(`minigame.MG-19.part.${PARTS[part]}`), '', sim.placed ? pal.good : pal.text, sim.placed ? 'good' : undefined);
      const f2 = clamp((co2 - CO2_START) / (CO2_DEADLINE - CO2_START), 0, 1);
      const cs: Status = f2 < 0.6 ? 'good' : f2 < 0.85 ? 'warn' : 'bad';
      c.readout(second, t('minigame.MG-19.hud.co2'), fmt(co2, 1, 1), '%', c.statusColor(cs), cs);
      c.meter({ x: second.x + 10, y: second.y + second.h - 7, w: second.w - 20, h: 4 }, f2, null, cs === 'good' ? 'good' : cs);
      if (st === 'info') {
        c.roundRect(this.strip, 10);
        c.ctx.fillStyle = pal.bg1;
        c.ctx.fill();
        c.roundRect(this.strip, 10);
        c.ctx.strokeStyle = pal.accent;
        c.ctx.lineWidth = 1.5;
        c.ctx.stroke();
        c.text(t(key), this.strip.x + this.strip.w / 2, this.strip.y + this.strip.h / 2 + 1, this.strip.w - 24, c.px(15, 1.5), 800, pal.text, 'center');
      } else c.statusStrip(this.strip, st, t(key));
    });
    c.hint(this.hintR, t(sim.config.oneButton ? 'minigame.MG-19.hint.press' : 'minigame.MG-19.hint.drag'), f.active);
    if (f.pausedText) c.overlay(f.pausedText);
  }

  status(): [Status | 'info', string] {
    const sim = this.sim;
    if (sim.placed) return ['good', sim.complete ? 'minigame.MG-19.status.complete' : 'minigame.MG-19.status.placed'];
    if (sim.lockout > 0) return ['warn', 'minigame.MG-19.status.wrong'];
    return ['info', 'minigame.MG-19.status.find'];
  }

  /** The correct slot of this player's part (for the demo). */
  correctRect(): Rect {
    return this.slotRects[CORRECT_SLOT[this.sim.config.part]!]!;
  }
}
