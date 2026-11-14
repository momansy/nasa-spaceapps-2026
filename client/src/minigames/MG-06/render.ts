// MG-06 drawing: an electrodynamic shaker with a slip table and the satellite on its adapter
// ring (it flexes with this player's mode), the team resonance meter, the log-frequency sweep
// axis with every mode, and the damper: a band-forecast chart beside a vertical slider.
import { Canvas2D, clamp, fmt, KeyedLayer, pathRoundRect, pct, silverGradient, withAlpha, type Rect, type Status } from '../MG-02/kit';
import { A_MAX, F_HI_HZ, F_LO_HZ, sweepDir, ZETA_MAX, type Mg06Sim } from './model';

export interface Mg06ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export interface Mg06DrawState {
  timeMs: number;
  active?: boolean;
  /** Which modes have live teammate values (labelled "team" instead of "crew"). */
  teamKnown?: boolean[];
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

const K = 'minigame.MG-06.';
const PAST_S = 3;
const AHEAD_S = 2;
const METER_MAX = 4;

export class Mg06View {
  readonly c: Canvas2D;
  private sim: Mg06Sim;
  private readonly o: Mg06ViewOptions;
  private statusR: Rect | null = null;
  private hud: Rect[] = [];
  private scene!: Rect;
  private axis: Rect | null = null;
  chart!: Rect;
  slider!: Rect;
  private hintR: Rect | null = null;
  private hudLayer: KeyedLayer;
  private statusLayer: KeyedLayer;
  private axisLayer: KeyedLayer;
  private sceneLayer: KeyedLayer;
  private chartLayer: KeyedLayer;
  private sliderLayer: KeyedLayer;
  private meterLayer: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg06Sim, o: Mg06ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.hudLayer = new KeyedLayer(this.c);
    this.statusLayer = new KeyedLayer(this.c);
    this.axisLayer = new KeyedLayer(this.c);
    this.sceneLayer = new KeyedLayer(this.c);
    this.chartLayer = new KeyedLayer(this.c);
    this.sliderLayer = new KeyedLayer(this.c);
    this.meterLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg06Sim) {
    this.sim = sim;
    this.layout();
    this.axisLayer.invalidate();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  /** Track length of the slider, CSS px (drag scale). */
  get trackPx(): number {
    return this.slider.h - 24;
  }

  private layout() {
    const { W, H } = this.c;
    const c = this.c;
    const compact = this.o.compact;
    const pad = compact ? 8 : 14;
    const s = Math.min(c.u, 1.3);
    if (compact) {
      const sw = 54;
      this.scene = { x: pad, y: pad, w: (W - pad * 2) * 0.42, h: H - pad * 2 };
      const cx = this.scene.x + this.scene.w + 8;
      this.chart = { x: cx, y: pad, w: W - pad - sw - 6 - cx, h: H - pad * 2 };
      this.slider = { x: W - pad - sw, y: pad, w: sw, h: H - pad * 2 };
      this.statusR = null;
      this.hud = [];
      this.axis = null;
      this.hintR = null;
      return;
    }
    let y = pad;
    const statusH = Math.round(46 * s);
    this.statusR = { x: pad, y, w: W - pad * 2, h: statusH };
    y += statusH + 10;
    const readH = Math.round(70 * s);
    const gap = 8;
    const rw = (W - pad * 2 - gap * 2) / 3;
    this.hud = [0, 1, 2].map((i) => ({ x: pad + i * (rw + gap), y, w: rw, h: readH }));
    if (c.rtl) this.hud.reverse();
    y += readH + 10;
    const hintH = Math.round(28 * s);
    const axisH = Math.round(58 * s);
    const rest = H - pad - hintH - 8 - y - axisH - 20;
    const sceneH = Math.max(130, Math.round(rest * 0.48));
    this.scene = { x: pad, y, w: W - pad * 2, h: sceneH };
    y += sceneH + 10;
    this.axis = { x: pad, y, w: W - pad * 2, h: axisH };
    y += axisH + 10;
    const sw = Math.round(Math.max(64, 58 * s));
    const chartH = H - pad - hintH - 8 - y;
    this.chart = { x: c.rtl ? pad + sw + 8 : pad, y, w: W - pad * 2 - sw - 8, h: chartH };
    this.slider = { x: c.rtl ? pad : W - pad - sw, y, w: sw, h: chartH };
    this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
  }

  /** Damping ratio → y on the slider / chart (0 at the bottom). */
  private yOf(r: Rect, z: number): number {
    const top = r.y + 12;
    const bot = r.y + r.h - 12;
    return bot - (clamp(z, 0, ZETA_MAX) / ZETA_MAX) * (bot - top);
  }

  thumbPos(): { x: number; y: number } {
    return { x: this.slider.x + this.slider.w / 2, y: this.yOf(this.slider, this.sim.zeta) };
  }

  draw(st: Mg06DrawState) {
    const c = this.c;
    c.begin();
    c.backdrop(0.9);
    if (!this.o.compact) {
      this.drawStatus();
      this.drawHud();
      this.drawAxis(st.teamKnown ?? []);
    }
    this.drawScene(st.timeMs);
    this.drawChart();
    this.drawSlider(!!st.active);
    if (this.hintR) c.hint(this.hintR, this.o.t(this.sim.config.oneButton ? K + 'hint.one' : K + 'hint.drag'), !!st.active);
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private zoneStatus(): { s: Status; label: string } {
    const z = this.sim.zone;
    const t = this.o.t;
    if (z === 0) return { s: 'good', label: t(K + 'status.green') };
    if (z < 0) return { s: 'bad', label: t(K + 'status.resonance') };
    return { s: 'warn', label: t(K + 'status.over') };
  }

  private drawStatus() {
    const r = this.statusR!;
    const { s, label } = this.zoneStatus();
    this.statusLayer.blit({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, `${s}|${label}|${r.w}`, () => this.c.statusStrip(r, s, label));
  }

  private drawHud() {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const f = fmt(sim.fHz, 1);
    const fn = fmt(sim.plan.fnHz[sim.plan.mine]!, 1);
    const p = pct(sim.fraction);
    const need = pct(sim.config.inGreenMin);
    const key = `${f}|${fn}|${p}|${c.W}`;
    const r0 = this.hud[0]!;
    this.hudLayer.blit({ x: 0, y: r0.y - 6, w: c.W, h: r0.h + 26 }, key, () => {
      c.readout(this.hud[0]!, t(K + 'hud.sweep'), f, 'Hz', c.pal.sun);
      c.readout(this.hud[1]!, t(K + 'hud.mode'), fn, 'Hz', c.pal.accentStrong);
      const s: Status = sim.step === 0 ? 'warn' : p >= need ? 'good' : 'warn';
      c.readout(this.hud[2]!, t(K + 'hud.green', { pct: need }), String(p), '%', p >= need ? c.pal.good : c.pal.text, s);
    });
  }

  private fx(r: Rect, hz: number): number {
    const u = Math.log(hz / F_LO_HZ) / Math.log(F_HI_HZ / F_LO_HZ);
    const x0 = r.x + 14;
    const x1 = r.x + r.w - 14;
    return this.c.rtl ? x1 - u * (x1 - x0) : x0 + u * (x1 - x0);
  }

  private drawAxis(teamKnown: boolean[]) {
    const c = this.c;
    const r = this.axis!;
    const sim = this.sim;
    const t = this.o.t;
    this.axisLayer.blit({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 26 }, `${r.w}x${r.h}|${sim.plan.fnHz.join(',')}|${teamKnown.join(',')}|${c.rtl}`, () => {
      const ctx = c.ctx;
      c.glass(r, 14);
      const ay = r.y + r.h * 0.52;
      // Resonance zones (A could exceed the red line without damping): 0.667–1.247 × fn.
      for (let i = 0; i < sim.plan.fnHz.length; i++) {
        const fn = sim.plan.fnHz[i]!;
        const mine = i === sim.plan.mine;
        const xa = this.fx(r, fn * 0.667);
        const xb = this.fx(r, fn * 1.247);
        ctx.fillStyle = withAlpha(c.pal.bad, mine ? 0.22 : 0.1);
        ctx.fillRect(Math.min(xa, xb), ay - 9, Math.abs(xb - xa), 18);
      }
      ctx.fillStyle = withAlpha(c.pal.ceramic, 0.5);
      ctx.fillRect(r.x + 14, ay, r.w - 28, 1.5);
      const px = c.px(11, 1.2);
      for (const hz of [10, 20, 40, 60]) {
        const x = this.fx(r, hz);
        ctx.fillStyle = withAlpha(c.pal.ceramic, 0.6);
        ctx.fillRect(x - 0.5, ay - 4, 1, 8);
        c.text(`${hz} Hz`, clamp(x, r.x + px * 2.4, r.x + r.w - px * 2.4), r.y + r.h - px * 0.8, 60, px, 500, c.pal.faint, 'center');
      }
      for (let i = 0; i < sim.plan.fnHz.length; i++) {
        const fn = sim.plan.fnHz[i]!;
        const mine = i === sim.plan.mine;
        const x = this.fx(r, fn);
        ctx.fillStyle = mine ? c.pal.accent : c.pal.dim;
        ctx.beginPath();
        ctx.moveTo(x, ay - 3);
        ctx.lineTo(x - 6, ay - 13);
        ctx.lineTo(x + 6, ay - 13);
        ctx.closePath();
        ctx.fill();
        const label = mine ? t(K + 'axis.you') : t(teamKnown[i] ? K + 'axis.team' : K + 'axis.crew');
        c.text(label, x, r.y + px * 0.95, 70, px, 600, mine ? c.pal.accentStrong : c.pal.faint, 'center');
      }
    });
    // Sweep cursor (moves every frame).
    const ctx = c.ctx;
    const x = this.fx(r, sim.fHz);
    const ay = r.y + r.h * 0.52;
    ctx.fillStyle = c.pal.sun;
    ctx.fillRect(x - 1, ay - 14, 2, 28);
    const dir = sweepDir(sim.config, sim.timeS) * (c.rtl ? -1 : 1);
    ctx.beginPath();
    ctx.moveTo(x + dir * 12, ay + 10);
    ctx.lineTo(x + dir * 4, ay + 5);
    ctx.lineTo(x + dir * 4, ay + 15);
    ctx.closePath();
    ctx.fill();
  }

  private drawScene(nowMs: number) {
    const c = this.c;
    const ctx = c.ctx;
    const r = this.scene;
    const sim = this.sim;
    const compact = this.o.compact;
    const cx = r.x + r.w * (compact ? 0.5 : 0.36);
    const floorY = r.y + r.h - (compact ? 10 : 46);
    const unit = Math.min(r.w * (compact ? 0.9 : 0.62), r.h * 0.95) / 10;
    const bw = unit * 5.4;
    const bh = unit * 1.7;
    const by = floorY - bh;
    // Static chrome (panel, test-cell wall, floor glow, shaker body) is drawn once.
    this.sceneLayer.blit({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 26 }, `${r.w}x${r.h}@${r.x},${r.y}`, () => {
      const g = c.ctx;
      c.glass(r, 16);
      g.save();
      pathRoundRect(g, r, 16);
      g.clip();
      g.strokeStyle = 'rgba(150, 205, 228, 0.06)';
      g.lineWidth = 1;
      for (let x = r.x + 24; x < r.x + r.w; x += 34) {
        g.beginPath();
        g.moveTo(x, r.y);
        g.lineTo(x, floorY);
        g.stroke();
      }
      g.fillStyle = 'rgba(3, 10, 18, 0.35)';
      g.fillRect(r.x, floorY, r.w, r.y + r.h - floorY);
      const glow = g.createRadialGradient(cx, floorY, 4, cx, floorY, r.w * 0.4);
      glow.addColorStop(0, 'rgba(255, 190, 120, 0.18)');
      glow.addColorStop(1, 'rgba(255, 190, 120, 0)');
      g.fillStyle = glow;
      g.fillRect(r.x, r.y, r.w, r.h);
      const body = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      body.addColorStop(0, '#1a2c3b');
      body.addColorStop(0.45, '#3b5468');
      body.addColorStop(1, '#152430');
      g.fillStyle = body;
      g.beginPath();
      g.roundRect(cx - bw / 2, by, bw, bh, 6);
      g.fill();
      g.fillStyle = withAlpha(c.pal.accent, 0.85);
      g.fillRect(cx - bw / 2, by + bh * 0.35, bw, 3);
      g.fillStyle = 'rgba(200, 215, 225, 0.35)';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(cx - bw / 2 + (bw * (i + 0.5)) / 6, by + bh * 0.72, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    });
    ctx.save();
    pathRoundRect(ctx, r, 16);
    ctx.clip();
    // Table motion: tiny horizontal shake at a visual rate (none with reduced motion).
    const mine = sim.amps[sim.plan.mine] ?? 1;
    const amp = clamp((mine - 1) / 3.5, 0, 1);
    const phase = Math.sin((nowMs / 1000) * 2 * Math.PI * 7);
    const shake = this.o.reducedMotion ? 0 : phase * unit * 0.08 * (0.3 + amp);
    // Slip table.
    const tw = unit * 6.2;
    const th = unit * 0.45;
    const ty = by - th;
    ctx.fillStyle = silverGradient(ctx, cx - tw / 2, ty, cx + tw / 2, ty + th);
    ctx.fillRect(cx - tw / 2 + shake, ty, tw, th);
    ctx.fillStyle = 'rgba(40, 55, 65, 0.6)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(cx - tw / 2 + shake + (tw * (i + 0.5)) / 7, ty + th / 2, Math.max(1, unit * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    // Adapter ring.
    const aw = unit * 2.6;
    const ah = unit * 0.5;
    const ay = ty - ah;
    ctx.fillStyle = silverGradient(ctx, cx - aw / 2, 0, cx + aw / 2, 0);
    ctx.beginPath();
    ctx.moveTo(cx - aw / 2 + shake, ty);
    ctx.lineTo(cx - aw * 0.4 + shake, ay);
    ctx.lineTo(cx + aw * 0.4 + shake, ay);
    ctx.lineTo(cx + aw / 2 + shake, ty);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.pal.accent;
    ctx.fillRect(cx - aw * 0.42 + shake, ay, aw * 0.84, 2.5);
    // Payload, sheared by this player's mode (cantilever-like first mode).
    const pw = unit * 3.0;
    const ph = unit * 4.4;
    const maxSkew = 0.16;
    const drawPayload = (skew: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + shake, ay);
      ctx.transform(1, 0, -skew, 1, 0, 0);
      // Stowed solar wings on both sides.
      for (const side of [-1, 1]) {
        const wx = side < 0 ? -pw / 2 - unit * 0.42 : pw / 2 + unit * 0.06;
        ctx.fillStyle = '#16284a';
        ctx.fillRect(wx, -ph * 0.92, unit * 0.36, ph * 0.78);
        ctx.strokeStyle = '#c3ccd3';
        ctx.lineWidth = 1;
        ctx.strokeRect(wx, -ph * 0.92, unit * 0.36, ph * 0.78);
      }
      // Bus: gold blanket bands and ceramic panels.
      const gold = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0);
      gold.addColorStop(0, '#7d5a1e');
      gold.addColorStop(0.4, '#e0b45a');
      gold.addColorStop(1, '#8a6626');
      ctx.fillStyle = gold;
      ctx.fillRect(-pw / 2, -ph, pw, ph);
      const cer = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0);
      cer.addColorStop(0, '#f4f7f8');
      cer.addColorStop(0.6, c.pal.ceramic);
      cer.addColorStop(1, '#a9b6bf');
      ctx.fillStyle = cer;
      ctx.fillRect(-pw / 2, -ph * 0.8, pw, ph * 0.6);
      ctx.strokeStyle = 'rgba(70, 90, 105, 0.4)';
      ctx.beginPath();
      ctx.moveTo(-pw / 2, -ph * 0.5);
      ctx.lineTo(pw / 2, -ph * 0.5);
      ctx.moveTo(0, -ph * 0.8);
      ctx.lineTo(0, -ph * 0.2);
      ctx.stroke();
      ctx.fillStyle = c.pal.accent;
      ctx.fillRect(-pw / 2, -ph - 2, pw, 3);
      // Folded dish on top and accelerometer cubes (teal) at the corners.
      ctx.fillStyle = '#d9e0e4';
      ctx.beginPath();
      ctx.ellipse(0, -ph - unit * 0.3, pw * 0.3, unit * 0.22, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = c.pal.accentStrong;
      for (const [x, yy] of [
        [-pw / 2 + 3, -ph * 0.78],
        [pw / 2 - 9, -ph * 0.78],
        [-pw / 2 + 3, -ph * 0.26],
      ] as const)
        ctx.fillRect(x, yy, 6, 6);
      ctx.restore();
    };
    if (this.o.reducedMotion) {
      // No motion: the deflection envelope as two ghost outlines.
      if (amp > 0.02) {
        drawPayload(maxSkew * amp, 0.22);
        drawPayload(-maxSkew * amp, 0.22);
      }
      drawPayload(0, 1);
    } else drawPayload(maxSkew * amp * phase, 1);
    ctx.restore();
    if (!compact) {
      const mr = { x: r.x + r.w * 0.7, y: r.y + 12, w: r.w * 0.3 - 12, h: r.h - 24 };
      this.meterLayer.blit({ x: mr.x - 4, y: mr.y - 4, w: mr.w + 30, h: mr.h + 8 }, `${fmt(this.sim.meter, 2)}|${mr.w}x${mr.h}`, () => this.drawMeter(mr));
    }
  }

  /** Team resonance meter: mean amplification of every mode, vertical, red above the line. */
  private drawMeter(r: Rect) {
    const c = this.c;
    const ctx = c.ctx;
    const t = this.o.t;
    const m = this.sim.meter;
    const s: Status = m > A_MAX ? 'bad' : m > A_MAX * 0.8 ? 'warn' : 'good';
    const px = c.px(11.5, 1.2);
    c.text(t(K + 'meter.title'), r.x + r.w / 2, r.y + px * 0.6, r.w + 10, px, 600, c.pal.dim, 'center');
    const num = fmt(m, 1);
    c.numberWithUnit(num, '×', r.x + r.w / 2, r.y + px * 2.9, r.w, c.px(19, 1.25), c.statusColor(s), 'center');
    const bar = { x: r.x + r.w / 2 - 7, y: r.y + px * 3.8, w: 14, h: r.h - px * 3.8 - 2 };
    pathRoundRect(ctx, bar, 7);
    ctx.fillStyle = 'rgba(232, 238, 240, 0.1)';
    ctx.fill();
    const yOf = (v: number) => bar.y + bar.h - (clamp(v, 0, METER_MAX) / METER_MAX) * bar.h;
    // Red zone above the line.
    ctx.fillStyle = withAlpha(c.pal.bad, 0.22);
    ctx.fillRect(bar.x, bar.y, bar.w, yOf(A_MAX) - bar.y);
    const fy = yOf(m);
    ctx.save();
    pathRoundRect(ctx, bar, 7);
    ctx.clip();
    ctx.fillStyle = c.statusColor(s);
    ctx.fillRect(bar.x, fy, bar.w, bar.y + bar.h - fy);
    if (s !== 'good') {
      ctx.strokeStyle = withAlpha(c.pal.ink, 0.45);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = fy - bar.w; y < bar.y + bar.h; y += 6) {
        ctx.moveTo(bar.x, y + bar.w);
        ctx.lineTo(bar.x + bar.w, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    const ly = yOf(A_MAX);
    ctx.fillStyle = c.pal.text;
    ctx.fillRect(bar.x - 6, ly - 1, bar.w + 12, 2);
    c.statusIcon(s, bar.x + bar.w + 14, fy, Math.min(18, c.px(16, 1.2)));
  }

  private drawChart() {
    const c = this.c;
    const ctx = c.ctx;
    const r = this.chart;
    const sim = this.sim;
    const t = this.o.t;
    const compact = this.o.compact;
    const now = sim.timeS;
    const t0 = now - PAST_S;
    const t1 = now + AHEAD_S;
    const plot = { x: r.x + (compact ? 6 : 38), y: r.y + (compact ? 8 : 30), w: r.w - (compact ? 12 : 48), h: r.h - (compact ? 16 : 42) };
    const xOf = (ts: number) => {
      const u = (ts - t0) / (t1 - t0);
      return c.rtl ? plot.x + plot.w - u * plot.w : plot.x + u * plot.w;
    };
    const yOf = (z: number) => plot.y + plot.h - (clamp(z, 0, ZETA_MAX) / ZETA_MAX) * plot.h;
    this.chartLayer.blit({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 26 }, `${r.w}x${r.h}@${r.x},${r.y}|${compact}`, () => {
      c.glass(r, 16);
      if (compact) return;
      const g = c.ctx;
      const px = c.px(12, 1.25);
      c.textStart(t(K + 'chart.title'), { x: r.x + 12, y: r.y, w: r.w - 24, h: 0 }, r.y + 15, px, 600, c.pal.dim);
      for (const z of [0, 0.25, 0.5]) {
        const y = yOf(z);
        g.fillStyle = 'rgba(232, 238, 240, 0.08)';
        g.fillRect(plot.x, y, plot.w, 1);
        c.text(`${Math.round(z * 100)} %`, c.rtl ? plot.x + plot.w + 4 : plot.x - 4, y, 34, c.px(10.5, 1.15), 500, c.pal.faint, c.rtl ? 'left' : 'right');
      }
    });
    // Band ribbon over the window (sampled every 0.05 s; future dimmer).
    const n = 100;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const ts = t0 + ((t1 - t0) * i) / n;
      const b = sim.bandNow(sim.plan.mine, Math.max(0, Math.min(sim.config.playS, ts)));
      const x = xOf(ts);
      if (i === 0) ctx.moveTo(x, yOf(b.hi));
      else ctx.lineTo(x, yOf(b.hi));
    }
    for (let i = n; i >= 0; i--) {
      const ts = t0 + ((t1 - t0) * i) / n;
      const b = sim.bandNow(sim.plan.mine, Math.max(0, Math.min(sim.config.playS, ts)));
      ctx.lineTo(xOf(ts), yOf(b.lo));
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(xOf(t0), 0, xOf(t1), 0);
    g.addColorStop(0, withAlpha(c.pal.good, 0.42));
    g.addColorStop(PAST_S / (PAST_S + AHEAD_S), withAlpha(c.pal.good, 0.55));
    g.addColorStop(1, withAlpha(c.pal.good, 0.18));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = withAlpha(c.pal.good, 0.9);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // This player's damper history.
    ctx.strokeStyle = c.pal.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const s0 = Math.max(0, Math.floor(t0 * 120));
    let started = false;
    for (let s = s0; s < sim.step; s += 3) {
      const x = xOf(s / 120);
      const y = yOf(sim.history[s]!);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    if (started) ctx.lineTo(xOf(now), yOf(sim.zeta));
    ctx.stroke();
    // Now line and the current point.
    const nx = xOf(now);
    ctx.fillStyle = withAlpha(c.pal.accent, 0.7);
    ctx.fillRect(nx - 0.5, plot.y, 1, plot.h);
    ctx.fillStyle = c.statusColor(sim.zone === 0 ? 'good' : sim.zone < 0 ? 'bad' : 'warn');
    ctx.beginPath();
    ctx.arc(nx, yOf(sim.zeta), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSlider(active: boolean) {
    const c = this.c;
    const ctx = c.ctx;
    const r = this.slider;
    const sim = this.sim;
    const track = { x: r.x + r.w / 2 - 5, y: r.y + 12, w: 10, h: r.h - 24 };
    this.sliderLayer.blit({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 26 }, `${r.w}x${r.h}@${r.x},${r.y}|${active}`, () => {
      c.glass(r, 16, active);
      if (active) {
        c.ctx.strokeStyle = withAlpha(c.pal.accent, 0.7);
        c.ctx.lineWidth = 1.5;
        pathRoundRect(c.ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 15);
        c.ctx.stroke();
      }
      pathRoundRect(c.ctx, track, 5);
      c.ctx.fillStyle = 'rgba(232, 238, 240, 0.1)';
      c.ctx.fill();
    });
    const b = sim.bandNow();
    const y0 = this.yOf(r, b.hi);
    const y1 = this.yOf(r, b.lo);
    ctx.fillStyle = c.pal.good;
    pathRoundRect(ctx, { x: track.x - 3, y: y0, w: track.w + 6, h: Math.max(4, y1 - y0) }, 4);
    ctx.fill();
    // Thumb: silver knob with a teal grip and the value.
    const ty = this.yOf(r, sim.zeta);
    const kw = r.w - 12;
    const kh = Math.round(Math.max(34, 30 * Math.min(c.u, 1.3)));
    const knob = { x: r.x + 6, y: ty - kh / 2, w: kw, h: kh };
    pathRoundRect(ctx, { x: knob.x + 1, y: knob.y + 3, w: knob.w - 2, h: knob.h }, 10);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    pathRoundRect(ctx, knob, 10);
    ctx.fillStyle = silverGradient(ctx, knob.x, knob.y, knob.x, knob.y + knob.h);
    ctx.fill();
    const zs = sim.zone === 0 ? 'good' : sim.zone < 0 ? 'bad' : 'warn';
    c.statusBorder(knob, zs, 10, 2);
    ctx.fillStyle = c.pal.accent;
    ctx.fillRect(knob.x + 8, knob.y + 4, kw - 16, 2);
    c.numberWithUnit(String(pct(sim.zeta)), '%', knob.x + kw / 2, knob.y + kh * 0.72, kw - 8, this.o.compact ? 13 : c.px(15, 1.2), '#071522', 'center', 700, '#2c3e4c');
  }
}
