// MG-04 drawing: the blueprint (white line drawing on drafting blue, with an "up" reference)
// above the part on an anti-static bench mat, then the controls. Parts are drawn without any
// mirror symmetry; a wrong drawing is the mirror image. Theme tokens; DPR ≤ 2.
import { Canvas2D, clamp, KeyedLayer, pathRoundRect, silverGradient, withAlpha, type Rect, type Status } from '../MG-02/kit';
import { GOOD_OUTCOMES, type Mg04Sim, type PartKind } from './model';

export interface Mg04ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export type Mg04Button = 'left' | 'right' | 'match' | 'error';

export interface Mg04DrawState {
  timeMs: number;
  held?: Mg04Button | null;
  focus?: Mg04Button | null;
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

const K = 'minigame.MG-04.';
const FEEDBACK_S = 0.9;

type Style = 'hardware' | 'blueprint';

/** Draws one part centred at (0, 0), half-size `s`, in the given style. Caller rotates / mirrors. */
function drawPart(ctx: CanvasRenderingContext2D, kind: PartKind, s: number, style: Style, accent: string) {
  const bp = style === 'blueprint';
  const line = 'rgba(232, 242, 248, 0.94)';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = bp ? 1.6 : 1;
  const fillBody = (g: CanvasGradient | string) => {
    if (bp) {
      ctx.fillStyle = 'rgba(232, 242, 248, 0.05)';
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.stroke();
    } else {
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 20, 28, 0.6)';
      ctx.stroke();
    }
  };
  const arrowHead = (x: number, y: number, ang: number, size: number, double = false) => {
    for (let k = 0; k < (double ? 2 : 1); k++) {
      const ox = x - Math.cos(ang) * size * 0.7 * k;
      const oy = y - Math.sin(ang) * size * 0.7 * k;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox - Math.cos(ang - 0.5) * size, oy - Math.sin(ang - 0.5) * size);
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox - Math.cos(ang + 0.5) * size, oy - Math.sin(ang + 0.5) * size);
      ctx.stroke();
    }
  };
  const hole = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (bp) {
      ctx.strokeStyle = line;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#0b1218';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 215, 225, 0.6)';
      ctx.stroke();
    }
  };
  const detail = bp ? line : accent;

  if (kind === 'imu') {
    // Mounting tabs at three corners (none at the top right).
    for (const [x, y] of [
      [-0.78, 0.78],
      [0.78, 0.78],
      [-0.78, -0.78],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.2, 0, Math.PI * 2);
      fillBody(silverGradient(ctx, -s, -s, s, s));
      hole(x * s, y * s, s * 0.08);
    }
    // Body with a chamfered top-right corner.
    ctx.beginPath();
    ctx.moveTo(-0.7 * s, -0.7 * s);
    ctx.lineTo(0.35 * s, -0.7 * s);
    ctx.lineTo(0.7 * s, -0.35 * s);
    ctx.lineTo(0.7 * s, 0.7 * s);
    ctx.lineTo(-0.7 * s, 0.7 * s);
    ctx.closePath();
    const body = ctx.createLinearGradient(-s, -s, s, s);
    body.addColorStop(0, '#4b5966');
    body.addColorStop(1, '#1d262e');
    fillBody(body);
    // Connector stub on the left edge, high up.
    ctx.beginPath();
    ctx.rect(-0.95 * s, -0.55 * s, 0.25 * s, 0.32 * s);
    fillBody(silverGradient(ctx, -s, 0, -0.7 * s, 0));
    // Axis triad: X (single head) to the right, Y (double head) up, Z out of the page (dot).
    ctx.strokeStyle = detail;
    ctx.lineWidth = bp ? 1.8 : 2.4;
    ctx.beginPath();
    ctx.moveTo(-0.25 * s, 0.25 * s);
    ctx.lineTo(0.42 * s, 0.25 * s);
    ctx.moveTo(-0.25 * s, 0.25 * s);
    ctx.lineTo(-0.25 * s, -0.42 * s);
    ctx.stroke();
    arrowHead(0.42 * s, 0.25 * s, 0, s * 0.14);
    arrowHead(-0.25 * s, -0.42 * s, -Math.PI / 2, s * 0.14, true);
    ctx.beginPath();
    ctx.arc(-0.25 * s, 0.25 * s, s * 0.09, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = detail;
    ctx.beginPath();
    ctx.arc(-0.25 * s, 0.25 * s, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'gswitch') {
    // Mounting ear on the right.
    ctx.beginPath();
    ctx.roundRect(0.4 * s, -0.2 * s, 0.38 * s, 0.4 * s, 0.1 * s);
    fillBody(silverGradient(ctx, 0, -s, 0, s));
    hole(0.62 * s, 0, s * 0.08);
    // Body with a chamfered top-left corner.
    ctx.beginPath();
    ctx.moveTo(-0.2 * s, -0.8 * s);
    ctx.lineTo(0.45 * s, -0.8 * s);
    ctx.lineTo(0.45 * s, 0.8 * s);
    ctx.lineTo(-0.5 * s, 0.8 * s);
    ctx.lineTo(-0.5 * s, -0.5 * s);
    ctx.closePath();
    const body = ctx.createLinearGradient(-s, 0, s, 0);
    body.addColorStop(0, '#f4f7f8');
    body.addColorStop(0.6, '#d9e2e7');
    body.addColorStop(1, '#93a3ae');
    fillBody(body);
    // Sensing arrow, off-centre to the left.
    ctx.strokeStyle = bp ? line : '#1d3a4f';
    ctx.lineWidth = bp ? 1.8 : 3;
    ctx.beginPath();
    ctx.moveTo(-0.12 * s, 0.45 * s);
    ctx.lineTo(-0.12 * s, -0.45 * s);
    ctx.stroke();
    arrowHead(-0.12 * s, -0.45 * s, -Math.PI / 2, s * 0.2);
    // Cable gland at the bottom right with its cable.
    ctx.beginPath();
    ctx.rect(0.1 * s, 0.8 * s, 0.28 * s, 0.18 * s);
    fillBody(silverGradient(ctx, 0, 0, s, 0));
    ctx.strokeStyle = bp ? line : '#2b2f33';
    ctx.lineWidth = bp ? 1.6 : 4;
    ctx.beginPath();
    ctx.moveTo(0.24 * s, 0.98 * s);
    ctx.quadraticCurveTo(0.3 * s, 1.15 * s, 0.75 * s, 1.08 * s);
    ctx.stroke();
    if (!bp) {
      ctx.fillStyle = accent;
      ctx.fillRect(-0.42 * s, 0.55 * s, 0.6 * s, 0.1 * s);
    }
  } else if (kind === 'circular') {
    // Square flange with four holes, the round shell, a key notch at the top, an index mark.
    ctx.beginPath();
    ctx.roundRect(-0.9 * s, -0.9 * s, 1.8 * s, 1.8 * s, 0.2 * s);
    fillBody(silverGradient(ctx, -s, -s, s, s));
    for (const [x, y] of [
      [-0.68, -0.68],
      [0.68, -0.68],
      [-0.68, 0.68],
      [0.68, 0.68],
    ] as const)
      hole(x * s, y * s, s * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, 0.72 * s, 0, Math.PI * 2);
    fillBody(silverGradient(ctx, -s, 0, s, 0));
    ctx.beginPath();
    ctx.arc(0, 0, 0.56 * s, 0, Math.PI * 2);
    fillBody('#1a2229');
    // Key notch.
    ctx.beginPath();
    ctx.rect(-0.07 * s, -0.72 * s, 0.14 * s, 0.2 * s);
    fillBody(bp ? '' : '#0b1218');
    // Index triangle at about one o'clock.
    ctx.fillStyle = detail;
    ctx.beginPath();
    const a = -Math.PI / 2 + 0.5;
    ctx.moveTo(Math.cos(a) * 0.8 * s, Math.sin(a) * 0.8 * s);
    ctx.lineTo(Math.cos(a - 0.12) * 0.92 * s, Math.sin(a - 0.12) * 0.92 * s);
    ctx.lineTo(Math.cos(a + 0.12) * 0.92 * s, Math.sin(a + 0.12) * 0.92 * s);
    ctx.closePath();
    ctx.fill();
    // Pins in an asymmetric ring; pin 1 (just clockwise of the key) is ringed.
    const angles = [20, 95, 160, 230, 300];
    angles.forEach((deg, i) => {
      const r = (deg * Math.PI) / 180 - Math.PI / 2;
      const x = Math.cos(r) * 0.36 * s;
      const y = Math.sin(r) * 0.36 * s;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = bp ? line : '#d8b56a';
      ctx.fill();
      if (i === 0) {
        ctx.strokeStyle = detail;
        ctx.lineWidth = bp ? 1.4 : 2;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.12, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = bp ? line : '#d8b56a';
    ctx.fill();
  } else {
    // Rectangular connector: trapezoid shell, jack posts, 5 + 4 pins, pin 1 top left (ringed).
    for (const x of [-0.95, 0.95]) {
      ctx.beginPath();
      ctx.arc(x * s, 0, s * 0.14, 0, Math.PI * 2);
      fillBody(silverGradient(ctx, -s, -s, s, s));
    }
    ctx.beginPath();
    ctx.roundRect(-1.08 * s, -0.55 * s, 2.16 * s, 1.1 * s, 0.12 * s);
    fillBody(silverGradient(ctx, 0, -s, 0, s));
    ctx.beginPath();
    ctx.moveTo(-0.75 * s, -0.38 * s);
    ctx.lineTo(0.75 * s, -0.38 * s);
    ctx.lineTo(0.6 * s, 0.38 * s);
    ctx.lineTo(-0.6 * s, 0.38 * s);
    ctx.closePath();
    fillBody('#1a2229');
    for (let i = 0; i < 5; i++) {
      const x = (-0.56 + i * 0.28) * s;
      ctx.beginPath();
      ctx.arc(x, -0.15 * s, s * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = bp ? line : '#d8b56a';
      ctx.fill();
      if (i === 0) {
        ctx.strokeStyle = detail;
        ctx.lineWidth = bp ? 1.4 : 2;
        ctx.beginPath();
        ctx.arc(x, -0.15 * s, s * 0.11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc((-0.42 + i * 0.28) * s, 0.15 * s, s * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = bp ? line : '#d8b56a';
      ctx.fill();
    }
    // Pin-1 triangle on the shell edge.
    ctx.fillStyle = detail;
    ctx.beginPath();
    ctx.moveTo(-0.88 * s, -0.5 * s);
    ctx.lineTo(-0.72 * s, -0.5 * s);
    ctx.lineTo(-0.8 * s, -0.4 * s);
    ctx.closePath();
    ctx.fill();
  }
}

export class Mg04View {
  readonly c: Canvas2D;
  private sim: Mg04Sim;
  private readonly o: Mg04ViewOptions;
  private hud: Rect[] = [];
  drawingR!: Rect;
  benchR!: Rect;
  buttons: Partial<Record<Mg04Button, Rect>> = {};
  private oneR: Rect | null = null;
  /** Slot for the result strip between the bench and the controls: it never covers a panel (T038). */
  private feedbackR: Rect | null = null;
  private hudLayer: KeyedLayer;
  private drawingLayer: KeyedLayer;
  private benchLayer: KeyedLayer;
  private btnLayer: KeyedLayer;
  private shownAngle = 0;
  private shownPart = -1;
  private lastMs = 0;

  constructor(canvas: HTMLCanvasElement, sim: Mg04Sim, o: Mg04ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.hudLayer = new KeyedLayer(this.c);
    this.drawingLayer = new KeyedLayer(this.c);
    this.benchLayer = new KeyedLayer(this.c);
    this.btnLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg04Sim) {
    this.sim = sim;
    this.shownPart = -1;
    this.layout();
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
    const s = Math.min(c.u, 1.3);
    if (compact) {
      const half = (W - pad * 2 - 8) / 2;
      const bh = 34;
      this.drawingR = { x: c.rtl ? pad + half + 8 : pad, y: pad, w: half, h: H - pad * 2 - bh - 6 };
      this.benchR = { x: c.rtl ? pad : pad + half + 8, y: pad, w: half, h: H - pad * 2 - bh - 6 };
      const bw = (W - pad * 2 - 8) / 2;
      this.buttons = { right: { x: pad, y: H - pad - bh, w: bw, h: bh }, match: { x: pad + bw + 8, y: H - pad - bh, w: bw, h: bh } };
      this.hud = [];
      this.oneR = null;
      this.feedbackR = null;
      return;
    }
    let y = pad;
    const readH = Math.round(70 * s);
    const gap = 8;
    const rw = (W - pad * 2 - gap * 2) / 3;
    this.hud = [0, 1, 2].map((i) => ({ x: pad + i * (rw + gap), y, w: rw, h: readH }));
    if (c.rtl) this.hud.reverse();
    y += readH + 10;
    const b1 = Math.round(Math.max(52, 48 * s));
    const b2 = Math.round(Math.max(56, 52 * s));
    const ctlH = this.sim.config.oneButton ? b2 + 34 : b1 + 8 + b2;
    const fbH = Math.round(38 * s);
    const panelsH = H - pad - ctlH - 12 - fbH - y;
    const ph = (panelsH - 10) / 2;
    this.drawingR = { x: pad, y, w: W - pad * 2, h: ph };
    this.benchR = { x: pad, y: y + ph + 10, w: W - pad * 2, h: ph };
    this.feedbackR = { x: pad + 4, y: y + panelsH + 6, w: W - pad * 2 - 8, h: fbH };
    const cy = y + panelsH + 12 + fbH;
    const bw = (W - pad * 2 - gap) / 2;
    const L = (i: number) => (c.rtl ? pad + (1 - i) * (bw + gap) : pad + i * (bw + gap));
    if (this.sim.config.oneButton) {
      this.buttons = { error: { x: pad, y: cy + 34, w: W - pad * 2, h: b2 } };
      this.oneR = { x: pad, y: cy, w: W - pad * 2, h: 30 };
    } else {
      this.buttons = {
        left: { x: L(0), y: cy, w: bw, h: b1 },
        right: { x: L(1), y: cy, w: bw, h: b1 },
        match: { x: L(0), y: cy + b1 + 8, w: bw, h: b2 },
        error: { x: L(1), y: cy + b1 + 8, w: bw, h: b2 },
      };
      this.oneR = null;
    }
  }

  hit(x: number, y: number): Mg04Button | null {
    for (const [k, r] of Object.entries(this.buttons) as Array<[Mg04Button, Rect]>) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return k;
    return null;
  }

  centreOf(b: Mg04Button): { x: number; y: number } {
    const r = this.buttons[b] ?? this.benchR;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  draw(st: Mg04DrawState) {
    const c = this.c;
    c.begin();
    c.backdrop(0.8);
    if (!this.o.compact) this.drawHud();
    this.drawDrawing();
    this.drawBench(st.timeMs);
    this.drawButtons(st.held ?? null, st.focus ?? null);
    this.drawFeedback();
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private drawHud() {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const n = sim.parts.length;
    const idx = Math.min(n, sim.current + 1);
    // The same time as the host timer bar (whole window), not the shorter Standard play time (T038).
    const left = Math.ceil(sim.windowLeftS);
    const urgent = sim.leftS <= 4 && !sim.done;
    const wrong = sim.outcomes.filter((o) => !GOOD_OUTCOMES.includes(o)).length;
    const key = `${idx}|${sim.correct}|${wrong}|${left}|${urgent}|${c.W}`;
    const r0 = this.hud[0]!;
    this.hudLayer.blit({ x: 0, y: r0.y - 6, w: c.W, h: r0.h + 26 }, key, () => {
      c.readout(this.hud[0]!, t(K + 'hud.part'), `${idx}/${n}`, t(K + 'unit.parts'), c.pal.text);
      const s: Status = wrong > 0 ? 'bad' : 'good';
      c.readout(this.hud[1]!, t(K + 'hud.correct'), String(sim.correct), t(K + 'unit.parts'), wrong > 0 ? c.pal.bad : c.pal.good, sim.current > 0 ? s : undefined);
      c.readout(this.hud[2]!, t(K + 'hud.left'), String(left), 's', urgent ? c.pal.sun : c.pal.text);
    });
  }

  private panelTitle(r: Rect, title: string, sub: string) {
    const c = this.c;
    const px = this.o.compact ? 10.5 : c.px(13, 1.25);
    c.textStart(title, { x: r.x + 12, y: r.y, w: r.w * 0.55, h: 0 }, r.y + 10 + px * 0.6, px, 600, c.pal.dim);
    if (sub) {
      const ctx = c.ctx;
      ctx.font = c.font(px, 600);
      c.text(sub, c.rtl ? r.x + 12 : r.x + r.w - 12, r.y + 10 + px * 0.6, r.w * 0.4, px, 600, c.pal.text, c.rtl ? 'left' : 'right');
    }
  }

  /** "Up" reference arrow in a panel corner (same in both panels). */
  private upMark(r: Rect, color: string) {
    const c = this.c;
    const ctx = c.ctx;
    const x = c.rtl ? r.x + 18 : r.x + r.w - 18;
    const y = r.y + r.h - (this.o.compact ? 30 : 46);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x, y - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x - 5, y - 3);
    ctx.lineTo(x + 5, y - 3);
    ctx.closePath();
    ctx.fill();
    if (!this.o.compact) c.text(this.o.t(K + 'up'), x, y + 22, 40, c.px(10.5, 1.15), 600, color, 'center');
  }

  private drawDrawing() {
    const c = this.c;
    const sim = this.sim;
    const r = this.drawingR;
    const p = sim.part;
    const key = `${sim.current}|${sim.outcomes.join(',')}|${r.w}x${r.h}@${r.y}|${c.rtl}`;
    this.drawingLayer.blit({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 26 }, key, () => {
      const ctx = c.ctx;
      c.glass(r, 16);
      ctx.save();
      pathRoundRect(ctx, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }, 12);
      ctx.clip();
      const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      bg.addColorStop(0, '#103a5e');
      bg.addColorStop(1, '#0b2740');
      ctx.fillStyle = bg;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(150, 200, 230, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = r.x + 4; x < r.x + r.w; x += 14) {
        ctx.moveTo(x, r.y);
        ctx.lineTo(x, r.y + r.h);
      }
      for (let y = r.y + 4; y < r.y + r.h; y += 14) {
        ctx.moveTo(r.x, y);
        ctx.lineTo(r.x + r.w, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(232, 242, 248, 0.5)';
      ctx.strokeRect(r.x + 10, r.y + 10, r.w - 20, r.h - 20);
      ctx.restore();
      this.panelTitle(r, this.o.t(K + 'panel.drawing'), p ? this.o.t(K + 'kind.' + p.kind) : '');
      if (!p) {
        this.drawSummary(r);
        return;
      }
      const s = Math.min(r.w, r.h) * (this.o.compact ? 0.3 : 0.27);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2 + (this.o.compact ? 4 : 8);
      // Centre lines (drafting convention).
      ctx.save();
      ctx.strokeStyle = 'rgba(232, 242, 248, 0.25)';
      ctx.setLineDash([10, 3, 2, 3]);
      ctx.beginPath();
      ctx.moveTo(cx - s * 1.35, cy);
      ctx.lineTo(cx + s * 1.35, cy);
      ctx.moveTo(cx, cy - s * 1.25);
      ctx.lineTo(cx, cy + s * 1.25);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((p.drawingRot * Math.PI) / 2);
      if (p.wrong) ctx.scale(-1, 1);
      drawPart(ctx, p.kind, s, 'blueprint', c.pal.accent);
      ctx.restore();
      this.upMark(r, 'rgba(232, 242, 248, 0.85)');
    });
  }

  /** After the last part: one line per part with its status shape and outcome. */
  private drawSummary(r: Rect) {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const n = sim.parts.length;
    const top = r.y + 44;
    const rowH = Math.min(40, (r.h - 64) / n);
    const px = Math.min(c.px(14, 1.3), rowH * 0.45);
    for (let i = 0; i < n; i++) {
      const o = sim.outcomes[i] ?? 'unchecked';
      const s: Status = GOOD_OUTCOMES.includes(o) ? 'good' : 'bad';
      const y = top + i * rowH + rowH / 2;
      const ix = c.rtl ? r.x + r.w - 30 : r.x + 30;
      c.statusIcon(s, ix, y, Math.min(22, rowH * 0.6));
      const tx = c.rtl ? ix - 20 : ix + 20;
      c.text(`${t(K + 'kind.' + sim.parts[i]!.kind)} · ${t(K + 'feedback.' + o)}`, tx, y + 1, r.w - 72, px, 600, c.pal.text, c.rtl ? 'right' : 'left');
    }
  }

  private drawBench(nowMs: number) {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    const r = this.benchR;
    const p = sim.part;
    this.benchLayer.blit({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 26 }, `${r.w}x${r.h}@${r.y}|${c.rtl}`, () => {
      const g = c.ctx;
      c.glass(r, 16);
      g.save();
      pathRoundRect(g, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }, 12);
      g.clip();
      // Anti-static mat: dark grey-green with a faint dot grid and a warm work light.
      g.fillStyle = '#1b2a2f';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = 'rgba(160, 200, 190, 0.08)';
      for (let x = r.x + 8; x < r.x + r.w; x += 12) for (let y = r.y + 8; y < r.y + r.h; y += 12) g.fillRect(x, y, 1.5, 1.5);
      const glow = g.createRadialGradient(r.x + r.w * 0.5, r.y + r.h * 0.45, 4, r.x + r.w * 0.5, r.y + r.h * 0.5, r.w * 0.55);
      glow.addColorStop(0, 'rgba(255, 206, 131, 0.14)');
      glow.addColorStop(1, 'rgba(255, 206, 131, 0)');
      g.fillStyle = glow;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.restore();
      this.panelTitle(r, this.o.t(K + 'panel.bench'), '');
      this.upMark(r, c.pal.accentStrong);
    });
    if (!p) return;
    // Eased rotation toward the part's orientation (instant with reduced motion).
    const target = sim.rot * 90;
    if (this.shownPart !== sim.current) {
      this.shownPart = sim.current;
      this.shownAngle = target;
    }
    let d = target - this.shownAngle;
    d = ((d % 360) + 540) % 360 - 180;
    const dt = this.lastMs ? clamp((nowMs - this.lastMs) / 1000, 0, 0.1) : 0;
    this.lastMs = nowMs;
    this.shownAngle = this.o.reducedMotion ? target : this.shownAngle + d * (1 - Math.exp(-dt / 0.06));
    const s = Math.min(r.w, r.h) * (this.o.compact ? 0.3 : 0.27);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2 + (this.o.compact ? 4 : 8);
    // Contact shadow.
    const sh = ctx.createRadialGradient(cx + 3, cy + 6, s * 0.2, cx + 3, cy + 6, s * 1.25);
    sh.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - s * 1.4, cy - s * 1.3, s * 2.8, s * 2.8);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((this.shownAngle * Math.PI) / 180);
    drawPart(ctx, p.kind, s, 'hardware', c.pal.accent);
    ctx.restore();
    if (sim.config.oneButton && sim.offer() === 'error') {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = c.pal.bg0;
      pathRoundRect(ctx, r, 16);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawButtons(held: Mg04Button | null, focus: Mg04Button | null) {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const offerErr = sim.config.oneButton && sim.offer() === 'error';
    const rs = Object.values(this.buttons) as Rect[];
    const y0 = Math.min(...rs.map((r) => r.y)) - (this.oneR ? 40 : 10);
    const y1 = Math.max(...rs.map((r) => r.y + r.h)) + 16;
    const key = `${held}|${focus}|${offerErr}|${sim.done}|${y0}|${c.W}`;
    this.btnLayer.blit({ x: 0, y: y0, w: c.W, h: y1 - y0 }, key, () => {
      const ctx = c.ctx;
      const turn = (dir: 1 | -1) => (x: number, y: number, s: number) => {
        // A clockwise circular arrow, mirrored for "turn left".
        ctx.save();
        ctx.translate(x, y);
        if (dir < 0) ctx.scale(-1, 1);
        const r = s * 0.42;
        const a1 = Math.PI * 0.3;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI * 0.95, a1);
        ctx.stroke();
        const ex = Math.cos(a1) * r;
        const ey = Math.sin(a1) * r;
        const tx = -Math.sin(a1);
        const ty = Math.cos(a1);
        const h = s * 0.3;
        ctx.beginPath();
        ctx.moveTo(ex + tx * h * 0.6, ey + ty * h * 0.6);
        ctx.lineTo(ex - tx * h * 0.35 + Math.cos(a1) * h * 0.55, ey - ty * h * 0.35 + Math.sin(a1) * h * 0.55);
        ctx.lineTo(ex - tx * h * 0.35 - Math.cos(a1) * h * 0.55, ey - ty * h * 0.35 - Math.sin(a1) * h * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      const b = this.buttons;
      if (b.left) c.button(b.left, t(K + 'btn.left'), { active: held === 'left' || focus === 'left', disabled: sim.done, icon: turn(-1) });
      if (b.right) c.button(b.right, t(K + 'btn.right'), { active: held === 'right' || focus === 'right', disabled: sim.done, icon: turn(1) });
      if (b.match) c.button(b.match, t(K + 'btn.match'), { primary: true, active: held === 'match' || focus === 'match', disabled: sim.done });
      if (b.error) {
        const r = b.error;
        const lit = held === 'error' || focus === 'error' || offerErr;
        c.button(r, t(K + 'btn.error'), { active: lit, disabled: sim.done });
        c.statusBorder({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 'warn', 11, lit ? 2.5 : 1.5);
      }
      if (this.oneR) c.hint(this.oneR, t(K + 'hint.one'), offerErr);
    });
  }

  /** The result strip lives in its own slot under the bench. Idle, the slot shows a quiet track. */
  private drawFeedback() {
    const slot = this.feedbackR;
    if (!slot || this.o.compact) return;
    const sim = this.sim;
    const c = this.c;
    const last = sim.last;
    const showing = !!last && !sim.done && sim.timeS - last.atS <= FEEDBACK_S;
    c.roundRect(slot, 12);
    c.ctx.fillStyle = withAlpha(c.pal.ceramic, 0.04);
    c.ctx.fill();
    c.ctx.strokeStyle = withAlpha(c.pal.ceramic, 0.12);
    c.ctx.lineWidth = 1;
    c.ctx.stroke();
    if (!showing) return;
    const ok = GOOD_OUTCOMES.includes(last!.outcome);
    const label = this.o.t(K + 'feedback.' + last!.outcome);
    const a = this.o.reducedMotion ? 1 : clamp((FEEDBACK_S - (sim.timeS - last!.atS)) / 0.2, 0, 1);
    c.ctx.save();
    c.ctx.globalAlpha = a;
    c.statusStrip(slot, ok ? 'good' : 'bad', label);
    c.ctx.restore();
  }
}
