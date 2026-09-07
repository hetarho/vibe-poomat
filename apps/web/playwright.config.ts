import { defineConfig, devices } from '@playwright/test'

const PORT = 3210
const BASE_URL = `http://127.0.0.1:${PORT}`
const isCi = process.env.CI !== undefined

/** The built server needs a valid web env; these are placeholders, nothing is called. */
const serverEnv = {
  NODE_ENV: 'production',
  PORT: String(PORT),
  API_URL: 'http://127.0.0.1:3001',
  WEB_URL: BASE_URL,
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  // chromium only: v1 ships no visual snapshots and no cross-browser promises
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI checks the artifact it would deploy; locally the dev server is faster
    command: isCi ? 'node .output/server/index.mjs' : `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCi,
    timeout: 180_000,
    env: serverEnv,
  },
})
