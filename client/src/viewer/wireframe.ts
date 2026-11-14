// Canvas-2D wireframe renderer: the "hologram" view of a part. It is the fallback of the 3D
// part viewer when WebGL or the GLB model is missing (design section 16: "2D fallback for 3D
// viewer"), and it is what every phone shows until the models are exported.
//
// A model is three groups of polylines (dim / normal / bright). Each frame the points are
// rotated (yaw about the vertical axis, then pitch), projected with a mild perspective and
// stroked in three depth layers so the far side reads as further away.

export type Vec3 = readonly [number, number, number];

/** 0 = dim detail (floor, hidden structure), 1 = normal, 2 = bright highlight. */
export type WireTone = 0 | 1 | 2;

interface LineRef {
  start: number;
  len: number;
  closed: boolean;
}

interface WireGroup {
  pts: Float32Array;
  lines: LineRef[];
  /** Projected x, y and depth per point; reused every frame. */
  proj: Float32Array;
}

export interface WireMarker {
  p: Vec3;
  label: string | null;
}

export interface WireModel {
  groups: [WireGroup, WireGroup, WireGroup];
  markers: WireMarker[];
  /** Starting orientation, radians. */
  yaw: number;
  pitch: number;
  /** Half width and half height the view must show at the starting pitch, in model units. */
  frameW: number;
  frameH: number;
  /** Number of line segments (for tests and budgets). */
  segments: number;
}

export interface View {
  yaw: number;
  pitch: number;
  zoom: number;
}

export interface WireColors {
  line: string;
  bright: string;
  dim: string;
  text: string;
}

const TAU = Math.PI * 2;

export class WireBuilder {
  private pts: number[][] = [[], [], []];
  private lines: LineRef[][] = [[], [], []];
  readonly markers: WireMarker[] = [];
  yaw = -0.5;
  pitch = 0.26;
  /**
   * Half width and half height of the frame the camera fits. It is set per shape, not measured
   * from the lines, so that parts of one category keep their relative sizes.
   */
  frameW = 1;
  frameH = 1;

  line(tone: WireTone, points: ReadonlyArray<Vec3>, closed = false): this {
    if (points.length < 2) return this;
    const buf = this.pts[tone]!;
    this.lines[tone]!.push({ start: buf.length / 3, len: points.length, closed });
    for (const p of points) buf.push(p[0], p[1], p[2]);
    return this;
  }

  /** A circle of radius `r` around `c`, in the plane perpendicular to `axis`. */
  ring(tone: WireTone, c: Vec3, r: number, segs = 24, axis: 'x' | 'y' | 'z' = 'y'): this {
    const points: Vec3[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const u = Math.cos(a) * r;
      const v = Math.sin(a) * r;
      points.push(axis === 'y' ? [c[0] + u, c[1], c[2] + v] : axis === 'x' ? [c[0], c[1] + u, c[2] + v] : [c[0] + u, c[1] + v, c[2]]);
    }
    return this.line(tone, points, true);
  }

  /**
   * Surface of revolution about the vertical axis through `at`: one ring per profile point
   * and `meridians` profile curves. `profile` is a list of [radius, height].
   */
  revolve(
    tone: WireTone,
    profile: ReadonlyArray<readonly [number, number]>,
    o: { segs?: number; meridians?: number; at?: Vec3; ringTone?: WireTone } = {},
  ): this {
    const segs = o.segs ?? 24;
    const meridians = o.meridians ?? 12;
    const at = o.at ?? [0, 0, 0];
    for (const [r, y] of profile) {
      if (r > 1e-4) this.ring(o.ringTone ?? tone, [at[0], at[1] + y, at[2]], r, segs);
    }
    for (let m = 0; m < meridians; m++) {
      const a = (m / meridians) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      this.line(
        tone,
        profile.map(([r, y]) => [at[0] + ca * r, at[1] + y, at[2] + sa * r] as Vec3),
      );
    }
    return this;
  }

  /** Axis-aligned box around `c` with full sizes sx, sy, sz. */
  box(tone: WireTone, c: Vec3, sx: number, sy: number, sz: number): this {
    const x = sx / 2;
    const y = sy / 2;
    const z = sz / 2;
    const top: Vec3[] = [
      [c[0] - x, c[1] + y, c[2] - z],
      [c[0] + x, c[1] + y, c[2] - z],
      [c[0] + x, c[1] + y, c[2] + z],
      [c[0] - x, c[1] + y, c[2] + z],
    ];
    const bottom = top.map((p) => [p[0], c[1] - y, p[2]] as Vec3);
    this.line(tone, top, true).line(tone, bottom, true);
    for (let i = 0; i < 4; i++) this.line(tone, [top[i]!, bottom[i]!]);
    return this;
  }

  /** A flat panel spanned by `u` and `v` from `origin`, with `nu` × `nv` cells. */
  grid(tone: WireTone, origin: Vec3, u: Vec3, v: Vec3, nu: number, nv: number): this {
    const at = (a: number, b: number): Vec3 => [origin[0] + u[0] * a + v[0] * b, origin[1] + u[1] * a + v[1] * b, origin[2] + u[2] * a + v[2] * b];
    for (let i = 0; i <= nu; i++) this.line(tone, [at(i / nu, 0), at(i / nu, 1)]);
    for (let j = 0; j <= nv; j++) this.line(tone, [at(0, j / nv), at(1, j / nv)]);
    return this;
  }

  /** Turntable under the model: concentric rings and spokes at height `y`. */
  floor(y: number, radius = 0.95): this {
    for (const k of [0.34, 0.67, 1]) this.ring(0, [0, y, 0], radius * k, 36);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      this.line(0, [
        [Math.cos(a) * radius * 0.34, y, Math.sin(a) * radius * 0.34],
        [Math.cos(a) * radius, y, Math.sin(a) * radius],
      ]);
    }
    return this;
  }

  marker(p: Vec3, label: string | null = null): this {
    this.markers.push({ p, label });
    return this;
  }

  build(): WireModel {
    let segments = 0;
    const groups = [0, 1, 2].map((i) => {
      const pts = Float32Array.from(this.pts[i]!);
      const lines = this.lines[i]!;
      for (const l of lines) segments += l.closed ? l.len : l.len - 1;
      return { pts, lines, proj: new Float32Array(pts.length) };
    }) as [WireGroup, WireGroup, WireGroup];
    // A tilted turntable also takes vertical room: add its projected depth to the height.
    const frameH = this.frameH * Math.cos(this.pitch) + this.frameW * Math.abs(Math.sin(this.pitch));
    return { groups, markers: this.markers, yaw: this.yaw, pitch: this.pitch, frameW: this.frameW, frameH, segments };
  }
}

/** Camera distance in model units; the model is expected to fit a sphere of radius 1. */
const CAMERA_D = 4.6;

// Per tone: [line width, alpha multiplier]; per depth layer: alpha.
const TONE_STYLE: ReadonlyArray<readonly [number, number]> = [
  [1, 0.42],
  [1.15, 0.85],
  [2, 1],
];
const LAYER_ALPHA = [0.3, 0.62, 1] as const;

/**
 * Draws one frame. The context must already be scaled so that one unit is one CSS pixel.
 * `pulse` is a 0–1 phase for the marker ring (pass 0 for a still frame).
 */
export function drawWire(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  model: WireModel,
  view: View,
  colors: WireColors,
  pulse: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const R = Math.min((w * 0.47) / model.frameW, (h * 0.46) / model.frameH) * view.zoom;
  const cx = w / 2;
  const cy = h / 2;
  const cyaw = Math.cos(view.yaw);
  const syaw = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const strokes = [colors.dim, colors.line, colors.bright];

  for (let gi = 0; gi < 3; gi++) {
    const g = model.groups[gi]!;
    const { pts, proj, lines } = g;
    const n = pts.length;
    if (n === 0) continue;
    for (let i = 0; i < n; i += 3) {
      const x = pts[i]!;
      const y = pts[i + 1]!;
      const z = pts[i + 2]!;
      const x1 = x * cyaw + z * syaw;
      const z1 = -x * syaw + z * cyaw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const k = (CAMERA_D / (CAMERA_D - z2)) * R;
      proj[i] = cx + x1 * k;
      proj[i + 1] = cy - y1 * k;
      proj[i + 2] = z2;
    }
    const [width, toneAlpha] = TONE_STYLE[gi]!;
    ctx.strokeStyle = strokes[gi]!;
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      let any = false;
      for (const l of lines) {
        const count = l.closed ? l.len : l.len - 1;
        let open = false;
        for (let s = 0; s < count; s++) {
          const a = (l.start + s) * 3;
          const b = (l.start + ((s + 1) % l.len)) * 3;
          const depth = (proj[a + 2]! + proj[b + 2]!) / 2;
          const bucket = depth < -0.22 ? 0 : depth < 0.22 ? 1 : 2;
          if (bucket !== layer) {
            open = false;
            continue;
          }
          if (!open) ctx.moveTo(proj[a]!, proj[a + 1]!);
          ctx.lineTo(proj[b]!, proj[b + 1]!);
          open = true;
          any = true;
        }
      }
      if (!any) continue;
      const alpha = LAYER_ALPHA[layer]! * toneAlpha;
      if (gi === 2) {
        // Soft halo under the highlight lines (cheaper than shadowBlur on old phones).
        ctx.globalAlpha = alpha * 0.2;
        ctx.lineWidth = width * 3.2;
        ctx.stroke();
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  // Markers: a dot, a pulsing ring and an optional label.
  ctx.font = '600 11px ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace';
  ctx.textBaseline = 'middle';
  for (const m of model.markers) {
    const [x, y, z] = m.p;
    const x1 = x * cyaw + z * syaw;
    const z1 = -x * syaw + z * cyaw;
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const k = (CAMERA_D / (CAMERA_D - z2)) * R;
    const px = cx + x1 * k;
    const py = cy - y1 * k;
    const front = z2 > -0.05;
    ctx.globalAlpha = front ? 1 : 0.35;
    ctx.fillStyle = colors.bright;
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colors.bright;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = (front ? 0.9 : 0.3) * (1 - pulse * 0.85);
    ctx.beginPath();
    ctx.arc(px, py, 6 + pulse * 9, 0, TAU);
    ctx.stroke();
    if (m.label && front) {
      const tw = ctx.measureText(m.label).width;
      const right = px + 14 + tw + 8 < w;
      const lx = right ? px + 14 : px - 14 - tw;
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = 'rgba(5, 16, 26, 0.82)';
      ctx.fillRect(lx - 5, py - 9, tw + 10, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left';
      ctx.fillText(m.label, lx, py + 0.5);
    }
  }
  ctx.globalAlpha = 1;
}
