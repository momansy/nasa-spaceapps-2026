// Builds the stat rows of a Part Card (design section 14.3) from a catalog part. The rows are
// data-driven: any numeric stat of any category gets a row with its unit and a bar normalised
// within the category; engines get the paired "sea level / vacuum" rows of the specification.
import { maturityBandPct, partsOfCategory, type Part } from './catalog';
import { fmt, fmtField, fmtMoney, fmtSig, unitOfField } from './format';
import { normaliseWithinCategory } from './statbars';

export interface StatRow {
  /** Stable id, also the suffix of the label and explanation string keys (`ui.stat.<id>.*`). */
  id: string;
  /** Formatted value including the unit. */
  text: string;
  /** Bar length 0–1 normalised within the category, or null for rows without a bar. */
  fraction: number | null;
  /** Optional second line under the value (maturity word, range note). */
  noteKey?: string;
}

type Num = number | null | undefined;

function num(v: unknown): Num {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function statOf(p: Part, field: string): Num {
  return num(p.stats?.[field]);
}

function frac(part: Part, peers: Part[], pick: (p: Part) => Num): number | null {
  const idx = peers.indexOf(part);
  const values = peers.map(pick);
  if (idx < 0) return normaliseWithinCategory([pick(part), ...values])[0] ?? null;
  return normaliseWithinCategory(values)[idx] ?? null;
}

/** "850 / 930 kN" for a sea-level / vacuum pair; a single value when only one exists. */
function pairText(a: Num, b: Num, unit: string): string {
  const vals = [a, b].filter((v): v is number => typeof v === 'number');
  return `${vals.map((v) => fmtSig(v)).join(' / ')} ${unit}`;
}

/** Stats consumed by a paired or special row, so the generic loop skips them. */
const HANDLED = new Set(['thrust_sl_kN', 'thrust_vac_kN', 'isp_sl_s', 'isp_vac_s', 'throttle_min', 'throttle_max', 'stage']);

/** Stat rows above the Lead / Reliability lines, in card order. */
export function statRows(part: Part): StatRow[] {
  const peers = partsOfCategory(part.category);
  const rows: StatRow[] = [];
  const stats = part.stats ?? {};

  const tSl = statOf(part, 'thrust_sl_kN');
  const tVac = statOf(part, 'thrust_vac_kN');
  if (tSl != null || tVac != null) {
    rows.push({
      id: 'thrust',
      text: pairText(tSl, tVac, 'kN'),
      fraction: frac(part, peers, (p) => statOf(p, 'thrust_vac_kN') ?? statOf(p, 'thrust_sl_kN')),
    });
  }
  const iSl = statOf(part, 'isp_sl_s');
  const iVac = statOf(part, 'isp_vac_s');
  if (iSl != null || iVac != null) {
    rows.push({
      id: 'isp',
      text: pairText(iSl, iVac, 's'),
      fraction: frac(part, peers, (p) => statOf(p, 'isp_vac_s') ?? statOf(p, 'isp_sl_s')),
    });
  }

  for (const [field, raw] of Object.entries(stats)) {
    if (HANDLED.has(field)) continue;
    if (typeof raw === 'number') {
      rows.push({ id: field, text: fmtField(field, raw), fraction: frac(part, peers, (p) => statOf(p, field)) });
    } else if (typeof raw === 'boolean') {
      rows.push({ id: field, text: '', fraction: null, noteKey: raw ? 'ui.yes' : 'ui.no' });
    } else if (typeof raw === 'string') {
      rows.push({ id: field, text: '', fraction: null, noteKey: field.endsWith('_key') ? raw : `ui.enum.${field}.${raw}` });
    }
  }

  const tMin = statOf(part, 'throttle_min');
  const tMax = statOf(part, 'throttle_max');
  if (tMin != null && tMax != null) {
    rows.push({
      id: 'throttle',
      text: tMin === tMax ? `${fmt(tMax * 100, 0)} %` : `${fmt(tMin * 100, 0)}–${fmt(tMax * 100, 0)} %`,
      fraction: null,
      noteKey: tMin === tMax ? 'ui.stat.throttle.fixed' : undefined,
    });
  }

  const cost = num(part.game?.cost_M);
  if (cost != null) {
    rows.push({ id: 'cost', text: fmtMoney(cost), fraction: frac(part, peers, (p) => num(p.game?.cost_M)) });
  }
  return rows;
}

export interface ScheduleLine {
  leadDays: number | null;
  integDays: number | null;
}

export function scheduleLine(part: Part): ScheduleLine {
  return { leadDays: num(part.game?.lead_days) ?? null, integDays: num(part.game?.integ_days) ?? null };
}

export interface ReliabilityLine {
  /** "98.5 %" */
  text: string;
  /** "±1 %" uncertainty band of the maturity level, or null when the design gives none. */
  band: string | null;
  maturityKey: string | null;
  /** True for Mature and New parts: the card shows the hidden-risk badge. */
  hiddenRisk: boolean;
}

export function reliabilityLine(part: Part): ReliabilityLine | null {
  const rel = num(part.game?.reliability);
  const maturity = part.game?.maturity;
  if (rel == null && !maturity) return null;
  const band = maturityBandPct(maturity);
  return {
    text: rel != null ? `${fmt(rel * 100, 1)} %` : '',
    band: band != null ? `±${fmt(band, 0)} %` : null,
    maturityKey: maturity ? `ui.maturity.${maturity}` : null,
    hiddenRisk: maturity === 'mature' || maturity === 'new',
  };
}

/** Label key of a stat row. `statLabelFallback` gives readable text when the key is missing. */
export function statLabelKey(id: string): string {
  return `ui.stat.${id}.label`;
}

export function statExplainKey(id: string): string {
  return `ui.stat.${id}.explain`;
}

/** "min_inclination_deg" → "Min inclination": label for a stat nobody has written a string for yet. */
export function statLabelFallback(id: string): string {
  const base = unitOfField(id).base.replace(/_/g, ' ').trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
