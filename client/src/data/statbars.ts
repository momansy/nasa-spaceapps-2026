// Stat-bar normalisation for Part Cards (design section 14.3: "Stat bars are normalized
// within the category so options compare at a glance"). Pure functions.

/** Smallest visible fill for a non-zero value, so a tiny engine still shows a sliver. */
export const MIN_VISIBLE_FRACTION = 0.03;

/**
 * Normalises one stat across all parts of a category. Each value becomes its share of the
 * largest magnitude in the category: 0 for zero, 1 for the largest. Missing values stay null
 * (the card shows no bar). Non-zero values never drop below MIN_VISIBLE_FRACTION.
 */
export function normaliseWithinCategory(values: ReadonlyArray<number | null | undefined>): Array<number | null> {
  let max = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) max = Math.max(max, Math.abs(v));
  }
  return values.map((v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (max === 0 || v === 0) return 0;
    return Math.min(1, Math.max(MIN_VISIBLE_FRACTION, Math.abs(v) / max));
  });
}

/** Fraction for one value given the other values of its category. */
export function fractionOf(value: number | null | undefined, categoryValues: ReadonlyArray<number | null | undefined>): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const all = normaliseWithinCategory([value, ...categoryValues]);
  return all[0] ?? null;
}
