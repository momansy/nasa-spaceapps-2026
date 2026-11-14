// MG-07 Go/No-Go Poll (design section 10.5, countdown F1, relay, about 5 s per player).
//
// "FLIGHT calls each console in turn. Each player sees 3 readings for their console with the
// launch-commit limits. Answer GO or NO-GO correctly within 5 s." Success: correct call in time.
// Fact F31 (lightning rules).
//
// Glue only: rules in `model.ts`, drawing in `render.ts`, browser plumbing in
// `../MG-09/shared/kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameModule } from '../types';
import { replay } from '../MG-09/shared/core';
import { mountDemo, mountGame, type CanvasGame } from '../MG-09/shared/kit';
import { CHANNELS, newSim, resolveConfig, type Mg07Sim } from './model';
import { limitText, Mg07View } from './render';
import { fmt } from '../../data/format';

function makeGame(canvas: HTMLCanvasElement, env: MinigameEnv, params: MgMap, seed: number, preview: boolean): CanvasGame {
  const config = resolveConfig(params, env.mode, env.assistLevel, env.durationMs);
  const durationMs = env.durationMs;
  const sim: Mg07Sim = newSim(config, params, seed, durationMs);
  const view = new Mg07View(canvas, sim, env.t, env.reducedMotion, false);
  const liveCalls = new Map<number, boolean>();
  const coop = preview ? undefined : env.coop;
  const unsubscribe = coop?.onState((st) => {
    for (let i = 0; i < sim.slots; i++) {
      if (i === sim.slot) continue;
      const v = st.shared[`call_${i}`];
      if (typeof v === 'number') liveCalls.set(i, v === 1);
    }
  });
  let down: 'GO' | 'NOGO' | null = null;
  let wasTurn = false;
  let sent = false;
  let lastLit: 'GO' | 'NOGO' | null = null;

  const answer = (k: 'go' | 'nogo' | 'p', ms: number) => sim.push({ t: ms, k });

  return {
    advance: (ms) => sim.advanceTo(ms),
    afterAdvance() {
      if (preview) return;
      if (!wasTurn && sim.myTurn) {
        wasTurn = true;
        env.haptic([25, 40, 25]);
      }
      if (config.oneButton && sim.myTurn && !sim.answer) {
        const lit = sim.highlighted(sim.timeMs);
        if (lit !== lastLit && lastLit !== null) env.haptic(8);
        lastLit = lit;
      }
      if (coop && !sent && sim.answer) {
        sent = true;
        coop.send({ a: 'call', x: [sim.answer === 'GO' ? 1 : 0, Math.round(sim.answerMs)] });
      }
    },
    pointer(kind, x, y, ms) {
      if (kind === 'up') {
        down = null;
        return;
      }
      if (kind !== 'down') return;
      if (config.oneButton) {
        down = sim.myTurn ? sim.highlighted(ms) : null;
        answer('p', ms);
        return;
      }
      const b = view.buttonAt(x, y);
      if (!b) return;
      down = b;
      answer(b === 'GO' ? 'go' : 'nogo', ms);
    },
    key(kind, key, ms, repeat) {
      const k = key.toLowerCase();
      const isGo = k === 'g' || key === '1';
      const isNogo = k === 'n' || key === '2';
      const isOne = key === ' ' || key === 'Enter';
      if (config.oneButton ? !isOne : !isGo && !isNogo) return false;
      if (kind === 'up') {
        down = null;
        return true;
      }
      if (repeat) return true;
      if (config.oneButton) {
        down = sim.myTurn ? sim.highlighted(ms) : null;
        answer('p', ms);
      } else {
        down = isGo ? 'GO' : 'NOGO';
        answer(isGo ? 'go' : 'nogo', ms);
      }
      return true;
    },
    release() {
      down = null;
    },
    draw(f) {
      view.draw({ timeMs: f.timeMs, liveCalls, down, pausedText: f.paused ? env.t('minigame.MG-07.paused') : null });
    },
    resize: () => view.resize(),
    done: () => sim.done,
    result() {
      const s = replay(() => newSim(config, params, seed, durationMs), sim.log).score();
      return { success: s.success, perfect: s.perfect, score: s.score };
    },
    progress: () => (sim.answer ? 1 : 0),
    aria() {
      if (!sim.myTurn) return { valuetext: env.t('minigame.MG-07.aria.wait', { s: Math.ceil((sim.startMs - sim.timeMs) / 1000) }) };
      if (sim.answer || sim.timedOut) return { valuetext: env.t(sim.answer === 'GO' ? 'minigame.MG-07.status.called_go' : sim.answer === 'NOGO' ? 'minigame.MG-07.status.called_nogo' : 'minigame.MG-07.status.timeout') };
      const parts = sim.readings.map((r) => {
        const ch = CHANNELS[r.channel]!;
        return `${env.t(`minigame.MG-07.ch.${ch.id}`)} ${fmt(r.value, ch.decimals, ch.decimals)} ${ch.unit}, ${limitText(r, ch.unit, ch.decimals, env.t)}`;
      });
      const lit = config.oneButton ? env.t(sim.highlighted(sim.timeMs) === 'GO' ? 'minigame.MG-07.call.go' : 'minigame.MG-07.call.nogo') : '';
      return { valuetext: env.t('minigame.MG-07.aria.turn', { readings: parts.join('; '), lit }) };
    },
    dispose() {
      unsubscribe?.();
    },
  };
}

function create(root: HTMLElement, env: MinigameEnv) {
  return mountGame(root, env, {
    role: 'application',
    labelKey: env.mode === 'ONE_BUTTON' ? 'minigame.MG-07.aria.label_one' : 'minigame.MG-07.aria.label',
    make: (canvas, params, seed, preview) => makeGame(canvas, env, params, seed, preview),
  });
}

/** Demo: the console is called, the readings appear, a finger answers correctly after ~2 s. */
function createDemo(root: HTMLElement, env: MinigameEnv) {
  return mountDemo(root, (canvas) => {
    const config = resolveConfig({}, 'STANDARD', env.assistLevel);
    const params = { slot: 0, slots: 3 };
    let sim = newSim(config, params, 12, 3 * config.turnMs);
    const view = new Mg07View(canvas, sim, env.t, env.reducedMotion, true);
    let pressed = false;
    const noCalls = new Map<number, boolean>();
    const reset = () => {
      sim = newSim(config, params, 12, 3 * config.turnMs);
      pressed = false;
      view.setSim(sim);
    };
    const pressAt = 2200;
    return {
      loopMs: 3000,
      holdMs: 700,
      reset,
      frame(loopMs, timeMs) {
        if (!pressed && loopMs >= pressAt) {
          sim.push({ t: pressAt, k: sim.right === 'GO' ? 'go' : 'nogo' });
          pressed = true;
        }
        sim.advanceTo(loopMs);
        view.draw({ timeMs, liveCalls: noCalls, finger: sim.right, fingerDown: loopMs > pressAt - 150 && loopMs < pressAt + 250 });
      },
      resize: () => view.resize(),
    };
  });
}

const module: MinigameModule = { id: 'MG-07', create, createDemo };

export default module;
