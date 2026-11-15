import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeServer, parseArgs, phaseSignature, phoneTarget, stallLimitSec } from '../real-host.mjs';

test('parseArgs requires room, server and 1/3/6 phones', () => {
  assert.equal(parseArgs(['--real-host', '--room', 'abcd', '--server', 'ws://localhost:1/ws', '--phones', '3']).errors.length, 0);
  assert.equal(parseArgs(['--real-host', '--room', 'abcd', '--server', 'ws://localhost:1/ws', '--phones', '3']).room, 'ABCD');
  assert.equal(parseArgs(['--real-host', '--server', 'x', '--phones', '2']).errors.length, 2);
  assert.equal(parseArgs(['--real-host', '--room', 'ABCD']).errors.length, 1);
});

test('normalizeServer accepts ws, http and bare host:port', () => {
  assert.deepEqual(normalizeServer('ws://localhost:10000/ws'), { wsUrl: 'ws://localhost:10000/ws', origin: 'http://localhost:10000', host: 'localhost' });
  assert.equal(normalizeServer('http://localhost:10000').wsUrl, 'ws://localhost:10000/ws');
  assert.equal(normalizeServer('localhost:8080').wsUrl, 'ws://localhost:8080/ws');
  assert.equal(normalizeServer('wss://x.onrender.com/ws').origin, 'https://x.onrender.com');
});

test('phoneTarget uses the hosted layout and adds ?server= only for a different room server', () => {
  const hosted = phoneTarget({ server: 'ws://localhost:10000/ws', phoneBase: null });
  assert.equal(hosted.webUrl, 'http://localhost:10000/play/client');
  assert.equal(hosted.extraQuery, '');
  const other = phoneTarget({ server: 'ws://192.168.1.5:8080/ws', phoneBase: 'http://localhost:5173/' });
  assert.equal(other.webUrl, 'http://localhost:5173');
  assert.equal(other.extraQuery, `&server=${encodeURIComponent('ws://192.168.1.5:8080/ws')}`);
});

test('phaseSignature and stall limits', () => {
  assert.equal(phaseSignature({ phase: 'BUILD', sub: 'REVIEW', review: 'PDR', flightPhase: null, segment: null }), 'BUILD:REVIEW:PDR');
  assert.equal(phaseSignature({ phase: 'FLIGHT', sub: 'FLYING', review: null, flightPhase: 'F2', segment: 'ASCENT' }), 'FLIGHT:FLYING:F2:ASCENT');
  assert.equal(phaseSignature({ phase: 'LOBBY', sub: 'NONE' }), 'LOBBY');
  const o = { stallSec: 180, lobbyWaitMin: 30 };
  assert.equal(stallLimitSec('LOBBY', o), 1800);
  assert.equal(stallLimitSec(null, o), 1800);
  assert.equal(stallLimitSec('FLIGHT', o), 180);
});
