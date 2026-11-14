// MG-10a canvas renderer: phase strip, the vehicle at staging, the cutoff lamp and the two
// gauges, the sequencer timeline with the green windows and everyone's taps, and the SEPARATE /
// IGNITE buttons. Reads the model only.
import { fmt, fmtSigned } from '../../data/format';
import { rect, View2D, withAlpha, drawRocket, type GlyphKind, type Rect, type Tone, type Translate } from '../MG-09/shared/draw';
import type { Mg10aSim, StepResult } from './model';

export interface Mate {
  /** Offsets from the SEPARATE / IGNITE moments, s; null = not (yet) known or missed. */
  sep: number | null;
  ign: number | null;
  /** From the host (`env.coop`) rather than simulated. */
  live: boolean;
}

export interface Mg10aFrame {
  timeMs: number;
  mates: Mate[];
  pausedText?: string | null;
  /** Demo: ghost finger on a button. */
  finger?: 'sep' | 'ign' | null;
  fingerDown?: boolean;
  /** Button held down right now (visual press). */
  down?: 'sep' | 'ign' | null;
}

export class Mg10aView extends View2D {
  private sim: Mg10aSim;
  private readonly compact: boolean;
  private strip = rect(0, 0, 0, 0);
  private scene = rect(0, 0, 0, 0);
  private gauges = rect(0, 0, 0, 0);
  private line = rect(0, 0, 0, 0);
  private sepBtn = rect(0, 0, 0, 0);
  private ignBtn = rect(0, 0, 0, 0);
  private oneBtn = rect(0, 0, 0, 0);
  private hint = rect(0, 0, 0, 0);
  private readonly labelLines = new Map<string, [string, string]>();

  constructor(canvas: HTMLCanvasElement, sim: Mg10aSim, t: Translate, reducedMotion: boolean, compact: boolean) {
    super(canvas, t, reducedMotion);
    this.sim = sim;
    this.compact = compact;
    this.layout();
  }

  setSim(sim: Mg10aSim) {
    this.sim = sim;
  }

  resize() {
    this.measure();
    this.layout();
  }

  /** Which button is under a point (two-button mode). */
  buttonAt(x: number, y: number): 'sep' | 'ign' | null {
    const inR = (r: Rect) => x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6;
    if (inR(this.sepBtn)) return 'sep';
    if (inR(this.ignBtn)) return 'ign';
    return null;
  }

  private layout() {
    const { W, H, us } = this;
    const pad = this.compact ? 8 : 12;
    if (this.compact) {
      const btnH = Math.round(H * 0.24);
      this.strip = rect(0, 0, 0, 0);
      this.hint = rect(0, 0, 0, 0);
      this.sepBtn = rect(pad, H - pad - btnH, (W - pad * 3) / 2, btnH);
      this.ignBtn = rect(pad * 2 + (W - pad * 3) / 2, H - pad - btnH, (W - pad * 3) / 2, btnH);
      this.oneBtn = rect(pad, H - pad - btnH, W - pad * 2, btnH);
      const lineH = Math.round(H * 0.2);
      this.line = rect(pad, this.sepBtn.y - 6 - lineH, W - pad * 2, lineH);
      const top = pad;
      const h = this.line.y - 6 - top;
      this.scene = rect(pad, top, W * 0.42, h);
      this.gauges = rect(pad + W * 0.42 + 6, top, W - pad * 2 - W * 0.42 - 6, h);
      return;
    }
    let y = pad;
    const stripH = Math.round(40 * us);
    this.strip = rect(pad, y, W - pad * 2, stripH);
    y += stripH + 8;
    const hintH = Math.round(24 * us);
    this.hint = rect(pad, H - pad - hintH, W - pad * 2, hintH);
    const btnH = Math.max(64, Math.round(84 * Math.min(this.u, 1.4)));
    const by = this.hint.y - 6 - btnH;
    const gap = 10;
    const bw = (W - pad * 2 - gap) / 2;
    const left = rect(pad, by, bw, btnH);
    const right = rect(pad + bw + gap, by, bw, btnH);
    // Reading order: SEPARATE first (left in LTR, right in RTL).
    this.sepBtn = this.rtl ? right : left;
    this.ignBtn = this.rtl ? left : right;
    this.oneBtn = rect(pad, by, W - pad * 2, btnH);
    const lineH = Math.round(Math.max(96, 104 * Math.min(this.u, 1.3)));
    this.line = rect(pad, by - 10 - lineH, W - pad * 2, lineH);
    const h = this.line.y - 10 - y;
    const sceneW = Math.round((W - pad * 2) * 0.5);
    const scene = rect(pad, y, sceneW, h);
    const gauges = rect(pad + sceneW + 10, y, W - pad * 2 - sceneW - 10, h);
    this.scene = this.rtl ? rect(gauges.x + gauges.w - sceneW, y, sceneW, h) : scene;
    this.gauges = this.rtl ? rect(pad, y, gauges.w, h) : gauges;
  }

  draw(f: Mg10aFrame) {
    this.begin();
    this.drawScene(f);
    this.drawGauges(f);
    this.drawTimeline(f);
    this.drawButtons(f);
    if (!this.compact) {
      this.drawStrip(f);
      const key = this.sim.config.oneButton ? 'minigame.MG-10a.hint.one' : 'minigame.MG-10a.hint.two';
      this.ctx.textBaseline = 'middle';
      this.textCenter(this.t(key), this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 1, this.hint.w, 12.5 * this.us, 600, false, this.pal.dim);
      this.ctx.textBaseline = 'alphabetic';
    }
    if (f.pausedText) this.paused(f.pausedText);
  }

  /** Phase of the sequence for the strip and the buttons. */
  private phase(): { key: string; tone: Tone; glyph: GlyphKind } {
    const s = this.sim;
    const p = s.plan;
    const w = s.config.windowS;
    const t = s.timeS;
    if (s.ignited && t >= s.ignAtS) {
      const r = s.score();
      return r.success ? { key: 'minigame.MG-10a.status.done_ok', tone: 'good', glyph: 'ok' } : { key: 'minigame.MG-10a.status.done_miss', tone: 'warn', glyph: 'warn' };
    }
    if (s.separated) {
      if (t >= p.ignS - w) return { key: 'minigame.MG-10a.status.ignite', tone: 'good', glyph: 'ok' };
      return { key: 'minigame.MG-10a.status.settling', tone: 'warn', glyph: 'dot' };
    }
    if (t >= p.sepS - w) return { key: 'minigame.MG-10a.status.separate', tone: 'good', glyph: 'ok' };
    if (t >= p.cutoffS) return { key: 'minigame.MG-10a.status.cutoff', tone: 'warn', glyph: 'stop' };
    return { key: 'minigame.MG-10a.status.burning', tone: 'neutral', glyph: 'dot' };
  }

  private drawStrip(f: Mg10aFrame) {
    const ph = this.phase();
    let text = this.t(ph.key);
    // Flash the cutoff for 0.6 s (steady in reduced motion).
    let tone = ph.tone;
    const s = this.sim;
    if (ph.key === 'minigame.MG-10a.status.cutoff' && !this.reducedMotion && s.timeS - s.plan.cutoffS < 0.6 && Math.floor(f.timeMs / 170) % 2 === 0) tone = 'neutral';
    if (ph.key === 'minigame.MG-10a.status.settling') text = `${text} · ${fmt(s.settle * 100, 0)} %`;
    this.statusStrip(this.strip, tone, ph.glyph, text);
  }

  private drawScene(f: Mg10aFrame) {
    const { ctx, pal, sim } = this;
    const r = this.scene;
    const t = sim.timeS;
    const p = sim.plan;
    this.backdrop(r, 12, 0.9, 'right');
    ctx.save();
    this.roundRect(r, 12);
    ctx.clip();
    // The whole stack (≈ 1.09 × length including bells) fits with a margin.
    const len = Math.min((r.h * 0.84) / 1.09, r.w * 3);
    const cx = r.x + r.w / 2;
    const baseY = r.y + (r.h + len * 1.09) / 2 - len * 0.02;
    const burning = t < p.cutoffS;
    const sepT = sim.separated ? Math.max(0, t - sim.sepAtS) : 0;
    const gap = sim.separated ? 4 + 70 * sepT * sepT + 12 * sepT : 0;
    const ignOn = sim.ignited && sim.ign !== null && t >= sim.ignAtS;
    const time = f.timeMs / 1000;
    const calm = this.reducedMotion;
    if (!sim.separated) {
      drawRocket(this, { x: cx, y: baseY, length: len, plume: burning ? 1 : 0, plumeLen: 2.6, time, calm, bells: 3, seam: t >= p.cutoffS ? withAlpha(pal.good, 0.9) : undefined });
    } else {
      // The spent first stage falls away (drawn first, below); the upper stage keeps its place.
      ctx.globalAlpha = Math.max(0.15, 1 - sepT * 0.35);
      drawRocket(this, { x: cx + sepT * 4, y: baseY + gap, length: len, part: 'lower', plume: 0, bells: 3, angle: Math.min(0.25, sepT * 0.05) });
      ctx.globalAlpha = 1;
      const s1 = len * 0.56;
      const bellH = (len / 11.5) * 0.55;
      const inter = len * 0.07;
      const upperBase = baseY - bellH - s1 - inter;
      const uLen = len * 0.42;
      drawRocket(this, { x: cx, y: upperBase, length: len, part: 'upper', plume: ignOn ? 1 : 0, plumeLen: 3.4, time, calm });
      // Settling: small ullage-thruster puffs while the propellant settles.
      if (!sim.ignited || t < sim.ignAtS) {
        const pw = len / 11.5;
        const a = calm ? 0.55 : 0.4 + 0.3 * Math.sin(time * 30);
        ctx.fillStyle = withAlpha(pal.text, a);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + side * pw * 0.5, upperBase - uLen * 0.25);
          ctx.lineTo(cx + side * pw * 0.5 - side * 2, upperBase - uLen * 0.25 + 18);
          ctx.lineTo(cx + side * pw * 0.5 + side * 4, upperBase - uLen * 0.25 + 18);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
    this.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.lineStrong;
    ctx.stroke();
  }

  private drawGauges(f: Mg10aFrame) {
    const { ctx, pal, sim } = this;
    const g = this.gauges;
    const t = sim.timeS;
    const p = sim.plan;
    const compact = this.compact;
    // Cutoff lamp.
    const lampH = compact ? Math.min(46, g.h * 0.32) : Math.round(64 * Math.min(this.u, 1.3));
    const lamp = rect(g.x, g.y, g.w, lampH);
    const on = t >= p.cutoffS;
    const flashOff = on && !this.reducedMotion && t - p.cutoffS < 0.6 && Math.floor(f.timeMs / 170) % 2 === 0;
    this.panel(lamp, 10, pal.bg2, on ? pal.warn : pal.lineStrong);
    const lr = Math.min(lampH * 0.3, 17);
    const lx = this.rtl ? lamp.x + lamp.w - 14 - lr * 1.2 : lamp.x + 14 + lr * 1.2;
    const ly = lamp.y + lampH / 2;
    if (on && !flashOff) {
      ctx.fillStyle = withAlpha(pal.warn, 0.3);
      ctx.beginPath();
      ctx.arc(lx, ly, lr * 1.3, 0, Math.PI * 2);
      ctx.fill();
      this.glyph('stop', lx, ly, lr * 2, pal.warn);
    } else {
      this.glyph('stop', lx, ly, lr * 2, withAlpha(pal.faint, 0.35), pal.bg2);
    }
    if (!compact) {
      const px = 11 * Math.min(this.u, 1.3);
      const tx = rect(lamp.x + lr * 2.4 + 24, lamp.y, lamp.w - lr * 2.4 - 32, lamp.h);
      const tr = this.rtl ? rect(lamp.x + 8, lamp.y, lamp.w - lr * 2.4 - 32, lamp.h) : tx;
      this.textStart(this.t('minigame.MG-10a.lamp.meco'), tr, 0, ly - 3, px, 800, true, on ? pal.warn : pal.faint);
      this.textStart(this.t(on ? 'minigame.MG-10a.lamp.on' : 'minigame.MG-10a.lamp.off'), tr, 0, ly + px + 2, px * 0.95, 650, true, pal.dim);
    }
    // Two vertical gauges.
    const top = lamp.y + lampH + 8;
    const gh = g.y + g.h - top;
    const gw = (g.w - 8) / 2;
    const a = rect(g.x, top, gw, gh);
    const b = rect(g.x + gw + 8, top, gw, gh);
    const first = this.rtl ? b : a;
    const second = this.rtl ? a : b;
    this.gauge(first, this.t('minigame.MG-10a.gauge.prop'), sim.prop, 'bad', sim.prop <= 0.0001 ? this.t('minigame.MG-10a.gauge.empty') : null);
    const settled = sim.separated ? sim.settle : 0;
    this.gauge(second, this.t('minigame.MG-10a.gauge.settle'), settled, 'good', settled >= 1 ? this.t('minigame.MG-10a.gauge.settled') : null);
  }

  private gauge(r: Rect, label: string, frac: number, kind: 'good' | 'bad', badge: string | null) {
    const { ctx, pal } = this;
    this.panel(r, 10);
    const px = (this.compact ? 9 : 10.5) * Math.min(this.u, 1.3);
    const labelH = this.compact ? 0 : px * 2.6;
    if (!this.compact) {
      // Two lines of label, centred.
      ctx.textBaseline = 'alphabetic';
      let lines = this.labelLines.get(label);
      if (!lines) {
        const words = label.split(' ');
        const half = Math.ceil(words.length / 2);
        lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')];
        this.labelLines.set(label, lines);
      }
      const [l1, l2] = lines;
      this.textCenter(l1, r.x + r.w / 2, r.y + px + 6, r.w - 10, px, 700, true, pal.dim);
      if (l2) this.textCenter(l2, r.x + r.w / 2, r.y + px * 2.2 + 6, r.w - 10, px, 700, true, pal.dim);
    }
    const numH = this.compact ? 0 : 26 * Math.min(this.u, 1.3);
    const bar = rect(r.x + r.w / 2 - Math.min(18, r.w * 0.2), r.y + labelH + 10, Math.min(36, r.w * 0.4), r.h - labelH - 20 - numH);
    ctx.fillStyle = pal.bg0;
    this.roundRect(bar, 6);
    ctx.fill();
    const fill = Math.max(0, Math.min(1, frac));
    const fh = bar.h * fill;
    const c = kind === 'good' ? (fill >= 1 ? pal.good : pal.accent) : fill < 0.2 ? pal.warn : pal.accent;
    ctx.fillStyle = c;
    ctx.fillRect(bar.x + 3, bar.y + bar.h - fh, bar.w - 6, Math.max(0, fh - 3));
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 1;
    this.roundRect(bar, 6);
    ctx.stroke();
    if (!this.compact) {
      const pct = kind === 'bad' ? fill * 100 : fill * 100;
      this.textCenter(`${fmt(pct, kind === 'bad' ? 1 : 0, kind === 'bad' ? 1 : 0)} %`, r.x + r.w / 2, r.y + r.h - 10, r.w - 10, 15 * Math.min(this.u, 1.3), 800, true, badge ? (kind === 'good' ? pal.good : pal.warn) : pal.text);
      if (badge) {
        ctx.textBaseline = 'middle';
        this.fit(badge, r.w - 16, px, 800, true);
        const bw = Math.min(r.w - 8, ctx.measureText(badge).width + 14);
        const br = rect(r.x + (r.w - bw) / 2, bar.y + bar.h / 2 - px, bw, px * 2);
        this.roundRect(br, 6);
        ctx.fillStyle = withAlpha(pal.bg0, 0.9);
        ctx.fill();
        ctx.strokeStyle = kind === 'good' ? pal.good : pal.warn;
        ctx.stroke();
        ctx.fillStyle = kind === 'good' ? pal.good : pal.warn;
        ctx.textAlign = 'center';
        ctx.fillText(badge, r.x + r.w / 2, br.y + br.h / 2 + 1);
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  private drawTimeline(f: Mg10aFrame) {
    const { ctx, pal, sim } = this;
    const r = this.line;
    const p = sim.plan;
    const w = sim.config.windowS;
    const now = sim.timeS;
    const before = this.compact ? 1.6 : 2.7;
    const after = this.compact ? 2.4 : 2.3;
    this.panel(r, 12, pal.bg1);
    const track = rect(r.x + 10, r.y + (this.compact ? 6 : 22 * Math.min(this.u, 1.3)), r.w - 20, r.h - (this.compact ? 12 : 22 * Math.min(this.u, 1.3) + 26 * Math.min(this.u, 1.25)));
    // Time runs left to right in every direction (it is a chart).
    const xOf = (s: number) => track.x + ((s - (now - before)) / (before + after)) * track.w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(track.x, track.y - 4, track.w, track.h + 8);
    ctx.clip();
    ctx.fillStyle = withAlpha(pal.bg0, 0.9);
    ctx.fillRect(track.x, track.y, track.w, track.h);
    // Second ticks.
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = Math.ceil(now - before); s <= now + after; s += 0.5) {
      const x = Math.round(xOf(s)) + 0.5;
      const long = Math.abs(s - Math.round(s)) < 1e-6;
      ctx.moveTo(x, track.y + track.h - (long ? 10 : 5));
      ctx.lineTo(x, track.y + track.h);
    }
    ctx.stroke();
    // Windows, known once their moment is known: SEPARATE after cutoff, IGNITE after separation.
    const windowBand = (m: number, label: string, open: boolean) => {
      const x0 = xOf(m - w);
      const x1 = xOf(m + w);
      ctx.fillStyle = withAlpha(pal.good, open ? 0.32 : 0.16);
      ctx.fillRect(x0, track.y, x1 - x0, track.h);
      ctx.strokeStyle = pal.good;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, track.y + 1, x1 - x0 - 2, track.h - 2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOf(m), track.y);
      ctx.lineTo(xOf(m), track.y + track.h);
      ctx.stroke();
      if (!this.compact) {
        const px = 10 * Math.min(this.u, 1.25);
        ctx.font = this.font(px, 800, true);
        ctx.fillStyle = pal.good;
        ctx.textAlign = 'center';
        ctx.fillText(label, xOf(m), track.y + px + 3);
      }
    };
    if (now >= p.cutoffS) windowBand(p.sepS, this.t('minigame.MG-10a.btn.sep'), now >= p.sepS - w && now <= p.sepS + w);
    if (sim.separated) windowBand(p.ignS, this.t('minigame.MG-10a.btn.ign'), now >= p.ignS - w && now <= p.ignS + w);
    if (now >= p.cutoffS - 0.001) {
      // Cutoff marker.
      const x = xOf(p.cutoffS);
      ctx.strokeStyle = pal.warn;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, track.y);
      ctx.lineTo(x, track.y + track.h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Crew taps: small dots on the lower half when their time has come.
    const mates = f.mates;
    const dotR = this.compact ? 3 : 4.5;
    for (let i = 0; i < mates.length; i++) {
      const m = mates[i]!;
      const lane = track.y + track.h * (0.55 + 0.35 * ((i % 3) / 3));
      for (const [off, moment] of [
        [m.sep, p.sepS],
        [m.ign, p.ignS],
      ] as const) {
        if (off === null || now < moment + off) continue;
        const ok = Math.abs(off) <= w;
        ctx.fillStyle = ok ? pal.dim : pal.warn;
        ctx.beginPath();
        ctx.arc(xOf(moment + off), lane, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The player's taps: big triangles from the top.
    for (const [res, moment] of [
      [sim.sep, p.sepS],
      [sim.ign, p.ignS],
    ] as const) {
      if (!res) continue;
      const x = xOf(moment + res.dtS);
      const c = res.ok ? pal.text : pal.bad;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x, track.y + track.h * 0.5);
      ctx.lineTo(x - 8, track.y + track.h * 0.5 - 13);
      ctx.lineTo(x + 8, track.y + track.h * 0.5 - 13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.bg0;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Now cursor.
    const nx = xOf(now);
    ctx.strokeStyle = pal.accentStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nx, track.y - 4);
    ctx.lineTo(nx, track.y + track.h + 4);
    ctx.stroke();
    ctx.restore();
    if (this.compact) return;
    // Title and legend.
    const px = 10.5 * Math.min(this.u, 1.3);
    ctx.textBaseline = 'alphabetic';
    this.textStart(this.t('minigame.MG-10a.line.title'), r, 12, r.y + px + 5, px, 700, true, pal.dim, r.w * 0.5);
    const legend = mates.length ? this.t(mates.some((m) => m.live) ? 'minigame.MG-10a.line.team' : 'minigame.MG-10a.line.crew', { n: mates.length }) : '';
    if (legend) this.textEnd(legend, r, 12, r.y + px + 5, px, 600, true, pal.faint, r.w * 0.45);
    // Your results under the track, with units.
    const ry = r.y + r.h - 9;
    const res = (lab: string, s: StepResult, moment: number) => {
      if (!s) return now > moment + w + 0.2 ? `${lab} ${this.t('minigame.MG-10a.result.missed')}` : `${lab} —`;
      const when = Math.abs(s.dtS) <= 0.02 ? this.t('minigame.MG-10a.result.on_time') : s.dtS < 0 ? this.t('minigame.MG-10a.result.early') : this.t('minigame.MG-10a.result.late');
      return `${lab} ${fmtSigned(s.dtS, 2)} s ${when}`;
    };
    const half = rect(r.x, r.y, r.w / 2, r.h);
    const half2 = rect(r.x + r.w / 2, r.y, r.w / 2, r.h);
    const tone = (s: StepResult) => (!s ? pal.faint : s.ok ? pal.good : pal.bad);
    this.textStart(res(this.t('minigame.MG-10a.btn.sep'), sim.sep, p.sepS), this.rtl ? half2 : half, 12, ry, px, 700, true, tone(sim.sep));
    this.textEnd(res(this.t('minigame.MG-10a.btn.ign'), sim.ign, p.ignS), this.rtl ? half : half2, 12, ry, px, 700, true, tone(sim.ign));
  }

  private drawButtons(f: Mg10aFrame) {
    const { sim } = this;
    const p = sim.plan;
    const w = sim.config.windowS;
    const t = sim.timeS;
    const sepOpen = !sim.separated && t >= p.sepS - w && t <= p.sepS + w;
    const ignOpen = sim.separated && !sim.ignited && t >= p.ignS - w && t <= p.ignS + w;
    const resGlyph = (s: StepResult): { glyph?: GlyphKind; sub?: string; tone?: Tone } =>
      s ? { glyph: s.ok ? 'ok' : 'stop', sub: `${fmtSigned(s.dtS, 2)} s`, tone: s.ok ? 'good' : 'bad' } : {};
    if (sim.config.oneButton) {
      const step = sim.nextStep;
      const label = step === 'sep' ? this.t('minigame.MG-10a.btn.sep') : step === 'ign' ? this.t('minigame.MG-10a.btn.ign') : this.t('minigame.MG-10a.btn.done');
      const sub = this.compact ? undefined : this.t('minigame.MG-10a.btn.one_sub');
      this.button(this.oneBtn, label, { tone: 'good', enabled: step !== 'done', armed: sepOpen || ignOpen, pressed: !!f.down, sub });
      if (f.finger) this.finger(this.oneBtn.x + this.oneBtn.w * 0.62, this.oneBtn.y + this.oneBtn.h * 0.55, !!f.fingerDown, this.compact ? 13 : 18);
      return;
    }
    const sepDone = resGlyph(sim.sep);
    const ignDone = resGlyph(sim.ign);
    this.button(this.sepBtn, this.t('minigame.MG-10a.btn.sep'), {
      tone: sepDone.tone ?? 'good',
      enabled: t >= p.cutoffS && !sim.separated ? true : !!sim.sep,
      armed: sepOpen,
      pressed: f.down === 'sep',
      glyph: sepDone.glyph,
      sub: this.compact ? undefined : sepDone.sub ?? (t < p.cutoffS ? this.t('minigame.MG-10a.btn.wait_cutoff') : undefined),
    });
    this.button(this.ignBtn, this.t('minigame.MG-10a.btn.ign'), {
      tone: ignDone.tone ?? 'good',
      enabled: (sim.separated && !sim.ignited) || !!sim.ign,
      armed: ignOpen,
      pressed: f.down === 'ign',
      glyph: ignDone.glyph,
      sub: this.compact ? undefined : ignDone.sub ?? (!sim.separated ? this.t('minigame.MG-10a.btn.wait_sep') : t < p.ignS - w ? this.t('minigame.MG-10a.btn.wait_settle') : undefined),
    });
    if (f.finger) {
      const b = f.finger === 'sep' ? this.sepBtn : this.ignBtn;
      this.finger(b.x + b.w * 0.6, b.y + b.h * 0.58, !!f.fingerDown, this.compact ? 13 : 18);
    }
  }
}
