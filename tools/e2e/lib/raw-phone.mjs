import WebSocket from 'ws';

/** Protocol-only player used by T047 so one rendered page can be profiled in a 10-player room. */
export class RawPhone {
  constructor(url, { room, index }) {
    this.url = url;
    this.room = room;
    this.index = index;
    this.ws = null;
    this.seq = 0;
    this.waiters = [];
    this.queue = [];
    this.openVote = null;
    this.heartbeat = null;
    this.id = null;
  }

  send(t, d) {
    this.seq += 1;
    this.ws.send(JSON.stringify({ t, seq: this.seq, d }));
  }

  waitFor(type, timeoutMs = 10000) {
    const found = this.queue.findIndex((message) => message.t === type);
    if (found >= 0) return Promise.resolve(this.queue.splice(found, 1)[0].d);
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`raw phone ${this.index}: timeout waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  #receive(message) {
    if (message.t === 'vote.opened') this.openVote = message.d;
    if (message.t === 'vote.stage' && message.d.stage === 'VOTE' && this.openVote?.roundId === message.d.roundId) {
      const option = this.openVote.options.find((item) => item.afford !== 'NEVER' && !item.willNotFly) ?? this.openVote.options[0];
      if (option) this.send('vote.cast', { roundId: message.d.roundId, optionId: option.id });
    }
    const waiter = this.waiters.find((item) => item.type === message.t);
    if (waiter) {
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message.d);
    } else this.queue.push(message);
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.on('message', (raw) => this.#receive(JSON.parse(raw.toString())));
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.send('hello', { protocolVersion: 1, client: 'PHONE', appVersion: 't047-profile', lang: 'en' });
    await this.waitFor('hello.ok');
    this.send('room.join', { room: this.room, as: 'PLAYER', nickname: `Peer${String(this.index).padStart(2, '0')}`, avatar: { suitId: 'suit_default', patchId: 'patch_default' } });
    const joined = await this.waitFor('room.joined');
    this.id = joined.id;
    await this.waitFor('snapshot.end');
    this.heartbeat = setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.send('clock.ping', { clientTimeMs: Date.now() }), 4000);
    return joined;
  }

  close() {
    clearInterval(this.heartbeat);
    this.ws?.close();
  }
}
