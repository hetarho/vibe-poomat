import { defineConfig, devices } from '@playwright/test'

const PORT = 3210
const BASE_URL = `http://127.0.0.1:${PORT}`
const isCi = process.env.CI !== undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: 'list',
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  // chromium only: v1 ships no visual snapshots and no cross-browser promises
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCi,
    timeout: 180_000,
  },
})
