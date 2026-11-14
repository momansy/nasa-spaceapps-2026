// MG-18 canvas renderer: orbit diagram (Earth, the shadow, the spacecraft on its orbit), the
// battery chart over the orbit slice with the red line and the contact window, and the four
// load switches. Reads the simulation only; panels are cached and repainted on change.
import { fmt } from '../../data/format';
import { Canvas2D, clamp, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { paintGlobe, paintMiniSat } from '../MG-09/shared/art';
import { ECLIPSE_MIN, LOAD_W, LOADS, ONE_BUTTON_LOADS, ORBIT_SLICE_MIN, SUN_BEFORE_MIN, type LoadId, type Mg18Sim } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg18ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg18Frame {
  timeMs: number;
  active: boolean;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

/** Real orbital period the diagram uses, min (real-world approximate, ~90 min LEO). */
const PERIOD_MIN = 92.5;
const DEG = Math.PI / 180;

function loadIcon(ctx: CanvasRenderingContext2D, id: LoadId, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.8, s * 0.1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (id === 'heaters') {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      const x = cx + i * s * 0.28;
      ctx.moveTo(x, cy + s * 0.4);
      ctx.bezierCurveTo(x - s * 0.18, cy + s * 0.15, x + s * 0.18, cy - s * 0.05, x, cy - s * 0.4);
      ctx.stroke();
    }
  } else if (id === 'radio') {
    ctx.beginPath();
    ctx.arc(cx - s * 0.05, cy - s * 0.05, s * 0.38, Math.PI * 0.15, Math.PI * 1.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.05, cy - s * 0.05);
    ctx.lineTo(cx + s * 0.3, cy - s * 0.4);
    ctx.moveTo(cx - s * 0.1, cy + s * 0.05);
    ctx.lineTo(cx, cy + s * 0.45);
    ctx.moveTo(cx - s * 0.3, cy + s * 0.45);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.45);
    ctx.stroke();
  } else if (id === 'instrument') {
    ctx.strokeRect(cx - s * 0.42, cy - s * 0.28, s * 0.6, s * 0.56);
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.18, cy - s * 0.12);
    ctx.lineTo(cx + s * 0.45, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.3);
    ctx.lineTo(cx + s * 0.18, cy + s * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - s * 0.12, cy, s * 0.13, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.1, cy + Math.sin(a) * s * 0.1);
      ctx.lineTo(cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.4);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export class Mg18View {
  readonly c: Canvas2D;
  private sim: Mg18Sim;
  private readonly opts: Mg18ViewOptions;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private orbitR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private chartP: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private chart: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rowsR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Load rows (hit regions, CSS px). */
  readonly rows: Array<{ id: LoadId; r: Rect }> = [];
  private readonly topL: KeyedLayer;
  private readonly rowsL: KeyedLayer;
  private readonly chartL: KeyedLayer;
  private readonly orbitL: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg18Sim, opts: Mg18ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.topL = new KeyedLayer(this.c);
    this.rowsL = new KeyedLayer(this.c);
    this.chartL = new KeyedLayer(this.c);
    this.orbitL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg18Sim) {
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
    for (const l of [this.topL, this.rowsL, this.chartL, this.orbitL]) l.invalidate();
    this.rows.length = 0;
    if (this.opts.compact) {
      const pad = 6;
      this.orbitR = { x: pad, y: pad, w: Math.min(H - pad * 2, W * 0.36), h: H - pad * 2 };
      this.chartP = { x: this.orbitR.x + this.orbitR.w + 6, y: pad, w: W - this.orbitR.w - pad * 2 - 6, h: H * 0.5 - pad };
      this.rowsR = { x: this.chartP.x, y: this.chartP.y + this.chartP.h + 4, w: this.chartP.w, h: H - this.chartP.h - pad * 2 - 4 };
    } else {
      const pad = 12;
      const u = Math.min(c.u, 1.4);
      const hudH = Math.round(64 * u);
      const stripH = Math.round(40 * u);
      const hintH = Math.round(28 * Math.min(c.u, 1.5));
      this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
      this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
      this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
      const rowH = Math.max(52, Math.round(56 * Math.min(c.u, 1.35)));
      const rowsH = LOADS.length * (rowH + 6) - 6;
      this.rowsR = { x: pad, y: this.hintR.y - 8 - rowsH, w: W - pad * 2, h: rowsH };
      const top = this.strip.y + stripH + 10;
      const avail = this.rowsR.y - 10 - top;
      // The battery chart needs ~120 px to read; the orbit diagram gives way first.
      const orbitH = Math.round(clamp(Math.min(avail * 0.48, avail - 120), 90, 190));
      this.orbitR = { x: pad, y: top, w: W - pad * 2, h: orbitH };
      this.chartP = { x: pad, y: top + orbitH + 8, w: W - pad * 2, h: avail - orbitH - 8 };
    }
    const cp = this.chartP;
    const compact = this.opts.compact;
    const left = compact ? 4 : c.px(34, 1.3);
    const topPad = compact ? 12 : c.px(13, 1.3) + 22;
    this.chart = { x: cp.x + left, y: cp.y + topPad, w: cp.w - left - (compact ? 4 : 10), h: cp.h - topPad - (compact ? 4 : c.px(12, 1.3) + 8) };
    const ids = compact ? ONE_BUTTON_LOADS : LOADS;
    const n = ids.length;
    const gap = compact ? 3 : 6;
    const rh = (this.rowsR.h - gap * (n - 1)) / n;
    ids.forEach((id, i) => this.rows.push({ id, r: { x: this.rowsR.x, y: this.rowsR.y + i * (rh + gap), w: this.rowsR.w, h: rh } }));
  }

  private xOfMin(m: number): number {
    const ch = this.chart;
    const f = clamp(m / ORBIT_SLICE_MIN, 0, 1);
    return this.c.rtl ? ch.x + ch.w * (1 - f) : ch.x + ch.w * f;
  }

  private yOfWh(wh: number): number {
    const ch = this.chart;
    return ch.y + ch.h * (1 - clamp(wh / this.sim.config.capacityWh, 0, 1));
  }

  // ───────────── orbit diagram ─────────────

  private drawOrbit() {
    const { c, sim, opts } = this;
    const o = this.orbitR;
    const m = sim.orbitMin;
    const nowKey = Math.round(m * 4);
    this.orbitL.blit({ x: o.x - 1, y: o.y - 1, w: o.w + 2, h: o.h + 2 }, `${nowKey}:${sim.inContact}`, () => {
      const ctx = c.ctx;
      const { pal } = c;
      c.panel(o, 12, pal.bg0);
      ctx.save();
      pathRoundRect(ctx, o, 12);
      ctx.clip();
      const R = Math.min(o.h * 0.27, o.w * 0.16);
      const cx = opts.compact ? o.x + o.w / 2 : o.x + o.w * 0.36;
      const cy = o.y + o.h / 2;
      const orbitR = R * 1.45;
      // Shadow behind Earth (Sun on the left): a dark cylinder fading out to the right.
      const umbra = ctx.createLinearGradient(cx, 0, o.x + o.w, 0);
      umbra.addColorStop(0, 'rgba(0, 4, 10, 0.55)');
      umbra.addColorStop(1, 'rgba(0, 4, 10, 0.25)');
      ctx.fillStyle = umbra;
      ctx.fillRect(cx, cy - R, o.x + o.w - cx, R * 2);
      // Sunlight from the left.
      const sg = ctx.createLinearGradient(o.x, 0, cx, 0);
      sg.addColorStop(0, withAlpha(pal.sun, 0.22));
      sg.addColorStop(1, withAlpha(pal.sun, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(o.x, o.y, cx - o.x, o.h);
      // Earth in the key-art finish, lit from the left, night side on the right.
      paintGlobe(ctx, cx, cy, R, pal, { sunAngle: Math.PI, night: 1, cities: true, atmosphere: 0.06, seed: 2 });
      // Orbit, with the eclipse arc and the slice shown.
      const angAt = (min: number) => ((min - (SUN_BEFORE_MIN + ECLIPSE_MIN / 2)) / PERIOD_MIN) * 360;
      ctx.strokeStyle = withAlpha(pal.lineStrong, 0.8);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const arc = (from: number, to: number, color: string, w: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, -angAt(to) * DEG, -angAt(from) * DEG);
        ctx.stroke();
      };
      arc(0, SUN_BEFORE_MIN, withAlpha(pal.sun, 0.85), 3);
      arc(SUN_BEFORE_MIN, SUN_BEFORE_MIN + ECLIPSE_MIN, '#4a5f78', 3);
      arc(SUN_BEFORE_MIN + ECLIPSE_MIN, ORBIT_SLICE_MIN, withAlpha(pal.sun, 0.85), 3);
      arc(sim.scenario.contactFromMin, sim.scenario.contactToMin, pal.accent, 6);
      // Spacecraft.
      const a = angAt(m) * DEG;
      const sx = cx + Math.cos(a) * orbitR;
      const sy = cy - Math.sin(a) * orbitR;
      ctx.save();
      ctx.translate(sx, sy);
      paintMiniSat(ctx, 4, -1);
      ctx.restore();
      ctx.restore();
      if (!opts.compact) {
        const t = opts.t;
        const lx = o.x + o.w * 0.66;
        const lp = c.px(11, 1.3);
        const dark = m >= SUN_BEFORE_MIN && m < SUN_BEFORE_MIN + ECLIPSE_MIN;
        const left = dark ? SUN_BEFORE_MIN + ECLIPSE_MIN - m : m < SUN_BEFORE_MIN ? SUN_BEFORE_MIN - m : 0;
        const lines: Array<[string, string, string]> = [
          [t(dark ? 'minigame.MG-18.orbit.eclipse_left' : m < SUN_BEFORE_MIN ? 'minigame.MG-18.orbit.eclipse_in' : 'minigame.MG-18.orbit.sunlight'), left > 0 ? fmt(left, 0) : '', left > 0 ? 'min' : ''],
          [t('minigame.MG-18.orbit.contact'), `${fmt(sim.scenario.contactFromMin, 0)}–${fmt(sim.scenario.contactToMin, 0)}`, 'min'],
        ];
        let y = o.y + 18;
        for (const [label, num, unit] of lines) {
          if (y + lp + c.px(19, 1.3) + 6 > o.y + o.h - 4) break; // no room at large text sizes
          c.text(label, lx, y, o.x + o.w - lx - 10, lp, 700, pal.dim, 'left');
          y += lp + 6;
          if (num) c.numberWithUnit(num, unit, lx, y + c.px(18, 1.3) * 0.75, o.x + o.w - lx - 10, c.px(19, 1.3), pal.text);
          y += c.px(19, 1.3) + 14;
        }
      }
    });
  }

  // ───────────── battery chart ─────────────

  private drawChart() {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const cp = this.chartP;
    const ch = this.chart;
    const cfg = sim.config;
    this.chartL.blit({ x: cp.x - 1, y: cp.y - 1, w: cp.w + 2, h: cp.h + 2 }, `${cfg.capacityWh}:${cfg.redLineWh}:${sim.scenario.contactFromMin}`, () => {
      const lctx = c.ctx;
      c.panel(cp, 12);
      const t = opts.t;
      if (!opts.compact) c.text(t('minigame.MG-18.chart.title'), c.rtl ? cp.x + cp.w - 10 : cp.x + 10, cp.y + 10 + c.px(11, 1.3) * 0.5, cp.w - 20, c.px(11, 1.3), 700, pal.dim, c.rtl ? 'right' : 'left');
      // Sunlight / eclipse band along the top of the chart.
      const by = ch.y - 8;
      const seg = (a: number, b: number, col: string) => {
        const x0 = Math.min(this.xOfMin(a), this.xOfMin(b));
        lctx.fillStyle = col;
        lctx.fillRect(x0, by, Math.abs(this.xOfMin(b) - this.xOfMin(a)), 5);
      };
      seg(0, SUN_BEFORE_MIN, pal.sun);
      seg(SUN_BEFORE_MIN, SUN_BEFORE_MIN + ECLIPSE_MIN, '#4a5f78');
      seg(SUN_BEFORE_MIN + ECLIPSE_MIN, ORBIT_SLICE_MIN, pal.sun);
      // Contact window.
      const cx0 = Math.min(this.xOfMin(sim.scenario.contactFromMin), this.xOfMin(sim.scenario.contactToMin));
      const cw = Math.abs(this.xOfMin(sim.scenario.contactToMin) - this.xOfMin(sim.scenario.contactFromMin));
      lctx.fillStyle = withAlpha(pal.accent, 0.12);
      lctx.fillRect(cx0, ch.y, cw, ch.h);
      lctx.fillStyle = pal.accent;
      lctx.fillRect(cx0, by - 1, cw, 7);
      // Red line, with the zone below hatched (double edge).
      const ry = this.yOfWh(cfg.redLineWh);
      lctx.save();
      lctx.beginPath();
      lctx.rect(ch.x, ry, ch.w, ch.y + ch.h - ry);
      lctx.fillStyle = withAlpha(pal.bad, 0.12);
      lctx.fill();
      lctx.clip();
      lctx.strokeStyle = withAlpha(pal.bad, 0.4);
      lctx.beginPath();
      for (let x = ch.x - 40; x < ch.x + ch.w; x += 8) {
        lctx.moveTo(x, ch.y + ch.h);
        lctx.lineTo(x + 40, ry);
      }
      lctx.stroke();
      lctx.restore();
      lctx.strokeStyle = pal.bad;
      lctx.lineWidth = 2;
      lctx.beginPath();
      lctx.moveTo(ch.x, ry);
      lctx.lineTo(ch.x + ch.w, ry);
      lctx.stroke();
      lctx.lineWidth = 1;
      lctx.beginPath();
      lctx.moveTo(ch.x, ry + 3);
      lctx.lineTo(ch.x + ch.w, ry + 3);
      lctx.stroke();
      if (!opts.compact) {
        const sp = c.px(10, 1.3);
        lctx.font = c.font(sp, 600, true);
        lctx.fillStyle = pal.faint;
        lctx.textAlign = 'right';
        lctx.textBaseline = 'middle';
        if (ch.h > 3 * sp) for (const f of [0, 0.5, 1]) lctx.fillText(`${fmt(f * 100, 0)} %`, ch.x - 4, this.yOfWh(f * cfg.capacityWh));
        c.text(t('minigame.MG-18.chart.red_line'), c.rtl ? ch.x + 6 : ch.x + ch.w - 6, ry - sp * 0.8, ch.w * 0.5, sp, 800, pal.bad, c.rtl ? 'left' : 'right');
        lctx.textBaseline = 'top';
        for (let mm = 0; mm <= ORBIT_SLICE_MIN; mm += 10) {
          lctx.textAlign = mm === 0 ? (c.rtl ? 'right' : 'left') : 'center';
          lctx.fillStyle = pal.faint;
          lctx.font = c.font(sp, 600, true);
          lctx.fillText(`${fmt(mm, 0)} min`, this.xOfMin(mm), ch.y + ch.h + 4);
        }
      }
      lctx.strokeStyle = withAlpha(pal.lineStrong, 0.6);
      lctx.lineWidth = 1;
      lctx.strokeRect(ch.x, ch.y, ch.w, ch.h);
    });
    // Battery line so far.
    const n = sim.step;
    if (n > 1) {
      const stride = Math.max(1, Math.floor(sim.totalSteps / (ch.w * 1.5)));
      ctx.lineWidth = opts.compact ? 2 : 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = sim.failure === 'battery' ? pal.bad : pal.ceramic;
      ctx.beginPath();
      for (let i = 0; i < n; i += stride) {
        const x = this.xOfMin(i * sim.minPerStep);
        const y = this.yOfWh(sim.history[i]!);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(this.xOfMin(sim.orbitMin), this.yOfWh(sim.energyWh));
      ctx.stroke();
    }
    const hx = this.xOfMin(sim.orbitMin);
    ctx.strokeStyle = withAlpha(pal.accent, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(hx) + 0.5, ch.y);
    ctx.lineTo(Math.round(hx) + 0.5, ch.y + ch.h);
    ctx.stroke();
    ctx.fillStyle = this.batteryStatus() === 'good' ? pal.good : c.statusColor(this.batteryStatus());
    ctx.beginPath();
    ctx.arc(hx, this.yOfWh(sim.energyWh), opts.compact ? 3.5 : 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  batteryStatus(): Status {
    const sim = this.sim;
    if (sim.failure === 'battery') return 'bad';
    const margin = (sim.energyWh - sim.config.redLineWh) / sim.config.capacityWh;
    return margin < 0.08 ? 'warn' : 'good';
  }

  // ───────────── load rows ─────────────

  private drawRows(active: boolean) {
    const { c, sim, opts } = this;
    const key = `${LOADS.map((id) => (sim.on[id] ? 1 : 0)).join('')}|${sim.highlight}|${sim.inContact}|${sim.failure}|${active}`;
    this.rowsL.blit({ x: this.rowsR.x - 4, y: this.rowsR.y - 4, w: this.rowsR.w + 8, h: this.rowsR.h + 8 }, key, () => {
      const ctx = c.ctx;
      const { pal } = c;
      const t = opts.t;
      for (const { id, r } of this.rows) {
        const on = sim.on[id];
        const hi = sim.config.oneButton && ONE_BUTTON_LOADS[sim.highlight] === id;
        const critical = id === 'heaters' || (id === 'radio' && sim.inContact);
        const violated = critical && !on;
        pathRoundRect(ctx, r, 10);
        ctx.fillStyle = hi ? withAlpha(pal.accent, 0.2) : pal.bg2;
        ctx.fill();
        if (violated) c.statusBorder(r, 'bad', 10, 2);
        else {
          pathRoundRect(ctx, r, 10);
          ctx.lineWidth = hi ? 3 : 1;
          ctx.strokeStyle = hi ? pal.accentStrong : pal.lineStrong;
          ctx.stroke();
        }
        const compact = opts.compact;
        const iconS = Math.min(r.h * 0.55, 30);
        const ix = c.rtl ? r.x + r.w - 12 - iconS / 2 : r.x + 12 + iconS / 2;
        loadIcon(ctx, id, ix, r.y + r.h / 2, iconS, on ? pal.text : pal.faint);
        // Switch.
        const sw = { w: compact ? 30 : Math.round(62 * Math.min(c.u, 1.2)), h: compact ? 14 : Math.min(30, r.h - 18) };
        const sx = c.rtl ? r.x + 10 : r.x + r.w - 10 - sw.w;
        const sy = r.y + (r.h - sw.h) / 2;
        pathRoundRect(ctx, { x: sx, y: sy, w: sw.w, h: sw.h }, sw.h / 2);
        ctx.fillStyle = on ? pal.accent : pal.bg0;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = on ? pal.accentStrong : pal.lineStrong;
        ctx.stroke();
        const knobR = sw.h / 2 - 3;
        const kx = on !== c.rtl ? sx + sw.w - sw.h / 2 : sx + sw.h / 2;
        ctx.fillStyle = on ? pal.ink : pal.dim;
        ctx.beginPath();
        ctx.arc(kx, sy + sw.h / 2, knobR, 0, Math.PI * 2);
        ctx.fill();
        if (!compact) {
          const word = t(on ? 'minigame.MG-18.switch.on' : 'minigame.MG-18.switch.off');
          c.text(word, on !== c.rtl ? sx + (sw.w - sw.h) / 2 + 2 : sx + sw.h + (sw.w - sw.h) / 2 - 2, sy + sw.h / 2 + 1, sw.w - sw.h, c.px(10.5, 1.2), 900, on ? pal.ink : pal.dim, 'center');
          const tx = c.rtl ? r.x + r.w - 24 - iconS : r.x + 24 + iconS;
          const tw = r.w - iconS - sw.w - 44;
          c.text(`${t(`minigame.MG-18.load.${id}`)} · ${fmt(LOAD_W[id], 0)} W`, tx, r.y + r.h * 0.36, tw, c.px(14, 1.3), 800, on ? pal.text : pal.dim, c.rtl ? 'right' : 'left');
          const tagKey = id === 'heaters' ? 'minigame.MG-18.tag.critical' : id === 'radio' ? (sim.inContact ? 'minigame.MG-18.tag.contact_now' : 'minigame.MG-18.tag.contact_later') : id === 'instrument' ? 'minigame.MG-18.tag.science' : 'minigame.MG-18.tag.pointing';
          const tagCol = violated ? pal.bad : critical ? pal.warn : pal.faint;
          c.text(t(tagKey), tx, r.y + r.h * 0.72, tw, c.px(11, 1.25), 700, tagCol, c.rtl ? 'right' : 'left');
        }
      }
    });
  }

  draw(f: Mg18Frame) {
    const { c, sim, opts } = this;
    const { pal } = c;
    const t = opts.t;
    c.begin();
    this.drawOrbit();
    this.drawChart();
    this.drawRows(f.active);
    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }
    const bs = this.batteryStatus();
    const [st, key] = this.status();
    const topKey = `${fmt(sim.energyWh, 1)}|${Math.round(sim.solarW)}|${bs}|${key}|${st}`;
    this.topL.blit({ x: 0, y: 0, w: c.W, h: this.strip.y + this.strip.h + 2 }, topKey, () => {
      const gap = 8;
      const tw = (this.hud.w - gap) / 2;
      const a: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
      const b: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
      const [first, second] = c.rtl ? [b, a] : [a, b];
      const pct = Math.round((sim.energyWh / sim.config.capacityWh) * 100);
      c.readout(first, t('minigame.MG-18.hud.battery', { pct }), fmt(sim.energyWh, 1, 1), 'Wh', c.statusColor(bs), bs);
      c.readout(second, `${t('minigame.MG-18.hud.solar')} · ${t('minigame.MG-18.hud.load', { w: fmt(sim.loadW, 0) })}`, fmt(sim.solarW, 0), 'W', sim.solarW > 0 ? pal.sun : pal.dim);
      if (st === 'info') {
        c.infoStrip(this.strip, t(key));
      } else c.statusStrip(this.strip, st, t(key));
    });
    c.hint(this.hintR, t(sim.config.oneButton ? 'minigame.MG-18.hint.press' : 'minigame.MG-18.hint.tap'), f.active);
    if (f.pausedText) c.overlay(f.pausedText);
  }

  status(): [Status | 'info', string] {
    const sim = this.sim;
    if (sim.failure === 'battery') return ['bad', 'minigame.MG-18.status.fail_battery'];
    if (sim.failure === 'heaters') return ['bad', 'minigame.MG-18.status.fail_heaters'];
    if (sim.failure === 'radio') return ['bad', 'minigame.MG-18.status.fail_radio'];
    if (!sim.on.heaters) return ['bad', 'minigame.MG-18.status.heaters_off'];
    if (sim.inContact && !sim.on.radio) return ['bad', 'minigame.MG-18.status.radio_off'];
    if (this.batteryStatus() === 'warn') return ['warn', 'minigame.MG-18.status.low'];
    const m = sim.orbitMin;
    if (m < SUN_BEFORE_MIN) return ['info', 'minigame.MG-18.status.before'];
    if (m >= SUN_BEFORE_MIN + ECLIPSE_MIN) return ['good', 'minigame.MG-18.status.after'];
    return ['good', sim.inContact ? 'minigame.MG-18.status.contact' : 'minigame.MG-18.status.ok'];
  }
}
