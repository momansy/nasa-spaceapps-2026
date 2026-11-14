import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

export class FrameRecorder {
  constructor(file, validator) {
    this.file = file;
    this.validator = validator;
    this.start = performance.now();
    this.stream = fs.createWriteStream(file, { flags: 'a' });
    this.counts = { total: 0, valid: 0, invalid: 0, unknownTypes: 0 };
    this.rows = [];
  }

  record({ connId, role, direction, raw }) {
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    const check = this.validator.validate(text);
    const valid = check.envelopeValid && check.payloadValid;
    this.counts.total += 1;
    this.counts[valid ? 'valid' : 'invalid'] += 1;
    if (check.unknownType) this.counts.unknownTypes += 1;
    const row = {
      tsMonoMs: Number((performance.now() - this.start).toFixed(3)),
      at: new Date().toISOString(),
      connId,
      role,
      direction,
      bytes: Buffer.byteLength(text),
      t: check.env?.t ?? null,
      seq: check.env?.seq ?? null,
      d: check.env?.d ?? null,
      envelopeValid: check.envelopeValid,
      payloadValid: check.payloadValid,
      unknownType: check.unknownType,
      errors: check.errors,
    };
    this.stream.write(`${JSON.stringify(row)}\n`);
    this.rows.push(row);
    return row;
  }

  async close() {
    await new Promise((resolve) => this.stream.end(resolve));
    return { ...this.counts, file: this.file };
  }
}
