// MG-12 canvas renderer: status strip, torque and in-zone read-outs, the torque needle with the
// zero zone, a close-up of the engine cluster (failed engine dark, this player's engine marked,
// bells gimballed, plumes by throttle), the cluster list and the throttle / gimbal pad (or the
// sweeping throttle and LOCK button in one-button mode).
import { fmt, fmtSigned } from '../../data/format';
import { drawRocket, engineOffset, rect, View2D, withAlpha, type Rect, type Translate } from '../MG-09/shared/draw';
import { paintBarFill, paintBarTrack, paintPlotWell } from '../MG-09/shared/art';
import { GIMBAL_MAX_DEG, THROTTLE_MIN, type Mg12Sim } from './model';

export interface Mg12Frame {
  timeMs: number;
  active: boolean;
  pausedText?: string | null;
  finger?: { x: number; y: number; down: boolean } | null;
  /** Teammates' throttle from the host, by engine index (fraction), when known. */
  live?: Map<number, number>;
}

const DEG = Math.PI / 180;

export class Mg12View extends View2D {
  private sim: Mg12Sim;
  private readonly compact: boolean;
  private strip = rect(0, 0, 0, 0);
  private hud = rect(0, 0, 0, 0);
  private needle = rect(0, 0, 0, 0);
  private scene = rect(0, 0, 0, 0);
  private list = rect(0, 0, 0, 0);
  private pad = rect(0, 0, 0, 0);
  private hint = rect(0, 0, 0, 0);
  private readonly engineState: Array<{ tilt: number; power: number }> = [];

  constructor(canvas: HTMLCanvasElement, sim: Mg12Sim, t: Translate, reducedMotion: boolean, compact: boolean) {
    super(canvas, t, reducedMotion);
    this.sim = sim;
    this.compact = compact;
    for (let i = 0; i < sim.layout.engines.length; i++) this.engineState.push({ tilt: 0, power: 1 });
    this.layout();
  }

  setSim(sim: Mg12Sim) {
    this.sim = sim;
  }

  resize() {
    this.measure();
    this.layout();
  }

  /** The control pad (pointer mapping). */
  get padRect(): Rect {
    return this.padInner();
  }

  private padInner(): Rect {
    const p = this.pad;
    const top = this.compact ? 10 : 36 * Math.min(this.u, 1.3);
    return rect(p.x + 14, p.y + top, p.w - 28, p.h - top - (this.compact ? 6 : 22 * Math.min(this.u, 1.3)));
  }

  /** Pad point → throttle (fraction) and gimbal (degrees). Gimbal runs left to right in every direction (it is the vehicle's left and right). */
  settingsAt(x: number, y: number): { throttle: number; gimbal: number } {
    const r = this.padInner();
    const fx = Math.min(1, Math.max(0, (x - r.x) / r.w));
    const fy = Math.min(1, Math.max(0, (y - r.y) / r.h));
    return { throttle: 1 - fy * (1 - THROTTLE_MIN), gimbal: (fx * 2 - 1) * GIMBAL_MAX_DEG };
  }

  pointOf(throttle: number, gimbal: number): { x: number; y: number } {
    const r = this.padInner();
    return { x: r.x + ((gimbal / GIMBAL_MAX_DEG + 1) / 2) * r.w, y: r.y + ((1 - throttle) / (1 - THROTTLE_MIN)) * r.h };
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
    const needleH = this.compact ? Math.round(H * 0.16) : Math.round(78 * Math.min(this.u, 1.3));
    this.needle = rect(pad, y, W - pad * 2, needleH);
    y += needleH + 8;
    const hintH = this.compact ? 0 : Math.round(24 * us);
    this.hint = rect(pad, H - pad - hintH, W - pad * 2, hintH);
    const padH = this.compact ? Math.round(H * 0.36) : Math.round(Math.max(150, (this.hint.y - y) * 0.42));
    this.pad = rect(pad, this.hint.y - (hintH ? 6 : 0) - padH, W - pad * 2, padH);
    const h = this.pad.y - 8 - y;
    const sw = Math.round((W - pad * 2) * (this.compact ? 0.5 : 0.48));
    this.scene = this.rtl ? rect(W - pad - sw, y, sw, h) : rect(pad, y, sw, h);
    this.list = this.rtl ? rect(pad, y, W - pad * 2 - sw - 10, h) : rect(pad + sw + 10, y, W - pad * 2 - sw - 10, h);
  }

  draw(f: Mg12Frame) {
    this.begin();
    if (!this.compact) {
      this.drawStrip();
      this.drawHud();
    }
    this.drawNeedle();
    this.drawScene(f);
    this.drawList(f);
    this.drawPad(f);
    if (!this.compact) {
      const key = this.sim.config.oneButton ? 'minigame.MG-12.hint.one' : 'minigame.MG-12.hint.pad';
      this.ctx.textBaseline = 'middle';
      this.textCenter(this.t(key), this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 1, this.hint.w, 12.5 * this.us, 600, false, f.active ? this.pal.accentStrong : this.pal.dim);
      this.ctx.textBaseline = 'alphabetic';
    }
    if (f.pausedText) this.paused(f.pausedText);
  }

  private drawStrip() {
    const s = this.sim;
    if (s.inZone) {
      this.statusStrip(this.strip, 'good', 'ok', this.t('minigame.MG-12.status.ok'));
      return;
    }
    const far = Math.abs(s.netKnm) > s.config.zoneKnm * 3;
    // Positive torque turns the nose to the left (counter-clockwise).
    this.statusStrip(this.strip, far ? 'bad' : 'warn', 'warn', this.t(s.netKnm > 0 ? 'minigame.MG-12.status.left' : 'minigame.MG-12.status.right'));
  }

  private drawHud() {
    const { pal, sim } = this;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const a = rect(this.hud.x, this.hud.y, w, this.hud.h);
    const b = rect(this.hud.x + w + gap, this.hud.y, w, this.hud.h);
    const first = this.rtl ? b : a;
    const second = this.rtl ? a : b;
    const ok = sim.inZone;
    this.tile(first, this.t('minigame.MG-12.hud.torque'), fmtSigned(sim.netKnm, 0), 'kN·m', ok ? pal.text : pal.warn, { kind: ok ? 'ok' : 'warn', color: ok ? pal.good : pal.warn });
    const share = sim.inZoneFraction;
    const on = share >= sim.config.inZoneMin;
    this.tile(second, this.t('minigame.MG-12.hud.zone', { pct: fmt(sim.config.inZoneMin * 100, 0) }), fmt(Math.floor(share * 100), 0), '%', on ? pal.good : pal.warn, { kind: on ? 'ok' : 'warn', color: on ? pal.good : pal.warn });
  }

  private drawNeedle() {
    const { ctx, pal, sim } = this;
    const r = this.needle;
    this.panel(r, 12, pal.bg1);
    const range = sim.config.zoneKnm * 6;
    const tpx = 10.5 * Math.min(this.u, 1.3);
    const track = this.compact ? rect(r.x + 14, r.y + r.h * 0.3, r.w - 28, Math.max(8, r.h * 0.3)) : rect(r.x + 14, r.y + tpx * 2 + 10, r.w - 28, 12);
    // Torque is a physical left / right: the scale is not mirrored.
    const xOf = (k: number) => track.x + ((Math.max(-range, Math.min(range, k)) + range) / (2 * range)) * track.w;
    paintBarTrack(ctx, track);
    const z0 = xOf(-sim.config.zoneKnm);
    const z1 = xOf(sim.config.zoneKnm);
    ctx.fillStyle = withAlpha(pal.good, 0.4);
    ctx.fillRect(z0, track.y, z1 - z0, track.h);
    ctx.strokeStyle = pal.good;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(z0, track.y - 4);
    ctx.lineTo(z0, track.y + track.h + 4);
    ctx.moveTo(z1, track.y - 4);
    ctx.lineTo(z1, track.y + track.h + 4);
    ctx.stroke();
    // Recent history as a faint trail.
    const n = Math.min(sim.step, 120);
    for (let i = 1; i <= n; i += 6) {
      const v = sim.netHistory[sim.step - i]!;
      ctx.fillStyle = withAlpha(pal.text, 0.25 * (1 - i / n));
      ctx.fillRect(xOf(v) - 1, track.y + 1, 2, track.h - 2);
    }
    const x = xOf(sim.netKnm);
    const c = sim.inZone ? pal.text : pal.warn;
    ctx.fillStyle = c;
    ctx.fillRect(x - 2, track.y - 8, 4, track.h + 16);
    ctx.beginPath();
    ctx.moveTo(x, track.y - 2);
    ctx.lineTo(x - 7, track.y - 12);
    ctx.lineTo(x + 7, track.y - 12);
    ctx.closePath();
    ctx.fill();
    if (this.compact) return;
    const px = 10.5 * Math.min(this.u, 1.3);
    ctx.textBaseline = 'alphabetic';
    this.textStart(this.t('minigame.MG-12.needle.title'), r, 12, r.y + px + 5, px, 700, true, pal.dim, r.w * 0.55);
    this.textEnd(this.t('minigame.MG-12.needle.zone', { z: fmt(sim.config.zoneKnm, 0) }), r, 12, r.y + px + 5, px, 700, true, pal.good, r.w * 0.42);
    ctx.font = this.font(px * 0.95, 650, true);
    ctx.fillStyle = pal.faint;
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillText(this.t('minigame.MG-12.needle.left'), track.x, track.y + track.h + px + 6);
    ctx.textAlign = 'right';
    ctx.fillText(this.t('minigame.MG-12.needle.right'), track.x + track.w, track.y + track.h + px + 6);
    ctx.direction = this.rtl ? 'rtl' : 'ltr';
  }

  private drawScene(f: Mg12Frame) {
    const { ctx, pal, sim } = this;
    const r = this.scene;
    this.backdrop(r, 12, 1.2, this.rtl ? 'left' : 'right');
    const eng = sim.layout.engines;
    const n = eng.length;
    // Close-up of the base: the body is 55 % of the panel wide.
    const len = r.w * 0.55 * 11.5;
    const cx = r.x + r.w / 2;
    const baseY = r.y + r.h * 0.55;
    // The lean is drawn small: the camera rides with the vehicle.
    const tilt = this.reducedMotion ? 0 : sim.tiltDeg * DEG * 0.25;
    for (let i = 0; i < n; i++) {
      const st = this.engineState[i]!;
      if (eng[i]!.failed) {
        st.tilt = 0;
        st.power = 0;
      } else if (i === sim.layout.mine) {
        st.tilt = sim.gimbalDeg * DEG * 2.5; // drawn larger than real so the gimbal reads
        st.power = sim.throttle;
      } else {
        st.tilt = sim.layout.shareDeg * DEG * 2.5;
        st.power = f.live?.get(i) ?? 1;
      }
    }
    ctx.save();
    this.roundRect(r, 12);
    ctx.clip();
    // Rotate about a point far above (the centre of mass), so the base swings.
    const pivotY = baseY - r.h * 0.9;
    ctx.translate(cx, pivotY);
    ctx.rotate(-tilt);
    ctx.translate(-cx, -pivotY);
    drawRocket(this, { x: cx, y: baseY, length: len, part: 'lower', engines: this.engineState, plumeLen: 1.4, time: f.timeMs / 1000, calm: this.reducedMotion });
    // Markers under the bells: this player's engine and the failed one.
    const bellH = (len / 11.5) * 0.55;
    for (let i = 0; i < n; i++) {
      const ex = cx + engineOffset(len, i, n);
      const slotW = (len / 11.5) * 0.96 / n;
      if (eng[i]!.failed) this.glyph('stop', ex, baseY + bellH * 0.55, Math.min(24, Math.max(14, slotW * 1.1)), pal.bad);
      if (i === sim.layout.mine) {
        ctx.strokeStyle = pal.accentStrong;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ex, baseY - bellH * 0.45, Math.max(9, slotW * 0.75), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    this.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.22)';
    ctx.stroke();
    if (!this.compact) {
      const px = 10.5 * Math.min(this.u, 1.3);
      ctx.textBaseline = 'alphabetic';
      const title = this.t('minigame.MG-12.scene.title');
      const size = this.fit(title, r.w - 28, px, 700, true);
      const tw = ctx.measureText(title).width;
      ctx.fillStyle = withAlpha(pal.bg0, 0.8);
      this.roundRect(rect(this.rtl ? r.x + r.w - 10 - tw - 12 : r.x + 6, r.y + 6, tw + 12, size + 10), 6);
      ctx.fill();
      this.textStart(title, r, 12, r.y + size + 9, px, 700, true, pal.text, r.w - 28);
    }
  }

  private drawList(f: Mg12Frame) {
    const { ctx, pal, sim } = this;
    const r = this.list;
    this.panel(r, 12, pal.bg1);
    const eng = sim.layout.engines;
    const px = (this.compact ? 9 : 11.5) * Math.min(this.u, 1.3);
    const top = r.y + (this.compact ? 6 : px + 14);
    const rowH = Math.min((r.y + r.h - 6 - top) / eng.length, 44 * Math.min(this.u, 1.3));
    if (!this.compact) {
      ctx.textBaseline = 'alphabetic';
      this.textStart(this.t('minigame.MG-12.list.title'), r, 10, r.y + px + 6, px * 0.92, 700, true, pal.dim, r.w - 20);
    }
    ctx.textBaseline = 'middle';
    for (let i = 0; i < eng.length; i++) {
      const row = rect(r.x + 6, top + i * rowH, r.w - 12, rowH - 4);
      const mine = i === sim.layout.mine;
      const failed = eng[i]!.failed;
      if (mine) {
        this.roundRect(row, 8);
        ctx.fillStyle = withAlpha(pal.accent, 0.16);
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const cy = row.y + row.h / 2;
      const label = mine ? this.t('minigame.MG-12.list.you', { n: i + 1 }) : this.t('minigame.MG-12.list.engine', { n: i + 1 });
      this.textStart(label, row, 8, cy + 1, px, mine ? 800 : 650, false, failed ? pal.faint : mine ? pal.text : pal.dim, row.w * 0.45);
      let value: string;
      let color = pal.text;
      if (failed) {
        value = this.t('minigame.MG-12.list.out');
        color = pal.bad;
      } else {
        const thr = mine ? sim.throttle : f.live?.get(i) ?? 1;
        const g = mine ? sim.gimbalDeg : sim.layout.shareDeg;
        value = `${fmt(thr * 100, 0)} % ${fmtSigned(g, 1)}°`;
      }
      this.textEnd(value, row, 8, cy + 1, px, 750, true, color, row.w * 0.55);
      if (failed) {
        const tw = ctx.measureText(value).width;
        this.glyph('stop', this.rtl ? this.ex(row, 8) + tw + 10 : this.ex(row, 8) - tw - 10, cy, px * 1.1, pal.bad);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  private drawPad(f: Mg12Frame) {
    const { ctx, pal, sim } = this;
    const r = this.pad;
    this.panel(r, 14, pal.bg2);
    const inner = this.padInner();
    const px = 10.5 * Math.min(this.u, 1.3);
    if (sim.config.oneButton) {
      // The throttle sweeping up and down, and the lock state.
      const bar = rect(inner.x, inner.y + inner.h * 0.15, inner.w, Math.min(26, inner.h * 0.2));
      paintBarTrack(ctx, bar);
      const f0 = (sim.cmdThrottle - THROTTLE_MIN) / (1 - THROTTLE_MIN);
      paintBarFill(ctx, rect(bar.x, bar.y, Math.max(bar.h, bar.w * f0), bar.h), sim.locked ? pal.good : pal.accent);
      if (!this.compact) {
        ctx.textBaseline = 'alphabetic';
        this.textStart(this.t('minigame.MG-12.pad.throttle_now', { pct: fmt(sim.cmdThrottle * 100, 0) }), r, 14, r.y + px + 8, px, 700, true, pal.dim);
      }
      const btn = rect(inner.x, bar.y + bar.h + 12, inner.w, inner.y + inner.h - (bar.y + bar.h + 12));
      this.button(btn, this.t(sim.locked ? 'minigame.MG-12.pad.unlock' : 'minigame.MG-12.pad.lock'), {
        tone: sim.locked ? 'good' : 'accent',
        glyph: sim.locked ? 'ok' : 'ring',
        armed: !sim.locked && Math.abs(sim.netKnm) < sim.config.zoneKnm,
        pressed: f.active,
        sub: this.compact ? undefined : this.t(sim.locked ? 'minigame.MG-12.pad.locked' : 'minigame.MG-12.pad.sweeping'),
      });
      return;
    }
    // Control pad: gimbal across (−6 … +6°), throttle up (60 … 100 %). A deep glass well with
    // dot marks at the 2° / 10 % steps and the zero-gimbal axis, not a debug lattice.
    this.cached('mg12pad', inner, 0, () => {
      const x = this.ctx;
      paintPlotWell(x, inner, 10);
      const thr = x.createLinearGradient(0, inner.y + inner.h, 0, inner.y);
      thr.addColorStop(0, withAlpha(pal.accent, 0));
      thr.addColorStop(1, withAlpha(pal.accent, 0.08));
      x.fillStyle = thr;
      x.fillRect(inner.x + 1, inner.y + 1, inner.w - 2, inner.h - 2);
      x.fillStyle = withAlpha(pal.text, 0.28);
      for (let g = -GIMBAL_MAX_DEG; g <= GIMBAL_MAX_DEG; g += 2) {
        for (let t = THROTTLE_MIN; t <= 1.0001; t += 0.1) {
          const pt = this.pointOf(t, g);
          x.beginPath();
          x.arc(pt.x, pt.y, 1.3, 0, Math.PI * 2);
          x.fill();
        }
      }
      const zx = Math.round(this.pointOf(1, 0).x) + 0.5;
      x.strokeStyle = withAlpha(pal.accent, 0.35);
      x.setLineDash([3, 5]);
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(zx, inner.y + 6);
      x.lineTo(zx, inner.y + inner.h - 6);
      x.stroke();
      x.setLineDash([]);
    });
    // The settings that would balance right now at each throttle: a guide curve (Cadet only).
    // (Engineer and Flight Director read the needle.)
    // Puck at the command, ring at what the engine delivers.
    const cmd = this.pointOf(sim.cmdThrottle, sim.cmdGimbalDeg);
    const act = this.pointOf(sim.throttle, sim.gimbalDeg);
    ctx.strokeStyle = withAlpha(pal.accentStrong, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(act.x, act.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    if (f.active) {
      ctx.shadowColor = withAlpha(pal.accent, 0.8);
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = f.active ? pal.accentStrong : pal.text;
    ctx.beginPath();
    ctx.arc(cmd.x, cmd.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (f.finger) this.finger(f.finger.x, f.finger.y, f.finger.down, this.compact ? 12 : 18);
    if (this.compact) return;
    ctx.textBaseline = 'alphabetic';
    this.textStart(this.t('minigame.MG-12.pad.title', { pct: fmt(sim.cmdThrottle * 100, 0), deg: fmtSigned(sim.cmdGimbalDeg, 1) }), r, 14, r.y + px + 8, px, 700, true, pal.dim, r.w - 28);
    ctx.font = this.font(px * 0.95, 650, true);
    ctx.fillStyle = pal.faint;
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    const by = r.y + r.h - 7;
    ctx.fillText(`−${fmt(GIMBAL_MAX_DEG, 0)}°`, inner.x, by);
    ctx.textAlign = 'center';
    ctx.fillText(this.t('minigame.MG-12.pad.gimbal'), inner.x + inner.w / 2, by);
    ctx.textAlign = 'right';
    ctx.fillText(`+${fmt(GIMBAL_MAX_DEG, 0)}°`, inner.x + inner.w, by);
    ctx.direction = this.rtl ? 'rtl' : 'ltr';
  }
}
