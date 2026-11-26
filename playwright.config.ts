import { defineConfig, devices } from '@playwright/test';

// End-to-end tests start their own API and web dev servers on separate ports and a separate
// database file, so they never touch the development data (docs/architecture/testing.md §6).
const apiPort = Number(process.env.E2E_API_PORT ?? 3101);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);
// Optional: run in an installed browser instead of the Playwright Chromium, for example E2E_BROWSER_CHANNEL=chrome or msedge
// (useful when `playwright install chromium` cannot download). Unset, the Playwright Chromium is used.
const channel = process.env.E2E_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: [
    {
      command: 'pnpm --filter @ctoc/api dev',
      url: `http://localhost:${apiPort}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      // APP_URL is the e2e web app, so a state-changing request from the browser passes the Origin check (ADR-0006).
      env: { PORT: String(apiPort), DATABASE_URL: 'file:../data/e2e.db?connection_limit=1', APP_URL: `http://localhost:${webPort}` },
    },
    {
      command: 'pnpm --filter @ctoc/web dev',
      url: `http://localhost:${webPort}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { WEB_PORT: String(webPort), API_URL: `http://localhost:${apiPort}` },
    },
  ],
});
