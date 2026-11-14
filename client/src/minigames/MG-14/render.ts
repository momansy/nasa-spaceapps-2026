// MG-14 canvas renderer: the encounter plot at closest approach (debris uncertainty ellipses,
// the keep-out zone where the probability is above the threshold, the predicted position with
// and without the burn), the collision-probability gauge, and the burn controls (full menu,
// short list or highlighted list). Hit regions for the controls are exposed to `index.ts`.
import { fmt } from '../../data/format';
import { Canvas2D, clamp, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { DIRS, DURATIONS_S, type BurnOption, type Dir, type Mg14Sim } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg14ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg14Frame {
  timeMs: number;
  active: boolean;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

export type Hit = { kind: 'dir'; dir: Dir } | { kind: 'dur'; delta: number } | { kind: 'durAt'; index: number } | { kind: 'row'; index: number } | { kind: 'burn' };

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** "3.2 × 10⁻³" with a real minus sign in the exponent. */
export function fmtPc(p: number): string {
  if (p <= 0) return '0';
  if (p >= 0.01) return fmt(p, 2);
  const e = Math.floor(Math.log10(p));
  const m = p / Math.pow(10, e);
  const exp = String(e)
    .split('')
    .map((ch) => SUP[ch] ?? ch)
    .join('');
  return `${fmt(m, 1, 1)} × 10${exp}`;
}

/** Arrow glyph for a burn direction in the plot's frame: prograde → right, radial out → up. */
function arrow(ctx: CanvasRenderingContext2D, dir: Dir, cx: number, cy: number, s: number, color: string) {
  const a = dir === 'prograde' ? 0 : dir === 'retrograde' ? Math.PI : dir === 'radial_out' ? -Math.PI / 2 : Math.PI / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, 0);
  ctx.lineTo(s * 0.15, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.5, 0);
  ctx.lineTo(s * 0.1, -s * 0.3);
  ctx.lineTo(s * 0.1, s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export class Mg14View {
  readonly c: Canvas2D;
  private sim: Mg14Sim;
  private readonly opts: Mg14ViewOptions;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private plot: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private gauge: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private controls: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Clickable regions of this frame, in CSS px. */
  readonly hits: Array<{ r: Rect; hit: Hit }> = [];
  /** Duration slider track (for drags). */
  slider: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rangeT = 1800;
  private rangeR = 450;
  private readonly plotL: KeyedLayer;
  /** Key of the last drawn frame: nothing visible changed → the frame is skipped. */
  private lastKey = '';

  constructor(canvas: HTMLCanvasElement, sim: Mg14Sim, opts: Mg14ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.plotL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg14Sim) {
    this.sim = sim;
    this.layout();
  }

  resize() {
    this.c.measure();
    this.layout();
  }

  private layout() {
    const { c, sim } = this;
    const { W, H } = c;
    const cfg = sim.config;
    this.rangeT = cfg.sigmaT * 3.6;
    this.rangeR = cfg.sigmaR * 4.5;
    this.plotL.invalidate();
    this.lastKey = '';
    if (this.opts.compact) {
      this.plot = { x: 6, y: 6, w: W - 12, h: H - 12 - 22 };
      this.gauge = { x: 6, y: H - 6 - 16, w: W - 12, h: 16 };
      return;
    }
    const pad = 12;
    const u = Math.min(c.u, 1.4);
    const hudH = Math.round(64 * u);
    const stripH = Math.round(40 * u);
    const hintH = Math.round(28 * Math.min(c.u, 1.5));
    this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
    this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
    this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
    const rowH = Math.round(46 * Math.min(c.u, 1.3));
    const btnH = Math.round(56 * Math.min(c.u, 1.3));
    const ctrlH = cfg.shortList
      ? sim.scenario.shortList.length * (rowH + 6) + (cfg.oneButton ? 0 : btnH + 8) + 8
      : Math.round(70 * Math.min(c.u, 1.3)) + 10 + Math.round(64 * Math.min(c.u, 1.3)) + 10 + btnH + 8;
    const gaugeH = Math.round(58 * u);
    const top = this.strip.y + stripH + 10;
    const bottom = this.hintR.y - 8;
    this.controls = { x: pad, y: bottom - ctrlH, w: W - pad * 2, h: ctrlH };
    this.gauge = { x: pad, y: this.controls.y - 8 - gaugeH, w: W - pad * 2, h: gaugeH };
    this.plot = { x: pad, y: top, w: W - pad * 2, h: Math.max(90, this.gauge.y - 8 - top) };
  }

  // ───────────── encounter plot ─────────────

  private px(yAlong: number): number {
    const p = this.plot;
    return p.x + p.w / 2 + (yAlong / this.rangeT) * (p.w / 2);
  }
  private py(xRadial: number): number {
    const p = this.plot;
    return p.y + p.h / 2 - (xRadial / this.rangeR) * (p.h / 2);
  }

  private drawPlot(sel: BurnOption) {
    const { c, sim, opts } = this;
    const { pal } = c;
    const t = opts.t;
    const p = this.plot;
    const cfg = sim.config;
    const sc = sim.scenario;
    const cx = this.px(0);
    const cy = this.py(0);
    const sx = (p.w / 2) / this.rangeT;
    const sy = (p.h / 2) / this.rangeR;
    const kk = (cfg.hardBodyM * cfg.hardBodyM) / (2 * cfg.sigmaR * cfg.sigmaT);
    const dStar = Math.sqrt(Math.max(0, 2 * Math.log(kk / cfg.pcThreshold)));
    const ex = cfg.sigmaT * dStar * sx;
    const ey = cfg.sigmaR * dStar * sy;
    // Everything but the two position markers is static for the run: cached.
    this.plotL.blit({ x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 }, `${cfg.sigmaT}:${cfg.pcThreshold}`, () => {
      const ctx = c.ctx;
      c.panel(p, 12, pal.bg0);
      ctx.save();
      pathRoundRect(ctx, p, 12);
      ctx.clip();
      // Faint radial glow of the "radar" behind the plot.
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(p.w, p.h) * 0.6);
      glow.addColorStop(0, withAlpha(pal.accent, 0.1));
      glow.addColorStop(1, withAlpha(pal.accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Faint guides (σ steps), not a heavy lattice.
      ctx.strokeStyle = 'rgba(150, 205, 228, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let m = -1500; m <= 1500; m += 500) {
        const x = Math.round(this.px(m * (cfg.sigmaT / 500))) + 0.5;
        ctx.moveTo(x, p.y);
        ctx.lineTo(x, p.y + p.h);
      }
      for (let m = -400; m <= 400; m += 200) {
        const y = Math.round(this.py(m * (cfg.sigmaR / 100))) + 0.5;
        ctx.moveTo(p.x, y);
        ctx.lineTo(p.x + p.w, y);
      }
      ctx.stroke();
      // Debris track through the encounter point (relative motion), decorative.
      ctx.strokeStyle = withAlpha(pal.dim, 0.35);
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + p.h * 0.9);
      ctx.lineTo(p.x + p.w, p.y + p.h * 0.1);
      ctx.stroke();
      ctx.setLineDash([]);
      // Uncertainty ellipses 1σ, 2σ, 3σ.
      ctx.strokeStyle = withAlpha(pal.dim, 0.55);
      for (const k of [1, 2, 3]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, cfg.sigmaT * k * sx, cfg.sigmaR * k * sy, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Keep-out zone: where Pc ≥ threshold (Mahalanobis radius d*), hatched with a double edge.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, ex, ey, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(pal.bad, 0.1);
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = withAlpha(pal.bad, 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = cx - ex - ey * 2; x < cx + ex + ey * 2; x += 9) {
        ctx.moveTo(x, cy + ey);
        ctx.lineTo(x + ey * 2, cy - ey);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = pal.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ex, ey, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, ex - 4), Math.max(1, ey - 4), 0, 0, Math.PI * 2);
      ctx.stroke();
      // Debris: a small irregular fragment with a lit edge at the centre.
      ctx.fillStyle = '#8e9aa6';
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 2);
      ctx.lineTo(cx - 1, cy - 7);
      ctx.lineTo(cx + 7, cy - 3);
      ctx.lineTo(cx + 5, cy + 5);
      ctx.lineTo(cx - 3, cy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.sun;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 2);
      ctx.lineTo(cx - 1, cy - 7);
      ctx.lineTo(cx + 7, cy - 3);
      ctx.stroke();
      if (!opts.compact) {
        const lp = c.px(10, 1.3);
        c.text(t('minigame.MG-14.plot.along'), p.x + p.w - 8, p.y + p.h - lp, p.w * 0.6, lp, 700, pal.faint, 'right');
        c.text(t('minigame.MG-14.plot.radial'), p.x + 8, p.y + lp + 2, p.w * 0.5, lp, 700, pal.faint, 'left');
        c.text(`± ${fmt(this.rangeT, 0)} m`, p.x + 8, p.y + p.h - lp, p.w * 0.35, lp, 600, pal.faint, 'left', true);
        c.text(t('minigame.MG-14.plot.keepout'), cx, cy + ey + lp + 4, p.w * 0.6, lp, 800, pal.bad, 'center');
      }
      ctx.restore();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(150, 205, 228, 0.22)';
      pathRoundRect(ctx, p, 12);
      ctx.stroke();
    });
    // Own predicted position: without a burn (hollow) and with the selected / committed burn.
    const ctx = c.ctx;
    const nx = this.px(sc.y0);
    const ny = this.py(sc.x0);
    const bx = this.px(clamp(sel.y, -this.rangeT * 1.02, this.rangeT * 1.02));
    const by = this.py(clamp(sel.x, -this.rangeR * 1.02, this.rangeR * 1.02));
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(nx, ny, 6, 0, Math.PI * 2);
    ctx.stroke();
    const col = sel.clears ? pal.good : pal.bad;
    if (Math.hypot(bx - nx, by - ny) > 8) {
      ctx.strokeStyle = withAlpha(col, 0.9);
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = withAlpha(col, 0.25);
    ctx.beginPath();
    ctx.arc(bx, by, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ───────────── probability gauge ─────────────

  private drawGauge(pc: number) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    const g = this.gauge;
    const thr = sim.config.pcThreshold;
    const lo = -7;
    const hi = -1;
    const pad = opts.compact ? 0 : 10;
    const labelH = opts.compact ? 0 : c.px(10.5, 1.3) + 6;
    if (!opts.compact) c.panel(g, 10);
    const bar: Rect = { x: g.x + pad, y: g.y + labelH + (opts.compact ? 3 : 8), w: g.w - pad * 2, h: opts.compact ? 10 : Math.max(10, g.h - labelH - 24) };
    const fx = (p: number) => {
      const f = (Math.log10(Math.max(1e-12, p)) - lo) / (hi - lo);
      return c.rtl ? bar.x + bar.w * (1 - clamp(f, 0, 1)) : bar.x + bar.w * clamp(f, 0, 1);
    };
    const tx = fx(thr);
    // Safe side (solid track), danger side (hatched).
    ctx.fillStyle = withAlpha(pal.good, 0.22);
    ctx.fillRect(Math.min(bar.x, tx), bar.y, Math.abs(tx - (c.rtl ? bar.x + bar.w : bar.x)), bar.h);
    ctx.save();
    const dx0 = c.rtl ? bar.x : tx;
    const dw = c.rtl ? tx - bar.x : bar.x + bar.w - tx;
    ctx.beginPath();
    ctx.rect(dx0, bar.y, dw, bar.h);
    ctx.fillStyle = withAlpha(pal.bad, 0.2);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = withAlpha(pal.bad, 0.5);
    ctx.beginPath();
    for (let x = dx0 - bar.h; x < dx0 + dw + bar.h; x += 7) {
      ctx.moveTo(x, bar.y + bar.h);
      ctx.lineTo(x + bar.h, bar.y);
    }
    ctx.stroke();
    ctx.restore();
    // Threshold line.
    ctx.fillStyle = pal.text;
    ctx.fillRect(Math.round(tx) - 1, bar.y - 4, 2, bar.h + 8);
    // Value marker.
    const vx = fx(pc);
    const ok = pc < thr;
    const s: Status = ok ? 'good' : 'bad';
    ctx.fillStyle = c.statusColor(s);
    ctx.beginPath();
    ctx.moveTo(vx, bar.y + bar.h + 1);
    ctx.lineTo(vx - 7, bar.y + bar.h + 11);
    ctx.lineTo(vx + 7, bar.y + bar.h + 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(vx - 1.5, bar.y - 2, 3, bar.h + 4);
    if (!opts.compact) {
      const lp = c.px(10.5, 1.3);
      const label = `${t('minigame.MG-14.gauge.title')} · ${t('minigame.MG-14.gauge.threshold', { p: fmtPc(thr) })}`;
      c.text(label, c.rtl ? g.x + g.w - 10 : g.x + 10, g.y + 8 + lp * 0.5, g.w - 20, lp, 700, pal.dim, c.rtl ? 'right' : 'left');
      const sp = c.px(9.5, 1.2);
      c.text(fmtPc(1e-7), c.rtl ? bar.x + bar.w : bar.x, bar.y + bar.h + 6 + sp * 0.5, 60, sp, 600, pal.faint, c.rtl ? 'right' : 'left', true);
      c.text(fmtPc(0.1), c.rtl ? bar.x : bar.x + bar.w, bar.y + bar.h + 6 + sp * 0.5, 60, sp, 600, pal.faint, c.rtl ? 'left' : 'right', true);
    }
  }

  // ───────────── controls ─────────────

  private button(r: Rect, label: string, state: 'idle' | 'selected' | 'primary' | 'disabled', hit: Hit | null) {
    const { c } = this;
    const { ctx, pal } = c;
    pathRoundRect(ctx, r, 10);
    ctx.fillStyle = state === 'primary' ? pal.accent : state === 'selected' ? withAlpha(pal.accent, 0.22) : pal.bg2;
    ctx.fill();
    ctx.lineWidth = state === 'selected' ? 2.5 : 1;
    ctx.strokeStyle = state === 'selected' || state === 'primary' ? pal.accentStrong : pal.lineStrong;
    ctx.stroke();
    if (label) c.text(label, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 12, c.px(14, 1.35), 800, state === 'primary' ? pal.ink : state === 'disabled' ? pal.faint : pal.text, 'center');
    if (hit) this.hits.push({ r, hit });
  }

  private drawControls(f: Mg14Frame) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    const cr = this.controls;
    const cfg = sim.config;
    const sel = sim.selection;
    if (sim.burn) {
      this.drawOutcome();
      return;
    }
    const btnH = Math.round(56 * Math.min(c.u, 1.3));
    if (cfg.shortList) {
      const rowH = Math.round(46 * Math.min(c.u, 1.3));
      const list = sim.scenario.shortList;
      for (let i = 0; i < list.length; i++) {
        const o = list[i]!;
        const r: Rect = { x: cr.x, y: cr.y + i * (rowH + 6), w: cr.w, h: rowH };
        const on = sim.row === i;
        pathRoundRect(ctx, r, 10);
        ctx.fillStyle = on ? withAlpha(pal.accent, cfg.oneButton ? 0.3 : 0.2) : pal.bg2;
        ctx.fill();
        ctx.lineWidth = on ? 3 : 1;
        ctx.strokeStyle = on ? pal.accentStrong : pal.lineStrong;
        ctx.stroke();
        const ix = c.rtl ? r.x + r.w - 26 : r.x + 26;
        arrow(ctx, o.dir, ix, r.y + r.h / 2, Math.min(28, rowH * 0.6), on ? pal.accentStrong : pal.text);
        const name = `${t(`minigame.MG-14.dir.${o.dir}`)} · ${fmt(o.durS, 1, 1)} s`;
        const dv = `${fmt(o.dvMs, 2, 2)} m/s`;
        const lx = c.rtl ? r.x + r.w - 50 : r.x + 50;
        c.text(name, lx, r.y + r.h * 0.36, r.w * 0.5, c.px(13.5, 1.3), 800, pal.text, c.rtl ? 'right' : 'left');
        c.text(`Δv ${dv}`, lx, r.y + r.h * 0.72, r.w * 0.5, c.px(11.5, 1.3), 700, pal.dim, c.rtl ? 'right' : 'left', true);
        const st: Status = o.clears ? 'good' : 'bad';
        const pcx = c.rtl ? r.x + 40 : r.x + r.w - 40;
        c.text(fmtPc(o.pc), c.rtl ? r.x + 64 : r.x + r.w - 64, r.y + r.h / 2 + 1, r.w * 0.3, c.px(12, 1.3), 700, c.statusColor(st), c.rtl ? 'left' : 'right', true);
        c.statusIcon(st, pcx + (c.rtl ? -12 : 12), r.y + r.h / 2, Math.min(22, rowH * 0.45));
        if (!cfg.oneButton) this.hits.push({ r, hit: { kind: 'row', index: i } });
      }
      if (!cfg.oneButton) {
        const br: Rect = { x: cr.x, y: cr.y + list.length * (rowH + 6) + 2, w: cr.w, h: btnH };
        this.button(br, t('minigame.MG-14.burn', { s: fmt(sel.durS, 1, 1), dv: fmt(sel.dvMs, 2, 2) }), 'primary', { kind: 'burn' });
      }
      return;
    }
    // Full menu: direction buttons, duration slider, burn button.
    const u = Math.min(c.u, 1.3);
    const dirH = Math.round(70 * u);
    const gap = 8;
    const bw = (cr.w - gap * 3) / 4;
    for (let i = 0; i < DIRS.length; i++) {
      const d = DIRS[c.rtl ? DIRS.length - 1 - i : i]!;
      const r: Rect = { x: cr.x + i * (bw + gap), y: cr.y, w: bw, h: dirH };
      const on = sim.dir === d;
      this.button(r, '', on ? 'selected' : 'idle', { kind: 'dir', dir: d });
      arrow(ctx, d, r.x + r.w / 2, r.y + r.h * 0.36, Math.min(30, r.h * 0.42), on ? pal.accentStrong : pal.text);
      c.text(t(`minigame.MG-14.dir.${d}`), r.x + r.w / 2, r.y + r.h * 0.78, r.w - 6, c.px(11, 1.25), 800, on ? pal.text : pal.dim, 'center');
    }
    // Duration: − [track] +
    const sy = cr.y + dirH + 10;
    const sh = Math.round(64 * u);
    const sq = Math.max(48, Math.round(52 * u));
    const minus: Rect = { x: cr.x, y: sy + (sh - sq) / 2, w: sq, h: sq };
    const plus: Rect = { x: cr.x + cr.w - sq, y: sy + (sh - sq) / 2, w: sq, h: sq };
    this.button(c.rtl ? plus : minus, '−', 'idle', { kind: 'dur', delta: -1 });
    this.button(c.rtl ? minus : plus, '+', 'idle', { kind: 'dur', delta: 1 });
    const track: Rect = { x: minus.x + sq + 10, y: sy, w: cr.w - sq * 2 - 20, h: sh };
    this.slider = track;
    const label = `${fmt(sel.durS, 1, 1)} s · Δv ${fmt(sel.dvMs, 2, 2)} m/s`;
    c.text(label, track.x + track.w / 2, track.y + c.px(13, 1.3) * 0.7, track.w, c.px(14, 1.3), 800, pal.text, 'center', true);
    const ty = track.y + track.h * 0.68;
    ctx.fillStyle = pal.bg0;
    pathRoundRect(ctx, { x: track.x, y: ty - 4, w: track.w, h: 8 }, 4);
    ctx.fill();
    const n = DURATIONS_S.length;
    for (let i = 0; i < n; i++) {
      const x = c.rtl ? track.x + track.w - (i / (n - 1)) * track.w : track.x + (i / (n - 1)) * track.w;
      ctx.fillStyle = i <= sim.durIndex ? pal.accent : pal.lineStrong;
      ctx.fillRect(Math.round(x) - 1, ty - (i % 2 ? 4 : 7), 2, i % 2 ? 8 : 14);
    }
    const kx = c.rtl ? track.x + track.w - (sim.durIndex / (n - 1)) * track.w : track.x + (sim.durIndex / (n - 1)) * track.w;
    ctx.fillStyle = f.active ? pal.accentStrong : pal.ceramic;
    ctx.beginPath();
    ctx.arc(kx, ty, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.stroke();
    this.hits.push({ r: track, hit: { kind: 'durAt', index: sim.durIndex } });
    const br: Rect = { x: cr.x, y: sy + sh + 10, w: cr.w, h: btnH };
    this.button(br, t('minigame.MG-14.burn', { s: fmt(sel.durS, 1, 1), dv: fmt(sel.dvMs, 2, 2) }), 'primary', { kind: 'burn' });
  }

  /** Index of the duration under a slider x position. */
  durationAt(x: number): number {
    const tr = this.slider;
    const f = clamp((x - tr.x) / Math.max(1, tr.w), 0, 1);
    return Math.round((this.c.rtl ? 1 - f : f) * (DURATIONS_S.length - 1));
  }

  private drawOutcome() {
    const { c, sim, opts } = this;
    const { pal } = c;
    const t = opts.t;
    const b = sim.burn!;
    const cr = this.controls;
    const s = sim.score();
    const dvMin = sim.scenario.dvMin;
    const rows: Array<[string, string, string]> = [
      [t('minigame.MG-14.out.used'), fmt(b.dvMs, 2, 2), 'm/s'],
      [t('minigame.MG-14.out.min'), fmt(dvMin, 2, 2), 'm/s'],
      [t('minigame.MG-14.out.wasted'), fmt(Math.max(0, b.dvMs - dvMin), 2, 2), 'm/s'],
      [t('minigame.MG-14.out.miss'), fmt(Math.hypot(b.x, b.y), 0), 'm'],
    ];
    const rh = Math.min(64, (cr.h - 8) / 2);
    const gap = 8;
    const w = (cr.w - gap) / 2;
    rows.forEach(([label, num, unit], i) => {
      const r: Rect = { x: cr.x + (i % 2) * (w + gap), y: cr.y + Math.floor(i / 2) * (rh + gap), w, h: rh };
      const wasted = i === 2 && b.dvMs > dvMin + 1e-9;
      const st: Status | undefined = i === 0 ? (s.success ? 'good' : 'bad') : wasted ? (s.success ? 'warn' : 'bad') : undefined;
      c.readout(r, label, num, unit, st ? c.statusColor(st) : pal.text, st);
    });
  }

  // ───────────── frame ─────────────

  draw(f: Mg14Frame) {
    const { c, sim, opts } = this;
    const { pal } = c;
    const t = opts.t;
    const sel = sim.burn ?? sim.selection;
    // Render on change: the planner only changes on input, the TCA minute and the intro hint.
    const frameKey = `${sel.dir}|${sel.durS}|${sim.burn ? 1 : 0}|${sim.row}|${Math.round(sim.tcaMin)}|${f.active}|${f.pausedText ?? ''}|${sim.step < 120}|${f.finger ? Math.round(f.finger.x) : ''}`;
    if (frameKey === this.lastKey && !opts.compact) return;
    this.lastKey = frameKey;
    this.hits.length = 0;
    c.begin();
    this.drawPlot(sel);
    this.drawGauge(sel.pc);
    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }
    this.drawControls(f);

    // Readouts.
    const gap = 8;
    const tw = (this.hud.w - gap) / 2;
    const a: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
    const b: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
    const [first, second] = c.rtl ? [b, a] : [a, b];
    c.readout(first, t('minigame.MG-14.hud.tca'), fmt(sim.tcaMin, 0), 'min', pal.text);
    const ok = sel.pc < sim.config.pcThreshold;
    c.readout(second, t('minigame.MG-14.hud.pc'), fmtPc(sel.pc), '', ok ? pal.good : pal.bad, ok ? 'good' : 'bad');

    // Status strip.
    let s: Status | 'info';
    let key: string;
    let args: Record<string, string | number> | undefined;
    if (sim.burn) {
      const sc = sim.score();
      s = sc.success ? 'good' : 'bad';
      key = !sim.burn.clears ? 'minigame.MG-14.status.unsafe' : sc.success ? 'minigame.MG-14.status.safe' : 'minigame.MG-14.status.overburn';
      args = { m: fmt(Math.hypot(sim.burn.x, sim.burn.y), 0) };
    } else if (sim.step < 1.0 * 120 && !f.active) {
      s = 'info';
      key = 'minigame.MG-14.status.pick';
    } else {
      s = sel.clears ? 'good' : 'bad';
      key = sel.clears ? 'minigame.MG-14.status.clears' : 'minigame.MG-14.status.above';
    }
    const label = t(key, args);
    if (s === 'info') {
      c.infoStrip(this.strip, label);
    } else c.statusStrip(this.strip, s, label);

    const hintKey = sim.burn ? 'minigame.MG-14.hint.done' : sim.config.oneButton ? 'minigame.MG-14.hint.press' : sim.config.shortList ? 'minigame.MG-14.hint.list' : 'minigame.MG-14.hint.menu';
    c.hint(this.hintR, t(hintKey), f.active);
    if (f.pausedText) c.overlay(f.pausedText);
  }
}
