// Finds out whether a GLB exists for a part and keeps the answer. Models live in
// `public/models/<part_id>.glb` and may be added after the client is built.

const cache = new Map<string, Promise<ArrayBuffer | null>>();
const MISSING_KEY = 'mf.models.missing';

function readMissing(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(MISSING_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function rememberMissing(partId: string) {
  try {
    const set = readMissing();
    set.add(partId);
    sessionStorage.setItem(MISSING_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* storage unavailable: the probe is simply repeated next visit */
  }
}

export function modelUrl(partId: string): string {
  return `${import.meta.env.BASE_URL}models/${encodeURIComponent(partId)}.glb`;
}

/** True when the bytes start with the binary glTF magic "glTF". */
export function isGlb(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false;
  const v = new Uint8Array(bytes, 0, 4);
  return v[0] === 0x67 && v[1] === 0x6c && v[2] === 0x54 && v[3] === 0x46;
}

/**
 * The model file of a part, or null when there is none. A dev or single-page server answers
 * a missing file with the app's HTML, so the content is checked, not the status alone. Each
 * part is asked for once per visit.
 */
export function loadModel(partId: string): Promise<ArrayBuffer | null> {
  let p = cache.get(partId);
  if (!p) {
    p = (async () => {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,47}$/.test(partId) || readMissing().has(partId)) return null;
      try {
        const res = await fetch(modelUrl(partId), { credentials: 'omit' });
        if (!res.ok) {
          rememberMissing(partId);
          return null;
        }
        const type = res.headers.get('content-type') ?? '';
        if (type.includes('text/html')) {
          rememberMissing(partId);
          return null;
        }
        const bytes = await res.arrayBuffer();
        if (!isGlb(bytes)) {
          rememberMissing(partId);
          return null;
        }
        return bytes;
      } catch {
        return null; // offline: try again on the next visit
      }
    })();
    cache.set(partId, p);
  }
  return p;
}

let webgl: boolean | null = null;

/** Whether this device can create a WebGL context at all. */
export function hasWebGL(): boolean {
  if (webgl == null) {
    try {
      const c = document.createElement('canvas');
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
      webgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
