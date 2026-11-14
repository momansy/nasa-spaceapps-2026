import { describe, expect, it } from 'vitest';
import { MESSAGE_META } from '../../../protocol/ts/messages.js';
import { allMessageTypes, categorize } from './dispatch.js';

describe('every protocol message type is handled', () => {
  it('categorizes each of the 105 message types as pre-room, explicit, or generic-relay', () => {
    for (const t of allMessageTypes()) {
      const category = categorize(t);
      expect(['pre-room', 'explicit', 'generic-relay']).toContain(category);
    }
  });

  it('every type whose server-side meaning requires business logic (to: SERVER) is either pre-room or explicit, never left to the generic relay', () => {
    for (const t of allMessageTypes()) {
      if (MESSAGE_META[t].to === 'SERVER') {
        expect(categorize(t)).not.toBe('generic-relay');
      }
    }
  });

  it('every generic-relay type is a host-originated (or server-originated) broadcast, never requiring a server decision', () => {
    for (const t of allMessageTypes()) {
      if (categorize(t) === 'generic-relay') {
        expect(MESSAGE_META[t].to).not.toBe('SERVER');
      }
    }
  });
});
