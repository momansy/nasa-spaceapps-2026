// MG-30 patch art: embroidered-look vector patches from four elements (shape, symbol,
// colourway, motto). Generic, original designs in the style palette; no real mission patches,
// agency insignia or logos.
import type { Patch } from './model';

export interface Colourway {
  f0: string;
  f1: string;
  border: string;
  ink: string;
  accent: string;
  ribbonInk: string;
}

/** Colourways (style palette: Space, Console, Ocean, Ceramic, Signal, Sunlight; periwinkle and rose are the proposed series colours). */
export const COLOURWAYS: readonly Colourway[] = [
  { f0: '#123456', f1: '#071522', border: '#55c5cd', ink: '#e8eef0', accent: '#55c5cd', ribbonInk: '#071522' },
  { f0: '#2387ad', f1: '#0e3f5c', border: '#e8eef0', ink: '#ffffff', accent: '#8fe0e6', ribbonInk: '#0e3f5c' },
  { f0: '#1d4563', f1: '#0b1d2e', border: '#ffce83', ink: '#ffce83', accent: '#e8eef0', ribbonInk: '#0b1d2e' },
  { f0: '#16325c', f1: '#071833', border: '#d8aa4c', ink: '#f2d38a', accent: '#e8eef0', ribbonInk: '#071833' },
  { f0: '#13707d', f1: '#072c33', border: '#ffffff', ink: '#ffffff', accent: '#8fe0e6', ribbonInk: '#072c33' },
  { f0: '#e58a4e', f1: '#183a5a', border: '#c3ccd3', ink: '#fff2dc', accent: '#ffce83', ribbonInk: '#183a5a' },
  { f0: '#b9c4ff', f1: '#6f7fd8', border: '#10284a', ink: '#10284a', accent: '#ffffff', ribbonInk: '#ffffff' },
  { f0: '#f7bcd4', f1: '#c76d93', border: '#10284a', ink: '#10284a', accent: '#ffffff', ribbonInk: '#ffffff' },
];

/** Builds the outline of shape `k` (unit radius 1, centred at 0, 0). */
export function shapePath(ctx: CanvasRenderingContext2D, k: number, R: number) {
  ctx.beginPath();
  const poly = (n: number, rot: number, r = R) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  switch (k) {
    case 0:
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      break;
    case 1: // shield
      ctx.moveTo(-R * 0.86, -R * 0.82);
      ctx.quadraticCurveTo(0, -R * 1.02, R * 0.86, -R * 0.82);
      ctx.lineTo(R * 0.86, -R * 0.1);
      ctx.bezierCurveTo(R * 0.86, R * 0.5, R * 0.35, R * 0.85, 0, R * 1.02);
      ctx.bezierCurveTo(-R * 0.35, R * 0.85, -R * 0.86, R * 0.5, -R * 0.86, -R * 0.1);
      ctx.closePath();
      break;
    case 2:
      poly(6, -Math.PI / 2);
      break;
    case 3: {
      // Rounded triangle, apex up.
      const pts = [0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        return [Math.cos(a) * R * 1.08, Math.sin(a) * R * 1.08 + R * 0.12];
      });
      const r = R * 0.22;
      for (let i = 0; i < 3; i++) {
        const [x0, y0] = pts[(i + 2) % 3]!;
        const [x1, y1] = pts[i]!;
        const [x2, y2] = pts[(i + 1) % 3]!;
        if (i === 0) ctx.moveTo((x0! + x1!) / 2, (y0! + y1!) / 2);
        ctx.arcTo(x1!, y1!, x2!, y2!, r);
      }
      ctx.closePath();
      break;
    }
    case 4:
      ctx.ellipse(0, 0, R * 0.8, R, 0, 0, Math.PI * 2);
      break;
    case 5:
      poly(5, -Math.PI / 2);
      break;
    case 6:
      ctx.roundRect(-R * 0.86, -R * 0.86, R * 1.72, R * 1.72, R * 0.3);
      break;
    default: {
      // Diamond with soft corners.
      const r = R * 0.16;
      const p = [
        [0, -R],
        [R, 0],
        [0, R],
        [-R, 0],
      ];
      ctx.moveTo((p[3]![0]! + p[0]![0]!) / 2, (p[3]![1]! + p[0]![1]!) / 2);
      for (let i = 0; i < 4; i++) ctx.arcTo(p[i]![0]!, p[i]![1]!, p[(i + 1) % 4]![0]!, p[(i + 1) % 4]![1]!, r);
      ctx.closePath();
    }
  }
}

/** Draws symbol `k` centred at (0, 0) with scale `s` (about the symbol's half-height). */
export function drawSymbol(ctx: CanvasRenderingContext2D, k: number, s: number, cw: Colourway) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ink = cw.ink;
  const acc = cw.accent;
  switch (k) {
    case 0: {
      // Rocket: ogive body, fins, band, a small flame.
      ctx.fillStyle = '#ffce83';
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, s * 0.62);
      ctx.quadraticCurveTo(0, s * 1.02, s * 0.12, s * 0.62);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.3, -s * 0.7, s * 0.24, s * 0.2, s * 0.2, s * 0.62);
      ctx.lineTo(-s * 0.2, s * 0.62);
      ctx.bezierCurveTo(-s * 0.24, s * 0.2, -s * 0.3, -s * 0.7, 0, -s);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.2);
      ctx.lineTo(-s * 0.46, s * 0.66);
      ctx.lineTo(-s * 0.2, s * 0.56);
      ctx.moveTo(s * 0.2, s * 0.2);
      ctx.lineTo(s * 0.46, s * 0.66);
      ctx.lineTo(s * 0.2, s * 0.56);
      ctx.fill();
      ctx.fillStyle = acc;
      ctx.fillRect(-s * 0.24, -s * 0.12, s * 0.48, s * 0.12);
      ctx.beginPath();
      ctx.arc(0, -s * 0.42, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 1: {
      // Satellite: bus and two wings.
      ctx.fillStyle = acc;
      ctx.fillRect(-s * 0.95, -s * 0.22, s * 0.6, s * 0.44);
      ctx.fillRect(s * 0.35, -s * 0.22, s * 0.6, s * 0.44);
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.strokeRect(-s * 0.95, -s * 0.22, s * 0.6, s * 0.44);
      ctx.strokeRect(s * 0.35, -s * 0.22, s * 0.6, s * 0.44);
      ctx.beginPath();
      ctx.moveTo(-s * 0.65, -s * 0.22);
      ctx.lineTo(-s * 0.65, s * 0.22);
      ctx.moveTo(s * 0.65, -s * 0.22);
      ctx.lineTo(s * 0.65, s * 0.22);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillRect(-s * 0.28, -s * 0.34, s * 0.56, s * 0.68);
      ctx.fillStyle = '#d8aa4c';
      ctx.fillRect(-s * 0.28, s * 0.1, s * 0.56, s * 0.24);
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.34);
      ctx.lineTo(0, -s * 0.62);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.66, s * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    }
    case 2: {
      // Orbit ring around a planet, with a small craft.
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.95, s * 0.34, -0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(s * 0.82, -s * 0.38, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 3: {
      // Four-point star with two small sparkles.
      const star = (x: number, y: number, r: number) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 - Math.PI / 2;
          const rr = i % 2 === 0 ? r : r * 0.28;
          if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      };
      ctx.fillStyle = ink;
      star(0, 0, s * 0.92);
      ctx.fillStyle = acc;
      star(s * 0.62, -s * 0.55, s * 0.24);
      star(-s * 0.6, s * 0.5, s * 0.18);
      break;
    }
    case 4: {
      // Earth: ocean disc, two land masses, an atmosphere ring.
      ctx.fillStyle = '#2387ad';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#6fa86b';
      ctx.beginPath();
      ctx.ellipse(-s * 0.25, -s * 0.15, s * 0.32, s * 0.2, -0.6, 0, Math.PI * 2);
      ctx.ellipse(s * 0.35, s * 0.35, s * 0.28, s * 0.16, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillRect(-s, -s * 0.52, s * 2, s * 0.08);
      ctx.restore();
      ctx.strokeStyle = acc;
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 5: {
      // Crescent Moon with craters.
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.82, 0, Math.PI * 2);
      ctx.arc(s * 0.38, -s * 0.18, s * 0.7, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.arc(-s * 0.5, s * 0.1, s * 0.09, 0, Math.PI * 2);
      ctx.arc(-s * 0.3, s * 0.48, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 6: {
      // Dish antenna on a stand with signal arcs.
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.85);
      ctx.lineTo(0, s * 0.2);
      ctx.lineTo(s * 0.2, s * 0.85);
      ctx.stroke();
      ctx.save();
      ctx.translate(-s * 0.05, s * 0.05);
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.6, s * 0.24, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = acc;
      for (const r of [0.35, 0.6]) {
        ctx.beginPath();
        ctx.arc(s * 0.15, -s * 0.35, s * r, -Math.PI * 0.45, -Math.PI * 0.05);
        ctx.stroke();
      }
      break;
    }
    default: {
      // Comet: bright head and three tail streaks.
      ctx.strokeStyle = acc;
      ctx.lineWidth = Math.max(1.5, s * 0.1);
      for (const [dy, len] of [
        [-0.18, 1.2],
        [0, 1.45],
        [0.18, 1.1],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(s * 0.45 - s * 0.1, -s * 0.45 + dy * s);
        ctx.lineTo(s * 0.45 - s * len * 0.75, -s * 0.45 + dy * s + s * len * 0.75);
        ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(s * 0.45, -s * 0.45, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Full patch at (cx, cy), radius R. `motto` is the translated motto text. */
export function drawPatch(ctx: CanvasRenderingContext2D, p: Patch, cx: number, cy: number, R: number, motto: string, font: string) {
  const cw = COLOURWAYS[p[2]] ?? COLOURWAYS[0]!;
  ctx.save();
  ctx.translate(cx, cy);
  // Soft drop shadow (cached by the caller, so a blur is fine here).
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = R * 0.12;
  ctx.shadowOffsetY = R * 0.05;
  shapePath(ctx, p[0], R);
  ctx.fillStyle = cw.border;
  ctx.fill();
  ctx.restore();
  // Field.
  const inner = R * 0.88;
  shapePath(ctx, p[0], inner);
  const g = ctx.createLinearGradient(0, -inner, 0, inner);
  g.addColorStop(0, cw.f0);
  g.addColorStop(1, cw.f1);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  shapePath(ctx, p[0], inner);
  ctx.clip();
  // Satin stitch texture: fine diagonal lines.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -R * 2; x < R * 2; x += Math.max(2.2, R * 0.035)) {
    ctx.moveTo(x, -R);
    ctx.lineTo(x + R, R);
  }
  ctx.stroke();
  // A few small stars in the field.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  for (const [x, y, r] of [
    [-0.55, -0.45, 0.025],
    [0.5, -0.55, 0.02],
    [0.62, -0.1, 0.018],
    [-0.62, 0.05, 0.016],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x * R, y * R, r * R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Merrowed edge: the border band with stitch marks, and a thin inner keyline.
  ctx.save();
  shapePath(ctx, p[0], R * 0.94);
  ctx.setLineDash([Math.max(1.2, R * 0.018), Math.max(1.6, R * 0.024)]);
  ctx.lineWidth = R * 0.09;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.stroke();
  ctx.restore();
  shapePath(ctx, p[0], inner);
  ctx.lineWidth = Math.max(1, R * 0.02);
  ctx.strokeStyle = cw.accent;
  ctx.stroke();
  // Symbol.
  drawSymbol(ctx, p[1], R * 0.36, cw);
  // Motto ribbon across the lower part.
  const ry = R * 0.52;
  const rh = R * 0.24;
  const rw = R * 0.92;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.moveTo(-rw - R * 0.12, ry - rh * 0.1);
  ctx.lineTo(-rw, ry);
  ctx.lineTo(-rw, ry + rh);
  ctx.lineTo(-rw - R * 0.12, ry + rh * 1.1);
  ctx.lineTo(-rw - R * 0.05, ry + rh * 0.5);
  ctx.closePath();
  ctx.moveTo(rw + R * 0.12, ry - rh * 0.1);
  ctx.lineTo(rw, ry);
  ctx.lineTo(rw, ry + rh);
  ctx.lineTo(rw + R * 0.12, ry + rh * 1.1);
  ctx.lineTo(rw + R * 0.05, ry + rh * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = cw.border;
  ctx.beginPath();
  ctx.moveTo(-rw, ry);
  ctx.quadraticCurveTo(0, ry - rh * 0.35, rw, ry);
  ctx.lineTo(rw, ry + rh);
  ctx.quadraticCurveTo(0, ry + rh * 0.65, -rw, ry + rh);
  ctx.closePath();
  ctx.fill();
  if (motto) {
    let px = Math.max(6, rh * 0.52);
    ctx.font = `700 ${px}px ${font}`;
    const maxW = rw * 1.8;
    const w = ctx.measureText(motto).width;
    if (w > maxW) {
      px = Math.max(5, (px * maxW) / w);
      ctx.font = `700 ${px}px ${font}`;
    }
    ctx.fillStyle = cw.ribbonInk;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(motto, 0, ry + rh * 0.42);
  }
  ctx.restore();
}
