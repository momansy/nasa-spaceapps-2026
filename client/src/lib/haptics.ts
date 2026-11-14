// Vibration patterns (design section 15). `haptic.cue` only names a cue; the pattern for each
// cue is defined here (protocol HapticCue). Durations are milliseconds: vibrate, pause, vibrate…
import type { HapticCue } from '@protocol';

export const HAPTIC_PATTERNS: Record<HapticCue, number[]> = {
  IGNITION: [40, 30, 60, 30, 120, 30, 260],
  MAX_Q_RUMBLE: [30, 20, 30, 20, 30, 20, 30, 20, 30, 20, 30],
  STAGING: [90, 60, 30],
  CHUTE_OPEN: [20, 40, 140],
  TOUCHDOWN: [160, 80, 60],
  ALERT: [60, 60, 60],
  GOOD_CALL: [25, 40, 25],
  VETO: [200],
  TIER_NONE: [20],
  TIER_BRONZE: [50],
  TIER_SILVER: [50, 60, 50],
  TIER_GOLD: [50, 60, 50, 60, 140],
  TIER_PLATINUM: [40, 40, 40, 40, 40, 40, 220],
};

let enabled = true;

/** Device preference `haptics` (settings screen). */
export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Vibrates when the device supports it and the player has not switched haptics off. */
export function vibrate(pattern: number | number[]): void {
  if (!enabled || !canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw before the first user gesture */
  }
}

export function playCue(cue: HapticCue): void {
  vibrate(HAPTIC_PATTERNS[cue]);
}

/** A short tick for button presses that matter (vote, callout). */
export function tap(): void {
  vibrate(12);
}
