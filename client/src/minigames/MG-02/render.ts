// MG-02 drawing: a brushed-silver balance with a geared Δv dial. The stage and payload sit on
// the left pan, propellant blocks (ceramic tank segments with a Signal band) stack on the
// right; the dial shows the target band in km/s and the bar chart shows each block's
// shrinking Δv. Theme tokens only; DPR ≤ 2; status = colour + shape + label + border.
import { Canvas2D, ceramicGradient, clamp, fmt, KeyedLayer, silverGradient, withAlpha, type Rect, type Status } from './kit';
import { deltaV, marginalDv, type Mg02Sim } from './model';

export interface Mg02ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export interface Mg02DrawState {
  timeMs: number;
  /** Which on-canvas button is held (for the pressed look). */
  held?: 'add' | 'remove' | null;
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

interface Layout {
  status: Rect;
  readouts: Rect[];
  scale: Rect;
  chart: Rect | null;
  add: Rect;
  remove: Rect | null;
  hint: Rect | null;
}

const K = 'minigame.MG-02.';

export class Mg02View {
  readonly c: Canvas2D;
  private sim: Mg02Sim;
  private readonly o: Mg02ViewOptions;
  private L!: Layout;
  private dialLayer: KeyedLayer;
  private hudLayer: KeyedLayer;
  private chartLayer: KeyedLayer;
  private statusLayer: KeyedLayer;
  private buttonLayer: KeyedLayer;
  private vmaxKms = 6;
  // Geometry of the balance (CSS px), set in layout().
  private cx = 0;
  /** Dial hub (needle centre). */
  private hy = 0;
  /** Beam pivot, below the dial. */
  private py = 0;
  private R = 0;
  private beamL = 0;
  private panW = 0;
  private hang = 0;

  constructor(canvas: HTMLCanvasElement, sim: Mg02Sim, o: Mg02ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.dialLayer = new KeyedLayer(this.c);
    this.hudLayer = new KeyedLayer(this.c);
    this.chartLayer = new KeyedLayer(this.c);
    this.statusLayer = new KeyedLayer(this.c);
    this.buttonLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg02Sim) {
    this.sim = sim;
    this.layout();
    this.dialLayer.invalidate();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  /** The on-canvas control under (x, y) in CSS px. */
  hit(x: number, y: number): 'add' | 'remove' | null {
    const inR = (r: Rect | null) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inR(this.L.add)) return 'add';
    if (inR(this.L.remove)) return 'remove';
    return null;
  }

  /** Centre of a control (for the demo finger). */
  centreOf(which: 'add' | 'remove'): { x: number; y: number } {
    const r = which === 'add' ? this.L.add : this.L.remove ?? this.L.add;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  private layout() {
    const { W, H } = this.c;
    const c = this.c;
    const sim = this.sim;
    this.vmaxKms = Math.max(2, Math.ceil(deltaV(sim.config, sim.config.maxBlocks) / 1000));
    const pad = this.o.compact ? 8 : 14;
    if (this.o.compact) {
      const btnH = 40;
      const status = { x: pad, y: pad, w: W * 0.62, h: 28 };
      const add = { x: W - pad - 112, y: H - pad - btnH, w: 112, h: btnH };
      this.L = { status, readouts: [], scale: { x: pad, y: pad + 32, w: W - pad * 2 - 118, h: H - pad * 2 - 32 }, chart: null, add, remove: null, hint: null };
    } else {
      const s = Math.min(c.u, 1.3);
      const statusH = Math.round(46 * s);
      const readH = Math.round(70 * s);
      const btnH = Math.round(Math.max(56, 52 * s));
      const chartH = clamp(Math.round(H * 0.17), 96, 150);
      let y = pad;
      const status = { x: pad, y, w: W - pad * 2, h: statusH };
      y += statusH + 10;
      const gap = 8;
      const rw = (W - pad * 2 - gap * 2) / 3;
      const readouts = [0, 1, 2].map((i) => ({ x: pad + i * (rw + gap), y, w: rw, h: readH }));
      if (c.rtl) readouts.reverse();
      y += readH + 10;
      const btnY = H - pad - btnH;
      const chart = { x: pad, y: btnY - 12 - chartH, w: W - pad * 2, h: chartH };
      const scale = { x: pad, y, w: W - pad * 2, h: chart.y - 10 - y };
      let add: Rect;
      let remove: Rect | null = null;
      let hint: Rect | null = null;
      if (sim.config.oneButton) {
        add = { x: pad, y: btnY, w: W - pad * 2, h: btnH };
        hint = null;
      } else {
        const bw = (W - pad * 2 - gap) / 2;
        remove = { x: pad, y: btnY, w: bw, h: btnH };
        add = { x: pad + bw + gap, y: btnY, w: bw, h: btnH };
        if (c.rtl) [remove, add] = [{ ...add }, { ...remove }];
      }
      this.L = { status, readouts, scale, chart, add, remove, hint };
    }
    const S = this.L.scale;
    const compact = this.o.compact;
    this.cx = S.x + S.w / 2;
    this.panW = Math.min(S.w * 0.28, compact ? 64 : 104);
    // Beam ends keep the pans inside the frame.
    this.beamL = S.w - this.panW - (compact ? 8 : 16);
    const labelH = compact ? 4 : c.px(11.5, 1.2) + 16;
    this.R = Math.max(36, Math.min(S.w * 0.36, (S.h - labelH) * (compact ? 0.42 : 0.4)));
    this.hy = S.y + this.R + (compact ? 6 : 34);
    this.py = this.hy + this.R * 0.3 + 8;
    this.hang = Math.max(24, S.y + S.h - labelH - 10 - this.py);
  }

  // ── geometry helpers ──
  private dialAngle(ms: number): number {
    // 190° dial opening downwards: 0 km/s at the left (175°), the top end at the right (365°).
    const f = clamp(ms / (this.vmaxKms * 1000), 0, 1.02);
    return ((175 + 190 * f) * Math.PI) / 180;
  }

  private beamAngle(): number {
    // Geared pointer: the beam tilts ±10° over the dial range (game value).
    const f = clamp(this.sim.needleMs / (this.vmaxKms * 1000), 0, 1);
    return ((f - 0.45) * 2 * 10 * Math.PI) / 180;
  }

  draw(st: Mg02DrawState) {
    const c = this.c;
    c.begin();
    c.backdrop(0.9);
    if (!this.o.compact) {
      this.drawReadouts();
      this.drawChart();
    }
    this.drawStatus();
    this.drawDial();
    this.drawBalance(st.timeMs);
    this.drawNeedle();
    this.drawButtons(st.held ?? null);
    if (this.sim.done && !this.o.compact) this.drawReading();
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private statusOf(): { s: Status; label: string } {
    const sim = this.sim;
    const z = sim.zone;
    const t = this.o.t;
    if (z < 0) return { s: 'bad', label: t(K + 'status.below') };
    if (z > 0) return { s: 'bad', label: t(K + 'status.above') };
    const extra = sim.n - sim.plan.nStar;
    if (extra === 0) return { s: 'good', label: t(K + 'status.fewest') };
    if (extra <= sim.config.extraBlocksMax) return { s: 'good', label: t(K + 'status.extra_ok', { n: extra }) };
    return { s: 'warn', label: t(K + 'status.extra_many', { n: extra }) };
  }

  private drawStatus() {
    const { s, label } = this.statusOf();
    const r = this.L.status;
    this.statusLayer.blit({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, `${s}|${label}|${r.w}`, () => {
      if (this.o.compact) {
        const c = this.c;
        c.ctx.font = c.font(c.px(12, 1.2), 600);
        const w = Math.min(r.w, c.ctx.measureText(label).width + 44);
        c.statusStrip({ x: c.rtl ? r.x + r.w - w : r.x, y: r.y, w, h: r.h }, s, label);
      } else this.c.statusStrip(r, s, label);
    });
  }

  private drawReadouts() {
    const sim = this.sim;
    const t = this.o.t;
    const c = this.c;
    const dv = sim.needleMs / 1000;
    const dvTxt = fmt(Math.max(0, dv), 2);
    const mf = sim.config.dryT + sim.config.payloadT;
    const m0 = mf + sim.n * sim.config.blockT;
    const left = Math.ceil(sim.leftS);
    const key = `${dvTxt}|${sim.n}|${left}|${c.W}|${sim.zone}`;
    const rs = this.L.readouts;
    const all = { x: 0, y: rs[0]!.y - 6, w: c.W, h: rs[0]!.h + 24 };
    this.hudLayer.blit(all, key, () => {
      const zoneColor = sim.zone === 0 ? c.pal.good : c.pal.text;
      c.readout(rs[0]!, t(K + 'hud.dv'), dvTxt, 'km/s', zoneColor);
      c.readout(rs[1]!, t(K + 'hud.mass'), `${fmt(m0, 1)} / ${fmt(mf, 1)}`, 't', c.pal.text);
      c.readout(rs[2]!, t(K + 'hud.reads_in'), String(left), 's', left <= 5 && !sim.done ? c.pal.sun : c.pal.text);
    });
  }

  private drawChart() {
    const r = this.L.chart!;
    const sim = this.sim;
    const c = this.c;
    const t = this.o.t;
    const nShow = sim.n;
    const next = sim.pendingN;
    const key = `${nShow}|${next}|${r.w}x${r.h}|${sim.config.showNext}`;
    this.chartLayer.blit({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 30 }, key, () => {
      const ctx = c.ctx;
      c.glass(r, 16);
      const pad = 12;
      const titlePx = c.px(13, 1.3);
      c.textStart(t(K + 'chart.title'), { x: r.x + pad, y: r.y, w: r.w - pad * 2, h: 0 }, r.y + pad + titlePx * 0.5, titlePx, 600, c.pal.dim);
      const max = sim.config.maxBlocks;
      const top = r.y + pad + titlePx + 20;
      const base = r.y + r.h - pad - c.px(11, 1.2) - 4;
      const plotW = r.w - pad * 2;
      const slot = plotW / max;
      const bw = Math.max(6, slot * 0.62);
      const m1 = marginalDv(sim.config, 1);
      // Baseline.
      ctx.fillStyle = withAlpha(c.pal.ceramic, 0.14);
      ctx.fillRect(r.x + pad, base, plotW, 1);
      for (let k = 1; k <= max; k++) {
        const i = c.rtl ? max - k : k - 1;
        const x = r.x + pad + i * slot + (slot - bw) / 2;
        const h = Math.max(3, (base - top) * (marginalDv(sim.config, k) / m1));
        const y = base - h;
        if (k <= nShow) {
          const g = ctx.createLinearGradient(0, y, 0, base);
          g.addColorStop(0, c.pal.accentStrong);
          g.addColorStop(1, withAlpha(c.pal.accent, 0.55));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.roundRect(x, y, bw, h, [3, 3, 0, 0]);
          ctx.fill();
        } else {
          ctx.save();
          const isNext = k === nShow + 1 && sim.config.showNext;
          ctx.strokeStyle = isNext ? withAlpha(c.pal.accent, 0.8) : withAlpha(c.pal.ceramic, 0.16);
          ctx.setLineDash(isNext ? [4, 3] : [2, 3]);
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, h - 1);
          ctx.restore();
        }
        // Block numbers under the bars (every other one when crowded).
        if (slot > 18 || k % 2 === 1) c.text(String(k), x + bw / 2, base + 4 + c.px(11, 1.2) * 0.55, slot + 6, c.px(11, 1.2), 500, c.pal.faint, 'center');
      }
      // Value labels: the first block and the newest one.
      const label = (k: number, strong: boolean) => {
        const i = c.rtl ? max - k : k - 1;
        const x = r.x + pad + i * slot + slot / 2;
        const h = Math.max(3, (base - top) * (marginalDv(sim.config, k) / m1));
        const txt = `+${fmt(marginalDv(sim.config, k) / 1000, 2)}`;
        ctx.font = c.font(c.px(11.5, 1.25), 600);
        const w = c.tabWidth(txt) + c.px(11.5, 1.25) * 2.4;
        const lx = clamp(c.rtl ? x - w + slot * 0.3 : x - slot * 0.3, r.x + 6, r.x + r.w - 6 - w);
        c.numberWithUnit(txt, 'km/s', lx, base - h - 6, w + 10, c.px(11.5, 1.25), strong ? c.pal.accentStrong : c.pal.dim, 'left', 600);
      };
      label(1, nShow <= 1);
      if (nShow >= 3) label(nShow, true);
    });
  }

  private drawDial() {
    const sim = this.sim;
    const c = this.c;
    const { cx, R } = this;
    const py = this.hy;
    const key = `${c.W}x${c.H}|${sim.plan.loMs}|${sim.plan.hiMs}|${R}|${this.o.compact}`;
    const S = this.L.scale;
    this.dialLayer.blit({ x: 0, y: S.y - 4, w: c.W, h: S.h + 8 }, key, () => {
      const ctx = c.ctx;
      // Dial face: a dark glass half-disc with a silver bezel.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, py, R + 10, Math.PI * 0.94, Math.PI * 2.06);
      ctx.closePath();
      const face = ctx.createRadialGradient(cx, py - R * 0.3, R * 0.1, cx, py, R + 10);
      face.addColorStop(0, withAlpha(c.pal.bg3, 0.9));
      face.addColorStop(1, withAlpha(c.pal.bg1, 0.96));
      ctx.fillStyle = face;
      if (!c.pal.highContrast) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 8;
      }
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 3;
      ctx.strokeStyle = silverGradient(ctx, cx - R, py - R, cx + R, py);
      ctx.beginPath();
      ctx.arc(cx, py, R + 10, Math.PI * 0.94, Math.PI * 2.06);
      ctx.stroke();
      // Track, then the target band (12 px, solid Meets green with dark edge ticks).
      const a0 = this.dialAngle(0);
      const a1 = this.dialAngle(this.vmaxKms * 1000);
      const tw = this.o.compact ? 7 : 12;
      const rr = R - tw / 2 - 4;
      ctx.lineCap = 'butt';
      ctx.lineWidth = tw;
      ctx.strokeStyle = 'rgba(232, 238, 240, 0.1)';
      ctx.beginPath();
      ctx.arc(cx, py, rr, a0, a1);
      ctx.stroke();
      const b0 = this.dialAngle(sim.plan.loMs);
      const b1 = this.dialAngle(sim.plan.hiMs);
      ctx.strokeStyle = c.pal.good;
      ctx.beginPath();
      ctx.arc(cx, py, rr, b0, b1);
      ctx.stroke();
      // Band edge markers: 2 px lines with triangle caps.
      for (const a of [b0, b1]) {
        const ox = Math.cos(a);
        const oy = Math.sin(a);
        ctx.strokeStyle = c.pal.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + ox * (rr - tw / 2 - 3), py + oy * (rr - tw / 2 - 3));
        ctx.lineTo(cx + ox * (rr + tw / 2 + 6), py + oy * (rr + tw / 2 + 6));
        ctx.stroke();
      }
      // Ticks every 0.5 km/s, labels every 1 km/s.
      const compact = this.o.compact;
      const labelPx = c.px(compact ? 10 : 12, 1.25);
      for (let v = 0; v <= this.vmaxKms * 2; v++) {
        const a = this.dialAngle(v * 500);
        const major = v % 2 === 0;
        const r0 = rr - tw / 2 - (major ? 10 : 6);
        const r1 = rr - tw / 2 - 2;
        ctx.strokeStyle = major ? withAlpha(c.pal.ceramic, 0.75) : withAlpha(c.pal.ceramic, 0.35);
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, py + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, py + Math.sin(a) * r1);
        ctx.stroke();
        if (major && (!this.o.compact || v % 4 === 0)) {
          const rl = r0 - labelPx * 0.95;
          ctx.font = c.font(labelPx, 600);
          ctx.fillStyle = c.pal.dim;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(v / 2), cx + Math.cos(a) * rl, py + Math.sin(a) * rl);
        }
      }
      // Unit inside the dial, legend chip for the band at the top start corner.
      c.text('km/s', cx - R * 0.5, py - R * 0.16, R * 0.5, c.px(compact ? 10 : 12, 1.2), 600, c.pal.faint, 'center');
      if (!compact) {
        const lo = fmt(sim.plan.loMs / 1000, 2);
        const hi = fmt(sim.plan.hiMs / 1000, 2);
        const px = c.px(12.5, 1.25);
        const label = this.o.t(K + 'dial.target');
        const num = `${lo}–${hi}`;
        ctx.font = c.font(px, 600);
        const lw = ctx.measureText(label).width;
        const nw = c.tabWidth(num) + px * 2.6;
        const w = Math.min(S.w, 12 + 10 + 6 + lw + 8 + nw + 10);
        const chip = { x: c.rtl ? S.x + S.w - w : S.x, y: S.y, w, h: px * 2.1 };
        c.roundRect(chip, chip.h / 2);
        ctx.fillStyle = withAlpha(c.pal.bg1, 0.85);
        ctx.fill();
        ctx.strokeStyle = withAlpha(c.pal.good, 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();
        const sw = c.rtl ? chip.x + chip.w - 22 : chip.x + 12;
        ctx.fillStyle = c.pal.good;
        ctx.fillRect(sw, chip.y + chip.h / 2 - 3, 10, 6);
        const tx = c.rtl ? sw - 6 : sw + 16;
        c.text(label, tx, chip.y + chip.h / 2 + 1, lw + 2, px, 600, c.pal.dim, c.rtl ? 'right' : 'left');
        const nx = c.rtl ? tx - lw - 8 - nw : tx + lw + 8;
        c.numberWithUnit(num, 'km/s', nx, chip.y + chip.h / 2 + px * 0.36, nw + 4, px, c.pal.good, 'left', 650);
      }
    });
  }

  private drawBalance(nowMs: number) {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    const S = this.L.scale;
    const { cx, py, beamL, panW, hang } = this;
    const beta = this.beamAngle();
    const baseY = S.y + S.h - 4;
    // Pillar and plinth.
    const pw = Math.max(10, this.R * 0.13);
    ctx.fillStyle = silverGradient(ctx, cx - pw / 2, 0, cx + pw / 2, 0);
    ctx.fillRect(cx - pw / 2, this.hy, pw, baseY - this.hy - 12);
    ctx.fillStyle = c.pal.accent;
    ctx.fillRect(cx - pw / 2 - 2, py + (baseY - py) * 0.55, pw + 4, 5);
    const plinth = { x: cx - pw * 3.4, y: baseY - 14, w: pw * 6.8, h: 14 };
    c.roundRect(plinth, 5);
    const pg = ctx.createLinearGradient(0, plinth.y, 0, plinth.y + plinth.h);
    pg.addColorStop(0, '#2a4d66');
    pg.addColorStop(1, '#0f2638');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Beam ends.
    const ex = Math.cos(beta) * (beamL / 2);
    const ey = Math.sin(beta) * (beamL / 2);
    const lx = cx - ex;
    const ly = py - ey;
    const rx = cx + ex;
    const ry = py + ey;
    // Pans hang straight down from the ends.
    const drawPan = (x: number, y: number, contents: (topY: number) => void, label: string) => {
      const panY = y + hang;
      ctx.strokeStyle = withAlpha('#c3ccd3', 0.85);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - panW / 2 + 4, panY);
      ctx.moveTo(x, y);
      ctx.lineTo(x + panW / 2 - 4, panY);
      ctx.stroke();
      contents(panY);
      // Pan: a shallow silver dish.
      ctx.beginPath();
      ctx.moveTo(x - panW / 2, panY);
      ctx.quadraticCurveTo(x, panY + 16, x + panW / 2, panY);
      ctx.closePath();
      ctx.fillStyle = silverGradient(ctx, x - panW / 2, panY, x + panW / 2, panY + 10);
      ctx.fill();
      ctx.fillStyle = withAlpha(c.pal.accent, 0.9);
      ctx.fillRect(x - panW / 2, panY - 1.5, panW, 2);
      if (!this.o.compact) c.text(label, x, panY + 22, panW + 30, c.px(11.5, 1.2), 600, c.pal.dim, 'center');
    };
    const mf = sim.config.dryT + sim.config.payloadT;
    drawPan(lx, ly, (topY) => this.drawStage(lx, topY, panW), this.o.t(K + 'pan.stage', { t: fmt(mf, 1) }));
    drawPan(rx, ry, (topY) => this.drawBlocks(rx, topY, nowMs), this.o.t(K + 'pan.fuel', { t: fmt(sim.n * sim.config.blockT, 0) }));
    // Beam: brushed silver bar with a teal centre plate and the pivot.
    ctx.save();
    ctx.translate(cx, py);
    ctx.rotate(beta);
    const bh = Math.max(6, this.R * 0.075);
    ctx.fillStyle = silverGradient(ctx, 0, -bh, 0, bh);
    c.roundRect({ x: -beamL / 2 - 4, y: -bh / 2, w: beamL + 8, h: bh }, bh / 2);
    ctx.fill();
    ctx.fillStyle = c.pal.accent;
    ctx.fillRect(-beamL * 0.12, -bh / 2, beamL * 0.24, bh);
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#e8edf0';
      ctx.beginPath();
      ctx.arc((s * beamL) / 2, 0, bh * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The stage and payload on the left pan: graphite bell, ceramic body, teal band, fairing. */
  private drawStage(x: number, panY: number, panW: number) {
    const ctx = this.c.ctx;
    const pal = this.c.pal;
    const bw = panW * 0.34;
    const bodyH = bw * 1.5;
    const bellH = bw * 0.42;
    const fairH = bw * 1.05;
    let y = panY - 2;
    // Bell.
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.42, y);
    ctx.quadraticCurveTo(x - bw * 0.22, y - bellH * 0.55, x - bw * 0.16, y - bellH);
    ctx.lineTo(x + bw * 0.16, y - bellH);
    ctx.quadraticCurveTo(x + bw * 0.22, y - bellH * 0.55, x + bw * 0.42, y);
    ctx.closePath();
    const bg = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    bg.addColorStop(0, '#2c2a28');
    bg.addColorStop(0.45, '#6a5f55');
    bg.addColorStop(1, '#1d1c1b');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = '#b07a46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.42, y);
    ctx.lineTo(x + bw * 0.42, y);
    ctx.stroke();
    y -= bellH;
    // Body.
    ctx.fillStyle = ceramicGradient(ctx, x - bw / 2, x + bw / 2, pal);
    ctx.fillRect(x - bw / 2, y - bodyH, bw, bodyH);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(x - bw / 2, y - bodyH * 0.22, bw, bodyH * 0.09);
    ctx.fillStyle = silverGradient(ctx, x - bw / 2, 0, x + bw / 2, 0);
    ctx.fillRect(x - bw / 2, y - bodyH - 3, bw, 3);
    y -= bodyH + 3;
    // Fairing (ogive).
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, y);
    ctx.bezierCurveTo(x - bw / 2, y - fairH * 0.6, x - bw * 0.16, y - fairH, x, y - fairH);
    ctx.bezierCurveTo(x + bw * 0.16, y - fairH, x + bw / 2, y - fairH * 0.6, x + bw / 2, y);
    ctx.closePath();
    ctx.fillStyle = ceramicGradient(ctx, x - bw / 2, x + bw / 2, pal);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 90, 105, 0.35)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - fairH * 0.96);
    ctx.stroke();
  }

  private block(x: number, y: number, w: number, h: number) {
    const ctx = this.c.ctx;
    const pal = this.c.pal;
    // A horizontal propellant tank segment: domed ends, satin ceramic, Signal band.
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#f6f9fa');
    g.addColorStop(0.45, pal.ceramic);
    g.addColorStop(1, '#8e9fab');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(pal.accent, 0.95);
    ctx.fillRect(x + w * 0.44, y, w * 0.12, h);
    ctx.strokeStyle = 'rgba(40, 60, 75, 0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(x + 0.4, y + 0.4, w - 0.8, h - 0.8, h / 2);
    ctx.stroke();
  }

  private drawBlocks(x: number, panY: number, nowMs: number) {
    const sim = this.sim;
    const cols = 2;
    const bw = this.panW / cols - 6;
    const bh = Math.max(7, Math.min(13, (this.hang - 10) / Math.ceil(sim.config.maxBlocks / cols)));
    const pos = (i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { x: x - this.panW / 2 + 4 + col * (bw + 4), y: panY - 3 - (row + 1) * (bh + 1.5) };
    };
    const n = sim.n;
    for (let i = 0; i < n; i++) {
      if (sim.moving === -1 && i === n - 1) continue;
      const p = pos(i);
      this.block(p.x, p.y, bw, bh);
    }
    if (sim.moving !== 0) {
      const k = 1 - sim.busyS / sim.config.handlingS; // 0 → 1
      const idx = sim.moving === 1 ? n : n - 1;
      const p = pos(idx);
      const lift = this.hang * 1.1;
      const e = this.o.reducedMotion ? 1 : sim.moving === 1 ? 1 - Math.pow(1 - k, 2) : 1 - k;
      const y = p.y - lift * (1 - e);
      const ctx = this.c.ctx;
      ctx.save();
      ctx.globalAlpha = this.o.reducedMotion ? (sim.moving === 1 ? k : 1 - k) : 0.95;
      this.block(p.x, y, bw, bh);
      ctx.restore();
    }
    void nowMs;
  }

  private drawNeedle() {
    const c = this.c;
    const ctx = c.ctx;
    const { cx, R } = this;
    const py = this.hy;
    const a = this.dialAngle(Math.max(0, this.sim.needleMs));
    const len = R - (this.o.compact ? 10 : 16);
    ctx.save();
    ctx.translate(cx, py);
    ctx.rotate(a);
    if (!c.pal.highContrast) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
    }
    ctx.beginPath();
    ctx.moveTo(-len * 0.16, -3.2);
    ctx.lineTo(len, -0.8);
    ctx.lineTo(len, 0.8);
    ctx.lineTo(-len * 0.16, 3.2);
    ctx.closePath();
    const ng = ctx.createLinearGradient(0, -3, 0, 3);
    ng.addColorStop(0, '#ffffff');
    ng.addColorStop(1, '#b9c6cf');
    ctx.fillStyle = ng;
    ctx.fill();
    ctx.restore();
    // Hub.
    const hr = Math.max(6, R * 0.085);
    ctx.fillStyle = silverGradient(ctx, cx - hr, py - hr, cx + hr, py + hr);
    ctx.beginPath();
    ctx.arc(cx, py, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.pal.accent;
    ctx.beginPath();
    ctx.arc(cx, py, hr * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawButtons(held: 'add' | 'remove' | null) {
    const c = this.c;
    const t = this.o.t;
    const sim = this.sim;
    const plus = (x: number, y: number, s: number) => {
      const ctx = c.ctx;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s / 2, y);
      ctx.lineTo(x + s / 2, y);
      ctx.moveTo(x, y - s / 2);
      ctx.lineTo(x, y + s / 2);
      ctx.stroke();
    };
    const minus = (x: number, y: number, s: number) => {
      const ctx = c.ctx;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s / 2, y);
      ctx.lineTo(x + s / 2, y);
      ctx.stroke();
    };
    const ended = sim.done;
    const addLabel = sim.config.oneButton ? t(K + 'btn.drop') : t(K + 'btn.add');
    const addOff = ended || sim.pendingN >= sim.config.maxBlocks;
    const remOff = ended || sim.pendingN <= 0;
    const A = this.L.add;
    const Rm = this.L.remove;
    const x0 = Math.min(A.x, Rm ? Rm.x : A.x) - 12;
    const x1 = Math.max(A.x + A.w, Rm ? Rm.x + Rm.w : 0) + 12;
    const area = { x: x0, y: A.y - 12, w: x1 - x0, h: A.h + 26 };
    this.buttonLayer.blit(area, `${held}|${addOff}|${remOff}|${A.x},${A.y},${A.w}`, () => {
      c.button(A, addLabel, { primary: true, active: held === 'add', disabled: addOff, icon: plus });
      if (Rm) c.button(Rm, t(K + 'btn.remove'), { active: held === 'remove', disabled: remOff, icon: minus });
    });
  }

  private drawReading() {
    const c = this.c;
    const sim = this.sim;
    const s = sim.score();
    const label = this.o.t(K + 'reading', { dv: fmt(sim.dvMs / 1000, 2), n: sim.n });
    const r = { x: this.L.scale.x + 24, y: this.py + 30, w: this.L.scale.w - 48, h: Math.round(44 * Math.min(c.u, 1.3)) };
    c.statusStrip(r, s.success ? 'good' : 'bad', label);
  }
}
