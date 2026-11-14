// Pure helpers for the demo launcher (T029): LAN address choice, MIME types, safe paths.
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';

const VIRTUAL_NAME = /vethernet|virtualbox|vmware|vmnet|docker|wsl|hyper-v|loopback|utun|awdl|llw|bridge|veth|br-|tailscale|zerotier|vpn/i;

// Names of adapters people actually connect phones through (Wi-Fi, hotspot, wired LAN).
const PREFERRED_NAME = /wi-?fi|wlan|wireless|^en0$|^wlp|local area connection\*|^ethernet$|^eth0$/i;
// Default host-only subnet of VirtualBox: a real adapter, but phones can never reach it.
const VIRTUAL_SUBNET = /^192\.168\.56\./;

function rank(address) {
  if (/^192\.168\./.test(address)) return 0;
  if (/^10\./.test(address)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  if (/^169\.254\./.test(address)) return 9; // link-local: no DHCP lease, phones cannot use it
  return 5;
}

/** Candidate LAN IPv4 addresses, best first. `ifaces` is the shape of os.networkInterfaces(). */
export function lanCandidates(ifaces = networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      out.push({
        name,
        address: a.address,
        virtual: VIRTUAL_NAME.test(name) || VIRTUAL_SUBNET.test(a.address),
        preferred: PREFERRED_NAME.test(name),
        rank: rank(a.address),
      });
    }
  }
  return out.sort(
    (a, b) => Number(a.virtual) - Number(b.virtual) || Number(b.preferred) - Number(a.preferred) || a.rank - b.rank,
  );
}

/** The LAN IPv4 to advertise to phones, or null when only loopback exists. */
export function pickLanIp(ifaces) {
  const best = lanCandidates(ifaces)[0];
  return best ? best.address : null;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Content type for a file name. Unity's compressed build files are `<name>.<kind>.unityweb`: the
 * type comes from the inner extension, and the caller adds `Content-Encoding: gzip`.
 */
export function mimeFor(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.unityweb')) {
    const inner = lower.slice(0, -'.unityweb'.length);
    if (inner.endsWith('.wasm')) return 'application/wasm';
    if (inner.endsWith('.js')) return 'application/javascript';
    return 'application/octet-stream';
  }
  return TYPES[extname(lower)] || 'application/octet-stream';
}

/** Resolve a URL path inside `root`; null for anything that escapes it. */
export function safeResolve(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = normalize(join(root, decoded));
  return full === root || full.startsWith(root + sep) ? full : null;
}
