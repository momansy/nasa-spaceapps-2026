// Mock host side of a phone pilot seat (`?mock=1&seat=pilot|copilot|booster`). Pure and
// deterministic: the mock room feeds it the phone's frames and a clock and sends the
// `pilot.hud` it returns. Every number here is a game value invented for the demo (the real
// host runs the flight simulation); none of it is physics.
import type { AttMode, Craft, DeployTarget, PayloadMap, PilotAction, PlayerId } from '@protocol';

export type SeatKind = 'pilot' | 'copilot' | 'booster';
export type SeatFault = 'NOT_PILOT' | 'BAD_PAYLOAD';

/** Throttle read-back slew, percent per second (game value). */
export const THROTTLE_SLEW_PCT_S = 60;
/** The host centres pitch, yaw and roll when no input arrives for this long (protocol). */
export const INPUT_TIMEOUT_MS = 500;
/** Time-warp factors the demo host offers (game values). */
export const WARP_STEPS = [1, 2, 5, 10];

export interface AppliedAction {
  craft: Craft | 'COPILOT';
  action: PilotAction | 'COPILOT_STAGE' | 'COPILOT_DEPLOY';
  n: number;
  attMode?: AttMode;
  deploy?: DeployTarget;
}

export interface SeatState {
  throttleCmd: number;
  throttlePct: number;
  pitch: number;
  yaw: number;
  roll: number;
  lastInputN: number;
  lastInputAtMs: number;
  inputsApplied: number;
  attMode: AttMode;
  rcsOn: boolean;
  stagesLeft: number;
  fairingDone: boolean;
  arraysDone: boolean;
  warp: number;
  held: boolean;
  abortRequested: boolean;
  mapOn: boolean;
  camera: number;
  promptOpen: boolean;
  /** Test hooks: force what `pilot.hud` says (cleared once the matching action is applied). */
  force: { canStage?: boolean; deployTarget?: DeployTarget | null; cue?: string | null; prompt?: boolean };
}

export class MockSeat {
  readonly state: SeatState = {
    throttleCmd: 0,
    throttlePct: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    lastInputN: 0,
    lastInputAtMs: 0,
    inputsApplied: 0,
    attMode: 'OFF',
    rcsOn: false,
    stagesLeft: 1,
    fairingDone: false,
    arraysDone: false,
    warp: 1,
    held: false,
    abortRequested: false,
    mapOn: false,
    camera: 0,
    promptOpen: true,
    force: {},
  };
  readonly log: AppliedAction[] = [];
  private lastActionN = new Map<string, number>();
  private metS = 0;

  constructor(
    readonly kind: SeatKind,
    private readonly me: PlayerId,
    private readonly bot: PlayerId,
  ) {}

  /** The assignment that puts this phone's player in the seat (the host device flies nothing). */
  assignment(segment: PayloadMap['pilot.assign']['segment'] = 'ASCENT'): PayloadMap['pilot.assign'] {
    switch (this.kind) {
      case 'pilot':
        return { segment, pilotId: this.me, pilotInput: 'PHONE', copilotId: this.bot, boosterPilotId: null, boosterInput: null };
      case 'copilot':
        return { segment, pilotId: this.bot, pilotInput: 'PHONE', copilotId: this.me, boosterPilotId: null, boosterInput: null };
      case 'booster':
        return { segment, pilotId: this.bot, pilotInput: 'HOST_DEVICE', copilotId: null, boosterPilotId: this.me, boosterInput: 'PHONE' };
    }
  }

  get craft(): Craft {
    return this.kind === 'booster' ? 'BOOSTER' : 'VEHICLE';
  }

  /** Who is allowed to send what, from the current assignment (messages.md `pilot.assign`). */
  authorise(assign: PayloadMap['pilot.assign'] | null, kind: 'pilot' | 'copilot', craft: Craft): SeatFault | null {
    if (!assign) return 'NOT_PILOT';
    if (kind === 'copilot') return assign.copilotId === this.me ? null : 'NOT_PILOT';
    if (craft === 'VEHICLE') return assign.pilotId === this.me && assign.pilotInput === 'PHONE' ? null : 'NOT_PILOT';
    return assign.boosterPilotId === this.me && assign.boosterInput === 'PHONE' ? null : 'NOT_PILOT';
  }

  onInput(d: PayloadMap['pilot.input'], nowMs: number): boolean {
    if (d.n <= this.state.lastInputN) return false; // older than the last applied: ignored
    const s = this.state;
    s.lastInputN = d.n;
    s.lastInputAtMs = nowMs;
    s.throttleCmd = d.throttle;
    s.pitch = d.pitch;
    s.yaw = d.yaw;
    s.roll = d.roll;
    s.inputsApplied += 1;
    return true;
  }

  /** Applies one discrete action; returns a fault for a malformed one. */
  onAction(d: PayloadMap['pilot.action']): SeatFault | null {
    if (d.action === 'ATT_HOLD' && !d.attMode) return 'BAD_PAYLOAD';
    if (d.action === 'DEPLOY' && !d.deploy) return 'BAD_PAYLOAD';
    const key = `p:${d.craft}`;
    if (d.n <= (this.lastActionN.get(key) ?? 0)) return null; // duplicate: ignored
    this.lastActionN.set(key, d.n);
    const s = this.state;
    this.log.push({ craft: d.craft, action: d.action, n: d.n, ...(d.attMode ? { attMode: d.attMode } : {}), ...(d.deploy ? { deploy: d.deploy } : {}) });
    switch (d.action) {
      case 'STAGE':
        this.stage();
        break;
      case 'CUTOFF':
        s.throttleCmd = 0;
        break;
      case 'RCS_TOGGLE':
        s.rcsOn = !s.rcsOn;
        break;
      case 'ATT_HOLD':
        s.attMode = d.attMode!;
        s.promptOpen = false;
        break;
      case 'DEPLOY':
        this.deploy(d.deploy!);
        break;
      case 'WARP_UP': {
        const i = WARP_STEPS.indexOf(s.warp);
        // The host enforces the warp rules (design 9.7): no warp up before orbit.
        if (this.metS >= ORBIT_MET_S && i >= 0 && i < WARP_STEPS.length - 1) s.warp = WARP_STEPS[i + 1]!;
        break;
      }
      case 'WARP_DOWN': {
        const i = WARP_STEPS.indexOf(s.warp);
        if (i > 0) s.warp = WARP_STEPS[i - 1]!;
        break;
      }
      case 'MAP_TOGGLE':
        s.mapOn = !s.mapOn;
        break;
      case 'CAMERA_CYCLE':
        s.camera = (s.camera + 1) % 4;
        break;
      case 'ABORT':
        s.abortRequested = true;
        break;
      case 'COUNTDOWN_HOLD':
        s.held = true;
        break;
      case 'COUNTDOWN_RESUME':
        s.held = false;
        break;
    }
    return null;
  }

  onCopilot(d: PayloadMap['copilot.action']): SeatFault | null {
    if (d.action === 'DEPLOY' && !d.deploy) return 'BAD_PAYLOAD';
    const key = 'c';
    if (d.n <= (this.lastActionN.get(key) ?? 0)) return null;
    this.lastActionN.set(key, d.n);
    this.log.push({ craft: 'COPILOT', action: d.action === 'STAGE' ? 'COPILOT_STAGE' : 'COPILOT_DEPLOY', n: d.n, ...(d.deploy ? { deploy: d.deploy } : {}) });
    if (d.action === 'STAGE') this.stage();
    else this.deploy(d.deploy!);
    return null;
  }

  private stage() {
    const s = this.state;
    if (this.canStage()) {
      s.stagesLeft -= 1;
      s.throttleCmd = Math.max(0, s.throttleCmd);
    }
    s.force.canStage = undefined;
  }

  private deploy(target: DeployTarget) {
    const s = this.state;
    const t = target === 'CONTEXT' ? this.contextDeploy() : target;
    if (t === 'FAIRING') s.fairingDone = true;
    if (t === 'ARRAYS') s.arraysDone = true;
    s.force.deployTarget = undefined;
  }

  private contextDeploy(): DeployTarget | null {
    const s = this.state;
    if (s.force.deployTarget !== undefined) return s.force.deployTarget;
    if (!s.fairingDone && this.metS >= FAIRING_MET_S) return 'FAIRING';
    if (s.fairingDone && !s.arraysDone && this.metS >= ORBIT_MET_S) return 'ARRAYS';
    return null;
  }

  private canStage(): boolean {
    const s = this.state;
    if (s.force.canStage !== undefined) return s.force.canStage;
    return s.stagesLeft > 0 && this.metS >= STAGE_MET_S;
  }

  /** Advances the demo flight: throttle read-back, centring after a silent input, mission time. */
  tick(dtMs: number, nowMs: number, metS: number) {
    const s = this.state;
    this.metS = metS;
    const target = s.throttleCmd * 100;
    const step = (THROTTLE_SLEW_PCT_S * dtMs) / 1000;
    s.throttlePct = Math.abs(target - s.throttlePct) <= step ? target : s.throttlePct + Math.sign(target - s.throttlePct) * step;
    if (s.lastInputAtMs > 0 && nowMs - s.lastInputAtMs > INPUT_TIMEOUT_MS) {
      s.pitch = 0;
      s.yaw = 0;
      s.roll = 0;
    }
  }

  hud(to: PlayerId[]): PayloadMap['pilot.hud'] {
    const s = this.state;
    const cueKey = s.force.cue !== undefined ? s.force.cue : this.metS >= MAXQ_MET_S - 20 && this.metS <= MAXQ_MET_S + 25 ? 'ui.pilot.cue.throttle_down_max_q' : null;
    const prompt = s.force.prompt ?? (s.promptOpen && this.metS >= 12);
    return {
      to,
      craft: this.craft,
      throttlePct: Math.round(s.throttlePct * 10) / 10,
      attMode: s.attMode,
      rcsOn: s.rcsOn,
      canStage: this.canStage(),
      deployTarget: this.contextDeploy(),
      warp: s.warp,
      prompts: prompt ? [{ requestId: 'point_antenna', role: 'INCO' }] : [],
      cue: cueKey ? { key: cueKey } : null,
    };
  }
}

/** Mission-time thresholds of the demo, s (game values). */
export const STAGE_MET_S = 40;
export const MAXQ_MET_S = 62;
export const FAIRING_MET_S = 110;
export const ORBIT_MET_S = 200;
