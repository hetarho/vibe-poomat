import type { Env } from '../shared/config/env.token'

/** A complete, harmless env for tests that need one without touching the process env. */
export function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_PORT: 3001,
    API_URL: 'http://localhost:3001',
    WEB_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vibe_poomat_test',
    DATABASE_POOL_MAX: 10,
    ...overrides,
  }
}
