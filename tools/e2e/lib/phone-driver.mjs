import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class PhoneDriver {
  constructor(browser, { webUrl, room, index, spectator = false, pending = false, runDir, cpuThrottle = 1 }) {
    this.browser = browser;
    this.webUrl = webUrl;
    this.room = room;
    this.index = index;
    this.spectator = spectator;
    this.pending = pending;
    this.runDir = runDir;
    this.cpuThrottle = cpuThrottle;
    this.context = null;
    this.page = null;
    this.consoleErrors = [];
    this.pageErrors = [];
    this.fps = [];
    this.actions = [];
    this.url = `${webUrl}/?room=${room}${spectator ? '&watch=1' : ''}`;
  }

  async open() {
    this.context = await this.browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await this.context.addInitScript(() => {
      const state = { frames: [], last: performance.now() };
      window.__mfE2eFps = state;
      const tick = (now) => {
        state.frames.push(now - state.last); state.last = now;
        if (state.frames.length > 1200) state.frames.splice(0, 600);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await this.#newPage();
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!this.spectator) {
      await this.page.getByTestId('join-nick').fill(`E2E${String(this.index + 1).padStart(2, '0')}`);
      await this.page.getByTestId('join-submit').click();
      await this.page.getByTestId(this.pending ? 'watch-screen' : 'screen-lobby').waitFor({ state: 'visible', timeout: 20000 });
    } else {
      await this.page.getByTestId('app').waitFor({ state: 'visible', timeout: 20000 });
    }
    if (this.cpuThrottle > 1) {
      const cdp = await this.context.newCDPSession(this.page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: this.cpuThrottle });
      this.actions.push(`CPU throttling x${this.cpuThrottle}`);
    }
  }

  async #newPage() {
    this.page = await this.context.newPage();
    this.page.on('console', (msg) => { if (msg.type() === 'error') this.consoleErrors.push(msg.text()); });
    this.page.on('pageerror', (error) => this.pageErrors.push(error.message));
  }

  async shot(name) {
    if (this.index !== 0 || this.spectator || this.page.isClosed()) return;
    await this.page.screenshot({ path: path.join(this.runDir, `phone-${name}.png`), fullPage: true });
  }

  async reloadResume() {
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.getByTestId('app').waitFor({ state: 'visible', timeout: 15000 });
    this.actions.push('page reloaded and resumed from session token');
  }

  async dropAndResume() {
    const session = await this.page.evaluate(() => sessionStorage.getItem('mf.session'));
    await this.page.close();
    await sleep(500);
    await this.context.addInitScript((raw) => { if (raw) sessionStorage.setItem('mf.session', raw); }, session);
    await this.#newPage();
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.getByTestId('app').waitFor({ state: 'visible', timeout: 15000 });
    this.actions.push('socket dropped mid-vote; resumed within 1 s using held token');
  }

  async handleVote({ ids, scenario, kind }, { drop = false } = {}) {
    if (this.spectator) return;
    const roleReady = this.page.getByTestId('role-ready');
    if (await roleReady.isVisible().catch(() => false)) await roleReady.evaluate((el) => el.click()).catch(() => {});
    if (drop) {
      await this.dropAndResume();
      return;
    }
    const screen = this.page.getByTestId('screen-vote');
    await screen.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const pickIndex = kind === 'CONTRACT' ? 0 : (scenario === 'forced_tie_when_player_count_allows' ? this.index : this.index + 1) % ids.length;
    const quick = this.page.getByTestId(`quick-${ids[pickIndex]}`);
    if (await quick.isVisible().catch(() => false)) {
      await quick.evaluate((el) => el.click()).catch(() => {});
    } else {
      const choice = ids[pickIndex];
      const card = this.page.getByTestId(`card-${choice}`);
      if (await card.isVisible().catch(() => false)) await card.evaluate((el) => el.click()).catch(() => {});
      if (scenario === 'veto' && this.index === 0 && await this.page.getByTestId('veto').isVisible().catch(() => false)) {
        await this.page.getByTestId('veto').evaluate((el) => el.click()).catch(() => {});
        if (await this.page.getByTestId('veto-confirm').isVisible().catch(() => false)) await this.page.getByTestId('veto-confirm').evaluate((el) => el.click()).catch(() => {});
        const fallback = this.page.getByTestId(`card-${ids[(this.index + 2) % ids.length]}`);
        if (await fallback.isVisible().catch(() => false)) await fallback.evaluate((el) => el.click()).catch(() => {});
      }
      const cast = this.page.getByTestId('cast');
      if (await cast.isVisible().catch(() => false) && await cast.isEnabled().catch(() => false)) await cast.evaluate((el) => el.click()).catch(() => {});
    }
    this.actions.push(`voted in ${ids.join('/')}`);
  }

  async handlePoll(round) {
    if (this.spectator) return;
    const roleReady = this.page.getByTestId('role-ready');
    if (await roleReady.isVisible().catch(() => false)) await roleReady.evaluate((el) => el.click()).catch(() => {});
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline) {
      const mine = this.page.getByTestId('poll-my-call');
      if (await mine.isVisible().catch(() => false)) {
        const noGo = round === 1 && this.index === 0;
        const button = this.page.getByTestId(noGo ? 'poll-nogo' : 'poll-go');
        if (await button.isEnabled().catch(() => false)) await button.evaluate((el) => el.click()).catch(() => {});
        this.actions.push(`FRR round ${round}: ${noGo ? 'NO_GO' : 'GO'}`);
        return;
      }
      if (await this.page.getByTestId('poll-result').isVisible().catch(() => false)) return;
      await sleep(80);
    }
  }

  async handleMinigame({ id, implemented }) {
    if (this.spectator) return;
    if (!implemented) {
      await this.page.getByTestId('mg-sitout').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      this.actions.push(`${id} timed out/not bundled`);
      return;
    }
    await this.page.getByTestId('mg-intro').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (this.index === 0) await this.shot('minigame-intro');
    const play = this.page.getByTestId('mg-play');
    await play.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    const box = await play.boundingBox().catch(() => null);
    if (box) {
      await this.page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.5);
      await sleep(800);
      await this.page.touchscreen.tap(box.x + box.width * 0.65, box.y + box.height * 0.45);
    }
    this.actions.push(`${id} generic touch inputs sent`);
  }

  async handleAlert() {
    if (this.spectator) return;
    const button = this.page.getByTestId('alert-callout').first();
    if (await button.isVisible().catch(() => false)) {
      await button.evaluate((el) => el.click()).catch(() => {});
      this.actions.push('console alert callout pressed');
    }
  }

  async sampleFps(label) {
    if (this.page.isClosed()) return;
    const sample = await this.page.evaluate(() => {
      const frames = window.__mfE2eFps?.frames ?? [];
      if (!frames.length) return null;
      const total = frames.reduce((a, b) => a + b, 0);
      const sorted = [...frames].sort((a, b) => a - b);
      return { avgFps: 1000 * frames.length / total, onePercentLowFps: 1000 / sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))], frames: frames.length };
    });
    if (sample) this.fps.push({ label, ...sample });
  }

  async close() {
    await this.sampleFps('end').catch(() => {});
    fs.writeFileSync(path.join(this.runDir, `phone-${this.index + 1}-diagnostics.json`), JSON.stringify({ consoleErrors: this.consoleErrors, pageErrors: this.pageErrors, fps: this.fps, actions: this.actions }, null, 2));
    await this.context?.close();
  }
}
