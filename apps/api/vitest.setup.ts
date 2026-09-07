import 'reflect-metadata'

/**
 * `@repo/config` validates the environment at import time (ARCH-31), so the suite
 * needs a complete one in place before any module that imports it is loaded.
 */
const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_PORT: '3001',
  API_URL: 'http://localhost:3001',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vibe_poomat_test',
  DATABASE_POOL_MAX: '10',
}

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] ??= value
}
