import { defineConfig, devices } from '@playwright/test';

/*
 * Browser tests (e2e/*.spec.ts): the main flows on a phone-sized screen against the
 * built app. Run with `npm run test:e2e` (builds first) – in CI after the build step.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'de-CH',
    // The service worker is not under test here and makes Playwright's network tracking unreliable.
    serviceWorkers: 'block',
    // Only when a test is repeated after a failure – recording every test costs a lot of CPU.
    trace: 'on-first-retry',
  },
  projects: [{ name: 'phone', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning e2e/server.ts',
    url: `http://127.0.0.1:${PORT}/api/auth/options`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
