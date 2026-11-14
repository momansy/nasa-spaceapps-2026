// Scripted input for the lab spec: when and how a good player acts in each minigame. The
// scripts compute their timing from the same pure models the minigames use, with the same seed
// and parameters, so the screenshots show real play and not a canned picture.
import type { Page } from '@playwright/test';
import * as mg09 from '../../../src/minigames/MG-09/model';
import * as mg10a from '../../../src/minigames/MG-10a/model';
import * as mg07 from '../../../src/minigames/MG-07/model';
import * as mg08b from '../../../src/minigames/MG-08b/model';
import * as mg11 from '../../../src/minigames/MG-11/model';
import * as mg12 from '../../../src/minigames/MG-12/model';
import * as mg10 from '../../../src/minigames/MG-10/model';

export interface LabAction {
  /** Play time of the action, ms after start. */
  at: number;
  run: (page: Page) => Promise<void>;
}

export interface LabScript {
  id: string;
  seed: number;
  /** Extra host params (merged over the data params). */
  p?: Record<string, unknown>;
  durationMs: number;
  /** When to take the play and one-button screenshots, play ms. */
  playShotMs: number;
  oneButtonShotMs?: number;
  demoShotMs?: number;
  /** Play on to the end and check that exactly one result arrives (default true). */
  playToEnd?: boolean;
  /** The scripted standard run must succeed. */
  expectSuccess?: boolean;
  play?: { actions: LabAction[] };
  oneButton?: { actions: LabAction[] };
}

const press = (key: string) => async (page: Page) => {
  await page.keyboard.press(key);
};

/** MG-09: arrow keys follow the ideal angle (1° per press), checked every 100 ms. */
function mg09Play(seed: number): LabAction[] {
  const sim = mg09.newSim(mg09.resolveConfig({}, 'STANDARD', 'ENGINEER'), seed, 25_000);
  const out: LabAction[] = [];
  let g = 90;
  for (let t = 100; t < 25_000; t += 100) {
    const want = Math.round(sim.idealAtS(t / 1000 + 0.15));
    while (g !== want) {
      const d = want > g ? 1 : -1;
      g += d;
      out.push({ at: t, run: press(d > 0 ? 'ArrowUp' : 'ArrowDown') });
    }
  }
  return out;
}

/** MG-09 one button: Space at each pitch cue. */
function mg09One(seed: number): LabAction[] {
  const sim = mg09.newSim(mg09.resolveConfig({}, 'ONE_BUTTON', 'ENGINEER'), seed, 25_000);
  return sim.curve.cuesS.map((c) => ({ at: Math.round(c * 1000) + 40, run: press(' ') }));
}

/** MG-10a: S and I keys a human reaction after each green moment. */
function mg10aPlan(seed: number) {
  return mg10a.createPlan(seed, 10, 4, 0);
}

/** MG-07 as console 2 of 4 (FLIGHT polls console 1 first): the right call 2 s into the turn. */
function mg07Sim(seed: number, mode: 'STANDARD' | 'ONE_BUTTON') {
  const params = { slot: 1, slots: 4, turnMs: 7500 };
  const c = mg07.resolveConfig(params, mode, 'ENGINEER', 30_000);
  return mg07.newSim(c, params, seed, 30_000);
}

/** MG-08b: arrow keys from the scripted valve player; Space held by the scripted one-button player. */
function mg08bPlay(seed: number): LabAction[] {
  const c = mg08b.resolveConfig({}, 'STANDARD', 'ENGINEER');
  return mg08b.scriptedValve(() => mg08b.newSim(c, seed, 20_000), 250, 150).map((i) => ({ at: Math.round(i.t), run: press((i.v ?? 0) > 0 ? 'ArrowUp' : 'ArrowDown') }));
}
function mg08bOne(seed: number): LabAction[] {
  const c = mg08b.resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
  return mg08b.scriptedHold(() => mg08b.newSim(c, seed, 20_000)).map((i) => ({
    at: Math.round(i.t),
    run: async (page: Page) => {
      if ((i.v ?? 0) > 0) await page.keyboard.down(' ');
      else await page.keyboard.up(' ');
    },
  }));
}

/** MG-11: Space on each low point, 30 ms late. */
function mg11Play(seed: number, mode: 'STANDARD' | 'ONE_BUTTON'): LabAction[] {
  const sim = mg11.newSim(mg11.resolveConfig({}, mode, 'ENGINEER'), { slot: 0, slots: 4 }, seed, 15_000);
  return mg11.beatInputs(sim, 0.03).map((i) => ({ at: Math.round(i.t), run: press(' ') }));
}

/**
 * MG-12: arrow keys towards the scripted pad settings (0.25° and 2 % per press), checked every
 * 100 ms; one button: Space when the scripted locker presses.
 */
function mg12Play(seed: number): LabAction[] {
  const c = mg12.resolveConfig({}, 'STANDARD', 'ENGINEER');
  const make = () => mg12.newSim(c, { slot: 0, slots: 4 }, seed, 20_000);
  const plan = mg12.scriptedPad(make, 100, 0.1);
  const out: LabAction[] = [];
  let g = 0;
  for (const i of plan) {
    while (Math.abs((i.w ?? 0) - g) >= 0.25) {
      const d = (i.w ?? 0) > g ? 1 : -1;
      g += d * 0.25;
      out.push({ at: Math.round(i.t), run: press(d > 0 ? 'ArrowRight' : 'ArrowLeft') });
    }
  }
  return out;
}
function mg12One(seed: number): LabAction[] {
  const c = mg12.resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
  return mg12.scriptedLock(() => mg12.newSim(c, { slot: 0, slots: 4 }, seed, 20_000)).map((i) => ({ at: Math.round(i.t), run: press(' ') }));
}

/** MG-10: arrow keys held towards the half (scripted), one button: Space held by the scripted holder. */
function mg10Play(seed: number): LabAction[] {
  const c = mg10.resolveConfig({}, 'STANDARD', 'ENGINEER');
  const sim = mg10.newSim(c, { slot: 0, slots: 4 }, seed, 20_000);
  const out: LabAction[] = [];
  let dir = 0;
  for (let t = 0; t < 20_000; t += 100) {
    sim.advanceTo(t);
    const gap = sim.gapM + sim.boatV * 0.5;
    const want = gap > 4 ? -1 : gap < -4 ? 1 : 0;
    if (want !== dir) {
      const prev = dir;
      dir = want;
      sim.push({ t, k: 'k', v: want });
      out.push({
        at: t,
        run: async (page: Page) => {
          if (prev !== 0) await page.keyboard.up(prev < 0 ? 'ArrowLeft' : 'ArrowRight');
          if (want !== 0) await page.keyboard.down(want < 0 ? 'ArrowLeft' : 'ArrowRight');
        },
      });
    }
  }
  return out;
}
function mg10One(seed: number): LabAction[] {
  const c = mg10.resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
  return mg10.scriptedHoldBoat(() => mg10.newSim(c, { slot: 0, slots: 4 }, seed, 20_000)).map((i) => ({
    at: Math.round(i.t),
    run: async (page: Page) => {
      if ((i.v ?? 0) > 0) await page.keyboard.down(' ');
      else await page.keyboard.up(' ');
    },
  }));
}

export const SCRIPTS: LabScript[] = [
  {
    id: 'MG-09',
    seed: 4242,
    durationMs: 25_000,
    playShotMs: 11_200,
    oneButtonShotMs: 9_000,
    expectSuccess: true,
    play: { actions: mg09Play(4242) },
    oneButton: { actions: mg09One(4242) },
  },
  {
    id: 'MG-10a',
    seed: 777,
    durationMs: 10_000,
    playShotMs: Math.round((mg10aPlan(777).ignS + 0.3) * 1000),
    oneButtonShotMs: Math.round((mg10aPlan(777).sepS + 0.25) * 1000),
    demoShotMs: 1900,
    expectSuccess: true,
    play: {
      actions: [
        { at: Math.round((mg10aPlan(777).sepS + 0.12) * 1000), run: press('s') },
        { at: Math.round((mg10aPlan(777).ignS + 0.06) * 1000), run: press('i') },
      ],
    },
    oneButton: { actions: [{ at: Math.round((mg10aPlan(777).sepS + 0.08) * 1000), run: press(' ') }] },
  },
  {
    id: 'MG-07',
    seed: 31,
    p: { slot: 1, slots: 4, turnMs: 7500 },
    durationMs: 30_000,
    playShotMs: 7500 + 1800,
    oneButtonShotMs: 7500 + 600,
    demoShotMs: 1600,
    playToEnd: true,
    expectSuccess: true,
    play: { actions: mg07.answerInputs(mg07Sim(31, 'STANDARD'), 2600).map((i) => ({ at: Math.round(i.t), run: press(i.k === 'go' ? 'g' : 'n') })) },
    oneButton: { actions: [] },
  },
  {
    id: 'MG-08b',
    seed: 808,
    durationMs: 20_000,
    playShotMs: 8_600,
    oneButtonShotMs: 6_400,
    demoShotMs: 1500,
    expectSuccess: true,
    play: { actions: mg08bPlay(808) },
    oneButton: { actions: mg08bOne(808) },
  },
  {
    id: 'MG-11',
    seed: 1111,
    durationMs: 15_000,
    playShotMs: 7_150,
    oneButtonShotMs: 5_500,
    demoShotMs: 1800,
    expectSuccess: true,
    play: { actions: mg11Play(1111, 'STANDARD') },
    oneButton: { actions: mg11Play(1111, 'ONE_BUTTON') },
  },
  {
    id: 'MG-12',
    seed: 1212,
    durationMs: 20_000,
    playShotMs: 8_300,
    oneButtonShotMs: 6_000,
    demoShotMs: 1700,
    expectSuccess: true,
    play: { actions: mg12Play(1212) },
    oneButton: { actions: mg12One(1212) },
  },
  {
    id: 'MG-10',
    seed: 1010,
    durationMs: 20_000,
    playShotMs: 7_400,
    oneButtonShotMs: 5_200,
    demoShotMs: 1600,
    expectSuccess: true,
    play: { actions: mg10Play(1010) },
    oneButton: { actions: mg10One(1010) },
  },
];
