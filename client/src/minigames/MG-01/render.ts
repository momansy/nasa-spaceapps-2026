// MG-01 drawing: value cards (glass tiles with the quantity, the imperial value and a small
// vector icon) descend a data conveyor toward a Sunlight "upload" line; three SI lanes wait
// under it. Theme tokens only; DPR ≤ 2; status = colour + shape + label + border.
import { Canvas2D, clamp, KeyedLayer, smooth, withAlpha, type Rect, type Status } from '../MG-02/kit';
import { IMPERIAL_UNIT, SI_UNIT, type Kind, type Mg01Sim } from './model';

export interface Mg01ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export interface Mg01DrawState {
  timeMs: number;
  /** Drag offset of the front card, CSS px. */
  drag?: { dx: number; dy: number } | null;
  /** Lane the drag points at (highlighted), or −1. */
  aim?: number;
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

const K = 'minigame.MG-01.';
const LETTERS = ['A', 'B', 'C'];
const FEEDBACK_S = 1.1;
/** How long the sorted lane keeps its status border before the next card's values show, s. */
const LANE_FEEDBACK_S = 0.4;

function c2clip(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
}

export class Mg01View {
  readonly c: Canvas2D;
  private sim: Mg01Sim;
  private readonly o: Mg01ViewOptions;
  private hud!: Rect[];
  track!: Rect;
  lanes!: Rect[];
  private hintR: Rect | null = null;
  uploadY = 0;
  cardW = 0;
  cardH = 0;
  private hudLayer: KeyedLayer;
  private laneLayer: KeyedLayer;
  private trackLayer: KeyedLayer;
  private faces = new Map<number, HTMLCanvasElement>();
  private faceKey = '';

  constructor(canvas: HTMLCanvasElement, sim: Mg01Sim, o: Mg01ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.hudLayer = new KeyedLayer(this.c);
    this.laneLayer = new KeyedLayer(this.c);
    this.trackLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg01Sim) {
    this.sim = sim;
    this.faces.clear();
    this.layout();
  }

  resize() {
    this.c.measure();
    this.faces.clear();
    this.layout();
  }

  private layout() {
    const { W, H } = this.c;
    const c = this.c;
    const compact = this.o.compact;
    const pad = compact ? 8 : 14;
    const s = Math.min(c.u, 1.3);
    let y = pad;
    if (!compact) {
      const readH = Math.round(70 * s);
      const gap = 8;
      const rw = (W - pad * 2 - gap * 2) / 3;
      this.hud = [0, 1, 2].map((i) => ({ x: pad + i * (rw + gap), y, w: rw, h: readH }));
      if (c.rtl) this.hud.reverse();
      y += readH + 10;
    } else this.hud = [];
    const hintH = compact ? 0 : Math.round(30 * s);
    const laneH = compact ? Math.min(64, H * 0.3) : Math.round(clamp(H * 0.15, 96, 132));
    const laneY = H - pad - hintH - laneH;
    const gap = compact ? 6 : 8;
    const lw = (W - pad * 2 - gap * 2) / 3;
    this.lanes = [0, 1, 2].map((i) => ({ x: pad + i * (lw + gap), y: laneY, w: lw, h: laneH }));
    this.track = { x: pad, y, w: W - pad * 2, h: laneY - 10 - y };
    this.uploadY = this.track.y + this.track.h - (compact ? 6 : 10);
    this.hintR = compact ? null : { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
    this.cardW = Math.min(this.track.w * (compact ? 0.56 : 0.7), compact ? 200 : 290);
    this.cardH = compact ? Math.min(54, this.track.h * 0.42) : Math.round(clamp(78 * s, 72, 104));
  }

  /** Lane under a point, or −1. */
  laneAt(x: number, y: number): number {
    for (let i = 0; i < 3; i++) {
      const r = this.lanes[i]!;
      if (x >= r.x && x <= r.x + r.w && y >= r.y - 6 && y <= r.y + r.h + 6) return i;
    }
    return -1;
  }

  /** Lane a drag of (dx, dy) points at, or −1 (too small). */
  laneForDrag(dx: number, dy: number): number {
    const side = this.track.w / 7;
    if (dx < -side) return 0;
    if (dx > side) return 2;
    if (dy > Math.max(36, this.cardH * 0.5)) return 1;
    return -1;
  }

  /** Centre of card `i` at its fall position (without drag). */
  cardPos(i: number): { x: number; y: number } {
    const p = this.sim.progress(i);
    const top = this.track.y + 8;
    const bottom = this.uploadY - this.cardH / 2 - 4;
    return { x: this.track.x + this.track.w / 2, y: top + this.cardH / 2 + p * (bottom - top - this.cardH / 2) };
  }

  laneCentre(lane: number): { x: number; y: number } {
    const r = this.lanes[lane]!;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  draw(st: Mg01DrawState) {
    const c = this.c;
    c.begin();
    c.backdrop(0.85);
    if (!this.o.compact) this.drawHud();
    this.drawTrack();
    this.drawLanes(st.aim ?? -1);
    this.drawCards(st.drag ?? null);
    this.drawFeedback();
    if (this.hintR) {
      const t = this.o.t;
      c.hint(this.hintR, t(this.sim.config.oneButton ? K + 'hint.one' : K + 'hint.swipe'), !!st.drag);
    }
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private drawHud() {
    const sim = this.sim;
    const c = this.c;
    const t = this.o.t;
    const left = sim.deck.length - sim.resolved;
    const key = `${sim.correct}|${sim.wrong}|${left}|${c.W}`;
    const r0 = this.hud[0]!;
    this.hudLayer.blit({ x: 0, y: r0.y - 6, w: c.W, h: r0.h + 26 }, key, () => {
      const cfg = sim.config;
      const okS: Status = sim.correct >= cfg.correctMin ? 'good' : 'warn';
      const wrongS: Status = sim.wrong > cfg.wrongMax ? 'bad' : sim.wrong === cfg.wrongMax && sim.wrong > 0 ? 'warn' : 'good';
      c.readout(this.hud[0]!, t(K + 'hud.correct', { n: cfg.correctMin }), String(sim.correct), t(K + 'unit.cards'), sim.correct >= cfg.correctMin ? c.pal.good : c.pal.text, okS);
      c.readout(this.hud[1]!, t(K + 'hud.wrong', { n: cfg.wrongMax }), String(sim.wrong), t(K + 'unit.cards'), sim.wrong > cfg.wrongMax ? c.pal.bad : c.pal.text, wrongS);
      c.readout(this.hud[2]!, t(K + 'hud.left'), String(left), t(K + 'unit.cards'), c.pal.text);
    });
  }

  private drawTrack() {
    const c = this.c;
    const r = this.track;
    const t = this.o.t;
    this.trackLayer.blit({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 14 }, `${r.w}x${r.h}|${c.rtl}`, () => {
      const ctx = c.ctx;
      // Conveyor: a recessed glass channel with faint rails and chevrons toward the line.
      c.roundRect(r, 18);
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, 'rgba(8, 22, 36, 0.55)');
      g.addColorStop(1, 'rgba(17, 43, 64, 0.75)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(150, 205, 228, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const cx = r.x + r.w / 2;
      const railW = this.cardW / 2 + 14;
      ctx.strokeStyle = 'rgba(150, 205, 228, 0.1)';
      ctx.beginPath();
      ctx.moveTo(cx - railW, r.y + 10);
      ctx.lineTo(cx - railW, this.uploadY - 6);
      ctx.moveTo(cx + railW, r.y + 10);
      ctx.lineTo(cx + railW, this.uploadY - 6);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(c.pal.accent, 0.12);
      ctx.lineWidth = 2;
      for (let y = r.y + 26; y < this.uploadY - 20; y += 34) {
        ctx.beginPath();
        ctx.moveTo(cx - railW - 18, y);
        ctx.lineTo(cx - railW - 10, y + 6);
        ctx.lineTo(cx - railW - 18, y + 12);
        ctx.moveTo(cx + railW + 18, y);
        ctx.lineTo(cx + railW + 10, y + 6);
        ctx.lineTo(cx + railW + 18, y + 12);
        ctx.stroke();
      }
      // Upload line: Sunlight dashes with a label chip and an uplink glyph.
      const uy = this.uploadY;
      ctx.save();
      ctx.strokeStyle = c.pal.sun;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(r.x + 10, uy);
      ctx.lineTo(r.x + r.w - 10, uy);
      ctx.stroke();
      ctx.restore();
      if (!this.o.compact) {
        const px = c.px(12, 1.25);
        const label = t(K + 'upload');
        ctx.font = c.font(px, 600);
        const w = ctx.measureText(label).width + px * 2.8;
        const chip = { x: c.rtl ? r.x + 14 : r.x + r.w - 14 - w, y: uy - px * 0.95, w, h: px * 1.9 };
        c.roundRect(chip, chip.h / 2);
        ctx.fillStyle = c.pal.bg1;
        ctx.fill();
        ctx.strokeStyle = c.pal.sun;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Uplink glyph: a small dish with two arcs.
        const gx = chip.x + px * 1.0;
        const gy = chip.y + chip.h / 2 + 2;
        ctx.strokeStyle = c.pal.sun;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(gx, gy, px * 0.32, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(gx, gy, px * 0.58, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        c.text(label, chip.x + px * 1.7, chip.y + chip.h / 2 + 1, w, px, 600, c.pal.sun, 'left');
      }
    });
  }

  private drawLanes(aim: number) {
    const sim = this.sim;
    const c = this.c;
    const active = sim.active;
    const card = active >= 0 ? sim.deck[active]! : null;
    const hi = sim.highlight();
    const fb = sim.last && sim.timeS - sim.last.atS < LANE_FEEDBACK_S && sim.last.lane >= 0 ? sim.last : null;
    // While feedback shows, the lanes keep the sorted card's values.
    const shown = fb ? sim.deck[fb.card]! : card;
    const key = `${shown?.index ?? -1}|${aim}|${hi}|${fb ? fb.card * 10 + fb.lane : -1}|${this.lanes[0]!.w}`;
    const r0 = this.lanes[0]!;
    this.laneLayer.blit({ x: 0, y: r0.y - 8, w: c.W, h: r0.h + 16 }, key, () => {
      const ctx = c.ctx;
      for (let i = 0; i < 3; i++) {
        const r = this.lanes[i]!;
        const isAim = i === aim || i === hi;
        c.glass(r, 14, isAim);
        if (isAim) {
          c.roundRect(r, 14);
          ctx.fillStyle = withAlpha(c.pal.accent, 0.14);
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = c.pal.accent;
          c.roundRect({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 13);
          ctx.stroke();
        }
        if (fb && fb.lane === i) {
          const s: Status = fb.kind === 'correct' ? 'good' : 'bad';
          c.statusBorder({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, s, 13, 2.5);
        }
        // Letter badge (keys 1 / 2 / 3 and screen readers say A / B / C).
        const bs = this.o.compact ? 16 : c.px(20, 1.2);
        const bx = r.x + 8;
        const by = r.y + 8;
        c.roundRect({ x: bx, y: by, w: bs, h: bs }, 5);
        ctx.fillStyle = isAim ? c.pal.accent : withAlpha(c.pal.ceramic, 0.12);
        ctx.fill();
        c.text(LETTERS[i]!, bx + bs / 2, by + bs / 2 + 1, bs, bs * 0.62, 700, isAim ? c.pal.ink : c.pal.dim, 'center');
        if (fb && fb.lane === i) c.statusIcon(fb.kind === 'correct' ? 'good' : 'bad', r.x + r.w - 8 - bs / 2, by + bs / 2, bs);
        if (shown) {
          const unit = SI_UNIT[shown.kind];
          const num = shown.options[i]!;
          const px = this.o.compact ? 17 : c.px(22, 1.3);
          c.numberWithUnit(num, unit, r.x + r.w / 2, r.y + r.h * (this.o.compact ? 0.78 : 0.68), r.w - 14, px, c.pal.text, 'center');
        } else {
          ctx.fillStyle = withAlpha(c.pal.ceramic, 0.08);
          c.roundRect({ x: r.x + r.w * 0.2, y: r.y + r.h * 0.55, w: r.w * 0.6, h: 10 }, 5);
          ctx.fill();
        }
      }
    });
  }

  /** Small vector icon per quantity: engine bell (force), altitude ruler (length), gauge (pressure). */
  private kindIcon(ctx: CanvasRenderingContext2D, kind: Kind, x: number, y: number, s: number) {
    const pal = this.c.pal;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.accent;
    ctx.fillStyle = withAlpha(pal.accent, 0.18);
    if (kind === 0) {
      ctx.beginPath();
      ctx.rect(-s * 0.18, -s * 0.5, s * 0.36, s * 0.28);
      ctx.moveTo(-s * 0.14, -s * 0.22);
      ctx.quadraticCurveTo(-s * 0.2, s * 0.15, -s * 0.42, s * 0.42);
      ctx.lineTo(s * 0.42, s * 0.42);
      ctx.quadraticCurveTo(s * 0.2, s * 0.15, s * 0.14, -s * 0.22);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 1) {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(0, s * 0.5);
      for (let k = 0; k <= 4; k++) {
        const yy = -s * 0.5 + (k * s) / 4;
        ctx.moveTo(0, yy);
        ctx.lineTo(k % 2 === 0 ? s * 0.32 : s * 0.18, yy);
      }
      ctx.moveTo(-s * 0.3, -s * 0.28);
      ctx.lineTo(-s * 0.14, -s * 0.46);
      ctx.lineTo(0.01, -s * 0.28);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, Math.PI * 0.8, Math.PI * 2.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.24, -s * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Card face, cached per card (it never changes during a run). */
  private face(i: number): HTMLCanvasElement | null {
    const c = this.c;
    const key = `${this.cardW}x${this.cardH}@${c.dpr}|${c.u}|${c.rtl}`;
    if (key !== this.faceKey) {
      this.faces.clear();
      this.faceKey = key;
    }
    let f = this.faces.get(i);
    if (f) return f;
    const pad = 18;
    f = document.createElement('canvas');
    f.width = Math.ceil((this.cardW + pad * 2) * c.dpr);
    f.height = Math.ceil((this.cardH + pad * 2) * c.dpr);
    const ctx = f.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(c.dpr, 0, 0, c.dpr, pad * c.dpr, pad * c.dpr);
    ctx.direction = c.rtl ? 'rtl' : 'ltr';
    const saved = c.ctx;
    c.ctx = ctx;
    try {
      const card = this.sim.deck[i]!;
      const r = { x: 0, y: 0, w: this.cardW, h: this.cardH };
      c.glass(r, 14, true);
      // Ceramic top edge, like a part tag.
      ctx.fillStyle = withAlpha(c.pal.ceramic, 0.85);
      c.roundRect({ x: 14, y: 0, w: r.w - 28, h: 3 }, 1.5);
      ctx.fill();
      const t = this.o.t;
      const compact = this.o.compact;
      const iconS = compact ? 20 : Math.min(30, r.h * 0.36);
      const pi = 12;
      const ix = c.rtl ? r.x + pi + iconS / 2 : r.x + r.w - pi - iconS / 2;
      this.kindIcon(ctx, card.kind, ix, r.y + r.h / 2, iconS);
      const textR = { x: c.rtl ? r.x + iconS + pi * 2 : r.x + pi, y: r.y, w: r.w - iconS - pi * 3, h: r.h };
      const labelPx = compact ? 10.5 : c.px(12.5, 1.25);
      if (!compact || r.h > 46) c.textStart(t(K + 'kind.' + card.kind), textR, r.y + 10 + labelPx * 0.6, labelPx, 600, c.pal.dim);
      const num = (() => {
        const s = String(card.value);
        return card.value >= 10000 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : s;
      })();
      const valPx = compact ? 19 : c.px(27, 1.3);
      const baseY = r.y + r.h - (compact ? 10 : 13);
      if (c.rtl) c.numberWithUnit(num, IMPERIAL_UNIT[card.kind], textR.x + textR.w, baseY, textR.w, valPx, c.pal.text, 'right', 650);
      else c.numberWithUnit(num, IMPERIAL_UNIT[card.kind], textR.x, baseY, textR.w, valPx, c.pal.text, 'left', 650);
    } finally {
      c.ctx = saved;
    }
    this.faces.set(i, f);
    return f;
  }

  private blitCard(i: number, x: number, y: number, scale: number, alpha: number, ring: boolean) {
    const c = this.c;
    const ctx = c.ctx;
    const f = this.face(i);
    const pad = 18;
    const w = (this.cardW + pad * 2) * scale;
    const h = (this.cardH + pad * 2) * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (f) ctx.drawImage(f, x - w / 2, y - h / 2, w, h);
    ctx.restore();
    if (ring) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c.pal.accent;
      ctx.lineWidth = 2;
      c.roundRect({ x: x - (this.cardW * scale) / 2 - 1, y: y - (this.cardH * scale) / 2 - 1, w: this.cardW * scale + 2, h: this.cardH * scale + 2 }, 15);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCards(drag: { dx: number; dy: number } | null) {
    const sim = this.sim;
    const active = sim.active;
    const t = sim.timeS;
    const ctx = this.c.ctx;
    // The next card slides in at the top of the conveyor during the second before it goes live.
    if (!sim.config.oneButton) {
      const next = sim.state.indexOf('waiting');
      if (next >= 0) {
        const dt = sim.deck[next]!.spawnS - t;
        if (dt < 1) {
          const top = this.cardPos(next);
          ctx.save();
          c2clip(ctx, this.track);
          this.blitCard(next, top.x, top.y - 16 * dt, 0.88, 0.5 * (1 - dt), false);
          ctx.restore();
        }
      }
    }
    // Live cards behind the front one: smaller and dimmer, drawn first.
    for (let i = sim.deck.length - 1; i >= 0; i--) {
      if (sim.state[i] !== 'live' || i === active) continue;
      const p = this.cardPos(i);
      this.blitCard(i, p.x, p.y, 0.88, 0.7, false);
    }
    // Recently resolved card: flies into its lane (or slides over the line when missed).
    const last = sim.last;
    if (last && t - last.atS < 0.32) {
      const k = this.o.reducedMotion ? 1 : smooth((t - last.atS) / 0.32);
      const from = { x: this.track.x + this.track.w / 2, y: Math.min(this.uploadY - this.cardH / 2, this.cardPos(last.card).y) };
      const to = last.lane >= 0 ? this.laneCentre(last.lane) : { x: from.x, y: this.uploadY + this.cardH * 0.4 };
      this.blitCard(last.card, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, 1 - 0.45 * k, 1 - k, false);
    }
    if (active >= 0) {
      const p = this.cardPos(active);
      const dx = drag?.dx ?? 0;
      const dy = Math.max(0, drag?.dy ?? 0);
      this.blitCard(active, p.x + dx, Math.min(p.y + dy, this.uploadY + this.cardH * 0.3), 1, 1, true);
    }
  }

  private drawFeedback() {
    const sim = this.sim;
    const last = sim.last;
    if (!last || sim.done || sim.timeS - last.atS > FEEDBACK_S || this.o.compact) return;
    const c = this.c;
    const t = this.o.t;
    const s: Status = last.kind === 'correct' ? 'good' : 'bad';
    const label = t(K + 'feedback.' + last.kind);
    const px = c.px(14, 1.3);
    c.ctx.font = c.font(px, 600);
    const w = Math.min(this.track.w - 20, c.ctx.measureText(label).width + px * 4);
    const h = Math.round(px * 2.6);
    const r = { x: this.track.x + (this.track.w - w) / 2, y: this.track.y + 10, w, h };
    const a = this.o.reducedMotion ? 1 : clamp((FEEDBACK_S - (sim.timeS - last.atS)) / 0.25, 0, 1);
    c.ctx.save();
    c.ctx.globalAlpha = a;
    c.statusStrip(r, s, label);
    c.ctx.restore();
  }
}
