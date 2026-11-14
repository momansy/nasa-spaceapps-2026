// MG-22 canvas renderer: the entry scene (capsule, plasma, limb of the Earth), the HUD cards, the
// γ-versus-time chart with the corridor band, and the steering indicator. It only reads the
// simulation; the rules live in `model.ts`. Every state is shown by a word, a glyph and a pattern
// as well as by colour.
import { fmt, fmtSigned } from '../../data/format';
import type { MinigameEnv } from '../types';
import { clamp, Gfx, withAlpha, type Frame, type Rect, type ViewLike } from './kit';
import type { Mg22Sim, Zone } from './model';

const REAL_TO_DRAWN_ANGLE = 3; // the angle of the drawn path is exaggerated ×3 so that it can be read

export class Mg22View implements ViewLike<Mg22Sim> {
  readonly g: Gfx;
  private sim: Mg22Sim;
  private readonly env: MinigameEnv;
  private readonly compact: boolean;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scene: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private chart: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rateBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hint: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private yMin = -9;
  private yMax = -4;
  private hatch: CanvasPattern | null = null;
  private dots: CanvasPattern | null = null;

  constructor(canvas: HTMLCanvasElement, sim: Mg22Sim, env: MinigameEnv, compact: boolean) {
    this.g = new Gfx(canvas);
    this.sim = sim;
    this.env = env;
    this.compact = compact;
    this.resize();
  }

  setSim(sim: Mg22Sim) {
    this.sim = sim;
    this.scale();
  }

  resize() {
    const g = this.g;
    g.measure();
    const { W, H, u } = g;
    const compact = this.compact;
    const pad = compact ? 8 : 12;
    const hudH = compact ? 0 : Math.round(60 * Math.min(u, 1.45));
    const stripH = compact ? 0 : Math.round(36 * Math.min(u, 1.5));
    const hintH = compact ? 0 : Math.round(26 * Math.min(u, 1.5));
    const sceneH = clamp(Math.round(H * (compact ? 0.3 : 0.22)), 70, 150);
    let y = pad;
    this.hud = { x: pad, y, w: W - pad * 2, h: hudH };
    y += hudH + (hudH ? 8 : 0);
    this.scene = { x: pad, y, w: W - pad * 2, h: sceneH };
    y += sceneH + 8;
    this.strip = { x: pad, y, w: W - pad * 2, h: stripH };
    y += stripH + (stripH ? 8 : 0);
    const bottom = H - pad - hintH;
    const rateW = compact ? 0 : clamp(Math.round(62 * Math.min(u, 1.3)), 62, 80);
    const gap = compact ? 0 : 8;
    this.chart = { x: pad, y, w: W - pad * 2 - rateW - gap, h: Math.max(60, bottom - y - (compact ? 0 : 16)) };
    this.rateBar = { x: this.chart.x + this.chart.w + gap, y, w: rateW, h: this.chart.h };
    this.hint = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
    this.hatch = g.hatch(g.pal.bad);
    this.dots = g.dots(g.pal.warn);
    this.scale();
  }

  private scale() {
    const c = this.sim.config;
    const half = (c.shallowDeg - c.steepDeg) / 2;
    const centre = (c.shallowDeg + c.steepDeg) / 2;
    this.yMin = centre - half * 2.7;
    this.yMax = centre + half * 2.7;
  }

  private xOf(tS: number): number {
    return this.chart.x + (tS / this.sim.run.durationS) * this.chart.w;
  }
  private yOf(deg: number): number {
    const f = (deg - this.yMin) / (this.yMax - this.yMin);
    return this.chart.y + this.chart.h * (1 - clamp(f, 0, 1));
  }

  /** Pixels of drag that mean "full stick". */
  get dragRangePx(): number {
    return Math.max(70, this.chart.h * 0.35);
  }

  demoFinger(sim: Mg22Sim): { x: number; y: number; down: boolean } {
    const r = this.rateBar.w > 0 ? this.rateBar : this.chart;
    const cx = this.chart.x + this.chart.w * 0.8;
    const cy = this.chart.y + this.chart.h * 0.5;
    return { x: cx, y: cy + sim.stick * this.dragRangePx * 0.5 + (r.h > 0 ? 0 : 0), down: true };
  }

  private zoneColor(z: Zone): string {
    const p = this.g.pal;
    return z === 0 ? p.good : z === 1 ? p.bad : p.warn;
  }

  private edgeAlpha(edgeDeg: number): number {
    if (!this.sim.config.hideEdges) return 1;
    return clamp(1.15 - Math.abs(this.sim.gammaDeg - edgeDeg) / 0.55, 0, 1);
  }

  draw(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    g.begin();
    const sim = this.sim;
    if (!this.compact) this.drawHud();
    this.drawScene(f);
    if (!this.compact) this.drawStrip();
    this.drawChart();
    if (!this.compact) {
      this.drawRateBar(f);
      this.drawHint();
    }
    if (f.finger) g.finger(f.finger.x, f.finger.y, 22, f.finger.down);
    if (f.active && !this.compact) {
      ctx.strokeStyle = withAlpha(pal.accent, 0.5);
      ctx.lineWidth = 2;
      g.roundRect({ x: 1, y: 1, w: g.W - 2, h: g.H - 2 }, 12);
      ctx.stroke();
    }
    if (f.pausedText) {
      ctx.fillStyle = withAlpha(pal.bg0, 0.7);
      ctx.fillRect(0, 0, g.W, g.H);
      ctx.fillStyle = pal.text;
      ctx.textAlign = 'center';
      ctx.font = g.font(22, 800, false);
      ctx.fillText(f.pausedText, g.W / 2, g.H / 2);
    }
    void sim;
  }

  // ───────────── HUD ─────────────

  private drawHud() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const left: Rect = { x: this.hud.x, y: this.hud.y, w, h: this.hud.h };
    const right: Rect = { x: this.hud.x + w + gap, y: this.hud.y, w, h: this.hud.h };
    const col = this.zoneColor(sim.zone);
    const border = sim.zone === 0 ? 'solid' : sim.zone === 1 ? 'double' : 'dashed';
    const pad = 12;
    // angle card
    g.panel(left, col, border);
    const s1 = g.startX(left, pad);
    ctx.textBaseline = 'alphabetic';
    g.label(this.env.t('minigame.MG-22.hud.angle'), s1.x, left.y + 20 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2 - 26, s1.align);
    g.numberWithUnit(fmtSigned(sim.gammaDeg, 2), '°', s1.x, left.y + left.h - 12, w - pad * 2 - 30, 30 * Math.min(g.u, 1.3), col);
    const e1 = g.endX(left, pad + 8);
    g.glyph(sim.zone === 0 ? 'ok' : sim.zone === 1 ? 'down' : 'up', e1.x, left.y + left.h - 24, 16, col);
    // inside card
    const frac = sim.insideFraction;
    const need = sim.config.inCorridorFractionMin;
    const fcol = frac >= need ? pal.good : pal.warn;
    g.panel(right, null);
    const s2 = g.startX(right, pad);
    g.label(`${this.env.t('minigame.MG-22.hud.inside')} · ${this.env.t('minigame.MG-22.hud.need', { pct: g.ltr(String(Math.round(need * 100))) })}`, s2.x, right.y + 20 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2, s2.align);
    g.numberWithUnit(fmt(frac * 100, 0), '%', s2.x, right.y + right.h - 16, w - pad * 2 - 30, 30 * Math.min(g.u, 1.3), fcol);
    const e2 = g.endX(right, pad + 8);
    g.glyph(frac >= need ? 'ok' : 'up', e2.x, right.y + right.h - 28, 14, fcol);
    // bar with the threshold tick
    const bar: Rect = { x: right.x + pad, y: right.y + right.h - 8, w: w - pad * 2, h: 3 };
    ctx.fillStyle = pal.bg3;
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    ctx.fillStyle = fcol;
    const bx = g.rtl ? bar.x + bar.w * (1 - frac) : bar.x;
    ctx.fillRect(bx, bar.y, bar.w * frac, bar.h);
    ctx.fillStyle = pal.text;
    const tx = g.rtl ? bar.x + bar.w * (1 - need) : bar.x + bar.w * need;
    ctx.fillRect(tx - 1, bar.y - 3, 2, bar.h + 6);
  }

  private drawStrip() {
    const g = this.g;
    const { ctx, pal } = g;
    const z = this.sim.zone;
    const col = this.zoneColor(z);
    const key = z === 0 ? 'minigame.MG-22.status.inside' : z === 1 ? 'minigame.MG-22.status.steep' : 'minigame.MG-22.status.shallow';
    const r = this.strip;
    g.roundRect(r, 10);
    ctx.fillStyle = withAlpha(col, 0.14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col;
    ctx.setLineDash(z === 1 ? [] : z === -1 ? [5, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    const text = this.env.t(key);
    const size = g.fit(text, r.w - 60, 14 * Math.min(g.u, 1.3), 800, false);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = pal.text;
    ctx.fillText(text, r.x + r.w / 2 + 12, r.y + r.h / 2 + 1);
    g.glyph(z === 0 ? 'ok' : z === 1 ? 'down' : 'up', r.x + r.w / 2 - tw / 2 - 4, r.y + r.h / 2, size, col);
    ctx.textBaseline = 'alphabetic';
  }

  private drawHint() {
    const g = this.g;
    const { ctx, pal } = g;
    const c = this.sim.config;
    const key = c.oneButton ? (c.holdToToggle ? 'minigame.MG-22.hint.toggle' : 'minigame.MG-22.hint.hold') : 'minigame.MG-22.hint.drag';
    const text = this.env.t(key);
    ctx.textAlign = 'center';
    g.fit(text, this.hint.w, 12 * Math.min(g.u, 1.4), 600, false);
    ctx.fillStyle = pal.faint;
    ctx.fillText(text, this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h * 0.7);
  }

  // ───────────── the entry scene ─────────────

  private drawScene(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.scene;
    const sim = this.sim;
    ctx.save();
    g.roundRect(r, 12);
    ctx.clip();
    // sky: space to the glow of the thin atmosphere
    const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    sky.addColorStop(0, pal.bg0);
    sky.addColorStop(0.62, pal.bg2);
    sky.addColorStop(1, withAlpha(pal.accent, 0.4));
    ctx.fillStyle = sky;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // stars (fixed pattern)
    ctx.fillStyle = withAlpha(pal.text, 0.5);
    for (let i = 0; i < 18; i++) {
      const sx = r.x + ((i * 97) % 100) * 0.01 * r.w;
      const sy = r.y + ((i * 53) % 61) * 0.01 * r.h * 0.9;
      ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }
    // Earth limb
    const R = r.w * 1.6;
    const cx = r.x + r.w * 0.5;
    const cy = r.y + r.h * 0.92 + R;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    const earth = ctx.createLinearGradient(0, r.y + r.h * 0.9, 0, r.y + r.h);
    earth.addColorStop(0, '#176887');
    earth.addColorStop(1, '#0b3550');
    ctx.fillStyle = earth;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = withAlpha(pal.accentStrong, 0.85);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = withAlpha(pal.accent, 0.18);
    ctx.stroke();
    // drawn path angle (exaggerated), the velocity vector and the corridor wedge
    const drawn = (Math.abs(sim.gammaDeg) * REAL_TO_DRAWN_ANGLE * Math.PI) / 180;
    const sign = sim.gammaDeg <= 0 ? 1 : -1; // below the horizon: the path points down to the right
    const ang = sign * drawn;
    const px = r.x + r.w * 0.5;
    const py = r.y + r.h * 0.42;
    const c = sim.config;
    const aSteep = (Math.abs(c.steepDeg) * REAL_TO_DRAWN_ANGLE * Math.PI) / 180;
    const aShallow = (Math.abs(c.shallowDeg) * REAL_TO_DRAWN_ANGLE * Math.PI) / 180;
    const len = r.w * 0.46;
    const eSteep = this.edgeAlpha(c.steepDeg);
    const eShallow = this.edgeAlpha(c.shallowDeg);
    // wedge between the two limits
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(aSteep) * len, py + Math.sin(aSteep) * len);
    ctx.lineTo(px + Math.cos(aShallow) * len, py + Math.sin(aShallow) * len);
    ctx.closePath();
    ctx.fillStyle = withAlpha(pal.good, c.hideEdges ? 0.07 : 0.15);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(pal.bad, 0.9 * eSteep);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(aSteep) * len, py + Math.sin(aSteep) * len);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(pal.warn, 0.9 * eShallow);
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(aShallow) * len, py + Math.sin(aShallow) * len);
    ctx.stroke();
    ctx.setLineDash([]);
    // skip-out ghost path when too shallow
    if (sim.zone === -1) {
      ctx.strokeStyle = withAlpha(pal.warn, 0.4 + 0.5 * sim.skip);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + len * 0.7, py - len * 0.1, px + len * 1.1, py - len * 0.55 * (0.4 + sim.skip));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // capsule and plasma
    const heat = sim.heat;
    const size = Math.max(14, Math.min(r.h * 0.2, 26));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    this.drawPlasma(size, 0.18 + 0.82 * heat + (sim.zone === 1 ? 0.15 : 0), f.timeMs);
    this.drawCapsule(size);
    ctx.restore();
    ctx.restore();
    // frame
    g.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.line;
    ctx.stroke();
    // bars: heat and skip
    if (!this.compact) {
      this.drawBar(r, 0, this.env.t('minigame.MG-22.bar.heat'), heat, pal.bad, 'hatch');
      this.drawBar(r, 1, this.env.t('minigame.MG-22.bar.skip'), sim.skip, pal.warn, 'dots');
    }
  }

  private drawBar(scene: Rect, idx: number, label: string, v: number, color: string, kind: 'hatch' | 'dots') {
    const g = this.g;
    const { ctx, pal } = g;
    const bw = Math.min(104, scene.w * 0.3);
    const bh = 7;
    const x = g.rtl ? scene.x + scene.w - 8 - bw : scene.x + 8;
    const y = scene.y + 8 + idx * (bh + 15);
    ctx.textAlign = g.rtl ? 'right' : 'left';
    g.fit(label, bw, 10 * Math.min(g.u, 1.3), 700, false);
    ctx.fillStyle = pal.dim;
    ctx.fillText(label, g.rtl ? x + bw : x, y + 1);
    ctx.fillStyle = withAlpha(pal.bg0, 0.7);
    ctx.fillRect(x, y + 4, bw, bh);
    ctx.fillStyle = color;
    ctx.fillRect(g.rtl ? x + bw * (1 - v) : x, y + 4, bw * v, bh);
    const pat = kind === 'hatch' ? this.hatch : this.dots;
    if (pat && v > 0) {
      ctx.fillStyle = pat;
      ctx.fillRect(g.rtl ? x + bw * (1 - v) : x, y + 4, bw * v, bh);
    }
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 4.5, bw - 1, bh - 1);
  }

  private drawPlasma(s: number, intensity: number, timeMs: number) {
    const { ctx, pal } = this.g;
    const flicker = this.env.reducedMotion ? 0 : 0.06 * Math.sin(timeMs / 90);
    const k = clamp(intensity + flicker, 0.1, 1.2);
    const rad = s * (1.4 + 1.6 * k);
    const grad = ctx.createRadialGradient(s * 0.95, 0, s * 0.2, s * 0.95, 0, rad);
    grad.addColorStop(0, withAlpha(pal.sun, 0.95));
    grad.addColorStop(0.35, withAlpha('#ff9a5a', 0.6 * Math.min(1, k + 0.2)));
    grad.addColorStop(0.7, withAlpha(pal.bad, 0.22 * k));
    grad.addColorStop(1, withAlpha(pal.bad, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s * 0.95, 0, rad, 0, Math.PI * 2);
    ctx.fill();
    // plasma wrapping the shoulder: streaks that run back along the body
    ctx.lineCap = 'round';
    const streaks = this.env.reducedMotion ? 2 : 3;
    for (let i = 0; i < streaks; i++) {
      const off = 0.1 + i * 0.09;
      ctx.strokeStyle = withAlpha(i === 0 ? pal.sun : '#ff9a5a', (0.7 - i * 0.18) * Math.min(1, k + 0.3));
      ctx.lineWidth = Math.max(1.2, s * (0.12 - i * 0.025));
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.95, side * s * (0.5 + off));
        ctx.quadraticCurveTo(s * 0.2, side * s * (0.55 + off * 1.6), -s * (0.7 + k * 1.4 + i * 0.4), side * s * (0.34 + off * 1.1));
        ctx.stroke();
      }
    }
  }

  /** Blunt capsule, heat shield leading (to the right), local coordinates, size `s`. */
  private drawCapsule(s: number) {
    const { ctx, pal } = this.g;
    // body: truncated cone
    ctx.beginPath();
    ctx.moveTo(s * 0.85, -s * 0.52);
    ctx.lineTo(-s * 0.55, -s * 0.26);
    ctx.lineTo(-s * 0.55, s * 0.26);
    ctx.lineTo(s * 0.85, s * 0.52);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
    body.addColorStop(0, '#f4f8f9');
    body.addColorStop(1, '#9fb2bd');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.lineStrong;
    ctx.stroke();
    // heat shield: dark convex face at the front
    ctx.beginPath();
    ctx.moveTo(s * 0.85, -s * 0.52);
    ctx.quadraticCurveTo(s * 1.18, 0, s * 0.85, s * 0.52);
    ctx.closePath();
    ctx.fillStyle = '#3a2a1f';
    ctx.fill();
    ctx.strokeStyle = pal.sun;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // window
    ctx.fillStyle = withAlpha(pal.bg0, 0.8);
    ctx.fillRect(s * 0.1, -s * 0.06, s * 0.2, s * 0.12);
  }

  // ───────────── chart ─────────────

  private drawChart() {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.chart;
    const sim = this.sim;
    const c = sim.config;
    g.roundRect(r, 10);
    ctx.fillStyle = pal.bg1;
    ctx.fill();
    ctx.save();
    g.roundRect(r, 10);
    ctx.clip();
    const yS = this.yOf(c.steepDeg);
    const yH = this.yOf(c.shallowDeg);
    // too shallow (above the band): dots; too steep (below): hatch; the corridor between
    if (this.dots) {
      ctx.fillStyle = this.dots;
      ctx.fillRect(r.x, r.y, r.w, yH - r.y);
    }
    if (this.hatch) {
      ctx.fillStyle = this.hatch;
      ctx.fillRect(r.x, yS, r.w, r.y + r.h - yS);
    }
    const band = ctx.createLinearGradient(0, yH, 0, yS);
    band.addColorStop(0, withAlpha(pal.good, c.hideEdges ? 0.1 : 0.22));
    band.addColorStop(1, withAlpha(pal.good, c.hideEdges ? 0.06 : 0.12));
    ctx.fillStyle = band;
    ctx.fillRect(r.x, yH, r.w, yS - yH);
    // edges and labels
    const eS = this.edgeAlpha(c.steepDeg);
    const eH = this.edgeAlpha(c.shallowDeg);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(pal.good, 0.9 * eS);
    ctx.beginPath();
    ctx.moveTo(r.x, yS);
    ctx.lineTo(r.x + r.w, yS);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(pal.good, 0.9 * eH);
    ctx.beginPath();
    ctx.moveTo(r.x, yH);
    ctx.lineTo(r.x + r.w, yH);
    ctx.stroke();
    if (!this.compact) {
      const small = 11 * Math.min(g.u, 1.3);
      const sx = g.startX(r, 10);
      ctx.textAlign = sx.align;
      g.fit(this.env.t('minigame.MG-22.zone.shallow'), r.w * 0.5, small, 800, false);
      ctx.fillStyle = withAlpha(pal.warn, 1);
      ctx.fillText(this.env.t('minigame.MG-22.zone.shallow'), sx.x, r.y + 17);
      g.fit(this.env.t('minigame.MG-22.zone.steep'), r.w * 0.5, small, 800, false);
      ctx.fillStyle = pal.bad;
      ctx.fillText(this.env.t('minigame.MG-22.zone.steep'), sx.x, r.y + r.h - 9);
      const ex = g.endX(r, 8);
      ctx.textAlign = ex.align;
      g.fit('0', 10, small, 700, true);
      ctx.fillStyle = withAlpha(pal.good, eH);
      ctx.fillText(`${this.env.t('minigame.MG-22.edge.shallow')} ${g.ltr(`${fmtSigned(c.shallowDeg, 1)} °`)}`, ex.x, yH - 5);
      ctx.fillStyle = withAlpha(pal.good, eS);
      ctx.fillText(`${this.env.t('minigame.MG-22.edge.steep')} ${g.ltr(`${fmtSigned(c.steepDeg, 1)} °`)}`, ex.x, yS + small + 3);
      if (c.showGuide) {
        const yc = this.yOf((c.steepDeg + c.shallowDeg) / 2);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = withAlpha(pal.good, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r.x, yc);
        ctx.lineTo(r.x + r.w, yc);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // trace so far, coloured by zone, one stroke per run of the same zone
    const n = sim.step;
    if (n > 1) {
      const stride = 4;
      let zone: Zone = sim.zoneOf(sim.history[0]!);
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.zoneColor(zone);
      ctx.beginPath();
      ctx.moveTo(this.xOf(0), this.yOf(sim.history[0]!));
      for (let i = stride; i < n; i += stride) {
        const gam = sim.history[i]!;
        const z = sim.zoneOf(gam);
        if (z !== zone) {
          ctx.lineTo(this.xOf(i * sim.dtS), this.yOf(gam));
          ctx.stroke();
          zone = z;
          ctx.strokeStyle = this.zoneColor(zone);
          ctx.beginPath();
          ctx.moveTo(this.xOf(i * sim.dtS), this.yOf(gam));
        } else ctx.lineTo(this.xOf(i * sim.dtS), this.yOf(gam));
      }
      ctx.lineTo(this.xOf(sim.timeS), this.yOf(sim.gammaDeg));
      ctx.stroke();
    }
    // marker
    const mx = this.xOf(sim.timeS);
    const my = this.yOf(sim.gammaDeg);
    const col = this.zoneColor(sim.zone);
    ctx.fillStyle = withAlpha(col, 0.22);
    ctx.beginPath();
    ctx.arc(mx, my, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.line;
    g.roundRect(r, 10);
    ctx.stroke();
    // time axis
    if (!this.compact) {
      ctx.textAlign = 'left';
      ctx.font = g.font(10 * Math.min(g.u, 1.3), 600, true);
      ctx.fillStyle = pal.faint;
      ctx.fillText(g.ltr(`${fmt(sim.timeS, 0)} s`), r.x, r.y + r.h + 12 * Math.min(g.u, 1.3));
      ctx.textAlign = 'right';
      ctx.fillText(g.ltr(`${fmt(sim.run.durationS, 0)} s`), r.x + r.w, r.y + r.h + 12 * Math.min(g.u, 1.3));
    }
  }

  // ───────────── steering indicator ─────────────

  private drawRateBar(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.rateBar;
    const sim = this.sim;
    g.panel(r, null);
    const cx = r.x + r.w / 2;
    const top = r.y + 22 * Math.min(g.u, 1.3);
    const bot = r.y + r.h - 22 * Math.min(g.u, 1.3);
    // track
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, bot);
    ctx.stroke();
    const mid = (top + bot) / 2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, mid);
    ctx.lineTo(cx + 10, mid);
    ctx.stroke();
    // thumb: down = steeper
    const y = mid + (sim.stick * (bot - top)) / 2;
    ctx.fillStyle = f.active ? pal.accentStrong : pal.accent;
    g.roundRect({ x: cx - 15, y: y - 11, w: 30, h: 22 }, 8);
    ctx.fill();
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.stroke();
    g.glyph(sim.stick > 0.15 ? 'down' : sim.stick < -0.15 ? 'up' : 'dot', cx, y, 9, pal.bg0);
    // labels
    ctx.textAlign = 'center';
    const small = 9.5 * Math.min(g.u, 1.3);
    g.fit(this.env.t('minigame.MG-22.stick.shallower'), r.w - 4, small, 800, false);
    ctx.fillStyle = pal.warn;
    ctx.fillText(this.env.t('minigame.MG-22.stick.shallower'), cx, r.y + 14 * Math.min(g.u, 1.3));
    g.fit(this.env.t('minigame.MG-22.stick.steeper'), r.w - 4, small, 800, false);
    ctx.fillStyle = pal.bad;
    ctx.fillText(this.env.t('minigame.MG-22.stick.steeper'), cx, r.y + r.h - 8);
  }
}
