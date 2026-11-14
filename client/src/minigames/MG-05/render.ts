// MG-05 drawing: a clean-room bench under laminar-flow light. A coated camera lens (top) and a
// gold-coated mirror (bottom) in silver mounts; dust specks and fibres drift down and settle;
// the foam swab wipes them; scratches stay as thin bright arcs. A stroke-speed gauge shows how
// close the stroke is to "too hard". Theme tokens; DPR ≤ 2.
import { Canvas2D, clamp, KeyedLayer, pathRoundRect, pct, silverGradient, withAlpha, type Rect, type Status } from '../MG-02/kit';
import { FIELD_H, LENS, MIRROR, type Mg05Sim } from './model';

export interface Mg05ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export interface Mg05DrawState {
  timeMs: number;
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

const K = 'minigame.MG-05.';

export class Mg05View {
  readonly c: Canvas2D;
  private sim: Mg05Sim;
  private readonly o: Mg05ViewOptions;
  private hud: Rect[] = [];
  private box!: Rect;
  field!: Rect;
  private gaugeR: Rect | null = null;
  private hintR: Rect | null = null;
  private hudLayer: KeyedLayer;
  private benchLayer: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg05Sim, o: Mg05ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.hudLayer = new KeyedLayer(this.c);
    this.benchLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg05Sim) {
    this.sim = sim;
    this.layout();
  }

  resize() {
    this.c.measure();
    this.layout();
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
    const gaugeH = compact ? 0 : Math.round(30 * s);
    this.hintR = compact ? null : { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
    this.box = { x: pad, y, w: W - pad * 2, h: H - pad - hintH - gaugeH - (compact ? 0 : 14) - y };
    this.gaugeR = compact ? null : { x: pad + 6, y: this.box.y + this.box.h + 8, w: W - pad * 2 - 12, h: gaugeH };
    if (compact) {
      // The demo frames the lens only.
      const fw = this.box.w * 0.92;
      this.field = { x: this.box.x + (this.box.w - fw) / 2, y: this.box.y + this.box.h / 2 - LENS.y * fw, w: fw, h: fw * FIELD_H };
    } else {
      const fw = Math.min(this.box.w - 16, (this.box.h - 16) / FIELD_H);
      this.field = { x: this.box.x + (this.box.w - fw) / 2, y: this.box.y + (this.box.h - fw * FIELD_H) / 2, w: fw, h: fw * FIELD_H };
    }
  }

  px(x: number): number {
    return this.field.x + x * this.field.w;
  }
  py(y: number): number {
    return this.field.y + y * this.field.w;
  }
  toField(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.field.x) / this.field.w, y: (y - this.field.y) / this.field.w };
  }

  draw(st: Mg05DrawState) {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    c.begin();
    c.backdrop(0.6);
    if (!this.o.compact) this.drawHud();
    this.drawBench();
    ctx.save();
    pathRoundRect(ctx, this.box, 16);
    ctx.clip();
    this.drawScratches();
    this.drawParticles();
    this.drawSwab();
    ctx.restore();
    if (this.gaugeR) this.drawGauge(this.gaugeR);
    if (this.hintR) c.hint(this.hintR, this.o.t(sim.config.oneButton ? K + 'hint.one' : K + 'hint.wipe'), sim.down);
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private drawHud() {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const clean = pct(sim.clean);
    const need = pct(sim.config.cleanMin);
    const left = Math.ceil(Math.max(0, sim.config.playS - sim.timeS));
    const key = `${clean}|${sim.scratches.length}|${left}|${c.W}`;
    const r0 = this.hud[0]!;
    this.hudLayer.blit({ x: 0, y: r0.y - 6, w: c.W, h: r0.h + 26 }, key, () => {
      const cs: Status = clean >= need ? 'good' : 'warn';
      c.readout(this.hud[0]!, t(K + 'hud.clean', { pct: need }), String(clean), '%', clean >= need ? c.pal.good : c.pal.text, cs);
      const n = sim.scratches.length;
      const ss: Status = n > sim.config.scratchesMax ? 'bad' : 'good';
      c.readout(this.hud[1]!, t(K + 'hud.scratches', { n: sim.config.scratchesMax }), String(n), t(K + 'unit.scratches'), n > sim.config.scratchesMax ? c.pal.bad : c.pal.text, ss);
      c.readout(this.hud[2]!, t(K + 'hud.left'), String(left), 's', left <= 4 && !sim.done ? c.pal.sun : c.pal.text);
    });
  }

  private drawBench() {
    const c = this.c;
    const b = this.box;
    const f = this.field;
    this.benchLayer.blit({ x: b.x - 6, y: b.y - 4, w: b.w + 12, h: b.h + 26 }, `${b.w}x${b.h}@${b.y}|${f.w}|${this.o.compact}`, () => {
      const g = c.ctx;
      c.glass(b, 16);
      g.save();
      pathRoundRect(g, b, 16);
      g.clip();
      // Laminar-flow light from the ceiling filters: soft vertical bands.
      const bg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      bg.addColorStop(0, '#20435c');
      bg.addColorStop(1, '#0d2233');
      g.fillStyle = bg;
      g.fillRect(b.x, b.y, b.w, b.h);
      for (let x = b.x + 18; x < b.x + b.w; x += 46) {
        const lg = g.createLinearGradient(0, b.y, 0, b.y + b.h * 0.8);
        lg.addColorStop(0, 'rgba(220, 240, 255, 0.08)');
        lg.addColorStop(1, 'rgba(220, 240, 255, 0)');
        g.fillStyle = lg;
        g.fillRect(x, b.y, 14, b.h * 0.8);
      }
      // Optics.
      this.drawLens(g, this.px(LENS.x), this.py(LENS.y), LENS.r * f.w);
      this.drawMirror(g, this.px(MIRROR.x), this.py(MIRROR.y), MIRROR.r * f.w);
      g.restore();
    });
  }

  private drawLens(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    const pal = this.c.pal;
    // Mount: brushed silver ring with Signal index marks.
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.5)';
    g.shadowBlur = 14;
    g.shadowOffsetY = 6;
    g.beginPath();
    g.arc(x, y, r * 1.14, 0, Math.PI * 2);
    g.fillStyle = silverGradient(g, x - r, y - r, x + r, y + r);
    g.fill();
    g.restore();
    g.beginPath();
    g.arc(x, y, r * 1.04, 0, Math.PI * 2);
    g.fillStyle = '#20262c';
    g.fill();
    g.fillStyle = pal.accent;
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      g.fillRect(x + Math.cos(a) * r * 1.09 - 1, y + Math.sin(a) * r * 1.09 - 1, 2.5, 2.5);
    }
    // Glass: deep coated optic with blue-violet and amber reflections.
    const gl = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    gl.addColorStop(0, '#3b6d93');
    gl.addColorStop(0.45, '#163650');
    gl.addColorStop(1, '#081520');
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = gl;
    g.fill();
    g.strokeStyle = 'rgba(165, 180, 252, 0.35)';
    g.lineWidth = r * 0.06;
    g.beginPath();
    g.arc(x, y, r * 0.78, Math.PI * 1.1, Math.PI * 1.55);
    g.stroke();
    g.strokeStyle = 'rgba(255, 206, 131, 0.25)';
    g.lineWidth = r * 0.04;
    g.beginPath();
    g.arc(x, y, r * 0.62, Math.PI * 0.15, Math.PI * 0.45);
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.16)';
    g.beginPath();
    g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.1, -0.6, 0, Math.PI * 2);
    g.fill();
  }

  private drawMirror(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    const pal = this.c.pal;
    const hex = (rad: number) => {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    };
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.5)';
    g.shadowBlur = 14;
    g.shadowOffsetY = 6;
    hex(r * 1.17);
    g.fillStyle = silverGradient(g, x - r, y - r, x + r, y + r);
    g.fill();
    g.restore();
    hex(r * 1.08);
    g.fillStyle = '#20262c';
    g.fill();
    // Gold-coated face with a soft sky reflection.
    const gold = g.createLinearGradient(x - r, y - r, x + r, y + r);
    gold.addColorStop(0, '#f2d38a');
    gold.addColorStop(0.45, '#c99a3e');
    gold.addColorStop(1, '#7d5a1e');
    hex(r * 1.02);
    g.fillStyle = gold;
    g.fill();
    g.save();
    hex(r * 1.02);
    g.clip();
    const sky = g.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.4);
    sky.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    sky.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    g.fillStyle = sky;
    g.fillRect(x - r * 1.1, y - r * 1.1, r * 2.2, r * 2.2);
    g.restore();
    g.strokeStyle = withAlpha(pal.accent, 0.8);
    g.lineWidth = 1.5;
    hex(r * 1.12);
    g.stroke();
  }

  private drawParticles() {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    const f = this.field;
    const t = sim.timeS;
    for (let i = 0; i < sim.particles.length; i++) {
      const s = sim.state[i]!;
      if (s === 0 || s === 3) continue;
      const p = sim.particles[i]!;
      let x = p.x;
      let y = p.y;
      let alpha = 1;
      if (s === 1) {
        const k = clamp((t - p.spawnS) / sim.config.driftS, 0, 1);
        y = p.y - (1 - k) * 0.32;
        x = p.x + p.dx * (1 - k) + (this.o.reducedMotion ? 0 : 0.01 * Math.sin(t * 3 + i));
        alpha = 0.35 + 0.45 * k;
      }
      const px = this.px(x);
      const py = this.py(y);
      const size = Math.max(1.6, p.size * f.w);
      ctx.globalAlpha = alpha;
      if (s === 2) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.arc(px + 1, py + 1.5, size * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.fibre) {
        ctx.strokeStyle = p.optic === 1 && s === 2 ? 'rgba(80, 66, 40, 0.9)' : 'rgba(240, 236, 226, 0.98)';
        ctx.lineWidth = Math.max(1.2, size * 0.4);
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(p.angle) * size * 2, py - Math.sin(p.angle) * size * 2);
        ctx.quadraticCurveTo(px + size, py - size, px + Math.cos(p.angle) * size * 2, py + Math.sin(p.angle) * size * 2);
        ctx.stroke();
      } else {
        // Dust: bright on the dark lens, a darker speck with a light rim on the gold mirror.
        const onMirror = p.optic === 1 && s === 2;
        if (!onMirror && s === 2) {
          ctx.fillStyle = 'rgba(255, 250, 235, 0.18)';
          ctx.beginPath();
          ctx.arc(px, py, size * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = onMirror ? 'rgba(70, 58, 36, 0.9)' : 'rgba(244, 240, 230, 0.98)';
        ctx.beginPath();
        ctx.arc(px, py, size * 0.75, 0, Math.PI * 2);
        ctx.fill();
        if (onMirror) {
          ctx.strokeStyle = 'rgba(255, 245, 220, 0.7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (s === 2 && !this.o.reducedMotion) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.fillRect(px - 0.5, py - size * 1.4, 1, size * 2.8);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawScratches() {
    const c = this.c;
    const ctx = c.ctx;
    for (const s of this.sim.scratches) {
      ctx.strokeStyle = 'rgba(255, 245, 230, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < s.pts.length; k += 2) {
        const x = this.px(s.pts[k]!);
        const y = this.py(s.pts[k + 1]!);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = withAlpha(c.pal.bad, 0.55);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawSwab() {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    const x = this.px(sim.swabX);
    const y = this.py(sim.swabY);
    const r = sim.config.swabR * this.field.w;
    // Wiping footprint.
    ctx.strokeStyle = sim.down ? withAlpha(sim.tooHard ? c.pal.bad : c.pal.accentStrong, 0.85) : 'rgba(232, 238, 240, 0.35)';
    ctx.lineWidth = sim.down ? 2 : 1;
    ctx.setLineDash(sim.down ? [] : [4, 4]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Swab: foam head with a teal handle, tilted.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.5);
    ctx.fillStyle = withAlpha(c.pal.accent, 0.95);
    pathRoundRect(ctx, { x: -r * 0.12, y: r * 0.3, w: r * 0.24, h: r * 1.9 }, r * 0.1);
    ctx.fill();
    const foam = ctx.createLinearGradient(-r * 0.45, 0, r * 0.45, 0);
    foam.addColorStop(0, '#d9dfe2');
    foam.addColorStop(0.5, '#ffffff');
    foam.addColorStop(1, '#bcc6cc');
    ctx.fillStyle = foam;
    pathRoundRect(ctx, { x: -r * 0.42, y: -r * 0.5, w: r * 0.84, h: r * 0.9 }, r * 0.3);
    ctx.fill();
    ctx.restore();
  }

  private drawGauge(r: Rect) {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const px = c.px(12.5, 1.25);
    c.ctx.font = c.font(px, 600);
    const labelW = Math.min(r.w * 0.38, c.ctx.measureText(t(K + 'gauge')).width + 8);
    c.textStart(t(K + 'gauge'), { x: r.x, y: r.y, w: labelW, h: r.h }, r.y + r.h / 2, px, 600, c.pal.dim);
    const bar = { x: c.rtl ? r.x : r.x + labelW + 10, y: r.y + r.h / 2 - 6, w: r.w - labelW - 10, h: 12 };
    const frac = clamp(sim.speed / (sim.config.speedLimit * 1.5), 0, 1);
    const need = 1 / 1.5;
    const s: Status = sim.tooHard ? 'bad' : frac > need * 0.8 ? 'warn' : 'good';
    c.bar(bar, frac, need, s);
  }
}
