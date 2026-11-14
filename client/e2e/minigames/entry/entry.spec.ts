// T022 lab tests: every delivered minigame is mounted in the lab, played with the mouse, and
// photographed. Vite dev serves the lab on port 5184 (see helpers.ts).
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { goodPlayer, makeSim, runScripted, STEP_HZ } from '../../../src/minigames/MG-24/model';
import { goodPlayer as goodPlayer26, makeSim as mk26 } from '../../../src/minigames/MG-26/model';
import { goodPlayer as goodPlayer27, makeSim as mk27 } from '../../../src/minigames/MG-27/model';
import { chainOf, HERRINGS } from '../../../src/minigames/MG-28/clues';
import { goodPlayer as goodPlayer28, makeSim as mk28 } from '../../../src/minigames/MG-28/model';
import { EVIDENCE, medianFps, openLab, shot, startVite, throttle, watchConsole, type LabOpts } from './helpers';

let server: ViteDevServer;
test.beforeAll(async () => {
  server = await startVite();
});
test.afterAll(async () => {
  await server.close();
});

const FPS_FILE = join(EVIDENCE, 'fps.md');
function logFps(id: string, fps: number) {
  // One row per minigame; a re-run of one minigame replaces its row.
  const rows = new Map<string, string>();
  if (existsSync(FPS_FILE))
    for (const line of readFileSync(FPS_FILE, 'utf8').split('\n')) {
      const m = /^\| (MG-\d+) \| (.+) \|$/.exec(line);
      if (m) rows.set(m[1]!, m[2]!);
    }
  rows.set(id, String(fps));
  const body = [...rows.entries()].sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  writeFileSync(FPS_FILE, `# Median fps at Chromium CPU throttle x4 (real clock, 5 s, Chromium headless)\n\n| Minigame | Median fps |\n|---|---|\n${body}\n`);
}

test.describe('lab smoke (MG-08, the reference)', () => {
  test('MG-08 mounts, plays and reports one result', async ({ page }) => {
    const con = watchConsole(page);
    await openLab(page, { mg: 'MG-08', dur: 4000 });
    await page.clock.runFor(1500);
    await shot(page, 'lab-smoke', false);
    await page.clock.runFor(3500);
    const result = await page.evaluate(() => ({ r: window.__lab.result, n: window.__lab.resultCount }));
    expect(result.n).toBe(1);
    expect(result.r).not.toBeNull();
    con.assertClean();
  });
});

// ───────────────────────── per-minigame lab runs ─────────────────────────

interface Entry {
  id: string;
  /** Play script: advances the fake clock by `ms` of play while using the mouse. Always uses `run`. */
  play: (page: Page, run: (ms: number) => Promise<void>, mode: string) => Promise<void>;
  /** Extra lab options. */
  opts?: Partial<LabOpts>;
  /** Seconds of play (data default) used to run to the end. */
  durS: number;
  /** Time into the play at which the "play" screenshot is taken, ms. */
  shotAtMs: number;
  /** The lab play script is exact: the result must be a success. */
  expectSuccess?: (mode: string) => boolean;
}

async function box(page: Page) {
  const b = await page.locator('#play canvas').boundingBox();
  if (!b) throw new Error('no canvas');
  return b;
}

/** A fixed investigation for MG-28 (pogo oscillation among four causes) in the form the host sends it. */
const P28 = {
  cause_options: [6, 2, 0, 9],
  cause_correct: 1,
  clues: [chainOf(0)[1]!, ...chainOf(2), chainOf(6)[1]!, HERRINGS[0]!],
  chain_len: chainOf(2).length,
};

/** Keyboard play of MG-28 for the fixed investigation: place the true-chain cards, vote for option 2 (key 2), lock. */
async function play28Keys(page: Page, run: (ms: number) => Promise<void>) {
  const sim = mk28(P28, 7, 'STANDARD', 'ENGINEER', 45);
  await page.locator('#play canvas').focus();
  let cursor = 0;
  for (let j = 0; j < sim.inv.clues.length; j++) {
    const t = sim.trueSlot(j);
    if (t >= 0) {
      const presses = (t - cursor + sim.inv.chainLen) % sim.inv.chainLen;
      for (let i = 0; i < presses; i++) {
        await page.keyboard.press('ArrowDown');
        await run(30);
      }
      cursor = t;
      await page.keyboard.press('Enter');
      await run(60);
    }
    await page.keyboard.press('ArrowRight');
    await run(30);
  }
  await page.keyboard.press('2');
  await run(100);
}

const ENTRIES: Entry[] = [
  {
    id: 'MG-22',
    durS: 25,
    shotAtMs: 5000,
    async play(page, run, mode) {
      const b = await box(page);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height * 0.5;
      if (mode === 'ONE_BUTTON') {
        for (let i = 0; i < 12; i++) {
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          await run(500);
          await page.mouse.up();
          await run(500);
        }
        return;
      }
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 14; i++) {
        await page.mouse.move(cx, cy + (i % 2 ? 22 : -22), { steps: 2 });
        await run(500);
      }
      await page.mouse.up();
    },
  },
  {
    id: 'MG-23',
    durS: 20,
    shotAtMs: 4000,
    async play(page, run, mode) {
      // Press near the nominal gate centre of stage 0 (about 3.2 s of play), once.
      await run(3000);
      const b = await box(page);
      // The DEPLOY button is drawn at the bottom of the canvas; one-button mode takes a press anywhere.
      await page.mouse.click(b.x + b.width / 2, mode === 'ONE_BUTTON' ? b.y + b.height * 0.4 : b.y + b.height - 44);
      await run(1000);
    },
  },
  {
    id: 'MG-25',
    durS: 15,
    shotAtMs: 4000,
    async play(page, run, mode) {
      const b = await box(page);
      if (mode === 'ONE_BUTTON') {
        await run(2500);
        await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.45);
        await run(2000);
        return;
      }
      // Turn the dial clockwise with a circular drag around its centre, then press LOCK.
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height * 0.62;
      await page.mouse.move(cx + 80, cy);
      await page.mouse.down();
      for (let i = 1; i <= 24; i++) {
        const a = (i * 12 * Math.PI) / 180;
        await page.mouse.move(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80, { steps: 2 });
        await run(150);
      }
      await page.mouse.up();
      await page.mouse.click(b.x + 120, b.y + b.height - 44);
      await run(500);
    },
  },
  {
    id: 'MG-24',
    durS: 20,
    shotAtMs: 2000,
    expectSuccess: () => true,
    async play(page, run, mode) {
      // The model (pure) tells when the ghost line is reached for seed 7: the tap goes there.
      const sim = runScripted(makeSim({}, 7, mode as 'STANDARD', 'ENGINEER', 20), (s) => goodPlayer(s));
      const tapMs = (sim.igniteStep / STEP_HZ) * 1000;
      const b = await box(page);
      // The lab starts the minigame about 80 ms of fake time after the clock begins (measured: taps 60 to 100 ms earlier land softly).
      const until = Math.max(0, tapMs - 80);
      await run(Math.min(2000, until)); // the "play" shot is taken here, with the ghost line visible
      await run(until - Math.min(2000, until));
      await page.mouse.click(b.x + b.width / 2, mode === 'ONE_BUTTON' ? b.y + b.height * 0.4 : b.y + b.height - 44);
      await run(1500);
    },
  },
  {
    id: 'MG-26',
    durS: 45,
    shotAtMs: 2500,
    expectSuccess: () => true,
    async play(page, run, mode) {
      const sim = mk26({}, 7, mode as 'STANDARD', 'ENGINEER', 45);
      const b = await box(page);
      if (mode === 'ONE_BUTTON') {
        // The model's scripted player tells at which steps to press; the lab starts about 80 ms late (see MG-24).
        const buf = { op: 0 as 0 | 1 | 2 | 3 | 4 | 5, card: 0, pos: 0, frac: 0 };
        const presses: number[] = [];
        while (!sim.done && sim.phase === 'program') {
          if (goodPlayer26(sim, buf).op === 5) presses.push((sim.step / STEP_HZ) * 1000 + 300); // the middle of the 0.7 s highlight
          sim.advance(buf);
        }
        let now = 0;
        for (const t of presses) {
          await run(Math.max(0, t - 80 - now));
          now = Math.max(now, t - 80);
          await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.5);
        }
        await run(1000);
        return;
      }
      // Keyboard play: pick a card, move the cursor, trim the trigger with the bracket keys, place it.
      await page.locator('#play canvas').focus();
      for (let c = 0; c < 7; c++) {
        if (c > 0) {
          await page.keyboard.press('ArrowRight');
          await page.keyboard.press('ArrowDown');
        }
        const n = Math.round((sim.targetFrac(c) - 0.5) / 0.01);
        for (let i = 0; i < Math.abs(n); i++) {
          await page.keyboard.press(n > 0 ? ']' : '[');
          await run(30);
        }
        await page.keyboard.press('Enter');
        await run(60);
      }
      await run(600);
      // SEND with a real tap near the bottom of the canvas.
      await page.mouse.click(b.x + b.width / 2, b.y + b.height - 38);
      await run(800);
    },
  },
  {
    id: 'MG-27',
    durS: 20,
    shotAtMs: 3000,
    opts: { p: { unit: 1 } },
    expectSuccess: (mode) => mode === 'ONE_BUTTON',
    async play(page, run, mode) {
      const b = await box(page);
      if (mode === 'ONE_BUTTON') {
        // Press when the model's scripted player sets off (the window is several seconds wide).
        const sim = mk27({ unit: 1 }, 7, 'ONE_BUTTON', 'ENGINEER', 20);
        const o = { vx: 0, vy: 0, go: false };
        while (!sim.done && !goodPlayer27(sim, o).go) sim.advance(o);
        await run(Math.max(0, (sim.step / STEP_HZ) * 1000 - 80));
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        await run(1000);
        return;
      }
      // Steer with a drag: the capsule is hidden, so this only exercises the stick.
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height * 0.55;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 50, cy - 30, { steps: 4 });
      await run(3500);
      await page.mouse.move(cx - 40, cy + 40, { steps: 4 });
      await run(3000);
      await page.mouse.up();
    },
  },
  {
    id: 'MG-28',
    durS: 45,
    shotAtMs: 1000,
    opts: { p: P28 },
    expectSuccess: () => true,
    async play(page, run, mode) {
      const b = await box(page);
      if (mode === 'ONE_BUTTON') {
        // The model's scripted player tells which highlight to press on (the middle of the 0.6 s window; the lab starts ~80 ms late).
        const sim = mk28(P28, 7, 'ONE_BUTTON', 'ENGINEER', 45);
        const o = { op: 0 as 0 | 1 | 2 | 3 | 4 | 5, a: 0, b: 0 };
        const presses: number[] = [];
        while (!sim.done && !sim.locked) {
          if (goodPlayer28(sim, o).op === 5) presses.push((sim.step / STEP_HZ) * 1000 + 300);
          sim.advance(o);
        }
        let now = 0;
        for (const t of presses) {
          await run(Math.max(0, t - 80 - now));
          now = Math.max(now, t - 80);
          await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.5);
        }
        await run(2000);
        return;
      }
      await play28Keys(page, run);
      await page.keyboard.press('l');
      await run(600);
      // a real tap on the LOCK button changes nothing once locked; it only proves hit-testing does not throw
      await page.mouse.click(b.x + b.width / 2, b.y + b.height - 30);
    },
  },
];

for (const e of ENTRIES) {
  test.describe(e.id, () => {
    test(`${e.id}: demo loop`, async ({ page }) => {
      const con = watchConsole(page);
      await openLab(page, { mg: e.id, demo: true, ...e.opts });
      await page.clock.runFor(1900);
      await shot(page, `${e.id}-demo`);
      await page.clock.runFor(4000);
      con.assertClean();
    });

    for (const [mode, name] of [['STANDARD', 'play'], ['ONE_BUTTON', 'onebutton']] as const) {
      test(`${e.id}: ${mode} play, screenshot and one result`, async ({ page }) => {
        const con = watchConsole(page);
        await openLab(page, { mg: e.id, mode, seed: 7, ...e.opts });
        const run = async (ms: number) => {
          for (let t = 0; t < ms; t += 50) await page.clock.runFor(Math.min(50, ms - t));
        };
        let elapsed = 0;
        const clocked = async (ms: number) => {
          elapsed += ms;
          await run(ms);
          if (elapsed >= e.shotAtMs && elapsed - ms < e.shotAtMs) await shot(page, `${e.id}-${name}`);
        };
        await e.play(page, clocked, mode);
        await page.clock.runFor(e.durS * 1000 + 3000);
        const out = await page.evaluate(() => ({ r: window.__lab.result, n: window.__lab.resultCount }));
        expect(out.n).toBe(1);
        expect(out.r).not.toBeNull();
        expect(out.r!.score).toBeGreaterThanOrEqual(0);
        expect(out.r!.score).toBeLessThanOrEqual(1);
        if (out.r!.perfect) expect(out.r!.success).toBe(true);
        if (e.expectSuccess?.(mode)) expect(out.r!.success, JSON.stringify(out.r)).toBe(true);
        con.assertClean();
      });
    }

    test(`${e.id}: result is not delivered after destroy()`, async ({ page }) => {
      await openLab(page, { mg: e.id, seed: 3, ...e.opts });
      await page.clock.runFor(1000);
      await page.evaluate(() => window.__lab.destroy());
      await page.clock.runFor(e.durS * 1000 + 3000);
      const n = await page.evaluate(() => window.__lab.resultCount);
      expect(n).toBe(0);
    });

    test(`${e.id}: right-to-left, 200 % text, reduced motion`, async ({ page }) => {
      const con = watchConsole(page);
      await openLab(page, { mg: e.id, rtl: true, scale: 2, rm: true, seed: 5, ...e.opts });
      await page.clock.runFor(e.shotAtMs / 2);
      await shot(page, `${e.id}-rtl-x2-rm`);
      con.assertClean();
    });

    test(`${e.id}: at least 30 fps at CPU throttle x4`, async ({ page }) => {
      test.setTimeout(60_000);
      await openLab(page, { mg: e.id, seed: 11, mode: 'STANDARD', ...e.opts }, { clock: false });
      await throttle(page, 4);
      const b = await box(page);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      const fps = await medianFps(page, 5000);
      await page.mouse.up();
      logFps(e.id, fps);
      expect(fps).toBeGreaterThanOrEqual(30);
    });
  });
}


// ───────────────────────── MG-28 with the fake env.coop (the shared contract with T024) ─────────────────────────

test.describe('MG-28 shared state through the fake env.coop', () => {
  test('place, clear and vote reach the host in the agreed shape and the shared chain is drawn', async ({ page }) => {
    const con = watchConsole(page);
    await openLab(page, { mg: 'MG-28', seed: 7, coop: true, p: P28 });
    const run = async (ms: number) => {
      for (let t = 0; t < ms; t += 50) await page.clock.runFor(Math.min(50, ms - t));
    };
    await run(300);
    await play28Keys(page, run);
    await page.keyboard.press('Backspace'); // take the card at the cursor off again
    await run(200);
    await shot(page, 'MG-28-coop');
    const out = await page.evaluate(() => ({ actions: window.__lab.actions, shared: window.__lab.shared() as { chain: number[]; votes: number[] } | null }));
    const places = out.actions.filter((a) => a.a === 'place');
    expect(places.length).toBe(5); // the five cards of the true chain
    for (const a of places) {
      expect(a.x).toHaveLength(2);
      expect(a.x![1]).toBeGreaterThanOrEqual(0);
      expect(a.x![1]).toBeLessThan(5);
    }
    expect(out.actions.some((a) => a.a === 'clear' && a.x!.length === 1)).toBe(true);
    expect(out.actions.some((a) => a.a === 'vote' && a.x![0] === 1)).toBe(true);
    expect(out.shared!.votes[1]).toBe(1);
    expect(out.shared!.chain.filter((v) => v >= 0)).toHaveLength(4); // five placed, one cleared
    await run(45000);
    const r = await page.evaluate(() => ({ r: window.__lab.result, n: window.__lab.resultCount }));
    expect(r.n).toBe(1);
    expect(r.r!.success).toBe(true);
    con.assertClean();
  });
});
