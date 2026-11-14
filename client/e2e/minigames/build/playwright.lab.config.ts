// Runs only the build-minigame lab spec, without building and serving dist/ (the spec starts its
// own Vite dev server on port 5181). Same phone viewport as the main config.
//   npx playwright test -c e2e/minigames/build/playwright.lab.config.ts [-g MG-02]
import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: 'build.spec.ts',
  timeout: 6 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // Outside client/test-results, which the main e2e run cleans (it may run at the same time).
  outputDir: join(tmpdir(), 'missionforge-build-lab-results'),
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
