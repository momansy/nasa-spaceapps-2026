import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { lanCandidates, mimeFor, pickLanIp, safeResolve } from './net-utils.mjs';

const v4 = (address, internal = false) => ({ address, family: 'IPv4', internal });

test('pickLanIp prefers a real 192.168 adapter over virtual and link-local ones', () => {
  const ifaces = {
    Loopback: [v4('127.0.0.1', true)],
    'vEthernet (WSL)': [v4('172.20.0.1')],
    Ethernet: [v4('169.254.3.4')],
    'Wi-Fi': [v4('192.168.1.23')],
  };
  assert.equal(pickLanIp(ifaces), '192.168.1.23');
});

test('pickLanIp skips the VirtualBox host-only subnet and prefers the Wi-Fi adapter', () => {
  const ifaces = {
    'Ethernet 3': [v4('192.168.56.1')],
    'VMware Network Adapter VMnet8': [v4('192.168.139.1')],
    'Wi-Fi': [v4('10.239.122.192')],
  };
  assert.equal(pickLanIp(ifaces), '10.239.122.192');
});

test('pickLanIp accepts the Windows Mobile Hotspot adapter (x.x.x.1 is legitimate there)', () => {
  const ifaces = { 'Local Area Connection* 10': [v4('192.168.137.1')], 'vEthernet (WSL)': [v4('172.27.32.1')] };
  assert.equal(pickLanIp(ifaces), '192.168.137.1');
});

test('pickLanIp returns null when only loopback exists', () => {
  assert.equal(pickLanIp({ lo: [v4('127.0.0.1', true)] }), null);
  assert.deepEqual(lanCandidates({ lo: [{ address: '::1', family: 'IPv6', internal: true }] }), []);
});

test('pickLanIp falls back to a virtual adapter when it is the only one', () => {
  assert.equal(pickLanIp({ 'vEthernet (Default)': [v4('172.18.0.1')] }), '172.18.0.1');
});

test('mimeFor handles Unity gzip files by their inner extension', () => {
  assert.equal(mimeFor('host.wasm.unityweb'), 'application/wasm');
  assert.equal(mimeFor('host.framework.js.unityweb'), 'application/javascript');
  assert.equal(mimeFor('host.data.unityweb'), 'application/octet-stream');
  assert.equal(mimeFor('index.html'), 'text/html; charset=utf-8');
  assert.equal(mimeFor('a.GLB'), 'model/gltf-binary');
});

test('safeResolve blocks path traversal', () => {
  const root = join(process.cwd(), 'site');
  assert.equal(safeResolve(root, '/play/index.html'), join(root, 'play', 'index.html'));
  assert.equal(safeResolve(root, '/../secret.txt'), null);
  assert.equal(safeResolve(root, '/%2e%2e/secret.txt'), null);
  assert.equal(safeResolve(root, '/a%00b'), null);
});
