// MG-15 canvas renderer: the style-guide satellite (wings stowed, then opening on their hinges),
// the release-order diagram with this player's window, and in phase 2 a dial seen along the
// wing axis with the Sun, the tolerance wedge and the wing's cell side. Reads the sim only.
import { fmt } from '../../data/format';
import { Canvas2D, clamp, drawSatellite, KeyedLayer, makeLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { paintGlass, paintSky } from '../MG-09/shared/art';
import type { Hinge, Mg15Sim } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg15ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg15Frame {
  timeMs: number;
  active: boolean;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

const DEG = Math.PI / 180;
/** Time a panel takes to swing open after its hinge releases, s (visual only). */
const SWING_S = 0.5;

export class Mg15View {
  readonly c: Canvas2D;
  private sim: Mg15Sim;
  private readonly opts: Mg15ViewOptions;
  private layer: ReturnType<typeof makeLayer> = null;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private satR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private lower: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Dial centre and radius, CSS px (phase 2 input uses them). */
  dialX = 0;
  dialY = 0;
  dialR = 60;
  private readonly panels = new Float32Array(6);
  private readonly marks: Array<{ status: 'idle' | 'lit' | 'done' | 'bad' | 'crew' }> = [];
  /** Cached: the satellite panel (repainted while panels move or the light changes), readouts. */
  private readonly satL: KeyedLayer;
  private readonly topL: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg15Sim, opts: Mg15ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    for (let i = 0; i < 6; i++) this.marks.push({ status: 'idle' });
    this.satL = new KeyedLayer(this.c);
    this.topL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg15Sim) {
    this.sim = sim;
    this.paintStatic();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  private layout() {
    const { c } = this;
    const { W, H } = c;
    if (this.opts.compact) {
      const pad = 8;
      this.satR = { x: pad, y: pad, w: W * 0.56 - pad, h: H - pad * 2 };
      this.lower = { x: W * 0.56 + 4, y: pad, w: W * 0.44 - pad - 4, h: H - pad * 2 };
    } else {
      const pad = 12;
      const hudH = Math.round(64 * Math.min(c.u, 1.4));
      const stripH = Math.round(40 * Math.min(c.u, 1.4));
      const hintH = Math.round(28 * Math.min(c.u, 1.5));
      this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
      this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
      const top = this.strip.y + stripH + 10;
      this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
      const avail = this.hintR.y - 8 - top;
      const satH = Math.round(clamp(avail * 0.36, 120, 250));
      this.satR = { x: pad, y: top, w: W - pad * 2, h: satH };
      this.lower = { x: pad, y: top + satH + 10, w: W - pad * 2, h: avail - satH - 10 };
    }
    const lw = this.lower;
    const titleH = this.opts.compact ? 0 : c.px(12, 1.3) + 14;
    this.dialR = Math.max(24, Math.min(lw.w / 2 - (this.opts.compact ? 18 : 46), (lw.h - titleH) / 2 - (this.opts.compact ? 10 : 12 + c.px(14, 1.3))));
    this.dialX = lw.x + lw.w / 2 + (this.opts.compact ? 6 : 16);
    this.dialY = lw.y + titleH + (lw.h - titleH) / 2;
    this.satL?.invalidate();
    this.topL?.invalidate();
    this.paintStatic();
  }

  /** Static art: space panel with the Earth limb, panels of the lower area. */
  private paintStatic() {
    const layer = makeLayer(this.c);
    this.layer = layer;
    if (!layer) return;
    const ctx = layer.ctx;
    const { pal } = this.c;
    const s = this.satR;
    // Space panel: the key-art sky with the Earth limb low in the frame, Sun off to the left.
    ctx.save();
    pathRoundRect(ctx, s, 12);
    ctx.clip();
    paintSky(ctx, s, pal, 0.82, 'left');
    ctx.restore();
    pathRoundRect(ctx, s, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150, 205, 228, 0.22)';
    ctx.stroke();
    // Lower panel: glass.
    paintGlass(ctx, this.lower, 14, pal);
  }

  private hingeStatus(h: Hinge): Status | 'info' | 'idle' {
    if (h.state === 'done') return 'good';
    if (h.state === 'early' || h.state === 'late') return 'warn';
    if (h.state === 'open') return 'info';
    return 'idle';
  }

  /** Panel opening 0–1 for a hinge, from its release step. */
  private opening(h: Hinge): number {
    const sim = this.sim;
    const rel = h.releasedStep >= 0 ? h.releasedStep : -1;
    if (rel < 0 || sim.step < rel) return 0;
    const k = (sim.step - rel) / (SWING_S * 120);
    const e = clamp(k, 0, 1);
    return this.opts.reducedMotion ? (e > 0 ? 1 : 0) : 1 - (1 - e) * (1 - e);
  }

  draw(f: Mg15Frame) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    c.begin();
    // Static art of the lower panel only; the satellite panel has its own cached layer.
    const lw = this.lower;
    if (this.layer) {
      const d = c.dpr;
      ctx.drawImage(this.layer.canvas, Math.floor(lw.x * d) - 2, Math.floor(lw.y * d) - 2, Math.ceil(lw.w * d) + 4, Math.ceil(lw.h * d) + 4, Math.floor(lw.x) - 2 / d, Math.floor(lw.y) - 2 / d, Math.ceil(lw.w) + 4 / d, Math.ceil(lw.h) + 4 / d);
    }

    // ── satellite ──
    const hs = sim.plan.hinges;
    this.panels.fill(0);
    for (let k = 0; k < 6; k++) this.marks[k]!.status = 'idle';
    for (const h of hs) {
      this.panels[h.index] = this.opening(h);
      const st = this.hingeStatus(h);
      this.marks[h.index]!.status = st === 'good' ? 'done' : st === 'warn' ? 'bad' : st === 'info' ? 'lit' : h.mine ? 'idle' : 'idle';
    }
    // Panels beyond the team's hinges (no player owns them) follow the panel inboard of them
    // on the same wing, so each wing still unfolds from the root outwards.
    for (let k = hs.length; k < 6; k++) this.panels[k] = this.panels[k - 2]!;
    const sr = this.satR;
    const scale = Math.min(sr.w / 13, sr.h / 4.4);
    const cell = sim.phase === 2 ? Math.max(0, Math.cos(sim.thetaDeg * DEG)) : 0.25;
    let satKey = `${Math.round(cell * 40)}`;
    for (let k = 0; k < 6; k++) satKey += `|${Math.round(this.panels[k]! * 50)}${this.marks[k]!.status}`;
    this.satL.blit({ x: sr.x - 1, y: sr.y - 1, w: sr.w + 2, h: sr.h + 2 }, satKey, () => {
    const ctx = c.ctx;
    if (this.layer) {
      const d = c.dpr;
      ctx.drawImage(this.layer.canvas, Math.floor((sr.x - 1) * d), Math.floor((sr.y - 1) * d), Math.ceil((sr.w + 2) * d), Math.ceil((sr.h + 2) * d), Math.floor((sr.x - 1) * d) / d, Math.floor((sr.y - 1) * d) / d, Math.ceil((sr.w + 2) * d) / d, Math.ceil((sr.h + 2) * d) / d);
    }
    ctx.save();
    pathRoundRect(ctx, sr, 12);
    ctx.clip();
    ctx.translate(sr.x + sr.w / 2, sr.y + sr.h * 0.47);
    drawSatellite(ctx, pal, scale, this.panels, cell, this.marks);
    // "YOU" tag over this player's hinge.
    if (!opts.compact) {
      const mine = sim.mine;
      const side = mine.index % 2 === 0 ? -1 : 1;
      const i = Math.floor(mine.index / 2);
      let x = side * (scale + scale * 0.5);
      for (let j = 0; j < i; j++) x += side * scale * 1.55 * (0.12 + 0.88 * (this.panels[side < 0 ? j * 2 : j * 2 + 1] ?? 0));
      const y = -scale * 0.8 - c.px(12, 1.3);
      const label = t('minigame.MG-15.tag.you');
      ctx.font = c.font(c.px(11, 1.3), 800, true);
      const w = ctx.measureText(label).width + 12;
      const st = this.hingeStatus(mine);
      const col = st === 'good' ? pal.good : st === 'warn' ? pal.warn : pal.accent;
      pathRoundRect(ctx, { x: x - w / 2, y: y - 9, w, h: 18 }, 6);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.fillStyle = pal.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 1);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + 9);
      ctx.lineTo(x, -scale * 0.5);
      ctx.stroke();
    }
    ctx.restore();
    });

    if (sim.phase === 1) this.drawPhase1(f);
    else this.drawDial();

    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }

    // ── readouts and status strip (cached; repainted when their text changes) ──
    const m0 = sim.mine;
    const secsLeft = sim.step < m0.openStep ? m0.openStep - sim.step : sim.step <= m0.closeStep && (m0.state === 'open' || m0.state === 'wait') ? m0.closeStep - sim.step : Math.max(0, sim.plan.phase2Step - sim.step);
    const [st0, key0] = this.status();
    const topKey = sim.phase === 1 ? `1|${m0.state}|${Math.round(secsLeft / 12)}|${key0}` : `2|${Math.round(sim.powerW)}|${Math.floor(sim.pointingFraction * 100 + 1e-9)}|${key0}|${st0}`;
    this.topL.blit({ x: 0, y: 0, w: c.W, h: this.strip.y + this.strip.h + 2 }, topKey, () => {
    const gap = 8;
    const tw = (this.hud.w - gap) / 2;
    const a: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
    const b: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
    const [first, second] = c.rtl ? [b, a] : [a, b];
    const mine = sim.mine;
    if (sim.phase === 1) {
      c.readout(first, t('minigame.MG-15.hud.hinge'), fmt(mine.index + 1, 0), t('minigame.MG-15.hud.of', { n: hs.length }), pal.text);
      let label: string;
      let secs: number;
      if (sim.step < mine.openStep) {
        label = t('minigame.MG-15.hud.opens_in');
        secs = (mine.openStep - sim.step) / 120;
      } else if (sim.step <= mine.closeStep && (mine.state === 'open' || mine.state === 'wait')) {
        label = t('minigame.MG-15.hud.closes_in');
        secs = (mine.closeStep - sim.step) / 120;
      } else {
        label = t('minigame.MG-15.hud.wings_in');
        secs = Math.max(0, (sim.plan.phase2Step - sim.step) / 120);
      }
      c.readout(second, label, fmt(secs, 1, 1), 's', pal.text);
    } else {
      c.readout(first, t('minigame.MG-15.hud.power'), fmt(sim.powerW, 0), 'W', sim.pointing ? pal.good : pal.text);
      const share = sim.pointingFraction;
      const need = sim.config.pointingFractionMin;
      const ok = share >= need;
      c.readout(second, `${t('minigame.MG-15.hud.pointing')} · ${t('minigame.MG-15.hud.need', { pct: fmt(need * 100, 0) })}`, fmt(Math.floor(share * 100 + 1e-9), 0), '%', ok ? pal.good : pal.warn, ok ? 'good' : 'warn');
    }

    // ── status strip ──
    const [st, key] = this.status();
    if (st === 'info') this.infoStrip(this.strip, t(key));
    else c.statusStrip(this.strip, st, t(key));

    });

    const hintKey = sim.phase === 1 ? 'minigame.MG-15.hint.release' : sim.config.oneButton ? 'minigame.MG-15.hint.nudge' : 'minigame.MG-15.hint.drag';
    c.hint(this.hintR, t(hintKey), f.active);
    if (f.pausedText) c.overlay(f.pausedText);
  }

  /** Current status and its string key. */
  status(): [Status | 'info', string] {
    const sim = this.sim;
    const m = sim.mine;
    if (sim.phase === 2) return sim.pointing ? ['good', 'minigame.MG-15.status.sun'] : ['warn', 'minigame.MG-15.status.turn'];
    if (m.state === 'done') return ['good', 'minigame.MG-15.status.done'];
    if (m.state === 'early') return ['warn', 'minigame.MG-15.status.early'];
    if (m.state === 'late') return ['warn', 'minigame.MG-15.status.late'];
    if (m.state === 'open') return ['info', 'minigame.MG-15.status.go'];
    return ['info', 'minigame.MG-15.status.wait'];
  }

  /** Neutral strip (waiting, or "release now"): Signal outline, no requirement status. */
  private infoStrip(r: Rect, label: string) {
    const { c } = this;
    const { ctx, pal } = c;
    const go = this.sim.mine.state === 'open';
    c.roundRect(r, 10);
    ctx.fillStyle = go ? withAlpha(pal.accent, 0.22) : pal.bg1;
    ctx.fill();
    c.roundRect(r, 10);
    ctx.lineWidth = go ? 3 : 1.5;
    ctx.strokeStyle = pal.accent;
    ctx.stroke();
    c.text(label, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 24, c.px(15, 1.5), 800, go ? pal.accentStrong : pal.text, 'center');
  }

  /** Phase 1: the release order (one block per hinge window) and the big release cue. */
  private drawPhase1(f: Mg15Frame) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    const lw = this.lower;
    const hs = sim.plan.hinges;
    const compact = opts.compact;
    const pad = compact ? 6 : 12;
    // Timeline from 0 to the start of phase 2.
    const titlePx = c.px(11, 1.3);
    if (!compact) c.text(t('minigame.MG-15.order.title'), c.rtl ? lw.x + lw.w - pad : lw.x + pad, lw.y + pad + titlePx * 0.5, lw.w - pad * 2, titlePx, 700, pal.dim, c.rtl ? 'right' : 'left');
    const tl: Rect = compact ? { x: lw.x + pad, y: lw.y + pad, w: lw.w - pad * 2, h: 22 } : { x: lw.x + pad, y: lw.y + pad * 2 + titlePx, w: lw.w - pad * 2, h: Math.round(46 * Math.min(c.u, 1.3)) };
    const end = sim.plan.phase2Step;
    const xOf = (step: number) => (c.rtl ? tl.x + tl.w - (step / end) * tl.w : tl.x + (step / end) * tl.w);
    ctx.fillStyle = withAlpha(pal.lineStrong, 0.35);
    c.roundRect({ x: tl.x, y: tl.y + tl.h / 2 - 2, w: tl.w, h: 4 }, 2);
    ctx.fill();
    for (const h of hs) {
      const x0 = Math.min(xOf(h.openStep), xOf(h.closeStep));
      const x1 = Math.max(xOf(h.openStep), xOf(h.closeStep));
      const r: Rect = { x: x0, y: tl.y + (h.mine ? 0 : tl.h * 0.18), w: Math.max(8, x1 - x0), h: h.mine ? tl.h : tl.h * 0.64 };
      const st = this.hingeStatus(h);
      const fill = st === 'good' ? withAlpha(pal.good, 0.3) : st === 'warn' ? withAlpha(pal.warn, 0.25) : st === 'info' ? withAlpha(pal.accent, 0.35) : withAlpha(pal.bg3, 0.9);
      c.roundRect(r, 6);
      ctx.fillStyle = fill;
      ctx.fill();
      if (st === 'good' || st === 'warn') c.statusBorder(r, st, 6, h.mine ? 2 : 1.5);
      else {
        c.roundRect(r, 6);
        ctx.lineWidth = h.mine ? 2.5 : 1;
        ctx.strokeStyle = h.mine ? pal.accent : pal.lineStrong;
        ctx.stroke();
      }
      if (!compact) {
        const label = h.mine ? `${fmt(h.index + 1, 0)} · ${t('minigame.MG-15.tag.you')}` : `${fmt(h.index + 1, 0)}`;
        c.text(label, r.x + r.w / 2, r.y + r.h / 2 + 1, Math.max(r.w - 4, 12), c.px(h.mine ? 12 : 11, 1.25), 800, h.mine ? pal.text : pal.dim, 'center', true);
        if (!h.mine) c.text(t('minigame.MG-15.tag.crew'), r.x + r.w / 2, r.y + r.h + c.px(9, 1.2) * 0.9, r.w + 12, c.px(9, 1.2), 600, pal.faint, 'center');
      }
    }
    // Now cursor.
    const nx = xOf(Math.min(sim.step, end));
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nx, tl.y - 4);
    ctx.lineTo(nx, tl.y + tl.h + 4);
    ctx.stroke();

    // Big release cue: the whole playfield is the button; this shows when it counts.
    const m = sim.mine;
    const area: Rect = { x: lw.x + pad, y: tl.y + tl.h + (compact ? 8 : 26), w: lw.w - pad * 2, h: lw.y + lw.h - pad - (tl.y + tl.h + (compact ? 8 : 26)) };
    const R = Math.max(14, Math.min(area.w, area.h, compact ? 400 : 230 * Math.min(c.u, 1.3)) / 2 - 6);
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    const open = m.state === 'open';
    const st = this.hingeStatus(m);
    ctx.save();
    if (open && !opts.reducedMotion) {
      const pulse = 0.5 + 0.5 * Math.sin(f.timeMs / 120);
      ctx.fillStyle = withAlpha(pal.accent, 0.12 + 0.12 * pulse);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = open ? pal.accent : st === 'good' ? withAlpha(pal.good, 0.25) : st === 'warn' ? withAlpha(pal.warn, 0.2) : pal.bg3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = open ? pal.accentStrong : st === 'good' ? pal.good : st === 'warn' ? pal.warn : pal.lineStrong;
    if (st === 'warn') ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Window progress ring while open; countdown ring before it.
    if (m.state === 'wait' && sim.step < m.openStep) {
      const lead = Math.max(1, m.openStep);
      const frac = clamp(sim.step / lead, 0, 1);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 7, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    } else if (open) {
      const frac = clamp((m.closeStep - sim.step) / Math.max(1, m.closeStep - m.openStep), 0, 1);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 7, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (!compact || R > 20) {
      const word = st === 'good' || st === 'warn' ? t('minigame.MG-15.button.released') : t('minigame.MG-15.button.release');
      c.text(word, cx, cy - (compact ? 0 : R * 0.12), R * 1.6, c.px(compact ? 11 : 18, 1.4), 900, open ? pal.ink : pal.text, 'center');
      if (!compact) {
        if (st === 'good' || st === 'warn') c.statusIcon(st, cx, cy + R * 0.3, Math.min(30, R * 0.36));
        else {
          const secs = m.state === 'wait' ? (m.openStep - sim.step) / 120 : (m.closeStep - sim.step) / 120;
          const sub = m.state === 'wait' ? t('minigame.MG-15.button.in', { s: fmt(Math.max(0, secs), 1, 1) }) : t('minigame.MG-15.button.now');
          c.text(sub, cx, cy + R * 0.3, R * 1.5, c.px(13, 1.4), 700, open ? pal.ink : pal.dim, 'center');
        }
      }
    }
  }

  /** Phase 2: dial along the wing axis with the Sun, tolerance wedge, wing and θ. */
  private drawDial() {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    const lw = this.lower;
    const compact = opts.compact;
    const { dialX: cx, dialY: cy, dialR: R } = this;
    if (!compact) {
      const tp = c.px(11, 1.3);
      c.text(t('minigame.MG-15.dial.title'), c.rtl ? lw.x + lw.w - 12 : lw.x + 12, lw.y + 12 + tp * 0.5, lw.w - 24, tp, 700, pal.dim, c.rtl ? 'right' : 'left');
    }
    // Sunlight: faint parallel rays from the left across the panel.
    ctx.save();
    pathRoundRect(ctx, lw, 12);
    ctx.clip();
    ctx.strokeStyle = withAlpha(pal.sun, 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = cy - R; y <= cy + R + 1; y += R / 4) {
      ctx.moveTo(lw.x, y);
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
    ctx.restore();
    // Sun disc at the left edge.
    const sunX = lw.x + (compact ? 10 : 24);
    const sunR = compact ? 7 : 13;
    const sg = ctx.createRadialGradient(sunX, cy, 1, sunX, cy, sunR * 2.2);
    sg.addColorStop(0, withAlpha(pal.sun, 0.55));
    sg.addColorStop(1, withAlpha(pal.sun, 0));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sunX, cy, sunR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.arc(sunX, cy, sunR, 0, Math.PI * 2);
    ctx.fill();
    if (!compact) c.text(t('minigame.MG-15.dial.sun'), sunX, cy + sunR + c.px(11, 1.3), 60, c.px(11, 1.3), 700, pal.sun, 'center');

    // Dial ring with ticks every 30°.
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let a = 0; a < 360; a += 30) {
      const r0 = a % 90 === 0 ? R - 10 : R - 6;
      ctx.moveTo(cx + Math.cos(a * DEG) * r0, cy - Math.sin(a * DEG) * r0);
      ctx.lineTo(cx + Math.cos(a * DEG) * R, cy - Math.sin(a * DEG) * R);
    }
    ctx.stroke();
    // Tolerance wedge towards the Sun (180°).
    const tol = sim.config.toleranceDeg;
    ctx.fillStyle = withAlpha(pal.good, 0.16);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, Math.PI - tol * DEG, Math.PI + tol * DEG);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.good;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - Math.cos(tol * DEG) * R, cy - Math.sin(tol * DEG) * R);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - Math.cos(tol * DEG) * R, cy + Math.sin(tol * DEG) * R);
    ctx.stroke();

    // Body (the bus seen end-on), rotated by the body attitude.
    const body = sim.bodyDeg;
    const nrm = sim.bodyDeg + sim.driveDeg; // wing normal, ° counter-clockwise from +x
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-body * DEG);
    const bs = R * 0.16;
    ctx.fillStyle = '#d2a650'; // gold blanket bands
    ctx.fillRect(-bs, -bs, bs * 2, bs * 2);
    ctx.fillStyle = pal.ceramic; // ceramic panel block
    ctx.fillRect(-bs, -bs * 0.55, bs * 2, bs * 1.1);
    ctx.strokeStyle = '#c3ccd3';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-bs, -bs, bs * 2, bs * 2);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(-bs, -bs - 3, bs * 2, 3);
    ctx.fillStyle = '#1b2733';
    ctx.fillRect(-bs * 0.4, bs, bs * 0.8, bs * 0.35); // nadir aperture
    ctx.restore();
    // Wing cross-section: a long bar across the centre, perpendicular to its normal.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-nrm * DEG);
    const half = R * 0.78;
    const thick = Math.max(4, R * 0.06);
    ctx.fillStyle = '#4c5864'; // back of the wing
    ctx.fillRect(-thick / 2 - 1, -half, thick / 2, half * 2);
    const lum = Math.max(0, Math.cos(sim.thetaDeg * DEG));
    ctx.fillStyle = `rgb(${Math.round(20 + 40 * lum)}, ${Math.round(40 + 70 * lum)}, ${Math.round(80 + 110 * lum)})`;
    ctx.fillRect(0, -half, thick / 2 + 1, half * 2); // cell side faces +x (the normal)
    ctx.fillStyle = pal.accent;
    ctx.fillRect(thick / 2, -half, 1.5, half * 2);
    // Normal arrow.
    const col = sim.pointing ? pal.good : pal.warn;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = compact ? 2.5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(thick, 0);
    ctx.lineTo(R * 0.86, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.98, 0);
    ctx.lineTo(R * 0.84, -R * 0.07);
    ctx.lineTo(R * 0.84, R * 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // θ arc between the Sun direction and the normal.
    const th = sim.thetaDeg;
    ctx.strokeStyle = withAlpha(sim.pointing ? pal.good : pal.warn, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const a0 = Math.PI; // canvas angle of the Sun direction
    const a1 = Math.PI - th * DEG;
    ctx.arc(cx, cy, R * 0.42, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    if (sim.nudgeGlow > 0 && !opts.reducedMotion) {
      ctx.strokeStyle = withAlpha(pal.accentStrong, sim.nudgeGlow / 36);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!compact) {
      const label = `θ ${fmt(Math.abs(th), 0)}° · cos θ ${fmt(Math.max(0, Math.cos(th * DEG)), 2, 2)}`;
      c.text(label, cx, cy + R + c.px(14, 1.3), lw.w - 24, c.px(13, 1.3), 800, sim.pointing ? pal.good : pal.warn, 'center', true);
    }
  }
}
