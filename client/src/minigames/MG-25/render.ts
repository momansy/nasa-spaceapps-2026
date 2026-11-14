// MG-25 canvas renderer: lock-time and signal cards, a status line, the static field with the
// waveform, the signal meter, the circular tuning dial and the LOCK button. It only reads the
// simulation; the rules live in `model.ts`.
import { fmt, fmtSigned } from '../../data/format';
import type { MinigameEnv } from '../types';
import { clamp, Gfx, withAlpha, type Frame, type Rect, type ViewLike } from '../MG-22/kit';
import { dialToKhz, hash01, type Mg25Sim } from './model';
import { BeaconSound } from './sound';

/** The dial sweeps 300° starting at 120° (canvas angles run clockwise from the +x axis). */
const DIAL_START = (120 * Math.PI) / 180;
export const DIAL_SWEEP = (300 * Math.PI) / 180;

export class Mg25View implements ViewLike<Mg25Sim> {
  readonly g: Gfx;
  readonly sound = new BeaconSound();
  private sim: Mg25Sim;
  private readonly env: MinigameEnv;
  private readonly compact: boolean;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scene: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private meter: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** The LOCK button; the whole playfield in one-button mode. */
  button: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** The sound switch (off until the player turns it on). */
  soundBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  cx = 0;
  cy = 0;
  r = 0;

  constructor(canvas: HTMLCanvasElement, sim: Mg25Sim, env: MinigameEnv, compact: boolean) {
    this.g = new Gfx(canvas);
    this.sim = sim;
    this.env = env;
    this.compact = compact;
    this.resize();
  }

  setSim(sim: Mg25Sim) {
    this.sim = sim;
  }

  resize() {
    const g = this.g;
    g.measure();
    const { W, H, u } = g;
    const compact = this.compact;
    const pad = compact ? 8 : 12;
    const gap = compact ? 6 : 8;
    const hudH = compact ? 0 : Math.round(60 * Math.min(u, 1.45));
    const stripH = compact ? 0 : Math.round(36 * Math.min(u, 1.5));
    const btnH = compact ? 0 : Math.round(56 * Math.min(u, 1.3));
    const meterH = Math.round((compact ? 14 : 24) * Math.min(u, 1.3));
    let y = pad;
    this.hud = { x: pad, y, w: W - pad * 2, h: hudH };
    y += hudH + (hudH ? gap : 0);
    this.strip = { x: pad, y, w: W - pad * 2, h: stripH };
    y += stripH + (stripH ? gap : 0);
    const bottom = H - pad;
    const btnY = bottom - btnH;
    const rest = btnY - (btnH ? gap : 0) - y - meterH - gap * 2;
    const sceneH = Math.max(64, Math.round(rest * 0.34));
    this.scene = { x: pad, y, w: W - pad * 2, h: sceneH };
    this.meter = { x: pad, y: y + sceneH + gap, w: W - pad * 2, h: meterH };
    const dialTop = this.meter.y + meterH + gap;
    const dialH = Math.max(80, btnY - (btnH ? gap : 0) - dialTop);
    this.r = Math.max(34, Math.min(dialH / 2 - 6, (W - pad * 2) / 2 - 18));
    this.cx = W / 2;
    this.cy = dialTop + dialH / 2;
    if (btnH) {
      const sw = Math.round(96 * Math.min(u, 1.3));
      const soundX = g.rtl ? pad : W - pad - sw;
      const lockX = g.rtl ? pad + sw + gap : pad;
      this.button = { x: lockX, y: btnY, w: W - pad * 2 - sw - gap, h: btnH };
      this.soundBtn = { x: soundX, y: btnY, w: sw, h: btnH };
    } else {
      this.button = { x: 0, y: 0, w: 0, h: 0 };
      this.soundBtn = { x: 0, y: 0, w: 0, h: 0 };
    }
  }

  private inside(r: Rect, x: number, y: number, slack = 6): boolean {
    return r.w > 0 && x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack;
  }
  hitsSound(x: number, y: number): boolean {
    return this.inside(this.soundBtn, x, y);
  }
  /** Is (x, y) a LOCK press? Anywhere (but the sound switch) in one-button mode, otherwise on the button. */
  hitsLock(x: number, y: number): boolean {
    if (this.hitsSound(x, y)) return false;
    return this.sim.config.wholeField || this.inside(this.button, x, y);
  }
  /** Canvas angle of a point around the dial centre, radians. */
  angleOf(x: number, y: number): number {
    return Math.atan2(y - this.cy, x - this.cx);
  }

  /** Angle of a dial position (0–1), radians. */
  private dialAngle(d: number): number {
    return DIAL_START + DIAL_SWEEP * d;
  }

  demoFinger(sim: Mg25Sim): { x: number; y: number; down: boolean } | null {
    const a = this.dialAngle(sim.dial);
    const rr = this.r * 0.78;
    const turning = sim.state === 'search' && !sim.inZone;
    const locking = sim.state === 'locked' && sim.step - sim.lockStep < 40;
    if (turning) return { x: this.cx + Math.cos(a) * rr, y: this.cy + Math.sin(a) * rr, down: true };
    if (locking || sim.state === 'search') return { x: this.cx, y: this.cy + this.r * 0.2, down: locking };
    return null;
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
    this.drawMeter();
    this.drawDial();
    if (!this.compact) {
      this.drawLock();
      this.drawSoundBtn();
    }
    this.sound.update(this.sim.state === 'search' ? this.sim.signal : 0);
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
    const urgent = sim.leftS < 3 && sim.state === 'search';
    const cardsData: Array<{ label: string; num: string; unit: string; col: string }> = [
      { label: this.env.t('minigame.MG-25.hud.time'), num: fmt(sim.state === 'locked' ? Math.max(0, sim.config.lockTimeMaxS - sim.lockCostSteps / 120) : sim.leftS, 1, 1), unit: 's', col: urgent ? pal.warn : pal.text },
      { label: this.env.t('minigame.MG-25.hud.signal'), num: fmt(Math.round(sim.signal * 100), 0), unit: '%', col: pal.text },
    ];
    const pad = 12;
    cardsData.forEach((c, i) => {
      const r: Rect = { x: this.hud.x + (g.rtl ? 1 - i : i) * (w + gap), y: this.hud.y, w, h: this.hud.h };
      g.panel(r, i === 0 && urgent ? pal.warn : null, i === 0 && urgent ? 'dashed' : 'solid');
      const s = g.startX(r, pad);
      g.label(c.label, s.x, r.y + 20 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2, s.align);
      g.numberWithUnit(c.num, c.unit, s.x, r.y + r.h - 12, w - pad * 2, 30 * Math.min(g.u, 1.3), c.col);
    });
  }

  private statusKey(): { key: string; col: string; glyph: 'ok' | 'up' | 'down' | 'x' | 'dot'; border: 'solid' | 'dashed' | 'double'; args?: Record<string, string | number> } {
    const sim = this.sim;
    const { pal } = this.g;
    if (sim.state === 'locked') return sim.success ? { key: 'minigame.MG-25.status.locked', col: pal.good, glyph: 'ok', border: 'solid' } : { key: 'minigame.MG-25.status.slow', col: pal.warn, glyph: 'down', border: 'double' };
    if (sim.state === 'lost') return { key: 'minigame.MG-25.status.lost', col: pal.bad, glyph: 'x', border: 'double' };
    if (sim.lastMissStep >= 0 && sim.step - sim.lastMissStep < 120) return { key: 'minigame.MG-25.status.miss', col: pal.warn, glyph: 'down', border: 'dashed', args: { s: fmt(sim.config.missPenaltyS, 0) } };
    if (sim.closeness > 0.55) return { key: 'minigame.MG-25.status.strong', col: pal.accentStrong, glyph: 'up', border: 'dashed' };
    return { key: 'minigame.MG-25.status.search', col: pal.dim, glyph: 'dot', border: 'solid' };
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

  // ───────────── static field and waveform ─────────────

  private drawScene(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.scene;
    const sim = this.sim;
    const rm = this.env.reducedMotion;
    ctx.save();
    g.roundRect(r, 12);
    ctx.clip();
    ctx.fillStyle = pal.bg0;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Static: fills the screen when the signal is weak, thins out as it grows (fewer, slower flecks in reduced motion).
    const tick = Math.floor(f.timeMs / (rm ? 450 : 45));
    const weak = 1 - clamp(sim.closeness * 1.15, 0, 1);
    const count = Math.round((rm ? 70 : 230) * (0.15 + 0.85 * weak));
    ctx.fillStyle = pal.faint;
    ctx.globalAlpha = 0.55;
    const fleck = this.compact ? 2 : 2.5;
    for (let i = 0; i < count; i++) {
      const hx = hash01(tick * 7919 + i * 2 + 1);
      const hy = hash01(tick * 104729 + i * 2 + 2);
      ctx.fillRect(r.x + hx * r.w, r.y + hy * r.h, fleck, fleck);
    }
    ctx.globalAlpha = 1;
    // Waveform: a carrier whose amplitude follows the signal; the rest is jitter.
    const mid = r.y + r.h / 2;
    const amp = (r.h * 0.4) * clamp(sim.signal * 1.1, 0.04, 1);
    const jitter = (r.h * 0.22) * weak;
    const col = sim.state === 'locked' ? pal.good : sim.state === 'lost' ? pal.bad : pal.accentStrong;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = Math.max(24, Math.floor(r.w / 6));
    const phase = rm ? 0 : f.timeMs / 220;
    for (let i = 0; i <= n; i++) {
      const x = r.x + (i / n) * r.w;
      const wob = (hash01(tick * 31 + i) - 0.5) * 2 * jitter;
      const y = mid + Math.sin(i * 0.55 + phase) * amp * Math.sin((i / n) * Math.PI) + wob;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    g.roundRect(r, 12);
    ctx.lineWidth = sim.state === 'search' ? 1 : 2;
    ctx.strokeStyle = sim.state === 'locked' ? pal.good : sim.state === 'lost' ? pal.bad : pal.line;
    ctx.stroke();
    // Corner label.
    if (!this.compact) {
      const s = g.startX(r, 10);
      g.label(this.env.t('minigame.MG-25.scene.waveform'), s.x, r.y + 16 * Math.min(g.u, 1.2), 10 * Math.min(g.u, 1.3), pal.dim, r.w - 20, s.align);
    }
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
    const x0 = g.rtl ? inner.x + inner.w - fillW : inner.x;
    ctx.fillStyle = sim.closeness > 0.55 ? pal.accentStrong : withAlpha(pal.accent, 0.7);
    ctx.fillRect(x0, inner.y, fillW, inner.h);
    // quarter ticks (shape cue: the bar fills past the ticks as the signal grows)
    ctx.strokeStyle = withAlpha(pal.bg0, 0.8);
    ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      const x = inner.x + (inner.w * k) / 4;
      ctx.beginPath();
      ctx.moveTo(x, inner.y);
      ctx.lineTo(x, inner.y + inner.h);
      ctx.stroke();
    }
    // best so far
    const best = clamp(sim.bestCloseness * sim.config.beaconStrength, 0, 1);
    if (best > 0.05) {
      const bx = g.rtl ? inner.x + inner.w * (1 - best) : inner.x + inner.w * best;
      ctx.fillStyle = pal.text;
      ctx.beginPath();
      ctx.moveTo(bx, inner.y);
      ctx.lineTo(bx - 4, inner.y - 3);
      ctx.lineTo(bx + 4, inner.y - 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ───────────── the tuning dial ─────────────

  private drawDial() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const { cx, cy, r } = this;
    const a0 = DIAL_START;
    const a1 = DIAL_START + DIAL_SWEEP;
    // face
    ctx.fillStyle = pal.bg1;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.lineStrong;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
    // ticks
    ctx.lineWidth = 1.5;
    for (let k = 0; k <= 20; k++) {
      const a = a0 + (DIAL_SWEEP * k) / 20;
      const major = k % 5 === 0;
      const inR = r - (major ? 14 : 8);
      ctx.strokeStyle = major ? pal.dim : pal.faint;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inR, cy + Math.sin(a) * inR);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    // lock zone: hidden until the dial is near it unless the mode or difficulty shows it (design 9.3)
    if (sim.zoneVisible) {
      const z = sim.config.zoneHalf;
      const za = this.dialAngle(sim.beaconF - z);
      const zb = this.dialAngle(sim.beaconF + z);
      ctx.strokeStyle = sim.inZone ? pal.good : withAlpha(pal.good, 0.75);
      ctx.lineWidth = 9;
      ctx.lineCap = 'butt';
      ctx.setLineDash(sim.inZone ? [] : [4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, za, zb);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!this.compact) {
        const mid = this.dialAngle(sim.beaconF);
        const lx = cx + Math.cos(mid) * (r * 0.62);
        const ly = cy + Math.sin(mid) * (r * 0.62);
        ctx.fillStyle = pal.good;
        ctx.textAlign = 'center';
        g.fit(this.env.t('minigame.MG-25.dial.zone'), r * 0.8, 10 * Math.min(g.u, 1.3), 800, false);
        ctx.fillText(this.env.t('minigame.MG-25.dial.zone'), lx, ly);
      }
    }
    // end labels in the gap at the bottom
    if (!this.compact) {
      ctx.fillStyle = pal.dim;
      const ly = cy + r * 0.93;
      ctx.textBaseline = 'alphabetic';
      const lo = g.ltr(`${fmtSigned(dialToKhz(0), 0)} kHz`);
      const hi = g.ltr(`${fmtSigned(dialToKhz(1), 0)} kHz`);
      // Each label fits between the centre line and the end tick of its side of the gap.
      g.fit(lo.length > hi.length ? lo : hi, r * 0.5 - 14, 10 * Math.min(g.u, 1.3), 600, true);
      ctx.textAlign = 'right';
      ctx.fillText(lo, cx - 6, ly);
      ctx.textAlign = 'left';
      ctx.fillText(hi, cx + 6, ly);
    }
    // knob
    const ka = this.dialAngle(sim.dial);
    const kc = sim.state === 'locked' ? pal.good : sim.state === 'lost' ? pal.bad : pal.accentStrong;
    ctx.strokeStyle = kc;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ka) * r * 0.3, cy + Math.sin(ka) * r * 0.3);
    ctx.lineTo(cx + Math.cos(ka) * (r - 4), cy + Math.sin(ka) * (r - 4));
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = pal.bg3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = kc;
    ctx.stroke();
    // readout in the hub
    const khz = fmtSigned(dialToKhz(sim.dial), 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.fit(khz, r * 0.5, 15 * Math.min(g.u, 1.3), 800, true);
    ctx.fillStyle = pal.text;
    ctx.direction = 'ltr';
    ctx.fillText(khz, cx, cy - 5);
    ctx.font = g.font(9 * Math.min(g.u, 1.3), 700, true);
    ctx.fillStyle = pal.dim;
    ctx.fillText('kHz', cx, cy + 9 * Math.min(g.u, 1.3));
    ctx.textBaseline = 'alphabetic';
    ctx.direction = g.rtl ? 'rtl' : 'ltr';
  }

  private drawLock() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const b = this.button;
    const live = sim.state === 'search';
    const cooling = live && sim.lastMissStep >= 0 && sim.step - sim.lastMissStep < 60;
    const col = !live ? pal.dim : cooling ? pal.warn : pal.accentStrong;
    g.roundRect(b, 14);
    ctx.fillStyle = !live ? pal.bg2 : cooling ? withAlpha(pal.warn, 0.25) : withAlpha(pal.accent, 0.85);
    ctx.fill();
    ctx.lineWidth = live ? 3 : 1.5;
    ctx.strokeStyle = col;
    ctx.setLineDash(cooling ? [6, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = this.env.t(sim.config.wholeField ? 'minigame.MG-25.button.anywhere' : 'minigame.MG-25.button.lock');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.fit(label, b.w - 24, 20 * Math.min(g.u, 1.25), 800, false);
    ctx.fillStyle = !live ? pal.faint : cooling ? pal.text : pal.bg0;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  private drawSoundBtn() {
    const g = this.g;
    const { ctx, pal } = g;
    const b = this.soundBtn;
    const on = this.sound.enabled;
    g.roundRect(b, 14);
    ctx.fillStyle = on ? withAlpha(pal.accent, 0.3) : pal.bg1;
    ctx.fill();
    ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.strokeStyle = on ? pal.accentStrong : pal.lineStrong;
    ctx.setLineDash(on ? [] : [5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const t1 = this.env.t('minigame.MG-25.sound.label');
    const t2 = this.env.t(on ? 'minigame.MG-25.sound.on' : 'minigame.MG-25.sound.off');
    g.fit(t1, b.w - 14, 11 * Math.min(g.u, 1.3), 700, false);
    ctx.fillStyle = pal.dim;
    ctx.fillText(t1, b.x + b.w / 2, b.y + b.h * 0.34);
    g.fit(t2, b.w - 14, 15 * Math.min(g.u, 1.3), 800, false);
    ctx.fillStyle = on ? pal.accentStrong : pal.text;
    ctx.fillText(t2, b.x + b.w / 2, b.y + b.h * 0.68);
    ctx.textBaseline = 'alphabetic';
  }
}
