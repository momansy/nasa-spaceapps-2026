// Single-minigame lab (T022). Mounts one minigame in a 390 × 844 frame, with the host's
// environment replaced by a plain stub, and exposes `window.__lab` for Playwright.
// Query: mg, mode, assist, seed, dur (ms), p (URL-encoded JSON over the data params),
// demo=1, rm=1, dir=rtl, scale=2 (text scale), coop=1 (fake `env.coop`).
import '../../../src/theme/tokens.css';
import '../../../src/theme/base.css';
import '../../../src/theme/components.css';
import minigames from '../../../../data/minigames.json';
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { setNumberLocale } from '../../../src/data/format';
import { setLanguage, t } from '../../../src/i18n';
import { loadMinigame, type CoopAction, type CoopState, type MinigameCoop, type MinigameEnv, type MinigameResult } from '../../../src/minigames/types';

export interface LabApi {
  ready: Promise<void>;
  result: MinigameResult | null;
  haptics: Array<number | number[]>;
  progress: number[];
  frames: number;
  /** Moves sent through the fake `env.coop` (`mg.action`). */
  actions: CoopAction[];
  /** The fake shared state (`mg.state.shared`), when `coop=1`. */
  shared: () => Record<string, unknown> | null;
  /** Calls `start()` again is not allowed; this destroys the minigame (to test teardown). */
  destroy: () => void;
  /** Number of results delivered (must stay at most 1). */
  resultCount: number;
}

const q = new URLSearchParams(location.search);
const mgId = q.get('mg') ?? 'MG-22';
const mode = (q.get('mode') ?? 'STANDARD') as MinigameMode;
const assist = (q.get('assist') ?? 'ENGINEER') as AssistLevel;
const seed = Number(q.get('seed') ?? 1) >>> 0;
const demo = q.get('demo') === '1';
const reduced = q.get('rm') === '1';
const coopOn = q.get('coop') === '1';
const scale = Number(q.get('scale') ?? 1);

type DataEntry = { id: string; duration_s: number; params?: Record<string, number>; name_key: string; how_to_play_key: string };
const entry = (minigames as unknown as { minigames: DataEntry[] }).minigames.find((m) => m.id === mgId);
const durationMs = Number(q.get('dur')) || (entry ? entry.duration_s * 1000 : 20000);
const extra = q.get('p') ? (JSON.parse(q.get('p')!) as MgMap) : {};
const params: MgMap = { ...(entry?.params ?? {}), ...extra, slot: 0, slots: 1, ...extra };

const lab: LabApi = {
  ready: Promise.resolve(),
  result: null,
  haptics: [],
  progress: [],
  frames: 0,
  actions: [],
  shared: () => null,
  destroy: () => undefined,
  resultCount: 0,
};
(window as unknown as { __lab: LabApi }).__lab = lab;

/** Fake shared state of the MG-28 contract (chain, votes, locked) so the shared path is testable. */
function makeCoop(): MinigameCoop {
  const shared: Record<string, unknown> = { chain: [] as number[], votes: [0, 0, 0, 0], locked: false };
  const cbs = new Set<(s: CoopState) => void>();
  let n = 0;
  const publish = () => {
    n++;
    const s: CoopState = { n, shared: JSON.parse(JSON.stringify(shared)) as MgMap, progress: [] };
    cbs.forEach((cb) => cb(s));
  };
  const chainLen = Number((params['chain_len'] as number | undefined) ?? 4);
  lab.shared = () => shared;
  return {
    send(a) {
      lab.actions.push(a);
      const x = a.x ?? [];
      const chain = shared['chain'] as number[];
      if (a.a === 'place') {
        while (chain.length < chainLen) chain.push(-1);
        for (let i = 0; i < chain.length; i++) if (chain[i] === x[0]) chain[i] = -1;
        if (x[1]! >= 0 && x[1]! < chainLen) chain[x[1]!] = x[0]!;
      } else if (a.a === 'clear') {
        if (x[0]! >= 0 && x[0]! < chain.length) chain[x[0]!] = -1;
      } else if (a.a === 'vote') {
        const votes = shared['votes'] as number[];
        votes[x[0]!] = (votes[x[0]!] ?? 0) + 1;
      }
      publish();
    },
    onState(cb) {
      cbs.add(cb);
      if (n > 0) cb({ n, shared: JSON.parse(JSON.stringify(shared)) as MgMap, progress: [] });
      return () => cbs.delete(cb);
    },
  };
}

async function boot() {
  document.documentElement.style.setProperty('--text-scale', String(scale));
  if (scale !== 1) document.documentElement.style.fontSize = `${16 * scale}px`;
  setNumberLocale('en');
  await setLanguage('en');
  const warn = console.warn;
  console.warn = (...a: unknown[]) => {
    warn(...a);
    if (String(a[0]).includes('[i18n] missing string')) console.error(String(a[0]));
  };

  const nameEl = document.getElementById('name')!;
  const howEl = document.getElementById('how')!;
  nameEl.textContent = entry ? t(entry.name_key) : mgId;
  howEl.textContent = entry ? t(entry.how_to_play_key) : '';
  const play = document.getElementById('play')!;
  const fill = document.getElementById('fill') as HTMLElement;

  const mod = await loadMinigame(mgId);
  if (!mod) throw new Error(`no minigame ${mgId}`);

  const env: MinigameEnv = {
    mode,
    assistLevel: assist,
    durationMs,
    reducedMotion: reduced,
    t,
    haptic: (p) => void lab.haptics.push(p),
    reportProgress: (p) => void lab.progress.push(p),
    ...(coopOn ? { coop: makeCoop() } : {}),
  };

  const countFrames = () => {
    lab.frames++;
    requestAnimationFrame(countFrames);
  };
  requestAnimationFrame(countFrames);

  if (demo) {
    const d = mod.createDemo(play, env);
    lab.destroy = () => d.destroy();
    document.documentElement.dataset.labReady = '1';
    return;
  }
  const inst = mod.create(play, env);
  inst.onResult((r) => {
    lab.resultCount++;
    lab.result = r;
    document.getElementById('out')!.textContent = `${r.success ? 'SUCCESS' : 'MISS'}${r.perfect ? ' · PERFECT' : ''} · score ${r.score.toFixed(2)}${r.value != null ? ` · value ${r.value.toFixed(2)}` : ''}`;
  });
  lab.destroy = () => inst.destroy();
  const t0 = performance.now();
  inst.start(params, seed);
  const tick = () => {
    const f = Math.min(1, (performance.now() - t0) / durationMs);
    fill.style.width = `${f * 100}%`;
    if (f < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.documentElement.dataset.labReady = '1';
}

lab.ready = boot();
lab.ready.catch((e) => {
  console.error(String(e));
});
