// Clue table of MG-28 Root Cause Investigation (shared contract with T024).
// Generated once from one table; the one-line texts live in en.mg_entry.json as `minigame.MG-28.clue.<id>`.
// Clue texts describe engineering evidence only (design 12.1).
export const FAILURE_MODES = [
  'engine_shutdown',
  'combustion_instability',
  'pogo_oscillation',
  'structural_failure',
  'stage_recontact',
  'fairing_stuck',
  'guidance_drift',
  'radiation_bit_flip',
  'software_overflow',
  'solar_array_stuck',
  'cryogenic_leak',
  'heat_shield_burn_through',
  'parachute_failure',
  'range_safety_termination',
] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];
export const CHANNELS = ['pressure', 'temperature', 'vibration', 'software_log', 'log', 'thrust', 'attitude', 'power', 'load', 'comms', 'sensor', 'timing'] as const;
export type Channel = (typeof CHANNELS)[number];
export const PATTERNS = ['spike', 'drop', 'oscillation', 'drift', 'step', 'flatline'] as const;
export type Pattern = (typeof PATTERNS)[number];
export interface Clue {
  /** Index in `CLUES`; the number the host puts in `params.clues`. */
  id: number;
  /** Failure mode this clue belongs to (index into FAILURE_MODES), or −1 for a generic red-herring card. */
  mode: number;
  /** Position in the chain of evidence of its failure mode (0-based), or −1 for a red herring. */
  order: number;
  channel: Channel;
  pattern: Pattern;
  /** Flight phase id (`flight_phase.<phase>.name` in data/strings). */
  phase: string;
  /** i18n key of the one-line text. */
  textKey: string;
}
export const CLUES: readonly Clue[] = [
  { id: 0, mode: 0, order: 0, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.0' },
  { id: 1, mode: 0, order: 1, channel: 'pressure', pattern: 'drop', phase: 'F2', textKey: 'minigame.MG-28.clue.1' },
  { id: 2, mode: 0, order: 2, channel: 'thrust', pattern: 'step', phase: 'F2', textKey: 'minigame.MG-28.clue.2' },
  { id: 3, mode: 0, order: 3, channel: 'log', pattern: 'step', phase: 'F3', textKey: 'minigame.MG-28.clue.3' },
  { id: 4, mode: 1, order: 0, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.4' },
  { id: 5, mode: 1, order: 1, channel: 'pressure', pattern: 'oscillation', phase: 'F2', textKey: 'minigame.MG-28.clue.5' },
  { id: 6, mode: 1, order: 2, channel: 'temperature', pattern: 'spike', phase: 'F2', textKey: 'minigame.MG-28.clue.6' },
  { id: 7, mode: 1, order: 3, channel: 'thrust', pattern: 'step', phase: 'F2', textKey: 'minigame.MG-28.clue.7' },
  { id: 8, mode: 1, order: 4, channel: 'vibration', pattern: 'spike', phase: 'F2', textKey: 'minigame.MG-28.clue.8' },
  { id: 9, mode: 2, order: 0, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.9' },
  { id: 10, mode: 2, order: 1, channel: 'vibration', pattern: 'oscillation', phase: 'F3', textKey: 'minigame.MG-28.clue.10' },
  { id: 11, mode: 2, order: 2, channel: 'pressure', pattern: 'oscillation', phase: 'F3', textKey: 'minigame.MG-28.clue.11' },
  { id: 12, mode: 2, order: 3, channel: 'thrust', pattern: 'oscillation', phase: 'F3', textKey: 'minigame.MG-28.clue.12' },
  { id: 13, mode: 2, order: 4, channel: 'load', pattern: 'spike', phase: 'F4', textKey: 'minigame.MG-28.clue.13' },
  { id: 14, mode: 3, order: 0, channel: 'log', pattern: 'step', phase: 'F4', textKey: 'minigame.MG-28.clue.14' },
  { id: 15, mode: 3, order: 1, channel: 'load', pattern: 'spike', phase: 'F4', textKey: 'minigame.MG-28.clue.15' },
  { id: 16, mode: 3, order: 2, channel: 'vibration', pattern: 'spike', phase: 'F4', textKey: 'minigame.MG-28.clue.16' },
  { id: 17, mode: 3, order: 3, channel: 'attitude', pattern: 'step', phase: 'F4', textKey: 'minigame.MG-28.clue.17' },
  { id: 18, mode: 4, order: 0, channel: 'log', pattern: 'step', phase: 'F5', textKey: 'minigame.MG-28.clue.18' },
  { id: 19, mode: 4, order: 1, channel: 'timing', pattern: 'drift', phase: 'F5', textKey: 'minigame.MG-28.clue.19' },
  { id: 20, mode: 4, order: 2, channel: 'vibration', pattern: 'spike', phase: 'F5', textKey: 'minigame.MG-28.clue.20' },
  { id: 21, mode: 4, order: 3, channel: 'attitude', pattern: 'step', phase: 'F5', textKey: 'minigame.MG-28.clue.21' },
  { id: 22, mode: 5, order: 0, channel: 'log', pattern: 'step', phase: 'F6', textKey: 'minigame.MG-28.clue.22' },
  { id: 23, mode: 5, order: 1, channel: 'sensor', pattern: 'flatline', phase: 'F6', textKey: 'minigame.MG-28.clue.23' },
  { id: 24, mode: 5, order: 2, channel: 'load', pattern: 'drift', phase: 'F7', textKey: 'minigame.MG-28.clue.24' },
  { id: 25, mode: 5, order: 3, channel: 'thrust', pattern: 'step', phase: 'F7', textKey: 'minigame.MG-28.clue.25' },
  { id: 26, mode: 6, order: 0, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.26' },
  { id: 27, mode: 6, order: 1, channel: 'attitude', pattern: 'drift', phase: 'F3', textKey: 'minigame.MG-28.clue.27' },
  { id: 28, mode: 6, order: 2, channel: 'sensor', pattern: 'drift', phase: 'F7', textKey: 'minigame.MG-28.clue.28' },
  { id: 29, mode: 6, order: 3, channel: 'log', pattern: 'step', phase: 'F7', textKey: 'minigame.MG-28.clue.29' },
  { id: 30, mode: 7, order: 0, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.30' },
  { id: 31, mode: 7, order: 1, channel: 'log', pattern: 'step', phase: 'F8', textKey: 'minigame.MG-28.clue.31' },
  { id: 32, mode: 7, order: 2, channel: 'software_log', pattern: 'step', phase: 'F8', textKey: 'minigame.MG-28.clue.32' },
  { id: 33, mode: 7, order: 3, channel: 'timing', pattern: 'step', phase: 'F8', textKey: 'minigame.MG-28.clue.33' },
  { id: 34, mode: 8, order: 0, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.34' },
  { id: 35, mode: 8, order: 1, channel: 'software_log', pattern: 'spike', phase: 'F2', textKey: 'minigame.MG-28.clue.35' },
  { id: 36, mode: 8, order: 2, channel: 'software_log', pattern: 'step', phase: 'F2', textKey: 'minigame.MG-28.clue.36' },
  { id: 37, mode: 8, order: 3, channel: 'attitude', pattern: 'step', phase: 'F2', textKey: 'minigame.MG-28.clue.37' },
  { id: 38, mode: 9, order: 0, channel: 'log', pattern: 'step', phase: 'F8', textKey: 'minigame.MG-28.clue.38' },
  { id: 39, mode: 9, order: 1, channel: 'temperature', pattern: 'drop', phase: 'F8', textKey: 'minigame.MG-28.clue.39' },
  { id: 40, mode: 9, order: 2, channel: 'sensor', pattern: 'flatline', phase: 'F8', textKey: 'minigame.MG-28.clue.40' },
  { id: 41, mode: 9, order: 3, channel: 'power', pattern: 'drop', phase: 'F8', textKey: 'minigame.MG-28.clue.41' },
  { id: 42, mode: 10, order: 0, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.42' },
  { id: 43, mode: 10, order: 1, channel: 'pressure', pattern: 'drop', phase: 'F1', textKey: 'minigame.MG-28.clue.43' },
  { id: 44, mode: 10, order: 2, channel: 'temperature', pattern: 'drop', phase: 'F1', textKey: 'minigame.MG-28.clue.44' },
  { id: 45, mode: 10, order: 3, channel: 'thrust', pattern: 'drift', phase: 'F7', textKey: 'minigame.MG-28.clue.45' },
  { id: 46, mode: 11, order: 0, channel: 'log', pattern: 'step', phase: 'F9', textKey: 'minigame.MG-28.clue.46' },
  { id: 47, mode: 11, order: 1, channel: 'load', pattern: 'spike', phase: 'F10', textKey: 'minigame.MG-28.clue.47' },
  { id: 48, mode: 11, order: 2, channel: 'temperature', pattern: 'spike', phase: 'F11', textKey: 'minigame.MG-28.clue.48' },
  { id: 49, mode: 11, order: 3, channel: 'sensor', pattern: 'flatline', phase: 'F11', textKey: 'minigame.MG-28.clue.49' },
  { id: 50, mode: 12, order: 0, channel: 'log', pattern: 'step', phase: 'F12', textKey: 'minigame.MG-28.clue.50' },
  { id: 51, mode: 12, order: 1, channel: 'sensor', pattern: 'flatline', phase: 'F12', textKey: 'minigame.MG-28.clue.51' },
  { id: 52, mode: 12, order: 2, channel: 'timing', pattern: 'step', phase: 'F12', textKey: 'minigame.MG-28.clue.52' },
  { id: 53, mode: 12, order: 3, channel: 'load', pattern: 'spike', phase: 'F13', textKey: 'minigame.MG-28.clue.53' },
  { id: 54, mode: 13, order: 0, channel: 'log', pattern: 'step', phase: 'F2', textKey: 'minigame.MG-28.clue.54' },
  { id: 55, mode: 13, order: 1, channel: 'attitude', pattern: 'drift', phase: 'F3', textKey: 'minigame.MG-28.clue.55' },
  { id: 56, mode: 13, order: 2, channel: 'sensor', pattern: 'step', phase: 'F3', textKey: 'minigame.MG-28.clue.56' },
  { id: 57, mode: 13, order: 3, channel: 'comms', pattern: 'step', phase: 'F3', textKey: 'minigame.MG-28.clue.57' },
  { id: 58, mode: -1, order: -1, channel: 'temperature', pattern: 'drift', phase: 'F1', textKey: 'minigame.MG-28.clue.58' },
  { id: 59, mode: -1, order: -1, channel: 'comms', pattern: 'drop', phase: 'F8', textKey: 'minigame.MG-28.clue.59' },
  { id: 60, mode: -1, order: -1, channel: 'vibration', pattern: 'oscillation', phase: 'F2', textKey: 'minigame.MG-28.clue.60' },
  { id: 61, mode: -1, order: -1, channel: 'power', pattern: 'spike', phase: 'F8', textKey: 'minigame.MG-28.clue.61' },
  { id: 62, mode: -1, order: -1, channel: 'log', pattern: 'step', phase: 'F1', textKey: 'minigame.MG-28.clue.62' },
  { id: 63, mode: -1, order: -1, channel: 'pressure', pattern: 'drift', phase: 'F1', textKey: 'minigame.MG-28.clue.63' },
  { id: 64, mode: -1, order: -1, channel: 'timing', pattern: 'drift', phase: 'F5', textKey: 'minigame.MG-28.clue.64' },
  { id: 65, mode: -1, order: -1, channel: 'sensor', pattern: 'spike', phase: 'F10', textKey: 'minigame.MG-28.clue.65' },
];

/** Clue ids of one failure mode, in chain order. */
export function chainOf(mode: number): number[] {
  return CLUES.filter((c) => c.mode === mode).sort((a, b) => a.order - b.order).map((c) => c.id);
}
/** Ids of the generic red-herring cards. */
export const HERRINGS: number[] = CLUES.filter((c) => c.mode < 0).map((c) => c.id);
