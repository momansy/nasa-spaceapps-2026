import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

export class ProtocolValidator {
  constructor(schemaDir) {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    this.validators = new Map();
    for (const name of fs.readdirSync(schemaDir).filter((x) => x.endsWith('.schema.json'))) {
      const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
      try {
        this.validators.set(name.replace(/\.schema\.json$/, ''), this.ajv.compile(schema));
      } catch (error) {
        throw new Error(`Cannot compile ${name}: ${error.message}`);
      }
    }
  }

  validate(raw) {
    let env;
    try {
      env = JSON.parse(raw);
    } catch (error) {
      return { env: null, envelopeValid: false, payloadValid: false, unknownType: false, errors: [`JSON: ${error.message}`] };
    }
    const errors = [];
    const envelope = this.validators.get('envelope');
    const envelopeValid = Boolean(envelope?.(env));
    if (!envelopeValid) errors.push(...(envelope?.errors ?? []).map((e) => `envelope${e.instancePath} ${e.message}`));
    const validatePayload = typeof env?.t === 'string' ? this.validators.get(env.t) : null;
    const unknownType = Boolean(env?.t && !validatePayload);
    const payloadValid = validatePayload ? Boolean(validatePayload(env.d)) : false;
    if (validatePayload && !payloadValid) errors.push(...(validatePayload.errors ?? []).map((e) => `${env.t}${e.instancePath} ${e.message}`));
    if (unknownType) errors.push(`unknown message type ${env.t}`);
    return { env, envelopeValid, payloadValid, unknownType, errors };
  }
}
