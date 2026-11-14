// Number and unit formatting. Every number a player sees goes through here so that it always
// carries its unit (STANDING_ORDERS section 4) and uses the device language's digit grouping.
import type { BoostUnit, MetricId, TelemetryChannel } from '@protocol';

let locale = 'en';

/** Called by the preference layer when the language changes. */
export function setNumberLocale(lang: string) {
  locale = lang;
}

const cache = new Map<string, Intl.NumberFormat>();

function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, opts);
    } catch {
      f = new Intl.NumberFormat('en', opts);
    }
    cache.set(key, f);
  }
  return f;
}

/** A plain number with at most `maxDecimals` decimals. */
export function fmt(value: number, maxDecimals = 2, minDecimals = 0): string {
  return nf({ maximumFractionDigits: maxDecimals, minimumFractionDigits: Math.min(minDecimals, maxDecimals) }).format(value);
}

/** A number with up to four significant digits: 6,770 · 98.5 · 0.47 · 0.035. */
export function fmtSig(value: number): string {
  if (Math.abs(value) >= 1000) return nf({ maximumFractionDigits: 0 }).format(value);
  return nf({ maximumSignificantDigits: 4 }).format(value);
}

/** Signed with a real minus sign: +420, −10.8, ±0. */
export function fmtSigned(value: number, maxDecimals = 1): string {
  const abs = fmt(Math.abs(value), maxDecimals);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return `±${abs}`;
}

/** Game money: "$1.2 M". */
export function fmtMoney(valueM: number, maxDecimals = 1): string {
  const abs = fmt(Math.abs(valueM), maxDecimals);
  return `${valueM < 0 ? '−' : ''}$${abs} M`;
}

export function fmtMoneySigned(valueM: number, maxDecimals = 1): string {
  const abs = fmt(Math.abs(valueM), maxDecimals);
  const sign = valueM > 0 ? '+' : valueM < 0 ? '−' : '±';
  return `${sign}$${abs} M`;
}

/** Mission elapsed time: "T+01:23" or "T−00:08". */
export function fmtMet(seconds: number): string {
  const neg = seconds < 0;
  const s = Math.floor(Math.abs(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `T${neg ? '−' : '+'}${mm}:${ss}`;
}

export interface UnitSpec {
  /** Unit text shown after the number ("kN", "m/s"); empty for counts. */
  unit: string;
  decimals: number;
  /** "money" prints "$x M"; "pct01" multiplies a 0–1 fraction by 100. */
  kind?: 'money' | 'pct01' | 'flag';
}

/** Unit of a data field from its name suffix (data/README: "Units are in the field name"). */
const SUFFIX_UNITS: Array<[suffix: string, spec: UnitSpec]> = [
  ['_GB_per_day', { unit: 'GB/day', decimals: 1 }],
  ['_GB_per_pass', { unit: 'GB/pass', decimals: 1 }],
  ['_km_s', { unit: 'km/s', decimals: 1 }],
  ['_m_s', { unit: 'm/s', decimals: 0 }],
  ['_kN', { unit: 'kN', decimals: 0 }],
  ['_kg', { unit: 'kg', decimals: 0 }],
  ['_deg', { unit: '°', decimals: 1 }],
  ['_days', { unit: 'days', decimals: 0 }],
  ['_GB', { unit: 'GB', decimals: 1 }],
  ['_km', { unit: 'km', decimals: 0 }],
  ['_W', { unit: 'W', decimals: 0 }],
  ['_M', { unit: '', decimals: 1, kind: 'money' }],
  ['_t', { unit: 't', decimals: 2 }],
  ['_s', { unit: 's', decimals: 0 }],
  ['_m', { unit: 'm', decimals: 1 }],
];

/** Data fields that hold a 0–1 fraction and are shown as a percentage. */
const FRACTION_FIELDS = new Set(['throttle_min', 'throttle_max', 'power_duty', 'engine_out_bonus', 'reliability']);

export function unitOfField(field: string): UnitSpec & { base: string } {
  if (FRACTION_FIELDS.has(field)) return { unit: '%', decimals: 1, kind: 'pct01', base: field };
  for (const [suffix, spec] of SUFFIX_UNITS) {
    if (field.endsWith(suffix)) return { ...spec, base: field.slice(0, -suffix.length) };
  }
  return { unit: '', decimals: 2, base: field };
}

/** A data value with its unit: "850 kN", "$1.2 M", "40 %". */
export function fmtField(field: string, value: number): string {
  const spec = unitOfField(field);
  if (spec.kind === 'money') return fmtMoney(value, spec.decimals);
  if (spec.kind === 'pct01') return `${fmt(value * 100, spec.decimals)} %`;
  const n = spec.decimals >= 2 ? fmtSig(value) : fmt(value, spec.decimals);
  return spec.unit ? `${n}${spec.unit === '°' ? '' : ' '}${spec.unit}` : n;
}

/** How a Readiness Dashboard metric is printed (design 6.3). */
export interface MetricSpec {
  labelKey: string;
  unit: string;
  decimals: number;
  money?: boolean;
  /** "value": the card shows the value after the change (TWR 1.31); "delta": the signed change. */
  show: 'value' | 'delta';
}

export const METRIC_SPECS: Record<MetricId, MetricSpec> = {
  TOTAL_DV_MS: { labelKey: 'ui.metric.TOTAL_DV_MS', unit: 'm/s', decimals: 0, show: 'delta' },
  LIFTOFF_TWR: { labelKey: 'ui.metric.LIFTOFF_TWR', unit: '', decimals: 2, show: 'value' },
  UPPER_TWR: { labelKey: 'ui.metric.UPPER_TWR', unit: '', decimals: 2, show: 'value' },
  TOTAL_MASS_T: { labelKey: 'ui.metric.TOTAL_MASS_T', unit: 't', decimals: 1, show: 'delta' },
  COST_M: { labelKey: 'ui.metric.COST_M', unit: '', decimals: 1, money: true, show: 'delta' },
  BUDGET_LEFT_M: { labelKey: 'ui.metric.BUDGET_LEFT_M', unit: '', decimals: 1, money: true, show: 'delta' },
  SCHEDULE_DAYS: { labelKey: 'ui.metric.SCHEDULE_DAYS', unit: 'd', decimals: 0, show: 'delta' },
  SCHEDULE_MARGIN_DAYS: { labelKey: 'ui.metric.SCHEDULE_MARGIN_DAYS', unit: 'd', decimals: 0, show: 'delta' },
  SUCCESS_PCT: { labelKey: 'ui.metric.SUCCESS_PCT', unit: '%', decimals: 1, show: 'delta' },
  SUCCESS_BAND_PCT: { labelKey: 'ui.metric.SUCCESS_BAND_PCT', unit: '%', decimals: 1, show: 'value' },
  POWER_BALANCE_W: { labelKey: 'ui.metric.POWER_BALANCE_W', unit: 'W', decimals: 0, show: 'delta' },
  DATA_BUDGET_GB_DAY: { labelKey: 'ui.metric.DATA_BUDGET_GB_DAY', unit: 'GB/day', decimals: 1, show: 'delta' },
  ENTRY_SPEED_RATING_KMS: { labelKey: 'ui.metric.ENTRY_SPEED_RATING_KMS', unit: 'km/s', decimals: 1, show: 'value' },
  STABILITY: { labelKey: 'ui.metric.STABILITY', unit: '', decimals: 0, show: 'value' },
};

/** The current value of a metric with its unit: "9,420 m/s", "1.31", "$62.4 M". */
export function fmtMetricValue(metric: MetricId, value: number): string {
  const s = METRIC_SPECS[metric];
  if (s.money) return fmtMoney(value, s.decimals);
  const n = fmt(value, s.decimals, metric === 'LIFTOFF_TWR' || metric === 'UPPER_TWR' ? 2 : 0);
  return s.unit ? `${n} ${s.unit}` : n;
}

/** The signed change of a metric with its unit: "+420 m/s", "−$10.8 M", "+2 d". */
export function fmtMetricDelta(metric: MetricId, delta: number): string {
  const s = METRIC_SPECS[metric];
  if (s.money) return fmtMoneySigned(delta, s.decimals);
  const n = fmtSigned(delta, s.decimals);
  return s.unit ? `${n} ${s.unit}` : n;
}

/** Unit and precision of each console telemetry channel (protocol 9.2). */
export const CHANNEL_SPECS: Record<TelemetryChannel, { unit: string; decimals: number; kind?: 'flag' | 'time' | 'money' }> = {
  met_s: { unit: 's', decimals: 0, kind: 'time' },
  altitude_km: { unit: 'km', decimals: 1 },
  velocity_ms: { unit: 'm/s', decimals: 0 },
  countdown_s: { unit: 's', decimals: 0 },
  hold: { unit: '', decimals: 0, kind: 'flag' },
  consoles_red: { unit: '', decimals: 0 },
  consoles_amber: { unit: '', decimals: 0 },
  chamber_pressure_pct: { unit: '%', decimals: 0 },
  engines_running: { unit: '', decimals: 0 },
  engines_total: { unit: '', decimals: 0 },
  engine_health_pct: { unit: '%', decimals: 0 },
  prop_stage1_pct: { unit: '%', decimals: 0 },
  prop_stage2_pct: { unit: '%', decimals: 0 },
  throttle_pct: { unit: '%', decimals: 0 },
  q_kpa: { unit: 'kPa', decimals: 1 },
  load_pct: { unit: '%', decimals: 0 },
  g_load: { unit: 'g', decimals: 2 },
  vibration_pct: { unit: '%', decimals: 0 },
  traj_error_km: { unit: 'km', decimals: 2 },
  pitch_error_deg: { unit: '°', decimals: 1 },
  heading_error_deg: { unit: '°', decimals: 1 },
  apoapsis_km: { unit: 'km', decimals: 0 },
  periapsis_km: { unit: 'km', decimals: 0 },
  inclination_deg: { unit: '°', decimals: 1 },
  window_remaining_s: { unit: 's', decimals: 0 },
  dv_remaining_ms: { unit: 'm/s', decimals: 0 },
  battery_pct: { unit: '%', decimals: 0 },
  power_balance_w: { unit: 'W', decimals: 0 },
  temp_c: { unit: '°C', decimals: 1 },
  cabin_pressure_kpa: { unit: 'kPa', decimals: 1 },
  cabin_co2_pct: { unit: '%', decimals: 2 },
  signal_pct: { unit: '%', decimals: 0 },
  data_downlinked_gb: { unit: 'GB', decimals: 2 },
  next_pass_s: { unit: 's', decimals: 0 },
  in_pass: { unit: '', decimals: 0, kind: 'flag' },
  targets_captured: { unit: '', decimals: 0 },
  targets_total: { unit: '', decimals: 0 },
  payload_health_pct: { unit: '%', decimals: 0 },
  data_stored_gb: { unit: 'GB', decimals: 2 },
  entry_angle_deg: { unit: '°', decimals: 2 },
  heat_load_pct: { unit: '%', decimals: 0 },
  landing_ellipse_km: { unit: 'km', decimals: 1 },
  descent_rate_ms: { unit: 'm/s', decimals: 1 },
  chutes_deployed: { unit: '', decimals: 0 },
  budget_left_m: { unit: '', decimals: 1, kind: 'money' },
  schedule_margin_days: { unit: 'days', decimals: 0 },
  score_pts: { unit: 'pts', decimals: 0 },
  sync_meter: { unit: '%', decimals: 0 },
};

/** A boost amount with its unit: "+15 %", "×1.2", "+$4 M", "−5 days", "1 shield". */
export function fmtBoost(amount: number, unit: BoostUnit): string {
  switch (unit) {
    case 'PCT':
      return `${fmtSigned(amount, 1)} %`;
    case 'MULT':
      return `×${fmt(amount, 2)}`;
    case 'M_USD':
      return fmtMoneySigned(amount);
    case 'DAYS':
      return `${fmtSigned(amount, 0)} d`;
    case 'POINTS':
      return `${fmtSigned(amount, 0)} pts`;
    case 'SHIELDS':
      return `×${fmt(amount, 0)}`;
  }
}
