import { describe, expect, it } from 'vitest';
import { serverOverride } from './wsConnection';

describe('serverOverride', () => {
  const page = 'missionforge.example';

  it('accepts local-network and same-host servers', () => {
    expect(serverOverride('?server=ws://192.168.1.20:8787', page)).toBe('ws://192.168.1.20:8787');
    expect(serverOverride('?server=ws://10.0.0.5/ws', page)).toBe('ws://10.0.0.5/ws');
    expect(serverOverride('?server=ws://172.20.1.1:8787', page)).toBe('ws://172.20.1.1:8787');
    expect(serverOverride('?server=ws://localhost:8787', page)).toBe('ws://localhost:8787');
    expect(serverOverride('?server=wss://missionforge.example/ws', page)).toBe('wss://missionforge.example/ws');
    expect(serverOverride('?server=ws://laptop.local:8787', page)).toBe('ws://laptop.local:8787');
  });

  it('rejects other hosts, other schemes and junk', () => {
    expect(serverOverride('?server=wss://evil.example/ws', page)).toBeNull();
    expect(serverOverride('?server=ws://172.32.0.1', page)).toBeNull();
    expect(serverOverride('?server=http://192.168.1.20', page)).toBeNull();
    expect(serverOverride('?server=ws://', page)).toBeNull();
    expect(serverOverride('', page)).toBeNull();
  });
});
