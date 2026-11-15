// T050 / D-102: the shared part-viewer renderer. The test environment has no DOM and no WebGL,
// so WebGLRenderer, PMREMGenerator and GLTFLoader are replaced with fakes; the rest of three
// (scenes, groups, geometry) is the real library.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => {
  type Listener = (e: { preventDefault(): void }) => void;
  class FakeDom {
    className = '';
    remove = vi.fn();
    setAttribute() {}
    listeners = new Map<string, Set<Listener>>();
    addEventListener(type: string, fn: Listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(fn);
    }
    removeEventListener(type: string, fn: Listener) {
      this.listeners.get(type)?.delete(fn);
    }
    fire(type: string) {
      for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault() {} });
    }
  }
  class FakeRenderer {
    static instances: FakeRenderer[] = [];
    static attempts = 0;
    static fail = false;
    domElement = new FakeDom();
    toneMapping = 0;
    toneMappingExposure = 1;
    rendered: { children: unknown[] }[] = [];
    sizes: [number, number][] = [];
    viewports: number[][] = [];
    forceContextLoss = vi.fn();
    dispose = vi.fn();
    constructor() {
      FakeRenderer.attempts++;
      if (FakeRenderer.fail) throw new Error('Error creating WebGL context.');
      FakeRenderer.instances.push(this);
    }
    setClearColor() {}
    setPixelRatio() {}
    setScissor() {}
    setScissorTest() {}
    setSize(w: number, h: number) {
      this.sizes.push([w, h]);
    }
    setViewport(...v: number[]) {
      this.viewports.push(v);
    }
    render(scene: { children: unknown[] }) {
      this.rendered.push({ children: [...scene.children] });
    }
  }
  const pmrem = { bakes: 0 };
  class FakePMREM {
    fromScene() {
      pmrem.bakes++;
      return { texture: { isTexture: true, dispose() {} }, dispose: vi.fn() };
    }
    dispose() {}
  }
  const gltf = { parses: 0 };
  return { FakeRenderer, FakePMREM, pmrem, gltf };
});

vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: fx.FakeRenderer,
  PMREMGenerator: fx.FakePMREM,
}));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three');
  class GLTFLoader {
    parse(glb: ArrayBuffer, _path: string, onLoad: (g: unknown) => void, onError: (e: unknown) => void) {
      fx.gltf.parses++;
      if (new Uint8Array(glb)[0] === 0) {
        onError(new Error('not a glb'));
        return;
      }
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial()));
      scene.position.set(5, 0, 0);
      onLoad({ scene });
    }
  }
  return { GLTFLoader };
});

const { createThreeScene, viewerServiceStats, resetViewerServiceForTests, MODEL_CACHE_SIZE } = await import('./threeScene');

interface FakeCanvas {
  width: number;
  height: number;
  style: { visibility: string };
  parentNode: { insertBefore: ReturnType<typeof vi.fn> };
  remove: ReturnType<typeof vi.fn>;
  ctx: { clearRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
  getContext(type: string): unknown;
}
const canvases: FakeCanvas[] = [];

const glb = () => new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]).buffer;
const view = { yaw: 0.3, pitch: 0.2, zoom: 1 };
const renderer = () => fx.FakeRenderer.instances[0]!;

beforeEach(() => {
  resetViewerServiceForTests();
  fx.FakeRenderer.instances.length = 0;
  fx.FakeRenderer.attempts = 0;
  fx.FakeRenderer.fail = false;
  fx.pmrem.bakes = 0;
  fx.gltf.parses = 0;
  canvases.length = 0;
  vi.stubGlobal('document', {
    createElement: () => {
      const ctx = { clearRect: vi.fn(), drawImage: vi.fn() };
      const c: FakeCanvas = {
        width: 300,
        height: 150,
        style: { visibility: '' },
        parentNode: { insertBefore: vi.fn() },
        remove: vi.fn(),
        ctx,
        getContext: (t) => (t === '2d' ? ctx : null),
      };
      canvases.push(c);
      return c;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shared part-viewer renderer (D-102)', () => {
  it('uses one WebGL context and one environment bake for any number of viewers', async () => {
    const scenes = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => createThreeScene(glb(), id)));
    expect(fx.FakeRenderer.instances).toHaveLength(1);
    expect(fx.pmrem.bakes).toBe(1);
    expect(viewerServiceStats().contextsCreated).toBe(1);
    expect(viewerServiceStats().liveScenes).toBe(6);
    // Every viewer has its own visible 2D canvas.
    expect(new Set(scenes.map((s) => s.canvas)).size).toBe(6);
    for (const s of scenes) s.destroy();
  });

  it('never forces a context loss or disposes the renderer when viewers unmount', async () => {
    for (let round = 0; round < 5; round++) {
      const scenes = await Promise.all(['a', 'b', 'c', 'd'].map((id) => createThreeScene(glb(), id)));
      for (const s of scenes) {
        s.resize(320, 200, 1.25);
        s.draw(view);
      }
      for (const s of scenes) s.destroy();
    }
    expect(fx.FakeRenderer.instances).toHaveLength(1);
    expect(renderer().forceContextLoss).not.toHaveBeenCalled();
    expect(renderer().dispose).not.toHaveBeenCalled();
    expect(viewerServiceStats().liveScenes).toBe(0);
    expect(canvases.every((c) => c.remove.mock.calls.length === 1)).toBe(true);
  });

  it('renders a still for a viewer that does not animate and copies it into its 2D canvas', async () => {
    const s = await createThreeScene(glb(), 'a');
    s.resize(320, 200, 1.25);
    s.draw(view);
    const r = renderer();
    expect(r.rendered).toHaveLength(1);
    // The viewer's pivot is in the shared scene only while it renders.
    expect(r.rendered[0]!.children.length).toBe(5); // hemisphere + key + fill + rim + this pivot
    expect(r.viewports.at(-1)).toEqual([0, 0, 400, 250]);
    expect(r.sizes).toEqual([[400, 250]]);
    const c = canvases.at(-1)!;
    expect([c.width, c.height]).toEqual([400, 250]);
    expect(c.ctx.drawImage).toHaveBeenCalledWith(r.domElement, 0, 0, 400, 250, 0, 0, 400, 250);
    expect(c.parentNode.insertBefore).not.toHaveBeenCalled();
    expect(viewerServiceStats().hasOwner).toBe(false);
    s.destroy();
  });

  it('shows the shared WebGL canvas in the animating viewer, with no per-frame readback', async () => {
    const s = await createThreeScene(glb(), 'a');
    s.resize(320, 200, 1.25);
    for (let i = 0; i < 10; i++) s.draw({ ...view, yaw: i / 10 }, true);
    const r = renderer();
    const c = canvases.at(-1)!;
    expect(r.rendered).toHaveLength(10);
    expect(c.ctx.drawImage).not.toHaveBeenCalled();
    expect(c.parentNode.insertBefore).toHaveBeenCalledTimes(1);
    expect(c.parentNode.insertBefore.mock.calls[0]![0]).toBe(r.domElement);
    expect(c.style.visibility).toBe('hidden');
    expect(r.sizes).toEqual([[400, 250]]); // sized once, not per frame
    s.destroy();
    expect(r.domElement.remove).toHaveBeenCalled();
    expect(viewerServiceStats().hasOwner).toBe(false);
  });

  it('hands the WebGL canvas over and leaves the previous viewer its last frame as a still', async () => {
    const card = await createThreeScene(glb(), 'a');
    const full = await createThreeScene(glb(), 'b');
    const [cardCanvas, fullCanvas] = canvases.slice(-2) as [FakeCanvas, FakeCanvas];
    card.resize(360, 200, 1.25);
    full.resize(390, 700, 1.5);
    card.draw(view, true);
    full.draw(view, true);
    const r = renderer();
    // The card was rendered once more at its own size and copied out before the move.
    expect(cardCanvas.ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(cardCanvas.style.visibility).toBe('');
    expect(fullCanvas.parentNode.insertBefore.mock.calls[0]![0]).toBe(r.domElement);
    expect(fullCanvas.style.visibility).toBe('hidden');
    expect(r.sizes.at(-1)).toEqual([585, 1050]);
    // A still for the card while the full viewer owns the canvas gives the owner its frame back.
    const before = r.rendered.length;
    card.draw(view);
    expect(r.rendered.length).toBe(before + 2);
    expect(r.sizes.at(-1)).toEqual([585, 1050]);
    card.destroy();
    full.destroy();
  });

  it('keeps the last frame and skips rendering while the context is lost, then rebakes on restore', async () => {
    const s = await createThreeScene(glb(), 'a');
    s.resize(100, 100, 1);
    s.draw(view);
    const r = renderer();
    r.domElement.fire('webglcontextlost');
    s.draw(view);
    expect(r.rendered).toHaveLength(1);
    r.domElement.fire('webglcontextrestored');
    expect(fx.pmrem.bakes).toBe(2);
    s.draw(view);
    expect(r.rendered).toHaveLength(2);
    s.destroy();
  });
});

describe('parsed-model cache', () => {
  it('parses a part once and reuses it for later viewers of the same part', async () => {
    const a = await createThreeScene(glb(), 'eng_a');
    a.destroy();
    const b = await createThreeScene(glb(), 'eng_a');
    const c = await createThreeScene(glb(), 'eng_a');
    expect(fx.gltf.parses).toBe(1);
    expect(viewerServiceStats().cacheHits).toBe(2);
    b.destroy();
    c.destroy();
  });

  it('evicts the least recently used part and re-parses it on a later visit', async () => {
    for (let i = 0; i <= MODEL_CACHE_SIZE; i++) (await createThreeScene(glb(), `p${i}`)).destroy();
    expect(fx.gltf.parses).toBe(MODEL_CACHE_SIZE + 1);
    expect(viewerServiceStats().cachedModels).toHaveLength(MODEL_CACHE_SIZE);
    expect(viewerServiceStats().cachedModels).not.toContain('p0');
    expect(viewerServiceStats().templatesDisposed).toBe(1);
    (await createThreeScene(glb(), 'p0')).destroy();
    expect(fx.gltf.parses).toBe(MODEL_CACHE_SIZE + 2);
  });

  it('keeps an evicted model alive until its last viewer is destroyed', async () => {
    const held = await createThreeScene(glb(), 'held');
    for (let i = 0; i < MODEL_CACHE_SIZE; i++) (await createThreeScene(glb(), `q${i}`)).destroy();
    expect(viewerServiceStats().cachedModels).not.toContain('held');
    expect(viewerServiceStats().templatesDisposed).toBe(0);
    held.destroy();
    expect(viewerServiceStats().templatesDisposed).toBe(1);
  });

  it('does not keep a model that failed to parse', async () => {
    const bad = new Uint8Array(12).buffer;
    await expect(createThreeScene(bad, 'broken')).rejects.toThrow();
    expect(viewerServiceStats().cachedModels).not.toContain('broken');
    expect(viewerServiceStats().liveScenes).toBe(0);
  });
});

describe('no-WebGL fallback', () => {
  it('rejects (so PartViewer keeps the wireframe) and does not retry a context per viewer', async () => {
    fx.FakeRenderer.fail = true;
    await expect(createThreeScene(glb(), 'a')).rejects.toThrow(/WebGL/);
    await expect(createThreeScene(glb(), 'b')).rejects.toThrow(/WebGL/);
    expect(fx.FakeRenderer.attempts).toBe(1);
    expect(fx.gltf.parses).toBe(0);
    expect(viewerServiceStats().hasRenderer).toBe(false);
  });
});
