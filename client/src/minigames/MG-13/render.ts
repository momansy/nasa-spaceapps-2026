// MG-13 canvas renderer: the antenna sky view (az/el plot), the station on its pass, the
// antenna reticle with its lock circle, readouts and the data bar. Reads the simulation only.
// No radio beam is drawn between the antenna and the station (style guide).
import { fmt } from '../../data/format';
import { Canvas2D, makeLayer, pathRoundRect, withAlpha, type Rect } from './kit';
import { passPoint, type Mg13Sim, type SkyPoint } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg13ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg13Frame {
  timeMs: number;
  active: boolean;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

export class Mg13View {
  readonly c: Canvas2D;
  private sim: Mg13Sim;
  private readonly opts: Mg13ViewOptions;
  private layer: ReturnType<typeof makeLayer> = null;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dataBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Elevation profile panel (time → elevation, lock history), when there is room. */
  private profile: Rect | null = null;
  private chart: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly prof = new Float32Array(2 * 121);
  /** Sky plot centre and horizon radius, CSS px. */
  cx = 0;
  cy = 0;
  R = 100;
  private readonly probe: SkyPoint = { x: 0, y: 0, elDeg: 0, azDeg: 0 };
  private readonly track = new Float32Array(2 * 97);

  constructor(canvas: HTMLCanvasElement, sim: Mg13Sim, opts: Mg13ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.layout();
  }

  setSim(sim: Mg13Sim) {
    this.sim = sim;
    this.paintStatic();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  private layout() {
    const { c } = this;
    const { W, H } = c;
    const compact = this.opts.compact;
    const pad = compact ? 8 : 12;
    if (compact) {
      this.R = Math.max(30, Math.min(W * 0.36, H / 2 - pad - 6));
      this.cx = W / 2;
      this.cy = H / 2;
      this.dataBar = { x: pad, y: H - pad - 6, w: W - pad * 2, h: 6 };
    } else {
      const hudH = Math.round(64 * Math.min(c.u, 1.4));
      const stripH = Math.round(40 * Math.min(c.u, 1.4));
      const barH = Math.round(54 * Math.min(c.u, 1.35));
      const hintH = Math.round(28 * Math.min(c.u, 1.5));
      this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
      this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
      const top = this.strip.y + stripH + 10;
      this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
      this.dataBar = { x: pad, y: this.hintR.y - 8 - barH, w: W - pad * 2, h: barH };
      const avail = this.dataBar.y - 10 - top;
      const labelRoom = c.px(14, 1.4) + 6;
      this.R = Math.max(60, Math.min((W - pad * 2) / 2 - labelRoom, avail / 2 - labelRoom));
      const plotH = 2 * (this.R + labelRoom);
      const spare = avail - plotH;
      this.cx = W / 2;
      // Spare height goes to the elevation profile of the pass (with the lock history).
      if (spare >= 100) {
        const ph = Math.min(Math.round(150 * Math.min(c.u, 1.3)), spare - 10);
        const gapY = (spare - ph) / 3;
        this.cy = top + gapY + plotH / 2;
        this.profile = { x: pad, y: top + gapY * 2 + plotH, w: W - pad * 2, h: ph };
      } else {
        this.cy = top + avail / 2;
        this.profile = null;
      }
    }
    this.paintStatic();
  }

  /** Sky-plot coordinates → CSS px. */
  px(x: number): number {
    return this.cx + x * this.R;
  }
  py(y: number): number {
    return this.cy + y * this.R;
  }

  private paintStatic() {
    const layer = makeLayer(this.c);
    this.layer = layer;
    if (!layer) return;
    const ctx = layer.ctx;
    const { pal } = this.c;
    const { cx, cy, R } = this;
    const t = this.opts.t;

    // Sky dome: navy with a little more light towards the horizon.
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#0a1d33');
    g.addColorStop(0.85, '#0f2a45');
    g.addColorStop(1, '#173b5a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Elevation rings at 0°, 30°, 60° and azimuth spokes every 30°.
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.75);
    ctx.lineWidth = 1;
    for (const el of [30, 60]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1 - el / 90), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    for (let az = 0; az < 360; az += 30) {
      const a = (az * Math.PI) / 180;
      ctx.moveTo(cx + Math.sin(a) * R * 0.04, cy - Math.cos(a) * R * 0.04);
      ctx.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
    }
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.35);
    ctx.stroke();
    // Horizon ring.
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.lineStrong;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // Zenith mark.
    ctx.fillStyle = withAlpha(pal.dim, 0.6);
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (!this.opts.compact) {
      // Compass letters outside the horizon, elevation labels along the north spoke.
      const lp = this.c.px(13, 1.4);
      ctx.font = this.c.font(lp, 800, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.dim;
      const off = R + lp * 0.85;
      ctx.fillText(t('minigame.MG-13.plot.n'), cx, cy - off);
      ctx.fillText(t('minigame.MG-13.plot.s'), cx, cy + off);
      ctx.fillText(t('minigame.MG-13.plot.e'), cx + off, cy);
      ctx.fillText(t('minigame.MG-13.plot.w'), cx - off, cy);
      const sp = this.c.px(10.5, 1.3);
      ctx.font = this.c.font(sp, 600, true);
      ctx.fillStyle = pal.faint;
      ctx.textAlign = 'left';
      for (const el of [0, 30, 60]) {
        const r = R * (1 - el / 90);
        ctx.fillText(`${fmt(el, 0)}°`, cx + 5, cy - r + sp * 0.75);
      }
    }

    if (this.profile && !this.opts.compact) this.paintProfile(ctx);

    // Predicted pass, dashed (a pass plot shows the predicted track before the pass).
    const pass = this.sim.pass;
    const n = this.track.length / 2;
    for (let i = 0; i < n; i++) {
      passPoint(pass, (i / (n - 1)) * pass.durationS, this.probe);
      this.track[i * 2] = this.px(this.probe.x);
      this.track[i * 2 + 1] = this.py(this.probe.y);
    }
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = withAlpha(pal.dim, 0.55);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(this.track[0]!, this.track[1]!);
      else ctx.lineTo(this.track[i * 2]!, this.track[i * 2 + 1]!);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Rise and set marks.
    for (const k of [0, n - 1]) {
      ctx.fillStyle = pal.bg0;
      ctx.strokeStyle = pal.dim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.track[k * 2]!, this.track[k * 2 + 1]!, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Static part of the elevation profile: panel, axes, the predicted elevation curve. */
  private paintProfile(ctx: CanvasRenderingContext2D) {
    const pr = this.profile!;
    const c = this.c;
    const { pal } = c;
    const t = this.opts.t;
    const lp = c.px(10.5);
    pathRoundRect(ctx, pr, 10);
    ctx.fillStyle = withAlpha(pal.bg2, 0.94);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.lineStrong;
    ctx.stroke();
    ctx.font = c.font(lp, 700);
    ctx.fillStyle = pal.dim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = c.rtl ? 'right' : 'left';
    ctx.fillText(t('minigame.MG-13.profile.title'), c.rtl ? pr.x + pr.w - 10 : pr.x + 10, pr.y + 10 + lp * 0.5);
    const axisW = c.px(30, 1.3);
    const tickPx = c.px(10, 1.3);
    const chart = { x: pr.x + 10 + axisW, y: pr.y + 18 + lp, w: pr.w - 22 - axisW, h: pr.h - 26 - lp - tickPx };
    this.chart = chart;
    // Elevation grid 0 / 30 / 60 / 90 degrees and time ticks every 5 s.
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.font = c.font(tickPx, 600, true);
    ctx.fillStyle = pal.faint;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const el of [0, 30, 60, 90]) {
      const y = Math.round(chart.y + chart.h * (1 - el / 90)) + 0.5;
      ctx.moveTo(chart.x, y);
      ctx.lineTo(chart.x + chart.w, y);
      ctx.fillText(`${fmt(el, 0)}°`, chart.x - 5, y);
    }
    const dur = this.sim.pass.durationS;
    ctx.textBaseline = 'top';
    for (let s = 0; s <= dur + 0.01; s += 5) {
      const x = Math.round(chart.x + (s / dur) * chart.w) + 0.5;
      ctx.moveTo(x, chart.y);
      ctx.lineTo(x, chart.y + chart.h);
      ctx.textAlign = s === 0 ? 'left' : s + 5 > dur + 0.01 ? 'right' : 'center';
      ctx.fillText(`${fmt(s, 0)} s`, x, chart.y + chart.h + 3);
    }
    ctx.stroke();
    // Predicted elevation, dashed.
    const n = this.prof.length / 2;
    for (let i = 0; i < n; i++) {
      passPoint(this.sim.pass, (i / (n - 1)) * dur, this.probe);
      this.prof[i * 2] = chart.x + (i / (n - 1)) * chart.w;
      this.prof[i * 2 + 1] = chart.y + chart.h * (1 - this.probe.elDeg / 90);
    }
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = withAlpha(pal.dim, 0.6);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(this.prof[0]!, this.prof[1]!);
      else ctx.lineTo(this.prof[i * 2]!, this.prof[i * 2 + 1]!);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Live part of the profile: the curve so far, the lock ribbon and the "now" cursor. */
  private drawProfile() {
    const { ctx, pal } = this.c;
    const sim = this.sim;
    const ch = this.chart;
    const total = sim.totalSteps;
    const done = sim.step;
    if (done < 2) return;
    // Lock ribbon along the bottom: solid green = locked, pale amber with a line = no lock.
    const rb = { x: ch.x, y: ch.y + ch.h - 7, w: ch.w, h: 7 };
    let runStart = 0;
    let runVal = sim.lockHistory[0]!;
    const stride = Math.max(1, Math.floor(total / ch.w));
    const flush = (end: number) => {
      const x0 = rb.x + (runStart / total) * rb.w;
      const w = Math.max(1, ((end - runStart) / total) * rb.w);
      ctx.fillStyle = runVal ? pal.good : withAlpha(pal.warn, 0.35);
      ctx.fillRect(x0, rb.y, w, rb.h);
      if (!runVal) {
        ctx.fillStyle = pal.warn;
        ctx.fillRect(x0, rb.y + rb.h / 2 - 1, w, 2);
      }
    };
    for (let i = stride; i < done; i += stride) {
      const v = sim.lockHistory[i]!;
      if (v !== runVal) {
        flush(i);
        runStart = i;
        runVal = v;
      }
    }
    flush(done);
    // Elevation so far, solid.
    const n = this.prof.length / 2;
    const upto = Math.min(n - 1, Math.floor((done / total) * (n - 1)));
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pal.ceramic;
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) {
      if (i === 0) ctx.moveTo(this.prof[0]!, this.prof[1]!);
      else ctx.lineTo(this.prof[i * 2]!, this.prof[i * 2 + 1]!);
    }
    const hx = ch.x + (done / total) * ch.w;
    const hy = ch.y + ch.h * (1 - sim.station.elDeg / 90);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(pal.accent, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(hx) + 0.5, ch.y);
    ctx.lineTo(Math.round(hx) + 0.5, ch.y + ch.h);
    ctx.stroke();
    ctx.fillStyle = pal.ceramic;
    ctx.beginPath();
    ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Ground-station marker: a small dish on a ceramic disc. */
  private station(x: number, y: number, s: number) {
    const ctx = this.c.ctx;
    const { pal } = this.c;
    ctx.fillStyle = pal.ceramic;
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#123049';
    ctx.fillStyle = '#123049';
    ctx.lineWidth = Math.max(1.5, s * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x - s * 0.12, y - s * 0.12, s * 0.58, Math.PI * 0.05, Math.PI * 1.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.05);
    ctx.lineTo(x + s * 0.12, y + s * 0.62);
    ctx.moveTo(x - s * 0.3, y + s * 0.62);
    ctx.lineTo(x + s * 0.45, y + s * 0.62);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  draw(f: Mg13Frame) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    const locked = sim.locked;
    c.begin();
    if (this.layer) ctx.drawImage(this.layer.canvas, 0, 0, c.W, c.H);

    // Travelled part of the pass, solid.
    const n = this.track.length / 2;
    const upto = Math.min(n - 1, Math.floor((sim.timeS / sim.pass.durationS) * (n - 1)));
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = withAlpha(pal.ceramic, 0.75);
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) {
      if (i === 0) ctx.moveTo(this.track[0]!, this.track[1]!);
      else ctx.lineTo(this.track[i * 2]!, this.track[i * 2 + 1]!);
    }
    ctx.lineTo(this.px(sim.station.x), this.py(sim.station.y));
    ctx.stroke();

    // Station.
    const sx = this.px(sim.station.x);
    const sy = this.py(sim.station.y);
    this.station(sx, sy, opts.compact ? 7 : 10);

    // Reticle: lock circle + crosshair ticks. Solid when locked, dashed when not.
    const rx = this.px(sim.rx);
    const ry = this.py(sim.ry);
    const lr = sim.config.lockRadius * this.R;
    const col = locked ? pal.good : pal.accent;
    ctx.save();
    if (locked) {
      ctx.fillStyle = withAlpha(pal.good, 0.14);
      ctx.beginPath();
      ctx.arc(rx, ry, lr, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.setLineDash([6, 5]);
    ctx.lineWidth = opts.compact ? 2 : 2.5;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(rx, ry, lr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    const tick = Math.max(5, lr * 0.35);
    ctx.moveTo(rx - lr - tick * 0.6, ry);
    ctx.lineTo(rx - lr + tick, ry);
    ctx.moveTo(rx + lr - tick, ry);
    ctx.lineTo(rx + lr + tick * 0.6, ry);
    ctx.moveTo(rx, ry - lr - tick * 0.6);
    ctx.lineTo(rx, ry - lr + tick);
    ctx.moveTo(rx, ry + lr - tick);
    ctx.lineTo(rx, ry + lr + tick * 0.6);
    ctx.stroke();
    // Re-centre flash in one-button mode (steady ring in reduced motion).
    if (sim.recentre > 0 && !opts.reducedMotion) {
      ctx.strokeStyle = withAlpha(pal.accentStrong, (sim.recentre / 30) * 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, lr * (1.6 - sim.recentre / 60), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);

    if (opts.compact) {
      c.meter(this.dataBar, sim.lockSteps / sim.totalSteps, sim.config.lockFractionMin, sim.lockSteps >= sim.config.lockFractionMin * sim.totalSteps ? 'good' : 'warn');
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }

    // ── readouts ──
    const gap = 8;
    const tw = (this.hud.w - gap) / 2;
    const left: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
    const right: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
    const [first, second] = c.rtl ? [right, left] : [left, right];
    c.readout(first, t('minigame.MG-13.hud.elevation'), fmt(sim.station.elDeg, 0), '°', pal.text);
    const share = sim.lockFraction;
    const need = sim.config.lockFractionMin;
    const onTrack = sim.step === 0 || share >= need;
    c.readout(second, `${t('minigame.MG-13.hud.lock')} · ${t('minigame.MG-13.hud.need', { pct: fmt(need * 100, 0) })}`, fmt(Math.floor(share * 100 + 1e-9), 0), '%', onTrack ? pal.good : pal.warn, onTrack ? 'good' : 'warn');

    c.statusStrip(this.strip, locked ? 'good' : 'warn', t(locked ? 'minigame.MG-13.status.locked' : 'minigame.MG-13.status.lost'));

    // ── data bar: data received against the share needed by the end of the pass ──
    const db = this.dataBar;
    c.panel(db, 10);
    const lp = c.px(10.5);
    const inner = 10;
    const label = t('minigame.MG-13.hud.data');
    c.text(label, c.rtl ? db.x + db.w - inner : db.x + inner, db.y + inner + lp * 0.5, db.w * 0.6, lp, 700, pal.dim, c.rtl ? 'right' : 'left');
    const dataText = `${fmt(sim.dataMbit, 0)} / ${fmt(sim.fullDataMbit, 0)}`;
    c.numberWithUnit(dataText, 'Mbit', c.rtl ? db.x + inner : db.x + db.w - inner, db.y + inner + lp * 0.95, db.w * 0.38, c.px(14), pal.text, c.rtl ? 'left' : 'right');
    const frac = sim.lockSteps / sim.totalSteps;
    const meterR: Rect = { x: db.x + inner, y: db.y + db.h - inner - 9, w: db.w - inner * 2, h: 9 };
    c.meter(meterR, frac, need, frac >= need ? 'good' : 'warn');
    if (this.profile) this.drawProfile();

    const hintKey = sim.config.oneButton ? 'minigame.MG-13.hint.press' : 'minigame.MG-13.hint.drag';
    c.hint(this.hintR, t(hintKey), f.active);

    if (f.pausedText) c.overlay(f.pausedText);
  }
}
