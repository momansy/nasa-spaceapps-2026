// MG-21 canvas renderer: a stylised top-down Earth scrolling under the ground track (ocean
// navy, muted land, clear day/night, no halo), the targets, clouds, the camera frame, the strip
// of captured image tiles and the shutter. Imaging is never drawn as a beam (style guide).
import { fmt } from '../../data/format';
import { Canvas2D, clamp, KeyedLayer, mulberry32, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-13/kit';
import { paintGlass } from '../MG-09/shared/art';
import { cloudOffset, TARGET_R, type Mg21Sim, type ShotOutcome, type Target } from './model';

type Translate = (key: string, args?: Record<string, string | number>) => string;

export interface Mg21ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: Translate;
}

export interface Mg21Frame {
  timeMs: number;
  active: boolean;
  finger?: { x: number; y: number; pressed: boolean } | null;
  pausedText?: string | null;
}

/** How long a shot result stays in the status strip, steps. */
const SHOT_FLASH_STEPS = 110;

export class Mg21View {
  readonly c: Canvas2D;
  private sim: Mg21Sim;
  private readonly opts: Mg21ViewOptions;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Ground view. */
  field: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tilesR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Shutter button (CSS px). */
  shutter = { x: 0, y: 0, r: 30 };
  /** Pixels per swath half-width, and the frame's row inside the field. */
  k = 100;
  private frameRow = 0;
  private ground: HTMLCanvasElement | null = null;
  private groundScale = 1;
  private groundTopS = 0;
  private cloudSprite: HTMLCanvasElement | null = null;
  /** Cloud sprites pre-scaled per size (device px, 4 px buckets) and opacity. */
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  /** Cached panels: readouts + status strip, tiles + hint, the mode badge, the field border. */
  private readonly topL: KeyedLayer;
  private readonly botL: KeyedLayer;
  private readonly badgeL: KeyedLayer;
  private readonly borderL: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg21Sim, opts: Mg21ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.opts = opts;
    this.topL = new KeyedLayer(this.c);
    this.botL = new KeyedLayer(this.c);
    this.badgeL = new KeyedLayer(this.c);
    this.borderL = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg21Sim) {
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
    if (this.opts.compact) {
      this.field = { x: 6, y: 6, w: W - 12, h: H - 12 };
      this.tilesR = { x: 0, y: 0, w: 0, h: 0 };
    } else {
      const pad = 12;
      const hudH = Math.round(64 * Math.min(c.u, 1.4));
      const stripH = Math.round(40 * Math.min(c.u, 1.4));
      const hintH = Math.round(28 * Math.min(c.u, 1.5));
      const tilesH = Math.round(clamp((W - pad * 2) / this.sim.config.targetCount, 44, 64));
      this.hud = { x: pad, y: pad, w: W - pad * 2, h: hudH };
      this.strip = { x: pad, y: pad + hudH + 8, w: W - pad * 2, h: stripH };
      this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
      this.tilesR = { x: pad, y: this.hintR.y - 8 - tilesH, w: W - pad * 2, h: tilesH };
      const top = this.strip.y + stripH + 8;
      this.field = { x: pad, y: top, w: W - pad * 2, h: this.tilesR.y - 8 - top };
    }
    // The swath (±1) fills 92 % of the field width; same scale along the track.
    this.k = (this.field.w / 2) * 0.92;
    this.frameRow = this.field.h * 0.66;
    const r = this.opts.compact ? 0 : Math.max(30, Math.min(40, 30 * Math.min(c.u, 1.3)));
    this.shutter = { x: c.rtl ? this.field.x + r + 12 : this.field.x + this.field.w - r - 12, y: this.field.y + this.field.h - r - 12, r };
    for (const l of [this.topL, this.botL, this.badgeL, this.borderL]) l.invalidate();
    this.paintGround();
  }

  /** Screen x of a cross-track position, screen y of an along-track position (now). */
  sx(x: number): number {
    return this.field.x + this.field.w / 2 + x * this.k;
  }
  sy(s: number): number {
    return this.field.y + this.frameRow - (s - this.sim.s) * this.k;
  }

  // ───────────── ground strip (drawn once per run and size) ─────────────

  private paintGround() {
    const { c, sim } = this;
    const f = this.field;
    const above = this.frameRow / this.k + 0.3;
    const below = (f.h - this.frameRow) / this.k + 0.3;
    const sMin = -below;
    const sMax = sim.scene.lengthS + above;
    this.groundTopS = sMax;
    // Resolution: device pixels capped at 1.5 per CSS pixel to bound memory (~6 MB).
    // Device resolution so the per-frame copy is 1:1 (no resampling): ~12 MB at DPR 2.
    const scale = c.dpr;
    this.groundScale = scale;
    const gw = Math.max(1, Math.round(f.w * scale));
    const gh = Math.max(1, Math.round((sMax - sMin) * this.k * scale));
    const g = this.ground ?? document.createElement('canvas');
    this.ground = g;
    g.width = gw;
    g.height = Math.min(gh, 16000);
    const ctx = g.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const W = f.w;
    const yOf = (s: number) => (sMax - s) * this.k;
    const xOf = (x: number) => W / 2 + x * this.k;
    const rnd = mulberry32((sim.scene.targets.length * 7919) ^ Math.round(sim.scene.terminatorS * 1000));
    // Ocean: deep blue with a broad lighter swell across the middle (the look of frame 04).
    ctx.fillStyle = '#0f4b67';
    ctx.fillRect(0, 0, W, yOf(sMin));
    const swell = ctx.createLinearGradient(0, 0, W, 0);
    swell.addColorStop(0, 'rgba(6, 30, 52, 0.45)');
    swell.addColorStop(0.45, 'rgba(40, 130, 170, 0.18)');
    swell.addColorStop(1, 'rgba(6, 30, 52, 0.4)');
    ctx.fillStyle = swell;
    ctx.fillRect(0, 0, W, yOf(sMin));
    // Subtle ocean texture: long soft bands.
    ctx.fillStyle = 'rgba(23, 104, 135, 0.35)';
    for (let s = sMin; s < sMax; s += 0.6) {
      ctx.beginPath();
      ctx.ellipse(xOf((rnd() * 2 - 1) * 1.1), yOf(s), this.k * (0.5 + rnd() * 0.6), this.k * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Land: seeded blobs, kept away from ocean targets.
    const oceanTargets = sim.scene.targets.filter((t) => t.type === 'hurricane' || t.type === 'algae_bloom');
    for (let s = sMin; s < sMax; s += 0.55 + rnd() * 0.6) {
      const x = (rnd() * 2 - 1) * 1.2;
      if (oceanTargets.some((t) => Math.abs(t.s - s) < 0.75 && Math.abs(t.x - x) < 0.8)) continue;
      this.blob(ctx, xOf(x), yOf(s), this.k * (0.35 + rnd() * 0.45), rnd, rnd() < 0.5 ? '#4b6a45' : '#7a7550');
    }
    // Targets, each on suitable ground.
    for (const t of sim.scene.targets) this.target(ctx, t, xOf(t.x), yOf(t.s), this.k * TARGET_R, rnd);
    // Night side: dark overlay past the terminator with a soft edge; city lights stay lit.
    const yT = yOf(sim.scene.terminatorS);
    const edge = this.k * 0.5;
    const night = 'rgba(3, 9, 18, 0.78)';
    const grad = ctx.createLinearGradient(0, yT - edge, 0, yT + edge);
    // Larger s = higher on screen; dayFirst means the night side is at larger s (top).
    if (sim.scene.dayFirst) {
      ctx.fillStyle = night;
      ctx.fillRect(0, 0, W, yT - edge);
      grad.addColorStop(0, night);
      grad.addColorStop(1, 'rgba(3, 9, 18, 0)');
    } else {
      ctx.fillStyle = night;
      ctx.fillRect(0, yT + edge, W, yOf(sMin) - yT - edge);
      grad.addColorStop(0, 'rgba(3, 9, 18, 0)');
      grad.addColorStop(1, night);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, yT - edge, W, edge * 2);
    for (const t of sim.scene.targets) if (t.type === 'city_lights') this.cityLights(ctx, xOf(t.x), yOf(t.s), this.k * TARGET_R);
    // Cloud sprite (soft white puff, no glow).
    const cs = document.createElement('canvas');
    const size = Math.max(16, Math.round(this.k * 0.6 * scale));
    cs.width = size;
    cs.height = size;
    const cc = cs.getContext('2d');
    if (cc) {
      const r = size / 2;
      const puffs = [
        [0, 0, 0.55],
        [-0.35, 0.1, 0.4],
        [0.35, 0.05, 0.42],
        [0.1, -0.3, 0.38],
        [-0.15, 0.32, 0.35],
      ];
      for (const [px, py, pr] of puffs) {
        const gx = r + px! * r;
        const gy = r + py! * r;
        const gg = cc.createRadialGradient(gx, gy, 0, gx, gy, pr! * r);
        gg.addColorStop(0, 'rgba(240, 245, 248, 0.95)');
        gg.addColorStop(0.7, 'rgba(230, 238, 242, 0.75)');
        gg.addColorStop(1, 'rgba(230, 238, 242, 0)');
        cc.fillStyle = gg;
        cc.beginPath();
        cc.arc(gx, gy, pr! * r, 0, Math.PI * 2);
        cc.fill();
      }
    }
    this.cloudSprite = cs;
    this.sprites.clear();
  }

  /** A cloud sprite `sizeCss` wide at opacity `alpha`, made once per size bucket. */
  private sprite(sizeCss: number, alpha: number): HTMLCanvasElement {
    const px = Math.max(4, Math.round((sizeCss * this.c.dpr) / 4) * 4);
    const key = `${px}:${alpha}`;
    let sp = this.sprites.get(key);
    if (!sp) {
      sp = document.createElement('canvas');
      sp.width = px;
      sp.height = px;
      const sctx = sp.getContext('2d');
      if (sctx && this.cloudSprite) {
        sctx.globalAlpha = alpha;
        sctx.drawImage(this.cloudSprite, 0, 0, px, px);
      }
      this.sprites.set(key, sp);
    }
    return sp;
  }

  private blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rnd: () => number, color: string) {
    // A smooth island outline (many points), shallow turquoise water around it, terrain shading
    // lit from the Sun side and a pale beach edge: the look of the orbit reference frame.
    const n = 28;
    const ph = rnd() * 6;
    const ph2 = rnd() * 6;
    const outline = (grow: number) => {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * grow * (0.74 + 0.16 * Math.sin(a * 3 + ph) + 0.08 * Math.sin(a * 7 + ph2) + 0.04 * Math.sin(a * 13 + ph));
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.8;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    outline(1.18);
    ctx.fillStyle = 'rgba(64, 170, 185, 0.28)';
    ctx.fill();
    outline(1.07);
    ctx.fillStyle = 'rgba(90, 195, 200, 0.3)';
    ctx.fill();
    outline(1);
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.3, r * 0.1, cx, cy, r * 1.05);
    g.addColorStop(0, color === '#7a7550' ? '#9a8f62' : '#5f8250');
    g.addColorStop(0.6, color);
    g.addColorStop(1, color === '#7a7550' ? '#5c5a3d' : '#34502f');
    ctx.fillStyle = g;
    ctx.fill();
    // Terrain texture: fine deterministic speckle in lighter and darker tones (no random draw).
    ctx.save();
    ctx.clip();
    const n2 = Math.round(r * r * 0.05);
    for (let i = 0; i < n2; i++) {
      const hx = Math.sin(i * 12.9898 + ph * 78.233) * 43758.5453;
      const hy = Math.sin(i * 39.3468 + ph2 * 11.135) * 24634.6345;
      const fx = hx - Math.floor(hx);
      const fy = hy - Math.floor(hy);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(235, 225, 190, 0.12)' : 'rgba(20, 30, 18, 0.16)';
      const d = 1 + (i % 4) * 0.6;
      ctx.fillRect(cx - r + fx * r * 2, cy - r + fy * r * 2, d, d);
    }
    // Shade on the side away from the Sun.
    const sh = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    sh.addColorStop(0, 'rgba(255, 236, 200, 0.08)');
    sh.addColorStop(1, 'rgba(8, 16, 12, 0.3)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(230, 215, 170, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Ridges.
    ctx.strokeStyle = 'rgba(20, 30, 15, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = ph + k * 2.1;
      ctx.moveTo(cx + Math.cos(a) * r * 0.15, cy + Math.sin(a) * r * 0.12);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.6) * r * 0.45, cy + Math.sin(a + 0.6) * r * 0.35, cx + Math.cos(a + 0.3) * r * 0.62, cy + Math.sin(a + 0.3) * r * 0.48);
    }
    ctx.stroke();
  }

  private target(ctx: CanvasRenderingContext2D, t: Target, x: number, y: number, r: number, rnd: () => number) {
    switch (t.type) {
      case 'hurricane': {
        // Spiral cloud bands around a clear eye.
        ctx.save();
        ctx.translate(x, y);
        for (let arm = 0; arm < 3; arm++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.strokeStyle = 'rgba(236, 242, 245, 0.92)';
          ctx.lineCap = 'round';
          for (let k = 0; k < 3; k++) {
            ctx.lineWidth = r * (0.5 - k * 0.12);
            ctx.beginPath();
            for (let a = 0; a <= 1; a += 0.1) {
              const ang = a * Math.PI * 1.3;
              const rr = r * (0.35 + a * 1.25) + k * r * 0.2;
              if (a === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
              else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
            }
            ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(236, 242, 245, 0.95)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f4b67';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'wildfire': {
        this.blob(ctx, x, y, r * 2.6, rnd, '#5e6b3e');
        ctx.fillStyle = '#2b2620';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.2, y + r * 0.2, r * 1.1, r * 0.8, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff7a3a';
        ctx.lineWidth = r * 0.35;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x - r * 0.2, y + r * 0.2, r * 1.0, -1.6, 0.9);
        ctx.stroke();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = r * 0.14;
        ctx.stroke();
        // Smoke plume drifting away.
        for (let i = 1; i <= 4; i++) {
          ctx.fillStyle = `rgba(150, 150, 150, ${0.42 - i * 0.07})`;
          ctx.beginPath();
          ctx.arc(x + r * 0.7 * i, y - r * 0.6 * i, r * (0.5 + i * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'glacier': {
        this.blob(ctx, x, y, r * 2.8, rnd, '#6d6a5e');
        ctx.fillStyle = '#e6f1f6';
        ctx.beginPath();
        ctx.moveTo(x - r * 1.6, y - r * 1.4);
        ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.6, x + r * 1.4, y - r * 1.1);
        ctx.quadraticCurveTo(x + r * 0.6, y, x + r * 0.5, y + r * 1.4);
        ctx.lineTo(x - r * 0.4, y + r * 1.5);
        ctx.quadraticCurveTo(x - r * 0.5, y, x - r * 1.6, y - r * 1.4);
        ctx.fill();
        ctx.strokeStyle = '#7fb6d1';
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(x + i * r * 0.3 - r * 0.2, y - r * 0.6);
          ctx.lineTo(x + i * r * 0.25, y + r * 1.0);
        }
        ctx.stroke();
        break;
      }
      case 'city_lights': {
        this.blob(ctx, x, y, r * 2.6, rnd, '#4b5a45');
        break;
      }
      case 'algae_bloom': {
        ctx.save();
        ctx.translate(x, y);
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = i % 2 ? 'rgba(80, 200, 160, 0.75)' : 'rgba(120, 220, 120, 0.7)';
          ctx.lineWidth = r * 0.35;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(r * 0.2 * i - r * 0.3, r * 0.15 * i - r * 0.2, r * (0.8 + i * 0.3), 0.3 + i, 2.6 + i);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
    }
  }

  private cityLights(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    // Warm dots along a few road lines; small and crisp, no glow.
    const rnd = mulberry32(Math.round(x * 31 + y * 17));
    ctx.strokeStyle = 'rgba(255, 206, 131, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI;
      ctx.moveTo(x - Math.cos(a) * r * 1.6, y - Math.sin(a) * r * 1.6);
      ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6);
    }
    ctx.stroke();
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.pow(rnd(), 1.6) * r * 1.5;
      ctx.fillStyle = rnd() < 0.7 ? '#ffce83' : '#fff1c9';
      ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 1.6);
    }
  }

  // ───────────── per frame ─────────────

  private frameStatus(o: ShotOutcome): Status | 'info' {
    return o === 'good' ? 'good' : o === 'cloudy' || o === 'framing' ? 'warn' : 'info';
  }

  draw(f: Mg21Frame) {
    const { c, sim, opts } = this;
    const { ctx, pal } = c;
    const t = opts.t;
    const fr = this.field;
    c.begin();

    // ── ground ── (a rectangular clip is cheap; the rounded corners are a cached overlay)
    ctx.save();
    ctx.beginPath();
    ctx.rect(fr.x, fr.y, fr.w, fr.h);
    ctx.clip();
    const dpr = c.dpr;
    if (this.ground) {
      // 1:1 device-pixel copy at whole-pixel offsets: the fast path on every renderer.
      const sTop = sim.s + this.frameRow / this.k;
      const srcY = Math.round((this.groundTopS - sTop) * this.k * this.groundScale);
      const dx = Math.round(fr.x * dpr);
      const dy = Math.round(fr.y * dpr);
      const h = Math.min(Math.round(fr.h * dpr), this.ground.height - Math.max(0, srcY));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (h > 0) ctx.drawImage(this.ground, 0, Math.max(0, srcY), this.ground.width, h, dx, dy + Math.max(0, -srcY), this.ground.width, h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Clouds over targets (drifting) and decorative clouds.
    const cs = this.cloudSprite;
    const ts = sim.timeS;
    if (cs) {
      // Clouds use sprites pre-scaled to their size, copied 1:1 at whole device pixels.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const tg of sim.scene.targets) {
        if (!tg.cloud || sim.config.radar) continue;
        const y = this.sy(tg.s);
        if (y < fr.y - this.k || y > fr.y + fr.h + this.k) continue;
        const sp = this.sprite(sim.config.cloudR * 2.3 * this.k, 1);
        ctx.drawImage(sp, Math.round((this.sx(tg.x + cloudOffset(tg, ts))) * dpr - sp.width / 2), Math.round(y * dpr - sp.height / 2));
      }
      const cl = sim.scene.clouds;
      const n = opts.reducedMotion ? cl.length / 8 : cl.length / 4;
      for (let i = 0; i < n; i++) {
        const y = this.sy(cl[i * 4]!);
        if (y < fr.y - this.k || y > fr.y + fr.h + this.k) continue;
        const sp = this.sprite(cl[i * 4 + 2]! * 2.4 * this.k, 0.85);
        ctx.drawImage(sp, Math.round(this.sx(cl[i * 4 + 1]! + cl[i * 4 + 3]! * ts) * dpr - sp.width / 2), Math.round(y * dpr - sp.height / 2));
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Swath edges and the ground track (nadir line).
    ctx.strokeStyle = withAlpha(pal.ceramic, 0.22);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    for (const x of [-1, 1]) {
      ctx.moveTo(this.sx(x), fr.y);
      ctx.lineTo(this.sx(x), fr.y + fr.h);
    }
    ctx.stroke();
    ctx.strokeStyle = withAlpha(pal.accent, 0.5);
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(this.sx(0), fr.y);
    ctx.lineTo(this.sx(0), fr.y + fr.h);
    ctx.stroke();
    ctx.setLineDash([]);
    // Target rings for targets still to capture (a light marker, not a beam).
    for (const tg of sim.scene.targets) {
      const y = this.sy(tg.s);
      if (y < fr.y - 20 || y > fr.y + fr.h + 20) continue;
      const x = this.sx(tg.x);
      const r = TARGET_R * this.k * 1.9;
      ctx.lineWidth = 1.5;
      if (tg.captured) {
        ctx.strokeStyle = pal.good;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = withAlpha(pal.ceramic, 0.6);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Satellite at nadir, small and top-down (two wings, bus).
    {
      const x = this.sx(0);
      const y = fr.y + this.frameRow;
      const s = Math.max(3, this.k * 0.035);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(30, 50, 90, 0.9)';
      ctx.fillRect(x - s * 4.2, y - s * 0.7, s * 3, s * 1.4);
      ctx.fillRect(x + s * 1.2, y - s * 0.7, s * 3, s * 1.4);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - s * 4.2, y - s * 0.7, s * 3, s * 1.4);
      ctx.strokeRect(x + s * 1.2, y - s * 0.7, s * 3, s * 1.4);
      ctx.fillStyle = '#d0a752';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.globalAlpha = 1;
    }
    // Camera frame: corner brackets; solid green when a snap would be good, dashed amber when
    // the target is clouded or not fully inside, thin Signal otherwise.
    const w = sim.wouldGet();
    const st = this.frameStatus(w.outcome);
    const fx = this.sx(sim.fx);
    const fy = fr.y + this.frameRow;
    const hw = sim.config.frameHalfW * this.k;
    const hh = sim.config.frameHalfH * this.k;
    const col = st === 'good' ? pal.good : st === 'warn' ? pal.warn : pal.accentStrong;
    ctx.fillStyle = withAlpha(col, st === 'good' ? 0.12 : 0.06);
    ctx.fillRect(fx - hw, fy - hh, hw * 2, hh * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = opts.compact ? 2 : 3;
    if (st === 'warn') ctx.setLineDash([6, 4]);
    const L = Math.min(hw, hh) * 0.45;
    ctx.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const cx = fx + sx * hw;
      const cy = fy + sy * hh;
      ctx.moveTo(cx - sx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy - sy * L);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx - 7, fy);
    ctx.lineTo(fx + 7, fy);
    ctx.moveTo(fx, fy - 7);
    ctx.lineTo(fx, fy + 7);
    ctx.stroke();
    // Shutter flash (an outline in reduced motion, never a full-screen flash).
    const last = sim.lastShot;
    if (last && sim.step - last.step < 14) {
      const a = 1 - (sim.step - last.step) / 14;
      if (opts.reducedMotion) {
        ctx.strokeStyle = withAlpha(pal.ceramic, 0.9);
        ctx.lineWidth = 3;
        ctx.strokeRect(fx - hw - 4, fy - hh - 4, hw * 2 + 8, hh * 2 + 8);
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * a})`;
        ctx.fillRect(fx - hw, fy - hh, hw * 2, hh * 2);
      }
    }
    // Mode badge: optical or radar, day or night under the frame.
    if (!opts.compact) {
      const nightNow = sim.scene.dayFirst ? sim.s > sim.scene.terminatorS : sim.s < sim.scene.terminatorS;
      const px = c.px(11, 1.3);
      const badge: Rect = { x: fr.x, y: fr.y, w: fr.w, h: px + 24 };
      this.badgeL.blit(badge, `${sim.config.radar}:${nightNow}`, () => {
        const bctx = c.ctx;
        const label = `${t(sim.config.radar ? 'minigame.MG-21.mode.radar' : 'minigame.MG-21.mode.optical')} · ${t(nightNow ? 'minigame.MG-21.mode.night' : 'minigame.MG-21.mode.day')}`;
        bctx.font = c.font(px, 800, true);
        const bw = Math.min(fr.w - 20, bctx.measureText(label).width + 18);
        const bx = c.rtl ? fr.x + fr.w - 10 - bw : fr.x + 10;
        pathRoundRect(bctx, { x: bx, y: fr.y + 10, w: bw, h: px + 12 }, 8);
        bctx.fillStyle = withAlpha(pal.bg0, 0.85);
        bctx.fill();
        bctx.strokeStyle = pal.lineStrong;
        bctx.lineWidth = 1;
        bctx.stroke();
        c.text(label, bx + bw / 2, fr.y + 10 + (px + 12) / 2 + 1, bw - 12, px, 800, pal.text, 'center', true);
      });
    }
    ctx.restore();
    // Rounded corners (masked in the background colour) and the outline, cached.
    this.borderL.blit(fr, 'border', () => {
      const bctx = c.ctx;
      bctx.beginPath();
      bctx.rect(fr.x, fr.y, fr.w, fr.h);
      pathRoundRect(bctx, fr, 12, false);
      bctx.fillStyle = pal.bg0;
      bctx.fill('evenodd');
      bctx.lineWidth = 1;
      bctx.strokeStyle = 'rgba(150, 205, 228, 0.3)';
      pathRoundRect(bctx, { x: fr.x + 0.5, y: fr.y + 0.5, w: fr.w - 1, h: fr.h - 1 }, 12);
      bctx.stroke();
    });

    if (f.finger) c.finger(f.finger.x, f.finger.y, f.finger.pressed, opts.compact);
    if (opts.compact) {
      if (f.pausedText) c.overlay(f.pausedText);
      return;
    }

    // ── shutter button ──
    {
      const sh = this.shutter;
      const ready = sim.shutter === 0;
      ctx.fillStyle = withAlpha(pal.bg0, 0.8);
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r + 4, 0, Math.PI * 2);
      ctx.fill();
      const bg = ctx.createRadialGradient(sh.x - sh.r * 0.35, sh.y - sh.r * 0.45, sh.r * 0.1, sh.x, sh.y, sh.r);
      bg.addColorStop(0, ready ? '#ffffff' : '#c9d3da');
      bg.addColorStop(0.6, ready ? pal.ceramic : pal.dim);
      bg.addColorStop(1, ready ? '#9fb0bc' : '#6f8696');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = st === 'good' ? pal.good : pal.lineStrong;
      ctx.lineWidth = 3;
      ctx.stroke();
      // Aperture glyph.
      ctx.strokeStyle = pal.bg0;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r * 0.45, 0, Math.PI * 2);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(sh.x + Math.cos(a) * sh.r * 0.45, sh.y + Math.sin(a) * sh.r * 0.45);
        ctx.lineTo(sh.x + Math.cos(a + 1.2) * sh.r * 0.2, sh.y + Math.sin(a + 1.2) * sh.r * 0.2);
      }
      ctx.stroke();
    }

    // ── readouts and status strip (cached; repainted when their text changes) ──
    const need = sim.config.goodMin;
    const next = sim.nextTarget();
    const secs = next ? Math.max(0, (next.s - sim.s) / sim.config.speed) : 0;
    const secsText = next ? (secs < 0.05 ? fmt(0, 1, 1) : fmt(secs, 1, 1)) : '';
    let sKey: string;
    let sStatus: Status | 'info';
    let sArgs: Record<string, string | number> | undefined;
    if (last && sim.step - last.step < SHOT_FLASH_STEPS) {
      const name = last.target >= 0 ? t(`minigame.MG-21.target.${sim.scene.targets[last.target]!.type}`) : '';
      sArgs = { target: name };
      sStatus = last.outcome === 'good' ? 'good' : last.outcome === 'empty' ? 'bad' : 'warn';
      sKey = `minigame.MG-21.shot.${last.outcome}`;
    } else {
      sStatus = st;
      sKey = w.outcome === 'good' ? 'minigame.MG-21.status.snap' : w.outcome === 'cloudy' ? 'minigame.MG-21.status.cloudy' : w.outcome === 'framing' ? 'minigame.MG-21.status.framing' : w.outcome === 'again' ? 'minigame.MG-21.status.again' : 'minigame.MG-21.status.empty';
    }
    const top: Rect = { x: 0, y: 0, w: c.W, h: this.strip.y + this.strip.h + 2 };
    const topKey = `${sim.good}|${need}|${next ? next.type : '-'}|${secsText}|${sKey}|${sArgs ? sArgs.target : ''}|${sStatus}`;
    this.topL.blit(top, topKey, () => {
      const lctx = c.ctx;
      const gap = 8;
      const tw = (this.hud.w - gap) / 2;
      const a: Rect = { x: this.hud.x, y: this.hud.y, w: tw, h: this.hud.h };
      const b: Rect = { x: this.hud.x + tw + gap, y: this.hud.y, w: tw, h: this.hud.h };
      const [first, second] = c.rtl ? [b, a] : [a, b];
      const ok = sim.good >= need;
      c.readout(first, `${t('minigame.MG-21.hud.good')} · ${t('minigame.MG-21.hud.need', { n: need })}`, fmt(sim.good, 0), t('minigame.MG-21.hud.of', { n: sim.scene.targets.length }), ok ? pal.good : pal.text, ok ? 'good' : undefined);
      if (next) c.readout(second, `${t('minigame.MG-21.hud.next')}: ${t(`minigame.MG-21.target.${next.type}`)}`, secsText, 's', pal.text);
      else c.readout(second, t('minigame.MG-21.hud.next'), t('minigame.MG-21.hud.none'), '', pal.dim);
      const label = t(sKey, sArgs);
      if (sStatus === 'info') {
        paintGlass(lctx, this.strip, 12, pal, { deep: true, tint: pal.accent, tintAlpha: 0.08, edge: withAlpha(pal.accent, 0.7), edgeWidth: 1.5 });
        c.text(label, this.strip.x + this.strip.w / 2, this.strip.y + this.strip.h / 2 + 1, this.strip.w - 24, c.px(15.5, 1.5), 600, pal.text, 'center');
      } else c.statusStrip(this.strip, sStatus, label);
    });

    // ── image tiles (one slot per target) and the hint, cached ──
    let tilesKey = f.active ? 'A' : 'a';
    for (const tg of sim.scene.targets) tilesKey += tg.captured ? 'c' : tg.s < sim.s - sim.config.frameHalfH ? 'x' : '.';
    const bottom: Rect = { x: 0, y: this.tilesR.y - 2, w: c.W, h: c.H - this.tilesR.y + 2 };
    this.botL.blit(bottom, tilesKey, () => {
      this.drawTiles();
      c.hint(this.hintR, t(sim.config.oneButton ? 'minigame.MG-21.hint.press' : 'minigame.MG-21.hint.drag'), f.active);
    });
    if (f.pausedText) c.overlay(f.pausedText);
  }

  private drawTiles() {
    const { c, sim } = this;
    const { ctx, pal } = c;
    const n = sim.scene.targets.length;
    const tr = this.tilesR;
    const gap = 6;
    const size = Math.min(tr.h, (tr.w - gap * (n - 1)) / n);
    const total = n * size + (n - 1) * gap;
    const x0 = tr.x + (tr.w - total) / 2;
    for (let i = 0; i < n; i++) {
      const tg = sim.scene.targets[c.rtl ? n - 1 - i : i]!;
      const r: Rect = { x: x0 + i * (size + gap), y: tr.y + (tr.h - size) / 2, w: size, h: size };
      const passed = !tg.captured && tg.s < sim.s - sim.config.frameHalfH;
      if (tg.captured && this.ground) {
        // The photo is the real crop of the ground under the frame (greyscale for radar).
        ctx.save();
        pathRoundRect(ctx, r, 8);
        ctx.clip();
        const crop = TARGET_R * 3.2 * this.k;
        const gx = (this.field.w / 2 + tg.x * this.k - crop / 2) * this.groundScale;
        const gy = ((this.groundTopS - tg.s) * this.k - crop / 2) * this.groundScale;
        if (sim.config.radar) ctx.filter = 'grayscale(1) contrast(1.25)';
        ctx.drawImage(this.ground, gx, gy, crop * this.groundScale, crop * this.groundScale, r.x, r.y, r.w, r.h);
        ctx.filter = 'none';
        ctx.restore();
        c.statusBorder(r, 'good', 8, 2);
        c.statusIcon('good', r.x + r.w - 9, r.y + 9, 14);
      } else if (passed) {
        pathRoundRect(ctx, r, 8);
        ctx.fillStyle = pal.bg1;
        ctx.fill();
        c.statusBorder(r, 'bad', 8, 2);
        c.statusIcon('bad', r.x + r.w / 2, r.y + r.h / 2, Math.min(22, size * 0.4));
      } else {
        pathRoundRect(ctx, r, 8);
        ctx.fillStyle = pal.bg1;
        ctx.fill();
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = pal.lineStrong;
        ctx.lineWidth = 1.5;
        pathRoundRect(ctx, r, 8);
        ctx.stroke();
        ctx.restore();
        c.text(fmt(tg.index + 1, 0), r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 6, c.px(13, 1.3), 800, pal.faint, 'center', true);
      }
    }
  }

  /** Along-track position on screen of the frame row (for input). */
  get frameY(): number {
    return this.field.y + this.frameRow;
  }
}
