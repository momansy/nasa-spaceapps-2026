// Canvas art shared by every launch and orbit minigame (MG-07 … MG-21), so the canvases match
// the phone UI and the approved key art (orchestration/VISUAL_TARGET.md, frames 03 and 04):
//   • theme fonts for canvas text: IBM Plex Sans (tabular figures by default in the bundled
//     subset, every digit advance is 600 units) and Oxanium for titles, loaded with FontFace from
//     the bundled WOFF files; canvases stay transparent until the fonts are in, so the first
//     visible frame never shows a fallback face;
//   • the stage behind each playfield: the theme's own Earth-limb key art (bg-limb.webp, the
//     minigame screen's backdrop), a low star field and a slow navy vignette;
//   • glass panels, bars and arc gauges in the language of the new UI (theme tokens --glass,
//     --glass-edge, --glass-hi; no blur, depth from opacity, gradients and edge highlights);
//   • a shaded hardware kit: satin ceramic-white shells with one broad soft highlight, a cool
//     navy fill side and a warm 4500 K rim light, panel seams in raking light, teal bands with a
//     silver edge, brushed-silver interstages, dark graphite bells with a bronze inner rim and a
//     heat glow at the throat, and layered plumes (bloom, flame, white core, shock diamonds).
// Every number here is a game_value art choice, not a physical quantity. Nothing in this module
// touches the DOM at import time, so the pure model tests can import the kits in Node.
import plexSans400 from '../../../assets/fonts/plex-sans-400.woff';
import plexSans600 from '../../../assets/fonts/plex-sans-600.woff';
import oxanium700 from '../../../assets/fonts/oxanium-700.woff';
import limbArt from '../../../assets/art/bg-limb.webp';

export interface ArtRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Colours the art needs from the theme (both kits' palettes satisfy this). */
export interface ArtPalette {
  bg0: string;
  bg1: string;
  accent: string;
  sun: string;
  ocean: string;
  text: string;
}

// ───────────────────────── fonts ─────────────────────────

/** UI face (Plex Sans, tabular figures) with the theme's fallback stack. */
export const FONT_UI = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', 'Noto Sans Arabic', Tahoma, Arial, sans-serif";
/** Display face for titles and hero numbers. */
export const FONT_DISPLAY = "'MF Oxanium', 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Arabic', Tahoma, Arial, sans-serif";

/**
 * Canvas weights mapped onto the bundled cuts: Plex Sans ships 400 and 600, so every "bold"
 * weight the minigames ask for (700 … 900) draws as the 600 semibold the UI uses.
 */
export function uiWeight(w: number): number {
  return w >= 560 ? 600 : w >= 450 ? 500 : 400;
}

/** A canvas font string in the UI face. */
export function uiFont(px: number, weight: number, family = FONT_UI): string {
  return `${uiWeight(weight)} ${Math.round(px * 10) / 10}px ${family}`;
}

let assetEpoch = 0;
let fontsDone = false;
let fontsPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Changes whenever a font or the stage art finishes loading (cached layers must repaint). */
export function artEpoch(): number {
  return assetEpoch;
}

function bump() {
  assetEpoch++;
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch {
      /* a listener of a destroyed minigame */
    }
  }
}

/** Calls `cb` when fonts or art arrive; returns the unsubscribe function. */
export function onArtChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function canvasFontsReady(): boolean {
  return fontsDone;
}

/**
 * Loads the theme faces through FontFace from the bundled files and adds them to the document
 * (the CSS @font-face rules only load a face when DOM text uses it, which canvas text does not
 * do in time). Resolves when all three faces are in, or after `timeoutMs` at the latest.
 */
export function loadCanvasFonts(timeoutMs = 2500): Promise<void> {
  if (fontsPromise) return fontsPromise;
  const fonts = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  if (!fonts || typeof FontFace !== 'function') {
    fontsDone = true;
    fontsPromise = Promise.resolve();
    return fontsPromise;
  }
  const faces: Array<[string, string, string]> = [
    ['IBM Plex Sans', plexSans400, '300 500'],
    ['IBM Plex Sans', plexSans600, '600 800'],
    ['MF Oxanium', oxanium700, '400 800'],
  ];
  const loads = faces.map(([family, url, weight]) => {
    try {
      const face = new FontFace(family, `url(${url}) format('woff')`, { weight, style: 'normal', display: 'block' });
      return face
        .load()
        .then((f) => {
          fonts.add(f);
        })
        .catch(() => undefined);
    } catch {
      return Promise.resolve();
    }
  });
  const timeout = new Promise<void>((res) => setTimeout(res, timeoutMs));
  fontsPromise = Promise.race([Promise.all(loads).then(() => undefined), timeout]).then(() => {
    fontsDone = true;
    bump();
  });
  return fontsPromise;
}

/**
 * Keeps a fresh canvas invisible until the theme fonts are loaded and one frame has been drawn
 * with them, then fades it in (150 ms opacity, allowed in reduced motion). Opacity, not
 * visibility, so input and hit testing work from the first moment.
 */
export function revealWhenFontsReady(canvas: HTMLCanvasElement) {
  if (canvasFontsReady()) return;
  const s = canvas.style;
  s.opacity = '0';
  void loadCanvasFonts().then(() => {
    const show = () => {
      s.transition = 'opacity 150ms cubic-bezier(0.33, 1, 0.68, 1)';
      s.opacity = '';
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(show));
    else show();
  });
}

// ───────────────────────── colour helpers ─────────────────────────

/** `#rrggbb` + alpha → rgba(). Other colour syntaxes are returned unchanged. */
export function rgba(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** True while the page is in high-contrast mode (no imagery, opaque surfaces). */
export function highContrast(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.contrast === 'high';
}

export function roundRectPath(ctx: CanvasRenderingContext2D, r: ArtRect, radius: number) {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.lineTo(r.x + r.w - rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + rad, rad);
  ctx.lineTo(r.x + r.w, r.y + r.h - rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h, rad);
  ctx.lineTo(r.x + rad, r.y + r.h);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - rad, rad);
  ctx.lineTo(r.x, r.y + rad);
  ctx.arcTo(r.x, r.y, r.x + rad, r.y, rad);
  ctx.closePath();
}

// ───────────────────────── stage background ─────────────────────────

let artImg: HTMLImageElement | null = null;
let artReady = false;

function stageArt(): HTMLImageElement | null {
  if (typeof Image !== 'function') return null;
  if (!artImg) {
    artImg = new Image();
    artImg.decoding = 'async';
    artImg.onload = () => {
      artReady = true;
      bump();
    };
    artImg.src = limbArt;
  }
  return artReady ? artImg : null;
}

/** Deterministic star field (no random at draw time): x, y in 0–1, size, alpha. */
function stars(ctx: CanvasRenderingContext2D, r: ArtRect, density: number, maxY: number, color = '#e8eef0') {
  const n = Math.round((r.w * r.h * density) / 10000);
  for (let i = 0; i < n; i++) {
    const fx = ((i * 7919 + 13) % 997) / 997;
    const fy = ((i * 104729 + 7) % 991) / 991;
    const k = (i * 37) % 11;
    const size = k === 0 ? 1.7 : k < 4 ? 1.15 : 0.8;
    ctx.fillStyle = rgba(color, k === 0 ? 0.85 : 0.25 + (k % 5) * 0.09);
    ctx.fillRect(r.x + fx * r.w, r.y + fy * r.h * maxY, size, size);
  }
}

/**
 * The stage behind a whole playfield: the minigame screen's key art (Earth limb at the bottom,
 * deep navy space above), toned down so glass panels and text keep AA contrast, plus a few stars
 * and a vignette into navy at the edges. High contrast: plain black.
 */
export function paintStage(ctx: CanvasRenderingContext2D, W: number, H: number, pal: ArtPalette) {
  if (highContrast()) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#040b15');
  base.addColorStop(0.55, pal.bg0);
  base.addColorStop(1, '#0a2033');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const img = stageArt();
  if (img && img.naturalWidth > 0) {
    // Cover, anchored at the bottom (the limb), like `.bd[data-scene='limb']`.
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(img, (W - dw) / 2, H - dh, dw, dh);
    ctx.globalAlpha = 1;
  } else {
    stars(ctx, { x: 0, y: 0, w: W, h: H }, 1.1, 0.8);
  }
  // Limb glow (theme .bd__glow) and a slow vignette into navy.
  const glow = ctx.createRadialGradient(W / 2, H * 1.15, 0, W / 2, H * 1.15, Math.max(W, H) * 0.7);
  glow.addColorStop(0, rgba(pal.accent, 0.16));
  glow.addColorStop(0.6, rgba(pal.ocean, 0.06));
  glow.addColorStop(1, rgba(pal.ocean, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const vig = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(4, 12, 22, 0)');
  vig.addColorStop(1, 'rgba(4, 12, 22, 0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

/**
 * The same stage as `paintStage`, given to the canvas element as its CSS background, so the
 * compositor shows it under the transparent canvas at no per-frame drawing cost (a full-screen
 * blit per frame costs too much on slow phones). High contrast: plain black. Called when the
 * canvas is made and on every re-measure, so a contrast switch applies.
 */
export function applyStageBackground(canvas: HTMLCanvasElement) {
  const st = canvas.style;
  if (highContrast()) {
    st.background = '#000000';
    return;
  }
  st.background = [
    'radial-gradient(120% 80% at 50% 45%, rgba(4, 12, 22, 0) 45%, rgba(4, 12, 22, 0.55) 100%)',
    'radial-gradient(70% 45% at 50% 115%, rgba(85, 197, 205, 0.16), rgba(23, 104, 135, 0.06) 60%, rgba(23, 104, 135, 0) 100%)',
    `url("${limbArt}") center bottom / cover no-repeat`,
    'linear-gradient(180deg, #040b15, #071522 55%, #0a2033)',
  ].join(', ');
}

/**
 * A scene window (sky, Earth limb, sun) in the key-art style: deep space at the top, a curved
 * limb with a blue atmosphere that fades through teal into a warm horizon line, soft cloud
 * banks on the lit side, night-side city lights, and a sun flare. `horizon` is the limb height
 * as a fraction of `r` (> 1 hides the limb, only its glow shows). Caller clips.
 */
export function paintSky(ctx: CanvasRenderingContext2D, r: ArtRect, pal: ArtPalette, horizon: number, sun: 'left' | 'right' | null) {
  if (highContrast()) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    return;
  }
  const hy = r.y + r.h * horizon;
  const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  const hz = Math.max(0.12, Math.min(1, horizon));
  sky.addColorStop(0, '#030913');
  sky.addColorStop(Math.max(0.05, hz - 0.45), '#071a2c');
  sky.addColorStop(Math.max(0.08, hz - 0.12), '#0f3550');
  sky.addColorStop(hz, '#1d5d80');
  sky.addColorStop(1, '#1d5d80');
  ctx.fillStyle = sky;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  stars(ctx, r, 1.3, Math.max(0.2, Math.min(1, horizon) - 0.2));

  const sunX = sun === 'left' ? r.x + r.w * 0.08 : r.x + r.w * 0.92;
  const R = r.w * 2.4;
  const cx = r.x + r.w * 0.5;
  const cy = hy + R;
  // Atmosphere: a thick blue haze above the limb and a thin bright rim.
  const haze = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.075);
  haze.addColorStop(0, 'rgba(120, 200, 255, 0.55)');
  haze.addColorStop(0.18, 'rgba(70, 160, 230, 0.32)');
  haze.addColorStop(0.5, 'rgba(40, 110, 180, 0.12)');
  haze.addColorStop(1, 'rgba(30, 80, 140, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(r.x, Math.max(r.y, hy - R * 0.09), r.w, r.h);
  if (horizon <= 1.02) {
    const earth = ctx.createLinearGradient(0, hy, 0, hy + Math.max(40, r.h * 0.45));
    earth.addColorStop(0, '#3d93c4');
    earth.addColorStop(0.08, '#1f6c9a');
    earth.addColorStop(0.45, '#123f62');
    earth.addColorStop(1, '#0a2740');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = earth;
    ctx.fill();
    ctx.clip();
    // Cloud banks: soft white ellipses, denser on the sun side (fixed pattern).
    const depth = Math.max(30, r.y + r.h - hy);
    for (let i = 0; i < 26; i++) {
      const fx = ((i * 7919) % 101) / 101;
      const fy = ((i * 3571) % 97) / 97;
      const x = r.x + fx * r.w;
      const y = hy + 3 + fy * fy * depth;
      const towardSun = 1 - Math.abs(x - sunX) / r.w;
      const w = (14 + ((i * 13) % 23)) * (0.6 + fy) * (r.w / 320);
      const g = ctx.createRadialGradient(x, y, 0, x, y, w);
      g.addColorStop(0, `rgba(236, 244, 250, ${0.18 + 0.32 * towardSun})`);
      g.addColorStop(1, 'rgba(236, 244, 250, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * (0.22 + fy * 0.25), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ocean glint under the sun.
    if (sun) {
      const gl = ctx.createRadialGradient(sunX, hy + depth * 0.18, 0, sunX, hy + depth * 0.18, r.w * 0.35);
      gl.addColorStop(0, rgba(pal.sun, 0.35));
      gl.addColorStop(1, rgba(pal.sun, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(r.x, hy, r.w, depth);
    }
    // Shade towards the bottom (curvature).
    const sh = ctx.createLinearGradient(0, hy, 0, r.y + r.h);
    sh.addColorStop(0, 'rgba(5, 15, 28, 0)');
    sh.addColorStop(1, 'rgba(5, 15, 28, 0.45)');
    ctx.fillStyle = sh;
    ctx.fillRect(r.x, hy, r.w, r.y + r.h - hy);
    ctx.restore();
    // Bright atmosphere rim with a warm horizon band on the sun side.
    const rim = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    const warmAt = sun === 'left' ? 0 : 1;
    rim.addColorStop(warmAt, rgba(pal.sun, 0.95));
    rim.addColorStop(0.5, 'rgba(150, 220, 255, 0.85)');
    rim.addColorStop(1 - warmAt, 'rgba(110, 190, 240, 0.5)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 0.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(0, r.y + r.h * 0.55, 0, r.y + r.h);
    g.addColorStop(0, 'rgba(60, 150, 210, 0)');
    g.addColorStop(1, `rgba(60, 150, 210, ${Math.max(0, 0.32 - (horizon - 1) * 0.8)})`);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  if (sun) {
    const sy = Math.min(hy - r.h * 0.05, r.y + r.h * 0.12);
    const flare = ctx.createRadialGradient(sunX, sy, 0, sunX, sy, r.w * 0.55);
    flare.addColorStop(0, 'rgba(255, 248, 230, 0.95)');
    flare.addColorStop(0.03, rgba(pal.sun, 0.8));
    flare.addColorStop(0.12, rgba(pal.sun, 0.28));
    flare.addColorStop(0.45, rgba(pal.sun, 0.06));
    flare.addColorStop(1, rgba(pal.sun, 0));
    ctx.fillStyle = flare;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  // Vignette into navy.
  const vig = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h * 0.45, Math.min(r.w, r.h) * 0.3, r.x + r.w / 2, r.y + r.h * 0.45, Math.max(r.w, r.h) * 0.8);
  vig.addColorStop(0, 'rgba(3, 10, 20, 0)');
  vig.addColorStop(1, 'rgba(3, 10, 20, 0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

// ───────────────────────── glass surfaces ─────────────────────────

export interface GlassStyle {
  /** Tint colour mixed over the glass (status strips, selected cards). */
  tint?: string;
  tintAlpha?: number;
  /** Deeper, more opaque glass for dense readouts (theme --glass-deep). */
  deep?: boolean;
  /** Outline colour instead of the glass edge. */
  edge?: string;
  edgeWidth?: number;
}

/**
 * The e2 glass panel of the UI, drawn on canvas: translucent console navy (theme --glass, 78 →
 * 86 %), a 1 px glass edge, a top highlight that fades down the sides, and a faint signal sheen
 * in the top corner. High contrast: opaque black with a strong outline.
 */
export function paintGlass(ctx: CanvasRenderingContext2D, r: ArtRect, radius: number, pal: ArtPalette, o: GlassStyle = {}) {
  if (r.w <= 0 || r.h <= 0) return;
  const hc = highContrast();
  roundRectPath(ctx, r, radius);
  if (hc) {
    ctx.fillStyle = '#000000';
    ctx.fill();
  } else {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (o.deep) {
      g.addColorStop(0, 'rgba(16, 40, 60, 0.9)');
      g.addColorStop(1, 'rgba(6, 18, 30, 0.93)');
    } else {
      g.addColorStop(0, 'rgba(24, 56, 82, 0.8)');
      g.addColorStop(1, 'rgba(11, 30, 47, 0.88)');
    }
    ctx.fillStyle = g;
    ctx.fill();
    if (r.w > 40 && r.h > 30) {
      const sheen = ctx.createRadialGradient(r.x + r.w * 0.15, r.y, 0, r.x + r.w * 0.15, r.y, Math.max(r.w, r.h) * 0.8);
      sheen.addColorStop(0, rgba(pal.accent, 0.07));
      sheen.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = sheen;
      ctx.fill();
    }
  }
  if (o.tint) {
    ctx.fillStyle = rgba(o.tint, o.tintAlpha ?? 0.14);
    ctx.fill();
  }
  ctx.lineWidth = o.edgeWidth ?? 1;
  ctx.strokeStyle = o.edge ?? (hc ? '#9aa7c2' : 'rgba(150, 205, 228, 0.2)');
  ctx.stroke();
  if (!hc && r.h > 18 && r.w > 24) {
    // Top highlight (theme --glass-hi), strongest at the top edge.
    ctx.save();
    roundRectPath(ctx, { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 }, Math.max(0, radius - 0.5));
    ctx.clip();
    const hi = ctx.createLinearGradient(0, r.y, 0, r.y + Math.min(r.h, 40));
    hi.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    hi.addColorStop(0.08, 'rgba(255, 255, 255, 0.05)');
    hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = hi;
    ctx.lineWidth = 2;
    roundRectPath(ctx, { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 }, Math.max(0, radius - 0.5));
    ctx.stroke();
    ctx.restore();
  }
}

const glassCache = new Map<string, HTMLCanvasElement>();

/**
 * `paintGlass` through a sprite cache: each panel size and style is painted once at the device
 * resolution and then blitted, so read-outs and strips redrawn every frame cost one drawImage
 * instead of three gradients, a clip and two strokes (needed for 30 fps at a ×4 CPU throttle).
 */
export function drawGlass(ctx: CanvasRenderingContext2D, r: ArtRect, radius: number, pal: ArtPalette, o: GlassStyle = {}, dpr = 1) {
  if (r.w <= 0 || r.h <= 0) return;
  if (typeof document === 'undefined') {
    paintGlass(ctx, r, radius, pal, o);
    return;
  }
  const w = Math.max(1, Math.round(r.w));
  const h = Math.max(1, Math.round(r.h));
  const pad = 2;
  const key = `${w}|${h}|${radius}|${dpr}|${highContrast()}|${pal.accent}|${o.deep ? 1 : 0}|${o.tint ?? ''}|${o.tintAlpha ?? ''}|${o.edge ?? ''}|${o.edgeWidth ?? ''}`;
  let sp = glassCache.get(key);
  if (!sp) {
    sp = document.createElement('canvas');
    sp.width = Math.ceil((w + pad * 2) * dpr);
    sp.height = Math.ceil((h + pad * 2) * dpr);
    const sctx = sp.getContext('2d');
    if (!sctx) {
      paintGlass(ctx, r, radius, pal, o);
      return;
    }
    sctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
    paintGlass(sctx, { x: 0, y: 0, w, h }, radius, pal, o);
    if (glassCache.size > 160) glassCache.clear();
    glassCache.set(key, sp);
  }
  ctx.drawImage(sp, r.x - pad, r.y - pad, w + pad * 2, h + pad * 2);
}

/**
 * A data bar of the UI (VISUAL_TARGET 3.1): rounded track in ceramic at 10 %, a fill with a
 * soft top light. The caller adds hatching for marginal and failing states.
 */
export function paintBarTrack(ctx: CanvasRenderingContext2D, r: ArtRect) {
  roundRectPath(ctx, r, r.h / 2);
  ctx.fillStyle = highContrast() ? '#1a1a1a' : 'rgba(232, 238, 240, 0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232, 238, 240, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function paintBarFill(ctx: CanvasRenderingContext2D, r: ArtRect, color: string) {
  if (r.w <= 0) return;
  roundRectPath(ctx, r, r.h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (!highContrast() && r.h >= 6) {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    ctx.fillStyle = g;
    ctx.fill();
  }
}

/**
 * A 270° arc gauge (VISUAL_TARGET 3.1): track, value arc with round caps, optional threshold
 * tick. `frac` 0–1. Angles start at the lower left and run clockwise.
 */
export function paintArcGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, stroke: number, frac: number, color: string, threshold?: number) {
  const a0 = Math.PI * 0.75;
  const span = Math.PI * 1.5;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = stroke;
  ctx.strokeStyle = highContrast() ? '#333333' : 'rgba(232, 238, 240, 0.1)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, a0, a0 + span);
  ctx.stroke();
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0.001) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, a0, a0 + span * f);
    ctx.stroke();
  }
  if (threshold !== undefined) {
    const a = a0 + span * Math.max(0, Math.min(1, threshold));
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e8eef0';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (radius - stroke * 0.8), cy + Math.sin(a) * (radius - stroke * 0.8));
    ctx.lineTo(cx + Math.cos(a) * (radius + stroke * 0.8), cy + Math.sin(a) * (radius + stroke * 0.8));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A chart plot area in the UI language instead of a debug grid: a deep glass well, faint
 * horizontal guides only (no vertical lattice), and a soft inner shade at the top.
 */
export function paintPlotWell(ctx: CanvasRenderingContext2D, r: ArtRect, radius: number) {
  roundRectPath(ctx, r, radius);
  if (highContrast()) {
    ctx.fillStyle = '#000000';
    ctx.fill();
    return;
  }
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, 'rgba(4, 13, 23, 0.72)');
  g.addColorStop(1, 'rgba(8, 24, 38, 0.5)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 205, 228, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ───────────────────────── hardware kit ─────────────────────────

/** Which side the warm sun rim light is on (key art: low sun, upper right). */
export type SunSide = 1 | -1;

/**
 * The satin ceramic-white shell of the reference vehicle across a cylinder of width `w` centred
 * on x = 0: cool navy fill on the shadow side, one broad soft highlight (never clipped), a warm
 * rim light on the sun side. Returned as a gradient for the caller's path.
 */
export function ceramicGradient(ctx: CanvasRenderingContext2D, w: number, sun: SunSide = 1, x0 = 0): CanvasGradient {
  const g = ctx.createLinearGradient(x0 - (w / 2) * sun, 0, x0 + (w / 2) * sun, 0);
  g.addColorStop(0, '#2f4458');
  g.addColorStop(0.1, '#566e84');
  g.addColorStop(0.26, '#8ea2b3');
  g.addColorStop(0.46, '#c9d5dd');
  g.addColorStop(0.64, '#e8eef1');
  g.addColorStop(0.74, '#eef3f5');
  g.addColorStop(0.85, '#d3dce2');
  g.addColorStop(0.925, '#b4bec6');
  g.addColorStop(0.965, '#f6d3a4');
  g.addColorStop(0.985, '#ffe1b4');
  g.addColorStop(1, '#a8805a');
  return g;
}

/** Brushed silver (interstages, rings): several narrow bands read as anisotropic metal. */
export function silverGradient(ctx: CanvasRenderingContext2D, w: number, sun: SunSide = 1, x0 = 0): CanvasGradient {
  const g = ctx.createLinearGradient(x0 - (w / 2) * sun, 0, x0 + (w / 2) * sun, 0);
  g.addColorStop(0, '#3b4652');
  g.addColorStop(0.18, '#6d7a86');
  g.addColorStop(0.36, '#a9b4bd');
  g.addColorStop(0.46, '#8a96a1');
  g.addColorStop(0.6, '#d7dee3');
  g.addColorStop(0.7, '#b3bdc5');
  g.addColorStop(0.85, '#8e99a3');
  g.addColorStop(0.95, '#e4c8a2');
  g.addColorStop(1, '#8c7356');
  return g;
}

/** Signal teal band: same cylindrical light, teal paint. */
export function tealGradient(ctx: CanvasRenderingContext2D, w: number, sun: SunSide = 1, x0 = 0): CanvasGradient {
  const g = ctx.createLinearGradient(x0 - (w / 2) * sun, 0, x0 + (w / 2) * sun, 0);
  g.addColorStop(0, '#16505a');
  g.addColorStop(0.3, '#2f8e98');
  g.addColorStop(0.62, '#62cdd5');
  g.addColorStop(0.86, '#4fb6bf');
  g.addColorStop(0.97, '#a7e3d6');
  g.addColorStop(1, '#3c8d92');
  return g;
}

/** Dark warm graphite for bells and the thrust section. */
export function graphiteGradient(ctx: CanvasRenderingContext2D, w: number, sun: SunSide = 1, x0 = 0): CanvasGradient {
  const g = ctx.createLinearGradient(x0 - (w / 2) * sun, 0, x0 + (w / 2) * sun, 0);
  g.addColorStop(0, '#15181c');
  g.addColorStop(0.35, '#2c3035');
  g.addColorStop(0.62, '#5a5853');
  g.addColorStop(0.8, '#3a3a38');
  g.addColorStop(0.95, '#7c6448');
  g.addColorStop(1, '#2a2622');
  return g;
}

/** A shaded cylinder section (top y, height h, width w) centred on x = 0. */
export function shellSection(ctx: CanvasRenderingContext2D, top: number, h: number, w: number, fill: CanvasGradient | string) {
  ctx.fillStyle = fill;
  ctx.fillRect(-w / 2, top, w, h);
}

/**
 * A panel seam across a shell at `y`: a dark groove with a light lip below, visible in raking
 * light only (low alpha); the groove curves slightly with the cylinder.
 */
export function seam(ctx: CanvasRenderingContext2D, y: number, w: number, strength = 1) {
  if (w < 6) return;
  const sag = Math.min(2, w * 0.04);
  ctx.lineWidth = Math.max(0.6, Math.min(1, w * 0.03));
  ctx.strokeStyle = `rgba(30, 48, 66, ${0.32 * strength})`;
  ctx.beginPath();
  ctx.moveTo(-w / 2, y);
  ctx.quadraticCurveTo(0, y + sag, w / 2, y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 * strength})`;
  ctx.beginPath();
  ctx.moveTo(-w / 2, y + 1);
  ctx.quadraticCurveTo(0, y + 1 + sag, w / 2, y + 1);
  ctx.stroke();
}

/** A teal band with a slim silver edge above and below. */
export function tealBand(ctx: CanvasRenderingContext2D, top: number, h: number, w: number, sun: SunSide = 1) {
  ctx.fillStyle = tealGradient(ctx, w, sun);
  ctx.fillRect(-w / 2, top, w, h);
  if (h > 2.5) {
    const edge = Math.max(0.7, Math.min(1.4, h * 0.14));
    ctx.fillStyle = silverGradient(ctx, w, sun);
    ctx.fillRect(-w / 2, top, w, edge);
    ctx.fillRect(-w / 2, top + h - edge, w, edge);
  }
}

/**
 * An engine bell: throat (narrow) at `by - bh`, exit (wide) at `by`. Dark warm graphite with
 * a soft highlight, regen-tube hint along the meridians at larger sizes, a bronze inner rim at
 * the exit, and a straw-to-bronze heat tint at the throat while `heat` > 0.
 */
export function engineBell(ctx: CanvasRenderingContext2D, cx: number, by: number, bw: number, bh: number, heat = 0, sun: SunSide = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.17, by - bh);
  ctx.bezierCurveTo(cx - bw * 0.15, by - bh * 0.6, cx - bw * 0.3, by - bh * 0.22, cx - bw * 0.5, by);
  ctx.lineTo(cx + bw * 0.5, by);
  ctx.bezierCurveTo(cx + bw * 0.3, by - bh * 0.22, cx + bw * 0.15, by - bh * 0.6, cx + bw * 0.17, by - bh);
  ctx.closePath();
  ctx.fillStyle = graphiteGradient(ctx, bw, sun, cx);
  ctx.fill();
  ctx.clip();
  if (bw > 14) {
    // Coolant tubes: faint meridian lines converging to the throat.
    ctx.strokeStyle = 'rgba(255, 235, 210, 0.07)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const n = bw > 30 ? 9 : 5;
    for (let i = 1; i < n; i++) {
      const f = i / n - 0.5;
      ctx.moveTo(cx + f * bw * 0.4, by - bh);
      ctx.lineTo(cx + f * bw, by);
    }
    ctx.stroke();
  }
  if (heat > 0.01) {
    const hg = ctx.createLinearGradient(0, by - bh, 0, by);
    hg.addColorStop(0, `rgba(255, 196, 120, ${0.55 * heat})`);
    hg.addColorStop(0.3, `rgba(196, 120, 70, ${0.32 * heat})`);
    hg.addColorStop(0.6, `rgba(120, 90, 160, ${0.12 * heat})`);
    hg.addColorStop(1, 'rgba(120, 90, 160, 0)');
    ctx.fillStyle = hg;
    ctx.fillRect(cx - bw / 2, by - bh, bw, bh);
  }
  ctx.restore();
  // Bronze inner rim at the exit plane.
  const rimH = Math.max(1, bw * 0.08);
  ctx.fillStyle = '#9a6a3c';
  ctx.beginPath();
  ctx.ellipse(cx, by, bw * 0.5, rimH, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = heat > 0.01 ? `rgba(255, 214, 160, ${0.5 + 0.4 * heat})` : '#c8935a';
  ctx.beginPath();
  ctx.ellipse(cx, by, bw * 0.44, rimH * 0.55, 0, 0, Math.PI);
  ctx.fill();
}

export interface PlumeStyle {
  /** Power 0–1 (length and brightness). */
  power: number;
  /** Plume length at full power, px. */
  length: number;
  /** Real time in seconds for the flicker; ignored when `calm`. */
  time?: number;
  calm?: boolean;
  /** Seed so neighbouring engines do not flicker in step. */
  seed?: number;
  /** Vacuum plume: wider and more transparent. */
  vacuum?: boolean;
}

/**
 * A believable kerolox-style plume from an exit of width `pw` at (cx, by), pointing down (+y):
 * additive bloom confined to the flame, a warm translucent outer flame, a white-hot core and,
 * at high power, a few shock diamonds. Uses `lighter` so overlapping plumes add up.
 */
export function plume(ctx: CanvasRenderingContext2D, cx: number, by: number, pw: number, s: PlumeStyle) {
  const p = Math.max(0, Math.min(1, s.power));
  if (p <= 0.01) return;
  const t = s.time ?? 0;
  const seed = s.seed ?? 0;
  const flick = s.calm ? 1 : 1 + 0.05 * Math.sin(t * 37 + seed * 1.7) + 0.035 * Math.sin(t * 61 + seed);
  const len = s.length * (0.35 + 0.65 * p) * flick;
  const spread = s.vacuum ? 1.5 : 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Bloom.
  const by2 = by + len * 0.22;
  const bloom = ctx.createRadialGradient(cx, by2, 0, cx, by2, Math.max(pw, len * 0.55));
  bloom.addColorStop(0, `rgba(255, 190, 110, ${0.42 * p})`);
  bloom.addColorStop(0.4, `rgba(255, 150, 70, ${0.14 * p})`);
  bloom.addColorStop(1, 'rgba(255, 130, 60, 0)');
  ctx.fillStyle = bloom;
  const br = Math.max(pw, len * 0.55);
  ctx.fillRect(cx - br, by2 - br, br * 2, br * 2);
  // Outer flame.
  const outer = ctx.createLinearGradient(0, by, 0, by + len);
  outer.addColorStop(0, `rgba(255, 214, 150, ${0.85 * p})`);
  outer.addColorStop(0.25, `rgba(255, 168, 82, ${0.6 * p})`);
  outer.addColorStop(0.7, `rgba(235, 110, 50, ${0.22 * p})`);
  outer.addColorStop(1, 'rgba(200, 80, 40, 0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(cx - pw * 0.47, by);
  ctx.bezierCurveTo(cx - pw * 0.72 * spread, by + len * 0.3, cx - pw * 0.42 * spread, by + len * 0.75, cx, by + len);
  ctx.bezierCurveTo(cx + pw * 0.42 * spread, by + len * 0.75, cx + pw * 0.72 * spread, by + len * 0.3, cx + pw * 0.47, by);
  ctx.closePath();
  ctx.fill();
  // White-hot core.
  const coreLen = len * (s.vacuum ? 0.3 : 0.42);
  const core = ctx.createLinearGradient(0, by, 0, by + coreLen);
  core.addColorStop(0, `rgba(255, 255, 248, ${0.95 * p})`);
  core.addColorStop(0.5, `rgba(255, 236, 190, ${0.6 * p})`);
  core.addColorStop(1, 'rgba(255, 210, 150, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.moveTo(cx - pw * 0.3, by);
  ctx.quadraticCurveTo(cx - pw * 0.26, by + coreLen * 0.6, cx, by + coreLen);
  ctx.quadraticCurveTo(cx + pw * 0.26, by + coreLen * 0.6, cx + pw * 0.3, by);
  ctx.closePath();
  ctx.fill();
  // Shock diamonds at high power (sea-level style, not on vacuum plumes).
  if (!s.vacuum && p > 0.6 && pw > 5) {
    const a = (p - 0.6) / 0.4;
    for (let i = 0; i < 3; i++) {
      const y = by + len * (0.14 + i * 0.13);
      const r = pw * (0.22 - i * 0.04);
      const d = ctx.createRadialGradient(cx, y, 0, cx, y, r * 2.6);
      d.addColorStop(0, `rgba(255, 246, 225, ${0.32 * a * (1 - i * 0.3)})`);
      d.addColorStop(1, 'rgba(255, 220, 170, 0)');
      ctx.fillStyle = d;
      ctx.beginPath();
      ctx.ellipse(cx, y, r * 1.2, r * 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Soft exhaust trail behind a plume (a widening, fading warm-grey column). Drawn under the
 * vehicle. `dir` is the trail direction in the current transform (default straight down).
 */
export function smokeTrail(ctx: CanvasRenderingContext2D, cx: number, by: number, w: number, len: number, alpha = 0.35) {
  const g = ctx.createLinearGradient(0, by, 0, by + len);
  g.addColorStop(0, `rgba(255, 226, 190, ${alpha})`);
  g.addColorStop(0.35, `rgba(220, 214, 205, ${alpha * 0.55})`);
  g.addColorStop(1, 'rgba(180, 190, 200, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.4, by);
  ctx.bezierCurveTo(cx - w * 0.9, by + len * 0.4, cx - w * 1.6, by + len * 0.8, cx - w * 1.9, by + len);
  ctx.lineTo(cx + w * 1.9, by + len);
  ctx.bezierCurveTo(cx + w * 1.6, by + len * 0.8, cx + w * 0.9, by + len * 0.4, cx + w * 0.4, by);
  ctx.closePath();
  ctx.fill();
}

/**
 * The tapered fairing of the reference vehicle: cylinder then ogive to a rounded tip, ceramic
 * shell with the same light as the stages, the two-halves seam and a silver base ring.
 */
export function fairing(ctx: CanvasRenderingContext2D, base: number, len: number, fw: number, sun: SunSide = 1) {
  ctx.beginPath();
  ctx.moveTo(-fw / 2, base);
  ctx.lineTo(-fw / 2, base - len * 0.42);
  ctx.bezierCurveTo(-fw / 2, base - len * 0.82, -fw * 0.14, base - len, 0, base - len);
  ctx.bezierCurveTo(fw * 0.14, base - len, fw / 2, base - len * 0.82, fw / 2, base - len * 0.42);
  ctx.lineTo(fw / 2, base);
  ctx.closePath();
  ctx.fillStyle = ceramicGradient(ctx, fw, sun);
  ctx.fill();
  // Ogive shading: the nose darkens a little towards the tip on the shadow side.
  ctx.save();
  ctx.clip();
  const tip = ctx.createLinearGradient(0, base - len, 0, base - len * 0.4);
  tip.addColorStop(0, 'rgba(40, 60, 80, 0.28)');
  tip.addColorStop(1, 'rgba(40, 60, 80, 0)');
  ctx.fillStyle = tip;
  ctx.fillRect(-fw / 2, base - len, fw, len * 0.6);
  // Soft highlight along the lit shoulder.
  const hl = ctx.createRadialGradient(fw * 0.12 * sun, base - len * 0.55, 0, fw * 0.12 * sun, base - len * 0.55, fw * 0.6);
  hl.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-fw / 2, base - len, fw, len);
  ctx.restore();
  if (fw > 8) {
    ctx.strokeStyle = 'rgba(30, 48, 66, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(fw * 0.04 * sun, base);
    ctx.lineTo(fw * 0.04 * sun, base - len * 0.94);
    ctx.stroke();
    seam(ctx, base - len * 0.42, fw, 0.6);
  }
  ctx.fillStyle = silverGradient(ctx, fw, sun);
  ctx.fillRect(-fw / 2, base - Math.max(1.2, fw * 0.06), fw, Math.max(1.2, fw * 0.06));
}

/** Soft contact shadow / ambient occlusion band where two sections meet. */
export function jointShade(ctx: CanvasRenderingContext2D, y: number, w: number, h: number, below = true) {
  const g = ctx.createLinearGradient(0, y, 0, below ? y + h : y - h);
  g.addColorStop(0, 'rgba(20, 34, 48, 0.35)');
  g.addColorStop(1, 'rgba(20, 34, 48, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, below ? y : y - h, w, h);
}

// ───────────────────────── planet and small spacecraft ─────────────────────────

/** A deterministic blob outline (a continent or cloud bank), radius modulated by a few sines. */
function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number, squash = 1, rot = 0) {
  ctx.beginPath();
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = 1 + 0.22 * Math.sin(a * 3 + k) + 0.12 * Math.sin(a * 5 + k * 2.3) + 0.07 * Math.sin(a * 9 + k * 0.7);
    const x = Math.cos(a) * r * m;
    const y = Math.sin(a) * r * m * squash;
    const px = cx + x * Math.cos(rot) - y * Math.sin(rot);
    const py = cy + x * Math.sin(rot) + y * Math.cos(rot);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export interface GlobeStyle {
  /** Direction from the centre towards the Sun, radians (0 = +x, screen coordinates). */
  sunAngle?: number;
  /** 0–1 darkness of the night side. */
  night?: number;
  /** City lights on the night side. */
  cities?: boolean;
  /** Atmosphere glow thickness as a fraction of R. */
  atmosphere?: number;
  /** Pattern seed (continent placement). */
  seed?: number;
}

/**
 * Earth seen from orbit in the key-art palette (frames 03 and 04): deep ocean blues lit from the
 * Sun side, muted land, soft cloud banks and swirls, a specular glint, a night side with warm
 * city lights, and a blue atmosphere rim brightest on the lit limb. Static: paint it into a
 * cached layer. Game visual, not a map.
 */
export function paintGlobe(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, pal: ArtPalette, o: GlobeStyle = {}) {
  const sa = o.sunAngle ?? -Math.PI * 0.75;
  const sx = Math.cos(sa);
  const sy = Math.sin(sa);
  const hc = highContrast();
  const atm = o.atmosphere ?? 0.08;
  if (!hc) {
    const glow = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * (1 + atm * 1.6));
    glow.addColorStop(0, 'rgba(110, 195, 250, 0.55)');
    glow.addColorStop(0.35, 'rgba(70, 150, 230, 0.22)');
    glow.addColorStop(1, 'rgba(60, 130, 220, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (1 + atm * 1.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  const ocean = ctx.createRadialGradient(cx + sx * R * 0.45, cy + sy * R * 0.45, R * 0.05, cx, cy, R * 1.05);
  ocean.addColorStop(0, '#3fa3d0');
  ocean.addColorStop(0.35, '#1d6f9e');
  ocean.addColorStop(0.75, '#124a73');
  ocean.addColorStop(1, '#0a2d4c');
  ctx.fillStyle = ocean;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  if (!hc) {
    // Land: muted greens and warm tans, soft-edged, never saturated.
    const seed = o.seed ?? 1;
    const lands: Array<[number, number, number, number, number]> = [
      [-0.38, -0.22, 0.34, 0.65, 0.5],
      [0.25, 0.3, 0.27, 0.75, -0.4],
      [0.42, -0.48, 0.18, 0.6, 0.3],
      [-0.1, 0.62, 0.16, 0.55, 1.2],
    ];
    for (let i = 0; i < lands.length; i++) {
      const [dx, dy, rr, sq, rot] = lands[i]!;
      const lx = cx + dx * R;
      const ly = cy + dy * R;
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, rr * R * 1.3);
      lg.addColorStop(0, i % 2 ? 'rgba(146, 132, 96, 0.7)' : 'rgba(96, 124, 84, 0.7)');
      lg.addColorStop(0.75, i % 2 ? 'rgba(118, 116, 84, 0.55)' : 'rgba(74, 106, 76, 0.55)');
      lg.addColorStop(1, 'rgba(60, 96, 84, 0.25)');
      ctx.fillStyle = lg;
      blob(ctx, lx, ly, rr * R, seed * 1.7 + i * 2.1, sq, rot);
      ctx.fill();
      // Shallow-water halo along the coast.
      ctx.strokeStyle = 'rgba(120, 210, 220, 0.16)';
      ctx.lineWidth = Math.max(1, R * 0.03);
      ctx.stroke();
    }
    // Cloud banks: clusters of soft puffs stretched along the latitude, thicker towards the
    // lit limb, plus a couple of long thin streaks (no hard outlines).
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996 + seed;
      const d = Math.sqrt((i + 0.5) / 9) * 0.85;
      const bx = cx + Math.cos(a) * d * R;
      const by = cy + Math.sin(a) * d * R;
      for (let j = 0; j < 5; j++) {
        const px = bx + (j - 2) * R * 0.07 + Math.sin(i * 3 + j) * R * 0.03;
        const py = by + Math.cos(i * 5 + j * 2) * R * 0.025;
        const w = R * (0.05 + ((i + j) % 3) * 0.02);
        const g = ctx.createRadialGradient(px, py, 0, px, py, w);
        g.addColorStop(0, 'rgba(244, 248, 251, 0.55)');
        g.addColorStop(0.6, 'rgba(244, 248, 251, 0.22)');
        g.addColorStop(1, 'rgba(244, 248, 251, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, w * 1.6, w * 0.8, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(244, 248, 251, 0.14)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = Math.max(1.5, R * (0.04 - i * 0.008));
      ctx.beginPath();
      ctx.ellipse(cx, cy + R * (0.15 + i * 0.22) - R * 0.3, R * (0.95 - i * 0.12), R * 0.22, 0, Math.PI * (0.1 + i * 0.1), Math.PI * (0.75 + i * 0.05));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // Specular glint where the Sun reflects off the ocean.
    const gxp = cx + sx * R * 0.5;
    const gyp = cy + sy * R * 0.5;
    const glint = ctx.createRadialGradient(gxp, gyp, 0, gxp, gyp, R * 0.45);
    glint.addColorStop(0, rgba(pal.sun, 0.35));
    glint.addColorStop(1, rgba(pal.sun, 0));
    ctx.fillStyle = glint;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  // Limb darkening (the sphere's form), then the night side with a soft terminator.
  const limb = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  limb.addColorStop(0, 'rgba(3, 12, 24, 0)');
  limb.addColorStop(1, 'rgba(3, 12, 24, 0.38)');
  ctx.fillStyle = limb;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  const nightA = o.night ?? 0.85;
  const term = ctx.createLinearGradient(cx + sx * R * 0.1, cy + sy * R * 0.1, cx - sx * R * 0.7, cy - sy * R * 0.7);
  term.addColorStop(0, 'rgba(3, 9, 18, 0)');
  term.addColorStop(0.5, 'rgba(3, 9, 18, ' + 0.7 * nightA + ')');
  term.addColorStop(1, 'rgba(3, 9, 18, ' + 0.94 * nightA + ')');
  ctx.fillStyle = term;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  if (o.cities && !hc) {
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996;
      const d = Math.sqrt((i + 0.5) / 40) * 0.92;
      const px = cx + Math.cos(a) * d * R;
      const py = cy + Math.sin(a) * d * R;
      const side = (px - cx) * sx + (py - cy) * sy;
      if (side > -R * 0.15) continue;
      ctx.fillStyle = 'rgba(255, 206, 131, ' + (0.35 + (i % 3) * 0.2) + ')';
      ctx.fillRect(px, py, i % 4 === 0 ? 1.6 : 1, i % 4 === 0 ? 1.6 : 1);
    }
  }
  ctx.restore();
  // Bright atmosphere rim on the lit limb.
  if (!hc) {
    const rim = ctx.createLinearGradient(cx + sx * R, cy + sy * R, cx - sx * R, cy - sy * R);
    rim.addColorStop(0, 'rgba(170, 225, 255, 0.95)');
    rim.addColorStop(0.5, 'rgba(110, 190, 245, 0.35)');
    rim.addColorStop(1, 'rgba(80, 150, 220, 0.05)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.2, R * 0.025);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * A small spacecraft icon (bus with gold blanket and two solar wings) at (0, 0), wings along x,
 * in the satellite finish of frame 04. `s` = bus half-size in px.
 */
export function paintMiniSat(ctx: CanvasRenderingContext2D, s: number, sun: SunSide = 1) {
  const wingW = s * 2.6;
  const wingH = s * 1.3;
  for (const side of [-1, 1]) {
    const x0 = side * s * 1.3;
    const px = side < 0 ? x0 - wingW : x0;
    const g = ctx.createLinearGradient(px, -wingH / 2, px + wingW, wingH / 2);
    g.addColorStop(0, '#1d3a6a');
    g.addColorStop(0.5, '#2b5490');
    g.addColorStop(1, '#16305a');
    ctx.fillStyle = g;
    ctx.fillRect(px, -wingH / 2, wingW, wingH);
    ctx.strokeStyle = 'rgba(195, 204, 211, 0.85)';
    ctx.lineWidth = Math.max(0.8, s * 0.12);
    ctx.strokeRect(px, -wingH / 2, wingW, wingH);
    ctx.beginPath();
    ctx.moveTo(side * s, 0);
    ctx.lineTo(x0, 0);
    ctx.stroke();
  }
  ctx.fillStyle = ceramicGradient(ctx, s * 2, sun);
  ctx.fillRect(-s, -s, s * 2, s * 2);
  const gold = ctx.createLinearGradient(-s, 0, s, 0);
  gold.addColorStop(0, '#8a6626');
  gold.addColorStop(0.5, '#e0b45a');
  gold.addColorStop(1, '#9c7430');
  ctx.fillStyle = gold;
  ctx.fillRect(-s, s * 0.35, s * 2, s * 0.65);
  ctx.fillStyle = '#55c5cd';
  ctx.fillRect(-s, -s - Math.max(0.8, s * 0.15), s * 2, Math.max(0.8, s * 0.15));
}
