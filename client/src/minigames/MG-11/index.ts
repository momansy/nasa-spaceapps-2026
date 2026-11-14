// MG-11 Pogo Damper (design section 10.5, flight phase F5, team sync, 15 s).
//
// "The vehicle bounces lengthwise. Tap in counter-rhythm to the oscillation to cancel it. The
// more players in sync, the faster it dampens." Success: taps opposite in phase for ≥ 70 % of
// beats. Fact F07.
//
// Glue only: rules in `model.ts`, drawing in `render.ts`, browser plumbing in
// `../MG-09/shared/kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameModule } from '../types';
import { replay, slotOf, type SimInput } from '../MG-09/shared/core';
import { mountDemo, mountGame, type CanvasGame } from '../MG-09/shared/kit';
import { beatInputs, newSim, resolveConfig, type Mg11Sim } from './model';
import { Mg11View } from './render';

function makeGame(canvas: HTMLCanvasElement, env: MinigameEnv, params: MgMap, seed: number, preview: boolean): CanvasGame {
  const config = resolveConfig(params, env.mode, env.assistLevel);
  const durationMs = env.durationMs;
  const sim: Mg11Sim = newSim(config, params, seed, durationMs);
  const view = new Mg11View(canvas, sim, env.t, env.reducedMotion, false);
  const { slot, slots } = slotOf(params);
  const coop = preview ? undefined : env.coop;
  // With a host channel: teammate i is in sync on beat k when the shared state says beat_<i> = k.
  const unsubscribe = coop?.onState((st) => {
    for (let k = 0; k < sim.beatsS.length; k++) {
      let n = 0;
      for (let i = 0; i < slots; i++) if (i !== slot && st.shared[`beat_${i}`] === k) n++;
      if (n > 0) sim.liveSync[k] = Math.max(sim.liveSync[k]!, n);
    }
  });
  let pressed = false;
  let settled = 0;
  let lastPeakBeat = -1;

  const tap = (ms: number) => sim.push({ t: ms, k: 'p' });

  return {
    advance: (ms) => sim.advanceTo(ms),
    afterAdvance() {
      if (preview) return;
      // A rumble at each crest while the bounce is large; a tick for each beat in counter-phase.
      const tS = sim.timeS;
      const crest = Math.floor((tS - sim.t0S) / sim.periodS - 0.5);
      if (crest > lastPeakBeat && crest >= 0) {
        lastPeakBeat = crest;
        if (sim.amp > 0.35) env.haptic(Math.round(20 + 40 * Math.min(1, sim.amp)));
      }
      while (settled < sim.settledBeats) {
        if (sim.settled[settled] === 1) {
          env.haptic(12);
          coop?.send({ a: 'beat', x: [settled] });
        }
        settled++;
      }
    },
    pointer(kind, _x, _y, ms) {
      if (kind === 'down') {
        pressed = true;
        tap(ms);
      } else if (kind === 'up') pressed = false;
    },
    key(kind, key, ms, repeat) {
      if (key !== ' ' && key !== 'Enter') return false;
      if (kind === 'down' && !repeat) {
        pressed = true;
        tap(ms);
      } else if (kind === 'up') pressed = false;
      return true;
    },
    release() {
      pressed = false;
    },
    draw(f) {
      view.draw({ timeMs: f.timeMs, pressed, pausedText: f.paused ? env.t('minigame.MG-11.paused') : null });
    },
    resize: () => view.resize(),
    done: () => sim.done,
    result() {
      const s = replay(() => newSim(config, params, seed, durationMs), sim.log).score();
      return { success: s.success, perfect: s.perfect, score: s.score };
    },
    progress: () => (sim.settledBeats ? sim.goodBeats / sim.settledBeats : 0),
    aria() {
      const next = sim.beatsS.find((b) => b > sim.timeS);
      return {
        valuetext: env.t('minigame.MG-11.aria.value', {
          good: sim.goodBeats,
          done: sim.settledBeats,
          next: next === undefined ? 0 : Math.round((next - sim.timeS) * 10) / 10,
        }),
      };
    },
    dispose() {
      unsubscribe?.();
    },
  };
}

function create(root: HTMLElement, env: MinigameEnv) {
  return mountGame(root, env, {
    role: 'application',
    labelKey: 'minigame.MG-11.aria.label',
    make: (canvas, params, seed, preview) => makeGame(canvas, env, params, seed, preview),
  });
}

/** Demo: about 3 s of the real rhythm with a ghost finger tapping on each low point. */
function createDemo(root: HTMLElement, env: MinigameEnv) {
  return mountDemo(root, (canvas) => {
    const config = resolveConfig({}, 'STANDARD', env.assistLevel);
    const params = { slot: 0, slots: 4 };
    let sim = newSim(config, params, 11, 15_000);
    const view = new Mg11View(canvas, sim, env.t, env.reducedMotion, true);
    let taps: SimInput[] = [];
    let next = 0;
    const start = () => (sim.t0S - 0.6) * 1000;
    const reset = () => {
      sim = newSim(config, params, 11, 15_000);
      taps = beatInputs(sim, 0.01);
      next = 0;
      view.setSim(sim);
    };
    reset();
    return {
      loopMs: 3600,
      holdMs: 300,
      reset,
      frame(loopMs, timeMs) {
        const playMs = start() + loopMs;
        while (next < taps.length && taps[next]!.t <= playMs) sim.push(taps[next++]!);
        sim.advanceTo(playMs);
        view.draw({ timeMs, pressed: false, finger: true });
      },
      resize: () => view.resize(),
    };
  });
}

const module: MinigameModule = { id: 'MG-11', create, createDemo };

export default module;
