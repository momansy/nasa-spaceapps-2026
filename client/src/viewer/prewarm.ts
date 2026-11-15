// T050 follow-up: the first 3D part a page shows pays for the shared renderer once (WebGL
// context, PMREM environment, shader programs, first GLB parse and texture upload). Under a slow
// CPU that landed on the first part vote as one multi-second task. prewarmViewer() does that
// work earlier, when the browser is idle on a screen every player passes before the first vote
// (the role card), in separate tasks so no single one blocks long. It runs once per page, does
// nothing without WebGL, and never throws: the viewer then simply pays the cost itself.
import { allCategories } from '../data/catalog';
import { hasWebGL, loadModel } from './models';

let started = false;

/** How many parts' models are parsed ahead (game simplification: the first vote's first parts). */
const PREWARM_PARTS = 2;

function whenIdle(fn: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 200);
}

const nextIdle = () => new Promise<void>((resolve) => whenIdle(resolve));

/** Parts of the first category in catalog order (the first part vote of a mission). */
function defaultParts(): string[] {
  const first = allCategories()[0];
  return (first?.parts ?? []).slice(0, PREWARM_PARTS).map((p) => p.id);
}

/**
 * Creates the shared renderer, bakes its environment, and parses + draws `partIds` (default: the
 * first category's first parts) off screen once, so their programs and textures are ready.
 * Safe to call on every render: only the first call does anything.
 */
export function prewarmViewer(partIds?: string[]): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  whenIdle(() => {
    void (async () => {
      if (!hasWebGL()) return; // no-WebGL phones keep the wireframe and never load three.js
      const ids = partIds ?? defaultParts();
      const { warmUp } = await import('./threeScene');
      const models: { key: string; glb: ArrayBuffer }[] = [];
      for (const id of ids) {
        const glb = await loadModel(id);
        if (glb) models.push({ key: id, glb });
      }
      await warmUp(models, nextIdle);
    })().catch(() => {
      /* the first viewer will pay the cost instead */
    });
  });
}

/** Test only. */
export function resetPrewarmForTests() {
  started = false;
}
