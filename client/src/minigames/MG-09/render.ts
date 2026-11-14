// MG-09 canvas renderer: read-outs, status strip, the ascent-path inset (altitude against
// downrange, with the rocket at the player's angle) and the scrolling trace lane (flight-path
// angle against time, the corridor, the guide ahead and the player's trace). Reads the model.
import { fmt } from '../../data/format';
import type { Mg09Sim } from './model';
import { STEP_HZ } from './shared/core';
import { drawRocket, rect, View2D, withAlpha, type Rect, type Translate } from './shared/draw';

export interface Mg09Frame {
  timeMs: number;
  /** Play seconds to show (the simulation may lag a few ms behind). */
  nowS: number;
  active: boolean;
  pausedText?: string | null;
  /** Demo: draw a ghost finger at the marker. */
  finger?: boolean;
  /** One button: the button is down. */
  pressed?: boolean;
}

export class Mg09View extends View2D {
  private sim: Mg09Sim;
  private readonly compact: boolean;
  private hud = rect(0, 0, 0, 0);
  private strip = rect(0, 0, 0, 0);
  private inset = rect(0, 0, 0, 0);
  private lane = rect(0, 0, 0, 0);
  private hint = rect(0, 0, 0, 0);
  private yMin = 0;
  private insetScale = 1;
  private insetOrigin = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, sim: Mg09Sim, t: Translate, reducedMotion: boolean, compact: boolean) {
    super(canvas, t, reducedMotion);
    this.sim = sim;
    this.compact = compact;
    this.layout();
  }

  setSim(sim: Mg09Sim) {
    this.sim = sim;
    this.layout();
  }

  resize() {
    this.measure();
    this.layout();
  }

  /** Lane rectangle (pointer mapping). */
  get laneRect(): Rect {
    return this.lane;
  }

  private layout() {
    const { W, H, us } = this;
    const pad = this.compact ? 8 : 12;
    let y = pad;
    if (this.compact) {
      this.hud = rect(0, 0, 0, 0);
      this.strip = rect(0, 0, 0, 0);
      this.hint = rect(0, 0, 0, 0);
      this.inset = rect(W - pad - W * 0.34 - 4, H - pad - H * 0.42 - 4, W * 0.34, H * 0.42);
      this.lane = rect(pad, pad, W - pad * 2, H - pad * 2);
    } else {
      const hudH = Math.round(60 * Math.min(this.u, 1.45));
      this.hud = rect(pad, y, W - pad * 2, hudH);
      y += hudH + 8;
      const stripH = Math.round(36 * us);
      this.strip = rect(pad, y, W - pad * 2, stripH);
      y += stripH + 8;
      const hintH = Math.round(26 * us);
      this.hint = rect(pad, H - pad - hintH, W - pad * 2, hintH);
      const rest = this.hint.y - 6 - y;
      const insetH = Math.max(90, Math.round(rest * 0.3));
      this.inset = rect(pad, y, W - pad * 2, insetH);
      y += insetH + 8;
      this.lane = rect(pad, y, W - pad * 2, Math.max(120, this.hint.y - 6 - y));
    }
    // Angle axis: from a little under the lowest angle of this run up to 90°.
    let lo = 90;
    const g = this.sim.curve.gammaDeg;
    for (let i = 0; i < g.length; i += 24) lo = Math.min(lo, g[i]!);
    this.yMin = Math.max(0, Math.floor((lo - 8) / 10) * 10);
    // Inset: equal km scales on both axes so that angles look true. The chart takes the
    // logical start of the panel; the read-outs the end.
    const c = this.sim.curve;
    const maxX = Math.max(1, c.xKm[c.steps]!) * 1.15;
    const maxH = Math.max(1, c.hKm[c.steps]!) * 1.1;
    const ir = this.innerInset();
    const chartW = this.compact ? ir.w : Math.min(ir.w * 0.62, (ir.h * maxX) / maxH);
    this.insetScale = Math.min(chartW / maxX, ir.h / maxH);
    const usedW = maxX * this.insetScale;
    this.insetChart = rect(this.rtl && !this.compact ? ir.x + ir.w - usedW : ir.x, ir.y, usedW, ir.h);
    this.insetOrigin = { x: this.insetChart.x, y: ir.y + ir.h };
  }

  private insetChart = rect(0, 0, 0, 0);

  private innerInset(): Rect {
    const r = this.inset;
    const top = this.compact ? 6 : Math.round(24 * Math.min(this.u, 1.3));
    const side = this.compact ? 6 : 12;
    return rect(r.x + side, r.y + top, r.w - side * 2, r.h - top - (this.compact ? 6 : 10));
  }

  markerX(): number {
    return this.lane.x + this.lane.w * 0.3;
  }

  yOf(deg: number): number {
    const f = (deg - this.yMin) / (90 - this.yMin);
    const top = this.lane.y + 10;
    const h = this.lane.h - 20;
    return top + h * (1 - Math.min(1.04, Math.max(-0.04, f)));
  }

  degOfY(y: number): number {
    const top = this.lane.y + 10;
    const h = this.lane.h - 20;
    const f = 1 - (y - top) / h;
    return this.yMin + f * (90 - this.yMin);
  }

  private pxPerS(): number {
    return this.lane.w / this.sim.config.laneSpanS;
  }

  draw(f: Mg09Frame) {
    this.begin();
    this.drawLane(f);
    this.drawInset(f);
    if (!this.compact) {
      this.drawHud();
      this.drawStatus();
      const key = this.sim.config.oneButton ? 'minigame.MG-09.hint.one' : 'minigame.MG-09.hint.drag';
      this.ctx.textBaseline = 'middle';
      this.textCenter(this.t(key), this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 1, this.hint.w, 13 * this.us, 600, false, f.active ? this.pal.accentStrong : this.pal.dim);
      this.ctx.textBaseline = 'alphabetic';
    }
    if (f.pausedText) this.paused(f.pausedText);
  }

  private zoneOf(err: number): 0 | 1 | -1 {
    const thr = this.sim.config.deviationMaxDeg;
    return err > thr ? 1 : err < -thr ? -1 : 0;
  }

  private drawHud() {
    const { pal, sim } = this;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const a = rect(this.hud.x, this.hud.y, w, this.hud.h);
    const b = rect(this.hud.x + w + gap, this.hud.y, w, this.hud.h);
    const first = this.rtl ? b : a;
    const second = this.rtl ? a : b;
    const zone = this.zoneOf(sim.errNow);
    const zc = zone === 0 ? pal.good : pal.warn;
    this.tile(first, this.t('minigame.MG-09.hud.angle'), fmt(sim.gammaDeg, 0), '°', zone === 0 ? pal.text : zc, { kind: zone === 0 ? 'ok' : zone === 1 ? 'up' : 'down', color: zc });
    const thr = sim.config.deviationMaxDeg;
    const mean = sim.meanErr;
    const ok = mean <= thr;
    this.tile(second, this.t('minigame.MG-09.hud.mean', { max: fmt(thr, 1) }), fmt(mean, 1, 1), '°', ok ? pal.good : pal.warn, { kind: ok ? 'ok' : 'warn', color: ok ? pal.good : pal.warn });
    // Mean-error bar with a notch at the limit.
    const bx = second.x + 10;
    const bw = second.w - 20;
    const by = second.y + second.h - 5;
    const ctx = this.ctx;
    ctx.fillStyle = withAlpha(pal.lineStrong, 0.6);
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = ok ? pal.good : pal.warn;
    const frac = Math.min(1, mean / (thr * 2));
    ctx.fillRect(this.rtl ? bx + bw * (1 - frac) : bx, by, bw * frac, 3);
    ctx.fillStyle = pal.text;
    ctx.fillRect(bx + bw * 0.5 - 1, by - 3, 2, 8);
  }

  private drawStatus() {
    const zone = this.zoneOf(this.sim.errNow);
    const key = zone === 0 ? 'minigame.MG-09.status.on' : zone === 1 ? 'minigame.MG-09.status.steep' : 'minigame.MG-09.status.shallow';
    const far = Math.abs(this.sim.errNow) > this.sim.config.deviationMaxDeg * 2.5;
    this.statusStrip(this.strip, zone === 0 ? 'good' : far ? 'bad' : 'warn', zone === 0 ? 'ok' : zone === 1 ? 'up' : 'down', this.t(key));
  }

  private drawLane(f: Mg09Frame) {
    const { ctx, pal, sim, lane } = this;
    const cfg = sim.config;
    const nowS = f.nowS;
    const mx = this.markerX();
    const pps = this.pxPerS();
    const xOf = (tS: number) => mx + (tS - nowS) * pps;
    const thr = cfg.deviationMaxDeg;
    const guideEndS = Math.min(sim.curve.durationS, nowS + cfg.guideAheadS);
    const pastS = Math.max(0, nowS - (mx - lane.x) / pps);

    this.panel(lane, 12, pal.bg0, pal.lineStrong, 1);
    ctx.save();
    this.roundRect(lane, 12);
    ctx.clip();

    // Faint guides every 10° (labels below), and scrolling one-second ticks along the bottom
    // edge instead of a full lattice: a chart in the UI language, not a debug grid.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.09)';
    ctx.beginPath();
    for (let d = this.yMin; d <= 90; d += 10) {
      const y = Math.round(this.yOf(d)) + 0.5;
      ctx.moveTo(lane.x, y);
      ctx.lineTo(lane.x + lane.w, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.28)';
    ctx.beginPath();
    for (let s = Math.ceil(pastS); s <= nowS + cfg.laneSpanS; s++) {
      const x = Math.round(xOf(s)) + 0.5;
      const big = s % 5 === 0;
      ctx.moveTo(x, lane.y + lane.h - (big ? 10 : 5));
      ctx.lineTo(x, lane.y + lane.h);
    }
    ctx.stroke();
    if (!this.compact) {
      const px = 11 * Math.min(this.u, 1.4);
      ctx.font = this.font(px, 600, true);
      ctx.fillStyle = pal.faint;
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      for (let d = this.yMin + 10; d <= 90; d += 10) {
        if (d % 20 !== 0 && this.u > 1.3) continue;
        const y = this.yOf(d) - 3;
        if (y < lane.y + px * 1.9) continue;
        ctx.fillText(`${fmt(d, 0)}°`, lane.x + 6, y);
      }
      ctx.direction = this.rtl ? 'rtl' : 'ltr';
    }

    // Corridor ±threshold around the ideal line, from the left edge to the end of the guide.
    const step = 1 / 30; // s per vertex
    const t0 = pastS;
    ctx.beginPath();
    let first = true;
    for (let s = t0; s <= guideEndS + 1e-6; s += step) {
      const x = xOf(s);
      const y = this.yOf(sim.idealAtS(s) + thr);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else ctx.lineTo(x, y);
    }
    for (let s = guideEndS; s >= t0 - 1e-6; s -= step) ctx.lineTo(xOf(s), this.yOf(sim.idealAtS(s) - thr));
    ctx.closePath();
    ctx.fillStyle = withAlpha(pal.good, 0.13);
    ctx.fill();

    // Ideal line: solid up to now, brighter ahead (the guide), then it fades out.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = this.compact ? 2 : 3;
    ctx.strokeStyle = withAlpha(pal.dim, 0.55);
    ctx.beginPath();
    for (let s = t0; s <= nowS + 1e-6; s += step) {
      const x = xOf(s);
      const y = this.yOf(sim.idealAtS(s));
      if (s === t0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const grad = ctx.createLinearGradient(mx, 0, xOf(guideEndS), 0);
    grad.addColorStop(0, pal.text);
    grad.addColorStop(0.75, pal.text);
    grad.addColorStop(1, withAlpha(pal.text, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = this.compact ? 2.5 : 3.5;
    ctx.beginPath();
    for (let s = nowS; s <= guideEndS + 1e-6; s += step) {
      const x = xOf(s);
      const y = this.yOf(sim.idealAtS(s));
      if (s === nowS) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Guide limit: beyond it the line is not known yet.
    if (!this.compact && guideEndS < sim.curve.durationS) {
      const gx = Math.round(xOf(guideEndS)) + 0.5;
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = withAlpha(pal.faint, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, lane.y + 6);
      ctx.lineTo(gx, lane.y + lane.h - 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = this.font(10.5 * Math.min(this.u, 1.3), 650, true);
      ctx.fillStyle = pal.faint;
      ctx.textAlign = 'right';
      ctx.fillText(this.t('minigame.MG-09.lane.guide', { s: fmt(cfg.guideAheadS, 1) }), Math.min(lane.x + lane.w - 6, gx - 5), lane.y + lane.h - 8);
    }

    // One button: pitch cues as diamonds on the line, with their window.
    if (cfg.oneButton) {
      const cues = sim.curve.cuesS;
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i]!;
        if (c < t0 - 1 || c > nowS + cfg.laneSpanS) continue;
        const x = xOf(c);
        const y = this.yOf(sim.idealAtS(c));
        const hit = sim.cueHit[i]!;
        const w0 = xOf(c - cfg.cueWindowS);
        const w1 = xOf(c + cfg.cueWindowS);
        ctx.fillStyle = withAlpha(hit === 0 ? pal.warn : pal.accent, hit === 1 ? 0.08 : 0.16);
        ctx.fillRect(w0, lane.y, w1 - w0, lane.h);
        const s = this.compact ? 7 : 10;
        if (hit === 1) this.glyph('ok', x, y - s * 1.6, s * 1.4, pal.good);
        else if (hit === 0) this.glyph('stop', x, y - s * 1.6, s * 1.3, pal.warn);
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
        ctx.fillStyle = hit === 1 ? pal.good : hit === 0 ? pal.warn : pal.accentStrong;
        ctx.fill();
        ctx.strokeStyle = pal.bg0;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (!this.compact && hit === -1) {
          ctx.font = this.font(10.5 * Math.min(this.u, 1.3), 800, true);
          ctx.fillStyle = pal.accentStrong;
          ctx.textAlign = 'center';
          ctx.fillText(this.t('minigame.MG-09.cue'), x, y + s + 13);
        }
      }
    }

    // The player's trace, in the zone colour where it left the corridor.
    const k1 = sim.step;
    const k0 = Math.max(0, Math.floor(t0 * STEP_HZ));
    if (k1 > k0 + 1) {
      const stride = Math.max(1, Math.floor(STEP_HZ / 40));
      ctx.lineWidth = this.compact ? 2.5 : 3.5;
      ctx.strokeStyle = pal.accentStrong;
      ctx.beginPath();
      ctx.moveTo(xOf(k0 / STEP_HZ), this.yOf(sim.trace[k0]!));
      for (let k = k0 + stride; k < k1; k += stride) ctx.lineTo(xOf(k / STEP_HZ), this.yOf(sim.trace[k]!));
      ctx.lineTo(xOf(k1 / STEP_HZ), this.yOf(sim.trace[k1]!));
      ctx.stroke();
      ctx.strokeStyle = pal.warn;
      ctx.lineWidth = this.compact ? 3 : 4.5;
      ctx.beginPath();
      let open = false;
      for (let k = k0; k <= k1; k += stride) {
        if (sim.errHistory[k]! > thr) {
          const x = xOf(k / STEP_HZ);
          const y = this.yOf(sim.trace[k]!);
          if (open) ctx.lineTo(x, y);
          else {
            ctx.moveTo(x, y);
            open = true;
          }
        } else open = false;
      }
      ctx.stroke();
    }

    // Now line and the marker.
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(pal.accent, 0.6);
    ctx.beginPath();
    ctx.moveTo(Math.round(mx) + 0.5, lane.y);
    ctx.lineTo(Math.round(mx) + 0.5, lane.y + lane.h);
    ctx.stroke();
    const my = this.yOf(sim.gammaDeg);
    const zone = this.zoneOf(sim.errNow);
    const r = this.compact ? 6 : 9;
    if (zone === 0) {
      ctx.fillStyle = withAlpha(pal.good, 0.25);
      ctx.beginPath();
      ctx.arc(mx, my, r * (this.reducedMotion ? 2 : 1.9 + 0.3 * Math.sin(f.timeMs / 180)), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.text;
      ctx.strokeStyle = pal.good;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = withAlpha(pal.warn, 0.3);
      ctx.beginPath();
      ctx.arc(mx, my, r * 2, 0, Math.PI * 2);
      ctx.fill();
      this.glyph(zone === 1 ? 'up' : 'down', mx, my, r * 2.4, pal.bg0);
      this.glyph(zone === 1 ? 'up' : 'down', mx, my, r * 1.8, pal.warn);
    }
    // Where the line is now, as a tick on the now line.
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    const iy = this.yOf(sim.idealAt(sim.step));
    ctx.beginPath();
    ctx.moveTo(mx - r * 1.6, iy);
    ctx.lineTo(mx - r * 0.9, iy);
    ctx.moveTo(mx + r * 0.9, iy);
    ctx.lineTo(mx + r * 1.6, iy);
    ctx.stroke();

    if (f.finger) this.finger(mx + 34, my + 6, true, 16);
    else if (cfg.oneButton && f.pressed) {
      ctx.strokeStyle = withAlpha(pal.accentStrong, 0.8);
      ctx.lineWidth = 3;
      this.roundRect(rect(lane.x + 2, lane.y + 2, lane.w - 4, lane.h - 4), 11);
      ctx.stroke();
    }
    ctx.restore();

    if (!this.compact) {
      // Lane title on a plate that cuts the top edge of the frame.
      const px = 10.5 * Math.min(this.u, 1.3);
      const title = this.t('minigame.MG-09.lane.title');
      const size = this.fit(title, lane.w - 48, px, 700, true);
      const tw = ctx.measureText(title).width;
      const tx = this.rtl ? lane.x + lane.w - 14 - tw - 12 : lane.x + 14;
      ctx.fillStyle = pal.bg0;
      ctx.fillRect(tx, lane.y - size * 0.7, tw + 12, size * 1.4);
      ctx.fillStyle = pal.dim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, tx + 6, lane.y + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawInset(f: Mg09Frame) {
    const { ctx, pal, sim } = this;
    const r = this.inset;
    const ir = this.innerInset();
    const c = sim.curve;
    const oy = this.insetOrigin.y;
    this.backdrop(r, 12, Math.min(0.97, (oy - r.y) / r.h), this.rtl ? 'left' : 'right');
    const ox = this.insetOrigin.x;
    const s = this.insetScale;
    const X = (km: number) => ox + km * s;
    const Y = (km: number) => oy - km * s;
    ctx.save();
    this.roundRect(r, 12);
    ctx.clip();
    // Ideal path: dashed ahead, solid behind.
    const k = sim.step;
    const stride = 12;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(pal.dim, 0.75);
    ctx.beginPath();
    ctx.moveTo(X(c.xKm[Math.min(k, c.steps)]!), Y(c.hKm[Math.min(k, c.steps)]!));
    for (let i = k; i <= c.steps; i += stride) ctx.lineTo(X(c.xKm[i]!), Y(c.hKm[i]!));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    for (let i = 0; i <= k; i += stride) ctx.lineTo(X(c.xKm[i]!), Y(c.hKm[i]!));
    ctx.lineTo(X(c.xKm[Math.min(k, c.steps)]!), Y(c.hKm[Math.min(k, c.steps)]!));
    ctx.stroke();
    // The player's path.
    ctx.strokeStyle = pal.accentStrong;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    for (let i = 0; i <= k; i += stride) ctx.lineTo(X(sim.pxKm[i]!), Y(sim.phKm[i]!));
    ctx.lineTo(X(sim.pxKm[k]!), Y(sim.phKm[k]!));
    ctx.stroke();
    // Rocket at the player's head, nose along the player's flight-path angle.
    const len = this.compact ? 30 : Math.min(46, r.h * 0.42);
    const hx = X(sim.pxKm[k]!);
    const hy = Y(sim.phKm[k]!);
    const ang = ((90 - sim.gammaDeg) * Math.PI) / 180;
    // Bells sit behind the head along the path direction.
    const bx = hx - Math.sin(ang) * len * 0.55;
    const by = hy + Math.cos(ang) * len * 0.55;
    drawRocket(this, { x: bx, y: by, length: len, angle: ang, plume: 1, plumeLen: 2.6, time: f.timeMs / 1000, calm: this.reducedMotion, bells: 1 });
    ctx.restore();

    if (!this.compact) {
      ctx.textBaseline = 'alphabetic';
      const px = 10.5 * Math.min(this.u, 1.3);
      this.textStart(this.t('minigame.MG-09.inset.title'), r, 10, r.y + px + 7, px, 700, true, pal.dim, r.w * 0.6);
      // Read-outs of the ideal ascent at this moment, with units, in the free column.
      const kk = Math.min(k, c.steps);
      const col = rect(this.rtl ? r.x : this.insetChart.x + this.insetChart.w + 10, ir.y, Math.max(60, r.w - this.insetChart.w - 22 - 12), ir.h);
      const rows: Array<[string, string, string]> = [
        [this.t('minigame.MG-09.inset.alt'), fmt(c.hKm[kk]!, 1, 1), 'km'],
        [this.t('minigame.MG-09.inset.down'), fmt(c.xKm[kk]!, 1, 1), 'km'],
        [this.t('minigame.MG-09.inset.speed'), fmt(c.speedMs[kk]! / 1000, 2, 2), 'km/s'],
      ];
      const legendH = px * 1.6;
      // With large text there is room for fewer rows: speed goes first.
      const fitRows = Math.max(1, Math.min(rows.length, Math.floor((col.h - legendH) / (px * 1.1 + 22 * Math.min(this.u, 1.3)))));
      const rowH = Math.min((col.h - legendH) / fitRows, 46 * Math.min(this.u, 1.3));
      for (let i = 0; i < fitRows; i++) {
        const [label, num, unit] = rows[i]!;
        const y0 = col.y + i * rowH;
        this.textEnd(label, col, 4, y0 + px, px * 0.95, 650, true, pal.faint);
        const numPx = Math.min(18 * Math.min(this.u, 1.3), rowH - px * 1.3 - 4);
        // Right-aligned number + unit at the logical end.
        ctx.font = this.font(numPx, 800, true);
        const nw = ctx.measureText(num).width;
        ctx.font = this.font(numPx * 0.6, 700, true);
        const uw = ctx.measureText(unit).width;
        ctx.direction = 'ltr';
        const right = this.rtl ? col.x + 4 + nw + numPx * 0.2 + uw : col.x + col.w - 4;
        ctx.fillStyle = pal.dim;
        ctx.textAlign = 'right';
        ctx.fillText(unit, right, y0 + px * 1.2 + numPx + 2);
        ctx.font = this.font(numPx, 800, true);
        ctx.fillStyle = pal.text;
        ctx.fillText(num, right - uw - numPx * 0.2, y0 + px * 1.2 + numPx + 2);
        ctx.direction = this.rtl ? 'rtl' : 'ltr';
      }
      // Legend along the bottom of the read-outs.
      const ly = r.y + r.h - 9;
      ctx.font = this.font(px, 700, true);
      const you = this.t('minigame.MG-09.inset.you');
      const ideal = this.t('minigame.MG-09.inset.ideal');
      const yw = ctx.measureText(you).width;
      const iw = ctx.measureText(ideal).width;
      const total = 18 + iw + 12 + 18 + yw;
      let x = this.rtl ? col.x + 4 : col.x + col.w - 4 - total;
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.text;
      ctx.beginPath();
      ctx.moveTo(x, ly - px * 0.35);
      ctx.lineTo(x + 14, ly - px * 0.35);
      ctx.stroke();
      ctx.fillStyle = pal.text;
      ctx.fillText(ideal, x + 18, ly);
      x += 18 + iw + 12;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = pal.accentStrong;
      ctx.beginPath();
      ctx.moveTo(x, ly - px * 0.35);
      ctx.lineTo(x + 14, ly - px * 0.35);
      ctx.stroke();
      ctx.fillStyle = pal.accentStrong;
      ctx.fillText(you, x + 18, ly);
      ctx.direction = this.rtl ? 'rtl' : 'ltr';
    }
  }
}
