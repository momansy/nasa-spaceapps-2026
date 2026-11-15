// MG-29 drawing: question card, choosing-time bar with the fast-bonus marker, the animation
// stage and the answer buttons; after the animation the verdict and the one-line principle.
import { Canvas2D, clamp, fmt, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-02/kit';
import type { Mg29Sim } from './model';
import { SCENES, type SceneCtx } from './scenes';

export interface Mg29ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export interface Mg29DrawState {
  timeMs: number;
  /** Keyboard focus (answer index) or −1. */
  focus?: number;
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

const K = 'minigame.MG-29.';
const LETTERS = ['A', 'B', 'C'];
/** The verdict shows from this point of the animation. */
const REVEAL_K = 0.74;

/** Splits `text` into lines that fit `maxW` in the context's current font. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class Mg29View {
  readonly c: Canvas2D;
  private sim: Mg29Sim;
  private readonly o: Mg29ViewOptions;
  private qR!: Rect;
  private barR!: Rect | null;
  stage!: Rect;
  buttons: Rect[] = [];
  private hintR: Rect | null = null;
  private qPx = 17;
  private qLines: string[] = [];
  /** Slot of the verdict card (replaces the question and the timer bar after the reveal), never over the stage (T038). */
  private verdictR: Rect | null = null;
  private whyLines: string[] = [];
  private whyPx = 13.5;
  private stripH = 40;
  private qLayer: KeyedLayer;
  private btnLayer: KeyedLayer;
  private verdictLayer: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg29Sim, o: Mg29ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.qLayer = new KeyedLayer(this.c);
    this.btnLayer = new KeyedLayer(this.c);
    this.verdictLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg29Sim) {
    this.sim = sim;
    this.layout();
    this.qLayer.invalidate();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  private layout() {
    const { W, H } = this.c;
    const c = this.c;
    const compact = this.o.compact;
    const pad = compact ? 8 : 14;
    const n = this.sim.q.choices;
    const s = Math.min(c.u, 1.35);
    if (compact) {
      const bh = Math.max(22, Math.min(30, (H - pad * 2) * 0.15));
      const gap = 4;
      const bTop = H - pad - n * bh - (n - 1) * gap;
      this.buttons = Array.from({ length: n }, (_, i) => ({ x: pad, y: bTop + i * (bh + gap), w: W - pad * 2, h: bh }));
      this.qR = { x: pad, y: pad, w: 0, h: 0 };
      this.barR = null;
      this.stage = { x: pad, y: pad, w: W - pad * 2, h: bTop - 6 - pad };
      this.hintR = null;
      this.verdictR = null;
      return;
    }
    // Question card: wrapped text, at most 5 lines.
    this.qPx = c.px(17, 1.35);
    c.ctx.font = c.font(this.qPx, 600);
    this.qLines = wrap(c.ctx, this.o.t(`${K}q.${this.sim.q.id}.text`), W - pad * 2 - 32).slice(0, 5);
    const qH = Math.round(this.qLines.length * this.qPx * 1.32 + 30);
    this.qR = { x: pad, y: pad, w: W - pad * 2, h: qH };
    let y = pad + qH + 10;
    const barH = Math.round(40 * Math.min(s, 1.25));
    this.barR = { x: pad, y, w: W - pad * 2, h: barH };
    y += barH + 10;
    // The verdict (strip + explanation) takes the place of the question and the bar once the
    // answer is revealed; if it needs more room than they have, the stage starts lower instead of
    // the verdict covering it.
    this.whyPx = c.px(16, 1.35);
    c.ctx.font = c.font(this.whyPx, 500);
    this.whyLines = wrap(c.ctx, this.o.t(`${K}q.${this.sim.q.id}.why`), W - pad * 2 - 44).slice(0, 4);
    this.stripH = Math.round(40 * Math.min(c.u, 1.3));
    const needed = Math.round(this.stripH + 18 + this.whyLines.length * this.whyPx * 1.35 + 8);
    const slotH = Math.max(needed, y - 10 - pad);
    this.verdictR = { x: pad, y: pad, w: W - pad * 2, h: slotH };
    y = Math.max(y, pad + slotH + 10);
    const hintH = Math.round(28 * s);
    const bh = Math.round(Math.max(56, 50 * s));
    const gap = 8;
    const bTop = H - pad - hintH - n * bh - (n - 1) * gap;
    this.buttons = Array.from({ length: n }, (_, i) => ({ x: pad, y: bTop + i * (bh + gap), w: W - pad * 2, h: bh }));
    this.stage = { x: pad, y, w: W - pad * 2, h: Math.max(120, bTop - 10 - y) };
    this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
  }

  /** Answer under (x, y), or −1. */
  hit(x: number, y: number): number {
    for (let i = 0; i < this.buttons.length; i++) {
      const r = this.buttons[i]!;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  draw(st: Mg29DrawState) {
    const c = this.c;
    c.begin();
    c.backdrop(0.8);
    if (!this.o.compact) {
      if (this.sim.animK >= REVEAL_K) this.drawVerdict();
      else {
        this.drawQuestion();
        this.drawBar();
      }
    }
    this.drawStage();
    this.drawButtons(st.focus ?? -1);
    if (this.hintR) {
      const sim = this.sim;
      const text = sim.phase === 'choose' ? this.o.t(sim.config.oneButton ? K + 'hint.one' : K + 'hint.tap') : this.o.t(K + 'watch');
      c.hint(this.hintR, text, sim.phase !== 'choose');
    }
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private drawQuestion() {
    const c = this.c;
    const r = this.qR;
    this.qLayer.blit({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 26 }, `${this.sim.q.id}|${r.w}x${r.h}|${c.rtl}`, () => {
      c.glass(r, 16, true);
      const ctx = c.ctx;
      // Signal accent bar on the start edge.
      ctx.fillStyle = c.pal.accent;
      const bx = c.rtl ? r.x + r.w - 5 : r.x + 1;
      pathRoundRect(ctx, { x: bx, y: r.y + 12, w: 4, h: r.h - 24 }, 2);
      ctx.fill();
      ctx.font = c.font(this.qPx, 600);
      ctx.fillStyle = c.pal.text;
      ctx.textBaseline = 'middle';
      ctx.textAlign = c.rtl ? 'right' : 'left';
      const x = c.rtl ? r.x + r.w - 18 : r.x + 18;
      this.qLines.forEach((line, i) => ctx.fillText(line, x, r.y + 15 + this.qPx * 0.66 + i * this.qPx * 1.32));
    });
  }

  private drawBar() {
    const c = this.c;
    const r = this.barR!;
    const sim = this.sim;
    const ctx = c.ctx;
    const t = this.o.t;
    const px = c.px(13.5, 1.3);
    const labelY = r.y + px * 0.6;
    const locked = sim.locked >= 0;
    c.textStart(locked ? t(K + 'locked') : sim.phase === 'choose' ? t(K + 'choose') : t(K + 'watch'), r, labelY, px, 600, locked ? c.pal.accentStrong : c.pal.dim);
    // Frozen at the moment of the lock.
    const left = locked ? Math.max(0, sim.config.chooseS - sim.lockedAtS) : sim.chooseLeftS;
    c.ctx.font = c.font(px, 650);
    const num = fmt(left, 1);
    if (c.rtl) c.numberWithUnit(num, 's', r.x, labelY + px * 0.38, 90, px, c.pal.text, 'left');
    else c.numberWithUnit(num, 's', r.x + r.w, labelY + px * 0.38, 90, px, c.pal.text, 'right');
    const bar = { x: r.x, y: r.y + r.h - 12, w: r.w, h: 10 };
    const frac = left / sim.config.chooseS;
    const half = sim.config.perfectFraction;
    const fast = (locked ? sim.lockedAtS : sim.timeS) <= sim.config.chooseS * half + 1e-9;
    const st: Status = sim.phase !== 'choose' ? (locked ? 'good' : 'bad') : fast ? 'good' : 'warn';
    c.bar(bar, frac, 1 - half, st);
    // Fast-bonus tag on the marker.
    const mx = c.rtl ? bar.x + bar.w * half : bar.x + bar.w * (1 - half);
    const tag = t(K + 'fast');
    const tpx = c.px(11, 1.2);
    ctx.font = c.font(tpx, 600);
    const tw = ctx.measureText(tag).width;
    c.text(tag, clamp(mx + (c.rtl ? -tw / 2 - 6 : tw / 2 + 6), r.x + tw / 2, r.x + r.w - tw / 2), labelY, tw + 4, tpx, 600, fast && sim.phase === 'choose' ? c.pal.sun : c.pal.faint, 'center');
  }

  private drawStage() {
    const c = this.c;
    const ctx = c.ctx;
    const r = this.stage;
    const sim = this.sim;
    ctx.save();
    pathRoundRect(ctx, r, 16);
    ctx.clip();
    const g: SceneCtx = {
      ctx,
      pal: c.pal,
      r,
      k: sim.animK,
      animS: sim.config.animS,
      reducedMotion: this.o.reducedMotion,
      t: this.o.t,
      label: (text, x, y, color, align = 'center') => {
        const px = this.o.compact ? 10 : c.px(12, 1.25);
        ctx.font = c.font(px, 600);
        const w = ctx.measureText(text).width + px * 1.3;
        const h = px * 1.8;
        const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
        pathRoundRect(ctx, { x: x0, y: y - h / 2, w, h }, h / 2);
        ctx.fillStyle = 'rgba(3, 10, 18, 0.72)';
        ctx.fill();
        ctx.strokeStyle = withAlpha(color ?? c.pal.text, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = color ?? c.pal.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x0 + w / 2, y + 1);
      },
    };
    SCENES[sim.q.id]?.(g);
    ctx.restore();
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.22)';
    ctx.lineWidth = 1;
    pathRoundRect(ctx, { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 }, 16);
    ctx.stroke();
  }

  private drawVerdict() {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const box = this.verdictR;
    if (!box) return;
    const ok = sim.locked === sim.correctSlot;
    const label = sim.locked < 0 ? t(K + 'result.none') : ok ? t(K + 'result.right') : t(K + 'result.wrong');
    const px = this.whyPx;
    const lines = this.whyLines;
    const stripH = this.stripH;
    this.verdictLayer.blit({ x: box.x - 8, y: box.y - 6, w: box.w + 16, h: box.h + 26 }, `${label}|${box.w}x${box.h}|${box.y}|${sim.q.id}`, () => {
      c.glass(box, 14, true);
      c.statusStrip({ x: box.x + 8, y: box.y + 8, w: box.w - 16, h: stripH }, ok ? 'good' : 'bad', label);
      const ctx = c.ctx;
      ctx.font = c.font(px, 500);
      ctx.fillStyle = c.pal.text;
      ctx.textBaseline = 'middle';
      ctx.textAlign = c.rtl ? 'right' : 'left';
      const x = c.rtl ? box.x + box.w - 14 : box.x + 14;
      // Centre the explanation in the space under the strip.
      const textH = lines.length * px * 1.35;
      const y0 = box.y + stripH + 16 + Math.max(0, (box.h - stripH - 16 - textH) / 2);
      lines.forEach((l, i) => ctx.fillText(l, x, y0 + px * 0.68 + i * px * 1.35));
    });
  }

  private drawButtons(focus: number) {
    const c = this.c;
    const sim = this.sim;
    const hi = sim.highlight();
    const reveal = sim.animK >= REVEAL_K;
    const key = `${sim.q.id}|${sim.locked}|${hi}|${focus}|${reveal}|${this.buttons[0]?.y}|${this.buttons[0]?.w}`;
    const first = this.buttons[0]!;
    const last = this.buttons[this.buttons.length - 1]!;
    this.btnLayer.blit({ x: 0, y: first.y - 8, w: c.W, h: last.y + last.h - first.y + 28 }, key, () => {
      const ctx = c.ctx;
      const compact = this.o.compact;
      for (let i = 0; i < this.buttons.length; i++) {
        const r = this.buttons[i]!;
        const isLocked = sim.locked === i;
        const lit = i === hi || i === focus;
        c.glass(r, compact ? 9 : 14, lit || isLocked);
        if (isLocked) {
          pathRoundRect(ctx, r, compact ? 9 : 14);
          ctx.fillStyle = withAlpha(c.pal.accent, 0.22);
          ctx.fill();
        }
        if (lit || isLocked) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = c.pal.accent;
          pathRoundRect(ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, compact ? 8 : 13);
          ctx.stroke();
        }
        let status: Status | null = null;
        if (reveal && i === sim.correctSlot) status = 'good';
        else if (reveal && isLocked) status = 'bad';
        if (status) c.statusBorder({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, status, compact ? 8 : 13, 2.5);
        const bs = compact ? r.h - 10 : Math.min(r.h - 20, c.px(26, 1.3));
        const bx = c.rtl ? r.x + r.w - 12 - bs : r.x + 12;
        const by = r.y + (r.h - bs) / 2;
        pathRoundRect(ctx, { x: bx, y: by, w: bs, h: bs }, 6);
        ctx.fillStyle = isLocked || lit ? c.pal.accent : withAlpha(c.pal.ceramic, 0.12);
        ctx.fill();
        c.text(LETTERS[i]!, bx + bs / 2, by + bs / 2 + 1, bs, bs * 0.6, 700, isLocked || lit ? c.pal.ink : c.pal.text, 'center');
        const iconS = status ? Math.min(r.h - 18, c.px(22, 1.2)) : 0;
        const textX = c.rtl ? bx - 10 : bx + bs + 10;
        const maxW = r.w - bs - 34 - (iconS ? iconS + 10 : 0);
        c.text(this.o.t(`${K}q.${sim.q.id}.a${sim.order[i]}`), textX, r.y + r.h / 2 + 1, maxW, compact ? 11.5 : c.px(15.5, 1.3), 600, c.pal.text, c.rtl ? 'right' : 'left');
        if (status) c.statusIcon(status, c.rtl ? r.x + 12 + iconS / 2 : r.x + r.w - 12 - iconS / 2, r.y + r.h / 2, iconS);
      }
    });
  }
}
