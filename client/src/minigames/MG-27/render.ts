// MG-27 canvas renderer: time and beacon cards, the arrival order of the three units, a status line,
// the sea with this player's unit, its wake and the beacon rings, the signal meter and (in
// one-button mode) the SET OFF button. It only reads the simulation; the rules live in `model.ts`.
import { fmt } from '../../data/format';
import type { MinigameEnv } from '../types';
import { clamp, Gfx, withAlpha, type Frame, type Rect, type ViewLike } from '../MG-22/kit';
import { FIELD_KM, N_UNITS, UNITS, type Mg27Sim } from './model';

const TRAIL = 48;

export class Mg27View implements ViewLike<Mg27Sim> {
  readonly g: Gfx;
  private sim: Mg27Sim;
  private readonly env: MinigameEnv;
  private readonly compact: boolean;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private order: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private sea: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private meter: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private button: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private readonly trail = new Float32Array(TRAIL * 2);
  private trailN = 0;
  private lastTrailStep = -99;
  /** Stick feedback written by the controller (canvas px). */
  stick = { on: false, ox: 0, oy: 0, x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, sim: Mg27Sim, env: MinigameEnv, compact: boolean) {
    this.g = new Gfx(canvas);
    this.sim = sim;
    this.env = env;
    this.compact = compact;
    this.resize();
  }

  setSim(sim: Mg27Sim) {
    this.sim = sim;
    this.trailN = 0;
    this.lastTrailStep = -99;
  }

  resize() {
    const g = this.g;
    g.measure();
    const { W, H, u } = g;
    const compact = this.compact;
    const pad = compact ? 8 : 12;
    const gap = compact ? 6 : 8;
    const k = Math.min(u, 1.3);
    const tight = !compact && H < 640 * Math.min(u, 1.3) * 0.9;
    const hudH = compact || tight ? 0 : Math.round(56 * Math.min(u, 1.45));
    const orderH = compact ? 0 : Math.round(54 * k);
    const stripH = compact ? 0 : Math.round(34 * Math.min(u, 1.5));
    const meterH = compact ? 12 : Math.round(22 * k);
    const btnH = compact || !this.sim.config.oneButton ? 0 : Math.round(56 * k);
    let y = pad;
    this.hud = { x: pad, y, w: W - pad * 2, h: hudH };
    y += hudH + (hudH ? gap : 0);
    this.order = { x: pad, y, w: W - pad * 2, h: orderH };
    y += orderH + (orderH ? gap : 0);
    this.strip = { x: pad, y, w: W - pad * 2, h: stripH };
    y += stripH + (stripH ? gap : 0);
    const bottom = H - pad;
    const btnY = bottom - btnH;
    this.button = btnH ? { x: pad, y: btnY, w: W - pad * 2, h: btnH } : { x: 0, y: 0, w: 0, h: 0 };
    const meterY = btnY - (btnH ? gap : 0) - meterH;
    this.meter = { x: pad, y: meterY, w: W - pad * 2, h: meterH };
    this.sea = { x: pad, y, w: W - pad * 2, h: Math.max(80, meterY - gap - y) };
    this.scale = Math.min(this.sea.w, this.sea.h) / FIELD_KM;
    this.ox = this.sea.x + (this.sea.w - FIELD_KM * this.scale) / 2;
    this.oy = this.sea.y + (this.sea.h - FIELD_KM * this.scale) / 2;
  }

  /** Is (x, y) a press on the play area? */
  hits(x: number, y: number): boolean {
    const r = this.sim.config.oneButton ? { x: 0, y: 0, w: this.g.W, h: this.g.H } : this.sea;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  private px(kmX: number) {
    return this.ox + kmX * this.scale;
  }
  private py(kmY: number) {
    return this.oy + kmY * this.scale;
  }

  demoFinger(sim: Mg27Sim): { x: number; y: number; down: boolean } | null {
    if (sim.state !== 'search') return null;
    const moving = Math.hypot(sim.vx, sim.vy) > 0.05;
    if (!moving) return null;
    return { x: this.px(sim.x) + sim.vx * 8, y: this.py(sim.y) + sim.vy * 8, down: true };
  }

  draw(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    if (sim.step !== this.lastTrailStep && sim.step % 6 === 0) {
      this.lastTrailStep = sim.step;
      if (this.trailN < TRAIL) this.trailN++;
      for (let i = this.trailN - 1; i > 0; i--) {
        this.trail[i * 2] = this.trail[(i - 1) * 2]!;
        this.trail[i * 2 + 1] = this.trail[(i - 1) * 2 + 1]!;
      }
      this.trail[0] = sim.x;
      this.trail[1] = sim.y;
    }
    g.begin();
    if (!this.compact) {
      if (this.hud.h > 0) this.drawHud();
      this.drawOrder();
      this.drawStrip();
    }
    this.drawSea(f);
    this.drawMeter();
    if (!this.compact && sim.config.oneButton) this.drawButton();
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

  private unitName(u: number): string {
    return this.env.t(`minigame.MG-27.unit.${UNITS[u]!}`);
  }

  private drawHud() {
    const g = this.g;
    const { pal } = g;
    const sim = this.sim;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const left = Math.max(0, sim.deadlineS - sim.timeS);
    const urgent = sim.state === 'search' && left < 4;
    const cardsData = [
      { label: this.env.t('minigame.MG-27.hud.time'), num: fmt(left, 1, 1), unit: 's', col: urgent ? pal.warn : pal.text },
      { label: this.env.t('minigame.MG-27.hud.signal'), num: fmt(Math.round(sim.signal * 100), 0), unit: '%', col: pal.text },
    ];
    const pad = 12;
    cardsData.forEach((c, i) => {
      const r: Rect = { x: this.hud.x + (g.rtl ? 1 - i : i) * (w + gap), y: this.hud.y, w, h: this.hud.h };
      g.panel(r, i === 0 && urgent ? pal.warn : null, i === 0 && urgent ? 'dashed' : 'solid');
      const s = g.startX(r, pad);
      g.label(c.label, s.x, r.y + 18 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2, s.align);
      g.numberWithUnit(c.num, c.unit, s.x, r.y + r.h - 10, w - pad * 2, 28 * Math.min(g.u, 1.3), c.col);
    });
  }

  /** The arrival order: three chips, the own one marked. */
  private drawOrder() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const r = this.order;
    const gap = 6;
    const w = (r.w - gap * (N_UNITS - 1)) / N_UNITS;
    const u = Math.min(g.u, 1.3);
    for (let i = 0; i < N_UNITS; i++) {
      const idx = g.rtl ? N_UNITS - 1 - i : i; // chips keep the order 1 → 3 in reading direction
      const cr: Rect = { x: r.x + i * (w + gap), y: r.y, w, h: r.h };
      const own = idx === sim.config.unit;
      const at = sim.arrivalS(idx);
      const prevArrived = idx === 0 || sim.arrivalS(idx - 1) !== null;
      const turn = own && sim.state === 'search' && prevArrived;
      const col = at !== null ? (own && !sim.success ? pal.bad : pal.good) : turn ? pal.accentStrong : pal.line;
      g.roundRect(cr, 10);
      ctx.fillStyle = own ? withAlpha(pal.accent, 0.2) : pal.bg1;
      ctx.fill();
      ctx.lineWidth = own ? 3 : 1.5;
      ctx.strokeStyle = col;
      ctx.setLineDash(at === null && !turn ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = `${idx + 1} · ${this.unitName(idx)}`;
      g.fit(name, cr.w - 10, 12 * u, 800, false);
      ctx.fillStyle = pal.text;
      ctx.fillText(name, cr.x + cr.w / 2, cr.y + cr.h * 0.32);
      let sub: string;
      if (at !== null) sub = this.env.t('minigame.MG-27.chip.arrived', { s: fmt(at, 1, 1) });
      else if (turn) sub = this.env.t('minigame.MG-27.chip.turn');
      else sub = this.env.t(own ? 'minigame.MG-27.chip.you' : 'minigame.MG-27.chip.enroute');
      g.fit(sub, cr.w - 10, 11 * u, 700, false);
      ctx.fillStyle = at !== null ? col : turn ? pal.accentStrong : pal.dim;
      ctx.direction = 'ltr';
      ctx.fillText(sub, cr.x + cr.w / 2, cr.y + cr.h * 0.7);
      ctx.direction = g.rtl ? 'rtl' : 'ltr';
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawStrip() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const r = this.strip;
    const u = sim.config.unit;
    let key: string;
    let col: string = pal.dim;
    let glyph: 'ok' | 'up' | 'down' | 'x' | 'dot' = 'dot';
    if (sim.state === 'arrived') {
      const t = sim.arrivalTimeS!;
      const w = sim.window;
      if (sim.success) {
        key = 'minigame.MG-27.status.ok';
        col = pal.good;
        glyph = 'ok';
      } else {
        key = t <= w.fromS ? 'minigame.MG-27.status.early' : 'minigame.MG-27.status.late';
        col = pal.bad;
        glyph = 'x';
      }
    } else if (sim.state === 'late') {
      key = 'minigame.MG-27.status.nothere';
      col = pal.bad;
      glyph = 'x';
    } else {
      key = `minigame.MG-27.status.goal.${UNITS[u]!}`;
      col = pal.accentStrong;
      glyph = 'up';
    }
    g.roundRect(r, 10);
    ctx.fillStyle = withAlpha(col, 0.14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col;
    ctx.setLineDash(sim.state === 'search' ? [5, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    const text = this.env.t(key, { s: fmt(sim.arrivalTimeS ?? 0, 1, 1) });
    const size = g.fit(text, r.w - 56, 13 * Math.min(g.u, 1.3), 800, false);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = pal.text;
    ctx.fillText(text, r.x + r.w / 2 + 12, r.y + r.h / 2 + 1);
    g.glyph(glyph, r.x + r.w / 2 - tw / 2 - 4, r.y + r.h / 2, size, col);
    ctx.textBaseline = 'alphabetic';
  }

  // ───────────── the sea ─────────────

  private drawSea(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const rm = this.env.reducedMotion;
    const r = this.sea;
    ctx.save();
    g.roundRect(r, 12);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    grad.addColorStop(0, pal.bg2);
    grad.addColorStop(1, withAlpha(pal.accent, 0.28));
    ctx.fillStyle = grad;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // grid, 2 km squares
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.35);
    ctx.lineWidth = 1;
    for (let k = 0; k <= FIELD_KM; k += 2) {
      ctx.beginPath();
      ctx.moveTo(this.px(k), this.py(0));
      ctx.lineTo(this.px(k), this.py(FIELD_KM));
      ctx.moveTo(this.px(0), this.py(k));
      ctx.lineTo(this.px(FIELD_KM), this.py(k));
      ctx.stroke();
    }
    // scale bar: 2 km
    ctx.strokeStyle = pal.dim;
    ctx.lineWidth = 3;
    const sb = this.px(0) + 8;
    const sy = this.py(FIELD_KM) - 10;
    ctx.beginPath();
    ctx.moveTo(sb, sy);
    ctx.lineTo(sb + 2 * this.scale, sy);
    ctx.stroke();
    ctx.fillStyle = pal.dim;
    ctx.font = g.font(10 * Math.min(g.u, 1.3), 700, true);
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillText('2 km', sb, sy - 6);
    ctx.direction = g.rtl ? 'rtl' : 'ltr';
    // wake
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trailN; i++) {
      ctx.strokeStyle = withAlpha(pal.text, 0.35 * (1 - i / TRAIL));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.px(this.trail[(i - 1) * 2]!), this.py(this.trail[(i - 1) * 2 + 1]!));
      ctx.lineTo(this.px(this.trail[i * 2]!), this.py(this.trail[i * 2 + 1]!));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    const ux = this.px(sim.x);
    const uy = this.py(sim.y);
    // beacon rings from the unit: faster and brighter as the signal grows (static rings in reduced motion)
    const rings = 3;
    for (let i = 0; i < rings; i++) {
      const ph = rm ? (i + 1) / (rings + 1) : (((f.timeMs / (2400 - 1600 * sim.closeness)) + i / rings) % 1);
      ctx.strokeStyle = withAlpha(pal.accentStrong, (0.15 + 0.6 * sim.closeness) * (1 - ph));
      ctx.lineWidth = 2 + 3 * sim.closeness;
      ctx.beginPath();
      ctx.arc(ux, uy, 14 + ph * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    // relaxed: a faint arrow towards the capsule
    if (sim.config.arrow && sim.state === 'search') {
      const dx = sim.capX - sim.x;
      const dy = sim.capY - sim.y;
      const d = Math.hypot(dx, dy) || 1;
      const ax = ux + (dx / d) * 34;
      const ay = uy + (dy / d) * 34;
      ctx.strokeStyle = withAlpha(pal.good, 0.7);
      ctx.fillStyle = withAlpha(pal.good, 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ux + (dx / d) * 18, uy + (dy / d) * 18);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // the capsule appears only once the unit is there
    if (sim.state === 'arrived') {
      ctx.fillStyle = pal.warn;
      ctx.beginPath();
      ctx.arc(this.px(sim.capX), this.py(sim.capY), 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pal.text;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    this.drawUnit(ux, uy, sim.config.unit, Math.atan2(sim.vy, sim.vx), sim.state === 'arrived' ? (sim.success ? pal.good : pal.bad) : pal.text);
    // stick feedback
    if (this.stick.on && !this.compact) {
      ctx.strokeStyle = withAlpha(pal.text, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.stick.ox, this.stick.oy, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = withAlpha(pal.accentStrong, 0.8);
      ctx.beginPath();
      ctx.arc(this.stick.x, this.stick.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    g.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = sim.state === 'arrived' ? (sim.success ? pal.good : pal.bad) : pal.line;
    ctx.stroke();
  }

  /** Helicopter (rotor cross), boat (hull) or ship (long hull with a bridge), heading `a`. */
  private drawUnit(x: number, y: number, unit: number, a: number, col: string) {
    const { ctx, pal } = this.g;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Number.isFinite(a) ? a : 0);
    ctx.fillStyle = col;
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    if (unit === 0) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-16, -16);
      ctx.lineTo(16, 16);
      ctx.moveTo(16, -16);
      ctx.lineTo(-16, 16);
      ctx.stroke();
    } else if (unit === 1) {
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, 8);
      ctx.lineTo(-10, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(10, 9);
      ctx.lineTo(-20, 9);
      ctx.lineTo(-20, -9);
      ctx.lineTo(10, -9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pal.bg0;
      ctx.fillRect(-12, -5, 10, 10);
    }
    ctx.restore();
  }

  private drawMeter() {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.meter;
    const sim = this.sim;
    g.roundRect(r, 6);
    ctx.fillStyle = pal.bg1;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.line;
    ctx.stroke();
    const inner: Rect = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 };
    const fillW = inner.w * clamp(sim.signal, 0, 1);
    ctx.fillStyle = sim.closeness > 0.5 ? pal.accentStrong : withAlpha(pal.accent, 0.7);
    ctx.fillRect(g.rtl ? inner.x + inner.w - fillW : inner.x, inner.y, fillW, inner.h);
    ctx.strokeStyle = withAlpha(pal.bg0, 0.8);
    for (let k = 1; k < 4; k++) {
      const x = inner.x + (inner.w * k) / 4;
      ctx.beginPath();
      ctx.moveTo(x, inner.y);
      ctx.lineTo(x, inner.y + inner.h);
      ctx.stroke();
    }
  }

  private drawButton() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const b = this.button;
    const live = sim.state === 'search' && !sim.started;
    const turn = live && (sim.config.unit === 0 || sim.arrivalS(sim.config.unit - 1) !== null);
    g.roundRect(b, 14);
    ctx.fillStyle = !live ? pal.bg2 : turn ? withAlpha(pal.good, 0.9) : withAlpha(pal.accent, 0.4);
    ctx.fill();
    ctx.lineWidth = turn ? 3 : 1.5;
    ctx.strokeStyle = !live ? pal.line : turn ? pal.good : pal.accent;
    ctx.stroke();
    const label = this.env.t(!live ? 'minigame.MG-27.button.underway' : 'minigame.MG-27.button.setoff');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.fit(label, b.w - 24, 18 * Math.min(g.u, 1.25), 800, false);
    ctx.fillStyle = !live ? pal.faint : turn ? pal.bg0 : pal.text;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
}
