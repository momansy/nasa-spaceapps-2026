// MG-16 canvas renderer: the docking camera (station port seen head-on, growing as the range
// closes, the boresight crosshair and the alignment target), readouts, the closing-speed gauge
// with the limit and the stretch mark, and the thruster pad. Reads the simulation only.
import { fmt } from '../../data/format';
import { Canvas2D, clamp, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { paintBarTrack, paintGlass, paintSky, tealGradient } from '../MG-09/shared/art';
import { T_BACK, T_DOWN, T_FWD, T_LEFT, T_RIGHT, T_UP, type Mg16Sim } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg16ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg16Frame {
  timeMs: number;
  active: boolean;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

/** Perspective offset of the camera behind the docking face, cm (visual only). */
const EYE_CM = 45;

export interface PadButton {
  bit: number;
  r: Rect;
  label: string;
}

export class Mg16View {
  readonly c: Canvas2D;
  private sim: Mg16Sim;
  private readonly opts: Mg16ViewOptions;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cam: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private gauge: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private pad: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Thruster buttons (hit regions, CSS px). */
  readonly buttons: PadButton[] = [];
  private readonly topL: KeyedLayer;
  private readonly padL: KeyedLayer;
  private readonly bgL: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg16Sim, opts: Mg16ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.topL = new KeyedLayer(this.c);
    this.padL = new KeyedLayer(this.c);
    this.bgL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg16Sim) {
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
    for (const l of [this.topL, this.padL, this.bgL]) l.invalidate();
    this.buttons.length = 0;
    if (this.opts.compact) {
      this.cam = { x: 6, y: 6, w: W - 12, h: H - 12 - 16 };
      this.gauge = { x: 6, y: H - 6 - 12, w: W - 12, h: 12 };
      return;
    }
    const pad = 12;
    const u = Math.min(c.u, 1.4);
    const hudH = Math.round(64 * u);
    const stripH = Math.round(40 * u);
    const hintH = Math.round(28 * Math.min(c.u, 1.5));
    const bs = Math.max(48, Math.round(50 * Math.min(c.u, 1.25)));
    const padH = this.sim.config.oneButton ? Math.round(64 * Math.min(c.u, 1.3)) : bs * 3 + 8;
    const gaugeH = Math.round(50 * u);
    this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
    this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
    this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
    this.pad = { x: pad, y: this.hintR.y - 8 - padH, w: W - pad * 2, h: padH };
    this.gauge = { x: pad, y: this.pad.y - 8 - gaugeH, w: W - pad * 2, h: gaugeH };
    const top = this.strip.y + stripH + 10;
    this.cam = { x: pad, y: top, w: W - pad * 2, h: Math.max(120, this.gauge.y - 8 - top) };
    if (this.sim.config.oneButton) return;
    const t = this.opts.t;
    // D-pad on one side (alignment), forward/back on the other (range). Mirrored in RTL.
    const dx = c.rtl ? this.pad.x + this.pad.w - bs * 3 - 4 : this.pad.x;
    const py = this.pad.y;
    const add = (bit: number, x: number, y: number, w: number, h: number, key: string) => this.buttons.push({ bit, r: { x, y, w, h }, label: t(key) });
    add(T_UP, dx + bs + 2, py, bs, bs, 'minigame.MG-16.pad.up');
    add(T_LEFT, dx, py + bs + 4, bs, bs, 'minigame.MG-16.pad.left');
    add(T_RIGHT, dx + bs * 2 + 4, py + bs + 4, bs, bs, 'minigame.MG-16.pad.right');
    add(T_DOWN, dx + bs + 2, py + bs * 2 + 8, bs, bs, 'minigame.MG-16.pad.down');
    const fw = Math.min(this.pad.w - bs * 3 - 24, Math.round(150 * Math.min(c.u, 1.3)));
    const fx = c.rtl ? this.pad.x : this.pad.x + this.pad.w - fw;
    const fh = (this.pad.h - 8) / 2;
    add(T_FWD, fx, py, fw, fh, 'minigame.MG-16.pad.fwd');
    add(T_BACK, fx, py + fh + 8, fw, fh, 'minigame.MG-16.pad.back');
  }

  /** Perspective scale of the port at the current range, px per cm. */
  private scaleAt(range: number): number {
    const cam = this.cam;
    return (Math.min(cam.w, cam.h) * 0.42 * (EYE_CM / (range + EYE_CM))) / 30;
  }

  private drawCamera() {
    const { c, sim, opts } = this;
    const { pal } = c;
    const cam = this.cam;
    // Static backdrop: space, the station's truss and a slice of Earth glow.
    this.bgL.blit({ x: cam.x - 1, y: cam.y - 1, w: cam.w + 2, h: cam.h + 2 }, 'bg', () => {
      const ctx = c.ctx;
      c.panel(cam, 12, '#040b14');
      ctx.save();
      pathRoundRect(ctx, cam, 12);
      ctx.clip();
      // Space with the Earth limb low in the frame and the low sun off to one side (frame 04).
      paintSky(ctx, cam, pal, 0.9, c.rtl ? 'right' : 'left');
      // Camera viewfinder: thin corner brackets and a soft lens vignette.
      const vg = ctx.createRadialGradient(cam.x + cam.w / 2, cam.y + cam.h / 2, Math.min(cam.w, cam.h) * 0.3, cam.x + cam.w / 2, cam.y + cam.h / 2, Math.max(cam.w, cam.h) * 0.75);
      vg.addColorStop(0, 'rgba(2, 8, 16, 0)');
      vg.addColorStop(1, 'rgba(2, 8, 16, 0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
      ctx.strokeStyle = 'rgba(232, 238, 240, 0.35)';
      ctx.lineWidth = 1.5;
      const m = 14;
      const L = Math.min(22, cam.w * 0.08);
      ctx.beginPath();
      for (const [x, y, dx, dy] of [
        [cam.x + m, cam.y + m + 14, 1, 1],
        [cam.x + cam.w - m, cam.y + m + 14, -1, 1],
        [cam.x + m, cam.y + cam.h - m, 1, -1],
        [cam.x + cam.w - m, cam.y + cam.h - m, -1, -1],
      ] as const) {
        ctx.moveTo(x, y + dy * L);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx * L, y);
      }
      ctx.stroke();
      ctx.restore();
    });
    const ctx = c.ctx;
    ctx.save();
    pathRoundRect(ctx, cam, 12);
    ctx.clip();
    const k = this.scaleAt(sim.range);
    const cx = cam.x + cam.w / 2 + sim.y * k;
    const cy = cam.y + cam.h / 2 - sim.z * k;
    const R = 30 * k; // port outer radius, 30 cm
    this.drawFace(ctx, cx, cy, R);
    // Docking target: a cross on a standoff (its centre is the port centre).
    ctx.strokeStyle = pal.ceramic;
    ctx.lineWidth = Math.max(1.5, R * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.45, cy);
    ctx.lineTo(cx + R * 0.45, cy);
    ctx.moveTo(cx, cy - R * 0.45);
    ctx.lineTo(cx, cy + R * 0.45);
    ctx.stroke();
    // Alignment target ring (the success limit at the port, cm) — solid when inside.
    const align = sim.alignCm;
    const inside = align < sim.config.alignBelowCm;
    const tr = sim.config.alignBelowCm * k;
    ctx.save();
    if (!inside) ctx.setLineDash([6, 5]);
    ctx.strokeStyle = inside ? pal.good : pal.warn;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, tr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Boresight crosshair, fixed at the centre of the camera.
    const bx = cam.x + cam.w / 2;
    const by = cam.y + cam.h / 2;
    ctx.strokeStyle = pal.accentStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const g = opts.compact ? 8 : 14;
    ctx.moveTo(bx - g * 3, by);
    ctx.lineTo(bx - g, by);
    ctx.moveTo(bx + g, by);
    ctx.lineTo(bx + g * 3, by);
    ctx.moveTo(bx, by - g * 3);
    ctx.lineTo(bx, by - g);
    ctx.moveTo(bx, by + g);
    ctx.lineTo(bx, by + g * 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, g * 0.35, 0, Math.PI * 2);
    ctx.stroke();
    // Thruster puffs on the edges while firing (none in reduced motion).
    if (!opts.reducedMotion && !sim.contact) {
      const m = sim.thrust;
      ctx.fillStyle = 'rgba(230, 240, 245, 0.35)';
      const puff = (x: number, y: number) => {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      };
      if (m & T_LEFT) puff(cam.x + cam.w - 14, by);
      if (m & T_RIGHT) puff(cam.x + 14, by);
      if (m & T_UP) puff(bx, cam.y + cam.h - 14);
      if (m & T_DOWN) puff(bx, cam.y + 14);
    }
    if (sim.contact) {
      const s = sim.score();
      ctx.fillStyle = withAlpha(s.success ? pal.good : pal.bad, 0.18);
      ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
    }
    ctx.restore();
    if (!opts.compact) {
      const lp = c.px(10.5, 1.3);
      c.text(this.opts.t('minigame.MG-16.cam.title'), c.rtl ? cam.x + cam.w - 10 : cam.x + 10, cam.y + 12, cam.w * 0.6, lp, 700, pal.dim, c.rtl ? 'right' : 'left');
    }
  }

  private faceSprite: HTMLCanvasElement | null = null;
  private faceKey = '';

  /**
   * The station's docking face, painted into a sprite once per size step (half a pixel of
   * radius) and blitted, so its gradients cost nothing per frame while the range closes.
   */
  private drawFace(target: CanvasRenderingContext2D, x: number, y: number, Rin: number) {
    const c = this.c;
    const R = Math.max(1, Math.round(Rin * 2) / 2);
    const half = Math.ceil(R * 2.35) + 2;
    const key = `${R}|${c.dpr}|${c.rtl}`;
    if (key !== this.faceKey || !this.faceSprite) {
      const sp = this.faceSprite ?? document.createElement('canvas');
      sp.width = Math.max(1, Math.ceil(half * 2 * c.dpr));
      sp.height = sp.width;
      const ctx = sp.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(c.dpr, 0, 0, c.dpr, half * c.dpr, half * c.dpr);
      const cx = 0;
      const cy = 0;
        // Station module face in the satellite finish: gold blanket edge with crinkle highlights,
        // ceramic panels lit from the sun side with a warm rim, a brushed-silver docking ring with
        // bolts, the dark tunnel with depth, and teal guide petals.
        const sunX = c.rtl ? 1 : -1;
        const gold = ctx.createLinearGradient(cx - R * 2.3, cy - R * 2.3, cx + R * 2.3, cy + R * 2.3);
        gold.addColorStop(0, '#e9c36d');
        gold.addColorStop(0.45, '#b98a35');
        gold.addColorStop(0.7, '#d9b25c');
        gold.addColorStop(1, '#6e5020');
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 236, 170, 0.35)';
        ctx.lineWidth = Math.max(1, R * 0.03);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = i * 0.63;
          ctx.moveTo(cx + Math.cos(a) * R * 2.17, cy + Math.sin(a) * R * 2.17);
          ctx.quadraticCurveTo(cx + Math.cos(a + 0.15) * R * 2.27, cy + Math.sin(a + 0.15) * R * 2.27, cx + Math.cos(a + 0.3) * R * 2.18, cy + Math.sin(a + 0.3) * R * 2.18);
        }
        ctx.stroke();
        const fg = ctx.createRadialGradient(cx + sunX * R * 0.9, cy - R * 0.9, R * 0.2, cx, cy, R * 2.2);
        fg.addColorStop(0, '#f6f9fa');
        fg.addColorStop(0.55, '#d7e0e5');
        fg.addColorStop(1, '#8798a6');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 2.1, 0, Math.PI * 2);
        ctx.fill();
        // Warm rim light on the sun-facing edge.
        ctx.strokeStyle = 'rgba(255, 214, 160, 0.75)';
        ctx.lineWidth = Math.max(1, R * 0.05);
        ctx.beginPath();
        ctx.arc(cx, cy, R * 2.07, sunX < 0 ? Math.PI * 0.7 : -Math.PI * 0.3, sunX < 0 ? Math.PI * 1.3 : Math.PI * 0.3);
        ctx.stroke();
        // Panel seams (raking light): dark groove with a light lip.
        ctx.lineWidth = 1;
        for (const [col, off] of [
          ['rgba(50, 70, 86, 0.32)', 0],
          ['rgba(255, 255, 255, 0.35)', 1],
        ] as const) {
          ctx.strokeStyle = col;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4 + Math.PI / 8;
            ctx.moveTo(cx + Math.cos(a) * R * 1.32 + off, cy + Math.sin(a) * R * 1.32 + off);
            ctx.lineTo(cx + Math.cos(a) * R * 2.08 + off, cy + Math.sin(a) * R * 2.08 + off);
          }
          ctx.stroke();
        }
        // Docking ring: brushed silver.
        const ring = ctx.createLinearGradient(cx - R * 1.22, cy - R * 1.22, cx + R * 1.22, cy + R * 1.22);
        ring.addColorStop(0, '#e2e8ec');
        ring.addColorStop(0.35, '#8e99a3');
        ring.addColorStop(0.55, '#c9d1d8');
        ring.addColorStop(1, '#55606a');
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.24, 0, Math.PI * 2);
        ctx.fill();
        const tun = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
        tun.addColorStop(0, '#05090e');
        tun.addColorStop(0.75, '#141e28');
        tun.addColorStop(1, '#2b3946');
        ctx.fillStyle = tun;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a - 0.25) * R * 1.0, cy + Math.sin(a - 0.25) * R * 1.0);
          ctx.lineTo(cx + Math.cos(a) * R * 0.72, cy + Math.sin(a) * R * 0.72);
          ctx.lineTo(cx + Math.cos(a + 0.25) * R * 1.0, cy + Math.sin(a + 0.25) * R * 1.0);
          ctx.closePath();
          ctx.fillStyle = tealGradient(ctx, R * 0.6, 1, cx + Math.cos(a) * R * 0.86);
          ctx.fill();
        }
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          const bx0 = cx + Math.cos(a) * R * 1.12;
          const by0 = cy + Math.sin(a) * R * 1.12;
          ctx.fillStyle = 'rgba(30, 40, 50, 0.55)';
          ctx.beginPath();
          ctx.arc(bx0 + 0.6, by0 + 0.6, Math.max(1, R * 0.035), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e6ebee';
          ctx.beginPath();
          ctx.arc(bx0, by0, Math.max(1, R * 0.035), 0, Math.PI * 2);
          ctx.fill();
        }
      this.faceSprite = sp;
      this.faceKey = key;
    }
    target.drawImage(this.faceSprite, x - half, y - half, half * 2, half * 2);
  }

  private speedStatus(): Status {
    const v = this.sim.contact ? this.sim.contact.speedCmS : this.sim.closing;
    const lim = this.sim.config.speedBelowCmS;
    return v >= lim ? 'bad' : v >= lim * 0.8 ? 'warn' : 'good';
  }

  private drawGauge() {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const g = this.gauge;
    const lim = sim.config.speedBelowCmS;
    const max = lim * 1.6;
    const compact = opts.compact;
    if (!compact) c.panel(g, 10);
    const lp = c.px(10.5, 1.3);
    const bar: Rect = compact ? g : { x: g.x + 10, y: g.y + lp + 14, w: g.w - 20, h: Math.max(8, g.h - lp - 22) };
    const xOf = (v: number) => (c.rtl ? bar.x + bar.w * (1 - clamp(v / max, 0, 1)) : bar.x + bar.w * clamp(v / max, 0, 1));
    paintBarTrack(ctx, bar);
    ctx.save();
    pathRoundRect(ctx, bar, bar.h / 2);
    ctx.clip();
    ctx.fillStyle = withAlpha(pal.good, 0.28);
    ctx.fillRect(Math.min(xOf(0), xOf(lim)), bar.y, Math.abs(xOf(lim) - xOf(0)), bar.h);
    ctx.fillStyle = withAlpha(pal.bad, 0.24);
    ctx.fillRect(Math.min(xOf(lim), xOf(max)), bar.y, Math.abs(xOf(max) - xOf(lim)), bar.h);
    ctx.restore();
    ctx.fillStyle = pal.text;
    ctx.fillRect(xOf(lim) - 1, bar.y - 3, 2, bar.h + 6);
    ctx.fillStyle = pal.sun;
    ctx.fillRect(xOf(sim.config.perfectBelow) - 1, bar.y - 2, 2, bar.h + 4);
    const v = sim.contact ? sim.contact.speedCmS : Math.max(0, sim.closing);
    const st = this.speedStatus();
    ctx.fillStyle = c.statusColor(st);
    const vx = xOf(v);
    ctx.beginPath();
    ctx.moveTo(vx, bar.y + bar.h);
    ctx.lineTo(vx - 6, bar.y + bar.h + 9);
    ctx.lineTo(vx + 6, bar.y + bar.h + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(vx - 1.5, bar.y - 1, 3, bar.h + 2);
    if (!compact) {
      const t = opts.t;
      c.text(t('minigame.MG-16.gauge.title', { lim: fmt(lim, 0), stretch: fmt(sim.config.perfectBelow, 0) }), c.rtl ? g.x + g.w - 10 : g.x + 10, g.y + 8 + lp * 0.5, g.w - 20, lp, 700, pal.dim, c.rtl ? 'right' : 'left');
    }
  }

  private drawPad(active: boolean) {
    const { c, sim, opts } = this;
    const key = `${sim.thrust}|${sim.brakeLeft > 0}|${active}|${!!sim.contact}`;
    this.padL.blit({ x: this.pad.x - 2, y: this.pad.y - 2, w: this.pad.w + 4, h: this.pad.h + 4 }, key, () => {
      const ctx = c.ctx;
      const { pal } = c;
      const t = opts.t;
      if (sim.config.oneButton) {
        const r = this.pad;
        const on = sim.brakeLeft > 0;
        paintGlass(ctx, r, 16, pal, { deep: true, tint: pal.accent, tintAlpha: on ? 0.45 : 0.14, edge: withAlpha(pal.accent, on ? 1 : 0.75), edgeWidth: on ? 2 : 1.5 });
        c.text(t('minigame.MG-16.pad.brake'), r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 24, c.px(18, 1.4), 600, pal.text, 'center');
        return;
      }
      for (const b of this.buttons) {
        const on = (sim.thrust & b.bit) !== 0;
        paintGlass(ctx, b.r, 14, pal, { deep: true, tint: pal.accent, tintAlpha: on ? 0.5 : 0.08, edge: on ? pal.accentStrong : 'rgba(150, 205, 228, 0.32)', edgeWidth: on ? 2 : 1 });
        const col = on ? '#ffffff' : pal.text;
        const cx = b.r.x + b.r.w / 2;
        const cy = b.r.y + b.r.h / 2;
        if (b.bit === T_FWD || b.bit === T_BACK) c.text(b.label, cx, cy + 1, b.r.w - 14, c.px(14.5, 1.3), 600, col, 'center');
        else {
          const a = b.bit === T_UP ? -Math.PI / 2 : b.bit === T_DOWN ? Math.PI / 2 : b.bit === T_LEFT ? Math.PI : 0;
          const s = Math.min(b.r.w, b.r.h) * 0.3;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(a);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(s, 0);
          ctx.lineTo(-s * 0.6, -s * 0.75);
          ctx.lineTo(-s * 0.6, s * 0.75);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    });
  }

  draw(f: Mg16Frame) {
    const { c, sim, opts } = this;
    const { pal } = c;
    const t = opts.t;
    c.begin();
    this.drawCamera();
    this.drawGauge();
    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }
    this.drawPad(f.active);
    const speed = sim.contact ? sim.contact.speedCmS : sim.closing;
    const align = sim.contact ? sim.contact.alignCm : sim.alignCm;
    const [st, key] = this.status();
    const topKey = `${fmt(sim.range, 0)}|${fmt(speed, 1)}|${fmt(align, 1)}|${key}|${st}`;
    this.topL.blit({ x: 0, y: 0, w: c.W, h: this.strip.y + this.strip.h + 2 }, topKey, () => {
      const gap = 6;
      const tw = (this.hud.w - gap * 2) / 3;
      const rects: Rect[] = [0, 1, 2].map((i) => ({ x: this.hud.x + i * (tw + gap), y: this.hud.y, w: tw, h: this.hud.h }));
      if (c.rtl) rects.reverse();
      const ss = this.speedStatus();
      const as: Status = align < sim.config.alignBelowCm ? 'good' : 'warn';
      c.readout(rects[0]!, t('minigame.MG-16.hud.range'), fmt(sim.range, 0), 'cm', pal.text);
      c.readout(rects[1]!, t('minigame.MG-16.hud.speed'), fmt(speed, 1, 1), 'cm/s', c.statusColor(ss), ss);
      c.readout(rects[2]!, t('minigame.MG-16.hud.align'), fmt(align, 1, 1), 'cm', c.statusColor(as), as);
      c.statusStrip(this.strip, st, t(key));
    });
    c.hint(this.hintR, t(sim.config.oneButton ? 'minigame.MG-16.hint.press' : 'minigame.MG-16.hint.pad'), f.active);
    if (f.pausedText) c.overlay(f.pausedText);
  }

  status(): [Status, string] {
    const sim = this.sim;
    if (sim.contact) {
      const s = sim.score();
      if (s.success) return ['good', s.perfect ? 'minigame.MG-16.status.perfect' : 'minigame.MG-16.status.docked'];
      return ['bad', sim.contact.speedCmS >= sim.config.speedBelowCmS ? 'minigame.MG-16.status.too_fast' : 'minigame.MG-16.status.misaligned'];
    }
    if (sim.closing >= sim.config.speedBelowCmS) return ['bad', 'minigame.MG-16.status.slow_down'];
    if (sim.closing >= sim.config.speedBelowCmS * 0.8) return ['warn', 'minigame.MG-16.status.near_limit'];
    if (sim.alignCm >= sim.config.alignBelowCm) return ['warn', 'minigame.MG-16.status.align'];
    if (sim.closing <= 0) return ['warn', 'minigame.MG-16.status.not_closing'];
    return ['good', 'minigame.MG-16.status.ok'];
  }
}
