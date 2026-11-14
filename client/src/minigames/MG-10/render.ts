// MG-10 canvas renderer: status strip, read-outs and the recovery scene: dusk sky, both fairing
// halves under their parafoils, the sea with this player's boat and net, the target zone under
// this player's half, and the crew boat.
import { fmt } from '../../data/format';
import { rect, View2D, withAlpha, type Translate } from '../MG-09/shared/draw';
import { ceramicGradient, tealGradient } from '../MG-09/shared/art';
import { SCENE_HALF_M, START_ALT_M, type Mg10Sim } from './model';

export interface Mg10Frame {
  timeMs: number;
  active: boolean;
  /** Where the finger points (standard mode), world m, or null. */
  aimX: number | null;
  /** Teammate boat position from the host, m, when known. */
  liveCrewX: number | null;
  pausedText?: string | null;
  finger?: { x: number; down: boolean } | null;
}

export class Mg10View extends View2D {
  private sim: Mg10Sim;
  private readonly compact: boolean;
  private strip = rect(0, 0, 0, 0);
  private hud = rect(0, 0, 0, 0);
  private scene = rect(0, 0, 0, 0);
  private hint = rect(0, 0, 0, 0);

  constructor(canvas: HTMLCanvasElement, sim: Mg10Sim, t: Translate, reducedMotion: boolean, compact: boolean) {
    super(canvas, t, reducedMotion);
    this.sim = sim;
    this.compact = compact;
    this.layout();
  }

  setSim(sim: Mg10Sim) {
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
    this.scene = rect(pad, y, W - pad * 2, this.hint.y - (hintH ? 6 : 0) - y);
  }

  /** World x (m) of a canvas x (the scene is a map: not mirrored). */
  worldX(px: number): number {
    const r = this.scene;
    return ((px - r.x) / r.w) * 2 * SCENE_HALF_M - SCENE_HALF_M;
  }

  screenX(m: number): number {
    const r = this.scene;
    return r.x + ((m + SCENE_HALF_M) / (2 * SCENE_HALF_M)) * r.w;
  }

  private get seaY(): number {
    return this.scene.y + this.scene.h * 0.72;
  }

  draw(f: Mg10Frame) {
    this.begin();
    if (!this.compact) {
      this.drawStrip();
      this.drawHud();
    }
    this.drawScene(f);
    if (!this.compact) {
      const c = this.sim.config;
      const key = c.oneButton ? (c.holdToToggle ? 'minigame.MG-10.hint.toggle' : 'minigame.MG-10.hint.hold') : 'minigame.MG-10.hint.drag';
      this.ctx.textBaseline = 'middle';
      this.textCenter(this.t(key), this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 1, this.hint.w, 12.5 * this.us, 600, false, f.active ? this.pal.accentStrong : this.pal.dim);
      this.ctx.textBaseline = 'alphabetic';
    }
    if (f.pausedText) this.paused(f.pausedText);
  }

  private drawStrip() {
    const s = this.sim;
    if (s.under) {
      this.statusStrip(this.strip, 'good', 'ok', this.t('minigame.MG-10.status.under'));
      return;
    }
    const gap = s.gapM;
    // The half is to the left of the boat when the gap is positive.
    this.statusStrip(this.strip, 'warn', 'warn', this.t(gap > 0 ? 'minigame.MG-10.status.left' : 'minigame.MG-10.status.right', { m: fmt(Math.abs(gap), 0) }));
  }

  private drawHud() {
    const { pal, sim } = this;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const a = rect(this.hud.x, this.hud.y, w, this.hud.h);
    const b = rect(this.hud.x + w + gap, this.hud.y, w, this.hud.h);
    const first = this.rtl ? b : a;
    const second = this.rtl ? a : b;
    const share = sim.underFraction;
    const ok = share >= sim.config.successMin;
    this.tile(first, this.t('minigame.MG-10.hud.under', { pct: fmt(sim.config.successMin * 100, 0) }), fmt(Math.floor(share * 100), 0), '%', ok ? pal.good : pal.warn, { kind: ok ? 'ok' : 'warn', color: ok ? pal.good : pal.warn });
    this.tile(second, this.t('minigame.MG-10.hud.alt'), fmt(Math.round(sim.altitudeM / 10) * 10, 0), 'm', pal.text, { kind: 'down', color: pal.accent });
  }

  private drawParafoil(x: number, y: number, size: number, mine: boolean, time: number) {
    const { ctx, pal } = this;
    const sway = this.reducedMotion ? 0 : Math.sin(time * 1.3 + x * 0.05) * 0.05;
    const sun = this.rtl ? -1 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    const cw = size * 1.9;
    const ch = size * 0.36;
    const top = -size * 1.55;
    // Suspension lines first (behind the canopy's lower skin), fine and slightly warm.
    ctx.strokeStyle = 'rgba(232, 238, 240, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      ctx.moveTo(-cw / 2 + (i / 6) * cw, top + ch * 0.5 - Math.sin((i / 6) * Math.PI) * ch * 0.4);
      ctx.lineTo(0, -size * 0.25);
    }
    ctx.stroke();
    // Ram-air canopy: individual cells with their own light (lit side warm, shade side cool).
    const cells = 7;
    const upper = (u: number) => top + ch * 0.55 - Math.sin(u * Math.PI) * ch * 1.45;
    const lower = (u: number) => top + ch * 0.55 - Math.sin(u * Math.PI) * ch * 0.65;
    const base = mine ? pal.sun : '#dfe7ec';
    const shadeC = mine ? '#b5763f' : '#7f93a6';
    for (let i = 0; i < cells; i++) {
      const u0 = i / cells;
      const u1 = (i + 1) / cells;
      const x0 = -cw / 2 + u0 * cw;
      const x1 = -cw / 2 + u1 * cw;
      ctx.beginPath();
      ctx.moveTo(x0, upper(u0));
      ctx.quadraticCurveTo((x0 + x1) / 2, upper((u0 + u1) / 2) - ch * 0.12, x1, upper(u1));
      ctx.lineTo(x1, lower(u1));
      ctx.quadraticCurveTo((x0 + x1) / 2, lower((u0 + u1) / 2) + ch * 0.05, x0, lower(u0));
      ctx.closePath();
      const lit = sun > 0 ? u0 : 1 - u1;
      const g = ctx.createLinearGradient(0, top - ch, 0, top + ch * 0.6);
      g.addColorStop(0, base);
      g.addColorStop(1, shadeC);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = `rgba(10, 25, 40, ${0.28 * (1 - lit)})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(7, 21, 34, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // Leading-edge rim light.
    ctx.strokeStyle = withAlpha(pal.sun, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const px = -cw / 2 + u * cw;
      if (i === 0) ctx.moveTo(px, upper(u));
      else ctx.lineTo(px, upper(u));
    }
    ctx.stroke();
    // Fairing half: a curved ceramic clamshell with a teal band and a silver edge.
    ctx.beginPath();
    ctx.moveTo(-size * 0.22, -size * 0.25);
    ctx.quadraticCurveTo(size * 0.42, -size * 0.1, size * 0.3, size * 0.55);
    ctx.lineTo(-size * 0.2, size * 0.55);
    ctx.quadraticCurveTo(-size * 0.05, size * 0.1, -size * 0.22, -size * 0.25);
    ctx.closePath();
    ctx.fillStyle = ceramicGradient(ctx, size * 0.6, sun, size * 0.05);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = tealGradient(ctx, size * 0.6, sun, size * 0.05);
    ctx.fillRect(-size * 0.25, size * 0.36, size * 0.6, size * 0.07);
    ctx.fillStyle = 'rgba(30, 48, 66, 0.25)';
    ctx.fillRect(-size * 0.25, size * 0.5, size * 0.6, size * 0.05);
    ctx.restore();
    ctx.strokeStyle = 'rgba(200, 210, 218, 0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, size * 0.55);
    ctx.quadraticCurveTo(-size * 0.05, size * 0.1, -size * 0.22, -size * 0.25);
    ctx.stroke();
    ctx.restore();
  }

  private drawBoat(x: number, y: number, size: number, mine: boolean, label: string) {
    const { ctx, pal } = this;
    const sun = this.rtl ? -1 : 1;
    ctx.save();
    // The net (drawn right of the hull's centre) is what has to be under the half: centre it on x.
    ctx.translate(x - size * 0.5, y);
    // Reflection on the water.
    const refl = ctx.createLinearGradient(0, size * 0.22, 0, size * 0.9);
    refl.addColorStop(0, mine ? 'rgba(232, 238, 240, 0.22)' : 'rgba(142, 165, 181, 0.16)');
    refl.addColorStop(1, 'rgba(232, 238, 240, 0)');
    ctx.fillStyle = refl;
    ctx.fillRect(-size * 0.9, size * 0.22, size * 1.75, size * 0.7);
    // Hull: dark navy below a white sheer line.
    ctx.beginPath();
    ctx.moveTo(-size * 1.1, -size * 0.25);
    ctx.lineTo(size * 1.15, -size * 0.25);
    ctx.lineTo(size * 0.85, size * 0.22);
    ctx.lineTo(-size * 0.9, size * 0.22);
    ctx.closePath();
    const hull = ctx.createLinearGradient(0, -size * 0.25, 0, size * 0.22);
    hull.addColorStop(0, mine ? '#eef3f5' : '#a9b8c4');
    hull.addColorStop(0.42, mine ? '#c9d5dd' : '#7f93a6');
    hull.addColorStop(0.45, mine ? '#1c3b55' : '#24435c');
    hull.addColorStop(1, '#0b1d2e');
    ctx.fillStyle = hull;
    ctx.fill();
    ctx.fillStyle = mine ? tealGradient(ctx, size * 2.2, sun) : '#3f6d8a';
    ctx.fillRect(-size * 1.05, -size * 0.1, size * 2.15, size * 0.06);
    // Superstructure: ceramic block with dark windows and a mast.
    ctx.fillStyle = mine ? ceramicGradient(ctx, size * 0.7, sun, -size * 0.45) : '#6f8696';
    ctx.fillRect(-size * 0.8, -size * 0.62, size * 0.7, size * 0.37);
    ctx.fillStyle = mine ? '#c9d5dd' : '#5d7385';
    ctx.fillRect(-size * 0.7, -size * 0.82, size * 0.42, size * 0.2);
    ctx.fillStyle = 'rgba(7, 21, 34, 0.75)';
    for (let i = 0; i < 4; i++) ctx.fillRect(-size * 0.74 + i * size * 0.15, -size * 0.52, size * 0.1, size * 0.08);
    ctx.strokeStyle = mine ? '#c3ccd3' : '#6f8696';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size * 0.82);
    ctx.lineTo(-size * 0.5, -size * 1.15);
    ctx.stroke();
    // Warm practical light on the mast.
    ctx.fillStyle = withAlpha(pal.sun, 0.9);
    ctx.beginPath();
    ctx.arc(-size * 0.5, -size * 1.15, Math.max(1, size * 0.04), 0, Math.PI * 2);
    ctx.fill();
    // Net between two arms.
    ctx.strokeStyle = mine ? '#d5e1e8' : withAlpha(pal.text, 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 0.1, -size * 0.25);
    ctx.lineTo(-size * 0.2, -size * 1.0);
    ctx.moveTo(size * 0.9, -size * 0.25);
    ctx.lineTo(size * 1.2, -size * 1.0);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(mine ? pal.accentStrong : pal.dim, 0.75);
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const fx = -size * 0.2 + (i / 5) * size * 1.4;
      ctx.moveTo(fx, -size * 1.0);
      ctx.lineTo(size * 0.1 + (i / 5) * size * 0.8, -size * 0.3);
    }
    ctx.moveTo(-size * 0.2, -size * 1.0);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.55, size * 1.2, -size * 1.0);
    ctx.stroke();
    // Bow wake.
    ctx.strokeStyle = 'rgba(232, 238, 240, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(size * 0.9, size * 0.2);
    ctx.quadraticCurveTo(size * 1.3, size * 0.26, size * 1.6, size * 0.24);
    ctx.stroke();
    ctx.restore();
    if (!this.compact) {
      const px = 10.5 * Math.min(this.u, 1.3);
      ctx.textBaseline = 'alphabetic';
      this.textCenter(label, x, y + size * 0.22 + px + 6, size * 4, px, mine ? 850 : 650, true, mine ? pal.accentStrong : pal.dim);
    }
  }

  private drawScene(f: Mg10Frame) {
    const { ctx, pal, sim } = this;
    const r = this.scene;
    const seaY = this.seaY;
    this.backdrop(r, 12, (seaY - r.y) / r.h, this.rtl ? 'left' : 'right');
    ctx.save();
    this.roundRect(r, 12);
    ctx.clip();
    const time = f.timeMs / 1000;
    // Sea.
    const sea = ctx.createLinearGradient(0, seaY, 0, r.y + r.h);
    sea.addColorStop(0, '#2a7aa3');
    sea.addColorStop(0.08, '#1a5b80');
    sea.addColorStop(0.5, '#0e3a58');
    sea.addColorStop(1, '#06203a');
    ctx.fillStyle = sea;
    ctx.fillRect(r.x, seaY, r.w, r.y + r.h - seaY);
    // Horizon haze and the sun's glitter path on the water.
    const haze = ctx.createLinearGradient(0, seaY - 14, 0, seaY + 10);
    haze.addColorStop(0, 'rgba(150, 210, 240, 0)');
    haze.addColorStop(0.6, 'rgba(170, 220, 245, 0.35)');
    haze.addColorStop(1, 'rgba(150, 210, 240, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(r.x, seaY - 14, r.w, 24);
    const gx = this.rtl ? r.x + r.w * 0.12 : r.x + r.w * 0.88;
    const glit = ctx.createRadialGradient(gx, seaY, 0, gx, seaY, r.w * 0.5);
    glit.addColorStop(0, withAlpha(pal.sun, 0.42));
    glit.addColorStop(0.35, withAlpha(pal.sun, 0.1));
    glit.addColorStop(1, withAlpha(pal.sun, 0));
    ctx.fillStyle = glit;
    ctx.fillRect(r.x, seaY, r.w, r.y + r.h - seaY);
    // Sun glint and wave lines (steady in reduced motion).
    ctx.strokeStyle = 'rgba(232, 238, 240, 0.22)';
    ctx.lineWidth = 1.2;
    for (let row = 0; row < 6; row++) {
      const wy = seaY + 8 + row * ((r.y + r.h - seaY) / 6);
      const off = this.reducedMotion ? 0 : time * (12 + row * 3);
      ctx.beginPath();
      for (let x = 0; x <= r.w; x += 8) {
        const yy = wy + Math.sin((x + off + row * 40) / (22 + row * 4)) * (1.2 + row * 0.3);
        if (x === 0) ctx.moveTo(r.x + x, yy);
        else ctx.lineTo(r.x + x, yy);
      }
      ctx.stroke();
    }
    // Target zone under this player's half: a green band on the sea and a drop line.
    const mine = sim.myHalf;
    const hx = this.screenX(sim.halfX[mine]);
    const half = sim.config.netHalfM;
    const z0 = this.screenX(sim.halfX[mine] - half);
    const z1 = this.screenX(sim.halfX[mine] + half);
    ctx.fillStyle = withAlpha(pal.good, sim.under ? 0.4 : 0.22);
    this.roundRect(rect(z0, seaY - 3, z1 - z0, 10), 5);
    ctx.fill();
    ctx.strokeStyle = pal.good;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const top = r.y + 24;
    const fall = seaY - top - r.h * 0.12;
    const hy = top + fall * (1 - sim.altitudeM / START_ALT_M) + r.h * 0.12;
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = withAlpha(pal.good, 0.75);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 18);
    ctx.lineTo(hx, seaY - 4);
    ctx.stroke();
    ctx.setLineDash([]);
    // Both halves under their parafoils.
    const size = Math.max(16, Math.min(40, r.w * 0.1)) * (this.compact ? 0.7 : 1);
    for (const i of [0, 1] as const) this.drawParafoil(this.screenX(sim.halfX[i]), hy + (i === mine ? 0 : 6), size, i === mine, time);
    // Finger aim.
    if (f.aimX !== null && !sim.config.oneButton) {
      const ax = this.screenX(f.aimX);
      ctx.strokeStyle = withAlpha(pal.accentStrong, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, seaY + 14);
      ctx.lineTo(ax, seaY + 30);
      ctx.stroke();
    }
    // Boats.
    const bs = size * 1.05;
    const crewX = f.liveCrewX ?? sim.crewX;
    this.drawBoat(this.screenX(crewX), seaY + 4, bs * 0.85, false, this.t(f.liveCrewX !== null ? 'minigame.MG-10.boat.team' : 'minigame.MG-10.boat.crew'));
    this.drawBoat(this.screenX(sim.boatX), seaY + 4, bs, true, this.t('minigame.MG-10.boat.you'));
    if (f.finger) this.finger(this.screenX(f.finger.x), seaY + 34, f.finger.down, this.compact ? 12 : 18);
    ctx.restore();
    this.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.22)';
    ctx.stroke();
    if (this.compact) return;
    // Scale bar and the gap read-out.
    const px = 10.5 * Math.min(this.u, 1.3);
    const bar = (50 / (2 * SCENE_HALF_M)) * r.w;
    const bx = r.x + 12;
    const by = r.y + r.h - 14;
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by - 4);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bar, by);
    ctx.lineTo(bx + bar, by - 4);
    ctx.stroke();
    ctx.font = this.font(px, 700, true);
    ctx.fillStyle = pal.text;
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillText(`${fmt(50, 0)} m`, bx + bar + 6, by + 1);
    ctx.textAlign = 'right';
    const g = sim.gapM;
    ctx.fillStyle = sim.under ? pal.good : pal.warn;
    ctx.fillText(this.t('minigame.MG-10.scene.gap', { m: fmt(Math.abs(g), 0) }), r.x + r.w - 12, by + 1);
    ctx.direction = this.rtl ? 'rtl' : 'ltr';
    ctx.textBaseline = 'alphabetic';
    this.textStart(this.t('minigame.MG-10.scene.title'), r, 12, r.y + px + 8, px, 700, true, pal.dim, r.w * 0.7);
  }
}
