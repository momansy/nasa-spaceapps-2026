// Pure hold-to-confirm gesture (design 9.2: STAGE 0.3 s, ABORT 1.5 s; durations come from
// data/pilot_controls.json via `holdMs`). The phone times the hold and sends the action once,
// when it completes. A hold is cancelled by lifting early, by sliding off the control or by
// moving more than `SLOP_PX` (so a swipe never stages). Time is passed in; no timers here.

export type HoldState = 'idle' | 'holding' | 'done' | 'cancelled';

/** Finger travel that turns a press into a swipe, CSS px (game value). */
export const SLOP_PX = 14;
/** The 1.5 s ABORT hold tolerates a shaking hand more than the 0.3 s STAGE hold (game value). */
export const ABORT_SLOP_PX = 28;

export interface HoldStep {
  state: HoldState;
  /** 0…1. */
  progress: number;
  /** True exactly once per gesture: on the step that completes it. */
  completed: boolean;
}

export class HoldGesture {
  private state: HoldState = 'idle';
  private startedAt = 0;
  private originX = 0;
  private originY = 0;

  constructor(
    readonly holdMs: number,
    /** Finger travel that cancels the hold (a deliberate long hold tolerates more tremor). */
    readonly slopPx: number = SLOP_PX,
  ) {
    if (!(holdMs > 0)) throw new RangeError('holdMs must be > 0');
  }

  get current(): HoldState {
    return this.state;
  }

  /** Finger down on the control. A completed or cancelled gesture needs `release()` first. */
  begin(nowMs: number, x = 0, y = 0): HoldStep {
    if (this.state === 'idle') {
      this.state = 'holding';
      this.startedAt = nowMs;
      this.originX = x;
      this.originY = y;
    }
    return this.step(nowMs);
  }

  /** Pointer position while holding: sliding off the control (`inside` false) or a swipe cancels. */
  move(x: number, y: number, inside: boolean): HoldStep {
    if (this.state === 'holding' && (!inside || Math.hypot(x - this.originX, y - this.originY) > this.slopPx)) this.state = 'cancelled';
    return this.snapshot(false);
  }

  /** Advances the clock. Completes once when `holdMs` have passed. */
  tick(nowMs: number): HoldStep {
    return this.step(nowMs);
  }

  /** Finger up (or pointer cancelled): an unfinished hold is cancelled, then the gesture resets. */
  release(): HoldStep {
    const was = this.state;
    this.state = 'idle';
    return { state: was === 'holding' ? 'cancelled' : was, progress: 0, completed: false };
  }

  cancel(): HoldStep {
    if (this.state === 'holding') this.state = 'cancelled';
    return this.snapshot(false);
  }

  private step(nowMs: number): HoldStep {
    if (this.state !== 'holding') return this.snapshot(false);
    const progress = Math.min(1, Math.max(0, (nowMs - this.startedAt) / this.holdMs));
    if (progress >= 1) {
      this.state = 'done';
      return { state: 'done', progress: 1, completed: true };
    }
    return { state: 'holding', progress, completed: false };
  }

  private snapshot(completed: boolean): HoldStep {
    return { state: this.state, progress: this.state === 'done' ? 1 : 0, completed };
  }
}
