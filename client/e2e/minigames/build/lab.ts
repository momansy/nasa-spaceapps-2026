import '../../../src/theme/tokens.css';
import '../../../src/theme/base.css';
import '../../../src/theme/components.css';
import { loadMinigame, type MinigameResult, type MinigameInstance } from '../../../src/minigames/types';
import { t } from '../../../src/i18n';
import catalog from '../../../../data/minigames.json';
import type { AssistLevel, MinigameMode } from '@protocol';

declare global { interface Window { __lab: { ready: boolean; result: MinigameResult | null; results: number; haptics: (number | number[])[]; progress: number[]; frames: number; instance?: MinigameInstance } } }
const q = new URLSearchParams(location.search);
const id = q.get('mg') ?? 'MG-08';
const entry = catalog.minigames.find(m => m.id === id)!;
document.documentElement.dir = q.get('dir') === 'rtl' ? 'rtl' : 'ltr';
document.documentElement.style.setProperty('--text-scale', q.get('scale') ?? '1');
if (q.get('rm') === '1') document.documentElement.dataset.motion = 'reduced';
const style = document.createElement('style');
style.textContent = '#frame{width:min(100%,390px);height:844px;margin:auto;padding:16px;background:var(--space);display:flex;flex-direction:column;overflow:auto}h1{font-size:1.3rem;margin:0 0 8px;flex-shrink:0}#instruction{color:var(--muted);font-size:1rem;margin:0 0 16px;flex-shrink:0}#play{flex:1 0 360px;min-width:0;position:relative}';
document.head.append(style);
document.querySelector('#title')!.textContent = t(entry.name_key);
document.querySelector('#instruction')!.textContent = t(entry.how_to_play_key);
const lab = window.__lab = { ready: false, result: null, results: 0, haptics: [], progress: [], frames: 0 } as Window['__lab'];
const count = () => { lab.frames++; requestAnimationFrame(count); }; requestAnimationFrame(count);
const module = await loadMinigame(id);
if (!module) throw new Error(`Missing module ${id}`);
const env = { mode: (q.get('mode') ?? 'STANDARD') as MinigameMode, assistLevel: (q.get('assist') ?? 'ENGINEER') as AssistLevel, durationMs: Number(q.get('dur') ?? entry.duration_s * 1000), reducedMotion: q.get('rm') === '1', t, haptic: (p: number | number[]) => lab.haptics.push(p), reportProgress: (p: number) => lab.progress.push(p) };
const root = document.querySelector<HTMLElement>('#play')!;
if (q.get('demo') === '1') module.createDemo(root, env);
else { const instance = module.create(root, env); lab.instance = instance; instance.onResult(r => { lab.result = r; lab.results++; }); instance.start({ ...entry.params, ...JSON.parse(q.get('p') ?? '{}') }, Number(q.get('seed') ?? 42)); }
lab.ready = true;
