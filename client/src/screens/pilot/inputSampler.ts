// Pure sampler behind `pilot.input` (messages.md `pilot.input`, design 9.4).
//
// Rules, all from the protocol text:
//   - send on change at up to 30 Hz (`MIN_INTERVAL_MS`), and at 5 Hz while unchanged as a
//     keep-alive (`KEEP_ALIVE_MS`): the host centres pitch / yaw / roll when it hears nothing for 500 ms;
//   - `n` strictly increasing for the whole session (the host ignores older inputs);
//   - pitch, yaw and roll return to 0 when the finger lifts, throttle holds;
//   - nothing is sent while the sampler is inactive (paused, seat moved, input source is the host
//     device, page hidden). When it becomes active again the current state goes out at once.
// No DOM, no React: time and timers are injected so the unit tests drive it with fake timers.

/** 30 Hz upper bound of the protocol, with a margin of 1 ms against timer jitter (game value). */
export const MIN_INTERVAL_MS = 34;
/** 5 Hz keep-alive while the state is unchanged (protocol). */
export const KEEP_ALIVE_MS = 200;
/** Stick dead zone, fraction of full deflection (game value). */
export const DEAD_ZONE = 0.06;

export interface Axes {
  /** 0 = closed, 1 = full. */
  throttle: number;
  /** −1…1. */
  pitch: number;
  yaw: number;
  roll: number;
}

export interface InputFrame extends Axes {
  n: number;
}

export interface SamplerEnv {
  send: (frame: InputFrame) => void;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Dead zone with the remaining travel rescaled to the full range, so the response stays smooth. */
export function applyDeadZone(v: number, zone = DEAD_ZONE): number {
  const x = clamp(v, -1, 1);
  const a = Math.abs(x);
  if (a <= zone) return 0;
  return Math.sign(x) * ((a - zone) / (1 - zone));
}

export class InputSampler {
  private axes: Axes = { throttle: 0, pitch: 0, yaw: 0, roll: 0 };
  private n: number;
  private active = false;
  private dirty = false;
  private lastSentAt = -Infinity;
  private pending: unknown = null;
  private keep: unknown = null;

  constructor(
    private readonly env: SamplerEnv,
    startN = 0,
  ) {
    this.n = startN;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** The counter of the last frame sent (0 before the first). */
  get lastN(): number {
    return this.n;
  }

  current(): Axes {
    return { ...this.axes };
  }

  /** Sets any of the four axes (dead zone and clamping applied to pitch, yaw, roll). */
  set(patch: Partial<Axes>) {
    const next: Axes = {
      throttle: patch.throttle === undefined ? this.axes.throttle : round3(clamp(patch.throttle, 0, 1)),
      pitch: patch.pitch === undefined ? this.axes.pitch : round3(applyDeadZone(patch.pitch)),
      yaw: patch.yaw === undefined ? this.axes.yaw : round3(applyDeadZone(patch.yaw)),
      roll: patch.roll === undefined ? this.axes.roll : round3(applyDeadZone(patch.roll)),
    };
    if (next.throttle === this.axes.throttle && next.pitch === this.axes.pitch && next.yaw === this.axes.yaw && next.roll === this.axes.roll) return;
    this.axes = next;
    this.dirty = true;
    this.request();
  }

  /** The finger lifted: pitch, yaw and roll centre, throttle holds. */
  centre() {
    this.set({ pitch: 0, yaw: 0, roll: 0 });
  }

  /** Switches sending on or off (pause, seat change, hidden page). Going on sends at once. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (!on) {
      this.clearTimers();
      return;
    }
    this.emit();
  }

  /** Stops every timer; the sampler can be reused. */
  dispose() {
    this.active = false;
    this.clearTimers();
  }

  private clearTimers() {
    if (this.pending != null) this.env.clearTimer(this.pending);
    if (this.keep != null) this.env.clearTimer(this.keep);
    this.pending = null;
    this.keep = null;
  }

  private request() {
    if (!this.active) return;
    const wait = MIN_INTERVAL_MS - (this.env.now() - this.lastSentAt);
    if (wait <= 0) {
      this.emit();
    } else if (this.pending == null) {
      this.pending = this.env.setTimer(() => {
        this.pending = null;
        if (this.active && this.dirty) this.emit();
      }, wait);
    }
  }

  private emit() {
    if (!this.active) return;
    this.clearTimers();
    this.n += 1;
    this.dirty = false;
    this.lastSentAt = this.env.now();
    this.env.send({ n: this.n, ...this.axes });
    this.keep = this.env.setTimer(() => {
      this.keep = null;
      this.emit();
    }, KEEP_ALIVE_MS);
  }
}
