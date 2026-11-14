// MG-29 answer animations, one per question. Each draws the setup at k = 0 and the true
// outcome as k runs to 1 (over the 3.6 s animation). Vector art in the style palette; the
// motion is illustrative (time-compressed), the outcome is the physics of the README.
import { clamp, mulberry32, withAlpha, type Palette, type Rect } from '../MG-02/kit';

export interface SceneCtx {
  ctx: CanvasRenderingContext2D;
  pal: Palette;
  r: Rect;
  /** Animation progress 0–1. */
  k: number;
  /** Animation length, s. */
  animS: number;
  reducedMotion: boolean;
  /** Draws a small labelled pill. */
  label(text: string, x: number, y: number, color?: string, align?: 'left' | 'center' | 'right'): void;
  t(key: string): string;
}

type Scene = (g: SceneCtx) => void;
const S = 'minigame.MG-29.scene.';

// ── shared art ──

const STARS = (() => {
  const rnd = mulberry32(2929);
  return Array.from({ length: 46 }, () => ({ x: rnd(), y: rnd(), s: 0.5 + rnd() * 1.1, a: 0.25 + rnd() * 0.6 }));
})();

function space(g: SceneCtx, earthGlow = false) {
  const { ctx, r } = g;
  const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  bg.addColorStop(0, '#030a14');
  bg.addColorStop(1, earthGlow ? '#0b2236' : '#071522');
  ctx.fillStyle = bg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#e8eef0';
  for (const s of STARS) {
    ctx.globalAlpha = s.a;
    ctx.fillRect(r.x + s.x * r.w, r.y + s.y * r.h, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function earthDisc(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, pal: Palette) {
  const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
  g.addColorStop(0, '#3c9bc0');
  g.addColorStop(0.55, pal.ocean);
  g.addColorStop(1, '#0a3550');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  // A few soft cloud bands and a land patch (fixed shapes, no noise).
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(104, 150, 96, 0.55)';
  ctx.beginPath();
  ctx.ellipse(x - R * 0.25, y - R * 0.1, R * 0.32, R * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(240, 246, 248, 0.5)';
  for (const [dx, dy, w] of [
    [-0.4, -0.45, 0.5],
    [0.1, 0.2, 0.6],
    [-0.1, 0.55, 0.45],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x + dx * R, y + dy * R, w * R, R * 0.06, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Night side.
  const n = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
  n.addColorStop(0.45, 'rgba(3, 10, 20, 0)');
  n.addColorStop(1, 'rgba(3, 10, 20, 0.65)');
  ctx.fillStyle = n;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(143, 224, 230, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, R + 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

/** Compact satellite: ceramic bus, gold blanket band, two dark wings with silver frames. */
function satellite(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, pal: Palette) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#16284a';
  ctx.strokeStyle = '#c3ccd3';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.fillRect(side > 0 ? s * 0.7 : -s * 2.3, -s * 0.45, s * 1.6, s * 0.9);
    ctx.strokeRect(side > 0 ? s * 0.7 : -s * 2.3, -s * 0.45, s * 1.6, s * 0.9);
  }
  ctx.fillStyle = '#c3ccd3';
  ctx.fillRect(-s * 0.7, -s * 0.06, s * 1.4, s * 0.12);
  const g = ctx.createLinearGradient(-s * 0.6, 0, s * 0.6, 0);
  g.addColorStop(0, '#f4f7f8');
  g.addColorStop(1, '#a9b6bf');
  ctx.fillStyle = g;
  ctx.fillRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2);
  ctx.fillStyle = '#d8aa4c';
  ctx.fillRect(-s * 0.6, s * 0.25, s * 1.2, s * 0.35);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(-s * 0.6, -s * 0.66, s * 1.2, s * 0.12);
  ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 2.5) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  const head = Math.min(10, len * 0.4);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
  ctx.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head);
  ctx.closePath();
  ctx.fill();
}

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, tint: string) {
  const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, tint);
  g.addColorStop(1, '#22323e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
}

/** Astronaut seen from above or the side: ceramic suit, gold visor, backpack. */
function astronaut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, armLen: number, angle: number, pal: Palette) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#dfe7eb';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.34;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, 0);
  ctx.lineTo(-s * 0.3 - armLen, s * 0.05);
  ctx.moveTo(s * 0.3, 0);
  ctx.lineTo(s * 0.3 + armLen, s * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#c9d3d9';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.18, s * 0.5, s * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(-s * 0.15, -s * 0.15, s * 0.05, 0, 0, s * 0.55);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#b3c0c9');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -s * 0.05, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9963b';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.18, s * 0.26, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.accent;
  ctx.fillRect(-s * 0.12, s * 0.38, s * 0.24, s * 0.08);
  ctx.restore();
}

// ── scenes ──

const hammerFeather: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  space(g);
  earthDisc(ctx, r.x + r.w * 0.86, r.y + r.h * 0.16, Math.min(r.w, r.h) * 0.07, pal);
  const ground = r.y + r.h * 0.8;
  const gg = ctx.createLinearGradient(0, ground, 0, r.y + r.h);
  gg.addColorStop(0, '#8f949a');
  gg.addColorStop(1, '#4a4f55');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(r.x, ground + 6);
  ctx.quadraticCurveTo(r.x + r.w * 0.5, ground - 8, r.x + r.w, ground + 4);
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.lineTo(r.x, r.y + r.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 44, 50, 0.45)';
  for (const [cx, w] of [
    [0.15, 0.08],
    [0.72, 0.12],
    [0.9, 0.05],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(r.x + r.w * cx, ground + r.h * 0.09, r.w * w, r.h * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const top = r.y + r.h * 0.2;
  const p = clamp(k / 0.62, 0, 1);
  const fall = p * p; // constant acceleration: distance ∝ t²
  const yHammer = top + fall * (ground - top - 18);
  const yFeather = top + fall * (ground - top - 8);
  // Hammer: handle and steel head.
  const hx = r.x + r.w * 0.36;
  ctx.save();
  ctx.translate(hx, yHammer);
  ctx.rotate(-0.25);
  ctx.fillStyle = '#7a5a3c';
  ctx.fillRect(-2.5, -4, 5, 30);
  const hg = ctx.createLinearGradient(-14, -10, 14, 0);
  hg.addColorStop(0, '#5f6a73');
  hg.addColorStop(0.5, '#d9e0e4');
  hg.addColorStop(1, '#6f7c86');
  ctx.fillStyle = hg;
  ctx.fillRect(-14, -12, 28, 10);
  ctx.restore();
  // Feather: curved vane on a gold shaft.
  const fx = r.x + r.w * 0.64;
  ctx.save();
  ctx.translate(fx, yFeather);
  ctx.rotate(0.35);
  ctx.fillStyle = 'rgba(240, 244, 246, 0.95)';
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.quadraticCurveTo(12, -12, 4, 10);
  ctx.quadraticCurveTo(-8, -6, 0, -24);
  ctx.fill();
  ctx.strokeStyle = pal.sun;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.quadraticCurveTo(4, -6, 2, 14);
  ctx.stroke();
  ctx.restore();
  if (p >= 1 && !g.reducedMotion) {
    const d = clamp((k - 0.62) / 0.3, 0, 1);
    ctx.fillStyle = `rgba(200, 204, 208, ${0.5 * (1 - d)})`;
    for (const x of [hx, fx]) {
      ctx.beginPath();
      ctx.ellipse(x, ground - 2, 10 + d * 18, 3 + d * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  g.label(g.t(S + 'hammer'), hx, ground + r.h * 0.12);
  g.label(g.t(S + 'feather'), fx, ground + r.h * 0.12);
  g.label(g.t(S + 'no_air'), r.x + 12, r.y + 18, pal.accentStrong, 'left');
};

const issFloat: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  space(g, true);
  const R = r.w * 0.95;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h + R * 0.62;
  earthDisc(ctx, cx, cy, R, pal);
  const orbitR = R + r.h * 0.2;
  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = withAlpha(pal.ceramic, 0.3);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, orbitR, Math.PI * 1.28, Math.PI * 1.72);
  ctx.stroke();
  ctx.restore();
  const a0 = Math.PI * 1.34;
  const a = a0 + k * Math.PI * 0.32;
  const sx = cx + Math.cos(a) * orbitR;
  const sy = cy + Math.sin(a) * orbitR;
  // Straight-line path it would take without gravity (tangent at the start).
  const tx = Math.cos(a0 + Math.PI / 2);
  const ty = Math.sin(a0 + Math.PI / 2);
  const px0 = cx + Math.cos(a0) * orbitR;
  const py0 = cy + Math.sin(a0) * orbitR;
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = withAlpha(pal.sun, 0.55);
  ctx.beginPath();
  ctx.moveTo(px0, py0);
  ctx.lineTo(px0 + tx * r.w * 0.75, py0 + ty * r.w * 0.75);
  ctx.stroke();
  ctx.restore();
  // Trail along the orbit.
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, orbitR, a0, a);
  ctx.stroke();
  satellite(ctx, sx, sy, Math.max(6, r.w * 0.022), a + Math.PI / 2, pal);
  arrow(ctx, sx, sy + 10, sx + (cx - sx) * 0.12, sy + 10 + (cy - sy) * 0.12, pal.sun);
  g.label(g.t(S + 'gravity'), clamp(sx + 14, r.x + 60, r.x + r.w - 60), clamp(sy + r.h * 0.2, r.y + 20, r.y + r.h - 16), pal.sun, 'center');
  if (k > 0.3) g.label(g.t(S + 'falling'), r.x + r.w / 2, r.y + 18, pal.accentStrong);
};

const coast: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  space(g);
  const y = r.y + r.h * 0.5;
  const x0 = r.x + r.w * 0.12;
  const x1 = r.x + r.w * 0.88;
  const s = Math.max(6, r.w * 0.025);
  // Strobe ghosts at equal time steps: equal spacing = constant speed.
  for (let i = 0; i <= 5; i++) {
    const kk = i / 5;
    if (kk > k) break;
    ctx.globalAlpha = 0.18 + 0.05 * i;
    satellite(ctx, x0 + (x1 - x0) * kk, y, s, 0, pal);
  }
  ctx.globalAlpha = 1;
  satellite(ctx, x0 + (x1 - x0) * k, y, s, 0, pal);
  ctx.strokeStyle = withAlpha(pal.ceramic, 0.25);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const x = x0 + ((x1 - x0) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 2.2);
    ctx.lineTo(x, y + s * 2.9);
    ctx.stroke();
  }
  g.label('v = 2.0 m/s', x0 + (x1 - x0) * k, y - s * 2.8, pal.accentStrong);
  g.label(g.t(S + 'engine_off'), r.x + 12, r.y + 18, pal.dim, 'left');
};

const orbitSpeed: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  space(g);
  const m = Math.min(r.w, r.h);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * 0.54;
  earthDisc(ctx, cx, cy, m * 0.15, pal);
  const r1 = m * 0.26;
  const r2 = m * 0.45;
  ctx.strokeStyle = withAlpha(pal.ceramic, 0.18);
  ctx.lineWidth = 1;
  for (const rr of [r1, r2]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Angular speed ∝ r^−1.5 (Kepler's third law): the low orbit sweeps much further.
  const sweep1 = k * Math.PI * 2.1;
  const sweep2 = sweep1 / Math.pow(r2 / r1, 1.5);
  const a0 = -Math.PI / 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a0 + sweep1);
  ctx.stroke();
  ctx.strokeStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(cx, cy, r2, a0, a0 + sweep2);
  ctx.stroke();
  const s = Math.max(4, m * 0.018);
  satellite(ctx, cx + Math.cos(a0 + sweep1) * r1, cy + Math.sin(a0 + sweep1) * r1, s, a0 + sweep1, pal);
  satellite(ctx, cx + Math.cos(a0 + sweep2) * r2, cy + Math.sin(a0 + sweep2) * r2, s, a0 + sweep2, pal);
  g.label(g.t(S + 'low'), cx, cy + r1 + 14, pal.accentStrong);
  g.label(g.t(S + 'high'), cx, Math.min(r.y + r.h - 12, cy + r2 + 14), pal.sun);
};

const sidewaysDrop: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  bg.addColorStop(0, '#173a55');
  bg.addColorStop(1, '#0b1d2e');
  ctx.fillStyle = bg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const ground = r.y + r.h * 0.86;
  ctx.fillStyle = '#20384c';
  ctx.fillRect(r.x, ground, r.w, r.y + r.h - ground);
  ctx.fillStyle = withAlpha(pal.accent, 0.6);
  ctx.fillRect(r.x, ground, r.w, 2);
  const ledgeX = r.x + r.w * 0.2;
  const top = r.y + r.h * 0.2;
  ctx.fillStyle = '#2a4d66';
  ctx.fillRect(r.x, top + 8, ledgeX - r.x, ground - top - 8);
  ctx.fillStyle = 'rgba(150, 205, 228, 0.3)';
  ctx.fillRect(r.x, top + 8, ledgeX - r.x, 2);
  const rad = Math.max(5, r.w * 0.02);
  const p = clamp(k / 0.8, 0, 1);
  const yOf = (pp: number) => top + pp * pp * (ground - top - rad);
  const xThrown = (pp: number) => ledgeX + rad + pp * r.w * 0.62;
  // Strobe marks at equal time steps, joined by level lines: equal heights at equal times.
  for (let i = 1; i <= 5; i++) {
    const pp = i / 5;
    if (pp > p + 1e-6) break;
    ctx.strokeStyle = withAlpha(pal.ceramic, 0.18);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(ledgeX + rad, yOf(pp));
    ctx.lineTo(xThrown(pp), yOf(pp));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.3;
    ball(ctx, ledgeX + rad, yOf(pp), rad * 0.8, pal.accent);
    ball(ctx, xThrown(pp), yOf(pp), rad * 0.8, pal.sun);
    ctx.globalAlpha = 1;
  }
  ball(ctx, ledgeX + rad, yOf(p), rad, pal.accent);
  ball(ctx, xThrown(p), yOf(p), rad, pal.sun);
  g.label(g.t(S + 'dropped'), ledgeX + rad, ground + r.h * 0.07, pal.accentStrong);
  g.label(g.t(S + 'thrown'), xThrown(1), ground + r.h * 0.07, pal.sun);
  g.label(g.t(S + 'no_air'), r.x + r.w - 12, r.y + 18, pal.dim, 'right');
};

const moonPendulum: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  const half = r.w / 2;
  const tau = k * g.animS;
  // Same length; period ∝ 1/√g. g_Moon ≈ 1.62 m/s², g_Earth ≈ 9.81 m/s² (real-world approximate).
  const periods = [1.2, 1.2 * Math.sqrt(9.81 / 1.62)];
  const amp = 0.36;
  for (let i = 0; i < 2; i++) {
    const x = r.x + i * half;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, r.y, half, r.h);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    bg.addColorStop(0, i === 0 ? '#1d4a6b' : '#10161f');
    bg.addColorStop(1, i === 0 ? '#0e2a40' : '#07101a');
    ctx.fillStyle = bg;
    ctx.fillRect(x, r.y, half, r.h);
    if (i === 1) {
      ctx.fillStyle = '#e8eef0';
      for (const s of STARS) if (s.x < 0.5) ctx.fillRect(x + s.x * 2 * half, r.y + s.y * r.h * 0.7, s.s, s.s);
    }
    const ground = r.y + r.h * 0.88;
    const gg = ctx.createLinearGradient(0, ground, 0, r.y + r.h);
    gg.addColorStop(0, i === 0 ? '#3d6b4a' : '#8f949a');
    gg.addColorStop(1, i === 0 ? '#1f3d2a' : '#4a4f55');
    ctx.fillStyle = gg;
    ctx.fillRect(x, ground, half, r.y + r.h - ground);
    const px = x + half / 2;
    const py = r.y + r.h * 0.12;
    const L = r.h * 0.6;
    // Frame: a silver gantry with a teal cap.
    ctx.fillStyle = '#c3ccd3';
    ctx.fillRect(px - half * 0.32, py - 5, half * 0.64, 5);
    ctx.fillRect(px - half * 0.32, py - 5, 3, ground - py + 5);
    ctx.fillRect(px + half * 0.32 - 3, py - 5, 3, ground - py + 5);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(px - 8, py - 7, 16, 4);
    // Swing path (faint arc).
    ctx.strokeStyle = withAlpha(pal.ceramic, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, L, Math.PI / 2 - amp, Math.PI / 2 + amp);
    ctx.stroke();
    const th = amp * Math.cos((2 * Math.PI * tau) / periods[i]!);
    const bx = px + Math.sin(th) * L;
    const by = py + Math.cos(th) * L;
    ctx.strokeStyle = '#d9e0e4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ball(ctx, bx, by, Math.max(7, r.w * 0.03), i === 0 ? pal.accent : pal.sun);
    ctx.restore();
    g.label(g.t(S + (i === 0 ? 'earth' : 'moon')), px, r.y + r.h * 0.94, i === 0 ? pal.accentStrong : pal.sun);
  }
  ctx.fillStyle = withAlpha(pal.ceramic, 0.25);
  ctx.fillRect(r.x + half - 0.5, r.y, 1, r.h);
};

const rocketVacuum: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  space(g);
  const y = r.y + r.h * 0.52;
  const L = Math.max(40, r.w * 0.24);
  const x = r.x + r.w * 0.34 + k * k * r.w * 0.3;
  const nozzle = x - L / 2;
  // Exhaust: particles thrown backwards at a steady speed (fewer with reduced motion).
  const n = g.reducedMotion ? 10 : 28;
  const rnd = mulberry32(606);
  for (let i = 0; i < n; i++) {
    const born = (i / n) * 0.95;
    const jitter = (rnd() - 0.5) * 0.6;
    if (born > k) continue;
    const age = k - born;
    const bornX = r.x + r.w * 0.34 + born * born * r.w * 0.3 - L / 2;
    const px = bornX - age * r.w * 0.9;
    if (px < r.x - 4) continue;
    const py = y + jitter * age * r.h * 0.5;
    ctx.fillStyle = withAlpha(pal.sun, clamp(0.85 - age * 1.4, 0.1, 0.85));
    ctx.beginPath();
    ctx.arc(px, py, 2 + age * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rocket pointing right: ceramic body, teal band, graphite bell, ogive nose.
  ctx.save();
  ctx.translate(x, y);
  const bh = L * 0.24;
  const body = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  body.addColorStop(0, '#f4f7f8');
  body.addColorStop(0.5, pal.ceramic);
  body.addColorStop(1, '#8e9fab');
  ctx.fillStyle = body;
  ctx.fillRect(-L / 2 + L * 0.1, -bh / 2, L * 0.7, bh);
  ctx.beginPath();
  ctx.moveTo(L * 0.3, -bh / 2);
  ctx.quadraticCurveTo(L * 0.5, -bh * 0.4, L * 0.55, 0);
  ctx.quadraticCurveTo(L * 0.5, bh * 0.4, L * 0.3, bh / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.accent;
  ctx.fillRect(-L * 0.1, -bh / 2, L * 0.06, bh);
  ctx.fillStyle = '#3a3330';
  ctx.beginPath();
  ctx.moveTo(-L / 2 + L * 0.1, -bh * 0.25);
  ctx.lineTo(-L / 2 - L * 0.04, -bh * 0.42);
  ctx.lineTo(-L / 2 - L * 0.04, bh * 0.42);
  ctx.lineTo(-L / 2 + L * 0.1, bh * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (k > 0.08) {
    arrow(ctx, x + L * 0.6, y, x + L * 0.6 + r.w * 0.12, y, pal.accent, 3);
    arrow(ctx, nozzle - 8, y - r.h * 0.18, nozzle - 8 - r.w * 0.12, y - r.h * 0.18, pal.sun, 3);
    g.label(g.t(S + 'rocket'), clamp(x + L * 0.6 + r.w * 0.06, r.x + 40, r.x + r.w - 40), y + r.h * 0.18, pal.accentStrong);
    g.label(g.t(S + 'exhaust'), clamp(nozzle - r.w * 0.08, r.x + 40, r.x + r.w - 40), y - r.h * 0.3, pal.sun);
  }
};

const spinArms: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  space(g);
  const s = Math.min(r.w, r.h) * 0.12;
  const armOut = s * 1.6;
  const armIn = s * 0.35;
  const armAt = (kk: number) => armOut + (armIn - armOut) * clamp((kk - 0.35) / 0.15, 0, 1);
  // Spin rate ∝ 1 / moment of inertia; I = body + arms ∝ (0.6 + arm²) (illustrative).
  const inertia = (arm: number) => 0.6 * s * s + arm * arm;
  const w0 = 0.5; // rev/s with the arms out (illustrative)
  let angle = 0;
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const kk = (k * i) / steps;
    angle += (2 * Math.PI * w0 * inertia(armOut)) / inertia(armAt(kk)) * ((k * g.animS) / steps);
  }
  const rate = (w0 * inertia(armOut)) / inertia(armAt(k));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * 0.55;
  ctx.strokeStyle = withAlpha(pal.accent, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 2.2, angle - 1.2, angle);
  ctx.stroke();
  astronaut(ctx, cx, cy, s, armAt(k), angle, pal);
  g.label(`${g.t(S + 'spin')} ${rate.toFixed(1)} rev/s`, cx, r.y + 18, rate > 0.8 ? pal.accentStrong : pal.dim);
};

const pushOff: Scene = (g) => {
  const { ctx, r, pal, k } = g;
  space(g);
  const cy = r.y + r.h * 0.52;
  const cx = r.x + r.w * 0.5;
  const push = 0.15;
  const d = Math.max(0, k - push);
  // Equal and opposite momentum: module five times heavier → one fifth of the speed (illustrative).
  const vA = r.w * 0.45;
  const vM = vA / 5;
  const ax = cx - 26 - d * vA;
  const mx = cx + 30 + d * vM;
  const s = Math.max(10, r.h * 0.1);
  // Module: big ceramic cylinder with teal bands.
  const mw = r.w * 0.26;
  const mh = r.h * 0.34;
  const mg = ctx.createLinearGradient(0, cy - mh / 2, 0, cy + mh / 2);
  mg.addColorStop(0, '#f4f7f8');
  mg.addColorStop(0.5, pal.ceramic);
  mg.addColorStop(1, '#8e9fab');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.roundRect(mx, cy - mh / 2, mw, mh, 10);
  ctx.fill();
  ctx.fillStyle = pal.accent;
  ctx.fillRect(mx + mw * 0.2, cy - mh / 2, mw * 0.06, mh);
  ctx.fillRect(mx + mw * 0.74, cy - mh / 2, mw * 0.06, mh);
  astronaut(ctx, ax, cy, s, k < push ? s * 0.9 : s * 0.5, -Math.PI / 2, pal);
  if (k > push) {
    arrow(ctx, ax - s, cy + mh * 0.75, ax - s - r.w * 0.2, cy + mh * 0.75, pal.accent, 3);
    arrow(ctx, mx + mw / 2, cy + mh * 0.75, mx + mw / 2 + r.w * 0.04, cy + mh * 0.75, pal.sun, 3);
  }
  g.label(g.t(S + 'astronaut'), clamp(ax, r.x + 44, r.x + r.w - 44), cy - mh * 0.75, pal.accentStrong);
  g.label(g.t(S + 'module'), clamp(mx + mw / 2, r.x + 44, r.x + r.w - 44), cy - mh * 0.75, pal.sun);
};

export const SCENES: Record<string, Scene> = {
  hammer_feather: hammerFeather,
  iss_float: issFloat,
  coast,
  orbit_speed: orbitSpeed,
  sideways_drop: sidewaysDrop,
  moon_pendulum: moonPendulum,
  rocket_vacuum: rocketVacuum,
  spin_arms: spinArms,
  push_off: pushOff,
};
