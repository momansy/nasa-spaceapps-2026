// WebGL scenes for GLB part models. This module is only ever loaded with a dynamic import
// (see PartViewer.tsx), so three.js stays out of the main bundle and phones that only see
// the wireframe never download it.
//
// D-102 / T050: one renderer for the whole page. A vote round mounts several viewers and the
// next round unmounts them all; giving each its own WebGLRenderer meant a new WebGL context, a
// PMREM environment bake and fresh shader programs per mount, and renderer.forceContextLoss()
// per unmount (8.1 s of main-thread time in the T047 profile). Now:
//   - one module-level WebGLRenderer (one WebGL context), with one PMREM environment texture
//     baked once, one light rig and one camera;
//   - every viewer owns a 2D <canvas>, its own pivot group and a clone of the model;
//   - the viewer that animates (`draw(view, true)`: the active card, or the full viewer) owns
//     the shared WebGL canvas, which sits on top of its 2D canvas and is drawn into directly,
//     so a turntable frame costs no pixel readback; when another viewer takes the canvas over,
//     the previous owner's frame is copied once (drawImage) into its 2D canvas as a still;
//   - a still for a viewer that does not own the canvas is rendered and copied the same way;
//   - parsed GLBs are kept in a small LRU cache by part id (clones share geometry and
//     materials), so revisiting a part neither re-parses nor re-uploads it;
//   - destroy() removes the viewer's canvas and objects; the context is never force-lost.
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { View } from './wireframe';

export interface ThreeScene {
  /** The viewer's own visible 2D canvas; frames are copied into it from the shared renderer. */
  canvas: HTMLCanvasElement;
  resize(width: number, height: number, dpr: number): void;
  /** `live`: this viewer is animating or being dragged, so it takes over the shared WebGL canvas. */
  draw(view: View, live?: boolean): void;
  destroy(): void;
}

const FOV_DEG = 30;
/** Share of the shorter stage side the part's largest dimension covers at zoom 1. */
const FILL = 0.74;
/** Parsed models kept for revisits (game simplification: a vote shows at most 4 parts). */
export const MODEL_CACHE_SIZE = 8;
/** Largest shared drawing buffer side, in device pixels. */
const MAX_BUFFER = 4096;

function disposeObject(root: Object3D) {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose();
      }
      m.dispose();
    }
  });
}

// ───────────── the shared renderer ─────────────

interface Shared {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  envTarget: WebGLRenderTarget;
  lost: boolean;
  bufW: number;
  bufH: number;
  /** The viewer the WebGL canvas is currently shown in, if any. */
  owner: ViewerState | null;
  onLost: (e: Event) => void;
  onRestored: () => void;
}

let shared: Shared | null = null;
let sharedError: unknown = null;
const stats = { contextsCreated: 0, parses: 0, cacheHits: 0, liveScenes: 0, templatesDisposed: 0 };

function bakeEnvironment(renderer: WebGLRenderer): WebGLRenderTarget {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  pmrem.dispose();
  disposeObject(room);
  return target;
}

/** The page's one renderer, created on first use. Throws when WebGL is unavailable (and keeps throwing). */
function getShared(): Shared {
  if (shared) return shared;
  if (sharedError) throw sharedError;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    sharedError = err ?? new Error('WebGL unavailable');
    throw sharedError;
  }
  stats.contextsCreated++;
  // ACES tone mapping with sRGB output (three r152+ default), as VISUAL_TARGET 4 asks.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  // Device pixels are handled per viewer (resize's dpr), so the shared buffer works 1:1.
  renderer.setPixelRatio(1);
  renderer.domElement.className = 'viewer__gl';
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  const envTarget = bakeEnvironment(renderer);
  scene.environment = envTarget.texture;

  // Style-guide rig (game_value): warm ~4500 K key, cool ~8000 K fill at about 1:4, and a
  // restrained teal rim from behind so the silhouette separates from the navy stage.
  scene.add(new HemisphereLight(0xc9dcff, 0x14202c, 0.35));
  const key = new DirectionalLight(0xffd2a1, 1.6);
  key.position.set(3, 3.5, 3.5);
  scene.add(key);
  const fill = new DirectionalLight(0xc9dcff, 0.4);
  fill.position.set(-3.5, 0.5, 2.5);
  scene.add(fill);
  const rim = new DirectionalLight(0x8fe0e6, 0.8);
  rim.position.set(-2, 2.5, -4);
  scene.add(rim);

  const s: Shared = {
    renderer,
    scene,
    camera: new PerspectiveCamera(FOV_DEG, 1, 0.05, 50),
    envTarget,
    lost: false,
    bufW: 0,
    bufH: 0,
    owner: null,
    onLost: (e: Event) => {
      // Keep the context restorable; viewers keep showing their last frame meanwhile.
      e.preventDefault();
      s.lost = true;
    },
    onRestored: () => {
      // three re-initialises its own GL state; the environment map has to be baked again.
      s.lost = false;
      const old = s.envTarget;
      s.envTarget = bakeEnvironment(renderer);
      s.scene.environment = s.envTarget.texture;
      old.dispose();
    },
  };
  renderer.domElement.addEventListener('webglcontextlost', s.onLost);
  renderer.domElement.addEventListener('webglcontextrestored', s.onRestored);
  shared = s;
  return s;
}

/** What the shared renderer needs to draw one viewer. */
interface ViewerState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pivot: Group;
  aspect: number;
  lastView: View | null;
}

/** Sizes the shared drawing buffer to the viewer's canvas (only when it differs). */
function sizeBuffer(s: Shared, v: ViewerState) {
  const pw = Math.min(MAX_BUFFER, Math.max(1, v.canvas.width));
  const ph = Math.min(MAX_BUFFER, Math.max(1, v.canvas.height));
  if (pw === s.bufW && ph === s.bufH) return;
  s.bufW = pw;
  s.bufH = ph;
  s.renderer.setSize(pw, ph, false);
}

/** Renders one viewer into the whole shared drawing buffer. */
function renderView(s: Shared, v: ViewerState, view: View) {
  sizeBuffer(s, v);
  const { renderer, scene, camera } = s;
  // Same convention as the wireframe: yaw about the vertical axis, then pitch.
  v.pivot.rotation.set(view.pitch, view.yaw, 0, 'XYZ');
  camera.aspect = v.aspect;
  camera.updateProjectionMatrix();
  const halfV = (FOV_DEG / 2) * (Math.PI / 180);
  const half = v.aspect >= 1 ? halfV : Math.atan(Math.tan(halfV) * v.aspect);
  camera.position.set(0, 0, 1 / (FILL * Math.tan(half)) / view.zoom);
  camera.lookAt(0, 0, 0);
  renderer.setViewport(0, 0, s.bufW, s.bufH);
  scene.add(v.pivot);
  try {
    renderer.render(scene, camera);
  } finally {
    scene.remove(v.pivot);
  }
}

/** Renders a viewer and copies the frame into its own 2D canvas (one pixel readback). */
function copyOut(s: Shared, v: ViewerState, view: View) {
  renderView(s, v, view);
  // Copied in the same task, before the browser may discard the drawing buffer.
  v.ctx.clearRect(0, 0, v.canvas.width, v.canvas.height);
  v.ctx.drawImage(s.renderer.domElement, 0, 0, s.bufW, s.bufH, 0, 0, v.canvas.width, v.canvas.height);
}

/** Moves the WebGL canvas out of its owner, leaving the owner's last frame as a 2D still. */
function freeze(s: Shared, v: ViewerState) {
  if (v.lastView && !s.lost) copyOut(s, v, v.lastView);
  v.canvas.style.visibility = '';
  s.renderer.domElement.remove();
  s.owner = null;
}

/** Shows the WebGL canvas over this viewer's 2D canvas. False when the viewer is not in a page. */
function claim(s: Shared, v: ViewerState): boolean {
  if (s.owner === v) return true;
  const parent = v.canvas.parentNode;
  if (!parent) return false;
  if (s.owner) freeze(s, s.owner);
  parent.insertBefore(s.renderer.domElement, v.canvas.nextSibling);
  // The WebGL canvas is transparent around the model: hide the older still under it.
  v.canvas.style.visibility = 'hidden';
  s.owner = v;
  return true;
}

// ───────────── parsed models (LRU) ─────────────

interface Template {
  /** The parsed glTF scene, already centred on the origin. Clones share its geometry and materials. */
  root: Object3D;
  /** Half the largest dimension; the viewer scales by 1 / radius. */
  radius: number;
}

interface Entry {
  promise: Promise<Template>;
  template: Template | null;
  users: number;
  /** Out of the cache: its GPU resources go when the last user releases it. */
  evicted: boolean;
}

const cache = new Map<string, Entry>();

function disposeTemplate(entry: Entry) {
  if (!entry.template) return;
  disposeObject(entry.template.root);
  entry.template = null;
  stats.templatesDisposed++;
}

function parseGlb(glb: ArrayBuffer): Promise<Template> {
  stats.parses++;
  return new Promise<{ scene: Group }>((resolve, reject) => {
    new GLTFLoader().parse(glb, '', (g) => resolve(g as unknown as { scene: Group }), (err) => reject(err));
  }).then((gltf) => {
    // Centre the model on the origin and scale its largest dimension to 2 units, so the part
    // fills about 70 % of the stage (VISUAL_TARGET 4) instead of a small bounding-sphere fit.
    const box = new Box3().setFromObject(gltf.scene);
    const centre = box.getCenter(new Vector3());
    const dims = box.getSize(new Vector3());
    gltf.scene.position.sub(centre);
    return { root: gltf.scene, radius: Math.max(1e-6, Math.max(dims.x, dims.y, dims.z) / 2) };
  });
}

/** Takes a reference on the parsed model for `key` (parsing it when it is not cached). */
function acquire(glb: ArrayBuffer, key: string | undefined): Entry {
  if (key != null) {
    const hit = cache.get(key);
    if (hit) {
      stats.cacheHits++;
      cache.delete(key);
      cache.set(key, hit); // most recently used last
      hit.users++;
      return hit;
    }
  }
  const entry: Entry = { promise: null as unknown as Promise<Template>, template: null, users: 1, evicted: key == null };
  entry.promise = parseGlb(glb).then((tpl) => {
    entry.template = tpl;
    if (entry.evicted && entry.users === 0) disposeTemplate(entry);
    return tpl;
  });
  if (key != null) {
    cache.set(key, entry);
    // A file that does not parse is not kept, so a later visit can try again.
    entry.promise.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    while (cache.size > MODEL_CACHE_SIZE) {
      const [oldKey, old] = cache.entries().next().value as [string, Entry];
      cache.delete(oldKey);
      old.evicted = true;
      if (old.users === 0) disposeTemplate(old);
    }
  }
  return entry;
}

function release(entry: Entry) {
  entry.users = Math.max(0, entry.users - 1);
  if (entry.users === 0 && entry.evicted) disposeTemplate(entry);
}

// ───────────── one viewer ─────────────

/**
 * Parses (or reuses) a binary glTF and returns a scene that draws it centred and fitted to the
 * view into its own 2D canvas. `cacheKey` (the part id) lets revisits reuse the parsed model.
 * Rejects when the file cannot be parsed or WebGL is unavailable.
 */
export async function createThreeScene(glb: ArrayBuffer, cacheKey?: string): Promise<ThreeScene> {
  const s = getShared();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  const entry = acquire(glb, cacheKey);
  let template: Template;
  try {
    template = await entry.promise;
  } catch (err) {
    release(entry);
    throw err;
  }

  const pivot = new Group();
  const fit = new Group();
  fit.scale.setScalar(1 / template.radius);
  fit.add(template.root.clone(true));
  pivot.add(fit);
  stats.liveScenes++;

  const v: ViewerState = { canvas, ctx, pivot, aspect: 1, lastView: null };
  let destroyed = false;

  return {
    canvas,
    resize(width, height, dpr) {
      v.aspect = width / Math.max(1, height);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    },
    draw(view, live = false) {
      if (destroyed || s.lost) return; // the canvases keep the last frame
      v.lastView = { ...view };
      if ((live || s.owner === v) && claim(s, v)) {
        renderView(s, v, view); // straight to the visible WebGL canvas, no readback
        return;
      }
      // A still for a viewer that does not own the WebGL canvas: render, copy, and give the
      // owner its own frame back (its canvas would otherwise show this viewer's picture).
      copyOut(s, v, view);
      const owner = s.owner;
      if (owner?.lastView) renderView(s, owner, owner.lastView);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stats.liveScenes--;
      if (s.owner === v) {
        s.renderer.domElement.remove();
        s.owner = null;
      }
      // Only this viewer's objects go; the clone shares the cached geometry and materials,
      // which are disposed when the model leaves the cache. The shared context stays alive.
      pivot.clear();
      release(entry);
      canvas.remove();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/** Counters for tests and diagnostics. */
export function viewerServiceStats() {
  return { ...stats, cachedModels: [...cache.keys()], hasRenderer: shared != null, hasOwner: shared?.owner != null };
}

/** Test only: drops the shared renderer and the model cache (without forcing a context loss). */
export function resetViewerServiceForTests() {
  if (shared) {
    shared.renderer.domElement.removeEventListener('webglcontextlost', shared.onLost);
    shared.renderer.domElement.removeEventListener('webglcontextrestored', shared.onRestored);
    shared.envTarget.dispose();
    shared.renderer.dispose();
  }
  shared = null;
  sharedError = null;
  for (const e of cache.values()) disposeTemplate(e);
  cache.clear();
  Object.assign(stats, { contextsCreated: 0, parses: 0, cacheHits: 0, liveScenes: 0, templatesDisposed: 0 });
}
