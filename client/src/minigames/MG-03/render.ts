// MG-03 drawing: a radiograph of three tank weld seams on a light box. The base film shows
// grain, weld beads with ripples, lead seam letters, a millimetre ruler and a wire
// penetrameter; defects are almost invisible on it. The scanning lens shows a contrast-
// enhanced copy (false-colour, like an inspection viewer) where voids and cracks stand out.
import { Canvas2D, clamp, KeyedLayer, mulberry32, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-02/kit';
import { BEAD_HALF, FILM_H, SEAMS_Y, type Defect, type Mg03Sim } from './model';

export interface Mg03ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export interface Mg03DrawState {
  timeMs: number;
  active?: boolean;
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

const K = 'minigame.MG-03.';
const LETTERS = ['A', 'B', 'C'];

export class Mg03View {
  readonly c: Canvas2D;
  private sim: Mg03Sim;
  private readonly o: Mg03ViewOptions;
  private hud: Rect[] = [];
  private box!: Rect;
  film!: Rect;
  private hintR: Rect | null = null;
  private base: HTMLCanvasElement | null = null;
  private enhanced: HTMLCanvasElement | null = null;
  private filmKey = '';
  private hudLayer: KeyedLayer;
  private boxLayer: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg03Sim, o: Mg03ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.hudLayer = new KeyedLayer(this.c);
    this.boxLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg03Sim) {
    this.sim = sim;
    this.filmKey = '';
    this.layout();
  }

  resize() {
    this.c.measure();
    this.filmKey = '';
    this.layout();
  }

  private legend: Rect | null = null;
  private legendLayer: KeyedLayer | null = null;

  /** Legend card: a sample crack and a sample pore cluster as they look on the film. */
  private drawLegend() {
    const r = this.legend;
    if (!r) return;
    const c = this.c;
    const { pal } = c;
    const t = this.o.t;
    c.glass(r, 16);
    const ctx = c.ctx;
    const lp = c.px(12, 1.3);
    c.text(t(K + 'legend.title'), c.rtl ? r.x + r.w - 14 : r.x + 14, r.y + 12 + lp * 0.5, r.w - 28, lp, 600, pal.dim, c.rtl ? 'right' : 'left');
    const half = (r.w - 28) / 2;
    const sampleS = Math.min(r.h - lp - 30, 44);
    for (let i = 0; i < 2; i++) {
      const cellX = c.rtl ? r.x + r.w - 14 - (i + 1) * half : r.x + 14 + i * half;
      const sy = r.y + lp + 22;
      const sx = c.rtl ? cellX + half - sampleS : cellX;
      // A swatch of film with the defect drawn on a weld bead.
      ctx.save();
      pathRoundRect(ctx, { x: sx, y: sy, w: sampleS, h: sampleS }, 8);
      ctx.clip();
      const g = ctx.createLinearGradient(0, sy, 0, sy + sampleS);
      g.addColorStop(0, '#2a3a46');
      g.addColorStop(0.5, '#5f7381');
      g.addColorStop(1, '#2a3a46');
      ctx.fillStyle = g;
      ctx.fillRect(sx, sy, sampleS, sampleS);
      ctx.strokeStyle = 'rgba(10, 16, 22, 0.85)';
      ctx.fillStyle = 'rgba(10, 16, 22, 0.85)';
      const mx = sx + sampleS / 2;
      const my = sy + sampleS / 2;
      if (i === 0) {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(mx - sampleS * 0.32, my + 3);
        ctx.lineTo(mx - sampleS * 0.1, my - 2);
        ctx.lineTo(mx + 0.05 * sampleS, my + 2);
        ctx.lineTo(mx + sampleS * 0.3, my - 3);
        ctx.stroke();
      } else {
        for (const [dx, dy, rr] of [[-0.18, -0.06, 2.4], [0.02, 0.08, 1.8], [0.15, -0.1, 2.1], [-0.04, -0.14, 1.5], [0.2, 0.1, 1.4]] as const) {
          ctx.beginPath();
          ctx.arc(mx + dx * sampleS, my + dy * sampleS, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(150, 205, 228, 0.3)';
      ctx.lineWidth = 1;
      pathRoundRect(ctx, { x: sx, y: sy, w: sampleS, h: sampleS }, 8);
      ctx.stroke();
      const tx = c.rtl ? sx - 10 : sx + sampleS + 10;
      const tw = half - sampleS - 18;
      c.text(t(i === 0 ? K + 'legend.crack' : K + 'legend.porosity'), tx, sy + sampleS * 0.3, tw, c.px(14, 1.3), 600, pal.text, c.rtl ? 'right' : 'left');
      c.text(t(i === 0 ? K + 'legend.crack_hint' : K + 'legend.porosity_hint'), tx, sy + sampleS * 0.72, tw, c.px(12, 1.3), 500, pal.dim, c.rtl ? 'right' : 'left');
    }
  }

  private layout() {
    const { W, H } = this.c;
    const c = this.c;
    const compact = this.o.compact;
    const pad = compact ? 6 : 14;
    const s = Math.min(c.u, 1.3);
    let y = pad;
    if (!compact) {
      const readH = Math.round(70 * s);
      const gap = 8;
      const rw = (W - pad * 2 - gap * 2) / 3;
      this.hud = [0, 1, 2].map((i) => ({ x: pad + i * (rw + gap), y, w: rw, h: readH }));
      if (c.rtl) this.hud.reverse();
      y += readH + 10;
    } else this.hud = [];
    const hintH = compact ? 0 : Math.round(30 * s);
    this.hintR = compact ? null : { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
    this.box = { x: pad, y, w: W - pad * 2, h: H - pad - hintH - (compact ? 0 : 8) - y };
    const inset = compact ? 6 : 12;
    if (compact) {
      // The demo shows a horizontal strip of the film (seam A and B) filling the stage.
      const fw = this.box.w - inset * 2;
      this.film = { x: this.box.x + inset, y: this.box.y + inset, w: fw, h: fw * FILM_H };
    } else {
      const aw = this.box.w - inset * 2;
      const ah = this.box.h - inset * 2;
      const fw = Math.min(aw, ah / FILM_H);
      const fh = fw * FILM_H;
      // The light box hugs the film under the read-outs; the spare height below holds a small
      // legend card (what a crack and porosity look like) instead of empty backdrop.
      const spare = this.box.h - fh - inset * 2;
      const legendH = Math.round(Math.min(96 * s, spare - 10));
      const showLegend = legendH >= 64;
      const top = showLegend ? this.box.y + Math.max(0, (spare - legendH - 10) / 2) : this.box.y + spare / 2;
      const full = { ...this.box };
      this.box = { x: this.box.x + (this.box.w - fw - inset * 2) / 2, y: top, w: fw + inset * 2, h: fh + inset * 2 };
      this.film = { x: this.box.x + inset, y: top + inset, w: fw, h: fh };
      this.legend = showLegend ? { x: full.x, y: this.box.y + this.box.h + 10, w: full.w, h: legendH } : null;
    }
  }

  /** Film units → CSS px. */
  px(x: number): number {
    return this.film.x + x * this.film.w;
  }
  py(y: number): number {
    return this.film.y + y * this.film.w;
  }
  /** CSS px → film units. */
  toFilm(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.film.x) / this.film.w, y: (y - this.film.y) / this.film.w };
  }
  /** Lens offset above the finger while dragging, CSS px. */
  get lensOffsetPx(): number {
    return this.o.compact ? 0 : Math.max(64, this.film.w * 0.2);
  }

  private ensureFilm() {
    const c = this.c;
    const key = `${this.film.w}x${this.film.h}@${c.dpr}|${this.sim.defects.length}|${this.sim.defects[0]?.x}`;
    if (key === this.filmKey && this.base && this.enhanced) return;
    this.filmKey = key;
    this.base = this.paintFilm(false);
    this.enhanced = this.paintFilm(true);
  }

  /** Paints the whole film (base or enhanced) into an offscreen canvas. */
  private paintFilm(enh: boolean): HTMLCanvasElement {
    const c = this.c;
    const f = this.film;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(f.w * c.dpr));
    cv.height = Math.max(1, Math.round(f.h * c.dpr));
    const g = cv.getContext('2d');
    if (!g) return cv;
    const S = f.w; // px per film unit
    g.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    // Backlit film: a soft centre, darker edges.
    const bg = g.createRadialGradient(f.w * 0.5, f.h * 0.45, f.w * 0.1, f.w * 0.5, f.h * 0.5, f.h * 0.75);
    bg.addColorStop(0, enh ? '#0f3b44' : '#3d5563');
    bg.addColorStop(1, enh ? '#061a20' : '#16262f');
    g.fillStyle = bg;
    g.fillRect(0, 0, f.w, f.h);
    // Grain (fixed seed, fewer and calmer in the enhanced view).
    const rnd = mulberry32(3030);
    const grains = enh ? 500 : 1800;
    for (let i = 0; i < grains; i++) {
      const x = rnd() * f.w;
      const y = rnd() * f.h;
      const light = rnd() < 0.5;
      g.fillStyle = light ? `rgba(220, 235, 240, ${0.03 + rnd() * 0.06})` : `rgba(0, 0, 0, ${0.05 + rnd() * 0.08})`;
      g.fillRect(x, y, 1 + rnd(), 1 + rnd());
    }
    // Weld seams: denser metal reads lighter on a radiograph.
    for (let i = 0; i < SEAMS_Y.length; i++) {
      const yc = SEAMS_Y[i]! * S;
      const hh = BEAD_HALF * S;
      const haz = g.createLinearGradient(0, yc - hh * 2.4, 0, yc + hh * 2.4);
      haz.addColorStop(0, 'rgba(200, 220, 228, 0)');
      haz.addColorStop(0.5, enh ? 'rgba(120, 230, 230, 0.12)' : 'rgba(200, 220, 228, 0.08)');
      haz.addColorStop(1, 'rgba(200, 220, 228, 0)');
      g.fillStyle = haz;
      g.fillRect(0, yc - hh * 2.4, f.w, hh * 4.8);
      const bead = g.createLinearGradient(0, yc - hh, 0, yc + hh);
      bead.addColorStop(0, enh ? 'rgba(120, 230, 230, 0.15)' : 'rgba(205, 222, 230, 0.1)');
      bead.addColorStop(0.5, enh ? 'rgba(170, 245, 240, 0.55)' : 'rgba(215, 230, 236, 0.42)');
      bead.addColorStop(1, enh ? 'rgba(120, 230, 230, 0.15)' : 'rgba(205, 222, 230, 0.1)');
      g.fillStyle = bead;
      g.fillRect(0, yc - hh, f.w, hh * 2);
      // Bead ripples: shallow arcs every ~1.8 % of the width.
      g.strokeStyle = enh ? 'rgba(200, 255, 250, 0.22)' : 'rgba(235, 245, 248, 0.14)';
      g.lineWidth = 1;
      for (let x = 0; x < f.w + 6; x += S * 0.018) {
        g.beginPath();
        g.moveTo(x, yc - hh * 0.85);
        g.quadraticCurveTo(x + S * 0.012, yc, x, yc + hh * 0.85);
        g.stroke();
      }
      // Toe lines (bead edges) slightly darker.
      g.fillStyle = 'rgba(0, 0, 0, 0.22)';
      g.fillRect(0, yc - hh - 1, f.w, 1);
      g.fillRect(0, yc + hh, f.w, 1);
      // Lead seam letter (bright: lead blocks the X-rays).
      g.font = `700 ${Math.max(10, S * 0.045)}px ${c.pal.fontUi}`;
      g.fillStyle = enh ? 'rgba(230, 255, 252, 0.9)' : 'rgba(240, 246, 248, 0.85)';
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillText(LETTERS[i]!, S * 0.02, yc - hh * 2.2);
    }
    // Millimetre ruler along the top (film width = 400 mm, game value).
    g.fillStyle = 'rgba(240, 246, 248, 0.7)';
    for (let k = 0; k <= 40; k++) {
      const x = (k / 40) * f.w;
      g.fillRect(x, 0, 1, k % 10 === 0 ? S * 0.03 : k % 5 === 0 ? S * 0.02 : S * 0.01);
    }
    g.font = `600 ${Math.max(8, S * 0.026)}px ${c.pal.fontUi}`;
    g.textBaseline = 'top';
    for (const mm of [100, 200, 300]) {
      g.textAlign = 'center';
      g.fillText(`${mm} mm`, (mm / 400) * f.w, S * 0.034);
    }
    // Wire penetrameter (image quality indicator): six wires of decreasing thickness.
    const qx = f.w * 0.72;
    const qy = f.h - S * 0.07;
    g.fillStyle = 'rgba(240, 246, 248, 0.08)';
    g.fillRect(qx - 4, qy - S * 0.035, S * 0.22, S * 0.07);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(240, 246, 248, ${0.75 - k * 0.09})`;
      g.fillRect(qx + k * S * 0.034, qy - S * 0.028, Math.max(0.6, 2.4 - k * 0.35), S * 0.056);
    }
    // Defects: voids and cracks transmit more X-rays, so they read darker.
    for (const d of this.sim.defects) this.paintDefect(g, d, S, enh ? 1 : 0.11, enh);
    return cv;
  }

  private paintDefect(g: CanvasRenderingContext2D, d: Defect, S: number, alpha: number, enh: boolean) {
    const x = d.x * S;
    const y = d.y * S;
    if (d.kind === 'porosity') {
      for (let i = 0; i < d.pores.length; i += 3) {
        const px = x + d.pores[i]! * S * d.size;
        const py = y + d.pores[i + 1]! * S * d.size;
        const r = d.pores[i + 2]! * S * d.size;
        g.fillStyle = enh ? `rgba(2, 10, 14, ${alpha})` : `rgba(4, 10, 14, ${alpha})`;
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
        if (enh) {
          g.strokeStyle = 'rgba(255, 206, 131, 0.85)';
          g.lineWidth = 1;
          g.stroke();
        }
      }
    } else {
      const hx = Math.cos(d.angle) * d.halfLen * S * d.size;
      const hy = Math.sin(d.angle) * d.halfLen * S * d.size;
      const rnd = mulberry32(Math.round(d.x * 1e6));
      g.strokeStyle = enh ? `rgba(2, 10, 14, ${alpha})` : `rgba(4, 10, 14, ${alpha})`;
      g.lineWidth = enh ? 2 : 1.4;
      g.lineJoin = 'round';
      g.beginPath();
      const n = 9;
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const jx = (rnd() - 0.5) * S * 0.008;
        const jy = (rnd() - 0.5) * S * 0.008;
        const px = x - hx + 2 * hx * u + jx;
        const py = y - hy + 2 * hy * u + jy;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      if (enh) {
        g.strokeStyle = 'rgba(255, 206, 131, 0.7)';
        g.lineWidth = 0.8;
        g.stroke();
      }
    }
  }

  draw(st: Mg03DrawState) {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    c.begin();
    c.backdrop(0.7);
    this.ensureFilm();
    if (!this.o.compact) this.drawHud();
    if (!this.o.compact && this.legend) {
      const lg = this.legend;
      this.legendLayer ??= new KeyedLayer(this.c);
      this.legendLayer.blit({ x: lg.x - 4, y: lg.y - 4, w: lg.w + 8, h: lg.h + 20 }, `${lg.x},${lg.y},${lg.w},${lg.h}`, () => this.drawLegend());
    }
    const b = this.box;
    // Light box frame (static).
    this.boxLayer.blit({ x: b.x - 6, y: b.y - 4, w: b.w + 12, h: b.h + 26 }, `${b.w}x${b.h}@${b.x},${b.y}|${this.film.w}`, () => {
      c.glass(b, 16, true);
      const g = c.ctx;
      // Backlight bleeding around the film edge.
      const f = this.film;
      g.save();
      g.shadowColor = 'rgba(220, 240, 255, 0.35)';
      g.shadowBlur = 16;
      g.fillStyle = '#dde8ee';
      g.fillRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4);
      g.restore();
      // Film clips.
      g.fillStyle = '#c3ccd3';
      for (const x of [f.x + f.w * 0.25, f.x + f.w * 0.75]) {
        pathRoundRect(g, { x: x - 14, y: f.y - 8, w: 28, h: 12 }, 3);
        g.fill();
      }
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    const f = this.film;
    if (this.base) ctx.drawImage(this.base, f.x, f.y, f.w, f.h);
    // Found defects stay revealed.
    for (let i = 0; i < sim.defects.length; i++) if (sim.found[i]) this.reveal(sim.defects[i]!, 'good');
    if (sim.done && !this.o.compact) for (let i = 0; i < sim.defects.length; i++) if (!sim.found[i]) this.reveal(sim.defects[i]!, 'warn');
    for (const m of sim.marks) if (m.hit < 0) this.falseMark(m.x, m.y);
    if (!sim.done || this.o.compact) this.drawLens(!!st.active);
    ctx.restore();
    if (this.hintR) c.hint(this.hintR, this.o.t(sim.config.oneButton ? K + 'hint.one' : K + 'hint.sweep'), !!st.active);
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private reveal(d: Defect, s: Status) {
    const c = this.c;
    const ctx = c.ctx;
    const cx = this.px(d.x);
    const cy = this.py(d.y);
    const r = Math.max(14, this.sim.config.hitR * this.film.w * 1.05);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (this.enhanced) ctx.drawImage(this.enhanced, this.film.x, this.film.y, this.film.w, this.film.h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = c.statusColor(s);
    ctx.lineWidth = 2.5;
    if (s === 'warn') ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const is = this.o.compact ? 12 : 18;
    c.statusIcon(s, cx + r * 0.72, cy - r * 0.72, is);
  }

  private falseMark(x: number, y: number) {
    const c = this.c;
    const ctx = c.ctx;
    const cx = this.px(x);
    const cy = this.py(y);
    ctx.strokeStyle = c.pal.bad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.stroke();
    c.statusIcon('bad', cx, cy, 13);
  }

  private drawLens(active: boolean) {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    const cx = this.px(sim.lensX);
    const cy = this.py(sim.lensY);
    const r = sim.config.lensR * this.film.w;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (this.enhanced) ctx.drawImage(this.enhanced, this.film.x, this.film.y, this.film.w, this.film.h);
    // Glass sheen.
    const sh = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    sh.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    sh.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    // Rim: brushed silver ring, teal ticks, crosshair with an open centre.
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#aab6be';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = active ? c.pal.accentStrong : c.pal.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(c.pal.accentStrong, 0.8);
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.moveTo(cx + dx * r * 0.25, cy + dy * r * 0.25);
      ctx.lineTo(cx + dx * r * 0.6, cy + dy * r * 0.6);
    }
    ctx.stroke();
    ctx.fillStyle = c.pal.accent;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r + 2.5), cy + Math.sin(a) * (r + 2.5), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHud() {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const total = sim.defects.length;
    const need = Math.ceil(sim.config.foundMin * total - 1e-9);
    const found = sim.foundCount;
    const left = Math.ceil(sim.leftS);
    const key = `${found}|${sim.falseAlarms}|${left}|${c.W}`;
    const r0 = this.hud[0]!;
    this.hudLayer.blit({ x: 0, y: r0.y - 6, w: c.W, h: r0.h + 26 }, key, () => {
      const fs: Status = found >= need ? 'good' : 'warn';
      c.readout(this.hud[0]!, t(K + 'hud.found', { n: need }), `${found}/${total}`, t(K + 'unit.defects'), found >= need ? c.pal.good : c.pal.text, fs);
      const as: Status = sim.falseAlarms > sim.config.falseMax ? 'bad' : sim.falseAlarms === sim.config.falseMax && sim.falseAlarms > 0 ? 'warn' : 'good';
      c.readout(this.hud[1]!, t(K + 'hud.false', { n: sim.config.falseMax }), String(sim.falseAlarms), t(K + 'unit.marks'), sim.falseAlarms > sim.config.falseMax ? c.pal.bad : c.pal.text, as);
      c.readout(this.hud[2]!, t(K + 'hud.left'), String(left), 's', left <= 5 && !sim.done ? c.pal.sun : c.pal.text);
    });
  }

  /** Clamps a lens position to the film. */
  clampLens(x: number, y: number): { x: number; y: number } {
    return { x: clamp(x, 0, 1), y: clamp(y, 0, FILM_H) };
  }
}
