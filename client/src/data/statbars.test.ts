import { describe, expect, it } from 'vitest';
import { getPart, partsOfCategory } from './catalog';
import { fmtMetricDelta, fmtMoney, fmtSigned } from './format';
import { fractionOf, MIN_VISIBLE_FRACTION, normaliseWithinCategory } from './statbars';
import { reliabilityLine, statRows } from './stats';

/** Units are attached with a no-break space; compare with plain spaces. */
const sp = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('stat normalisation within a category', () => {
  it('maps the largest magnitude to 1 and keeps proportions', () => {
    expect(normaliseWithinCategory([850, 1700, 425])).toEqual([0.5, 1, 0.25]);
  });

  it('keeps missing values missing and zero at zero', () => {
    expect(normaliseWithinCategory([null, 0, 10, undefined, Number.NaN])).toEqual([null, 0, 1, null, null]);
  });

  it('gives a tiny non-zero value a visible sliver', () => {
    const [tiny] = normaliseWithinCategory([0.035, 8.4]);
    expect(tiny).toBe(MIN_VISIBLE_FRACTION);
  });

  it('uses magnitudes, so negative values (integration of -5 days) still compare', () => {
    expect(normaliseWithinCategory([-5, 10])).toEqual([0.5, 1]);
  });

  it('all-zero categories give empty bars', () => {
    expect(normaliseWithinCategory([0, 0])).toEqual([0, 0]);
    expect(fractionOf(3, [6, 1])).toBe(0.5);
  });
});

describe('Part Card rows from the catalog', () => {
  const workhorse = getPart('eng_kerolox_workhorse')!;

  it('builds the 14.3 example rows with units', () => {
    const rows = statRows(workhorse);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(sp(byId.thrust!.text)).toBe('850 / 930 kN');
    expect(sp(byId.isp!.text)).toBe('282 / 311 s');
    expect(sp(byId.mass_t!.text)).toBe('0.47 t');
    expect(sp(byId.cost!.text)).toBe('$1.2 M');
    expect(sp(byId.throttle!.text)).toBe('40–100 %');
  });

  it('normalises thrust against the strongest first-stage engine', () => {
    const peers = partsOfCategory('first_stage_engine');
    const maxVac = Math.max(...peers.map((p) => Number(p.stats?.thrust_vac_kN ?? 0)));
    const row = statRows(workhorse).find((r) => r.id === 'thrust')!;
    expect(row.fraction).toBeCloseTo(930 / maxVac, 5);
    const giant = statRows(getPart('eng_kerolox_giant')!).find((r) => r.id === 'thrust')!;
    expect(giant.fraction).toBe(1);
  });

  it('every part of several categories yields fractions within 0 to 1', () => {
    for (const id of ['first_stage_engine', 'upper_stage_engine', 'fairing', 'launch_site', 'instrument']) {
      for (const p of partsOfCategory(id)) {
        for (const r of statRows(p)) {
          if (r.fraction != null) {
            expect(r.fraction).toBeGreaterThanOrEqual(0);
            expect(r.fraction).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('reliability shows the maturity band and flags hidden risk for new parts', () => {
    const rel = reliabilityLine(workhorse)!;
    expect([sp(rel.text), sp(rel.band), rel.hiddenRisk]).toEqual(['98.5 %', '±1 %', false]);
    const relNew = reliabilityLine(getPart('eng_methalox_full_flow')!)!;
    expect([sp(relNew.band), relNew.hiddenRisk]).toEqual(['±6 %', true]);
  });
});

describe('number formatting keeps units and true minus signs', () => {
  it('formats signed values and money', () => {
    expect(fmtSigned(-10.8)).toBe('−10.8');
    expect(sp(fmtMoney(1.2))).toBe('$1.2 M');
    expect(sp(fmtMetricDelta('BUDGET_LEFT_M', -10.8))).toBe('−$10.8 M');
    expect(sp(fmtMetricDelta('TOTAL_DV_MS', 420))).toBe('+420 m/s');
    expect(sp(fmtMetricDelta('SCHEDULE_DAYS', 2))).toBe('+2 d');
  });
});
