// MG-24 Hoverslam (design section 10.5).
//
// "Tap IGNITE at the right altitude so the velocity of the booster reaches zero exactly at the
// ground." One tap gives a constant deceleration a = T/m − g0; the touchdown speed follows exactly
// (late: √(v² − 2ah); early: stop above the ground and fall again). A ghost marks the ideal
// ignition altitude h*. Success: touchdown speed < 2 m/s (strict); perfect: < 1 m/s. Fact MG-24.
// The team median of the touchdown speed (`value`, m/s) is the aggregate (team_median).
//
// This file is the glue: the one-button input, haptics and ARIA. The rules are in `model.ts`
// (pure, deterministic), the drawing in `render.ts`, the shared plumbing in `../MG-22/kit.ts`.
import { fmt } from '../../data/format';
import type { MinigameModule } from '../types';
import { runDemo, runMinigame, type Controller, type GameSpec, type Runtime } from '../MG-22/kit';
import { goodPlayer, makeSim, type Mg24Input, type Mg24Sim } from './model';
import { Mg24View } from './render';

function makeController(rt: Runtime<Mg24Sim, Mg24View>): Controller<Mg24Input> {
  const input: Mg24Input = { ignite: false };
  /** Simulation step at which the press happened; consumed by `sample`. */
  let pendingStep: number | null = null;
  let held = false;
  const press = (stepNow: number) => {
    if (pendingStep === null && rt.sim.phase === 'fall') pendingStep = stepNow;
  };
  return {
    sample(step) {
      input.ignite = pendingStep !== null && step >= pendingStep;
      if (input.ignite) pendingStep = null;
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
      held = down;
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

type Aria = 'fall' | 'slow' | 'burn' | 'cutoff' | 'soft' | 'hard';

const spec: GameSpec<Mg24Input, Mg24Sim, Mg24View> = {
  id: 'MG-24',
  ariaLabelKey: 'minigame.MG-24.aria.label',
  role: 'button',
  demoSeed: 24,
  makeSim: (params, seed, env) => makeSim(params, seed, env.mode, env.assistLevel, env.durationMs / 1000),
  makeView: (canvas, sim, env, compact) => new Mg24View(canvas, sim, env, compact),
  makeController,
  makeCues(env) {
    let phase = 'fall';
    let lastRumbleS = -1;
    return (sim) => {
      if (sim.step === 0) {
        phase = sim.phase;
        lastRumbleS = -1;
        return;
      }
      if (sim.phase !== phase) {
        phase = sim.phase;
        if (sim.phase === 'burn') {
          env.haptic(30);
          lastRumbleS = sim.timeS;
        } else if (sim.phase === 'down') env.haptic(sim.success ? [160, 80, 60] : [60, 60, 60]); // TOUCHDOWN or ALERT
      } else if (sim.phase === 'burn' && sim.timeS - lastRumbleS > 0.5) {
        env.haptic(20);
        lastRumbleS = sim.timeS;
      }
    };
  },
  aria(sim, env) {
    const key: Aria = sim.phase === 'down' ? (sim.success ? 'soft' : 'hard') : sim.phase === 'burn' ? 'burn' : sim.phase === 'cutoff' ? 'cutoff' : sim.clockRate < 0.5 ? 'slow' : 'fall';
    return {
      text: env.t('minigame.MG-24.aria.value', {
        alt: fmt(Math.max(0, sim.altitudeM), 0),
        speed: fmt(Math.max(0, sim.speedMS), 0),
        state: env.t(`minigame.MG-24.aria.${key}`, { v: fmt(sim.touchdownMS, 1, 1) }),
      }),
    };
  },
  demoInput(sim) {
    return goodPlayer(sim);
  },
};

const module: MinigameModule = {
  id: 'MG-24',
  create: (root, env) => runMinigame(root, env, spec),
  createDemo: (root, env) => runDemo(root, env, spec),
};

export default module;
