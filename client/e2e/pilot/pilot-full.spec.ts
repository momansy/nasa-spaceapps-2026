// Every row of the 9.2 touch column on the pilot seat, the assist layouts, the booster seat,
// seat handover, pause and hidden-page behaviour, and the input rate.
import { expect, test } from '@playwright/test';
import { collectErrors, force, hold, joinMock, noErrors, received, room, seatState, shotBoth, twoFingers } from './helpers';

const actions = async (page: import('@playwright/test').Page) => (await received(page, 'pilot.action')).map((r) => r.d);

test.describe('pilot seat: full touch column', () => {
  test('pitch, RCS, rotate, attitude, deploy, warp, map and camera send the right frames', async ({ page }) => {
    const errors = collectErrors(page);
    await joinMock(page, { seat: 'pilot' });

    // Pitch: drag the stick up, then let go: pitch returns to 0.
    const stick = (await page.getByTestId('pilot-stick').boundingBox())!;
    await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
    await page.mouse.down();
    await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height * 0.1, { steps: 6 });
    await expect.poll(async () => ((await seatState(page)).pitch as number)).toBeGreaterThan(0.6);
    await page.mouse.up();
    await expect.poll(async () => ((await seatState(page)).pitch as number)).toBe(0);

    // The rotate pad is off until RCS is on.
    await expect(page.getByTestId('pilot-rotate')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('pilot-rcs').scrollIntoViewIfNeeded();
    await page.getByTestId('pilot-rcs').click();
    await expect(page.getByTestId('pilot-rcs')).toHaveAttribute('aria-checked', 'true'); // from pilot.hud
    await expect.poll(async () => (await actions(page)).at(-1)).toMatchObject({ craft: 'VEHICLE', action: 'RCS_TOGGLE' });
    await expect(page.getByTestId('pilot-rotate')).toHaveAttribute('aria-disabled', 'false');

    // Two-finger twist (roll) and slide (yaw); lifting the fingers centres both.
    await twoFingers(page, 'pilot-rotate', { twistDeg: 30, slidePx: 35, release: false });
    await expect.poll(async () => ({ yaw: (await seatState(page)).yaw as number, roll: (await seatState(page)).roll as number })).toMatchObject({ yaw: expect.any(Number) });
    const live = await seatState(page);
    expect(live.roll as number).toBeGreaterThan(0.4);
    expect(live.yaw as number).toBeGreaterThan(0.3);
    await twoFingers(page, 'pilot-rotate', {}).catch(() => undefined);
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pilot-rotate"]') as HTMLElement;
      for (const id of [11, 12]) el.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', bubbles: true }));
    });
    await expect.poll(async () => ({ yaw: (await seatState(page)).yaw, roll: (await seatState(page)).roll })).toEqual({ yaw: 0, roll: 0 });

    // Attitude hold chips.
    for (const mode of ['PROGRADE', 'RETROGRADE', 'HEAT_SHIELD_FWD', 'OFF'] as const) {
      await page.getByTestId(`pilot-att-${mode}`).scrollIntoViewIfNeeded();
      await page.getByTestId(`pilot-att-${mode}`).click();
      await expect(page.getByTestId(`pilot-att-${mode}`)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await actions(page)).at(-1)).toMatchObject({ action: 'ATT_HOLD', attMode: mode });
    }

    // Context DEPLOY: labelled from deployTarget, disabled when the host offers nothing.
    await force(page, { deployTarget: null });
    await expect(page.getByTestId('pilot-deploy')).toBeDisabled();
    await expect(page.getByTestId('pilot-deploy')).toContainText('Nothing to deploy now');
    await force(page, { deployTarget: 'ARRAYS' });
    await expect(page.getByTestId('pilot-deploy')).toContainText('DEPLOY solar arrays');
    await force(page, { deployTarget: 'FAIRING' });
    await expect(page.getByTestId('pilot-deploy')).toContainText('DEPLOY fairing');
    await page.getByTestId('pilot-deploy').click();
    await expect.poll(async () => (await actions(page)).at(-1)).toMatchObject({ action: 'DEPLOY', deploy: 'CONTEXT' });

    // Time warp: the host decides. Up to ×10, then "not now" because nothing changed.
    await expect(page.getByTestId('pilot-warp-now')).toContainText('×1');
    await page.getByTestId('pilot-warp-up').scrollIntoViewIfNeeded();
    for (const f of ['×2', '×5', '×10']) {
      await page.getByTestId('pilot-warp-up').click();
      await expect(page.getByTestId('pilot-warp-now')).toContainText(f);
    }
    await page.getByTestId('pilot-warp-up').click();
    await expect(page.getByTestId('pilot-warp-note')).toBeVisible({ timeout: 4000 });
    await expect(page.getByTestId('pilot-warp-note')).toContainText('Not now');
    await page.getByTestId('pilot-warp-down').click();
    await expect(page.getByTestId('pilot-warp-now')).toContainText('×5');
    await expect.poll(async () => (await actions(page)).map((a) => a.action).filter((a) => String(a).startsWith('WARP'))).toEqual(['WARP_UP', 'WARP_UP', 'WARP_UP', 'WARP_UP', 'WARP_DOWN']);

    // Map tab.
    await page.getByTestId('pilot-map').scrollIntoViewIfNeeded();
    await page.getByTestId('pilot-map').click();
    await expect(page.getByTestId('pilot-map')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await actions(page)).at(-1)).toMatchObject({ action: 'MAP_TOGGLE' });

    // Camera: a sideways swipe cycles, a short drag or a tap does not.
    await page.getByTestId('pilot-camera').scrollIntoViewIfNeeded();
    const cam = (await page.getByTestId('pilot-camera').boundingBox())!;
    const swipe = async (dx: number) => {
      await page.mouse.move(cam.x + cam.width / 2 - dx / 2, cam.y + cam.height / 2);
      await page.mouse.down();
      await page.mouse.move(cam.x + cam.width / 2 + dx / 2, cam.y + cam.height / 2, { steps: 5 });
      await page.mouse.up();
    };
    const before = (await actions(page)).length;
    await swipe(20);
    await page.getByTestId('pilot-camera').click();
    expect((await actions(page)).length).toBe(before);
    await swipe(110);
    await expect.poll(async () => (await actions(page)).at(-1)).toMatchObject({ action: 'CAMERA_CYCLE' });

    // Console request prompt and guidance cue come from pilot.hud (the demo host closes its own prompt
    // once the pilot sets an attitude, so ask for it again).
    await force(page, { prompt: true });
    await expect(page.getByTestId('pilot-prompt-point_antenna')).toContainText('INCO');
    await expect(page.getByTestId('pilot-prompt-point_antenna')).toContainText('Point antenna');
    await force(page, { cue: 'ui.pilot.cue.throttle_down_max_q' });
    await expect(page.getByTestId('pilot-cue')).toContainText('Throttle down through Max Q.');
    await force(page, { cue: undefined });

    // n is increasing over every action, and each action was sent once.
    const ns = (await actions(page)).map((a) => a.n as number);
    for (let i = 1; i < ns.length; i++) expect(ns[i]!).toBe(ns[i - 1]! + 1);
    await noErrors(page, errors);
  });

  test('countdown HOLD and RESUME exist only during the countdown', async ({ page }) => {
    await joinMock(page, { seat: 'pilot', speed: 1 });
    await expect(page.getByTestId('pilot-hold')).toBeVisible();
    await page.getByTestId('pilot-hold').click();
    await expect.poll(async () => (await seatState(page)).held).toBe(true);
    await page.getByTestId('pilot-resume').click();
    await expect.poll(async () => (await seatState(page)).held).toBe(false);
    const a = await actions(page);
    expect(a.map((x) => x.action)).toEqual(['COUNTDOWN_HOLD', 'COUNTDOWN_RESUME']);
    await expect(page.getByTestId('pilot-hold')).toHaveCount(0, { timeout: 15_000 }); // flight began
  });

  test('assist layouts: Cadet shows throttle, STAGE, DEPLOY and ABORT only', async ({ page }) => {
    await joinMock(page, { seat: 'pilot' });
    for (const id of ['pilot-stick', 'pilot-cutoff']) await expect(page.getByTestId(id)).toHaveCount(1);
    await shotBoth(page, '04-pilot-engineer');
    await expect(page.getByTestId('pilot-assist')).toContainText('Engineer');
    await room(page, 'setAssist', 'CADET');
    await expect(page.getByTestId('pilot-assist')).toContainText('Cadet');
    await expect(page.getByTestId('pilot-screen')).toHaveAttribute('data-assist', 'CADET');
    for (const id of ['pilot-throttle', 'pilot-stage', 'pilot-deploy', 'pilot-abort-cover']) await expect(page.getByTestId(id)).toBeVisible();
    for (const id of ['pilot-att', 'pilot-rcs', 'pilot-warp-up', 'pilot-warp-down', 'pilot-map', 'pilot-camera', 'pilot-rotate', 'pilot-stick', 'pilot-cutoff', 'pilot-hold']) await expect(page.getByTestId(id)).toHaveCount(0);
    await shotBoth(page, '04-pilot-cadet');
    await room(page, 'setAssist', 'FLIGHT_DIRECTOR');
    await expect(page.getByTestId('pilot-assist')).toContainText('Flight Director');
    for (const id of ['pilot-att', 'pilot-rcs', 'pilot-warp-up', 'pilot-map', 'pilot-camera', 'pilot-rotate']) await expect(page.getByTestId(id)).toHaveCount(1);
  });

  test('booster seat: own title, craft BOOSTER on every frame', async ({ page }) => {
    await joinMock(page, { seat: 'booster' });
    await expect(page.getByTestId('pilot-title')).toHaveText('Booster pilot');
    await expect(page.getByTestId('pilot-screen')).toHaveAttribute('data-craft', 'BOOSTER');
    const track = (await page.getByTestId('pilot-throttle').boundingBox())!;
    await page.mouse.click(track.x + track.width / 2, track.y + track.height * 0.4);
    await page.getByTestId('pilot-cutoff').click();
    await expect.poll(async () => (await received(page, 'pilot.action')).length).toBe(1);
    const frames = [...(await received(page, 'pilot.input')), ...(await received(page, 'pilot.action'))];
    expect(frames.length).toBeGreaterThan(2);
    expect(frames.every((f) => f.d.craft === 'BOOSTER')).toBe(true);
    await shotBoth(page, '06-booster-seat');
  });

  test('seat handover mid-flight swaps the screen without a reload', async ({ page }) => {
    await joinMock(page, { seat: 'pilot' });
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
    // Pilot → co-pilot (a bot flies now).
    await room(page, 'reassign', { segment: 'ORBIT', pilotId: 'p2', pilotInput: 'PHONE', copilotId: 'p1' });
    await expect(page.getByTestId('copilot-screen')).toBeVisible();
    await expect(page.getByTestId('pilot-screen')).toHaveCount(0);
    // Co-pilot → booster pilot.
    await room(page, 'reassign', { segment: 'LANDING', copilotId: null, boosterPilotId: 'p1', boosterInput: 'PHONE' });
    await expect(page.getByTestId('pilot-title')).toHaveText('Booster pilot');
    // Booster seat on the host device: back to the console.
    await room(page, 'reassign', { boosterInput: 'HOST_DEVICE' });
    await expect(page.getByTestId('console-screen')).toBeVisible();
    // Pilot again.
    await room(page, 'reassign', { segment: 'ASCENT', pilotId: 'p1', pilotInput: 'PHONE', boosterPilotId: null, boosterInput: null });
    await expect(page.getByTestId('pilot-title')).toHaveText('Pilot');
    expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(42);
  });

  test('nothing is sent while paused, while the page is hidden, or after the seat moves away', async ({ page }) => {
    await joinMock(page, { seat: 'pilot' });
    const count = async () => (await received(page, 'pilot.input')).length;
    await page.waitForTimeout(600);
    expect(await count()).toBeGreaterThan(0);

    await room(page, 'setPaused', true);
    await page.waitForTimeout(300);
    const paused = await count();
    const track = (await page.getByTestId('pilot-throttle').boundingBox())!;
    await page.mouse.click(track.x + track.width / 2, track.y + track.height * 0.3);
    await page.getByTestId('pilot-cutoff').click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1500);
    expect(await count()).toBe(paused);
    expect(await actions(page)).toEqual([]);
    await room(page, 'setPaused', false);
    await expect.poll(count).toBeGreaterThan(paused);

    // Hidden page.
    const hide = async (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await hide(true);
    await page.waitForTimeout(300);
    const hiddenAt = await count();
    await page.waitForTimeout(1200);
    expect(await count()).toBe(hiddenAt);
    await hide(false);
    await expect.poll(count).toBeGreaterThan(hiddenAt);

    // The seat moves away: silence.
    await room(page, 'reassign', { pilotId: 'p3', pilotInput: 'PHONE', copilotId: null });
    await expect(page.getByTestId('console-screen')).toBeVisible();
    await page.waitForTimeout(300);
    const gone = await count();
    await page.waitForTimeout(1500);
    expect(await count()).toBe(gone);
  });

  test('input rate: at most 30 Hz while moving, 5 Hz keep-alive while still', async ({ page }) => {
    await joinMock(page, { seat: 'pilot' });
    const inputs = async () => (await received(page, 'pilot.input')).map((r) => r.atMs);
    // Still for two seconds: the keep-alive runs at 5 Hz.
    await page.waitForTimeout(2000);
    const all = await inputs();
    const last = Math.max(...all);
    const win = all.filter((t) => t > last - 1000);
    expect(win.length).toBeGreaterThanOrEqual(4);
    expect(win.length).toBeLessThanOrEqual(6);
    // Continuous drag on throttle and pitch for 2 s.
    const mark = (await inputs()).length;
    const thr = (await page.getByTestId('pilot-throttle').boundingBox())!;
    await page.mouse.move(thr.x + thr.width / 2, thr.y + thr.height / 2);
    await page.mouse.down();
    const start = Date.now();
    while (Date.now() - start < 2000) {
      const p = ((Date.now() - start) % 1000) / 1000;
      await page.mouse.move(thr.x + thr.width / 2, thr.y + thr.height * (0.2 + 0.6 * Math.abs(Math.sin(p * Math.PI))));
    }
    await page.mouse.up();
    const moving = (await inputs()).slice(mark);
    expect(moving.length).toBeGreaterThan(20);
    // At most 30 frames in any 1 s window.
    for (let i = 0; i < moving.length; i++) {
      const inWindow = moving.filter((t) => t >= moving[i]! && t < moving[i]! + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(30);
    }
    const ns = (await received(page, 'pilot.input')).map((r) => r.d.n as number);
    for (let i = 1; i < ns.length; i++) expect(ns[i]!).toBeGreaterThan(ns[i - 1]!);
    await hold(page, 'pilot-cutoff', 10);
  });
});
