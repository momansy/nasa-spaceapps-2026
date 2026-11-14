import assert from 'node:assert/strict';
import test from 'node:test';
import { ProtocolValidator } from '../lib/schema-validator.mjs';
import { schemaDir } from '../lib/paths.mjs';

test('validates both envelope and message payload', () => {
  const validator = new ProtocolValidator(schemaDir);
  const valid = validator.validate(JSON.stringify({ t: 'hello', seq: 1, d: { protocolVersion: 1, client: 'PHONE', appVersion: 'test' } }));
  assert.equal(valid.envelopeValid, true);
  assert.equal(valid.payloadValid, true);
  assert.deepEqual(valid.errors, []);
});

test('reports unknown and malformed frames without throwing', () => {
  const validator = new ProtocolValidator(schemaDir);
  assert.equal(validator.validate('{').envelopeValid, false);
  const unknown = validator.validate(JSON.stringify({ t: 'future.message', seq: 1, d: {} }));
  assert.equal(unknown.envelopeValid, true);
  assert.equal(unknown.unknownType, true);
  assert.equal(unknown.payloadValid, false);
});
