// MG-20 canvas renderer: Earth with its atmosphere and the target band (altitudes exaggerated),
// the orbit after the burn with the periapsis marker, a vertical periapsis gauge, the readouts
// and the big burn button. Reads the simulation only.
import { fmt } from '../../data/format';
import { Canvas2D, clamp, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { MU_EARTH, R_EARTH_M, type Mg20Sim } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg20ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg20Frame {
  timeMs: number;
  active: boolean;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

/** Kármán line, km (physical convention, design 8.1). */
const KARMAN_KM = 100;

export class Mg20View {
  readonly c: Canvas2D;
  private sim: Mg20Sim;
  private readonly opts: Mg20ViewOptions;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scene: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private gauge: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Burn button (CSS px). */
  button: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private ex = 0;
  private ey = 0;
  private Rv = 50;
  /** Visual px per km of altitude (exaggerated). */
  private kAlt = 0.1;
  private readonly sceneL: KeyedLayer;
  private readonly topL: KeyedLayer;
  private readonly orbitPts = new Float32Array(2 * 121);

  constructor(canvas: HTMLCanvasElement, sim: Mg20Sim, opts: Mg20ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.sceneL = new KeyedLayer(this.c);
    this.topL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg20Sim) {
    this.sim = sim;
    this.layout();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  private layout() {
    const { c } = this;
    const { W, H } = c;
    this.sceneL.invalidate();
    this.topL.invalidate();
    if (this.opts.compact) {
      this.scene = { x: 6, y: 6, w: W * 0.7 - 6, h: H - 12 };
      this.gauge = { x: W * 0.7 + 6, y: 6, w: W * 0.3 - 12, h: H - 12 };
    } else {
      const pad = 12;
      const u = Math.min(c.u, 1.4);
      const hudH = Math.round(64 * u);
      const stripH = Math.round(40 * u);
      const hintH = Math.round(28 * Math.min(c.u, 1.5));
      const btnH = Math.round(84 * Math.min(c.u, 1.3));
      this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
      this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
      this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
      this.button = { x: pad, y: this.hintR.y - 8 - btnH, w: W - pad * 2, h: btnH };
      const top = this.strip.y + stripH + 10;
      const h = this.button.y - 10 - top;
      const gw = Math.round(Math.max(84, W * 0.24));
      this.scene = { x: pad, y: top, w: W - pad * 2 - gw - 8, h };
      this.gauge = { x: W - pad - gw, y: top, w: gw, h };
    }
    const s = this.scene;
    // Earth fills the lower part; the start orbit sits at 55 % of Earth's visual radius above it.
    this.Rv = Math.min((s.w / 2 - 10) / 1.58, s.h * 0.3);
    this.kAlt = (this.Rv * 0.55) / this.sim.config.altitudeKm;
    this.ex = s.x + s.w / 2;
    this.ey = s.y + s.h / 2 + (this.Rv * 0.55) * 0.12;
  }

  /** Visual radius of an altitude, px. */
  private vr(altKm: number): number {
    return this.Rv + Math.max(-this.Rv * 0.3, altKm) * this.kAlt;
  }

  private gaugeY(altKm: number): number {
    const g = this.gauge;
    const top = g.y + (this.opts.compact ? 8 : 34);
    const bottom = g.y + g.h - (this.opts.compact ? 8 : 16);
    const f = clamp(altKm / (this.sim.config.altitudeKm * 1.05), -0.05, 1);
    return bottom - f * (bottom - top);
  }

  private paintScene() {
    const { c, sim, opts } = this;
    const ctx = c.ctx;
    const { pal } = c;
    const t = opts.t;
    const s = this.scene;
    const cfg = sim.config;
    c.panel(s, 12, pal.bg0);
    ctx.save();
    pathRoundRect(ctx, s, 12);
    ctx.clip();
    // A few stars.
    ctx.fillStyle = withAlpha(pal.ceramic, 0.4);
    for (let i = 0; i < 24; i++) ctx.fillRect(s.x + (((i * 61 + 13) % 100) / 100) * s.w, s.y + (((i * 37 + 7) % 100) / 100) * s.h, 1.2, 1.2);
    const { ex, ey, Rv } = this;
    // Target band ring (hatched, solid edges).
    const r0 = this.vr(cfg.loKm);
    const r1 = this.vr(cfg.hiKm);
    ctx.beginPath();
    ctx.arc(ex, ey, r1, 0, Math.PI * 2);
    ctx.arc(ex, ey, r0, 0, Math.PI * 2, true);
    ctx.fillStyle = withAlpha(pal.good, 0.18);
    ctx.fill();
    ctx.strokeStyle = pal.good;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, r0, 0, Math.PI * 2);
    ctx.moveTo(ex + r1, ey);
    ctx.arc(ex, ey, r1, 0, Math.PI * 2);
    ctx.stroke();
    // Atmosphere up to the Kármán line: thin translucent rim (exaggerated), no halo.
    const ra = this.vr(KARMAN_KM);
    const ag = ctx.createRadialGradient(ex, ey, Rv, ex, ey, ra);
    ag.addColorStop(0, 'rgba(110, 190, 240, 0.45)');
    ag.addColorStop(1, 'rgba(110, 190, 240, 0.04)');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(ex, ey, ra, 0, Math.PI * 2);
    ctx.fill();
    // Earth: ocean navy, land, lit from the upper left, night side lower right.
    const eg = ctx.createRadialGradient(ex - Rv * 0.4, ey - Rv * 0.4, Rv * 0.1, ex, ey, Rv);
    eg.addColorStop(0, '#2b93b4');
    eg.addColorStop(0.6, pal.ocean);
    eg.addColorStop(1, '#0b3a52');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, Rv, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, Rv, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(80, 125, 70, 0.75)';
    for (const [dx, dy, rx, ry, rot] of [
      [-0.35, -0.2, 0.35, 0.2, 0.6],
      [0.2, 0.25, 0.28, 0.16, -0.4],
      [0.4, -0.45, 0.18, 0.1, 0.2],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(ex + dx * Rv, ey + dy * Rv, rx * Rv, ry * Rv, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(240, 245, 248, 0.2)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(ex + Math.cos(i * 2.1) * Rv * 0.6, ey + Math.sin(i * 1.7) * Rv * 0.55, Rv * 0.18, Rv * 0.05, i, 0, Math.PI * 2);
      ctx.fill();
    }
    const night = ctx.createLinearGradient(ex - Rv * 0.2, ey - Rv * 0.2, ex + Rv, ey + Rv);
    night.addColorStop(0, 'rgba(4, 10, 20, 0)');
    night.addColorStop(1, 'rgba(4, 10, 20, 0.75)');
    ctx.fillStyle = night;
    ctx.fillRect(ex - Rv, ey - Rv, Rv * 2, Rv * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(130, 205, 250, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, Rv + 0.5, Math.PI * 0.9, Math.PI * 1.8);
    ctx.stroke();
    // Start orbit, dashed.
    ctx.strokeStyle = withAlpha(pal.dim, 0.45);
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ex, ey, this.vr(cfg.altitudeKm), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!opts.compact) {
      const lp = c.px(10, 1.25);
      c.text(t('minigame.MG-20.scene.band'), ex + r1 * 0.72, ey + r1 * 0.72 + lp, s.w * 0.4, lp, 800, pal.good, 'left');
      c.text(t('minigame.MG-20.scene.exaggerated'), s.x + s.w / 2, s.y + s.h - lp, s.w - 16, lp, 600, pal.faint, 'center');
    }
    ctx.restore();
    // Gauge static part.
    const g = this.gauge;
    c.panel(g, 12);
    const gx = g.x + g.w * (opts.compact ? 0.5 : 0.36);
    const gt = this.gaugeY(cfg.altitudeKm * 1.05);
    const gb = this.gaugeY(-cfg.altitudeKm * 0.05);
    ctx.fillStyle = pal.bg0;
    pathRoundRect(ctx, { x: gx - 5, y: gt, w: 10, h: gb - gt }, 5);
    ctx.fill();
    const y1 = this.gaugeY(cfg.hiKm);
    const y0 = this.gaugeY(cfg.loKm);
    ctx.fillStyle = withAlpha(pal.good, 0.3);
    ctx.fillRect(gx - 14, y1, 28, y0 - y1);
    ctx.strokeStyle = pal.good;
    ctx.lineWidth = 2;
    ctx.strokeRect(gx - 14, y1, 28, y0 - y1);
    const yk = this.gaugeY(KARMAN_KM);
    ctx.strokeStyle = 'rgba(110, 190, 240, 0.7)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(gx - 12, yk);
    ctx.lineTo(gx + 12, yk);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!opts.compact) {
      const lp = c.px(10, 1.2);
      c.text(t('minigame.MG-20.gauge.title'), g.x + g.w / 2, g.y + 14, g.w - 8, lp, 700, pal.dim, 'center');
      ctx.font = c.font(lp, 600, true);
      ctx.fillStyle = pal.faint;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tx = gx + 18;
      for (const a of [0, 100, 200, 300, 400]) if (a <= cfg.altitudeKm * 1.04) ctx.fillText(`${fmt(a, 0)} km`, tx, this.gaugeY(a));
    }
  }

  draw(f: Mg20Frame) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    const cfg = sim.config;
    c.begin();
    this.sceneL.blit({ x: 0, y: this.scene.y - 1, w: c.W, h: this.scene.h + 2 }, 'scene', () => this.paintScene());

    // Orbit after the burn: apoapsis (burn point) at the top, periapsis at the bottom.
    const pKm = sim.periapsisKm;
    const st: Status = pKm > cfg.hiKm ? 'warn' : pKm < cfg.loKm ? 'bad' : 'good';
    const col = c.statusColor(st);
    const rA = R_EARTH_M + cfg.altitudeKm * 1000;
    const rP = R_EARTH_M + Math.max(pKm, -R_EARTH_M / 1000 + 1) * 1000;
    const a = (rA + rP) / 2;
    const e = (rA - rP) / (rA + rP);
    const n = this.orbitPts.length / 2;
    for (let i = 0; i < n; i++) {
      const th = (i / (n - 1)) * Math.PI * 2; // true anomaly from periapsis (bottom)
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
      const vis = this.vr((r - R_EARTH_M) / 1000);
      this.orbitPts[i * 2] = this.ex + Math.sin(th) * vis;
      this.orbitPts[i * 2 + 1] = this.ey + Math.cos(th) * vis;
    }
    ctx.save();
    pathRoundRect(ctx, this.scene, 12);
    ctx.clip();
    ctx.strokeStyle = withAlpha(pal.ceramic, 0.9);
    ctx.lineWidth = opts.compact ? 1.6 : 2.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(this.orbitPts[0]!, this.orbitPts[1]!);
      else ctx.lineTo(this.orbitPts[i * 2]!, this.orbitPts[i * 2 + 1]!);
    }
    ctx.stroke();
    // Periapsis marker (bottom): a triangle pointing at Earth.
    const py = this.ey + this.vr(pKm);
    ctx.fillStyle = col;
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.ex, py + 2);
    ctx.lineTo(this.ex - 8, py + 14);
    ctx.lineTo(this.ex + 8, py + 14);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    // Spacecraft at the top, moving left (counter-clockwise); a retrograde burn pushes right, so
    // the exhaust leaves forward (left).
    const sx = this.ex;
    const sy = this.ey - this.vr(cfg.altitudeKm);
    if (sim.burning) {
      const flick = opts.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(f.timeMs / 30);
      const L = (opts.compact ? 12 : 22) * flick;
      const fg = ctx.createLinearGradient(sx - 6, sy, sx - 6 - L, sy);
      fg.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
      fg.addColorStop(0.4, withAlpha(pal.sun, 0.8));
      fg.addColorStop(1, 'rgba(255, 140, 60, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy - 3.5);
      ctx.lineTo(sx - 6 - L, sy);
      ctx.lineTo(sx - 6, sy + 3.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = pal.ceramic;
    ctx.fillRect(sx - 5, sy - 5, 10, 10);
    ctx.fillStyle = '#d0a752';
    ctx.fillRect(sx - 5, sy + 2, 10, 3);
    ctx.fillStyle = '#26406a';
    ctx.fillRect(sx - 3, sy - 15, 6, 9);
    ctx.fillRect(sx - 3, sy + 6, 6, 9);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 3, sy - 15, 6, 9);
    ctx.strokeRect(sx - 3, sy + 6, 6, 9);
    ctx.restore();

    // Gauge marker.
    const g = this.gauge;
    const gx = g.x + g.w * (opts.compact ? 0.5 : 0.36);
    const my = this.gaugeY(pKm);
    ctx.fillStyle = col;
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx - 16, my);
    ctx.lineTo(gx - 26, my - 7);
    ctx.lineTo(gx - 26, my + 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.fillRect(gx - 14, my - 1.5, 28, 3);

    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }

    // Readouts and strip (cached).
    const [ss, key] = this.status();
    const topKey = `${fmt(sim.dvMs, 1)}|${fmt(pKm, 0)}|${st}|${key}|${ss}`;
    this.topL.blit({ x: 0, y: 0, w: c.W, h: this.strip.y + this.strip.h + 2 }, topKey, () => {
      const gap = 8;
      const tw = (this.hud.w - gap) / 2;
      const A: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
      const B: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
      const [first, second] = c.rtl ? [B, A] : [A, B];
      c.readout(first, t('minigame.MG-20.hud.dv'), fmt(sim.dvMs, 1, 1), 'm/s', pal.text);
      c.readout(second, `${t('minigame.MG-20.hud.periapsis')} · ${t('minigame.MG-20.hud.band', { lo: fmt(cfg.loKm, 0), hi: fmt(cfg.hiKm, 0) })}`, fmt(pKm, 0), 'km', col, st);
      if (ss === 'info') {
        c.roundRect(this.strip, 10);
        c.ctx.fillStyle = pal.bg1;
        c.ctx.fill();
        c.roundRect(this.strip, 10);
        c.ctx.strokeStyle = pal.accent;
        c.ctx.lineWidth = 1.5;
        c.ctx.stroke();
        c.text(t(key), this.strip.x + this.strip.w / 2, this.strip.y + this.strip.h / 2 + 1, this.strip.w - 24, c.px(15, 1.5), 800, pal.text, 'center');
      } else c.statusStrip(this.strip, ss, t(key));
    });

    // Burn button.
    const b = this.button;
    const on = sim.burning;
    pathRoundRect(ctx, b, 16);
    ctx.fillStyle = on ? pal.sun : pal.bg2;
    ctx.fill();
    ctx.lineWidth = on ? 3 : 2;
    ctx.strokeStyle = on ? '#fff1c9' : pal.accent;
    ctx.stroke();
    const label = t(cfg.holdToToggle ? (on ? 'minigame.MG-20.button.stop' : 'minigame.MG-20.button.start') : on ? 'minigame.MG-20.button.burning' : 'minigame.MG-20.button.hold');
    c.text(label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.w - 32, c.px(20, 1.4), 900, on ? pal.ink : pal.text, 'center');
    c.hint(this.hintR, t(cfg.holdToToggle ? 'minigame.MG-20.hint.toggle' : 'minigame.MG-20.hint.hold'), f.active);
    if (f.pausedText) c.overlay(f.pausedText);
  }

  status(): [Status | 'info', string] {
    const sim = this.sim;
    const p = sim.periapsisKm;
    const cfg = sim.config;
    if (p < cfg.loKm) return ['bad', 'minigame.MG-20.status.low'];
    if (p <= cfg.hiKm) return ['good', sim.burning ? 'minigame.MG-20.status.release' : 'minigame.MG-20.status.in_band'];
    if (sim.burning) return ['info', 'minigame.MG-20.status.burning'];
    return ['info', sim.dvMs > 0 ? 'minigame.MG-20.status.more' : 'minigame.MG-20.status.hold'];
  }

  /** Speed at the burn point now, m/s (shown in the README; kept for the ARIA line). */
  speedMs(): number {
    const r = R_EARTH_M + this.sim.config.altitudeKm * 1000;
    return Math.sqrt(MU_EARTH / r) - this.sim.dvMs;
  }
}
