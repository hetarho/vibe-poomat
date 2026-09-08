import { defineConfig, devices } from '@playwright/test'
import { DEFAULT_DATABASE_URL } from '../../scripts/e2e-db.mjs'

const WEB_PORT = 3210
const API_PORT = 3011
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`
const API_URL = `http://127.0.0.1:${API_PORT}`
const isCi = process.env.CI !== undefined

const databaseUrl = process.env.E2E_DATABASE_URL ?? DEFAULT_DATABASE_URL

/**
 * `NODE_ENV=test` is what enables the two fixtures the browser suite needs
 * (T040): the sign-in bypass, which is absent from the graph otherwise, and the
 * probe that answers for `.test` hosts so PROJ-2 does not depend on the public
 * internet. Jobs are off — FDBK-7's timers are proven by T027's integration
 * tests, and a worker polling underneath the browser only adds flakiness.
 */
const apiEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  API_PORT: String(API_PORT),
  API_URL,
  WEB_URL: BASE_URL,
  DATABASE_URL: databaseUrl,
  JOBS_ENABLED: 'false',
  MAIL_DRIVER: 'console',
}

/**
 * The built output, which is the artifact a deploy ships. It is built by
 * `global-setup` with `WEB_API_PROXY=1`, which bakes in the nitro rule that
 * forwards `/api/*` to the api — the job Caddy does in production (ARCH-30) and
 * what makes the browser's same-origin api calls real here.
 *
 * Not the dev server: it currently fails to hydrate, because its client graph
 * pulls in `react-dom/server` and the import throws. Nothing else in the repo
 * exercises hydration, which is why this suite is what found it.
 */
const webEnv = {
  NODE_ENV: 'production',
  PORT: String(WEB_PORT),
  API_URL,
  WEB_URL: BASE_URL,
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  // the whole suite has a budget (T040); one flow is a handful of round trips
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  // chromium only: v1 ships no visual snapshots and no cross-browser promises
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `${API_URL}/ready`,
      reuseExistingServer: !isCi,
      timeout: 120_000,
      env: apiEnv,
    },
    {
      command: 'node .output/server/index.mjs',
      url: BASE_URL,
      reuseExistingServer: !isCi,
      timeout: 180_000,
      env: webEnv,
    },
  ],
})
