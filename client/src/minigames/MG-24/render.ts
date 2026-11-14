// MG-24 canvas renderer: altitude and speed cards, the status line, the descent scene (zooming
// altitude tape, the booster, the ghost of the ideal ignition altitude, the pad) and the IGNITE
// button. It only reads the simulation; the rules live in `model.ts`.
import { fmt } from '../../data/format';
import type { MinigameEnv } from '../types';
import { clamp, Gfx, withAlpha, type Frame, type Rect, type ViewLike } from '../MG-22/kit';
import type { Mg24Sim } from './model';

const NICE = [5, 10, 20, 50, 100, 200, 500];

export class Mg24View implements ViewLike<Mg24Sim> {
  readonly g: Gfx;
  private sim: Mg24Sim;
  private readonly env: MinigameEnv;
  private readonly compact: boolean;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scene: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** The IGNITE button; the whole playfield in one-button mode. */
  button: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(canvas: HTMLCanvasElement, sim: Mg24Sim, env: MinigameEnv, compact: boolean) {
    this.g = new Gfx(canvas);
    this.sim = sim;
    this.env = env;
    this.compact = compact;
    this.resize();
  }

  setSim(sim: Mg24Sim) {
    this.sim = sim;
  }

  resize() {
    const g = this.g;
    g.measure();
    const { W, H, u } = g;
    const compact = this.compact;
    const pad = compact ? 8 : 12;
    const gap = 8;
    const hudH = compact ? 0 : Math.round(60 * Math.min(u, 1.45));
    const stripH = compact ? 0 : Math.round(36 * Math.min(u, 1.5));
    const btnH = compact ? 0 : Math.round(64 * Math.min(u, 1.3));
    let y = pad;
    this.hud = { x: pad, y, w: W - pad * 2, h: hudH };
    y += hudH + (hudH ? gap : 0);
    this.strip = { x: pad, y, w: W - pad * 2, h: stripH };
    y += stripH + (stripH ? gap : 0);
    const bottom = H - pad;
    const btnY = bottom - btnH;
    this.scene = { x: pad, y, w: W - pad * 2, h: Math.max(80, btnY - (btnH ? gap : 0) - y) };
    this.button = btnH ? { x: pad, y: btnY, w: W - pad * 2, h: btnH } : { x: 0, y: 0, w: 0, h: 0 };
  }

  /** Is (x, y) an IGNITE press? Anywhere in one-button mode, otherwise on the button. */
  hits(x: number, y: number): boolean {
    if (this.sim.config.wholeField) return true;
    const b = this.button;
    return b.w > 0 && x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
  }

  demoFinger(sim: Mg24Sim): { x: number; y: number; down: boolean } | null {
    const near = sim.phase === 'fall' && sim.clockRate < 0.5;
    const down = sim.igniteStep >= 0 && sim.step - sim.igniteStep < 50;
    if (!near && !down) return null;
    return { x: this.scene.x + this.scene.w / 2, y: this.g.H - 34, down };
  }

  draw(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    g.begin();
    if (!this.compact) {
      this.drawHud();
      this.drawStrip();
    }
    this.drawScene(f);
    if (!this.compact) this.drawButton();
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
  }

  private drawHud() {
    const g = this.g;
    const { pal } = g;
    const sim = this.sim;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const cardsData: Array<{ label: string; num: string; unit: string }> = [
      { label: this.env.t('minigame.MG-24.hud.altitude'), num: fmt(Math.max(0, sim.altitudeM), sim.altitudeM < 100 ? 1 : 0, sim.altitudeM < 100 ? 1 : 0), unit: 'm' },
      { label: this.env.t('minigame.MG-24.hud.speed'), num: fmt(Math.max(0, sim.speedMS), 1, 1), unit: 'm/s' },
    ];
    const pad = 12;
    cardsData.forEach((c, i) => {
      const r: Rect = { x: this.hud.x + (g.rtl ? 1 - i : i) * (w + gap), y: this.hud.y, w, h: this.hud.h };
      g.panel(r, null);
      const s = g.startX(r, pad);
      g.label(c.label, s.x, r.y + 20 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2, s.align);
      g.numberWithUnit(c.num, c.unit, s.x, r.y + r.h - 12, w - pad * 2, 30 * Math.min(g.u, 1.3), pal.text);
    });
  }

  private statusKey(): { key: string; col: string; glyph: 'ok' | 'up' | 'down' | 'x' | 'dot'; border: 'solid' | 'dashed' | 'double'; args?: Record<string, string | number> } {
    const sim = this.sim;
    const { pal } = this.g;
    if (sim.phase === 'down') {
      const args = { v: fmt(sim.touchdownMS, 1, 1) };
      if (sim.perfect) return { key: 'minigame.MG-24.status.hero', col: pal.good, glyph: 'ok', border: 'solid', args };
      if (sim.success) return { key: 'minigame.MG-24.status.soft', col: pal.good, glyph: 'ok', border: 'solid', args };
      if (!sim.outcome) return { key: 'minigame.MG-24.status.none', col: pal.bad, glyph: 'x', border: 'double', args };
      return { key: sim.outcome.early ? 'minigame.MG-24.status.early' : 'minigame.MG-24.status.late', col: pal.bad, glyph: 'x', border: 'double', args };
    }
    if (sim.phase === 'burn') return { key: 'minigame.MG-24.status.burn', col: pal.accentStrong, glyph: 'down', border: 'solid' };
    if (sim.phase === 'cutoff') return { key: 'minigame.MG-24.status.cutoff', col: pal.warn, glyph: 'down', border: 'dashed' };
    if (sim.clockRate < 0.5) return { key: 'minigame.MG-24.status.slow', col: pal.accentStrong, glyph: 'up', border: 'dashed', args: { n: fmt(Math.round(1 / sim.clockRate), 0) } };
    return { key: 'minigame.MG-24.status.fall', col: pal.dim, glyph: 'dot', border: 'solid' };
  }

  private drawStrip() {
    const g = this.g;
    const { ctx, pal } = g;
    const { key, col, glyph, border, args } = this.statusKey();
    const r = this.strip;
    g.roundRect(r, 10);
    ctx.fillStyle = withAlpha(col, 0.14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col;
    ctx.setLineDash(border === 'dashed' ? [5, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    const text = this.env.t(key, args);
    const size = g.fit(text, r.w - 56, 14 * Math.min(g.u, 1.3), 800, false);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = pal.text;
    ctx.fillText(text, r.x + r.w / 2 + 12, r.y + r.h / 2 + 1);
    g.glyph(glyph, r.x + r.w / 2 - tw / 2 - 4, r.y + r.h / 2, size, col);
    ctx.textBaseline = 'alphabetic';
  }

  // ───────────── the descent scene ─────────────

  private drawScene(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.scene;
    const sim = this.sim;
    const rm = this.env.reducedMotion;
    const u = Math.min(g.u, 1.3);
    ctx.save();
    g.roundRect(r, 12);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    sky.addColorStop(0, pal.bg0);
    sky.addColorStop(0.75, pal.bg2);
    sky.addColorStop(1, withAlpha(pal.accent, 0.3));
    ctx.fillStyle = sky;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Camera: the ground is at the bottom, the view reaches 1.7 × the altitude (zooms in as it falls).
    const groundY = r.y + r.h - Math.round(26 * u);
    const alt = Math.max(0, sim.altitudeM);
    const range = clamp(alt * 1.7, 40, sim.h0M * 1.08);
    const pxPerM = (groundY - r.y - 10) / range;
    const yOf = (h: number) => groundY - h * pxPerM;

    // Altitude tape.
    const stepM = NICE.find((n) => range / n <= 6) ?? 1000;
    const tapeX = g.rtl ? r.x + r.w - 10 : r.x + 10;
    const dir = g.rtl ? -1 : 1;
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.8);
    ctx.fillStyle = pal.faint;
    ctx.lineWidth = 1;
    ctx.font = g.font(10 * u, 600, true);
    ctx.textAlign = g.rtl ? 'right' : 'left';
    for (let h = stepM; h <= range * 1.02; h += stepM) {
      const y = yOf(h);
      if (y < r.y + 6) break;
      ctx.beginPath();
      ctx.moveTo(tapeX, y);
      ctx.lineTo(tapeX + dir * 14, y);
      ctx.stroke();
      ctx.fillText(g.ltr(`${fmt(h, 0)} m`), tapeX + dir * 20, y + 3);
    }

    // Ghost of the ideal ignition altitude h* (Standard: fades; Relaxed: stays).
    const ga = sim.ghostAlpha;
    if (ga > 0.02 && sim.phase === 'fall') {
      const y = yOf(sim.hStarM);
      if (y > r.y && y < groundY) {
        ctx.save();
        ctx.globalAlpha = ga;
        ctx.strokeStyle = pal.good;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(r.x + 56, y);
        ctx.lineTo(r.x + r.w - 6, y);
        ctx.stroke();
        ctx.setLineDash([]);
        this.drawBooster(r.x + r.w * 0.5, y, u, false, false, f.timeMs, true);
        const label = this.env.t('minigame.MG-24.ghost.label', { h: fmt(sim.hStarM, 0) });
        ctx.fillStyle = pal.good;
        ctx.textAlign = g.rtl ? 'left' : 'right';
        g.fit(label, r.w * 0.5 - 30 * u, 11 * u, 800, false);
        ctx.fillText(label, g.rtl ? r.x + 56 : r.x + r.w - 10, y - 6);
        ctx.restore();
      }
    }

    // Pad.
    ctx.fillStyle = pal.bg3;
    ctx.fillRect(r.x, groundY, r.w, r.y + r.h - groundY);
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x, groundY);
    ctx.lineTo(r.x + r.w, groundY);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(pal.text, 0.5);
    ctx.lineWidth = 3;
    const cx = r.x + r.w * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - 34 * u, groundY + 6);
    ctx.lineTo(cx + 34 * u, groundY + 6);
    ctx.stroke();

    // The booster (resting on the pad when down).
    const by = yOf(alt);
    this.drawBooster(cx, by, u, sim.phase === 'burn', sim.phase !== 'fall', f.timeMs, false);

    // Slow-motion chip (the bullet-time clock near h*).
    if (sim.phase === 'fall' && sim.clockRate < 0.5 && !this.compact) {
      const label = this.env.t('minigame.MG-24.slow.chip', { n: fmt(Math.round(1 / sim.clockRate), 0) });
      ctx.font = g.font(11 * u, 800, false);
      const tw = ctx.measureText(label).width + 20;
      const chip: Rect = { x: r.x + r.w - tw - 8, y: r.y + 8, w: tw, h: 24 * u };
      g.roundRect(chip, 8);
      ctx.fillStyle = withAlpha(pal.accent, 0.2);
      ctx.fill();
      ctx.strokeStyle = pal.accentStrong;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pal.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, chip.x + chip.w / 2, chip.y + chip.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
    // Touchdown dust ring (not in reduced motion).
    if (sim.phase === 'down' && !rm) {
      ctx.strokeStyle = withAlpha(pal.text, 0.25);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, groundY, 30 * u, 6 * u, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    g.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.line;
    ctx.stroke();
  }

  /** The booster with its feet at (x, y): body, interstage, grid fins, legs, and the flame while burning. */
  private drawBooster(x: number, y: number, u: number, burning: boolean, legs: boolean, timeMs: number, ghost: boolean) {
    const { ctx, pal } = this.g;
    const w = 14 * u;
    const h = 52 * u;
    ctx.save();
    ctx.lineJoin = 'round';
    if (ghost) {
      ctx.strokeStyle = pal.good;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x - w / 2, y - h, w, h);
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    // flame
    if (burning) {
      const flick = this.env.reducedMotion ? 0 : Math.sin(timeMs / 40) * 3;
      const fl = (34 + flick) * u;
      const grad = ctx.createLinearGradient(0, y, 0, y + fl);
      grad.addColorStop(0, '#fff3c4');
      grad.addColorStop(0.4, '#ffb347');
      grad.addColorStop(1, withAlpha('#ff6a3d', 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.4, y);
      ctx.lineTo(x, y + fl);
      ctx.lineTo(x + w * 0.4, y);
      ctx.closePath();
      ctx.fill();
    }
    // legs
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    const spread = legs ? 14 * u : 5 * u;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - 6 * u);
    ctx.lineTo(x - w / 2 - spread, y);
    ctx.moveTo(x + w / 2, y - 6 * u);
    ctx.lineTo(x + w / 2 + spread, y);
    ctx.stroke();
    // body
    ctx.fillStyle = pal.text;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = pal.bg0;
    ctx.fillRect(x - w / 2, y - h * 0.34, w, h * 0.14);
    // nose
    ctx.fillStyle = pal.dim;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h);
    ctx.lineTo(x, y - h - 10 * u);
    ctx.lineTo(x + w / 2, y - h);
    ctx.closePath();
    ctx.fill();
    // grid fins
    ctx.fillStyle = pal.accentStrong;
    ctx.fillRect(x - w / 2 - 6 * u, y - h * 0.9, 6 * u, 4 * u);
    ctx.fillRect(x + w / 2, y - h * 0.9, 6 * u, 4 * u);
    ctx.restore();
  }

  private drawButton() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const b = this.button;
    const live = sim.phase === 'fall';
    const near = live && sim.clockRate < 0.5;
    const col = !live ? pal.dim : near ? pal.good : pal.accentStrong;
    g.roundRect(b, 14);
    ctx.fillStyle = !live ? pal.bg2 : withAlpha(near ? pal.good : pal.accent, near ? 0.9 : 0.85);
    ctx.fill();
    ctx.lineWidth = live ? 3 : 1.5;
    ctx.strokeStyle = col;
    ctx.stroke();
    const label = this.env.t(sim.config.wholeField ? 'minigame.MG-24.button.anywhere' : 'minigame.MG-24.button.ignite');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.fit(label, b.w - 24, 22 * Math.min(g.u, 1.25), 800, false);
    ctx.fillStyle = !live ? pal.faint : pal.bg0;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
}
