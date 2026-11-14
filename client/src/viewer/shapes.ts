// Parametric wireframe shapes for the part viewer. The shape is chosen by the part's category
// and sized from its catalog stats, so options of one category can be told apart at a glance.
//
// These are schematic drawings (a game presentation), not engineering geometry: only the
// relative proportions follow the data (thrust → size, vacuum/sea-level Isp ratio → nozzle
// expansion, latitude → position on the globe).
import { getPart, partsOfCategory, type Part } from '../data/catalog';
import { WireBuilder, type Vec3, type WireModel } from './wireframe';

export type ShapeKind = 'engine' | 'cluster' | 'globe' | 'tank' | 'fairing' | 'capsule' | 'satellite' | 'rocket';

const SHAPE_OF_CATEGORY: Record<string, ShapeKind> = {
  first_stage_engine: 'engine',
  upper_stage_engine: 'engine',
  engine_count: 'cluster',
  launch_site: 'globe',
  tank_size: 'tank',
  structural_material: 'tank',
  fairing: 'fairing',
  capsule: 'capsule',
  life_support: 'capsule',
  heat_shield: 'capsule',
  escape_system: 'capsule',
  capsule_recovery: 'capsule',
  mars_lander: 'capsule',
  instrument: 'satellite',
  satellite_power: 'satellite',
  attitude_control: 'satellite',
  avionics: 'satellite',
  navigation_sensor: 'satellite',
  power_system: 'satellite',
  communications: 'satellite',
};

export function shapeOf(part: Part | undefined): ShapeKind {
  return (part && SHAPE_OF_CATEGORY[part.category]) || 'rocket';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function stat(p: Part | undefined, field: string): number | null {
  return num(p?.stats?.[field]);
}

/** Share of the largest value of `field` in the part's category, 0–1 (1 when unknown). */
function shareOfCategory(part: Part | undefined, pick: (p: Part) => number | null): number {
  if (!part) return 1;
  const own = pick(part);
  if (own == null) return 1;
  let max = 0;
  for (const p of partsOfCategory(part.category)) max = Math.max(max, pick(p) ?? 0);
  return max > 0 ? Math.min(1, Math.max(0, own / max)) : 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ───────────── engine ─────────────

interface EngineOpts {
  /** Overall size, 1 = the biggest engine of the category. */
  s: number;
  /** Nozzle exit radius over throat radius (schematic expansion). */
  er: number;
  at?: Vec3;
  /** Turbopumps, feed lines and mount. */
  detail: boolean;
  segs: number;
  meridians: number;
}

/** Height of an engine drawn by `engine()`, for layout. */
function engineHeight(s: number, er: number): number {
  const rt = 0.115 * s;
  return 0.16 * s + 0.09 * s + 0.34 * s + 0.15 * s + (rt * er - rt) * 2.3;
}

/** Draws one engine hanging from `at` (the top of its gimbal mount). Returns its height. */
function engine(b: WireBuilder, o: EngineOpts): number {
  const { s, er } = o;
  const at = o.at ?? [0, 0, 0];
  const rt = 0.115 * s; // throat
  const rc = 0.225 * s; // chamber
  const re = rt * er; // nozzle exit
  const lGimbal = 0.16 * s;
  const lDome = 0.09 * s;
  const lChamber = 0.34 * s;
  const lConv = 0.15 * s;
  const lBell = (re - rt) * 2.3;

  let y = 0;
  const profile: Array<[number, number]> = [];
  profile.push([0.05 * s, y]);
  y -= lGimbal * 0.55;
  profile.push([0.05 * s, y]);
  y -= lGimbal * 0.45;
  profile.push([rc * 0.55, y]);
  y -= lDome;
  profile.push([rc, y]);
  const yChamberTop = y;
  y -= lChamber;
  profile.push([rc, y]);
  y -= lConv * 0.7;
  profile.push([rt * 1.35, y]);
  y -= lConv * 0.3;
  const yThroat = y;
  profile.push([rt, y]);
  const steps = o.detail ? 9 : 6;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    // Bell contour: steep after the throat, flattening towards the exit.
    const r = rt + (re - rt) * (0.25 * u + 0.75 * (1 - Math.pow(1 - u, 1.7)));
    profile.push([r, yThroat - lBell * u]);
  }
  const yExit = yThroat - lBell;

  b.revolve(1, profile, { segs: o.segs, meridians: o.meridians, at });
  // Highlights: throat, exit plane and the turbine-exhaust manifold part way down the bell.
  b.ring(2, [at[0], at[1] + yThroat, at[2]], rt, o.segs);
  b.ring(2, [at[0], at[1] + yExit, at[2]], re, Math.max(o.segs, 28));

  if (o.detail) {
    const uMan = 0.3;
    const rMan = rt + (re - rt) * (0.25 * uMan + 0.75 * (1 - Math.pow(1 - uMan, 1.7))) + 0.02 * s;
    const yMan = yThroat - lBell * uMan;
    b.ring(2, [at[0], at[1] + yMan, at[2]], rMan, o.segs);

    // Mount plate and four struts down to the injector dome.
    const rPlate = 0.3 * s;
    b.ring(1, [at[0], at[1], at[2]], rPlate, 20);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      b.line(1, [
        [at[0] + Math.cos(a) * rPlate, at[1], at[2] + Math.sin(a) * rPlate],
        [at[0] + Math.cos(a) * rc, at[1] + yChamberTop, at[2] + Math.sin(a) * rc],
      ]);
    }

    // Two turbopumps beside the chamber (fuel and oxidiser) with feed and discharge lines.
    for (const side of [1, -1] as const) {
      const k = side === 1 ? 1 : 0.8;
      const px = at[0] + side * (rc + 0.15 * s);
      const pr = 0.085 * s * k;
      const pTop = yChamberTop + 0.03 * s;
      const pLen = 0.3 * s * k;
      b.revolve(
        1,
        [
          [pr * 0.5, pTop + 0.04 * s],
          [pr, pTop],
          [pr, pTop - pLen],
          [pr * 0.6, pTop - pLen - 0.04 * s],
        ],
        { segs: 12, meridians: 6, at: [px, at[1], at[2]] },
      );
      // Feed line from the tank above.
      b.line(1, [
        [px, at[1] + pTop + 0.04 * s, at[2]],
        [px, at[1] + 0.05 * s, at[2]],
        [px + side * 0.03 * s, at[1] + 0.13 * s, at[2]],
      ]);
      // Discharge to the injector dome.
      b.line(1, [
        [px - side * pr, at[1] + pTop - pLen * 0.25, at[2]],
        [at[0] + side * rc * 0.8, at[1] + yChamberTop + lDome * 0.7, at[2]],
        [at[0] + side * rc * 0.35, at[1] + yChamberTop + lDome, at[2]],
      ]);
      // Turbine exhaust down to the manifold.
      b.line(1, [
        [px, at[1] + pTop - pLen - 0.04 * s, at[2]],
        [px, at[1] + yMan + 0.06 * s, at[2]],
        [at[0] + side * rMan, at[1] + yMan, at[2]],
      ]);
    }
  }
  return -yExit;
}

function engineModel(part: Part | undefined): WireModel {
  const b = new WireBuilder();
  const thrust = (p: Part) => stat(p, 'thrust_vac_kN') ?? stat(p, 'thrust_sl_kN');
  const share = shareOfCategory(part, thrust);
  // Size grows slowly with thrust so a small engine stays readable next to a giant one.
  const s = 0.36 + 0.64 * Math.pow(share, 0.42);
  // Vacuum-optimised nozzles expand more: use the vacuum / sea-level Isp ratio when both exist.
  const ispSl = stat(part, 'isp_sl_s');
  const ispVac = stat(part, 'isp_vac_s');
  const er = ispSl && ispVac ? clamp(2.5 + (ispVac / ispSl - 1) * 9, 2.5, 4.6) : part?.category === 'upper_stage_engine' ? 4.6 : 3.3;
  const h = engineHeight(s, er);
  const top = h / 2 + 0.04;
  engine(b, { s, er, at: [0, top, 0], detail: true, segs: 24, meridians: 16 });
  b.floor(top - h - 0.09, 0.8);
  b.pitch = 0.3;
  // The frame of the biggest engine of the category, so smaller engines look smaller.
  b.frameW = 0.84;
  b.frameH = 1.0;
  return b.build();
}

function clusterModel(part: Part | undefined): WireModel {
  const b = new WireBuilder();
  const n = clamp(Math.round(stat(part, 'engine_count') ?? 1), 1, 12);
  const centre = n >= 5 || n === 1;
  const ringN = centre ? n - 1 : n;
  const ringR = ringN > 0 ? 0.56 : 0;
  const s = n === 1 ? 0.95 : clamp(0.9 / Math.sqrt(n) + 0.18, 0.4, 0.8);
  const er = 3;
  const h = engineHeight(s, er);
  const top = h / 2 + 0.05;
  const spots: Vec3[] = [];
  if (centre) spots.push([0, top, 0]);
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * TAU;
    spots.push([Math.cos(a) * ringR, top, Math.sin(a) * ringR]);
  }
  for (const at of spots) engine(b, { s, er, at, detail: false, segs: 12, meridians: 6 });
  // Thrust structure the engines hang from.
  b.ring(2, [0, top, 0], ringR + 0.26, 40);
  b.ring(1, [0, top + 0.1, 0], ringR + 0.26, 40);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r = ringR + 0.26;
    b.line(1, [
      [Math.cos(a) * r, top, Math.sin(a) * r],
      [Math.cos(a) * r, top + 0.1, Math.sin(a) * r],
    ]);
  }
  b.floor(top - h - 0.08, 0.98);
  b.pitch = 0.42;
  b.frameW = 1.0;
  b.frameH = Math.max(0.5, h / 2 + 0.2);
  return b.build();
}

// ───────────── launch site ─────────────

function globeModel(part: Part | undefined, labels: ShapeLabels): WireModel {
  const b = new WireBuilder();
  const R = 0.8;
  const lat = clamp(stat(part, 'latitude_deg') ?? 0, -89, 89);
  const onSphere = (latDeg: number, lonDeg: number, r = R): Vec3 => {
    const la = latDeg * DEG;
    const lo = lonDeg * DEG;
    return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
  };
  for (let la = -60; la <= 60; la += 30) {
    b.ring(la === 0 ? 1 : 0, [0, R * Math.sin(la * DEG), 0], R * Math.cos(la * DEG), 48);
  }
  for (let lo = 0; lo < 360; lo += 30) {
    const pts: Vec3[] = [];
    for (let la = -90; la <= 90; la += 7.5) pts.push(onSphere(la, lo));
    b.line(0, pts);
  }
  // Rotation axis.
  b.line(1, [
    [0, -R * 1.18, 0],
    [0, R * 1.18, 0],
  ]);
  // The site's latitude circle: every point on it gets the same push from Earth's spin.
  b.ring(2, [0, R * Math.sin(lat * DEG), 0], R * Math.cos(lat * DEG), 64);
  // Lowest-inclination orbit reachable from the site: a great circle tilted by the latitude.
  const orbit: Vec3[] = [];
  const ro = R * 1.16;
  const inc = Math.abs(lat) * DEG;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    orbit.push([ro * Math.cos(a), ro * Math.sin(a) * Math.sin(inc) * Math.sign(lat || 1), ro * Math.sin(a) * Math.cos(inc)]);
  }
  b.line(1, orbit, true);
  // Eastward spin arrow along the equator.
  const arrow: Vec3[] = [];
  for (let lo = 20; lo <= 70; lo += 5) arrow.push(onSphere(0, lo, R * 1.05));
  b.line(2, arrow);
  b.line(2, [onSphere(4, 62, R * 1.05), onSphere(0, 70, R * 1.05), onSphere(-4, 62, R * 1.05)]);
  // The pad: a marker with a short vertical stroke for the vehicle.
  b.line(2, [onSphere(lat, 0), onSphere(lat, 0, R * 1.14)]);
  const hemi = lat >= 0 ? labels.north : labels.south;
  b.marker(onSphere(lat, 0, R * 1.0), `${labels.formatDeg(Math.abs(lat))} ${hemi}`);
  b.yaw = -0.45;
  b.pitch = 0.3;
  b.frameW = 1.0;
  b.frameH = 0.72;
  return b.build();
}

// ───────────── tanks, fairing, capsule, satellite, rocket ─────────────

function tankModel(part: Part | undefined): WireModel {
  const b = new WireBuilder();
  const share = shareOfCategory(part, (p) => stat(p, 'first_stage_propellant_t') ?? stat(p, 'upper_stage_propellant_t'));
  const r = 0.4;
  const len = 0.45 + 0.85 * Math.sqrt(share);
  const dome = r * 0.55;
  const half = len / 2;
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    profile.push([r * Math.sin(a), half + dome * Math.cos(a)]);
  }
  const rings = Math.max(2, Math.round(len / 0.22));
  for (let i = 1; i <= rings; i++) profile.push([r, half - (len * i) / rings]);
  for (let i = 4; i >= 0; i--) {
    const a = (i / 5) * (Math.PI / 2);
    profile.push([r * Math.sin(a), -half - dome * Math.cos(a)]);
  }
  b.revolve(1, profile, { segs: 28, meridians: 16 });
  // Common bulkhead between the two propellants and the skirt rings.
  const yBulk = half - len * 0.38;
  const bulk: Array<[number, number]> = [];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    bulk.push([r * Math.sin(a), yBulk + dome * 0.7 * Math.cos(a)]);
  }
  b.revolve(2, bulk, { segs: 28, meridians: 8 });
  b.ring(2, [0, half, 0], r, 32);
  b.ring(2, [0, -half, 0], r, 32);
  b.floor(-half - dome - 0.08, 0.8);
  b.frameW = 0.84;
  b.frameH = 1.0;
  return b.build();
}

function fairingModel(part: Part | undefined): WireModel {
  const b = new WireBuilder();
  const share = shareOfCategory(part, (p) => stat(p, 'diameter_m'));
  const r = 0.28 + 0.2 * share;
  const base = -0.8;
  const cyl = 0.55 + 0.25 * share;
  const nose = 0.85;
  const profile: Array<[number, number]> = [
    [r, base],
    [r, base + cyl * 0.5],
    [r, base + cyl],
  ];
  for (let i = 1; i <= 7; i++) {
    const u = i / 7;
    profile.push([r * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.12 * u), base + cyl + nose * u]);
  }
  b.revolve(1, profile, { segs: 28, meridians: 12 });
  // Split line: the two halves separate along this seam.
  for (const side of [1, -1]) {
    b.line(
      2,
      profile.map(([pr, y]) => [0, y, side * pr] as Vec3),
    );
  }
  b.ring(2, [0, base, 0], r, 32);
  // The payload it protects.
  b.box(0, [0, base + cyl * 0.5, 0], r * 0.9, cyl * 0.7, r * 0.9);
  b.ring(0, [0, base + cyl * 0.9, 0], r * 0.35, 16);
  b.floor(base - 0.08, 0.8);
  b.frameW = 0.84;
  b.frameH = 0.95;
  return b.build();
}

function capsuleModel(): WireModel {
  const b = new WireBuilder();
  const rBase = 0.72;
  const profile: Array<[number, number]> = [];
  // Heat shield: a shallow spherical cap.
  for (let i = 0; i <= 5; i++) {
    const u = i / 5;
    profile.push([rBase * u, -0.52 + 0.16 * u * u]);
  }
  profile.push([rBase, -0.3]);
  // Conical side wall up to the docking tunnel.
  profile.push([rBase * 0.78, 0.05]);
  profile.push([rBase * 0.56, 0.4]);
  profile.push([rBase * 0.36, 0.72]);
  profile.push([rBase * 0.3, 0.74]);
  profile.push([rBase * 0.3, 0.9]);
  b.revolve(1, profile, { segs: 32, meridians: 16 });
  b.ring(2, [0, -0.36, 0], rBase, 40);
  b.ring(2, [0, 0.9, 0], rBase * 0.3, 24);
  // Windows.
  for (const a of [-0.5, 0.5]) {
    const r = rBase * 0.62;
    b.ring(2, [Math.sin(a) * r, 0.28, Math.cos(a) * r], 0.07, 12, 'z');
  }
  b.floor(-0.62, 0.95);
  b.frameW = 0.98;
  b.frameH = 0.8;
  return b.build();
}

function satelliteModel(part: Part | undefined): WireModel {
  const b = new WireBuilder();
  const power = shareOfCategory(part, (p) => stat(p, 'generation_avg_W') ?? stat(p, 'power_W'));
  const wing = 0.5 + 0.38 * power;
  b.box(1, [0, 0, 0], 0.42, 0.56, 0.42);
  // Solar wings on booms.
  for (const side of [1, -1]) {
    b.line(1, [
      [side * 0.21, 0, 0],
      [side * 0.3, 0, 0],
    ]);
    b.grid(1, [side * 0.3, -0.17, 0], [side * wing, 0, 0], [0, 0.34, 0], Math.max(3, Math.round(wing * 8)), 2);
  }
  // Dish antenna on top.
  const dish: Array<[number, number]> = [];
  for (let i = 0; i <= 4; i++) {
    const u = i / 4;
    dish.push([0.2 * u, 0.36 + 0.09 * u * u]);
  }
  b.revolve(1, dish, { segs: 20, meridians: 8 });
  b.line(1, [
    [0, 0.28, 0],
    [0, 0.5, 0],
  ]);
  // Instrument aperture looking down at the planet.
  b.ring(2, [0, -0.28, 0], 0.13, 20);
  b.ring(2, [0, -0.36, 0], 0.16, 20);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    b.line(2, [
      [Math.cos(a) * 0.13, -0.28, Math.sin(a) * 0.13],
      [Math.cos(a) * 0.16, -0.36, Math.sin(a) * 0.16],
    ]);
  }
  b.pitch = 0.36;
  b.yaw = -0.6;
  b.frameW = 1.22;
  b.frameH = 0.5;
  return b.build();
}

function rocketModel(part: Part | undefined): WireModel {
  const b = new WireBuilder();
  const r = 0.17;
  const profile: Array<[number, number]> = [
    [r * 0.75, -0.95],
    [r * 0.45, -0.84],
    [r, -0.8],
    [r, -0.5],
    [r, -0.2],
    [r, 0.08],
    [r, 0.14],
    [r, 0.4],
    [r * 1.15, 0.48],
    [r * 1.15, 0.66],
  ];
  for (let i = 1; i <= 5; i++) {
    const u = i / 5;
    profile.push([r * 1.15 * Math.sqrt(Math.max(0, 1 - u * u)), 0.66 + 0.3 * u]);
  }
  b.revolve(1, profile, { segs: 24, meridians: 12 });
  // Stage separation plane.
  b.ring(2, [0, 0.08, 0], r, 28);
  b.ring(2, [0, 0.14, 0], r, 28);
  // Fins.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    b.line(
      1,
      [
        [c * r, -0.55, s * r],
        [c * (r + 0.2), -0.84, s * (r + 0.2)],
        [c * (r + 0.2), -0.92, s * (r + 0.2)],
        [c * r, -0.8, s * r],
      ],
      true,
    );
  }
  // Strap-on boosters when the part is about them.
  const boosters = part?.category === 'strap_on_booster' ? clamp(Math.round(stat(part, 'booster_count') ?? 0), 0, 4) : 0;
  for (let i = 0; i < boosters; i++) {
    const a = (i / boosters) * TAU;
    const at: Vec3 = [Math.cos(a) * (r + 0.11), 0, Math.sin(a) * (r + 0.11)];
    b.revolve(
      2,
      [
        [0.07, -0.93],
        [0.1, -0.84],
        [0.1, -0.5],
        [0.1, -0.15],
        [0.05, -0.02],
        [0.005, 0.06],
      ],
      { segs: 12, meridians: 6, at },
    );
  }
  b.floor(-1.0, 0.7);
  b.pitch = 0.2;
  b.frameW = 0.74;
  b.frameH = 1.0;
  return b.build();
}

export interface ShapeLabels {
  north: string;
  south: string;
  /** Formats a latitude in degrees with its unit, e.g. "28.5°". */
  formatDeg: (deg: number) => string;
}

/** Builds the wireframe for a part id. Unknown ids get the generic launch vehicle. */
export function buildWireModel(partId: string, labels: ShapeLabels): WireModel {
  const part = getPart(partId);
  switch (shapeOf(part)) {
    case 'engine':
      return engineModel(part);
    case 'cluster':
      return clusterModel(part);
    case 'globe':
      return globeModel(part, labels);
    case 'tank':
      return tankModel(part);
    case 'fairing':
      return fairingModel(part);
    case 'capsule':
      return capsuleModel();
    case 'satellite':
      return satelliteModel(part);
    case 'rocket':
      return rocketModel(part);
  }
}
