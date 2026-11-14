// MG-08b Propellant Loading (design section 10.5, countdown F1, parallel solo, 20 s).
//
// "Keep a tank fill rate in the target band by tapping valves while boil-off vents. Overfill
// vents propellant; underfill causes a hold." Success: tank ≥ 99 % at T−0 without overpressure.
//
// Glue only: rules in `model.ts`, drawing in `render.ts`, browser plumbing in
// `../MG-09/shared/kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameModule } from '../types';
import { replay, type SimInput } from '../MG-09/shared/core';
import { mountDemo, mountGame, type CanvasGame } from '../MG-09/shared/kit';
import { newSim, resolveConfig, scriptedValve, VALVE_STEPS, type Mg08bSim } from './model';
import { Mg08bView } from './render';
import { fmt } from '../../data/format';

function makeGame(canvas: HTMLCanvasElement, env: MinigameEnv, params: MgMap, seed: number, preview: boolean): CanvasGame {
  const config = resolveConfig(params, env.mode, env.assistLevel);
  const durationMs = env.durationMs;
  const sim: Mg08bSim = newSim(config, seed, durationMs);
  const view = new Mg08bView(canvas, sim, env.t, env.reducedMotion, false);
  let down: 'open' | 'close' | 'hold' | null = null;
  let holdId: number | null = null;
  let lastZone = 0;
  let lastRumble = -1e9;
  let lastPhase = sim.phase;
  let wasOver = false;

  return {
    advance: (ms) => sim.advanceTo(ms),
    afterAdvance(ms) {
      if (preview) return;
      if (sim.overpressure && !wasOver) {
        wasOver = true;
        env.haptic([60, 60, 60]);
      }
      if (sim.phase !== lastPhase) {
        lastPhase = sim.phase;
        env.haptic([25, 40, 25]);
      }
      const z = sim.zone;
      if (z !== lastZone) {
        if (z === 0) env.haptic(10);
        lastZone = z;
        lastRumble = ms;
      } else if (z !== 0 && ms - lastRumble > 600) {
        env.haptic(20);
        lastRumble = ms;
      }
    },
    pointer(kind, x, y, ms, id) {
      if (config.oneButton) {
        if (kind === 'down' && holdId === null) {
          holdId = id;
          down = 'hold';
          sim.push({ t: ms, k: 'h', v: 1 });
        } else if (kind === 'up' && holdId === id) {
          holdId = null;
          down = null;
          sim.push({ t: ms, k: 'h', v: 0 });
        }
        return;
      }
      if (kind === 'up') {
        down = null;
        return;
      }
      if (kind !== 'down') return;
      const b = view.buttonAt(x, y);
      if (!b) return;
      down = b;
      sim.push({ t: ms, k: 'v', v: b === 'open' ? 1 : -1 });
      if (!preview) env.haptic(8);
    },
    key(kind, key, ms, repeat) {
      if (config.oneButton) {
        if (key !== ' ' && key !== 'Enter') return false;
        if (kind === 'down' && !repeat) {
          down = 'hold';
          sim.push({ t: ms, k: 'h', v: 1 });
        } else if (kind === 'up') {
          down = null;
          sim.push({ t: ms, k: 'h', v: 0 });
        }
        return true;
      }
      const up = key === 'ArrowUp' || key === 'ArrowRight' || key === '+' || key === '=';
      const dn = key === 'ArrowDown' || key === 'ArrowLeft' || key === '-';
      const home = key === 'Home';
      if (!up && !dn && !home) return false;
      if (kind === 'up') {
        down = null;
        return true;
      }
      if (home) sim.push({ t: ms, k: 's', v: 0 });
      else {
        down = up ? 'open' : 'close';
        sim.push({ t: ms, k: 'v', v: up ? 1 : -1 });
      }
      return true;
    },
    release(ms) {
      down = null;
      if (holdId !== null || config.oneButton) sim.push({ t: ms, k: 'h', v: 0 });
      holdId = null;
    },
    draw(f) {
      view.draw({ timeMs: f.timeMs, down, pausedText: f.paused ? env.t('minigame.MG-08b.paused') : null });
    },
    resize: () => view.resize(),
    done: () => sim.done,
    result() {
      const s = replay(() => newSim(config, seed, durationMs), sim.log).score();
      return { success: s.success, perfect: s.perfect, score: s.score };
    },
    progress: () => Math.min(1, Math.max(0, (sim.level - sim.level0) / Math.max(0.01, config.fillMin - sim.level0))),
    aria() {
      const z = sim.zone;
      return {
        valuetext: env.t('minigame.MG-08b.aria.value', {
          level: fmt(Math.floor(sim.level * 1000) / 10, 1, 1),
          valve: config.oneButton ? (sim.buttonOpen ? VALVE_STEPS : 0) : sim.valve,
          max: VALVE_STEPS,
          band: env.t(z === 0 ? 'minigame.MG-08b.aria.in_band' : z === 1 ? 'minigame.MG-08b.aria.high' : 'minigame.MG-08b.aria.low'),
        }),
        now: Math.round(sim.level * 100),
        min: 0,
        max: 100,
      };
    },
  };
}

function create(root: HTMLElement, env: MinigameEnv) {
  return mountGame(root, env, {
    role: 'application',
    labelKey: env.mode === 'ONE_BUTTON' ? 'minigame.MG-08b.aria.label_one' : 'minigame.MG-08b.aria.label',
    make: (canvas, params, seed, preview) => makeGame(canvas, env, params, seed, preview),
  });
}

/** Demo: a whole 20 s loading in about 3 s, a ghost finger tapping the valve buttons. */
const DEMO_RUN_MS = 20_000;
const DEMO_LOOP_MS = 3200;

function createDemo(root: HTMLElement, env: MinigameEnv) {
  return mountDemo(root, (canvas) => {
    const config = resolveConfig({}, 'STANDARD', env.assistLevel);
    let sim = newSim(config, 8, DEMO_RUN_MS);
    const view = new Mg08bView(canvas, sim, env.t, env.reducedMotion, true);
    let inputs: SimInput[] = [];
    let next = 0;
    const reset = () => {
      sim = newSim(config, 8, DEMO_RUN_MS);
      inputs = scriptedValve(() => newSim(config, 8, DEMO_RUN_MS), 400, 0);
      next = 0;
      view.setSim(sim);
    };
    reset();
    return {
      loopMs: DEMO_LOOP_MS,
      holdMs: 600,
      reset,
      frame(loopMs, timeMs) {
        const playMs = (loopMs / DEMO_LOOP_MS) * DEMO_RUN_MS;
        while (next < inputs.length && inputs[next]!.t <= playMs) sim.push(inputs[next++]!);
        sim.advanceTo(playMs);
        const upcoming = inputs[next];
        const prev = inputs[next - 1];
        const near = (i: SimInput | undefined) => !!i && Math.abs(i.t - playMs) < 500;
        const target = near(prev) ? prev : upcoming;
        const finger = target ? ((target.v ?? 0) > 0 ? 'open' : 'close') : 'open';
        view.draw({ timeMs, finger, fingerDown: near(prev) });
      },
      resize: () => view.resize(),
    };
  });
}

const module: MinigameModule = { id: 'MG-08b', create, createDemo };

export default module;
