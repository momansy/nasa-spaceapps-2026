// MG-23 Parachute Sequence (design section 10.5).
//
// "Deploy your parachute exactly when its altitude/speed gate lights." Four stages in Orion's
// order (cover chutes, drogues, pilots, mains: 11 canopies, fact F18); this player owns stage
// `slot` mod 4 and extra players are backups. Success: the chute opens inside its gate.
//
// Teams: per-player param `slot`, common param `slots`. Shared state (optional, display only):
// action `deploy` x = [stage, playTimeMs]; `shared.deployed` (number[4]) = play time in ms of each
// stage's deployment, −1 until it happens. Without `env.coop`, a seeded crew deploys the others.
import { fmt } from '../../data/format';
import type { MinigameModule } from '../types';
import { runDemo, runMinigame, type Controller, type GameSpec, type Runtime } from '../MG-22/kit';
import { goodPlayer, makeSim, STAGES, type Mg23Input, type Mg23Sim, type StageState } from './model';
import { Mg23View } from './render';

function makeController(rt: Runtime<Mg23Sim, Mg23View>): Controller<Mg23Input> {
  const input: Mg23Input = { deploy: false };
  /** Simulation step at which the press happened; consumed by `sample`. */
  let pendingStep: number | null = null;
  let held = false;

  const press = (stepNow: number) => {
    if (pendingStep === null && rt.sim.deployS === null) pendingStep = stepNow;
    const coop = rt.env.coop;
    if (coop && rt.sim.deployS === null) coop.send({ a: 'deploy', x: [rt.sim.config.stage, Math.round((stepNow / 120) * 1000)] });
  };

  return {
    sample(step) {
      input.deploy = pendingStep !== null && step >= pendingStep;
      if (input.deploy) pendingStep = null;
      return input;
    },
    down(_e, x, y, clock) {
      if (!rt.view.hits(x, y)) return;
      held = true;
      press(clock.stepNow());
    },
    move() {},
    up() {
      held = false;
    },
    key(e, down, clock) {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) press(clock.stepNow());
      return true;
    },
    release() {
      held = false;
    },
    active() {
      return held;
    },
  };
}

const STATE_ARIA: Record<StageState, string> = {
  wait: 'minigame.MG-23.aria.wait',
  gate: 'minigame.MG-23.aria.gate',
  ok: 'minigame.MG-23.aria.ok',
  torn: 'minigame.MG-23.aria.torn',
  late: 'minigame.MG-23.aria.late',
  missed: 'minigame.MG-23.aria.missed',
};

const spec: GameSpec<Mg23Input, Mg23Sim, Mg23View> = {
  id: 'MG-23',
  ariaLabelKey: 'minigame.MG-23.aria.label',
  role: 'button',
  demoSeed: 23,
  makeSim: (params, seed, env) => makeSim(params, seed, env.mode, env.assistLevel, env.durationMs / 1000),
  makeView: (canvas, sim, env, compact) => new Mg23View(canvas, sim, env, compact),
  makeController,
  makeCues(env) {
    let seen: StageState | null = null;
    return (sim) => {
      const st = sim.stageState(sim.config.stage);
      if (st === seen) return;
      const prev = seen;
      seen = st;
      if (prev === null) return;
      if (st === 'ok') env.haptic([20, 40, 140]); // CHUTE_OPEN
      else if (st === 'gate') env.haptic(14);
      else if (st === 'torn' || st === 'late' || st === 'missed') env.haptic([60, 60, 60]); // ALERT
    };
  },
  attach(rt) {
    const coop = rt.env.coop;
    if (!coop) return () => undefined;
    return coop.onState((state) => {
      const d = state.shared['deployed'];
      if (!Array.isArray(d)) return;
      for (let k = 0; k < 4; k++) {
        const v = d[k];
        if (k !== rt.sim.config.stage && typeof v === 'number' && v >= 0) rt.sim.coopS[k] = v / 1000;
      }
    });
  },
  aria(sim, env) {
    const st = sim.stageState(sim.config.stage);
    return {
      text: env.t('minigame.MG-23.aria.value', {
        stage: env.t(`minigame.MG-23.stage.${STAGES[sim.config.stage]!}`),
        state: env.t(STATE_ARIA[st], { s: fmt(Math.max(0, sim.gateOpenS - sim.timeS), 0) }),
        alt: fmt(Math.max(0, sim.altitudeM), 0),
      }),
    };
  },
  demoInput(sim) {
    return goodPlayer(sim, 0.1);
  },
};

const module: MinigameModule = {
  id: 'MG-23',
  create: (root, env) => runMinigame(root, env, spec),
  createDemo: (root, env) => runDemo(root, env, spec),
};

export default module;
