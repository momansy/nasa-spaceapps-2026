// Hold times of the touch column of design 9.2, read from data/pilot_controls.json
// (the design prints STAGE 0.3 s and ABORT 1.5 s; both are `physical`-free game values).
const files = import.meta.glob('../../../../data/pilot_controls.json', { eager: true, import: 'default' }) as Record<string, { controls?: Array<{ id: string; keyboard?: { hold_s?: number } }> }>;

const controls = Object.values(files)[0]?.controls ?? [];

/** Hold time of a control in milliseconds, from the shared data (fallback: the design's value). */
export function holdMs(id: 'stage_separate' | 'abort'): number {
  const s = controls.find((c) => c.id === id)?.keyboard?.hold_s;
  return Math.round((typeof s === 'number' && s > 0 ? s : id === 'abort' ? 1.5 : 0.3) * 1000);
}

export const STAGE_HOLD_MS = holdMs('stage_separate');
export const ABORT_HOLD_MS = holdMs('abort');

/** The abort cover closes again after this long without a hold, ms (game value). */
export const ABORT_COVER_MS = 6000;
