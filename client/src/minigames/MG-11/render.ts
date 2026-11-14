// MG-11 canvas renderer: status strip, read-outs, the bouncing vehicle against the style-frame
// backdrop, the metronome (an approach ring that closes on each beat), and the bounce trace with
// beat windows and the player's taps.
import { fmt, fmtSigned } from '../../data/format';
import { drawRocket, rect, View2D, withAlpha, type Translate } from '../MG-09/shared/draw';
import type { Mg11Sim } from './model';

export interface Mg11Frame {
  timeMs: number;
  pressed: boolean;
  pausedText?: string | null;
  finger?: boolean;
}

export class Mg11View extends View2D {
  private sim: Mg11Sim;
  private readonly compact: boolean;
  private strip = rect(0, 0, 0, 0);
  private hud = rect(0, 0, 0, 0);
  private scene = rect(0, 0, 0, 0);
  private metro = rect(0, 0, 0, 0);
  private wave = rect(0, 0, 0, 0);
  private hint = rect(0, 0, 0, 0);

  constructor(canvas: HTMLCanvasElement, sim: Mg11Sim, t: Translate, reducedMotion: boolean, compact: boolean) {
    super(canvas, t, reducedMotion);
    this.sim = sim;
    this.compact = compact;
    this.layout();
  }

  setSim(sim: Mg11Sim) {
    this.sim = sim;
  }

  resize() {
    this.measure();
    this.layout();
  }

  private layout() {
    const { W, H, us } = this;
    const pad = this.compact ? 8 : 12;
    let y = pad;
    if (!this.compact) {
      const stripH = Math.round(40 * us);
      this.strip = rect(pad, y, W - pad * 2, stripH);
      y += stripH + 8;
      const hudH = Math.round(60 * Math.min(this.u, 1.45));
      this.hud = rect(pad, y, W - pad * 2, hudH);
      y += hudH + 8;
    }
    const hintH = this.compact ? 0 : Math.round(24 * us);
    this.hint = rect(pad, H - pad - hintH, W - pad * 2, hintH);
    const waveH = this.compact ? Math.round(H * 0.28) : Math.round(Math.max(96, (H - y) * 0.2));
    this.wave = rect(pad, this.hint.y - (hintH ? 6 : 0) - waveH, W - pad * 2, waveH);
    const h = this.wave.y - 8 - y;
    const sw = Math.round((W - pad * 2) * 0.52);
    const a = rect(pad, y, sw, h);
    const b = rect(pad + sw + 10, y, W - pad * 2 - sw - 10, h);
    this.scene = this.rtl ? rect(W - pad - sw, y, sw, h) : a;
    this.metro = this.rtl ? rect(pad, y, b.w, h) : b;
  }

  draw(f: Mg11Frame) {
    this.begin();
    if (!this.compact) {
      this.drawStrip();
      this.drawHud();
    }
    this.drawScene(f);
    this.drawMetronome(f);
    this.drawWave();
    if (!this.compact) {
      this.ctx.textBaseline = 'middle';
      this.textCenter(this.t('minigame.MG-11.hint'), this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 1, this.hint.w, 12.5 * this.us, 600, false, f.pressed ? this.pal.accentStrong : this.pal.dim);
      this.ctx.textBaseline = 'alphabetic';
    }
    if (f.pausedText) this.paused(f.pausedText);
  }

  private lastSettled(): number {
    return this.sim.settledBeats - 1;
  }

  private drawStrip() {
    const s = this.sim;
    const k = this.lastSettled();
    if (k < 0) {
      this.statusStrip(this.strip, 'neutral', 'ring', this.t('minigame.MG-11.status.start'));
      return;
    }
    const good = s.settled[k] === 1;
    this.statusStrip(this.strip, good ? 'good' : 'warn', good ? 'ok' : 'warn', this.t(good ? 'minigame.MG-11.status.good' : 'minigame.MG-11.status.miss'));
  }

  private drawHud() {
    const { pal, sim } = this;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const a = rect(this.hud.x, this.hud.y, w, this.hud.h);
    const b = rect(this.hud.x + w + gap, this.hud.y, w, this.hud.h);
    const first = this.rtl ? b : a;
    const second = this.rtl ? a : b;
    const done = sim.settledBeats;
    const good = sim.goodBeats;
    const share = done ? good / done : 1;
    const ok = share >= sim.config.successMin;
    this.tile(first, this.t('minigame.MG-11.hud.beats', { pct: fmt(sim.config.successMin * 100, 0) }), `${fmt(good, 0)}/${fmt(done, 0)}`, this.t('minigame.MG-11.hud.beats_unit'), ok ? pal.good : pal.warn, { kind: ok ? 'ok' : 'warn', color: ok ? pal.good : pal.warn });
    const amp = sim.amp;
    const falling = amp < 0.999;
    this.tile(second, this.t('minigame.MG-11.hud.amp'), fmt(amp * 100, 0), '%', falling ? pal.text : pal.warn, { kind: falling ? 'down' : 'up', color: falling ? pal.good : pal.warn });
  }

  private drawScene(f: Mg11Frame) {
    const { ctx, pal, sim } = this;
    const r = this.scene;
    this.backdrop(r, 12, 1.12, this.rtl ? 'left' : 'right');
    const tS = sim.timeS;
    const d = sim.displacement(tS);
    const calm = this.reducedMotion;
    const len = Math.min((r.h * 0.8) / 1.09, r.w * 3);
    const cx = r.x + r.w / 2;
    const baseY = r.y + (r.h + len * 1.09) / 2 - len * 0.04;
    ctx.save();
    this.roundRect(r, 12);
    ctx.clip();
    // The bounce: a lengthwise squash and a small heave (none in reduced motion).
    const heave = calm ? 0 : d * len * 0.035;
    const squash = calm ? 1 : 1 + d * 0.045;
    drawRocket(this, { x: cx, y: baseY + heave, length: len, plume: 0.9 + 0.1 * d, plumeLen: 2.2, time: f.timeMs / 1000, calm, squash, bells: 3 });
    // Load arrows along the body show the bounce in every motion setting.
    const mag = Math.abs(d);
    if (mag > 0.08) {
      const col = withAlpha(mag > 0.6 ? pal.warn : pal.accentStrong, 0.85);
      const ax = cx + len / 11.5 + 14;
      const midY = baseY - len * 0.5;
      const span = len * 0.18 * mag;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 3;
      for (const dir of [-1, 1]) {
        const tip = midY + dir * (d < 0 ? span * 0.4 : span + 10);
        const tail = midY + dir * (d < 0 ? span + 10 : span * 0.4);
        ctx.beginPath();
        ctx.moveTo(ax, tail);
        ctx.lineTo(ax, tip);
        ctx.stroke();
        const head = Math.sign(tip - tail) || 1;
        ctx.beginPath();
        ctx.moveTo(ax, tip + head * 6);
        ctx.lineTo(ax - 6, tip - head * 3);
        ctx.lineTo(ax + 6, tip - head * 3);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    this.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.22)';
    ctx.stroke();
    if (!this.compact) {
      ctx.textBaseline = 'alphabetic';
      const px = 10.5 * Math.min(this.u, 1.3);
      this.textStart(this.t('minigame.MG-11.scene.freq', { hz: fmt(sim.config.hz, 2, 2) }), r, 10, r.y + px + 8, px, 700, true, pal.dim, r.w - 20);
    }
  }

  private drawMetronome(f: Mg11Frame) {
    const { ctx, pal, sim } = this;
    const r = this.metro;
    this.panel(r, 12, pal.bg1);
    const tS = sim.timeS;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h * (this.compact ? 0.5 : 0.44);
    const R = Math.min(r.w * 0.42, r.h * 0.3);
    const core = R * 0.42;
    // Next beat (or the one just played) and its approach.
    const k = Math.max(0, Math.min(sim.beatsS.length - 1, Math.ceil((tS - sim.t0S - sim.config.windowS) / sim.periodS)));
    const beat = sim.beatsS[k] ?? 0;
    const until = beat - tS;
    const T = sim.periodS;
    const inWindow = Math.abs(until) <= sim.config.windowS;
    // Window ring: where the closing ring has to be.
    const winR0 = core + (sim.config.windowS / T) * (R - core);
    ctx.fillStyle = withAlpha(pal.good, inWindow ? 0.32 : 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, winR0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.good;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Target core: a lit, domed button (light from the top), brighter inside the window.
    const lit = inWindow && !this.reducedMotion;
    const cg = ctx.createRadialGradient(cx - core * 0.3, cy - core * 0.45, core * 0.1, cx, cy, core);
    cg.addColorStop(0, lit ? '#d9f7e6' : '#b7e9cc');
    cg.addColorStop(0.55, lit ? pal.good : withAlpha(pal.good, 0.85));
    cg.addColorStop(1, lit ? '#3f9e6c' : 'rgba(63, 158, 108, 0.8)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textBaseline = 'middle';
    this.textCenter(this.t('minigame.MG-11.metro.tap'), cx, cy + 1, core * 1.7, core * 0.62, 900, false, pal.ink);
    // Closing ring.
    if (until > -sim.config.windowS && until < T) {
      const ringR = Math.max(core, core + Math.max(0, until / T) * (R - core));
      ctx.strokeStyle = withAlpha(pal.accent, 0.25);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = pal.accentStrong;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    // Outer bezel.
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
    ctx.stroke();
    if (f.pressed) {
      ctx.strokeStyle = withAlpha(pal.accentStrong, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 11, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (f.finger) this.finger(cx + core * 0.4, cy + core * 0.5, Math.abs(until) < 0.1, this.compact ? 12 : 18);
    ctx.textBaseline = 'alphabetic';
    if (this.compact) return;
    // Last result under the metronome.
    const last = this.lastSettled();
    const px = 12 * Math.min(this.u, 1.3);
    const ry = r.y + r.h - 14;
    if (last >= 0) {
      const off = sim.firstTap[last]!;
      const good = sim.settled[last] === 1;
      const text = Number.isNaN(off) ? this.t('minigame.MG-11.result.none') : `${fmtSigned(off, 2)} s`;
      const c = good ? pal.good : pal.warn;
      this.textCenter(text, cx + 10, ry, r.w - 50, px * 1.2, 800, true, c);
      const tw = ctx.measureText(text).width;
      this.glyph(good ? 'ok' : 'warn', cx + 10 - tw / 2 - 14, ry - px * 0.4, px * 1.1, c);
    }
    this.textCenter(this.t('minigame.MG-11.metro.window', { ms: fmt(sim.config.windowS * 1000, 0) }), cx, r.y + px + 8, r.w - 16, px * 0.9, 650, true, pal.dim);
    // One pip per beat: filled check-green = counter-phase, amber ring = missed, faint = to come.
    const n = sim.beatsS.length;
    const cols = Math.min(n, 9);
    const rows = Math.ceil(n / cols);
    const pip = Math.min(9, (r.w - 24) / (cols * 2.6));
    const gx = (r.w - (cols - 1) * pip * 2.6) / 2;
    const py0 = ry - px * 1.6 - (rows - 1) * pip * 2.6 - pip;
    for (let k = 0; k < n; k++) {
      const i = k % cols;
      const row = Math.floor(k / cols);
      const x = this.rtl ? r.x + r.w - gx - i * pip * 2.6 : r.x + gx + i * pip * 2.6;
      const y = py0 + row * pip * 2.6;
      const st = sim.settled[k]!;
      ctx.beginPath();
      ctx.arc(x, y, pip, 0, Math.PI * 2);
      if (st === 1) {
        ctx.fillStyle = pal.good;
        ctx.fill();
      } else if (st === 0) {
        ctx.strokeStyle = pal.warn;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = withAlpha(pal.faint, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  private drawWave() {
    const { ctx, pal, sim } = this;
    const r = this.wave;
    this.panel(r, 12, pal.bg1);
    const top = this.compact ? 6 : 20 * Math.min(this.u, 1.3);
    const plot = rect(r.x + 8, r.y + top, r.w - 16, r.h - top - 8);
    const now = sim.timeS;
    const past = 2.2;
    const ahead = 1.6;
    // Time runs left to right in every direction (it is a chart).
    const xOf = (s: number) => plot.x + ((s - (now - past)) / (past + ahead)) * plot.w;
    const mid = plot.y + plot.h / 2;
    const amp = plot.h * 0.4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, mid);
    ctx.lineTo(plot.x + plot.w, mid);
    ctx.stroke();
    // Beat windows and troughs.
    for (let k = 0; k < sim.beatsS.length; k++) {
      const b = sim.beatsS[k]!;
      if (b < now - past - 0.5 || b > now + ahead + 0.5) continue;
      const x0 = xOf(b - sim.config.windowS);
      const x1 = xOf(b + sim.config.windowS);
      ctx.fillStyle = withAlpha(pal.good, 0.18);
      ctx.fillRect(x0, plot.y, x1 - x0, plot.h);
      const st = sim.settled[k]!;
      const x = xOf(b);
      const y = mid + amp;
      ctx.fillStyle = st === 1 ? pal.good : st === 0 ? pal.warn : pal.text;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
      // The player's counted tap.
      const off = sim.firstTap[k]!;
      if (!Number.isNaN(off)) {
        const tx = xOf(b + off);
        const good = sim.isGood(k);
        ctx.fillStyle = good ? pal.text : pal.warn;
        ctx.beginPath();
        ctx.moveTo(tx, plot.y + 12);
        ctx.lineTo(tx - 6, plot.y + 2);
        ctx.lineTo(tx + 6, plot.y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(tx - 1, plot.y + 10, 2, plot.h - 12);
      }
    }
    // The bounce: past solid, future dashed (decaying with the current amplitude).
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = pal.accentStrong;
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const s = now - past + (i / 90) * past;
      const y = mid - sim.displacement(s) * amp;
      if (i === 0) ctx.moveTo(xOf(s), y);
      else ctx.lineTo(xOf(s), y);
    }
    ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = withAlpha(pal.accentStrong, 0.55);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const s = now + (i / 60) * ahead;
      const y = mid - sim.displacement(s) * amp;
      if (i === 0) ctx.moveTo(xOf(s), y);
      else ctx.lineTo(xOf(s), y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const nx = xOf(now);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nx, plot.y);
    ctx.lineTo(nx, plot.y + plot.h);
    ctx.stroke();
    ctx.restore();
    if (!this.compact) {
      const px = 10.5 * Math.min(this.u, 1.3);
      ctx.textBaseline = 'alphabetic';
      this.textStart(this.t('minigame.MG-11.wave.title'), r, 10, r.y + px + 5, px, 700, true, pal.dim, r.w * 0.6);
      this.textEnd(this.t('minigame.MG-11.wave.legend'), r, 10, r.y + px + 5, px, 600, true, pal.faint, r.w * 0.38);
    }
  }
}
