// Runs only the orbit lab spec, without building and serving dist/ (the spec starts its own
// Vite dev server). Same phone viewport as the main config.
//   npx playwright test -c e2e/minigames/orbit/playwright.lab.config.ts
import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: 'orbit.spec.ts',
  timeout: 6 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // Outside client/test-results, which the main e2e run cleans (it may run at the same time).
  outputDir: join(tmpdir(), 'missionforge-orbit-lab-results'),
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    browserName: 'chromium',
    trace: 'off',
  },
});
