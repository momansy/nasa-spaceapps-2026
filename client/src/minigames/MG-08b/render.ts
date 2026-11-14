// MG-08b canvas renderer: status strip, level and rate read-outs, the tank cutaway (zoomed on
// the last 40 % with the 99 % target and the relief level), boil-off vapour, the fill-rate gauge
// with the band of the current phase, the valve steps and the valve buttons.
import { fmt, fmtSigned } from '../../data/format';
import { rect, View2D, withAlpha, type GlyphKind, type Rect, type Tone, type Translate } from '../MG-09/shared/draw';
import { ceramicGradient, paintBarFill, paintBarTrack, silverGradient } from '../MG-09/shared/art';
import { bandOf, RELIEF, VALVE_STEPS, type Mg08bSim, type Phase } from './model';

export interface Mg08bFrame {
  timeMs: number;
  down?: 'open' | 'close' | 'hold' | null;
  pausedText?: string | null;
  finger?: 'open' | 'close' | 'hold' | null;
  fingerDown?: boolean;
}

/** Bottom and top of the tank window, fraction of the tank. */
const TANK_LO = 0.6;
const TANK_HI = 1.015;
/** Fill-rate gauge range, fraction of the tank per second. */
const RATE_LO = -0.01;
const RATE_HI = 0.04;

export class Mg08bView extends View2D {
  private sim: Mg08bSim;
  private readonly compact: boolean;
  private strip = rect(0, 0, 0, 0);
  private hud = rect(0, 0, 0, 0);
  private tank = rect(0, 0, 0, 0);
  private gauge = rect(0, 0, 0, 0);
  private pips = rect(0, 0, 0, 0);
  private closeBtn = rect(0, 0, 0, 0);
  private openBtn = rect(0, 0, 0, 0);
  private holdBtn = rect(0, 0, 0, 0);
  private hint = rect(0, 0, 0, 0);

  constructor(canvas: HTMLCanvasElement, sim: Mg08bSim, t: Translate, reducedMotion: boolean, compact: boolean) {
    super(canvas, t, reducedMotion);
    this.sim = sim;
    this.compact = compact;
    this.layout();
  }

  setSim(sim: Mg08bSim) {
    this.sim = sim;
  }

  resize() {
    this.measure();
    this.layout();
  }

  buttonAt(x: number, y: number): 'open' | 'close' | null {
    const inR = (r: Rect) => x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6;
    return inR(this.openBtn) ? 'open' : inR(this.closeBtn) ? 'close' : null;
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
    const btnH = this.compact ? Math.round(H * 0.2) : Math.max(64, Math.round(76 * Math.min(this.u, 1.4)));
    const by = (this.compact ? H - pad : this.hint.y - 6) - btnH;
    const gap = 10;
    const bw = (W - pad * 2 - gap) / 2;
    const a = rect(pad, by, bw, btnH);
    const b = rect(pad + bw + gap, by, bw, btnH);
    // Close on the start side, open on the end side (like a "−  +" pair).
    this.closeBtn = this.rtl ? b : a;
    this.openBtn = this.rtl ? a : b;
    this.holdBtn = rect(pad, by, W - pad * 2, btnH);
    const pipsH = this.compact ? 0 : Math.round(34 * Math.min(this.u, 1.3));
    this.pips = rect(pad, by - 8 - pipsH, W - pad * 2, pipsH);
    const bottom = (pipsH ? this.pips.y : by) - 8;
    const h = bottom - y;
    const tankW = Math.round((W - pad * 2) * 0.56);
    const tank = rect(pad, y, tankW, h);
    const gauge = rect(pad + tankW + 10, y, W - pad * 2 - tankW - 10, h);
    this.tank = this.rtl ? rect(W - pad - tankW, y, tankW, h) : tank;
    this.gauge = this.rtl ? rect(pad, y, gauge.w, h) : gauge;
  }

  draw(f: Mg08bFrame) {
    this.begin();
    if (!this.compact) {
      this.drawStrip(f);
      this.drawHud();
    }
    this.drawTank(f);
    this.drawGauge();
    this.drawControls(f);
    if (!this.compact) {
      const c = this.sim.config;
      const key = c.oneButton ? (c.holdToToggle ? 'minigame.MG-08b.hint.toggle' : 'minigame.MG-08b.hint.hold') : 'minigame.MG-08b.hint.tap';
      this.ctx.textBaseline = 'middle';
      this.textCenter(this.t(key), this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 1, this.hint.w, 12.5 * this.us, 600, false, this.pal.dim);
      this.ctx.textBaseline = 'alphabetic';
    }
    if (f.pausedText) this.paused(f.pausedText);
  }

  private status(): { key: string; tone: Tone; glyph: GlyphKind } {
    const s = this.sim;
    if (s.overpressure && s.level >= RELIEF - 0.002 && s.commanded > 0) return { key: 'minigame.MG-08b.status.overpressure', tone: 'bad', glyph: 'stop' };
    const z = s.zone;
    const ph = s.phase;
    if (z === 0) return { key: `minigame.MG-08b.status.${ph}_ok`, tone: 'good', glyph: 'ok' };
    if (z === 1) return { key: ph === 'top' ? 'minigame.MG-08b.status.top_high' : 'minigame.MG-08b.status.high', tone: 'warn', glyph: 'up' };
    return { key: ph === 'top' ? 'minigame.MG-08b.status.top_low' : 'minigame.MG-08b.status.low', tone: 'warn', glyph: 'down' };
  }

  private drawStrip(f: Mg08bFrame) {
    const st = this.status();
    let tone = st.tone;
    if (tone === 'bad' && !this.reducedMotion && Math.floor(f.timeMs / 250) % 2 === 0) tone = 'warn';
    this.statusStrip(this.strip, tone, st.glyph, this.t(st.key));
  }

  private drawHud() {
    const { pal, sim } = this;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const a = rect(this.hud.x, this.hud.y, w, this.hud.h);
    const b = rect(this.hud.x + w + gap, this.hud.y, w, this.hud.h);
    const first = this.rtl ? b : a;
    const second = this.rtl ? a : b;
    const full = sim.level >= sim.config.fillMin;
    const lc = sim.overpressure ? pal.bad : full ? pal.good : pal.text;
    this.tile(first, this.t('minigame.MG-08b.hud.level', { min: fmt(sim.config.fillMin * 100, 0) }), fmt(Math.floor(sim.level * 1000) / 10, 1, 1), '%', lc, {
      kind: sim.overpressure ? 'stop' : full ? 'ok' : 'down',
      color: sim.overpressure ? pal.bad : full ? pal.good : pal.warn,
    });
    const z = sim.zone;
    const zc = z === 0 ? pal.good : pal.warn;
    this.tile(second, this.t('minigame.MG-08b.hud.rate'), fmtSigned(sim.netSmooth * 100, 2), '%/s', z === 0 ? pal.text : zc, { kind: z === 0 ? 'ok' : z === 1 ? 'up' : 'down', color: zc });
  }

  private yLevel(level: number, inner: Rect): number {
    const f = (level - TANK_LO) / (TANK_HI - TANK_LO);
    return inner.y + inner.h * (1 - Math.min(1, Math.max(0, f)));
  }

  private drawTank(f: Mg08bFrame) {
    const { ctx, pal, sim } = this;
    const r = this.tank;
    const compact = this.compact;
    this.panel(r, 12, pal.bg1);
    const px = (compact ? 9 : 10.5) * Math.min(this.u, 1.3);
    const top = r.y + (compact ? 14 : 30 * Math.min(this.u, 1.3));
    const vessel = rect(r.x + r.w * 0.2, top, r.w * 0.4, r.y + r.h - 12 - top);
    const inner = rect(vessel.x + 4, vessel.y + 10, vessel.w - 8, vessel.h - 20);
    const time = f.timeMs / 1000;
    // Vessel: frosted insulation with a cutaway window.
    // Ceramic-white insulated shell in the key-art light, with a frost rime on the cold lower
    // half and a silver ring at each dome joint.
    ctx.save();
    ctx.translate(vessel.x + vessel.w / 2, 0);
    ctx.fillStyle = ceramicGradient(ctx, vessel.w, this.rtl ? -1 : 1);
    this.roundRect(rect(-vessel.w / 2, vessel.y, vessel.w, vessel.h), vessel.w * 0.42);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const frost = ctx.createLinearGradient(0, vessel.y + vessel.h * 0.35, 0, vessel.y + vessel.h);
    frost.addColorStop(0, 'rgba(225, 240, 250, 0)');
    frost.addColorStop(1, 'rgba(225, 240, 250, 0.35)');
    ctx.fillStyle = frost;
    ctx.fillRect(-vessel.w / 2, vessel.y, vessel.w, vessel.h);
    ctx.fillStyle = silverGradient(ctx, vessel.w, this.rtl ? -1 : 1);
    ctx.fillRect(-vessel.w / 2, vessel.y + vessel.w * 0.36, vessel.w, 2);
    ctx.fillRect(-vessel.w / 2, vessel.y + vessel.h - vessel.w * 0.36, vessel.w, 2);
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = '#030c16';
    this.roundRect(inner, Math.min(inner.w * 0.38, 20));
    ctx.fill();
    // Liquid oxygen: pale blue, with a gently moving surface (steady in reduced motion).
    const ly = this.yLevel(sim.level, inner);
    ctx.save();
    this.roundRect(inner, Math.min(inner.w * 0.38, 20));
    ctx.clip();
    const liq = ctx.createLinearGradient(0, ly, 0, inner.y + inner.h);
    liq.addColorStop(0, '#9bd9f0');
    liq.addColorStop(1, '#2f7fb0');
    ctx.fillStyle = liq;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y + inner.h);
    const wave = this.reducedMotion ? 0 : 1.6;
    for (let i = 0; i <= 12; i++) {
      const x = inner.x + (i / 12) * inner.w;
      ctx.lineTo(x, ly + wave * Math.sin(time * 3 + i * 0.9));
    }
    ctx.lineTo(inner.x + inner.w, inner.y + inner.h);
    ctx.closePath();
    ctx.fill();
    // Boiling bubbles rising inside the liquid (fewer in reduced motion).
    const bubbles = this.reducedMotion ? 3 : 9;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (let i = 0; i < bubbles; i++) {
      const phase = (time * (0.35 + (i % 4) * 0.08) + i * 0.37) % 1;
      const bx = inner.x + inner.w * (0.15 + ((i * 0.618) % 0.7));
      const by = inner.y + inner.h - phase * (inner.y + inner.h - ly);
      ctx.beginPath();
      ctx.arc(bx, by, 1.4 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Glass of the cutaway window: one soft vertical reflection.
    const refl = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
    refl.addColorStop(0, 'rgba(255, 255, 255, 0)');
    refl.addColorStop(0.18, 'rgba(255, 255, 255, 0.16)');
    refl.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = refl;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.35)';
    ctx.lineWidth = 1;
    this.roundRect(inner, Math.min(inner.w * 0.38, 20));
    ctx.stroke();
    // Level marks: relief 100 % (double red line), target 99 % (green), slow fill 90 % (dashed).
    const mark = (level: number, color: string, label: string, kind: 'solid' | 'dash' | 'double') => {
      const y = Math.round(this.yLevel(level, inner)) + 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (kind === 'dash') ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(vessel.x - 6, y);
      ctx.lineTo(vessel.x + vessel.w + 6, y);
      if (kind === 'double') {
        ctx.moveTo(vessel.x - 6, y - 4);
        ctx.lineTo(vessel.x + vessel.w + 6, y - 4);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (!compact) {
        ctx.font = this.font(px, 750, true);
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = this.rtl ? 'right' : 'left';
        const lx = this.rtl ? vessel.x - 10 : vessel.x + vessel.w + 10;
        const maxW = this.rtl ? vessel.x - r.x - 14 : r.x + r.w - lx - 6;
        this.fit(label, maxW, px, 750, true);
        ctx.fillText(label, lx, y + (kind === 'double' ? -2 : 0));
        ctx.textBaseline = 'alphabetic';
      }
    };
    mark(sim.config.slowAt, withAlpha(pal.dim, 0.9), `${fmt(sim.config.slowAt * 100, 0)} %`, 'dash');
    mark(sim.config.fillMin, pal.good, `${fmt(sim.config.fillMin * 100, 0)} %`, 'solid');
    mark(RELIEF, pal.bad, this.t('minigame.MG-08b.tank.relief'), 'double');
    // Scale break at the bottom: the window starts at 60 %.
    if (!compact) {
      ctx.font = this.font(px, 650, true);
      ctx.fillStyle = pal.faint;
      ctx.textAlign = this.rtl ? 'right' : 'left';
      ctx.fillText(`${fmt(TANK_LO * 100, 0)} %`, this.rtl ? vessel.x - 10 : vessel.x + vessel.w + 10, inner.y + inner.h);
    }
    // Vent at the top: boil-off vapour (game visual; fewer puffs in reduced motion).
    const vx = vessel.x + vessel.w * 0.5;
    const vy = vessel.y;
    ctx.fillStyle = '#7f95a6';
    ctx.fillRect(vx - 3, vy - 8, 6, 9);
    const puffs = this.reducedMotion ? 2 : 6;
    ctx.save();
    this.roundRect(r, 12);
    ctx.clip();
    for (let i = 0; i < puffs; i++) {
      const ph = (time * 0.6 + i / puffs) % 1;
      const rad = 4 + ph * 14 * (sim.boil / 0.0035);
      ctx.fillStyle = `rgba(235, 244, 250, ${0.45 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(vx + (this.reducedMotion ? 6 : 10 * Math.sin(i * 2.1)) * ph, vy - 10 - ph * (top - r.y + 10), rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Fill line at the bottom, flowing while the valve delivers.
    const fy = vessel.y + vessel.h - 14;
    const pipeX0 = this.rtl ? vessel.x + vessel.w : r.x + 8;
    const pipeX1 = this.rtl ? r.x + r.w - 8 : vessel.x;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a5662';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(pipeX0, fy);
    ctx.lineTo(pipeX1, fy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(215, 222, 227, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pipeX0, fy - 2);
    ctx.lineTo(pipeX1, fy - 2);
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (sim.flow > 0.0004) {
      ctx.strokeStyle = '#9bd9f0';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = this.reducedMotion ? 0 : -((time * 40 * (sim.flow / 0.02)) % 12) * (this.rtl ? -1 : 1);
      ctx.beginPath();
      ctx.moveTo(pipeX0, fy);
      ctx.lineTo(pipeX1, fy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    if (!compact) {
      ctx.textBaseline = 'alphabetic';
      this.textStart(this.t('minigame.MG-08b.tank.title'), r, 10, r.y + px + 7, px, 700, true, pal.dim, r.w * 0.55);
      const left = Math.max(0, sim.durationMs - sim.timeMs) / 1000;
      this.textEnd(`T−${fmt(Math.ceil(left), 0)} s`, r, 10, r.y + px + 7, px * 1.15, 800, true, left <= 5 ? pal.warn : pal.text, r.w * 0.4);
    }
  }

  private drawGauge() {
    const { ctx, pal, sim } = this;
    const r = this.gauge;
    const compact = this.compact;
    this.panel(r, 12, pal.bg1);
    const px = (compact ? 9 : 10.5) * Math.min(this.u, 1.3);
    const top = r.y + (compact ? 10 : 30 * Math.min(this.u, 1.3));
    const scale = rect(r.x + r.w * 0.5 - 9, top + 6, 18, r.y + r.h - 14 - top - 6);
    const yOf = (v: number) => scale.y + scale.h * (1 - (Math.min(RATE_HI, Math.max(RATE_LO, v)) - RATE_LO) / (RATE_HI - RATE_LO));
    paintBarTrack(ctx, scale);
    // Bands of the three phases: the current one bright with brackets, the others faint.
    const phases: Phase[] = ['fast', 'slow', 'top'];
    for (const ph of phases) {
      const b = bandOf(ph, sim.config);
      const y0 = yOf(b.hi);
      const y1 = yOf(b.lo);
      const cur = ph === sim.phase;
      ctx.fillStyle = withAlpha(pal.good, cur ? 0.4 : 0.08);
      ctx.fillRect(scale.x + 2, y0, scale.w - 4, y1 - y0);
      if (cur) {
        ctx.strokeStyle = pal.good;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(scale.x - 8, y0);
        ctx.lineTo(scale.x + scale.w + 8, y0);
        ctx.moveTo(scale.x - 8, y1);
        ctx.lineTo(scale.x + scale.w + 8, y1);
        ctx.stroke();
      }
      if (!compact) {
        ctx.font = this.font(px * 0.95, cur ? 800 : 600, true);
        ctx.fillStyle = cur ? pal.good : pal.faint;
        ctx.textBaseline = 'middle';
        ctx.textAlign = this.rtl ? 'right' : 'left';
        const lx = this.rtl ? scale.x - 12 : scale.x + scale.w + 12;
        const label = this.t(`minigame.MG-08b.phase.${ph}`);
        this.fit(label, this.rtl ? scale.x - r.x - 16 : r.x + r.w - lx - 4, px * 0.95, cur ? 800 : 600, true);
        ctx.fillText(label, lx, (y0 + y1) / 2);
      }
    }
    // Zero line and scale labels.
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scale.x - 4, Math.round(yOf(0)) + 0.5);
    ctx.lineTo(scale.x + scale.w + 4, Math.round(yOf(0)) + 0.5);
    ctx.stroke();
    if (!compact) {
      ctx.font = this.font(px * 0.95, 650, true);
      ctx.fillStyle = pal.faint;
      ctx.textAlign = this.rtl ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const lx = this.rtl ? scale.x + scale.w + 10 : scale.x - 10;
      for (const v of [0.04, 0.02, 0]) ctx.fillText(`${fmtSigned(v * 100, 0)}`, lx, yOf(v));
      ctx.textBaseline = 'alphabetic';
    }
    // Needle: the net fill rate.
    const ny = yOf(sim.netSmooth);
    const z = sim.zone;
    const c = z === 0 ? pal.text : pal.warn;
    ctx.fillStyle = c;
    ctx.fillRect(scale.x - 10, ny - 1.5, scale.w + 20, 3);
    ctx.beginPath();
    const tip = this.rtl ? scale.x + scale.w + 10 : scale.x - 10;
    const dir = this.rtl ? 1 : -1;
    ctx.moveTo(tip, ny);
    ctx.lineTo(tip + dir * 10, ny - 7);
    ctx.lineTo(tip + dir * 10, ny + 7);
    ctx.closePath();
    ctx.fill();
    if (!compact) {
      ctx.textBaseline = 'alphabetic';
      this.textStart(this.t('minigame.MG-08b.gauge.title'), r, 10, r.y + px + 7, px, 700, true, pal.dim, r.w - 20);
    }
  }

  private drawControls(f: Mg08bFrame) {
    const { ctx, pal, sim } = this;
    const c = sim.config;
    if (c.oneButton) {
      const open = sim.buttonOpen;
      this.button(this.holdBtn, this.t(c.holdToToggle ? (open ? 'minigame.MG-08b.btn.close_valve' : 'minigame.MG-08b.btn.open_valve') : 'minigame.MG-08b.btn.hold'), {
        tone: 'accent',
        pressed: open,
        armed: open,
        sub: this.compact ? undefined : this.t(open ? 'minigame.MG-08b.btn.valve_open' : 'minigame.MG-08b.btn.valve_closed'),
      });
      if (f.finger) this.finger(this.holdBtn.x + this.holdBtn.w * 0.6, this.holdBtn.y + this.holdBtn.h * 0.55, !!f.fingerDown, this.compact ? 13 : 18);
      return;
    }
    // Valve steps as pips.
    if (!this.compact) {
      const p = this.pips;
      const px = 11 * Math.min(this.u, 1.3);
      ctx.textBaseline = 'middle';
      this.textStart(this.t('minigame.MG-08b.valve', { n: sim.valve, max: VALVE_STEPS }), p, 2, p.y + p.h / 2, px, 750, true, pal.dim, p.w * 0.42);
      const pw = Math.min(26, (p.w * 0.55 - 6 * (VALVE_STEPS - 1)) / VALVE_STEPS);
      const total = VALVE_STEPS * pw + (VALVE_STEPS - 1) * 6;
      const x0 = this.rtl ? p.x + 2 : p.x + p.w - 2 - total;
      for (let i = 0; i < VALVE_STEPS; i++) {
        const k = this.rtl ? VALVE_STEPS - 1 - i : i;
        const cell = rect(x0 + i * (pw + 6), p.y + p.h * 0.22, pw, p.h * 0.56);
        this.roundRect(cell, 4);
        if (k < sim.valve) paintBarFill(ctx, cell, pal.accent);
        else {
          ctx.fillStyle = 'rgba(232, 238, 240, 0.08)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(150, 205, 228, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.textBaseline = 'alphabetic';
    }
    this.button(this.closeBtn, this.t('minigame.MG-08b.btn.close'), { tone: 'accent', glyph: 'down', enabled: sim.valve > 0, pressed: f.down === 'close', sub: this.compact ? undefined : this.t('minigame.MG-08b.btn.key_close') });
    this.button(this.openBtn, this.t('minigame.MG-08b.btn.open'), { tone: 'accent', glyph: 'up', enabled: sim.valve < VALVE_STEPS, pressed: f.down === 'open', sub: this.compact ? undefined : this.t('minigame.MG-08b.btn.key_open') });
    if (f.finger && f.finger !== 'hold') {
      const b = f.finger === 'open' ? this.openBtn : this.closeBtn;
      this.finger(b.x + b.w * 0.6, b.y + b.h * 0.58, !!f.fingerDown, this.compact ? 13 : 18);
    }
  }
}
