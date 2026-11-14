// MG-09 Gravity Turn Tracer (design section 10.5, flight phase F3).
//
// "Trace the ideal ascent curve with a finger as the trajectory scrolls. The team's average
// error steers the real rocket." Success: average deviation below threshold (here: mean
// flight-path-angle error ≤ deviation_max_deg, default 4°, game value). `value` = this
// player's mean flight-path-angle error in degrees.
//
// Glue only: the rules are in `model.ts`, the drawing in `render.ts`, the shared browser
// plumbing in `shared/kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameModule } from '../types';
import { newSim, resolveConfig, tracerInputs, type Mg09Sim } from './model';
import { Mg09View } from './render';
import { replay, type SimInput } from './shared/core';
import { mountDemo, mountGame, type CanvasGame } from './shared/kit';

const KEY_STEP_DEG = 1;
const KEY_STEP_BIG_DEG = 5;

function makeGame(canvas: HTMLCanvasElement, env: MinigameEnv, params: MgMap, seed: number, preview: boolean): CanvasGame {
  const config = resolveConfig(params, env.mode, env.assistLevel);
  const durationMs = env.durationMs;
  const sim: Mg09Sim = newSim(config, seed, durationMs);
  const view = new Mg09View(canvas, sim, env.t, env.reducedMotion, false);
  let dragId: number | null = null;
  let pressed = false;
  let lastZone = 0;
  let lastRumbleMs = -1e9;
  let cueHits = 0;

  const setFromY = (y: number, ms: number) => sim.push({ t: ms, k: 'g', v: view.degOfY(y) });
  const zone = () => {
    const e = sim.errNow;
    const thr = config.deviationMaxDeg;
    return e > thr ? 1 : e < -thr ? -1 : 0;
  };

  return {
    advance: (ms) => sim.advanceTo(ms),
    afterAdvance(ms) {
      if (preview) return;
      // Haptics: rumble while off the corridor, a tick on the way back; a tick per hit cue.
      const z = zone();
      if (z !== lastZone) {
        if (z === 0) env.haptic(10);
        else {
          env.haptic([30, 30, 30]);
          lastRumbleMs = ms;
        }
        lastZone = z;
      } else if (z !== 0 && ms - lastRumbleMs > 500) {
        env.haptic(20);
        lastRumbleMs = ms;
      }
      let hits = 0;
      for (let i = 0; i < sim.cueHit.length; i++) if (sim.cueHit[i] === 1) hits++;
      if (hits > cueHits) env.haptic(15);
      cueHits = hits;
    },
    pointer(kind, _x, y, ms, id) {
      if (config.oneButton) {
        if (kind === 'down') {
          pressed = true;
          sim.push({ t: ms, k: 'p' });
        } else if (kind === 'up') pressed = false;
        return;
      }
      if (kind === 'down') {
        dragId = id;
        setFromY(y, ms);
      } else if (kind === 'move' && dragId === id) setFromY(y, ms);
      else if (kind === 'up' && dragId === id) dragId = null;
    },
    key(kind, key, ms, repeat) {
      if (config.oneButton) {
        if (key === ' ' || key === 'Enter') {
          if (kind === 'down' && !repeat) {
            pressed = true;
            sim.push({ t: ms, k: 'p' });
          } else if (kind === 'up') pressed = false;
          return true;
        }
        return false;
      }
      if (kind !== 'down') return key.startsWith('Arrow') || key === 'PageUp' || key === 'PageDown';
      let d = 0;
      if (key === 'ArrowUp' || key === 'ArrowRight') d = KEY_STEP_DEG;
      else if (key === 'ArrowDown' || key === 'ArrowLeft') d = -KEY_STEP_DEG;
      else if (key === 'PageUp') d = KEY_STEP_BIG_DEG;
      else if (key === 'PageDown') d = -KEY_STEP_BIG_DEG;
      else return false;
      sim.push({ t: ms, k: 'n', v: d });
      return true;
    },
    release() {
      dragId = null;
      pressed = false;
    },
    draw(f) {
      view.draw({ timeMs: f.timeMs, nowS: sim.timeS, active: dragId !== null || pressed, pressed, pausedText: f.paused ? env.t('minigame.MG-09.paused') : null });
    },
    resize: () => view.resize(),
    done: () => sim.done,
    result() {
      // The exact run: a replay of every input at its time stamp.
      const s = replay(() => newSim(config, seed, durationMs), sim.log).score();
      return { success: s.success, perfect: s.perfect, score: s.score, value: s.value };
    },
    progress: () => Math.max(0, 1 - sim.meanErr / (2 * config.deviationMaxDeg)),
    aria() {
      const z = zone();
      const state = env.t(z === 0 ? 'minigame.MG-09.status.on' : z === 1 ? 'minigame.MG-09.status.steep' : 'minigame.MG-09.status.shallow');
      const angle = Math.round(sim.gammaDeg);
      return { valuetext: env.t('minigame.MG-09.aria.value', { angle, target: Math.round(sim.idealAt(sim.step)), state }), now: angle, min: 0, max: 90 };
    },
  };
}

function create(root: HTMLElement, env: MinigameEnv) {
  return mountGame(root, env, {
    role: env.mode === 'ONE_BUTTON' ? 'application' : 'slider',
    labelKey: env.mode === 'ONE_BUTTON' ? 'minigame.MG-09.aria.label_one' : 'minigame.MG-09.aria.label',
    make: (canvas, params, seed, preview) => makeGame(canvas, env, params, seed, preview),
  });
}

/** The demo squeezes the first 9 s of a run into a 3 s loop, traced by a ghost finger. */
const DEMO_RUN_MS = 9000;
const DEMO_LOOP_MS = 3000;

function createDemo(root: HTMLElement, env: MinigameEnv) {
  return mountDemo(root, (canvas) => {
    const config = resolveConfig({}, 'STANDARD', env.assistLevel);
    let sim = newSim(config, 9, 25_000);
    let inputs: SimInput[] = [];
    let next = 0;
    const view = new Mg09View(canvas, sim, env.t, env.reducedMotion, true);
    const reset = () => {
      sim = newSim(config, 9, 25_000);
      inputs = tracerInputs(sim, { everyMs: 40, leadS: -0.15, wobbleDeg: 1.2, untilMs: DEMO_RUN_MS });
      next = 0;
      view.setSim(sim);
    };
    reset();
    return {
      loopMs: DEMO_LOOP_MS,
      holdMs: 500,
      reset,
      frame(loopMs, timeMs) {
        const playMs = (loopMs / DEMO_LOOP_MS) * DEMO_RUN_MS;
        while (next < inputs.length && inputs[next]!.t <= playMs) sim.push(inputs[next++]!);
        sim.advanceTo(playMs);
        view.draw({ timeMs, nowS: sim.timeS, active: true, finger: true });
      },
      resize: () => view.resize(),
    };
  });
}

const module: MinigameModule = { id: 'MG-09', create, createDemo };

export default module;
