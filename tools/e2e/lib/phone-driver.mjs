import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class PhoneDriver {
  constructor(browser, { webUrl, room, index, spectator = false, pending = false, runDir, cpuThrottle = 1, extraQuery = '', tag = null }) {
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
    this.tag = tag;
    this.url = `${webUrl}/?room=${room}${spectator ? '&watch=1' : ''}${extraQuery}`;
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
      // A spectator must press JOIN (the code comes from ?room=). T028 only waited for the app shell, so its
      // spectators never joined; T036 fixes that and waits for the watch screen.
      await this.page.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 20000 });
      await this.page.getByTestId('join-submit').click();
      await this.page.locator('[data-testid="watch-screen"],[data-testid="screen-lobby"]').first().waitFor({ state: 'visible', timeout: 20000 });
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
    if (!(this.index === 0 || this.tag) || (this.spectator && !this.tag) || this.page.isClosed()) return;
    const file = path.join(this.runDir, `phone-${name}.png`);
    try {
      await this.page.screenshot({ path: file, fullPage: true, timeout: 15000 });
    } catch (firstError) {
      // T036: at 10 phones the first screenshot of some vote screens never completes. Probe whether the
      // page main thread is alive, then retry once without full-page capture; record both outcomes.
      const probeStart = Date.now();
      const evalOk = await this.page.evaluate(() => performance.now()).then(() => true, () => false);
      const probe = { shot: name, firstError: String(firstError.message).split(/\r?\n/)[0], evalOk, evalMs: Date.now() - probeStart, visibility: await this.page.evaluate(() => document.visibilityState).catch(() => null) };
      try {
        await this.page.screenshot({ path: file, fullPage: false, timeout: 15000, animations: 'disabled' });
        probe.retry = 'ok (viewport only)';
      } catch (retryError) {
        probe.retry = `failed: ${String(retryError.message).split(/\r?\n/)[0]}`;
        this.actions.push(`screenshot diagnostic ${JSON.stringify(probe)}`);
        throw retryError;
      }
      this.actions.push(`screenshot diagnostic ${JSON.stringify(probe)}`);
    }
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

  /**
   * Play one real minigame through the phone client with generic touch, key and button input.
   * Returns what the phone showed so the run can say loaded / played / result shown (T036). Inputs are
   * seeded and not tuned to win: the aim is to prove load, run, report and result screen, not skill.
   */
  async handleMinigame({ id, durationMs = 5000, label = id }) {
    if (this.spectator) return null;
    const rec = { id, phone: this.index + 1, sitout: false, intro: false, played: false, ownResult: null, summaryShown: false, notes: [] };
    const errorsBefore = this.consoleErrors.length + this.pageErrors.length;
    const page = this.page;
    const either = page.locator('[data-testid="mg-intro"],[data-testid="mg-sitout"]').first();
    await either.waitFor({ state: 'visible', timeout: 8000 }).catch(() => { rec.notes.push('no intro/sitout within 8 s'); });
    if (await page.getByTestId('mg-sitout').isVisible().catch(() => false)) {
      rec.sitout = true;
      this.actions.push(`${id} sit-out screen (module not bundled)`);
      return rec;
    }
    rec.intro = await page.getByTestId('mg-intro').isVisible().catch(() => false);
    await this.shot(`mg-${label}-intro`);
    const play = page.getByTestId('mg-play');
    rec.played = await play.waitFor({ state: 'visible', timeout: 9000 }).then(() => true).catch(() => false);
    if (rec.played) {
      const cdp = await this.context.newCDPSession(page);
      let rng = (id.length * 7919 + this.index * 104729 + 12345) >>> 0;
      const rand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] }).catch(() => {});
      const deadline = Date.now() + durationMs + 6000;
      let n = 0;
      let shotTaken = false;
      while (Date.now() < deadline) {
        if (await page.getByTestId('mg-own-result').isVisible().catch(() => false)) break;
        if (await page.getByTestId('mg-result').isVisible().catch(() => false)) break;
        const stage = await page.locator('.mg-stage').boundingBox().catch(() => null);
        if (!stage) { await sleep(150); continue; }
        const x = stage.x + stage.width * (0.1 + 0.8 * rand());
        const y = stage.y + stage.height * (0.1 + 0.8 * rand());
        const kind = n % 7;
        if (kind === 0 || kind === 3 || kind === 5) {
          await touch('touchStart', x, y); await sleep(40); await touch('touchEnd', x, y);
        } else if (kind === 1 || kind === 4) {
          const x2 = stage.x + stage.width * (0.1 + 0.8 * rand());
          const y2 = stage.y + stage.height * (0.1 + 0.8 * rand());
          await touch('touchStart', x, y);
          for (let k = 1; k <= 6; k += 1) { await sleep(25); await touch('touchMove', x + (x2 - x) * k / 6, y + (y2 - y) * k / 6); }
          await touch('touchEnd', x2, y2);
        } else if (kind === 2) {
          await touch('touchStart', x, y); await sleep(450); await touch('touchEnd', x, y);
        } else {
          const buttons = page.locator('.mg-stage button:not([disabled])');
          const count = await buttons.count().catch(() => 0);
          if (count) await buttons.nth(Math.floor(rand() * count)).evaluate((el) => el.click()).catch(() => {});
          await page.keyboard.press(['Space', 'ArrowLeft', 'ArrowRight', 'KeyG', 'Enter'][Math.floor(rand() * 5)]).catch(() => {});
        }
        n += 1;
        if (!shotTaken && Date.now() > deadline - durationMs - 6000 + 2500) { shotTaken = true; await this.shot(`mg-${label}-play`); }
        await sleep(120);
      }
      await cdp.detach().catch(() => {});
      rec.inputs = n;
    }
    const own = page.getByTestId('mg-own-result');
    const final = page.getByTestId('mg-result');
    rec.ownResult = await own.isVisible().catch(() => false) || await final.isVisible().catch(() => false);
    if (rec.ownResult) await this.shot(`mg-${label}-own-result`);
    rec.consoleErrorsDuring = this.consoleErrors.length + this.pageErrors.length - errorsBefore;
    this.actions.push(`${id} played (${rec.inputs ?? 0} generic inputs), own result ${rec.ownResult ? 'shown' : 'NOT shown'}`);
    return rec;
  }

  /** After the host sends mg.summary: confirm the shared result screen, then continue. */
  async finishMinigame(rec, label) {
    if (this.spectator || !rec) return;
    const final = this.page.getByTestId('mg-result');
    rec.summaryShown = await final.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
    if (rec.summaryShown) {
      rec.tier = await final.getAttribute('data-tier').catch(() => null);
      await this.shot(`mg-${label}-result`);
      await this.page.getByTestId('mg-continue').evaluate((el) => el.click()).catch(() => {});
    }
  }

  /** Spectator: press one reaction button (the pad allows one per second). */
  async react(n = 1) {
    if (!this.spectator) return;
    const buttons = this.page.locator('[data-testid^="watch-react-"]');
    const count = await buttons.count().catch(() => 0);
    for (let i = 0; i < n && count; i += 1) {
      await buttons.nth((this.index + i) % count).evaluate((el) => el.click()).catch(() => {});
      await sleep(1100);
    }
    this.actions.push(`sent ${n} audience reaction(s)`);
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
